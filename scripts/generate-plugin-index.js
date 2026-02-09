#!/usr/bin/env node
/**
 * Generate plugins.json — a static manifest of all available plugins
 * that ships with the milaidy package.
 *
 * Scans every plugin-* directory under the monorepo's plugins/ folder,
 * reads each package.json, and writes plugins.json to the milaidy
 * package root.
 *
 * Run from the milaidy package directory:
 *   node scripts/generate-plugin-index.js
 *
 * Or from the monorepo root:
 *   node packages/milaidy/scripts/generate-plugin-index.js
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// This script lives at packages/milaidy/scripts/
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
    const configKeys = Object.keys(pluginParams);

    const id = dir.replace(/^plugin-/, "");
    const npmName = pkg.name ?? `@elizaos/${dir}`;
    const description = pkg.description ?? "";
    const category = categorize(id);
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
      pluginParameters:
        Object.keys(pluginParams).length > 0 ? pluginParams : undefined,
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
