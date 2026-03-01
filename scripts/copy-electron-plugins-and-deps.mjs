#!/usr/bin/env node
/**
 * Copy @elizaos/* packages and their transitive deps into
 * apps/app/electron/milady-dist/node_modules.
 *
 * Plugins (@elizaos/plugin-*) are discovered from package.json and only
 * copied when they have a valid dist/ folder (matching the filter used by
 * transform-plugins-for-electron.ts). Non-plugin @elizaos packages (core,
 * prompts) are copied unconditionally when present.
 *
 * Transitive deps are derived by walking each copied @elizaos package's
 * package.json "dependencies" (and optionalDependencies) recursively.
 *
 * Design notes:
 * - We do not try to exclude deps that tsdown may have inlined into plugin
 *   dist/ bundles; plugins can dynamic-require at runtime, so excluding them
 *   would risk "Cannot find module" in packaged app. Extra copies are safe.
 * - DEP_SKIP below excludes known dev-only or renderer-only packages that
 *   are sometimes listed in plugin dependencies, to avoid bundle bloat.
 *
 * Run from repo root after "Bundle dist for Electron" has created
 * milady-dist/ and copied the bundled JS files.
 *
 * Usage: node scripts/copy-electron-plugins-and-deps.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const NODE_MODULES = path.join(ROOT, "node_modules");
const MILADY_DIST = path.join(ROOT, "apps", "app", "electron", "milady-dist");
const MILADY_DIST_NM = path.join(MILADY_DIST, "node_modules");

// Fail fast if milady-dist hasn't been created by the preceding build step.
if (!fs.existsSync(MILADY_DIST)) {
  console.error(
    `Error: ${MILADY_DIST} does not exist. Run the Electron dist bundle step first.`,
  );
  process.exit(1);
}

// @elizaos packages that should NOT be copied (dev tooling, not runtime deps).
const ELIZAOS_SKIP = new Set(["@elizaos/sweagent-root", "@elizaos/tui"]);

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) return false;
  // Remove existing destination to avoid EEXIST errors with symlinks
  if (fs.existsSync(dest)) {
    fs.rmSync(dest, { recursive: true, force: true });
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.cpSync(src, dest, { recursive: true, force: true, dereference: true });
  return true;
}

/** Path to a package's package.json in root node_modules. */
function getPackageJsonPath(name) {
  if (name.startsWith("@")) {
    const [scope, pkgName] = name.split("/");
    return path.join(NODE_MODULES, scope, pkgName, "package.json");
  }
  return path.join(NODE_MODULES, name, "package.json");
}

/** Dependency names from package.json (dependencies + optionalDependencies). WHY not devDependencies: those are build-time only; runtime needs only deps + optional. */
function getDependencyNames(pkgObj) {
  const deps = pkgObj.dependencies ?? {};
  const optional = pkgObj.optionalDependencies ?? {};
  return new Set([...Object.keys(deps), ...Object.keys(optional)]);
}

// Packages that should never be copied even if listed as a runtime dep
// (dev tooling or renderer-only deps sometimes in plugin package.json).
const DEP_SKIP = new Set([
  "typescript",
  "tslib",
  "@types/node",
  "lucide-react", // renderer/frontend icons; agent runtime is main process only
]);

/**
 * Recursively collect all non-@elizaos dependency names reachable from
 * the given package names (which are @elizaos/* — we discover their deps).
 * WHY walk but not add @elizaos: we copy @elizaos packages in a separate
 * loop above; this set is only for transitive third-party deps to copy here.
 */
function collectTransitiveDeps(entryNames) {
  const collected = new Set();
  const visited = new Set();

  function visit(name) {
    if (visited.has(name)) return;
    visited.add(name);
    if (DEP_SKIP.has(name)) return;
    const pkgPath = getPackageJsonPath(name);
    if (!fs.existsSync(pkgPath)) return;
    // Only add non-@elizaos to collected; @elizaos are copied earlier.
    if (!name.startsWith("@elizaos/")) {
      collected.add(name);
    }
    try {
      const pkg = readJson(pkgPath);
      for (const dep of getDependencyNames(pkg)) {
        visit(dep);
      }
    } catch (err) {
      console.warn(`  Warning: could not read ${pkgPath}:`, err.message);
    }
  }

  for (const name of entryNames) {
    visit(name);
  }
  return collected;
}

