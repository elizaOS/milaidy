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

  it("event types use im. namespace prefix", () => {
    const eventTypes = [
      "im.message.receive_v1",
      "im.message.message_read_v1",
      "im.chat.member.bot.added_v1",
      "im.chat.member.bot.deleted_v1",
    ];

    for (const eventType of eventTypes) {
      expect(eventType).toMatch(/^im\./);
    }
  });
});

// ============================================================================
//  3. Configuration
// ============================================================================

describe("Feishu Connector - Configuration", () => {
  it("parses allowed chats from JSON array string", () => {
    const jsonStr = '["oc_chat1","oc_chat2"]';
    const parsed = JSON.parse(jsonStr) as string[];

    expect(parsed).toHaveLength(2);
    expect(parsed).toContain("oc_chat1");
    expect(parsed).toContain("oc_chat2");
  });

  it("detects invalid JSON for allowed chats", () => {
    const invalidJSON = "not-valid-json";
    expect(() => JSON.parse(invalidJSON)).toThrow();
  });
});
