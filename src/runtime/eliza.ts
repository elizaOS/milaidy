/**
 * ElizaOS runtime entry point for Milaidy.
 *
 * Starts the ElizaOS agent runtime with Milaidy's plugin configuration.
 * Can be run directly via: node --import tsx src/runtime/eliza.ts
 * Or via the CLI: milaidy start
 *
 * @module eliza
 */
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import * as readline from "node:readline";
import { pathToFileURL } from "node:url";
import {
  AgentRuntime,
  ChannelType,
  createCharacter,
  createMessageMemory,
  logger,
  stringToUuid,
  type Character,
  type Plugin,
  type UUID,
} from "@elizaos/core";
import * as clack from "@clack/prompts";
import {
  applyPluginAutoEnable,
  type ApplyPluginAutoEnableParams,
} from "../config/plugin-auto-enable.js";
import { loadMilaidyConfig, saveMilaidyConfig, type MilaidyConfig } from "../config/config.js";
import type { AgentConfig } from "../config/types.agents.js";
import { loadHooks, triggerHook, createHookEvent, type LoadHooksOptions } from "../hooks/index.js";
import { createMilaidyPlugin } from "./milaidy-plugin.js";
import {
  ensureAgentWorkspace,
  resolveDefaultAgentWorkspaceDir,
} from "../providers/workspace.js";
import {
  validateRuntimeContext,
  debugLogResolvedContext,
} from "../api/plugin-validation.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A successfully resolved plugin ready for AgentRuntime registration. */
interface ResolvedPlugin {
  /** npm package name (e.g. "@elizaos/plugin-anthropic"). */
  name: string;
  /** The Plugin instance extracted from the module. */
  plugin: Plugin;
}

