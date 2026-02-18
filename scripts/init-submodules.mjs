#!/usr/bin/env node
/**
 * Post-install script to initialize git submodules if they haven't been.
 * This ensures tracked submodules from .gitmodules are initialized when
 * cloning the repo or installing dependencies.
 *
 * Run automatically via the `postinstall` hook, or manually:
 *   node scripts/init-submodules.mjs
 */
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptFile = fileURLToPath(import.meta.url);
const __dirname = dirname(scriptFile);
const root = resolve(__dirname, "..");

export function parseTrackedSubmodules(configOutput) {
  if (!configOutput.trim()) return [];

  return configOutput
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [rawKey, path] = line.split(/\s+/, 2);
      const name = rawKey.replace(/^submodule\./, "").replace(/\.path$/, "");
      return { name, path };
    });
}

export function loadTrackedSubmodules({ exec = execSync, cwd = root } = {}) {
  try {
    const output = exec(
      'git config --file .gitmodules --get-regexp "^submodule\\..*\\.path$"',
      {
        cwd,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      },
    ).trim();
    return parseTrackedSubmodules(output);
  } catch {
    return [];
  }
}

export function runInitSubmodules({
  rootDir = root,
  exists = existsSync,
  exec = execSync,
  log = console.log,
  logError = console.error,
} = {}) {
  // Check if we're in a git repository
  const gitDir = resolve(rootDir, ".git");
  if (!exists(gitDir)) {
    log("[init-submodules] Not a git repository — skipping");
    return { initialized: 0, alreadyInitialized: 0, failed: 0, submodules: [] };
  }

  const gitmodulesPath = resolve(rootDir, ".gitmodules");
  if (!exists(gitmodulesPath)) {
    log("[init-submodules] No .gitmodules found — skipping");
    return { initialized: 0, alreadyInitialized: 0, failed: 0, submodules: [] };
  }

  const submodules = loadTrackedSubmodules({ exec, cwd: rootDir });
  if (submodules.length === 0) {
    log("[init-submodules] No tracked submodules found — skipping");
    return { initialized: 0, alreadyInitialized: 0, failed: 0, submodules: [] };
  }

  let initialized = 0;
  let alreadyInitialized = 0;
  let failed = 0;

  for (const submodule of submodules) {
    let needsInit = true;

    try {
      const status = exec(`git submodule status -- "${submodule.path}"`, {
        cwd: rootDir,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
      needsInit = status.startsWith("-");
    } catch {
      // If status lookup fails, attempt initialization directly.
    }

    if (!needsInit) {
      alreadyInitialized++;
      continue;
    }

    log(
      `[init-submodules] Initializing ${submodule.name} (${submodule.path})...`,
    );
    try {
      exec(`git submodule update --init --recursive "${submodule.path}"`, {
        cwd: rootDir,
        stdio: "inherit",
      });
      initialized++;
      log(`[init-submodules] ${submodule.name} initialized successfully`);
    } catch (err) {
      failed++;
      const message = err instanceof Error ? err.message : String(err);
      logError(
        `[init-submodules] Failed to initialize ${submodule.name} (${submodule.path}): ${message}`,
      );
    }
  }

  if (failed > 0) {
    logError(
      `[init-submodules] Initialized ${initialized}, already ready ${alreadyInitialized}, failed ${failed}.`,
    );
  } else if (initialized === 0) {
    log("[init-submodules] All submodules already initialized");
  } else {
    log(
      `[init-submodules] Initialized ${initialized} submodule(s); ${alreadyInitialized} already ready.`,
    );
  }

  return { initialized, alreadyInitialized, failed, submodules };
}

const isDirectRun =
  process.argv[1] && resolve(process.argv[1]) === resolve(scriptFile);

if (isDirectRun) {
  runInitSubmodules();
}
