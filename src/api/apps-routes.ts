import type { IAgentRuntime } from "@elizaos/core";
import type { AppManager } from "../services/app-manager";
import type {
  InstallProgressLike,
  PluginManagerLike,
  RegistryPluginInfo,
  RegistrySearchResult,
} from "../services/plugin-manager-types";
import type { RouteHelpers, RouteRequestMeta } from "./route-helpers";

type AppManagerLike = {
  listAvailable: AppManager["listAvailable"];
  search: AppManager["search"];
  listInstalled: AppManager["listInstalled"];
  launch: (
    pluginManager: PluginManagerLike,
    name: string,
    onProgress?: (progress: InstallProgressLike) => void,
    runtime?: IAgentRuntime | null,
  ) => ReturnType<AppManager["launch"]>;
  stop: AppManager["stop"];
  getInfo: AppManager["getInfo"];
};

export interface AppsRouteContext
  extends RouteRequestMeta,
    Pick<RouteHelpers, "readJsonBody" | "json" | "error"> {
  url: URL;
  appManager: AppManagerLike;
  getPluginManager: () => PluginManagerLike;
  parseBoundedLimit: (rawLimit: string | null, fallback?: number) => number;
  runtime: IAgentRuntime | null;
}

function isNonAppRegistryPlugin(plugin: RegistryPluginInfo): boolean {
  const name = plugin.name.toLowerCase();
  const npmPackage = plugin.npm.package.toLowerCase();
  return !name.includes("/app-") && !npmPackage.includes("/app-");
}

function isNonAppSearchResult(plugin: RegistrySearchResult): boolean {
  const name = plugin.name.toLowerCase();
  const npmPackage = plugin.npmPackage.toLowerCase();
  return !name.includes("/app-") && !npmPackage.includes("/app-");
}

export async function handleAppsRoutes(
  ctx: AppsRouteContext,
): Promise<boolean> {
  const {
    req,
    res,
    method,
    pathname,
    url,
    appManager,
    getPluginManager,
    parseBoundedLimit,
    readJsonBody,
    json,
    error,
    runtime,
  } = ctx;

  if (method === "GET" && pathname === "/api/apps") {
    const pluginManager = getPluginManager();
    const apps = await appManager.listAvailable(pluginManager);
    json(res, apps);
    return true;
  }

  if (method === "GET" && pathname === "/api/apps/search") {
    const query = url.searchParams.get("q") ?? "";
    if (!query.trim()) {
      json(res, []);
      return true;
    }
    const limit = parseBoundedLimit(url.searchParams.get("limit"));
    const pluginManager = getPluginManager();
    const results = await appManager.search(pluginManager, query, limit);
    json(res, results);
    return true;
  }

  if (method === "GET" && pathname === "/api/apps/installed") {
    const pluginManager = getPluginManager();
    const installed = await appManager.listInstalled(pluginManager);
    json(res, installed);
    return true;
  }

  // Launch an app: install its plugin (if needed), return viewer config.
  if (method === "POST" && pathname === "/api/apps/launch") {
    const body = await readJsonBody<{ name?: string }>(req, res);
    if (!body) return true;
    if (!body.name?.trim()) {
      error(res, "name is required");
      return true;
    }
    const pluginManager = getPluginManager();
    const result = await appManager.launch(
      pluginManager,
      body.name.trim(),
      (_progress: InstallProgressLike) => {},
      runtime,
    );
    json(res, result);
    return true;
  }

  // Stop an app: disconnects session and uninstalls plugin when installed.
  if (method === "POST" && pathname === "/api/apps/stop") {
    const body = await readJsonBody<{ name?: string }>(req, res);
    if (!body) return true;
    if (!body.name?.trim()) {
      error(res, "name is required");
      return true;
    }
    const appName = body.name.trim();
    const pluginManager = getPluginManager();
    const result = await appManager.stop(pluginManager, appName);
    json(res, result);
    return true;
  }

  if (method === "GET" && pathname.startsWith("/api/apps/info/")) {
    const appName = decodeURIComponent(
      pathname.slice("/api/apps/info/".length),
    );
    if (!appName) {
      error(res, "app name is required");
      return true;
    }
    const pluginManager = getPluginManager();
    const info = await appManager.getInfo(pluginManager, appName);
    if (!info) {
      error(res, `App "${appName}" not found in registry`, 404);
      return true;
    }
    json(res, info);
    return true;
  }

  // GET /api/apps/plugins — non-app plugins from registry.
  if (method === "GET" && pathname === "/api/apps/plugins") {
    try {
      const pluginManager = getPluginManager();
      const registry = await pluginManager.refreshRegistry();
      const plugins = Array.from(registry.values()).filter(
        isNonAppRegistryPlugin,
      );
      json(res, plugins);
    } catch (err) {
      error(
        res,
        `Failed to list plugins: ${err instanceof Error ? err.message : String(err)}`,
        502,
      );
    }
    return true;
  }

  // GET /api/apps/plugins/search?q=... — search non-app plugins.
  if (method === "GET" && pathname === "/api/apps/plugins/search") {
    const query = url.searchParams.get("q") ?? "";
    if (!query.trim()) {
      json(res, []);
      return true;
    }
    try {
      const limit = parseBoundedLimit(url.searchParams.get("limit"));
      const pluginManager = getPluginManager();
      const results = await pluginManager.searchRegistry(query, limit);
      json(res, results.filter(isNonAppSearchResult));
    } catch (err) {
      error(
        res,
        `Plugin search failed: ${err instanceof Error ? err.message : String(err)}`,
        502,
      );
    }
    return true;
  }

  // POST /api/apps/refresh — refresh the registry cache.
  if (method === "POST" && pathname === "/api/apps/refresh") {
    try {
      const pluginManager = getPluginManager();
      const registry = await pluginManager.refreshRegistry();
      const count = Array.from(registry.values()).filter(
        isNonAppRegistryPlugin,
      ).length;
      json(res, { ok: true, count });
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
