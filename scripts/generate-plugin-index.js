#!/usr/bin/env node
/**
 * Generate plugins.json — a static manifest of all available plugins
 * that ships with the milady package.
 *
 * Fetches plugin metadata from the elizaos-plugins registry and writes
 * plugins.json to the milady package root.
 *
 * Run from the milady package directory:
 *   node scripts/generate-plugin-index.js
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const packageRoot = path.resolve(__dirname, "..");
const outputPath = path.join(packageRoot, "plugins.json");

// Registry URL
const GENERATED_REGISTRY_URL =
  "https://raw.githubusercontent.com/elizaos-plugins/registry/next/generated-registry.json";

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

export const STREAMING_DESTINATIONS = new Set([
  "streaming-base",
  "retake",
  "custom-rtmp",
  "youtube-streaming",
  "twitch-streaming",
  "x-streaming",
  "pumpfun-streaming",
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

export const PLUGIN_SETUP_GUIDE_ROOT =
  "https://docs.milady.ai/plugin-setup-guide";

const SETUP_GUIDE_ANCHORS = {
  openai: "#openai",
  anthropic: "#anthropic",
  "google-genai": "#google-gemini",
  groq: "#groq",
  openrouter: "#openrouter",
  xai: "#xai-grok",
  ollama: "#ollama-local-models",
  "local-ai": "#local-ai",
  "vercel-ai-gateway": "#vercel-ai-gateway",
  discord: "#discord",
  telegram: "#telegram",
  twitter: "#twitter--x",
  slack: "#slack",
  whatsapp: "#whatsapp",
  instagram: "#instagram",
  bluesky: "#bluesky",
  farcaster: "#farcaster",
  github: "#github",
  twitch: "#twitch",
  twilio: "#twilio-sms--voice",
  matrix: "#matrix",
  msteams: "#microsoft-teams",
  "google-chat": "#google-chat",
  signal: "#signal",
  imessage: "#imessage-macos-only",
  bluebubbles: "#bluebubbles-imessage-from-any-platform",
  blooio: "#blooio-sms-via-api",
  nostr: "#nostr",
  line: "#line",
  feishu: "#feishu-lark",
  mattermost: "#mattermost",
  "nextcloud-talk": "#nextcloud-talk",
  tlon: "#tlon-urbit",
  zalo: "#zalo-vietnam-messaging",
  zalouser: "#zalo-user-personal",
  acp: "#acp-agent-communication-protocol",
  mcp: "#mcp-model-context-protocol",
  iq: "#iq-solana-on-chain",
  "gmail-watch": "#gmail-watch",
  retake: "#retaketv",
  "streaming-base": "#enable-streaming-streaming-base",
  "twitch-streaming": "#twitch-streaming",
  "youtube-streaming": "#youtube-streaming",
  "x-streaming": "#x-streaming",
  "pumpfun-streaming": "#pumpfun-streaming",
  "custom-rtmp": "#custom-rtmp",
};

const MILADY_REPO_ROOT = "https://github.com/milady-ai/milady";

export function categorize(id) {
  if (AI_PROVIDERS.has(id)) return "ai-provider";
  if (STREAMING_DESTINATIONS.has(id)) return "streaming";
  if (CONNECTORS.has(id)) return "connector";
  if (DATABASES.has(id)) return "database";
  return "feature";
}

export function resolveSetupGuideUrl(id) {
  const anchor = SETUP_GUIDE_ANCHORS[id];
  return anchor ? `${PLUGIN_SETUP_GUIDE_ROOT}${anchor}` : undefined;
}

export function normalizeRepositoryUrl(repository) {
  const raw =
    typeof repository === "string"
      ? repository.trim()
      : repository?.url?.trim() || "";
  if (!raw) return undefined;
  if (/^[\w.-]+\/[\w.-]+$/.test(raw)) return `https://github.com/${raw}`;
  if (raw.startsWith("git@github.com:")) {
    return `https://github.com/${raw
      .slice("git@github.com:".length)
      .replace(/\.git$/, "")}`;
  }
  if (raw.startsWith("git+https://")) return raw.slice(4).replace(/\.git$/, "");
  if (raw.startsWith("https://") || raw.startsWith("http://")) {
    return raw.replace(/\.git$/, "");
  }
  return undefined;
}

function deriveMiladyRepositoryUrl(npmName, dirName) {
  if (!npmName?.startsWith("@milady/")) return undefined;
  if (!dirName?.startsWith("plugin-")) return undefined;
  return `${MILADY_REPO_ROOT}/tree/main/packages/${dirName}`;
}

function readLocalPackageMetadata(dirName, npmName) {
  if (!dirName) return {};
  const pkgPath = path.join(packageRoot, "packages", dirName, "package.json");
  if (!fs.existsSync(pkgPath)) {
    return { repository: deriveMiladyRepositoryUrl(npmName, dirName) };
  }
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    return {
      homepage: typeof pkg.homepage === "string" ? pkg.homepage : undefined,
      repository:
        normalizeRepositoryUrl(pkg.repository) ??
        deriveMiladyRepositoryUrl(npmName, dirName),
      icon: pkg.logoUrl ?? pkg.elizaos?.logoUrl ?? pkg.icon ?? undefined,
    };
  } catch {
    return { repository: deriveMiladyRepositoryUrl(npmName, dirName) };
  }
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
// Fetch from registry
// ---------------------------------------------------------------------------

async function fetchRegistry() {
  console.log(`Fetching plugin registry from ${GENERATED_REGISTRY_URL}...`);

  const response = await fetch(GENERATED_REGISTRY_URL);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch registry: ${response.status} ${response.statusText}`,
    );
  }

  const registry = await response.json();
  return registry;
}

async function main() {
  let registry;
  try {
    registry = await fetchRegistry();
  } catch (err) {
    console.error(`Error fetching registry: ${err.message}`);
    console.log("Keeping existing plugins.json");
    process.exit(0);
  }

  const entries = [];

  // Registry format: { registry: { "@elizaos/plugin-xxx": { ... } } }
  const packages = registry.registry || {};

  for (const [npmName, pkgInfo] of Object.entries(packages)) {
    // Only process @elizaos/plugin-* packages
    if (!npmName.startsWith("@elizaos/plugin-")) continue;

    // Skip if no v2 support (we're using next/alpha versions)
    if (!pkgInfo.supports?.v2) continue;

    const id = npmName.replace("@elizaos/plugin-", "");
    const dirName = `plugin-${id}`;
    const description = pkgInfo.description || "";
    // Use v2 npm version (next/alpha)
    const version = pkgInfo.npm?.v2 || undefined;

    // Get existing entry to preserve hand-authored metadata
    const existingEntry = existingManifest.get(id);
    const localMeta = readLocalPackageMetadata(dirName, npmName);

    // Preserve existing category if the inferred one is just "feature" (default)
    const inferredCategory = categorize(id);
    const category =
      inferredCategory === "feature" && existingEntry?.category
        ? existingEntry.category
        : inferredCategory;

    // Preserve configKeys from existing manifest
    const configKeys = existingEntry?.configKeys || [];
    const envKey = findEnvKey(configKeys);

    // Preserve pluginDeps from existing manifest
    const pluginDeps = existingEntry?.pluginDeps;

    // Preserve pluginParameters from existing manifest, or infer from configKeys
    let finalPluginParams = existingEntry?.pluginParameters;
    if (!finalPluginParams && configKeys.length > 0) {
      finalPluginParams = inferPluginParameters(configKeys);
    }

    entries.push({
      id,
      dirName,
      name: formatName(id),
      npmName,
      description,
      category,
      envKey,
      configKeys,
      version: version || undefined,
      pluginDeps: pluginDeps?.length > 0 ? pluginDeps : undefined,
      pluginParameters: finalPluginParams,
      ...(pkgInfo.homepage || existingEntry?.homepage || localMeta.homepage
        ? {
            homepage:
              pkgInfo.homepage || existingEntry?.homepage || localMeta.homepage,
          }
        : {}),
      ...(() => {
        const repository =
          normalizeRepositoryUrl(
            pkgInfo.gitRepo ? `https://github.com/${pkgInfo.gitRepo}` : "",
          ) ??
          existingEntry?.repository ??
          localMeta.repository;
        return repository ? { repository } : {};
      })(),
      ...(() => {
        const setupGuideUrl =
          resolveSetupGuideUrl(id) ?? existingEntry?.setupGuideUrl;
        return setupGuideUrl ? { setupGuideUrl } : {};
      })(),
      ...(existingEntry?.icon || localMeta.icon
        ? { icon: existingEntry?.icon ?? localMeta.icon }
        : {}),
    });
  }

  for (const [id, existingEntry] of existingManifest.entries()) {
    if (entries.some((entry) => entry.id === id)) continue;

    const dirName = existingEntry.dirName || `plugin-${id}`;
    const npmName = existingEntry.npmName;
    const localMeta = readLocalPackageMetadata(dirName, npmName);
    const inferredCategory = categorize(id);
    const category =
      inferredCategory === "feature" && existingEntry?.category
        ? existingEntry.category
        : inferredCategory;
    const repository =
      existingEntry.repository ?? localMeta.repository ?? undefined;
    const homepage = existingEntry.homepage ?? localMeta.homepage ?? undefined;
    const setupGuideUrl =
      existingEntry.setupGuideUrl ?? resolveSetupGuideUrl(id) ?? undefined;

    entries.push({
      ...existingEntry,
      id,
      dirName,
      category,
      ...(repository ? { repository } : {}),
      ...(homepage ? { homepage } : {}),
      ...(setupGuideUrl ? { setupGuideUrl } : {}),
      ...(existingEntry.icon || localMeta.icon
        ? { icon: existingEntry.icon ?? localMeta.icon }
        : {}),
    });
  }

  // Sort by id
  entries.sort((a, b) => a.id.localeCompare(b.id));

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
}

function isDirectExecution() {
  const entry = process.argv[1];
  return Boolean(entry) && import.meta.url === pathToFileURL(entry).href;
}

if (isDirectExecution()) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
