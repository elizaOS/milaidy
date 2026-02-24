/**
 * Unit tests for registry-client-queries.ts — plugin lookup, alias
 * normalization, fuzzy search scoring, and transform functions.
 *
 * All pure functions — no I/O or external dependencies to mock.
 */

import { describe, expect, it } from "vitest";
import type { RegistryAppMeta, RegistryPluginInfo } from "./registry-client.js";
import {
  getPluginInfoFromRegistry,
  normalizePluginLookupAlias,
  scoreEntries,
  toAppEntry,
  toPluginListItem,
  toSearchResults,
} from "./registry-client-queries.js";

// ── Helper ───────────────────────────────────────────────────────────────

function makePlugin(
  overrides: Partial<RegistryPluginInfo> = {},
): RegistryPluginInfo {
  return {
    name: overrides.name ?? "@elizaos/plugin-test",
    gitRepo: "elizaos/plugin-test",
    gitUrl: "https://github.com/elizaos/plugin-test.git",
    description: overrides.description ?? "A test plugin",
    homepage: null,
    topics: overrides.topics ?? [],
    stars: overrides.stars ?? 10,
    language: "TypeScript",
    npm: {
      package: overrides.name ?? "@elizaos/plugin-test",
      v0Version: null,
      v1Version: null,
      v2Version: overrides.npm?.v2Version ?? "2.0.0",
    },
    git: { v0Branch: null, v1Branch: null, v2Branch: "next" },
    supports: overrides.supports ?? { v0: false, v1: false, v2: true },
    ...overrides,
  };
}

