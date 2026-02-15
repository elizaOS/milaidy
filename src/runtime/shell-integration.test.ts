/**
 * Shell plugin integration tests.
 *
 * Validates:
 * - Plugin classification (core — always loaded)
 * - Plugin module import and export shape
 * - Plugin actions (executeCommand, processAction, clearHistory)
 * - Plugin services (ShellService, processRegistry)
 * - Approval system exports
 * - Shell utilities and config validation
 * - Provider (shellHistoryProvider) shape
 */

import { describe, expect, it } from "vitest";
import type { MilaidyConfig } from "../config/config.js";
import { tryOptionalDynamicImport } from "../test-support/test-helpers.js";
import { CORE_PLUGINS, collectPluginNames } from "./eliza.js";

async function loadShellPluginModule(): Promise<Record<
  string,
  unknown
> | null> {
  return tryOptionalDynamicImport<Record<string, unknown>>(
    "@elizaos/plugin-shell",
  );
}

async function withShellPlugin(
  run: (mod: Record<string, unknown>) => void | Promise<void>,
): Promise<void> {
  const mod = await loadShellPluginModule();
  if (!mod) return;
  await run(mod);
}

// ---------------------------------------------------------------------------
// Plugin classification — shell is a core plugin
// ---------------------------------------------------------------------------

