import type http from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createMockHttpResponse,
  createMockIncomingMessage,
} from "../test-support/test-helpers.js";
import type { CloudRouteState } from "./cloud-routes.js";
import { handleCloudRoute } from "./cloud-routes.js";

const fetchMock =
  vi.fn<
    (input: string | URL | Request, init?: RequestInit) => Promise<Response>
  >();

function createState(createAgent: (args: unknown) => Promise<unknown>) {
  return {
    config: {} as CloudRouteState["config"],
    runtime: null,
    cloudManager: {
      getClient: () => ({
        listAgents: async () => [],
        createAgent,
      }),
    },
  } as unknown as CloudRouteState;
}

describe("handleCloudRoute", () => {
  it("returns 400 for invalid JSON in POST /api/cloud/agents", async () => {
    const req = createMockIncomingMessage({
      method: "POST",
      url: "/api/cloud/agents",
      headers: {},
      bodyChunks: [Buffer.from("{")],
    });
    const { res, getStatus, getJson } = createMockHttpResponse();
    const createAgent = vi.fn().mockResolvedValue({ id: "agent-1" });

    const handled = await handleCloudRoute(
      req,
      res,
      "/api/cloud/agents",
      "POST",
      createState(createAgent),
    );

    expect(handled).toBe(true);
    expect(getStatus()).toBe(400);
    expect(getJson()).toEqual({ error: "Invalid JSON in request body" });
    expect(createAgent).not.toHaveBeenCalled();
  });

  it("returns 413 when POST /api/cloud/agents body exceeds size limit", async () => {
    const req = createMockIncomingMessage({
      method: "POST",
      url: "/api/cloud/agents",
      headers: {},
      bodyChunks: [Buffer.alloc(1_048_577, "a")],
    });
    const { res, getStatus, getJson } = createMockHttpResponse();
    const createAgent = vi.fn().mockResolvedValue({ id: "agent-1" });

    const handled = await handleCloudRoute(
      req,
      res,
      "/api/cloud/agents",
      "POST",
      createState(createAgent),
    );

    expect(handled).toBe(true);
    expect(getStatus()).toBe(413);
    expect(getJson()).toEqual({ error: "Request body too large" });
    expect(createAgent).not.toHaveBeenCalled();
  });

  it("keeps successful create-agent behavior for valid JSON", async () => {
    const req = createMockIncomingMessage({
      method: "POST",
      url: "/api/cloud/agents",
      headers: {},
      body: JSON.stringify({
        agentName: "My Agent",
        agentConfig: { modelProvider: "openai" },
      }),
    });
    const { res, getStatus, getJson } = createMockHttpResponse();
    const createAgent = vi.fn().mockResolvedValue({ id: "agent-1" });

    const handled = await handleCloudRoute(
      req,
      res,
      "/api/cloud/agents",
      "POST",
      createState(createAgent),
    );

    expect(handled).toBe(true);
    expect(getStatus()).toBe(201);
    expect(createAgent).toHaveBeenCalledTimes(1);
    expect(getJson()).toEqual({ ok: true, agent: { id: "agent-1" } });
  });
});

// ---------------------------------------------------------------------------
// Timeout behavior tests
// ---------------------------------------------------------------------------

function timeoutError(message = "The operation was aborted due to timeout") {
  const err = new Error(message);
  err.name = "TimeoutError";
  return err;
}

function cloudState(): CloudRouteState {
  return {
    config: { cloud: { baseUrl: "https://test.elizacloud.ai" } },
    cloudManager: null,
    runtime: null,
  } as unknown as CloudRouteState;
}

describe("handleCloudRoute timeout behavior", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 504 when cloud login session creation times out", async () => {
    let capturedSignal: AbortSignal | null | undefined;
    fetchMock.mockImplementation(async (_input, init) => {
      capturedSignal = init?.signal;
      throw timeoutError();
    });

    const { res, getJson } = createMockHttpResponse<Record<string, unknown>>();
    const handled = await handleCloudRoute(
      createMockIncomingMessage({
        url: "/api/cloud/login",
      }) as http.IncomingMessage,
      res,
      "/api/cloud/login",
      "POST",
      cloudState(),
    );

    expect(handled).toBe(true);
    expect(res.statusCode).toBe(504);
    expect(getJson().error).toBe("Eliza Cloud login request timed out");
    expect(capturedSignal).toBeInstanceOf(AbortSignal);
  });

  it("returns 504 when cloud login status polling times out", async () => {
    fetchMock.mockRejectedValue(timeoutError());

    const { res, getJson } = createMockHttpResponse<Record<string, unknown>>();
    const handled = await handleCloudRoute(
      createMockIncomingMessage({
        url: "/api/cloud/login/status?sessionId=test-session",
      }) as http.IncomingMessage,
      res,
      "/api/cloud/login/status",
      "GET",
      cloudState(),
    );

    expect(handled).toBe(true);
    expect(res.statusCode).toBe(504);
    expect(getJson()).toEqual({
      status: "error",
      error: "Eliza Cloud status request timed out",
    });
  });

  it("returns 502 when cloud polling fails for non-timeout network errors", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));

    const { res, getJson } = createMockHttpResponse<Record<string, unknown>>();
    const handled = await handleCloudRoute(
      createMockIncomingMessage({
        url: "/api/cloud/login/status?sessionId=test-session",
      }) as http.IncomingMessage,
      res,
      "/api/cloud/login/status",
      "GET",
      cloudState(),
    );

    expect(handled).toBe(true);
    expect(res.statusCode).toBe(502);
    expect(getJson()).toEqual({
      status: "error",
      error: "Failed to reach Eliza Cloud",
    });
  });
});
