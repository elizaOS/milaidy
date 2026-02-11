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
import type { Dirent } from "node:fs";
import { existsSync, symlinkSync } from "node:fs";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import * as readline from "node:readline";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as clack from "@clack/prompts";
import {
  AgentRuntime,
  ChannelType,
  type Character,
  createMessageMemory,
  logger,
  mergeCharacterDefaults,
  type Plugin,
  stringToUuid,
  type UUID,
} from "@elizaos/core";
import {
  debugLogResolvedContext,
  validateRuntimeContext,
} from "../api/plugin-validation.js";
import { cloudLogin } from "../cloud/auth.js";
import {
  loadMilaidyConfig,
  type MilaidyConfig,
  saveMilaidyConfig,
} from "../config/config.js";
import { resolveStateDir, resolveUserPath } from "../config/paths.js";
import {
  type ApplyPluginAutoEnableParams,
  applyPluginAutoEnable,
} from "../config/plugin-auto-enable.js";
import type { AgentConfig } from "../config/types.agents.js";
import type { PluginInstallRecord } from "../config/types.milaidy.js";
import {
  createHookEvent,
  type LoadHooksOptions,
  loadHooks,
  triggerHook,
} from "../hooks/index.js";
import {
  ensureAgentWorkspace,
  resolveDefaultAgentWorkspaceDir,
} from "../providers/workspace.js";
import { SandboxAuditLog } from "../security/audit-log.js";
import {
  SandboxManager,
  type SandboxMode,
} from "../services/sandbox-manager.js";
import { diagnoseNoAIProvider } from "../services/version-compat.js";
import { createMilaidyPlugin } from "./milaidy-plugin.js";
import {
  createPhettaCompanionPlugin,
  resolvePhettaCompanionOptionsFromEnv,
} from "./phetta-companion-plugin.js";

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
const CHANNEL_ENV_MAP: Readonly<
  Record<string, Readonly<Record<string, string>>>
