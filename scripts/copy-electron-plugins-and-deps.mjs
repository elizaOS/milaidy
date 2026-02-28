#!/usr/bin/env node
/**
 * Copy @elizaos/* packages and their transitive deps into
 * apps/app/electron/milady-dist/node_modules.
 *
 * Plugins (@elizaos/plugin-*) are discovered from package.json and only
 * copied when they have a valid dist/ folder (matching the filter used by
 * transform-plugins-for-electron.ts). Non-plugin @elizaos packages (core,
 * prompts) are copied unconditionally when present.
 *
 * Transitive deps are a curated list — update TRANSITIVE_DEPS /
 * TRANSITIVE_SCOPED here when adding new plugin runtime dependencies.
 *
 * Run from repo root after "Bundle dist for Electron" has created
 * milady-dist/ and copied the bundled JS files.
 *
 * Usage: node scripts/copy-electron-plugins-and-deps.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const NODE_MODULES = path.join(ROOT, "node_modules");
const MILADY_DIST = path.join(ROOT, "apps", "app", "electron", "milady-dist");
const MILADY_DIST_NM = path.join(MILADY_DIST, "node_modules");

// Fail fast if milady-dist hasn't been created by the preceding build step.
if (!fs.existsSync(MILADY_DIST)) {
  console.error(
    `Error: ${MILADY_DIST} does not exist. Run the Electron dist bundle step first.`,
  );
  process.exit(1);
}

// Runtime deps required by @elizaos plugins at runtime (single source of truth).
const TRANSITIVE_DEPS = [
  "uuid",
  "ai",
  "mammoth",
  "pdfjs-dist",
  "face-api.js",
  "croner",
  "tesseract.js",
  "unpdf",
];
const TRANSITIVE_SCOPED = [
  "@huggingface/transformers",
  "@anthropic-ai/claude-agent-sdk",
  "@electric-sql/pglite",
  "@ai-sdk/gateway",
  "@ai-sdk/anthropic",
  "@ai-sdk/provider",
  "@ai-sdk/provider-utils",
  "@opentelemetry/api",
  "@tensorflow/tfjs-core",
  "@vercel/oidc",
];

// @elizaos packages that should NOT be copied (dev tooling, not runtime deps).
const ELIZAOS_SKIP = new Set(["@elizaos/sweagent-root", "@elizaos/tui"]);

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) return false;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.cpSync(src, dest, { recursive: true, force: true, dereference: true });
  return true;
}

// Discover @elizaos/* from package.json and filter to those present.
const pkg = readJson(path.join(ROOT, "package.json"));
const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
const elizaosPackages = Object.keys(allDeps).filter(
  (d) => d.startsWith("@elizaos/") && !ELIZAOS_SKIP.has(d),
);

const toCopy = elizaosPackages.filter((name) => {
  const dir = path.join(NODE_MODULES, name);
  try {
    if (!fs.statSync(dir).isDirectory()) return false;
    if (name.startsWith("@elizaos/plugin-")) {
      const distPath = path.join(dir, "dist");
      return fs.statSync(distPath).isDirectory();
    }
    return true; // core, prompts, etc.
  } catch {
    return false;
  }
});

console.log(
  `Found ${elizaosPackages.length} @elizaos/* in package.json, ${toCopy.length} to copy (present + valid dist for plugins)`,
);

fs.mkdirSync(path.join(MILADY_DIST_NM, "@elizaos"), { recursive: true });

for (const name of toCopy) {
  const short = name.replace("@elizaos/", "");
  const src = path.join(NODE_MODULES, "@elizaos", short);
  const dest = path.join(MILADY_DIST_NM, "@elizaos", short);
  if (copyRecursive(src, dest)) {
    console.log("  Copied", name);
  }
}
console.log("Done copying @elizaos packages");

console.log("Copying plugin dependencies...");
for (const dep of TRANSITIVE_DEPS) {
  const src = path.join(NODE_MODULES, dep);
  const dest = path.join(MILADY_DIST_NM, dep);
  if (copyRecursive(src, dest)) {
    console.log("  Copied", dep);
  } else {
    console.warn("  Warning:", dep, "not found in node_modules");
  }
}

for (const scopePkg of TRANSITIVE_SCOPED) {
  const [scope, pkgName] = scopePkg.split("/");
  const src = path.join(NODE_MODULES, scope, pkgName);
  const dest = path.join(MILADY_DIST_NM, scope, pkgName);
  if (copyRecursive(src, dest)) {
    console.log("  Copied", scopePkg);
  } else {
    console.warn("  Warning:", scopePkg, "not found in node_modules");
  }
}
console.log("Done copying plugin dependencies");

console.log("milady-dist/node_modules contents:");
try {
  console.log(fs.readdirSync(MILADY_DIST_NM).join(" "));
} catch {
  console.log("  (empty or not found)");
}
