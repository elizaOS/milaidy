import { describe, expect, it, vi } from "vitest";
import { createMiladyPlugin } from "../runtime/milady-plugin";
import { sendMessageAction } from "./send-message";

function mockRuntime(service: unknown) {
  return {
    getService: vi.fn(() => service),
  } as unknown as Parameters<typeof sendMessageAction.handler>[0];
}

describe("SEND_MESSAGE action", () => {
  it("is registered on the Milady plugin", () => {
    const plugin = createMiladyPlugin();
    const actionNames = (plugin.actions ?? []).map((action) => action.name);
    expect(actionNames).toContain("SEND_MESSAGE");
  });

  it("rejects missing required parameters", async () => {
    const result = await sendMessageAction.handler(
      mockRuntime(null),
      {} as Parameters<typeof sendMessageAction.handler>[1],
      {} as Parameters<typeof sendMessageAction.handler>[2],
      { parameters: { targetType: "user" } },
    );

    expect(result?.success).toBe(false);
    expect(result?.values).toMatchObject({ error: "INVALID_PARAMETERS" });
  });

  it("fails when source service is not available", async () => {
    const result = await sendMessageAction.handler(
      mockRuntime(null),
      {} as Parameters<typeof sendMessageAction.handler>[1],
      {} as Parameters<typeof sendMessageAction.handler>[2],
      {
        parameters: {
          targetType: "user",
          source: "telegram",
          target: "user-1",
          text: "hello",
        },
      },
    );

    expect(result?.success).toBe(false);
    expect(result?.values).toMatchObject({ error: "SERVICE_NOT_FOUND" });
  });

  it("sends direct messages to users", async () => {
    const sendDirectMessage = vi.fn(async () => undefined);
    const result = await sendMessageAction.handler(
      mockRuntime({ sendDirectMessage }),
      {} as Parameters<typeof sendMessageAction.handler>[1],
      {} as Parameters<typeof sendMessageAction.handler>[2],
      {
        parameters: {
          targetType: "user",
          source: "benchmark",
          target: "user-42",
          text: "ping",
        },
      },
    );

    expect(sendDirectMessage).toHaveBeenCalledWith("user-42", {
      text: "ping",
      source: "benchmark",
    });
    expect(result?.success).toBe(true);
    expect(result?.values).toMatchObject({ targetType: "user" });
  });

  it("sends room messages to rooms", async () => {
    const sendRoomMessage = vi.fn(async () => undefined);
    const result = await sendMessageAction.handler(
      mockRuntime({ sendRoomMessage }),
      {} as Parameters<typeof sendMessageAction.handler>[1],
      {} as Parameters<typeof sendMessageAction.handler>[2],
      {
        parameters: {
          targetType: "room",
          source: "benchmark",
          target: "room-9",
          text: "broadcast",
        },
      },
    );

    expect(sendRoomMessage).toHaveBeenCalledWith("room-9", {
      text: "broadcast",
      source: "benchmark",
    });
    expect(result?.success).toBe(true);
    expect(result?.values).toMatchObject({ targetType: "room" });
  });
});
