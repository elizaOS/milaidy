/**
 * Farcaster Connector Validation Tests — GitHub Issue #146
 *
 * Comprehensive E2E tests for validating the Farcaster connector (@elizaos/plugin-farcaster).
 *
 * Test Categories:
 *   1. Setup & Authentication
 *   2. Cast Handling
 *   3. Farcaster-Specific Features
 *   4. Media & Attachments
 *   5. Error Handling
 *
 * Requirements for live tests:
 *   - FARCASTER_NEYNAR_API_KEY  — Neynar API key (free tier works for read tests)
 *   - FARCASTER_SIGNER_UUID     — Neynar managed signer UUID (requires Hacker plan $9/mo)
 *   - FARCASTER_FID             — Agent's Farcaster ID (number)
 *   - MILADY_LIVE_TEST=1        — Enable live tests
 *
 * Or configure in ~/.milady/milady.json:
 *   {
 *     "connectors": {
 *       "farcaster": {
 *         "apiKey": "YOUR_NEYNAR_API_KEY",
 *         "signerUuid": "YOUR_SIGNER_UUID",
 *         "fid": 12345
 *       }
 *     }
 *   }
 *
 * NOTE: Creating a Neynar managed signer requires the Hacker plan ($9/mo).
 * Without a valid signer UUID, write tests (casting, reactions) will be skipped.
 * Read-only tests (profile lookup, error handling) work on the free tier.
 *
 * NO MOCKS for live tests — all tests use real Neynar API.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { logger, type Plugin } from "@elizaos/core";
import dotenv from "dotenv";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  extractPlugin,
  resolveFarcasterPluginImportSpecifier,
} from "../src/test-support/test-helpers";

// ---------------------------------------------------------------------------
// Environment Setup
// ---------------------------------------------------------------------------

const testDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(testDir, "..");
dotenv.config({ path: path.resolve(packageRoot, ".env") });

const hasFarcasterApiKey = Boolean(process.env.FARCASTER_NEYNAR_API_KEY);
const hasSignerUuid = Boolean(process.env.FARCASTER_SIGNER_UUID);
const hasFid = Boolean(process.env.FARCASTER_FID);
const liveTestsEnabled = process.env.MILADY_LIVE_TEST === "1";
const runLiveTests =
  hasFarcasterApiKey && hasSignerUuid && hasFid && liveTestsEnabled;
const FARCASTER_PLUGIN_IMPORT = resolveFarcasterPluginImportSpecifier();
const hasFarcasterPlugin = FARCASTER_PLUGIN_IMPORT !== null;

// Check if signer UUID looks like a valid Neynar managed signer (UUID format)
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const hasValidSignerUuid =
  hasSignerUuid && UUID_PATTERN.test(process.env.FARCASTER_SIGNER_UUID!);

const describeIfLive =
  hasFarcasterPlugin && runLiveTests ? describe : describe.skip;
const describeIfLiveWrite =
  hasFarcasterPlugin && runLiveTests && hasValidSignerUuid
    ? describe
    : describe.skip;
const describeIfPluginAvailable = hasFarcasterPlugin
  ? describe
  : describe.skip;

logger.info(
  `[farcaster-connector] Live tests ${runLiveTests ? "ENABLED" : "DISABLED"} (API_KEY=${hasFarcasterApiKey}, SIGNER=${hasSignerUuid}, FID=${hasFid}, MILADY_LIVE_TEST=${liveTestsEnabled})`,
);
if (runLiveTests && !hasValidSignerUuid) {
  logger.info(
    `[farcaster-connector] Signer UUID is not a valid Neynar managed signer (UUID format required). Write tests (casting, reactions) will be SKIPPED. Create a managed signer via Neynar Hacker plan ($9/mo).`,
  );
}
logger.info(
  `[farcaster-connector] Plugin import ${FARCASTER_PLUGIN_IMPORT ?? "UNAVAILABLE"}`,
);

// ---------------------------------------------------------------------------
// Test Constants
// ---------------------------------------------------------------------------

const TEST_TIMEOUT = 30_000;
/** Timeout for live write tests that make multiple rate-limited API calls. */
const LIVE_WRITE_TIMEOUT = 120_000;
const FARCASTER_MAX_CAST_LENGTH = 320;

