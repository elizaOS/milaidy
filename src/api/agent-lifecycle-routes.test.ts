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
  let onRestart: (() => Promise<AgentRuntime | null>) | undefined;

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
    onRestart = undefined;
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
        onRestart,
        json: (res, data, status) => ctx.json(res, data, status),
        error: (res, message, status) => ctx.error(res, message, status),
      }),
    { runtimeProvider: () => state },
  );

  async function flushAsyncStart(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

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

  test("start returns 503 when runtime is unavailable", async () => {
    state.runtime = null;

    const result = await invoke({
      method: "POST",
      pathname: "/api/agent/start",
    });

    expect(result.status).toBe(503);
    expect(state.agentState).toBe("not_started");
    expect(state.startedAt).toBeUndefined();
    expect(state.model).toBeUndefined();
    expect(result.payload).toMatchObject({
      error: "Agent is not running",
    });
    expect(enableAutonomy).not.toHaveBeenCalled();
  });

  test("start returns initializing message when runtime is booting without restart handler", async () => {
    state.runtime = null;
    state.agentState = "starting";

    const result = await invoke({
      method: "POST",
      pathname: "/api/agent/start",
    });

    expect(result.status).toBe(200);
    expect(result.payload).toMatchObject({
      ok: true,
      status: {
        state: "starting",
        agentName: "Milady",
      },
    });
  });

  test("start does not trigger restart while runtime is already booting", async () => {
    state.runtime = null;
    state.agentState = "restarting";
    onRestart = vi.fn(async () =>
      createRuntimeWithAutonomyService(
        {
          enableAutonomy,
          disableAutonomy,
        },
        [{ name: "openai-recovered" }],
      ),
    );

    const result = await invoke({
      method: "POST",
      pathname: "/api/agent/start",
    });

    expect(result.status).toBe(200);
    expect(result.payload).toMatchObject({
      ok: true,
      status: {
        state: "starting",
      },
    });
    expect(onRestart).not.toHaveBeenCalled();
  });

  test("start bootstraps runtime through restart handler when runtime is unavailable", async () => {
    state.runtime = null;
    onRestart = vi.fn(async () =>
      createRuntimeWithAutonomyService(
        {
          enableAutonomy,
          disableAutonomy,
        },
        [{ name: "openai-recovered" }],
      ),
    );

    const result = await invoke({
      method: "POST",
      pathname: "/api/agent/start",
    });
    await flushAsyncStart();

    expect(result.status).toBe(200);
    expect(result.payload).toMatchObject({
      ok: true,
      status: { state: "starting" },
    });
    expect(onRestart).toHaveBeenCalledTimes(1);
    expect(state.agentState).toBe("running");
    expect(state.model).toBe("openai-recovered");
    expect(enableAutonomy).toHaveBeenCalledTimes(1);
  });

  test("start returns initializing message when restart handler returns null", async () => {
    state.runtime = null;
    state.agentState = "restarting";
    onRestart = vi.fn(async () => null);

    const result = await invoke({
      method: "POST",
      pathname: "/api/agent/start",
    });

    expect(result.status).toBe(200);
    expect(result.payload).toMatchObject({
      ok: true,
      status: {
        state: "starting",
      },
    });
  });

  test("start reports starting immediately when restart handler throws", async () => {
    state.runtime = null;
    onRestart = vi.fn(async () => {
      throw new Error("bootstrap failed");
    });

    const result = await invoke({
      method: "POST",
      pathname: "/api/agent/start",
    });
    await flushAsyncStart();

    expect(result.status).toBe(200);
    expect(result.payload).toMatchObject({
      ok: true,
      status: { state: "starting" },
    });
    expect(state.agentState).toBe("starting");
  });

  test("start returns immediately even when restart handler begins with sync work", async () => {
    state.runtime = null;
    onRestart = vi.fn(async () => {
      const blockStart = Date.now();
      while (Date.now() - blockStart < 200) {
        // Simulate expensive synchronous setup before first await.
      }
      return createRuntimeWithAutonomyService(
        {
          enableAutonomy,
          disableAutonomy,
        },
        [{ name: "openai-recovered" }],
      );
    });

    const startedAt = Date.now();
    const result = await invoke({
      method: "POST",
      pathname: "/api/agent/start",
    });
    const elapsedMs = Date.now() - startedAt;
    await flushAsyncStart();

    expect(result.status).toBe(200);
    expect(result.payload).toMatchObject({
      ok: true,
      status: { state: "starting" },
    });
    expect(elapsedMs).toBeLessThan(100);
    expect(onRestart).toHaveBeenCalledTimes(1);
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

  test("pause/resume return 503 when runtime is unavailable", async () => {
    state.runtime = null;
    state.agentState = "running";
    state.startedAt = Date.now() - 1_000;
    state.model = "openai-main";

    const paused = await invoke({
      method: "POST",
      pathname: "/api/agent/pause",
    });
    expect(paused.status).toBe(503);
    expect(paused.payload).toMatchObject({ error: "Agent is not running" });

    const resumed = await invoke({
      method: "POST",
      pathname: "/api/agent/resume",
    });
    expect(resumed.status).toBe(503);
    expect(resumed.payload).toMatchObject({ error: "Agent is not running" });
    expect(enableAutonomy).not.toHaveBeenCalled();
    expect(disableAutonomy).not.toHaveBeenCalled();
  });
});
