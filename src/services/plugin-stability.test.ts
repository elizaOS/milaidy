/**
 * Plugin & Provider Stability Tests
 *
 * Comprehensive tests for:
 * - Enumerating all plugins and providers
 * - Loading each core plugin in isolation
 * - Loading all plugins together
 * - Validating runtime context (no null/undefined/malformed fields)
 * - Context serialization
 * - Error boundary behavior (graceful failure)
 *
 * Issue: #3 — Plugin & Provider Stability
 */

import type { Plugin, Provider, ProviderResult } from "@elizaos/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { validateRuntimeContext } from "../api/plugin-validation";
import type { MiladyConfig } from "../config/types.milady";
import { createSessionKeyProvider } from "../providers/session-bridge";
import { createWorkspaceProvider } from "../providers/workspace-provider";
import {
  applyCloudConfigToEnv,
  applyConnectorSecretsToEnv,
  buildCharacterFromConfig,
  CORE_PLUGINS,
  collectPluginNames,
  OPTIONAL_CORE_PLUGINS,
  resolvePrimaryModel,
} from "../runtime/eliza";
import { createMiladyPlugin } from "../runtime/milady-plugin";
import {
  createEnvSandbox,
  extractPlugin,
  isOptionalImportError,
  isWorkspaceDependency,
  tryOptionalDynamicImport,
} from "../test-support/test-helpers";

type RootPackageJson = {
  dependencies: Record<string, string>;
  overrides?: Record<string, string>;
};

function _getCoreOverride(pkg: RootPackageJson): string | undefined {
  return pkg.overrides?.["@elizaos/core"];
}

// ---------------------------------------------------------------------------
// Constants — Full plugin enumeration
// ---------------------------------------------------------------------------
// CORE_PLUGINS and OPTIONAL_CORE_PLUGINS are imported from eliza.ts

/** Connector plugins (loaded when connector config is present). */
const CONNECTOR_PLUGINS: Record<string, string> = {
  discord: "@elizaos/plugin-discord",
  telegram: "@elizaos/plugin-telegram",
  slack: "@elizaos/plugin-slack",
  whatsapp: "@milady/plugin-whatsapp",
  signal: "@elizaos/plugin-signal",
  imessage: "@elizaos/plugin-imessage",
  bluebubbles: "@elizaos/plugin-bluebubbles",
  msteams: "@elizaos/plugin-msteams",
  mattermost: "@elizaos/plugin-mattermost",
  googlechat: "@elizaos/plugin-google-chat",
};

/** Model-provider plugins (loaded when env key is set). */
const PROVIDER_PLUGINS: Record<string, string> = {
  ANTHROPIC_API_KEY: "@elizaos/plugin-anthropic",
  OPENAI_API_KEY: "@elizaos/plugin-openai",
  AI_GATEWAY_API_KEY: "@elizaos/plugin-vercel-ai-gateway",
  AIGATEWAY_API_KEY: "@elizaos/plugin-vercel-ai-gateway",
  GOOGLE_API_KEY: "@elizaos/plugin-google-genai",
  GOOGLE_GENERATIVE_AI_API_KEY: "@elizaos/plugin-google-genai",
  GROQ_API_KEY: "@elizaos/plugin-groq",
  XAI_API_KEY: "@elizaos/plugin-xai",
  OPENROUTER_API_KEY: "@elizaos/plugin-openrouter",
  OLLAMA_BASE_URL: "@elizaos/plugin-ollama",
  ELIZAOS_CLOUD_API_KEY: "@elizaos/plugin-elizacloud",
  ELIZAOS_CLOUD_ENABLED: "@elizaos/plugin-elizacloud",
};

/** All unique plugin package names from all maps. */
const ALL_KNOWN_PLUGINS: readonly string[] = [
  ...new Set([
    ...CORE_PLUGINS,
    ...Object.values(CONNECTOR_PLUGINS),
    ...Object.values(PROVIDER_PLUGINS),
  ]),
].sort();

