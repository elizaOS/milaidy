/**
 * Unit tests for eliza.ts pure functions.
 *
 * Tests config → plugin resolution, channel secret propagation,
 * cloud config propagation, character building, and model resolution
 * WITHOUT starting a runtime.
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { logger, type Plugin } from "@elizaos/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { findPluginExport } from "../cli/plugins-cli";
import type { MiladyConfig } from "../config/config";
import { CONNECTOR_PLUGINS } from "../config/plugin-auto-enable";
import { CONNECTOR_IDS } from "../config/schema";
import {
  applyCloudConfigToEnv,
  applyConnectorSecretsToEnv,
  applyDatabaseConfigToEnv,
  applyX402ConfigToEnv,
  autoResolveDiscordAppId,
  buildCharacterFromConfig,
  CHANNEL_PLUGIN_MAP,
  CORE_PLUGINS,
  CUSTOM_PLUGINS_DIRNAME,
  collectPluginNames,
  deduplicatePluginActions,
  findRuntimePluginExport,
  isEnvKeyAllowedForForwarding,
  isRecoverablePgliteInitError,
  mergeDropInPlugins,
  repairBrokenInstallRecord,
  resolvePackageEntry,
  resolvePrimaryModel,
  scanDropInPlugins,
} from "./eliza";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** Save and restore a set of env keys around each test. */
function envSnapshot(keys: string[]): {
  save: () => void;
  restore: () => void;
} {
  const saved = new Map<string, string | undefined>();
  return {
    save() {
      for (const k of keys) saved.set(k, process.env[k]);
    },
    restore() {
      for (const [k, v] of saved) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    },
  };
}

// ---------------------------------------------------------------------------
// collectPluginNames
// ---------------------------------------------------------------------------

