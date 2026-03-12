import type { IAgentRuntime } from "@elizaos/core";
import { describe, expect, it, vi } from "vitest";
import {
  computeBySource,
  extractInsightsFromResponse,
  extractRows,
  flushObservationBuffer,
  installDatabaseTrajectoryLogger,
  pruneOldTrajectories,
  pushChatExchange,
  readOrchestratorTrajectoryContext,
  shouldRunObservationExtraction,
  truncateField,
  truncateRecord,
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

  it("tags LLM calls with orchestrator context when __orchestratorTrajectoryCtx is set", async () => {
    const originalLogLlmCall = vi.fn();
    const legacyLogger = {
      listTrajectories: vi.fn(),
      getTrajectoryDetail: vi.fn(),
      logLlmCall: originalLogLlmCall,
      logProviderAccess: vi.fn(),
      isEnabled: () => true,
    } as Record<string, unknown>;

    const { runtime, dbExecute } =
      createRuntimeWithTrajectoryLogger(legacyLogger);

    // Set orchestrator context on the runtime
    (
      runtime as unknown as Record<string, unknown>
    ).__orchestratorTrajectoryCtx = {
      source: "orchestrator",
      decisionType: "stall-check",
      sessionId: "sess-42",
      taskLabel: "implement feature X",
    };

    installDatabaseTrajectoryLogger(runtime);
    await waitForCallCount(dbExecute, 1);
    const callsAfterInstall = dbExecute.mock.calls.length;

    const patchedLogLlmCall = legacyLogger.logLlmCall as (
      ...args: unknown[]
    ) => void;

    patchedLogLlmCall({
      stepId: "step-orch-1",
      model: "claude-sonnet",
      systemPrompt: "system",
      userPrompt: "classify this output",
      response: "the agent is stalled",
      temperature: 0,
      maxTokens: 512,
      purpose: "action",
      actionType: "runtime.useModel",
      latencyMs: 200,
    });

    await waitForCallCount(dbExecute, callsAfterInstall + 1);

    // Find the INSERT SQL call — dbExecute receives a tagged template result
    // which may be a raw SQL string or a Sql object. Stringify all args to search.
    const insertIdx = dbExecute.mock.calls.findIndex((call: unknown[]) => {
      const serialized = JSON.stringify(call);
      return serialized.includes("INSERT INTO trajectories");
    });

    expect(insertIdx).toBeGreaterThanOrEqual(0);

    // Serialize the full call to check for expected values
    const insertSql = JSON.stringify(dbExecute.mock.calls[insertIdx]);

    // Verify source is "orchestrator"
    expect(insertSql).toContain("orchestrator");

    // Verify the LLM call has orchestrator overrides:
    // purpose should be the decisionType ("stall-check")
    // actionType should be "orchestrator.useModel"
    expect(insertSql).toContain("stall-check");
    expect(insertSql).toContain("orchestrator.useModel");

    // Verify metadata contains orchestrator session/task info
    expect(insertSql).toContain("sess-42");
    expect(insertSql).toContain("implement feature X");
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

describe("shouldRunObservationExtraction", () => {
  it("returns true by default when no explicit setting and no reflection evaluators", () => {
    const runtime = {
      evaluators: [],
      getSetting: vi.fn(() => undefined),
    } as unknown as IAgentRuntime;
    expect(shouldRunObservationExtraction(runtime)).toBe(true);
  });

  it("returns false when REFLECTION evaluator is present and no explicit setting", () => {
    const runtime = {
      evaluators: [{ name: "REFLECTION" }],
      getSetting: vi.fn(() => undefined),
    } as unknown as IAgentRuntime;
    expect(shouldRunObservationExtraction(runtime)).toBe(false);
  });

  it("returns false when RELATIONSHIP_EXTRACTION evaluator is present", () => {
    const runtime = {
      evaluators: [{ name: "RELATIONSHIP_EXTRACTION" }],
      getSetting: vi.fn(() => undefined),
    } as unknown as IAgentRuntime;
    expect(shouldRunObservationExtraction(runtime)).toBe(false);
  });

  it("returns true when explicitly enabled even if evaluators are present", () => {
    const runtime = {
      evaluators: [{ name: "REFLECTION" }],
      getSetting: vi.fn((key: string) =>
        key === "TRAJECTORY_OBSERVATION_EXTRACTION" ? "true" : undefined,
      ),
    } as unknown as IAgentRuntime;
    expect(shouldRunObservationExtraction(runtime)).toBe(true);
  });

  it("returns false when explicitly disabled", () => {
    const runtime = {
      evaluators: [],
      getSetting: vi.fn((key: string) =>
        key === "TRAJECTORY_OBSERVATION_EXTRACTION" ? "false" : undefined,
      ),
    } as unknown as IAgentRuntime;
    expect(shouldRunObservationExtraction(runtime)).toBe(false);
  });

  it("falls back to evaluator guard when explicit setting is invalid", () => {
    const runtime = {
      evaluators: [{ name: " REFLECTION " }],
      getSetting: vi.fn((key: string) =>
        key === "TRAJECTORY_OBSERVATION_EXTRACTION" ? "maybe" : undefined,
      ),
    } as unknown as IAgentRuntime;
    expect(shouldRunObservationExtraction(runtime)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// truncateField
// ---------------------------------------------------------------------------

describe("truncateField", () => {
  it("returns short strings unchanged", () => {
    expect(truncateField("hello", 500)).toBe("hello");
  });

  it("returns strings at exactly 2x limit unchanged", () => {
    const s = "a".repeat(1000);
    expect(truncateField(s, 500)).toBe(s);
  });

  it("truncates strings exceeding 2x limit", () => {
    const s = "a".repeat(2000);
    const result = truncateField(s, 500);
    expect(result).toContain("[...truncated 1000 chars...]");
    expect(result.startsWith("a".repeat(500))).toBe(true);
    expect(result.endsWith("a".repeat(500))).toBe(true);
    expect(result.length).toBeLessThan(s.length);
  });
});

// ---------------------------------------------------------------------------
// extractInsightsFromResponse
// ---------------------------------------------------------------------------

describe("extractInsightsFromResponse", () => {
  it("extracts DECISION: markers", () => {
    const response = "Some text\nDECISION: use claude for this task\nMore text";
    expect(extractInsightsFromResponse(response, "coordination")).toEqual([
      "use claude for this task",
    ]);
  });

  it("extracts keyDecision JSON fields", () => {
    const response =
      '{"keyDecision": "split into 3 subtasks", "other": "stuff"}';
    expect(extractInsightsFromResponse(response, "action")).toEqual([
      "split into 3 subtasks",
    ]);
  });

  it("falls back to reasoning for turn-complete when no other insights", () => {
    const response =
      '{"reasoning": "the agent completed the bug fix successfully and tests pass"}';
    const insights = extractInsightsFromResponse(response, "turn-complete");
    expect(insights).toHaveLength(1);
    expect(insights[0]).toContain("the agent completed the bug fix");
  });

  it("does not extract reasoning for non-turn-complete purposes", () => {
    const response =
      '{"reasoning": "the agent completed the bug fix successfully and tests pass"}';
    expect(extractInsightsFromResponse(response, "action")).toEqual([]);
  });

  it("returns empty array for responses with no markers", () => {
    expect(
      extractInsightsFromResponse("just a normal response", "action"),
    ).toEqual([]);
  });

  it("extracts multiple insights from one response", () => {
    const response =
      'DECISION: use parallel agents\n{"keyDecision": "split by module"}\nDECISION: assign alpha to frontend';
    const insights = extractInsightsFromResponse(response, "coordination");
    expect(insights).toEqual([
      "use parallel agents",
      "assign alpha to frontend",
      "split by module",
    ]);
  });
});

// ---------------------------------------------------------------------------
// pushChatExchange / flushObservationBuffer
// ---------------------------------------------------------------------------

describe("observation buffer", () => {
  it("pushChatExchange adds to the buffer without throwing", () => {
    const runtime = {} as IAgentRuntime;
    expect(() =>
      pushChatExchange(runtime, {
        userPrompt: "hello",
        response: "hi there",
        trajectoryId: "step-1",
        timestamp: Date.now(),
      }),
    ).not.toThrow();
  });

  it("flushObservationBuffer returns empty array when buffer is empty", async () => {
    const runtime = {} as IAgentRuntime;
    const result = await flushObservationBuffer(runtime);
    expect(result).toEqual([]);
  });

  it("flushObservationBuffer returns empty array when useModel is unavailable", async () => {
    const runtime = {
      useModel: vi.fn(async () => "not json"),
      adapter: {
        db: { execute: vi.fn(async () => ({ rows: [] })) },
      },
      agentId: "test-agent",
    } as unknown as IAgentRuntime;

    pushChatExchange(runtime, {
      userPrompt: "I prefer TypeScript",
      response: "Noted!",
      trajectoryId: "step-obs-1",
      timestamp: Date.now(),
    });

    const result = await flushObservationBuffer(runtime);
    // useModel was called with the extraction prompt
    expect(runtime.useModel).toHaveBeenCalledTimes(1);
    // Returns empty because "not json" can't be parsed as array
    expect(result).toEqual([]);
  });

  it("flushObservationBuffer parses valid LLM response into observations", async () => {
    const runtime = {
      useModel: vi.fn(async () =>
        JSON.stringify(["prefers TypeScript", "works on milaidy"]),
      ),
      adapter: {
        db: { execute: vi.fn(async () => ({ rows: [] })) },
      },
      agentId: "test-agent",
    } as unknown as IAgentRuntime;

    pushChatExchange(runtime, {
      userPrompt: "I prefer TypeScript and I work on milaidy",
      response: "Got it!",
      trajectoryId: "step-obs-2",
      timestamp: Date.now(),
    });

    const result = await flushObservationBuffer(runtime);
    expect(result).toEqual(["prefers TypeScript", "works on milaidy"]);
  });

  it("flushObservationBuffer prevents concurrent flushes", async () => {
    let resolveModel: ((value: string) => void) | null = null;
    const runtime = {
      useModel: vi.fn(
        () =>
          new Promise<string>((resolve) => {
            resolveModel = resolve;
          }),
      ),
      adapter: {
        db: { execute: vi.fn(async () => ({ rows: [] })) },
      },
      agentId: "test-agent",
    } as unknown as IAgentRuntime;

    pushChatExchange(runtime, {
      userPrompt: "first message",
      response: "ok",
      trajectoryId: "step-concurrent-1",
      timestamp: Date.now(),
    });

    // Start first flush (will block on useModel)
    const flush1 = flushObservationBuffer(runtime);

    // Second flush should return empty immediately (concurrent guard)
    const flush2Result = await flushObservationBuffer(runtime);
    expect(flush2Result).toEqual([]);

    // Resolve the first flush
    resolveModel?.("[]");
    await flush1;

    // useModel only called once (concurrent flush was blocked)
    expect(runtime.useModel).toHaveBeenCalledTimes(1);
  });

  it("flushObservationBuffer truncates observations to 150 chars", async () => {
    const longObs = "a".repeat(200);
    const runtime = {
      useModel: vi.fn(async () => JSON.stringify([longObs])),
      adapter: {
        db: { execute: vi.fn(async () => ({ rows: [] })) },
      },
      agentId: "test-agent",
    } as unknown as IAgentRuntime;

    pushChatExchange(runtime, {
      userPrompt: "test",
      response: "response",
      trajectoryId: "step-trunc-obs",
      timestamp: Date.now(),
    });

    const result = await flushObservationBuffer(runtime);
    expect(result).toHaveLength(1);
    expect(result[0].length).toBe(150);
  });

  it("flushObservationBuffer filters non-string entries from LLM response", async () => {
    const runtime = {
      useModel: vi.fn(async () =>
        JSON.stringify(["valid observation", 42, null, "", "another valid"]),
      ),
      adapter: {
        db: { execute: vi.fn(async () => ({ rows: [] })) },
      },
      agentId: "test-agent",
    } as unknown as IAgentRuntime;

    pushChatExchange(runtime, {
      userPrompt: "test",
      response: "response",
      trajectoryId: "step-filter-obs",
      timestamp: Date.now(),
    });

    const result = await flushObservationBuffer(runtime);
    expect(result).toEqual(["valid observation", "another valid"]);
  });

  it("flushObservationBuffer sets __orchestratorTrajectoryCtx to prevent recursion", async () => {
    let capturedCtx: unknown;
    const runtime = {
      useModel: vi.fn(async function (this: unknown) {
        capturedCtx = (runtime as unknown as Record<string, unknown>)
          .__orchestratorTrajectoryCtx;
        return "[]";
      }),
      adapter: {
        db: { execute: vi.fn(async () => ({ rows: [] })) },
      },
      agentId: "test-agent",
    } as unknown as IAgentRuntime;

    pushChatExchange(runtime, {
      userPrompt: "test",
      response: "response",
      trajectoryId: "step-recursion",
      timestamp: Date.now(),
    });

    await flushObservationBuffer(runtime);

    // During the call, the context should have been set
    expect(capturedCtx).toEqual({
      source: "orchestrator",
      decisionType: "observation-extraction",
    });

    // After the call, the context should be cleaned up
    expect(
      (runtime as unknown as Record<string, unknown>)
        .__orchestratorTrajectoryCtx,
    ).toBeUndefined();
  });

  it("flushObservationBuffer clears __orchestratorTrajectoryCtx when useModel throws", async () => {
    const runtime = {
      useModel: vi.fn(async () => {
        throw new Error("model failed");
      }),
      adapter: {
        db: { execute: vi.fn(async () => ({ rows: [] })) },
      },
      agentId: "test-agent",
    } as unknown as IAgentRuntime;

    pushChatExchange(runtime, {
      userPrompt: "test",
      response: "response",
      trajectoryId: "step-throw-cleanup",
      timestamp: Date.now(),
    });

    const result = await flushObservationBuffer(runtime);
    expect(result).toEqual([]);
    expect(
      (runtime as unknown as Record<string, unknown>)
        .__orchestratorTrajectoryCtx,
    ).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// truncateRecord
// ---------------------------------------------------------------------------

describe("truncateRecord", () => {
  it("returns small records unchanged", () => {
    const obj = { key: "value", num: 42 };
    expect(truncateRecord(obj, 500)).toBe(obj);
  });

  it("wraps large records with _truncated key", () => {
    const obj: Record<string, unknown> = {};
    // Create object whose JSON is > 1000 chars (2x500 limit)
    for (let i = 0; i < 50; i++) {
      obj[`key_${i}`] = "x".repeat(30);
    }
    const result = truncateRecord(obj, 500);
    expect(result).toHaveProperty("_truncated");
    expect(typeof result._truncated).toBe("string");
    expect(result._truncated as string).toContain("[...truncated");
  });

  it("uses default limit when none specified", () => {
    const obj: Record<string, unknown> = {};
    for (let i = 0; i < 100; i++) {
      obj[`key_${i}`] = "x".repeat(30);
    }
    const result = truncateRecord(obj);
    expect(result).toHaveProperty("_truncated");
  });
});

// ---------------------------------------------------------------------------
// pruneOldTrajectories
// ---------------------------------------------------------------------------

describe("pruneOldTrajectories", () => {
  it("returns null when runtime has no DB adapter", async () => {
    const runtime = {} as IAgentRuntime;
    const result = await pruneOldTrajectories(runtime);
    expect(result).toBeNull();
  });

  it("archives and deletes old trajectories", async () => {
    const executedSql: string[] = [];
    const dbExecute = vi.fn(async (query: unknown) => {
      // Extract the SQL string from the drizzle sql.raw object
      const sqlStr = JSON.stringify(query);
      executedSql.push(sqlStr);

      // Return count for the SELECT count query
      if (sqlStr.includes("SELECT count")) {
        return { rows: [{ total: 5 }] };
      }
      return { rows: [] };
    });

    const runtime = {
      agentId: "test-agent",
      adapter: {
        db: { execute: dbExecute },
      },
      getServicesByType: () => [],
      getService: () => null,
    } as unknown as IAgentRuntime;

    const result = await pruneOldTrajectories(runtime, 30);
    expect(result).toBe(5);

    // Verify archive SQL was attempted (INSERT ... INTO trajectory_archive)
    const archiveSql = executedSql.find((s) =>
      s.includes("trajectory_archive"),
    );
    expect(archiveSql).toBeDefined();

    // Verify DELETE was executed
    const deleteSql = executedSql.find((s) =>
      s.includes("DELETE FROM trajectories"),
    );
    expect(deleteSql).toBeDefined();
  });

  it("returns 0 when no old trajectories exist", async () => {
    const dbExecute = vi.fn(async (query: unknown) => {
      const sqlStr = JSON.stringify(query);
      if (sqlStr.includes("SELECT count")) {
        return { rows: [{ total: 0 }] };
      }
      return { rows: [] };
    });

    const runtime = {
      agentId: "test-agent",
      adapter: {
        db: { execute: dbExecute },
      },
      getServicesByType: () => [],
      getService: () => null,
    } as unknown as IAgentRuntime;

    const result = await pruneOldTrajectories(runtime, 30);
    expect(result).toBe(0);

    // DELETE should NOT be called when count is 0
    const calls = dbExecute.mock.calls.map((c: unknown[]) => JSON.stringify(c));
    const deleteCall = calls.find((s: string) =>
      s.includes("DELETE FROM trajectories"),
    );
    expect(deleteCall).toBeUndefined();
  });

  it("falls back to PostgreSQL syntax when SQLite INSERT OR IGNORE fails", async () => {
    const executedSql: string[] = [];
    const dbExecute = vi.fn(async (query: unknown) => {
      const sqlStr = JSON.stringify(query);
      executedSql.push(sqlStr);

      // First archive attempt (SQLite) fails
      if (
        sqlStr.includes("INSERT OR IGNORE") &&
        sqlStr.includes("trajectory_archive")
      ) {
        throw new Error("SQLite syntax not supported");
      }

      if (sqlStr.includes("SELECT count")) {
        return { rows: [{ total: 2 }] };
      }
      return { rows: [] };
    });

    const runtime = {
      agentId: "test-agent",
      adapter: {
        db: { execute: dbExecute },
      },
      getServicesByType: () => [],
      getService: () => null,
    } as unknown as IAgentRuntime;

    const result = await pruneOldTrajectories(runtime, 30);
    expect(result).toBe(2);

    // Should have tried PostgreSQL fallback (ON CONFLICT DO NOTHING)
    const pgSql = executedSql.find(
      (s) => s.includes("ON CONFLICT") && s.includes("DO NOTHING"),
    );
    expect(pgSql).toBeDefined();
  });

  it("does not delete trajectories when summary archive inserts fail", async () => {
    const executedSql: string[] = [];
    const dbExecute = vi.fn(async (query: unknown) => {
      const sqlStr = JSON.stringify(query);
      executedSql.push(sqlStr);

      if (
        sqlStr.includes("INSERT OR IGNORE") &&
        sqlStr.includes("trajectory_archive")
      ) {
        throw new Error("SQLite insert failed");
      }
      if (
        sqlStr.includes("INSERT INTO trajectory_archive") &&
        sqlStr.includes("ON CONFLICT")
      ) {
        throw new Error("PostgreSQL insert failed");
      }
      if (sqlStr.includes("SELECT count")) {
        return { rows: [{ total: 4 }] };
      }
      return { rows: [] };
    });

    const runtime = {
      agentId: "test-agent",
      adapter: {
        db: { execute: dbExecute },
      },
      getServicesByType: () => [],
      getService: () => null,
    } as unknown as IAgentRuntime;

    const result = await pruneOldTrajectories(runtime, 30);
    expect(result).toBeNull();

    const deleteSql = executedSql.find((s) =>
      s.includes("DELETE FROM trajectories"),
    );
    expect(deleteSql).toBeUndefined();
  });
});