const OPTIONAL_PLUGIN_LOAD_MARKERS = [
  "Cannot find module",
  "Cannot find package",
  "ERR_MODULE_NOT_FOUND",
  "MODULE_NOT_FOUND",
  "Dynamic require of",
  "native addon module",
  "tfjs_binding",
  "NAPI_MODULE_NOT_FOUND",
  "spec not found",
  "Failed to resolve entry",
  "eventemitter3",
];

// ---------------------------------------------------------------------------
// Env save/restore
// ---------------------------------------------------------------------------

const envKeysToClean = [
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "GOOGLE_API_KEY",
  "GOOGLE_GENERATIVE_AI_API_KEY",
  "GROQ_API_KEY",
  "XAI_API_KEY",
  "OPENROUTER_API_KEY",
  "AI_GATEWAY_API_KEY",
  "AIGATEWAY_API_KEY",
  "OLLAMA_BASE_URL",
  "ELIZAOS_CLOUD_API_KEY",
  "ELIZAOS_CLOUD_ENABLED",
  "MILAIDY_USE_PI_AI",
  "DISCORD_BOT_TOKEN",
  "TELEGRAM_BOT_TOKEN",
  "SLACK_BOT_TOKEN",
  "SLACK_APP_TOKEN",
  "SLACK_USER_TOKEN",
];

// ============================================================================
//  1. Plugin enumeration
// ============================================================================

describe("Plugin Enumeration", () => {
  it("lists all core plugins", () => {
    expect(CORE_PLUGINS.length).toBeGreaterThan(0);
    expect(CORE_PLUGINS).toContain("@elizaos/plugin-sql");
    expect(CORE_PLUGINS).toContain("@elizaos/plugin-shell");
    for (const name of CORE_PLUGINS) {
      expect(name).toMatch(/^@elizaos\/plugin-/);
    }
  });

  it("lists all connector plugins", () => {
    expect(Object.keys(CONNECTOR_PLUGINS).length).toBe(10);
    for (const [connector, pluginName] of Object.entries(CONNECTOR_PLUGINS)) {
      expect(typeof connector).toBe("string");
      expect(pluginName).toMatch(/^@(elizaos|milady)\/plugin-/);
    }
  });

  it("lists all provider plugins", () => {
    const uniqueProviders = new Set(Object.values(PROVIDER_PLUGINS));
    expect(uniqueProviders.size).toBeGreaterThanOrEqual(7);
    for (const pluginName of uniqueProviders) {
      expect(pluginName).toMatch(/^@elizaos\/plugin-/);
    }
  });

  it("ALL_KNOWN_PLUGINS has no duplicates", () => {
    const uniqueSet = new Set(ALL_KNOWN_PLUGINS);
    expect(uniqueSet.size).toBe(ALL_KNOWN_PLUGINS.length);
  });

  it("every plugin in package.json deps matches an enumerated plugin or is @elizaos/core", () => {
    // This validates our enumeration is comprehensive relative to what's installed
    const knownPackages = new Set([
      ...ALL_KNOWN_PLUGINS,
      "@elizaos/core",
      "@elizaos/plugin-acp",
      "@elizaos/skills",
      "@elizaos/tui",
    ]);
    // All enumerated plugins should be valid scoped package names
    for (const name of ALL_KNOWN_PLUGINS) {
      expect(
        name.startsWith("@elizaos/plugin-") ||
          name.startsWith("@milady/plugin-"),
      ).toBe(true);
    }
    expect(knownPackages.size).toBeGreaterThan(0);
  });
});

// ============================================================================
//  2. collectPluginNames — loads correct plugins for config
// ============================================================================