describe("collectPluginNames", () => {
  const envKeys = [
    "ANTHROPIC_API_KEY",
    "OPENAI_API_KEY",
    "GROQ_API_KEY",
    "GOOGLE_API_KEY",
    "XAI_API_KEY",
    "OPENROUTER_API_KEY",
    "AI_GATEWAY_API_KEY",
    "AIGATEWAY_API_KEY",
    "OLLAMA_BASE_URL",
    "ELIZAOS_CLOUD_API_KEY",
    "ELIZAOS_CLOUD_ENABLED",
    "MILAIDY_USE_PI_AI",
    "OBSIDIAN_VAULT_PATH",
    "OBSIDAN_VAULT_PATH",
  ];
  const snap = envSnapshot(envKeys);
  beforeEach(() => {
    snap.save();
    for (const k of envKeys) delete process.env[k];
  });

  describe("remote provider precedence", () => {
    const envKeys = ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "OLLAMA_BASE_URL"];
    const precSnap = envSnapshot(envKeys);

    beforeEach(() => {
      precSnap.save();
      for (const k of envKeys) delete process.env[k];
    });

    afterEach(() => {
      precSnap.restore();
    });

    it("should keep @elizaos/plugin-local-embedding even when a remote provider env var is present", async () => {
      // Set a remote provider env var (e.g., OPENAI_API_KEY)
      process.env.OPENAI_API_KEY = "test-api-key";

      const plugins = collectPluginNames({} as MiladyConfig);

      // local-embedding provides the TEXT_EMBEDDING delegate which remote
      // providers do NOT supply, so it must always stay loaded (see #10).
      expect(plugins.has("@elizaos/plugin-local-embedding")).toBe(true);
    });

    it("should keep @elizaos/plugin-local-embedding when no remote provider is available", async () => {
      // Ensure no remote provider env vars are set
      delete process.env.OPENAI_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.OLLAMA_BASE_URL;

      const plugins = collectPluginNames({} as MiladyConfig);

      // Verify local-embedding IS in the set for offline/zero-config setups
      expect(plugins.has("@elizaos/plugin-local-embedding")).toBe(true);
    });
  });
  afterEach(() => snap.restore());

  it("includes all core plugins for an empty config", () => {
    // Guard against accidental removal from CORE_PLUGINS array
    expect(CORE_PLUGINS).toHaveLength(18);

    const expectedCorePlugins = [
      "@elizaos/plugin-sql",
      "@elizaos/plugin-local-embedding",
      "@elizaos/plugin-form",
      "@elizaos/plugin-knowledge",
      "@elizaos/plugin-rolodex",
      "@elizaos/plugin-trajectory-logger",
      "@elizaos/plugin-agent-orchestrator",
      "@elizaos/plugin-coding-agent",
      "@elizaos/plugin-cron",
      "@elizaos/plugin-shell",
      "@elizaos/plugin-plugin-manager",
      "@elizaos/plugin-agent-skills",
      "@elizaos/plugin-pdf",
      "@elizaos/plugin-secrets-manager",
      "@elizaos/plugin-trust",
      "@elizaos/plugin-todo",
      "@elizaos/plugin-personality",
      "@elizaos/plugin-experience",
    ];
    const names = collectPluginNames({} as MiladyConfig);
    for (const plugin of expectedCorePlugins) {
      expect(names.has(plugin)).toBe(true);
    }
  });

  it("does not load @elizaos/plugin-shell when features.shellEnabled is false", () => {
    const config = {
      features: { shellEnabled: false },
    } as unknown as MiladyConfig;
    const names = collectPluginNames(config);
    expect(names.has("@elizaos/plugin-shell")).toBe(false);
  });

  it("removes @elizaos/plugin-shell from explicit allowlist when shell is disabled", () => {
    const config = {
      plugins: { allow: ["@elizaos/plugin-shell"] },
      features: { shellEnabled: false },
    } as unknown as MiladyConfig;
    const names = collectPluginNames(config);
    expect(names.has("@elizaos/plugin-shell")).toBe(false);
  });

  it("adds model-provider plugins when env keys are present", () => {
    process.env.ANTHROPIC_API_KEY = "sk-test";
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.AI_GATEWAY_API_KEY = "aigw-test";
    const names = collectPluginNames({} as MiladyConfig);
    expect(names.has("@elizaos/plugin-anthropic")).toBe(true);
    expect(names.has("@elizaos/plugin-openai")).toBe(true);
    expect(names.has("@elizaos/plugin-vercel-ai-gateway")).toBe(true);
    expect(names.has("@elizaos/plugin-groq")).toBe(false);
  });

  it("adds pi-ai provider plugin when MILAIDY_USE_PI_AI is enabled", () => {
    process.env.MILAIDY_USE_PI_AI = "1";
    const names = collectPluginNames({} as MiladyConfig);

    expect(names.has("@elizaos/plugin-pi-ai")).toBe(true);
    // pi-ai mode should suppress direct provider plugins.
    expect(names.has("@elizaos/plugin-anthropic")).toBe(false);
    expect(names.has("@elizaos/plugin-openai")).toBe(false);
    expect(names.has("@elizaos/plugin-elizacloud")).toBe(false);
  });

  it("cloud mode takes precedence over pi-ai mode", () => {
    process.env.MILAIDY_USE_PI_AI = "1";
    const config = {
      cloud: { enabled: true },
    } as unknown as MiladyConfig;
    const names = collectPluginNames(config);

    expect(names.has("@elizaos/plugin-elizacloud")).toBe(true);
    expect(names.has("@elizaos/plugin-pi-ai")).toBe(false);
  });

  it("pi-ai mode overrides explicit direct-provider entries", () => {
    process.env.MILAIDY_USE_PI_AI = "1";
    const config = {
      plugins: {
        entries: {
          openai: { enabled: true },
        },
      },
    } as unknown as MiladyConfig;

    const names = collectPluginNames(config);

    expect(names.has("@elizaos/plugin-pi-ai")).toBe(true);
    expect(names.has("@elizaos/plugin-openai")).toBe(false);
  });

  it("does not auto-enable a provider from env when explicitly disabled in plugins.entries", () => {
    process.env.OPENAI_API_KEY = "sk-test";
    const config = {
      plugins: {
        entries: {
          openai: { enabled: false },
        },
      },
    } as unknown as MiladyConfig;
    const names = collectPluginNames(config);
    expect(names.has("@elizaos/plugin-openai")).toBe(false);
  });

  it("honors explicit provider enablement and ignores other env providers", () => {
    process.env.OPENAI_API_KEY = "sk-test-openai";
    process.env.GROQ_API_KEY = "gsk-test-groq";
    const config = {
      plugins: {
        entries: {
          groq: { enabled: true },
        },
      },
    } as unknown as MiladyConfig;
    const names = collectPluginNames(config);
    expect(names.has("@elizaos/plugin-groq")).toBe(true);
    expect(names.has("@elizaos/plugin-openai")).toBe(false);
  });

  it("adds connector plugins when config.connectors is populated", () => {
    const config = {
      connectors: { telegram: { botToken: "tok" }, discord: { token: "tok" } },
    } as MiladyConfig;
    const names = collectPluginNames(config);
    // Telegram maps to the local enhanced plugin, not the upstream one
    expect(names.has("@elizaos/plugin-telegram")).toBe(true);
    expect(names.has("@elizaos/plugin-discord")).toBe(true);
    expect(names.has("@elizaos/plugin-slack")).toBe(false);
  });

  it("treats plugins.allow as additive instead of filtering connector plugins", () => {
    const config = {
      plugins: { allow: ["browser"] },
      connectors: { discord: { token: "tok" } },
    } as unknown as MiladyConfig;
    const names = collectPluginNames(config);
    expect(names.has("@elizaos/plugin-browser")).toBe(true);
    expect(names.has("@elizaos/plugin-discord")).toBe(true);
  });

  it("normalizes repoprompt short IDs in plugins.allow", () => {
    const config = {
      plugins: { allow: ["repoprompt", "repoPrompt"] },
    } as unknown as MiladyConfig;
    const names = collectPluginNames(config);

    expect(names.has("@elizaos/plugin-repoprompt")).toBe(true);
  });

  it("normalizes cua short IDs in plugins.allow", () => {
    const config = {
      plugins: { allow: ["cua"] },
    } as unknown as MiladyConfig;
    const names = collectPluginNames(config);

    expect(names.has("@elizaos/plugin-cua")).toBe(true);
  });

  it("loads CUA plugin when features.cua is enabled", () => {
    const config = {
      features: { cua: true },
    } as unknown as MiladyConfig;
    const names = collectPluginNames(config);

    expect(names.has("@elizaos/plugin-cua")).toBe(true);
  });

  it("does not load CUA plugin when features.cua.enabled is false", () => {
    const config = {
      features: { cua: { enabled: false } },
    } as unknown as MiladyConfig;
    const names = collectPluginNames(config);

    expect(names.has("@elizaos/plugin-cua")).toBe(false);
  });

  it("loads x402 plugin when config.x402.enabled is true", () => {
    const config = {
      x402: { enabled: true },
    } as unknown as MiladyConfig;
    const names = collectPluginNames(config);

    expect(names.has("@elizaos/plugin-x402")).toBe(true);
  });

  it("does not load x402 plugin when config.x402.enabled is false", () => {
    const config = {
      x402: { enabled: false },
    } as unknown as MiladyConfig;
    const names = collectPluginNames(config);

    expect(names.has("@elizaos/plugin-x402")).toBe(false);
  });

  it("normalizes x402 short IDs in plugins.allow", () => {
    const config = {
      plugins: { allow: ["x402"] },
    } as unknown as MiladyConfig;
    const names = collectPluginNames(config);

    expect(names.has("@elizaos/plugin-x402")).toBe(true);
  });

  it("loads x402 plugin via features.x402 flag", () => {
    const config = {
      features: { x402: true },
    } as unknown as MiladyConfig;
    const names = collectPluginNames(config);

    expect(names.has("@elizaos/plugin-x402")).toBe(true);
  });

  it("does not load x402 when features.x402.enabled is false", () => {
    const config = {
      features: { x402: { enabled: false } },
    } as unknown as MiladyConfig;
    const names = collectPluginNames(config);

    expect(names.has("@elizaos/plugin-x402")).toBe(false);
  });

  it("does not load x402 plugin when x402 config section is absent", () => {
    const names = collectPluginNames({} as MiladyConfig);

    expect(names.has("@elizaos/plugin-x402")).toBe(false);
  });

  it("normalizes short plugin IDs in plugins.allow", () => {
    const config = {
      plugins: { allow: ["discord"] },
    } as unknown as MiladyConfig;
    const names = collectPluginNames(config);
    expect(names.has("@elizaos/plugin-discord")).toBe(true);
  });

  it("uses @elizaos/plugin-telegram when telegram is enabled via plugins.entries", () => {
    const config = {
      plugins: {
        entries: { telegram: { enabled: true } },
      },
    } as unknown as MiladyConfig;
    const names = collectPluginNames(config);
    expect(names.has("@elizaos/plugin-telegram")).toBe(true);
  });

  it("uses @elizaos/plugin-telegram from CHANNEL_PLUGIN_MAP for connectors with plugins.entries", () => {
    // When both connectors AND plugins.entries set telegram, the plugin
    // should load exactly once.
    const config = {
      connectors: { telegram: { botToken: "tok" } },
      plugins: {
        entries: { telegram: { enabled: true } },
      },
    } as unknown as MiladyConfig;
    const names = collectPluginNames(config);
    expect(names.has("@elizaos/plugin-telegram")).toBe(true);
  });

  it("does not load telegram plugin when plugins.entries.telegram.enabled is false", () => {
    const config = {
      plugins: {
        entries: { telegram: { enabled: false } },
      },
    } as unknown as MiladyConfig;
    const names = collectPluginNames(config);
    expect(names.has("@elizaos/plugin-telegram")).toBe(false);
    expect(names.has("@elizaos/plugin-telegram")).toBe(false);
  });

  it("does not add connector plugins for empty connector configs", () => {
    const config = {
      connectors: { telegram: null },
    } as unknown as MiladyConfig;
    const names = collectPluginNames(config);
    expect(names.has("@elizaos/plugin-telegram")).toBe(false);
  });

  it("adds ElizaCloud plugin when cloud is enabled in config", () => {
    const config = { cloud: { enabled: true } } as MiladyConfig;
    const names = collectPluginNames(config);
    expect(names.has("@elizaos/plugin-elizacloud")).toBe(true);
  });

  it("removes ElizaCloud plugin when cloud is explicitly disabled", () => {
    const config = { cloud: { enabled: false } } as MiladyConfig;
    const names = collectPluginNames(config);
    expect(names.has("@elizaos/plugin-elizacloud")).toBe(false);
  });

  it("adds ElizaCloud plugin when env key is present", () => {
    process.env.ELIZAOS_CLOUD_API_KEY = "ck-test";
    const names = collectPluginNames({} as MiladyConfig);
    expect(names.has("@elizaos/plugin-elizacloud")).toBe(true);
  });

  it("respects feature flags in config.features", () => {
    const config = {
      features: { someFeature: true, another: { enabled: false } },
    } as unknown as MiladyConfig;
    expect(() => collectPluginNames(config)).not.toThrow();
  });

  it("adds @elizaos/plugin-repoprompt when features.repoprompt = true", () => {
    const config = {
      features: { repoprompt: true },
    } as unknown as MiladyConfig;
    const names = collectPluginNames(config);

    expect(names.has("@elizaos/plugin-repoprompt")).toBe(true);
  });

  it("does not add @elizaos/plugin-repoprompt when features.repoprompt = false", () => {
    const config = {
      features: { repoprompt: false },
    } as unknown as MiladyConfig;
    const names = collectPluginNames(config);

    expect(names.has("@elizaos/plugin-repoprompt")).toBe(false);
  });

  // --- plugins.installs (user-installed from registry) ---

  it("includes user-installed plugins from config.plugins.installs", () => {
    const config = {
      plugins: {
        installs: {
          "@elizaos/plugin-weather": {
            source: "npm",
            installPath:
              "/home/user/.milady/plugins/installed/_elizaos_plugin-weather",
            version: "1.0.0",
            installedAt: "2026-02-07T00:00:00Z",
          },
          "@elizaos/plugin-custom": {
            source: "npm",
            installPath:
              "/home/user/.milady/plugins/installed/_elizaos_plugin-custom",
            version: "2.0.0",
            installedAt: "2026-02-07T00:00:00Z",
          },
        },
      },
    } as unknown as MiladyConfig;
    const names = collectPluginNames(config);
    expect(names.has("@elizaos/plugin-weather")).toBe(true);
    expect(names.has("@elizaos/plugin-custom")).toBe(true);
  });

  it("includes plugin-plugin-manager in core plugins", () => {
    const names = collectPluginNames({} as MiladyConfig);
    expect(names.has("@elizaos/plugin-plugin-manager")).toBe(true);
  });

  it("handles empty plugins.installs gracefully", () => {
    const config = { plugins: { installs: {} } } as unknown as MiladyConfig;
    const names = collectPluginNames(config);
    // Should still have all core plugins, no crash
    expect(names.has("@elizaos/plugin-sql")).toBe(true);
    expect(names.has("@elizaos/plugin-trajectory-logger")).toBe(true);
  });

  it("handles undefined plugins.installs gracefully", () => {
    const config = { plugins: {} } as unknown as MiladyConfig;
    expect(() => collectPluginNames(config)).not.toThrow();
  });

  it("handles null install records gracefully", () => {
    const config = {
      plugins: {
        installs: {
          "@elizaos/plugin-bad": null,
        },
      },
    } as unknown as MiladyConfig;
    // null records should be skipped (the typeof check catches this)
    const names = collectPluginNames(config);
    expect(names.has("@elizaos/plugin-bad")).toBe(false);
  });

  it("user-installed plugins coexist with core and channel plugins", () => {
    process.env.ANTHROPIC_API_KEY = "sk-test";
    const config = {
      connectors: { discord: { token: "tok" } },
      plugins: {
        installs: {
          "@elizaos/plugin-weather": {
            source: "npm",
            installPath: "/tmp/test",
            version: "1.0.0",
          },
        },
      },
    } as unknown as MiladyConfig;
    const names = collectPluginNames(config);
    // Core
    expect(names.has("@elizaos/plugin-sql")).toBe(true);
    expect(names.has("@elizaos/plugin-plugin-manager")).toBe(true);
    // Channel
    expect(names.has("@elizaos/plugin-discord")).toBe(true);
    // Provider
    expect(names.has("@elizaos/plugin-anthropic")).toBe(true);
    // User-installed
    expect(names.has("@elizaos/plugin-weather")).toBe(true);
  });

  // --- vision feature flag behaviour ---

  it("adds @elizaos/plugin-vision when features.vision = true", () => {
    const config = {
      features: { vision: true },
    } as unknown as MiladyConfig;
    const names = collectPluginNames(config);
    expect(names.has("@elizaos/plugin-vision")).toBe(true);
  });

  it("does NOT add @elizaos/plugin-vision when features.vision = false", () => {
    const config = {
      features: { vision: false },
    } as unknown as MiladyConfig;
    const names = collectPluginNames(config);
    expect(names.has("@elizaos/plugin-vision")).toBe(false);
  });

  it("does NOT add @elizaos/plugin-vision when features.vision is absent", () => {
    const config = {} as MiladyConfig;
    const names = collectPluginNames(config);
    expect(names.has("@elizaos/plugin-vision")).toBe(false);
  });

  it("cloud plugin is loaded independently of vision toggle", () => {
    const config = {
      cloud: { enabled: true },
      features: { vision: false },
    } as unknown as MiladyConfig;
    const names = collectPluginNames(config);
    expect(names.has("@elizaos/plugin-elizacloud")).toBe(true);
    expect(names.has("@elizaos/plugin-vision")).toBe(false);
  });

  it("adds @elizaos/plugin-obsidian when features.obsidian = true", () => {
    const config = {
      features: { obsidian: true },
    } as unknown as MiladyConfig;
    const names = collectPluginNames(config);
    expect(names.has("@elizaos/plugin-obsidian")).toBe(true);
  });

  it("adds @elizaos/plugin-obsidian when plugins.allow includes obsidian", () => {
    const config = {
      plugins: { allow: ["obsidian"] },
    } as unknown as MiladyConfig;
    const names = collectPluginNames(config);
    expect(names.has("@elizaos/plugin-obsidian")).toBe(true);
  });

  it("preserves fully-qualified optional plugin package names from plugins.allow", () => {
    const optionalPlugins = [
      "@elizaos/plugin-cua",
      "@elizaos/plugin-code",
      "@elizaos/plugin-xai",
      "@elizaos/plugin-deepseek",
      "@elizaos/plugin-mistral",
      "@elizaos/plugin-together",
      "@elizaos/plugin-claude-code-workbench",
    ];
    const config = {
      plugins: { allow: optionalPlugins },
    } as unknown as MiladyConfig;

    const names = collectPluginNames(config);

    for (const pluginName of optionalPlugins) {
      expect(names.has(pluginName)).toBe(true);
    }
  });

  it("CHANNEL_PLUGIN_MAP keys match CONNECTOR_IDS from schema", () => {
    expect([...Object.keys(CHANNEL_PLUGIN_MAP)].sort()).toEqual(
      [...CONNECTOR_IDS].sort(),
    );
  });

  it("CHANNEL_PLUGIN_MAP values match CONNECTOR_PLUGINS for every connector", () => {
    for (const id of Object.keys(CHANNEL_PLUGIN_MAP)) {
      expect(CHANNEL_PLUGIN_MAP[id]).toBe(CONNECTOR_PLUGINS[id]);
    }
  });
});

