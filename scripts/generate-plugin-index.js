#!/usr/bin/env node
/**
 * Generate plugins.json — a static manifest of all available plugins
 * that ships with the milady package.
 *
 * Scans every plugin-* directory under the monorepo's plugins/ folder,
 * reads each package.json, and writes plugins.json to the milady
 * package root.
 *
 * Run from the milady package directory:
 *   node scripts/generate-plugin-index.js
 *
 * Or from the monorepo root:
 *   node packages/milady/scripts/generate-plugin-index.js
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// This script lives at packages/milady/scripts/
const packageRoot = path.resolve(__dirname, "..");
const outputPath = path.join(packageRoot, "plugins.json");

// Find the plugins directory — walk up from the package root to find
// the monorepo root that contains the plugins/ directory.
function findPluginsDir() {
  let dir = packageRoot;
  for (let i = 0; i < 10; i++) {
    const candidate = path.join(dir, "plugins");
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      // Verify it contains plugin-* dirs
      const entries = fs.readdirSync(candidate);
      if (entries.some((e) => e.startsWith("plugin-"))) {
        return candidate;
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

const pluginsDir = findPluginsDir();
if (!pluginsDir) {
  console.error(
    "Could not find plugins/ directory. Run this from a development checkout.",
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Category classification
// ---------------------------------------------------------------------------

const AI_PROVIDERS = new Set([
  "openai",
  "anthropic",
  "groq",
  "xai",
  "ollama",
  "openrouter",
  "google-genai",
  "local-ai",
  "vercel-ai-gateway",
  "deepseek",
  "together",
  "mistral",
  "cohere",
  "perplexity",
  "qwen",
  "minimax",
  "zai",
]);

const CONNECTORS = new Set([
  "telegram",
  "discord",
  "slack",
  "twitter",
  "whatsapp",
  "signal",
  "imessage",
  "bluebubbles",
  "farcaster",
  "bluesky",
  "matrix",
  "nostr",
  "msteams",
  "mattermost",
  "google-chat",
  "feishu",
  "line",
  "zalo",
  "zalouser",
  "tlon",
  "twitch",
  "nextcloud-talk",
  "instagram",
]);

const DATABASES = new Set(["sql", "localdb", "inmemorydb"]);

function categorize(id) {
  if (AI_PROVIDERS.has(id)) return "ai-provider";
  if (CONNECTORS.has(id)) return "connector";
  if (DATABASES.has(id)) return "database";
  return "feature";
}

function findEnvKey(configKeys) {
  return (
    configKeys.find(
      (k) =>
        k.endsWith("_API_KEY") ||
        k.endsWith("_BOT_TOKEN") ||
        k.endsWith("_TOKEN"),
    ) ?? null
  );
}

function formatName(id) {
  return id
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// ---------------------------------------------------------------------------
// Parameter inference from key names (used when agentConfig is absent)
// ---------------------------------------------------------------------------

function isSensitiveKey(key) {
  const u = key.toUpperCase();
  return (
    u.includes("_API_KEY") ||
    u.includes("_SECRET") ||
    u.includes("_TOKEN") ||
    u.includes("_PASSWORD") ||
    u.includes("_PRIVATE_KEY") ||
    u.includes("_SIGNING_") ||
    u.includes("ENCRYPTION_")
  );
}

function isBooleanKey(key) {
  const u = key.toUpperCase();
  return (
    u.includes("ENABLED") ||
    u.includes("_ENABLE_") ||
    u.startsWith("ENABLE_") ||
    u.includes("DRY_RUN") ||
    u.includes("_DEBUG") ||
    u.includes("_VERBOSE") ||
    u.includes("AUTO_") ||
    u.includes("FORCE_") ||
    u.includes("DISABLE_") ||
    u.includes("SHOULD_") ||
    u.endsWith("_SSL")
  );
}

function isNumberKey(key) {
  const u = key.toUpperCase();
  return (
    u.endsWith("_PORT") ||
    u.endsWith("_INTERVAL") ||
    u.endsWith("_TIMEOUT") ||
    u.endsWith("_MS") ||
    u.endsWith("_MINUTES") ||
    u.endsWith("_SECONDS") ||
    u.endsWith("_LIMIT") ||
    u.endsWith("_MAX") ||
    u.endsWith("_MIN") ||
    u.includes("_MAX_") ||
    u.includes("_MIN_") ||
    u.endsWith("_COUNT") ||
    u.endsWith("_SIZE") ||
    u.endsWith("_STEPS")
  );
}

function prefixLabel(key, suffix) {
  const raw = key.replace(new RegExp(`${suffix}$`, "i"), "").replace(/_+$/, "");
  if (!raw) return key;
  return raw
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function inferKeyDescription(key) {
  const u = key.toUpperCase();
  if (u.endsWith("_API_KEY"))
    return `API key for ${prefixLabel(key, "_API_KEY")}`;
  if (u.endsWith("_BOT_TOKEN"))
    return `Bot token for ${prefixLabel(key, "_BOT_TOKEN")}`;
  if (u.endsWith("_TOKEN"))
    return `Authentication token for ${prefixLabel(key, "_TOKEN")}`;
  if (u.endsWith("_SECRET")) return `Secret for ${prefixLabel(key, "_SECRET")}`;
  if (u.endsWith("_PRIVATE_KEY"))
    return `Private key for ${prefixLabel(key, "_PRIVATE_KEY")}`;
  if (u.endsWith("_PASSWORD"))
    return `Password for ${prefixLabel(key, "_PASSWORD")}`;
  if (u.endsWith("_RPC_URL"))
    return `RPC endpoint URL for ${prefixLabel(key, "_RPC_URL")}`;
  if (u.endsWith("_BASE_URL"))
    return `Base URL for ${prefixLabel(key, "_BASE_URL")}`;
  if (u.endsWith("_URL")) return `URL for ${prefixLabel(key, "_URL")}`;
  if (u.endsWith("_ENDPOINT"))
    return `Endpoint for ${prefixLabel(key, "_ENDPOINT")}`;
  if (u.endsWith("_HOST"))
    return `Host address for ${prefixLabel(key, "_HOST")}`;
  if (u.endsWith("_PORT"))
    return `Port number for ${prefixLabel(key, "_PORT")}`;
  if (u.endsWith("_MODEL") || u.includes("_MODEL_"))
    return `Model identifier for ${prefixLabel(key, "_MODEL")}`;
  if (u.endsWith("_VOICE") || u.includes("_VOICE_"))
    return `Voice setting for ${prefixLabel(key, "_VOICE")}`;
  if (u.endsWith("_DIR") || u.endsWith("_PATH")) return `Directory/file path`;
  if (u.endsWith("_ENABLED") || u.startsWith("ENABLE_"))
    return `Enable or disable this feature`;
  if (u.includes("DRY_RUN")) return `Dry-run mode (no real actions)`;
  if (u.endsWith("_INTERVAL") || u.endsWith("_INTERVAL_MINUTES"))
    return `Check interval`;
  if (u.endsWith("_TIMEOUT") || u.endsWith("_TIMEOUT_MS"))
    return `Timeout setting`;
  return key
    .split("_")
    .map((w, i) =>
      i === 0
        ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
        : w.toLowerCase(),
    )
    .join(" ");
}

/** Generate pluginParameters object from a list of config key names. */
function inferPluginParameters(configKeys) {
  const params = {};
  for (const key of configKeys) {
    const sensitive = isSensitiveKey(key);
    const type = isBooleanKey(key)
      ? "boolean"
      : isNumberKey(key)
        ? "number"
        : "string";
    const required =
      sensitive &&
      (key.toUpperCase().endsWith("_API_KEY") ||
        key.toUpperCase().endsWith("_BOT_TOKEN") ||
        key.toUpperCase().endsWith("_TOKEN") ||
        key.toUpperCase().endsWith("_PRIVATE_KEY"));
    params[key] = {
      type,
      description: inferKeyDescription(key),
      required,
      sensitive,
    };
  }
  return params;
}

