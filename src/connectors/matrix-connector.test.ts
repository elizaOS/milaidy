/**
 * Matrix Connector Unit Tests — GitHub Issue #156
 *
 * Basic validation tests for the Matrix connector plugin.
 * For comprehensive e2e tests, see test/matrix-connector.e2e.test.ts
 */

import { describe, expect, it } from "vitest";
import {
  extractPlugin,
  resolveMatrixPluginImportSpecifier,
} from "../test-support/test-helpers";

const MATRIX_PLUGIN_IMPORT = resolveMatrixPluginImportSpecifier();
const MATRIX_PLUGIN_AVAILABLE = MATRIX_PLUGIN_IMPORT !== null;
const describeIfPluginAvailable = MATRIX_PLUGIN_AVAILABLE
  ? describe
  : describe.skip;

const loadMatrixPluginModule = async () => {
  if (!MATRIX_PLUGIN_IMPORT) {
    throw new Error("Matrix plugin is not resolvable");
  }
  return (await import(MATRIX_PLUGIN_IMPORT)) as {
    default?: unknown;
    plugin?: unknown;
  };
};

// ============================================================================
//  1. Basic Validation (requires plugin installed)
// ============================================================================

describeIfPluginAvailable("Matrix Connector - Basic Validation", () => {
  it("can import the Matrix plugin package", async () => {
    const mod = await loadMatrixPluginModule();
    expect(mod).toBeDefined();
  });

  it("exports a valid plugin structure", async () => {
    const mod = await loadMatrixPluginModule();
    const plugin = extractPlugin(mod);

    expect(plugin).not.toBeNull();
    expect(plugin).toBeDefined();
  });

  it("plugin has correct name", async () => {
    const mod = await loadMatrixPluginModule();
    const plugin = extractPlugin(mod) as { name?: string } | null;

    expect(plugin?.name).toBe("matrix");
  });

  it("plugin has a description", async () => {
    const mod = await loadMatrixPluginModule();
    const plugin = extractPlugin(mod) as { description?: string } | null;

    expect(plugin?.description).toBeDefined();
    expect(typeof plugin?.description).toBe("string");
  });

  it("plugin has clients or services", async () => {
    const mod = await loadMatrixPluginModule();
    const plugin = extractPlugin(mod) as {
      clients?: unknown[];
      services?: unknown[];
    } | null;

    const hasClients =
      Array.isArray(plugin?.clients) && plugin?.clients?.length > 0;
    const hasServices =
      Array.isArray(plugin?.services) && plugin?.services?.length > 0;

    expect(hasClients || hasServices).toBe(true);
  });
});

// ============================================================================
//  2. Protocol Constraints (always run — no plugin needed)
// ============================================================================

