import type { IAgentRuntime } from "@elizaos/core";
import { describe, expect, it, vi } from "vitest";
import {
  computeBySource,
  extractRows,
  installDatabaseTrajectoryLogger,
  readOrchestratorTrajectoryContext,
} from "./trajectory-persistence";

async function waitForCallCount(
  fn: ReturnType<typeof vi.fn>,
  minCalls: number,
  timeoutMs = 3000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (fn.mock.calls.length >= minCalls) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(
    `Timed out waiting for at least ${minCalls} calls (got ${fn.mock.calls.length})`,
  );
}

function createRuntimeWithTrajectoryLogger(logger: Record<string, unknown>): {
  runtime: IAgentRuntime;
  dbExecute: ReturnType<typeof vi.fn>;
} {
  const dbExecute = vi.fn(async () => ({ rows: [] as unknown[] }));
  const runtime = {
    agentId: "00000000-0000-0000-0000-000000000001",
    adapter: {
      db: {
        execute: dbExecute,
      },
    },
    getServicesByType: (serviceType: string) =>
      serviceType === "trajectory_logger" ? [logger] : [],
    getService: (serviceType: string) =>
      serviceType === "trajectory_logger" ? logger : null,
    logger: {
      warn: vi.fn(),
    },
  } as unknown as IAgentRuntime;
  return { runtime, dbExecute };
}

describe("installDatabaseTrajectoryLogger", () => {
  it("patches legacy logger while preserving original handlers", async () => {
    const originalLogLlmCall = vi.fn();
    const originalLogProviderAccess = vi.fn();
    const legacyLogger = {
      listTrajectories: vi.fn(),
      getTrajectoryDetail: vi.fn(),
      logLlmCall: originalLogLlmCall,
      logProviderAccess: originalLogProviderAccess,
      isEnabled: () => true,
    } as Record<string, unknown>;

    const { runtime, dbExecute } =
      createRuntimeWithTrajectoryLogger(legacyLogger);

    installDatabaseTrajectoryLogger(runtime);
    await waitForCallCount(dbExecute, 1);

    const patchedLogLlmCall = legacyLogger.logLlmCall as (
      ...args: unknown[]
    ) => void;
    const patchedLogProviderAccess = legacyLogger.logProviderAccess as (
      ...args: unknown[]
    ) => void;

    expect(patchedLogLlmCall).not.toBe(originalLogLlmCall);
    expect(patchedLogProviderAccess).not.toBe(originalLogProviderAccess);

    const callsAfterInstall = dbExecute.mock.calls.length;

    patchedLogLlmCall({
      stepId: "step-legacy-1",
      model: "test-model",
      systemPrompt: "system",
      userPrompt: "user",
      response: "assistant",
      temperature: 0,
      maxTokens: 256,
      purpose: "action",
      actionType: "runtime.useModel",
      latencyMs: 10,
    });
    patchedLogProviderAccess({
      stepId: "step-legacy-1",
      providerName: "test-provider",
      data: { ok: true },
      purpose: "compose_state",
    });

    expect(originalLogLlmCall).toHaveBeenCalledTimes(1);
    expect(originalLogProviderAccess).toHaveBeenCalledTimes(1);

    await waitForCallCount(dbExecute, callsAfterInstall + 2);
  });

  it("accepts legacy split-argument logger calls", async () => {
    const originalLogLlmCall = vi.fn();
    const originalLogProviderAccess = vi.fn();
    const legacyLogger = {
      listTrajectories: vi.fn(),
      getTrajectoryDetail: vi.fn(),
      logLlmCall: originalLogLlmCall,
      logProviderAccess: originalLogProviderAccess,
      isEnabled: () => true,
    } as Record<string, unknown>;

    const { runtime, dbExecute } =
      createRuntimeWithTrajectoryLogger(legacyLogger);

    installDatabaseTrajectoryLogger(runtime);
    await waitForCallCount(dbExecute, 1);
    const callsAfterInstall = dbExecute.mock.calls.length;

    const patchedLogLlmCall = legacyLogger.logLlmCall as (
      ...args: unknown[]
    ) => void;
    const patchedLogProviderAccess = legacyLogger.logProviderAccess as (
      ...args: unknown[]
    ) => void;

    patchedLogLlmCall("step-split-1", {
      model: "split-model",
      systemPrompt: "system",
      userPrompt: "user",
      response: "assistant",
      temperature: 0,
      maxTokens: 128,
      purpose: "action",
      actionType: "runtime.useModel",
      latencyMs: 9,
    });
    patchedLogProviderAccess("step-split-1", {
      providerName: "provider-split",
      data: { score: 1 },
      purpose: "compose_state",
    });

    expect(originalLogLlmCall).toHaveBeenCalledWith(
      "step-split-1",
      expect.objectContaining({
        model: "split-model",
      }),
    );
    expect(originalLogProviderAccess).toHaveBeenCalledWith(
      "step-split-1",
      expect.objectContaining({
        providerName: "provider-split",
      }),
    );

    await waitForCallCount(dbExecute, callsAfterInstall + 2);
  });
});

