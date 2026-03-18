#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_REPO_ROOT = path.resolve(__dirname, "..");

export const LOCAL_ELIZA_SKIP_ENV = "ELIZA_SKIP_LOCAL_ELIZA";
export const LOCAL_ELIZA_FORCE_ENV = "ELIZA_FORCE_LOCAL_ELIZA";
export const ELIZA_FORCE_RESET_ENV = "ELIZA_FORCE_RESET";
export const ELIZA_GIT_URL = "https://github.com/elizaos/eliza.git";
export const ELIZA_BRANCH = "develop";
export const ELIZA_REQUIRED_FILES = ["package.json"];
export const ELIZA_BUILD_STEPS = [
  {
    check: path.join("packages", "prompts", "dist", "typescript", "index.ts"),
    cwd: path.join("packages", "prompts"),
    args: ["run", "build:typescript"],
    label: "@elizaos/prompts",
  },
  {
    check: path.join("packages", "skills", "dist", "index.js"),
    cwd: path.join("packages", "skills"),
    args: ["run", "build"],
    label: "@elizaos/skills",
  },
  {
    check: path.join("packages", "ui", "dist", "index.js"),
    cwd: path.join("packages", "ui"),
    args: ["run", "build"],
    label: "@elizaos/ui",
  },
];

function toDisplayPath(targetPath) {
  return path.normalize(targetPath);
}

