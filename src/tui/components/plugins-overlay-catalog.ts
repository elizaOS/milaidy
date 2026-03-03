import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type PluginCatalogParam = {
  sensitive?: boolean;
  required?: boolean;
  description?: string;
  type?: string;
  default?: string;
};

type PluginCatalogEntry = {
  id: string;
  npmName?: string;
  description?: string;
  configKeys?: string[];
  pluginParameters?: Record<string, PluginCatalogParam>;
  configUiHints?: Record<
    string,
    {
      label?: string;
    }
  >;
};

export type InstalledPluginMetadata = {
  configKeys: string[];
  pluginParameters: Record<string, PluginCatalogParam>;
  configUiHints: Record<string, { label?: string }>;
};

let pluginCatalogCache: Map<string, PluginCatalogEntry> | null = null;

export function inferSensitiveKey(key: string): boolean {
  const upper = key.toUpperCase();
  return (
    upper.includes("_API_KEY") ||
    upper.includes("_SECRET") ||
    upper.includes("_TOKEN") ||
    upper.includes("_PASSWORD") ||
    upper.includes("_PRIVATE_KEY") ||
    upper.includes("_SIGNING_") ||
    upper.includes("ENCRYPTION_")
  );
}

export function inferRequiredKey(key: string, sensitive: boolean): boolean {
  if (!sensitive) return false;
  const upper = key.toUpperCase();
  return (
    upper.endsWith("_API_KEY") ||
    upper.endsWith("_BOT_TOKEN") ||
    upper.endsWith("_TOKEN") ||
    upper.endsWith("_PRIVATE_KEY")
  );
}

function findPackageRoot(startDir: string): string {
  let dir = startDir;
  for (let i = 0; i < 10; i++) {
    const pkgPath = path.join(dir, "package.json");
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as Record<
          string,
          unknown
        >;
        if (pkg.name === "milady") {
          return dir;
        }
      } catch {
        // keep searching
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return startDir;
}

export function buildPluginCatalogIndex(): Map<string, PluginCatalogEntry> {
  if (pluginCatalogCache) return pluginCatalogCache;

  const thisDir =
    import.meta.dirname ?? path.dirname(fileURLToPath(import.meta.url));
  const packageRoot = findPackageRoot(thisDir);
  const manifestPath = path.join(packageRoot, "plugins.json");
  const map = new Map<string, PluginCatalogEntry>();

  if (!fs.existsSync(manifestPath)) {
    pluginCatalogCache = map;
    return map;
  }

  try {
    const data = JSON.parse(fs.readFileSync(manifestPath, "utf-8")) as {
      plugins?: PluginCatalogEntry[];
    };

    for (const entry of data.plugins ?? []) {
      map.set(entry.id, entry);
      if (entry.npmName) {
        map.set(entry.npmName, entry);
      }
      if (entry.id.startsWith("plugin-")) {
        map.set(`@elizaos/${entry.id}`, entry);
      } else {
        map.set(`plugin-${entry.id}`, entry);
        map.set(`@elizaos/plugin-${entry.id}`, entry);
      }
    }
  } catch {
    // Best effort — empty map fallback
  }

  pluginCatalogCache = map;
  return map;
}

export function readInstalledPluginMetadata(
  packageName: string,
  installPath?: string,
): InstalledPluginMetadata {
  if (!installPath) {
    return { configKeys: [], pluginParameters: {}, configUiHints: {} };
  }

  const pkgJsonCandidates = [
    path.join(
      installPath,
      "node_modules",
      ...packageName.split("/"),
      "package.json",
    ),
    path.join(installPath, "package.json"),
  ];

  for (const pkgPath of pkgJsonCandidates) {
    if (!fs.existsSync(pkgPath)) {
      continue;
    }

    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as {
        pluginParameters?: Record<string, PluginCatalogParam>;
        configUiHints?: Record<string, { label?: string }>;
        elizaos?: {
          configKeys?: string[];
          configUiHints?: Record<string, { label?: string }>;
          pluginParameters?: Record<string, PluginCatalogParam>;
        };
        agentConfig?: {
          pluginParameters?: Record<string, PluginCatalogParam>;
        };
      };

      const pluginParameters =
        pkg.pluginParameters ??
        pkg.elizaos?.pluginParameters ??
        pkg.agentConfig?.pluginParameters ??
        {};
      const configUiHints =
        pkg.configUiHints ?? pkg.elizaos?.configUiHints ?? {};
      const configKeys = Array.from(
        new Set([
          ...(pkg.elizaos?.configKeys ?? []),
          ...Object.keys(pluginParameters),
        ]),
      );

      return { configKeys, pluginParameters, configUiHints };
    } catch {
      // Try next candidate
    }
  }

  return { configKeys: [], pluginParameters: {}, configUiHints: {} };
}
