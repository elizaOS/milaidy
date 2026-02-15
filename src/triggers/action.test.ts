import type { IAgentRuntime, Memory, UUID } from "@elizaos/core";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { createTriggerTaskAction } from "./action.js";

function makeMessage(text: string): Memory {
  return {
    id: "00000000-0000-0000-0000-000000000300" as UUID,
    roomId: "00000000-0000-0000-0000-000000000301" as UUID,
    entityId: "00000000-0000-0000-0000-000000000302" as UUID,
    agentId: "00000000-0000-0000-0000-000000000303" as UUID,
    content: { text },
    createdAt: Date.now(),
  };
}

describe("createTriggerTaskAction", () => {
  let runtime: IAgentRuntime;
  let createTaskMock: ReturnType<typeof vi.fn>;
  let getTasksMock: ReturnType<typeof vi.fn>;
  let useModelMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    createTaskMock = vi.fn(
      async (_task) => "00000000-0000-0000-0000-000000000777" as UUID,
    );
    getTasksMock = vi.fn(async () => []);
    useModelMock = vi.fn(async () =>
      [
        "<response>",
        "<triggerType>interval</triggerType>",
        "<displayName>Status heartbeat</displayName>",
        "<instructions>Post a status heartbeat.</instructions>",
        "<intervalMs>180000</intervalMs>",
        "<wakeMode>inject_now</wakeMode>",
        "</response>",
      ].join("\n"),
    );

    const runtimePartial: Partial<IAgentRuntime> = {
      agentId: "00000000-0000-0000-0000-000000000303" as UUID,
      enableAutonomy: true,
      useModel: useModelMock,
      getTasks: getTasksMock,
      createTask: createTaskMock,
      getTask: async () => ({
        id: "00000000-0000-0000-0000-000000000777" as UUID,
        name: "TRIGGER_DISPATCH",
        description: "Status heartbeat",
        tags: ["queue", "repeat", "trigger"],
        metadata: {
          trigger: {
            triggerId: "00000000-0000-0000-0000-000000000778" as UUID,
            displayName: "Status heartbeat",
            instructions: "Post a status heartbeat.",
            triggerType: "interval",
            enabled: true,
            wakeMode: "inject_now",
            createdBy: "tester",
            runCount: 0,
            intervalMs: 180000,
          },
        },
      }),
      getService: () =>
        ({
          getAutonomousRoomId: () =>
            "00000000-0000-0000-0000-000000000304" as UUID,
        }) as { getAutonomousRoomId: () => UUID },
      getSetting: () => undefined,
    };
    runtime = runtimePartial as IAgentRuntime;
  });

  test("uses a trigger-specific action name", () => {
    expect(createTriggerTaskAction.name).toBe("CREATE_TRIGGER_TASK");
    expect(createTriggerTaskAction.similes ?? []).not.toContain("CREATE_TASK");
  });

  test("validates trigger language when autonomy is enabled", async () => {
    const valid = await createTriggerTaskAction.validate(
      runtime,
      makeMessage("create a trigger every 3 minutes"),
    );
    expect(valid).toBe(true);
  });

  test("creates trigger task from extraction", async () => {
    const result = await createTriggerTaskAction.handler(
      runtime,
      makeMessage(
        "create a trigger every 3 minutes to post a status heartbeat",
      ),
    );
    expect(result?.success).toBe(true);
    expect(createTaskMock).toHaveBeenCalledTimes(1);
    const taskArg = createTaskMock.mock.calls[0][0];
    expect(taskArg.name).toBe("TRIGGER_DISPATCH");
    expect(taskArg.metadata.trigger.displayName).toBe("Status heartbeat");
  });

  test("returns duplicate response for matching dedupe key", async () => {
    getTasksMock.mockResolvedValueOnce([
      {
        id: "00000000-0000-0000-0000-000000000999" as UUID,
        metadata: {
          trigger: {
            triggerId: "00000000-0000-0000-0000-000000000998" as UUID,
            enabled: true,
            triggerType: "interval",
            instructions: "Post a status heartbeat.",
            intervalMs: 180000,
            createdBy: "00000000-0000-0000-0000-000000000302",
          },
        },
      },
    ]);

    const result = await createTriggerTaskAction.handler(
      runtime,
      makeMessage(
        "create a trigger every 3 minutes to post a status heartbeat",
      ),
    );

    expect(result?.success).toBe(true);
    expect(result?.text).toContain("Equivalent trigger already exists");
    expect(createTaskMock).not.toHaveBeenCalled();
  });
});
