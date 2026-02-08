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
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { MilaidyConfig } from "../config/config.js";
import {
  applyChannelSecretsToEnv,
  applyCloudConfigToEnv,
  buildCharacterFromConfig,
  collectPluginNames,
  CUSTOM_PLUGINS_DIRNAME,
  resolvePackageEntry,
  resolvePrimaryModel,
  scanDropInPlugins,
} from "./eliza.js";

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
    "ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GROQ_API_KEY", "GOOGLE_API_KEY",
    "XAI_API_KEY", "OPENROUTER_API_KEY", "AI_GATEWAY_API_KEY", "AIGATEWAY_API_KEY", "OLLAMA_BASE_URL",
    "ELIZAOS_CLOUD_API_KEY", "ELIZAOS_CLOUD_ENABLED",
  ];
  const snap = envSnapshot(envKeys);
  beforeEach(() => {
    snap.save();
    for (const k of envKeys) delete process.env[k];
  });
  afterEach(() => snap.restore());

  it("includes all core plugins for an empty config", () => {
    const names = collectPluginNames({} as MilaidyConfig);
    expect(names.has("@elizaos/plugin-sql")).toBe(true);
    expect(names.has("@elizaos/plugin-agent-skills")).toBe(true);
    expect(names.has("@elizaos/plugin-directives")).toBe(true);
    expect(names.has("@elizaos/plugin-commands")).toBe(true);
    expect(names.has("@elizaos/plugin-shell")).toBe(true);
    expect(names.has("@elizaos/plugin-personality")).toBe(true);
    expect(names.has("@elizaos/plugin-experience")).toBe(true);
    expect(names.has("@elizaos/plugin-form")).toBe(true);
  });

  it("adds model-provider plugins when env keys are present", () => {
    process.env.ANTHROPIC_API_KEY = "sk-test";
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.AI_GATEWAY_API_KEY = "aigw-test";
    const names = collectPluginNames({} as MilaidyConfig);
    expect(names.has("@elizaos/plugin-anthropic")).toBe(true);
    expect(names.has("@elizaos/plugin-openai")).toBe(true);
    expect(names.has("@elizaos/plugin-vercel-ai-gateway")).toBe(true);
    expect(names.has("@elizaos/plugin-groq")).toBe(false);
  });

  it("adds channel plugins when config.channels is populated", () => {
    const config = {
      channels: { telegram: { botToken: "tok" }, discord: { token: "tok" } },
    } as MilaidyConfig;
    const names = collectPluginNames(config);
    expect(names.has("@elizaos/plugin-telegram")).toBe(true);
    expect(names.has("@elizaos/plugin-discord")).toBe(true);
    expect(names.has("@elizaos/plugin-slack")).toBe(false);
  });

  it("does not add channel plugins for empty channel configs", () => {
    const config = { channels: { telegram: null } } as unknown as MilaidyConfig;
    const names = collectPluginNames(config);
    expect(names.has("@elizaos/plugin-telegram")).toBe(false);
  });

  it("adds ElizaCloud plugin when cloud is enabled in config", () => {
    const config = { cloud: { enabled: true } } as MilaidyConfig;
    const names = collectPluginNames(config);
    expect(names.has("@elizaos/plugin-elizacloud")).toBe(true);
  });

  it("adds ElizaCloud plugin when env key is present", () => {
    process.env.ELIZAOS_CLOUD_API_KEY = "ck-test";
    const names = collectPluginNames({} as MilaidyConfig);
    expect(names.has("@elizaos/plugin-elizacloud")).toBe(true);
  });

  it("respects feature flags in config.features", () => {
    // OPTIONAL_PLUGIN_MAP is empty, so features won't add anything currently.
    // But the function should not crash on arbitrary features.
    const config = {
      features: { someFeature: true, another: { enabled: false } },
    } as unknown as MilaidyConfig;
    expect(() => collectPluginNames(config)).not.toThrow();
  });

  // --- plugins.installs (user-installed from registry) ---

  it("includes user-installed plugins from config.plugins.installs", () => {
    const config = {
      plugins: {
        installs: {
          "@elizaos/plugin-weather": {
            source: "npm",
            installPath:
              "/home/user/.milaidy/plugins/installed/_elizaos_plugin-weather",
            version: "1.0.0",
            installedAt: "2026-02-07T00:00:00Z",
          },
          "@elizaos/plugin-custom": {
            source: "npm",
            installPath:
              "/home/user/.milaidy/plugins/installed/_elizaos_plugin-custom",
            version: "2.0.0",
            installedAt: "2026-02-07T00:00:00Z",
          },
        },
      },
    } as unknown as MilaidyConfig;
    const names = collectPluginNames(config);
    expect(names.has("@elizaos/plugin-weather")).toBe(true);
    expect(names.has("@elizaos/plugin-custom")).toBe(true);
  });

  it("includes plugin-plugin-manager in core plugins", () => {
    const names = collectPluginNames({} as MilaidyConfig);
    expect(names.has("@elizaos/plugin-plugin-manager")).toBe(true);
  });

  it("handles empty plugins.installs gracefully", () => {
    const config = { plugins: { installs: {} } } as unknown as MilaidyConfig;
    const names = collectPluginNames(config);
    // Should still have all core plugins, no crash
    expect(names.has("@elizaos/plugin-sql")).toBe(true);
  });

  it("handles undefined plugins.installs gracefully", () => {
    const config = { plugins: {} } as unknown as MilaidyConfig;
    expect(() => collectPluginNames(config)).not.toThrow();
  });

  it("handles null install records gracefully", () => {
    const config = {
      plugins: {
        installs: {
          "@elizaos/plugin-bad": null,
        },
      },
    } as unknown as MilaidyConfig;
    // null records should be skipped (the typeof check catches this)
    const names = collectPluginNames(config);
    expect(names.has("@elizaos/plugin-bad")).toBe(false);
  });

  it("user-installed plugins coexist with core and channel plugins", () => {
    process.env.ANTHROPIC_API_KEY = "sk-test";
    const config = {
      channels: { discord: { token: "tok" } },
      plugins: {
        installs: {
          "@elizaos/plugin-weather": {
            source: "npm",
            installPath: "/tmp/test",
            version: "1.0.0",
          },
        },
      },
    } as unknown as MilaidyConfig;
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
});

