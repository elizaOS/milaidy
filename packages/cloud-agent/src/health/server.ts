/**
 * Health Endpoint HTTP Server
 *
 * A lightweight HTTP server that exposes health check and service info
 * endpoints. This runs on the PORT env var (default 2138) and is separate
 * from the bridge servers.
 *
 * Routes:
 *   GET|HEAD  /health  → health status with uptime, memory, runtime readiness
 *   GET|HEAD  /        → service identification
 */

import * as http from "node:http";
import type { CloudAgentRuntime } from "../types.js";
import type { SnapshotManager } from "../snapshot/manager.js";
import { writeJson, writeHeadOnly, isHeadRequest } from "../util/http.js";

// ─── Health Server Options ──────────────────────────────────────────────

export interface HealthServerOptions {
  /** Getter for the current runtime (may be null during init). */
  getRuntime(): CloudAgentRuntime | null;
  /** Snapshot manager for accessing startedAt. */
  snapshot: SnapshotManager;
  /** Active bridge ports for status reporting. */
  bridgePorts: number[];
  /** Primary bridge port for status reporting. */
  primaryBridgePort: number;
}

// ─── Health Server Factory ──────────────────────────────────────────────

/**
 * Create and start the health endpoint HTTP server.
 *
 * @param port - Port to listen on (default: 2138)
 * @param options - Configuration options
 * @returns The HTTP server instance
 */
export function createHealthServer(
  port: number,
  options: HealthServerOptions,
): http.Server {
  const { getRuntime, snapshot, bridgePorts, primaryBridgePort } = options;

  const server = http.createServer((req, res) => {
    // ── /health endpoint ──────────────────────────────────────────────
    if (
      (req.method === "GET" || isHeadRequest(req)) &&
      req.url === "/health"
    ) {
      if (isHeadRequest(req)) {
        writeHeadOnly(res, 200, { "Content-Type": "application/json" });
        return;
      }

      const runtime = getRuntime();
      writeJson(res, 200, {
        status: runtime ? "healthy" : "initializing",
        uptime: process.uptime(),
        startedAt: snapshot.startedAt,
        memoryUsage: process.memoryUsage().rss,
        runtimeReady: runtime !== null,
        bridgePorts,
        primaryBridgePort,
      });
      return;
    }

    // ── / root endpoint ───────────────────────────────────────────────
    if ((req.method === "GET" || isHeadRequest(req)) && req.url === "/") {
      if (isHeadRequest(req)) {
        writeHeadOnly(res, 200, { "Content-Type": "application/json" });
        return;
      }

      writeJson(res, 200, {
        service: "elizaos-cloud-agent",
        status: "running",
        bridgePorts,
        primaryBridgePort,
      });
      return;
    }

    // ── 404 ───────────────────────────────────────────────────────────
    res.writeHead(404);
    res.end("Not Found");
  });

  server.listen(port, "0.0.0.0", () => {
    console.log(`[cloud-agent] Health endpoint listening on port ${port}`);
  });

  return server;
}
