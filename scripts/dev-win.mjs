#!/usr/bin/env node
/**
 * Windows-compatible dev server launcher for Milady.
 *
 * Usage:
 *   node scripts/dev-win.mjs [--variant base|companion|full] [--ui-only]
 */
import { execSync } from "node:child_process";
import { join, resolve } from "node:path";

const rootDir = resolve(import.meta.dirname, "..");

const args = process.argv.slice(2);
let variant = "full";
const extraArgs = [];

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--variant" && args[i + 1]) {
    variant = args[i + 1];
    i++;
  } else {
    extraArgs.push(args[i]);
  }
}

function run(cmd, opts = {}) {
  console.log(`> ${cmd}`);
  execSync(cmd, { stdio: "inherit", shell: true, ...opts });
}

try {
  const devScript = join(rootDir, "scripts", "dev-ui.mjs");
  const devArgs = extraArgs.join(" ");
  run(`bun "${devScript}" ${devArgs}`, {
    cwd: rootDir,
    env: { ...process.env, VITE_APP_VARIANT: variant },
  });
} catch (e) {
  process.exit(e.status || 1);
}
