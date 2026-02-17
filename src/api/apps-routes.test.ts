import { describe, expect, test, vi } from "vitest";
import type {
  PluginManagerLike,
  RegistryPluginInfo,
  RegistrySearchResult,
} from "../services/plugin-manager-types";
import { handleAppsRoutes } from "./apps-routes";

const APP_PLUGIN: RegistryPluginInfo = {
  name: "@elizaos/app-hyperscape",
  gitRepo: "elizaos/app-hyperscape",
  gitUrl: "https://github.com/elizaos/app-hyperscape",
  description: "Hyperscape app",
  topics: [],
  stars: 100,
  language: "TypeScript",
  npm: { package: "@elizaos/app-hyperscape" },
  supports: { v0: false, v1: true, v2: true },
};

const NON_APP_PLUGIN: RegistryPluginInfo = {
  name: "@elizaos/plugin-foo",
  gitRepo: "elizaos/plugin-foo",
  gitUrl: "https://github.com/elizaos/plugin-foo",
  description: "Foo plugin",
  topics: [],
  stars: 10,
  language: "TypeScript",
  npm: { package: "@elizaos/plugin-foo" },
  supports: { v0: false, v1: true, v2: true },
};

const APP_SEARCH: RegistrySearchResult = {
  name: "@elizaos/app-hyperscape",
  description: "Hyperscape app",
  score: 1,
  tags: [],
  version: "1.0.0",
  latestVersion: "1.0.0",
  npmPackage: "@elizaos/app-hyperscape",
  repository: "https://github.com/elizaos/app-hyperscape",
  stars: 100,
  supports: { v0: false, v1: true, v2: true },
};

const NON_APP_SEARCH: RegistrySearchResult = {
  name: "@elizaos/plugin-foo",
  description: "Foo plugin",
  score: 0.8,
  tags: [],
  version: "1.2.3",
  latestVersion: "1.2.3",
  npmPackage: "@elizaos/plugin-foo",
  repository: "https://github.com/elizaos/plugin-foo",
  stars: 10,
  supports: { v0: false, v1: true, v2: true },
};

function createPluginManagerMock(): PluginManagerLike {
  return {
    refreshRegistry: vi.fn(
      async () =>
        new Map([
          [APP_PLUGIN.name, APP_PLUGIN],
          [NON_APP_PLUGIN.name, NON_APP_PLUGIN],
        ]),
    ),
    listInstalledPlugins: vi.fn(async () => []),
    getRegistryPlugin: vi.fn(async (name: string) =>
      name === APP_PLUGIN.name ? APP_PLUGIN : null,
    ),
    searchRegistry: vi.fn(async () => [APP_SEARCH, NON_APP_SEARCH]),
    installPlugin: vi.fn(),
    uninstallPlugin: vi.fn(),
    listEjectedPlugins: vi.fn(),
    ejectPlugin: vi.fn(),
    syncPlugin: vi.fn(),
    reinjectPlugin: vi.fn(),
  };
}

type AppManagerLike = Parameters<typeof handleAppsRoutes>[0]["appManager"];

function createAppManagerMock(): AppManagerLike {
  return {
    listAvailable: vi.fn(async () => [APP_PLUGIN]),
    search: vi.fn(async () => [APP_SEARCH]),
    listInstalled: vi.fn(async () => [
      {
        name: APP_PLUGIN.name,
        displayName: "Hyperscape",
        pluginName: APP_PLUGIN.name,
        version: "1.0.0",
        installedAt: new Date().toISOString(),
      },
    ]),
    launch: vi.fn(async () => ({
      pluginInstalled: true,
      needsRestart: false,
      displayName: "Hyperscape",
      launchType: "connect",
      launchUrl: null,
      viewer: null,
    })),
    stop: vi.fn(async () => ({
      success: true,
      appName: APP_PLUGIN.name,
      stoppedAt: new Date().toISOString(),
      pluginUninstalled: true,
      needsRestart: false,
      stopScope: "plugin-uninstalled",
      message: "stopped",
    })),
    getInfo: vi.fn(async (pluginManager, name) =>
      pluginManager.getRegistryPlugin(name),
    ),
  };
}

type InvokeResult = {
  handled: boolean;
  status: number;
  payload: unknown;
  appManager: AppManagerLike;
  pluginManager: PluginManagerLike;
  parseBoundedLimit: (rawLimit: string | null, fallback?: number) => number;
};

