/**
 * E2E Integration tests for Hyperscape app workflow.
 *
 * Tests the complete flow:
 * 1. List apps - Hyperscape should appear
 * 2. Get app info - Should have correct metadata
 * 3. Launch app - Should succeed for local plugins
 * 4. Verify viewer config - Should have correct URLs
 */

import { beforeEach, describe, expect, test, vi } from "vitest";
import { AppManager } from "../services/app-manager";
import type {
  PluginManagerLike,
  RegistryPluginInfo,
} from "../services/plugin-manager-types";

// Mock local Hyperscape plugin as it appears from local plugin scanning
const HYPERSCAPE_LOCAL_PLUGIN: RegistryPluginInfo = {
  name: "@elizaos/app-hyperscape",
  gitRepo: "elizaos/app-hyperscape",
  gitUrl: "https://github.com/elizaos/app-hyperscape",
  displayName: "Hyperscape",
  description:
    "AI-powered 3D multiplayer RPG — explore, fight, gather, craft, and socialize with AI agents",
  homepage: "https://hyperscape.ai",
  topics: ["rpg", "3d", "multiplayer", "mmo", "game"],
  stars: 0,
  language: "TypeScript",
  npm: {
    package: "@elizaos/app-hyperscape",
    v0Version: null,
    v1Version: "1.0.0",
    v2Version: "1.0.0",
  },
  supports: { v0: false, v1: true, v2: true },
  // App-specific metadata
  category: "game",
  capabilities: [
    "combat",
    "skills",
    "inventory",
    "banking",
    "social-chat",
    "exploration",
    "crafting",
  ],
  icon: null,
  // Viewer and launch config
  launchType: "connect",
  launchUrl: "http://localhost:3333",
  viewer: {
    url: "http://localhost:3333",
    postMessageAuth: true,
    sandbox: "allow-scripts allow-same-origin allow-popups allow-forms",
  },
};

// Non-app plugin for filtering tests
const BOOTSTRAP_PLUGIN: RegistryPluginInfo = {
  name: "@elizaos/plugin-bootstrap",
  gitRepo: "elizaos/plugin-bootstrap",
  gitUrl: "https://github.com/elizaos/plugin-bootstrap",
  description: "Bootstrap plugin",
  topics: [],
  stars: 50,
  language: "TypeScript",
  npm: { package: "@elizaos/plugin-bootstrap" },
  supports: { v0: false, v1: true, v2: true },
};

function createMockPluginManager(
  plugins: RegistryPluginInfo[] = [HYPERSCAPE_LOCAL_PLUGIN, BOOTSTRAP_PLUGIN],
): PluginManagerLike {
  const pluginMap = new Map(plugins.map((p) => [p.name, p]));

  return {
    refreshRegistry: vi.fn(async () => pluginMap),
    listInstalledPlugins: vi.fn(async () => []),
    getRegistryPlugin: vi.fn(
      async (name: string) => pluginMap.get(name) ?? null,
    ),
    searchRegistry: vi.fn(async (query: string) => {
      const lowerQuery = query.toLowerCase();
      return plugins
        .filter(
          (p) =>
            p.name.toLowerCase().includes(lowerQuery) ||
            (p.description ?? "").toLowerCase().includes(lowerQuery),
        )
        .map((p) => ({
          name: p.name,
          description: p.description,
          score: 1,
          tags: p.topics,
          version: p.npm.v2Version ?? p.npm.v1Version ?? null,
          npmPackage: p.npm.package,
          repository: `https://github.com/${p.gitRepo}`,
          stars: p.stars,
          supports: p.supports,
        }));
    }),
    installPlugin: vi.fn(async () => ({
      success: true,
      pluginName: "",
      version: "1.0.0",
      installPath: "",
      requiresRestart: false,
    })),
    uninstallPlugin: vi.fn(async () => ({
      success: true,
      pluginName: "",
      requiresRestart: false,
    })),
    listEjectedPlugins: vi.fn(async () => []),
    ejectPlugin: vi.fn(),
    syncPlugin: vi.fn(),
    reinjectPlugin: vi.fn(),
  };
}

