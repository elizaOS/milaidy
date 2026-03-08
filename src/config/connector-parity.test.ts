import { describe, expect, it, vi } from "vitest";

// Mock all static plugin star-imports in eliza.ts to avoid ESM resolution
// failure: @elizaos/plugin-ollama imports MAX_EMBEDDING_TOKENS which Vitest
// cannot resolve from @elizaos/core at static-analysis time.
vi.mock("@elizaos/plugin-agent-orchestrator", () => ({ default: {} }));
vi.mock("@elizaos/plugin-agent-skills", () => ({ default: {} }));
vi.mock("@elizaos/plugin-anthropic", () => ({ default: {} }));
vi.mock("@elizaos/plugin-browser", () => ({ default: {} }));
vi.mock("@elizaos/plugin-cli", () => ({ default: {} }));
vi.mock("@elizaos/plugin-coding-agent", () => ({ default: {} }));
vi.mock("@elizaos/plugin-computeruse", () => ({ default: {} }));
vi.mock("@elizaos/plugin-cron", () => ({ default: {} }));
vi.mock("@elizaos/plugin-discord", () => ({ default: {} }));
vi.mock("@elizaos/plugin-edge-tts", () => ({ default: {} }));
vi.mock("@elizaos/plugin-elevenlabs", () => ({ default: {} }));
vi.mock("@elizaos/plugin-elizacloud", () => ({ default: {} }));
vi.mock("@elizaos/plugin-experience", () => ({ default: {} }));
vi.mock("@elizaos/plugin-form", () => ({ default: {} }));
vi.mock("@elizaos/plugin-google-genai", () => ({ default: {} }));
vi.mock("@elizaos/plugin-groq", () => ({ default: {} }));
vi.mock("@elizaos/plugin-knowledge", () => ({ default: {} }));
vi.mock("@elizaos/plugin-local-embedding", () => ({ default: {} }));
vi.mock("@elizaos/plugin-ollama", () => ({ default: {} }));
vi.mock("@elizaos/plugin-openai", () => ({ default: {} }));
vi.mock("@elizaos/plugin-openrouter", () => ({ default: {} }));
vi.mock("@elizaos/plugin-pdf", () => ({ default: {} }));
vi.mock("@elizaos/plugin-personality", () => ({ default: {} }));
vi.mock("@elizaos/plugin-plugin-manager", () => ({ default: {} }));
vi.mock("@elizaos/plugin-rolodex", () => ({ default: {} }));
vi.mock("@elizaos/plugin-secrets-manager", () => ({ default: {} }));
vi.mock("@elizaos/plugin-shell", () => ({ default: {} }));
vi.mock("@elizaos/plugin-sql", () => ({ default: {} }));
vi.mock("@elizaos/plugin-telegram", () => ({ default: {} }));
vi.mock("@elizaos/plugin-todo", () => ({ default: {} }));
vi.mock("@elizaos/plugin-trajectory-logger", () => ({ default: {} }));
vi.mock("@elizaos/plugin-trust", () => ({ default: {} }));
vi.mock("@elizaos/plugin-twitch", () => ({ default: {} }));

import { CHANNEL_PLUGIN_MAP } from "../runtime/eliza";
import {
  applyPluginAutoEnable,
  CONNECTOR_PLUGINS,
  isConnectorConfigured,
} from "./plugin-auto-enable";
import { CONNECTOR_IDS } from "./schema";

function sorted(values: Iterable<string>): string[] {
  return [...values].sort();
}

