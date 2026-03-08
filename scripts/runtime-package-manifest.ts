import fs from "node:fs";
import path from "node:path";

const JS_FILE_RE = /\.(?:[cm]?js)$/i;
const IMPORT_SPECIFIER_RE =
  /\b(?:import|export)\s+(?:[^"'`;]+?\s+from\s+)?["']([^"']+)["']|\bimport\(\s*["']([^"']+)["']\s*\)|\brequire\(\s*["']([^"']+)["']\s*\)/g;

export function normalizePackageName(specifier: string): string | null {
  if (
    !specifier ||
    specifier.startsWith(".") ||
    specifier.startsWith("/") ||
    specifier.startsWith("node:") ||
    specifier.startsWith("file:")
  ) {
    return null;
  }

  if (specifier.startsWith("@")) {
    const [scope, pkg] = specifier.split("/");
    return scope && pkg ? `${scope}/${pkg}` : null;
  }

  const [pkg] = specifier.split("/");
  return pkg || null;
}

export function extractBarePackageSpecifiers(source: string): string[] {
  const found = new Set<string>();
  const matches = source.matchAll(IMPORT_SPECIFIER_RE);

  for (const match of matches) {
    const raw = match[1] || match[2] || match[3];
    const normalized = raw ? normalizePackageName(raw) : null;
    if (normalized) found.add(normalized);
  }

  return [...found].sort();
}

export function discoverRuntimePackages(scanDir: string): string[] {
  const found = new Set<string>();

  function walk(dir: string): void {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(entryPath);
        continue;
      }
      if (!entry.isFile() || !JS_FILE_RE.test(entry.name)) continue;
      const source = fs.readFileSync(entryPath, "utf8");
      for (const pkg of extractBarePackageSpecifiers(source)) {
        found.add(pkg);
      }
    }
  }

  walk(scanDir);
  return [...found].sort();
}

export function discoverAlwaysBundledPackages(
  packageJsonPath: string,
): string[] {
  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as {
    dependencies?: Record<string, string>;
  };
  const deps = Object.keys(pkg.dependencies ?? {});
  return deps
    .filter(
      (name) =>
        name.startsWith("@elizaos/") || name.startsWith("@milady/plugin-"),
    )
    .sort();
}
