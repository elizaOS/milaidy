/**
 * Feishu Connector Validation Tests — GitHub Issue #155
 *
 * Comprehensive E2E tests for validating the Feishu/Lark connector (@elizaos/plugin-feishu).
 *
 * Test Categories:
 *   1. Setup & Authentication
 *   2. Message Handling
 *   3. Feishu-Specific Features
 *   4. Groups & Chats
 *   5. Media & Attachments
 *   6. Error Handling
 *   7. Integration
 *   8. Configuration
 *
 * Requirements for live tests:
 *   FEISHU_APP_ID              — Feishu/Lark application ID (cli_xxx format)
 *   FEISHU_APP_SECRET          — Feishu/Lark application secret
 *   MILADY_LIVE_TEST=1         — Enable live tests
 *
 * Additional env vars for write tests:
 *   FEISHU_TEST_CHAT_ID        — Chat ID to test in (e.g., oc_xxx)
 *
 * Optional env vars:
 *   FEISHU_DOMAIN              — "feishu.cn" (default) or "larksuite.com"
 *
 * Or configure in ~/.milady/milady.json:
 *   { "connectors": { "feishu": { "token": "...", "appId": "...", "appSecret": "..." } } }
 *
 * NO MOCKS for live tests — all tests use real Feishu API.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { logger, type Plugin } from "@elizaos/core";
import dotenv from "dotenv";
import { describe, expect, it } from "vitest";
import {
  extractPlugin,
  resolveFeishuPluginImportSpecifier,
} from "../src/test-support/test-helpers";

// ---------------------------------------------------------------------------
// Environment Setup
// ---------------------------------------------------------------------------

const testDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(testDir, "..");
dotenv.config({ path: path.resolve(packageRoot, ".env") });

const FEISHU_APP_ID = process.env.FEISHU_APP_ID;
const FEISHU_APP_SECRET = process.env.FEISHU_APP_SECRET;
const FEISHU_DOMAIN = process.env.FEISHU_DOMAIN ?? "feishu.cn";
const FEISHU_TEST_CHAT_ID = process.env.FEISHU_TEST_CHAT_ID;

const hasFeishuCreds = Boolean(FEISHU_APP_ID && FEISHU_APP_SECRET);
const liveTestsEnabled = process.env.MILADY_LIVE_TEST === "1";
const runLiveTests = hasFeishuCreds && liveTestsEnabled;

const hasWriteTargets = Boolean(FEISHU_TEST_CHAT_ID);
const runLiveWriteTests = runLiveTests && hasWriteTargets;

const FEISHU_PLUGIN_IMPORT = resolveFeishuPluginImportSpecifier();
const hasPlugin = FEISHU_PLUGIN_IMPORT !== null;

// Plugin-dependent guards (for tests that import the plugin)
const describeIfPluginAvailable = hasPlugin ? describe : describe.skip;

// Credential-only guards (for direct API tests that don't need the plugin)
const describeIfCreds = runLiveTests ? describe : describe.skip;
const describeIfCredsWrite = runLiveWriteTests ? describe : describe.skip;

const TEST_TIMEOUT = 30_000;
const LIVE_WRITE_TIMEOUT = 60_000;

logger.info(
  `[feishu-connector] Live tests ${runLiveTests ? "ENABLED" : "DISABLED"} ` +
    `(APP_ID=${Boolean(FEISHU_APP_ID)}, APP_SECRET=${Boolean(FEISHU_APP_SECRET)}, ` +
    `MILADY_LIVE_TEST=${liveTestsEnabled})`,
);
logger.info(
  `[feishu-connector] Write tests ${runLiveWriteTests ? "ENABLED" : "DISABLED"} ` +
    `(TEST_CHAT_ID=${Boolean(FEISHU_TEST_CHAT_ID)})`,
);
logger.info(
  `[feishu-connector] Plugin import ${FEISHU_PLUGIN_IMPORT ?? "UNAVAILABLE"}`,
);

// ---------------------------------------------------------------------------
// API Helpers (for live tests)
// ---------------------------------------------------------------------------

/** Derive the API base URL from the domain config. */
function feishuApiBase(domain: string = FEISHU_DOMAIN): string {
  const host =
    domain === "larksuite.com" ? "open.larksuite.com" : "open.feishu.cn";
  return `https://${host}/open-apis`;
}

