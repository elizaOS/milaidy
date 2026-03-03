/**
 * Patch @elizaos packages whose exports["."].bun points to ./src/index.ts
 * (missing in published tarball). Exported for use by patch-deps.mjs and tests.
 * See docs/plugin-resolution-and-node-path.md "Bun and published package exports".
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

/**
 * Find all package.json paths for pkgName under root (main node_modules and
 * Bun cache). Match Bun's cache dir naming: @scope/pkg → scope+pkg.
 * Exported for tests.
 */
export function findPackageJsonPaths(root, pkgName) {
  const candidates = [resolve(root, "node_modules", pkgName, "package.json")];
  const bunCache = resolve(root, "node_modules/.bun");
  if (existsSync(bunCache)) {
    const safeName = pkgName.replaceAll("/", "+").replaceAll("@", "");
    for (const entry of readdirSync(bunCache)) {
      if (entry.startsWith(safeName)) {
        const p = resolve(
          bunCache,
          entry,
          "node_modules",
          pkgName,
          "package.json",
        );
        if (existsSync(p)) candidates.push(p);
      }
    }
  }
  return candidates;
}

/**
 * If pkg.json has exports["."].bun = "./src/index.ts" and that file doesn't
 * exist, remove "bun" and "default" so resolver uses "import" → dist/.
 * Returns true if the file was patched.
 */
export function applyPatchToPackageJson(pkgPath) {
  if (!existsSync(pkgPath)) return false;
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  const dot = pkg.exports?.["."];
  if (!dot || typeof dot !== "object") return false;
  if (!dot.bun || !dot.bun.endsWith("/src/index.ts")) return false;

  const dir = dirname(pkgPath);
  if (existsSync(resolve(dir, dot.bun))) return false; // src exists — no patch

  delete dot.bun;
  if (dot.default?.endsWith("/src/index.ts")) {
    delete dot.default;
  }
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");
  return true;
}

/**
 * Patch all copies of pkgName under root (node_modules and Bun cache).
 * Logs when a file is patched. Used by postinstall in patch-deps.mjs.
 */
export function patchBunExports(root, pkgName, log = console.log) {
  const candidates = findPackageJsonPaths(root, pkgName);
  let patched = false;
  for (const pkgPath of candidates) {
    if (applyPatchToPackageJson(pkgPath)) {
      patched = true;
      log(
        `[patch-deps] Patched ${pkgName} exports: removed dead "bun"/"default" → src/index.ts conditions.`,
      );
    }
  }
  return patched;
}