// ---------------------------------------------------------------------------
// readOrchestratorTrajectoryContext
// ---------------------------------------------------------------------------

describe("readOrchestratorTrajectoryContext", () => {
  it("returns undefined for null/undefined input", () => {
    expect(readOrchestratorTrajectoryContext(null)).toBeUndefined();
    expect(readOrchestratorTrajectoryContext(undefined)).toBeUndefined();
  });

  it("returns undefined for non-object input", () => {
    expect(readOrchestratorTrajectoryContext("string")).toBeUndefined();
    expect(readOrchestratorTrajectoryContext(42)).toBeUndefined();
  });

  it("returns undefined when __orchestratorTrajectoryCtx is missing", () => {
    expect(readOrchestratorTrajectoryContext({})).toBeUndefined();
  });

  it("returns undefined when ctx is not an object", () => {
    expect(
      readOrchestratorTrajectoryContext({
        __orchestratorTrajectoryCtx: "not-an-object",
      }),
    ).toBeUndefined();
  });

  it("returns undefined when source is not 'orchestrator'", () => {
    expect(
      readOrchestratorTrajectoryContext({
        __orchestratorTrajectoryCtx: {
          source: "runtime",
          decisionType: "stall-check",
        },
      }),
    ).toBeUndefined();
  });

  it("returns undefined when decisionType is not a string", () => {
    expect(
      readOrchestratorTrajectoryContext({
        __orchestratorTrajectoryCtx: {
          source: "orchestrator",
          decisionType: 123,
        },
      }),
    ).toBeUndefined();
  });

  it("returns valid context with required fields only", () => {
    const result = readOrchestratorTrajectoryContext({
      __orchestratorTrajectoryCtx: {
        source: "orchestrator",
        decisionType: "stall-check",
      },
    });
    expect(result).toEqual({
      source: "orchestrator",
      decisionType: "stall-check",
    });
  });

  it("returns valid context with all optional fields", () => {
    const ctx = {
      source: "orchestrator" as const,
      decisionType: "coordination",
      sessionId: "sess-1",
      taskLabel: "fix bug",
      repo: "my-repo",
      workdir: "/tmp/work",
      originalTask: "Fix the login flow",
    };
    const result = readOrchestratorTrajectoryContext({
      __orchestratorTrajectoryCtx: ctx,
    });
    expect(result).toEqual(ctx);
  });
});

// ---------------------------------------------------------------------------
// extractRows
// ---------------------------------------------------------------------------

describe("extractRows", () => {
  it("returns the array directly when input is an array", () => {
    const rows = [{ a: 1 }, { a: 2 }];
    expect(extractRows(rows)).toBe(rows);
  });

  it("returns rows property when input is a { rows } wrapper", () => {
    const rows = [{ source: "runtime", cnt: 3 }];
    expect(extractRows({ rows })).toBe(rows);
  });

  it("returns empty array for null/undefined", () => {
    expect(extractRows(null)).toEqual([]);
    expect(extractRows(undefined)).toEqual([]);
  });

  it("returns empty array for non-array non-object", () => {
    expect(extractRows("string")).toEqual([]);
    expect(extractRows(42)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// computeBySource
// ---------------------------------------------------------------------------

describe("computeBySource", () => {
  function mockRuntime(queryResult: unknown): IAgentRuntime {
    return {
      adapter: {
        db: {
          execute: vi.fn(async () => queryResult),
        },
      },
    } as unknown as IAgentRuntime;
  }

  it("returns source counts from SQL result rows", async () => {
    const runtime = mockRuntime({
      rows: [
        { source: "runtime", cnt: 5 },
        { source: "orchestrator", cnt: 3 },
        { source: "chat", cnt: 12 },
      ],
    });
    const result = await computeBySource(runtime);
    expect(result).toEqual({ runtime: 5, orchestrator: 3, chat: 12 });
  });

  it("returns source counts from flat array result", async () => {
    const runtime = mockRuntime([
      { source: "runtime", cnt: 2 },
      { source: "orchestrator", cnt: 1 },
    ]);
    const result = await computeBySource(runtime);
    expect(result).toEqual({ runtime: 2, orchestrator: 1 });
  });

  it("skips rows with non-string source", async () => {
    const runtime = mockRuntime([
      { source: "runtime", cnt: 1 },
      { source: null, cnt: 5 },
      { source: 123, cnt: 2 },
    ]);
    const result = await computeBySource(runtime);
    expect(result).toEqual({ runtime: 1 });
  });

  it("returns empty object when DB throws", async () => {
    const runtime = {
      adapter: {
        db: {
          execute: vi.fn(async () => {
            throw new Error("db unavailable");
          }),
        },
      },
    } as unknown as IAgentRuntime;
    const result = await computeBySource(runtime);
    expect(result).toEqual({});
  });

  it("returns empty object when no DB adapter", async () => {
    const runtime = {} as IAgentRuntime;
    const result = await computeBySource(runtime);
    expect(result).toEqual({});
  });
});
