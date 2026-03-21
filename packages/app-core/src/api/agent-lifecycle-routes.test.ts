import type { AgentRuntime } from "@elizaos/core";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { createRouteInvoker } from "../test-support/route-test-helpers";
import {
  type AgentLifecycleRouteState,
  handleAgentLifecycleRoutes,
} from "./agent-lifecycle-routes";

function createRuntimeStub(
  plugins: Array<{ name: string }> = [],
): AgentRuntime {
  return {
    enableAutonomy: true,
    plugins,
    getService: vi.fn(() => null),
  } as unknown as unknown as AgentRuntime;
}

describe("agent lifecycle routes", () => {
  let state: AgentLifecycleRouteState;

  beforeEach(() => {
    state = {
      runtime: createRuntimeStub([{ name: "openai-main" }]),
      agentState: "stopped",
      agentName: "Eliza",
      model: undefined,
      startedAt: undefined,
    };
  });

  const invoke = createRouteInvoker<
    Record<string, unknown>,
    AgentLifecycleRouteState,
    Record<string, unknown>
  >(
    async (ctx) =>
      handleAgentLifecycleRoutes({
        req: ctx.req,
        res: ctx.res,
        method: ctx.method,
        pathname: ctx.pathname,
        state: ctx.runtime,
        error: (res, message, status) => ctx.error(res, message, status),
        json: (res, data, status) => ctx.json(res, data, status),
        readJsonBody: () => ctx.readJsonBody(),
      }),
    { runtimeProvider: () => state },
  );

  test("returns false for non-lifecycle routes", async () => {
    const result = await invoke({
      method: "GET",
      pathname: "/api/status",
    });

    expect(result.handled).toBe(false);
  });

  test("starts the agent in paused state", async () => {
    const result = await invoke({
      method: "POST",
      pathname: "/api/agent/start",
    });

    expect(result.status).toBe(200);
    expect(state.agentState).toBe("paused");
    expect(state.model).toBe("openai-main");
    expect(state.startedAt).toBeTypeOf("number");
    expect(result.payload).toMatchObject({
      ok: true,
      status: {
        state: "paused",
        agentName: "Eliza",
        model: "openai-main",
      },
    });
  });

  test("stops the agent", async () => {
    state.agentState = "running";
    state.startedAt = Date.now() - 3_000;
    state.model = "openai-main";

    const result = await invoke({
      method: "POST",
      pathname: "/api/agent/stop",
    });

    expect(result.status).toBe(200);
    expect(state.agentState).toBe("stopped");
    expect(state.startedAt).toBeUndefined();
    expect(state.model).toBeUndefined();
    expect(result.payload).toMatchObject({
      ok: true,
      status: { state: "stopped", agentName: "Eliza" },
    });
  });

  test("pauses the agent and reports uptime", async () => {
    state.agentState = "running";
    state.startedAt = Date.now() - 2_000;
    state.model = "openai-main";

    const result = await invoke({
      method: "POST",
      pathname: "/api/agent/pause",
    });

    expect(result.status).toBe(200);
    expect(state.agentState).toBe("paused");
    expect(result.payload).toMatchObject({
      ok: true,
      status: {
        state: "paused",
        agentName: "Eliza",
        model: "openai-main",
      },
    });
    expect(
      ((result.payload.status as Record<string, unknown>).uptime as number) > 0,
    ).toBe(true);
  });

  test("resumes the agent", async () => {
    state.agentState = "paused";
    state.startedAt = Date.now() - 2_000;
    state.model = "openai-main";

    const result = await invoke({
      method: "POST",
      pathname: "/api/agent/resume",
    });

    expect(result.status).toBe(200);
    expect(state.agentState).toBe("running");
    expect(result.payload).toMatchObject({
      ok: true,
      status: {
        state: "running",
        agentName: "Eliza",
        model: "openai-main",
      },
    });
  });

  test("reports autonomy enabled state", async () => {
    const result = await invoke({
      method: "GET",
      pathname: "/api/agent/autonomy",
    });

    expect(result.status).toBe(200);
    expect(result.payload).toEqual({ enabled: true });
  });

  test("toggles autonomy enabled state", async () => {
    const result = await invoke({
      method: "POST",
      pathname: "/api/agent/autonomy",
      body: { enabled: false },
    });

    expect(result.status).toBe(200);
    expect(
      (state.runtime as { enableAutonomy?: boolean } | null)?.enableAutonomy,
    ).toBe(false);
    expect(result.payload).toEqual({ enabled: false });
  });

  test("rejects invalid autonomy payloads", async () => {
    const result = await invoke({
      method: "POST",
      pathname: "/api/agent/autonomy",
      body: { enabled: "nope" },
    });

    expect(result.status).toBe(400);
    expect(result.payload).toEqual({ error: "enabled must be a boolean" });
  });
});
