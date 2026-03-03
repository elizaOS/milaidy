import type { AgentRuntime, Task, UUID } from "@elizaos/core";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { createRouteInvoker } from "../test-support/route-test-helpers";
import { handleTriggerRoutes } from "./trigger-routes";

describe("trigger routes", () => {
  let tasks: Task[];
  let runtime: AgentRuntime;

  beforeEach(() => {
    tasks = [];
    const runtimePartial: Partial<AgentRuntime> = {
      agentId: "00000000-0000-0000-0000-000000000001" as UUID,
      getSetting: () => undefined,
      getService: () =>
        ({
          getAutonomousRoomId: () =>
            "00000000-0000-0000-0000-000000000201" as UUID,
          injectAutonomousInstruction: async () => undefined,
        }) as { getAutonomousRoomId: () => UUID },
      getTasks: async () => tasks,
      getTask: async (taskId: UUID) =>
        tasks.find((task) => task.id === taskId) ?? null,
      createTask: async (task) => {
        const created: Task = {
          ...task,
          id: `00000000-0000-0000-0000-${String(tasks.length + 1).padStart(12, "0")}` as UUID,
        };
        tasks.push(created);
        return created.id as UUID;
      },
      updateTask: async (taskId: UUID, update) => {
        tasks = tasks.map((task) =>
          task.id === taskId
            ? {
                ...task,
                ...update,
                metadata: {
                  ...(task.metadata ?? {}),
                  ...(update.metadata ?? {}),
                },
              }
            : task,
        );
      },
      deleteTask: async (taskId: UUID) => {
        tasks = tasks.filter((task) => task.id !== taskId);
      },
      logger: {
        info: vi.fn(),
        error: vi.fn(),
      } as AgentRuntime["logger"],
    };
    runtime = runtimePartial as AgentRuntime;
  });

  const invoke = createRouteInvoker<
    Record<string, string | number | boolean | null | object | undefined>,
    AgentRuntime | null,
    object
  >(
    (ctx) =>
      handleTriggerRoutes({
        req: ctx.req,
        res: ctx.res,
        method: ctx.method,
        pathname: ctx.pathname,
        runtime: ctx.runtime,
        readJsonBody: async () => ctx.readJsonBody(),
        json: (res, data, status) => ctx.json(res, data, status),
        error: (res, message, status) => ctx.error(res, message, status),
      }),
    { runtimeProvider: () => runtime },
  );

  test("returns false for non-trigger paths", async () => {
    const result = await invoke({
      method: "GET",
      pathname: "/api/status",
    });
    expect(result.handled).toBe(false);
  });

  test("returns 503 when runtime is absent", async () => {
    const result = await invoke({
      method: "GET",
      pathname: "/api/triggers",
      runtimeOverride: null,
    });
    expect(result.handled).toBe(true);
    expect(result.status).toBe(503);
  });

  test("creates and lists triggers", async () => {
    const createResult = await invoke({
      method: "POST",
      pathname: "/api/triggers",
      body: {
        displayName: "Heartbeat",
        instructions: "Summarize pending tasks.",
        triggerType: "interval",
        intervalMs: 120000,
        wakeMode: "inject_now",
        createdBy: "tester",
      },
    });

    expect(createResult.status).toBe(201);
    const createdTrigger = (
      createResult.payload as { trigger?: { id?: string } }
    ).trigger;
    expect(createdTrigger?.id).toBeDefined();

    const listResult = await invoke({
      method: "GET",
      pathname: "/api/triggers",
    });
    expect(listResult.status).toBe(200);
    const triggers =
      (listResult.payload as { triggers?: object[] }).triggers ?? [];
    expect(triggers.length).toBe(1);
  });

  test("updates and deletes trigger by trigger id", async () => {
    const create = await invoke({
      method: "POST",
      pathname: "/api/triggers",
      body: {
        displayName: "Daily Digest",
        instructions: "Generate digest",
        triggerType: "interval",
        intervalMs: 300000,
      },
    });
    const triggerId =
      ((create.payload as { trigger?: { id?: string } }).trigger
        ?.id as string) ?? "";
    expect(triggerId).not.toBe("");

    const update = await invoke({
      method: "PUT",
      pathname: `/api/triggers/${encodeURIComponent(triggerId)}`,
      body: {
        enabled: false,
      },
    });
    expect(update.status).toBe(200);
    const updatedEnabled = (
      update.payload as { trigger?: { enabled?: boolean } }
    ).trigger?.enabled;
    expect(updatedEnabled).toBe(false);

    const remove = await invoke({
      method: "DELETE",
      pathname: `/api/triggers/${encodeURIComponent(triggerId)}`,
    });
    expect(remove.status).toBe(200);
    expect(tasks.length).toBe(0);
  });

  test("returns trigger health snapshot", async () => {
    const health = await invoke({
      method: "GET",
      pathname: "/api/triggers/health",
    });
    expect(health.status).toBe(200);
    const payload = health.payload as {
      triggersEnabled?: boolean;
      activeTriggers?: number;
    };
    expect(payload.triggersEnabled).toBe(true);
    expect(payload.activeTriggers).toBe(0);
  });

  test("executes trigger manually and returns runs", async () => {
    const create = await invoke({
      method: "POST",
      pathname: "/api/triggers",
      body: {
        displayName: "Run test",
        instructions: "Run once now",
        triggerType: "interval",
        intervalMs: 120000,
      },
    });
    const triggerId =
      ((create.payload as { trigger?: { id?: string } }).trigger
        ?.id as string) ?? "";
    expect(triggerId).not.toBe("");

    const execute = await invoke({
      method: "POST",
      pathname: `/api/triggers/${encodeURIComponent(triggerId)}/execute`,
    });
    expect(execute.status).toBe(200);
    const executeResult = execute.payload as {
      result?: { status?: string };
    };
    expect(executeResult.result?.status).toBe("success");

    const runs = await invoke({
      method: "GET",
      pathname: `/api/triggers/${encodeURIComponent(triggerId)}/runs`,
    });
    expect(runs.status).toBe(200);
    const runItems =
      (runs.payload as { runs?: Array<{ status: string }> }).runs ?? [];
    expect(runItems.length).toBeGreaterThan(0);
    expect(runItems[0].status).toBe("success");
  });
});
