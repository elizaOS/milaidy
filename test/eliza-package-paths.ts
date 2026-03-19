import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

/**
 * Return the sibling eliza workspace root (../eliza) if it exists and has the
 * requested package.  This avoids relying on node_modules symlinks which bun
 * may revert during execution.
 */
function getSiblingElizaPackageRoot(
  packageName: string,
  repoRoot: string,
): string | undefined {
  const elizaRoot = path.resolve(repoRoot, "..", "eliza");
  if (!existsSync(path.join(elizaRoot, "package.json"))) return undefined;

  const packageMap: Record<string, string> = {
    "@elizaos/core": path.join(elizaRoot, "packages", "typescript"),
    "@elizaos/autonomous": path.join(elizaRoot, "packages", "autonomous"),
    "@elizaos/app-core": path.join(elizaRoot, "packages", "app-core"),
  };

  const candidate = packageMap[packageName];
  if (candidate && existsSync(path.join(candidate, "package.json"))) {
    return candidate;
  }
  return undefined;
}

const MODULE_EXTENSIONS = [
  ".ts",
  ".tsx",
  ".mts",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
];
const require = createRequire(import.meta.url);

function getRequireFor(baseDir?: string) {
  if (!baseDir) {
    return require;
  }

  return createRequire(path.join(baseDir, "package.json"));
}

function firstExistingPath(
  candidates: Array<string | undefined>,
): string | undefined {
  return candidates.find(
    (candidate): candidate is string =>
      typeof candidate === "string" && existsSync(candidate),
  );
}

export function resolveModuleEntry(basePath: string): string {
  if (existsSync(basePath)) {
    return basePath;
  }

  const withExtension = firstExistingPath(
    MODULE_EXTENSIONS.map((extension) => `${basePath}${extension}`),
  );

  return withExtension ?? basePath;
}

export function getInstalledPackageRoot(
  packageName: string,
  fromDir?: string,
): string | undefined {
  // Prefer sibling eliza workspace to avoid bun reverting symlinks
  if (fromDir) {
    const sibling = getSiblingElizaPackageRoot(packageName, fromDir);
    if (sibling) return sibling;
  }

  const scopedRequire = getRequireFor(fromDir);

  try {
    return path.dirname(scopedRequire.resolve(`${packageName}/package.json`));
  } catch {
    try {
      const entryPath = scopedRequire.resolve(packageName);
      const entryDir = path.dirname(entryPath);
      return path.basename(entryDir) === "src" ? entryDir : entryDir;
    } catch {
      return undefined;
    }
  }
}

export function getElizaCoreEntry(repoRoot: string): string | undefined {
  const packageRoot = getInstalledPackageRoot("@elizaos/core", repoRoot);
  if (!packageRoot) {
    return undefined;
  }

  if (path.basename(packageRoot) === "src") {
    return resolveModuleEntry(path.join(packageRoot, "index"));
  }

  return resolveModuleEntry(
    path.join(packageRoot, "dist", "node", "index.node"),
  );
}

export function getAutonomousSourceRoot(repoRoot: string): string | undefined {
  const packageRoot = getInstalledPackageRoot("@elizaos/autonomous", repoRoot);

  if (!packageRoot) {
    return undefined;
  }

  if (path.basename(packageRoot) === "src") {
    return packageRoot;
  }

  const directSrc = path.join(packageRoot, "src");
  if (existsSync(directSrc)) {
    return directSrc;
  }

  return path.join(packageRoot, "packages", "autonomous", "src");
}

export function getAppCoreSourceRoot(repoRoot: string): string | undefined {
  const packageRoot = getInstalledPackageRoot("@elizaos/app-core", repoRoot);
  if (!packageRoot) {
    return undefined;
  }

  if (path.basename(packageRoot) === "src") {
    return packageRoot;
  }

  const sourceRoot = path.join(packageRoot, "src");
  return existsSync(sourceRoot) ? sourceRoot : packageRoot;
}
