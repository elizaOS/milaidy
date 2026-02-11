#!/usr/bin/env node
/**
 * CLI entry point for Milaidy.
 *
 * This file is built by tsdown into dist/entry.js and invoked by milaidy.mjs.
 * It bootstraps the CLI: normalizes env, applies profile settings,
 * and delegates to the Commander-based CLI.
 */
import process from "node:process";
import { applyCliProfileEnv, parseCliProfileArgs } from "./cli/profile.js";

process.title = "milaidy";

// NOTE: Z_AI_API_KEY → ZAI_API_KEY normalization is handled in
// run-main.ts (after dotenv loads), so we don't duplicate it here.

if (process.argv.includes("--no-color")) {
  process.env.NO_COLOR = "1";
  process.env.FORCE_COLOR = "0";
}

// Keep `npx milaidy` startup readable by default.
// This runs before CLI/runtime imports so @elizaos/core logger picks it up.
if (!process.env.LOG_LEVEL) {
  if (process.argv.includes("--debug")) {
    process.env.LOG_LEVEL = "debug";
  } else if (process.argv.includes("--verbose")) {
    process.env.LOG_LEVEL = "info";
  } else {
    process.env.LOG_LEVEL = "error";
  }
}

const parsed = parseCliProfileArgs(process.argv);
if (!parsed.ok) {
  console.error(`[milaidy] ${parsed.error}`);
  process.exit(2);
}

if (parsed.profile) {
  applyCliProfileEnv({ profile: parsed.profile });
  process.argv = parsed.argv;
}

// ── Delegate to the Commander-based CLI ──────────────────────────────────────

import("./cli/run-main.js")
  .then(({ runCli }) => runCli(process.argv))
  .catch((error) => {
    console.error(
      "[milaidy] Failed to start CLI:",
      error instanceof Error ? (error.stack ?? error.message) : error,
    );
    process.exit(1);
  });
