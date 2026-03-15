/**
 * Shared test helpers for cloud-agent tests.
 *
 * Provides server lifecycle management and JSON-RPC request helpers.
 * Each test file should call `startTestServers()` in beforeAll and
 * `stopTestServers()` in afterAll.
 */

import type { CloudAgentServers } from "../src/types.js";

// ─── Port Allocation ────────────────────────────────────────────────────

/** Return a random port in the 40000-59999 range to avoid collisions. */
export function getRandomPort(): number {
  return 40000 + Math.floor(Math.random() * 20000);
}

// ─── Server Lifecycle ───────────────────────────────────────────────────

export interface TestServerHandles {
  healthPort: number;
  bridgePort: number;
  servers: CloudAgentServers;
}

/**
 * Start the cloud-agent servers on random ports.
 * The runtime will fall back to echo mode (no @elizaos/core in test env).
 */
export async function startTestServers(): Promise<TestServerHandles> {
  const healthPort = getRandomPort();
  const bridgePort = getRandomPort();

  // Dynamic import to avoid top-level evaluation issues
  const { start } = await import("../src/index.js");

  const servers = await start({
    healthPort,
    bridgePort,
    // Use the same port for compat to avoid opening a third server
    compatBridgePort: bridgePort,
  });

  // Wait for runtime init (echo mode is synchronous but wrapped in promise)
  // and for servers to actually bind
  await waitForServer(healthPort, 5000);
  await waitForServer(bridgePort, 5000);

  return { healthPort, bridgePort, servers };
}

/**
 * Gracefully shut down test servers.
 */
export function stopTestServers(handles: TestServerHandles | null): void {
  if (handles?.servers) {
    handles.servers.shutdown();
  }
}

/**
 * Wait until a port is accepting connections (up to timeoutMs).
 */
async function waitForServer(port: number, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://localhost:${port}/health`);
      if (res.ok) return;
    } catch {
      // Not ready yet
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`Server on port ${port} did not start within ${timeoutMs}ms`);
}

// ─── JSON-RPC Helper ────────────────────────────────────────────────────

/**
 * Send a JSON-RPC request to the bridge endpoint and return the parsed response.
 */
export async function jsonRpc(
  port: number,
  method: string,
  params?: Record<string, unknown>,
  id: string | number = 1,
): Promise<Record<string, any>> {
  const body = JSON.stringify({
    jsonrpc: "2.0",
    id,
    method,
    params: params ?? {},
  });

  const res = await fetch(`http://localhost:${port}/bridge`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });

  return res.json() as Promise<Record<string, any>>;
}

/**
 * Send a JSON-RPC streaming request and collect all SSE events.
 */
export async function jsonRpcStream(
  port: number,
  method: string,
  params?: Record<string, unknown>,
  id: string | number = 1,
): Promise<Array<{ event: string; data: any }>> {
  const body = JSON.stringify({
    jsonrpc: "2.0",
    id,
    method,
    params: params ?? {},
  });

  const res = await fetch(`http://localhost:${port}/bridge/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });

  const text = await res.text();
  return parseSSE(text);
}

/**
 * Parse raw SSE text into structured events.
 */
function parseSSE(raw: string): Array<{ event: string; data: any }> {
  const events: Array<{ event: string; data: any }> = [];
  let currentEvent = "";
  let currentData = "";

  for (const line of raw.split("\n")) {
    if (line.startsWith("event: ")) {
      currentEvent = line.slice(7).trim();
    } else if (line.startsWith("data: ")) {
      currentData = line.slice(6).trim();
    } else if (line === "") {
      if (currentEvent && currentData) {
        try {
          events.push({ event: currentEvent, data: JSON.parse(currentData) });
        } catch {
          events.push({ event: currentEvent, data: currentData });
        }
      }
      currentEvent = "";
      currentData = "";
    }
  }

  return events;
}