async function invoke(args: {
  method: string;
  pathname: string;
  url?: string;
  body?: Record<string, unknown> | null;
  appManager?: AppManagerLike;
  pluginManager?: PluginManagerLike;
}): Promise<InvokeResult> {
  const appManager = args.appManager ?? createAppManagerMock();
  const pluginManager = args.pluginManager ?? createPluginManagerMock();
  let status = 200;
  let payload: unknown = null;

  const parseBoundedLimit = vi.fn((rawLimit: string | null, fallback = 15) => {
    if (!rawLimit) return fallback;
    const parsed = Number.parseInt(rawLimit, 10);
    return Number.isFinite(parsed) ? parsed : fallback;
  });

  const handled = await handleAppsRoutes({
    req: {} as never,
    res: {} as never,
    method: args.method,
    pathname: args.pathname,
    url: new URL(args.url ?? args.pathname, "http://localhost:2138"),
    appManager,
    getPluginManager: () => pluginManager,
    parseBoundedLimit,
    readJsonBody: vi.fn(async () => args.body ?? null),
    json: (_res, data, code = 200) => {
      status = code;
      payload = data;
    },
    error: (_res, message, code = 400) => {
      status = code;
      payload = { error: message };
    },
  });

  return {
    handled,
    status,
    payload,
    appManager,
    pluginManager,
    parseBoundedLimit,
  };
}

describe("apps routes", () => {
  test("returns false for unrelated route", async () => {
    const result = await invoke({ method: "GET", pathname: "/api/status" });

    expect(result.handled).toBe(false);
  });

  test("lists available apps", async () => {
    const result = await invoke({ method: "GET", pathname: "/api/apps" });

    expect(result.status).toBe(200);
    expect(result.payload).toEqual([APP_PLUGIN]);
  });

  test("returns empty list for app search without query", async () => {
    const appManager = createAppManagerMock();
    const result = await invoke({
      method: "GET",
      pathname: "/api/apps/search",
      url: "/api/apps/search?q=",
      appManager,
    });

    expect(result.status).toBe(200);
    expect(result.payload).toEqual([]);
    expect(appManager.search).not.toHaveBeenCalled();
  });

  test("searches apps with parsed limit", async () => {
    const appManager = createAppManagerMock();
    const result = await invoke({
      method: "GET",
      pathname: "/api/apps/search",
      url: "/api/apps/search?q=hyperscape&limit=9",
      appManager,
    });

    expect(result.status).toBe(200);
    expect(result.payload).toEqual([APP_SEARCH]);
    expect(result.parseBoundedLimit).toHaveBeenCalledWith("9");
    expect(appManager.search).toHaveBeenCalledWith(
      expect.anything(),
      "hyperscape",
      9,
    );
  });

  test("lists installed apps", async () => {
    const result = await invoke({
      method: "GET",
      pathname: "/api/apps/installed",
    });

    expect(result.status).toBe(200);
    expect(result.payload).toMatchObject([
      {
        name: APP_PLUGIN.name,
        displayName: "Hyperscape",
      },
    ]);
  });

  test("requires app name when launching", async () => {
    const result = await invoke({
      method: "POST",
      pathname: "/api/apps/launch",
      body: {},
    });

    expect(result.status).toBe(400);
    expect(result.payload).toEqual({ error: "name is required" });
  });

  test("launches app with plugin manager", async () => {
    const appManager = createAppManagerMock();
    const result = await invoke({
      method: "POST",
      pathname: "/api/apps/launch",
      body: { name: APP_PLUGIN.name },
      appManager,
    });

    expect(result.status).toBe(200);
    expect(result.payload).toMatchObject({
      pluginInstalled: true,
      displayName: "Hyperscape",
    });
    expect(appManager.launch).toHaveBeenCalledWith(
      expect.anything(),
      APP_PLUGIN.name,
      expect.any(Function),
    );
  });

  test("returns 404 when app info is missing", async () => {
    const result = await invoke({
      method: "GET",
      pathname: "/api/apps/info/not-found",
    });

    expect(result.status).toBe(404);
    expect(result.payload).toEqual({
      error: 'App "not-found" not found in registry',
    });
  });

  test("lists only non-app plugins for app plugins endpoint", async () => {
    const result = await invoke({
      method: "GET",
      pathname: "/api/apps/plugins",
    });

    expect(result.status).toBe(200);
    expect(result.payload).toEqual([NON_APP_PLUGIN]);
  });

  test("filters app packages from plugin search endpoint", async () => {
    const result = await invoke({
      method: "GET",
      pathname: "/api/apps/plugins/search",
      url: "/api/apps/plugins/search?q=plugin&limit=12",
    });

    expect(result.status).toBe(200);
    expect(result.payload).toEqual([NON_APP_SEARCH]);
    expect(result.parseBoundedLimit).toHaveBeenCalledWith("12");
  });

  test("refreshes plugin registry for app plugins endpoint", async () => {
    const result = await invoke({
      method: "POST",
      pathname: "/api/apps/refresh",
    });

    expect(result.status).toBe(200);
    expect(result.payload).toEqual({ ok: true, count: 1 });
  });
});