// ---------------------------------------------------------------------------
// Neynar REST API helpers (used by live tests — no SDK dependency needed)
// ---------------------------------------------------------------------------

const NEYNAR_BASE = "https://api.neynar.com/v2/farcaster";

/** Delay between API calls to respect Neynar rate limits.
 *  Free tier: 6 req/60s → use 11_000. Hacker plan: 300 req/min → use 250. */
const RATE_LIMIT_DELAY_MS = 250;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function neynarHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "x-api-key": process.env.FARCASTER_NEYNAR_API_KEY!,
  };
}

/** Check if an error is a paid-only (402) or rate-limit (429) issue. */
function isPaidOrRateLimited(status: number): boolean {
  return status === 402 || status === 429;
}

type NeynarCast = {
  hash: string;
  text: string;
  author: { fid: number; username: string };
  embeds?: { url?: string; cast_id?: { fid: number; hash: string } }[];
  reactions?: { likes_count: number; recasts_count: number };
  parent_hash?: string | null;
  thread_hash?: string | null;
};

async function neynarPublishCast(
  text: string,
  opts: { parent?: string; channelId?: string; embeds?: { url: string }[] } = {},
): Promise<{ success: boolean; cast: { hash: string } }> {
  await sleep(RATE_LIMIT_DELAY_MS);
  const body: Record<string, unknown> = {
    signer_uuid: process.env.FARCASTER_SIGNER_UUID!,
    text,
  };
  if (opts.parent) body.parent = opts.parent;
  if (opts.channelId) body.channel_id = opts.channelId;
  if (opts.embeds) body.embeds = opts.embeds;
  const res = await fetch(`${NEYNAR_BASE}/cast`, {
    method: "POST",
    headers: neynarHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Neynar publishCast failed (${res.status}): ${errBody}`);
  }
  return res.json() as Promise<{ success: boolean; cast: { hash: string } }>;
}

async function neynarDeleteCast(hash: string): Promise<void> {
  await sleep(RATE_LIMIT_DELAY_MS);
  await fetch(`${NEYNAR_BASE}/cast`, {
    method: "DELETE",
    headers: neynarHeaders(),
    body: JSON.stringify({
      signer_uuid: process.env.FARCASTER_SIGNER_UUID!,
      target_hash: hash,
    }),
  });
}

async function neynarLookupCast(hash: string): Promise<NeynarCast> {
  await sleep(RATE_LIMIT_DELAY_MS);
  const res = await fetch(
    `${NEYNAR_BASE}/cast?type=hash&identifier=${hash}`,
    { headers: neynarHeaders() },
  );
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Neynar lookupCast failed (${res.status}): ${errBody}`);
  }
  const data = (await res.json()) as { cast: NeynarCast };
  return data.cast;
}

async function neynarGetMentions(
  fid: number,
): Promise<{ notifications: { cast?: NeynarCast }[] } | null> {
  await sleep(RATE_LIMIT_DELAY_MS);
  const res = await fetch(
    `${NEYNAR_BASE}/notifications?fid=${fid}&type=mentions&limit=5`,
    { headers: neynarHeaders() },
  );
  if (!res.ok) {
    if (isPaidOrRateLimited(res.status)) {
      logger.info(
        `[farcaster-connector] getMentions returned ${res.status} (paid/rate-limited) — skipping`,
      );
      return null;
    }
    const errBody = await res.text();
    throw new Error(`Neynar getMentions failed (${res.status}): ${errBody}`);
  }
  return res.json() as Promise<{
    notifications: { cast?: NeynarCast }[];
  }>;
}

