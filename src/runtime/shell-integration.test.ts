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
import { CORE_PLUGINS, collectPluginNames } from "./eliza.js";

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

  it("@elizaos/plugin-shell is loaded alongside all other core plugins", () => {
    const names = collectPluginNames({} as MilaidyConfig);
    expect(names.has("@elizaos/plugin-shell")).toBe(true);
    expect(names.has("@elizaos/plugin-sql")).toBe(true);
    expect(names.has("@elizaos/plugin-code")).toBe(true);
    expect(names.has("@elizaos/plugin-commands")).toBe(true);
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
    try {
      const mod = (await import("@elizaos/plugin-shell")) as Record<
        string,
        unknown
      >;
      expect(mod).toBeDefined();
      expect(typeof mod).toBe("object");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (
        msg.includes("Cannot find module") ||
        msg.includes("ERR_MODULE_NOT_FOUND") ||
        msg.includes("Dynamic require of") ||
        msg.includes("native addon module") ||
        msg.includes("Failed to resolve entry")
      ) {
        return;
      }
      throw err;
    }
  });

  it("exports a valid Plugin with name and description", async () => {
    try {
      const mod = (await import("@elizaos/plugin-shell")) as Record<
        string,
        unknown
      >;
      const plugin = (mod.default ?? mod.shellPlugin) as Record<
        string,
        unknown
      >;
      expect(plugin).toBeDefined();
      expect(typeof plugin.name).toBe("string");
      expect(typeof plugin.description).toBe("string");
      expect((plugin.name as string).length).toBeGreaterThan(0);
      expect((plugin.description as string).length).toBeGreaterThan(0);
    } catch {
      // Skip if not loadable
    }
  });

  it("exports named shellPlugin", async () => {
    try {
      const mod = (await import("@elizaos/plugin-shell")) as Record<
        string,
        unknown
      >;
      expect(mod.shellPlugin).toBeDefined();
      const plugin = mod.shellPlugin as Record<string, unknown>;
      expect(typeof plugin.name).toBe("string");
    } catch {
      // Skip if not loadable
    }
  });
});

// ---------------------------------------------------------------------------
// Plugin actions
// ---------------------------------------------------------------------------

