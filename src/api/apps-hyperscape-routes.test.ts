import { describe, expect, test, vi } from "vitest";
import { handleAppsHyperscapeRoutes } from "./apps-hyperscape-routes";

type RelayCall = {
  method: "GET" | "POST";
  path: string;
  options?: Record<string, unknown>;
};

type InvokeResult = {
  handled: boolean;
  status: number;
  payload: unknown;
  relayCalls: RelayCall[];
};

async function invoke(args: {
  method: string;
  pathname: string;
  body?: Record<string, unknown> | null;
}): Promise<InvokeResult> {
  let status = 200;
  let payload: unknown = null;
  const relayCalls: RelayCall[] = [];

  const handled = await handleAppsHyperscapeRoutes({
    req: {} as never,
    res: {} as never,
    method: args.method,
    pathname: args.pathname,
    relayHyperscapeApi: vi.fn(async (method, path, options) => {
      relayCalls.push({ method, path, options });
    }),
    readJsonBody: vi.fn(async () => args.body ?? null),
    error: (_res, message, code = 400) => {
      status = code;
      payload = { error: message };
    },
  });

  return { handled, status, payload, relayCalls };
}

describe("apps hyperscape routes", () => {
  test("returns false for unrelated route", async () => {
    const result = await invoke({ method: "GET", pathname: "/api/status" });

    expect(result.handled).toBe(false);
    expect(result.relayCalls).toHaveLength(0);
  });

  test("relays GET embedded agents", async () => {
    const result = await invoke({
      method: "GET",
      pathname: "/api/apps/hyperscape/embedded-agents",
    });

    expect(result.handled).toBe(true);
    expect(result.relayCalls).toEqual([
      { method: "GET", path: "/api/embedded-agents", options: undefined },
    ]);
  });

  test("relays POST embedded agents", async () => {
    const result = await invoke({
      method: "POST",
      pathname: "/api/apps/hyperscape/embedded-agents",
    });

    expect(result.handled).toBe(true);
    expect(result.relayCalls).toEqual([
      { method: "POST", path: "/api/embedded-agents", options: undefined },
    ]);
  });

  test("relays embedded agent action", async () => {
    const result = await invoke({
      method: "POST",
      pathname: "/api/apps/hyperscape/embedded-agents/agent%201/start",
    });

    expect(result.handled).toBe(true);
    expect(result.relayCalls).toEqual([
      {
        method: "POST",
        path: "/api/embedded-agents/agent%201/start",
        options: undefined,
      },
    ]);
  });

  test("requires content for message endpoint", async () => {
    const result = await invoke({
      method: "POST",
      pathname: "/api/apps/hyperscape/agents/agent-1/message",
      body: {},
    });

    expect(result.handled).toBe(true);
    expect(result.status).toBe(400);
    expect(result.payload).toEqual({ error: "content is required" });
    expect(result.relayCalls).toHaveLength(0);
  });

  test("relays message endpoint as command payload", async () => {
    const result = await invoke({
      method: "POST",
      pathname: "/api/apps/hyperscape/agents/agent-1/message",
      body: { content: "hello" },
    });

    expect(result.handled).toBe(true);
    expect(result.relayCalls).toEqual([
      {
        method: "POST",
        path: "/api/embedded-agents/agent-1/command",
        options: {
          rawBodyOverride: JSON.stringify({
            command: "chat",
            data: { message: "hello" },
          }),
          contentTypeOverride: "application/json",
        },
      },
    ]);
  });

  test("relays goal endpoint", async () => {
    const result = await invoke({
      method: "GET",
      pathname: "/api/apps/hyperscape/agents/agent-1/goal",
    });

    expect(result.handled).toBe(true);
    expect(result.relayCalls).toEqual([
      {
        method: "GET",
        path: "/api/agents/agent-1/goal",
        options: undefined,
      },
    ]);
  });

  test("relays quick actions endpoint", async () => {
    const result = await invoke({
      method: "GET",
      pathname: "/api/apps/hyperscape/agents/agent-1/quick-actions",
    });

    expect(result.handled).toBe(true);
    expect(result.relayCalls).toEqual([
      {
        method: "GET",
        path: "/api/agents/agent-1/quick-actions",
        options: undefined,
      },
    ]);
  });
});
