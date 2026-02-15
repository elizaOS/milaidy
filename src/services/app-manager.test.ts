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
    pluginName: APP_2004SCAPE,
    version: "1.0.0",
    installPath: "/tmp/test",
    requiresRestart: true,
  }),
  listInstalledPlugins: vi.fn().mockReturnValue([]),
  uninstallPlugin: vi.fn().mockResolvedValue({
    success: true,
    pluginName: APP_2004SCAPE,
    requiresRestart: true,
  }),
}));

vi.mock("../config/config.js", () => ({
  loadMilaidyConfig: vi.fn().mockReturnValue({ plugins: { installs: {} } }),
}));

type RegistryAppInfoFixture = {
  name: string;
  displayName: string;
  description: string;
  category?: string;
  launchType?: string;
  launchUrl?: string | null;
  capabilities?: string[];
  stars?: number;
  repository?: string;
  latestVersion?: string | null;
  supports?: { v0: boolean; v1: boolean; v2: boolean };
  npm?: {
    package?: string;
    v0Version?: string | null;
    v1Version?: string | null;
    v2Version?: string | null;
  };
  viewer?: {
    url: string;
    embedParams?: Record<string, string>;
    postMessageAuth?: boolean;
    sandbox?: string;
  };
};

function makeRegistryAppInfo(fixture: RegistryAppInfoFixture) {
  return {
    icon: null,
    capabilities: fixture.capabilities ?? [],
    stars: fixture.stars ?? 0,
    repository: fixture.repository ?? "",
    latestVersion: fixture.latestVersion ?? "1.0.0",
    supports: fixture.supports ?? { v0: false, v1: false, v2: true },
    name: fixture.name,
    displayName: fixture.displayName,
    description: fixture.description,
    category: fixture.category ?? "game",
    launchType: fixture.launchType ?? "connect",
    launchUrl: fixture.launchUrl ?? null,
    npm: {
      package: fixture.npm?.package ?? fixture.name,
      v0Version: fixture.npm?.v0Version ?? null,
      v1Version: fixture.npm?.v1Version ?? null,
      v2Version: fixture.npm?.v2Version ?? "1.0.0",
    },
    viewer: fixture.viewer,
  };
}

function mockInstalledPlugin(
  name: string,
  installPath: string,
  installedAt = "2026-01-01",
) {
  return {
    name,
    version: "1.0.0",
    installPath,
    installedAt,
  };
}

const APP_SCOPE = "@elizaos/app-";
const APP_BABYLON = `${APP_SCOPE}babylon`;
const APP_HYPERSCAPE = `${APP_SCOPE}hyperscape`;
const APP_2004SCAPE = `${APP_SCOPE}2004scape`;
const APP_TEST = `${APP_SCOPE}test`;
const APP_DISCORD = "@elizaos/plugin-discord";

const APP_INFO_2004SCAPE: RegistryAppInfoFixture = {
  name: APP_2004SCAPE,
  displayName: "2004scape",
  description: "RuneScape",
};

const APP_INFO_2004SCAPE_WEBCLIENT: RegistryAppInfoFixture = {
  name: APP_2004SCAPE,
  displayName: "2004scape",
  description: "2004scape",
  launchType: "connect",
  launchUrl: "http://localhost:8880/webclient",
  viewer: {
    url: "http://localhost:8880/webclient",
    embedParams: { bot: "{RS_SDK_BOT_NAME}" },
  },
};

const APP_INFO_2004SCAPE_AUTH: RegistryAppInfoFixture = {
  name: APP_2004SCAPE,
  displayName: "2004scape",
  description: "2004scape",
  launchType: "connect",
  launchUrl: "http://localhost:8880",
  viewer: {
    url: "http://localhost:8880",
    postMessageAuth: true,
  },
};

const APP_INFO_BABYLON: RegistryAppInfoFixture = {
  name: APP_BABYLON,
  displayName: "Babylon",
  description: "Trading",
  category: "platform",
  launchType: "url",
  launchUrl: "https://babylon.social",
};

const APP_INFO_HYPERSCAPE: RegistryAppInfoFixture = {
  name: APP_HYPERSCAPE,
  displayName: "Hyperscape",
  description: "Hyperscape",
  launchUrl: "http://localhost:3333",
  viewer: {
    url: "http://localhost:3333",
    postMessageAuth: true,
  },
};

