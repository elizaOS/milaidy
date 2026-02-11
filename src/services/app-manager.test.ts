/**
 * Tests for the Milaidy AppManager.
 *
 * The new AppManager is simple: it lists apps from the registry, installs
 * plugins via plugin-installer, and returns viewer URLs. No dynamic import,
 * no port allocation, no server management.
 */

import { logger } from "@elizaos/core";
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
  uninstallPlugin: vi.fn().mockResolvedValue({
    success: true,
    pluginName: "@elizaos/app-2004scape",
    requiresRestart: true,
  }),
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
      expect(result.launchType).toBe("connect");
      expect(result.launchUrl).toBeNull();
      expect(result.viewer).not.toBeNull();
      expect(result.viewer?.url).toBe(
        "https://2004scape.org/webclient?bot=testbot",
      );
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
      expect(result.launchType).toBe("connect");
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
      expect(result.launchType).toBe("url");
      expect(result.launchUrl).toBe("https://babylon.social");
    });

    it("substitutes environment placeholders in launch and viewer URLs", async () => {
      process.env.TEST_VIEWER_BOT = "agent77";

      const { getAppInfo } = await import("./registry-client.js");
      vi.mocked(getAppInfo).mockResolvedValue({
        name: "@elizaos/app-test",
        displayName: "Test App",
        description: "Test",
        category: "game",
        launchType: "connect",
        launchUrl: "http://localhost:9999?bot={TEST_VIEWER_BOT}",
        icon: null,
        capabilities: [],
        stars: 0,
        repository: "",
        latestVersion: "1.0.0",
        supports: { v0: false, v1: false, v2: true },
        npm: {
          package: "@elizaos/app-test",
          v0Version: null,
          v1Version: null,
          v2Version: "1.0.0",
        },
        viewer: {
          url: "http://localhost:9999",
          embedParams: { bot: "{TEST_VIEWER_BOT}" },
        },
      });

      const { listInstalledPlugins } = await import("./plugin-installer.js");
      vi.mocked(listInstalledPlugins).mockReturnValue([
        {
          name: "@elizaos/app-test",
          version: "1.0.0",
          installPath: "/tmp/x",
          installedAt: "2026-01-01",
        },
      ]);

      const { AppManager } = await import("./app-manager.js");
      const mgr = new AppManager();
      const result = await mgr.launch("@elizaos/app-test");

      expect(result.launchUrl).toBe("http://localhost:9999?bot=agent77");
      expect(result.viewer?.url).toBe("http://localhost:9999?bot=agent77");

      delete process.env.TEST_VIEWER_BOT;
    });

    it("falls back to testbot for 2004scape bot placeholder", async () => {
      delete process.env.RS_SDK_BOT_NAME;
      delete process.env.BOT_NAME;

      const { getAppInfo } = await import("./registry-client.js");
      vi.mocked(getAppInfo).mockResolvedValue({
        name: "@elizaos/app-2004scape",
        displayName: "2004scape",
        description: "2004scape",
        category: "game",
        launchType: "connect",
        launchUrl: "http://localhost:8880/webclient",
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
        viewer: {
          url: "http://localhost:8880/webclient",
          embedParams: { bot: "{RS_SDK_BOT_NAME}" },
        },
      });

      const { listInstalledPlugins } = await import("./plugin-installer.js");
      vi.mocked(listInstalledPlugins).mockReturnValue([
        {
          name: "@elizaos/app-2004scape",
          version: "1.0.0",
          installPath: "/tmp/rs",
          installedAt: "2026-01-01",
        },
      ]);

      const { AppManager } = await import("./app-manager.js");
      const mgr = new AppManager();
      const result = await mgr.launch("@elizaos/app-2004scape");

      expect(result.viewer?.url).toBe(
        "http://localhost:8880/webclient?bot=testbot",
      );
    });

    it("includes hyperscape postMessage auth payload when token is configured", async () => {
      process.env.HYPERSCAPE_AUTH_TOKEN = "hs-token-123";
      const { getAppInfo } = await import("./registry-client.js");
      vi.mocked(getAppInfo).mockResolvedValue({
        name: "@elizaos/app-hyperscape",
        displayName: "Hyperscape",
        description: "Hyperscape",
        category: "game",
        launchType: "connect",
        launchUrl: "http://localhost:3333",
        icon: null,
        capabilities: [],
        stars: 0,
        repository: "",
        latestVersion: "1.0.0",
        supports: { v0: false, v1: false, v2: true },
        npm: {
          package: "@elizaos/app-hyperscape",
          v0Version: null,
          v1Version: null,
          v2Version: "1.0.0",
        },
        viewer: {
          url: "http://localhost:3333",
          postMessageAuth: true,
        },
      });

      const { listInstalledPlugins } = await import("./plugin-installer.js");
      vi.mocked(listInstalledPlugins).mockReturnValue([
        {
          name: "@elizaos/app-hyperscape",
          version: "1.0.0",
          installPath: "/tmp/hs",
          installedAt: "2026-01-01",
        },
      ]);

      const { AppManager } = await import("./app-manager.js");
      const mgr = new AppManager();
      const result = await mgr.launch("@elizaos/app-hyperscape");

      expect(result.viewer?.postMessageAuth).toBe(true);
      expect(result.viewer?.authMessage).toEqual({
        type: "HYPERSCAPE_AUTH",
        authToken: "hs-token-123",
        sessionToken: undefined,
        agentId: undefined,
      });

      delete process.env.HYPERSCAPE_AUTH_TOKEN;
    });

    it("disables postMessage auth when hyperscape token is missing", async () => {
      delete process.env.HYPERSCAPE_AUTH_TOKEN;
      const infoSpy = vi.spyOn(logger, "info").mockImplementation(() => {});

      const { getAppInfo } = await import("./registry-client.js");
      vi.mocked(getAppInfo).mockResolvedValue({
        name: "@elizaos/app-hyperscape",
        displayName: "Hyperscape",
        description: "Hyperscape",
        category: "game",
        launchType: "connect",
        launchUrl: "http://localhost:3333",
        icon: null,
        capabilities: [],
        stars: 0,
        repository: "",
        latestVersion: "1.0.0",
        supports: { v0: false, v1: false, v2: true },
        npm: {
          package: "@elizaos/app-hyperscape",
          v0Version: null,
          v1Version: null,
          v2Version: "1.0.0",
        },
        viewer: {
          url: "http://localhost:3333",
          postMessageAuth: true,
        },
      });

      const { listInstalledPlugins } = await import("./plugin-installer.js");
      vi.mocked(listInstalledPlugins).mockReturnValue([
        {
          name: "@elizaos/app-hyperscape",
          version: "1.0.0",
          installPath: "/tmp/hs",
          installedAt: "2026-01-01",
        },
      ]);

      const { AppManager } = await import("./app-manager.js");
      const mgr = new AppManager();
      const result = await mgr.launch("@elizaos/app-hyperscape");

      expect(result.viewer?.postMessageAuth).toBe(false);
      expect(result.viewer?.authMessage).toBeUndefined();
      expect(infoSpy).toHaveBeenCalledWith(
        expect.stringContaining("auth token not configured"),
      );
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

  describe("stop", () => {
    it("returns no-op payload when app is known but not active/installed", async () => {
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
      });
      const { listInstalledPlugins } = await import("./plugin-installer.js");
      vi.mocked(listInstalledPlugins).mockReturnValue([]);

      const { AppManager } = await import("./app-manager.js");
      const mgr = new AppManager();
      const result = await mgr.stop("@elizaos/app-babylon");

      expect(result.success).toBe(false);
      expect(result.appName).toBe("@elizaos/app-babylon");
      expect(typeof result.stoppedAt).toBe("string");
      expect(result.stopScope).toBe("no-op");
      expect(result.pluginUninstalled).toBe(false);
      expect(result.needsRestart).toBe(false);
    });

    it("uninstalls installed plugin when stopping an app", async () => {
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
      });
      const { listInstalledPlugins, uninstallPlugin } = await import(
        "./plugin-installer.js"
      );
      vi.mocked(listInstalledPlugins).mockReturnValue([
        {
          name: "@elizaos/app-babylon",
          version: "1.0.0",
          installPath: "/tmp/x",
          installedAt: "2026-01-01",
        },
      ]);
      vi.mocked(uninstallPlugin).mockResolvedValue({
        success: true,
        pluginName: "@elizaos/app-babylon",
        requiresRestart: true,
      });

      const { AppManager } = await import("./app-manager.js");
      const mgr = new AppManager();
      const result = await mgr.stop("@elizaos/app-babylon");

      expect(result.success).toBe(true);
      expect(result.stopScope).toBe("plugin-uninstalled");
      expect(result.pluginUninstalled).toBe(true);
      expect(result.needsRestart).toBe(true);
      expect(vi.mocked(uninstallPlugin)).toHaveBeenCalledWith(
        "@elizaos/app-babylon",
      );
    });

    it("throws when installed plugin cannot be uninstalled", async () => {
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
      });
      const { listInstalledPlugins, uninstallPlugin } = await import(
        "./plugin-installer.js"
      );
      vi.mocked(listInstalledPlugins).mockReturnValue([
        {
          name: "@elizaos/app-babylon",
          version: "1.0.0",
          installPath: "/tmp/x",
          installedAt: "2026-01-01",
        },
      ]);
      vi.mocked(uninstallPlugin).mockResolvedValue({
        success: false,
        pluginName: "@elizaos/app-babylon",
        requiresRestart: false,
        error: "permission denied",
      });

      const { AppManager } = await import("./app-manager.js");
      const mgr = new AppManager();
      await expect(mgr.stop("@elizaos/app-babylon")).rejects.toThrow(
        "permission denied",
      );
    });

    it("throws for unknown app", async () => {
      const { getAppInfo } = await import("./registry-client.js");
      vi.mocked(getAppInfo).mockResolvedValue(null);

      const { AppManager } = await import("./app-manager.js");
      const mgr = new AppManager();
      await expect(mgr.stop("@elizaos/app-missing")).rejects.toThrow(
        "not found",
      );
    });
  });
});