/** Shape we expect from a dynamically-imported plugin package. */
interface PluginModuleShape {
  default?: Plugin;
  plugin?: Plugin;
  [key: string]: Plugin | undefined;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract a human-readable error message from an unknown thrown value. */
function formatError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Cancel the onboarding flow and exit cleanly.
 * Extracted to avoid duplicating the cancel+exit pattern 7 times.
 */
function cancelOnboarding(): never {
  clack.cancel("Maybe next time!");
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Channel secret mapping
// ---------------------------------------------------------------------------

/**
 * Maps Milaidy channel config fields to the environment variable names
 * that ElizaOS plugins expect.
 *
 * Milaidy stores channel credentials under `config.channels.<name>.<field>`,
 * while ElizaOS plugins read them from process.env.
 */
const CHANNEL_ENV_MAP: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  discord: {
    token: "DISCORD_BOT_TOKEN",
  },
  telegram: {
    botToken: "TELEGRAM_BOT_TOKEN",
  },
  slack: {
    botToken: "SLACK_BOT_TOKEN",
    appToken: "SLACK_APP_TOKEN",
    userToken: "SLACK_USER_TOKEN",
  },
  signal: {
    account: "SIGNAL_ACCOUNT",
  },
  msteams: {
    appId: "MSTEAMS_APP_ID",
    appPassword: "MSTEAMS_APP_PASSWORD",
  },
  mattermost: {
    botToken: "MATTERMOST_BOT_TOKEN",
    baseUrl: "MATTERMOST_BASE_URL",
  },
  googlechat: {
    serviceAccountKey: "GOOGLE_CHAT_SERVICE_ACCOUNT_KEY",
  },
};

// ---------------------------------------------------------------------------
// Plugin resolution
// ---------------------------------------------------------------------------

/** Core plugins that should always be loaded. */
const CORE_PLUGINS: readonly string[] = [
  "@elizaos/plugin-sql",
  "@elizaos/plugin-local-embedding",
  "@elizaos/plugin-agent-skills",
  "@elizaos/plugin-agent-orchestrator",
  "@elizaos/plugin-directives",
  "@elizaos/plugin-commands",
  "@elizaos/plugin-shell",
  "@elizaos/plugin-personality",
  "@elizaos/plugin-experience",
  "@elizaos/plugin-plugin-manager",
  "@elizaos/plugin-cli",
  "@elizaos/plugin-code",
  "@elizaos/plugin-edge-tts",
  "@elizaos/plugin-knowledge",
  "@elizaos/plugin-mcp",
  "@elizaos/plugin-pdf",
  "@elizaos/plugin-scratchpad",
  "@elizaos/plugin-secrets-manager",
  "@elizaos/plugin-todo",
  "@elizaos/plugin-trust",
  "@elizaos/plugin-form",
  "@elizaos/plugin-goals",
  "@elizaos/plugin-scheduling",
];

/**
 * Optional plugins that require native binaries or specific config.
 * These are only loaded when explicitly enabled via features config,
 * NOT by default — they crash if their prerequisites are missing.
 */
const OPTIONAL_NATIVE_PLUGINS: readonly string[] = [
  "@elizaos/plugin-browser",       // requires browser server binary
  "@elizaos/plugin-vision",        // requires @tensorflow/tfjs-node native addon
  "@elizaos/plugin-cron",          // requires worldId at service init
  "@elizaos/plugin-computeruse",   // requires platform-specific binaries
];

/** Maps Milaidy channel names to ElizaOS plugin package names. */
const CHANNEL_PLUGIN_MAP: Readonly<Record<string, string>> = {
  discord: "@elizaos/plugin-discord",
  telegram: "@elizaos/plugin-telegram",
  slack: "@elizaos/plugin-slack",
  whatsapp: "@elizaos/plugin-whatsapp",
  signal: "@elizaos/plugin-signal",
  imessage: "@elizaos/plugin-imessage",
  bluebubbles: "@elizaos/plugin-bluebubbles",
  msteams: "@elizaos/plugin-msteams",
  mattermost: "@elizaos/plugin-mattermost",
  googlechat: "@elizaos/plugin-google-chat",
};

/** Maps environment variable names to model-provider plugin packages. */
const PROVIDER_PLUGIN_MAP: Readonly<Record<string, string>> = {
  ANTHROPIC_API_KEY: "@elizaos/plugin-anthropic",
  OPENAI_API_KEY: "@elizaos/plugin-openai",
  GOOGLE_API_KEY: "@elizaos/plugin-google-genai",
  GOOGLE_GENERATIVE_AI_API_KEY: "@elizaos/plugin-google-genai",
  GROQ_API_KEY: "@elizaos/plugin-groq",
  XAI_API_KEY: "@elizaos/plugin-xai",
  OPENROUTER_API_KEY: "@elizaos/plugin-openrouter",
  OLLAMA_BASE_URL: "@elizaos/plugin-ollama",
  // ElizaCloud — loaded when API key is present OR cloud is explicitly enabled
  ELIZAOS_CLOUD_API_KEY: "@elizaos/plugin-elizacloud",
  ELIZAOS_CLOUD_ENABLED: "@elizaos/plugin-elizacloud",
};

/**
 * Optional feature plugins keyed by feature name.
 *
 * Currently empty — reserved for future feature→plugin mappings.
 * The lookup code in {@link collectPluginNames} is intentionally kept
 * so new entries work without additional wiring.
 */
const OPTIONAL_PLUGIN_MAP: Readonly<Record<string, string>> = {
  browser: "@elizaos/plugin-browser",
  vision: "@elizaos/plugin-vision",
  cron: "@elizaos/plugin-cron",
  computeruse: "@elizaos/plugin-computeruse",
};

function looksLikePlugin(value: unknown): value is Plugin {
  if (!value || typeof value !== "object") return false;
  const obj = value as Record<string, unknown>;
  return typeof obj.name === "string" && typeof obj.description === "string";
}

function extractPlugin(mod: PluginModuleShape): Plugin | null {
  // 1. Prefer explicit default export
  if (looksLikePlugin(mod.default)) return mod.default;
  // 2. Check for a named `plugin` export
  if (looksLikePlugin(mod.plugin)) return mod.plugin;
  // 3. Check if the module itself looks like a Plugin (CJS default pattern)
  if (looksLikePlugin(mod)) return mod as unknown as Plugin;
  // 4. Scan named exports for the first value that looks like a Plugin.
  //    This handles packages whose build drops the default export but still
  //    have a named export (e.g. `knowledgePlugin` from plugin-knowledge).
  for (const key of Object.keys(mod)) {
    if (key === "default" || key === "plugin") continue;
    const value = mod[key];
    if (looksLikePlugin(value)) return value;
  }
  return null;
}

/**
 * Collect the set of plugin package names that should be loaded
 * based on config, environment variables, and feature flags.
 */
/** @internal Exported for testing. */
export function collectPluginNames(config: MilaidyConfig): Set<string> {
  const pluginsToLoad = new Set<string>(CORE_PLUGINS);

  // Channel plugins — load when channel has config entries
  const channels = config.channels ?? {};
  for (const [channelName, channelConfig] of Object.entries(channels)) {
    if (channelConfig && typeof channelConfig === "object") {
      const pluginName = CHANNEL_PLUGIN_MAP[channelName];
      if (pluginName) {
        pluginsToLoad.add(pluginName);
      }
    }
  }

  // Model-provider plugins — load when env key is present
  for (const [envKey, pluginName] of Object.entries(PROVIDER_PLUGIN_MAP)) {
    if (process.env[envKey]) {
      pluginsToLoad.add(pluginName);
    }
  }

  // ElizaCloud plugin — also load when cloud config is explicitly enabled
  if (config.cloud?.enabled) {
    pluginsToLoad.add("@elizaos/plugin-elizacloud");
  }

  // Optional feature plugins from config.plugins.entries
  const pluginsConfig = config.plugins as Record<string, Record<string, unknown>> | undefined;
  if (pluginsConfig?.entries) {
    for (const [key, entry] of Object.entries(pluginsConfig.entries)) {
      if (entry && typeof entry === "object" && (entry as Record<string, unknown>).enabled !== false) {
        const pluginName = OPTIONAL_PLUGIN_MAP[key];
        if (pluginName) {
          pluginsToLoad.add(pluginName);
        }
      }
    }
  }

  // Feature flags (config.features)
  const features = config.features;
  if (features && typeof features === "object") {
    for (const [featureName, featureValue] of Object.entries(features)) {
      const isEnabled =
        featureValue === true ||
        (typeof featureValue === "object" &&
          featureValue !== null &&
          (featureValue as Record<string, unknown>).enabled !== false);
      if (isEnabled) {
        const pluginName = OPTIONAL_PLUGIN_MAP[featureName];
        if (pluginName) {
          pluginsToLoad.add(pluginName);
        }
      }
    }
  }

  // User-installed plugins from config.plugins.installs
  // These are plugins that were installed via the plugin-manager at runtime
  // and tracked in milaidy.json so they persist across restarts.
  const installs = config.plugins?.installs;
  if (installs && typeof installs === "object") {
    for (const [packageName, record] of Object.entries(installs)) {
      if (record && typeof record === "object") {
        pluginsToLoad.add(packageName);
      }
    }
  }

  return pluginsToLoad;
}

/**
 * Resolve Milaidy plugins from config and auto-enable logic.
 * Returns an array of ElizaOS Plugin instances ready for AgentRuntime.
 *
 * Handles two categories of plugins:
 * 1. Built-in/npm plugins — imported by package name (e.g. "@elizaos/plugin-discord")
 * 2. User-installed plugins — imported by absolute path from ~/.milaidy/plugins/installed/
 *
 * Each plugin is loaded inside an error boundary so a single failing plugin
 * cannot crash the entire agent startup. Errors are logged and surfaced but
 * do not propagate.
 */
async function resolvePlugins(config: MilaidyConfig): Promise<ResolvedPlugin[]> {
  const plugins: ResolvedPlugin[] = [];
  const failedPlugins: Array<{ name: string; error: string }> = [];

  // Run auto-enable for side effects (logging which plugins would be activated).
  applyPluginAutoEnable({
    config,
    env: process.env,
  } satisfies ApplyPluginAutoEnableParams);

  const pluginsToLoad = collectPluginNames(config);
  const corePluginSet = new Set<string>(CORE_PLUGINS);

  logger.info(`[milaidy] Resolving ${pluginsToLoad.size} plugins...`);

  // Build a map of user-installed plugins with their install paths
  const installRecords = config.plugins?.installs ?? {};

  // Dynamically import each plugin inside an error boundary
  for (const pluginName of pluginsToLoad) {
    const isCore = corePluginSet.has(pluginName);
    const installRecord = installRecords[pluginName];

    try {
      let mod: PluginModuleShape;

      if (installRecord?.installPath) {
        // User-installed plugin — load from its install directory on disk.
        // This works cross-platform including .app bundles where we can't
        // modify the app's node_modules.
        mod = await importFromPath(installRecord.installPath, pluginName);
      } else {
        // Built-in/npm plugin — import by package name from node_modules.
        mod = (await import(pluginName)) as PluginModuleShape;
      }

      const pluginInstance = extractPlugin(mod);

      if (pluginInstance) {
        // Wrap the plugin's init function with an error boundary so a
        // crashing plugin.init() does not take down the entire agent.
        const wrappedPlugin = wrapPluginWithErrorBoundary(pluginName, pluginInstance);
        plugins.push({ name: pluginName, plugin: wrappedPlugin });
        logger.debug(`[milaidy] ✓ Loaded plugin: ${pluginName}`);
      } else {
        const msg = `[milaidy] Plugin ${pluginName} did not export a valid Plugin object`;
        failedPlugins.push({ name: pluginName, error: "no valid Plugin export" });
        if (isCore) {
          logger.error(msg);
        } else {
          logger.warn(msg);
        }
      }
    } catch (err) {
      // Core plugins log at error level (visible even with LOG_LEVEL=error).
      // Optional/channel plugins log at warn level so they don't spam in dev.
      const msg = formatError(err);
      failedPlugins.push({ name: pluginName, error: msg });
      if (isCore) {
        logger.error(`[milaidy] Failed to load core plugin ${pluginName}: ${msg}`);
      } else {
        logger.warn(`[milaidy] Could not load plugin ${pluginName}: ${msg}`);
      }
    }
  }

  // Summary logging
  logger.info(
    `[milaidy] Plugin resolution complete: ${plugins.length}/${pluginsToLoad.size} loaded` +
    (failedPlugins.length > 0 ? `, ${failedPlugins.length} failed` : ""),
  );
  if (failedPlugins.length > 0) {
    logger.debug(
      `[milaidy] Failed plugins: ${failedPlugins.map((f) => `${f.name} (${f.error})`).join(", ")}`,
    );
  }

  return plugins;
}

/**
 * Wrap a plugin's `init` and `providers` with error boundaries so that a
 * crash in any single plugin does not take down the entire agent or GUI.
 *
 * NOTE: Actions are NOT wrapped here because ElizaOS's action dispatch
 * already has its own error boundary.  Only `init` (startup) and
 * `providers` (called every turn) need protection at this layer.
 *
 * The wrapper catches errors, logs them with the plugin name for easy
 * debugging, and continues execution.
 */
function wrapPluginWithErrorBoundary(pluginName: string, plugin: Plugin): Plugin {
  const wrapped: Plugin = { ...plugin };

  // Wrap init if present
  if (plugin.init) {
    const originalInit = plugin.init;
    wrapped.init = async (...args: Parameters<NonNullable<Plugin["init"]>>) => {
      try {
        return await originalInit(...args);
      } catch (err) {
        logger.error(
          `[milaidy] Plugin "${pluginName}" crashed during init: ${formatError(err)}`,
        );
        // Surface the error but don't rethrow — the agent continues
        // without this plugin's init having completed.
        logger.warn(
          `[milaidy] Plugin "${pluginName}" will run in degraded mode (init failed)`,
        );
      }
    };
  }

  // Wrap providers with error boundaries
  if (plugin.providers && plugin.providers.length > 0) {
    wrapped.providers = plugin.providers.map((provider) => ({
      ...provider,
      get: async (...args: Parameters<typeof provider.get>) => {
        try {
          return await provider.get(...args);
        } catch (err) {
          const msg = formatError(err);
          logger.error(
            `[milaidy] Provider "${provider.name}" (plugin: ${pluginName}) crashed: ${msg}`,
          );
          // Return an error marker so downstream consumers can detect
          // the failure rather than silently using empty data.
          return {
            text: `[Provider ${provider.name} error: ${msg}]`,
            data: { _providerError: true },
          };
        }
      },
    }));
  }

  return wrapped;
}

/**
 * Import a plugin module from its install directory on disk.
 *
 * Handles two install layouts:
 *   1. npm layout:  <installPath>/node_modules/@scope/package/  (from `bun add`)
 *   2. git layout:  <installPath>/ is the package root directly  (from `git clone`)
 *
 * @param installPath  Root directory of the installation (e.g. ~/.milaidy/plugins/installed/foo/).
 * @param packageName  The npm package name (e.g. "@elizaos/plugin-discord") — used
 *                     to navigate directly into node_modules when present.
 */
async function importFromPath(installPath: string, packageName: string): Promise<PluginModuleShape> {
  const absPath = path.resolve(installPath);

  // npm/bun layout:  installPath/node_modules/@scope/name/
  // git layout:      installPath/ is the package itself
  const nmCandidate = path.join(absPath, "node_modules", ...packageName.split("/"));
  let pkgRoot = absPath;
  try {
    if ((await fs.stat(nmCandidate)).isDirectory()) pkgRoot = nmCandidate;
  } catch { /* git layout — pkgRoot stays as absPath */ }

  // Resolve entry point from package.json
  const entryPoint = await resolvePackageEntry(pkgRoot);
  return (await import(pathToFileURL(entryPoint).href)) as PluginModuleShape;
}

/** Read package.json exports/main to find the importable entry file. */
/** @internal Exported for testing. */
export async function resolvePackageEntry(pkgRoot: string): Promise<string> {
  const fallback = path.join(pkgRoot, "dist", "index.js");
  try {
    const raw = await fs.readFile(path.join(pkgRoot, "package.json"), "utf-8");
    const pkg = JSON.parse(raw) as {
      name?: string;
      main?: string;
      exports?: Record<string, string | Record<string, string>> | string;
    };

    if (typeof pkg.exports === "object" && pkg.exports["."] !== undefined) {
      const dot = pkg.exports["."];
      const resolved = typeof dot === "string" ? dot : (dot.import || dot.default);
      if (typeof resolved === "string") return path.resolve(pkgRoot, resolved);
    }
    if (typeof pkg.exports === "string") return path.resolve(pkgRoot, pkg.exports);
    if (pkg.main) return path.resolve(pkgRoot, pkg.main);
    return fallback;
  } catch {
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// Config → Character mapping
// ---------------------------------------------------------------------------

/**
 * Propagate channel credentials from Milaidy config into process.env so
 * that ElizaOS plugins can find them.
 */
/** @internal Exported for testing. */
export function applyChannelSecretsToEnv(config: MilaidyConfig): void {
  const channels = config.channels ?? {};

  for (const [channelName, channelConfig] of Object.entries(channels)) {
    if (!channelConfig || typeof channelConfig !== "object") continue;

    const envMap = CHANNEL_ENV_MAP[channelName];
    if (!envMap) continue;

    const configObj = channelConfig as Record<string, unknown>;
    for (const [configField, envKey] of Object.entries(envMap)) {
      const value = configObj[configField];
      if (typeof value === "string" && value.trim() && !process.env[envKey]) {
        process.env[envKey] = value;
      }
    }
  }
}

/**
 * Propagate cloud config from Milaidy config into process.env so the
 * ElizaCloud plugin can discover settings at startup.
 */
/** @internal Exported for testing. */
export function applyCloudConfigToEnv(config: MilaidyConfig): void {
  const cloud = config.cloud;
  if (!cloud) return;

  if (cloud.enabled && !process.env.ELIZAOS_CLOUD_ENABLED) {
    process.env.ELIZAOS_CLOUD_ENABLED = "true";
  }
  if (cloud.apiKey && !process.env.ELIZAOS_CLOUD_API_KEY) {
    process.env.ELIZAOS_CLOUD_API_KEY = cloud.apiKey;
  }
  if (cloud.baseUrl && !process.env.ELIZAOS_CLOUD_BASE_URL) {
    process.env.ELIZAOS_CLOUD_BASE_URL = cloud.baseUrl;
  }
}

/**
 * Build an ElizaOS Character from the Milaidy config.
 *
 * Resolves the agent name from `config.agents.list` (first entry) or
 * `config.ui.assistant.name`, falling back to "Milaidy".  Character
 * personality data (bio, system prompt, style, etc.) is stored in the
 * database — not the config file — so we only provide sensible defaults
 * here for the initial bootstrap.
 */
/** @internal Exported for testing. */
export function buildCharacterFromConfig(config: MilaidyConfig): Character {
  // Resolve name: agents list → ui assistant → "Milaidy"
  const agentEntry = config.agents?.list?.[0];
  const name =
    agentEntry?.name ??
    config.ui?.assistant?.name ??
    "Milaidy";

  const bio = ["{{name}} is an AI assistant powered by Milaidy and ElizaOS."];
  const systemPrompt = "You are {{name}}, an autonomous AI agent powered by ElizaOS.";

  // Collect secrets from process.env (API keys the plugins need)
  const secretKeys = [
    "ANTHROPIC_API_KEY",
    "OPENAI_API_KEY",
    "GOOGLE_API_KEY",
    "GOOGLE_GENERATIVE_AI_API_KEY",
    "GROQ_API_KEY",
    "XAI_API_KEY",
    "OPENROUTER_API_KEY",
    "OLLAMA_BASE_URL",
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
    // ElizaCloud secrets
    "ELIZAOS_CLOUD_API_KEY",
    "ELIZAOS_CLOUD_BASE_URL",
    "ELIZAOS_CLOUD_ENABLED",
    // Wallet / blockchain secrets
    "EVM_PRIVATE_KEY",
    "SOLANA_PRIVATE_KEY",
    "ALCHEMY_API_KEY",
    "HELIUS_API_KEY",
    "BIRDEYE_API_KEY",
    "SOLANA_RPC_URL",
  ];

  const secrets: Record<string, string> = {};
  for (const key of secretKeys) {
    const value = process.env[key];
    if (value && value.trim()) {
      secrets[key] = value;
    }
  }

  return createCharacter({
    name,
    bio,
    system: systemPrompt,
    secrets,
  });
}

/**
 * Resolve the primary model identifier from Milaidy config.
 *
 * Milaidy stores the model under `agents.defaults.model.primary` as an
 * AgentModelListConfig object. Returns undefined when no model is
 * explicitly configured (ElizaOS falls back to whichever model
 * plugin is loaded).
 */
/** @internal Exported for testing. */
export function resolvePrimaryModel(config: MilaidyConfig): string | undefined {
  const modelConfig = config.agents?.defaults?.model;
  if (!modelConfig) return undefined;

  // AgentDefaultsConfig.model is AgentModelListConfig: { primary?, fallbacks? }
  return modelConfig.primary;
}

// ---------------------------------------------------------------------------
// First-run onboarding
// ---------------------------------------------------------------------------

// Name pool + random picker shared with the web UI API server.
// See src/runtime/onboarding-names.ts for the canonical list.
import { pickRandomNames } from "./onboarding-names.js";

// ---------------------------------------------------------------------------
// Style presets — shared between CLI and GUI onboarding
// ---------------------------------------------------------------------------

import { STYLE_PRESETS } from "../onboarding-presets.js";

/**
 * Detect whether this is the first run (no agent name configured)
 * and run the onboarding flow:
 *
 *   1. Welcome banner
 *   2. Name selector (4 random + Custom)
 *   3. Catchphrase / writing-style selector
 *   4. Persist agent name to `agents.list[0]` in config
 *
 * Character personality (bio, system prompt, style) is stored in the
 * database at runtime — only the agent name lives in config.
 *
 * Subsequent runs skip this entirely.
 */
async function runFirstTimeSetup(config: MilaidyConfig): Promise<MilaidyConfig> {
  const agentEntry = config.agents?.list?.[0];
  const hasName = Boolean(agentEntry?.name || config.ui?.assistant?.name);
  if (hasName) return config;

  // Only prompt when stdin is a TTY (interactive terminal)
  if (!process.stdin.isTTY) return config;

  // ── Step 1: Welcome ────────────────────────────────────────────────────
  clack.intro("WELCOME TO MILAIDY!");

  // ── Step 2: Name ───────────────────────────────────────────────────────
  const randomNames = pickRandomNames(4);

  const nameChoice = await clack.select({
    message: "♡♡milaidy♡♡: Hey there, I'm.... err, what was my name again?",
    options: [
      ...randomNames.map((n) => ({ value: n, label: n })),
      { value: "_custom_", label: "Custom...", hint: "type your own" },
    ],
  });

  if (clack.isCancel(nameChoice)) cancelOnboarding();

  let name: string;

  if (nameChoice === "_custom_") {
    const customName = await clack.text({
      message: "OK, what should I be called?",
      placeholder: "Milaidy",
    });

    if (clack.isCancel(customName)) cancelOnboarding();

    name = customName.trim() || "Milaidy";
  } else {
    name = nameChoice;
  }

  clack.log.message(`♡♡${name}♡♡: Oh that's right, I'm ${name}!`);

  // ── Step 3: Catchphrase / writing style ────────────────────────────────
  const styleChoice = await clack.select({
    message: `${name}: Now... how do I like to talk again?`,
    options: STYLE_PRESETS.map((preset) => ({
      value: preset.catchphrase,
      label: preset.catchphrase,
      hint: preset.hint,
    })),
  });

  if (clack.isCancel(styleChoice)) cancelOnboarding();

  const chosenTemplate = STYLE_PRESETS.find(
    (p) => p.catchphrase === styleChoice,
  );

  // ── Step 4: Model provider ───────────────────────────────────────────────
  // Check whether an API key is already set in the environment (from .env or
  // shell).  If none is found, ask the user to pick a provider and enter a key.
  const PROVIDER_OPTIONS = [
    { id: "anthropic", label: "Anthropic (Claude)", envKey: "ANTHROPIC_API_KEY", hint: "sk-ant-..." },
    { id: "openai", label: "OpenAI (GPT)", envKey: "OPENAI_API_KEY", hint: "sk-..." },
    { id: "openrouter", label: "OpenRouter", envKey: "OPENROUTER_API_KEY", hint: "sk-or-..." },
    { id: "gemini", label: "Google Gemini", envKey: "GOOGLE_API_KEY", hint: "AI..." },
    { id: "grok", label: "xAI (Grok)", envKey: "XAI_API_KEY", hint: "xai-..." },
    { id: "groq", label: "Groq", envKey: "GROQ_API_KEY", hint: "gsk_..." },
    { id: "deepseek", label: "DeepSeek", envKey: "DEEPSEEK_API_KEY", hint: "sk-..." },
    { id: "mistral", label: "Mistral", envKey: "MISTRAL_API_KEY", hint: "" },
    { id: "together", label: "Together AI", envKey: "TOGETHER_API_KEY", hint: "" },
    { id: "ollama", label: "Ollama (local, free)", envKey: "OLLAMA_BASE_URL", hint: "http://localhost:11434" },
  ] as const;

  // Detect if any provider key is already configured
  const detectedProvider = PROVIDER_OPTIONS.find(
    (p) => process.env[p.envKey]?.trim(),
  );

  let providerEnvKey: string | undefined;
  let providerApiKey: string | undefined;

  if (detectedProvider) {
    clack.log.success(
      `Found existing ${detectedProvider.label} key in environment (${detectedProvider.envKey})`,
    );
  } else {
    const providerChoice = await clack.select({
      message: `${name}: One more thing — which AI provider should I use?`,
      options: [
        ...PROVIDER_OPTIONS.map((p) => ({
          value: p.id,
          label: p.label,
          hint: p.id === "ollama" ? "no API key needed" : undefined,
        })),
        { value: "_skip_", label: "Skip for now", hint: "set an API key later via env or config" },
      ],
    });

    if (clack.isCancel(providerChoice)) cancelOnboarding();

    if (providerChoice !== "_skip_") {
      const chosen = PROVIDER_OPTIONS.find((p) => p.id === providerChoice);
      if (chosen) {
        providerEnvKey = chosen.envKey;

        if (chosen.id === "ollama") {
          // Ollama just needs a base URL, default to localhost
          const ollamaUrl = await clack.text({
            message: "Ollama base URL:",
            placeholder: "http://localhost:11434",
            defaultValue: "http://localhost:11434",
          });

          if (clack.isCancel(ollamaUrl)) cancelOnboarding();

          providerApiKey = ollamaUrl.trim() || "http://localhost:11434";
        } else {
          const apiKeyInput = await clack.password({
            message: `Paste your ${chosen.label} API key:`,
          });

          if (clack.isCancel(apiKeyInput)) cancelOnboarding();

          providerApiKey = apiKeyInput.trim();
        }
      }
    }
  }

  // ── Step 5: Wallet setup ───────────────────────────────────────────────
  // Offer to generate or import wallets for EVM and Solana. Keys are
  // stored in config.env and process.env, making them available to
  // plugins at runtime.
  const { generateWalletKeys, importWallet } = await import("../api/wallet.js");

  const hasEvmKey = Boolean(process.env.EVM_PRIVATE_KEY?.trim());
  const hasSolKey = Boolean(process.env.SOLANA_PRIVATE_KEY?.trim());

  if (!hasEvmKey || !hasSolKey) {
    const walletAction = await clack.select({
      message: `${name}: Do you want me to set up crypto wallets? (for trading, NFTs, DeFi)`,
      options: [
        { value: "generate", label: "Generate new wallets", hint: "creates fresh EVM + Solana keypairs" },
        { value: "import", label: "Import existing wallets", hint: "paste your private keys" },
        { value: "skip", label: "Skip for now", hint: "wallets can be added later" },
      ],
    });

    if (clack.isCancel(walletAction)) cancelOnboarding();

    if (walletAction === "generate") {
      const keys = generateWalletKeys();

      if (!hasEvmKey) {
        process.env.EVM_PRIVATE_KEY = keys.evmPrivateKey;
        clack.log.success(`Generated EVM wallet: ${keys.evmAddress}`);
      }
      if (!hasSolKey) {
        process.env.SOLANA_PRIVATE_KEY = keys.solanaPrivateKey;
        clack.log.success(`Generated Solana wallet: ${keys.solanaAddress}`);
      }
    } else if (walletAction === "import") {
      // EVM import
      if (!hasEvmKey) {
        const evmKeyInput = await clack.password({
          message: "Paste your EVM private key (0x... hex, or skip):",
        });

        if (!clack.isCancel(evmKeyInput) && evmKeyInput.trim()) {
          const result = importWallet("evm", evmKeyInput.trim());
          if (result.success) {
            clack.log.success(`Imported EVM wallet: ${result.address}`);
          } else {
            clack.log.warn(`EVM import failed: ${result.error}`);
          }
        }
      }

      // Solana import
      if (!hasSolKey) {
        const solKeyInput = await clack.password({
          message: "Paste your Solana private key (base58, or skip):",
        });

        if (!clack.isCancel(solKeyInput) && solKeyInput.trim()) {
          const result = importWallet("solana", solKeyInput.trim());
          if (result.success) {
            clack.log.success(`Imported Solana wallet: ${result.address}`);
          } else {
            clack.log.warn(`Solana import failed: ${result.error}`);
          }
        }
      }
    }
    // "skip" — do nothing
  }

  // ── Step 6: Persist agent name + style + provider to config ─────────────
  // Save the agent name and chosen personality template into config so that
  // the same character data is used regardless of whether the user onboarded
  // via CLI or GUI.  This ensures full parity between onboarding surfaces.
  const existingList: AgentConfig[] = config.agents?.list ?? [];
  const mainEntry: AgentConfig = existingList[0] ?? { id: "main", default: true };
  const agentConfigEntry: Record<string, unknown> = { ...mainEntry, name };

  // Apply the chosen style template to the agent config entry so the
  // personality is persisted — not just the name.
  if (chosenTemplate) {
    agentConfigEntry.bio = chosenTemplate.bio;
    agentConfigEntry.system = chosenTemplate.system;
    agentConfigEntry.style = chosenTemplate.style;
    agentConfigEntry.adjectives = chosenTemplate.adjectives;
    agentConfigEntry.topics = chosenTemplate.topics;
    agentConfigEntry.postExamples = chosenTemplate.postExamples;
    agentConfigEntry.messageExamples = chosenTemplate.messageExamples;
  }

  const updatedList: AgentConfig[] = [agentConfigEntry as AgentConfig, ...existingList.slice(1)];

  const updated: MilaidyConfig = {
    ...config,
    agents: {
      ...config.agents,
      list: updatedList,
    },
  };

  // Persist the provider API key and wallet keys in config.env so they
  // survive restarts.  Initialise the env bucket once to avoid the
  // repeated `if (!updated.env)` pattern.
  if (!updated.env) updated.env = {};
  const envBucket = updated.env as Record<string, string>;

  if (providerEnvKey && providerApiKey) {
    envBucket[providerEnvKey] = providerApiKey;
    // Also set immediately in process.env for the current run
    process.env[providerEnvKey] = providerApiKey;
  }
  if (process.env.EVM_PRIVATE_KEY && !hasEvmKey) {
    envBucket.EVM_PRIVATE_KEY = process.env.EVM_PRIVATE_KEY;
  }
  if (process.env.SOLANA_PRIVATE_KEY && !hasSolKey) {
    envBucket.SOLANA_PRIVATE_KEY = process.env.SOLANA_PRIVATE_KEY;
  }

  try {
    saveMilaidyConfig(updated);
  } catch (err) {
    // Non-fatal: the agent can still start, but choices won't persist.
    clack.log.warn(`Could not save config: ${formatError(err)}`);
  }
  clack.log.message(`${name}: ${styleChoice} Alright, that's me.`);
  clack.outro("Let's get started!");

  return updated;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/** Options accepted by {@link startEliza}. */
export interface StartElizaOptions {
  /**
   * When true, skip the interactive CLI chat loop and return the
   * initialised {@link AgentRuntime} so it can be wired into the API
   * server (used by `dev-server.ts`).
   */
  headless?: boolean;
}

/**
 * Start the ElizaOS runtime with Milaidy's configuration.
 *
 * In headless mode the runtime is returned instead of entering the
 * interactive readline loop.
 */
export async function startEliza(opts?: StartElizaOptions): Promise<AgentRuntime | void> {
  // 1. Load Milaidy config from ~/.milaidy/milaidy.json
  let config: MilaidyConfig;
  try {
    config = loadMilaidyConfig();
  } catch {
    logger.warn("[milaidy] No config found, using defaults");
    // All MilaidyConfig fields are optional, so an empty object is
    // structurally valid. The `as` cast is safe here.
    config = {} as MilaidyConfig;
  }

  // 1b. First-run onboarding — ask for agent name if not configured.
  //     In headless mode (GUI) the onboarding is handled by the web UI,
  //     so we skip the interactive CLI prompt and let the runtime start
  //     with defaults.  The GUI will restart the agent after onboarding.
  if (!opts?.headless) {
    config = await runFirstTimeSetup(config);
  }

  // 1c. Apply logging level from config to process.env so the global
  //     @elizaos/core logger (used by plugins) respects it.
  //     Default to "info" so runtime activity is visible (AgentRuntime
  //     defaults to "error" which hides useful diagnostic messages).
  if (!process.env.LOG_LEVEL) {
    process.env.LOG_LEVEL = config.logging?.level ?? "info";
  }

  // 2. Push channel secrets into process.env for plugin discovery
  applyChannelSecretsToEnv(config);

  // 2b. Propagate cloud config into process.env for ElizaCloud plugin
  applyCloudConfigToEnv(config);

  // 3. Build ElizaOS Character from Milaidy config
  const character = buildCharacterFromConfig(config);

  const primaryModel = resolvePrimaryModel(config);

  // 4. Ensure workspace exists with bootstrap files
  const workspaceDir = config.agents?.defaults?.workspace ?? resolveDefaultAgentWorkspaceDir();
  await ensureAgentWorkspace({ dir: workspaceDir, ensureBootstrapFiles: true });

  // 5. Create the Milaidy bridge plugin (workspace context + session keys + compaction)
  const agentId = character.name?.toLowerCase().replace(/\s+/g, "-") ?? "main";
  const milaidyPlugin = createMilaidyPlugin({
    workspaceDir,
    bootstrapMaxChars: config.agents?.defaults?.bootstrapMaxChars,
    agentId,
  });

  // 6. Resolve and load plugins
  const resolvedPlugins = await resolvePlugins(config);

  if (resolvedPlugins.length === 0) {
    logger.error("[milaidy] No plugins loaded — at least one model provider plugin is required");
    logger.error("[milaidy] Set an API key (e.g. ANTHROPIC_API_KEY, OPENAI_API_KEY) in your environment");
    throw new Error("No plugins loaded");
  }

  // 6b. Debug logging — print full context after provider + plugin resolution
  {
    const pluginNames = resolvedPlugins.map((p) => p.name);
    const providerNames = resolvedPlugins
      .flatMap((p) => p.plugin.providers ?? [])
      .map((prov) => prov.name);
    // Build a context summary for validation
    const contextSummary: Record<string, unknown> = {
      agentName: character.name,
      pluginCount: resolvedPlugins.length,
      providerCount: providerNames.length,
      primaryModel: primaryModel ?? "(auto-detect)",
      workspaceDir,
    };
    debugLogResolvedContext(pluginNames, providerNames, contextSummary, (msg) =>
      logger.debug(msg),
    );

    // Validate the context and surface issues early
    const contextValidation = validateRuntimeContext(contextSummary);
    if (!contextValidation.valid) {
      const issues: string[] = [];
      if (contextValidation.nullFields.length > 0) {
        issues.push(`null: ${contextValidation.nullFields.join(", ")}`);
      }
      if (contextValidation.undefinedFields.length > 0) {
        issues.push(`undefined: ${contextValidation.undefinedFields.join(", ")}`);
      }
      if (contextValidation.emptyFields.length > 0) {
        issues.push(`empty: ${contextValidation.emptyFields.join(", ")}`);
      }
      logger.warn(`[milaidy] Context validation issues detected: ${issues.join("; ")}`);
    }
  }

  // 7. Create the AgentRuntime with Milaidy plugin + resolved plugins
  //    plugin-sql must be registered first so its database adapter is available
  //    before other plugins (e.g. plugin-personality) run their init functions.
  //    runtime.initialize() registers all characterPlugins in parallel, so we
  //    pre-register plugin-sql here to avoid the race condition.
  const sqlPlugin = resolvedPlugins.find((p) => p.name === "@elizaos/plugin-sql");
  const otherPlugins = resolvedPlugins.filter((p) => p.name !== "@elizaos/plugin-sql");

  // Resolve the runtime log level from config (AgentRuntime doesn't support
  // "silent", so we map it to "fatal" as the quietest supported level).
  // Default to "info" to keep runtime logs visible for diagnostics.
  const runtimeLogLevel = (() => {
    // process.env.LOG_LEVEL is already resolved (set explicitly or from
    // config.logging.level above), so prefer it to honour the dev-mode
    // LOG_LEVEL=error override set by scripts/dev-ui.mjs.
    const lvl = process.env.LOG_LEVEL ?? config.logging?.level;
    if (!lvl) return "info" as const;
    if (lvl === "silent") return "fatal" as const;
    return lvl as "trace" | "debug" | "info" | "warn" | "error" | "fatal";
  })();

  // 7a. Resolve bundled skills directory from @elizaos/skills so
  //     plugin-agent-skills auto-loads them on startup.
  let bundledSkillsDir: string | null = null;
  try {
    const { getSkillsDir } = (await import("@elizaos/skills")) as { getSkillsDir: () => string };
    bundledSkillsDir = getSkillsDir();
    logger.info(`[milaidy] Bundled skills dir: ${bundledSkillsDir}`);
  } catch {
    logger.debug("[milaidy] @elizaos/skills not available — bundled skills will not be loaded");
  }

  // Workspace skills directory (highest precedence for overrides)
  const workspaceSkillsDir = workspaceDir ? `${workspaceDir}/skills` : null;

  const runtime = new AgentRuntime({
    character,
    plugins: [milaidyPlugin, ...otherPlugins.map((p) => p.plugin)],
    ...(runtimeLogLevel ? { logLevel: runtimeLogLevel } : {}),
    enableAutonomy: true,
    settings: {
      // Forward Milaidy config env vars as runtime settings
      ...(primaryModel ? { MODEL_PROVIDER: primaryModel } : {}),
      // Forward skills config so plugin-agent-skills can apply allow/deny filtering
      ...(config.skills?.allowBundled ? { SKILLS_ALLOWLIST: config.skills.allowBundled.join(",") } : {}),
      ...(config.skills?.denyBundled ? { SKILLS_DENYLIST: config.skills.denyBundled.join(",") } : {}),
      // Tell plugin-agent-skills where to find bundled + workspace skills
      ...(bundledSkillsDir ? { BUNDLED_SKILLS_DIRS: bundledSkillsDir } : {}),
      ...(workspaceSkillsDir ? { WORKSPACE_SKILLS_DIR: workspaceSkillsDir } : {}),
      // Also forward extra dirs from config
      ...(config.skills?.load?.extraDirs?.length ? { EXTRA_SKILLS_DIRS: config.skills.load.extraDirs.join(",") } : {}),
    },
  });

  // 7b. Pre-register plugin-sql so the adapter is ready before other plugins init.
  //     This MUST succeed before initialize() — otherwise other plugins (e.g.
  //     plugin-todo) will crash when accessing runtime.db because the adapter
  //     hasn't been set yet.  runtime.db is a getter that does this.adapter.db
  //     and throws when this.adapter is undefined.
  if (sqlPlugin) {
    await runtime.registerPlugin(sqlPlugin.plugin);
  } else {
    const loadedNames = resolvedPlugins.map((p) => p.name).join(", ");
    logger.error(
      `[milaidy] @elizaos/plugin-sql was NOT found among resolved plugins. ` +
      `Loaded: [${loadedNames}]`,
    );
    throw new Error(
      "@elizaos/plugin-sql is required but was not loaded. " +
      "Ensure the package is installed and built (check for import errors above).",
    );
  }

  // 7c. Eagerly initialize the database adapter so it's fully ready (connection
  //     open, schema bootstrapped) BEFORE other plugins run their init().
  //     runtime.initialize() also calls adapter.init() but that happens AFTER
  //     all plugin inits — too late for plugins that need runtime.db during init.
  //     The call is idempotent (runtime.initialize checks adapter.isReady()).
  if (runtime.adapter && !(await runtime.adapter.isReady())) {
    await runtime.adapter.init();
    logger.info("[milaidy] Database adapter initialized early (before plugin inits)");
  }

  // 8. Initialize the runtime (registers remaining plugins, starts services)
  await runtime.initialize();

  // 9. Graceful shutdown handler
  //
  // In headless mode the caller (dev-server / Electron) owns the process
  // lifecycle, so we must NOT register signal handlers here — they would
  // stack on every hot-restart, close over stale runtime references, and
  // race with bun --watch's own process teardown.
  if (!opts?.headless) {
    let isShuttingDown = false;

    const shutdown = async (): Promise<void> => {
      if (isShuttingDown) return;
      isShuttingDown = true;

      try {
        await runtime.stop();
      } catch (err) {
        logger.warn(`[milaidy] Error during shutdown: ${formatError(err)}`);
      }
      process.exit(0);
    };

    process.on("SIGINT", () => void shutdown());
    process.on("SIGTERM", () => void shutdown());
  }

  // 10. Load hooks system
  try {
    const internalHooksConfig = config.hooks?.internal as LoadHooksOptions["internalConfig"];

    await loadHooks({
      workspacePath: workspaceDir,
      internalConfig: internalHooksConfig,
      milaidyConfig: config as Record<string, unknown>,
    });

    const startupEvent = createHookEvent("gateway", "startup", "system", { cfg: config });
    await triggerHook(startupEvent);
  } catch (err) {
    logger.warn(`[milaidy] Hooks system could not load: ${formatError(err)}`);
  }

  // ── Headless mode — return runtime for API server wiring ──────────────
  if (opts?.headless) {
    logger.info("[milaidy] Runtime initialised in headless mode (autonomy enabled)");
    return runtime;
  }

  // ── Start API server for GUI access ──────────────────────────────────────
  // In CLI mode (non-headless), start the API server in the background so
  // the GUI can connect to the running agent.  This ensures full feature
  // parity: whether started via `npx milaidy`, `bun run dev`, or the
  // desktop app, the API server is always available for the GUI admin
  // surface.
  try {
    const { startApiServer } = await import("../api/server.js");
    const apiPort = Number(process.env.MILAIDY_PORT) || 2138;
    const { port: actualApiPort } = await startApiServer({ port: apiPort, runtime });
    logger.info(`[milaidy] API server listening on http://localhost:${actualApiPort}`);
  } catch (apiErr) {
    logger.warn(`[milaidy] Could not start API server: ${formatError(apiErr)}`);
    // Non-fatal — CLI chat loop still works without the API server.
  }

  // ── Interactive chat loop ────────────────────────────────────────────────
  const agentName = character.name ?? "Milaidy";
  const userId = crypto.randomUUID() as UUID;
  // Use `let` so the fallback path can reassign to fresh IDs.
  let roomId = stringToUuid(`${agentName}-chat-room`);

  try {
    const worldId = stringToUuid(`${agentName}-chat-world`);
    await runtime.ensureConnection({
      entityId: userId,
      roomId,
      worldId,
      userName: "User",
      source: "cli",
      channelId: `${agentName}-chat`,
      type: ChannelType.DM,
    });
  } catch (err) {
    logger.warn(`[milaidy] Could not establish chat room, retrying with fresh IDs: ${formatError(err)}`);

    // Fall back to unique IDs if deterministic ones conflict with stale data.
    // IMPORTANT: reassign roomId so the message loop below uses the same room.
    roomId = crypto.randomUUID() as UUID;
    const freshWorldId = crypto.randomUUID() as UUID;
    try {
      await runtime.ensureConnection({
        entityId: userId,
        roomId,
        worldId: freshWorldId,
        userName: "User",
        source: "cli",
        channelId: `${agentName}-chat`,
        type: ChannelType.DM,
      });
    } catch (retryErr) {
      logger.error(`[milaidy] Chat room setup failed after retry: ${formatError(retryErr)}`);
      throw retryErr;
    }
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log(`\n💬 Chat with ${agentName} (type 'exit' to quit)\n`);

  const prompt = () => {
    rl.question("You: ", async (input) => {
      const text = input.trim();

      if (text.toLowerCase() === "exit" || text.toLowerCase() === "quit") {
        console.log("\nGoodbye!");
        rl.close();
        try {
          await runtime.stop();
        } catch (err) {
          logger.warn(`[milaidy] Error stopping runtime: ${formatError(err)}`);
        }
        process.exit(0);
      }

      if (!text) {
        prompt();
        return;
      }

      try {
        const message = createMessageMemory({
          id: crypto.randomUUID() as UUID,
          entityId: userId,
          roomId,
          content: {
            text,
            source: "client_chat",
            channelType: ChannelType.DM,
          },
        });

        process.stdout.write(`${agentName}: `);

        if (!runtime.messageService) {
          logger.error("[milaidy] runtime.messageService is not available — cannot process messages");
          console.log("[Error: message service unavailable]\n");
          prompt();
          return;
        }

        await runtime.messageService.handleMessage(
          runtime,
          message,
          async (content) => {
            if (content?.text) {
              process.stdout.write(content.text);
            }
            return [];
          },
        );

        console.log("\n");
      } catch (err) {
        // Log the error and continue the prompt loop — don't let a single
        // failed message kill the interactive session.
        console.log(`\n[Error: ${formatError(err)}]\n`);
        logger.error(`[milaidy] Chat message handling failed: ${formatError(err)}`);
      }
      prompt();
    });
  };

  prompt();
}

// When run directly (not imported), start immediately.
// Use path.resolve to normalise both sides before comparing so that
// symlinks, trailing slashes, and relative paths don't cause false negatives.
const isDirectRun = (() => {
  const scriptArg = process.argv[1];
  if (!scriptArg) return false;
  const normalised = path.resolve(scriptArg);
  // Exact match against this module's file URL
  if (import.meta.url === pathToFileURL(normalised).href) return true;
  // Fallback: match the specific filename (handles tsx rewriting)
  const base = path.basename(normalised);
  return base === "eliza.ts" || base === "eliza.js";
})();

if (isDirectRun) {
  startEliza().catch((err) => {
    console.error(
      "[milaidy] Fatal error:",
      err instanceof Error ? (err.stack ?? err.message) : err,
    );
    process.exit(1);
  });
}
