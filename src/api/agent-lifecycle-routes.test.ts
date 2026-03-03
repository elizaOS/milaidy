import type { AgentRuntime } from "@elizaos/core";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { createRouteInvoker } from "../test-support/route-test-helpers";
import {
  type AgentLifecycleRouteState,
  handleAgentLifecycleRoutes,
} from "./agent-lifecycle-routes";

function createRuntimeWithAutonomyService(
  service: {
    enableAutonomy: () => Promise<void>;
    disableAutonomy: () => Promise<void>;
  },
  plugins: Array<{ name: string }> = [],
): AgentRuntime {
  return {
    plugins,
    getService: vi.fn((name: string) => (name === "AUTONOMY" ? service : null)),
  } as unknown as AgentRuntime;
}

describe("agent lifecycle routes", () => {
  let state: AgentLifecycleRouteState;
  let enableAutonomy: ReturnType<typeof vi.fn>;
  let disableAutonomy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    enableAutonomy = vi.fn(async () => undefined);
    disableAutonomy = vi.fn(async () => undefined);
    state = {
      runtime: createRuntimeWithAutonomyService(
        {
          enableAutonomy,
          disableAutonomy,
        },
        [{ name: "openai-main" }],
      ),
      agentState: "stopped",
      agentName: "Milady",
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
        json: (res, data, status) => ctx.json(res, data, status),
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

  test("starts the agent and enables autonomy", async () => {
    const result = await invoke({
      method: "POST",
      pathname: "/api/agent/start",
    });

    expect(result.status).toBe(200);
    expect(state.agentState).toBe("running");
    expect(state.model).toBe("openai-main");
    expect(state.startedAt).toBeTypeOf("number");
    expect(enableAutonomy).toHaveBeenCalledTimes(1);
    expect(result.payload).toMatchObject({
      ok: true,
      status: {
        state: "running",
        agentName: "Milady",
        model: "openai-main",
      },
    });
  });

  test("stops the agent and disables autonomy", async () => {
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
    expect(disableAutonomy).toHaveBeenCalledTimes(1);
    expect(result.payload).toMatchObject({
      ok: true,
      status: { state: "stopped", agentName: "Milady" },
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
    expect(disableAutonomy).toHaveBeenCalledTimes(1);
    expect(result.payload).toMatchObject({
      ok: true,
      status: {
        state: "paused",
        agentName: "Milady",
        model: "openai-main",
      },
    });
    expect(
      ((result.payload.status as Record<string, unknown>).uptime as number) > 0,
    ).toBe(true);
  });

  test("resumes the agent and enables autonomy", async () => {
    state.agentState = "paused";
    state.startedAt = Date.now() - 2_000;
    state.model = "openai-main";

    const result = await invoke({
      method: "POST",
      pathname: "/api/agent/resume",
    });

    expect(result.status).toBe(200);
    expect(state.agentState).toBe("running");
    expect(enableAutonomy).toHaveBeenCalledTimes(1);
    expect(result.payload).toMatchObject({
      ok: true,
      status: {
        state: "running",
        agentName: "Milady",
        model: "openai-main",
      },
    });
  });
});
