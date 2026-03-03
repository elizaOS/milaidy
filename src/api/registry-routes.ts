import type { PluginManagerLike } from "../services/plugin-manager-types";
import { parseClampedInteger } from "../utils/number-parsing";
import type { RouteHelpers, RouteRequestMeta } from "./route-helpers";

export interface RegistryRouteContext
  extends RouteRequestMeta,
    Pick<RouteHelpers, "json" | "error"> {
  url: URL;
  getPluginManager: () => PluginManagerLike;
  getLoadedPluginNames: () => string[];
  getBundledPluginIds: () => Set<string>;
}

export async function handleRegistryRoutes(
  ctx: RegistryRouteContext,
): Promise<boolean> {
  const {
    res,
    method,
    pathname,
    url,
    json,
    error,
    getPluginManager,
    getLoadedPluginNames,
    getBundledPluginIds,
  } = ctx;

  // ── GET /api/registry/plugins ────────────────────────────────────────
  if (method === "GET" && pathname === "/api/registry/plugins") {
    try {
      const pluginManager = getPluginManager();
      const registry = await pluginManager.refreshRegistry();
      const installed = await pluginManager.listInstalledPlugins();
      const installedNames = new Set(installed.map((plugin) => plugin.name));

      // Also check which plugins are loaded in the runtime.
      const loadedNames = new Set(getLoadedPluginNames());

      // Cross-reference with bundled manifest so the Store can hide them.
      const bundledIds = getBundledPluginIds();

      const plugins = Array.from(registry.values()).map((plugin) => {
        const shortId = plugin.name
          .replace(/^@[^/]+\/plugin-/, "")
          .replace(/^@[^/]+\//, "")
          .replace(/^plugin-/, "");
        return {
          ...plugin,
          installed: installedNames.has(plugin.name),
          installedVersion:
            installed.find((entry) => entry.name === plugin.name)?.version ??
            null,
          loaded:
            loadedNames.has(plugin.name) ||
            loadedNames.has(plugin.name.replace("@elizaos/", "")),
          bundled: bundledIds.has(shortId),
        };
      });
      json(res, { count: plugins.length, plugins });
    } catch (err) {
      error(
        res,
        `Failed to fetch registry: ${err instanceof Error ? err.message : String(err)}`,
        502,
      );
    }
    return true;
  }

  // ── GET /api/registry/plugins/:name ───────────────────────────────────
  if (
    method === "GET" &&
    pathname.startsWith("/api/registry/plugins/") &&
    pathname.length > "/api/registry/plugins/".length
  ) {
    const name = decodeURIComponent(
      pathname.slice("/api/registry/plugins/".length),
    );
    try {
      const pluginManager = getPluginManager();
      const info = await pluginManager.getRegistryPlugin(name);
      if (!info) {
        error(res, `Plugin "${name}" not found in registry`, 404);
        return true;
      }
      json(res, { plugin: info });
    } catch (err) {
      error(
        res,
        `Failed to look up plugin: ${err instanceof Error ? err.message : String(err)}`,
        502,
      );
    }
    return true;
  }

  // ── GET /api/registry/search?q=... ────────────────────────────────────
  if (method === "GET" && pathname === "/api/registry/search") {
    const query = url.searchParams.get("q") || "";
    if (!query.trim()) {
      error(res, "Query parameter 'q' is required", 400);
      return true;
    }

    try {
      const limitParam = url.searchParams.get("limit");
      const limit = limitParam
        ? parseClampedInteger(limitParam, { min: 1, max: 50, fallback: 15 })
        : 15;

      const pluginManager = getPluginManager();
      const results = await pluginManager.searchRegistry(query, limit);
      json(res, { query, count: results.length, results });
    } catch (err) {
      error(
        res,
        `Search failed: ${err instanceof Error ? err.message : String(err)}`,
        502,
      );
    }
    return true;
  }

  // ── POST /api/registry/refresh ────────────────────────────────────────
  if (method === "POST" && pathname === "/api/registry/refresh") {
    try {
      const pluginManager = getPluginManager();
      const registry = await pluginManager.refreshRegistry();
      json(res, { ok: true, count: registry.size });
    } catch (err) {
      error(
        res,
        `Refresh failed: ${err instanceof Error ? err.message : String(err)}`,
        502,
      );
    }
    return true;
  }

  return false;
}