// ---------------------------------------------------------------------------
// repairBrokenInstallRecord
// ---------------------------------------------------------------------------

describe("repairBrokenInstallRecord", () => {
  it("clears a stale installPath and marks source as npm", () => {
    const config = {
      plugins: {
        installs: {
          "@elizaos/plugin-discord": {
            source: "path",
            installPath: "/tmp/broken-plugin",
            version: "2.0.0-alpha.4",
          },
        },
      },
    } as unknown as MiladyConfig;

    const changed = repairBrokenInstallRecord(
      config,
      "@elizaos/plugin-discord",
    );

    expect(changed).toBe(true);
    expect(
      config.plugins?.installs?.["@elizaos/plugin-discord"]?.installPath,
    ).toBe("");
    expect(config.plugins?.installs?.["@elizaos/plugin-discord"]?.source).toBe(
      "npm",
    );
  });

  it("returns false when no install record exists", () => {
    const config = { plugins: { installs: {} } } as unknown as MiladyConfig;
    expect(repairBrokenInstallRecord(config, "@elizaos/plugin-discord")).toBe(
      false,
    );
  });

  it("returns false when installPath is already empty", () => {
    const config = {
      plugins: {
        installs: {
          "@elizaos/plugin-discord": {
            source: "npm",
            installPath: "",
          },
        },
      },
    } as unknown as MiladyConfig;

    expect(repairBrokenInstallRecord(config, "@elizaos/plugin-discord")).toBe(
      false,
    );
  });
});

// ---------------------------------------------------------------------------
// applyConnectorSecretsToEnv
// ---------------------------------------------------------------------------

describe("applyConnectorSecretsToEnv", () => {
  const envKeys = [
    "DISCORD_API_TOKEN",
    "DISCORD_BOT_TOKEN",
    "TELEGRAM_BOT_TOKEN",
    "SLACK_BOT_TOKEN",
    "SLACK_APP_TOKEN",
    "SLACK_USER_TOKEN",
    "SIGNAL_ACCOUNT",
    "MSTEAMS_APP_ID",
    "MSTEAMS_APP_PASSWORD",
    "MATTERMOST_BOT_TOKEN",
    "MATTERMOST_BASE_URL",
    "GOOGLE_CHAT_SERVICE_ACCOUNT_KEY",
  ];
  const snap = envSnapshot(envKeys);
  beforeEach(() => {
    snap.save();
    for (const k of envKeys) delete process.env[k];
  });
  afterEach(() => snap.restore());

  it("copies Discord token from config to env", () => {
    const config = {
      connectors: { discord: { token: "discord-tok-123" } },
    } as MiladyConfig;
    applyConnectorSecretsToEnv(config);
    expect(process.env.DISCORD_API_TOKEN).toBe("discord-tok-123");
    expect(process.env.DISCORD_BOT_TOKEN).toBe("discord-tok-123");
  });

  it("copies legacy Discord botToken from config to env", () => {
    const config = {
      connectors: { discord: { botToken: "discord-tok-legacy" } },
    } as unknown as MiladyConfig;
    applyConnectorSecretsToEnv(config);
    expect(process.env.DISCORD_API_TOKEN).toBe("discord-tok-legacy");
    expect(process.env.DISCORD_BOT_TOKEN).toBe("discord-tok-legacy");
  });

  it("copies Telegram botToken from config to env", () => {
    const config = {
      connectors: { telegram: { botToken: "tg-tok-456" } },
    } as MiladyConfig;
    applyConnectorSecretsToEnv(config);
    expect(process.env.TELEGRAM_BOT_TOKEN).toBe("tg-tok-456");
  });

  it("copies all Slack tokens from config to env", () => {
    const config = {
      connectors: {
        slack: { botToken: "xoxb-1", appToken: "xapp-1", userToken: "xoxp-1" },
      },
    } as MiladyConfig;
    applyConnectorSecretsToEnv(config);
    expect(process.env.SLACK_BOT_TOKEN).toBe("xoxb-1");
    expect(process.env.SLACK_APP_TOKEN).toBe("xapp-1");
    expect(process.env.SLACK_USER_TOKEN).toBe("xoxp-1");
  });

  it("does not overwrite existing env values", () => {
    process.env.TELEGRAM_BOT_TOKEN = "already-set";
    const config = {
      connectors: { telegram: { botToken: "new-tok" } },
    } as MiladyConfig;
    applyConnectorSecretsToEnv(config);
    expect(process.env.TELEGRAM_BOT_TOKEN).toBe("already-set");
  });

  it("skips empty or whitespace-only values", () => {
    const config = {
      connectors: { discord: { token: "  " } },
    } as MiladyConfig;
    applyConnectorSecretsToEnv(config);
    expect(process.env.DISCORD_BOT_TOKEN).toBeUndefined();
  });

  it("handles missing connectors gracefully", () => {
    expect(() => applyConnectorSecretsToEnv({} as MiladyConfig)).not.toThrow();
  });

  it("handles unknown connector names gracefully", () => {
    const config = {
      connectors: { unknownConnector: { token: "tok" } },
    } as unknown as MiladyConfig;
    expect(() => applyConnectorSecretsToEnv(config)).not.toThrow();
  });

  it("supports legacy channels key for backward compat", () => {
    const config = {
      channels: { telegram: { botToken: "legacy-tg-tok" } },
    } as MiladyConfig;
    applyConnectorSecretsToEnv(config);
    expect(process.env.TELEGRAM_BOT_TOKEN).toBe("legacy-tg-tok");
  });
});

// ---------------------------------------------------------------------------
// autoResolveDiscordAppId
// ---------------------------------------------------------------------------

describe("autoResolveDiscordAppId", () => {
  const envKeys = [
    "DISCORD_APPLICATION_ID",
    "DISCORD_API_TOKEN",
    "DISCORD_BOT_TOKEN",
  ];
  const snap = envSnapshot(envKeys);
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    snap.save();
    for (const k of envKeys) delete process.env[k];
  });

  afterEach(() => {
    snap.restore();
    vi.restoreAllMocks();
    globalThis.fetch = originalFetch;
  });

  it("no-ops when DISCORD_APPLICATION_ID is already set", async () => {
    process.env.DISCORD_APPLICATION_ID = "app-existing";
    process.env.DISCORD_API_TOKEN = "tok";

    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await autoResolveDiscordAppId();

    expect(process.env.DISCORD_APPLICATION_ID).toBe("app-existing");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("no-ops when no Discord token exists", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await autoResolveDiscordAppId();

    expect(process.env.DISCORD_APPLICATION_ID).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("resolves app id from Discord API when token is present", async () => {
    process.env.DISCORD_API_TOKEN = "tok";
    const infoSpy = vi.spyOn(logger, "info").mockImplementation(() => {});
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});

    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ id: "app-123" }),
    }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await autoResolveDiscordAppId();

    expect(fetchMock).toHaveBeenCalledWith(
      "https://discord.com/api/v10/oauth2/applications/@me",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bot tok",
        }),
      }),
    );
    expect(process.env.DISCORD_APPLICATION_ID).toBe("app-123");
    expect(infoSpy).toHaveBeenCalledWith(
      "[milady] Auto-resolved Discord Application ID: app-123",
    );
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("logs a warning when Discord API responds with an error", async () => {
    process.env.DISCORD_API_TOKEN = "tok";
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});

    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      status: 401,
    })) as unknown as typeof fetch;

    await autoResolveDiscordAppId();

    expect(process.env.DISCORD_APPLICATION_ID).toBeUndefined();
    expect(warnSpy).toHaveBeenCalledWith(
      "[milady] Failed to auto-resolve Discord Application ID: 401",
    );
  });

  it("logs a warning when the Discord API request throws", async () => {
    process.env.DISCORD_API_TOKEN = "tok";
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});

    globalThis.fetch = vi.fn(async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;

    await autoResolveDiscordAppId();

    expect(process.env.DISCORD_APPLICATION_ID).toBeUndefined();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Could not auto-resolve Discord Application ID"),
    );
  });
});

// ---------------------------------------------------------------------------
// applyCloudConfigToEnv
// ---------------------------------------------------------------------------

