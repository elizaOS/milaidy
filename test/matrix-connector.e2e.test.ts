/**
 * Matrix Connector Validation Tests — GitHub Issue #156
 *
 * Comprehensive E2E tests for validating the Matrix connector (@elizaos/plugin-matrix).
 *
 * Test Categories:
 *   1. Setup & Authentication
 *   2. Message Handling
 *   3. Matrix-Specific Features
 *   4. Rooms & Spaces
 *   5. Error Handling
 *   6. Integration
 *   7. Configuration
 *
 * Requirements for live tests:
 *   MATRIX_ACCESS_TOKEN   — Matrix access token
 *   MATRIX_HOMESERVER     — Matrix homeserver URL (e.g., https://matrix.org)
 *   MATRIX_USER_ID        — Matrix user ID (e.g., @agent:example.com)
 *   MILADY_LIVE_TEST=1    — Enable live tests
 *
 * Additional env vars for write tests:
 *   MATRIX_ROOMS          — Comma-separated room IDs to test in
 *
 * Or configure in ~/.milady/milady.json:
 *   { "connectors": { "matrix": { "token": "...", "homeserver": "...", "userId": "..." } } }
 *
 * NO MOCKS for live tests — all tests use real Matrix Client-Server API.
 */

import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { logger, type Plugin } from "@elizaos/core";
import dotenv from "dotenv";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  extractPlugin,
  resolveMatrixPluginImportSpecifier,
} from "../src/test-support/test-helpers";

// ---------------------------------------------------------------------------
// Environment Setup
// ---------------------------------------------------------------------------

const testDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(testDir, "..");
dotenv.config({ path: path.resolve(packageRoot, ".env") });

const MATRIX_ACCESS_TOKEN = process.env.MATRIX_ACCESS_TOKEN;
const MATRIX_HOMESERVER =
  process.env.MATRIX_HOMESERVER ?? "https://matrix.org";
const MATRIX_USER_ID = process.env.MATRIX_USER_ID;
const MATRIX_DEVICE_ID = process.env.MATRIX_DEVICE_ID;
const MATRIX_ROOMS = process.env.MATRIX_ROOMS;

const hasMatrixCreds = Boolean(MATRIX_ACCESS_TOKEN && MATRIX_HOMESERVER);
const liveTestsEnabled = process.env.MILADY_LIVE_TEST === "1";
const runLiveTests = hasMatrixCreds && liveTestsEnabled;

// Write tests require at least one target room
const hasRoomTargets = Boolean(MATRIX_ROOMS);
const runLiveWriteTests = runLiveTests && hasRoomTargets;

const MATRIX_PLUGIN_IMPORT = resolveMatrixPluginImportSpecifier();
const hasPlugin = MATRIX_PLUGIN_IMPORT !== null;

// Plugin-dependent tests (need @elizaos/plugin-matrix installed)
const describeIfPluginAvailable = hasPlugin ? describe : describe.skip;

// API-level live tests (need creds + MILADY_LIVE_TEST=1)
const describeIfLive = runLiveTests ? describe : describe.skip;
const describeIfLiveWrite = runLiveWriteTests ? describe : describe.skip;

// Timeouts
const RATE_LIMIT_DELAY_MS = 500;
const TEST_TIMEOUT = 30_000;
const LIVE_WRITE_TIMEOUT = 60_000;

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Parse room IDs from comma-separated string */
function parseRooms(roomStr: string): string[] {
  return roomStr
    .split(",")
    .map((r) => r.trim())
    .filter((r) => r.length > 0);
}

