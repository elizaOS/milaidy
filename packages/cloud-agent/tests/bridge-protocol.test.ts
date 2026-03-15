/**
 * Bridge Protocol Tests
 *
 * Tests the JSON-RPC bridge server endpoints:
 *   POST /bridge          → JSON-RPC request/response
 *   POST /bridge/stream   → JSON-RPC → SSE stream
 *   GET  /bridge          → bridge health status
 *   GET  /bridge/health   → bridge health status
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  startTestServers,
  stopTestServers,
  jsonRpc,
  jsonRpcStream,
  type TestServerHandles,
} from "./helpers.js";

let handles: TestServerHandles | null = null;
let port: number;

beforeAll(async () => {
  handles = await startTestServers();
  port = handles.bridgePort;
});

afterAll(() => {
  stopTestServers(handles);
});

// ─── JSON-RPC Method Dispatch ───────────────────────────────────────────

describe("Bridge Protocol", () => {
  test("message.send returns a response", async () => {
    const result = await jsonRpc(port, "message.send", { text: "hello" });
    expect(result.jsonrpc).toBe("2.0");
    expect(result.id).toBe(1);
    expect(result.result).toBeDefined();
    expect(result.result.text).toBeDefined();
    expect(typeof result.result.text).toBe("string");
    expect(result.result.metadata).toBeDefined();
    expect(result.result.metadata.timestamp).toBeGreaterThan(0);
  });

  test("message.send preserves request id", async () => {
    const result = await jsonRpc(port, "message.send", { text: "test" }, 42);
    expect(result.id).toBe(42);
  });

  test("message.send with string id", async () => {
    const result = await jsonRpc(port, "message.send", { text: "test" }, "abc-123");
    expect(result.id).toBe("abc-123");
  });

  test("message.send with empty text", async () => {
    const result = await jsonRpc(port, "message.send", { text: "" });
    expect(result.result).toBeDefined();
    expect(result.result.text).toBeDefined();
  });

  test("status.get returns runtime status", async () => {
    const result = await jsonRpc(port, "status.get");
    expect(result.jsonrpc).toBe("2.0");
    expect(result.result).toBeDefined();
    // In echo mode, runtime is ready → status is "running"
    expect(result.result.status).toMatch(/running|initializing/);
    expect(result.result.uptime).toBeGreaterThan(0);
    expect(result.result.memoriesCount).toBeGreaterThanOrEqual(0);
    expect(result.result.startedAt).toBeDefined();
    expect(result.result.bridgePorts).toBeArray();
    expect(result.result.primaryBridgePort).toBe(port);
  });

  test("heartbeat returns ack", async () => {
    const result = await jsonRpc(port, "heartbeat");
    expect(result.jsonrpc).toBe("2.0");
    expect(result.method).toBe("heartbeat.ack");
    expect(result.params).toBeDefined();
    expect(result.params.timestamp).toBeGreaterThan(0);
    expect(result.params.runtimeReady).toBe(true);
  });

  test("unknown method returns -32601", async () => {
    const result = await jsonRpc(port, "nonexistent.method");
    expect(result.jsonrpc).toBe("2.0");
    expect(result.error).toBeDefined();
    expect(result.error.code).toBe(-32601);
    expect(result.error.message).toContain("nonexistent.method");
  });

  test("multiple unknown methods all return -32601", async () => {
    for (const method of ["foo.bar", "agent.restart", "config.update"]) {
      const result = await jsonRpc(port, method);
      expect(result.error.code).toBe(-32601);
      expect(result.error.message).toContain(method);
    }
  });
});

// ─── Bridge Health Endpoints ────────────────────────────────────────────

describe("Bridge Health Endpoints", () => {
  test("GET /bridge returns health status", async () => {
    const res = await fetch(`http://localhost:${port}/bridge`);
    expect(res.status).toBe(200);
    const data = await res.json() as Record<string, any>;
    expect(data.service).toBe("elizaos-cloud-agent-bridge");
    expect(data.status).toMatch(/healthy|initializing/);
    expect(data.uptime).toBeGreaterThan(0);
    expect(data.bridgePorts).toBeArray();
  });

  test("GET /bridge/health returns health status", async () => {
    const res = await fetch(`http://localhost:${port}/bridge/health`);
    expect(res.status).toBe(200);
    const data = await res.json() as Record<string, any>;
    expect(data.service).toBe("elizaos-cloud-agent-bridge");
  });

  test("GET / returns health status (bridge root)", async () => {
    const res = await fetch(`http://localhost:${port}/`);
    expect(res.status).toBe(200);
    const data = await res.json() as Record<string, any>;
    expect(data.service).toBe("elizaos-cloud-agent-bridge");
  });

  test("GET /health returns health status (bridge)", async () => {
    const res = await fetch(`http://localhost:${port}/health`);
    expect(res.status).toBe(200);
    const data = await res.json() as Record<string, any>;
    expect(data.service).toBe("elizaos-cloud-agent-bridge");
    expect(data.runtimeReady).toBe(true);
  });

  test("HEAD / returns 200 with no body", async () => {
    const res = await fetch(`http://localhost:${port}/`, { method: "HEAD" });
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toBe("");
  });

  test("HEAD /health returns 200 with no body", async () => {
    const res = await fetch(`http://localhost:${port}/health`, { method: "HEAD" });
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toBe("");
  });

  test("GET /nonexistent returns 404", async () => {
    const res = await fetch(`http://localhost:${port}/nonexistent`);
    expect(res.status).toBe(404);
  });
});

// ─── Streaming Endpoint ────────────────────────────────────────────────

describe("Streaming Endpoint", () => {
  test("POST /bridge/stream returns SSE events", async () => {
    const events = await jsonRpcStream(port, "message.send", { text: "stream test" });

    // Should have: connected, chunk(s), done
    const eventNames = events.map((e) => e.event);
    expect(eventNames).toContain("connected");
    expect(eventNames).toContain("done");

    // connected event should have rpcId and timestamp
    const connected = events.find((e) => e.event === "connected");
    expect(connected).toBeDefined();
    expect(connected!.data.timestamp).toBeGreaterThan(0);
    expect(connected!.data.bridgePorts).toBeArray();

    // done event should have timestamp
    const done = events.find((e) => e.event === "done");
    expect(done).toBeDefined();
    expect(done!.data.timestamp).toBeGreaterThan(0);
  });

  test("POST /bridge/stream includes chunk events with text", async () => {
    const events = await jsonRpcStream(port, "message.send", { text: "chunky" });
    const chunks = events.filter((e) => e.event === "chunk");

    // Echo mode sends one chunk with the full response
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    const allText = chunks.map((c) => c.data.text).join("");
    expect(allText).toContain("chunky");
  });

  test("POST /stream alias works", async () => {
    const body = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "message.send",
      params: { text: "alias test" },
    });

    const res = await fetch(`http://localhost:${port}/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/event-stream");
  });

  test("streaming non-message.send returns 400", async () => {
    const body = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "status.get",
      params: {},
    });

    const res = await fetch(`http://localhost:${port}/bridge/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });

    expect(res.status).toBe(400);
    const data = await res.json() as Record<string, any>;
    expect(data.error).toContain("Only message.send is streamable");
  });
});

// ─── Edge Cases ─────────────────────────────────────────────────────────

describe("Bridge Edge Cases", () => {
  test("POST /bridge with empty body returns valid response", async () => {
    const res = await fetch(`http://localhost:${port}/bridge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "",
    });

    // Empty body parses as {} which has no method → method not found
    expect(res.status).toBe(200);
    const data = await res.json() as Record<string, any>;
    expect(data.error).toBeDefined();
    expect(data.error.code).toBe(-32601);
  });

  test("POST /bridge with invalid JSON returns 400", async () => {
    const res = await fetch(`http://localhost:${port}/bridge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not valid json{{{",
    });

    expect(res.status).toBe(400);
    const data = await res.json() as Record<string, any>;
    expect(data.error).toContain("Invalid JSON");
  });

  test("concurrent requests are handled independently", async () => {
    const requests = Array.from({ length: 5 }, (_, i) =>
      jsonRpc(port, "message.send", { text: `concurrent-${i}` }, i + 100),
    );

    const results = await Promise.all(requests);
    for (let i = 0; i < 5; i++) {
      expect(results[i].id).toBe(i + 100);
      expect(results[i].result.text).toContain(`concurrent-${i}`);
    }
  });
});