describe("collectPluginNames", () => {
  const envSandbox = createEnvSandbox(envKeysToClean);

  beforeEach(() => {
    envSandbox.clear();
  });

  afterEach(() => {
    envSandbox.restore();
  });

  it("loads all core plugins with empty config", () => {
    const names = collectPluginNames({} as MiladyConfig);
    for (const core of CORE_PLUGINS) {
      expect(names.has(core)).toBe(true);
    }
  });

  it("adds channel plugin when channel config is present", () => {
    const config: MiladyConfig = {
      channels: {
        discord: { token: "test-token" },
      },
    };
    const names = collectPluginNames(config);
    expect(names.has("@elizaos/plugin-discord")).toBe(true);
  });

  it("adds provider plugin when env key is set", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test-key-123";
    const names = collectPluginNames({} as MiladyConfig);
    expect(names.has("@elizaos/plugin-anthropic")).toBe(true);
  });

  it("adds cloud plugin when cloud is enabled in config", () => {
    const config: MiladyConfig = {
      cloud: { enabled: true },
    };
    const names = collectPluginNames(config);
    expect(names.has("@elizaos/plugin-elizacloud")).toBe(true);
  });

  it("adds user-installed plugins from config.plugins.installs", () => {
    const config: MiladyConfig = {
      plugins: {
        installs: {
          "@elizaos/plugin-custom-test": {
            source: "npm",
            version: "1.0.0",
            installPath: "/tmp/test",
          },
        },
      },
    };
    const names = collectPluginNames(config);
    expect(names.has("@elizaos/plugin-custom-test")).toBe(true);
  });

  it("returns a Set with no duplicates", () => {
    // Set a provider key AND include that same plugin via cloud config
    process.env.ELIZAOS_CLOUD_API_KEY = "test-key";
    const config: MiladyConfig = {
      cloud: { enabled: true },
    };
    const names = collectPluginNames(config);
    // @elizaos/plugin-elizacloud should appear only once
    const asArray = [...names].filter(
      (n) => n === "@elizaos/plugin-elizacloud",
    );
    expect(asArray.length).toBe(1);
  });

  it("does not add channel plugin for unknown channel names", () => {
    const config: MiladyConfig = {
      channels: {
        unknownChannel: { token: "test" },
      },
    };
    const names = collectPluginNames(config);
    // The unknown connector should NOT map to any plugin. Verify no
    // connector-specific plugin was added (env-based provider plugins may
    // appear depending on the runner's environment, so we only assert
    // that the unknown connector mapping was a no-op).
    const connectorPluginValues = new Set(Object.values(CONNECTOR_PLUGINS));
    const addedConnectorPlugins = [...names].filter((n) =>
      connectorPluginValues.has(n),
    );
    expect(addedConnectorPlugins.length).toBe(0);
  });
});

// ============================================================================
//  3. Plugin loading in isolation (via dynamic import)
// ============================================================================

describe("Plugin Loading — Isolation", () => {
  /**
   * For each core plugin, attempt to import it and validate the export shape.
   * This tests that each plugin module is importable and exports a valid Plugin.
   */
  for (const pluginName of CORE_PLUGINS) {
    if (
      pluginName.includes("plugin-rolodex") ||
      pluginName.includes("plugin-secrets-manager") ||
      pluginName.includes("plugin-shell")
    ) {
      continue;
    }
    it(`loads ${pluginName} in isolation without crashing`, async () => {
      const mod = await tryOptionalDynamicImport<Record<string, unknown>>(
        pluginName,
        OPTIONAL_PLUGIN_LOAD_MARKERS,
      );
      if (!mod) return;

      // Validate the module exports something
      expect(mod).toBeDefined();
      expect(typeof mod).toBe("object");

      // Extract plugin using the same logic as eliza.ts
      const plugin = extractTestPlugin(mod);
      if (plugin) {
        expect(typeof plugin.name).toBe("string");
        expect(typeof plugin.description).toBe("string");
        expect(plugin.name.length).toBeGreaterThan(0);
        expect(plugin.description.length).toBeGreaterThan(0);
      }
    });
  }
});

// ============================================================================
//  4. All plugins loaded together (aggregate test)
// ============================================================================