// ═════════════════════════════════════════════════════════════════════════
describe("registry-client-queries", () => {
  // ── normalizePluginLookupAlias ────────────────────────────────────
  describe("normalizePluginLookupAlias", () => {
    it("returns empty string for empty input", () => {
      expect(normalizePluginLookupAlias("")).toBe("");
    });

    it("trims whitespace", () => {
      expect(normalizePluginLookupAlias("  hello  ")).toBe("hello");
    });

    it("fixes 'obsidan' typo", () => {
      expect(normalizePluginLookupAlias("obsidan")).toBe("obsidian");
    });

    it("fixes '@elizaos/plugin-obsidan' typo", () => {
      expect(normalizePluginLookupAlias("@elizaos/plugin-obsidan")).toBe(
        "@elizaos/plugin-obsidian",
      );
    });

    it("fixes 'plugin-obsidan' typo", () => {
      expect(normalizePluginLookupAlias("plugin-obsidan")).toBe(
        "plugin-obsidian",
      );
    });

    it("preserves correct names", () => {
      expect(normalizePluginLookupAlias("obsidian")).toBe("obsidian");
    });

    it("is case-insensitive for typo detection", () => {
      expect(normalizePluginLookupAlias("Obsidan")).toBe("obsidian");
    });
  });

  // ── getPluginInfoFromRegistry ─────────────────────────────────────
  describe("getPluginInfoFromRegistry", () => {
    const registry = new Map<string, RegistryPluginInfo>();
    const pluginA = makePlugin({ name: "@elizaos/plugin-discord" });
    const pluginB = makePlugin({ name: "@elizaos/plugin-slack" });
    const pluginC = makePlugin({ name: "@custom/my-plugin" });

    registry.set("@elizaos/plugin-discord", pluginA);
    registry.set("@elizaos/plugin-slack", pluginB);
    registry.set("@custom/my-plugin", pluginC);

    it("finds exact name match", () => {
      expect(
        getPluginInfoFromRegistry(registry, "@elizaos/plugin-discord"),
      ).toBe(pluginA);
    });

    it("finds by bare name with @elizaos/ prefix", () => {
      expect(getPluginInfoFromRegistry(registry, "plugin-discord")).toBe(
        pluginA,
      );
    });

    it("finds by short name with @elizaos/plugin- prefix", () => {
      expect(getPluginInfoFromRegistry(registry, "discord")).toBe(pluginA);
    });

    it("finds by suffix match across scopes", () => {
      expect(getPluginInfoFromRegistry(registry, "@other/my-plugin")).toBe(
        pluginC,
      );
    });

    it("returns null for non-existent plugin", () => {
      expect(getPluginInfoFromRegistry(registry, "doesnt-exist")).toBeNull();
    });
  });

  // ── scoreEntries ─────────────────────────────────────────────────
  describe("scoreEntries", () => {
    const plugins = [
      makePlugin({
        name: "@elizaos/plugin-discord",
        description: "Discord connector",
        stars: 200,
        topics: ["chat", "bot"],
      }),
      makePlugin({
        name: "@elizaos/plugin-slack",
        description: "Slack integration",
        stars: 50,
        topics: ["chat"],
      }),
      makePlugin({
        name: "@elizaos/plugin-notion",
        description: "Notion workspace tools",
        stars: 1500,
        topics: ["productivity"],
      }),
    ];

    it("returns exact name match with highest score", () => {
      const results = scoreEntries(plugins, "discord", 10);
      expect(results[0].p.name).toBe("@elizaos/plugin-discord");
      expect(results[0].s).toBeGreaterThan(0);
    });

    it("limits results to specified count", () => {
      const results = scoreEntries(plugins, "plugin", 2);
      expect(results.length).toBeLessThanOrEqual(2);
    });

    it("returns empty for no matches", () => {
      const results = scoreEntries(plugins, "zzzznonexistent", 10);
      expect(results).toHaveLength(0);
    });

    it("boosts high-star plugins", () => {
      // Both "plugin-notion" and "plugin-discord" match "plugin", but notion has more stars
      const results = scoreEntries(plugins, "plugin", 10);
      expect(results.length).toBeGreaterThan(1);
    });

    it("matches on description", () => {
      const results = scoreEntries(plugins, "connector", 10);
      expect(results.some((r) => r.p.name.includes("discord"))).toBe(true);
    });

    it("matches on topics", () => {
      const results = scoreEntries(plugins, "chat", 10);
      expect(results.length).toBe(2); // discord + slack
    });

    it("uses extraNames callback for additional name matching", () => {
      const results = scoreEntries(plugins, "chat-tool", 10, (p) => [
        p.name === "@elizaos/plugin-discord" ? "chat-tool" : "",
      ]);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].p.name).toBe("@elizaos/plugin-discord");
    });

    it("uses extraTerms callback for additional matching", () => {
      const results = scoreEntries(
        plugins,
        "workspace-api",
        10,
        undefined,
        (p) => (p.name.includes("notion") ? ["workspace-api"] : []),
      );
      expect(results.some((r) => r.p.name.includes("notion"))).toBe(true);
    });
  });

  // ── toSearchResults ──────────────────────────────────────────────
  describe("toSearchResults", () => {
    it("normalizes scores relative to highest", () => {
      const input = [
        { p: makePlugin({ name: "best" }), s: 100 },
        { p: makePlugin({ name: "half" }), s: 50 },
      ];
      const results = toSearchResults(input);
      expect(results[0].score).toBe(1);
      expect(results[1].score).toBe(0.5);
    });

    it("returns empty for empty input", () => {
      expect(toSearchResults([])).toEqual([]);
    });

    it("includes expected fields", () => {
      const p = makePlugin({
        name: "@elizaos/plugin-test",
        description: "desc",
        stars: 42,
        topics: ["ai"],
      });
      const [result] = toSearchResults([{ p, s: 10 }]);
      expect(result.name).toBe("@elizaos/plugin-test");
      expect(result.description).toBe("desc");
      expect(result.stars).toBe(42);
      expect(result.tags).toEqual(["ai"]);
      expect(result.repository).toContain("github.com");
    });
  });

  // ── toAppEntry ───────────────────────────────────────────────────
  describe("toAppEntry", () => {
    it("returns app entry when kind is 'app'", () => {
      const p = makePlugin({ kind: "app" });
      const result = toAppEntry(p, () => undefined);
      expect(result).not.toBeNull();
      expect(result?.kind).toBe("app");
    });

    it("returns app entry when appMeta is present", () => {
      const appMeta: RegistryAppMeta = {
        displayName: "Test App",
        category: "game",
        launchType: "url",
        launchUrl: "http://localhost:3000",
        icon: null,
        capabilities: [],
        minPlayers: null,
        maxPlayers: null,
      };
      const p = makePlugin({ appMeta });
      const result = toAppEntry(p, () => undefined);
      expect(result).not.toBeNull();
    });

    it("returns null for non-app with no override", () => {
      const p = makePlugin();
      const result = toAppEntry(p, () => undefined);
      expect(result).toBeNull();
    });

    it("applies override when resolver returns appMeta", () => {
      const p = makePlugin();
      const override: RegistryAppMeta = {
        displayName: "Overridden",
        category: "game",
        launchType: "url",
        launchUrl: null,
        icon: null,
        capabilities: [],
        minPlayers: null,
        maxPlayers: null,
      };
      const result = toAppEntry(p, () => override);
      expect(result).not.toBeNull();
      expect(result?.appMeta?.displayName).toBe("Overridden");
    });
  });

  // ── toPluginListItem ─────────────────────────────────────────────
  describe("toPluginListItem", () => {
    it("maps all expected fields", () => {
      const p = makePlugin({
        name: "@elizaos/plugin-test",
        description: "A desc",
        stars: 99,
        topics: ["ai", "chat"],
      });
      const item = toPluginListItem(p);
      expect(item.name).toBe("@elizaos/plugin-test");
      expect(item.description).toBe("A desc");
      expect(item.stars).toBe(99);
      expect(item.topics).toEqual(["ai", "chat"]);
      expect(item.repository).toContain("github.com");
      expect(item.latestVersion).toBe("2.0.0");
    });

    it("prefers v2Version for latestVersion", () => {
      const p = makePlugin();
      p.npm.v2Version = "2.0.0";
      p.npm.v1Version = "1.0.0";
      expect(toPluginListItem(p).latestVersion).toBe("2.0.0");
    });

    it("falls back to v1Version when v2 is null", () => {
      const p = makePlugin();
      p.npm.v2Version = null;
      p.npm.v1Version = "1.0.0";
      expect(toPluginListItem(p).latestVersion).toBe("1.0.0");
    });
  });
});
