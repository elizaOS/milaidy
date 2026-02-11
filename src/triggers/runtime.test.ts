import type { IAgentRuntime, Task, UUID } from "@elizaos/core";
import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  executeTriggerTask,
  getTriggerHealthSnapshot,
  getTriggerLimit,
  readTriggerConfig,
  registerTriggerTaskWorker,
  TRIGGER_TASK_NAME,
  triggersFeatureEnabled,
} from "./runtime.js";
import { buildTriggerConfig } from "./scheduling.js";

function makeTask(
  taskId: UUID,
  triggerType: "interval" | "once" | "cron",
): Task {
  const trigger = buildTriggerConfig({
    draft: {
      displayName: "Test Trigger",
      instructions: "Run this work item",
      triggerType,
      wakeMode: "inject_now",
      enabled: true,
      createdBy: "tester",
      intervalMs: triggerType === "interval" ? 120_000 : undefined,
      scheduledAtIso:
        triggerType === "once"
          ? new Date(Date.now() - 1_000).toISOString()
          : undefined,
      cronExpression: triggerType === "cron" ? "*/15 * * * *" : undefined,
    },
    triggerId: "00000000-0000-0000-0000-000000000901" as UUID,
  });

  return {
    id: taskId,
    name: TRIGGER_TASK_NAME,
    description: "trigger",
    tags: ["queue", "repeat", "trigger"],
    metadata: {
      updatedAt: Date.now(),
      updateInterval: 120_000,
      trigger,
      triggerRuns: [],
    },
  };
}

describe("trigger runtime", () => {
  let runtime: IAgentRuntime;
  let updateTaskMock: ReturnType<typeof vi.fn>;
  let deleteTaskMock: ReturnType<typeof vi.fn>;
  let injectInstructionMock: ReturnType<typeof vi.fn>;
  let tasks: Task[];

  beforeEach(() => {
    updateTaskMock = vi.fn(async () => undefined);
    deleteTaskMock = vi.fn(async (taskId: UUID) => {
      tasks = tasks.filter((task) => task.id !== taskId);
    });
    injectInstructionMock = vi.fn(async () => undefined);
    tasks = [
      makeTask("00000000-0000-0000-0000-000000000100" as UUID, "interval"),
    ];

    const runtimePartial: Partial<IAgentRuntime> = {
      agentId: "00000000-0000-0000-0000-000000000001" as UUID,
      getSetting: () => undefined,
      getService: () =>
        ({
          injectAutonomousInstruction: injectInstructionMock,
        }) as { injectAutonomousInstruction: () => Promise<void> },
      getTasks: async () => tasks,
      getTask: async (taskId: UUID) =>
        tasks.find((task) => task.id === taskId) ?? null,
      updateTask: updateTaskMock,
      deleteTask: deleteTaskMock,
      createMemory: vi.fn(async () => undefined),
      registerTaskWorker: vi.fn(),
      getTaskWorker: vi.fn(),
      logger: {
        info: vi.fn(),
        error: vi.fn(),
      } as IAgentRuntime["logger"],
    };
    runtime = runtimePartial as IAgentRuntime;
  });

  test("executes interval trigger and persists updates", async () => {
    const task = tasks[0];
    const result = await executeTriggerTask(runtime, task, {
      source: "scheduler",
    });

    expect(result.status).toBe("success");
    expect(result.taskDeleted).toBe(false);
    expect(injectInstructionMock).toHaveBeenCalledTimes(1);
    expect(updateTaskMock).toHaveBeenCalledTimes(1);
  });

  test("deletes once trigger after execution", async () => {
    const onceTask = makeTask(
      "00000000-0000-0000-0000-000000000101" as UUID,
      "once",
    );
    const result = await executeTriggerTask(runtime, onceTask, {
      source: "scheduler",
    });

    expect(result.taskDeleted).toBe(true);
    expect(deleteTaskMock).toHaveBeenCalledWith(onceTask.id);
  });

  test("registers trigger worker once", () => {
    const getTaskWorker = vi
      .fn()
      .mockReturnValueOnce(undefined)
      .mockReturnValueOnce({ name: TRIGGER_TASK_NAME });
    const registerTaskWorker = vi.fn();
    const runtimePartial: Partial<IAgentRuntime> = {
      getTaskWorker,
      registerTaskWorker,
    };

    registerTriggerTaskWorker(runtimePartial as IAgentRuntime);
    registerTriggerTaskWorker(runtimePartial as IAgentRuntime);
    expect(registerTaskWorker).toHaveBeenCalledTimes(1);
  });

  test("reports trigger health snapshot", async () => {
    const health = await getTriggerHealthSnapshot(runtime);
    expect(health.triggersEnabled).toBe(true);
    expect(health.activeTriggers).toBe(1);
    expect(health.disabledTriggers).toBe(0);
  });

  test("reads trigger config from task metadata", () => {
    const trigger = readTriggerConfig(tasks[0]);
    expect(trigger).not.toBeNull();
    expect(trigger?.triggerType).toBe("interval");
  });

  test("honors trigger feature flag settings", () => {
    const previous = process.env.MILAIDY_TRIGGERS_ENABLED;
    process.env.MILAIDY_TRIGGERS_ENABLED = "0";
    expect(triggersFeatureEnabled(runtime)).toBe(false);
    process.env.MILAIDY_TRIGGERS_ENABLED = previous;
  });

  test("executes cron trigger, dispatches and persists next schedule", async () => {
    const cronTask = makeTask(
      "00000000-0000-0000-0000-000000000102" as UUID,
      "cron",
    );
    const result = await executeTriggerTask(runtime, cronTask, {
      source: "scheduler",
    });

    expect(result.status).toBe("success");
    expect(result.taskDeleted).toBe(false);
    expect(injectInstructionMock).toHaveBeenCalledTimes(1);
    expect(updateTaskMock).toHaveBeenCalledTimes(1);

    // Verify the persisted metadata has a valid next cron run time
    const updateArgs = updateTaskMock.mock.calls[0];
    const updatedMetadata = updateArgs[1].metadata;
    expect(updatedMetadata?.trigger?.runCount).toBe(1);
    expect(updatedMetadata?.trigger?.lastStatus).toBe("success");
    expect(updatedMetadata?.trigger?.triggerType).toBe("cron");
    expect(typeof updatedMetadata?.updateInterval).toBe("number");
    expect(updatedMetadata?.updateInterval).toBeGreaterThan(0);
  });

  test("derives trigger limit from runtime setting", () => {
    const runtimeWithLimit = {
      ...runtime,
      getSetting: (key: string) =>
        key === "MILAIDY_TRIGGERS_MAX_ACTIVE" ? 12 : undefined,
    } as IAgentRuntime;
    expect(getTriggerLimit(runtimeWithLimit)).toBe(12);
  });
});