> = {
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
export const CORE_PLUGINS: readonly string[] = [
  "@elizaos/plugin-sql", // database adapter — required
  "@elizaos/plugin-local-embedding", // local embeddings — required for memory
  "@elizaos/plugin-agent-skills", // skill execution
  "@elizaos/plugin-agent-orchestrator", // multi-agent orchestration
  "@elizaos/plugin-shell", // shell command execution
  "@elizaos/plugin-plugin-manager", // dynamic plugin management
];

/**
 * Plugins that can be enabled from the admin panel.
 * Not loaded by default — kept separate due to packaging or spec issues.
 */
export const OPTIONAL_CORE_PLUGINS: readonly string[] = [
  "@elizaos/plugin-form", // packaging issue
  "@elizaos/plugin-goals", // spec mismatch
  "@elizaos/plugin-scheduling", // packaging issue
  "@elizaos/plugin-knowledge", // knowledge retrieval — required for RAG
  "@elizaos/plugin-directives", // directive processing
  "@elizaos/plugin-commands", // slash command handling
  "@elizaos/plugin-personality", // personality coherence
  "@elizaos/plugin-experience", // learning from interactions
  "@elizaos/plugin-cli", // CLI interface
  "@elizaos/plugin-code", // code writing and file operations
  "@elizaos/plugin-edge-tts", // text-to-speech
  "@elizaos/plugin-mcp", // MCP protocol support
  "@elizaos/plugin-pdf", // PDF processing
  "@elizaos/plugin-scratchpad", // scratchpad notes
  "@elizaos/plugin-secrets-manager", // secrets management
  "@elizaos/plugin-todo", // todo/task management
  "@elizaos/plugin-trust", // trust scoring
];

/**
 * Optional plugins that require native binaries or specific config.
 * These are only loaded when explicitly enabled via features config,
 * NOT by default — they crash if their prerequisites are missing.
 */
const _OPTIONAL_NATIVE_PLUGINS: readonly string[] = [
  "@elizaos/plugin-browser", // requires browser server binary
  "@elizaos/plugin-vision", // requires @tensorflow/tfjs-node native addon
  "@elizaos/plugin-cron", // requires worldId at service init
  "@elizaos/plugin-computeruse", // requires platform-specific binaries
];

/** Maps Milaidy channel names to ElizaOS plugin package names. */
const CHANNEL_PLUGIN_MAP: Readonly<Record<string, string>> = {
  discord: "@elizaos/plugin-discord",
  telegram: "@milaidy/plugin-telegram-enhanced",
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
  AI_GATEWAY_API_KEY: "@elizaos/plugin-vercel-ai-gateway",
  AIGATEWAY_API_KEY: "@elizaos/plugin-vercel-ai-gateway",
  OLLAMA_BASE_URL: "@elizaos/plugin-ollama",
  ZAI_API_KEY: "@homunculuslabs/plugin-zai",
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
  x402: "@elizaos/plugin-x402",
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
  // Check for explicit allow list first
  const allowList = config.plugins?.allow;
  const hasExplicitAllowList = allowList && allowList.length > 0;

  // If there's an explicit allow list, respect it and skip auto-detection —
  // but always include essential plugins that the runtime depends on.
  if (hasExplicitAllowList) {
    const names = new Set<string>(allowList);
    // Core plugins are always loaded regardless of allow list.
    for (const core of CORE_PLUGINS) {
      names.add(core);
    }

    const cloudActive = config.cloud?.enabled || Boolean(config.cloud?.apiKey);
    if (cloudActive) {
      // Always include cloud plugin when the user has logged in.
      names.add("@elizaos/plugin-elizacloud");

      // Remove direct AI provider plugins — they would try to call
      // Anthropic/OpenAI/etc. directly (requiring their own API keys)
      // instead of routing through Eliza Cloud.  The cloud plugin handles
      // ALL model calls via its own gateway.
      const directProviders = new Set(Object.values(PROVIDER_PLUGIN_MAP));
      directProviders.delete("@elizaos/plugin-elizacloud"); // keep cloud itself
      for (const p of directProviders) {
        names.delete(p);
      }
    }
    return names;
  }

  // Otherwise, proceed with auto-detection
  const pluginsToLoad = new Set<string>(CORE_PLUGINS);

  // Connector plugins — load when connector has config entries
  // Prefer config.connectors, fall back to config.channels for backward compatibility
  const connectors = config.connectors ?? config.channels ?? {};
  for (const [channelName, channelConfig] of Object.entries(connectors)) {
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

  // plugin-local-embedding provides the TEXT_EMBEDDING delegate which is
  // required for knowledge / memory retrieval.  Remote model-provider plugins
  // do NOT supply this delegate, so local-embedding must always stay loaded.
  // (Previously it was stripped when a remote provider was detected, but that
  // left TEXT_EMBEDDING unhandled — see #10.)

  // ElizaCloud plugin — load when cloud is enabled OR an API key exists
  // (the key proves the user logged in; the enabled flag may have been
  // accidentally reset by a provider switch or config merge).
  if (config.cloud?.enabled || config.cloud?.apiKey) {
    pluginsToLoad.add("@elizaos/plugin-elizacloud");
  }

  // Optional feature plugins from config.plugins.entries
  const pluginsConfig = config.plugins as
    | Record<string, Record<string, unknown>>
    | undefined;
  if (pluginsConfig?.entries) {
    for (const [key, entry] of Object.entries(pluginsConfig.entries)) {
      if (
        entry &&
        typeof entry === "object" &&
        (entry as Record<string, unknown>).enabled !== false
      ) {
        const pluginName = OPTIONAL_PLUGIN_MAP[key] ?? `@elizaos/plugin-${key}`;
        pluginsToLoad.add(pluginName);
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

  // x402 plugin — auto-load when config section enabled
  if (config.x402?.enabled) {
    pluginsToLoad.add("@elizaos/plugin-x402");
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

// ---------------------------------------------------------------------------
// Custom / drop-in plugin discovery
// ---------------------------------------------------------------------------

/** Subdirectory under the Milaidy state dir for drop-in custom plugins. */
export const CUSTOM_PLUGINS_DIRNAME = "plugins/custom";

/**
 * Scan a directory for drop-in plugin packages. Each immediate subdirectory
 * is treated as a plugin; name comes from package.json or the directory name.
 */
export async function scanDropInPlugins(
  dir: string,
): Promise<Record<string, PluginInstallRecord>> {
  const records: Record<string, PluginInstallRecord> = {};

  let entries: Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return records;
    }
    throw err;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const pluginDir = path.join(dir, entry.name);
    let pluginName = entry.name;
    let version = "0.0.0";

    try {
      const raw = await fs.readFile(
        path.join(pluginDir, "package.json"),
        "utf-8",
      );
      const pkg = JSON.parse(raw) as { name?: string; version?: string };
      if (typeof pkg.name === "string" && pkg.name.trim())
        pluginName = pkg.name.trim();
      if (typeof pkg.version === "string" && pkg.version.trim())
        version = pkg.version.trim();
    } catch (err) {
      if (
        (err as NodeJS.ErrnoException).code !== "ENOENT" &&
        !(err instanceof SyntaxError)
      ) {
        throw err;
      }
    }

    records[pluginName] = { source: "path", installPath: pluginDir, version };
  }

  return records;
}

/**
 * Merge drop-in plugins into the load set. Filters out denied, core-colliding,
 * and already-installed names. Mutates `pluginsToLoad` and `installRecords`.
 */
export function mergeDropInPlugins(params: {
  dropInRecords: Record<string, PluginInstallRecord>;
  installRecords: Record<string, PluginInstallRecord>;
  corePluginNames: ReadonlySet<string>;
  denyList: ReadonlySet<string>;
  pluginsToLoad: Set<string>;
}): { accepted: string[]; skipped: string[] } {
  const {
    dropInRecords,
    installRecords,
    corePluginNames,
    denyList,
    pluginsToLoad,
  } = params;
  const accepted: string[] = [];
  const skipped: string[] = [];

  for (const [name, record] of Object.entries(dropInRecords)) {
    if (denyList.has(name) || installRecords[name]) continue;
    if (corePluginNames.has(name)) {
      skipped.push(
        `[milaidy] Custom plugin "${name}" collides with core plugin — skipping`,
      );
      continue;
    }
    pluginsToLoad.add(name);
    installRecords[name] = record;
    accepted.push(name);
  }

  return { accepted, skipped };
}

// ---------------------------------------------------------------------------
// Plugin resolution
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Browser server pre-flight
// ---------------------------------------------------------------------------

/**
 * The `@elizaos/plugin-browser` npm package expects a `dist/server/` directory
 * containing the compiled stagehand-server, but the npm publish doesn't include
 * it.  The actual source/build lives in the workspace at
 * `plugins/plugin-browser/stagehand-server/`.
 *
 * This function checks whether the server is reachable from the installed
 * package and, if not, creates a symlink so the plugin's process-manager can
 * find it.  Returns `true` when the server index.js is available (or was made
 * available via symlink), `false` otherwise.
 */
export function ensureBrowserServerLink(): boolean {
  try {
    // Resolve the plugin-browser package root via its package.json.
    const req = createRequire(import.meta.url);
    const pkgJsonPath = req.resolve("@elizaos/plugin-browser/package.json");
    const pluginRoot = path.dirname(pkgJsonPath);
    const serverDir = path.join(pluginRoot, "dist", "server");
    const serverIndex = path.join(serverDir, "dist", "index.js");

    // Already linked / available — nothing to do.
    if (existsSync(serverIndex)) return true;

    // Walk upward from this file to find the eliza-workspace root.
    // Layout: <workspace>/milaidy/src/runtime/eliza.ts
    const thisDir = path.dirname(fileURLToPath(import.meta.url));
    const milaidyRoot = path.resolve(thisDir, "..", "..");
    const workspaceRoot = path.resolve(milaidyRoot, "..");
    const stagehandDir = path.join(
      workspaceRoot,
      "plugins",
      "plugin-browser",
      "stagehand-server",
    );
    const stagehandIndex = path.join(stagehandDir, "dist", "index.js");

    if (!existsSync(stagehandIndex)) {
      logger.info(
        `[milaidy] Browser server not found at ${stagehandDir} — ` +
          `@elizaos/plugin-browser will not be loaded`,
      );
      return false;
    }

    // Create symlink: dist/server -> stagehand-server
    symlinkSync(stagehandDir, serverDir, "dir");
    logger.info(
      `[milaidy] Linked browser server: ${serverDir} -> ${stagehandDir}`,
    );
    return true;
  } catch (err) {
    logger.debug(
      `[milaidy] Could not link browser server: ${formatError(err)}`,
    );
    return false;
  }
}

// ---------------------------------------------------------------------------
// Plugin resolution
// ---------------------------------------------------------------------------

/**
 * Resolve Milaidy plugins from config and auto-enable logic.
 * Returns an array of ElizaOS Plugin instances ready for AgentRuntime.
 *
 * Handles three categories of plugins:
 * 1. Built-in/npm plugins — imported by package name
 * 2. User-installed plugins — from ~/.milaidy/plugins/installed/
 * 3. Custom/drop-in plugins — from ~/.milaidy/plugins/custom/ and plugins.load.paths
 *
 * Each plugin is loaded inside an error boundary so a single failing plugin
 * cannot crash the entire agent startup.
 */
async function resolvePlugins(
  config: MilaidyConfig,
  opts?: { quiet?: boolean },
): Promise<ResolvedPlugin[]> {
  const plugins: ResolvedPlugin[] = [];
  const failedPlugins: Array<{ name: string; error: string }> = [];

  applyPluginAutoEnable({
    config,
    env: process.env,
  } satisfies ApplyPluginAutoEnableParams);

  const pluginsToLoad = collectPluginNames(config);
  const corePluginSet = new Set<string>(CORE_PLUGINS);

  // Build a mutable map of install records so we can merge drop-in discoveries
  const installRecords: Record<string, PluginInstallRecord> = {
    ...(config.plugins?.installs ?? {}),
  };

  // ── Auto-discover drop-in custom plugins ────────────────────────────────
  // Scan well-known dir + any extra dirs from plugins.load.paths (first wins).
  const scanDirs = [
    path.join(resolveStateDir(), CUSTOM_PLUGINS_DIRNAME),
    ...(config.plugins?.load?.paths ?? []).map(resolveUserPath),
  ];
  const dropInRecords: Record<string, PluginInstallRecord> = {};
  for (const dir of scanDirs) {
    for (const [name, record] of Object.entries(await scanDropInPlugins(dir))) {
      if (!dropInRecords[name]) dropInRecords[name] = record;
    }
  }

  // Merge into load set — deny list and core collisions are filtered out.
  const { accepted: customPluginNames, skipped } = mergeDropInPlugins({
    dropInRecords,
    installRecords,
    corePluginNames: corePluginSet,
    denyList: new Set(config.plugins?.deny ?? []),
    pluginsToLoad,
  });

  for (const msg of skipped) logger.warn(msg);
  if (customPluginNames.length > 0) {
    logger.info(
      `[milaidy] Discovered ${customPluginNames.length} custom plugin(s): ${customPluginNames.join(", ")}`,
    );
  }

  logger.info(`[milaidy] Resolving ${pluginsToLoad.size} plugins...`);

  // Dynamically import each plugin inside an error boundary
  for (const pluginName of pluginsToLoad) {
    const isCore = corePluginSet.has(pluginName);
    const installRecord = installRecords[pluginName];

    // Pre-flight: ensure native dependencies are available for special plugins.
    if (pluginName === "@elizaos/plugin-browser") {
      if (!ensureBrowserServerLink()) {
        failedPlugins.push({
          name: pluginName,
          error: "browser server binary not found",
        });
        logger.warn(
          `[milaidy] Skipping ${pluginName}: browser server not available. ` +
            `Build the stagehand-server or remove the plugin from plugins.allow.`,
        );
        continue;
      }
    }

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
        const wrappedPlugin = wrapPluginWithErrorBoundary(
          pluginName,
          pluginInstance,
        );
        plugins.push({ name: pluginName, plugin: wrappedPlugin });
        logger.debug(`[milaidy] ✓ Loaded plugin: ${pluginName}`);
      } else {
        const msg = `[milaidy] Plugin ${pluginName} did not export a valid Plugin object`;
        failedPlugins.push({
          name: pluginName,
          error: "no valid Plugin export",
        });
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
        logger.error(
          `[milaidy] Failed to load core plugin ${pluginName}: ${msg}`,
        );
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

  // Diagnose version-skew issues when AI providers failed to load (#10)
  const loadedNames = plugins.map((p) => p.name);
  const diagnostic = diagnoseNoAIProvider(loadedNames, failedPlugins);
  if (diagnostic) {
    if (opts?.quiet) {
      // In headless/GUI mode before onboarding, this is expected — the user
      // will configure a provider through the onboarding wizard and restart.
      logger.info(`[milaidy] ${diagnostic}`);
    } else {
      logger.error(`[milaidy] ${diagnostic}`);
    }
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
function wrapPluginWithErrorBoundary(
  pluginName: string,
  plugin: Plugin,
): Plugin {
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
async function importFromPath(
  installPath: string,
  packageName: string,
): Promise<PluginModuleShape> {
  const absPath = path.resolve(installPath);

  // npm/bun layout:  installPath/node_modules/@scope/name/
  // git layout:      installPath/ is the package itself
  const nmCandidate = path.join(
    absPath,
    "node_modules",
    ...packageName.split("/"),
  );
  let pkgRoot = absPath;
  try {
    if ((await fs.stat(nmCandidate)).isDirectory()) pkgRoot = nmCandidate;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      throw err;
    }
    /* git layout — pkgRoot stays as absPath */
  }

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
      const resolved =
        typeof dot === "string" ? dot : dot.import || dot.default;
      if (typeof resolved === "string") return path.resolve(pkgRoot, resolved);
    }
    if (typeof pkg.exports === "string")
      return path.resolve(pkgRoot, pkg.exports);
    if (pkg.main) return path.resolve(pkgRoot, pkg.main);
    return fallback;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return fallback;
    }
    throw err;
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
export function applyConnectorSecretsToEnv(config: MilaidyConfig): void {
  // Prefer config.connectors, fall back to config.channels for backward compatibility
  const connectors = config.connectors ?? config.channels ?? {};

  for (const [channelName, channelConfig] of Object.entries(connectors)) {
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

  // Having an API key means the user logged in — treat as enabled even if
  // the flag was accidentally reset (e.g. by a provider switch or merge).
  const effectivelyEnabled = cloud.enabled || Boolean(cloud.apiKey);

  if (effectivelyEnabled) {
    process.env.ELIZAOS_CLOUD_ENABLED = "true";
    logger.info(
      `[milaidy] Cloud config: enabled=${cloud.enabled}, hasApiKey=${Boolean(cloud.apiKey)}, baseUrl=${cloud.baseUrl ?? "(default)"}`,
    );
  }
  if (cloud.apiKey) {
    process.env.ELIZAOS_CLOUD_API_KEY = cloud.apiKey;
  }
  if (cloud.baseUrl) {
    process.env.ELIZAOS_CLOUD_BASE_URL = cloud.baseUrl;
  }

  // Propagate model names so the cloud plugin picks them up.  Falls back to
  // sensible defaults when cloud is enabled but no explicit selection exists.
  const models = (config as Record<string, unknown>).models as
    | { small?: string; large?: string }
    | undefined;
  if (effectivelyEnabled) {
    const small = models?.small || "openai/gpt-5-mini";
    const large = models?.large || "anthropic/claude-sonnet-4.5";
    process.env.SMALL_MODEL = small;
    process.env.LARGE_MODEL = large;
    if (!process.env.ELIZAOS_CLOUD_SMALL_MODEL) {
      process.env.ELIZAOS_CLOUD_SMALL_MODEL = small;
    }
    if (!process.env.ELIZAOS_CLOUD_LARGE_MODEL) {
      process.env.ELIZAOS_CLOUD_LARGE_MODEL = large;
    }
  }
}

/**
 * Translate `config.database` into the environment variables that
 * `@elizaos/plugin-sql` reads at init time (`POSTGRES_URL`, `PGLITE_DATA_DIR`).
 *
 * When the provider is "postgres", we build a connection string from the
 * credentials (or use the explicit `connectionString` field) and set
 * `POSTGRES_URL`. When the provider is "pglite" (the default), we only
 * set `PGLITE_DATA_DIR` if a custom directory was configured and remove
 * any stale `POSTGRES_URL` so the plugin falls through to PGLite.
 */
/** @internal Exported for testing. */
export function applyX402ConfigToEnv(config: MilaidyConfig): void {
  const x402 = (config as Record<string, unknown>).x402 as
    | { enabled?: boolean; apiKey?: string; baseUrl?: string }
    | undefined;
  if (!x402?.enabled) return;
  if (!process.env.X402_ENABLED) process.env.X402_ENABLED = "true";
  if (x402.apiKey && !process.env.X402_API_KEY)
    process.env.X402_API_KEY = x402.apiKey;
  if (x402.baseUrl && !process.env.X402_BASE_URL)
    process.env.X402_BASE_URL = x402.baseUrl;
}

/** @internal Exported for testing. */
export function applyDatabaseConfigToEnv(config: MilaidyConfig): void {
  const db = config.database;
  if (!db) return;

  if (db.provider === "postgres" && db.postgres) {
    const pg = db.postgres;
    let url = pg.connectionString;
    if (!url) {
      const host = pg.host ?? "localhost";
      const port = pg.port ?? 5432;
      const user = encodeURIComponent(pg.user ?? "postgres");
      const password = pg.password ? encodeURIComponent(pg.password) : "";
      const database = pg.database ?? "postgres";
      const auth = password ? `${user}:${password}` : user;
      const sslParam = pg.ssl ? "?sslmode=require" : "";
      url = `postgresql://${auth}@${host}:${port}/${database}${sslParam}`;
    }
    process.env.POSTGRES_URL = url;
    // Clear PGLite dir so plugin-sql does not fall back to PGLite
    delete process.env.PGLITE_DATA_DIR;
  } else {
    // PGLite mode (default): ensure no leftover POSTGRES_URL
    delete process.env.POSTGRES_URL;
    if (db.pglite?.dataDir) {
      process.env.PGLITE_DATA_DIR = db.pglite.dataDir;
    }
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
  const name = agentEntry?.name ?? config.ui?.assistant?.name ?? "Milaidy";

  // Read personality fields from the agent config entry (set during
  // onboarding from the chosen style preset).  Fall back to generic
  // defaults when the preset data is not present (e.g. pre-onboarding
  // bootstrap or configs created before this change).
  const bio = agentEntry?.bio ?? [
    "{{name}} is an AI assistant powered by Milaidy and ElizaOS.",
  ];
  const systemPrompt =
    agentEntry?.system ??
    "You are {{name}}, an autonomous AI agent powered by ElizaOS.";
  const style = agentEntry?.style;
  const adjectives = agentEntry?.adjectives;
  const topics = agentEntry?.topics;
  const postExamples = agentEntry?.postExamples;
  const messageExamples = agentEntry?.messageExamples;

  // Collect secrets from process.env (API keys the plugins need)
  const secretKeys = [
    "ANTHROPIC_API_KEY",
    "OPENAI_API_KEY",
    "GOOGLE_API_KEY",
    "GOOGLE_GENERATIVE_AI_API_KEY",
    "GROQ_API_KEY",
    "XAI_API_KEY",
    "OPENROUTER_API_KEY",
    "AI_GATEWAY_API_KEY",
    "AIGATEWAY_API_KEY",
    "AI_GATEWAY_BASE_URL",
    "AI_GATEWAY_SMALL_MODEL",
    "AI_GATEWAY_LARGE_MODEL",
    "AI_GATEWAY_EMBEDDING_MODEL",
    "AI_GATEWAY_EMBEDDING_DIMENSIONS",
    "AI_GATEWAY_IMAGE_MODEL",
    "AI_GATEWAY_TIMEOUT_MS",
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
    "X402_PRIVATE_KEY",
    "X402_NETWORK",
    "X402_PAY_TO",
    "X402_FACILITATOR_URL",
    "X402_MAX_PAYMENT_USD",
    "X402_MAX_TOTAL_USD",
    "X402_ENABLED",
    "X402_DB_PATH",
  ];

  const secrets: Record<string, string> = {};
  for (const key of secretKeys) {
    const value = process.env[key];
    if (value?.trim()) {
      secrets[key] = value;
    }
  }

  // The messageExamples stored in config use the loose preset format
  // ({ user, content: { text } }).  The core Character type requires a
  // `name` field on each example, so we map `user` → `name` here.
  const mappedExamples = messageExamples?.map((convo) =>
    convo.map((msg) => ({ ...msg, name: msg.user })),
  );

  return mergeCharacterDefaults({
    name,
    bio,
    system: systemPrompt,
    ...(style ? { style } : {}),
    ...(adjectives ? { adjectives } : {}),
    ...(topics ? { topics } : {}),
    ...(postExamples ? { postExamples } : {}),
    ...(mappedExamples ? { messageExamples: mappedExamples } : {}),
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
async function runFirstTimeSetup(
  config: MilaidyConfig,
): Promise<MilaidyConfig> {
  const agentEntry = config.agents?.list?.[0];
  const hasName = Boolean(agentEntry?.name || config.ui?.assistant?.name);
  if (hasName) return config;

  // Only prompt when stdin is a TTY (interactive terminal)
  if (!process.stdin.isTTY) return config;

  // ── Step 1: Welcome ────────────────────────────────────────────────────
  clack.intro("WELCOME TO MILAIDY!");

  // ── Step 1b: Where to run? ────────────────────────────────────────────
  const runMode = await clack.select({
    message: "Where do you want to run your agent?",
    options: [
      {
        value: "local",
        label: "On this machine (local)",
        hint: "requires an AI provider API key",
      },
      {
        value: "cloud",
        label: "In the cloud (Eliza Cloud)",
        hint: "free credits to start",
      },
    ],
  });

  if (clack.isCancel(runMode)) cancelOnboarding();

  let _cloudApiKey: string | undefined;

  if (runMode === "cloud") {
    const cloudBaseUrl = config.cloud?.baseUrl ?? "https://www.elizacloud.ai";

    clack.log.message("Opening your browser to log in to Eliza Cloud...");

    const loginResult = await cloudLogin({
      baseUrl: cloudBaseUrl,
      onBrowserUrl: (url) => {
        // Try to open the browser automatically; fall back to showing URL
        import("node:child_process")
          .then((cp) => {
            // Validate URL protocol to prevent shell injection via crafted
            // cloud.baseUrl values containing shell metacharacters.
            let safeUrl: string;
            try {
              const parsed = new URL(url);
              if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
                throw new Error("Invalid protocol");
              }
              safeUrl = parsed.href;
            } catch {
              clack.log.message(`Open this URL in your browser:\n  ${url}`);
              return;
            }

            // Use execFile (not exec) to avoid shell interpretation.
            // On Windows, "start" is a cmd built-in so we invoke via cmd.exe.
            const child =
              process.platform === "win32"
                ? cp.execFile("cmd", ["/c", "start", "", safeUrl])
                : cp.execFile(
                    process.platform === "darwin" ? "open" : "xdg-open",
                    [safeUrl],
                  );
            // Handle missing binary (e.g. xdg-open on minimal Linux) to
            // avoid an unhandled error crash — fall back to printing the URL.
            child.on("error", () => {
              clack.log.message(`Open this URL in your browser:\n  ${safeUrl}`);
            });
          })
          .catch(() => {
            clack.log.message(`Open this URL in your browser:\n  ${url}`);
          });
      },
      onPollStatus: (status) => {
        if (status === "pending") {
          // Spinner is handled by clack; nothing extra needed
        }
      },
    });

    _cloudApiKey = loginResult.apiKey;
    clack.log.success("Logged in to Eliza Cloud!");
  }

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
  // Skip provider selection in cloud mode — Eliza Cloud handles inference.
  // Check whether an API key is already set in the environment (from .env or
  // shell).  If none is found, ask the user to pick a provider and enter a key.
  const PROVIDER_OPTIONS = [
    {
      id: "anthropic",
      label: "Anthropic (Claude)",
      envKey: "ANTHROPIC_API_KEY",
      detectKeys: ["ANTHROPIC_API_KEY"],
      hint: "sk-ant-...",
    },
    {
      id: "openai",
      label: "OpenAI (GPT)",
      envKey: "OPENAI_API_KEY",
      detectKeys: ["OPENAI_API_KEY"],
      hint: "sk-...",
    },
    {
      id: "openrouter",
      label: "OpenRouter",
      envKey: "OPENROUTER_API_KEY",
      detectKeys: ["OPENROUTER_API_KEY"],
      hint: "sk-or-...",
    },
    {
      id: "vercel-ai-gateway",
      label: "Vercel AI Gateway",
      envKey: "AI_GATEWAY_API_KEY",
      detectKeys: ["AI_GATEWAY_API_KEY", "AIGATEWAY_API_KEY"],
      hint: "aigw_...",
    },
    {
      id: "gemini",
      label: "Google Gemini",
      envKey: "GOOGLE_API_KEY",
      detectKeys: ["GOOGLE_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY"],
      hint: "AI...",
    },
    {
      id: "grok",
      label: "xAI (Grok)",
      envKey: "XAI_API_KEY",
      detectKeys: ["XAI_API_KEY"],
      hint: "xai-...",
    },
    {
      id: "groq",
      label: "Groq",
      envKey: "GROQ_API_KEY",
      detectKeys: ["GROQ_API_KEY"],
      hint: "gsk_...",
    },
    {
      id: "deepseek",
      label: "DeepSeek",
      envKey: "DEEPSEEK_API_KEY",
      detectKeys: ["DEEPSEEK_API_KEY"],
      hint: "sk-...",
    },
    {
      id: "mistral",
      label: "Mistral",
      envKey: "MISTRAL_API_KEY",
      detectKeys: ["MISTRAL_API_KEY"],
      hint: "",
    },
    {
      id: "together",
      label: "Together AI",
      envKey: "TOGETHER_API_KEY",
      detectKeys: ["TOGETHER_API_KEY"],
      hint: "",
    },
    {
      id: "ollama",
      label: "Ollama (local, free)",
      envKey: "OLLAMA_BASE_URL",
      detectKeys: ["OLLAMA_BASE_URL"],
      hint: "http://localhost:11434",
    },
  ] as const;

  // Detect if any provider key is already configured
  const detectedProvider = PROVIDER_OPTIONS.find((p) =>
    p.detectKeys.some((key) => process.env[key]?.trim()),
  );

  let providerEnvKey: string | undefined;
  let providerApiKey: string | undefined;

  // In cloud mode, skip provider selection entirely.
  if (runMode === "cloud") {
    clack.log.message("AI inference will be handled by Eliza Cloud.");
  } else if (detectedProvider) {
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
        {
          value: "_skip_",
          label: "Skip for now",
          hint: "set an API key later via env or config",
        },
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
        {
          value: "generate",
          label: "Generate new wallets",
          hint: "creates fresh EVM + Solana keypairs",
        },
        {
          value: "import",
          label: "Import existing wallets",
          hint: "paste your private keys",
        },
        {
          value: "skip",
          label: "Skip for now",
          hint: "wallets can be added later",
        },
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

  // ── Step 6: Skills Marketplace API key ──────────────────────────────────
  const hasSkillsmpKey = Boolean(process.env.SKILLSMP_API_KEY?.trim());

  if (!hasSkillsmpKey) {
    const skillsmpAction = await clack.select({
      message: `${name}: Want to connect to the Skills Marketplace? (https://skillsmp.com)`,
      options: [
        {
          value: "enter",
          label: "Enter API key",
          hint: "enables browsing & installing skills",
        },
        {
          value: "skip",
          label: "Skip for now",
          hint: "you can add it later via env or config",
        },
      ],
    });

    if (clack.isCancel(skillsmpAction)) cancelOnboarding();

    if (skillsmpAction === "enter") {
      const skillsmpKeyInput = await clack.password({
        message: "Paste your skillsmp.com API key:",
      });

      if (!clack.isCancel(skillsmpKeyInput) && skillsmpKeyInput.trim()) {
        process.env.SKILLSMP_API_KEY = skillsmpKeyInput.trim();
        clack.log.success("Skills Marketplace API key saved!");
      }
    }
  }

  // ── Step 7: Persist agent name + style + provider to config ─────────────
  // Save the agent name and chosen personality template into config so that
  // the same character data is used regardless of whether the user onboarded
  // via CLI or GUI.  This ensures full parity between onboarding surfaces.
  const existingList: AgentConfig[] = config.agents?.list ?? [];
  const mainEntry: AgentConfig = existingList[0] ?? {
    id: "main",
    default: true,
  };
  const agentConfigEntry: AgentConfig = { ...mainEntry, name };

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

  const updatedList: AgentConfig[] = [
    agentConfigEntry,
    ...existingList.slice(1),
  ];

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
  if (process.env.SKILLSMP_API_KEY && !hasSkillsmpKey) {
    envBucket.SKILLSMP_API_KEY = process.env.SKILLSMP_API_KEY;
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
export async function startEliza(
  opts?: StartElizaOptions,
): Promise<AgentRuntime | undefined> {
  // Start buffering logs early so startup messages appear in the UI log viewer
  const { captureEarlyLogs } = await import("../api/server");
  captureEarlyLogs();

  // 1. Load Milaidy config from ~/.milaidy/milaidy.json
  let config: MilaidyConfig;
  try {
    config = loadMilaidyConfig();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      logger.warn("[milaidy] No config found, using defaults");
      // All MilaidyConfig fields are optional, so an empty object is
      // structurally valid. The `as` cast is safe here.
      config = {} as MilaidyConfig;
    } else {
      throw err;
    }
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
  applyConnectorSecretsToEnv(config);

  // 2b. Propagate cloud config into process.env for ElizaCloud plugin
  applyCloudConfigToEnv(config);

  // 2c. Propagate x402 config into process.env
  applyX402ConfigToEnv(config);

  // 2d. Propagate database config into process.env for plugin-sql
  applyDatabaseConfigToEnv(config);

  // 2d-ii. Allow destructive migrations (e.g. dropping tables removed between
  //        plugin versions) so the runtime doesn't silently stall.  Without this
  //        the migration system throws an error that gets swallowed, leaving the
  //        app hanging indefinitely with no output.
  if (!process.env.ELIZA_ALLOW_DESTRUCTIVE_MIGRATIONS) {
    process.env.ELIZA_ALLOW_DESTRUCTIVE_MIGRATIONS = "true";
  }

  // 2e. Prevent @elizaos/core from auto-loading @elizaos/plugin-bootstrap.
  //     Milaidy uses @elizaos/plugin-trust which provides the settings/roles
  //     providers and actions.  plugin-bootstrap (v1.x) is incompatible with
  //     the 2.0.0-alpha.x runtime used here.
  if (!process.env.IGNORE_BOOTSTRAP) {
    process.env.IGNORE_BOOTSTRAP = "true";
  }

  // 2f. Apply subscription-based credentials (Claude Max, Codex Max)
  try {
    const { applySubscriptionCredentials } = await import("../auth/index");
    await applySubscriptionCredentials();
  } catch (err) {
    logger.warn(`[milaidy] Failed to apply subscription credentials: ${err}`);
  }

  // 3. Build ElizaOS Character from Milaidy config
  const character = buildCharacterFromConfig(config);

  const primaryModel = resolvePrimaryModel(config);

  // 4. Ensure workspace exists with bootstrap files
  const workspaceDir =
    config.agents?.defaults?.workspace ?? resolveDefaultAgentWorkspaceDir();
  await ensureAgentWorkspace({ dir: workspaceDir, ensureBootstrapFiles: true });

  // 4b. Ensure custom plugins directory exists for drop-in plugins
  await fs.mkdir(path.join(resolveStateDir(), CUSTOM_PLUGINS_DIRNAME), {
    recursive: true,
  });

  // 5. Create the Milaidy bridge plugin (workspace context + session keys + compaction)
  const agentId = character.name?.toLowerCase().replace(/\s+/g, "-") ?? "main";
  const milaidyPlugin = createMilaidyPlugin({
    workspaceDir,
    bootstrapMaxChars: config.agents?.defaults?.bootstrapMaxChars,
    enableBootstrapProviders: config.agents?.defaults?.enableBootstrapProviders,
    agentId,
  });

  // 5b. Optional: Phetta Companion bridge (VRM desktop pet)
  const phettaOpts = resolvePhettaCompanionOptionsFromEnv(process.env);
  const phettaPlugin = phettaOpts.enabled
    ? createPhettaCompanionPlugin(phettaOpts)
    : null;

  // 6. Resolve and load plugins
  // In headless (GUI) mode before onboarding, the user hasn't configured a
  // provider yet.  Downgrade diagnostics so the expected "no AI provider"
  // state doesn't appear as a scary Error in the terminal.
  const preOnboarding = opts?.headless && !config.agents;
  const resolvedPlugins = await resolvePlugins(config, {
    quiet: preOnboarding,
  });

  if (resolvedPlugins.length === 0) {
    if (preOnboarding) {
      logger.info(
        "[milaidy] No plugins loaded yet — the onboarding wizard will configure a model provider",
      );
    } else {
      logger.error(
        "[milaidy] No plugins loaded — at least one model provider plugin is required",
      );
      logger.error(
        "[milaidy] Set an API key (e.g. ANTHROPIC_API_KEY, OPENAI_API_KEY) in your environment",
      );
      throw new Error("No plugins loaded");
    }
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
        issues.push(
          `undefined: ${contextValidation.undefinedFields.join(", ")}`,
        );
      }
      if (contextValidation.emptyFields.length > 0) {
        issues.push(`empty: ${contextValidation.emptyFields.join(", ")}`);
      }
      logger.warn(
        `[milaidy] Context validation issues detected: ${issues.join("; ")}`,
      );
    }
  }

  // 7. Create the AgentRuntime with Milaidy plugin + resolved plugins
  //    plugin-sql must be registered first so its database adapter is available
  //    before other plugins (e.g. plugin-personality) run their init functions.
  //    runtime.initialize() registers all characterPlugins in parallel, so we
  //    pre-register plugin-sql here to avoid the race condition.
  //
  //    plugin-local-embedding must also be pre-registered so its TEXT_EMBEDDING
  //    handler (priority 10) is available before any services start.  Without
  //    this, the bootstrap plugin's ActionFilterService and EmbeddingGeneration
  //    service can race ahead and use the cloud plugin's TEXT_EMBEDDING handler
  //    (priority 0) — which hits a paid API — because local-embedding's init()
  //    takes longer (environment setup, model path validation) and hasn't
  //    registered its model handler yet when services start generating embeddings.
  const PREREGISTER_PLUGINS = new Set([
    "@elizaos/plugin-sql",
    "@elizaos/plugin-local-embedding",
  ]);
  const sqlPlugin = resolvedPlugins.find(
    (p) => p.name === "@elizaos/plugin-sql",
  );
  const localEmbeddingPlugin = resolvedPlugins.find(
    (p) => p.name === "@elizaos/plugin-local-embedding",
  );
  const otherPlugins = resolvedPlugins.filter(
    (p) => !PREREGISTER_PLUGINS.has(p.name),
  );

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
    const { getSkillsDir } = (await import("@elizaos/skills")) as {
      getSkillsDir: () => string;
    };
    bundledSkillsDir = getSkillsDir();
    logger.info(`[milaidy] Bundled skills dir: ${bundledSkillsDir}`);
  } catch {
    logger.debug(
      "[milaidy] @elizaos/skills not available — bundled skills will not be loaded",
    );
  }

  // Workspace skills directory (highest precedence for overrides)
  const workspaceSkillsDir = workspaceDir ? `${workspaceDir}/skills` : null;

  // ── Sandbox mode setup ──────────────────────────────────────────────────
  const sandboxConfig = config.agents?.defaults?.sandbox;
  const sandboxModeStr = (sandboxConfig as Record<string, unknown> | undefined)
    ?.mode as string | undefined;
  const sandboxMode: SandboxMode =
    sandboxModeStr === "light" ||
    sandboxModeStr === "standard" ||
    sandboxModeStr === "max"
      ? sandboxModeStr
      : "off";
  const isSandboxActive = sandboxMode !== "off";

  let sandboxManager: SandboxManager | null = null;
  let sandboxAuditLog: SandboxAuditLog | null = null;

  if (isSandboxActive) {
    logger.info(`[milaidy] Sandbox mode: ${sandboxMode}`);
    sandboxAuditLog = new SandboxAuditLog({ console: true });

    // Standard/max modes also start the container sandbox manager
    if (sandboxMode === "standard" || sandboxMode === "max") {
      const dockerSettings = (
        sandboxConfig as Record<string, unknown> | undefined
      )?.docker as Record<string, unknown> | undefined;
      const browserSettings = (
        sandboxConfig as Record<string, unknown> | undefined
      )?.browser as Record<string, unknown> | undefined;

      sandboxManager = new SandboxManager({
        mode: sandboxMode,
        image: (dockerSettings?.image as string) ?? undefined,
        containerPrefix:
          (dockerSettings?.containerPrefix as string) ?? undefined,
        network: (dockerSettings?.network as string) ?? undefined,
        memory: (dockerSettings?.memory as string) ?? undefined,
        cpus: (dockerSettings?.cpus as number) ?? undefined,
        workspaceRoot: workspaceDir ?? undefined,
        browser: browserSettings
          ? {
              enabled: (browserSettings.enabled as boolean) ?? false,
              image: (browserSettings.image as string) ?? undefined,
              cdpPort: (browserSettings.cdpPort as number) ?? undefined,
              autoStart: (browserSettings.autoStart as boolean) ?? true,
            }
          : undefined,
      });

      try {
        await sandboxManager.start();
        logger.info("[milaidy] Sandbox manager started");
      } catch (err) {
        logger.error(
          `[milaidy] Sandbox manager failed to start: ${err instanceof Error ? err.message : String(err)}`,
        );
        // Non-fatal: light mode fallback
      }
    }

    sandboxAuditLog.record({
      type: "sandbox_lifecycle",
      summary: `Sandbox initialized: mode=${sandboxMode}`,
      severity: "info",
    });
  }
  // ── End sandbox setup ───────────────────────────────────────────────────

  let runtime = new AgentRuntime({
    character,
    plugins: [
      milaidyPlugin,
      ...(phettaPlugin ? [phettaPlugin] : []),
      ...otherPlugins.map((p) => p.plugin),
    ],
    ...(runtimeLogLevel ? { logLevel: runtimeLogLevel } : {}),
    // Sandbox options — only active when mode != "off"
    ...(isSandboxActive
      ? {
          sandboxMode: true,
          sandboxAuditHandler: sandboxAuditLog
            ? (event: Record<string, unknown>) => {
                sandboxAuditLog.recordTokenReplacement(
                  (event.direction as string) === "outbound"
                    ? "outbound"
                    : "inbound",
                  (event.url as string) ?? "unknown",
                  (event.tokenIds as string[]) ?? [],
                );
              }
            : undefined,
        }
      : {}),
    settings: {
      // Forward Milaidy config env vars as runtime settings
      ...(primaryModel ? { MODEL_PROVIDER: primaryModel } : {}),
      // Forward skills config so plugin-agent-skills can apply allow/deny filtering
      ...(config.skills?.allowBundled
        ? { SKILLS_ALLOWLIST: config.skills.allowBundled.join(",") }
        : {}),
      ...(config.skills?.denyBundled
        ? { SKILLS_DENYLIST: config.skills.denyBundled.join(",") }
        : {}),
      // Tell plugin-agent-skills where to find bundled + workspace skills
      ...(bundledSkillsDir ? { BUNDLED_SKILLS_DIRS: bundledSkillsDir } : {}),
      ...(workspaceSkillsDir
        ? { WORKSPACE_SKILLS_DIR: workspaceSkillsDir }
        : {}),
      // Also forward extra dirs from config
      ...(config.skills?.load?.extraDirs?.length
        ? { EXTRA_SKILLS_DIRS: config.skills.load.extraDirs.join(",") }
        : {}),
      // Disable image description when vision is explicitly toggled off.
      // The cloud plugin always registers IMAGE_DESCRIPTION, so we need a
      // runtime setting to prevent the message service from calling it.
      ...(config.features?.vision === false
        ? { DISABLE_IMAGE_DESCRIPTION: "true" }
        : {}),
    },
  });

  // 7b. Pre-register plugin-sql so the adapter is ready before other plugins init.
  //     This is OPTIONAL — without it, some features (memory, todos) won't work.
  //     runtime.db is a getter that returns this.adapter.db and throws when
  //     this.adapter is undefined, so plugins that use runtime.db will fail.
  if (sqlPlugin) {
    await runtime.registerPlugin(sqlPlugin.plugin);

    // 7c. Eagerly initialize the database adapter so it's fully ready (connection
    //     open, schema bootstrapped) BEFORE other plugins run their init().
    //     runtime.initialize() also calls adapter.init() but that happens AFTER
    //     all plugin inits — too late for plugins that need runtime.db during init.
    //     The call is idempotent (runtime.initialize checks adapter.isReady()).
    if (runtime.adapter && !(await runtime.adapter.isReady())) {
      await runtime.adapter.init();
      logger.info(
        "[milaidy] Database adapter initialized early (before plugin inits)",
      );
    }
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

  // 7d. Pre-register plugin-local-embedding so its TEXT_EMBEDDING handler
  //     (priority 10) is available before runtime.initialize() starts all
  //     plugins in parallel.  Without this, the bootstrap plugin's services
  //     (ActionFilterService, EmbeddingGenerationService) race ahead and use
  //     the cloud plugin's TEXT_EMBEDDING handler — which hits a paid API —
  //     because local-embedding's heavier init hasn't completed yet.
  if (localEmbeddingPlugin) {
    await runtime.registerPlugin(localEmbeddingPlugin.plugin);
    logger.info(
      "[milaidy] plugin-local-embedding pre-registered (TEXT_EMBEDDING ready)",
    );
  } else {
    logger.warn(
      "[milaidy] @elizaos/plugin-local-embedding not found — embeddings " +
        "will fall back to whatever TEXT_EMBEDDING handler is registered by " +
        "other plugins (may incur cloud API costs)",
    );
  }

  // 8. Initialize the runtime (registers remaining plugins, starts services)
  await runtime.initialize();

  // 8b. Wait for AgentSkillsService to finish loading.
  //     runtime.initialize() resolves the internal initPromise which unblocks
  //     service registration, but services start asynchronously.  Without this
  //     explicit await the runtime would be returned to the caller (API server,
  //     dev-server) before skills are loaded, causing the /api/skills endpoint
  //     to return an empty list.
  try {
    const skillServicePromise = runtime.getServiceLoadPromise(
      "AGENT_SKILLS_SERVICE",
    );
    // Give the service up to 30 s to load (matches the core runtime timeout).
    const timeout = new Promise<never>((_resolve, reject) => {
      setTimeout(() => {
        reject(
          new Error(
            "[milaidy] AgentSkillsService timed out waiting to initialise (30 s)",
          ),
        );
      }, 30_000);
    });
    await Promise.race([skillServicePromise, timeout]);

    // Log skill-loading summary now that the service is guaranteed ready.
    const svc = runtime.getService("AGENT_SKILLS_SERVICE") as
      | {
          getCatalogStats?: () => {
            loaded: number;
            total: number;
            storageType: string;
          };
        }
      | null
      | undefined;
    if (svc?.getCatalogStats) {
      const stats = svc.getCatalogStats();
      logger.info(
        `[milaidy] AgentSkills ready — ${stats.loaded} skills loaded, ` +
          `${stats.total} in catalog (storage: ${stats.storageType})`,
      );
    }

    // Guard against non-string skill.description values.
    // The bundled YAML parser produces {} for multi-line descriptions, which
    // crashes findBestLocalMatch / scoreSkillMatch (call .toLowerCase() on it).
    // Instead of a one-shot sanitize (which misses skills loaded later by
    // syncCatalog / autoRefresh), we monkey-patch getLoadedSkills to always
    // return sanitized values.
    const svcAny = svc as Record<string, unknown> | null | undefined;
    const origGetLoaded = svcAny?.getLoadedSkills as
      | ((...args: unknown[]) => Array<Record<string, unknown>>)
      | undefined;
    if (origGetLoaded && svcAny) {
      (svcAny as Record<string, unknown>).getLoadedSkills = function (
        ...args: unknown[]
      ) {
        const skills = origGetLoaded.apply(this, args);
        for (const skill of skills) {
          if (typeof skill.description !== "string") {
            skill.description =
              skill.description == null
                ? ""
                : JSON.stringify(skill.description);
          }
        }
        return skills;
      };
      logger.debug("[milaidy] Patched getLoadedSkills to guard descriptions");
    }
  } catch (err) {
    // Non-fatal — the agent can operate without skills.
    logger.warn(
      `[milaidy] AgentSkillsService did not initialise in time: ${formatError(err)}`,
    );
  }

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
        // Stop sandbox manager before runtime
        if (sandboxManager) {
          try {
            await sandboxManager.stop();
            logger.info("[milaidy] Sandbox manager stopped");
          } catch (err) {
            logger.warn(
              `[milaidy] Sandbox stop error: ${err instanceof Error ? err.message : String(err)}`,
            );
          }
        }
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
    const internalHooksConfig = config.hooks
      ?.internal as LoadHooksOptions["internalConfig"];

    await loadHooks({
      workspacePath: workspaceDir,
      internalConfig: internalHooksConfig,
      milaidyConfig: config as Record<string, unknown>,
    });

    const startupEvent = createHookEvent("gateway", "startup", "system", {
      cfg: config,
    });
    await triggerHook(startupEvent);
  } catch (err) {
    logger.warn(`[milaidy] Hooks system could not load: ${formatError(err)}`);
  }

  // ── Headless mode — return runtime for API server wiring ──────────────
  if (opts?.headless) {
    logger.info(
      "[milaidy] Runtime initialised in headless mode (autonomy enabled)",
    );
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
    const { port: actualApiPort } = await startApiServer({
      port: apiPort,
      runtime,
      onRestart: async () => {
        logger.info("[milaidy] Hot-reload: Restarting runtime...");
        try {
          // Stop the old runtime to release resources (DB connections, timers, etc.)
          try {
            await runtime.stop();
          } catch (stopErr) {
            logger.warn(
              `[milaidy] Hot-reload: old runtime stop failed: ${formatError(stopErr)}`,
            );
          }

          // Reload config from disk (updated by API)
          const freshConfig = loadMilaidyConfig();

          // Propagate secrets & cloud config into process.env so plugins
          // (especially plugin-elizacloud) can discover them.  The initial
          // startup does this in startEliza(); the hot-reload must repeat it
          // because the config may have changed (e.g. cloud enabled during
          // onboarding).
          applyConnectorSecretsToEnv(freshConfig);
          applyCloudConfigToEnv(freshConfig);
          applyX402ConfigToEnv(freshConfig);
          applyDatabaseConfigToEnv(freshConfig);

          // Apply subscription-based credentials (Claude Max, Codex Max)
          // that may have been set up during onboarding.
          try {
            const { applySubscriptionCredentials } = await import(
              "../auth/index"
            );
            await applySubscriptionCredentials();
          } catch (subErr) {
            logger.warn(
              `[milaidy] Hot-reload: subscription credentials: ${formatError(subErr)}`,
            );
          }

          // Resolve plugins using same function as startup
          const resolvedPlugins = await resolvePlugins(freshConfig);

          // Rebuild character from the fresh config so onboarding changes
          // (name, bio, style, etc.) are picked up on restart.
          const freshCharacter = buildCharacterFromConfig(freshConfig);

          // Recreate Milaidy plugin with fresh workspace
          const freshMilaidyPlugin = createMilaidyPlugin({
            workspaceDir:
              freshConfig.agents?.defaults?.workspace ?? workspaceDir,
            bootstrapMaxChars: freshConfig.agents?.defaults?.bootstrapMaxChars,
            enableBootstrapProviders:
              freshConfig.agents?.defaults?.enableBootstrapProviders,
            agentId:
              freshCharacter.name?.toLowerCase().replace(/\s+/g, "-") ?? "main",
          });

          // Create new runtime with updated plugins.
          // Filter out pre-registered plugins so they aren't double-loaded
          // inside initialize()'s Promise.all — same pattern as the initial
          // startup to avoid the TEXT_EMBEDDING race condition.
          const freshPrimaryModel = resolvePrimaryModel(freshConfig);
          const freshOtherPlugins = resolvedPlugins.filter(
            (p) => !PREREGISTER_PLUGINS.has(p.name),
          );
          const newRuntime = new AgentRuntime({
            character: freshCharacter,
            plugins: [
              freshMilaidyPlugin,
              ...freshOtherPlugins.map((p) => p.plugin),
            ],
            ...(runtimeLogLevel ? { logLevel: runtimeLogLevel } : {}),
            settings: {
              ...(freshPrimaryModel
                ? { MODEL_PROVIDER: freshPrimaryModel }
                : {}),
              // Disable image description when vision is explicitly toggled off.
              ...(freshConfig.features?.vision === false
                ? { DISABLE_IMAGE_DESCRIPTION: "true" }
                : {}),
            },
          });

          // Pre-register plugin-sql + local-embedding before initialize()
          // to avoid the same race condition as the initial startup.
          if (sqlPlugin) {
            await newRuntime.registerPlugin(sqlPlugin.plugin);
            if (newRuntime.adapter && !(await newRuntime.adapter.isReady())) {
              await newRuntime.adapter.init();
            }
          }
          if (localEmbeddingPlugin) {
            await newRuntime.registerPlugin(localEmbeddingPlugin.plugin);
          }

          await newRuntime.initialize();
          runtime = newRuntime;
          logger.info("[milaidy] Hot-reload: Runtime restarted successfully");
          return newRuntime;
        } catch (err) {
          logger.error(`[milaidy] Hot-reload failed: ${formatError(err)}`);
          return null;
        }
      },
    });
    logger.info(
      `[milaidy] API server listening on http://localhost:${actualApiPort}`,
    );
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
    // Use a deterministic messageServerId so the settings provider
    // can reference the world by serverId after it is found.
    const messageServerId = stringToUuid(`${agentName}-cli-server`) as UUID;
    await runtime.ensureConnection({
      entityId: userId,
      roomId,
      worldId,
      userName: "User",
      source: "cli",
      channelId: `${agentName}-chat`,
      type: ChannelType.DM,
      messageServerId,
      metadata: { ownership: { ownerId: userId } },
    });
    // Ensure the world has ownership metadata so the settings
    // provider can locate it via findWorldsForOwner during onboarding.
    // This also handles worlds that already exist from a prior session
    // but were created without ownership metadata.
    const world = await runtime.getWorld(worldId);
    if (world) {
      let needsUpdate = false;
      if (!world.metadata) {
        world.metadata = {};
        needsUpdate = true;
      }
      if (
        !world.metadata.ownership ||
        typeof world.metadata.ownership !== "object" ||
        (world.metadata.ownership as { ownerId: string }).ownerId !== userId
      ) {
        world.metadata.ownership = { ownerId: userId };
        needsUpdate = true;
      }
      if (needsUpdate) {
        await runtime.updateWorld(world);
      }
    }
  } catch (err) {
    logger.warn(
      `[milaidy] Could not establish chat room, retrying with fresh IDs: ${formatError(err)}`,
    );

    // Fall back to unique IDs if deterministic ones conflict with stale data.
    // IMPORTANT: reassign roomId so the message loop below uses the same room.
    roomId = crypto.randomUUID() as UUID;
    const freshWorldId = crypto.randomUUID() as UUID;
    const freshServerId = crypto.randomUUID() as UUID;
    try {
      await runtime.ensureConnection({
        entityId: userId,
        roomId,
        worldId: freshWorldId,
        userName: "User",
        source: "cli",
        channelId: `${agentName}-chat`,
        type: ChannelType.DM,
        messageServerId: freshServerId,
        metadata: { ownership: { ownerId: userId } },
      });
      // Same ownership metadata fix for the fallback world.
      const fallbackWorld = await runtime.getWorld(freshWorldId);
      if (fallbackWorld) {
        let needsUpdate = false;
        if (!fallbackWorld.metadata) {
          fallbackWorld.metadata = {};
          needsUpdate = true;
        }
        if (
          !fallbackWorld.metadata.ownership ||
          typeof fallbackWorld.metadata.ownership !== "object" ||
          (fallbackWorld.metadata.ownership as { ownerId: string }).ownerId !==
            userId
        ) {
          fallbackWorld.metadata.ownership = { ownerId: userId };
          needsUpdate = true;
        }
        if (needsUpdate) {
          await runtime.updateWorld(fallbackWorld);
        }
      }
    } catch (retryErr) {
      logger.error(
        `[milaidy] Chat room setup failed after retry: ${formatError(retryErr)}`,
      );
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
          logger.error(
            "[milaidy] runtime.messageService is not available — cannot process messages",
          );
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
        logger.error(
          `[milaidy] Chat message handling failed: ${formatError(err)}`,
        );
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
