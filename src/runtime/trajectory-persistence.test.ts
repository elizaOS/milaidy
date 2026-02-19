import type { IAgentRuntime } from "@elizaos/core";
import { describe, expect, it, vi } from "vitest";
import { installDatabaseTrajectoryLogger } from "./trajectory-persistence";

vi.mock("drizzle-orm", () => ({
  sql: {
    raw: (query: string) => ({ queryChunks: [{ sql: query }] }),
  },
}));

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
