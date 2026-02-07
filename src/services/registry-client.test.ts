/**
 * Tests for the Milaidy registry client.
 *
 * Exercises the full cache hierarchy (memory → file → network), search
 * scoring, plugin lookup, and edge cases for malformed data.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";

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
          v0: "0.5.0", v1: "1.0.0", v2: "2.0.0-alpha.3",
          v0CoreRange: ">=0.5.0", v1CoreRange: ">=1.0.0", v2CoreRange: ">=2.0.0",
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
          v0: null, v1: null, v2: "2.0.0-alpha.3",
          v0CoreRange: null, v1CoreRange: null, v2CoreRange: ">=2.0.0",
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
          v0: null, v1: "1.0.0", v2: null,
          v0CoreRange: null, v1CoreRange: ">=1.0.0", v2CoreRange: null,
        },
        supports: { v0: false, v1: true, v2: false },
        description: "Weather forecasts",
        homepage: null,
        topics: ["weather", "api"],
        stargazers_count: 5,
        language: "TypeScript",
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

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let tmpDir: string;
let savedEnv: Record<string, string | undefined>;

beforeEach(async () => {
  // Reset module cache to get fresh module-level state
  vi.resetModules();

  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "milaidy-reg-test-"));
  savedEnv = {
    MILAIDY_STATE_DIR: process.env.MILAIDY_STATE_DIR,
  };
  // Point the file cache at our temp dir
  process.env.MILAIDY_STATE_DIR = tmpDir;

  // Mock global fetch
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(async () => {
  vi.unstubAllGlobals();
  process.env.MILAIDY_STATE_DIR = savedEnv.MILAIDY_STATE_DIR;
  await fs.rm(tmpDir, { recursive: true, force: true });
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

      expect(registry.size).toBe(3);
      const solana = registry.get("@elizaos/plugin-solana");
      expect(solana).toBeDefined();
      expect(solana!.description).toBe("Solana blockchain integration");
      expect(solana!.npm.v2Version).toBe("2.0.0-alpha.3");
      expect(solana!.supports.v2).toBe(true);
      expect(solana!.gitUrl).toBe("https://github.com/elizaos-plugins/plugin-solana.git");
      expect(solana!.stars).toBe(150);
      expect(solana!.topics).toContain("blockchain");
    });

    it("falls back to index.json when generated-registry.json fails", async () => {
      let callCount = 0;
      const mockFetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // First call: generated-registry.json — fail
          return Promise.resolve({ ok: false, status: 404, statusText: "Not Found" });
        }
        // Second call: index.json — succeed
        return Promise.resolve({ ok: true, json: () => Promise.resolve(fakeIndexJson()) });
      });
      vi.stubGlobal("fetch", mockFetch);

      const { getRegistryPlugins } = await loadModule();
      const registry = await getRegistryPlugins();

      expect(registry.size).toBe(2);
      // index.json has no descriptions — should be empty
      const solana = registry.get("@elizaos/plugin-solana");
      expect(solana).toBeDefined();
      expect(solana!.description).toBe("");
      expect(solana!.gitRepo).toBe("elizaos-plugins/plugin-solana");
    });

    it("throws when both generated-registry.json and index.json fail", async () => {
      const mockFetch = vi.fn().mockImplementation(() => {
        return Promise.resolve({ ok: false, status: 500, statusText: "Server Error" });
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
      expect(registry.size).toBe(3);
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
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(fakeGeneratedRegistry()),
      }));
    });

    it("finds plugin by exact name", async () => {
      const { getPluginInfo } = await loadModule();
      const info = await getPluginInfo("@elizaos/plugin-solana");
      expect(info).not.toBeNull();
      expect(info!.name).toBe("@elizaos/plugin-solana");
    });

    it("finds plugin by bare name (adds @elizaos/ prefix)", async () => {
      const { getPluginInfo } = await loadModule();
      const info = await getPluginInfo("plugin-solana");
      expect(info).not.toBeNull();
      expect(info!.name).toBe("@elizaos/plugin-solana");
    });

    it("finds plugin by scope-stripped name", async () => {
      const { getPluginInfo } = await loadModule();
      // @thirdparty/plugin-weather — search by "plugin-weather"
      const info = await getPluginInfo("plugin-weather");
      expect(info).not.toBeNull();
      expect(info!.name).toBe("@thirdparty/plugin-weather");
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
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(fakeGeneratedRegistry()),
      }));
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

      expect(results.some((r) => r.name === "@elizaos/plugin-solana")).toBe(true);
    });

    it("matches on topics", async () => {
      const { searchPlugins } = await loadModule();
      const results = await searchPlugins("defi");

      expect(results.some((r) => r.name === "@elizaos/plugin-solana")).toBe(true);
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
});