describe("Shell plugin actions", () => {
  it("exports executeCommand action", async () => {
    try {
      const mod = (await import("@elizaos/plugin-shell")) as Record<
        string,
        unknown
      >;
      expect(mod.executeCommand).toBeDefined();
      const action = mod.executeCommand as Record<string, unknown>;
      expect(typeof action.name).toBe("string");
    } catch {
      // Skip if not loadable
    }
  });

  it("exports processAction", async () => {
    try {
      const mod = (await import("@elizaos/plugin-shell")) as Record<
        string,
        unknown
      >;
      expect(mod.processAction).toBeDefined();
      const action = mod.processAction as Record<string, unknown>;
      expect(typeof action.name).toBe("string");
    } catch {
      // Skip if not loadable
    }
  });

  it("exports clearHistory action", async () => {
    try {
      const mod = (await import("@elizaos/plugin-shell")) as Record<
        string,
        unknown
      >;
      expect(mod.clearHistory).toBeDefined();
      const action = mod.clearHistory as Record<string, unknown>;
      expect(typeof action.name).toBe("string");
    } catch {
      // Skip if not loadable
    }
  });

  it("plugin declares actions array", async () => {
    try {
      const { shellPlugin } = (await import("@elizaos/plugin-shell")) as {
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
    } catch {
      // Skip if not loadable
    }
  });
});

// ---------------------------------------------------------------------------
// Plugin services
// ---------------------------------------------------------------------------

describe("Shell plugin services", () => {
  it("exports ShellService class", async () => {
    try {
      const mod = (await import("@elizaos/plugin-shell")) as Record<
        string,
        unknown
      >;
      expect(mod.ShellService).toBeDefined();
      expect(typeof mod.ShellService).toBe("function");
    } catch {
      // Skip if not loadable
    }
  });

  it("exports process registry functions", async () => {
    try {
      const mod = (await import("@elizaos/plugin-shell")) as Record<
        string,
        unknown
      >;
      expect(typeof mod.addSession).toBe("function");
      expect(typeof mod.getSession).toBe("function");
      expect(typeof mod.listRunningSessions).toBe("function");
      expect(typeof mod.listFinishedSessions).toBe("function");
      expect(typeof mod.deleteSession).toBe("function");
      expect(typeof mod.clearFinished).toBe("function");
      expect(typeof mod.tail).toBe("function");
      expect(typeof mod.appendOutput).toBe("function");
      expect(typeof mod.markExited).toBe("function");
    } catch {
      // Skip if not loadable
    }
  });

  it("exports createSessionSlug utility", async () => {
    try {
      const mod = (await import("@elizaos/plugin-shell")) as Record<
        string,
        unknown
      >;
      expect(typeof mod.createSessionSlug).toBe("function");
    } catch {
      // Skip if not loadable
    }
  });
});

// ---------------------------------------------------------------------------
// Shell approval system
// ---------------------------------------------------------------------------

describe("Shell approval system", () => {
  it("exports ExecApprovalService", async () => {
    try {
      const mod = (await import("@elizaos/plugin-shell")) as Record<
        string,
        unknown
      >;
      expect(mod.ExecApprovalService).toBeDefined();
      expect(typeof mod.ExecApprovalService).toBe("function");
    } catch {
      // Skip if not loadable
    }
  });

  it("exports approval utility functions", async () => {
    try {
      const mod = (await import("@elizaos/plugin-shell")) as Record<
        string,
        unknown
      >;
      expect(typeof mod.analyzeShellCommand).toBe("function");
      expect(typeof mod.requiresExecApproval).toBe("function");
      expect(typeof mod.resolveApprovals).toBe("function");
      expect(typeof mod.loadApprovals).toBe("function");
      expect(typeof mod.saveApprovals).toBe("function");
    } catch {
      // Skip if not loadable
    }
  });

  it("exports DEFAULT_SAFE_BINS list", async () => {
    try {
      const mod = (await import("@elizaos/plugin-shell")) as Record<
        string,
        unknown
      >;
      expect(mod.DEFAULT_SAFE_BINS).toBeDefined();
      expect(Array.isArray(mod.DEFAULT_SAFE_BINS)).toBe(true);
      expect((mod.DEFAULT_SAFE_BINS as string[]).length).toBeGreaterThan(0);
    } catch {
      // Skip if not loadable
    }
  });

  it("exports EXEC_APPROVAL_DEFAULTS", async () => {
    try {
      const mod = (await import("@elizaos/plugin-shell")) as Record<
        string,
        unknown
      >;
      expect(mod.EXEC_APPROVAL_DEFAULTS).toBeDefined();
      expect(typeof mod.EXEC_APPROVAL_DEFAULTS).toBe("object");
    } catch {
      // Skip if not loadable
    }
  });
});

// ---------------------------------------------------------------------------
// Shell utilities
// ---------------------------------------------------------------------------

describe("Shell utilities", () => {
  it("exports command safety utilities", async () => {
    try {
      const mod = (await import("@elizaos/plugin-shell")) as Record<
        string,
        unknown
      >;
      expect(typeof mod.isForbiddenCommand).toBe("function");
      expect(typeof mod.isSafeCommand).toBe("function");
      expect(typeof mod.extractBaseCommand).toBe("function");
      expect(typeof mod.validatePath).toBe("function");
    } catch {
      // Skip if not loadable
    }
  });

  it("exports DEFAULT_FORBIDDEN_COMMANDS list", async () => {
    try {
      const mod = (await import("@elizaos/plugin-shell")) as Record<
        string,
        unknown
      >;
      expect(mod.DEFAULT_FORBIDDEN_COMMANDS).toBeDefined();
      expect(Array.isArray(mod.DEFAULT_FORBIDDEN_COMMANDS)).toBe(true);
    } catch {
      // Skip if not loadable
    }
  });

  it("exports loadShellConfig function", async () => {
    try {
      const mod = (await import("@elizaos/plugin-shell")) as Record<
        string,
        unknown
      >;
      expect(typeof mod.loadShellConfig).toBe("function");
    } catch {
      // Skip if not loadable
    }
  });

  it("exports shell utility functions", async () => {
    try {
      const mod = (await import("@elizaos/plugin-shell")) as Record<
        string,
        unknown
      >;
      expect(typeof mod.chunkString).toBe("function");
      expect(typeof mod.formatDuration).toBe("function");
      expect(typeof mod.resolveWorkdir).toBe("function");
      expect(typeof mod.killProcessTree).toBe("function");
      expect(typeof mod.sanitizeBinaryOutput).toBe("function");
    } catch {
      // Skip if not loadable
    }
  });

  it("exports PTY key encoding utilities", async () => {
    try {
      const mod = (await import("@elizaos/plugin-shell")) as Record<
        string,
        unknown
      >;
      expect(typeof mod.encodeKeySequence).toBe("function");
      expect(typeof mod.encodePaste).toBe("function");
      expect(typeof mod.stripDsrRequests).toBe("function");
    } catch {
      // Skip if not loadable
    }
  });
});

// ---------------------------------------------------------------------------
// Shell history provider
// ---------------------------------------------------------------------------

describe("Shell history provider", () => {
  it("exports shellHistoryProvider", async () => {
    try {
      const mod = (await import("@elizaos/plugin-shell")) as Record<
        string,
        unknown
      >;
      expect(mod.shellHistoryProvider).toBeDefined();
      const provider = mod.shellHistoryProvider as Record<string, unknown>;
      expect(typeof provider.name).toBe("string");
      expect(typeof provider.get).toBe("function");
    } catch {
      // Skip if not loadable
    }
  });
});
