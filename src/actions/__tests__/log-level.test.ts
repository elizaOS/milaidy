import { beforeEach, describe, expect, it, vi } from "vitest";
import { logLevelAction } from "../../actions/log-level";

// Mock @elizaos/core
vi.mock("@elizaos/core", () => {
  return {
    elizaLogger: {
      info: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
    },
    loggerScope: {
      getStore: vi.fn(),
    },
  };
});

describe("logLevelAction", () => {
  let mockRuntime;
  let mockMessage;
  let mockCallback;

  beforeEach(() => {
    mockRuntime = {
      logLevelOverrides: new Map(),
    };
    mockMessage = {
      roomId: "test-room-id",
      content: { text: "" },
    };
    mockCallback = vi.fn();
  });

  it("should set log level override when valid level provided", async () => {
    mockMessage.content.text = "/logLevel debug";

    const result = await logLevelAction.handler(
      mockRuntime,
      mockMessage,
      undefined,
      undefined,
      mockCallback,
    );

    expect(result.success).toBe(true);
    expect(mockRuntime.logLevelOverrides.get("test-room-id")).toBe("debug");
    expect(mockCallback).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining("DEBUG"),
        action: "LOG_LEVEL_SET",
      }),
    );
  });

  it("should fail gracefully when invalid level provided", async () => {
    mockMessage.content.text = "/logLevel invalid_level";

    const result = await logLevelAction.handler(
      mockRuntime,
      mockMessage,
      undefined,
      undefined,
      mockCallback,
    );

    expect(result.success).toBe(false);
    expect(mockRuntime.logLevelOverrides.has("test-room-id")).toBe(false);
    expect(mockCallback).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "LOG_LEVEL_FAILED",
      }),
    );
  });

  it("should fail if runtime does not support overrides (missing map)", async () => {
    const legacyRuntime = {};
    mockMessage.content.text = "/logLevel debug";

    const result = await logLevelAction.handler(
      legacyRuntime,
      mockMessage,
      undefined,
      undefined,
      mockCallback,
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe("Not supported");
  });
});