// ---------------------------------------------------------------------------
// Load existing manifest for merge (preserves hand-authored data)
// ---------------------------------------------------------------------------

const existingManifest = new Map();
if (fs.existsSync(outputPath)) {
  try {
    const existing = JSON.parse(fs.readFileSync(outputPath, "utf-8"));
    if (Array.isArray(existing.plugins)) {
      for (const p of existing.plugins) {
        existingManifest.set(p.id, p);
      }
    }
  } catch {
    /* ignore read errors */
  }
}

// ---------------------------------------------------------------------------
// Scan plugins
// ---------------------------------------------------------------------------

const entries = [];

for (const dir of fs.readdirSync(pluginsDir).sort()) {
  if (!dir.startsWith("plugin-")) continue;

  const tsPackageJson = path.join(
    pluginsDir,
    dir,
    "typescript",
    "package.json",
  );
  const rootPackageJson = path.join(pluginsDir, dir, "package.json");
  const pkgPath = fs.existsSync(tsPackageJson)
    ? tsPackageJson
    : rootPackageJson;

  if (!fs.existsSync(pkgPath)) continue;

  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    const agentConfig = pkg.agentConfig;
    const pluginParams = agentConfig?.pluginParameters ?? {};
    let configKeys = Object.keys(pluginParams);

    const id = dir.replace(/^plugin-/, "");
    const npmName = pkg.name ?? `@elizaos/${dir}`;
    const description = pkg.description ?? "";
    const category = categorize(id);

    // If no agentConfig is present, preserve configKeys from existing manifest
    const existingEntry = existingManifest.get(id);
    if (configKeys.length === 0 && existingEntry?.configKeys?.length > 0) {
      configKeys = existingEntry.configKeys;
    }

    const envKey = findEnvKey(configKeys);

    // Extract version
    const version = pkg.version ?? null;

    // Extract plugin dependencies (only @elizaos/plugin-* references)
    const allDeps = {
      ...(pkg.dependencies ?? {}),
      ...(pkg.peerDependencies ?? {}),
    };
    const pluginDeps = Object.keys(allDeps)
      .filter((dep) => dep.startsWith("@elizaos/plugin-"))
      .map((dep) => dep.replace("@elizaos/plugin-", ""));

    // Resolve pluginParameters: prefer agentConfig > existing manifest > inferred
    let finalPluginParams;
    if (Object.keys(pluginParams).length > 0) {
      finalPluginParams = pluginParams;
    } else if (
      existingEntry?.pluginParameters &&
      Object.keys(existingEntry.pluginParameters).length > 0
    ) {
      finalPluginParams = existingEntry.pluginParameters;
    } else if (configKeys.length > 0) {
      finalPluginParams = inferPluginParameters(configKeys);
    }

    entries.push({
      id,
      dirName: dir,
      name: formatName(id),
      npmName,
      description,
      category,
      envKey,
      configKeys,
      version: version || undefined,
      pluginDeps: pluginDeps.length > 0 ? pluginDeps : undefined,
      pluginParameters: finalPluginParams,
    });
  } catch (err) {
    console.warn(`  Skipping ${dir}: ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// Write output
// ---------------------------------------------------------------------------

const manifest = {
  $schema: "plugin-index-v1",
  generatedAt: new Date().toISOString(),
  count: entries.length,
  plugins: entries,
};

fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Generated ${outputPath} (${entries.length} plugins)`);
