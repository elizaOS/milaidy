#!/usr/bin/env node
import { execSync } from "node:child_process";
/**
 * Ensures node-pty's native addon is compiled.
 *
 * `bun install` does NOT run node-gyp for native modules, so we check for
 * the compiled `.node` binary and rebuild if it's missing.
 *
 * Checks both the top-level node_modules and any workspace-override plugin
 * directories that have their own node-pty copy.
 *
 * This runs as part of the postinstall chain.
 */
import { existsSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

/** All locations where node-pty might need building. */
function findNodePtyDirs() {
  const dirs = [];

  // 1. Top-level node_modules
  dirs.push(resolve(root, "node_modules", "node-pty"));

  // 2. Workspace-override plugins (plugins/plugin-*/node_modules/node-pty)
  const pluginsDir = resolve(root, "plugins");
  if (existsSync(pluginsDir)) {
    try {
      for (const entry of readdirSync(pluginsDir)) {
        const pluginPty = resolve(
          pluginsDir,
          entry,
          "node_modules",
          "node-pty",
        );
        if (existsSync(pluginPty)) dirs.push(pluginPty);
      }
    } catch {
      /* ignore read errors */
    }
  }

  return dirs;
}

let rebuilt = 0;
for (const ptyDir of findNodePtyDirs()) {
  if (!existsSync(ptyDir)) continue;

  const binaryPath = resolve(ptyDir, "build", "Release", "pty.node");
  if (existsSync(binaryPath)) {
    console.log(`[ensure-node-pty] Already built: ${ptyDir}`);
    continue;
  }

  console.log(`[ensure-node-pty] Building native addon at ${ptyDir}...`);
  try {
    execSync("node-gyp rebuild", {
      cwd: ptyDir,
      stdio: "inherit",
      timeout: 120_000,
    });
    rebuilt++;
    console.log("[ensure-node-pty] Build complete.");
  } catch (err) {
    console.error(
      "[ensure-node-pty] Failed to build node-pty native addon at",
      ptyDir,
      "PTY-based coding agents may not work.",
      err.message,
    );
  }
}

if (rebuilt === 0) {
  console.log("[ensure-node-pty] All node-pty instances already built.");
}