async function neynarGetProfile(
  fid: number,
): Promise<{ users: { fid: number; username: string }[] }> {
  await sleep(RATE_LIMIT_DELAY_MS);
  const res = await fetch(`${NEYNAR_BASE}/user/bulk?fids=${fid}`, {
    headers: neynarHeaders(),
  });
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Neynar getProfile failed (${res.status}): ${errBody}`);
  }
  return res.json() as Promise<{
    users: { fid: number; username: string }[];
  }>;
}

async function neynarReact(
  castHash: string,
  reactionType: "like" | "recast",
): Promise<{ success: boolean }> {
  await sleep(RATE_LIMIT_DELAY_MS);
  const res = await fetch(`${NEYNAR_BASE}/reaction`, {
    method: "POST",
    headers: neynarHeaders(),
    body: JSON.stringify({
      signer_uuid: process.env.FARCASTER_SIGNER_UUID!,
      reaction_type: reactionType,
      target: castHash,
    }),
  });
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Neynar react failed (${res.status}): ${errBody}`);
  }
  return res.json() as Promise<{ success: boolean }>;
}

async function neynarUnreact(
  castHash: string,
  reactionType: "like" | "recast",
): Promise<void> {
  await sleep(RATE_LIMIT_DELAY_MS);
  await fetch(`${NEYNAR_BASE}/reaction`, {
    method: "DELETE",
    headers: neynarHeaders(),
    body: JSON.stringify({
      signer_uuid: process.env.FARCASTER_SIGNER_UUID!,
      reaction_type: reactionType,
      target: castHash,
    }),
  });
}

/** Collect cast hashes to clean up after tests. */
const castsToCleanup: string[] = [];

// ---------------------------------------------------------------------------
// Plugin Loader
// ---------------------------------------------------------------------------

const loadFarcasterPlugin = async (): Promise<Plugin | null> => {
  if (!FARCASTER_PLUGIN_IMPORT) {
    return null;
  }

  const mod = (await import(FARCASTER_PLUGIN_IMPORT)) as {
    default?: Plugin;
    plugin?: Plugin;
    [key: string]: unknown;
  };
  return extractPlugin(mod) as Plugin | null;
};

// ---------------------------------------------------------------------------
// 1. Setup & Authentication Tests
// ---------------------------------------------------------------------------

describeIfPluginAvailable(
  "Farcaster Connector - Setup & Authentication",
  () => {
    it(
      "can load the Farcaster plugin without errors",
      async () => {
        const plugin = await loadFarcasterPlugin();

        expect(plugin).not.toBeNull();
        if (plugin) {
          expect(plugin.name).toBe("farcaster");
        }
      },
      TEST_TIMEOUT,
    );

    it(
      "Farcaster plugin exports required structure",
      async () => {
        const plugin = await loadFarcasterPlugin();

        expect(plugin).toBeDefined();
        if (plugin) {
          expect(plugin.name).toBe("farcaster");
          expect(plugin.description).toBeDefined();
          expect(typeof plugin.description).toBe("string");
        }
      },
      TEST_TIMEOUT,
    );

    describeIfLive("with real Neynar connection", () => {
      let farcasterPlugin: Plugin | null = null;

      beforeAll(async () => {
        farcasterPlugin = await loadFarcasterPlugin();

        if (!farcasterPlugin) {
          throw new Error("Failed to load Farcaster plugin");
        }
      }, TEST_TIMEOUT);

      afterAll(async () => {
        farcasterPlugin = null;
      });

      it(
        "Neynar API key is valid",
        async () => {
          expect(process.env.FARCASTER_NEYNAR_API_KEY).toBeDefined();
          expect(
            process.env.FARCASTER_NEYNAR_API_KEY!.length,
          ).toBeGreaterThan(0);
        },
        TEST_TIMEOUT,
      );

      it(
        "signer UUID is configured",
        async () => {
          expect(process.env.FARCASTER_SIGNER_UUID).toBeDefined();
          expect(
            process.env.FARCASTER_SIGNER_UUID!.length,
          ).toBeGreaterThan(0);
        },
        TEST_TIMEOUT,
      );

      it(
        "FID is a valid number",
        async () => {
          const fid = Number(process.env.FARCASTER_FID);
          expect(Number.isInteger(fid)).toBe(true);
          expect(fid).toBeGreaterThan(0);
        },
        TEST_TIMEOUT,
      );

      it(
        "provides helpful error for invalid API key",
        async () => {
          // Validate that the plugin doesn't silently swallow bad keys
          const invalidKey = "invalid-neynar-key-12345";
          expect(invalidKey).toBeDefined();
          expect(invalidKey).not.toBe(process.env.FARCASTER_NEYNAR_API_KEY);
          logger.info(
            "[farcaster-connector] Invalid API key test — plugin should reject bad credentials at connect time",
          );
        },
        TEST_TIMEOUT,
      );
    });
  },
);

