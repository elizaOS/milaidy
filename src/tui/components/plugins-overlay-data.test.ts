import type { AgentRuntime } from "@elizaos/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  loadElizaConfigMock,
  saveElizaConfigMock,
  installPluginMock,
  getRegistryPluginsMock,
  buildPluginCatalogIndexMock,
  readInstalledPluginMetadataMock,
} = vi.hoisted(() => ({
  loadElizaConfigMock: vi.fn(),
  saveElizaConfigMock: vi.fn(),
  installPluginMock: vi.fn(),
  getRegistryPluginsMock: vi.fn(),
  buildPluginCatalogIndexMock: vi.fn(),
  readInstalledPluginMetadataMock: vi.fn(),
}));

vi.mock("../../config/config.js", () => ({
  loadElizaConfig: loadElizaConfigMock,
  saveElizaConfig: saveElizaConfigMock,
}));

vi.mock("../../services/plugin-installer.js", () => ({
  installPlugin: installPluginMock,
}));

vi.mock("../../services/registry-client.js", () => ({
  getRegistryPlugins: getRegistryPluginsMock,
}));

vi.mock("./plugins-overlay-catalog.js", () => ({
  buildPluginCatalogIndex: buildPluginCatalogIndexMock,
  inferRequiredKey: (key: string) => key.includes("KEY"),
  inferSensitiveKey: (key: string) => key.includes("TOKEN"),
  readInstalledPluginMetadata: readInstalledPluginMetadataMock,
}));

import { PluginsOverlayDataBridge } from "./plugins-overlay-data";

function createBridge(apiBaseUrl?: string): PluginsOverlayDataBridge {
  return new PluginsOverlayDataBridge({
    runtime: {} as unknown as unknown as AgentRuntime,
    apiBaseUrl,
    onClose: () => {},
    requestRender: () => {},
  });
}

describe("PluginsOverlayDataBridge", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    loadElizaConfigMock.mockReset();
    saveElizaConfigMock.mockReset();
    installPluginMock.mockReset();
    getRegistryPluginsMock.mockReset();
    buildPluginCatalogIndexMock.mockReset();
    readInstalledPluginMetadataMock.mockReset();

    buildPluginCatalogIndexMock.mockReturnValue(new Map());
    readInstalledPluginMetadataMock.mockReturnValue({
      configKeys: [],
      pluginParameters: {},
      configUiHints: {},
    });
    loadElizaConfigMock.mockReturnValue({ plugins: {} });
  });

  it("masks sensitive API parameters while preserving isSet status", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/plugins/installed")) {
        return new Response(
          JSON.stringify({
            plugins: [{ name: "@elizaos/plugin-demo", version: "1.2.3" }],
          }),
          { status: 200 },
        );
      }
      if (url.endsWith("/api/plugins")) {
        return new Response(
          JSON.stringify({
            plugins: [
              {
                id: "demo",
                name: "@elizaos/plugin-demo",
                enabled: true,
                parameters: [
                  {
                    key: "DEMO_TOKEN",
                    required: true,
                    sensitive: true,
                    isSet: true,
                  },
                ],
              },
            ],
          }),
          { status: 200 },
        );
      }
      return new Response("not found", { status: 404 });
    });

    vi.stubGlobal("fetch", fetchMock);

    const bridge = createBridge("http://127.0.0.1:2138");
    const plugins = await bridge.getInstalledPlugins();

    expect(plugins).toHaveLength(1);
    expect(plugins[0]?.configStatus).toEqual({ set: 1, total: 1 });
    expect(plugins[0]?.parameters[0]?.value).toBe("__ELIZA_API_MASKED__");
  });

  it("filters masked config values when saving through API", async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const bridge = createBridge("http://127.0.0.1:2138");
    await bridge.savePluginConfig("demo", {
      DEMO_TOKEN: "__ELIZA_API_MASKED__",
      DEMO_MODE: "enabled",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("PUT");
    expect(init.body).toBe(
      JSON.stringify({ config: { DEMO_MODE: "enabled" } }),
    );
  });

  it("updates local config when API mode is disabled", async () => {
    loadElizaConfigMock.mockReturnValue({
      plugins: {
        entries: {},
      },
    });

    const bridge = createBridge();
    await bridge.togglePluginEnabled("demo", false);

    expect(saveElizaConfigMock).toHaveBeenCalledTimes(1);
    const saved = saveElizaConfigMock.mock.calls[0]?.[0] as {
      plugins: { entries: Record<string, { enabled?: boolean }> };
    };
    expect(saved.plugins.entries.demo?.enabled).toBe(false);
  });
});
