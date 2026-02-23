#!/usr/bin/env node
/**
 * CLI entry point for Milady.
 *
 * This file is built by tsdown into dist/entry.js and invoked by milady.mjs.
 * It bootstraps the CLI: normalizes env, applies profile settings,
 * and delegates to the Commander-based CLI.
 */
import process from "node:process";
import { applyCliProfileEnv, parseCliProfileArgs } from "./cli/profile";

process.title = "milady";

// NOTE: Z_AI_API_KEY → ZAI_API_KEY normalization is handled in
// run-main.ts (after dotenv loads), so we don't duplicate it here.

if (process.argv.includes("--no-color")) {
  process.env.NO_COLOR = "1";
  process.env.FORCE_COLOR = "0";
}

// Keep `npx miladyai` startup readable by default.
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

// Keep llama.cpp backend output aligned with Milady's log level defaults.
// This suppresses noisy tokenizer warnings in normal startup while still
// allowing verbose/debug visibility when explicitly requested.
if (!process.env.NODE_LLAMA_CPP_LOG_LEVEL) {
  const logLevel = String(process.env.LOG_LEVEL).toLowerCase();
  process.env.NODE_LLAMA_CPP_LOG_LEVEL =
    logLevel === "debug" ? "debug" : logLevel === "info" ? "info" : "error";
}

const parsed = parseCliProfileArgs(process.argv);
if (!parsed.ok) {
  console.error(`[milady] ${parsed.error}`);
  process.exit(2);
}

if (parsed.profile) {
  applyCliProfileEnv({ profile: parsed.profile });
  process.argv = parsed.argv;
}

// ── Delegate to the Commander-based CLI ──────────────────────────────────────

import("./cli/run-main")
  .then(({ runCli }) => runCli(process.argv))
  .catch((error) => {
    console.error(
      "[milady] Failed to start CLI:",
      error instanceof Error ? (error.stack ?? error.message) : error,
    );
    process.exit(1);
  });
