import { existsSync } from "node:fs";
import path from "node:path";

export interface WebAssetResolution {
  directory: string;
  searched: string[];
  usedFallback: boolean;
  hasIndexHtml: boolean;
  primaryHasIndexHtml: boolean;
}

interface ResolveWebAssetDirectoryOptions {
  appPath: string;
  cwd?: string;
  webDir?: string;
  preferBuildOutput?: boolean;
}

const DEFAULT_WEB_DIR = "dist";

function hasIndexHtml(dir: string): boolean {
  return existsSync(path.join(dir, "index.html"));
}

function dedupePaths(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const normalized = path.resolve(item);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

export function resolveWebAssetDirectory(
  options: ResolveWebAssetDirectoryOptions,
): WebAssetResolution {
  const webDir = options.webDir?.trim() || DEFAULT_WEB_DIR;
  const cwd = options.cwd ?? process.cwd();
  const appRoot = path.resolve(options.appPath);
  const primary = path.join(appRoot, "app");
  const primaryHasIndex = hasIndexHtml(primary);

  const defaultCandidates = [
    primary,
    path.join(appRoot, webDir),
    path.join(appRoot, "..", webDir),
    path.join(cwd, "app"),
    path.join(cwd, webDir),
    path.join(cwd, "..", webDir),
  ];

  const preferBuildOutputCandidates = [
    path.join(appRoot, webDir),
    path.join(appRoot, "..", webDir),
    path.join(cwd, webDir),
    path.join(cwd, "..", webDir),
    primary,
    path.join(cwd, "app"),
  ];

  const candidates = dedupePaths(
    options.preferBuildOutput ? preferBuildOutputCandidates : defaultCandidates,
  );

  for (const candidate of candidates) {
    if (!hasIndexHtml(candidate)) continue;
    return {
      directory: candidate,
      searched: candidates,
      usedFallback: candidate !== primary,
      hasIndexHtml: true,
      primaryHasIndexHtml: primaryHasIndex,
    };
  }

  return {
    directory: primary,
    searched: candidates,
    usedFallback: false,
    hasIndexHtml: false,
    primaryHasIndexHtml: primaryHasIndex,
  };
}

export function buildMissingWebAssetsMessage(
  resolution: WebAssetResolution,
): string {
  const attempted = resolution.searched
    .map((candidate) => `- ${candidate}`)
    .join("\n");
  return (
    "[Milady] Web assets were not found for Electron startup. " +
    "Run `bun run build:electron` from `apps/app` to regenerate assets.\n" +
    `Attempted directories:\n${attempted}`
  );
}
