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

console.log("milady-dist/node_modules contents:");
try {
  console.log(fs.readdirSync(MILADY_DIST_NM).join(" "));
} catch {
  console.log("  (empty or not found)");
}
