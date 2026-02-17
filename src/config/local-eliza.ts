/**
 * Local ElizaOS installation utilities.
 *
 * Provides functions to detect and resolve the local ElizaOS monorepo
 * at ~/.milady/eliza for development purposes.
 *
 * @module config/local-eliza
 */

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface LocalElizaSetup {
  setupAt: string;
  elizaPath: string;
  elizaBranch: string;
  corePath: string;
  pluginsPath: string;
  pluginsBranch: string;
  /** @deprecated Use elizaBranch instead */
  branch?: string;
}

const MILADY_DIR = join(homedir(), ".milady");
const ELIZA_DIR = join(MILADY_DIR, "eliza");
const PLUGINS_DIR = join(MILADY_DIR, "plugins");
const CORE_PACKAGE_PATH = join(ELIZA_DIR, "packages", "typescript");
const SETUP_MARKER_PATH = join(MILADY_DIR, ".local-eliza-setup");

/**
 * Check if local ElizaOS is set up at ~/.milady/eliza.
 */
export function hasLocalEliza(): boolean {
  return existsSync(SETUP_MARKER_PATH) && existsSync(CORE_PACKAGE_PATH);
}

/**
 * Get the path to the local ElizaOS monorepo.
 * Returns null if not set up.
 */
export function getLocalElizaPath(): string | null {
  if (!hasLocalEliza()) return null;
  return ELIZA_DIR;
}

/**
 * Get the path to the local @elizaos/core package.
 * Returns null if not set up.
 */
export function getLocalCorePath(): string | null {
  if (!hasLocalEliza()) return null;
  return CORE_PACKAGE_PATH;
}

/**
 * Get the path to the local @elizaos/core source directory.
 * Returns null if not set up.
 */
export function getLocalCoreSourcePath(): string | null {
  if (!hasLocalEliza()) return null;
  return join(CORE_PACKAGE_PATH, "src");
}

/**
 * Get the path to the local @elizaos/core dist directory.
 * Returns null if not set up.
 */
export function getLocalCoreDistPath(): string | null {
  if (!hasLocalEliza()) return null;
  const distPath = join(CORE_PACKAGE_PATH, "dist");
  return existsSync(distPath) ? distPath : null;
}

/**
 * Check if local plugins are set up at ~/.milady/plugins.
 */
export function hasLocalPlugins(): boolean {
  return existsSync(SETUP_MARKER_PATH) && existsSync(PLUGINS_DIR);
}

/**
 * Get the path to the local plugins directory.
 * Returns null if not set up.
 */
export function getLocalPluginsPath(): string | null {
  if (!hasLocalPlugins()) return null;
  return PLUGINS_DIR;
}

/**
 * Get a specific plugin path from the local plugins directory.
 * Returns null if not set up or plugin doesn't exist.
 */
export function getLocalPluginPath(pluginName: string): string | null {
  if (!hasLocalPlugins()) return null;

  // Handle @elizaos/plugin-* format
  let shortName = pluginName;
  if (pluginName.startsWith("@elizaos/plugin-")) {
    shortName = pluginName.replace("@elizaos/plugin-", "");
  } else if (pluginName.startsWith("@elizaos/")) {
    shortName = pluginName.replace("@elizaos/", "");
  }

  // Try packages directory first (monorepo style)
  const packagesPath = join(PLUGINS_DIR, "packages", shortName);
  if (existsSync(packagesPath)) {
    return packagesPath;
  }

  // Try direct plugin directory
  const directPath = join(PLUGINS_DIR, shortName);
  if (existsSync(directPath)) {
    return directPath;
  }

  // Try with plugin- prefix
  const prefixedPath = join(PLUGINS_DIR, `plugin-${shortName}`);
  if (existsSync(prefixedPath)) {
    return prefixedPath;
  }

  return null;
}

/**
 * Read the local eliza setup metadata.
 * Returns null if not set up or marker file is invalid.
 */
export function getLocalElizaSetup(): LocalElizaSetup | null {
  if (!existsSync(SETUP_MARKER_PATH)) return null;

  try {
    const content = readFileSync(SETUP_MARKER_PATH, "utf-8");
    const setup = JSON.parse(content) as Partial<LocalElizaSetup>;

    // Validate required fields
    if (
      typeof setup.elizaPath === "string" &&
      typeof setup.corePath === "string"
    ) {
      // Handle both old (branch) and new (elizaBranch/pluginsBranch) formats
      return {
        setupAt: setup.setupAt || "",
        elizaPath: setup.elizaPath,
        elizaBranch: setup.elizaBranch || setup.branch || "next",
        corePath: setup.corePath,
        pluginsPath: setup.pluginsPath || PLUGINS_DIR,
        pluginsBranch: setup.pluginsBranch || "main",
      };
    }
  } catch {
    // Invalid marker file
  }

  return null;
}

/**
 * Get a specific package path from the local eliza monorepo.
 * Returns null if not set up or package doesn't exist.
 */
export function getLocalPackagePath(packageName: string): string | null {
  if (!hasLocalEliza()) return null;

  // Map common package names to their paths
  const packagePaths: Record<string, string> = {
    "@elizaos/core": CORE_PACKAGE_PATH,
    "@elizaos/prompts": join(ELIZA_DIR, "packages", "prompts"),
    "@elizaos/tui": join(ELIZA_DIR, "packages", "tui"),
    "@elizaos/schemas": join(ELIZA_DIR, "packages", "schemas"),
    "@elizaos/interop": join(ELIZA_DIR, "packages", "interop"),
    "@elizaos/sweagent": join(ELIZA_DIR, "packages", "sweagent"),
  };

  const packagePath = packagePaths[packageName];
  if (packagePath && existsSync(packagePath)) {
    return packagePath;
  }

  // Try to find by package name pattern
  if (packageName.startsWith("@elizaos/")) {
    const shortName = packageName.replace("@elizaos/", "");
    const possiblePath = join(ELIZA_DIR, "packages", shortName);
    if (existsSync(possiblePath)) {
      return possiblePath;
    }
  }

  return null;
}

/**
 * Environment variables that can be set to customize local eliza behavior.
 */
export const LOCAL_ELIZA_ENV = {
  /** Skip local eliza setup during postinstall */
  SKIP_SETUP: "MILADY_SKIP_LOCAL_ELIZA",
  /** Override the eliza directory path */
  ELIZA_PATH: "MILADY_LOCAL_ELIZA_PATH",
  /** Use npm packages instead of local source */
  USE_NPM: "MILADY_USE_NPM_CORE",
} as const;

/**
 * Check if we should use npm packages instead of local source.
 * Set MILADY_USE_NPM_CORE=1 to force npm resolution.
 */
export function shouldUseNpmCore(): boolean {
  return process.env[LOCAL_ELIZA_ENV.USE_NPM] === "1";
}

/**
 * Get the effective eliza path, respecting environment overrides.
 */
export function getEffectiveElizaPath(): string | null {
  const envPath = process.env[LOCAL_ELIZA_ENV.ELIZA_PATH];
  if (envPath && existsSync(envPath)) {
    return envPath;
  }
  return getLocalElizaPath();
}