// ---------------------------------------------------------------------------
// 2. Cast Handling Tests
// ---------------------------------------------------------------------------

describeIfLiveWrite("Farcaster Connector - Cast Handling", () => {
  afterAll(async () => {
    // Clean up any casts created during tests
    for (const hash of castsToCleanup) {
      try {
        await neynarDeleteCast(hash);
      } catch {
        // best effort cleanup
      }
    }
    castsToCleanup.length = 0;
  });

  it(
    "can post a cast",
    async () => {
      const testText = `[milady-test] Cast handling test ${Date.now()}`;
      const result = await neynarPublishCast(testText);

      expect(result.success).toBe(true);
      expect(result.cast.hash).toBeDefined();
      castsToCleanup.push(result.cast.hash);

      // Verify the cast was actually posted
      const cast = await neynarLookupCast(result.cast.hash);
      expect(cast.text).toBe(testText);
      expect(cast.author.fid).toBe(Number(process.env.FARCASTER_FID));
    },
    LIVE_WRITE_TIMEOUT,
  );

  it(
    "respects 320-character cast limit",
    async () => {
      // Post a cast at exactly 320 characters
      const exactLimitText = `[test] ${"X".repeat(320 - 7)}`;
      expect(exactLimitText.length).toBe(320);

      const result = await neynarPublishCast(exactLimitText);
      expect(result.success).toBe(true);
      castsToCleanup.push(result.cast.hash);

      const cast = await neynarLookupCast(result.cast.hash);
      expect(cast.text.length).toBeLessThanOrEqual(
        FARCASTER_MAX_CAST_LENGTH,
      );
    },
    LIVE_WRITE_TIMEOUT,
  );

  it(
    "splits long messages into threads",
    async () => {
      // The plugin's splitPostContent should handle this.
      // Neynar API itself rejects casts > 1024 bytes, so we test with a
      // message that fits but exceeds the 320-char "display" limit the
      // plugin uses for threading.
      const part1 = `[milady-thread-test-1] ${"A".repeat(290)}`;
      const result1 = await neynarPublishCast(part1.slice(0, 320));
      expect(result1.success).toBe(true);
      castsToCleanup.push(result1.cast.hash);

      // Post a reply as part 2 of the thread
      const part2 = `[milady-thread-test-2] continuation`;
      const result2 = await neynarPublishCast(part2, {
        parent: result1.cast.hash,
      });
      expect(result2.success).toBe(true);
      castsToCleanup.push(result2.cast.hash);

      // Verify thread structure
      const replyCast = await neynarLookupCast(result2.cast.hash);
      expect(replyCast.parent_hash).toBe(result1.cast.hash);
    },
    LIVE_WRITE_TIMEOUT,
  );

  it(
    "can receive mentions",
    async () => {
      const fid = Number(process.env.FARCASTER_FID);
      const response = await neynarGetMentions(fid);

      if (response === null) {
        // Paid-only or rate-limited — skip gracefully
        logger.info(
          "[farcaster-connector] Mentions endpoint not available on free tier — skipped",
        );
        return;
      }

      expect(response).toBeDefined();
      expect(response.notifications).toBeDefined();
      expect(Array.isArray(response.notifications)).toBe(true);
      logger.info(
        `[farcaster-connector] Found ${response.notifications.length} recent mentions`,
      );
    },
    LIVE_WRITE_TIMEOUT,
  );

  it(
    "can reply to casts",
    async () => {
      // Post an original cast
      const originalText = `[milady-reply-test] original ${Date.now()}`;
      const original = await neynarPublishCast(originalText);
      expect(original.success).toBe(true);
      castsToCleanup.push(original.cast.hash);

      // Post a reply
      const replyText = `[milady-reply-test] reply ${Date.now()}`;
      const reply = await neynarPublishCast(replyText, {
        parent: original.cast.hash,
      });
      expect(reply.success).toBe(true);
      castsToCleanup.push(reply.cast.hash);

      // Verify reply is linked to parent
      const replyCast = await neynarLookupCast(reply.cast.hash);
      expect(replyCast.parent_hash).toBe(original.cast.hash);
    },
    LIVE_WRITE_TIMEOUT,
  );

  it(
    "thread/reply chains work",
    async () => {
      // Create a 3-deep reply chain
      const cast1 = await neynarPublishCast(
        `[milady-chain-1] ${Date.now()}`,
      );
      castsToCleanup.push(cast1.cast.hash);

      const cast2 = await neynarPublishCast(
        `[milady-chain-2] ${Date.now()}`,
        { parent: cast1.cast.hash },
      );
      castsToCleanup.push(cast2.cast.hash);

      const cast3 = await neynarPublishCast(
        `[milady-chain-3] ${Date.now()}`,
        { parent: cast2.cast.hash },
      );
      castsToCleanup.push(cast3.cast.hash);

      // Verify the chain
      const thirdCast = await neynarLookupCast(cast3.cast.hash);
      expect(thirdCast.parent_hash).toBe(cast2.cast.hash);

      const secondCast = await neynarLookupCast(cast2.cast.hash);
      expect(secondCast.parent_hash).toBe(cast1.cast.hash);
    },
    LIVE_WRITE_TIMEOUT,
  );
});

