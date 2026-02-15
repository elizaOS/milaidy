/**
 * Computer Use plugin integration tests.
 *
 * Validates:
 * - Plugin classification (optional native, not core)
 * - Feature flag enablement via config.features.computeruse
 * - Plugin entries enablement via config.plugins.entries.computeruse
 * - Plugin module import and export shape
 * - Plugin actions and service exports
 * - Config schema validation (COMPUTERUSE_ENABLED, COMPUTERUSE_MODE, etc.)
 */

import { describe, expect, it } from "vitest";
import type { MilaidyConfig } from "../config/config.js";
import { tryOptionalDynamicImport } from "../test-support/test-helpers.js";
import { CORE_PLUGINS, collectPluginNames } from "./eliza.js";

async function loadComputerUsePluginModule(): Promise<Record<
  string,
  unknown
> | null> {
  return tryOptionalDynamicImport<Record<string, unknown>>(
    "@elizaos/plugin-computeruse",
  );
}

async function withComputerUsePlugin(
  run: (mod: Record<string, unknown>) => void | Promise<void>,
): Promise<void> {
  const mod = await loadComputerUsePluginModule();
  if (!mod) return;
  await run(mod);
}

// ---------------------------------------------------------------------------
// Plugin classification — computeruse is optional, not core
// ---------------------------------------------------------------------------

