import { EventEmitter } from "node:events";
import type http from "node:http";
import { describe, expect, it, vi } from "vitest";
import type { CloudRouteState } from "./cloud-routes.js";
import { handleCloudRoute } from "./cloud-routes.js";

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