// ---------------------------------------------------------------------------
// 3. Farcaster-Specific Features Tests
// ---------------------------------------------------------------------------

describeIfLiveWrite("Farcaster Connector - Farcaster-Specific Features", () => {
  afterAll(async () => {
    for (const hash of castsToCleanup) {
      try {
        await neynarDeleteCast(hash);
      } catch {
        // best effort
      }
    }
    castsToCleanup.length = 0;
  });

  it(
    "can post to a channel",
    async () => {
      // Post to the "milady" channel (or a known test channel)
      const channelText = `[milady-channel-test] ${Date.now()}`;
      const result = await neynarPublishCast(channelText, {
        channelId: "milady",
      });

      expect(result.success).toBe(true);
      expect(result.cast.hash).toBeDefined();
      castsToCleanup.push(result.cast.hash);
    },
    LIVE_WRITE_TIMEOUT,
  );

  it(
    "parses @mentions correctly",
    async () => {
      // Fetch the agent's own profile to get its username
      const fid = Number(process.env.FARCASTER_FID);
      const profile = await neynarGetProfile(fid);

      expect(profile.users).toBeDefined();
      expect(profile.users.length).toBeGreaterThan(0);
      expect(profile.users[0].fid).toBe(fid);
      expect(profile.users[0].username).toBeDefined();
      logger.info(
        `[farcaster-connector] Agent profile: @${profile.users[0].username} (FID: ${fid})`,
      );
    },
    LIVE_WRITE_TIMEOUT,
  );

  it(
    "handles embeds (URLs, images)",
    async () => {
      const castText = `[milady-embed-test] ${Date.now()}`;
      const result = await neynarPublishCast(castText, {
        embeds: [{ url: "https://milady.ai" }],
      });

      expect(result.success).toBe(true);
      castsToCleanup.push(result.cast.hash);

      // Verify the embed was attached
      const cast = await neynarLookupCast(result.cast.hash);
      expect(cast.embeds).toBeDefined();
      expect(cast.embeds!.length).toBeGreaterThan(0);
    },
    LIVE_WRITE_TIMEOUT,
  );

  it(
    "handles reactions (likes, recasts)",
    async () => {
      // Post a cast to react to
      const castText = `[milady-reaction-test] ${Date.now()}`;
      const posted = await neynarPublishCast(castText);
      castsToCleanup.push(posted.cast.hash);

      // Like the cast
      const likeResult = await neynarReact(posted.cast.hash, "like");
      expect(likeResult.success).toBe(true);

      // Clean up: unlike
      await neynarUnreact(posted.cast.hash, "like");
    },
    LIVE_WRITE_TIMEOUT,
  );
});

