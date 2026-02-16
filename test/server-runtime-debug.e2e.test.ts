import http from "node:http";
import type { AgentRuntime } from "@elizaos/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startApiServer } from "../src/api/server";

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

type JsonObject = Record<string, JsonValue>;

function request(
  port: number,
  path: string,
  method = "GET",
): Promise<{ status: number; data: JsonObject }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path,
        method,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf-8");
          let data: JsonObject = {};
          try {
            data = JSON.parse(raw) as JsonObject;
          } catch {
            data = { _raw: raw };
          }
          resolve({
            status: res.statusCode ?? 0,
            data,
          });
        });
      },
    );
    req.on("error", reject);
    req.end();
  });
}

function makeRuntime(): AgentRuntime {
  return {
    agentId: "runtime-debug-id",
    character: { name: "Runtime Debug Bot" },
    plugins: [
      { id: "plugin-core", name: "Core plugin" },
      { id: "plugin-llm", name: "LLM plugin" },
    ],
    actions: [
      { id: "action-reply", name: "reply" },
      { id: "action-listen", name: "listen" },
    ],
    providers: [
      { id: "provider-openai", name: "openai-provider" },
      { id: "provider-llama", name: "llama-provider" },
    ],
    evaluators: [{ id: "evaluator-basic", name: "basic-evaluator" }],
    services: new Map([
      [
        "trajectory_logger",
        [{ id: "trajectory-logger", name: "trajectory service" }],
      ],
      ["llm", [{ id: "llm-runtime", name: "runtime llm" }]],
    ]),
    adapter: {},
    logger: {
      trace: () => {},
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
      fatal: () => {},
      success: () => {},
      progress: () => {},
      clear: () => {},
      child: () =>
        ({
          trace: () => {},
          debug: () => {},
          info: () => {},
          warn: () => {},
          error: () => {},
          fatal: () => {},
          success: () => {},
          progress: () => {},
          clear: () => {},
          child: () => ({}),
        }) as AgentRuntime["logger"],
    } as AgentRuntime["logger"],
    getService: () => undefined,
  } as AgentRuntime;
}

describe("GET /api/runtime without runtime", () => {
  let server: { port: number; close: () => Promise<void> } | null = null;

  beforeAll(async () => {
    server = await startApiServer({ port: 0 });
  });

  afterAll(async () => {
    await server?.close();
  });

  it("returns runtime unavailable and still parses debug settings", async () => {
    if (!server) {
      throw new Error("Runtime debug test server failed to start");
    }
    const { status, data } = await request(
      server.port,
      "/api/runtime?depth=0&maxArrayLength=0&maxObjectEntries=9000&maxStringLength=12",
    );
    expect(status).toBe(200);
    expect(data.runtimeAvailable).toBe(false);
    expect(data.settings.maxDepth).toBe(1);
    expect(data.settings.maxArrayLength).toBe(1);
    expect(data.settings.maxObjectEntries).toBe(5000);
    expect(data.settings.maxStringLength).toBe(64);
  });
});

describe("GET /api/runtime with runtime", () => {
  let server: { port: number; close: () => Promise<void> } | null = null;

  beforeAll(async () => {
    server = await startApiServer({ port: 0, runtime: makeRuntime() });
  });

  afterAll(async () => {
    await server?.close();
  });

  it("returns debug snapshot and orders for runtime collections", async () => {
    if (!server) {
      throw new Error("Runtime debug test server failed to start");
    }
    const { status, data } = await request(
      server.port,
      "/api/runtime?depth=3&maxArrayLength=2&maxStringLength=32",
    );
    expect(status).toBe(200);
    expect(data.runtimeAvailable).toBe(true);
    expect(data.meta).toEqual(
      expect.objectContaining({
        pluginCount: 2,
        actionCount: 2,
        providerCount: 2,
        evaluatorCount: 1,
        serviceTypeCount: 2,
        serviceCount: 2,
      }),
    );
    expect(Array.isArray(data.order.plugins)).toBe(true);
    expect(Array.isArray(data.order.services)).toBe(true);
    expect((data.order.services as Array<JsonObject>)[0].serviceType).toBe(
      "trajectory_logger",
    );
    expect(data.sections.runtime).toEqual(
      expect.objectContaining({
        plugins: expect.objectContaining({
          __type: "array",
        }),
        providers: expect.objectContaining({
          __type: "array",
        }),
      }),
    );
    expect(data.sections.services).toEqual(
      expect.objectContaining({
        __type: "map",
      }),
    );
    expect(data.order.services.length).toBe(2);
    expect(data.meta.serviceCount).toBe(2);
  });
});