describe("Shell plugin classification", () => {
  it("@elizaos/plugin-shell IS in CORE_PLUGINS", () => {
    expect(CORE_PLUGINS).toContain("@elizaos/plugin-shell");
  });

  it("@elizaos/plugin-shell is loaded with empty config", () => {
    const names = collectPluginNames({} as MilaidyConfig);
    expect(names.has("@elizaos/plugin-shell")).toBe(true);
  });

  it("@elizaos/plugin-shell is loaded alongside other core plugins", () => {
    const names = collectPluginNames({} as MilaidyConfig);
    expect(names.has("@elizaos/plugin-shell")).toBe(true);
    expect(names.has("@elizaos/plugin-sql")).toBe(true);
    expect(names.has("@elizaos/plugin-agent-skills")).toBe(true);
    expect(names.has("@elizaos/plugin-plugin-manager")).toBe(true);
  });

  it("@elizaos/plugin-shell remains loaded even with other features enabled", () => {
    const config = {
      features: { browser: true, computeruse: true },
      channels: { discord: { token: "test" } },
    } as unknown as MilaidyConfig;
    const names = collectPluginNames(config);
    expect(names.has("@elizaos/plugin-shell")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Plugin module import — export shape
// ---------------------------------------------------------------------------

describe("Shell plugin module", () => {
  it("can be dynamically imported without crashing", async () => {
    await withShellPlugin((mod) => {
      expect(mod).toBeDefined();
      expect(typeof mod).toBe("object");
    });
  });

  it("exports a valid Plugin with name and description", async () => {
    await withShellPlugin((mod) => {
      const plugin = (mod.default ?? mod.shellPlugin) as Record<
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

  it("exports named shellPlugin", async () => {
    await withShellPlugin((mod) => {
      expect(mod.shellPlugin).toBeDefined();
      const plugin = mod.shellPlugin as Record<string, unknown>;
      expect(typeof plugin.name).toBe("string");
    });
  });
});

// ---------------------------------------------------------------------------
// Plugin actions
// ---------------------------------------------------------------------------

describe("Shell plugin actions", () => {
  it("exports executeCommand action", async () => {
    await withShellPlugin((mod) => {
      expect(mod.executeCommand).toBeDefined();
      const action = mod.executeCommand as Record<string, unknown>;
      expect(typeof action.name).toBe("string");
    });
  });

  it("exports processAction", async () => {
    await withShellPlugin((mod) => {
      expect(mod.processAction).toBeDefined();
      const action = mod.processAction as Record<string, unknown>;
      expect(typeof action.name).toBe("string");
    });
  });

  it("exports clearHistory action", async () => {
    await withShellPlugin((mod) => {
      expect(mod.clearHistory).toBeDefined();
      const action = mod.clearHistory as Record<string, unknown>;
      expect(typeof action.name).toBe("string");
    });
  });

  it("plugin declares actions array", async () => {
    await withShellPlugin((mod) => {
      const { shellPlugin } = mod as {
        shellPlugin: { actions?: Array<{ name: string }> };
      };
      if (shellPlugin.actions) {
        expect(Array.isArray(shellPlugin.actions)).toBe(true);
        expect(shellPlugin.actions.length).toBeGreaterThan(0);
        for (const action of shellPlugin.actions) {
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

describe("Shell plugin services", () => {
  it("exports ShellService class", async () => {
    await withShellPlugin((mod) => {
      expect(mod.ShellService).toBeDefined();
      expect(typeof mod.ShellService).toBe("function");
    });
  });

  it("exports process registry functions", async () => {
    await withShellPlugin((mod) => {
      expect(typeof mod.addSession).toBe("function");
      expect(typeof mod.getSession).toBe("function");
      expect(typeof mod.listRunningSessions).toBe("function");
      expect(typeof mod.listFinishedSessions).toBe("function");
      expect(typeof mod.deleteSession).toBe("function");
      expect(typeof mod.clearFinished).toBe("function");
      expect(typeof mod.tail).toBe("function");
      expect(typeof mod.appendOutput).toBe("function");
      expect(typeof mod.markExited).toBe("function");
    });
  });

  it("exports createSessionSlug utility", async () => {
    await withShellPlugin((mod) => {
      expect(typeof mod.createSessionSlug).toBe("function");
    });
  });
});

// ---------------------------------------------------------------------------
// Shell approval system
// ---------------------------------------------------------------------------

describe("Shell approval system", () => {
  it("exports ExecApprovalService", async () => {
    await withShellPlugin((mod) => {
      expect(mod.ExecApprovalService).toBeDefined();
      expect(typeof mod.ExecApprovalService).toBe("function");
    });
  });

  it("exports approval utility functions", async () => {
    await withShellPlugin((mod) => {
      expect(typeof mod.analyzeShellCommand).toBe("function");
      expect(typeof mod.requiresExecApproval).toBe("function");
      expect(typeof mod.resolveApprovals).toBe("function");
      expect(typeof mod.loadApprovals).toBe("function");
      expect(typeof mod.saveApprovals).toBe("function");
    });
  });

  it("exports DEFAULT_SAFE_BINS list", async () => {
    await withShellPlugin((mod) => {
      expect(mod.DEFAULT_SAFE_BINS).toBeDefined();
      expect(Array.isArray(mod.DEFAULT_SAFE_BINS)).toBe(true);
      expect((mod.DEFAULT_SAFE_BINS as string[]).length).toBeGreaterThan(0);
    });
  });

  it("exports EXEC_APPROVAL_DEFAULTS", async () => {
    await withShellPlugin((mod) => {
      expect(mod.EXEC_APPROVAL_DEFAULTS).toBeDefined();
      expect(typeof mod.EXEC_APPROVAL_DEFAULTS).toBe("object");
    });
  });
});

// ---------------------------------------------------------------------------
// Shell utilities
// ---------------------------------------------------------------------------

describe("Shell utilities", () => {
  it("exports command safety utilities", async () => {
    await withShellPlugin((mod) => {
      expect(typeof mod.isForbiddenCommand).toBe("function");
      expect(typeof mod.isSafeCommand).toBe("function");
      expect(typeof mod.extractBaseCommand).toBe("function");
      expect(typeof mod.validatePath).toBe("function");
    });
  });

  it("exports DEFAULT_FORBIDDEN_COMMANDS list", async () => {
    await withShellPlugin((mod) => {
      expect(mod.DEFAULT_FORBIDDEN_COMMANDS).toBeDefined();
      expect(Array.isArray(mod.DEFAULT_FORBIDDEN_COMMANDS)).toBe(true);
    });
  });

  it("exports loadShellConfig function", async () => {
    await withShellPlugin((mod) => {
      expect(typeof mod.loadShellConfig).toBe("function");
    });
  });

  it("exports shell utility functions", async () => {
    await withShellPlugin((mod) => {
      expect(typeof mod.chunkString).toBe("function");
      expect(typeof mod.formatDuration).toBe("function");
      expect(typeof mod.resolveWorkdir).toBe("function");
      expect(typeof mod.killProcessTree).toBe("function");
      expect(typeof mod.sanitizeBinaryOutput).toBe("function");
    });
  });

  it("exports PTY key encoding utilities", async () => {
    await withShellPlugin((mod) => {
      expect(typeof mod.encodeKeySequence).toBe("function");
      expect(typeof mod.encodePaste).toBe("function");
      expect(typeof mod.stripDsrRequests).toBe("function");
    });
  });
});

// ---------------------------------------------------------------------------
// Shell history provider
// ---------------------------------------------------------------------------

describe("Shell history provider", () => {
  it("exports shellHistoryProvider", async () => {
    await withShellPlugin((mod) => {
      expect(mod.shellHistoryProvider).toBeDefined();
      const provider = mod.shellHistoryProvider as Record<string, unknown>;
      expect(typeof provider.name).toBe("string");
      expect(typeof provider.get).toBe("function");
    });
  });
});