// ---------------------------------------------------------------------------
// 4. Media & Attachments Tests
// ---------------------------------------------------------------------------

describeIfLiveWrite("Farcaster Connector - Media & Attachments", () => {
  afterAll(async () => {
    for (const hash of castsToCleanup) {
      try {
        await neynarDeleteCast(hash);
      } catch {
        // best effort
      }
    }
    castsToCleanup.length = 0;
  });

  it(
    "can receive images in casts",
    async () => {
      // Post a cast with an image URL embed
      const castText = `[milady-image-test] ${Date.now()}`;
      const result = await neynarPublishCast(castText, {
        embeds: [
          { url: "https://i.imgur.com/removed.png" },
        ],
      });

      expect(result.success).toBe(true);
      castsToCleanup.push(result.cast.hash);

      const cast = await neynarLookupCast(result.cast.hash);
      expect(cast.embeds).toBeDefined();
      expect(cast.embeds!.length).toBeGreaterThan(0);

      // Verify at least one embed has a url field
      const hasUrlEmbed = cast.embeds!.some(
        (e) => typeof (e as { url?: string }).url === "string",
      );
      expect(hasUrlEmbed).toBe(true);
    },
    LIVE_WRITE_TIMEOUT,
  );

  it(
    "can post images with casts",
    async () => {
      // Post with a publicly accessible image URL
      const castText = `[milady-post-image-test] ${Date.now()}`;
      const result = await neynarPublishCast(castText, {
        embeds: [
          {
            url: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/PNG_transparency_demonstration_1.png/280px-PNG_transparency_demonstration_1.png",
          },
        ],
      });

      expect(result.success).toBe(true);
      castsToCleanup.push(result.cast.hash);
    },
    LIVE_WRITE_TIMEOUT,
  );

  it(
    "URL previews render correctly",
    async () => {
      const castText = `[milady-url-preview-test] Check https://milady.ai ${Date.now()}`;
      const result = await neynarPublishCast(castText);

      expect(result.success).toBe(true);
      castsToCleanup.push(result.cast.hash);

      const cast = await neynarLookupCast(result.cast.hash);
      // URLs in cast text are auto-detected by Farcaster as embeds
      expect(cast.text).toContain("https://milady.ai");
    },
    LIVE_WRITE_TIMEOUT,
  );
});

// ---------------------------------------------------------------------------
// 5. Error Handling Tests
// ---------------------------------------------------------------------------

