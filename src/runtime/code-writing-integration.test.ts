/**
 * Code writing plugin integration tests.
 *
 * Validates:
 * - Plugin classification (core — always loaded)
 * - Plugin module import and export shape
 * - Plugin actions (readFile, writeFile, editFile, executeShell, git, etc.)
 * - Plugin services (CoderService)
 * - Plugin provider (coderStatusProvider)
 * - Coding agent context system (Zod schemas, helpers)
 * - Workspace provider coding agent enrichment
 */

import { describe, expect, it } from "vitest";
import type { MiladyConfig } from "../config/config";
import { tryOptionalDynamicImport } from "../test-support/test-helpers";
import {
  CORE_PLUGINS,
  collectPluginNames,
  OPTIONAL_CORE_PLUGINS,
} from "./eliza";

async function loadCodePluginModule(): Promise<Record<string, unknown> | null> {
  return tryOptionalDynamicImport<Record<string, unknown>>(
    "@elizaos/plugin-code",
  );
}

async function withCodePlugin(
  run: (mod: Record<string, unknown>) => void | Promise<void>,
): Promise<void> {
  const mod = await loadCodePluginModule();
  if (!mod) return;
  await run(mod);
}

// ---------------------------------------------------------------------------
// Plugin classification — code is an optional plugin (admin-panel toggleable)
// ---------------------------------------------------------------------------

describe("Code writing plugin classification", () => {
  it("@elizaos/plugin-code is NOT in CORE_PLUGINS (optional)", () => {
    expect(CORE_PLUGINS).not.toContain("@elizaos/plugin-code");
  });

  it("@elizaos/plugin-code IS in OPTIONAL_CORE_PLUGINS", () => {
    expect(OPTIONAL_CORE_PLUGINS).toContain("@elizaos/plugin-code");
  });

  it("@elizaos/plugin-code is not loaded with empty config (optional)", () => {
    const names = collectPluginNames({} as MiladyConfig);
    expect(names.has("@elizaos/plugin-code")).toBe(false);
  });

  it("@elizaos/plugin-code loads when explicitly in plugins.installs", () => {
    const config = {
      plugins: {
        installs: {
          "@elizaos/plugin-code": {
            source: "npm",
            installPath: "/tmp/test",
            version: "1.0.0",
          },
        },
      },
    } as unknown as MiladyConfig;
    const names = collectPluginNames(config);
    expect(names.has("@elizaos/plugin-code")).toBe(true);
    expect(names.has("@elizaos/plugin-shell")).toBe(true);
    expect(names.has("@elizaos/plugin-sql")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Plugin module import — export shape
// ---------------------------------------------------------------------------

describe("Code writing plugin module", () => {
  it("can be dynamically imported without crashing", async () => {
    await withCodePlugin((mod) => {
      expect(mod).toBeDefined();
      expect(typeof mod).toBe("object");
    });
  });

  it("exports a valid Plugin with name and description", async () => {
    await withCodePlugin((mod) => {
      const plugin = (mod.default ?? mod.coderPlugin) as Record<
        string,
        unknown
      >;
      expect(plugin).toBeDefined();
      expect(typeof plugin.name).toBe("string");
      expect(typeof plugin.description).toBe("string");
      expect((plugin.name as string).length).toBeGreaterThan(0);
      expect((plugin.description as string).length).toBeGreaterThan(0);
    });
  });

  it("exports named coderPlugin", async () => {
    await withCodePlugin((mod) => {
      expect(mod.coderPlugin).toBeDefined();
      const plugin = mod.coderPlugin as Record<string, unknown>;
      expect(typeof plugin.name).toBe("string");
    });
  });
});

// ---------------------------------------------------------------------------
// Plugin actions — file and command operations
// ---------------------------------------------------------------------------

describe("Code writing plugin actions", () => {
  it("exports readFile action", async () => {
    await withCodePlugin((mod) => {
      expect(mod.readFile).toBeDefined();
      const action = mod.readFile as Record<string, unknown>;
      expect(typeof action.name).toBe("string");
    });
  });

  it("exports writeFile action", async () => {
    await withCodePlugin((mod) => {
      expect(mod.writeFile).toBeDefined();
      const action = mod.writeFile as Record<string, unknown>;
      expect(typeof action.name).toBe("string");
    });
  });

  it("exports editFile action", async () => {
    await withCodePlugin((mod) => {
      expect(mod.editFile).toBeDefined();
      const action = mod.editFile as Record<string, unknown>;
      expect(typeof action.name).toBe("string");
    });
  });

  it("exports executeShell action", async () => {
    await withCodePlugin((mod) => {
      expect(mod.executeShell).toBeDefined();
      const action = mod.executeShell as Record<string, unknown>;
      expect(typeof action.name).toBe("string");
    });
  });

  it("exports git action", async () => {
    await withCodePlugin((mod) => {
      expect(mod.git).toBeDefined();
      const action = mod.git as Record<string, unknown>;
      expect(typeof action.name).toBe("string");
    });
  });

  it("exports listFiles action", async () => {
    await withCodePlugin((mod) => {
      expect(mod.listFiles).toBeDefined();
      const action = mod.listFiles as Record<string, unknown>;
      expect(typeof action.name).toBe("string");
    });
  });

  it("exports searchFiles action", async () => {
    await withCodePlugin((mod) => {
      expect(mod.searchFiles).toBeDefined();
      const action = mod.searchFiles as Record<string, unknown>;
      expect(typeof action.name).toBe("string");
    });
  });

  it("exports changeDirectory action", async () => {
    await withCodePlugin((mod) => {
      expect(mod.changeDirectory).toBeDefined();
      const action = mod.changeDirectory as Record<string, unknown>;
      expect(typeof action.name).toBe("string");
    });
  });

  it("plugin declares actions array with all coding actions", async () => {
    await withCodePlugin((mod) => {
      const { coderPlugin } = mod as {
        coderPlugin: { actions?: Array<{ name: string }> };
      };
      if (coderPlugin.actions) {
        expect(Array.isArray(coderPlugin.actions)).toBe(true);
        expect(coderPlugin.actions.length).toBeGreaterThanOrEqual(8);
        for (const action of coderPlugin.actions) {
          expect(typeof action.name).toBe("string");
          expect(action.name.length).toBeGreaterThan(0);
        }
      }
    });
  });
});

// ---------------------------------------------------------------------------
// Plugin services
// ---------------------------------------------------------------------------

describe("Code writing plugin services", () => {
  it("exports CoderService class", async () => {
    await withCodePlugin((mod) => {
      expect(mod.CoderService).toBeDefined();
      expect(typeof mod.CoderService).toBe("function");
    });
  });

  it("exports configureCodingTools function", async () => {
    await withCodePlugin((mod) => {
      expect(typeof mod.configureCodingTools).toBe("function");
    });
  });
});

// ---------------------------------------------------------------------------
// Plugin provider
// ---------------------------------------------------------------------------

describe("Code writing plugin provider", () => {
  it("exports coderStatusProvider", async () => {
    await withCodePlugin((mod) => {
      expect(mod.coderStatusProvider).toBeDefined();
      const provider = mod.coderStatusProvider as Record<string, unknown>;
      expect(typeof provider.name).toBe("string");
      expect(typeof provider.get).toBe("function");
    });
  });
});