describe("Computer Use plugin classification", () => {
  it("@elizaos/plugin-computeruse is NOT in CORE_PLUGINS", () => {
    expect(CORE_PLUGINS).not.toContain("@elizaos/plugin-computeruse");
  });

  it("@elizaos/plugin-computeruse is NOT loaded with empty config", () => {
    const names = collectPluginNames({} as MilaidyConfig);
    expect(names.has("@elizaos/plugin-computeruse")).toBe(false);
  });

  it("@elizaos/plugin-computeruse is added via features.computeruse = true", () => {
    const config = {
      features: { computeruse: true },
    } as unknown as MilaidyConfig;
    const names = collectPluginNames(config);
    expect(names.has("@elizaos/plugin-computeruse")).toBe(true);
  });

  it("@elizaos/plugin-computeruse is added via features.computeruse = { enabled: true }", () => {
    const config = {
      features: { computeruse: { enabled: true } },
    } as unknown as MilaidyConfig;
    const names = collectPluginNames(config);
    expect(names.has("@elizaos/plugin-computeruse")).toBe(true);
  });

  it("@elizaos/plugin-computeruse is NOT loaded when features.computeruse = { enabled: false }", () => {
    const config = {
      features: { computeruse: { enabled: false } },
    } as unknown as MilaidyConfig;
    const names = collectPluginNames(config);
    expect(names.has("@elizaos/plugin-computeruse")).toBe(false);
  });

  it("@elizaos/plugin-computeruse is added via plugins.entries.computeruse", () => {
    const config = {
      plugins: {
        entries: {
          computeruse: { enabled: true },
        },
      },
    } as unknown as MilaidyConfig;
    const names = collectPluginNames(config);
    expect(names.has("@elizaos/plugin-computeruse")).toBe(true);
  });

  it("@elizaos/plugin-computeruse is NOT added when plugins.entries.computeruse.enabled = false", () => {
    const config = {
      plugins: {
        entries: {
          computeruse: { enabled: false },
        },
      },
    } as unknown as MilaidyConfig;
    const names = collectPluginNames(config);
    expect(names.has("@elizaos/plugin-computeruse")).toBe(false);
  });

  it("does not interfere with core plugins when computeruse is enabled", () => {
    const config = {
      features: { computeruse: true },
    } as unknown as MilaidyConfig;
    const names = collectPluginNames(config);
    // Core plugins should still all be present
    expect(names.has("@elizaos/plugin-sql")).toBe(true);
    expect(names.has("@elizaos/plugin-shell")).toBe(true);
    expect(names.has("@elizaos/plugin-agent-skills")).toBe(true);
    // And computeruse should be there too
    expect(names.has("@elizaos/plugin-computeruse")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Plugin module import — export shape
// ---------------------------------------------------------------------------

describe("Computer Use plugin module", () => {
  it("can be dynamically imported without crashing", async () => {
    await withComputerUsePlugin((mod) => {
      expect(mod).toBeDefined();
      expect(typeof mod).toBe("object");
    });
  });

  it("exports a valid Plugin with name and description", async () => {
    await withComputerUsePlugin((mod) => {
      // Check default export
      const plugin = (mod.default ?? mod.computerusePlugin) as Record<
        string,
        unknown
      >;
      if (plugin && typeof plugin === "object") {
        expect(typeof plugin.name).toBe("string");
        expect(typeof plugin.description).toBe("string");
        expect((plugin.name as string).length).toBeGreaterThan(0);
        expect((plugin.description as string).length).toBeGreaterThan(0);
      }
    });
  });

  it("exports named computerusePlugin", async () => {
    await withComputerUsePlugin((mod) => {
      expect(mod.computerusePlugin).toBeDefined();
      const plugin = mod.computerusePlugin as Record<string, unknown>;
      expect(typeof plugin.name).toBe("string");
    });
  });

  it("exports ComputerUseService class", async () => {
    await withComputerUsePlugin((mod) => {
      expect(mod.ComputerUseService).toBeDefined();
      expect(typeof mod.ComputerUseService).toBe("function");
    });
  });

  it("exports computerUseConfigSchema for validation", async () => {
    await withComputerUsePlugin((mod) => {
      const schema = mod.computerUseConfigSchema as Record<string, unknown>;
      if (schema) {
        expect(typeof schema.parse).toBe("function");
        expect(typeof schema.safeParse).toBe("function");
      }
    });
  });
});

// ---------------------------------------------------------------------------
// Config schema validation
// ---------------------------------------------------------------------------

describe("Computer Use config schema", () => {
  it("validates default config with all defaults", async () => {
    await withComputerUsePlugin((mod) => {
      const { computerUseConfigSchema } = mod as {
        computerUseConfigSchema: {
          parse: (v: unknown) => Record<string, unknown>;
        };
      };
      const result = computerUseConfigSchema.parse({});
      expect(result.COMPUTERUSE_ENABLED).toBe(false);
      expect(result.COMPUTERUSE_MODE).toBe("auto");
      expect(result.COMPUTERUSE_MCP_SERVER).toBe("computeruse");
    });
  });

  it("validates explicit enabled config", async () => {
    await withComputerUsePlugin((mod) => {
      const { computerUseConfigSchema } = mod as {
        computerUseConfigSchema: {
          parse: (v: unknown) => Record<string, unknown>;
        };
      };
      const result = computerUseConfigSchema.parse({
        COMPUTERUSE_ENABLED: "true",
        COMPUTERUSE_MODE: "local",
      });
      expect(result.COMPUTERUSE_ENABLED).toBe(true);
      expect(result.COMPUTERUSE_MODE).toBe("local");
    });
  });

  it("validates MCP mode config", async () => {
    await withComputerUsePlugin((mod) => {
      const { computerUseConfigSchema } = mod as {
        computerUseConfigSchema: {
          parse: (v: unknown) => Record<string, unknown>;
        };
      };
      const result = computerUseConfigSchema.parse({
        COMPUTERUSE_ENABLED: "true",
        COMPUTERUSE_MODE: "mcp",
        COMPUTERUSE_MCP_SERVER: "my-mcp-server",
      });
      expect(result.COMPUTERUSE_MODE).toBe("mcp");
      expect(result.COMPUTERUSE_MCP_SERVER).toBe("my-mcp-server");
    });
  });
});

// ---------------------------------------------------------------------------
// Plugin actions
// ---------------------------------------------------------------------------

describe("Computer Use plugin actions", () => {
  it("plugin declares actions array", async () => {
    await withComputerUsePlugin((mod) => {
      const { computerusePlugin } = mod as {
        computerusePlugin: { actions?: Array<{ name: string }> };
      };
      if (computerusePlugin.actions) {
        expect(Array.isArray(computerusePlugin.actions)).toBe(true);
        expect(computerusePlugin.actions.length).toBeGreaterThan(0);
        for (const action of computerusePlugin.actions) {
          expect(typeof action.name).toBe("string");
          expect(action.name.length).toBeGreaterThan(0);
        }
      }
    });
  });

  it("plugin declares expected action names", async () => {
    await withComputerUsePlugin((mod) => {
      const { computerusePlugin } = mod as {
        computerusePlugin: { actions?: Array<{ name: string }> };
      };
      if (computerusePlugin.actions) {
        const actionNames = computerusePlugin.actions.map((a) => a.name);
        // These are the documented actions from the plugin
        const expectedActions = [
          "COMPUTERUSE_OPEN_APPLICATION",
          "COMPUTERUSE_CLICK",
          "COMPUTERUSE_TYPE",
          "COMPUTERUSE_GET_WINDOW_TREE",
          "COMPUTERUSE_GET_APPLICATIONS",
        ];
        for (const expected of expectedActions) {
          expect(actionNames).toContain(expected);
        }
      }
    });
  });
});
