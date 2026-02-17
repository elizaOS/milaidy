/**
 * Tests for the Milady skill catalog client.
 *
 * Exercises catalog loading, search scoring, pagination helpers,
 * and edge cases for missing/malformed data.
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// We dynamically import the module under test so we can reset module state
// between tests (the catalog client has module-level cache state).
// ---------------------------------------------------------------------------

async function loadModule() {
  return await import("./skill-catalog-client");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fakeCatalog() {
  return {
    data: [
      {
        slug: "seo-optimizer",
        displayName: "SEO Optimizer",
        summary:
          "Analyze HTML/CSS websites for SEO optimization and generate reports.",
        tags: { latest: "1.0.0" },
        stats: {
          comments: 1,
          downloads: 86,
          installsAllTime: 1,
          installsCurrent: 1,
          stars: 1,
          versions: 1,
        },
        createdAt: 1770429461623,
        updatedAt: 1770536125399,
        latestVersion: {
          version: "1.0.0",
          createdAt: 1770429461623,
          changelog: "Initial release.",
        },
      },
      {
        slug: "tavily-web-search",
        displayName: "Tavily Web Search",
        summary:
          "AI-optimized web search via Tavily API. Returns concise, relevant results.",
        tags: { latest: "1.0.0" },
        stats: {
          comments: 1,
          downloads: 138,
          installsAllTime: 1,
          installsCurrent: 1,
          stars: 0,
          versions: 1,
        },
        createdAt: 1770432534110,
        updatedAt: 1770535835936,
        latestVersion: {
          version: "1.0.0",
          createdAt: 1770432534110,
          changelog: "Initial release of Tavily web search skill.",
        },
      },
      {
        slug: "coding-agent",
        displayName: "Coding Agent",
        summary:
          "Run Codex CLI, Claude Code, or Pi Coding Agent via background process.",
        tags: { latest: "1.0.0" },
        stats: {
          comments: 1,
          downloads: 83,
          installsAllTime: 0,
          installsCurrent: 0,
          stars: 0,
          versions: 1,
        },
        createdAt: 1770431518503,
        updatedAt: 1770535927027,
        latestVersion: {
          version: "1.0.0",
          createdAt: 1770431518503,
          changelog: "Initial release of coding-agent skill.",
        },
      },
    ],
    cachedAt: Date.now(),
  };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let tmpDir: string;
let catalogPath: string;
let savedEnv: Record<string, string | undefined>;

beforeEach(async () => {
  vi.resetModules();

  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "milady-cat-test-"));
  catalogPath = path.join(tmpDir, "catalog.json");

  savedEnv = {
    MILADY_SKILLS_CATALOG: process.env.MILADY_SKILLS_CATALOG,
  };
  process.env.MILADY_SKILLS_CATALOG = catalogPath;
});

afterEach(async () => {
  process.env.MILADY_SKILLS_CATALOG = savedEnv.MILADY_SKILLS_CATALOG;
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("skill-catalog-client", () => {
  describe("getCatalogSkills", () => {
    it("loads skills from catalog file", async () => {
      await fs.writeFile(catalogPath, JSON.stringify(fakeCatalog()), "utf-8");

      const { getCatalogSkills } = await loadModule();
      const skills = await getCatalogSkills();

      expect(skills.length).toBe(3);
      expect(skills[0].slug).toBe("seo-optimizer");
      expect(skills[0].displayName).toBe("SEO Optimizer");
    });

    it("returns empty array when no catalog file exists", async () => {
      // Point env at a non-existent file — since MILADY_SKILLS_CATALOG is
      // set, the client won't fall back to other paths.
      process.env.MILADY_SKILLS_CATALOG = path.join(tmpDir, "nonexistent.json");

      const { getCatalogSkills } = await loadModule();
      const skills = await getCatalogSkills();

      expect(skills).toEqual([]);
    });

    it("uses memory cache on second call", async () => {
      await fs.writeFile(catalogPath, JSON.stringify(fakeCatalog()), "utf-8");

      const { getCatalogSkills } = await loadModule();
      const first = await getCatalogSkills();
      const second = await getCatalogSkills();

      expect(first).toBe(second); // Same array reference
    });
  });

  describe("getCatalogSkill", () => {
    it("finds skill by exact slug", async () => {
      await fs.writeFile(catalogPath, JSON.stringify(fakeCatalog()), "utf-8");

      const { getCatalogSkill } = await loadModule();
      const skill = await getCatalogSkill("tavily-web-search");

      expect(skill).not.toBeNull();
      expect(skill?.displayName).toBe("Tavily Web Search");
    });

    it("returns null for non-existent slug", async () => {
      await fs.writeFile(catalogPath, JSON.stringify(fakeCatalog()), "utf-8");

      const { getCatalogSkill } = await loadModule();
      const skill = await getCatalogSkill("nonexistent-skill");

      expect(skill).toBeNull();
    });
  });

  describe("searchCatalogSkills", () => {
    it("returns matching skills sorted by score", async () => {
      await fs.writeFile(catalogPath, JSON.stringify(fakeCatalog()), "utf-8");

      const { searchCatalogSkills } = await loadModule();
      const results = await searchCatalogSkills("SEO");

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].slug).toBe("seo-optimizer");
      expect(results[0].score).toBe(1); // Top result normalised to 1.0
    });

    it("matches on summary text", async () => {
      await fs.writeFile(catalogPath, JSON.stringify(fakeCatalog()), "utf-8");

      const { searchCatalogSkills } = await loadModule();
      const results = await searchCatalogSkills("web search");

      expect(results.some((r) => r.slug === "tavily-web-search")).toBe(true);
    });

    it("returns empty array for unmatched query", async () => {
      await fs.writeFile(catalogPath, JSON.stringify(fakeCatalog()), "utf-8");

      const { searchCatalogSkills } = await loadModule();
      const results = await searchCatalogSkills("zzzznonexistentzzzz");

      expect(results).toEqual([]);
    });

    it("respects limit parameter", async () => {
      await fs.writeFile(catalogPath, JSON.stringify(fakeCatalog()), "utf-8");

      const { searchCatalogSkills } = await loadModule();
      const results = await searchCatalogSkills("agent", 1);

      expect(results.length).toBe(1);
    });

    it("normalises scores between 0 and 1", async () => {
      await fs.writeFile(catalogPath, JSON.stringify(fakeCatalog()), "utf-8");

      const { searchCatalogSkills } = await loadModule();
      const results = await searchCatalogSkills("coding");

      for (const r of results) {
        expect(r.score).toBeGreaterThanOrEqual(0);
        expect(r.score).toBeLessThanOrEqual(1);
      }
    });
  });

  describe("refreshCatalog", () => {
    it("clears cache and re-reads file", async () => {
      await fs.writeFile(catalogPath, JSON.stringify(fakeCatalog()), "utf-8");

      const { getCatalogSkills, refreshCatalog } = await loadModule();
      const first = await getCatalogSkills();
      expect(first.length).toBe(3);

      // Modify the file
      const modified = fakeCatalog();
      modified.data.pop(); // Remove one skill
      await fs.writeFile(catalogPath, JSON.stringify(modified), "utf-8");

      // Should still return cached
      const cached = await getCatalogSkills();
      expect(cached.length).toBe(3);

      // Refresh should re-read
      const refreshed = await refreshCatalog();
      expect(refreshed.length).toBe(2);
    });
  });

  describe("getTrendingSkills", () => {
    it("returns skills sorted by downloads", async () => {
      await fs.writeFile(catalogPath, JSON.stringify(fakeCatalog()), "utf-8");

      const { getTrendingSkills } = await loadModule();
      const trending = await getTrendingSkills(2);

      expect(trending.length).toBe(2);
      // Tavily has 138 downloads, should be first
      expect(trending[0].slug).toBe("tavily-web-search");
    });

    it("respects limit", async () => {
      await fs.writeFile(catalogPath, JSON.stringify(fakeCatalog()), "utf-8");

      const { getTrendingSkills } = await loadModule();
      const trending = await getTrendingSkills(1);

      expect(trending.length).toBe(1);
    });
  });
});