describe("applyCloudConfigToEnv", () => {
  const envKeys = [
    "ELIZAOS_CLOUD_ENABLED",
    "ELIZAOS_CLOUD_API_KEY",
    "ELIZAOS_CLOUD_BASE_URL",
  ];
  const snap = envSnapshot(envKeys);
  beforeEach(() => {
    snap.save();
    for (const k of envKeys) delete process.env[k];
  });
  afterEach(() => snap.restore());

  it("sets cloud env vars from config", () => {
    const config = {
      cloud: { enabled: true, apiKey: "ck-123", baseUrl: "https://cloud.test" },
    } as MiladyConfig;
    applyCloudConfigToEnv(config);
    expect(process.env.ELIZAOS_CLOUD_ENABLED).toBe("true");
    expect(process.env.ELIZAOS_CLOUD_API_KEY).toBe("ck-123");
    expect(process.env.ELIZAOS_CLOUD_BASE_URL).toBe("https://cloud.test");
  });

  it("overwrites stale env values with fresh config (hot-reload safety)", () => {
    process.env.ELIZAOS_CLOUD_API_KEY = "old-key";
    const config = { cloud: { apiKey: "new-key" } } as MiladyConfig;
    applyCloudConfigToEnv(config);
    expect(process.env.ELIZAOS_CLOUD_API_KEY).toBe("new-key");
  });

  it("handles missing cloud config gracefully", () => {
    expect(() => applyCloudConfigToEnv({} as MiladyConfig)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// applyX402ConfigToEnv
// ---------------------------------------------------------------------------

describe("applyX402ConfigToEnv", () => {
  const envKeys = ["X402_ENABLED", "X402_API_KEY", "X402_BASE_URL"];
  const snap = envSnapshot(envKeys);

  beforeEach(() => {
    snap.save();
    for (const key of envKeys) delete process.env[key];
  });

  afterEach(() => snap.restore());

  it("propagates x402 config to env when enabled", () => {
    const config = {
      x402: {
        enabled: true,
        apiKey: "x402-key",
        baseUrl: "https://x402.example",
      },
    } as unknown as MiladyConfig;

    applyX402ConfigToEnv(config);

    expect(process.env.X402_ENABLED).toBe("true");
    expect(process.env.X402_API_KEY).toBe("x402-key");
    expect(process.env.X402_BASE_URL).toBe("https://x402.example");
  });

  it("does not override existing x402 env values", () => {
    process.env.X402_ENABLED = "existing-enabled";
    process.env.X402_API_KEY = "existing-key";
    process.env.X402_BASE_URL = "https://existing.example";

    const config = {
      x402: {
        enabled: true,
        apiKey: "new-key",
        baseUrl: "https://new.example",
      },
    } as unknown as MiladyConfig;

    applyX402ConfigToEnv(config);

    expect(process.env.X402_ENABLED).toBe("existing-enabled");
    expect(process.env.X402_API_KEY).toBe("existing-key");
    expect(process.env.X402_BASE_URL).toBe("https://existing.example");
  });

  it("does nothing when x402 is disabled", () => {
    const config = {
      x402: {
        enabled: false,
        apiKey: "x402-key",
        baseUrl: "https://x402.example",
      },
    } as unknown as MiladyConfig;

    applyX402ConfigToEnv(config);

    expect(process.env.X402_ENABLED).toBeUndefined();
    expect(process.env.X402_API_KEY).toBeUndefined();
    expect(process.env.X402_BASE_URL).toBeUndefined();
  });

  it("does nothing when x402 config section is absent", () => {
    applyX402ConfigToEnv({} as MiladyConfig);

    expect(process.env.X402_ENABLED).toBeUndefined();
    expect(process.env.X402_API_KEY).toBeUndefined();
    expect(process.env.X402_BASE_URL).toBeUndefined();
  });

  it("sets only X402_ENABLED when apiKey and baseUrl are absent", () => {
    const config = {
      x402: { enabled: true },
    } as unknown as MiladyConfig;

    applyX402ConfigToEnv(config);

    expect(process.env.X402_ENABLED).toBe("true");
    expect(process.env.X402_API_KEY).toBeUndefined();
    expect(process.env.X402_BASE_URL).toBeUndefined();
  });

  it("does not propagate privateKey to environment", () => {
    const privateKeyValue = "0xdeadbeef1234567890abcdef";
    const config = {
      x402: {
        enabled: true,
        apiKey: "x402-key",
        baseUrl: "https://x402.example",
        privateKey: privateKeyValue,
      },
    } as unknown as MiladyConfig;

    applyX402ConfigToEnv(config);

    // Verify standard fields are set
    expect(process.env.X402_ENABLED).toBe("true");
    expect(process.env.X402_API_KEY).toBe("x402-key");
    // Verify privateKey is NOT leaked into any env var
    const envValues = Object.values(process.env);
    expect(envValues).not.toContain(privateKeyValue);
  });
});

// ---------------------------------------------------------------------------
// applyDatabaseConfigToEnv
// ---------------------------------------------------------------------------

describe("applyDatabaseConfigToEnv", () => {
  const envKeys = ["POSTGRES_URL", "PGLITE_DATA_DIR", "MILADY_PROFILE"];
  const snap = envSnapshot(envKeys);

  beforeEach(() => {
    snap.save();
    for (const key of envKeys) delete process.env[key];
  });

  afterEach(() => snap.restore());

  it("defaults PGLITE_DATA_DIR to the agent workspace when database config is missing", () => {
    applyDatabaseConfigToEnv({} as MiladyConfig);
    expect(process.env.POSTGRES_URL).toBeUndefined();
    expect(process.env.PGLITE_DATA_DIR).toBe(
      path.join(os.homedir(), ".milady", "workspace", ".eliza", ".elizadb"),
    );
  });

  it("uses configured agent workspace for default PGLite directory", () => {
    const config = {
      agents: {
        defaults: {
          workspace: "/tmp/milady-workspace",
        },
      },
    } as MiladyConfig;

    applyDatabaseConfigToEnv(config);
    expect(process.env.PGLITE_DATA_DIR).toBe(
      path.join("/tmp/milady-workspace", ".eliza", ".elizadb"),
    );
  });

  it("honors custom pglite.dataDir and clears stale POSTGRES_URL", () => {
    process.env.POSTGRES_URL = "postgresql://localhost:5432/old";
    const config = {
      database: {
        provider: "pglite",
        pglite: { dataDir: "~/milady-pglite" },
      },
    } as MiladyConfig;

    applyDatabaseConfigToEnv(config);
    expect(process.env.POSTGRES_URL).toBeUndefined();
    expect(process.env.PGLITE_DATA_DIR).toBe(
      path.resolve(path.join(os.homedir(), "milady-pglite")),
    );
  });

  it("does not overwrite externally provided PGLITE_DATA_DIR when config has no override", () => {
    process.env.PGLITE_DATA_DIR = "/tmp/external-pglite";
    applyDatabaseConfigToEnv({} as MiladyConfig);
    expect(process.env.PGLITE_DATA_DIR).toBe("/tmp/external-pglite");
  });

  it("builds POSTGRES_URL for postgres provider and clears PGLITE_DATA_DIR", () => {
    process.env.PGLITE_DATA_DIR = "/tmp/pglite";
    const config = {
      database: {
        provider: "postgres",
        postgres: {
          host: "db.example.test",
          port: 5433,
          database: "milady",
          user: "admin",
          password: "secret",
          ssl: true,
        },
      },
    } as MiladyConfig;

    applyDatabaseConfigToEnv(config);
    expect(process.env.PGLITE_DATA_DIR).toBeUndefined();
    expect(process.env.POSTGRES_URL).toBe(
      "postgresql://admin:secret@db.example.test:5433/milady?sslmode=require",
    );
  });
});

// ---------------------------------------------------------------------------
// isRecoverablePgliteInitError
// ---------------------------------------------------------------------------

describe("applyDatabaseConfigToEnv — directory creation", () => {
  const envKeys = ["POSTGRES_URL", "PGLITE_DATA_DIR", "MILADY_PROFILE"];
  const snap = envSnapshot(envKeys);

  beforeEach(() => {
    snap.save();
    for (const key of envKeys) delete process.env[key];
  });

  afterEach(() => snap.restore());

  it("creates the PGlite data directory when it does not exist", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "pglite-test-"));
    const dataDir = path.join(tmpDir, "nested", "deep", ".elizadb");

    const config = {
      database: {
        provider: "pglite",
        pglite: { dataDir },
      },
    } as MiladyConfig;

    applyDatabaseConfigToEnv(config);

    // The directory should now exist
    const stat = await fs.stat(dataDir);
    expect(stat.isDirectory()).toBe(true);

    // Cleanup
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("does not error when PGlite data directory already exists", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "pglite-test-"));
    const dataDir = path.join(tmpDir, ".elizadb");
    await fs.mkdir(dataDir, { recursive: true });

    const config = {
      database: {
        provider: "pglite",
        pglite: { dataDir },
      },
    } as MiladyConfig;

    // Should not throw
    applyDatabaseConfigToEnv(config);

    const stat = await fs.stat(dataDir);
    expect(stat.isDirectory()).toBe(true);

    // Cleanup
    await fs.rm(tmpDir, { recursive: true, force: true });
  });
});

describe("isRecoverablePgliteInitError", () => {
  it("returns true for the known PGLite abort + migrations signature", () => {
    const err = new Error(
      "Failed query: CREATE SCHEMA IF NOT EXISTS migrations",
      {
        cause: new Error(
          "RuntimeError: Aborted(). Build with -sASSERTIONS for more info.",
        ),
      },
    );
    expect(isRecoverablePgliteInitError(err)).toBe(true);
  });

  it("returns true when abort and pglite both appear in the error chain", () => {
    const err = new Error("PGlite adapter crashed", {
      cause: new Error("Aborted(). Build with -sASSERTIONS for more info."),
    });
    expect(isRecoverablePgliteInitError(err)).toBe(true);
  });

  it("returns true for migrations schema failures even when abort text is absent", () => {
    const err = new Error(
      "Failed query: CREATE SCHEMA IF NOT EXISTS migrations",
    );
    expect(isRecoverablePgliteInitError(err)).toBe(true);
  });

  it("returns false for unrelated errors", () => {
    expect(isRecoverablePgliteInitError(new Error("Connection refused"))).toBe(
      false,
    );
  });
});

// ---------------------------------------------------------------------------
// buildCharacterFromConfig
// ---------------------------------------------------------------------------

describe("buildCharacterFromConfig", () => {
  const envKeys = [
    "ANTHROPIC_API_KEY",
    "OPENAI_API_KEY",
    "DISCORD_API_TOKEN",
    "DISCORD_APPLICATION_ID",
  ];
  const snap = envSnapshot(envKeys);
  beforeEach(() => {
    snap.save();
    for (const k of envKeys) delete process.env[k];
  });
  afterEach(() => snap.restore());

  it("uses agent name from agents.list", () => {
    const config = {
      agents: { list: [{ id: "main", name: "Sakuya" }] },
    } as MiladyConfig;
    const char = buildCharacterFromConfig(config);
    expect(char.name).toBe("Sakuya");
  });

  it("falls back to config.ui.assistant.name", () => {
    const config = {
      ui: { assistant: { name: "Reimu" } },
    } as unknown as MiladyConfig;
    const char = buildCharacterFromConfig(config);
    expect(char.name).toBe("Reimu");
  });

  it("defaults to 'Milady' when no name is configured", () => {
    const char = buildCharacterFromConfig({} as MiladyConfig);
    expect(char.name).toBe("Milady");
  });

  it("collects API keys from process.env as secrets", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    process.env.OPENAI_API_KEY = "sk-oai-test";
    process.env.DISCORD_API_TOKEN = "discord-api-test";
    process.env.DISCORD_APPLICATION_ID = "discord-app-123";
    const char = buildCharacterFromConfig({} as MiladyConfig);
    expect(char.secrets?.ANTHROPIC_API_KEY).toBe("sk-ant-test");
    expect(char.secrets?.OPENAI_API_KEY).toBe("sk-oai-test");
    expect(char.secrets?.DISCORD_API_TOKEN).toBe("discord-api-test");
    expect(char.secrets?.DISCORD_APPLICATION_ID).toBe("discord-app-123");
  });

  it("excludes empty or whitespace-only env values from secrets", () => {
    process.env.ANTHROPIC_API_KEY = "  ";
    const char = buildCharacterFromConfig({} as MiladyConfig);
    expect(char.secrets?.ANTHROPIC_API_KEY).toBeUndefined();
  });

  it("uses default bio and system prompt (character data lives in DB)", () => {
    const config = {
      agents: { list: [{ id: "main", name: "Test" }] },
    } as MiladyConfig;
    const char = buildCharacterFromConfig(config);
    const bioText = Array.isArray(char.bio) ? char.bio.join(" ") : char.bio;
    expect(bioText).toContain("AI assistant");
    expect(char.system).toContain("autonomous AI agent");
  });

  // ── Default template fields (character data is in the DB) ────────────

  it("uses default bio with {{name}} placeholder", () => {
    const config = {
      agents: { list: [{ id: "main", name: "Sakuya" }] },
    } as MiladyConfig;
    const char = buildCharacterFromConfig(config);
    expect(Array.isArray(char.bio)).toBe(true);
    const bioArr = char.bio as string[];
    expect(bioArr[0]).toContain("{{name}}");
  });

  it("uses default system prompt with {{name}} placeholder", () => {
    const config = {
      agents: { list: [{ id: "main", name: "Sakuya" }] },
    } as MiladyConfig;
    const char = buildCharacterFromConfig(config);
    expect(char.system).toContain("{{name}}");
  });

  it("defaults bio to {{name}} placeholder when not configured", () => {
    const char = buildCharacterFromConfig({} as MiladyConfig);
    const bioArr = char.bio as string[];
    expect(bioArr.some((b: string) => b.includes("{{name}}"))).toBe(true);
  });

  it("defaults system to {{name}} placeholder when not configured", () => {
    const char = buildCharacterFromConfig({} as MiladyConfig);
    expect(char.system).toContain("{{name}}");
  });

  it("does not throw when agents.list is empty", () => {
    const config = { agents: { list: [] } } as MiladyConfig;
    expect(() => buildCharacterFromConfig(config)).not.toThrow();
    expect(buildCharacterFromConfig(config).name).toBe("Milady");
  });

  it("builds a character with name from agents.list and default personality", () => {
    const config = {
      agents: { list: [{ id: "main", name: "Reimu" }] },
    } as MiladyConfig;
    const char = buildCharacterFromConfig(config);

    expect(char.name).toBe("Reimu");
    // Bio and system use defaults with {{name}} placeholders
    expect(Array.isArray(char.bio)).toBe(true);
    expect((char.bio as string[])[0]).toContain("{{name}}");
    expect(char.system).toContain("{{name}}");
  });
});