const APP_INFO_TEST_FAIL: RegistryAppInfoFixture = {
  name: APP_TEST,
  displayName: "Test",
  description: "",
  latestVersion: null,
  supports: { v0: false, v1: false, v2: false },
  launchType: "url",
  launchUrl: null,
};

const APP_INFO_TEST_VIEWER: RegistryAppInfoFixture = {
  name: APP_TEST,
  displayName: "Test App",
  description: "Test",
  launchType: "connect",
  launchUrl: "http://localhost:9999?bot={TEST_VIEWER_BOT}",
  viewer: {
    url: "http://localhost:9999",
    embedParams: { bot: "{TEST_VIEWER_BOT}" },
  },
};

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
        makeRegistryAppInfo({
          ...APP_INFO_2004SCAPE,
          capabilities: ["combat"],
          stars: 42,
          repository: "https://github.com/elizaOS/eliza-2004scape",
        }),
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
      vi.mocked(getAppInfo).mockResolvedValue(
        makeRegistryAppInfo({
          ...APP_INFO_2004SCAPE,
          capabilities: ["combat"],
          stars: 42,
          repository: "https://github.com/elizaOS/eliza-2004scape",
          viewer: {
            url: "https://2004scape.org/webclient",
            embedParams: { bot: "testbot" },
            sandbox: "allow-scripts allow-same-origin",
          },
        }),
      );

      const { installPlugin, listInstalledPlugins } = await import(
        "./plugin-installer.js"
      );
      vi.mocked(listInstalledPlugins).mockReturnValue([]);
      vi.mocked(installPlugin).mockResolvedValue({
        success: true,
        pluginName: APP_2004SCAPE,
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
      vi.mocked(getAppInfo).mockResolvedValue(
        makeRegistryAppInfo({
          name: APP_2004SCAPE,
          displayName: "2004scape",
          description: "RuneScape",
        }),
      );

      const { installPlugin, listInstalledPlugins } = await import(
        "./plugin-installer.js"
      );
      const mockInstall = vi.mocked(installPlugin);
      mockInstall.mockClear();
      vi.mocked(listInstalledPlugins).mockReturnValue([
        mockInstalledPlugin(APP_2004SCAPE, "/tmp/x"),
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
      vi.mocked(getAppInfo).mockResolvedValue(
        makeRegistryAppInfo(APP_INFO_TEST_FAIL),
      );

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
      vi.mocked(getAppInfo).mockResolvedValue(
        makeRegistryAppInfo(APP_INFO_BABYLON),
      );

      const { listInstalledPlugins } = await import("./plugin-installer.js");
      vi.mocked(listInstalledPlugins).mockReturnValue([
        mockInstalledPlugin(APP_BABYLON, "/tmp/x"),
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
      vi.mocked(getAppInfo).mockResolvedValue(
        makeRegistryAppInfo(APP_INFO_TEST_VIEWER),
      );

      const { listInstalledPlugins } = await import("./plugin-installer.js");
      vi.mocked(listInstalledPlugins).mockReturnValue([
        mockInstalledPlugin(APP_TEST, "/tmp/x"),
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
      vi.mocked(getAppInfo).mockResolvedValue(
        makeRegistryAppInfo(APP_INFO_2004SCAPE_WEBCLIENT),
      );

      const { listInstalledPlugins } = await import("./plugin-installer.js");
      vi.mocked(listInstalledPlugins).mockReturnValue([
        mockInstalledPlugin(APP_2004SCAPE, "/tmp/rs"),
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
      vi.mocked(getAppInfo).mockResolvedValue(
        makeRegistryAppInfo(APP_INFO_HYPERSCAPE),
      );

      const { listInstalledPlugins } = await import("./plugin-installer.js");
      vi.mocked(listInstalledPlugins).mockReturnValue([
        mockInstalledPlugin(APP_HYPERSCAPE, "/tmp/hs"),
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
      vi.mocked(getAppInfo).mockResolvedValue(
        makeRegistryAppInfo(APP_INFO_HYPERSCAPE),
      );

      const { listInstalledPlugins } = await import("./plugin-installer.js");
      vi.mocked(listInstalledPlugins).mockReturnValue([
        mockInstalledPlugin(APP_HYPERSCAPE, "/tmp/hs"),
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

    it("includes 2004scape postMessage auth payload with configured credentials", async () => {
      process.env.RS_SDK_BOT_NAME = "myagent";
      process.env.RS_SDK_BOT_PASSWORD = "secretpass";

      const { getAppInfo } = await import("./registry-client.js");
      vi.mocked(getAppInfo).mockResolvedValue(
        makeRegistryAppInfo(APP_INFO_2004SCAPE_AUTH),
      );

      const { listInstalledPlugins } = await import("./plugin-installer.js");
      vi.mocked(listInstalledPlugins).mockReturnValue([
        mockInstalledPlugin(APP_2004SCAPE, "/tmp/rs"),
      ]);

      const { AppManager } = await import("./app-manager.js");
      const mgr = new AppManager();
      const result = await mgr.launch("@elizaos/app-2004scape");

      expect(result.viewer?.postMessageAuth).toBe(true);
      expect(result.viewer?.authMessage).toEqual({
        type: "RS_2004SCAPE_AUTH",
        authToken: "myagent",
        sessionToken: "secretpass",
      });

      delete process.env.RS_SDK_BOT_NAME;
      delete process.env.RS_SDK_BOT_PASSWORD;
    });

    it("uses fallback credentials for 2004scape postMessage auth", async () => {
      delete process.env.RS_SDK_BOT_NAME;
      delete process.env.RS_SDK_BOT_PASSWORD;
      process.env.BOT_NAME = "fallbackbot";
      process.env.BOT_PASSWORD = "fallbackpass";

      const { getAppInfo } = await import("./registry-client.js");
      vi.mocked(getAppInfo).mockResolvedValue(
        makeRegistryAppInfo(APP_INFO_2004SCAPE_AUTH),
      );

      const { listInstalledPlugins } = await import("./plugin-installer.js");
      vi.mocked(listInstalledPlugins).mockReturnValue([
        mockInstalledPlugin(APP_2004SCAPE, "/tmp/rs"),
      ]);

      const { AppManager } = await import("./app-manager.js");
      const mgr = new AppManager();
      const result = await mgr.launch("@elizaos/app-2004scape");

      expect(result.viewer?.postMessageAuth).toBe(true);
      expect(result.viewer?.authMessage).toEqual({
        type: "RS_2004SCAPE_AUTH",
        authToken: "fallbackbot",
        sessionToken: "fallbackpass",
      });

      delete process.env.BOT_NAME;
      delete process.env.BOT_PASSWORD;
    });

    it("uses testbot default for 2004scape when no credentials configured", async () => {
      delete process.env.RS_SDK_BOT_NAME;
      delete process.env.RS_SDK_BOT_PASSWORD;
      delete process.env.BOT_NAME;
      delete process.env.BOT_PASSWORD;

      const { getAppInfo } = await import("./registry-client.js");
      vi.mocked(getAppInfo).mockResolvedValue(
        makeRegistryAppInfo(APP_INFO_2004SCAPE_AUTH),
      );

      const { listInstalledPlugins } = await import("./plugin-installer.js");
      vi.mocked(listInstalledPlugins).mockReturnValue([
        mockInstalledPlugin(APP_2004SCAPE, "/tmp/rs"),
      ]);

      const { AppManager } = await import("./app-manager.js");
      const mgr = new AppManager();
      const result = await mgr.launch("@elizaos/app-2004scape");

      expect(result.viewer?.postMessageAuth).toBe(true);
      expect(result.viewer?.authMessage).toEqual({
        type: "RS_2004SCAPE_AUTH",
        authToken: "testbot",
        sessionToken: "",
      });
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
        mockInstalledPlugin(APP_2004SCAPE, "/tmp/a"),
        mockInstalledPlugin(APP_DISCORD, "/tmp/b", "2026-01-01"),
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
      vi.mocked(getAppInfo).mockResolvedValue(
        makeRegistryAppInfo(APP_INFO_BABYLON),
      );
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
      vi.mocked(getAppInfo).mockResolvedValue(
        makeRegistryAppInfo(APP_INFO_BABYLON),
      );
      const { listInstalledPlugins, uninstallPlugin } = await import(
        "./plugin-installer.js"
      );
      vi.mocked(listInstalledPlugins).mockReturnValue([
        mockInstalledPlugin(APP_BABYLON, "/tmp/x"),
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
      vi.mocked(getAppInfo).mockResolvedValue(
        makeRegistryAppInfo(APP_INFO_BABYLON),
      );
      const { listInstalledPlugins, uninstallPlugin } = await import(
        "./plugin-installer.js"
      );
      vi.mocked(listInstalledPlugins).mockReturnValue([
        mockInstalledPlugin(APP_BABYLON, "/tmp/x"),
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