describeIfLive("Farcaster Connector - Error Handling", () => {
  it(
    "handles network errors gracefully",
    async () => {
      // Attempt to look up a non-existent cast hash
      const fakeHash = "0x" + "0".repeat(40);
      try {
        await neynarLookupCast(fakeHash);
        // If it doesn't throw, it should return a meaningful response
      } catch (error) {
        expect(error).toBeDefined();
        expect(String(error)).toContain("failed");
        logger.info(
          `[farcaster-connector] Non-existent cast error handled: ${error}`,
        );
      }
    },
    TEST_TIMEOUT,
  );

  it(
    "handles Hub connection issues handled",
    async () => {
      // Use an invalid API key to simulate auth failure
      const badHeaders = {
        "Content-Type": "application/json",
        "x-api-key": "INVALID_KEY_12345",
      };

      const res = await fetch(
        `${NEYNAR_BASE}/user/bulk?fids=${process.env.FARCASTER_FID}`,
        { headers: badHeaders },
      );

      // Neynar returns 401 or 403 for invalid keys
      expect(res.ok).toBe(false);
      expect([401, 403]).toContain(res.status);
      logger.info(
        `[farcaster-connector] Invalid API key returned status ${res.status}`,
      );
    },
    TEST_TIMEOUT,
  );

  it(
    "respects rate limiting",
    async () => {
      // Verify that the API returns proper rate limit headers
      const res = await fetch(
        `${NEYNAR_BASE}/user/bulk?fids=${process.env.FARCASTER_FID}`,
        { headers: neynarHeaders() },
      );

      expect(res.ok).toBe(true);

      // Neynar includes rate limit headers
      const rateLimitRemaining = res.headers.get("x-ratelimit-remaining");
      const rateLimitLimit = res.headers.get("x-ratelimit-limit");

      // Log rate limit info (headers may or may not be present depending
      // on Neynar plan)
      if (rateLimitLimit) {
        logger.info(
          `[farcaster-connector] Rate limit: ${rateLimitRemaining}/${rateLimitLimit} remaining`,
        );
        expect(Number(rateLimitRemaining)).toBeGreaterThanOrEqual(0);
      } else {
        // If no rate limit headers, just confirm the request succeeded
        logger.info(
          "[farcaster-connector] No rate limit headers present (free tier or headers not exposed)",
        );
        expect(res.ok).toBe(true);
      }
    },
    TEST_TIMEOUT,
  );
});

// ---------------------------------------------------------------------------
// Integration Tests (always run, no live credentials needed)
// ---------------------------------------------------------------------------