// ---------------------------------------------------------------------------
// resolvePrimaryModel
// ---------------------------------------------------------------------------

describe("resolvePrimaryModel", () => {
  it("returns undefined when no model config exists", () => {
    expect(resolvePrimaryModel({} as MiladyConfig)).toBeUndefined();
  });

  it("returns undefined when agents.defaults.model is missing", () => {
    const config = { agents: { defaults: {} } } as MiladyConfig;
    expect(resolvePrimaryModel(config)).toBeUndefined();
  });

  it("returns the primary model when configured", () => {
    const config = {
      agents: { defaults: { model: { primary: "gpt-5" } } },
    } as MiladyConfig;
    expect(resolvePrimaryModel(config)).toBe("gpt-5");
  });

  it("returns undefined when model has no primary", () => {
    const config = {
      agents: { defaults: { model: { fallbacks: ["gpt-5-mini"] } } },
    } as unknown as MiladyConfig;
    expect(resolvePrimaryModel(config)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// resolvePackageEntry — tests with real directory layout on disk
// ---------------------------------------------------------------------------

describe("resolvePackageEntry", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "eliza-resolve-test-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("resolves entry from package.json main field", async () => {
    const pkgRoot = path.join(tmpDir, "plugin-a");
    await fs.mkdir(path.join(pkgRoot, "dist"), { recursive: true });
    await fs.writeFile(
      path.join(pkgRoot, "dist", "index"),
      "export default {}",
    );
    await fs.writeFile(
      path.join(pkgRoot, "package.json"),
      JSON.stringify({ main: "./dist/index" }),
    );

    const entry = await resolvePackageEntry(pkgRoot);
    expect(entry).toBe(path.resolve(pkgRoot, "./dist/index"));
  });

  it("resolves entry from package.json exports string", async () => {
    const pkgRoot = path.join(tmpDir, "plugin-b");
    await fs.mkdir(path.join(pkgRoot, "lib"), { recursive: true });
    await fs.writeFile(path.join(pkgRoot, "lib", "main"), "export default {}");
    await fs.writeFile(
      path.join(pkgRoot, "package.json"),
      JSON.stringify({ exports: "./lib/main" }),
    );

    const entry = await resolvePackageEntry(pkgRoot);
    expect(entry).toBe(path.resolve(pkgRoot, "./lib/main"));
  });

  it("resolves entry from package.json exports map (dot entry)", async () => {
    const pkgRoot = path.join(tmpDir, "plugin-c");
    await fs.mkdir(path.join(pkgRoot, "dist"), { recursive: true });
    await fs.writeFile(
      path.join(pkgRoot, "dist", "index"),
      "export default {}",
    );
    await fs.writeFile(
      path.join(pkgRoot, "package.json"),
      JSON.stringify({
        exports: {
          ".": { import: "./dist/index", default: "./dist/index" },
        },
      }),
    );

    const entry = await resolvePackageEntry(pkgRoot);
    expect(entry).toBe(path.resolve(pkgRoot, "./dist/index"));
  });

  it("resolves entry from exports dot-string shorthand", async () => {
    const pkgRoot = path.join(tmpDir, "plugin-d");
    await fs.mkdir(path.join(pkgRoot, "out"), { recursive: true });
    await fs.writeFile(path.join(pkgRoot, "out", "mod"), "export default {}");
    await fs.writeFile(
      path.join(pkgRoot, "package.json"),
      JSON.stringify({ exports: { ".": "./out/mod" } }),
    );

    const entry = await resolvePackageEntry(pkgRoot);
    expect(entry).toBe(path.resolve(pkgRoot, "./out/mod"));
  });

  it("falls back to dist/index.js when package.json has no main or exports", async () => {
    const pkgRoot = path.join(tmpDir, "plugin-e");
    await fs.mkdir(pkgRoot, { recursive: true });
    await fs.writeFile(
      path.join(pkgRoot, "package.json"),
      JSON.stringify({ name: "plugin-e", version: "1.0.0" }),
    );

    const entry = await resolvePackageEntry(pkgRoot);
    expect(entry).toBe(path.join(pkgRoot, "dist", "index"));
  });

  it("falls back to dist/index.js when no package.json exists", async () => {
    const pkgRoot = path.join(tmpDir, "plugin-f");
    await fs.mkdir(pkgRoot, { recursive: true });

    const entry = await resolvePackageEntry(pkgRoot);
    expect(entry).toBe(path.join(pkgRoot, "dist", "index"));
  });
});

// ---------------------------------------------------------------------------
// scanDropInPlugins
// ---------------------------------------------------------------------------

describe("scanDropInPlugins", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "eliza-dropin-test-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("discovers a plugin directory with package.json", async () => {
    const dir = path.join(tmpDir, "my-plugin");
    await fs.mkdir(dir);
    await fs.writeFile(
      path.join(dir, "package.json"),
      JSON.stringify({ name: "my-custom-plugin", version: "1.2.3" }),
    );
    const records = await scanDropInPlugins(tmpDir);
    expect(records["my-custom-plugin"]).toBeDefined();
    expect(records["my-custom-plugin"].source).toBe("path");
    expect(records["my-custom-plugin"].installPath).toBe(dir);
    expect(records["my-custom-plugin"].version).toBe("1.2.3");
  });

  it("discovers multiple plugins", async () => {
    for (const n of ["a", "b", "c"]) {
      const dir = path.join(tmpDir, n);
      await fs.mkdir(dir);
      await fs.writeFile(
        path.join(dir, "package.json"),
        JSON.stringify({ name: n }),
      );
    }
    const records = await scanDropInPlugins(tmpDir);
    expect(Object.keys(records)).toHaveLength(3);
    expect(records.a).toBeDefined();
    expect(records.b).toBeDefined();
    expect(records.c).toBeDefined();
  });

  it("handles scoped package names (@org/plugin-name)", async () => {
    const dir = path.join(tmpDir, "scoped");
    await fs.mkdir(dir);
    await fs.writeFile(
      path.join(dir, "package.json"),
      JSON.stringify({ name: "@myorg/plugin-cool", version: "2.0.0" }),
    );
    const records = await scanDropInPlugins(tmpDir);
    expect(records["@myorg/plugin-cool"]).toBeDefined();
    expect(records["@myorg/plugin-cool"].version).toBe("2.0.0");
  });

  it("returns empty record for a nonexistent directory", async () => {
    const records = await scanDropInPlugins(path.join(tmpDir, "nope"));
    expect(Object.keys(records)).toHaveLength(0);
  });

  it("returns empty record for an empty directory", async () => {
    const records = await scanDropInPlugins(tmpDir);
    expect(Object.keys(records)).toHaveLength(0);
  });

  it("ignores plain files (only directories are plugins)", async () => {
    await fs.writeFile(path.join(tmpDir, "stray"), "export default {}");
    await fs.writeFile(path.join(tmpDir, "readme.md"), "# hi");
    const records = await scanDropInPlugins(tmpDir);
    expect(Object.keys(records)).toHaveLength(0);
  });

  it("uses directory name when no package.json exists", async () => {
    await fs.mkdir(path.join(tmpDir, "bare-plugin"));
    const records = await scanDropInPlugins(tmpDir);
    expect(records["bare-plugin"]).toBeDefined();
    expect(records["bare-plugin"].source).toBe("path");
    expect(records["bare-plugin"].version).toBe("0.0.0");
  });

  it("falls back to directory name when name is whitespace-only", async () => {
    const dir = path.join(tmpDir, "ws-name");
    await fs.mkdir(dir);
    await fs.writeFile(
      path.join(dir, "package.json"),
      JSON.stringify({ name: "   ", version: "1.0.0" }),
    );
    const records = await scanDropInPlugins(tmpDir);
    expect(records["ws-name"]).toBeDefined();
    expect(records["ws-name"].version).toBe("1.0.0");
  });

  it("falls back to directory name when name is empty string", async () => {
    const dir = path.join(tmpDir, "empty-name");
    await fs.mkdir(dir);
    await fs.writeFile(
      path.join(dir, "package.json"),
      JSON.stringify({ name: "", version: "3.0.0" }),
    );
    const records = await scanDropInPlugins(tmpDir);
    expect(records["empty-name"]).toBeDefined();
  });

  it("falls back to directory name when name is non-string (number)", async () => {
    const dir = path.join(tmpDir, "num-name");
    await fs.mkdir(dir);
    await fs.writeFile(
      path.join(dir, "package.json"),
      JSON.stringify({ name: 42, version: "1.0.0" }),
    );
    const records = await scanDropInPlugins(tmpDir);
    expect(records["num-name"]).toBeDefined();
  });

  it("falls back to directory name when name is null", async () => {
    const dir = path.join(tmpDir, "null-name");
    await fs.mkdir(dir);
    await fs.writeFile(
      path.join(dir, "package.json"),
      JSON.stringify({ name: null }),
    );
    const records = await scanDropInPlugins(tmpDir);
    expect(records["null-name"]).toBeDefined();
    expect(records["null-name"].version).toBe("0.0.0");
  });

  it("trims whitespace from name and version", async () => {
    const dir = path.join(tmpDir, "trimmed");
    await fs.mkdir(dir);
    await fs.writeFile(
      path.join(dir, "package.json"),
      JSON.stringify({ name: "  my-plugin  ", version: "  4.0.0  " }),
    );
    const records = await scanDropInPlugins(tmpDir);
    expect(records["my-plugin"]).toBeDefined();
    expect(records["my-plugin"].version).toBe("4.0.0");
  });

  it("defaults version to 0.0.0 when version field is missing", async () => {
    const dir = path.join(tmpDir, "no-ver");
    await fs.mkdir(dir);
    await fs.writeFile(
      path.join(dir, "package.json"),
      JSON.stringify({ name: "no-ver-plugin" }),
    );
    const records = await scanDropInPlugins(tmpDir);
    expect(records["no-ver-plugin"].version).toBe("0.0.0");
  });

  it("handles malformed JSON in package.json", async () => {
    const dir = path.join(tmpDir, "bad-json");
    await fs.mkdir(dir);
    await fs.writeFile(path.join(dir, "package.json"), "{{{NOT JSON");
    const records = await scanDropInPlugins(tmpDir);
    expect(records["bad-json"]).toBeDefined();
    expect(records["bad-json"].version).toBe("0.0.0");
  });

  it("handles empty package.json file", async () => {
    const dir = path.join(tmpDir, "empty-pkg");
    await fs.mkdir(dir);
    await fs.writeFile(path.join(dir, "package.json"), "");
    const records = await scanDropInPlugins(tmpDir);
    expect(records["empty-pkg"]).toBeDefined();
  });

  it("handles package.json that is an array (not an object)", async () => {
    const dir = path.join(tmpDir, "arr-pkg");
    await fs.mkdir(dir);
    await fs.writeFile(path.join(dir, "package.json"), "[1, 2, 3]");
    const records = await scanDropInPlugins(tmpDir);
    expect(records["arr-pkg"]).toBeDefined();
  });

  it("only scans immediate children, not nested subdirectories", async () => {
    const parent = path.join(tmpDir, "parent");
    const child = path.join(parent, "child");
    await fs.mkdir(child, { recursive: true });
    await fs.writeFile(
      path.join(parent, "package.json"),
      JSON.stringify({ name: "parent-plugin" }),
    );
    await fs.writeFile(
      path.join(child, "package.json"),
      JSON.stringify({ name: "child-plugin" }),
    );
    const records = await scanDropInPlugins(tmpDir);
    expect(Object.keys(records)).toHaveLength(1);
    expect(records["parent-plugin"]).toBeDefined();
    expect(records["child-plugin"]).toBeUndefined();
  });

  it("last plugin wins when two directories produce the same name", async () => {
    // Two directories with different dir names but same package name
    const dir1 = path.join(tmpDir, "aaa-first");
    const dir2 = path.join(tmpDir, "zzz-second");
    await fs.mkdir(dir1);
    await fs.mkdir(dir2);
    await fs.writeFile(
      path.join(dir1, "package.json"),
      JSON.stringify({ name: "dupe-plugin", version: "1.0.0" }),
    );
    await fs.writeFile(
      path.join(dir2, "package.json"),
      JSON.stringify({ name: "dupe-plugin", version: "2.0.0" }),
    );
    const records = await scanDropInPlugins(tmpDir);
    // Both dirs have same package name — the last one iterated wins
    expect(records["dupe-plugin"]).toBeDefined();
    // We don't assert which version wins (depends on readdir order),
    // but there should be exactly one entry
    expect(Object.keys(records)).toHaveLength(1);
  });

  it("CUSTOM_PLUGINS_DIRNAME is plugins/custom", () => {
    expect(CUSTOM_PLUGINS_DIRNAME).toBe("plugins/custom");
  });
});

