/**
 * Shared test helpers for cloud-agent tests.
 *
 * Instead of using the top-level start() function (which creates its own
 * internal SnapshotManager), we compose servers from building blocks.
 * This ensures the echo runtime and the bridge handlers share the same
 * snapshot manager — so memories from message.send show up in /api/snapshot.
 *
 * This keeps tests fast, isolated, and focused on the bridge protocol
 * without needing @elizaos/core API keys or database access.
 */

import * as http from "node:http";
import type { CloudAgentRuntime, ChatMode, MemoryEntry } from "../src/types.js";
import { SnapshotManager } from "../src/snapshot/manager.js";
import { createBridgeServers } from "../src/bridge/server.js";
import { createHealthServer } from "../src/health/server.js";
import type { HandlerContext } from "../src/bridge/handlers.js";

// ─── Port Allocation ────────────────────────────────────────────────────

/** Return a random port in the 40000-59999 range to avoid collisions. */
export function getRandomPort(): number {
  return 40000 + Math.floor(Math.random() * 20000);
}

// ─── Mock Echo Runtime ──────────────────────────────────────────────────

/**
 * Create a deterministic echo runtime for testing.
 * Returns "[echo] {input}" for every message and records memories
 * via the shared snapshot manager (same one the handlers use).
 */
function createEchoRuntime(snapshot: SnapshotManager): CloudAgentRuntime {
  return {
    processMessage: async (
      text: string,
      _roomId: string,
      _mode: ChatMode,
    ): Promise<string> => {
      const reply = `[echo] ${text}`;
      snapshot.addExchange(text, reply);
      return reply;
    },

    processMessageStream: async (
      text: string,
      _roomId: string,
      _mode: ChatMode,
      onChunk: (chunk: string) => void,
    ): Promise<string> => {
      const reply = `[echo] ${text}`;
      onChunk(reply);
      snapshot.addExchange(text, reply);
      return reply;
    },

    getMemories: () => snapshot.memories,
    getConfig: () => snapshot.config,
  };
}

// ─── Server Lifecycle ───────────────────────────────────────────────────

export interface TestServerHandles {
  healthPort: number;
  bridgePort: number;
  healthServer: http.Server;
  bridgeServers: http.Server[];
  shutdown: () => void;
}

/**
 * Start the cloud-agent servers on random ports with a mock echo runtime.
 *
 * Composes servers directly from building blocks so the echo runtime
 * and bridge handlers share the same SnapshotManager.
 */
export async function startTestServers(): Promise<TestServerHandles> {
  const healthPort = getRandomPort();
  const bridgePort = getRandomPort();

  // Shared state
  const snapshot = new SnapshotManager();
  const runtime = createEchoRuntime(snapshot);

  // Handler context shared by bridge + health servers
  const handlerCtx: HandlerContext = {
    getRuntime: () => runtime,
    snapshot,
    bridgePorts: [bridgePort],
    primaryBridgePort: bridgePort,
  };

  // Create servers
  const healthServer = createHealthServer(healthPort, {
    getRuntime: () => runtime,
    snapshot,
    bridgePorts: [bridgePort],
    primaryBridgePort: bridgePort,
  });

  const bridgeServers = createBridgeServers(handlerCtx);

  function shutdown() {
    healthServer.close();
    for (const s of bridgeServers) {
      s.close();
    }
  }

  // Wait for servers to bind
  await waitForServer(healthPort, 5000);
  await waitForServer(bridgePort, 5000);

  return { healthPort, bridgePort, healthServer, bridgeServers, shutdown };
}

/**
 * Gracefully shut down test servers.
 */
export function stopTestServers(handles: TestServerHandles | null): void {
  if (handles) {
    handles.shutdown();
  }
}

/**
 * Wait until a port is accepting connections (up to timeoutMs).
 */
async function waitForServer(port: number, timeoutMs: number): Promise<void> {
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    try {
      const res = await fetch(`http://localhost:${port}/health`);
      if (res.ok) return;
    } catch {
      // Not ready yet
    }
    await new Promise((r) => setTimeout(r, 50));
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