// Discover @elizaos/* from package.json and filter to those present.
const pkg = readJson(path.join(ROOT, "package.json"));
const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
const elizaosPackages = Object.keys(allDeps).filter(
  (d) => d.startsWith("@elizaos/") && !ELIZAOS_SKIP.has(d),
);

const toCopy = elizaosPackages.filter((name) => {
  const dir = path.join(NODE_MODULES, name);
  try {
    if (!fs.statSync(dir).isDirectory()) return false;
    if (name.startsWith("@elizaos/plugin-")) {
      const distPath = path.join(dir, "dist");
      return fs.statSync(distPath).isDirectory();
    }
    return true; // core, prompts, etc.
  } catch {
    return false;
  }
});

console.log(
  `Found ${elizaosPackages.length} @elizaos/* in package.json, ${toCopy.length} to copy (present + valid dist for plugins)`,
);

fs.mkdirSync(path.join(MILADY_DIST_NM, "@elizaos"), { recursive: true });

for (const name of toCopy) {
  const short = name.replace("@elizaos/", "");
  const src = path.join(NODE_MODULES, "@elizaos", short);
  const dest = path.join(MILADY_DIST_NM, "@elizaos", short);
  if (copyRecursive(src, dest)) {
    console.log("  Copied", name);
  }
}
console.log("Done copying @elizaos packages");

const transitiveDeps = collectTransitiveDeps(toCopy);
console.log(`Copying ${transitiveDeps.size} transitive plugin dependencies...`);
const sortedDeps = [...transitiveDeps].sort();
for (const name of sortedDeps) {
  const [scope, pkgName] = name.startsWith("@")
    ? name.split("/")
    : [null, name];
  const src =
    scope != null
      ? path.join(NODE_MODULES, scope, pkgName)
      : path.join(NODE_MODULES, name);
  const dest =
    scope != null
      ? path.join(MILADY_DIST_NM, scope, pkgName)
      : path.join(MILADY_DIST_NM, name);
  if (copyRecursive(src, dest)) {
    console.log("  Copied", name);
  } else {
    console.warn("  Warning:", name, "not found in node_modules");
  }
}
console.log("Done copying plugin dependencies");

// Copy PGLite extension files required for database initialization.
// These files are loaded at runtime by @electric-sql/pglite.
const ELECTRON_DIR = path.join(ROOT, "apps", "app", "electron");
const PGLITE_DIST = path.join(NODE_MODULES, "@electric-sql", "pglite", "dist");

console.log("Copying PGLite extension files...");

// Extensions (vector, fuzzystrmatch) go to electron root (app.asar.unpacked/)
const extensionFiles = ["vector.tar.gz", "fuzzystrmatch.tar.gz"];
for (const file of extensionFiles) {
  const src = path.join(PGLITE_DIST, file);
  const dest = path.join(ELECTRON_DIR, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    console.log(`  Copied ${file} to electron/`);
  } else {
    console.warn(`  Warning: ${file} not found in @electric-sql/pglite/dist`);
  }
}

// Data/wasm files go to milady-dist/
const dataFiles = ["pglite.data", "pglite.wasm"];
for (const file of dataFiles) {
  const src = path.join(PGLITE_DIST, file);
  const dest = path.join(MILADY_DIST, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    console.log(`  Copied ${file} to milady-dist/`);
  } else {
    console.warn(`  Warning: ${file} not found in @electric-sql/pglite/dist`);
  }
}

console.log("Done copying PGLite files");

// ============================================================================
// Native module handling
// ============================================================================
// Native modules (node-llama-cpp, sharp, onnxruntime-node, etc.) are marked as
// external in tsdown.electron.config.ts. They're loaded from milady-dist/node_modules
// at runtime. Many have platform-specific binary packages stored in bun's .bun/
// directory that need to be copied to the proper location.

console.log("Copying native modules and platform binaries...");