describe("connector map parity", () => {
  it("keeps connector IDs aligned across schema, runtime, and auto-enable", () => {
    const autoEnableIds = sorted(Object.keys(CONNECTOR_PLUGINS));
    const runtimeIds = sorted(Object.keys(CHANNEL_PLUGIN_MAP));
    const schemaIds = sorted(CONNECTOR_IDS);

    expect(runtimeIds).toEqual(autoEnableIds);
    expect(schemaIds).toEqual(autoEnableIds);
  });

  it("keeps runtime and auto-enable package mappings aligned", () => {
    for (const [connectorId, pluginName] of Object.entries(CONNECTOR_PLUGINS)) {
      expect(CHANNEL_PLUGIN_MAP[connectorId]).toBe(pluginName);
    }
  });

  it("keeps runtime-to-auto-enable package mappings aligned (reverse)", () => {
    for (const [connectorId, pluginName] of Object.entries(
      CHANNEL_PLUGIN_MAP,
    )) {
      expect(CONNECTOR_PLUGINS[connectorId]).toBe(pluginName);
    }
  });

  it("has no duplicate IDs in the CONNECTOR_IDS schema array", () => {
    const unique = new Set(CONNECTOR_IDS);
    expect(unique.size).toBe(CONNECTOR_IDS.length);
  });

  it("has identical count across all three maps", () => {
    expect(CONNECTOR_IDS).toHaveLength(19);
    expect(Object.keys(CONNECTOR_PLUGINS)).toHaveLength(19);
    expect(Object.keys(CHANNEL_PLUGIN_MAP)).toHaveLength(19);
  });

  it("uses valid package name prefixes for all plugin mappings", () => {
    const validPrefix = /^@(elizaos|milady)\//;
    for (const pkg of Object.values(CONNECTOR_PLUGINS)) {
      expect(pkg).toMatch(validPrefix);
    }
    for (const pkg of Object.values(CHANNEL_PLUGIN_MAP)) {
      expect(pkg).toMatch(validPrefix);
    }
  });
});

// ── Runtime behaviour parity ────────────────────────────────────────────────
// Ensures isConnectorConfigured and applyPluginAutoEnable actually work for
// every connector in the map, not just the ones with dedicated unit tests.

/**
 * Minimal credential configs that satisfy isConnectorConfigured for each
 * connector. Connectors with connector-specific detection logic are given
 * their specific fields; others use the generic botToken/token/apiKey path.
 */
const CONNECTOR_CREDS: Record<string, Record<string, unknown>> = {
  telegram: { botToken: "123:ABC" },
  discord: { botToken: "discord-token" },
  slack: { token: "xoxb-slack" },
  twitter: { apiKey: "tw-key" },
  whatsapp: { authDir: "./auth/whatsapp" },
  signal: { account: "+15551234567" },
  bluebubbles: { serverUrl: "http://localhost:1234", password: "pw" },
  imessage: { cliPath: "/usr/local/bin/imessage" },
  farcaster: { apiKey: "fc-key" },
  lens: { apiKey: "lens-key" },
  msteams: { botToken: "teams-token" },
  mattermost: { token: "mm-token" },
  googlechat: { token: "gc-token" },
  feishu: { token: "fs-token" },
  matrix: { token: "matrix-token" },
  nostr: { apiKey: "nostr-key" },
  retake: { accessToken: "rtk-token" },
  blooio: { apiKey: "blk-key" },
  twitch: { accessToken: "twitch-token" },
};

describe("connector runtime parity", () => {
  it("has credential fixtures for every CONNECTOR_ID", () => {
    for (const id of CONNECTOR_IDS) {
      expect(CONNECTOR_CREDS[id]).toBeDefined();
    }
  });

  it.each([
    ...CONNECTOR_IDS,
  ])("isConnectorConfigured recognises %s with valid credentials", (connectorId) => {
    expect(
      isConnectorConfigured(connectorId, CONNECTOR_CREDS[connectorId]),
    ).toBe(true);
  });

  it.each([
    ...CONNECTOR_IDS,
  ])("isConnectorConfigured rejects %s with empty config", (connectorId) => {
    expect(isConnectorConfigured(connectorId, {})).toBe(false);
  });

  it.each([
    ...CONNECTOR_IDS,
  ])("isConnectorConfigured rejects %s when explicitly disabled", (connectorId) => {
    expect(
      isConnectorConfigured(connectorId, {
        ...CONNECTOR_CREDS[connectorId],
        enabled: false,
      }),
    ).toBe(false);
  });

  it("applyPluginAutoEnable enables all 19 connectors when configured", () => {
    const connectors: Record<string, Record<string, unknown>> = {};
    for (const id of CONNECTOR_IDS) {
      connectors[id] = CONNECTOR_CREDS[id];
    }
    const { config, changes } = applyPluginAutoEnable({
      config: { plugins: {}, connectors },
      env: {},
    });
    const allow = config.plugins?.allow ?? [];
    for (const id of CONNECTOR_IDS) {
      expect(allow).toContain(id);
    }
    expect(changes).toHaveLength(19);
  });
});