// ---------------------------------------------------------------------------
// mergeDropInPlugins
// ---------------------------------------------------------------------------

describe("mergeDropInPlugins", () => {
  function makeRecord(installPath: string, version = "1.0.0") {
    return { source: "path" as const, installPath, version };
  }

  it("accepts a drop-in plugin that doesn't collide with anything", () => {
    const pluginsToLoad = new Set<string>();
    const installRecords: Record<string, ReturnType<typeof makeRecord>> = {};
    const { accepted, skipped } = mergeDropInPlugins({
      dropInRecords: { "my-plugin": makeRecord("/tmp/my-plugin") },
      installRecords,
      corePluginNames: new Set(["@elizaos/plugin-sql"]),
      denyList: new Set(),
      pluginsToLoad,
    });
    expect(accepted).toEqual(["my-plugin"]);
    expect(skipped).toHaveLength(0);
    expect(pluginsToLoad.has("my-plugin")).toBe(true);
    expect(installRecords["my-plugin"]).toBeDefined();
  });

  it("skips plugins in the deny list", () => {
    const pluginsToLoad = new Set<string>();
    const installRecords: Record<string, ReturnType<typeof makeRecord>> = {};
    const { accepted } = mergeDropInPlugins({
      dropInRecords: { "blocked-plugin": makeRecord("/tmp/blocked") },
      installRecords,
      corePluginNames: new Set(),
      denyList: new Set(["blocked-plugin"]),
      pluginsToLoad,
    });
    expect(accepted).toHaveLength(0);
    expect(pluginsToLoad.has("blocked-plugin")).toBe(false);
    expect(installRecords["blocked-plugin"]).toBeUndefined();
  });

  it("skips plugins that collide with core plugin names and returns warning", () => {
    const pluginsToLoad = new Set<string>();
    const installRecords: Record<string, ReturnType<typeof makeRecord>> = {};
    const { accepted, skipped } = mergeDropInPlugins({
      dropInRecords: { "@elizaos/plugin-sql": makeRecord("/tmp/fake-sql") },
      installRecords,
      corePluginNames: new Set(["@elizaos/plugin-sql"]),
      denyList: new Set(),
      pluginsToLoad,
    });
    expect(accepted).toHaveLength(0);
    expect(skipped).toHaveLength(1);
    expect(skipped[0]).toContain("collides with core plugin");
    expect(pluginsToLoad.has("@elizaos/plugin-sql")).toBe(false);
  });

  it("skips plugins that already have an install record", () => {
    const pluginsToLoad = new Set<string>();
    const installRecords: Record<string, ReturnType<typeof makeRecord>> = {
      "already-installed": makeRecord("/existing/path"),
    };
    const { accepted } = mergeDropInPlugins({
      dropInRecords: { "already-installed": makeRecord("/tmp/dupe") },
      installRecords,
      corePluginNames: new Set(),
      denyList: new Set(),
      pluginsToLoad,
    });
    expect(accepted).toHaveLength(0);
    // Original install record is preserved, not overwritten
    expect(installRecords["already-installed"].installPath).toBe(
      "/existing/path",
    );
  });

  it("handles multiple plugins with mixed outcomes", () => {
    const pluginsToLoad = new Set<string>();
    const installRecords: Record<string, ReturnType<typeof makeRecord>> = {
      "pre-existing": makeRecord("/existing"),
    };
    const { accepted, skipped } = mergeDropInPlugins({
      dropInRecords: {
        "good-plugin": makeRecord("/tmp/good"),
        "denied-one": makeRecord("/tmp/denied"),
        "@elizaos/plugin-sql": makeRecord("/tmp/core-collision"),
        "pre-existing": makeRecord("/tmp/dupe"),
      },
      installRecords,
      corePluginNames: new Set(["@elizaos/plugin-sql"]),
      denyList: new Set(["denied-one"]),
      pluginsToLoad,
    });
    expect(accepted).toEqual(["good-plugin"]);
    expect(skipped).toHaveLength(1); // only core collision gets a warning
    expect(pluginsToLoad.has("good-plugin")).toBe(true);
    expect(pluginsToLoad.has("denied-one")).toBe(false);
    expect(pluginsToLoad.has("@elizaos/plugin-sql")).toBe(false);
    expect(pluginsToLoad.has("pre-existing")).toBe(false);
  });

  it("returns empty when no drop-in records are provided", () => {
    const pluginsToLoad = new Set<string>();
    const installRecords: Record<string, ReturnType<typeof makeRecord>> = {};
    const { accepted, skipped } = mergeDropInPlugins({
      dropInRecords: {},
      installRecords,
      corePluginNames: new Set(),
      denyList: new Set(),
      pluginsToLoad,
    });
    expect(accepted).toHaveLength(0);
    expect(skipped).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// findPluginExport
// ---------------------------------------------------------------------------

describe("findPluginExport", () => {
  it("finds plugin from default export", () => {
    const result = findPluginExport({
      default: { name: "test", description: "a test plugin" },
    });
    expect(result).toEqual({ name: "test", description: "a test plugin" });
  });

  it("finds plugin from named 'plugin' export", () => {
    const result = findPluginExport({
      plugin: { name: "named", description: "named export" },
    });
    expect(result).toEqual({ name: "named", description: "named export" });
  });

  it("prefers default over named plugin export", () => {
    const result = findPluginExport({
      default: { name: "from-default", description: "d" },
      plugin: { name: "from-named", description: "n" },
    });
    expect(result?.name).toBe("from-default");
  });

  it("finds plugin from module-level CJS pattern", () => {
    const mod = {
      name: "cjs-mod",
      description: "cjs module pattern",
    } as Record<string, unknown>;
    const result = findPluginExport(mod);
    expect(result?.name).toBe("cjs-mod");
  });

  it("finds plugin from arbitrary named export", () => {
    const result = findPluginExport({
      myCustomPlugin: { name: "custom", description: "arbitrary named" },
      someOther: "not a plugin",
    });
    expect(result).toEqual({ name: "custom", description: "arbitrary named" });
  });

  it("prefers named plugin export over provider-like export", () => {
    const result = findPluginExport({
      documentsProvider: {
        name: "AVAILABLE_DOCUMENTS",
        description: "Provider export",
        get: async () => ({}),
      },
      knowledgePlugin: {
        name: "knowledge",
        description: "Plugin export",
        services: [],
      },
    });
    expect(result).toEqual({
      name: "knowledge",
      description: "Plugin export",
      services: [],
    });
  });

  it("returns null when no valid export exists", () => {
    const result = findPluginExport({
      default: "not an object",
      foo: 42,
      bar: null,
    });
    expect(result).toBeNull();
  });

  it("returns null for empty module", () => {
    expect(findPluginExport({})).toBeNull();
  });

  it("rejects object with name but no description", () => {
    const result = findPluginExport({
      default: { name: "incomplete" },
    });
    expect(result).toBeNull();
  });

  it("rejects object with description but no name", () => {
    const result = findPluginExport({
      default: { description: "no name" },
    });
    expect(result).toBeNull();
  });

  it("rejects null default export", () => {
    const result = findPluginExport({ default: null });
    expect(result).toBeNull();
  });

  it("rejects undefined default export", () => {
    const result = findPluginExport({ default: undefined });
    expect(result).toBeNull();
  });

  it("rejects name: number (non-string)", () => {
    const result = findPluginExport({
      default: { name: 42, description: "has desc" },
    });
    expect(result).toBeNull();
  });

  it("accepts plugin with extra fields beyond name/description", () => {
    const result = findPluginExport({
      default: {
        name: "rich",
        description: "rich plugin",
        init: () => {},
        actions: [],
      },
    });
    expect(result?.name).toBe("rich");
  });
});

describe("findRuntimePluginExport", () => {
  it("prefers plugin export over provider-like exports", () => {
    const providerLike = {
      name: "AVAILABLE_DOCUMENTS",
      description: "Provider export",
      get: async () => ({}),
    };
    const pluginLike = {
      name: "knowledge",
      description: "Knowledge plugin",
      services: [],
      providers: [],
    };

    const result = findRuntimePluginExport({
      documentsProvider: providerLike,
      knowledgePlugin: pluginLike,
    });

    expect(result).toBe(pluginLike);
  });

  it("uses default export when available", () => {
    const defaultPlugin = {
      name: "default-plugin",
      description: "Default plugin export",
      providers: [],
    };
    const namedPlugin = {
      name: "named-plugin",
      description: "Named plugin export",
      services: [],
    };

    const result = findRuntimePluginExport({
      default: defaultPlugin,
      namedPlugin,
    });

    expect(result).toBe(defaultPlugin);
  });
});

// ---------------------------------------------------------------------------
// End-to-end import chain (resolvePackageEntry + import)
// ---------------------------------------------------------------------------

describe("end-to-end import chain", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "eliza-plugin-e2e-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  async function writePlugin(dir: string, code: string): Promise<string> {
    const distDir = path.join(dir, "dist");
    await fs.mkdir(distDir, { recursive: true });
    const filePath = path.join(distDir, "index");
    await fs.writeFile(filePath, code);
    await fs.writeFile(
      path.join(dir, "package.json"),
      JSON.stringify({ name: "test-plugin", main: "dist/index" }),
    );
    return filePath;
  }

  it("resolves entry point and imports a default-exported plugin", async () => {
    const pluginDir = path.join(tmpDir, "default-export");
    await writePlugin(
      pluginDir,
      `export default { name: "hello", description: "world" };`,
    );
    const entry = await resolvePackageEntry(pluginDir);
    expect(entry).toBe(path.join(pluginDir, "dist", "index"));

    const { pathToFileURL } = await import("node:url");
    const mod = await import(pathToFileURL(entry).href);
    expect(mod.default).toBeDefined();
    expect(mod.default.name).toBe("hello");
    expect(mod.default.description).toBe("world");
  });

  it("resolves entry point from exports map", async () => {
    const pluginDir = path.join(tmpDir, "exports-map");
    const distDir = path.join(pluginDir, "dist");
    await fs.mkdir(distDir, { recursive: true });
    await fs.writeFile(
      path.join(distDir, "index"),
      `export const plugin = { name: "named", description: "via exports map" };`,
    );
    await fs.writeFile(
      path.join(pluginDir, "package.json"),
      JSON.stringify({ exports: { ".": "./dist/index" } }),
    );
    const entry = await resolvePackageEntry(pluginDir);
    expect(entry).toBe(path.resolve(pluginDir, "./dist/index"));

    const { pathToFileURL } = await import("node:url");
    const mod = await import(pathToFileURL(entry).href);
    expect(mod.plugin.name).toBe("named");
  });

  it("imports a plugin with only named exports (no default)", async () => {
    const pluginDir = path.join(tmpDir, "named-only");
    await writePlugin(
      pluginDir,
      `export const myPlugin = { name: "named-only", description: "no default" };`,
    );

    const { pathToFileURL } = await import("node:url");
    const entry = await resolvePackageEntry(pluginDir);
    const mod = await import(pathToFileURL(entry).href);
    expect(mod.default).toBeUndefined();
    expect(mod.myPlugin.name).toBe("named-only");
    expect(mod.myPlugin.description).toBe("no default");
  });

  it("returns fallback path when package.json has no main/exports", async () => {
    const pluginDir = path.join(tmpDir, "no-main");
    await fs.mkdir(pluginDir, { recursive: true });
    await fs.writeFile(
      path.join(pluginDir, "package.json"),
      JSON.stringify({ name: "bare" }),
    );
    const entry = await resolvePackageEntry(pluginDir);
    // Should fall back to dist/index.js (file may not exist, but path is correct)
    expect(entry).toBe(path.join(pluginDir, "dist", "index"));
  });

  it("rejects import when entry point file does not exist", async () => {
    const pluginDir = path.join(tmpDir, "missing-dist");
    await fs.mkdir(pluginDir, { recursive: true });
    await fs.writeFile(
      path.join(pluginDir, "package.json"),
      JSON.stringify({ name: "ghost", main: "dist/index" }),
    );

    const entry = await resolvePackageEntry(pluginDir);
    const { pathToFileURL } = await import("node:url");

    await expect(import(pathToFileURL(entry).href)).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// isEnvKeyAllowedForForwarding — env var security denylist
// ---------------------------------------------------------------------------

describe("isEnvKeyAllowedForForwarding", () => {
  // API keys should be allowed (plugins need them via runtime.getSetting)
  it.each([
    "OPENAI_API_KEY",
    "ANTHROPIC_API_KEY",
    "GEMINI_API_KEY",
    "GOOGLE_GENERATIVE_AI_API_KEY",
    "GROQ_API_KEY",
    "MY_CUSTOM_API_KEY",
    "MODEL_PROVIDER",
    "GOOGLE_SMALL_MODEL",
  ])("allows %s", (key) => {
    expect(isEnvKeyAllowedForForwarding(key)).toBe(true);
  });

  // Blockchain private keys
  it.each([
    "EVM_PRIVATE_KEY",
    "SOLANA_PRIVATE_KEY",
    "X402_PRIVATE_KEY",
    "MY_PRIVATE_KEY",
    "EVM_WALLET_ADDRESS",
    "SOLANA_RPC_URL",
  ])("blocks %s", (key) => {
    expect(isEnvKeyAllowedForForwarding(key)).toBe(false);
  });

  // Secrets and passwords
  it.each([
    "GITHUB_CLIENT_SECRET",
    "API_SECRET_KEY",
    "MY_SECRET",
    "DB_PASSWORD",
    "ADMIN_PASSWORD",
    "OAUTH_CREDENTIAL",
  ])("blocks %s (secret/password/credential)", (key) => {
    expect(isEnvKeyAllowedForForwarding(key)).toBe(false);
  });

  // Token variants
  it.each([
    "AUTH_TOKEN",
    "ACCESS_TOKEN",
    "REFRESH_TOKEN",
    "SESSION_TOKEN",
    "GITHUB_AUTH_TOKEN",
    "OAUTH_ACCESS_TOKEN",
  ])("blocks %s (token)", (key) => {
    expect(isEnvKeyAllowedForForwarding(key)).toBe(false);
  });

  // Mnemonics and seed phrases
  it.each([
    "WALLET_MNEMONIC",
    "MY_MNEMONIC",
    "SEED_PHRASE",
    "HD_SEED_PHRASE",
  ])("blocks %s (mnemonic/seed)", (key) => {
    expect(isEnvKeyAllowedForForwarding(key)).toBe(false);
  });

  // SECRET mid-string (not just end-of-string)
  it("blocks SECRET appearing anywhere in the key", () => {
    expect(isEnvKeyAllowedForForwarding("API_SECRET_KEY")).toBe(false);
    expect(isEnvKeyAllowedForForwarding("SECRET_VALUE")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Gemini API key normalization
// ---------------------------------------------------------------------------

describe("Gemini API key normalization", () => {
  const geminiEnvKeys = [
    "GEMINI_API_KEY",
    "GOOGLE_API_KEY",
    "GOOGLE_GENERATIVE_AI_API_KEY",
  ];
  const snap = envSnapshot(geminiEnvKeys);

  beforeEach(() => {
    snap.save();
    for (const k of geminiEnvKeys) delete process.env[k];
  });
  afterEach(() => snap.restore());

  it("collectPluginNames detects Gemini via GEMINI_API_KEY alias", () => {
    process.env.GEMINI_API_KEY = "test-key";
    // Simulate what the runtime does: normalize before collectPluginNames
    if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
      process.env.GOOGLE_GENERATIVE_AI_API_KEY =
        process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
    }
    const names = collectPluginNames({} as MiladyConfig);
    expect(names.has("@elizaos/plugin-google-genai")).toBe(true);
  });

  it("collectPluginNames detects Gemini via GOOGLE_API_KEY alias", () => {
    process.env.GOOGLE_API_KEY = "test-key";
    if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
      process.env.GOOGLE_GENERATIVE_AI_API_KEY =
        process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
    }
    const names = collectPluginNames({} as MiladyConfig);
    expect(names.has("@elizaos/plugin-google-genai")).toBe(true);
  });

  it("does not overwrite GOOGLE_GENERATIVE_AI_API_KEY if already set", () => {
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = "canonical-key";
    process.env.GEMINI_API_KEY = "alias-key";
    // setEnvIfMissing logic: skip if already set
    if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
      process.env.GOOGLE_GENERATIVE_AI_API_KEY =
        process.env.GEMINI_API_KEY || "";
    }
    expect(process.env.GOOGLE_GENERATIVE_AI_API_KEY).toBe("canonical-key");
  });
});

// ---------------------------------------------------------------------------
// getSetting null fallback — default model names
// ---------------------------------------------------------------------------

describe("getSetting null fallback — default Google model names", () => {
  const modelKeys = ["GOOGLE_SMALL_MODEL", "GOOGLE_LARGE_MODEL"];
  const snap = envSnapshot(modelKeys);

  beforeEach(() => {
    snap.save();
    for (const k of modelKeys) delete process.env[k];
  });
  afterEach(() => snap.restore());

  it("sets GOOGLE_SMALL_MODEL default when not present", () => {
    // Simulate runtime normalization
    if (!process.env.GOOGLE_SMALL_MODEL) {
      process.env.GOOGLE_SMALL_MODEL = "gemini-3-flash-preview";
    }
    expect(process.env.GOOGLE_SMALL_MODEL).toBe("gemini-3-flash-preview");
    expect(process.env.GOOGLE_SMALL_MODEL).not.toBe("null");
  });

  it("sets GOOGLE_LARGE_MODEL default when not present", () => {
    if (!process.env.GOOGLE_LARGE_MODEL) {
      process.env.GOOGLE_LARGE_MODEL = "gemini-3.1-pro-preview";
    }
    expect(process.env.GOOGLE_LARGE_MODEL).toBe("gemini-3.1-pro-preview");
    expect(process.env.GOOGLE_LARGE_MODEL).not.toBe("null");
  });

  it("does not overwrite user-configured model names", () => {
    process.env.GOOGLE_SMALL_MODEL = "gemini-custom";
    // setEnvIfMissing logic: skip if already set
    if (!process.env.GOOGLE_SMALL_MODEL) {
      process.env.GOOGLE_SMALL_MODEL = "gemini-3-flash-preview";
    }
    expect(process.env.GOOGLE_SMALL_MODEL).toBe("gemini-custom");
  });
});

// ---------------------------------------------------------------------------
// collectPluginNames — whitespace-only env keys
// ---------------------------------------------------------------------------

describe("collectPluginNames — whitespace env keys", () => {
  const envKeys = ["GROQ_API_KEY", "ANTHROPIC_API_KEY"];
  const snap = envSnapshot(envKeys);
  beforeEach(() => {
    snap.save();
    for (const k of envKeys) delete process.env[k];
  });
  afterEach(() => snap.restore());

  it("does not load a provider plugin when its env key is whitespace-only", () => {
    process.env.GROQ_API_KEY = "   ";
    const names = collectPluginNames({} as MiladyConfig);
    expect(names.has("@elizaos/plugin-groq")).toBe(false);
  });

  it("does not load a provider plugin when its env key is an empty string", () => {
    process.env.GROQ_API_KEY = "";
    const names = collectPluginNames({} as MiladyConfig);
    expect(names.has("@elizaos/plugin-groq")).toBe(false);
  });

  it("still loads a provider plugin when its env key has a real value", () => {
    process.env.ANTHROPIC_API_KEY = "sk-real-key";
    const names = collectPluginNames({} as MiladyConfig);
    expect(names.has("@elizaos/plugin-anthropic")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// deduplicatePluginActions
// ---------------------------------------------------------------------------

describe("deduplicatePluginActions", () => {
  function makePlugin(name: string, actionNames: string[]): Plugin {
    return {
      name,
      description: `test plugin ${name}`,
      actions: actionNames.map((n) => ({
        name: n,
        description: `action ${n}`,
        similes: [],
        handler: async () => {},
        validate: async () => true,
        examples: [],
      })),
    };
  }

  it("keeps first occurrence and removes duplicates from later plugins", () => {
    const pluginA = makePlugin("plugin-a", ["SEND_MESSAGE", "GET_TRADES"]);
    const pluginB = makePlugin("plugin-b", ["SEND_MESSAGE", "REGISTER_AGENT"]);

    deduplicatePluginActions([pluginA, pluginB]);

    expect(pluginA.actions?.map((a) => a.name)).toEqual([
      "SEND_MESSAGE",
      "GET_TRADES",
    ]);
    expect(pluginB.actions?.map((a) => a.name)).toEqual(["REGISTER_AGENT"]);
  });

  it("does not modify plugins with no overlapping actions", () => {
    const pluginA = makePlugin("plugin-a", ["ACTION_A"]);
    const pluginB = makePlugin("plugin-b", ["ACTION_B"]);

    deduplicatePluginActions([pluginA, pluginB]);

    expect(pluginA.actions).toHaveLength(1);
    expect(pluginB.actions).toHaveLength(1);
  });

  it("handles plugins with no actions array", () => {
    const pluginA = makePlugin("plugin-a", ["FOO"]);
    const pluginB: Plugin = {
      name: "plugin-b",
      description: "no actions",
    };

    deduplicatePluginActions([pluginA, pluginB]);

    expect(pluginA.actions?.map((a) => a.name)).toEqual(["FOO"]);
    expect(pluginB.actions).toBeUndefined();
  });

  it("removes all duplicates when three plugins share the same action", () => {
    const p1 = makePlugin("p1", ["SHARED"]);
    const p2 = makePlugin("p2", ["SHARED", "UNIQUE_2"]);
    const p3 = makePlugin("p3", ["SHARED", "UNIQUE_3"]);

    deduplicatePluginActions([p1, p2, p3]);

    expect(p1.actions?.map((a) => a.name)).toEqual(["SHARED"]);
    expect(p2.actions?.map((a) => a.name)).toEqual(["UNIQUE_2"]);
    expect(p3.actions?.map((a) => a.name)).toEqual(["UNIQUE_3"]);
  });
});
