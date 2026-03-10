import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface DesktopRuntimeManifest {
  excludedCapabilityPacks: string[];
  excludedPackages: string[];
}

export interface DesktopRuntimeManifestReadOptions {
  forceReload?: boolean;
  manifestPath?: string;
  moduleUrl?: string;
}

const manifestCache = new Map<string, DesktopRuntimeManifest | null>();

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === "string");
}

export function resolveDesktopRuntimeManifestPath(
  moduleUrl = import.meta.url,
): string {
  const currentDir = path.dirname(fileURLToPath(moduleUrl));
  return path.resolve(currentDir, "..", "desktop-runtime-manifest.json");
}

export function clearDesktopRuntimeManifestCache(): void {
  manifestCache.clear();
}

export function readDesktopRuntimeManifestSync(
  options: DesktopRuntimeManifestReadOptions = {},
): DesktopRuntimeManifest | null {
  const manifestPath =
    options.manifestPath ??
    resolveDesktopRuntimeManifestPath(options.moduleUrl ?? import.meta.url);

  if (!options.forceReload && manifestCache.has(manifestPath)) {
    return manifestCache.get(manifestPath) ?? null;
  }

  try {
    const parsed = JSON.parse(
      fs.readFileSync(manifestPath, "utf8"),
    ) as Partial<DesktopRuntimeManifest>;
    const manifest: DesktopRuntimeManifest = {
      excludedCapabilityPacks: toStringArray(parsed.excludedCapabilityPacks),
      excludedPackages: toStringArray(parsed.excludedPackages),
    };
    manifestCache.set(manifestPath, manifest);
    return manifest;
  } catch {
    manifestCache.set(manifestPath, null);
    return null;
  }
}

export function getExcludedDesktopRuntimeCapabilityPacks(
  options: DesktopRuntimeManifestReadOptions = {},
): ReadonlySet<string> {
  const manifest = readDesktopRuntimeManifestSync(options);
  return new Set(manifest?.excludedCapabilityPacks ?? []);
}

export function getExcludedDesktopRuntimePackages(
  options: DesktopRuntimeManifestReadOptions = {},
): ReadonlySet<string> {
  const manifest = readDesktopRuntimeManifestSync(options);
  return new Set(manifest?.excludedPackages ?? []);
}

export function isDesktopRuntimePackageExcluded(
  packageName: string,
  options: DesktopRuntimeManifestReadOptions = {},
): boolean {
  return getExcludedDesktopRuntimePackages(options).has(packageName);
}
