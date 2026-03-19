import { sendSignalMessage } from "@elizaos/plugin-signal/actions";
import { beforeEach, describe, expect, it, vi } from "vitest";

function createRuntime(overrides: Record<string, unknown> = {}) {
  return {
    hasService: vi.fn().mockReturnValue(true),
    sendMessageToTarget: vi.fn().mockResolvedValue(undefined),
    logger: {
      warn: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
    },
    ...overrides,
  };
}

function createMessage(overrides: Record<string, unknown> = {}) {
  return {
    roomId: "00000000-0000-0000-0000-000000000010",
    ...overrides,
  };
}

describe("sendSignalMessage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("validates against the signal service", async () => {
    const runtime = createRuntime();

    await expect(
      sendSignalMessage.validate?.(runtime as never, createMessage() as never),
    ).resolves.toBe(true);

    runtime.hasService = vi.fn().mockReturnValue(false);

    await expect(
      sendSignalMessage.validate?.(runtime as never, createMessage() as never),
    ).resolves.toBe(false);
  });

  it("returns an error when params are missing", async () => {
    const runtime = createRuntime();
    const callback = vi.fn().mockResolvedValue([]);

    const result = await sendSignalMessage.handler?.(
      runtime as never,
      createMessage() as never,
      undefined,
      { parameters: { phoneNumber: "+14155551234" } },
      callback,
    );

    expect(result).toEqual({ success: false });
    expect(runtime.logger.warn).toHaveBeenCalledWith(
      "[signal] SEND_SIGNAL_MESSAGE missing phoneNumber or message params",
    );
    expect(callback).toHaveBeenCalledWith({
      text: "I need both a phone number (or UUID) and a message to send on Signal.",
      actions: [],
    });
  });

  it("sends a message via sendMessageToTarget", async () => {
    const runtime = createRuntime();
    const callback = vi.fn().mockResolvedValue([]);
    const message = createMessage();

    const result = await sendSignalMessage.handler?.(
      runtime as never,
      message as never,
      undefined,
      {
        parameters: {
          phoneNumber: "+14155551234",
          message: "hello from signal",
        },
      },
      callback,
    );

    expect(result).toEqual({ success: true });
    expect(runtime.sendMessageToTarget).toHaveBeenCalledWith(
      {
        source: "signal",
        channelId: "+14155551234",
        roomId: message.roomId,
      },
      {
        text: "hello from signal",
      },
    );
    expect(runtime.logger.info).toHaveBeenCalledWith(
      "[signal] Sent message to +14155551234 via SEND_SIGNAL_MESSAGE action",
    );
    expect(callback).toHaveBeenCalledWith({
      text: "Message sent to +14155551234 on Signal.",
      actions: [],
    });
  });

  it("surfaces send failures", async () => {
    const runtime = createRuntime({
      sendMessageToTarget: vi.fn().mockRejectedValue(new Error("send failed")),
    });
    const callback = vi.fn().mockResolvedValue([]);

    const result = await sendSignalMessage.handler?.(
      runtime as never,
      createMessage() as never,
      undefined,
      {
        parameters: {
          phoneNumber: "+14155551234",
          message: "hello from signal",
        },
      },
      callback,
    );

    expect(result).toEqual({ success: false });
    expect(runtime.logger.error).toHaveBeenCalledWith(
      "[signal] Failed to send Signal message: send failed",
    );
    expect(callback).toHaveBeenCalledWith({
      text: "Failed to send Signal message: send failed",
      actions: [],
    });
  });

  it("exposes the expected metadata", () => {
    expect(sendSignalMessage.name).toBe("SEND_SIGNAL_MESSAGE");
    expect(sendSignalMessage.similes).toEqual([
      "SIGNAL_MESSAGE",
      "TEXT_ON_SIGNAL",
      "MESSAGE_ON_SIGNAL",
      "SEND_SIGNAL",
    ]);
    expect(sendSignalMessage.parameters).toHaveLength(2);
    expect(sendSignalMessage.examples).toHaveLength(1);
  });
});
