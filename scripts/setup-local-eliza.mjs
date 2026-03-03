#!/usr/bin/env node
/**
 * Post-install script to set up local ElizaOS and plugins for development.
 *
 * Clones the repositories to ~/.milady/ (if not present) and sets up the
 * environment to use local source code instead of npm packages.
 *
 * Repositories:
 *   - ~/.milady/eliza    - ElizaOS monorepo (next branch)
 *   - ~/.milady/plugins  - Plugins collection (next branch, fallback to main)
 *
 * Features:
 *   - Auto-merge: Pulls latest changes and attempts to merge automatically
 *   - Conflict handling: Reports conflicts but continues with existing code
 *   - npm link: Creates symlinks for @elizaos/core
 *
 * Run automatically via the `postinstall` hook, or manually:
 *   node scripts/setup-local-eliza.mjs
 *
 * Options:
 *   --force        Re-clone even if directories exist
 *   --skip         Skip this step entirely
 *   --skip-eliza   Skip eliza setup only
 *   --skip-plugins Skip plugins setup only
 *   --no-merge     Don't attempt to merge, just fetch
 */
import { execSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

// Repository configurations
const REPOS = {
  eliza: {
    name: "ElizaOS",
    gitUrl: "https://github.com/elizaos/eliza.git",
    branch: "next",
    localDir: "eliza",
    buildCmd: "bun run build",
    buildCwd: (base) => join(base, "packages", "typescript"),
    linkPackages: ["@elizaos/core"],
    corePath: (base) => join(base, "packages", "typescript"),
  },
  plugins: {
    name: "Plugins",
    gitUrl: "https://github.com/lalalune/plugins.git",
    branch: "main",
    preferredBranch: "next", // Will check for 'next' first, fallback to 'main'
    localDir: "plugins",
    buildCmd: null, // No build needed - TypeScript source runs with bun
    linkPackages: [],
  },
};

const MILADY_DIR = join(homedir(), ".milady");

// Parse CLI args
const args = process.argv.slice(2);
const forceClone = args.includes("--force");
const skipAll =
  args.includes("--skip") || process.env.MILADY_SKIP_LOCAL_ELIZA === "1";
const skipEliza = args.includes("--skip-eliza");
const skipPlugins = args.includes("--skip-plugins");
const noMerge = args.includes("--no-merge");

if (skipAll) {
  console.log(
    "[setup] Skipping local setup (--skip or MILADY_SKIP_LOCAL_ELIZA=1)",
  );
  process.exit(0);
}

/**
 * Run a command and return stdout, or null on error.
 */
function execQuiet(cmd, options = {}) {
  try {
    return execSync(cmd, {
      stdio: "pipe",
      encoding: "utf-8",
      ...options,
    }).trim();
  } catch {
    return null;
  }
}

/**
 * Run a command with inherited stdio for visibility.
 */
function execVisible(cmd, options = {}) {
  try {
    execSync(cmd, { stdio: "inherit", ...options });
    return true;
  } catch (_err) {
    console.error(`[setup] Command failed: ${cmd}`);
    return false;
  }
}

/**
 * Check if a directory is a valid git repository.
 */
function isGitRepo(dir) {
  if (!existsSync(dir)) return false;
  return execQuiet(`git -C "${dir}" rev-parse HEAD`) !== null;
}

/**
 * Get the current branch of a git repository.
 */
function getCurrentBranch(dir) {
  return execQuiet(`git -C "${dir}" rev-parse --abbrev-ref HEAD`);
}

/**
 * Check if a remote branch exists.
 */
function remoteBranchExists(gitUrl, branch) {
  const result = execQuiet(`git ls-remote --heads "${gitUrl}" "${branch}"`);
  return result !== null && result.length > 0;
}

/**
 * Check if there are local changes (uncommitted).
 */
function hasLocalChanges(dir) {
  const status = execQuiet(`git -C "${dir}" status --porcelain`);
  return status !== null && status.length > 0;
}

/**
 * Attempt to pull and merge changes from remote.
 * Returns: { success: boolean, merged: boolean, conflicts: string[], behindBy: number }
 */
function pullAndMerge(dir, branch) {
  const result = { success: false, merged: false, conflicts: [], behindBy: 0 };

  // Fetch latest
  console.log(`[setup] Fetching from origin/${branch}...`);
  if (execQuiet(`git -C "${dir}" fetch origin ${branch}`) === null) {
    console.log(`[setup] Failed to fetch from origin/${branch}`);
    return result;
  }

  // Check how many commits behind
  const behindCount = execQuiet(
    `git -C "${dir}" rev-list --count HEAD..origin/${branch}`,
  );
  result.behindBy = behindCount ? parseInt(behindCount, 10) : 0;

  if (result.behindBy === 0) {
    console.log(`[setup] Already up to date with origin/${branch}`);
    result.success = true;
    return result;
  }

  console.log(
    `[setup] ${result.behindBy} new commit(s) available from origin/${branch}`,
  );

  if (noMerge) {
    console.log("[setup] Skipping merge (--no-merge)");
    result.success = true;
    return result;
  }

  // Check for local changes
  let stashed = false;
  if (hasLocalChanges(dir)) {
    console.log("[setup] Local changes detected, stashing before merge...");
    if (
      execQuiet(`git -C "${dir}" stash push -m "auto-stash before merge"`) !==
      null
    ) {
      stashed = true;
    }
  }

  // Attempt to merge
  console.log(`[setup] Attempting to merge origin/${branch}...`);
  const mergeResult = execQuiet(
    `git -C "${dir}" merge --no-edit origin/${branch} 2>&1`,
  );

  if (mergeResult === null) {
    // Merge failed - check for conflicts
    const conflictFiles = execQuiet(
      `git -C "${dir}" diff --name-only --diff-filter=U`,
    );

    if (conflictFiles) {
      result.conflicts = conflictFiles.split("\n").filter(Boolean);
      console.log(
        `[setup] Merge conflicts in ${result.conflicts.length} file(s):`,
      );
      for (const f of result.conflicts.slice(0, 10)) {
        console.log(`  - ${f}`);
      }
      if (result.conflicts.length > 10) {
        console.log(`  ... and ${result.conflicts.length - 10} more`);
      }

      // Abort the merge
      execQuiet(`git -C "${dir}" merge --abort`);
      console.log(
        "[setup] Merge aborted. Resolve conflicts manually or use --force to re-clone.",
      );
    } else {
      console.log("[setup] Merge failed for unknown reason");
    }

    // Restore stash if we stashed
    if (stashed) {
      execQuiet(`git -C "${dir}" stash pop 2>/dev/null`);
    }
    return result;
  }

  result.success = true;
  result.merged = true;
  console.log(`[setup] Successfully merged ${result.behindBy} commit(s)`);

  // Restore stash if we stashed
  if (stashed) {
    const stashPop = execQuiet(`git -C "${dir}" stash pop 2>&1`);
    if (stashPop?.includes("CONFLICT")) {
      console.log(
        "[setup] Warning: Stash pop resulted in conflicts. Check your local changes.",
      );
    }
  }

  return result;
}

/**
 * Clone a repository.
 */
function cloneRepo(config, targetDir) {
  // Determine which branch to use
  let branch = config.branch;
  if (
    config.preferredBranch &&
    remoteBranchExists(config.gitUrl, config.preferredBranch)
  ) {
    branch = config.preferredBranch;
    console.log(`[setup] Using preferred branch: ${branch}`);
  }

  console.log(
    `[setup] Cloning ${config.name} (${branch} branch) to ${targetDir}...`,
  );

  if (
    !execVisible(
      `git clone --depth=1 --branch ${branch} "${config.gitUrl}" "${targetDir}"`,
    )
  ) {
    console.error(`[setup] Failed to clone ${config.name}`);
    return { success: false, branch };
  }

  // Unshallow for merge support
  console.log(`[setup] Unshallowing for merge support...`);
  execQuiet(
    `git -C "${targetDir}" fetch --unshallow origin ${branch} 2>/dev/null`,
  );

  return { success: true, branch };
}

/**
 * Set up a single repository.
 */
async function setupRepo(_key, config) {
  const targetDir = join(MILADY_DIR, config.localDir);
  const repoExists = isGitRepo(targetDir);

  console.log(`\n[setup] === ${config.name} ===`);

  let currentBranch = config.branch;

  if (repoExists && !forceClone) {
    currentBranch = getCurrentBranch(targetDir) || config.branch;
    console.log(
      `[setup] ${config.name} exists at ${targetDir} (branch: ${currentBranch})`,
    );

    // Pull and attempt auto-merge
    const mergeResult = pullAndMerge(targetDir, currentBranch);
    if (!mergeResult.success) {
      console.log(`[setup] Continuing with existing ${config.name} code`);
    }
  } else {
    // Remove existing directory if force clone
    if (forceClone && existsSync(targetDir)) {
      console.log(`[setup] Removing existing ${targetDir}...`);
      rmSync(targetDir, { recursive: true, force: true });
    }

    const cloneResult = cloneRepo(config, targetDir);
    if (!cloneResult.success) {
      return false;
    }
    currentBranch = cloneResult.branch;
  }

  // Install dependencies
  console.log(`[setup] Installing ${config.name} dependencies...`);
  if (!execVisible("bun install", { cwd: targetDir })) {
    console.error(`[setup] Failed to install ${config.name} dependencies`);
    return false;
  }

  // Build if needed
  if (config.buildCmd && config.buildCwd) {
    const buildCwd = config.buildCwd(targetDir);
    if (existsSync(buildCwd)) {
      console.log(`[setup] Building ${config.name}...`);
      if (!execVisible(config.buildCmd, { cwd: buildCwd })) {
        console.log(
          `[setup] Build failed, continuing anyway - TypeScript source works with bun`,
        );
      }
    }
  }

  // Create npm links for packages
  for (const pkg of config.linkPackages || []) {
    const pkgPath = config.corePath?.(targetDir);
    if (pkgPath && existsSync(pkgPath)) {
      console.log(`[setup] Creating npm link for ${pkg}...`);
      execVisible("bun link", { cwd: pkgPath });
      execVisible(`bun link ${pkg}`, { cwd: root });
    }
  }

  return { success: true, branch: currentBranch };
}

/**
 * Update tsconfig.json to add path mappings for @elizaos/core.
 */
function updateTsConfig() {
  const tsconfigPath = join(root, "tsconfig.json");

  if (!existsSync(tsconfigPath)) {
    console.log("[setup] No tsconfig.json found, skipping path update");
    return;
  }

  try {
    const content = readFileSync(tsconfigPath, "utf-8");
    const config = JSON.parse(content);

    if (!config.compilerOptions) {
      config.compilerOptions = {};
    }
    if (!config.compilerOptions.paths) {
      config.compilerOptions.paths = {};
    }

    // Calculate paths
    const elizaCorePath = join(MILADY_DIR, "eliza", "packages", "typescript");

    // Add path mappings for @elizaos/core
    config.compilerOptions.paths["@elizaos/core"] = [
      join(elizaCorePath, "src", "index.node.ts"),
      join(elizaCorePath, "dist", "node", "index.node.js"),
    ];
    config.compilerOptions.paths["@elizaos/core/*"] = [
      join(elizaCorePath, "src", "*"),
      join(elizaCorePath, "dist", "node", "*"),
    ];

    // Add baseUrl if not set
    if (!config.compilerOptions.baseUrl) {
      config.compilerOptions.baseUrl = ".";
    }

    writeFileSync(tsconfigPath, `${JSON.stringify(config, null, 2)}\n`);
    console.log("[setup] Updated tsconfig.json with path mappings");
  } catch (err) {
    console.error(`[setup] Failed to update tsconfig.json: ${err.message}`);
  }
}

/**
 * Write setup marker file.
 */
function writeSetupMarker(elizaBranch, pluginsBranch) {
  const markerPath = join(MILADY_DIR, ".local-eliza-setup");
  const elizaDir = join(MILADY_DIR, "eliza");
  const pluginsDir = join(MILADY_DIR, "plugins");

  writeFileSync(
    markerPath,
    JSON.stringify(
      {
        setupAt: new Date().toISOString(),
        elizaPath: elizaDir,
        elizaBranch: elizaBranch || "next",
        corePath: join(elizaDir, "packages", "typescript"),
        pluginsPath: pluginsDir,
        pluginsBranch: pluginsBranch || "main",
      },
      null,
      2,
    ),
  );
}

/**
 * Check prerequisites.
 */
function checkPrereqs() {
  if (execQuiet("git --version") === null) {
    console.error("[setup] Error: git is not installed");
    process.exit(1);
  }

  if (execQuiet("bun --version") === null) {
    console.error("[setup] Error: bun is not installed");
    console.error(
      "[setup] Install bun: curl -fsSL https://bun.sh/install | bash",
    );
    process.exit(1);
  }
}

async function main() {
  console.log("[setup] Setting up local ElizaOS development environment...");

  checkPrereqs();

  // Ensure ~/.milady exists
  if (!existsSync(MILADY_DIR)) {
    console.log(`[setup] Creating ${MILADY_DIR}...`);
    mkdirSync(MILADY_DIR, { recursive: true });
  }

  let elizaBranch = "next";
  let pluginsBranch = "main";

  // Setup repositories
  if (!skipEliza) {
    const result = await setupRepo("eliza", REPOS.eliza);
    if (result?.branch) {
      elizaBranch = result.branch;
    }
  } else {
    console.log("\n[setup] Skipping ElizaOS setup (--skip-eliza)");
  }

  if (!skipPlugins) {
    const result = await setupRepo("plugins", REPOS.plugins);
    if (result?.branch) {
      pluginsBranch = result.branch;
    }
  } else {
    console.log("\n[setup] Skipping plugins setup (--skip-plugins)");
  }

  // Update tsconfig
  updateTsConfig();

  // Write marker
  writeSetupMarker(elizaBranch, pluginsBranch);

  // Print summary
  console.log("\n[setup] ========================================");
  console.log("[setup] Setup complete!");
  console.log("[setup] ========================================");
  console.log(
    `[setup] ElizaOS:      ${join(MILADY_DIR, "eliza")} (${elizaBranch})`,
  );
  console.log(
    `[setup] Plugins:      ${join(MILADY_DIR, "plugins")} (${pluginsBranch})`,
  );
  console.log(
    `[setup] @elizaos/core: ${join(MILADY_DIR, "eliza", "packages", "typescript")}`,
  );
  console.log("");
  console.log("[setup] Commands:");
  console.log("  Update:      node scripts/setup-local-eliza.mjs");
  console.log("  Force clone: node scripts/setup-local-eliza.mjs --force");
  console.log("  Skip setup:  MILADY_SKIP_LOCAL_ELIZA=1 bun install");
}

main().catch((err) => {
  console.error(`[setup] Error: ${err.message}`);
  process.exit(1);
});
