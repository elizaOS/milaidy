/**
 * Unit tests for the RESTART_AGENT action.
 *
 * Uses a mock handler so the tests don't actually exit or restart anything.
 */

import type { ActionResult, Memory } from "@elizaos/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setRestartHandler } from "../runtime/restart";
import { restartAction } from "./restart";

// --- Mock runtime & message ------------------------------------------------

function mockRuntime() {
  return {
    agentId: "agent-test-id",
    createMemory: vi.fn().mockResolvedValue("mem-id"),
  } as unknown as Parameters<typeof restartAction.handler>[0];
}

function mockMessage() {
  return {
    roomId: "room-test-id",
    worldId: "world-test-id",
  } as unknown as Parameters<typeof restartAction.handler>[1];
}

// Prevent the default process.exit handler from firing.
beforeEach(() => {
  setRestartHandler(() => {
    /* no-op for tests */
  });
});

// Restore real timers even if a test assertion fails mid-flight.
afterEach(() => {
  vi.useRealTimers();
});

describe("RESTART_AGENT action", () => {
  it("has the correct name", () => {
    expect(restartAction.name).toBe("RESTART_AGENT");
  });

  it("includes common similes", () => {
    expect(restartAction.similes).toContain("RESTART");
    expect(restartAction.similes).toContain("REBOOT");
    expect(restartAction.similes).toContain("RELOAD");
  });

  it("validate always returns true", async () => {
    const result = await restartAction.validate(
      {} as Parameters<typeof restartAction.validate>[0],
      {} as Parameters<typeof restartAction.validate>[1],
      {} as Parameters<typeof restartAction.validate>[2],
    );
    expect(result).toBe(true);
  });

  it("handler returns a success response with restart text", async () => {
    const result = await restartAction.handler(
      mockRuntime(),
      mockMessage(),
      {} as Parameters<typeof restartAction.handler>[2],
      undefined,
    );

    expect(result).toBeDefined();
    const res = result as ActionResult;
    expect(res.success).toBe(true);
    expect(res.text).toBe("Restarting…");
    expect(res.values).toEqual({ restarting: true });
  });

  it("handler persists a restart memory", async () => {
    const rt = mockRuntime();

    await restartAction.handler(
      rt,
      mockMessage(),
      {} as Parameters<typeof restartAction.handler>[2],
      undefined,
    );

    const createMemory = rt.createMemory as ReturnType<typeof vi.fn>;
    expect(createMemory).toHaveBeenCalledOnce();

    const [memory, tableName] = createMemory.mock.calls[0] as [Memory, string];
    expect(tableName).toBe("messages");
    expect(memory.content.text).toBe("Restarting…");
    expect(memory.content.type).toBe("system");
    expect(memory.entityId).toBe("agent-test-id");
    expect(memory.roomId).toBe("room-test-id");
  });

  it("handler includes reason in the restart memory", async () => {
    const rt = mockRuntime();

    await restartAction.handler(
      rt,
      mockMessage(),
      {} as Parameters<typeof restartAction.handler>[2],
      { parameters: { reason: "code updated" } },
    );

    const createMemory = rt.createMemory as ReturnType<typeof vi.fn>;
    const [memory] = createMemory.mock.calls[0] as [Memory];
    expect(memory.content.text).toBe("Restarting… (code updated)");
  });

  it("handler schedules a delayed requestRestart call", async () => {
    vi.useFakeTimers();
    const handler = vi.fn();
    setRestartHandler(handler);

    await restartAction.handler(
      mockRuntime(),
      mockMessage(),
      {} as Parameters<typeof restartAction.handler>[2],
      undefined,
    );

    // Handler should NOT have been called yet (scheduled via setTimeout)
    expect(handler).not.toHaveBeenCalled();

    // Advance timers past the SHUTDOWN_DELAY_MS (1500ms)
    vi.advanceTimersByTime(2000);

    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith(undefined);
  });

  it("handler passes reason from parameters", async () => {
    vi.useFakeTimers();
    const handler = vi.fn();
    setRestartHandler(handler);

    await restartAction.handler(
      mockRuntime(),
      mockMessage(),
      {} as Parameters<typeof restartAction.handler>[2],
      { parameters: { reason: "code updated" } },
    );

    vi.advanceTimersByTime(2000);

    expect(handler).toHaveBeenCalledWith("code updated");
  });

  it("handler still succeeds if createMemory throws", async () => {
    const rt = mockRuntime();
    (rt.createMemory as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("db offline"),
    );

    const result = await restartAction.handler(
      rt,
      mockMessage(),
      {} as Parameters<typeof restartAction.handler>[2],
      undefined,
    );

    const res = result as ActionResult;
    expect(res.success).toBe(true);
    expect(res.text).toBe("Restarting…");
  });
});