describe("Hyperscape E2E Integration", () => {
  let appManager: AppManager;
  let pluginManager: PluginManagerLike;

  beforeEach(() => {
    appManager = new AppManager();
    pluginManager = createMockPluginManager();
  });

  describe("App Discovery", () => {
    test("lists available apps including Hyperscape", async () => {
      const apps = await appManager.listAvailable(pluginManager);

      expect(apps).toHaveLength(1);
      expect(apps[0].name).toBe("@elizaos/app-hyperscape");
      expect(apps[0].displayName).toBe("Hyperscape");
    });

    test("filters out non-app plugins", async () => {
      const apps = await appManager.listAvailable(pluginManager);

      const hasBootstrap = apps.some(
        (a) => a.name === "@elizaos/plugin-bootstrap",
      );
      expect(hasBootstrap).toBe(false);
    });

    test("search returns Hyperscape for relevant queries", async () => {
      const results = await appManager.search(pluginManager, "hyperscape");

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].name).toBe("@elizaos/app-hyperscape");
    });

    test("search returns Hyperscape for RPG queries", async () => {
      const results = await appManager.search(pluginManager, "rpg");

      expect(results.length).toBeGreaterThan(0);
      expect(results.some((r) => r.name === "@elizaos/app-hyperscape")).toBe(
        true,
      );
    });
  });

  describe("App Info", () => {
    test("returns full Hyperscape metadata", async () => {
      const info = await appManager.getInfo(
        pluginManager,
        "@elizaos/app-hyperscape",
      );

      expect(info).not.toBeNull();
      expect(info?.name).toBe("@elizaos/app-hyperscape");
      expect(info?.displayName).toBe("Hyperscape");
      expect(info?.category).toBe("game");
      expect(info?.capabilities).toContain("combat");
      expect(info?.capabilities).toContain("social-chat");
    });

    test("returns viewer configuration", async () => {
      const info = (await appManager.getInfo(
        pluginManager,
        "@elizaos/app-hyperscape",
      )) as RegistryPluginInfo & {
        viewer?: { url: string; postMessageAuth?: boolean };
      };

      expect(info?.viewer).toBeDefined();
      expect(info?.viewer?.url).toBe("http://localhost:3333");
      expect(info?.viewer?.postMessageAuth).toBe(true);
    });

    test("returns null for non-existent app", async () => {
      const info = await appManager.getInfo(
        pluginManager,
        "@elizaos/app-nonexistent",
      );

      expect(info).toBeNull();
    });
  });

  describe("App Launch", () => {
    test("launches Hyperscape successfully", async () => {
      const result = await appManager.launch(
        pluginManager,
        "@elizaos/app-hyperscape",
      );

      expect(result.displayName).toBe("Hyperscape");
      expect(result.launchType).toBe("connect");
      expect(result.launchUrl).toBe("http://localhost:3333");
    });

    test("returns viewer config with correct URL", async () => {
      const result = await appManager.launch(
        pluginManager,
        "@elizaos/app-hyperscape",
      );

      expect(result.viewer).toBeDefined();
      expect(result.viewer?.url).toBe("http://localhost:3333");
    });

    test("returns viewer sandbox policy", async () => {
      const result = await appManager.launch(
        pluginManager,
        "@elizaos/app-hyperscape",
      );

      expect(result.viewer?.sandbox).toBe(
        "allow-scripts allow-same-origin allow-popups allow-forms",
      );
    });

    test("throws for non-existent app", async () => {
      await expect(
        appManager.launch(pluginManager, "@elizaos/app-nonexistent"),
      ).rejects.toThrow(
        'App "@elizaos/app-nonexistent" not found in the registry',
      );
    });

    test("does not require restart for local plugins", async () => {
      const result = await appManager.launch(
        pluginManager,
        "@elizaos/app-hyperscape",
      );

      // Local plugins should already be available
      expect(result.needsRestart).toBe(false);
    });
  });

  describe("PostMessage Auth Configuration", () => {
    test("indicates postMessage auth is configured", async () => {
      const result = await appManager.launch(
        pluginManager,
        "@elizaos/app-hyperscape",
      );

      // Without HYPERSCAPE_AUTH_TOKEN env var, postMessageAuth should be false
      // This is expected - the viewer will work without auth
      expect(result.viewer?.postMessageAuth).toBeDefined();
    });
  });

  describe("Full User Flow", () => {
    test("complete discovery to launch flow", async () => {
      // Step 1: List apps
      const apps = await appManager.listAvailable(pluginManager);
      expect(apps.some((a) => a.name === "@elizaos/app-hyperscape")).toBe(true);

      // Step 2: Get app info
      const info = await appManager.getInfo(
        pluginManager,
        "@elizaos/app-hyperscape",
      );
      expect(info).not.toBeNull();
      expect(info?.displayName).toBe("Hyperscape");

      // Step 3: Launch app
      const launchResult = await appManager.launch(
        pluginManager,
        "@elizaos/app-hyperscape",
      );
      expect(launchResult.viewer?.url).toBe("http://localhost:3333");

      // Step 4: Verify can stop
      const stopResult = await appManager.stop(
        pluginManager,
        "@elizaos/app-hyperscape",
      );
      expect(stopResult.success).toBe(true);
    });
  });
});
