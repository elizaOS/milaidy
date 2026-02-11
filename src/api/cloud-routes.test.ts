import { EventEmitter } from "node:events";
import type http from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CloudRouteState } from "./cloud-routes.js";
import { handleCloudRoute } from "./cloud-routes.js";

const fetchMock =
  vi.fn<
    (input: string | URL | Request, init?: RequestInit) => Promise<Response>
  >();

function createMockRequest(
  bodyChunks: Buffer[],
): http.IncomingMessage & EventEmitter {
  const req = new EventEmitter() as http.IncomingMessage &
    EventEmitter & { destroy: () => void };
  req.method = "POST";
  req.url = "/api/cloud/agents";
  req.headers = {};
  req.destroy = vi.fn();
  for (const chunk of bodyChunks) {
    queueMicrotask(() => req.emit("data", chunk));
  }
  queueMicrotask(() => req.emit("end"));
  return req;
}

function createMockResponse(): {
  res: http.ServerResponse;
  getStatus: () => number;
  getJson: () => unknown;
} {
  let statusCode = 200;
  let payload = "";

  const res = {
    set statusCode(value: number) {
      statusCode = value;
    },
    get statusCode() {
      return statusCode;
    },
    setHeader: () => undefined,
    end: (chunk?: string | Buffer) => {
      payload = chunk ? chunk.toString() : "";
    },
  } as unknown as http.ServerResponse;

  return {
    res,
    getStatus: () => statusCode,
    getJson: () => (payload ? JSON.parse(payload) : null),
  };
}

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
    const req = createMockRequest([Buffer.from("{")]);
    const { res, getStatus, getJson } = createMockResponse();
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
    const req = createMockRequest([Buffer.alloc(1_048_577, "a")]);
    const { res, getStatus, getJson } = createMockResponse();
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
    const req = createMockRequest([
      Buffer.from(
        JSON.stringify({
          agentName: "My Agent",
          agentConfig: { modelProvider: "openai" },
        }),
      ),
    ]);
    const { res, getStatus, getJson } = createMockResponse();
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

function createReq(url = "/"): http.IncomingMessage {
  return {
    url,
    headers: { host: "localhost:2138" },
  } as unknown as http.IncomingMessage;
}

function createRes(): {
  res: http.ServerResponse;
  getJson: () => Record<string, unknown>;
} {
  let raw = "";
  const target = {
    statusCode: 200,
    setHeader: (_k: string, _v: string) => {},
    end: (chunk?: string) => {
      if (typeof chunk === "string") raw += chunk;
    },
  } as unknown as http.ServerResponse;

  return {
    res: target,
    getJson: () => JSON.parse(raw) as Record<string, unknown>,
  };
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

    const { res, getJson } = createRes();
    const handled = await handleCloudRoute(
      createReq("/api/cloud/login"),
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

    const { res, getJson } = createRes();
    const handled = await handleCloudRoute(
      createReq("/api/cloud/login/status?sessionId=test-session"),
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

    const { res, getJson } = createRes();
    const handled = await handleCloudRoute(
      createReq("/api/cloud/login/status?sessionId=test-session"),
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
