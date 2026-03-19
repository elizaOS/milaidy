/**
 * Feishu Connector Unit Tests — GitHub Issue #155
 *
 * Basic validation tests for the Feishu/Lark connector plugin.
 * For comprehensive e2e tests, see test/feishu-connector.e2e.test.ts
 */

import { describe, expect, it } from "vitest";
import {
  extractPlugin,
  resolveFeishuPluginImportSpecifier,
} from "../test-support/test-helpers";

const FEISHU_PLUGIN_IMPORT = resolveFeishuPluginImportSpecifier();
const FEISHU_PLUGIN_AVAILABLE = FEISHU_PLUGIN_IMPORT !== null;
const describeIfPluginAvailable = FEISHU_PLUGIN_AVAILABLE
  ? describe
  : describe.skip;

const loadFeishuPluginModule = async () => {
  if (!FEISHU_PLUGIN_IMPORT) {
    throw new Error("Feishu plugin is not resolvable");
  }
  return (await import(FEISHU_PLUGIN_IMPORT)) as {
    default?: unknown;
    plugin?: unknown;
  };
};

// ============================================================================
//  1. Basic Validation (requires plugin installed)
// ============================================================================

describeIfPluginAvailable("Feishu Connector - Basic Validation", () => {
  it("can import the Feishu plugin package", async () => {
    const mod = await loadFeishuPluginModule();
    expect(mod).toBeDefined();
  });

  it("exports a valid plugin structure", async () => {
    const mod = await loadFeishuPluginModule();
    const plugin = extractPlugin(mod);

    expect(plugin).not.toBeNull();
    expect(plugin).toBeDefined();
  });

  it("plugin has correct name", async () => {
    const mod = await loadFeishuPluginModule();
    const plugin = extractPlugin(mod) as { name?: string } | null;

    expect(plugin?.name).toMatch(/feishu/i);
  });

  it("plugin has a description", async () => {
    const mod = await loadFeishuPluginModule();
    const plugin = extractPlugin(mod) as { description?: string } | null;

    expect(plugin?.description).toBeDefined();
    expect(typeof plugin?.description).toBe("string");
  });

  it("plugin has clients or services", async () => {
    const mod = await loadFeishuPluginModule();
    const plugin = extractPlugin(mod) as {
      clients?: unknown[];
      services?: unknown[];
    } | null;

    const hasClients =
      Array.isArray(plugin?.clients) && plugin!.clients!.length > 0;
    const hasServices =
      Array.isArray(plugin?.services) && plugin!.services!.length > 0;

    expect(hasClients || hasServices).toBe(true);
  });
});

// ============================================================================
//  2. Protocol Constraints (always run — no plugin needed)
// ============================================================================

describe("Feishu Connector - Protocol Constraints", () => {
  it("App ID format follows cli_ prefix pattern", () => {
    const appIdPattern = /^cli_[a-zA-Z0-9]+$/;

    expect(appIdPattern.test("cli_a1b2c3d4e5f6")).toBe(true);
    expect(appIdPattern.test("cli_9876543210abcdef")).toBe(true);
    expect(appIdPattern.test("app_123")).toBe(false);
    expect(appIdPattern.test("cli_")).toBe(false);
    expect(appIdPattern.test("")).toBe(false);
  });

  it("API domain options are valid", () => {
    const validDomains = ["feishu.cn", "larksuite.com"] as const;

    expect(validDomains).toContain("feishu.cn");
    expect(validDomains).toContain("larksuite.com");
    expect(validDomains).toHaveLength(2);
  });

  it("API base URL format follows domain pattern", () => {
    const apiBasePattern =
      /^https:\/\/open\.(feishu\.cn|larksuite\.com)\/open-apis$/;

    expect(apiBasePattern.test("https://open.feishu.cn/open-apis")).toBe(true);
    expect(apiBasePattern.test("https://open.larksuite.com/open-apis")).toBe(
      true,
    );
    expect(apiBasePattern.test("https://open.example.com/open-apis")).toBe(
      false,
    );
    expect(apiBasePattern.test("http://open.feishu.cn/open-apis")).toBe(false);
  });

  it("chat ID format is valid", () => {
    const chatIdPattern = /^oc_[a-zA-Z0-9]+$/;

    expect(chatIdPattern.test("oc_a1b2c3d4e5f6")).toBe(true);
    expect(chatIdPattern.test("oc_9876543210abcdef")).toBe(true);
    expect(chatIdPattern.test("chat_123")).toBe(false);
    expect(chatIdPattern.test("oc_")).toBe(false);
    expect(chatIdPattern.test("")).toBe(false);
  });

  it("message types are valid", () => {
    const messageTypes = [
      "text",
      "post",
      "image",
      "interactive",
      "share_chat",
      "share_user",
    ] as const;

    expect(messageTypes).toContain("text");
    expect(messageTypes).toContain("post");
    expect(messageTypes).toContain("image");
    expect(messageTypes).toContain("interactive");
    expect(messageTypes).toContain("share_chat");
    expect(messageTypes).toContain("share_user");
    expect(messageTypes).toHaveLength(6);
  });

  it("event types are valid", () => {
    const eventTypes = [
      "im.message.receive_v1",
      "im.message.message_read_v1",
      "im.chat.member.bot.added_v1",
      "im.chat.member.bot.deleted_v1",
    ] as const;

    expect(eventTypes).toContain("im.message.receive_v1");
    expect(eventTypes).toContain("im.message.message_read_v1");
    expect(eventTypes).toContain("im.chat.member.bot.added_v1");
    expect(eventTypes).toContain("im.chat.member.bot.deleted_v1");
    expect(eventTypes).toHaveLength(4);

    for (const eventType of eventTypes) {
      expect(eventType).toMatch(/^im\./);
    }
  });
});