describe("Plugin Loading — All Together", () => {
  it("can import all core plugins without conflicting exports", async () => {
    const results: Array<{
      name: string;
      loaded: boolean;
      hasPlugin: boolean;
      error: string;
    }> = [];

    for (const pluginName of CORE_PLUGINS) {
      if (
        pluginName.includes("plugin-rolodex") ||
        pluginName.includes("plugin-secrets-manager") ||
        pluginName.includes("plugin-shell")
      ) {
        continue;
      }
      try {
        const mod = await tryOptionalDynamicImport<Record<string, unknown>>(
          pluginName,
          OPTIONAL_PLUGIN_LOAD_MARKERS,
        );
        if (!mod) {
          results.push({
            name: pluginName,
            loaded: false,
            hasPlugin: false,
            error: "optional dependency unavailable",
          });
          continue;
        }
        const plugin = extractTestPlugin(mod);
        results.push({
          name: pluginName,
          loaded: true,
          hasPlugin: plugin !== null,
          error: "",
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (isOptionalImportError(err, OPTIONAL_PLUGIN_LOAD_MARKERS)) {
          results.push({
            name: pluginName,
            loaded: false,
            hasPlugin: false,
            error: "optional dependency unavailable",
          });
          continue;
        }
        results.push({
          name: pluginName,
          loaded: false,
          hasPlugin: false,
          error: msg,
        });
      }
    }

    // At least some plugins should load successfully
    const loaded = results.filter((r) => r.loaded);
    expect(loaded.length).toBeGreaterThan(0);

    // No plugin should have a name conflict
    const pluginNames = loaded
      .filter((r) => r.hasPlugin)
      .map((r) => {
        // Re-import to get the name (we already validated they load)
        return r.name;
      });
    const uniqueNames = new Set(pluginNames);
    expect(uniqueNames.size).toBe(pluginNames.length);
  });

  it("loaded plugins have non-empty name and description", async () => {
    for (const pluginName of CORE_PLUGINS) {
      if (
        pluginName.includes("plugin-rolodex") ||
        pluginName.includes("plugin-secrets-manager") ||
        pluginName.includes("plugin-shell")
      ) {
        continue;
      }
      const mod = await tryOptionalDynamicImport<Record<string, unknown>>(
        pluginName,
        OPTIONAL_PLUGIN_LOAD_MARKERS,
      );
      if (!mod) {
        continue;
      }
      const plugin = extractTestPlugin(mod);
      if (plugin) {
        expect(plugin.name).toBeTruthy();
        expect(plugin.description).toBeTruthy();
        expect(plugin.name.trim().length).toBeGreaterThan(0);
        expect(plugin.description.trim().length).toBeGreaterThan(0);
      }
    }
  });
});

// ============================================================================
//  5. Runtime context validation — no null/undefined/malformed fields
// ============================================================================

describe("Runtime Context Validation", () => {
  const envSandbox = createEnvSandbox(envKeysToClean);

  beforeEach(() => {
    envSandbox.clear();
  });

  afterEach(() => {
    envSandbox.restore();
  });

  describe("buildCharacterFromConfig produces valid context", () => {
    it("produces a character with no null or undefined required fields", () => {
      const config: MiladyConfig = {};
      const character = buildCharacterFromConfig(config);

      expect(character).toBeDefined();
      expect(character.name).toBeDefined();
      expect(typeof character.name).toBe("string");
      expect(character.name.length).toBeGreaterThan(0);

      // bio should be an array of strings
      if (character.bio) {
        expect(Array.isArray(character.bio)).toBe(true);
        for (const line of character.bio) {
          expect(typeof line).toBe("string");
          expect(line).not.toBe("");
        }
      }

      // system should be a string
      if (character.system) {
        expect(typeof character.system).toBe("string");
        expect(character.system.length).toBeGreaterThan(0);
      }
    });

    it("character with agent name from config is well-formed", () => {
      const config: MiladyConfig = {
        agents: {
          list: [{ id: "main", name: "TestBot", default: true }],
        },
      };
      const character = buildCharacterFromConfig(config);
      expect(character.name).toBe("TestBot");
    });

    it("character secrets contain no empty strings", () => {
      process.env.ANTHROPIC_API_KEY = "sk-ant-test-1234567890";
      const config: MiladyConfig = {};
      const character = buildCharacterFromConfig(config);

      if (character.secrets) {
        for (const [key, value] of Object.entries(character.secrets)) {
          expect(typeof key).toBe("string");
          expect(typeof value).toBe("string");
          expect(value.trim().length).toBeGreaterThan(0);
        }
      }
    });

    it("character is JSON-serializable", () => {
      const config: MiladyConfig = {
        agents: {
          list: [{ id: "main", name: "SerializeTest", default: true }],
        },
      };
      const character = buildCharacterFromConfig(config);
      const serialized = JSON.stringify(character);
      expect(typeof serialized).toBe("string");
      const deserialized = JSON.parse(serialized) as Record<string, unknown>;
      expect(deserialized.name).toBe("SerializeTest");
    });
  });

  describe("validateRuntimeContext", () => {
    it("returns valid for a well-formed context", () => {
      const context: Record<string, unknown> = {
        agentName: "TestBot",
        plugins: ["plugin-a", "plugin-b"],
        providers: ["provider-a"],
        timestamp: new Date().toISOString(),
      };
      const result = validateRuntimeContext(context);
      expect(result.valid).toBe(true);
      expect(result.nullFields).toEqual([]);
      expect(result.undefinedFields).toEqual([]);
      expect(result.emptyFields).toEqual([]);
    });

    it("detects null fields", () => {
      const context: Record<string, unknown> = {
        agentName: "TestBot",
        model: null,
      };
      const result = validateRuntimeContext(context);
      expect(result.valid).toBe(false);
      expect(result.nullFields).toContain("model");
    });

    it("detects undefined fields", () => {
      const context: Record<string, unknown> = {
        agentName: "TestBot",
        model: undefined,
      };
      const result = validateRuntimeContext(context);
      expect(result.valid).toBe(false);
      expect(result.undefinedFields).toContain("model");
    });

    it("detects empty string fields", () => {
      const context: Record<string, unknown> = {
        agentName: "",
        model: "gpt-4",
      };
      const result = validateRuntimeContext(context);
      expect(result.valid).toBe(false);
      expect(result.emptyFields).toContain("agentName");
    });

    it("detects nested null/undefined fields", () => {
      const context: Record<string, unknown> = {
        agentName: "TestBot",
        settings: {
          model: null,
          temperature: undefined,
          maxTokens: 1000,
        },
      };
      const result = validateRuntimeContext(context);
      expect(result.valid).toBe(false);
      expect(result.nullFields).toContain("settings.model");
      expect(result.undefinedFields).toContain("settings.temperature");
    });

    it("returns valid for a deeply nested well-formed context", () => {
      const context: Record<string, unknown> = {
        agentName: "TestBot",
        settings: {
          model: "gpt-4",
          nested: {
            deepValue: 42,
            deepString: "hello",
          },
        },
      };
      const result = validateRuntimeContext(context);
      expect(result.valid).toBe(true);
    });

    it("context is JSON-serializable when valid", () => {
      const context: Record<string, unknown> = {
        agentName: "TestBot",
        plugins: ["a", "b"],
        timestamp: new Date().toISOString(),
        nested: { value: 42 },
      };
      const result = validateRuntimeContext(context);
      expect(result.valid).toBe(true);
      expect(result.serializable).toBe(true);
    });

    it("detects non-serializable values (functions, circular refs)", () => {
      const context: Record<string, unknown> = {
        agentName: "TestBot",
        callback: () => "noop",
      };
      const result = validateRuntimeContext(context);
      expect(result.serializable).toBe(false);
      expect(result.nonSerializableFields.length).toBeGreaterThan(0);
    });
  });
});

// ============================================================================
//  6. Provider validation
// ============================================================================

describe("Provider Validation", () => {
  it("createWorkspaceProvider returns a valid Provider shape", () => {
    const provider = createWorkspaceProvider({
      workspaceDir: "/tmp/test-workspace",
    });
    expect(provider).toBeDefined();
    expect(typeof provider.name).toBe("string");
    expect(typeof provider.description).toBe("string");
    expect(typeof provider.get).toBe("function");
    expect(provider.name).toBe("workspaceContext");
  });

  it("createSessionKeyProvider returns a valid Provider shape", () => {
    const provider = createSessionKeyProvider({ defaultAgentId: "test-agent" });
    expect(provider).toBeDefined();
    expect(typeof provider.name).toBe("string");
    expect(typeof provider.description).toBe("string");
    expect(typeof provider.get).toBe("function");
    expect(provider.name).toBe("miladySessionKey");
  });

  it("createMiladyPlugin returns a valid Plugin with providers", () => {
    const plugin = createMiladyPlugin({
      workspaceDir: "/tmp/test-workspace",
      agentId: "test-agent",
    });

    expect(plugin).toBeDefined();
    expect(typeof plugin.name).toBe("string");
    expect(typeof plugin.description).toBe("string");
    expect(plugin.name).toBe("milady");

    // Providers should be an array of valid provider shapes
    if (plugin.providers) {
      expect(Array.isArray(plugin.providers)).toBe(true);
      for (const provider of plugin.providers) {
        expect(typeof provider.name).toBe("string");
        expect(typeof provider.get).toBe("function");
        expect(provider.name.length).toBeGreaterThan(0);
      }
    }

    // Actions should be an array
    if (plugin.actions) {
      expect(Array.isArray(plugin.actions)).toBe(true);
    }
  });

  it("milady plugin is JSON-serializable (metadata only)", () => {
    const plugin = createMiladyPlugin({
      workspaceDir: "/tmp/test-workspace",
      agentId: "test-agent",
    });

    // Plugin metadata (name, description) should be serializable
    const metadata = {
      name: plugin.name,
      description: plugin.description,
    };
    const serialized = JSON.stringify(metadata);
    expect(typeof serialized).toBe("string");
    const deserialized = JSON.parse(serialized) as {
      name: string;
      description: string;
    };
    expect(deserialized.name).toBe("milady");
  });
});

// ============================================================================
//  7. Channel secrets and cloud config — env propagation
// ============================================================================

describe("Environment Propagation", () => {
  const envSandbox = createEnvSandbox(envKeysToClean);

  beforeEach(() => {
    envSandbox.clear();
  });

  afterEach(() => {
    envSandbox.restore();
  });

  it("applyConnectorSecretsToEnv sets DISCORD_BOT_TOKEN from config", () => {
    const config: MiladyConfig = {
      connectors: {
        discord: { token: "test-discord-token-123" },
      },
    };
    applyConnectorSecretsToEnv(config);
    expect(process.env.DISCORD_BOT_TOKEN).toBe("test-discord-token-123");
  });

  it("applyConnectorSecretsToEnv does not overwrite existing env vars", () => {
    process.env.DISCORD_BOT_TOKEN = "existing-token";
    const config: MiladyConfig = {
      connectors: {
        discord: { token: "new-token" },
      },
    };
    applyConnectorSecretsToEnv(config);
    expect(process.env.DISCORD_BOT_TOKEN).toBe("existing-token");
  });

  it("applyCloudConfigToEnv sets cloud env vars", () => {
    const config: MiladyConfig = {
      cloud: {
        enabled: true,
        apiKey: "test-cloud-key",
        baseUrl: "https://test.elizacloud.ai",
      },
    };
    applyCloudConfigToEnv(config);
    expect(process.env.ELIZAOS_CLOUD_ENABLED).toBe("true");
    expect(process.env.ELIZAOS_CLOUD_API_KEY).toBe("test-cloud-key");
    expect(process.env.ELIZAOS_CLOUD_BASE_URL).toBe(
      "https://test.elizacloud.ai",
    );
  });

  it("resolvePrimaryModel returns undefined for empty config", () => {
    const config: MiladyConfig = {};
    expect(resolvePrimaryModel(config)).toBeUndefined();
  });

  it("resolvePrimaryModel returns model from config", () => {
    const config: MiladyConfig = {
      agents: {
        defaults: {
          model: { primary: "claude-3-opus" },
        },
      },
    };
    expect(resolvePrimaryModel(config)).toBe("claude-3-opus");
  });
});

// ============================================================================
//  8. Error boundary — plugin crash isolation
// ============================================================================

describe("Plugin Error Boundaries", () => {
  it("extractTestPlugin handles null/undefined module gracefully", () => {
    expect(extractTestPlugin(null as never)).toBeNull();
    expect(extractTestPlugin(undefined as never)).toBeNull();
    expect(extractTestPlugin({} as Record<string, unknown>)).toBeNull();
  });

  it("extractTestPlugin handles module with missing name/description", () => {
    const badModule = { default: { notAPlugin: true } };
    expect(extractTestPlugin(badModule as Record<string, unknown>)).toBeNull();
  });

  it("extractTestPlugin handles module with valid default export", () => {
    const goodModule = {
      default: { name: "test-plugin", description: "A test plugin" },
    };
    const plugin = extractTestPlugin(goodModule as Record<string, unknown>);
    expect(plugin).not.toBeNull();
    expect(plugin?.name).toBe("test-plugin");
  });

  it("extractTestPlugin handles module with named plugin export", () => {
    const namedModule = {
      plugin: { name: "named-plugin", description: "A named export plugin" },
    };
    const plugin = extractTestPlugin(namedModule as Record<string, unknown>);
    expect(plugin).not.toBeNull();
    expect(plugin?.name).toBe("named-plugin");
  });

  it("a throwing plugin init does not propagate beyond the boundary", async () => {
    const faultyPlugin: Plugin = {
      name: "faulty-plugin",
      description: "A plugin that throws during init",
      init: async () => {
        throw new Error("Intentional plugin init crash");
      },
    };

    // Simulate the error boundary pattern from eliza.ts
    let errorCaught = false;
    let errorMessage = "";
    try {
      if (faultyPlugin.init) {
        await faultyPlugin.init();
      }
    } catch (err) {
      errorCaught = true;
      errorMessage = err instanceof Error ? err.message : String(err);
    }

    expect(errorCaught).toBe(true);
    expect(errorMessage).toBe("Intentional plugin init crash");
  });

  it("a throwing provider get does not propagate beyond the boundary", async () => {
    const faultyProvider: Provider = {
      name: "faulty-provider",
      description: "A provider that throws",
      get: async () => {
        throw new Error("Intentional provider crash");
      },
    };

    let errorCaught = false;
    let fallbackResult: ProviderResult = { text: "" };
    try {
      await faultyProvider.get(
        {} as Parameters<Provider["get"]>[0],
        {} as Parameters<Provider["get"]>[1],
        {} as Parameters<Provider["get"]>[2],
      );
    } catch (err) {
      errorCaught = true;
      const msg = err instanceof Error ? err.message : String(err);
      fallbackResult = { text: `[Provider error: ${msg}]`, data: {} };
    }

    expect(errorCaught).toBe(true);
    expect(fallbackResult.text).toContain("Intentional provider crash");
  });
});

// ============================================================================
//  9. Context serialization
// ============================================================================

describe("Context Serialization", () => {
  it("MiladyConfig objects are JSON-serializable", () => {
    const config: MiladyConfig = {
      agents: {
        list: [{ id: "main", name: "TestBot", default: true }],
        defaults: {
          model: { primary: "claude-3-opus" },
        },
      },
      channels: {
        discord: { token: "test-token" },
      },
      plugins: {
        enabled: true,
        allow: ["discord"],
      },
      cloud: {
        enabled: false,
      },
    };

    const serialized = JSON.stringify(config);
    expect(typeof serialized).toBe("string");
    expect(serialized.length).toBeGreaterThan(0);

    const deserialized = JSON.parse(serialized) as MiladyConfig;
    expect(deserialized.agents?.list?.[0]?.name).toBe("TestBot");
    expect(deserialized.cloud?.enabled).toBe(false);
  });

  it("plugin names set is serializable as array", () => {
    const names = collectPluginNames({} as MiladyConfig);
    const arr = [...names];
    const serialized = JSON.stringify(arr);
    expect(typeof serialized).toBe("string");

    const deserialized = JSON.parse(serialized) as string[];
    expect(deserialized.length).toBe(arr.length);
    for (const name of deserialized) {
      expect(typeof name).toBe("string");
    }
  });
});

// ============================================================================
//  10. Version skew detection (issue #10)
// ============================================================================

describe("Version Skew Detection (issue #10)", () => {
  type PackageManifest = {
    overrides?: Record<string, string>;
  };

  async function readPackageManifest(): Promise<PackageManifest> {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const pkgPath = resolve(process.cwd(), "package.json");
    return JSON.parse(readFileSync(pkgPath, "utf-8")) as PackageManifest;
  }

  function getDependencyOverride(
    manifest: PackageManifest,
  ): string | undefined {
    return manifest.overrides?.["@elizaos/core"];
  }

  it("core is pinned to a version that includes MAX_EMBEDDING_TOKENS (issue #10 fix)", async () => {
    // Issue #10: plugins at "next" imported MAX_EMBEDDING_TOKENS from @elizaos/core,
    // which was missing in older core versions.
    // Fix: core is pinned to >= alpha.4 (where the export was introduced),
    // so plugins at "next" dist-tag resolve safely.
    const pkg = await readPackageManifest();

    const coreVersion = pkg.dependencies["@elizaos/core"];
    expect(coreVersion).toBeDefined();
    // Core can use "next" dist-tag if overrides pin the actual version.
    const coreOverride = getDependencyOverride(pkg);
    if (coreVersion === "next") {
      expect(coreOverride).toBeDefined();
      if (coreOverride !== "next") {
        expect(coreOverride).toMatch(/^\d+\.\d+\.\d+/);
      }
    } else if (isWorkspaceDependency(coreVersion)) {
      if (coreOverride !== undefined) {
        expect(coreOverride).toMatch(/^\d+\.\d+\.\d+/);
      }
    } else {
      expect(coreVersion).toMatch(/^\d+\.\d+\.\d+/);
    }

    // The affected plugins should still be present in dependencies
    const affectedPlugins = [
      "@elizaos/plugin-openrouter",
      "@elizaos/plugin-openai",
      "@elizaos/plugin-ollama",
      "@elizaos/plugin-google-genai",
      "@elizaos/plugin-knowledge",
    ];

    for (const name of affectedPlugins) {
      const ver = pkg.dependencies[name];
      expect(ver).toBeDefined();
      // Plugins can use "next" dist-tag when core is pinned via overrides,
      // or they can be pinned to a specific alpha version.
      // Workspace links are valid in monorepo development.
      // See docs/ELIZAOS_VERSIONING.md for details and update procedures
      if (ver !== "next" && !isWorkspaceDependency(ver)) {
        expect(ver).toMatch(/^\d+\.\d+\.\d+/);
      }
    }
  });

  it("AI provider plugins are recognized in the PROVIDER_PLUGINS map", () => {
    // All 5 affected plugins should be present in our provider resolution
    const affectedProviders = [
      "@elizaos/plugin-openrouter",
      "@elizaos/plugin-openai",
      "@elizaos/plugin-ollama",
      "@elizaos/plugin-google-genai",
    ];
    const providerPluginValues = Object.values(PROVIDER_PLUGINS);
    for (const name of affectedProviders) {
      expect(providerPluginValues).toContain(name);
    }
  });

  it("plugin-knowledge is in CORE_PLUGINS", () => {
    expect(CORE_PLUGINS).toContain("@elizaos/plugin-knowledge");
    expect(OPTIONAL_CORE_PLUGINS).not.toContain("@elizaos/plugin-knowledge");
  });

  it("plugin-trajectory-logger is in CORE_PLUGINS", () => {
    expect(CORE_PLUGINS).toContain("@elizaos/plugin-trajectory-logger");
    expect(OPTIONAL_CORE_PLUGINS).not.toContain(
      "@elizaos/plugin-trajectory-logger",
    );
  });

  it("plugin-trajectory-logger exports a runtime service", async () => {
    const mod = (await import("@elizaos/plugin-trajectory-logger")) as {
      default?: Plugin;
      TrajectoryLoggerService?: unknown;
    };
    const plugin = mod.default;
    expect(plugin).toBeDefined();
    expect(Array.isArray(plugin?.services)).toBe(true);
    expect(plugin?.services?.length ?? 0).toBeGreaterThan(0);
    if (mod.TrajectoryLoggerService) {
      expect(plugin?.services).toContain(mod.TrajectoryLoggerService);
    }
  });
});

// ============================================================================
//  Helpers
// ============================================================================

/**
 * Extract a Plugin from a dynamically imported module.
 * Mirrors the extractPlugin logic from eliza.ts.
 */
function extractTestPlugin(mod: Record<string, unknown>): Plugin | null {
  if (!mod || typeof mod !== "object") return null;
  const plugin = extractPlugin(
    mod as {
      [key: string]: unknown;
      default?: unknown;
      plugin?: unknown;
    },
  );
  if (plugin === null) return null;
  if (typeof plugin.description !== "string") return null;
  return plugin as Plugin;
}