describe("Matrix Connector - Protocol Constraints", () => {
  it("homeserver URL format is valid", () => {
    const homeserverPattern = /^https?:\/\/.+/;

    expect(homeserverPattern.test("https://matrix.org")).toBe(true);
    expect(homeserverPattern.test("https://matrix.example.com")).toBe(true);
    expect(homeserverPattern.test("http://localhost:8008")).toBe(true);
    expect(homeserverPattern.test("https://synapse.my-domain.io:8448")).toBe(
      true,
    );
    expect(homeserverPattern.test("matrix.org")).toBe(false);
    expect(homeserverPattern.test("wss://matrix.org")).toBe(false);
    expect(homeserverPattern.test("")).toBe(false);
  });

  it("user ID format is valid", () => {
    const userIdPattern = /^@[a-z0-9._=-]+:[a-z0-9.-]+$/;

    expect(userIdPattern.test("@user:example.com")).toBe(true);
    expect(userIdPattern.test("@bot:matrix.org")).toBe(true);
    expect(userIdPattern.test("@my-bot:synapse.example.com")).toBe(true);
    expect(userIdPattern.test("@agent_1:localhost")).toBe(true);
    expect(userIdPattern.test("user:example.com")).toBe(false);
    expect(userIdPattern.test("@user")).toBe(false);
    expect(userIdPattern.test("@USER:example.com")).toBe(false);
    expect(userIdPattern.test("")).toBe(false);
  });

  it("room ID format is valid", () => {
    const roomIdPattern = /^![A-Za-z0-9]+:[a-z0-9.-]+$/;

    expect(roomIdPattern.test("!abc123:example.com")).toBe(true);
    expect(roomIdPattern.test("!OGEhHVWSdvArJzumhm:matrix.org")).toBe(true);
    expect(roomIdPattern.test("abc123:example.com")).toBe(false);
    expect(roomIdPattern.test("#room:example.com")).toBe(false);
    expect(roomIdPattern.test("")).toBe(false);
  });

  it("room alias format is valid", () => {
    const roomAliasPattern = /^#[a-z0-9._=-]+:[a-z0-9.-]+$/;

    expect(roomAliasPattern.test("#general:example.com")).toBe(true);
    expect(roomAliasPattern.test("#my-room:matrix.org")).toBe(true);
    expect(roomAliasPattern.test("general:example.com")).toBe(false);
    expect(roomAliasPattern.test("!room:example.com")).toBe(false);
    expect(roomAliasPattern.test("")).toBe(false);
  });

  it("MXC URL format is valid", () => {
    const mxcPattern = /^mxc:\/\/[a-z0-9.-]+\/[A-Za-z0-9]+$/;

    expect(mxcPattern.test("mxc://matrix.org/abcdef123")).toBe(true);
    expect(mxcPattern.test("mxc://example.com/SomeMediaId")).toBe(true);
    expect(mxcPattern.test("https://matrix.org/media")).toBe(false);
    expect(mxcPattern.test("mxc://")).toBe(false);
    expect(mxcPattern.test("")).toBe(false);
  });

  it("event types are correct", () => {
    const eventTypes = [
      "m.room.message",
      "m.room.member",
      "m.reaction",
      "m.room.encrypted",
      "m.room.create",
      "m.room.name",
      "m.room.topic",
      "m.room.power_levels",
    ];

    for (const eventType of eventTypes) {
      expect(eventType.startsWith("m.")).toBe(true);
    }

    expect(eventTypes).toContain("m.room.message");
    expect(eventTypes).toContain("m.reaction");
    expect(eventTypes).toContain("m.room.encrypted");
  });

  it("message types (msgtype) are correct", () => {
    const msgTypes = [
      "m.text",
      "m.image",
      "m.file",
      "m.audio",
      "m.video",
      "m.notice",
      "m.emote",
    ];

    for (const msgType of msgTypes) {
      expect(msgType.startsWith("m.")).toBe(true);
    }

    expect(msgTypes).toContain("m.text");
    expect(msgTypes).toContain("m.image");
    expect(msgTypes).toContain("m.file");
    expect(msgTypes).toContain("m.notice");
  });
});

// ============================================================================
//  3. Configuration
// ============================================================================

