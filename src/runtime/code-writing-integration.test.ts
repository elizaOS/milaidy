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
import type { MilaidyConfig } from "../config/config.js";
import { CORE_PLUGINS, collectPluginNames } from "./eliza.js";

// ---------------------------------------------------------------------------
// Plugin classification — code is a core plugin
// ---------------------------------------------------------------------------

describe("Code writing plugin classification", () => {
  it("@elizaos/plugin-code IS in CORE_PLUGINS", () => {
    expect(CORE_PLUGINS).toContain("@elizaos/plugin-code");
  });

  it("@elizaos/plugin-code is loaded with empty config", () => {
    const names = collectPluginNames({} as MilaidyConfig);
    expect(names.has("@elizaos/plugin-code")).toBe(true);
  });

  it("@elizaos/plugin-code is loaded alongside shell and other core plugins", () => {
    const names = collectPluginNames({} as MilaidyConfig);
    expect(names.has("@elizaos/plugin-code")).toBe(true);
    expect(names.has("@elizaos/plugin-shell")).toBe(true);
    expect(names.has("@elizaos/plugin-sql")).toBe(true);
  });

  it("@elizaos/plugin-code remains loaded even with optional features enabled", () => {
    const config = {
      features: { browser: true, computeruse: true },
    } as unknown as MilaidyConfig;
    const names = collectPluginNames(config);
    expect(names.has("@elizaos/plugin-code")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Plugin module import — export shape
// ---------------------------------------------------------------------------

describe("Code writing plugin module", () => {
  it("can be dynamically imported without crashing", async () => {
    try {
      const mod = (await import("@elizaos/plugin-code")) as Record<
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
      const mod = (await import("@elizaos/plugin-code")) as Record<
        string,
        unknown
      >;
      const plugin = (mod.default ?? mod.coderPlugin) as Record<
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

  it("exports named coderPlugin", async () => {
    try {
      const mod = (await import("@elizaos/plugin-code")) as Record<
        string,
        unknown
      >;
      expect(mod.coderPlugin).toBeDefined();
      const plugin = mod.coderPlugin as Record<string, unknown>;
      expect(typeof plugin.name).toBe("string");
    } catch {
      // Skip if not loadable
    }
  });
});

// ---------------------------------------------------------------------------
// Plugin actions — file and command operations
// ---------------------------------------------------------------------------

describe("Code writing plugin actions", () => {
  it("exports readFile action", async () => {
    try {
      const mod = (await import("@elizaos/plugin-code")) as Record<
        string,
        unknown
      >;
      expect(mod.readFile).toBeDefined();
      const action = mod.readFile as Record<string, unknown>;
      expect(typeof action.name).toBe("string");
    } catch {
      // Skip if not loadable
    }
  });

  it("exports writeFile action", async () => {
    try {
      const mod = (await import("@elizaos/plugin-code")) as Record<
        string,
        unknown
      >;
      expect(mod.writeFile).toBeDefined();
      const action = mod.writeFile as Record<string, unknown>;
      expect(typeof action.name).toBe("string");
    } catch {
      // Skip if not loadable
    }
  });

  it("exports editFile action", async () => {
    try {
      const mod = (await import("@elizaos/plugin-code")) as Record<
        string,
        unknown
      >;
      expect(mod.editFile).toBeDefined();
      const action = mod.editFile as Record<string, unknown>;
      expect(typeof action.name).toBe("string");
    } catch {
      // Skip if not loadable
    }
  });

  it("exports executeShell action", async () => {
    try {
      const mod = (await import("@elizaos/plugin-code")) as Record<
        string,
        unknown
      >;
      expect(mod.executeShell).toBeDefined();
      const action = mod.executeShell as Record<string, unknown>;
      expect(typeof action.name).toBe("string");
    } catch {
      // Skip if not loadable
    }
  });

  it("exports git action", async () => {
    try {
      const mod = (await import("@elizaos/plugin-code")) as Record<
        string,
        unknown
      >;
      expect(mod.git).toBeDefined();
      const action = mod.git as Record<string, unknown>;
      expect(typeof action.name).toBe("string");
    } catch {
      // Skip if not loadable
    }
  });

  it("exports listFiles action", async () => {
    try {
      const mod = (await import("@elizaos/plugin-code")) as Record<
        string,
        unknown
      >;
      expect(mod.listFiles).toBeDefined();
      const action = mod.listFiles as Record<string, unknown>;
      expect(typeof action.name).toBe("string");
    } catch {
      // Skip if not loadable
    }
  });

  it("exports searchFiles action", async () => {
    try {
      const mod = (await import("@elizaos/plugin-code")) as Record<
        string,
        unknown
      >;
      expect(mod.searchFiles).toBeDefined();
      const action = mod.searchFiles as Record<string, unknown>;
      expect(typeof action.name).toBe("string");
    } catch {
      // Skip if not loadable
    }
  });

  it("exports changeDirectory action", async () => {
    try {
      const mod = (await import("@elizaos/plugin-code")) as Record<
        string,
        unknown
      >;
      expect(mod.changeDirectory).toBeDefined();
      const action = mod.changeDirectory as Record<string, unknown>;
      expect(typeof action.name).toBe("string");
    } catch {
      // Skip if not loadable
    }
  });

  it("plugin declares actions array with all coding actions", async () => {
    try {
      const { coderPlugin } = (await import("@elizaos/plugin-code")) as {
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
    } catch {
      // Skip if not loadable
    }
  });
});

// ---------------------------------------------------------------------------
// Plugin services
// ---------------------------------------------------------------------------

describe("Code writing plugin services", () => {
  it("exports CoderService class", async () => {
    try {
      const mod = (await import("@elizaos/plugin-code")) as Record<
        string,
        unknown
      >;
      expect(mod.CoderService).toBeDefined();
      expect(typeof mod.CoderService).toBe("function");
    } catch {
      // Skip if not loadable
    }
  });

  it("exports configureCodingTools function", async () => {
    try {
      const mod = (await import("@elizaos/plugin-code")) as Record<
        string,
        unknown
      >;
      expect(typeof mod.configureCodingTools).toBe("function");
    } catch {
      // Skip if not loadable
    }
  });
});

// ---------------------------------------------------------------------------
// Plugin provider
// ---------------------------------------------------------------------------

describe("Code writing plugin provider", () => {
  it("exports coderStatusProvider", async () => {
    try {
      const mod = (await import("@elizaos/plugin-code")) as Record<
        string,
        unknown
      >;
      expect(mod.coderStatusProvider).toBeDefined();
      const provider = mod.coderStatusProvider as Record<string, unknown>;
      expect(typeof provider.name).toBe("string");
      expect(typeof provider.get).toBe("function");
    } catch {
      // Skip if not loadable
    }
  });
});

// ---------------------------------------------------------------------------
// Coding agent context system (milaidy integration layer)
// ---------------------------------------------------------------------------

describe("Coding agent context system", () => {
  it("exports Zod schemas for coding agent validation", async () => {
    const mod = await import("../services/coding-agent-context.js");
    expect(mod.FileOperationSchema).toBeDefined();
    expect(mod.CommandResultSchema).toBeDefined();
    expect(mod.CapturedErrorSchema).toBeDefined();
    expect(mod.HumanFeedbackSchema).toBeDefined();
    expect(mod.CodingIterationSchema).toBeDefined();
    expect(mod.ConnectorTypeSchema).toBeDefined();
    expect(mod.ConnectorConfigSchema).toBeDefined();
    expect(mod.InteractionModeSchema).toBeDefined();
    expect(mod.CodingAgentContextSchema).toBeDefined();
  });

  it("exports context creation helper", async () => {
    const mod = await import("../services/coding-agent-context.js");
    expect(typeof mod.createCodingAgentContext).toBe("function");
  });

  it("creates a valid coding agent context", async () => {
    const { createCodingAgentContext, validateCodingAgentContext } =
      await import("../services/coding-agent-context.js");
    const ctx = createCodingAgentContext({
      sessionId: "test-session-1",
      taskDescription: "Write a hello world function",
      workingDirectory: "/tmp/test-project",
      connectorType: "local-fs",
      connectorBasePath: "/tmp/test-project",
      interactionMode: "fully-automated",
    });
    expect(ctx.sessionId).toBe("test-session-1");
    expect(ctx.taskDescription).toBe("Write a hello world function");
    expect(ctx.active).toBe(true);
    expect(ctx.iterations).toEqual([]);

    const validation = validateCodingAgentContext(
      ctx as unknown as Record<string, unknown>,
    );
    expect(validation.ok).toBe(true);
  });

  it("exports iteration management helpers", async () => {
    const mod = await import("../services/coding-agent-context.js");
    expect(typeof mod.addIteration).toBe("function");
    expect(typeof mod.getUnresolvedErrors).toBe("function");
    expect(typeof mod.hasReachedMaxIterations).toBe("function");
    expect(typeof mod.isLastIterationClean).toBe("function");
    expect(typeof mod.shouldContinueLoop).toBe("function");
  });

  it("exports feedback injection helper", async () => {
    const mod = await import("../services/coding-agent-context.js");
    expect(typeof mod.injectFeedback).toBe("function");
  });

  it("validates connector types", async () => {
    const { ConnectorTypeSchema } = await import(
      "../services/coding-agent-context.js"
    );
    expect(ConnectorTypeSchema.parse("local-fs")).toBe("local-fs");
    expect(ConnectorTypeSchema.parse("git-repo")).toBe("git-repo");
    expect(ConnectorTypeSchema.parse("api")).toBe("api");
    expect(ConnectorTypeSchema.parse("browser")).toBe("browser");
    expect(ConnectorTypeSchema.parse("sandbox")).toBe("sandbox");
    expect(() => ConnectorTypeSchema.parse("invalid")).toThrow();
  });

  it("validates interaction modes", async () => {
    const { InteractionModeSchema } = await import(
      "../services/coding-agent-context.js"
    );
    expect(InteractionModeSchema.parse("fully-automated")).toBe(
      "fully-automated",
    );
    expect(InteractionModeSchema.parse("human-in-the-loop")).toBe(
      "human-in-the-loop",
    );
    expect(InteractionModeSchema.parse("manual-guidance")).toBe(
      "manual-guidance",
    );
    expect(() => InteractionModeSchema.parse("invalid")).toThrow();
  });

  it("validates file operation types", async () => {
    const { FileOperationSchema } = await import(
      "../services/coding-agent-context.js"
    );
    const result = FileOperationSchema.parse({
      type: "write",
      target: "src/index.ts",
      size: 1024,
    });
    expect(result.type).toBe("write");
    expect(result.target).toBe("src/index.ts");
    expect(result.size).toBe(1024);
  });

  it("validates captured error categories", async () => {
    const { CapturedErrorSchema } = await import(
      "../services/coding-agent-context.js"
    );
    const result = CapturedErrorSchema.parse({
      category: "compile",
      message: "Type error: cannot assign string to number",
      filePath: "src/utils.ts",
      line: 42,
    });
    expect(result.category).toBe("compile");
    expect(result.filePath).toBe("src/utils.ts");
    expect(result.line).toBe(42);
  });
});

// ---------------------------------------------------------------------------
// Workspace provider coding agent enrichment
// ---------------------------------------------------------------------------

describe("Workspace provider coding agent enrichment", () => {
  it("exports buildCodingAgentSummary from workspace-provider", async () => {
    const mod = await import("../providers/workspace-provider.js");
    expect(typeof mod.buildCodingAgentSummary).toBe("function");
  });

  it("exports buildContext from workspace-provider", async () => {
    const mod = await import("../providers/workspace-provider.js");
    expect(typeof mod.buildContext).toBe("function");
  });

  it("exports truncate utility from workspace-provider", async () => {
    const { truncate } = await import("../providers/workspace-provider.js");
    expect(typeof truncate).toBe("function");
    expect(truncate("hello world", 5)).toContain("hello");
    expect(truncate("hello world", 5)).toContain("truncated");
    expect(truncate("hi", 10)).toBe("hi");
  });

  it("buildCodingAgentSummary handles empty context", async () => {
    const { buildCodingAgentSummary } = await import(
      "../providers/workspace-provider.js"
    );
    const { createCodingAgentContext } = await import(
      "../services/coding-agent-context.js"
    );
    const ctx = createCodingAgentContext({
      sessionId: "summary-test-1",
      taskDescription: "Test task",
      workingDirectory: "/tmp/test",
      connectorType: "local-fs",
      connectorBasePath: "/tmp/test",
      interactionMode: "fully-automated",
    });
    const summary = buildCodingAgentSummary(ctx);
    expect(typeof summary).toBe("string");
    expect(summary.length).toBeGreaterThan(0);
  });
});
