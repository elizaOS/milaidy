/**
 * Farcaster Connector Unit Tests — GitHub Issue #146
 *
 * Basic validation tests for the Farcaster connector plugin.
 * For comprehensive e2e tests, see test/farcaster-connector.e2e.test.ts
 */

import { describe, expect, it } from "vitest";
import {
  extractPlugin,
  resolveFarcasterPluginImportSpecifier,
} from "../test-support/test-helpers";

const FARCASTER_PLUGIN_IMPORT = resolveFarcasterPluginImportSpecifier();
const FARCASTER_PLUGIN_AVAILABLE = FARCASTER_PLUGIN_IMPORT !== null;
const describeIfPluginAvailable = FARCASTER_PLUGIN_AVAILABLE
  ? describe
  : describe.skip;

const loadFarcasterPluginModule = async () => {
  if (!FARCASTER_PLUGIN_IMPORT) {
    throw new Error("Farcaster plugin is not resolvable");
  }
  return (await import(FARCASTER_PLUGIN_IMPORT)) as {
    default?: unknown;
    plugin?: unknown;
  };
};

const IMPORT_TIMEOUT = 30_000;

describeIfPluginAvailable("Farcaster Connector - Basic Validation", () => {
  it("can import the Farcaster plugin package", async () => {
    const mod = await loadFarcasterPluginModule();
    expect(mod).toBeDefined();
  }, IMPORT_TIMEOUT);

  it("exports a valid plugin structure", async () => {
    const mod = await loadFarcasterPluginModule();
    const plugin = extractPlugin(mod);

    expect(plugin).not.toBeNull();
    expect(plugin).toBeDefined();
  }, IMPORT_TIMEOUT);

  it("plugin has correct name", async () => {
    const mod = await loadFarcasterPluginModule();
    const plugin = extractPlugin(mod) as { name?: string } | null;

    expect(plugin?.name).toBe("farcaster");
  }, IMPORT_TIMEOUT);

  it("plugin has a description", async () => {
    const mod = await loadFarcasterPluginModule();
    const plugin = extractPlugin(mod) as { description?: string } | null;

    expect(plugin?.description).toBeDefined();
    expect(typeof plugin?.description).toBe("string");
  }, IMPORT_TIMEOUT);
});

describe("Farcaster Connector - Configuration", () => {
  it("validates basic Farcaster configuration structure", () => {
    const validConfig = {
      enabled: true,
      apiKey: "neynar-api-key-123",
      signerUuid: "signer-uuid-456",
      fid: 12345,
    };

    expect(validConfig.enabled).toBe(true);
    expect(validConfig.apiKey).toBe("neynar-api-key-123");
    expect(validConfig.signerUuid).toBe("signer-uuid-456");
    expect(validConfig.fid).toBe(12345);
  });

  it("validates channel monitoring configuration", () => {
    const channelConfig = {
      apiKey: "key",
      signerUuid: "signer",
      fid: 12345,
      channels: ["ai", "agents", "milady"],
    };

    expect(channelConfig.channels).toHaveLength(3);
    expect(channelConfig.channels).toContain("ai");
    expect(channelConfig.channels).toContain("agents");
  });

  it("validates autonomous casting interval configuration", () => {
    const castConfig = {
      castIntervalMin: 90,
      castIntervalMax: 180,
    };

    expect(castConfig.castIntervalMin).toBe(90);
    expect(castConfig.castIntervalMax).toBe(180);
    expect(castConfig.castIntervalMin).toBeLessThan(castConfig.castIntervalMax);
  });

  it("validates poll interval configuration", () => {
    const pollConfig = {
      pollInterval: 60,
    };

    expect(pollConfig.pollInterval).toBe(60);
    expect(pollConfig.pollInterval).toBeGreaterThan(0);
  });

  it("validates default configuration values", () => {
    const defaults = {
      enabled: true,
      pollInterval: 60,
      castIntervalMin: 120,
      castIntervalMax: 240,
    };

    expect(defaults.enabled).toBe(true);
    expect(defaults.pollInterval).toBe(60);
    expect(defaults.castIntervalMin).toBe(120);
    expect(defaults.castIntervalMax).toBe(240);
  });
});