function runCommand(command, args, { cwd, env = process.env, label } = {}) {
  const printable = label ?? `${command} ${args.join(" ")}`;

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: "inherit",
    });

    child.on("error", (error) => {
      reject(
        new Error(
          `${printable} failed: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    });

    child.on("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`${printable} exited due to signal ${signal}`));
        return;
      }

      if ((code ?? 1) !== 0) {
        reject(new Error(`${printable} exited with code ${code ?? 1}`));
        return;
      }

      resolve();
    });
  });
}

function commandExists(command) {
  const result = spawnSync(command, ["--version"], {
    stdio: "ignore",
  });
  return result.status === 0;
}

function isGitRepo(dir) {
  const result = spawnSync("git", ["-C", dir, "rev-parse", "--git-dir"], {
    stdio: "ignore",
  });
  return result.status === 0;
}

function hasLocalChanges(dir) {
  const result = spawnSync("git", ["-C", dir, "status", "--porcelain"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });

  if (result.status !== 0) {
    return false;
  }

  return result.stdout.trim().length > 0;
}

function getCurrentBranch(dir) {
  const result = spawnSync(
    "git",
    ["-C", dir, "rev-parse", "--abbrev-ref", "HEAD"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
  );
  return result.status === 0 ? result.stdout.trim() : null;
}

function getLocalRev(dir, ref) {
  const result = spawnSync("git", ["-C", dir, "rev-parse", ref], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  return result.status === 0 ? result.stdout.trim() : null;
}

export function isForceReset({ env = process.env, argv = process.argv } = {}) {
  return env[ELIZA_FORCE_RESET_ENV] === "1" || argv.includes("--force");
}

export function getSiblingElizaRoot(repoRoot = DEFAULT_REPO_ROOT) {
  return path.resolve(repoRoot, "..", "eliza");
}

export function getElizaWorkspaceSkipReason(
  repoRoot = DEFAULT_REPO_ROOT,
  { env = process.env, pathExists = existsSync } = {},
) {
  if (env[LOCAL_ELIZA_SKIP_ENV] === "1") {
    return `${LOCAL_ELIZA_SKIP_ENV}=1`;
  }

  const isCi = Boolean(env.CI || env.GITHUB_ACTIONS);
  if (isCi && env[LOCAL_ELIZA_FORCE_ENV] !== "1") {
    return "CI environment";
  }

  const devWorkspaceMarkers = [
    path.join(repoRoot, ".git"),
    path.join(repoRoot, "tsconfig.json"),
    path.join(repoRoot, "apps", "app", "vite.config.ts"),
  ];

  const isDevCheckout = devWorkspaceMarkers.every((marker) =>
    pathExists(marker),
  );
  if (!isDevCheckout) {
    return "non-development install";
  }

  return null;
}

export function shouldSetupElizaWorkspace(
  repoRoot = DEFAULT_REPO_ROOT,
  options,
) {
  return getElizaWorkspaceSkipReason(repoRoot, options) === null;
}

export function hasRequiredElizaWorkspaceFiles(
  elizaRoot,
  { pathExists = existsSync } = {},
) {
  return ELIZA_REQUIRED_FILES.every((relativePath) =>
    pathExists(path.join(elizaRoot, relativePath)),
  );
}

export function hasInstalledElizaDependencies(
  elizaRoot,
  { pathExists = existsSync } = {},
) {
  return (
    pathExists(path.join(elizaRoot, "node_modules", ".bun")) &&
    pathExists(path.join(elizaRoot, "node_modules", ".bin"))
  );
}

export function getElizaPackageLinks(
  repoRoot = DEFAULT_REPO_ROOT,
  elizaRoot = getSiblingElizaRoot(repoRoot),
) {
  const links = [];
  const searchDirs = [
    path.join(elizaRoot, "packages"),
    path.join(elizaRoot, "plugins"),
  ];

  for (const parentDir of searchDirs) {
    if (!existsSync(parentDir)) continue;

    let dirEntries = [];
    try {
      dirEntries = readdirSync(parentDir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of dirEntries) {
      if (!entry.isDirectory()) continue;

      const targetPath = path.join(parentDir, entry.name);
      const pkgPath = path.join(targetPath, "package.json");

      if (!existsSync(pkgPath)) continue;

      try {
        const pkgJson = JSON.parse(readFileSync(pkgPath, "utf-8"));
        const name = pkgJson.name;
        if (!name || !name.startsWith("@elizaos/")) continue;

        const basename = name.slice("@elizaos/".length);
        const relativeTarget = path.relative(elizaRoot, targetPath);

        const linkPaths = [
          path.join(repoRoot, "node_modules", "@elizaos", basename),
          path.join(
            repoRoot,
            "apps",
            "app",
            "node_modules",
            "@elizaos",
            basename,
          ),
          path.join(
            repoRoot,
            "apps",
            "home",
            "node_modules",
            "@elizaos",
            basename,
          ),
        ];

        for (const linkPath of linkPaths) {
          links.push({
            linkPath,
            targetPath: path.join(elizaRoot, relativeTarget),
          });
        }
      } catch (_e) {
        // Skip unparseable package.json
      }
    }
  }

  return links;
}

export function isPackageLinkCurrent(linkPath, targetPath) {
  if (!existsSync(linkPath) || !existsSync(targetPath)) {
    return false;
  }

  try {
    return realpathSync(linkPath) === realpathSync(targetPath);
  } catch {
    return false;
  }
}

export function createPackageLink(linkPath, targetPath) {
  if (isPackageLinkCurrent(linkPath, targetPath)) {
    return false;
  }

  rmSync(linkPath, {
    force: true,
    recursive: true,
  });

  mkdirSync(path.dirname(linkPath), { recursive: true });

  const linkTarget =
    process.platform === "win32"
      ? targetPath
      : path.relative(path.dirname(linkPath), targetPath) || ".";
  const linkType = process.platform === "win32" ? "junction" : "dir";

  symlinkSync(linkTarget, linkPath, linkType);
  return true;
}

async function ensureElizaWorkspace(repoRoot, { force = false } = {}) {
  const elizaRoot = getSiblingElizaRoot(repoRoot);

  if (!existsSync(elizaRoot)) {
    // Fresh clone
    console.log(
      `[setup-eliza-workspace] Cloning ${ELIZA_GIT_URL} (${ELIZA_BRANCH}) into ${toDisplayPath(elizaRoot)}`,
    );
    await runCommand(
      "git",
      [
        "clone",
        "--branch",
        ELIZA_BRANCH,
        "--single-branch",
        ELIZA_GIT_URL,
        elizaRoot,
      ],
      {
        cwd: path.dirname(elizaRoot),
        label: "git clone eliza",
      },
    );
  } else if (!isGitRepo(elizaRoot)) {
    throw new Error(
      `Expected ${toDisplayPath(elizaRoot)} to be a git checkout of eliza with ${ELIZA_BRANCH} package layout.`,
    );
  } else {
    // Existing checkout — sync to latest
    const dirty = hasLocalChanges(elizaRoot);
    const currentBranch = getCurrentBranch(elizaRoot);
    const wrongBranch = currentBranch !== ELIZA_BRANCH;

    if (dirty && !force) {
      console.warn(
        `\n⚠️  ${toDisplayPath(elizaRoot)} has uncommitted changes — skipping sync.`,
      );
      console.warn(
        `   To discard changes and pull latest, run:  bun run setup:dev:force\n`,
      );
    } else {
      if (dirty && force) {
        console.log(
          `[setup-eliza-workspace] Force-resetting ${toDisplayPath(elizaRoot)} (discarding local changes)`,
        );
        await runCommand("git", ["reset", "--hard"], {
          cwd: elizaRoot,
          label: "git reset --hard (eliza)",
        });
        await runCommand("git", ["clean", "-fd"], {
          cwd: elizaRoot,
          label: "git clean (eliza)",
        });
      }

      if (wrongBranch) {
        console.log(
          `[setup-eliza-workspace] Switching from ${currentBranch ?? "unknown"} to ${ELIZA_BRANCH}`,
        );
        await runCommand("git", ["fetch", "origin", ELIZA_BRANCH], {
          cwd: elizaRoot,
          label: "git fetch eliza",
        });
        await runCommand("git", ["checkout", ELIZA_BRANCH], {
          cwd: elizaRoot,
          label: "git checkout develop",
        });
      }

      // Pull latest
      const revBefore = getLocalRev(elizaRoot, "HEAD");
      await runCommand("git", ["fetch", "origin", ELIZA_BRANCH], {
        cwd: elizaRoot,
        label: "git fetch eliza",
      });
      await runCommand("git", ["pull", "--ff-only", "origin", ELIZA_BRANCH], {
        cwd: elizaRoot,
        label: "git pull eliza",
      });
      const revAfter = getLocalRev(elizaRoot, "HEAD");

      if (revBefore && revAfter && revBefore !== revAfter) {
        console.log(
          `[setup-eliza-workspace] Updated eliza ${revBefore.slice(0, 8)} → ${revAfter.slice(0, 8)}`,
        );
      } else {
        console.log("[setup-eliza-workspace] Eliza already up to date");
      }
    }
  }

  if (!hasRequiredElizaWorkspaceFiles(elizaRoot)) {
    throw new Error(
      `Eliza workspace at ${toDisplayPath(elizaRoot)} is missing required packages after setup.`,
    );
  }

  return elizaRoot;
}

async function ensureElizaDependencies(elizaRoot) {
  if (hasInstalledElizaDependencies(elizaRoot)) {
    return;
  }

  console.log(
    `[setup-eliza-workspace] Installing eliza workspace dependencies in ${toDisplayPath(elizaRoot)}`,
  );
  await runCommand("bun", ["install"], {
    cwd: elizaRoot,
    label: "bun install (eliza)",
  });
}

async function ensureElizaBuildOutputs(elizaRoot) {
  for (const step of ELIZA_BUILD_STEPS) {
    if (existsSync(path.join(elizaRoot, step.check))) {
      continue;
    }

    console.log(`[setup-eliza-workspace] Building ${step.label}`);
    await runCommand("bun", step.args, {
      cwd: path.join(elizaRoot, step.cwd),
      label: `bun ${step.args.join(" ")} (${step.label})`,
    });
  }
}

function linkElizaPackages(repoRoot, elizaRoot) {
  let updatedLinks = 0;

  for (const { linkPath, targetPath } of getElizaPackageLinks(
    repoRoot,
    elizaRoot,
  )) {
    if (createPackageLink(linkPath, targetPath)) {
      updatedLinks += 1;
    }
  }

  if (updatedLinks === 0) {
    console.log(
      "[setup-eliza-workspace] Local eliza package links already up to date",
    );
    return;
  }

  console.log(
    `[setup-eliza-workspace] Linked ${updatedLinks} local eliza package ${updatedLinks === 1 ? "entry" : "entries"}`,
  );
}

/**
 * Reverse-link external @elizaos/* packages from milady's node_modules into
 * eliza's root node_modules.  When eliza workspace packages are symlinked into
 * milady, Bun resolves their imports from the *real* path inside the eliza
 * workspace.  External deps like plugin-agent-orchestrator are only installed
 * under milady — not in eliza's root node_modules — so the import fails.
 * Creating links in eliza's root node_modules makes them resolvable.
 */
function reverseLinksExternalElizaDeps(repoRoot, elizaRoot) {
  const miladyScope = path.join(repoRoot, "node_modules", "@elizaos");
  const elizaScope = path.join(elizaRoot, "node_modules", "@elizaos");

  if (!existsSync(miladyScope)) return;

  // Collect names that ARE eliza workspace packages (i.e. the ones we just symlinked)
  const workspaceNames = new Set();
  for (const { linkPath } of getElizaPackageLinks(repoRoot, elizaRoot)) {
    if (linkPath.startsWith(miladyScope + path.sep)) {
      workspaceNames.add(path.basename(linkPath));
    }
  }

  let dirEntries;
  try {
    dirEntries = readdirSync(miladyScope, { withFileTypes: true });
  } catch {
    return;
  }

  let linked = 0;
  for (const entry of dirEntries) {
    const name = entry.name;

    // Skip workspace packages — those already live in eliza
    if (workspaceNames.has(name)) continue;

    const miladyPkg = path.join(miladyScope, name);
    const elizaPkg = path.join(elizaScope, name);

    // Only link real (non-symlinked-to-eliza) packages
    try {
      if (lstatSync(miladyPkg).isSymbolicLink()) {
        const target = realpathSync(miladyPkg);
        if (target.startsWith(elizaRoot)) continue;
      }
    } catch {
      continue;
    }

    if (createPackageLink(elizaPkg, miladyPkg)) {
      linked += 1;
    }
  }

  if (linked > 0) {
    console.log(
      `[setup-eliza-workspace] Reverse-linked ${linked} external @elizaos dep${linked === 1 ? "" : "s"} into eliza workspace`,
    );
  }
}

export async function setupElizaWorkspace(
  repoRoot = DEFAULT_REPO_ROOT,
  { force = isForceReset() } = {},
) {
  const skipReason = getElizaWorkspaceSkipReason(repoRoot);
  if (skipReason) {
    console.log(`[setup-eliza-workspace] Skipping: ${skipReason}`);
    return { skipped: true, reason: skipReason };
  }

  if (!commandExists("git")) {
    throw new Error("git is required to clone the sibling eliza workspace");
  }

  if (!commandExists("bun")) {
    throw new Error(
      "bun is required to install and link the sibling eliza workspace",
    );
  }

  const elizaRoot = await ensureElizaWorkspace(repoRoot, { force });
  await ensureElizaDependencies(elizaRoot);
  await ensureElizaBuildOutputs(elizaRoot);
  linkElizaPackages(repoRoot, elizaRoot);
  reverseLinksExternalElizaDeps(repoRoot, elizaRoot);

  return {
    skipped: false,
    elizaRoot,
  };
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);

if (isMain) {
  setupElizaWorkspace().catch((error) => {
    console.error(
      `[setup-eliza-workspace] ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  });
}
