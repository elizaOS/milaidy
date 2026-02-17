import { describe, expect, test, vi } from "vitest";
import type {
  PluginManagerLike,
  RegistryPluginInfo,
} from "../services/plugin-manager-types";
import { handleRegistryRoutes } from "./registry-routes";

function createPluginManagerMock(): PluginManagerLike {
  const pluginInfo: RegistryPluginInfo = {
    name: "@elizaos/plugin-foo",
    gitRepo: "elizaos/plugin-foo",
    gitUrl: "https://github.com/elizaos/plugin-foo",
    description: "Foo plugin",
    topics: [],
    stars: 1,
    language: "ts",
    npm: { package: "@elizaos/plugin-foo" },
    supports: { v0: false, v1: true, v2: true },
  };

  return {
    refreshRegistry: vi.fn(
      async () => new Map([[pluginInfo.name, pluginInfo]]),
    ),
    listInstalledPlugins: vi.fn(async () => [
      { name: "@elizaos/plugin-foo", version: "1.2.3" },
    ]),
    getRegistryPlugin: vi.fn(async (name: string) =>
      name === "@elizaos/plugin-foo" ? pluginInfo : null,
    ),
    searchRegistry: vi.fn(async () => [
      {
        name: "@elizaos/plugin-foo",
        description: "Foo plugin",
        score: 1,
        tags: [],
        version: "1.2.3",
        latestVersion: "1.2.3",
        npmPackage: "@elizaos/plugin-foo",
        repository: "https://github.com/elizaos/plugin-foo",
        stars: 1,
        supports: { v0: false, v1: true, v2: true },
      },
    ]),
    installPlugin: vi.fn(),
    uninstallPlugin: vi.fn(),
    listEjectedPlugins: vi.fn(),
    ejectPlugin: vi.fn(),
    syncPlugin: vi.fn(),
    reinjectPlugin: vi.fn(),
  };
}

type InvokeResult = {
  handled: boolean;
  status: number;
  payload: Record<string, unknown> | null;
};

async function invoke(args: {
  method: string;
  pathname: string;
  url?: string;
  pluginManager?: PluginManagerLike;
}): Promise<InvokeResult> {
  const pluginManager = args.pluginManager ?? createPluginManagerMock();
  let status = 200;
  let payload: Record<string, unknown> | null = null;

  const handled = await handleRegistryRoutes({
    req: {} as never,
    res: {} as never,
    method: args.method,
    pathname: args.pathname,
    url: new URL(args.url ?? args.pathname, "http://localhost:2138"),
    json: (_res, data, code = 200) => {
      status = code;
      payload = data as Record<string, unknown>;
    },
    error: (_res, message, code = 400) => {
      status = code;
      payload = { error: message };
    },
    getPluginManager: () => pluginManager,
    getLoadedPluginNames: () => ["@elizaos/plugin-foo"],
    getBundledPluginIds: () => new Set(["foo"]),
  });

  return { handled, status, payload };
}

describe("registry routes", () => {
  test("returns false for non-registry routes", async () => {
    const result = await invoke({
      method: "GET",
      pathname: "/api/status",
    });

    expect(result.handled).toBe(false);
  });

  test("returns registry plugins with installed/loaded/bundled metadata", async () => {
    const result = await invoke({
      method: "GET",
      pathname: "/api/registry/plugins",
    });

    expect(result.status).toBe(200);
    expect(result.payload).toMatchObject({
      count: 1,
      plugins: [
        {
          name: "@elizaos/plugin-foo",
          installed: true,
          installedVersion: "1.2.3",
          loaded: true,
          bundled: true,
        },
      ],
    });
  });

  test("returns 404 when registry detail is missing", async () => {
    const result = await invoke({
      method: "GET",
      pathname: "/api/registry/plugins/not-found",
    });

    expect(result.status).toBe(404);
    expect(result.payload).toMatchObject({
      error: 'Plugin "not-found" not found in registry',
    });
  });

  test("requires non-empty query for registry search", async () => {
    const result = await invoke({
      method: "GET",
      pathname: "/api/registry/search",
      url: "/api/registry/search?q=",
    });

    expect(result.status).toBe(400);
    expect(result.payload).toMatchObject({
      error: "Query parameter 'q' is required",
    });
  });

  test("refreshes registry and reports count", async () => {
    const result = await invoke({
      method: "POST",
      pathname: "/api/registry/refresh",
    });

    expect(result.status).toBe(200);
    expect(result.payload).toMatchObject({
      ok: true,
      count: 1,
    });
  });
});