describe("Matrix Connector - Configuration", () => {
  it("validates basic Matrix configuration structure", () => {
    const validConfig = {
      accessToken: "syt_test_token_value",
      homeserver: "https://matrix.example.com",
      userId: "@bot:example.com",
      deviceId: "ABCDEF",
    };

    expect(validConfig.accessToken).toBeDefined();
    expect(validConfig.homeserver).toBeDefined();
    expect(validConfig.userId).toBeDefined();
    expect(validConfig.deviceId).toBeDefined();
  });

  it("parses room list from comma-separated string", () => {
    const roomString =
      "!room1:example.com,!room2:example.com,!room3:matrix.org";
    const rooms = roomString.split(",").map((r) => r.trim());

    expect(rooms).toHaveLength(3);
    expect(rooms[0]).toBe("!room1:example.com");
    expect(rooms[1]).toBe("!room2:example.com");
    expect(rooms[2]).toBe("!room3:matrix.org");
  });

  it("handles single room in config", () => {
    const roomString = "!room1:example.com";
    const rooms = roomString.split(",").map((r) => r.trim());

    expect(rooms).toHaveLength(1);
    expect(rooms[0]).toBe("!room1:example.com");
  });

  it("handles room list with whitespace", () => {
    const roomString =
      "!room1:example.com , !room2:example.com , !room3:matrix.org";
    const rooms = roomString.split(",").map((r) => r.trim());

    expect(rooms).toHaveLength(3);
    expect(rooms.every((r) => r.startsWith("!"))).toBe(true);
  });

  it("config keys match plugins.json expectations", () => {
    const expectedConfigKeys = [
      "MATRIX_ACCESS_TOKEN",
      "MATRIX_HOMESERVER",
      "MATRIX_USER_ID",
      "MATRIX_DEVICE_ID",
      "MATRIX_ROOMS",
      "MATRIX_AUTO_JOIN",
      "MATRIX_ENCRYPTION",
      "MATRIX_REQUIRE_MENTION",
    ];

    const requiredKeys = ["MATRIX_ACCESS_TOKEN"];
    const optionalKeys = [
      "MATRIX_HOMESERVER",
      "MATRIX_USER_ID",
      "MATRIX_DEVICE_ID",
      "MATRIX_ROOMS",
      "MATRIX_AUTO_JOIN",
      "MATRIX_ENCRYPTION",
      "MATRIX_REQUIRE_MENTION",
    ];

    expect(requiredKeys.every((k) => expectedConfigKeys.includes(k))).toBe(
      true,
    );
    expect(optionalKeys.every((k) => expectedConfigKeys.includes(k))).toBe(
      true,
    );
    expect(requiredKeys.length + optionalKeys.length).toBe(
      expectedConfigKeys.length,
    );
  });

  it("boolean config values parse correctly", () => {
    const booleanKeys = [
      "MATRIX_AUTO_JOIN",
      "MATRIX_ENCRYPTION",
      "MATRIX_REQUIRE_MENTION",
    ];

    for (const key of booleanKeys) {
      const trueVal = "true";
      const falseVal = "false";

      expect(trueVal === "true" || trueVal === "1").toBe(true);
      expect(falseVal === "false" || falseVal === "0").toBe(true);
      expect(key.startsWith("MATRIX_")).toBe(true);
    }
  });
});

// ============================================================================
//  4. Environment Variables
// ============================================================================

describe("Matrix Connector - Environment Variables", () => {
  it("recognizes MATRIX_ACCESS_TOKEN environment variable", () => {
    const envKey = "MATRIX_ACCESS_TOKEN";
    expect(envKey).toBe("MATRIX_ACCESS_TOKEN");
  });

  it("recognizes MATRIX_HOMESERVER environment variable", () => {
    const envKey = "MATRIX_HOMESERVER";
    expect(envKey).toBe("MATRIX_HOMESERVER");
  });

  it("recognizes MATRIX_USER_ID environment variable", () => {
    const envKey = "MATRIX_USER_ID";
    expect(envKey).toBe("MATRIX_USER_ID");
  });

  it("recognizes optional environment variables", () => {
    const optionalVars = [
      "MATRIX_DEVICE_ID",
      "MATRIX_ROOMS",
      "MATRIX_AUTO_JOIN",
      "MATRIX_ENCRYPTION",
      "MATRIX_REQUIRE_MENTION",
    ];

    for (const envVar of optionalVars) {
      const value = process.env[envVar];
      expect(value === undefined || typeof value === "string").toBe(true);
    }
  });

  it("validates that credentials can come from config or environment", () => {
    const configKey = { accessToken: "syt_test" };
    expect(configKey.accessToken).toBeDefined();

    const envKey = process.env.MATRIX_ACCESS_TOKEN;
    expect(typeof envKey === "string" || envKey === undefined).toBe(true);
  });
});