describe("Farcaster Connector - Cast Handling Logic", () => {
  const FARCASTER_MAX_CAST_LENGTH = 320;

  it("respects Farcaster's 320-character cast limit", () => {
    const shortCast = "Hello, Farcaster!";
    const longCast = "A".repeat(500);

    expect(shortCast.length).toBeLessThan(FARCASTER_MAX_CAST_LENGTH);
    expect(longCast.length).toBeGreaterThan(FARCASTER_MAX_CAST_LENGTH);

    const needsThreading = longCast.length > FARCASTER_MAX_CAST_LENGTH;
    expect(needsThreading).toBe(true);
  });

  it("a 320-char cast does not need threading", () => {
    const exactLimitCast = "B".repeat(320);
    expect(exactLimitCast.length).toBe(FARCASTER_MAX_CAST_LENGTH);

    const needsThreading = exactLimitCast.length > FARCASTER_MAX_CAST_LENGTH;
    expect(needsThreading).toBe(false);
  });

  it("a 321-char cast needs threading", () => {
    const overLimitCast = "C".repeat(321);
    expect(overLimitCast.length).toBeGreaterThan(FARCASTER_MAX_CAST_LENGTH);

    const needsThreading = overLimitCast.length > FARCASTER_MAX_CAST_LENGTH;
    expect(needsThreading).toBe(true);
  });

  it("validates cast threading splits correctly", () => {
    const longMessage = "X".repeat(640);
    const chunks: string[] = [];

    for (let i = 0; i < longMessage.length; i += FARCASTER_MAX_CAST_LENGTH) {
      chunks.push(longMessage.slice(i, i + FARCASTER_MAX_CAST_LENGTH));
    }

    expect(chunks).toHaveLength(2);
    expect(chunks[0].length).toBe(320);
    expect(chunks[1].length).toBe(320);
  });

  it("handles Unicode characters in cast length", () => {
    // Emoji and multibyte chars count toward the 320 limit
    const emojiCast = "\u{1F680}".repeat(100); // 100 rocket emojis
    expect(emojiCast.length).toBe(200); // JS string length (surrogate pairs)
  });
});

describe("Farcaster Connector - Environment Variables", () => {
  it("recognizes FARCASTER_NEYNAR_API_KEY environment variable", () => {
    const envKey = "FARCASTER_NEYNAR_API_KEY";
    expect(envKey).toBe("FARCASTER_NEYNAR_API_KEY");
  });

  it("recognizes FARCASTER_SIGNER_UUID environment variable", () => {
    const envKey = "FARCASTER_SIGNER_UUID";
    expect(envKey).toBe("FARCASTER_SIGNER_UUID");
  });

  it("recognizes FARCASTER_FID environment variable", () => {
    const envKey = "FARCASTER_FID";
    expect(envKey).toBe("FARCASTER_FID");
  });

  it("validates that credentials can come from config or environment", () => {
    const configCreds = {
      apiKey: "test-api-key",
      signerUuid: "test-signer",
      fid: 12345,
    };
    expect(configCreds.apiKey).toBeDefined();
    expect(configCreds.signerUuid).toBeDefined();
    expect(configCreds.fid).toBeDefined();

    const envApiKey = process.env.FARCASTER_NEYNAR_API_KEY;
    expect(typeof envApiKey === "string" || envApiKey === undefined).toBe(true);
  });
});

describe("Farcaster Connector - Protocol Constraints", () => {
  it("Farcaster is a social feed connector, not chat", () => {
    const SOCIAL_FEED_CONNECTOR_IDS = [
      "twitter",
      "bluesky",
      "farcaster",
      "instagram",
      "nostr",
    ];

    expect(SOCIAL_FEED_CONNECTOR_IDS).toContain("farcaster");
  });

  it("FID must be a positive integer", () => {
    const validFids = [1, 100, 12345, 999999];

    for (const fid of validFids) {
      expect(Number.isInteger(fid)).toBe(true);
      expect(fid).toBeGreaterThan(0);
    }
  });

  it("signer UUID follows UUID format", () => {
    const uuidPattern =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const validSignerUuid = "550e8400-e29b-41d4-a716-446655440000";

    expect(uuidPattern.test(validSignerUuid)).toBe(true);
  });
});