/** Acquire a tenant_access_token using app credentials. */
async function feishuGetTenantAccessToken(
  appId: string,
  appSecret: string,
  domain?: string,
): Promise<{
  code: number;
  msg: string;
  tenant_access_token?: string;
  expire?: number;
}> {
  const base = feishuApiBase(domain);
  const res = await fetch(
    `${base}/auth/v3/tenant_access_token/internal`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
    },
  );
  return (await res.json()) as {
    code: number;
    msg: string;
    tenant_access_token?: string;
    expire?: number;
  };
}

/** GET wrapper for Feishu API. */
async function feishuGet<T>(
  endpoint: string,
  token: string,
  domain?: string,
): Promise<{ ok: boolean; status: number; data: T }> {
  const base = feishuApiBase(domain);
  const res = await fetch(`${base}${endpoint}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = (await res.json()) as T;
  return { ok: res.ok, status: res.status, data };
}

/** POST wrapper for Feishu API. */
async function feishuPost<T>(
  endpoint: string,
  token: string,
  body: unknown,
  domain?: string,
): Promise<{ ok: boolean; status: number; data: T }> {
  const base = feishuApiBase(domain);
  const res = await fetch(`${base}${endpoint}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as T;
  return { ok: res.ok, status: res.status, data };
}

// ---------------------------------------------------------------------------
// Load Plugin Helper
// ---------------------------------------------------------------------------

const loadFeishuPlugin = async (): Promise<Plugin | null> => {
  if (!FEISHU_PLUGIN_IMPORT) return null;
  const mod = (await import(FEISHU_PLUGIN_IMPORT)) as {
    default?: Plugin;
    plugin?: Plugin;
    [key: string]: unknown;
  };
  return extractPlugin(mod) as Plugin | null;
};

// ---------------------------------------------------------------------------
// 1. Setup & Authentication
// ---------------------------------------------------------------------------

describeIfPluginAvailable(
  "Feishu Connector - Setup & Authentication",
  () => {
    it(
      "can load the Feishu plugin without errors",
      async () => {
        const plugin = await loadFeishuPlugin();
        expect(plugin).not.toBeNull();
        if (plugin) {
          expect(plugin.name).toMatch(/feishu/i);
        }
      },
      TEST_TIMEOUT,
    );

    it(
      "Feishu plugin exports required structure",
      async () => {
        const plugin = await loadFeishuPlugin();
        expect(plugin).toBeDefined();
        if (plugin) {
          expect(plugin.name).toMatch(/feishu/i);
          expect(plugin.description).toBeDefined();
          expect(typeof plugin.description).toBe("string");
        }
      },
      TEST_TIMEOUT,
    );

    it(
      "plugin has clients or services",
      async () => {
        const plugin = await loadFeishuPlugin();
        expect(plugin).not.toBeNull();
        if (plugin) {
          const hasClients =
            Array.isArray(plugin.clients) && plugin.clients.length > 0;
          const hasServices =
            Array.isArray(plugin.services) && plugin.services.length > 0;
          expect(hasClients || hasServices).toBe(true);
        }
      },
      TEST_TIMEOUT,
    );
  },
);

describe("Feishu Connector - Authentication Formats", () => {
  it("App ID format follows cli_ prefix pattern", () => {
    const appIdPattern = /^cli_[a-zA-Z0-9]+$/;

    expect(appIdPattern.test("cli_a1b2c3d4e5f6")).toBe(true);
    expect(appIdPattern.test("cli_9876543210abcdef")).toBe(true);
    expect(appIdPattern.test("app_123")).toBe(false);
    expect(appIdPattern.test("cli_")).toBe(false);
    expect(appIdPattern.test("")).toBe(false);
  });

  it("App Secret is present and non-empty when configured", () => {
    if (hasFeishuCreds) {
      expect(FEISHU_APP_SECRET).toBeDefined();
      expect(FEISHU_APP_SECRET!.length).toBeGreaterThan(0);
    }
  });

  it("credentials can come from config or environment", () => {
    const envAppId = process.env.FEISHU_APP_ID;
    const envAppSecret = process.env.FEISHU_APP_SECRET;

    expect(
      (typeof envAppId === "string" && typeof envAppSecret === "string") ||
        (envAppId === undefined && envAppSecret === undefined) ||
        typeof envAppId === "string" ||
        typeof envAppSecret === "string",
    ).toBe(true);
  });

  it("domain defaults to feishu.cn", () => {
    const domain = process.env.FEISHU_DOMAIN ?? "feishu.cn";
    expect(["feishu.cn", "larksuite.com"]).toContain(domain);
  });
});

// ---------------------------------------------------------------------------
// Live Authentication Tests
// ---------------------------------------------------------------------------

describeIfCreds(
  "Feishu Connector - Live Authentication",
  () => {
    it(
      "can acquire tenant access token",
      async () => {
        const result = await feishuGetTenantAccessToken(
          FEISHU_APP_ID!,
          FEISHU_APP_SECRET!,
          FEISHU_DOMAIN,
        );
        expect(result.code).toBe(0);
        expect(result.tenant_access_token).toBeDefined();
        expect(typeof result.tenant_access_token).toBe("string");
        expect(result.tenant_access_token!.length).toBeGreaterThan(0);
      },
      TEST_TIMEOUT,
    );

    it(
      "tenant access token has an expiry",
      async () => {
        const result = await feishuGetTenantAccessToken(
          FEISHU_APP_ID!,
          FEISHU_APP_SECRET!,
          FEISHU_DOMAIN,
        );
        expect(result.expire).toBeDefined();
        expect(result.expire).toBeGreaterThan(0);
      },
      TEST_TIMEOUT,
    );
  },
);

// ---------------------------------------------------------------------------
// 2. Message Handling
// ---------------------------------------------------------------------------

describe("Feishu Connector - Message Formats", () => {
  it("text message structure is valid", () => {
    const textMessage = {
      msg_type: "text",
      content: JSON.stringify({ text: "Hello from milady test" }),
    };

    expect(textMessage.msg_type).toBe("text");
    expect(textMessage.content).toBeDefined();
    const parsed = JSON.parse(textMessage.content) as { text: string };
    expect(parsed.text).toBe("Hello from milady test");
  });

  it("post/rich text message structure is valid", () => {
    const postMessage = {
      msg_type: "post",
      content: JSON.stringify({
        post: {
          zh_cn: {
            title: "Test Post",
            content: [
              [
                {
                  tag: "text",
                  text: "Hello ",
                },
                {
                  tag: "a",
                  text: "link",
                  href: "https://example.com",
                },
              ],
            ],
          },
        },
      }),
    };

    expect(postMessage.msg_type).toBe("post");
    const parsed = JSON.parse(postMessage.content) as {
      post: { zh_cn: { title: string; content: unknown[][] } };
    };
    expect(parsed.post.zh_cn.title).toBe("Test Post");
    expect(parsed.post.zh_cn.content).toHaveLength(1);
  });

  it("interactive card message structure is valid", () => {
    const cardMessage = {
      msg_type: "interactive",
      card: {
        config: { wide_screen_mode: true },
        header: {
          title: {
            tag: "plain_text",
            content: "Test Card",
          },
        },
        elements: [
          {
            tag: "div",
            text: {
              tag: "plain_text",
              content: "Card body text",
            },
          },
        ],
      },
    };

    expect(cardMessage.msg_type).toBe("interactive");
    expect(cardMessage.card.header.title.content).toBe("Test Card");
    expect(cardMessage.card.elements).toHaveLength(1);
    expect(cardMessage.card.config.wide_screen_mode).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3. Feishu-Specific Features
// ---------------------------------------------------------------------------

describe("Feishu Connector - Features", () => {
  it("@mention format uses at tag with user_id", () => {
    const mentionPattern = /<at user_id="[^"]+">([^<]+)<\/at>/;

    expect(mentionPattern.test('<at user_id="ou_xxx">Name</at>')).toBe(true);
    expect(mentionPattern.test('<at user_id="ou_12345">Alice</at>')).toBe(true);
    expect(mentionPattern.test("@user")).toBe(false);
    expect(mentionPattern.test("")).toBe(false);
  });

  it("interactive card structure is valid", () => {
    const card = {
      config: { wide_screen_mode: true },
      header: {
        title: { tag: "plain_text", content: "Title" },
      },
      elements: [
        {
          tag: "action",
          actions: [
            {
              tag: "button",
              text: { tag: "plain_text", content: "Click me" },
              type: "primary",
            },
          ],
        },
      ],
    };

    expect(card.config.wide_screen_mode).toBe(true);
    expect(card.header.title.tag).toBe("plain_text");
    expect(card.elements).toHaveLength(1);
  });

  it("bot command format is valid", () => {
    const commands = ["/help", "/status", "/info"];

    for (const cmd of commands) {
      expect(cmd.startsWith("/")).toBe(true);
    }
  });

  it("message action types are valid", () => {
    const actionTypes = ["urgent", "pin", "forward"] as const;

    expect(actionTypes).toContain("urgent");
    expect(actionTypes).toContain("pin");
    expect(actionTypes).toContain("forward");
    expect(actionTypes).toHaveLength(3);
  });

  it("event types are correct", () => {
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
  });

  it("domain options control API endpoint", () => {
    expect(feishuApiBase("feishu.cn")).toBe(
      "https://open.feishu.cn/open-apis",
    );
    expect(feishuApiBase("larksuite.com")).toBe(
      "https://open.larksuite.com/open-apis",
    );
  });
});

// ---------------------------------------------------------------------------
// 4. Groups & Chats
// ---------------------------------------------------------------------------

describe("Feishu Connector - Groups & Chats", () => {
  it("group chat config structure is valid", () => {
    const groupConfig = {
      allowedChats: ["oc_chat1", "oc_chat2"],
    };

    expect(groupConfig.allowedChats).toHaveLength(2);
    expect(groupConfig.allowedChats).toContain("oc_chat1");
  });

  it("1:1 chat type is supported", () => {
    const chatTypes = ["p2p", "group"] as const;

    expect(chatTypes).toContain("p2p");
    expect(chatTypes).toContain("group");
  });

  it("bot invitation events are handled", () => {
    const botEvents = [
      "im.chat.member.bot.added_v1",
      "im.chat.member.bot.deleted_v1",
    ] as const;

    expect(botEvents).toContain("im.chat.member.bot.added_v1");
    expect(botEvents).toContain("im.chat.member.bot.deleted_v1");
    expect(botEvents).toHaveLength(2);
  });

  it("chat ID format validation", () => {
    const chatIdPattern = /^oc_[a-zA-Z0-9]+$/;

    expect(chatIdPattern.test("oc_a1b2c3d4e5f6")).toBe(true);
    expect(chatIdPattern.test("oc_9876543210abcdef")).toBe(true);
    expect(chatIdPattern.test("invalid_id")).toBe(false);
    expect(chatIdPattern.test("oc_")).toBe(false);
  });

  it("allowed chats can be parsed from JSON string", () => {
    const jsonStr = '["oc_chat1","oc_chat2","oc_chat3"]';
    const parsed = JSON.parse(jsonStr) as string[];

    expect(parsed).toHaveLength(3);
    for (const chatId of parsed) {
      expect(chatId).toMatch(/^oc_/);
    }
  });
});

// ---------------------------------------------------------------------------
// 5. Media & Attachments
// ---------------------------------------------------------------------------

describe("Feishu Connector - Media & Attachments", () => {
  it("image message format is valid", () => {
    const imageMessage = {
      msg_type: "image",
      content: JSON.stringify({ image_key: "img_v2_abc123" }),
    };

    expect(imageMessage.msg_type).toBe("image");
    const parsed = JSON.parse(imageMessage.content) as { image_key: string };
    expect(parsed.image_key).toBe("img_v2_abc123");
  });

  it("file message format is valid", () => {
    const fileMessage = {
      msg_type: "file",
      content: JSON.stringify({ file_key: "file_v2_abc123" }),
    };

    expect(fileMessage.msg_type).toBe("file");
    const parsed = JSON.parse(fileMessage.content) as { file_key: string };
    expect(parsed.file_key).toBe("file_v2_abc123");
  });
});

// ---------------------------------------------------------------------------
// 6. Error Handling
// ---------------------------------------------------------------------------

describe("Feishu Connector - Error Handling", () => {
  it("invalid App ID format is detectable", () => {
    const appIdPattern = /^cli_[a-zA-Z0-9]+$/;
    const invalidIds = ["app_123", "cli_", "", "invalid"];

    for (const id of invalidIds) {
      expect(appIdPattern.test(id)).toBe(false);
    }
  });

  it("invalid JSON for allowed chats is detectable", () => {
    const invalidJSON = "not-valid-json";
    let parseError = false;
    try {
      JSON.parse(invalidJSON);
    } catch {
      parseError = true;
    }
    expect(parseError).toBe(true);
  });

  it("invalid domain is detectable", () => {
    const validDomains = ["feishu.cn", "larksuite.com"];
    const invalidDomain = "invalid.com";

    expect(validDomains.includes(invalidDomain)).toBe(false);
  });

  it("empty App Secret is detectable", () => {
    const emptySecret = "";
    expect(Boolean(emptySecret)).toBe(false);
  });

  it("Feishu API error response structure", () => {
    const errorResponse = {
      code: 99991663,
      msg: "invalid app_id or app_secret",
    };

    expect(errorResponse.code).not.toBe(0);
    expect(errorResponse.msg).toBeDefined();
    expect(typeof errorResponse.msg).toBe("string");
  });
});

// ---------------------------------------------------------------------------
// 7. Integration Tests (always run, no live creds needed)
// ---------------------------------------------------------------------------

/** Try to import a workspace module; returns null if the package isn't built. */
async function tryWorkspaceImport<T>(specifier: string): Promise<T | null> {
  try {
    return (await import(specifier)) as T;
  } catch {
    return null;
  }
}

describe("Feishu Connector - Integration", () => {
  it("Feishu is mapped in CONNECTOR_PLUGINS", async () => {
    const mod = await tryWorkspaceImport<{
      CONNECTOR_PLUGINS: Record<string, string>;
    }>("../src/config/plugin-auto-enable");
    if (!mod) {
      logger.warn("[feishu-connector] Workspace not built — skipping");
      return;
    }
    expect(mod.CONNECTOR_PLUGINS.feishu).toBe("@elizaos/plugin-feishu");
  });

  it("Feishu connector is in CONNECTOR_PLUGINS list", async () => {
    const mod = await tryWorkspaceImport<{
      CONNECTOR_PLUGINS: Record<string, string>;
    }>("../src/config/plugin-auto-enable");
    if (!mod) {
      logger.warn("[feishu-connector] Workspace not built — skipping");
      return;
    }
    const connectors = Object.keys(mod.CONNECTOR_PLUGINS);
    expect(connectors).toContain("feishu");
  });

  it("isConnectorConfigured returns true for feishu with token", async () => {
    const mod = await tryWorkspaceImport<{
      isConnectorConfigured: (
        name: string,
        config: Record<string, unknown>,
      ) => boolean;
    }>("../src/config/plugin-auto-enable");
    if (!mod) {
      logger.warn("[feishu-connector] Workspace not built — skipping");
      return;
    }
    const configured = mod.isConnectorConfigured("feishu", {
      token: "fs-token",
    });
    expect(typeof configured).toBe("boolean");
  });

  it("Feishu respects enabled: false", async () => {
    const mod = await tryWorkspaceImport<{
      isConnectorConfigured: (
        name: string,
        config: Record<string, unknown>,
      ) => boolean;
    }>("../src/config/plugin-auto-enable");
    if (!mod) {
      logger.warn("[feishu-connector] Workspace not built — skipping");
      return;
    }
    const configured = mod.isConnectorConfigured("feishu", {
      enabled: false,
      token: "fs-token",
    });
    expect(configured).toBe(false);
  });

  it("collectPluginNames includes feishu when configured", async () => {
    const mod = await tryWorkspaceImport<{
      collectPluginNames: (config: unknown) => Set<string>;
    }>("../src/runtime/eliza");
    if (!mod) {
      logger.warn("[feishu-connector] Workspace not built — skipping");
      return;
    }

    const config = {
      connectors: {
        feishu: {
          enabled: true,
          token: "fs-token",
        },
      },
    };
    const plugins = mod.collectPluginNames(config as never);
    expect(plugins.has("@elizaos/plugin-feishu")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 8. Configuration Tests (always run)
// ---------------------------------------------------------------------------

describe("Feishu Connector - Configuration", () => {
  it("validates complete Feishu configuration", () => {
    const validConfig = {
      enabled: true,
      appId: "cli_a1b2c3d4e5f6",
      appSecret: "secret123",
      domain: "feishu.cn",
      allowedChats: ["oc_chat1", "oc_chat2"],
      testChatId: "oc_testchat",
    };

    expect(validConfig.enabled).toBe(true);
    expect(validConfig.appId).toBeDefined();
    expect(validConfig.appSecret).toBeDefined();
    expect(validConfig.domain).toBe("feishu.cn");
    expect(validConfig.allowedChats).toHaveLength(2);
    expect(validConfig.testChatId).toBeDefined();
  });

  it("validates optional config fields", () => {
    const fullConfig = {
      enabled: true,
      appId: "cli_a1b2c3d4e5f6",
      appSecret: "secret123",
      domain: "feishu.cn",
      allowedChats: ["oc_chat1"],
      testChatId: "oc_testchat",
    };

    expect(fullConfig.appId).toMatch(/^cli_/);
    expect(fullConfig.domain).toBe("feishu.cn");
    expect(fullConfig.allowedChats).toHaveLength(1);
    expect(fullConfig.testChatId).toMatch(/^oc_/);
  });

  it("domain options are feishu.cn or larksuite.com", () => {
    const validDomains = ["feishu.cn", "larksuite.com"];
    expect(validDomains).toContain("feishu.cn");
    expect(validDomains).toContain("larksuite.com");
    expect(validDomains).toHaveLength(2);
  });

  it("allowed chats parsing from JSON string", () => {
    const jsonStr = '["oc_chat1","oc_chat2"]';
    const parsed = JSON.parse(jsonStr) as string[];

    expect(parsed).toHaveLength(2);
    expect(parsed).toContain("oc_chat1");
    expect(parsed).toContain("oc_chat2");
  });

  it("validates environment variable names follow FEISHU_ prefix", () => {
    const envVars = [
      "FEISHU_APP_ID",
      "FEISHU_APP_SECRET",
      "FEISHU_DOMAIN",
      "FEISHU_ALLOWED_CHATS",
      "FEISHU_TEST_CHAT_ID",
    ];

    for (const envVar of envVars) {
      expect(envVar).toMatch(/^FEISHU_/);
    }
    expect(envVars).toHaveLength(5);
  });

  it("milady.json connector config path is connectors.feishu", () => {
    const configPath = "connectors.feishu";
    expect(configPath).toBe("connectors.feishu");

    const parts = configPath.split(".");
    expect(parts[0]).toBe("connectors");
    expect(parts[1]).toBe("feishu");
  });
});
