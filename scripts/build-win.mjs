#!/usr/bin/env node
/**
 * Windows-compatible build script for Milady.
 * Replaces the Unix-only "build" npm script.
 *
 * Steps:
 *   1. tsdown (backend bundle)
 *   2. Write dist/package.json with {"type":"module"}
 *   3. Write build info
 *   4. Build all Capacitor plugins
 *   5. vite build the app (renderer)
 *
 * Usage:
 *   node scripts/build-win.mjs [--skip-plugins] [--skip-install]
 */
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const rootDir = resolve(import.meta.dirname, "..");
const appDir = join(rootDir, "apps", "app");

// Parse args
const args = process.argv.slice(2);
let skipPlugins = false;
let skipInstall = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--skip-plugins") {
    skipPlugins = true;
  } else if (args[i] === "--skip-install") {
    skipInstall = true;
  }
}

function run(cmd, opts = {}) {
  console.log(`\n> ${cmd}`);
  execSync(cmd, { stdio: "inherit", shell: true, ...opts });
}

try {
  // Step 1: tsdown build
  console.log("\n=== Step 1/5: tsdown (backend bundle) ===");
  run("npx tsdown", { cwd: rootDir });

  // Step 2: dist/package.json
  console.log("\n=== Step 2/5: Write dist/package.json ===");
  const distDir = join(rootDir, "dist");
  if (!existsSync(distDir)) mkdirSync(distDir, { recursive: true });
  writeFileSync(join(distDir, "package.json"), '{"type":"module"}\n');
  console.log("  Written dist/package.json");

  // Step 3: write-build-info
  console.log("\n=== Step 3/5: Write build info ===");
  run("bun scripts/write-build-info.ts", { cwd: rootDir });

  // Step 4: Build plugins
  if (!skipPlugins) {
    console.log("\n=== Step 4/5: Build Capacitor plugins ===");
    // Authoritative plugin list — must match apps/app/package.json plugin:build
    // script. When adding or removing a plugin, update both locations.
    const plugins = [
      "gateway",
      "swabble",
      "camera",
      "screencapture",
      "canvas",
      "desktop",
      "location",
      "talkmode",
      "agent",
    ];
    for (const plugin of plugins) {
      const pluginDir = join(appDir, "plugins", plugin);
      if (!existsSync(pluginDir)) {
        console.log(`  [plugin:${plugin}] directory not found, skipping`);
        continue;
      }
      console.log(`  [plugin:${plugin}] building...`);
      run("bun run build", { cwd: pluginDir });
    }
  } else {
    console.log("\n=== Step 4/5: Skipping plugins (--skip-plugins) ===");
  }

  // Step 5: vite build
  console.log("\n=== Step 5/5: vite build ===");
  if (!skipInstall) {
    run("bun install --ignore-scripts", { cwd: appDir });
  }
  run(`npx vite build`, { cwd: appDir });

  console.log("\n=== Build complete! ===");
} catch (e) {
  console.error("\nBuild failed:", e.message);
  process.exit(1);
}
