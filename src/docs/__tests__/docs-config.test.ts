import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const DOCS_DIR = join(__dirname, "..", "..", "..", "docs");

describe("docs/docs.json", () => {
  const raw = readFileSync(join(DOCS_DIR, "docs.json"), "utf8");
  const config = JSON.parse(raw);

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

  it("has at least one navigation tab with groups", () => {
    const tabs = config.navigation.tabs;
    expect(Array.isArray(tabs)).toBe(true);
    expect(tabs.length).toBeGreaterThan(0);

    for (const tab of tabs) {
      expect(tab.tab).toBeDefined();
      expect(Array.isArray(tab.groups)).toBe(true);
      expect(tab.groups.length).toBeGreaterThan(0);
    }
  });

  it("references only pages that exist as files", () => {
    const tabs = config.navigation.tabs;
    const missing: string[] = [];

    for (const tab of tabs) {
      for (const group of tab.groups) {
        for (const page of group.pages) {
          const mdx = join(DOCS_DIR, `${page}.mdx`);
          const md = join(DOCS_DIR, `${page}.md`);
          if (!existsSync(mdx) && !existsSync(md)) {
            missing.push(page);
          }
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
  const mdxPages = [
    "index",
    "installation",
    "quickstart",
    "configuration",
    "cli-reference",
    "chat-commands",
    "model-providers",
    "architecture",
    "api-reference",
    "websocket-events",
    "config-schema",
    "deployment",
    "self-updates",
  ];

  const guidePages = [
    "guides/contributing",
    "guides/plugin-development",
    "guides/skills",
    "guides/registry",
    "guides/local-plugins",
    "guides/dashboard",
    "guides/desktop-app",
    "guides/mobile-app",
    "guides/chrome-extension",
    "guides/themes",
    "guides/agent-export",
    "guides/autonomous-mode",
    "guides/custom-actions",
    "guides/triggers",
    "guides/hooks",
    "guides/knowledge",
    "guides/media-generation",
    "guides/wallet",
    "guides/sandbox",
    "guides/cloud",
    "guides/training",
    "guides/connectors",
    "guides/whatsapp",
    "guides/plugin-eject",
  ];

  for (const page of [...mdxPages, ...guidePages]) {
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