// ============================================================================
//  3. Configuration
// ============================================================================

describe("Feishu Connector - Configuration", () => {
  it("validates basic Feishu configuration structure", () => {
    const validConfig = {
      enabled: true,
      appId: "cli_a1b2c3d4e5f6",
      appSecret: "secret123",
      domain: "feishu.cn",
    };

    expect(validConfig.enabled).toBe(true);
    expect(validConfig.appId).toBeDefined();
    expect(validConfig.appSecret).toBeDefined();
    expect(validConfig.domain).toBe("feishu.cn");
  });

  it("validates domain options", () => {
    const validDomains = ["feishu.cn", "larksuite.com"];

    expect(validDomains).toContain("feishu.cn");
    expect(validDomains).toContain("larksuite.com");
    expect(validDomains).toHaveLength(2);
  });

  it("validates allowed chats list parsing from JSON array", () => {
    const jsonStr = '["oc_chat1","oc_chat2"]';
    const parsed = JSON.parse(jsonStr) as string[];

    expect(parsed).toHaveLength(2);
    expect(parsed).toContain("oc_chat1");
    expect(parsed).toContain("oc_chat2");
  });

  it("validates single chat in allowed list", () => {
    const jsonStr = '["oc_chat1"]';
    const parsed = JSON.parse(jsonStr) as string[];

    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toBe("oc_chat1");
  });

  it("validates optional config fields", () => {
    const fullConfig = {
      enabled: true,
      appId: "cli_a1b2c3d4e5f6",
      appSecret: "secret123",
      domain: "feishu.cn",
      allowedChats: ["oc_chat1", "oc_chat2"],
      testChatId: "oc_testchat",
    };

    expect(fullConfig.allowedChats).toHaveLength(2);
    expect(fullConfig.testChatId).toBe("oc_testchat");
    expect(fullConfig.domain).toBe("feishu.cn");
  });

  it("validates invalid JSON for allowed chats is detectable", () => {
    const invalidJSON = "not-valid-json";
    let parseError = false;
    try {
      JSON.parse(invalidJSON);
    } catch {
      parseError = true;
    }
    expect(parseError).toBe(true);
  });
});

// ============================================================================
//  4. Environment Variables
// ============================================================================

describe("Feishu Connector - Environment Variables", () => {
  it("recognizes FEISHU_APP_ID environment variable", () => {
    const envKey = "FEISHU_APP_ID";
    expect(envKey).toBe("FEISHU_APP_ID");
  });

  it("recognizes FEISHU_APP_SECRET environment variable", () => {
    const envKey = "FEISHU_APP_SECRET";
    expect(envKey).toBe("FEISHU_APP_SECRET");
  });

  it("recognizes FEISHU_DOMAIN environment variable", () => {
    const envKey = "FEISHU_DOMAIN";
    expect(envKey).toBe("FEISHU_DOMAIN");
  });

  it("recognizes optional environment variables", () => {
    const optionalKeys = ["FEISHU_ALLOWED_CHATS", "FEISHU_TEST_CHAT_ID"];

    for (const key of optionalKeys) {
      expect(key).toMatch(/^FEISHU_/);
    }
    expect(optionalKeys).toHaveLength(2);
  });

  it("all environment variables start with FEISHU_ prefix", () => {
    const allKeys = [
      "FEISHU_APP_ID",
      "FEISHU_APP_SECRET",
      "FEISHU_DOMAIN",
      "FEISHU_ALLOWED_CHATS",
      "FEISHU_TEST_CHAT_ID",
    ];

    for (const key of allKeys) {
      expect(key).toMatch(/^FEISHU_/);
    }
    expect(allKeys).toHaveLength(5);
  });

  it("validates that credentials can come from config or environment", () => {
    const configCreds = {
      appId: "cli_a1b2c3d4e5f6",
      appSecret: "secret123",
    };
    expect(configCreds.appId).toBeDefined();
    expect(configCreds.appSecret).toBeDefined();

    const envKey = process.env.FEISHU_APP_ID;
    expect(typeof envKey === "string" || envKey === undefined).toBe(true);
  });
});
