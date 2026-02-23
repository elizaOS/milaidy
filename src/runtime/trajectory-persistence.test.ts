import type { IAgentRuntime } from "@elizaos/core";
import { describe, expect, it, vi } from "vitest";
import { installDatabaseTrajectoryLogger } from "./trajectory-persistence";

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
  return createRuntimeWithTrajectoryLoggers([logger], logger);
}

function createRuntimeWithTrajectoryLoggers(
  loggers: Record<string, unknown>[],
  primaryLogger?: Record<string, unknown> | null,
): {
  runtime: IAgentRuntime;
  dbExecute: ReturnType<typeof vi.fn>;
} {
  const dbExecute = vi.fn(async () => ({ rows: [] as unknown[] }));
  const primary = primaryLogger ?? loggers[0] ?? null;
  const runtime = {
    agentId: "00000000-0000-0000-0000-000000000001",
    adapter: {
      db: {
        execute: dbExecute,
      },
    },
    getServicesByType: (serviceType: string) =>
      serviceType === "trajectory_logger" ? loggers : [],
    getService: (serviceType: string) =>
      serviceType === "trajectory_logger" ? primary : null,
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

  it("patches all discovered trajectory logger instances", async () => {
    const primaryLogLlmCall = vi.fn();
    const primaryLogProviderAccess = vi.fn();
    const primaryLogger = {
      capabilityDescription:
        "Captures provider/LLM traces for benchmarks and training trajectories",
      llmCalls: [] as unknown[],
      providerAccess: [] as unknown[],
      logLlmCall: primaryLogLlmCall,
      logProviderAccess: primaryLogProviderAccess,
    } as Record<string, unknown>;

    const secondaryLogLlmCall = vi.fn();
    const secondaryLogProviderAccess = vi.fn();
    const secondaryLogger = {
      listTrajectories: vi.fn(),
      getTrajectoryDetail: vi.fn(),
      logLlmCall: secondaryLogLlmCall,
      logProviderAccess: secondaryLogProviderAccess,
      isEnabled: () => true,
    } as Record<string, unknown>;

    const { runtime, dbExecute } = createRuntimeWithTrajectoryLoggers(
      [primaryLogger, secondaryLogger],
      secondaryLogger,
    );

    installDatabaseTrajectoryLogger(runtime);
    await waitForCallCount(dbExecute, 1);
    const callsAfterInstall = dbExecute.mock.calls.length;

    const patchedPrimaryLogLlmCall = primaryLogger.logLlmCall as (
      ...args: unknown[]
    ) => void;
    const patchedPrimaryLogProviderAccess = primaryLogger.logProviderAccess as (
      ...args: unknown[]
    ) => void;
    const patchedSecondaryLogLlmCall = secondaryLogger.logLlmCall as (
      ...args: unknown[]
    ) => void;
    const patchedSecondaryLogProviderAccess =
      secondaryLogger.logProviderAccess as (...args: unknown[]) => void;

    patchedPrimaryLogLlmCall({
      stepId: "step-primary-1",
      model: "primary-model",
      systemPrompt: "system",
      userPrompt: "user",
      response: "assistant",
      temperature: 0,
      maxTokens: 64,
      purpose: "action",
      actionType: "runtime.useModel",
      latencyMs: 8,
    });
    patchedPrimaryLogProviderAccess({
      stepId: "step-primary-1",
      providerName: "primary-provider",
      data: { ok: true },
      purpose: "compose_state",
    });
    patchedSecondaryLogLlmCall({
      stepId: "step-secondary-1",
      model: "secondary-model",
      systemPrompt: "system",
      userPrompt: "user",
      response: "assistant",
      temperature: 0,
      maxTokens: 64,
      purpose: "action",
      actionType: "runtime.useModel",
      latencyMs: 8,
    });
    patchedSecondaryLogProviderAccess({
      stepId: "step-secondary-1",
      providerName: "secondary-provider",
      data: { ok: true },
      purpose: "compose_state",
    });

    expect(primaryLogLlmCall).toHaveBeenCalledTimes(1);
    expect(primaryLogProviderAccess).toHaveBeenCalledTimes(1);
    expect(secondaryLogLlmCall).toHaveBeenCalledTimes(1);
    expect(secondaryLogProviderAccess).toHaveBeenCalledTimes(1);

    await waitForCallCount(dbExecute, callsAfterInstall + 4);
  });
});
