#!/usr/bin/env node
/**
 * build-milady-dist.mjs
 *
 * Builds the milady-dist/ bundle for the Electron desktop app.
 * This script replicates the CI release.yml "Bundle dist for Electron"
 * pipeline for local development on any platform (macOS, Linux, Windows).
 *
 * Steps:
 *   1. Build core (tsdown + write-build-info)
 *   2. Transform plugins for Electron static imports
 *   3. Bundle dist-electron via tsdown.electron.config.ts
 *   4. Copy bundled JS files into apps/app/electron/milady-dist/
 *   5. Copy @elizaos plugins, native modules, and PGLite files
 *
 * Usage: node scripts/build-milady-dist.mjs
 *   Run from repo root.
 */

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const MILADY_DIST = path.join(ROOT, "apps", "app", "electron", "milady-dist");
const DIST_ELECTRON = path.join(ROOT, "dist-electron");

function run(cmd, opts = {}) {
  console.log(`\n>>> ${cmd}`);
  execSync(cmd, {
    cwd: opts.cwd || ROOT,
    stdio: "inherit",
    shell: true,
    env: { ...process.env, ...opts.env },
  });
}

function header(msg) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  ${msg}`);
  console.log(`${"=".repeat(60)}`);
}

// ── Step 1: Build core ──────────────────────────────────────────────────
header("Step 1/5: Building core (tsdown + build-info)");
run("bunx tsdown");
run("bunx tsx scripts/write-build-info.ts");

// Ensure dist/package.json declares ESM
const distPkgPath = path.join(ROOT, "dist", "package.json");
fs.mkdirSync(path.dirname(distPkgPath), { recursive: true });
fs.writeFileSync(distPkgPath, '{"type":"module"}\n');
console.log("Wrote dist/package.json");

// ── Step 2: Transform plugins for Electron bundling ─────────────────────
header("Step 2/5: Transforming plugins for Electron static imports");
run("bun run scripts/transform-plugins-for-electron.ts");

// ── Step 3: Bundle dist-electron ────────────────────────────────────────
header("Step 3/5: Bundling dist-electron via tsdown.electron.config.ts");
run("bunx tsdown --config tsdown.electron.config.ts --no-clean");

// ── Step 4: Copy bundled JS to milady-dist ──────────────────────────────
header("Step 4/5: Copying bundled JS to apps/app/electron/milady-dist/");

// Clean and recreate milady-dist
if (fs.existsSync(MILADY_DIST)) {
  fs.rmSync(MILADY_DIST, { recursive: true, force: true });
}
fs.mkdirSync(MILADY_DIST, { recursive: true });

// Walk dist-electron/ and copy all .js files preserving directory structure
function copyJsFiles(srcDir, destDir) {
  let count = 0;
  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      count += copyJsFiles(srcPath, destPath);
    } else if (entry.name.endsWith(".js")) {
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      fs.copyFileSync(srcPath, destPath);
      count++;
    }
  }
  return count;
}

const jsCount = copyJsFiles(DIST_ELECTRON, MILADY_DIST);
console.log(`Copied ${jsCount} JS files to milady-dist/`);

// Write ESM package.json
fs.writeFileSync(path.join(MILADY_DIST, "package.json"), '{"type":"module"}\n');
console.log("Wrote milady-dist/package.json");

// ── Step 5: Copy plugins and native dependencies ────────────────────────
header("Step 5/5: Copying @elizaos plugins and native dependencies");
run("node scripts/copy-electron-plugins-and-deps.mjs");

// ── Done ────────────────────────────────────────────────────────────────
header("milady-dist build complete!");
console.log(`Output: ${MILADY_DIST}`);

const files = fs.readdirSync(MILADY_DIST);
console.log(`Contents: ${files.join(", ")}`);

const serverExists = fs.existsSync(path.join(MILADY_DIST, "server.js"));
const elizaExists = fs.existsSync(path.join(MILADY_DIST, "eliza.js"));
console.log(`server.js: ${serverExists ? "✓" : "✗ MISSING"}`);
console.log(`eliza.js: ${elizaExists ? "✓" : "✗ MISSING"}`);

if (!serverExists || !elizaExists) {
  console.error("\nERROR: Critical files missing from milady-dist!");
  process.exit(1);
}
