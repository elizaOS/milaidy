/**
 * Tests for the Milaidy registry client.
 *
 * Exercises the full cache hierarchy (memory → file → network), search
 * scoring, plugin lookup, and edge cases for malformed data.
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// We dynamically import the module under test so we can reset module state
// between tests by using vi.resetModules(). The registry client has module-
// level cache state that persists across calls.
// ---------------------------------------------------------------------------

async function loadModule() {
  return await import("./registry-client.js");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal generated-registry.json payload for testing. */
function fakeGeneratedRegistry() {
  return {
    lastUpdatedAt: "2026-02-07T00:00:00Z",
    registry: {
      "@elizaos/plugin-solana": {
        git: {
          repo: "elizaos-plugins/plugin-solana",
          v0: { version: "0.5.0", branch: "main" },
          v1: { version: "1.0.0", branch: "v1" },
          v2: { version: "2.0.0", branch: "next" },
        },
        npm: {
          repo: "@elizaos/plugin-solana",
          v0: "0.5.0",
          v1: "1.0.0",
          v2: "2.0.0-alpha.3",
          v0CoreRange: ">=0.5.0",
          v1CoreRange: ">=1.0.0",
          v2CoreRange: ">=2.0.0",
        },
        supports: { v0: true, v1: true, v2: true },
        description: "Solana blockchain integration",
        homepage: "https://github.com/elizaos-plugins/plugin-solana",
        topics: ["blockchain", "solana", "defi"],
        stargazers_count: 150,
        language: "TypeScript",
      },
      "@elizaos/plugin-discord": {
        git: {
          repo: "elizaos-plugins/plugin-discord",
          v0: { version: null, branch: null },
          v1: { version: null, branch: null },
          v2: { version: "2.0.0", branch: "next" },
        },
        npm: {
          repo: "@elizaos/plugin-discord",
          v0: null,
          v1: null,
          v2: "2.0.0-alpha.3",
          v0CoreRange: null,
          v1CoreRange: null,
          v2CoreRange: ">=2.0.0",
        },
        supports: { v0: false, v1: false, v2: true },
        description: "Discord bot integration",
        homepage: null,
        topics: ["discord", "bot"],
        stargazers_count: 50,
        language: "TypeScript",
      },
      "@thirdparty/plugin-weather": {
        git: {
          repo: "thirdparty/plugin-weather",
          v0: { version: null, branch: null },
          v1: { version: "1.0.0", branch: "main" },
          v2: { version: null, branch: null },
        },
        npm: {
          repo: "@thirdparty/plugin-weather",
          v0: null,
          v1: "1.0.0",
          v2: null,
          v0CoreRange: null,
          v1CoreRange: ">=1.0.0",
          v2CoreRange: null,
        },
        supports: { v0: false, v1: true, v2: false },
        description: "Weather forecasts",
        homepage: null,
        topics: ["weather", "api"],
        stargazers_count: 5,
        language: "TypeScript",
      },
      "@elizaos/app-dungeons": {
        git: {
          repo: "elizaos/app-dungeons",
          v0: { version: null, branch: null },
          v1: { version: null, branch: null },
          v2: { version: "1.0.0", branch: "main" },
        },
        npm: {
          repo: "@elizaos/app-dungeons",
          v0: null,
          v1: null,
          v2: "1.0.0",
          v0CoreRange: null,
          v1CoreRange: null,
          v2CoreRange: ">=2.0.0",
        },
        supports: { v0: false, v1: false, v2: true },
        description: "D&D VTT with AI Dungeon Master",
        homepage: null,
        topics: ["game", "rpg", "dnd"],
        stargazers_count: 42,
        language: "TypeScript",
        kind: "app",
        app: {
          displayName: "Dungeons",
          category: "game",
          launchType: "local",
          launchUrl: "http://localhost:{port}",
          icon: null,
          capabilities: ["combat", "roleplay", "exploration"],
          minPlayers: 1,
          maxPlayers: 6,
        },
      },
      "@elizaos/app-babylon": {
        git: {
          repo: "elizaos/app-babylon",
          v0: { version: null, branch: null },
          v1: { version: null, branch: null },
          v2: { version: "1.0.0", branch: "main" },
        },
        npm: {
          repo: "@elizaos/app-babylon",
          v0: null,
          v1: null,
          v2: "1.0.0",
          v0CoreRange: null,
          v1CoreRange: null,
          v2CoreRange: ">=2.0.0",
        },
        supports: { v0: false, v1: false, v2: true },
        description: "Prediction market platform",
        homepage: "https://babylon.social",
        topics: ["defi", "trading", "social"],
        stargazers_count: 200,
        language: "TypeScript",
        kind: "app",
        app: {
          displayName: "Babylon",
          category: "platform",
          launchType: "url",
          launchUrl: "https://babylon.social",
          icon: "https://babylon.social/icon.png",
          capabilities: ["trading", "social", "prediction-markets"],
          minPlayers: null,
          maxPlayers: null,
        },
      },
    },
  };
}