const bunDir = path.join(NODE_MODULES, ".bun");
const bunDirExists = fs.existsSync(bunDir);
const bunEntries = bunDirExists ? fs.readdirSync(bunDir) : [];

// Detect current platform and architecture
const osPlatform = process.platform; // darwin, linux, win32
const osArch = process.arch; // arm64, x64

/**
 * Find and copy a package from bun's .bun directory.
 * @param {string} pkgPattern - Package name pattern (e.g., "@node-llama-cpp+mac-arm64-metal")
 * @param {string} destPkgName - Destination package name (e.g., "@node-llama-cpp/mac-arm64-metal")
 * @param {string|null} targetVersion - Preferred version to match, or null for highest
 * @returns {boolean} - Whether the package was copied
 */
function copyBunPackage(pkgPattern, destPkgName, targetVersion = null) {
  if (!bunDirExists) return false;

  const prefix = `${pkgPattern}@`;
  let matchingEntry = null;

  if (targetVersion) {
    // Try exact version match first
    matchingEntry = bunEntries.find((e) => e === `${prefix}${targetVersion}`);
  }
  if (!matchingEntry) {
    // Fall back to highest version available
    const candidates = bunEntries.filter((e) => e.startsWith(prefix)).sort();
    matchingEntry = candidates[candidates.length - 1];
  }

  if (!matchingEntry) return false;

  // Determine the nested path structure in .bun
  const [scope, shortName] = destPkgName.startsWith("@")
    ? destPkgName.split("/")
    : [null, destPkgName];

  const srcPath = scope
    ? path.join(bunDir, matchingEntry, "node_modules", scope, shortName)
    : path.join(bunDir, matchingEntry, "node_modules", shortName);

  const destPath = scope
    ? path.join(MILADY_DIST_NM, scope, shortName)
    : path.join(MILADY_DIST_NM, shortName);

  if (copyRecursive(srcPath, destPath)) {
    const version = matchingEntry.split("@").pop();
    console.log(`  Copied ${destPkgName} (${version})`);
    return true;
  }
  return false;
}

// ----------------------------------------------------------------------------
// 1. node-llama-cpp platform binaries
// ----------------------------------------------------------------------------
console.log("  [node-llama-cpp]");

// Get node-llama-cpp version from milady-dist to match the correct binary
const nlcPkgPath = path.join(MILADY_DIST_NM, "node-llama-cpp", "package.json");
let nlcVersion = null;
if (fs.existsSync(nlcPkgPath)) {
  try {
    nlcVersion = readJson(nlcPkgPath).version;
  } catch {}
}

// Map platform/arch to node-llama-cpp package names
// Note: node-llama-cpp has GPU-specific variants for Linux/Windows
const nlcPlatformMap = {
  darwin: {
    arm64: ["mac-arm64-metal"],
    x64: ["mac-x64"],
  },
  linux: {
    arm64: ["linux-arm64"],
    x64: ["linux-x64", "linux-x64-cuda", "linux-x64-vulkan"],
  },
  win32: {
    arm64: ["win-arm64"],
    x64: ["win-x64", "win-x64-cuda", "win-x64-vulkan"],
  },
};

const nlcPlatformPkgs = nlcPlatformMap[osPlatform]?.[osArch] ?? [];
for (const platformPkg of nlcPlatformPkgs) {
  const copied = copyBunPackage(
    `@node-llama-cpp+${platformPkg}`,
    `@node-llama-cpp/${platformPkg}`,
    nlcVersion,
  );
  if (!copied && platformPkg === nlcPlatformPkgs[0]) {
    // Only warn if the primary platform package is missing
    console.warn(`    Warning: @node-llama-cpp/${platformPkg} not found`);
  }
}

// Copy lifecycle-utils (node-llama-cpp dependency)
copyBunPackage("lifecycle-utils", "lifecycle-utils");

// ----------------------------------------------------------------------------
// 2. sharp platform binaries
// ----------------------------------------------------------------------------
console.log("  [sharp]");

