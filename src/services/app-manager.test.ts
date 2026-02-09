/**
 * Tests for the Milaidy AppManager.
 *
 * The new AppManager is simple: it lists apps from the registry, installs
 * plugins via plugin-installer, and returns viewer URLs. No dynamic import,
 * no port allocation, no server management.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./registry-client.js", () => ({
  listApps: vi.fn().mockResolvedValue([]),
  getAppInfo: vi.fn().mockResolvedValue(null),
  searchApps: vi.fn().mockResolvedValue([]),
}));

vi.mock("./plugin-installer.js", () => ({
  installPlugin: vi.fn().mockResolvedValue({
    success: true,
    pluginName: "@elizaos/app-2004scape",
    version: "1.0.0",
    installPath: "/tmp/test",
    requiresRestart: true,
  }),
  listInstalledPlugins: vi.fn().mockReturnValue([]),
}));

vi.mock("../config/config.js", () => ({
  loadMilaidyConfig: vi.fn().mockReturnValue({ plugins: { installs: {} } }),
}));

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("AppManager", () => {
  describe("listAvailable", () => {
    it("delegates to registry listApps", async () => {
      const { listApps } = await import("./registry-client.js");
      vi.mocked(listApps).mockResolvedValue([
        {
          name: "@elizaos/app-2004scape",
          displayName: "2004scape",
          description: "RuneScape",
          category: "game",
          launchType: "connect",
          launchUrl: null,
          icon: null,
          capabilities: ["combat"],
          stars: 42,
          repository: "https://github.com/elizaOS/eliza-2004scape",
          latestVersion: "1.0.0",
          supports: { v0: false, v1: false, v2: true },
          npm: {
            package: "@elizaos/app-2004scape",
            v0Version: null,
            v1Version: null,
            v2Version: "1.0.0",
          },
        },
      ]);

      const { AppManager } = await import("./app-manager.js");
      const mgr = new AppManager();
      const apps = await mgr.listAvailable();
      expect(apps.length).toBe(1);
      expect(apps[0].displayName).toBe("2004scape");
    });
  });

  describe("launch", () => {
    it("throws when app not found in registry", async () => {
      const { getAppInfo } = await import("./registry-client.js");
      vi.mocked(getAppInfo).mockResolvedValue(null);

      const { AppManager } = await import("./app-manager.js");
      const mgr = new AppManager();
      await expect(mgr.launch("@elizaos/app-nonexistent")).rejects.toThrow(
        "not found",
      );
    });

    it("installs plugin and returns viewer config when app found", async () => {
      const { getAppInfo } = await import("./registry-client.js");
      vi.mocked(getAppInfo).mockResolvedValue({
        name: "@elizaos/app-2004scape",
        displayName: "2004scape",
        description: "RuneScape",
        category: "game",
        launchType: "connect",
        launchUrl: null,
        icon: null,
        capabilities: ["combat"],
        stars: 42,
        repository: "https://github.com/elizaOS/eliza-2004scape",
        latestVersion: "1.0.0",
        supports: { v0: false, v1: false, v2: true },
        npm: {
          package: "@elizaos/app-2004scape",
          v0Version: null,
          v1Version: null,
          v2Version: "1.0.0",
        },
        viewer: {
          url: "https://2004scape.org/webclient",
          embedParams: { bot: "testbot" },
          sandbox: "allow-scripts allow-same-origin",
        },
      });

      const { installPlugin, listInstalledPlugins } = await import(
        "./plugin-installer.js"
      );
      vi.mocked(listInstalledPlugins).mockReturnValue([]);
      vi.mocked(installPlugin).mockResolvedValue({
        success: true,
        pluginName: "@elizaos/app-2004scape",
        version: "1.0.0",
        installPath: "/tmp/test",
        requiresRestart: true,
      });

      const { AppManager } = await import("./app-manager.js");
      const mgr = new AppManager();
      const result = await mgr.launch("@elizaos/app-2004scape");

      expect(result.pluginInstalled).toBe(true);
      expect(result.needsRestart).toBe(true);
      expect(result.displayName).toBe("2004scape");
      expect(result.viewer).not.toBeNull();
      expect(result.viewer?.url).toBe("https://2004scape.org/webclient");
      expect(result.viewer?.embedParams).toEqual({ bot: "testbot" });
      expect(vi.mocked(installPlugin)).toHaveBeenCalledWith(
        "@elizaos/app-2004scape",
        undefined,
      );
    });

    it("skips install when plugin already installed", async () => {
      const { getAppInfo } = await import("./registry-client.js");
      vi.mocked(getAppInfo).mockResolvedValue({
        name: "@elizaos/app-2004scape",
        displayName: "2004scape",
        description: "RuneScape",
        category: "game",
        launchType: "connect",
        launchUrl: null,
        icon: null,
        capabilities: [],
        stars: 0,
        repository: "",
        latestVersion: "1.0.0",
        supports: { v0: false, v1: false, v2: true },
        npm: {
          package: "@elizaos/app-2004scape",
          v0Version: null,
          v1Version: null,
          v2Version: "1.0.0",
        },
      });

      const { installPlugin, listInstalledPlugins } = await import(
        "./plugin-installer.js"
      );
      const mockInstall = vi.mocked(installPlugin);
      mockInstall.mockClear();
      vi.mocked(listInstalledPlugins).mockReturnValue([
        {
          name: "@elizaos/app-2004scape",
          version: "1.0.0",
          installPath: "/tmp/x",
          installedAt: "2026-01-01",
        },
      ]);

      const { AppManager } = await import("./app-manager.js");
      const mgr = new AppManager();
      const result = await mgr.launch("@elizaos/app-2004scape");

      expect(result.pluginInstalled).toBe(true);
      expect(result.needsRestart).toBe(false);
      expect(mockInstall).not.toHaveBeenCalled();
    });

    it("throws when plugin install fails", async () => {
      const { getAppInfo } = await import("./registry-client.js");
      vi.mocked(getAppInfo).mockResolvedValue({
        name: "@elizaos/app-test",
        displayName: "Test",
        description: "",
        category: "game",
        launchType: "url",
        launchUrl: null,
        icon: null,
        capabilities: [],
        stars: 0,
        repository: "",
        latestVersion: null,
        supports: { v0: false, v1: false, v2: false },
        npm: {
          package: "@elizaos/app-test",
          v0Version: null,
          v1Version: null,
          v2Version: null,
        },
      });

      const { installPlugin, listInstalledPlugins } = await import(
        "./plugin-installer.js"
      );
      vi.mocked(listInstalledPlugins).mockReturnValue([]);
      vi.mocked(installPlugin).mockResolvedValue({
        success: false,
        pluginName: "@elizaos/app-test",
        version: "",
        installPath: "",
        requiresRestart: false,
        error: "Package not found",
      });

      const { AppManager } = await import("./app-manager.js");
      const mgr = new AppManager();
      await expect(mgr.launch("@elizaos/app-test")).rejects.toThrow(
        "Package not found",
      );
    });

    it("returns null viewer when app has no viewer config", async () => {
      const { getAppInfo } = await import("./registry-client.js");
      vi.mocked(getAppInfo).mockResolvedValue({
        name: "@elizaos/app-babylon",
        displayName: "Babylon",
        description: "Trading",
        category: "platform",
        launchType: "url",
        launchUrl: "https://babylon.social",
        icon: null,
        capabilities: [],
        stars: 0,
        repository: "",
        latestVersion: "1.0.0",
        supports: { v0: false, v1: false, v2: true },
        npm: {
          package: "@elizaos/app-babylon",
          v0Version: null,
          v1Version: null,
          v2Version: "1.0.0",
        },
        // no viewer field
      });

      const { listInstalledPlugins } = await import("./plugin-installer.js");
      vi.mocked(listInstalledPlugins).mockReturnValue([
        {
          name: "@elizaos/app-babylon",
          version: "1.0.0",
          installPath: "/tmp/x",
          installedAt: "2026-01-01",
        },
      ]);

      const { AppManager } = await import("./app-manager.js");
      const mgr = new AppManager();
      const result = await mgr.launch("@elizaos/app-babylon");

      expect(result.viewer).toBeNull();
    });
  });

  describe("search", () => {
    it("delegates to registry searchApps", async () => {
      const { searchApps } = await import("./registry-client.js");
      vi.mocked(searchApps).mockResolvedValue([]);

      const { AppManager } = await import("./app-manager.js");
      const mgr = new AppManager();
      await mgr.search("test", 5);
      expect(vi.mocked(searchApps)).toHaveBeenCalledWith("test", 5);
    });
  });

  describe("getInfo", () => {
    it("delegates to registry getAppInfo", async () => {
      const { getAppInfo } = await import("./registry-client.js");
      vi.mocked(getAppInfo).mockResolvedValue(null);

      const { AppManager } = await import("./app-manager.js");
      const mgr = new AppManager();
      const result = await mgr.getInfo("@elizaos/app-nonexistent");
      expect(result).toBeNull();
    });
  });

  describe("listInstalled", () => {
    it("returns installed plugins with humanized names", async () => {
      const { listInstalledPlugins } = await import("./plugin-installer.js");
      vi.mocked(listInstalledPlugins).mockReturnValue([
        {
          name: "@elizaos/app-2004scape",
          version: "1.0.0",
          installPath: "/tmp/a",
          installedAt: "2026-01-01",
        },
        {
          name: "@elizaos/plugin-discord",
          version: "2.0.0",
          installPath: "/tmp/b",
          installedAt: "2026-01-01",
        },
      ]);

      const { AppManager } = await import("./app-manager.js");
      const mgr = new AppManager();
      const installed = mgr.listInstalled();

      expect(installed.length).toBe(2);
      expect(installed[0].displayName).toBe("2004scape");
      expect(installed[1].displayName).toBe("Discord");
    });
  });
});
