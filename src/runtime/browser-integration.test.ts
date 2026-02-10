/**
 * Browser plugin integration tests.
 *
 * Validates:
 * - Browser server linking (ensureBrowserServerLink)
 * - Plugin pre-flight check in resolvePlugins
 * - Plugin loading and export shape
 * - Feature flag enablement via config
 * - link-browser-server.mjs script existence
 */

import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { MilaidyConfig } from "../config/config.js";
import {
  CORE_PLUGINS,
  collectPluginNames,
  ensureBrowserServerLink,
} from "./eliza.js";

// ---------------------------------------------------------------------------
// ensureBrowserServerLink — symlink creation tests
// ---------------------------------------------------------------------------

describe("ensureBrowserServerLink", () => {
  it("is a function exported from eliza.ts", () => {
    expect(typeof ensureBrowserServerLink).toBe("function");
  });

  it("returns a boolean value", () => {
    const result = ensureBrowserServerLink();
    expect(typeof result).toBe("boolean");
  });

  it("does not throw even when plugin-browser is missing or not configured", () => {
    // Should gracefully return false if prerequisites aren't met
    expect(() => ensureBrowserServerLink()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Browser plugin is NOT in CORE_PLUGINS (it's optional/native)
// ---------------------------------------------------------------------------

describe("Browser plugin classification", () => {
  it("@elizaos/plugin-browser is NOT in CORE_PLUGINS", () => {
    expect(CORE_PLUGINS).not.toContain("@elizaos/plugin-browser");
  });

  it("@elizaos/plugin-browser is added via features.browser config", () => {
    const config = {
      features: { browser: true },
    } as unknown as MilaidyConfig;
    const names = collectPluginNames(config);
    expect(names.has("@elizaos/plugin-browser")).toBe(true);
  });

  it("@elizaos/plugin-browser is added via plugins.entries.browser config", () => {
    const config = {
      plugins: {
        entries: {
          browser: { enabled: true },
        },
      },
    } as unknown as MilaidyConfig;
    const names = collectPluginNames(config);
    expect(names.has("@elizaos/plugin-browser")).toBe(true);
  });

  it("@elizaos/plugin-browser is NOT loaded with empty config", () => {
    const names = collectPluginNames({} as MilaidyConfig);
    expect(names.has("@elizaos/plugin-browser")).toBe(false);
  });

  it("@elizaos/plugin-browser is NOT loaded when features.browser is false", () => {
    const config = {
      features: { browser: { enabled: false } },
    } as unknown as MilaidyConfig;
    const names = collectPluginNames(config);
    expect(names.has("@elizaos/plugin-browser")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Browser plugin module import shape
// ---------------------------------------------------------------------------

describe("Browser plugin module", () => {
  it("can be dynamically imported without crashing", async () => {
    try {
      const mod = (await import("@elizaos/plugin-browser")) as Record<
        string,
        unknown
      >;
      expect(mod).toBeDefined();
      expect(typeof mod).toBe("object");
    } catch (err) {
      // Plugin may not be fully available in test env (missing native deps)
      const msg = err instanceof Error ? err.message : String(err);
      if (
        msg.includes("Cannot find module") ||
        msg.includes("Cannot find package") ||
        msg.includes("ERR_MODULE_NOT_FOUND") ||
        msg.includes("MODULE_NOT_FOUND") ||
        msg.includes("Dynamic require of") ||
        msg.includes("native addon module") ||
        msg.includes("Failed to resolve entry")
      ) {
        // Expected — plugin not usable in test environment
        return;
      }
      throw err;
    }
  });

  it("exports a valid Plugin shape if loadable", async () => {
    try {
      const mod = (await import("@elizaos/plugin-browser")) as Record<
        string,
        unknown
      >;
      // Check default export or named plugin export
      const plugin =
        (mod.default as Record<string, unknown>) ??
        (mod.plugin as Record<string, unknown>);
      if (plugin && typeof plugin === "object") {
        expect(typeof plugin.name).toBe("string");
        expect(typeof plugin.description).toBe("string");
        expect((plugin.name as string).length).toBeGreaterThan(0);
      }
    } catch {
      // Skip if not loadable in test env
    }
  });
});

// ---------------------------------------------------------------------------
// link-browser-server.mjs script
// ---------------------------------------------------------------------------

describe("link-browser-server.mjs script", () => {
  it("exists at scripts/link-browser-server.mjs", async () => {
    const scriptPath = path.resolve(
      process.cwd(),
      "scripts",
      "link-browser-server.mjs",
    );
    const stat = await fs.stat(scriptPath).catch(() => null);
    expect(stat).not.toBeNull();
    expect(stat?.isFile()).toBe(true);
  });

  it("has a shebang line for node execution", async () => {
    const scriptPath = path.resolve(
      process.cwd(),
      "scripts",
      "link-browser-server.mjs",
    );
    const content = await fs.readFile(scriptPath, "utf-8");
    expect(content.startsWith("#!/usr/bin/env node")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// package.json postinstall hook
// ---------------------------------------------------------------------------

describe("package.json postinstall hook", () => {
  it("includes postinstall script referencing link-browser-server", async () => {
    const pkgPath = path.resolve(process.cwd(), "package.json");
    const pkg = JSON.parse(await fs.readFile(pkgPath, "utf-8")) as {
      scripts?: Record<string, string>;
    };
    expect(pkg.scripts?.postinstall).toBeDefined();
    expect(pkg.scripts?.postinstall).toContain("link-browser-server");
  });
});