// Read sharp's optionalDependencies to get exact versions needed
const sharpPkgPath = path.join(MILADY_DIST_NM, "sharp", "package.json");
const sharpPkg = fs.existsSync(sharpPkgPath) ? readJson(sharpPkgPath) : {};
const sharpOptDeps = sharpPkg.optionalDependencies ?? {};

// Map platform/arch to sharp package names
const sharpPlatformMap = {
  darwin: {
    arm64: ["@img/sharp-darwin-arm64", "@img/sharp-libvips-darwin-arm64"],
    x64: ["@img/sharp-darwin-x64", "@img/sharp-libvips-darwin-x64"],
  },
  linux: {
    arm64: ["@img/sharp-linux-arm64", "@img/sharp-libvips-linux-arm64"],
    x64: ["@img/sharp-linux-x64", "@img/sharp-libvips-linux-x64"],
  },
  win32: {
    x64: ["@img/sharp-win32-x64"],
    ia32: ["@img/sharp-win32-ia32"],
  },
};

const sharpPlatformPkgs = sharpPlatformMap[osPlatform]?.[osArch] ?? [];
for (const pkgName of sharpPlatformPkgs) {
  // Convert @img/sharp-darwin-arm64 to @img+sharp-darwin-arm64 for bun pattern
  const bunPattern = pkgName.replace("/", "+");
  // Use exact version from sharp's optionalDependencies
  const expectedVersion = sharpOptDeps[pkgName] ?? null;
  copyBunPackage(bunPattern, pkgName, expectedVersion);
}

// Copy sharp's runtime dependencies
copyBunPackage("detect-libc", "detect-libc");
copyBunPackage("color", "color");
copyBunPackage("color-string", "color-string");
copyBunPackage("simple-swizzle", "simple-swizzle");

// ----------------------------------------------------------------------------
// 3. @reflink platform binaries
// ----------------------------------------------------------------------------
console.log("  [@reflink]");

const reflinkPlatformMap = {
  darwin: {
    arm64: "@reflink/reflink-darwin-arm64",
    x64: "@reflink/reflink-darwin-x64",
  },
  linux: {
    arm64: "@reflink/reflink-linux-arm64-gnu",
    x64: "@reflink/reflink-linux-x64-gnu",
  },
};

const reflinkPkg = reflinkPlatformMap[osPlatform]?.[osArch];
if (reflinkPkg) {
  const bunPattern = reflinkPkg.replace("/", "+");
  copyBunPackage(bunPattern, reflinkPkg);
}

// Also copy the main @reflink/reflink package
copyBunPackage("@reflink+reflink", "@reflink/reflink");

// ----------------------------------------------------------------------------
// 4. onnxruntime-node (has native binaries in main package)
// ----------------------------------------------------------------------------
console.log("  [onnxruntime-node]");

// Get onnxruntime-node version
const onnxPkgPath = path.join(
  MILADY_DIST_NM,
  "onnxruntime-node",
  "package.json",
);
let onnxVersion = null;
if (fs.existsSync(onnxPkgPath)) {
  try {
    onnxVersion = readJson(onnxPkgPath).version;
  } catch {}
}
copyBunPackage("onnxruntime-node", "onnxruntime-node", onnxVersion);
copyBunPackage("onnxruntime-common", "onnxruntime-common", onnxVersion);

// ----------------------------------------------------------------------------
// 5. fsevents (macOS only)
// ----------------------------------------------------------------------------
if (osPlatform === "darwin") {
  console.log("  [fsevents]");
  copyBunPackage("fsevents", "fsevents");
}

// ----------------------------------------------------------------------------
// 6. canvas (has native binaries)
// ----------------------------------------------------------------------------
console.log("  [canvas]");
copyBunPackage("canvas", "canvas");

// ----------------------------------------------------------------------------
// 7. koffi (native FFI library)
// ----------------------------------------------------------------------------
console.log("  [koffi]");
copyBunPackage("koffi", "koffi");

console.log("Done copying native modules");

console.log("milady-dist/node_modules contents:");
try {
  console.log(fs.readdirSync(MILADY_DIST_NM).join(" "));
} catch {
  console.log("  (empty or not found)");
}