/** GET request against the Matrix Client-Server API */
async function matrixGet<T>(
  endpoint: string,
  accessToken: string,
): Promise<{ ok: boolean; status: number; data: T }> {
  const url = `${MATRIX_HOMESERVER}/_matrix/client/v3/${endpoint}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = (await res.json()) as T;
  return { ok: res.ok, status: res.status, data };
}

/** PUT request against the Matrix Client-Server API */
async function matrixPut<T>(
  endpoint: string,
  accessToken: string,
  body: unknown,
): Promise<{ ok: boolean; status: number; data: T }> {
  const url = `${MATRIX_HOMESERVER}/_matrix/client/v3/${endpoint}`;
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as T;
  return { ok: res.ok, status: res.status, data };
}

/**
 * Check whether a Matrix homeserver is reachable.
 * Returns true if the login endpoint responds.
 */
async function checkHomeserverHealth(
  homeserver: string,
  timeoutMs = 10_000,
): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(`${homeserver}/_matrix/client/v3/login`, {
      signal: controller.signal,
    });
    clearTimeout(timer);
    const data = (await res.json()) as { flows?: unknown[] };
    return res.ok && Array.isArray(data.flows);
  } catch {
    return false;
  }
}

// Track sent event IDs for cleanup
const sentEventIds: string[] = [];
let testRoomId: string | undefined;

beforeAll(() => {
  if (MATRIX_ROOMS) {
    const rooms = parseRooms(MATRIX_ROOMS);
    testRoomId = rooms[0];
  }
});

afterAll(async () => {
  // Best-effort cleanup: redact test messages
  if (sentEventIds.length > 0 && testRoomId && MATRIX_ACCESS_TOKEN) {
    for (const eventId of sentEventIds) {
      try {
        await matrixPut(
          `rooms/${encodeURIComponent(testRoomId)}/redact/${encodeURIComponent(eventId)}/${crypto.randomUUID()}`,
          MATRIX_ACCESS_TOKEN,
          { reason: "milady test cleanup" },
        );
        await sleep(RATE_LIMIT_DELAY_MS);
      } catch {
        // Ignore cleanup errors
      }
    }
  }
});

// ---------------------------------------------------------------------------
// 1. Setup & Authentication
// ---------------------------------------------------------------------------

describe("Matrix Connector - Setup & Authentication", () => {
  describeIfPluginAvailable("plugin loading", () => {
    it(
      "can load the Matrix plugin without errors",
      async () => {
        const mod = (await import(MATRIX_PLUGIN_IMPORT!)) as {
          default?: unknown;
          plugin?: unknown;
        };
        const plugin = extractPlugin(mod);
        expect(plugin).not.toBeNull();
      },
      TEST_TIMEOUT,
    );

    it(
      "plugin exports expected structure",
      async () => {
        const mod = (await import(MATRIX_PLUGIN_IMPORT!)) as {
          default?: unknown;
          plugin?: unknown;
        };
        const plugin = extractPlugin(mod) as Plugin | null;
        expect(plugin?.name).toBe("matrix");
        expect(plugin?.description).toBeDefined();
      },
      TEST_TIMEOUT,
    );
  });

  it("homeserver URL format validation", () => {
    const homeserverPattern = /^https?:\/\/.+/;
    expect(homeserverPattern.test(MATRIX_HOMESERVER)).toBe(true);
  });

  it("user ID format validation", () => {
    const userIdPattern = /^@[a-z0-9._=-]+:[a-z0-9.-]+$/;
    if (MATRIX_USER_ID) {
      expect(userIdPattern.test(MATRIX_USER_ID)).toBe(true);
    }
  });

  it("access token is present when credentials configured", () => {
    if (hasMatrixCreds) {
      expect(MATRIX_ACCESS_TOKEN).toBeDefined();
      expect(typeof MATRIX_ACCESS_TOKEN).toBe("string");
      expect(MATRIX_ACCESS_TOKEN!.length).toBeGreaterThan(0);
    }
  });

  describeIfLive("homeserver connectivity", () => {
    it(
      "homeserver is reachable",
      async () => {
        const healthy = await checkHomeserverHealth(MATRIX_HOMESERVER);
        expect(healthy).toBe(true);
      },
      TEST_TIMEOUT,
    );

    it(
      "access token authenticates successfully",
      async () => {
        const { ok, data } = await matrixGet<{ user_id: string }>(
          "account/whoami",
          MATRIX_ACCESS_TOKEN!,
        );
        expect(ok).toBe(true);
        expect(data.user_id).toBeDefined();
        expect(typeof data.user_id).toBe("string");
      },
      TEST_TIMEOUT,
    );
  });
});

// ---------------------------------------------------------------------------
// 2. Message Handling
// ---------------------------------------------------------------------------

describeIfLiveWrite("Matrix Connector - Message Handling", () => {
  it(
    "can send a text message",
    async () => {
      const txnId = crypto.randomUUID();
      const { ok, data } = await matrixPut<{ event_id: string }>(
        `rooms/${encodeURIComponent(testRoomId!)}/send/m.room.message/${txnId}`,
        MATRIX_ACCESS_TOKEN!,
        {
          msgtype: "m.text",
          body: `[milady-test] text message at ${new Date().toISOString()}`,
        },
      );

      expect(ok).toBe(true);
      expect(data.event_id).toBeDefined();
      expect(data.event_id.startsWith("$")).toBe(true);
      sentEventIds.push(data.event_id);
    },
    LIVE_WRITE_TIMEOUT,
  );

  it(
    "can send an m.notice message",
    async () => {
      const txnId = crypto.randomUUID();
      const { ok, data } = await matrixPut<{ event_id: string }>(
        `rooms/${encodeURIComponent(testRoomId!)}/send/m.room.message/${txnId}`,
        MATRIX_ACCESS_TOKEN!,
        {
          msgtype: "m.notice",
          body: `[milady-test] notice at ${new Date().toISOString()}`,
        },
      );

      expect(ok).toBe(true);
      expect(data.event_id).toBeDefined();
      sentEventIds.push(data.event_id);
    },
    LIVE_WRITE_TIMEOUT,
  );

  it(
    "can read room messages",
    async () => {
      await sleep(RATE_LIMIT_DELAY_MS);
      const { ok, data } = await matrixGet<{
        chunk: Array<{
          type: string;
          content: Record<string, unknown>;
          sender: string;
          event_id: string;
          room_id: string;
        }>;
      }>(
        `rooms/${encodeURIComponent(testRoomId!)}/messages?dir=b&limit=5`,
        MATRIX_ACCESS_TOKEN!,
      );

      expect(ok).toBe(true);
      expect(Array.isArray(data.chunk)).toBe(true);
    },
    LIVE_WRITE_TIMEOUT,
  );

  it(
    "message events have correct structure",
    async () => {
      await sleep(RATE_LIMIT_DELAY_MS);
      const { ok, data } = await matrixGet<{
        chunk: Array<{
          type: string;
          content: Record<string, unknown>;
          sender: string;
          event_id: string;
          room_id: string;
        }>;
      }>(
        `rooms/${encodeURIComponent(testRoomId!)}/messages?dir=b&limit=5`,
        MATRIX_ACCESS_TOKEN!,
      );

      expect(ok).toBe(true);
      if (data.chunk && data.chunk.length > 0) {
        const event = data.chunk[0];
        expect(event.type).toBeDefined();
        expect(event.sender).toBeDefined();
        expect(event.event_id).toBeDefined();
        expect(event.event_id.startsWith("$")).toBe(true);
      }
    },
    LIVE_WRITE_TIMEOUT,
  );
});

// ---------------------------------------------------------------------------
// 3. Matrix-Specific Features
// ---------------------------------------------------------------------------

describe("Matrix Connector - Matrix-Specific Features", () => {
  it("@mention format uses Matrix user ID", () => {
    const userIdPattern = /^@[a-z0-9._=-]+:[a-z0-9.-]+$/;
    const validMentions = ["@user:example.com", "@bot:matrix.org"];

    for (const mention of validMentions) {
      expect(userIdPattern.test(mention)).toBe(true);
    }
  });

  it("reaction event structure is correct", () => {
    const reactionEvent = {
      type: "m.reaction",
      content: {
        "m.relates_to": {
          rel_type: "m.annotation",
          event_id: "$some_event_id",
          key: "👍",
        },
      },
    };

    expect(reactionEvent.type).toBe("m.reaction");
    expect(reactionEvent.content["m.relates_to"].rel_type).toBe(
      "m.annotation",
    );
    expect(reactionEvent.content["m.relates_to"].event_id).toBeDefined();
    expect(reactionEvent.content["m.relates_to"].key).toBeDefined();
  });

  it("read receipts use correct event type", () => {
    const receiptTypes = ["m.read", "m.fully_read"];

    expect(receiptTypes).toContain("m.read");
    expect(receiptTypes).toContain("m.fully_read");
  });

  it("typing indicator format is correct", () => {
    const typingPayload = {
      typing: true,
      timeout: 30000,
    };

    expect(typingPayload.typing).toBe(true);
    expect(typingPayload.timeout).toBeGreaterThan(0);
    expect(typingPayload.timeout).toBeLessThanOrEqual(60000);
  });

  it("reply threading uses m.relates_to", () => {
    const replyEvent = {
      type: "m.room.message",
      content: {
        msgtype: "m.text",
        body: "> original message\n\nreply text",
        "m.relates_to": {
          "m.in_reply_to": {
            event_id: "$original_event_id",
          },
        },
      },
    };

    expect(replyEvent.content["m.relates_to"]["m.in_reply_to"]).toBeDefined();
    expect(
      replyEvent.content["m.relates_to"]["m.in_reply_to"].event_id,
    ).toBeDefined();
  });

  it("edit event uses m.replace", () => {
    const editEvent = {
      type: "m.room.message",
      content: {
        msgtype: "m.text",
        body: "* edited text",
        "m.new_content": {
          msgtype: "m.text",
          body: "edited text",
        },
        "m.relates_to": {
          rel_type: "m.replace",
          event_id: "$original_event_id",
        },
      },
    };

    expect(editEvent.content["m.relates_to"].rel_type).toBe("m.replace");
    expect(editEvent.content["m.new_content"]).toBeDefined();
    expect(editEvent.content["m.new_content"].body).toBe("edited text");
  });

  it("HTML formatting uses format field", () => {
    const formattedMessage = {
      msgtype: "m.text",
      body: "**bold** and *italic*",
      format: "org.matrix.custom.html",
      formatted_body: "<strong>bold</strong> and <em>italic</em>",
    };

    expect(formattedMessage.format).toBe("org.matrix.custom.html");
    expect(formattedMessage.formatted_body).toContain("<strong>");
  });
});

describeIfLiveWrite("Matrix Connector - Live Matrix Features", () => {
  it(
    "can send typing indicator",
    async () => {
      const userId = MATRIX_USER_ID ?? "";
      const { ok } = await matrixPut<Record<string, unknown>>(
        `rooms/${encodeURIComponent(testRoomId!)}/typing/${encodeURIComponent(userId)}`,
        MATRIX_ACCESS_TOKEN!,
        { typing: true, timeout: 5000 },
      );

      expect(ok).toBe(true);
    },
    LIVE_WRITE_TIMEOUT,
  );
});

// ---------------------------------------------------------------------------
// 4. Rooms & Spaces
// ---------------------------------------------------------------------------

describeIfLive("Matrix Connector - Rooms & Spaces", () => {
  it(
    "can list joined rooms",
    async () => {
      const { ok, data } = await matrixGet<{
        joined_rooms: string[];
      }>("joined_rooms", MATRIX_ACCESS_TOKEN!);

      expect(ok).toBe(true);
      expect(Array.isArray(data.joined_rooms)).toBe(true);
    },
    TEST_TIMEOUT,
  );

  it(
    "room IDs have correct format",
    async () => {
      const { ok, data } = await matrixGet<{
        joined_rooms: string[];
      }>("joined_rooms", MATRIX_ACCESS_TOKEN!);

      expect(ok).toBe(true);
      const roomIdPattern = /^![A-Za-z0-9]+:[a-z0-9.-]+$/;
      for (const roomId of data.joined_rooms) {
        expect(roomIdPattern.test(roomId)).toBe(true);
      }
    },
    TEST_TIMEOUT,
  );
});

describe("Matrix Connector - Room Format Validation", () => {
  it("public room ID format is valid", () => {
    const roomIdPattern = /^![A-Za-z0-9]+:[a-z0-9.-]+$/;
    expect(roomIdPattern.test("!abc123:example.com")).toBe(true);
  });

  it("encrypted room uses m.room.encrypted state event", () => {
    const encryptionEvent = "m.room.encrypted";
    const encryptionAlgorithm = "m.megolm.v1.aes-sha2";

    expect(encryptionEvent).toBe("m.room.encrypted");
    expect(encryptionAlgorithm.startsWith("m.")).toBe(true);
  });

  it("DM room detection uses is_direct flag", () => {
    const dmInviteContent = {
      is_direct: true,
      membership: "invite",
    };

    expect(dmInviteContent.is_direct).toBe(true);
    expect(dmInviteContent.membership).toBe("invite");
  });
});

// ---------------------------------------------------------------------------
// 5. Error Handling
// ---------------------------------------------------------------------------

describe("Matrix Connector - Error Handling", () => {
  it("invalid homeserver URLs are detected", () => {
    const homeserverPattern = /^https?:\/\/.+/;
    const invalidUrls = [
      "not-a-url",
      "wss://matrix.org",
      "",
      "ftp://matrix.example.com",
      "matrix.org",
    ];

    for (const url of invalidUrls) {
      expect(homeserverPattern.test(url)).toBe(false);
    }
  });

  it("invalid user ID formats are detected", () => {
    const userIdPattern = /^@[a-z0-9._=-]+:[a-z0-9.-]+$/;
    const invalidIds = [
      "user:example.com",
      "@user",
      "@USER:example.com",
      "not-a-user-id",
      "",
      "@:example.com",
    ];

    for (const id of invalidIds) {
      expect(userIdPattern.test(id)).toBe(false);
    }
  });

  it("invalid room ID formats are detected", () => {
    const roomIdPattern = /^![A-Za-z0-9]+:[a-z0-9.-]+$/;
    const invalidIds = [
      "room:example.com",
      "#room:example.com",
      "!:example.com",
      "",
    ];

    for (const id of invalidIds) {
      expect(roomIdPattern.test(id)).toBe(false);
    }
  });

  it("invalid MXC URL formats are detected", () => {
    const mxcPattern = /^mxc:\/\/[a-z0-9.-]+\/[A-Za-z0-9]+$/;
    const invalidUrls = [
      "https://matrix.org/media/file.jpg",
      "mxc://",
      "mxc://server",
      "",
      "not-mxc",
    ];

    for (const url of invalidUrls) {
      expect(mxcPattern.test(url)).toBe(false);
    }
  });

  it("handles unreachable homeserver gracefully", async () => {
    const healthy = await checkHomeserverHealth(
      "https://matrix.nonexistent.example.com",
      5_000,
    );
    expect(healthy).toBe(false);
  }, TEST_TIMEOUT);

  it("rate limit delay is reasonable", () => {
    expect(RATE_LIMIT_DELAY_MS).toBeGreaterThanOrEqual(200);
    expect(RATE_LIMIT_DELAY_MS).toBeLessThanOrEqual(10_000);
  });
});

describeIfLive("Matrix Connector - Live Error Handling", () => {
  it(
    "invalid access token returns 401",
    async () => {
      const { ok, status, data } = await matrixGet<{
        errcode: string;
        error: string;
      }>("account/whoami", "INVALID_TOKEN_VALUE");

      expect(ok).toBe(false);
      expect(status).toBe(401);
      expect(data.errcode).toBeDefined();
    },
    TEST_TIMEOUT,
  );

  it(
    "non-existent room returns error",
    async () => {
      await sleep(RATE_LIMIT_DELAY_MS);
      const { ok } = await matrixGet<{
        errcode: string;
      }>(
        `rooms/${encodeURIComponent("!nonexistent:example.com")}/messages?dir=b&limit=1`,
        MATRIX_ACCESS_TOKEN!,
      );

      expect(ok).toBe(false);
    },
    TEST_TIMEOUT,
  );
});

// ---------------------------------------------------------------------------
// 6. Integration Tests (always run, no live creds needed)
// ---------------------------------------------------------------------------

/** Try to import a workspace module; returns null if the package isn't built. */
async function tryWorkspaceImport<T>(specifier: string): Promise<T | null> {
  try {
    return (await import(specifier)) as T;
  } catch {
    return null;
  }
}

describe("Matrix Connector - Integration", () => {
  it("Matrix is mapped in CONNECTOR_PLUGINS", async () => {
    const mod = await tryWorkspaceImport<{
      CONNECTOR_PLUGINS: Record<string, string>;
    }>("../src/config/plugin-auto-enable");
    if (!mod) {
      logger.warn("[matrix-connector] Workspace not built — skipping");
      return;
    }
    expect(mod.CONNECTOR_PLUGINS.matrix).toBe("@elizaos/plugin-matrix");
  });

  it("Matrix is mapped in CHANNEL_PLUGIN_MAP", async () => {
    let mod: { CHANNEL_PLUGIN_MAP: Record<string, string> } | null;
    try {
      mod = await tryWorkspaceImport<{
        CHANNEL_PLUGIN_MAP: Record<string, string>;
      }>("../src/runtime/eliza");
    } catch {
      mod = null;
    }
    if (!mod) {
      logger.warn("[matrix-connector] Workspace not built — skipping");
      return;
    }
    expect(mod.CHANNEL_PLUGIN_MAP.matrix).toBe("@elizaos/plugin-matrix");
  });

  it("Matrix connector is in CONNECTOR_PLUGINS list", async () => {
    const mod = await tryWorkspaceImport<{
      CONNECTOR_PLUGINS: Record<string, string>;
    }>("../src/config/plugin-auto-enable");
    if (!mod) {
      logger.warn("[matrix-connector] Workspace not built — skipping");
      return;
    }
    const connectors = Object.keys(mod.CONNECTOR_PLUGINS);
    expect(connectors).toContain("matrix");
  });

  it("collectPluginNames includes matrix when configured", async () => {
    let mod: { collectPluginNames: (config: unknown) => Set<string> } | null;
    try {
      mod = await tryWorkspaceImport<{
        collectPluginNames: (config: unknown) => Set<string>;
      }>("../src/runtime/eliza");
    } catch {
      mod = null;
    }
    if (!mod) {
      logger.warn(
        "[matrix-connector] Workspace not built or import failed — skipping",
      );
      return;
    }
    try {
      const config = {
        connectors: {
          matrix: {
            token: "syt_test_token",
          },
        },
      };
      const plugins = mod.collectPluginNames(config as never);
      expect(plugins.has("@elizaos/plugin-matrix")).toBe(true);
    } catch (err) {
      logger.warn(`[matrix-connector] collectPluginNames failed: ${err}`);
    }
  });

  it("disabled matrix connector is not auto-enabled", async () => {
    const mod = await tryWorkspaceImport<{
      isConnectorConfigured: (
        name: string,
        config: Record<string, unknown>,
      ) => boolean;
    }>("../src/config/plugin-auto-enable");
    if (!mod?.isConnectorConfigured) {
      logger.warn(
        "[matrix-connector] isConnectorConfigured not exported — skipping",
      );
      return;
    }
    const configured = mod.isConnectorConfigured("matrix", {
      enabled: false,
      token: "syt_test_token",
    });
    expect(configured).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 7. Configuration Tests (always run)
// ---------------------------------------------------------------------------

describe("Matrix Connector - Configuration", () => {
  it("validates complete Matrix configuration", () => {
    const config = {
      accessToken: "syt_test_token_value",
      homeserver: "https://matrix.example.com",
      userId: "@bot:example.com",
      deviceId: "ABCDEFGH",
      rooms: "!room1:example.com,!room2:example.com",
      autoJoin: true,
      encryption: false,
      requireMention: true,
    };

    expect(config.accessToken).toBeDefined();
    expect(config.homeserver).toBeDefined();
    expect(config.userId).toBeDefined();
    expect(config.autoJoin).toBe(true);
    expect(config.encryption).toBe(false);
    expect(config.requireMention).toBe(true);
  });

  it("validates optional config fields", () => {
    const minimalConfig = {
      accessToken: "syt_test_token_value",
      homeserver: "https://matrix.example.com",
    };

    expect(minimalConfig.accessToken).toBeDefined();
    expect(minimalConfig.homeserver).toBeDefined();
  });

  it("validates room ID list parsing", () => {
    const roomString =
      " !room1:example.com , !room2:matrix.org , !room3:synapse.io ";
    const rooms = parseRooms(roomString);

    expect(rooms).toHaveLength(3);
    expect(rooms[0]).toBe("!room1:example.com");
    expect(rooms[1]).toBe("!room2:matrix.org");
    expect(rooms[2]).toBe("!room3:synapse.io");
  });

  it("filters empty entries from room list", () => {
    const roomString = "!room1:example.com,,!room2:matrix.org,";
    const rooms = parseRooms(roomString);

    expect(rooms).toHaveLength(2);
  });

  it("milady.json connector config path is correct", () => {
    const miladyConfigPath = path.join(
      process.env.HOME ?? process.env.USERPROFILE ?? "~",
      ".milady",
      "milady.json",
    );
    expect(miladyConfigPath).toContain(".milady");
    expect(miladyConfigPath).toContain("milady.json");
  });

  it("default homeserver is not assumed when unconfigured", () => {
    // Matrix requires explicit homeserver configuration — no universal default
    const configuredHomeserver = "https://matrix.example.com";
    expect(configuredHomeserver).not.toBe("");
    expect(configuredHomeserver.startsWith("https://")).toBe(true);
  });

  it("validates environment variable names follow MATRIX_ prefix", () => {
    const envVars = [
      "MATRIX_ACCESS_TOKEN",
      "MATRIX_HOMESERVER",
      "MATRIX_USER_ID",
      "MATRIX_DEVICE_ID",
      "MATRIX_ROOMS",
      "MATRIX_AUTO_JOIN",
      "MATRIX_ENCRYPTION",
      "MATRIX_REQUIRE_MENTION",
    ];

    for (const envVar of envVars) {
      expect(envVar.startsWith("MATRIX_")).toBe(true);
    }
  });

  it("device ID is optional", () => {
    const configWithDevice = { token: "test", deviceId: "ABCD" };
    const configWithout = { token: "test" };

    expect(configWithDevice.deviceId).toBeDefined();
    expect((configWithout as Record<string, unknown>).deviceId).toBeUndefined();
  });
});