// ---------------------------------------------------------------------------
// applyChannelSecretsToEnv
// ---------------------------------------------------------------------------

describe("applyChannelSecretsToEnv", () => {
  const envKeys = [
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
      channels: { discord: { token: "discord-tok-123" } },
    } as MilaidyConfig;
    applyChannelSecretsToEnv(config);
    expect(process.env.DISCORD_BOT_TOKEN).toBe("discord-tok-123");
  });

  it("copies Telegram botToken from config to env", () => {
    const config = {
      channels: { telegram: { botToken: "tg-tok-456" } },
    } as MilaidyConfig;
    applyChannelSecretsToEnv(config);
    expect(process.env.TELEGRAM_BOT_TOKEN).toBe("tg-tok-456");
  });

  it("copies all Slack tokens from config to env", () => {
    const config = {
      channels: {
        slack: { botToken: "xoxb-1", appToken: "xapp-1", userToken: "xoxp-1" },
      },
    } as MilaidyConfig;
    applyChannelSecretsToEnv(config);
    expect(process.env.SLACK_BOT_TOKEN).toBe("xoxb-1");
    expect(process.env.SLACK_APP_TOKEN).toBe("xapp-1");
    expect(process.env.SLACK_USER_TOKEN).toBe("xoxp-1");
  });

  it("does not overwrite existing env values", () => {
    process.env.TELEGRAM_BOT_TOKEN = "already-set";
    const config = {
      channels: { telegram: { botToken: "new-tok" } },
    } as MilaidyConfig;
    applyChannelSecretsToEnv(config);
    expect(process.env.TELEGRAM_BOT_TOKEN).toBe("already-set");
  });

  it("skips empty or whitespace-only values", () => {
    const config = { channels: { discord: { token: "  " } } } as MilaidyConfig;
    applyChannelSecretsToEnv(config);
    expect(process.env.DISCORD_BOT_TOKEN).toBeUndefined();
  });

  it("handles missing channels gracefully", () => {
    expect(() => applyChannelSecretsToEnv({} as MilaidyConfig)).not.toThrow();
  });

  it("handles unknown channel names gracefully", () => {
    const config = {
      channels: { unknownChannel: { token: "tok" } },
    } as unknown as MilaidyConfig;
    expect(() => applyChannelSecretsToEnv(config)).not.toThrow();
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
    } as MilaidyConfig;
    applyCloudConfigToEnv(config);
    expect(process.env.ELIZAOS_CLOUD_ENABLED).toBe("true");
    expect(process.env.ELIZAOS_CLOUD_API_KEY).toBe("ck-123");
    expect(process.env.ELIZAOS_CLOUD_BASE_URL).toBe("https://cloud.test");
  });

  it("does not overwrite existing env values", () => {
    process.env.ELIZAOS_CLOUD_API_KEY = "existing";
    const config = { cloud: { apiKey: "new-key" } } as MilaidyConfig;
    applyCloudConfigToEnv(config);
    expect(process.env.ELIZAOS_CLOUD_API_KEY).toBe("existing");
  });

  it("handles missing cloud config gracefully", () => {
    expect(() => applyCloudConfigToEnv({} as MilaidyConfig)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// buildCharacterFromConfig
// ---------------------------------------------------------------------------

describe("buildCharacterFromConfig", () => {
  const envKeys = ["ANTHROPIC_API_KEY", "OPENAI_API_KEY"];
  const snap = envSnapshot(envKeys);
  beforeEach(() => {
    snap.save();
    for (const k of envKeys) delete process.env[k];
  });
  afterEach(() => snap.restore());

  it("uses agent name from agents.list", () => {
    const config = {
      agents: { list: [{ id: "main", name: "Sakuya" }] },
    } as MilaidyConfig;
    const char = buildCharacterFromConfig(config);
    expect(char.name).toBe("Sakuya");
  });

  it("falls back to config.ui.assistant.name", () => {
    const config = {
      ui: { assistant: { name: "Reimu" } },
    } as unknown as MilaidyConfig;
    const char = buildCharacterFromConfig(config);
    expect(char.name).toBe("Reimu");
  });

  it("defaults to 'Milaidy' when no name is configured", () => {
    const char = buildCharacterFromConfig({} as MilaidyConfig);
    expect(char.name).toBe("Milaidy");
  });

  it("collects API keys from process.env as secrets", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    process.env.OPENAI_API_KEY = "sk-oai-test";
    const char = buildCharacterFromConfig({} as MilaidyConfig);
    expect(char.secrets?.ANTHROPIC_API_KEY).toBe("sk-ant-test");
    expect(char.secrets?.OPENAI_API_KEY).toBe("sk-oai-test");
  });

  it("excludes empty or whitespace-only env values from secrets", () => {
    process.env.ANTHROPIC_API_KEY = "  ";
    const char = buildCharacterFromConfig({} as MilaidyConfig);
    expect(char.secrets?.ANTHROPIC_API_KEY).toBeUndefined();
  });

  it("uses default bio and system prompt (character data lives in DB)", () => {
    const config = {
      agents: { list: [{ id: "main", name: "Test" }] },
    } as MilaidyConfig;
    const char = buildCharacterFromConfig(config);
    const bioText = Array.isArray(char.bio) ? char.bio.join(" ") : char.bio;
    expect(bioText).toContain("AI assistant");
    expect(char.system).toContain("autonomous AI agent");
  });

  // ── Default template fields (character data is in the DB) ────────────

  it("uses default bio with {{name}} placeholder", () => {
    const config = {
      agents: { list: [{ id: "main", name: "Sakuya" }] },
    } as MilaidyConfig;
    const char = buildCharacterFromConfig(config);
    expect(Array.isArray(char.bio)).toBe(true);
    const bioArr = char.bio as string[];
    expect(bioArr[0]).toContain("{{name}}");
  });

  it("uses default system prompt with {{name}} placeholder", () => {
    const config = {
      agents: { list: [{ id: "main", name: "Sakuya" }] },
    } as MilaidyConfig;
    const char = buildCharacterFromConfig(config);
    expect(char.system).toContain("{{name}}");
  });

  it("defaults bio to {{name}} placeholder when not configured", () => {
    const char = buildCharacterFromConfig({} as MilaidyConfig);
    const bioArr = char.bio as string[];
    expect(bioArr.some((b: string) => b.includes("{{name}}"))).toBe(true);
  });

  it("defaults system to {{name}} placeholder when not configured", () => {
    const char = buildCharacterFromConfig({} as MilaidyConfig);
    expect(char.system).toContain("{{name}}");
  });

  it("does not throw when agents.list is empty", () => {
    const config = { agents: { list: [] } } as MilaidyConfig;
    expect(() => buildCharacterFromConfig(config)).not.toThrow();
    expect(buildCharacterFromConfig(config).name).toBe("Milaidy");
  });

  it("builds a character with name from agents.list and default personality", () => {
    const config = {
      agents: { list: [{ id: "main", name: "Reimu" }] },
    } as MilaidyConfig;
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
    expect(resolvePrimaryModel({} as MilaidyConfig)).toBeUndefined();
  });

  it("returns undefined when agents.defaults.model is missing", () => {
    const config = { agents: { defaults: {} } } as MilaidyConfig;
    expect(resolvePrimaryModel(config)).toBeUndefined();
  });

  it("returns the primary model when configured", () => {
    const config = {
      agents: { defaults: { model: { primary: "gpt-5" } } },
    } as MilaidyConfig;
    expect(resolvePrimaryModel(config)).toBe("gpt-5");
  });

  it("returns undefined when model has no primary", () => {
    const config = {
      agents: { defaults: { model: { fallbacks: ["gpt-5-mini"] } } },
    } as unknown as MilaidyConfig;
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
      path.join(pkgRoot, "dist", "index.js"),
      "export default {}",
    );
    await fs.writeFile(
      path.join(pkgRoot, "package.json"),
      JSON.stringify({ main: "./dist/index.js" }),
    );

    const entry = await resolvePackageEntry(pkgRoot);
    expect(entry).toBe(path.resolve(pkgRoot, "./dist/index.js"));
  });

  it("resolves entry from package.json exports string", async () => {
    const pkgRoot = path.join(tmpDir, "plugin-b");
    await fs.mkdir(path.join(pkgRoot, "lib"), { recursive: true });
    await fs.writeFile(
      path.join(pkgRoot, "lib", "main.js"),
      "export default {}",
    );
    await fs.writeFile(
      path.join(pkgRoot, "package.json"),
      JSON.stringify({ exports: "./lib/main.js" }),
    );

    const entry = await resolvePackageEntry(pkgRoot);
    expect(entry).toBe(path.resolve(pkgRoot, "./lib/main.js"));
  });

  it("resolves entry from package.json exports map (dot entry)", async () => {
    const pkgRoot = path.join(tmpDir, "plugin-c");
    await fs.mkdir(path.join(pkgRoot, "dist"), { recursive: true });
    await fs.writeFile(
      path.join(pkgRoot, "dist", "index.js"),
      "export default {}",
    );
    await fs.writeFile(
      path.join(pkgRoot, "package.json"),
      JSON.stringify({
        exports: {
          ".": { import: "./dist/index.js", default: "./dist/index.js" },
        },
      }),
    );

    const entry = await resolvePackageEntry(pkgRoot);
    expect(entry).toBe(path.resolve(pkgRoot, "./dist/index.js"));
  });

  it("resolves entry from exports dot-string shorthand", async () => {
    const pkgRoot = path.join(tmpDir, "plugin-d");
    await fs.mkdir(path.join(pkgRoot, "out"), { recursive: true });
    await fs.writeFile(
      path.join(pkgRoot, "out", "mod.js"),
      "export default {}",
    );
    await fs.writeFile(
      path.join(pkgRoot, "package.json"),
      JSON.stringify({ exports: { ".": "./out/mod.js" } }),
    );

    const entry = await resolvePackageEntry(pkgRoot);
    expect(entry).toBe(path.resolve(pkgRoot, "./out/mod.js"));
  });

  it("falls back to dist/index.js when package.json has no main or exports", async () => {
    const pkgRoot = path.join(tmpDir, "plugin-e");
    await fs.mkdir(pkgRoot, { recursive: true });
    await fs.writeFile(
      path.join(pkgRoot, "package.json"),
      JSON.stringify({ name: "plugin-e", version: "1.0.0" }),
    );

    const entry = await resolvePackageEntry(pkgRoot);
    expect(entry).toBe(path.join(pkgRoot, "dist", "index.js"));
  });

  it("falls back to dist/index.js when no package.json exists", async () => {
    const pkgRoot = path.join(tmpDir, "plugin-f");
    await fs.mkdir(pkgRoot, { recursive: true });

    const entry = await resolvePackageEntry(pkgRoot);
    expect(entry).toBe(path.join(pkgRoot, "dist", "index.js"));
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

  // ── Happy path ──────────────────────────────────────────────────────

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
      await fs.writeFile(path.join(dir, "package.json"), JSON.stringify({ name: n }));
    }
    const records = await scanDropInPlugins(tmpDir);
    expect(Object.keys(records)).toHaveLength(3);
    expect(records["a"]).toBeDefined();
    expect(records["b"]).toBeDefined();
    expect(records["c"]).toBeDefined();
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

  // ── Empty / missing inputs ────────────────────────────────────────

  it("returns empty record for a nonexistent directory", async () => {
    const records = await scanDropInPlugins(path.join(tmpDir, "nope"));
    expect(Object.keys(records)).toHaveLength(0);
  });

  it("returns empty record for an empty directory", async () => {
    const records = await scanDropInPlugins(tmpDir);
    expect(Object.keys(records)).toHaveLength(0);
  });

  it("ignores plain files (only directories are plugins)", async () => {
    await fs.writeFile(path.join(tmpDir, "stray.js"), "export default {}");
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

  // ── Boundary: name/version edge cases ──────────────────────────────

  it("falls back to directory name when name is whitespace-only", async () => {
    const dir = path.join(tmpDir, "ws-name");
    await fs.mkdir(dir);
    await fs.writeFile(
      path.join(dir, "package.json"),
      JSON.stringify({ name: "   ", version: "1.0.0" }),
    );
    const records = await scanDropInPlugins(tmpDir);
    // whitespace-only name is falsy after trim → uses dir name
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

  // ── Error / invalid inputs ────────────────────────────────────────

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
    // empty string → JSON.parse throws → falls back to dir name
    expect(records["empty-pkg"]).toBeDefined();
  });

  it("handles package.json that is an array (not an object)", async () => {
    const dir = path.join(tmpDir, "arr-pkg");
    await fs.mkdir(dir);
    await fs.writeFile(path.join(dir, "package.json"), "[1, 2, 3]");
    const records = await scanDropInPlugins(tmpDir);
    // Array has no .name string property → falls back to dir name
    expect(records["arr-pkg"]).toBeDefined();
  });

  // ── Structural edge cases ─────────────────────────────────────────

  it("only scans immediate children, not nested subdirectories", async () => {
    // Create: tmpDir/parent/child/ — only parent should be found
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
// findPluginExport (from plugins-cli.ts — tested via import)
// ---------------------------------------------------------------------------

// We can't import findPluginExport directly (it's not exported from the CLI),
// so we re-test the same logic that extractPlugin uses, which is the runtime
// equivalent. extractPlugin is private in eliza.ts, but we can test the
// behavior through resolvePackageEntry + actual imports end-to-end.

describe("plugin export detection (end-to-end import chain)", () => {
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
    const filePath = path.join(distDir, "index.js");
    await fs.writeFile(filePath, code);
    await fs.writeFile(
      path.join(dir, "package.json"),
      JSON.stringify({ name: "test-plugin", main: "dist/index.js" }),
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
    expect(entry).toBe(path.join(pluginDir, "dist", "index.js"));

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
      path.join(distDir, "index.js"),
      `export const plugin = { name: "named", description: "via exports map" };`,
    );
    await fs.writeFile(
      path.join(pluginDir, "package.json"),
      JSON.stringify({ exports: { ".": "./dist/index.js" } }),
    );
    const entry = await resolvePackageEntry(pluginDir);
    expect(entry).toBe(path.resolve(pluginDir, "./dist/index.js"));

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
    expect(entry).toBe(path.join(pluginDir, "dist", "index.js"));
  });

  it("rejects import when entry point file does not exist", async () => {
    const pluginDir = path.join(tmpDir, "missing-dist");
    await fs.mkdir(pluginDir, { recursive: true });
    await fs.writeFile(
      path.join(pluginDir, "package.json"),
      JSON.stringify({ name: "ghost", main: "dist/index.js" }),
    );

    const entry = await resolvePackageEntry(pluginDir);
    const { pathToFileURL } = await import("node:url");

    await expect(import(pathToFileURL(entry).href)).rejects.toThrow();
  });
});
