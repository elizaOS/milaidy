/**
 * Health Endpoint Tests
 *
 * Tests the health HTTP server (separate from bridge).
 * Routes:
 *   GET|HEAD /health  → health status with uptime, runtime readiness
 *   GET|HEAD /        → service identification
 *   *                 → 404
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  startTestServers,
  stopTestServers,
  type TestServerHandles,
} from "./helpers.js";

let handles: TestServerHandles | null = null;
let port: number;

beforeAll(async () => {
  handles = await startTestServers();
  port = handles.healthPort;
});

afterAll(() => {
  stopTestServers(handles);
});

// ─── /health Endpoint ──────────────────────────────────────────────────

describe("Health Endpoint", () => {
  test("GET /health returns status", async () => {
    const res = await fetch(`http://localhost:${port}/health`);
    expect(res.status).toBe(200);

    const data = (await res.json()) as Record<string, any>;
    expect(data.status).toMatch(/healthy|initializing/);
    expect(data.uptime).toBeGreaterThanOrEqual(0);
    expect(data.startedAt).toBeDefined();
    expect(data.memoryUsage).toBeGreaterThan(0);
    expect(data.bridgePorts).toBeArray();
    expect(data.primaryBridgePort).toBe(handles!.bridgePort);
  });

  test("GET /health returns runtimeReady flag", async () => {
    const res = await fetch(`http://localhost:${port}/health`);
    const data = (await res.json()) as Record<string, any>;
    // Echo mode initializes synchronously, so runtime should be ready
    expect(data.runtimeReady).toBe(true);
  });

  test("GET /health content-type is JSON", async () => {
    const res = await fetch(`http://localhost:${port}/health`);
    expect(res.headers.get("content-type")).toBe("application/json");
  });

  test("HEAD /health returns 200 with no body", async () => {
    const res = await fetch(`http://localhost:${port}/health`, { method: "HEAD" });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/json");
    const text = await res.text();
    expect(text).toBe("");
  });

  test("uptime increases between requests", async () => {
    const res1 = await fetch(`http://localhost:${port}/health`);
    const data1 = (await res1.json()) as Record<string, any>;

    await new Promise((r) => setTimeout(r, 100));

    const res2 = await fetch(`http://localhost:${port}/health`);
    const data2 = (await res2.json()) as Record<string, any>;

    expect(data2.uptime).toBeGreaterThan(data1.uptime);
  });
});

// ─── / Root Endpoint ────────────────────────────────────────────────────

describe("Root Endpoint", () => {
  test("GET / returns service info", async () => {
    const res = await fetch(`http://localhost:${port}/`);
    expect(res.status).toBe(200);

    const data = (await res.json()) as Record<string, any>;
    expect(data.service).toBe("elizaos-cloud-agent");
    expect(data.status).toBe("running");
    expect(data.bridgePorts).toBeArray();
    expect(data.primaryBridgePort).toBe(handles!.bridgePort);
  });

  test("HEAD / returns 200 with no body", async () => {
    const res = await fetch(`http://localhost:${port}/`, { method: "HEAD" });
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toBe("");
  });
});

// ─── 404 Handling ───────────────────────────────────────────────────────

describe("404 Handling", () => {
  test("GET /nonexistent returns 404", async () => {
    const res = await fetch(`http://localhost:${port}/nonexistent`);
    expect(res.status).toBe(404);
  });

  test("GET /bridge returns 404 (bridge routes only on bridge server)", async () => {
    const res = await fetch(`http://localhost:${port}/bridge`);
    expect(res.status).toBe(404);
  });

  test("POST /health returns 404", async () => {
    const res = await fetch(`http://localhost:${port}/health`, { method: "POST" });
    expect(res.status).toBe(404);
  });

  test("GET /api/snapshot returns 404 (snapshot only on bridge server)", async () => {
    const res = await fetch(`http://localhost:${port}/api/snapshot`);
    expect(res.status).toBe(404);
  });
});
