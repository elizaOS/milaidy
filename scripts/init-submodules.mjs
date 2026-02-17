#!/usr/bin/env node
/**
 * Post-install script to initialize git submodules if they haven't been.
 * This ensures that submodules (eliza, plugins, benchmarks) are properly
 * initialized when cloning the repo or installing dependencies.
 *
 * Run automatically via the `postinstall` hook, or manually:
 *   node scripts/init-submodules.mjs
 */
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

// Check if we're in a git repository
const gitDir = resolve(root, ".git");
if (!existsSync(gitDir)) {
  console.log("[init-submodules] Not a git repository — skipping");
  process.exit(0);
}

// List of submodules to check
const submodules = [
  { path: "eliza", name: "eliza" },
  { path: "plugins", name: "plugins" },
  { path: "benchmarks", name: "benchmarks" },
];

let initialized = 0;

for (const submodule of submodules) {
  const submodulePath = resolve(root, submodule.path);

  // Check if directory exists but is empty (not initialized)
  if (existsSync(submodulePath)) {
    // Check if it's a valid git repo/submodule
    try {
      execSync(`git -C "${submodulePath}" rev-parse HEAD`, {
        stdio: "ignore",
      });
      // Submodule is already initialized
      continue;
    } catch {
      // Not a valid git repo, needs initialization
    }
  }

  // Initialize and update the submodule
  console.log(`[init-submodules] Initializing ${submodule.name}...`);
  try {
    execSync(`git submodule update --init --recursive "${submodule.path}"`, {
      cwd: root,
      stdio: "inherit",
    });
    initialized++;
    console.log(`[init-submodules] ${submodule.name} initialized successfully`);
  } catch (err) {
    console.error(
      `[init-submodules] Failed to initialize ${submodule.name}: ${err.message}`,
    );
  }
}

if (initialized === 0) {
  console.log("[init-submodules] All submodules already initialized");
} else {
  console.log(`[init-submodules] Initialized ${initialized} submodule(s)`);
}
