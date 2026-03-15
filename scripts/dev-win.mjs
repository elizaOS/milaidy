#!/usr/bin/env node
/**
 * Windows-compatible dev server launcher for Milady.
 *
 * Usage:
 *   node scripts/dev-win.mjs [--ui-only]
 */
import { execSync } from "node:child_process";
import { join, resolve } from "node:path";

const rootDir = resolve(import.meta.dirname, "..");

const extraArgs = process.argv.slice(2).join(" ");

try {
  const devScript = join(rootDir, "scripts", "dev-ui.mjs");
  execSync(`bun "${devScript}" ${extraArgs}`, {
    stdio: "inherit",
    shell: true,
    cwd: rootDir,
  });
} catch (e) {
  process.exit(e.status || 1);
}
