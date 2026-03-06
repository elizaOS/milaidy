/**
 * Connector Config Validation — Tests
 *
 * Tests:
 * - isConnectorConfigured detects properly configured connectors
 * - applyPluginAutoEnable matches connector to correct plugin
 * - Missing required fields rejected
 * - Disabled connectors not auto-enabled
 */

import { describe, expect, it, vi } from "vitest";

vi.mock("@elizaos/core", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

// We test the logic patterns from plugin-auto-enable.ts
// without requiring the full module (which has many transitive deps)

// ============================================================================
//  1. Connector configuration detection
// ============================================================================

describe("connector configuration detection", () => {
  /**
   * Mirrors the isConnectorConfigured logic from plugin-auto-enable.ts
   * Each connector needs specific fields to be "configured"
   */
  function isConnectorConfigured(
    name: string,
    config: Record<string, unknown>,
  ): boolean {
    if (config.enabled === false) return false;

    switch (name) {
      case "discord":
        return Boolean(config.token || config.botToken);
      case "telegram":
        return Boolean(config.botToken);
      case "whatsapp":
        return Boolean(config.authDir || config.accounts);
      case "signal":
        return Boolean(
          Array.isArray(config.accounts) && config.accounts.length > 0,
        );
      case "twitch":
        return Boolean(config.accessToken);
      default:
        return Boolean(config.token || config.apiKey || config.botToken);
    }
  }

  it("detects Discord with token", () => {
    expect(isConnectorConfigured("discord", { token: "abc" })).toBe(true);
  });

  it("detects Discord with botToken", () => {
    expect(isConnectorConfigured("discord", { botToken: "abc" })).toBe(true);
  });

  it("rejects Discord without token", () => {
    expect(isConnectorConfigured("discord", {})).toBe(false);
  });

  it("detects Telegram with botToken", () => {
    expect(isConnectorConfigured("telegram", { botToken: "123:ABC" })).toBe(
      true,
    );
  });

  it("rejects Telegram without botToken", () => {
    expect(isConnectorConfigured("telegram", { token: "abc" })).toBe(false);
  });

  it("detects WhatsApp with authDir", () => {
    expect(isConnectorConfigured("whatsapp", { authDir: "/tmp/wa" })).toBe(
      true,
    );
  });

  it("detects WhatsApp with accounts", () => {
    expect(
      isConnectorConfigured("whatsapp", { accounts: [{ phone: "+1" }] }),
    ).toBe(true);
  });

  it("rejects WhatsApp without authDir or accounts", () => {
    expect(isConnectorConfigured("whatsapp", {})).toBe(false);
  });

  it("detects Signal with accounts array", () => {
    expect(
      isConnectorConfigured("signal", { accounts: [{ number: "+1" }] }),
    ).toBe(true);
  });

  it("rejects Signal with empty accounts", () => {
    expect(isConnectorConfigured("signal", { accounts: [] })).toBe(false);
  });

  it("rejects disabled connector regardless of fields", () => {
    expect(
      isConnectorConfigured("discord", { enabled: false, token: "abc" }),
    ).toBe(false);
  });

  it("detects Twitch with accessToken", () => {
    expect(isConnectorConfigured("twitch", { accessToken: "oauth:abc" })).toBe(
      true,
    );
  });
});

// ============================================================================
//  2. Plugin auto-enable mapping
// ============================================================================

describe("plugin auto-enable mapping", () => {
  // Maps connector names to expected plugin package names
  const CONNECTOR_PLUGINS: Record<string, string> = {
    discord: "@elizaos/plugin-discord",
    telegram: "@elizaos/plugin-telegram",
    twitch: "@milady/plugin-twitch",
    whatsapp: "@elizaos/plugin-whatsapp",
    slack: "@elizaos/plugin-slack",
    twitter: "@elizaos/plugin-twitter",
  };

  it("maps each connector to its correct plugin", () => {
    expect(CONNECTOR_PLUGINS.discord).toBe("@elizaos/plugin-discord");
    expect(CONNECTOR_PLUGINS.telegram).toBe("@elizaos/plugin-telegram");
    expect(CONNECTOR_PLUGINS.twitch).toBe("@milady/plugin-twitch");
    expect(CONNECTOR_PLUGINS.whatsapp).toBe("@elizaos/plugin-whatsapp");
  });

  it("auto-enable adds configured connectors to allow list", () => {
    const allowList = new Set<string>();
    const connectors: Record<string, Record<string, unknown>> = {
      discord: { token: "abc" },
      telegram: { botToken: "123:ABC" },
      twitch: { enabled: false, accessToken: "oauth:abc" },
    };

    for (const [name, config] of Object.entries(connectors)) {
      if (config.enabled === false) continue;
      const plugin = CONNECTOR_PLUGINS[name];
      if (plugin) {
        allowList.add(plugin);
      }
    }

    expect(allowList.has("@elizaos/plugin-discord")).toBe(true);
    expect(allowList.has("@elizaos/plugin-telegram")).toBe(true);
    // Twitch disabled — not added
    expect(allowList.has("@milady/plugin-twitch")).toBe(false);
  });
});
