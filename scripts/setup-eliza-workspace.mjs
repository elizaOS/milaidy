#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_REPO_ROOT = path.resolve(__dirname, "..");

export const LOCAL_ELIZA_SKIP_ENV = "MILADY_SKIP_LOCAL_ELIZA";
export const LOCAL_ELIZA_FORCE_ENV = "MILADY_FORCE_LOCAL_ELIZA";
export const ELIZA_GIT_URL = "https://github.com/elizaos/eliza.git";
export const ELIZA_BRANCH = "develop";
export const ELIZA_REQUIRED_FILES = [
  path.join("packages", "autonomous", "src", "index.ts"),
  path.join("packages", "app-core", "src", "index.ts"),
  path.join("packages", "ui", "package.json"),
];
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
export const ELIZA_LINKS = [
  {
    target: path.join("packages", "autonomous"),
    links: [path.join("node_modules", "@elizaos", "autonomous")],
  },
  {
    target: path.join("packages", "app-core"),
    links: [
      path.join("node_modules", "@elizaos", "app-core"),
      path.join("apps", "app", "node_modules", "@elizaos", "app-core"),
      path.join("apps", "home", "node_modules", "@elizaos", "app-core"),
    ],
  },
  {
    target: path.join("packages", "ui"),
    links: [
      path.join("node_modules", "@elizaos", "ui"),
      path.join("apps", "app", "node_modules", "@elizaos", "ui"),
      path.join("apps", "home", "node_modules", "@elizaos", "ui"),
    ],
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
  return ELIZA_LINKS.flatMap(({ target, links }) =>
    links.map((relativeLinkPath) => ({
      linkPath: path.join(repoRoot, relativeLinkPath),
      targetPath: path.join(elizaRoot, target),
    })),
  );
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

async function ensureElizaWorkspace(repoRoot) {
  const elizaRoot = getSiblingElizaRoot(repoRoot);

  if (!existsSync(elizaRoot)) {
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
  } else if (!hasRequiredElizaWorkspaceFiles(elizaRoot)) {
    if (!isGitRepo(elizaRoot)) {
      throw new Error(
        `Expected ${toDisplayPath(elizaRoot)} to be a git checkout of eliza with ${ELIZA_BRANCH} package layout.`,
      );
    }

    if (hasLocalChanges(elizaRoot)) {
      throw new Error(
        `${toDisplayPath(elizaRoot)} is missing the ${ELIZA_BRANCH} package layout and has local changes. Switch it manually or remove it so Milady can re-clone it.`,
      );
    }

    console.log(
      `[setup-eliza-workspace] Existing ${toDisplayPath(elizaRoot)} is missing the ${ELIZA_BRANCH} package layout; checking out ${ELIZA_BRANCH}`,
    );
    await runCommand("git", ["fetch", "origin", ELIZA_BRANCH], {
      cwd: elizaRoot,
      label: "git fetch eliza",
    });
    await runCommand("git", ["checkout", ELIZA_BRANCH], {
      cwd: elizaRoot,
      label: "git checkout develop",
    });
    await runCommand("git", ["pull", "--ff-only", "origin", ELIZA_BRANCH], {
      cwd: elizaRoot,
      label: "git pull eliza",
    });
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

export async function setupElizaWorkspace(repoRoot = DEFAULT_REPO_ROOT) {
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

  const elizaRoot = await ensureElizaWorkspace(repoRoot);
  await ensureElizaDependencies(elizaRoot);
  await ensureElizaBuildOutputs(elizaRoot);
  linkElizaPackages(repoRoot, elizaRoot);

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
