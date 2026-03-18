import fs from "node:fs";
import Module from "node:module";
import path from "node:path";

const require = Module.createRequire(import.meta.url);
const MODULE_EXTENSIONS = [".ts", ".tsx", ".mts", ".js", ".jsx", ".mjs", ".cjs"];
const preferInstalledEliza = process.env.MILADY_PREFER_INSTALLED_ELIZA === "1";

function firstExistingPath(
  candidates: Array<string | undefined>,
): string | undefined {
  return candidates.find(
    (candidate): candidate is string =>
      typeof candidate === "string" && fs.existsSync(candidate),
  );
}

function resolvePackageRoot(packageName: string): string | undefined {
  try {
    return path.dirname(require.resolve(`${packageName}/package.json`));
  } catch {
    return undefined;
  }
}

export function resolveModuleEntry(basePath: string): string {
  if (fs.existsSync(basePath)) {
    return basePath;
  }

  const withExtension = firstExistingPath(
    MODULE_EXTENSIONS.map((extension) => `${basePath}${extension}`),
  );

  return withExtension ?? basePath;
}

export function getElizaWorkspaceRoot(repoRoot: string): string | undefined {
  if (preferInstalledEliza) {
    return undefined;
  }

  const workspaceRoot = path.resolve(repoRoot, "..", "eliza");
  const workspaceCoreEntry = path.join(
    workspaceRoot,
    "packages",
    "typescript",
    "src",
    "index.ts",
  );
  return fs.existsSync(workspaceCoreEntry) ? workspaceRoot : undefined;
}

export function getElizaCoreEntry(repoRoot: string): string | undefined {
  const workspaceRoot = getElizaWorkspaceRoot(repoRoot);
  if (!workspaceRoot) {
    return undefined;
  }

  return resolveModuleEntry(
    path.join(workspaceRoot, "packages", "typescript", "src", "index"),
  );
}

export function getAutonomousSourceRoot(repoRoot: string): string | undefined {
  const workspaceRoot = getElizaWorkspaceRoot(repoRoot);

  return firstExistingPath([
    workspaceRoot
      ? path.join(workspaceRoot, "packages", "autonomous", "src")
      : undefined,
    (() => {
      const packageRoot = resolvePackageRoot("@elizaos/autonomous");
      if (!packageRoot) {
        return undefined;
      }

      return firstExistingPath([
        path.join(packageRoot, "src"),
        path.join(packageRoot, "packages", "autonomous", "src"),
      ]);
    })(),
  ]);
}

export function getAppCoreSourceRoot(repoRoot: string): string | undefined {
  const workspaceRoot = getElizaWorkspaceRoot(repoRoot);

  return firstExistingPath([
    workspaceRoot
      ? path.join(workspaceRoot, "packages", "app-core", "src")
      : undefined,
  ]);
}

export function resolveAutonomousSourceFile(
  repoRoot: string,
  relativePath: string,
): string | undefined {
  const sourceRoot = getAutonomousSourceRoot(repoRoot);
  if (!sourceRoot) {
    return undefined;
  }

  const normalizedRelativePath = relativePath.replaceAll("\\", "/");
  const extname = path.extname(normalizedRelativePath);
  const basePath = path.join(
    sourceRoot,
    extname
      ? normalizedRelativePath.slice(0, -extname.length)
      : normalizedRelativePath,
  );

  return firstExistingPath([
    resolveModuleEntry(basePath),
    path.join(sourceRoot, normalizedRelativePath),
  ]);
}
