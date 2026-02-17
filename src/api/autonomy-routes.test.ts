import type { AgentRuntime } from "@elizaos/core";
import { describe, expect, test, vi } from "vitest";
import { createRouteInvoker } from "../test-support/route-test-helpers";
import {
  getAutonomyState,
  getAutonomySvc,
  handleAutonomyRoutes,
} from "./autonomy-routes";

type RuntimeStub = AgentRuntime | null;

function createRuntimeWithAutonomyService(service: {
  enableAutonomy: () => Promise<void>;
  disableAutonomy: () => Promise<void>;
  isLoopRunning: () => boolean;
  getStatus?: () => { enabled?: boolean };
}): AgentRuntime {
  return {
    getService: vi.fn((name: string) => (name === "AUTONOMY" ? service : null)),
  } as unknown as AgentRuntime;
}

describe("autonomy routes", () => {
  const invoke = createRouteInvoker<
    { enabled?: boolean },
    RuntimeStub,
    Record<string, unknown> | null
  >(
    async (ctx) =>
      handleAutonomyRoutes({
        req: ctx.req,
        res: ctx.res,
        method: ctx.method,
        pathname: ctx.pathname,
        runtime: ctx.runtime,
        readJsonBody: async () => ctx.readJsonBody(),
        json: (res, data, status) => ctx.json(res, data, status),
      }),
    { runtime: null },
  );

  test("returns false for non-autonomy routes", async () => {
    const result = await invoke({
      method: "GET",
      pathname: "/api/status",
    });

    expect(result.handled).toBe(false);
  });

  test("returns autonomy state for GET", async () => {
    const service = {
      enableAutonomy: vi.fn(async () => undefined),
      disableAutonomy: vi.fn(async () => undefined),
      isLoopRunning: vi.fn(() => true),
      getStatus: vi.fn(() => ({ enabled: true })),
    };
    const runtime = createRuntimeWithAutonomyService(service);

    const result = await invoke({
      method: "GET",
      pathname: "/api/agent/autonomy",
      runtimeOverride: runtime,
    });

    expect(result.handled).toBe(true);
    expect(result.status).toBe(200);
    expect(result.payload).toMatchObject({ enabled: true, thinking: true });
  });

  test("enables autonomy via POST body", async () => {
    const service = {
      enableAutonomy: vi.fn(async () => undefined),
      disableAutonomy: vi.fn(async () => undefined),
      isLoopRunning: vi.fn(() => false),
      getStatus: vi.fn(() => ({ enabled: true })),
    };
    const runtime = createRuntimeWithAutonomyService(service);

    const result = await invoke({
      method: "POST",
      pathname: "/api/agent/autonomy",
      runtimeOverride: runtime,
      body: { enabled: true },
    });

    expect(result.status).toBe(200);
    expect(result.payload).toMatchObject({
      ok: true,
      autonomy: true,
      thinking: false,
    });
    expect(service.enableAutonomy).toHaveBeenCalledTimes(1);
    expect(service.disableAutonomy).not.toHaveBeenCalled();
  });

  test("disables autonomy via POST body", async () => {
    const service = {
      enableAutonomy: vi.fn(async () => undefined),
      disableAutonomy: vi.fn(async () => undefined),
      isLoopRunning: vi.fn(() => false),
      getStatus: vi.fn(() => ({ enabled: false })),
    };
    const runtime = createRuntimeWithAutonomyService(service);

    const result = await invoke({
      method: "POST",
      pathname: "/api/agent/autonomy",
      runtimeOverride: runtime,
      body: { enabled: false },
    });

    expect(result.status).toBe(200);
    expect(result.payload).toMatchObject({
      ok: true,
      autonomy: false,
      thinking: false,
    });
    expect(service.disableAutonomy).toHaveBeenCalledTimes(1);
    expect(service.enableAutonomy).not.toHaveBeenCalled();
  });
});

describe("autonomy state helpers", () => {
  test("returns null autonomy service when runtime is missing", () => {
    expect(getAutonomySvc(null)).toBeNull();
  });

  test("getAutonomyState falls back to runtime flag when no explicit status", () => {
    const service = {
      enableAutonomy: vi.fn(async () => undefined),
      disableAutonomy: vi.fn(async () => undefined),
      isLoopRunning: vi.fn(() => false),
    };
    const runtime = createRuntimeWithAutonomyService(service);
    (
      runtime as unknown as {
        enableAutonomy?: boolean;
      }
    ).enableAutonomy = true;

    expect(getAutonomyState(runtime)).toMatchObject({
      enabled: true,
      thinking: false,
    });
  });
});