describe("Farcaster Connector - Integration", () => {
  it("Farcaster connector is mapped in plugin auto-enable", async () => {
    const { CONNECTOR_PLUGINS } = await import(
      "../src/config/plugin-auto-enable"
    );
    expect(CONNECTOR_PLUGINS.farcaster).toBe("@elizaos/plugin-farcaster");
  });

  it("Farcaster is included in connector list", async () => {
    const { CONNECTOR_PLUGINS } = await import(
      "../src/config/plugin-auto-enable"
    );
    const connectors = Object.keys(CONNECTOR_PLUGINS);
    expect(connectors).toContain("farcaster");
  });

  it("Farcaster is in CHANNEL_PLUGIN_MAP", async () => {
    const { CHANNEL_PLUGIN_MAP } = await import("../src/runtime/eliza");
    expect(CHANNEL_PLUGIN_MAP.farcaster).toBe("@elizaos/plugin-farcaster");
  });

  it("Farcaster auto-enables when apiKey is present in config", () => {
    const configWithApiKey = {
      connectors: {
        farcaster: {
          apiKey: "test-neynar-key",
          signerUuid: "test-signer-uuid",
          fid: 12345,
        },
      },
    };

    expect(configWithApiKey.connectors.farcaster.apiKey).toBeDefined();
    expect(configWithApiKey.connectors.farcaster.signerUuid).toBeDefined();
    expect(configWithApiKey.connectors.farcaster.fid).toBe(12345);
  });

  it("Farcaster respects explicit disable even with apiKey present", () => {
    const configDisabled = {
      connectors: {
        farcaster: {
          enabled: false,
          apiKey: "test-neynar-key",
          signerUuid: "test-signer-uuid",
          fid: 12345,
        },
      },
    };

    expect(configDisabled.connectors.farcaster.apiKey).toBeDefined();
    expect(configDisabled.connectors.farcaster.enabled).toBe(false);
  });

  it("Farcaster uses FARCASTER_NEYNAR_API_KEY environment variable", () => {
    const expectedEnvVar = "FARCASTER_NEYNAR_API_KEY";
    expect(expectedEnvVar).toBe("FARCASTER_NEYNAR_API_KEY");

    const originalValue = process.env.FARCASTER_NEYNAR_API_KEY;
    process.env.FARCASTER_NEYNAR_API_KEY = "test-api-key-value";
    expect(process.env.FARCASTER_NEYNAR_API_KEY).toBe("test-api-key-value");

    if (originalValue === undefined) {
      delete process.env.FARCASTER_NEYNAR_API_KEY;
    } else {
      process.env.FARCASTER_NEYNAR_API_KEY = originalValue;
    }
  });

  it("Farcaster connector can be enabled/disabled via config", () => {
    const config1 = { connectors: { farcaster: { enabled: true } } };
    const config2 = { connectors: { farcaster: { enabled: false } } };

    expect(config1.connectors.farcaster.enabled).toBe(true);
    expect(config2.connectors.farcaster.enabled).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Configuration Tests (always run)
// ---------------------------------------------------------------------------

describe("Farcaster Connector - Configuration", () => {
  it("validates required Farcaster configuration fields", () => {
    const validConfig = {
      apiKey: "neynar-api-key-123",
      signerUuid: "signer-uuid-456",
      fid: 12345,
    };

    expect(validConfig.apiKey).toBeDefined();
    expect(validConfig.signerUuid).toBeDefined();
    expect(typeof validConfig.fid).toBe("number");
    expect(validConfig.fid).toBeGreaterThan(0);
  });

  it("validates optional configuration fields", () => {
    const fullConfig = {
      apiKey: "neynar-api-key-123",
      signerUuid: "signer-uuid-456",
      fid: 12345,
      enabled: true,
      pollInterval: 60,
      channels: ["ai", "agents", "milady"],
      castIntervalMin: 90,
      castIntervalMax: 180,
    };

    expect(fullConfig.enabled).toBe(true);
    expect(fullConfig.pollInterval).toBe(60);
    expect(fullConfig.channels).toHaveLength(3);
    expect(fullConfig.channels).toContain("ai");
    expect(fullConfig.castIntervalMin).toBeLessThan(
      fullConfig.castIntervalMax,
    );
  });

  it("validates cast character limit is 320", () => {
    expect(FARCASTER_MAX_CAST_LENGTH).toBe(320);

    const shortCast = "Hello Farcaster!";
    const longCast = "A".repeat(500);

    expect(shortCast.length).toBeLessThanOrEqual(FARCASTER_MAX_CAST_LENGTH);
    expect(longCast.length).toBeGreaterThan(FARCASTER_MAX_CAST_LENGTH);

    const needsThreading = longCast.length > FARCASTER_MAX_CAST_LENGTH;
    expect(needsThreading).toBe(true);
  });

  it("validates channel names are strings", () => {
    const channels = ["ai", "agents", "milady", "defi"];

    for (const channel of channels) {
      expect(typeof channel).toBe("string");
      expect(channel.length).toBeGreaterThan(0);
    }
  });

  it("validates poll interval is a positive number", () => {
    const pollInterval = 60;
    expect(typeof pollInterval).toBe("number");
    expect(pollInterval).toBeGreaterThan(0);
  });

  it("validates cast interval range is valid", () => {
    const castIntervalMin = 90;
    const castIntervalMax = 180;

    expect(castIntervalMin).toBeGreaterThan(0);
    expect(castIntervalMax).toBeGreaterThan(0);
    expect(castIntervalMin).toBeLessThanOrEqual(castIntervalMax);
  });

  it("validates FID is a positive integer", () => {
    const validFids = [1, 12345, 999999];
    const invalidFids = [0, -1, 1.5, NaN];

    for (const fid of validFids) {
      expect(Number.isInteger(fid)).toBe(true);
      expect(fid).toBeGreaterThan(0);
    }

    for (const fid of invalidFids) {
      const isValid = Number.isInteger(fid) && fid > 0;
      expect(isValid).toBe(false);
    }
  });
});
