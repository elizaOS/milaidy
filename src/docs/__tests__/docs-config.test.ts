import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const DOCS_DIR = join(__dirname, "..", "..", "..", "docs");
const raw = readFileSync(join(DOCS_DIR, "docs.json"), "utf8");
const config = JSON.parse(raw);

function collectPagesFromTab(tab: {
  groups?: unknown;
  pages?: unknown;
}): string[] {
  const groupedPages = Array.isArray(tab.groups)
    ? tab.groups.flatMap((group) => {
        const pages = (group as { pages?: unknown }).pages;
        return Array.isArray(pages) ? pages : [];
      })
    : [];
  const directPages = Array.isArray(tab.pages) ? tab.pages : [];
  return [...groupedPages, ...directPages];
}

describe("docs/docs.json", () => {
  it("parses as valid JSON", () => {
    expect(config).toBeDefined();
    expect(typeof config).toBe("object");
  });

  it("has required top-level keys", () => {
    expect(config.name).toBe("Milady");
    expect(config.theme).toBe("mint");
    expect(config.colors).toBeDefined();
    expect(config.colors.primary).toBe("#4a7c59");
    expect(config.favicon).toBeDefined();
    expect(config.logo).toBeDefined();
    expect(config.navigation).toBeDefined();
  });

  it("has at least one navigation tab with grouped or direct pages", () => {
    const tabs = config.navigation.tabs;
    expect(Array.isArray(tabs)).toBe(true);
    expect(tabs.length).toBeGreaterThan(0);

    for (const tab of tabs) {
      expect(tab.tab).toBeDefined();
      const hasPages = collectPagesFromTab(tab).length > 0;
      const hasHref =
        typeof (tab as { href?: unknown }).href === "string" &&
        (tab as { href: string }).href.length > 0;
      expect(hasPages || hasHref).toBe(true);
    }
  });

  it("references only pages that exist as files", () => {
    const tabs = config.navigation.tabs;
    const missing: string[] = [];

    for (const tab of tabs) {
      for (const page of collectPagesFromTab(tab)) {
        const mdx = join(DOCS_DIR, `${page}.mdx`);
        const md = join(DOCS_DIR, `${page}.md`);
        if (!existsSync(mdx) && !existsSync(md)) {
          missing.push(page);
        }
      }
    }

    expect(missing).toEqual([]);
  });

  it("references favicon and logo files that exist", () => {
    const favicon = join(DOCS_DIR, config.favicon.replace(/^\//, ""));
    expect(existsSync(favicon)).toBe(true);

    const lightLogo = join(DOCS_DIR, config.logo.light.replace(/^\//, ""));
    const darkLogo = join(DOCS_DIR, config.logo.dark.replace(/^\//, ""));
    expect(existsSync(lightLogo)).toBe(true);
    expect(existsSync(darkLogo)).toBe(true);
  });
});

describe("docs page frontmatter", () => {
  // Derive pages from docs.json so the list never goes stale
  const allPages: string[] = [];
  for (const tab of config.navigation.tabs) {
    allPages.push(...collectPagesFromTab(tab));
  }

  for (const page of allPages) {
    it(`${page} has YAML frontmatter with title`, () => {
      const mdx = join(DOCS_DIR, `${page}.mdx`);
      const md = join(DOCS_DIR, `${page}.md`);
      const filePath = existsSync(mdx) ? mdx : md;
      const content = readFileSync(filePath, "utf8");

      expect(content.startsWith("---")).toBe(true);
      expect(content).toMatch(/^---\n[\s\S]*?title:\s*.+[\s\S]*?---/);
    });
  }
});
