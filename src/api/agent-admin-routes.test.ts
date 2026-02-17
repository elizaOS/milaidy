import type { AgentRuntime, UUID } from "@elizaos/core";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { MiladyConfig } from "../config/config";
import { createRouteInvoker } from "../test-support/route-test-helpers";
import {
  type AgentAdminRouteState,
  handleAgentAdminRoutes,
} from "./agent-admin-routes";

function createRuntime(name = "Milady"): AgentRuntime {
  return {
    character: { name },
    stop: vi.fn(async () => undefined),
  } as unknown as AgentRuntime;
}

describe("agent admin routes", () => {
  let state: AgentAdminRouteState;
  let onRestart: (() => Promise<AgentRuntime | null>) | undefined;
  let resolveStateDir: ReturnType<typeof vi.fn>;
  let resolvePath: ReturnType<typeof vi.fn>;
  let getHomeDir: ReturnType<typeof vi.fn>;
  let isSafeResetStateDir: ReturnType<typeof vi.fn>;
  let stateDirExists: ReturnType<typeof vi.fn>;
  let removeStateDir: ReturnType<typeof vi.fn>;
  let logWarn: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    state = {
      runtime: createRuntime(),
      config: {} as MiladyConfig,
      agentState: "running",
      agentName: "Milady",
      model: "openai",
      startedAt: Date.now() - 1000,
      chatRoomId: "room-id" as UUID,
      chatUserId: "user-id" as UUID,
      chatConnectionReady: {
        userId: "user-id" as UUID,
        roomId: "room-id" as UUID,
        worldId: "world-id" as UUID,
      },
      chatConnectionPromise: Promise.resolve(),
    };

    onRestart = undefined;
    resolveStateDir = vi.fn(() => "/tmp/milady-state");
    resolvePath = vi.fn((value: string) => value);
    getHomeDir = vi.fn(() => "/Users/tester");
    isSafeResetStateDir = vi.fn(() => true);
    stateDirExists = vi.fn(() => true);
    removeStateDir = vi.fn();
    logWarn = vi.fn();
  });

  const invoke = createRouteInvoker<
    Record<string, unknown>,
    AgentAdminRouteState,
    Record<string, unknown>
  >(
    async (ctx) =>
      handleAgentAdminRoutes({
        req: ctx.req,
        res: ctx.res,
        method: ctx.method,
        pathname: ctx.pathname,
        state: ctx.runtime,
        onRestart,
        json: (res, data, status) => ctx.json(res, data, status),
        error: (res, message, status) => ctx.error(res, message, status),
        resolveStateDir,
        resolvePath,
        getHomeDir,
        isSafeResetStateDir,
        stateDirExists,
        removeStateDir,
        logWarn,
      }),
    { runtimeProvider: () => state },
  );

  test("returns false for non-admin routes", async () => {
    const result = await invoke({
      method: "GET",
      pathname: "/api/status",
    });

    expect(result.handled).toBe(false);
  });

  test("rejects restart when handler is unavailable", async () => {
    const result = await invoke({
      method: "POST",
      pathname: "/api/agent/restart",
    });

    expect(result.status).toBe(501);
    expect(result.payload).toMatchObject({
      error:
        "Restart is not supported in this mode (no restart handler registered)",
    });
  });

  test("rejects overlapping restart requests", async () => {
    state.agentState = "restarting";
    onRestart = vi.fn(async () => createRuntime("Sakuya"));

    const result = await invoke({
      method: "POST",
      pathname: "/api/agent/restart",
    });

    expect(result.status).toBe(409);
    expect(result.payload).toMatchObject({
      error: "A restart is already in progress",
    });
  });

  test("restarts runtime and updates state", async () => {
    onRestart = vi.fn(async () => createRuntime("Sakuya"));

    const result = await invoke({
      method: "POST",
      pathname: "/api/agent/restart",
    });

    expect(result.status).toBe(200);
    expect(state.agentState).toBe("running");
    expect(state.agentName).toBe("Sakuya");
    expect(state.chatConnectionReady).toBeNull();
    expect(state.chatConnectionPromise).toBeNull();
    expect(result.payload).toMatchObject({
      ok: true,
      status: { state: "running", agentName: "Sakuya" },
    });
  });

  test("restores previous state if restart handler returns null", async () => {
    state.agentState = "paused";
    onRestart = vi.fn(async () => null);

    const result = await invoke({
      method: "POST",
      pathname: "/api/agent/restart",
    });

    expect(result.status).toBe(500);
    expect(state.agentState).toBe("paused");
    expect(result.payload).toMatchObject({
      error: "Restart handler returned null — runtime failed to re-initialize",
    });
  });

  test("rejects unsafe reset path", async () => {
    isSafeResetStateDir.mockReturnValue(false);

    const result = await invoke({
      method: "POST",
      pathname: "/api/agent/reset",
    });

    expect(result.status).toBe(400);
    expect(result.payload).toMatchObject({
      error: expect.stringContaining("does not appear safe to delete"),
    });
    expect(removeStateDir).not.toHaveBeenCalled();
  });

  test("resets runtime and clears server state", async () => {
    const result = await invoke({
      method: "POST",
      pathname: "/api/agent/reset",
    });

    expect(result.status).toBe(200);
    expect(result.payload).toMatchObject({ ok: true });
    expect(state.runtime).toBeNull();
    expect(state.agentState).toBe("stopped");
    expect(state.agentName).toBe("Milady");
    expect(state.model).toBeUndefined();
    expect(state.startedAt).toBeUndefined();
    expect(state.chatRoomId).toBeNull();
    expect(state.chatUserId).toBeNull();
    expect(state.chatConnectionReady).toBeNull();
    expect(state.chatConnectionPromise).toBeNull();
    expect(removeStateDir).toHaveBeenCalledWith("/tmp/milady-state");
  });
});
