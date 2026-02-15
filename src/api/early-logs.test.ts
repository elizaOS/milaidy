import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@elizaos/core", () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe("captureEarlyLogs", () => {
  beforeEach(async () => {
    vi.resetModules();
    const { logger } = await import("@elizaos/core");
    logger.info = vi.fn();
    logger.debug = vi.fn();
    logger.warn = vi.fn();
    logger.error = vi.fn();
  });

  it("patches the global logger", async () => {
    const { logger } = await import("@elizaos/core");
    const { captureEarlyLogs } = await import("./early-logs.js");
    const originalInfo = logger.info;

    captureEarlyLogs();

    expect(logger.info).not.toBe(originalInfo);
  });

  it("calls the original logger after buffering", async () => {
    const { logger } = await import("@elizaos/core");
    const { captureEarlyLogs } = await import("./early-logs.js");

    const originalInfo = logger.info;

    captureEarlyLogs();

    logger.info("test message");

    expect(originalInfo).toHaveBeenCalledWith("test message");
  });

  it("does not patch twice", async () => {
    const { logger } = await import("@elizaos/core");
    const { captureEarlyLogs } = await import("./early-logs.js");

    captureEarlyLogs();
    const patchedInfo = logger.info;

    captureEarlyLogs();
    expect(logger.info).toBe(patchedInfo);
  });
});
