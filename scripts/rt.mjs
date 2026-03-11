#!/usr/bin/env node
/**
 * Cross-platform runtime-agnostic script runner.
 * Windows-compatible replacement for rt.sh.
 *
 * Usage:
 *   node scripts/rt.mjs <script.ts|script.js|script.mjs> [args...]
 *   node scripts/rt.mjs run <script-name> [args...]
 *   node scripts/rt.mjs install [args...]
 */
import { execSync } from "node:child_process";

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("Usage: node scripts/rt.mjs <script|command> [args...]");
  process.exit(1);
}

// Detect bun availability
function hasBun() {
  try {
    execSync("bun --version", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const useBun = hasBun();
const runner = useBun ? "bun" : "node --import tsx";

const first = args[0];

// If first arg is a file path (ends with .ts, .js, .mjs)
if (/\.(ts|js|mjs)$/.test(first)) {
  const cmd = `${runner} ${args.map((a) => `"${a}"`).join(" ")}`;
  try {
    execSync(cmd, { stdio: "inherit", shell: true });
  } catch (e) {
    process.exit(e.status || 1);
  }
} else {
  // Package manager command (run, install, etc.)
  const pm = useBun ? "bun" : "npm";
  const cmd = `${pm} ${args.map((a) => `"${a}"`).join(" ")}`;
  try {
    execSync(cmd, { stdio: "inherit", shell: true });
  } catch (e) {
    process.exit(e.status || 1);
  }
}
