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
  return findPackageFilePaths(root, pkgName, "package.json");
}

/**
 * Find all matching files for pkgName under root (main node_modules and Bun
 * cache). Exported so tests and other patch helpers share the same lookup.
 */
export function findPackageFilePaths(root, pkgName, relativePath) {
  const candidates = [resolve(root, "node_modules", pkgName, relativePath)];
  const bunCache = resolve(root, "node_modules/.bun");
  if (existsSync(bunCache)) {
    const safeNames = new Set([
      pkgName.replaceAll("/", "+"),
      pkgName.replaceAll("/", "+").replaceAll("@", ""),
    ]);
    for (const entry of readdirSync(bunCache)) {
      if (![...safeNames].some((safeName) => entry.startsWith(safeName)))
        continue;
      const p = resolve(bunCache, entry, "node_modules", pkgName, relativePath);
      if (existsSync(p)) candidates.push(p);
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
 * Some published packages only export subpaths with explicit `.js` suffixes
 * (for example "./sha3.js"), while runtime consumers import the extensionless
 * variant ("@scope/pkg/sha3"). Add extensionless aliases so Bun resolves the
 * published package the same way as modern bundlers.
 */
export function applyExtensionlessJsExportAliases(pkgPath) {
  if (!existsSync(pkgPath)) return false;
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  const exportsField = pkg.exports;
  if (
    !exportsField ||
    typeof exportsField !== "object" ||
    Array.isArray(exportsField)
  ) {
    return false;
  }

  let patched = false;
  for (const [key, value] of Object.entries(exportsField)) {
    if (!key.startsWith("./") || !key.endsWith(".js")) continue;
    const alias = key.slice(0, -3);
    if (Object.hasOwn(exportsField, alias)) continue;
    exportsField[alias] = value;
    patched = true;
  }

  if (!patched) return false;

  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");
  return true;
}

/**
 * @noble/hashes@2.x removed several legacy direct entry points that ethers@6
 * still imports (sha256, sha512, ripemd160). Recreate those shims so Bun can
 * resolve the package without downgrading the whole tree.
 */
export function applyNobleHashesCompat(pkgPath) {
  if (!existsSync(pkgPath)) return false;
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  if (pkg.name !== "@noble/hashes") return false;

  const exportsField = pkg.exports;
  if (
    !exportsField ||
    typeof exportsField !== "object" ||
    Array.isArray(exportsField)
  ) {
    return false;
  }

  const dir = dirname(pkgPath);
  const shims = [
    {
      subpath: "ripemd160",
      sourceFile: "legacy.js",
      contents: 'export { ripemd160 } from "./legacy.js";\n',
    },
    {
      subpath: "sha256",
      sourceFile: "sha2.js",
      contents: 'export { sha256 } from "./sha2.js";\n',
    },
    {
      subpath: "sha512",
      sourceFile: "sha2.js",
      contents: 'export { sha512 } from "./sha2.js";\n',
    },
  ];

  let patched = false;

  for (const shim of shims) {
    if (!existsSync(resolve(dir, shim.sourceFile))) continue;

    const exportKey = `./${shim.subpath}`;
    const exportFileKey = `./${shim.subpath}.js`;
    const exportTarget = `./${shim.subpath}.js`;
    const shimPath = resolve(dir, `${shim.subpath}.js`);

    if (!existsSync(shimPath)) {
      writeFileSync(shimPath, shim.contents, "utf8");
      patched = true;
    }

    if (exportsField[exportKey] !== exportTarget) {
      exportsField[exportKey] = exportTarget;
      patched = true;
    }

    if (exportsField[exportFileKey] !== exportTarget) {
      exportsField[exportFileKey] = exportTarget;
      patched = true;
    }
  }

  if (!patched) return false;

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

/**
 * Patch all copies of pkgName so any "./foo.js" export also exposes "./foo".
 */
export function patchExtensionlessJsExports(root, pkgName, log = console.log) {
  const candidates = findPackageJsonPaths(root, pkgName);
  let patched = false;
  for (const pkgPath of candidates) {
    if (applyExtensionlessJsExportAliases(pkgPath)) {
      patched = true;
      log(
        `[patch-deps] Patched ${pkgName} exports: added extensionless aliases for .js subpaths.`,
      );
    }
  }
  return patched;
}

/**
 * Patch all copies of @noble/hashes so legacy ethers subpaths keep resolving
 * even when Bun installs the newer 2.x package at the root.
 */
export function patchNobleHashesCompat(root, log = console.log) {
  const candidates = findPackageJsonPaths(root, "@noble/hashes");
  let patched = false;
  for (const pkgPath of candidates) {
    if (applyNobleHashesCompat(pkgPath)) {
      patched = true;
      log(
        "[patch-deps] Patched @noble/hashes exports: restored legacy ethers-compatible sha256/sha512/ripemd160 shims.",
      );
    }
  }
  return patched;
}

/**
 * proper-lockfile expects require("signal-exit") to return a callable export
 * (v3 behavior). In v4 the package exports an object with { onExit }. Patch the
 * require site so the dependency works with either version.
 */
export function applyProperLockfileSignalExitCompat(filePath) {
  if (!existsSync(filePath)) return false;

  const compatSource = readFileSync(filePath, "utf8");
  const patchedLine =
    "const signalExit = require('signal-exit');\nconst onExit = typeof signalExit === 'function' ? signalExit : signalExit.onExit;";
  if (compatSource.includes(patchedLine)) return false;

  const originalLine = "const onExit = require('signal-exit');";
  if (!compatSource.includes(originalLine)) return false;

  writeFileSync(
    filePath,
    compatSource.replace(originalLine, patchedLine),
    "utf8",
  );
  return true;
}

/**
 * Patch all copies of proper-lockfile so signal-exit v3/v4 both work.
 */
export function patchProperLockfileSignalExitCompat(root, log = console.log) {
  const candidates = findPackageFilePaths(
    root,
    "proper-lockfile",
    "lib/lockfile.js",
  );
  let patched = false;
  for (const filePath of candidates) {
    if (applyProperLockfileSignalExitCompat(filePath)) {
      patched = true;
      log(
        "[patch-deps] Patched proper-lockfile: signal-exit v3/v4 compatibility applied.",
      );
    }
  }
  return patched;
}