/** Minimal index.json payload for fallback testing. */
function fakeIndexJson() {
  return {
    "@elizaos/plugin-solana": "github:elizaos-plugins/plugin-solana",
    "@elizaos/plugin-discord": "github:elizaos-plugins/plugin-discord",
  };
}

async function writeLocalAppPackage(
  workspaceRoot: string,
  options: {
    dirName: string;
    packageName: string;
    displayName: string;
    launchType: string;
    launchUrl: string;
  },
): Promise<void> {
  const appDir = path.join(workspaceRoot, "plugins", options.dirName);
  await fs.mkdir(appDir, { recursive: true });
  await fs.writeFile(
    path.join(appDir, "package.json"),
    JSON.stringify(
      {
        name: options.packageName,
        version: "1.0.0",
        description: `${options.displayName} local package`,
        elizaos: {
          kind: "app",
          app: {
            displayName: options.displayName,
            category: "game",
            launchType: options.launchType,
            launchUrl: options.launchUrl,
            capabilities: ["demo"],
          },
        },
      },
      null,
      2,
    ),
  );
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let tmpDir: string;
let savedEnv: Record<string, string | undefined>;

async function removeDirWithRetries(dir: string, attempts = 4): Promise<void> {
  for (let i = 0; i < attempts; i += 1) {
    try {
      await fs.rm(dir, { recursive: true, force: true });
      return;
    } catch (error) {
      const shouldRetry =
        error instanceof Error &&
        "code" in error &&
        (error as NodeJS.ErrnoException).code === "ENOTEMPTY" &&
        i < attempts - 1;
      if (!shouldRetry) throw error;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
}

beforeEach(async () => {
  // Reset module cache to get fresh module-level state
  vi.resetModules();

  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "milaidy-reg-test-"));
  savedEnv = {
    MILAIDY_STATE_DIR: process.env.MILAIDY_STATE_DIR,
    MILAIDY_WORKSPACE_ROOT: process.env.MILAIDY_WORKSPACE_ROOT,
  };
  // Point the file cache at our temp dir
  process.env.MILAIDY_STATE_DIR = tmpDir;
  const isolatedWorkspaceRoot = path.join(tmpDir, "workspace-empty");
  await fs.mkdir(isolatedWorkspaceRoot, { recursive: true });
  process.env.MILAIDY_WORKSPACE_ROOT = isolatedWorkspaceRoot;

  // Mock global fetch
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(async () => {
  vi.unstubAllGlobals();
  process.env.MILAIDY_STATE_DIR = savedEnv.MILAIDY_STATE_DIR;
  process.env.MILAIDY_WORKSPACE_ROOT = savedEnv.MILAIDY_WORKSPACE_ROOT;
  await removeDirWithRetries(tmpDir);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("registry-client", () => {
  describe("getRegistryPlugins", () => {
    it("fetches and parses generated-registry.json from network", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(fakeGeneratedRegistry()),
      });
      vi.stubGlobal("fetch", mockFetch);

      const { getRegistryPlugins } = await loadModule();
      const registry = await getRegistryPlugins();

      expect(registry.size).toBe(5);
      const solana = registry.get("@elizaos/plugin-solana");
      expect(solana).toBeDefined();
      expect(solana?.description).toBe("Solana blockchain integration");
      expect(solana?.npm.v2Version).toBe("2.0.0-alpha.3");
      expect(solana?.supports.v2).toBe(true);
      expect(solana?.gitUrl).toBe(
        "https://github.com/elizaos-plugins/plugin-solana.git",
      );
      expect(solana?.stars).toBe(150);
      expect(solana?.topics).toContain("blockchain");
    });

    it("falls back to index.json when generated-registry.json fails", async () => {
      let callCount = 0;
      const mockFetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // First call: generated-registry.json — fail
          return Promise.resolve({
            ok: false,
            status: 404,
            statusText: "Not Found",
          });
        }
        // Second call: index.json — succeed
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(fakeIndexJson()),
        });
      });
      vi.stubGlobal("fetch", mockFetch);

      const { getRegistryPlugins } = await loadModule();
      const registry = await getRegistryPlugins();

      expect(registry.size).toBe(2);
      // index.json has no descriptions — should be empty
      const solana = registry.get("@elizaos/plugin-solana");
      expect(solana).toBeDefined();
      expect(solana?.description).toBe("");
      expect(solana?.gitRepo).toBe("elizaos-plugins/plugin-solana");
    });

    it("throws when both generated-registry.json and index.json fail", async () => {
      const mockFetch = vi.fn().mockImplementation(() => {
        return Promise.resolve({
          ok: false,
          status: 500,
          statusText: "Server Error",
        });
      });
      vi.stubGlobal("fetch", mockFetch);

      const { getRegistryPlugins } = await loadModule();
      await expect(getRegistryPlugins()).rejects.toThrow("index.json");
    });

    it("uses memory cache on second call", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(fakeGeneratedRegistry()),
      });
      vi.stubGlobal("fetch", mockFetch);

      const { getRegistryPlugins } = await loadModule();
      const first = await getRegistryPlugins();
      const second = await getRegistryPlugins();

      expect(first).toBe(second); // Same Map reference
      expect(mockFetch).toHaveBeenCalledTimes(1); // Only one network fetch
    });

    it("persists to file cache and reads it back", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(fakeGeneratedRegistry()),
      });
      vi.stubGlobal("fetch", mockFetch);

      // First: fetch from network, which writes file cache
      const mod1 = await loadModule();
      await mod1.getRegistryPlugins();
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Wait for the fire-and-forget file cache write to complete
      await new Promise((r) => setTimeout(r, 100));

      // Reset module to clear memory cache but keep file cache
      vi.resetModules();

      // Create a NEW mock that tracks calls separately
      const mockFetch2 = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(fakeGeneratedRegistry()),
      });
      vi.stubGlobal("fetch", mockFetch2);

      // Second: should read from file cache, not network
      const mod2 = await loadModule();
      const registry = await mod2.getRegistryPlugins();
      expect(mockFetch2).not.toHaveBeenCalled();
      expect(registry.size).toBe(5);
    });
  });

  describe("refreshRegistry", () => {
    it("clears caches and re-fetches from network", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(fakeGeneratedRegistry()),
      });
      vi.stubGlobal("fetch", mockFetch);

      const { getRegistryPlugins, refreshRegistry } = await loadModule();
      await getRegistryPlugins();
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Let the fire-and-forget file cache write from getRegistryPlugins settle
      // before refreshRegistry tries to delete it, avoiding a write-after-delete race.
      await new Promise((r) => setTimeout(r, 50));

      mockFetch.mockClear();
      await refreshRegistry();
      expect(mockFetch).toHaveBeenCalledTimes(1); // Re-fetched
    });
  });

  describe("getPluginInfo", () => {
    beforeEach(async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve(fakeGeneratedRegistry()),
        }),
      );
    });

    it("finds plugin by exact name", async () => {
      const { getPluginInfo } = await loadModule();
      const info = await getPluginInfo("@elizaos/plugin-solana");
      expect(info).not.toBeNull();
      expect(info?.name).toBe("@elizaos/plugin-solana");
    });

    it("finds plugin by bare name (adds @elizaos/ prefix)", async () => {
      const { getPluginInfo } = await loadModule();
      const info = await getPluginInfo("plugin-solana");
      expect(info).not.toBeNull();
      expect(info?.name).toBe("@elizaos/plugin-solana");
    });

    it("finds plugin by scope-stripped name", async () => {
      const { getPluginInfo } = await loadModule();
      // @thirdparty/plugin-weather — search by "plugin-weather"
      const info = await getPluginInfo("plugin-weather");
      expect(info).not.toBeNull();
      expect(info?.name).toBe("@thirdparty/plugin-weather");
    });

    it("returns null for non-existent plugin", async () => {
      const { getPluginInfo } = await loadModule();
      const info = await getPluginInfo("@elizaos/plugin-nonexistent");
      expect(info).toBeNull();
    });

    it("returns null for empty string", async () => {
      const { getPluginInfo } = await loadModule();
      const info = await getPluginInfo("");
      expect(info).toBeNull();
    });
  });

  describe("searchPlugins", () => {
    beforeEach(async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve(fakeGeneratedRegistry()),
        }),
      );
    });

    it("returns matching plugins sorted by score", async () => {
      const { searchPlugins } = await loadModule();
      const results = await searchPlugins("solana");

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].name).toBe("@elizaos/plugin-solana");
      expect(results[0].score).toBe(1); // Top result normalised to 1.0
    });

    it("matches on description text", async () => {
      const { searchPlugins } = await loadModule();
      const results = await searchPlugins("blockchain");

      expect(results.some((r) => r.name === "@elizaos/plugin-solana")).toBe(
        true,
      );
    });

    it("matches on topics", async () => {
      const { searchPlugins } = await loadModule();
      const results = await searchPlugins("defi");

      expect(results.some((r) => r.name === "@elizaos/plugin-solana")).toBe(
        true,
      );
    });

    it("returns empty array for unmatched query", async () => {
      const { searchPlugins } = await loadModule();
      const results = await searchPlugins("zzzznonexistentzzzz");

      expect(results).toEqual([]);
    });

    it("respects limit parameter", async () => {
      const { searchPlugins } = await loadModule();
      const results = await searchPlugins("plugin", 1);

      expect(results.length).toBe(1);
    });

    it("handles single-character query terms gracefully", async () => {
      const { searchPlugins } = await loadModule();
      // Single-char terms are filtered out, so "a" alone should still work
      // via the full-query match path
      const results = await searchPlugins("a");
      // "a" appears in many names — should not crash
      expect(Array.isArray(results)).toBe(true);
    });

    it("multi-word query scores per-term matches", async () => {
      const { searchPlugins } = await loadModule();
      const results = await searchPlugins("discord bot");

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].name).toBe("@elizaos/plugin-discord");
    });

    it("normalises scores between 0 and 1", async () => {
      const { searchPlugins } = await loadModule();
      const results = await searchPlugins("plugin");

      for (const r of results) {
        expect(r.score).toBeGreaterThanOrEqual(0);
        expect(r.score).toBeLessThanOrEqual(1);
      }
    });
  });

  // =========================================================================
  // App-specific functions
  // =========================================================================

  describe("listApps", () => {
    beforeEach(async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve(fakeGeneratedRegistry()),
        }),
      );
    });

    it("returns only entries with kind 'app'", async () => {
      const { listApps } = await loadModule();
      const apps = await listApps();

      expect(apps.length).toBe(2);
      const names = apps.map((a: { name: string }) => a.name);
      expect(names).toContain("@elizaos/app-dungeons");
      expect(names).toContain("@elizaos/app-babylon");
      // Regular plugins should NOT appear
      expect(names).not.toContain("@elizaos/plugin-solana");
      expect(names).not.toContain("@elizaos/plugin-discord");
    });

    it("sorts apps by star count descending", async () => {
      const { listApps } = await loadModule();
      const apps = await listApps();

      // Babylon (200 stars) should come before Dungeons (42 stars)
      expect(apps[0].name).toBe("@elizaos/app-babylon");
      expect(apps[1].name).toBe("@elizaos/app-dungeons");
    });

    it("populates all RegistryAppInfo fields from app metadata", async () => {
      const { listApps } = await loadModule();
      const apps = await listApps();

      const babylon = apps.find(
        (a: { name: string }) => a.name === "@elizaos/app-babylon",
      );
      expect(babylon).toBeDefined();
      expect(babylon.displayName).toBe("Babylon");
      expect(babylon.category).toBe("platform");
      expect(babylon.launchType).toBe("url");
      expect(babylon.launchUrl).toBe("https://babylon.social");
      expect(babylon.icon).toBe("https://babylon.social/icon.png");
      expect(babylon.capabilities).toEqual([
        "trading",
        "social",
        "prediction-markets",
      ]);
      expect(babylon.stars).toBe(200);
      expect(babylon.repository).toBe("https://github.com/elizaos/app-babylon");
      expect(babylon.latestVersion).toBe("1.0.0");
      expect(babylon.supports.v2).toBe(true);
      expect(babylon.npm.package).toBe("@elizaos/app-babylon");
    });

    it("populates local app fields correctly", async () => {
      const { listApps } = await loadModule();
      const apps = await listApps();

      const dungeons = apps.find(
        (a: { name: string }) => a.name === "@elizaos/app-dungeons",
      );
      expect(dungeons).toBeDefined();
      expect(dungeons.displayName).toBe("Dungeons");
      expect(dungeons.category).toBe("game");
      expect(dungeons.launchType).toBe("local");
      expect(dungeons.launchUrl).toBe("http://localhost:{port}");
      expect(dungeons.icon).toBeNull();
      expect(dungeons.capabilities).toContain("combat");
    });

    it("returns empty array when registry has no apps", async () => {
      // Override with a registry that has zero app entries
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: () =>
            Promise.resolve({
              lastUpdatedAt: "2026-02-07T00:00:00Z",
              registry: {
                "@elizaos/plugin-solana":
                  fakeGeneratedRegistry().registry["@elizaos/plugin-solana"],
              },
            }),
        }),
      );
      vi.resetModules();
      const { listApps } = await loadModule();
      const apps = await listApps();
      expect(apps).toEqual([]);
    });
  });

  describe("getAppInfo", () => {
    beforeEach(async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve(fakeGeneratedRegistry()),
        }),
      );
    });

    it("returns app info for an existing app", async () => {
      const { getAppInfo } = await loadModule();
      const info = await getAppInfo("@elizaos/app-dungeons");
      expect(info).not.toBeNull();
      expect(info?.displayName).toBe("Dungeons");
      expect(info?.launchType).toBe("local");
    });

    it("resolves app by bare name", async () => {
      const { getAppInfo } = await loadModule();
      const info = await getAppInfo("app-dungeons");
      expect(info).not.toBeNull();
      expect(info?.name).toBe("@elizaos/app-dungeons");
    });

    it("returns null for a regular plugin (not an app)", async () => {
      const { getAppInfo } = await loadModule();
      const info = await getAppInfo("@elizaos/plugin-solana");
      expect(info).toBeNull();
    });

    it("returns null for a non-existent entry", async () => {
      const { getAppInfo } = await loadModule();
      const info = await getAppInfo("@elizaos/app-nonexistent");
      expect(info).toBeNull();
    });

    it("returns null for empty string", async () => {
      const { getAppInfo } = await loadModule();
      const info = await getAppInfo("");
      expect(info).toBeNull();
    });
  });

  describe("searchApps", () => {
    beforeEach(async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve(fakeGeneratedRegistry()),
        }),
      );
    });

    it("matches on app display name", async () => {
      const { searchApps } = await loadModule();
      const results = await searchApps("Babylon");
      expect(results.length).toBe(1);
      expect(results[0].name).toBe("@elizaos/app-babylon");
    });

    it("matches on app capabilities", async () => {
      const { searchApps } = await loadModule();
      const results = await searchApps("trading");
      expect(
        results.some(
          (r: { name: string }) => r.name === "@elizaos/app-babylon",
        ),
      ).toBe(true);
    });

    it("matches on description", async () => {
      const { searchApps } = await loadModule();
      const results = await searchApps("dungeon master");
      expect(results.length).toBeGreaterThan(0);
      // "D&D VTT with AI Dungeon Master" should match
    });

    it("does NOT return regular plugins", async () => {
      const { searchApps } = await loadModule();
      const results = await searchApps("solana");
      // "solana" should match the plugin but searchApps filters to kind=app only
      expect(results.length).toBe(0);
    });

    it("returns empty for unmatched query", async () => {
      const { searchApps } = await loadModule();
      const results = await searchApps("zzzznonexistentzzzz");
      expect(results).toEqual([]);
    });

    it("respects limit parameter", async () => {
      const { searchApps } = await loadModule();
      const results = await searchApps("app", 1);
      expect(results.length).toBeLessThanOrEqual(1);
    });

    it("matches on topics", async () => {
      const { searchApps } = await loadModule();
      const results = await searchApps("rpg");
      expect(
        results.some(
          (r: { name: string }) => r.name === "@elizaos/app-dungeons",
        ),
      ).toBe(true);
    });

    it("multi-word query scores both terms", async () => {
      const { searchApps } = await loadModule();
      const results = await searchApps("prediction market");
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].name).toBe("@elizaos/app-babylon");
    });
  });

  describe("app metadata parsing", () => {
    it("parses kind and appMeta from generated-registry.json", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve(fakeGeneratedRegistry()),
        }),
      );
      const { getRegistryPlugins } = await loadModule();
      const registry = await getRegistryPlugins();

      const dungeons = registry.get("@elizaos/app-dungeons");
      expect(dungeons).toBeDefined();
      expect(dungeons?.kind).toBe("app");
      expect(dungeons?.appMeta).toBeDefined();
      expect(dungeons?.appMeta?.displayName).toBe("Dungeons");
      expect(dungeons?.appMeta?.category).toBe("game");
      expect(dungeons?.appMeta?.launchType).toBe("local");
      expect(dungeons?.appMeta?.capabilities).toContain("combat");
      expect(dungeons?.appMeta?.maxPlayers).toBe(6);
    });

    it("regular plugins have no kind or appMeta", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve(fakeGeneratedRegistry()),
        }),
      );
      const { getRegistryPlugins } = await loadModule();
      const registry = await getRegistryPlugins();

      const solana = registry.get("@elizaos/plugin-solana");
      expect(solana).toBeDefined();
      expect(solana?.kind).toBeUndefined();
      expect(solana?.appMeta).toBeUndefined();
    });

    it("handles app entries with null optional fields", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve(fakeGeneratedRegistry()),
        }),
      );
      const { listApps } = await loadModule();
      const apps = await listApps();

      const dungeons = apps.find(
        (a: { name: string }) => a.name === "@elizaos/app-dungeons",
      );
      expect(dungeons?.icon).toBeNull();
      // minPlayers and maxPlayers are in the wire format but not in RegistryAppInfo
      // (they're in appMeta) — verify they're present on the raw entry
    });
  });

  describe("local workspace app discovery", () => {
    it("discovers local app packages when remote registry has no apps", async () => {
      const workspaceRoot = path.join(tmpDir, "workspace");
      await writeLocalAppPackage(workspaceRoot, {
        dirName: "app-hyperscape",
        packageName: "@elizaos/app-hyperscape",
        displayName: "Hyperscape",
        launchType: "connect",
        launchUrl: "https://hyperscape.ai",
      });
      process.env.MILAIDY_WORKSPACE_ROOT = workspaceRoot;

      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: () =>
            Promise.resolve({
              lastUpdatedAt: "2026-02-07T00:00:00Z",
              registry: {
                "@elizaos/plugin-solana":
                  fakeGeneratedRegistry().registry["@elizaos/plugin-solana"],
              },
            }),
        }),
      );

      const { listApps, getPluginInfo } = await loadModule();
      const apps = await listApps();
      expect(apps.some((app) => app.name === "@elizaos/app-hyperscape")).toBe(
        true,
      );

      const hyperscape = apps.find(
        (app) => app.name === "@elizaos/app-hyperscape",
      );
      expect(hyperscape?.launchUrl).toBe("http://localhost:3333");
      expect(hyperscape?.viewer?.url).toBe("http://localhost:3333");
      expect(hyperscape?.viewer?.postMessageAuth).toBe(true);

      const pluginInfo = await getPluginInfo("@elizaos/app-hyperscape");
      expect(pluginInfo?.localPath).toContain("plugins/app-hyperscape");
    });
  });
});
