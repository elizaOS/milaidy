/**
 * Bridge HTTP Server
 *
 * Creates the HTTP server that handles the JSON-RPC bridge protocol.
 * This is the primary communication channel between the Eliza Cloud
 * proxy and the agent runtime.
 *
 * Routes:
 *   GET|HEAD  /                    → bridge health status
 *   GET|HEAD  /health              → bridge health status
 *   GET|HEAD  /bridge              → bridge health status
 *   GET|HEAD  /bridge/health       → bridge health status
 *   POST      /bridge              → JSON-RPC request/response
 *   POST      /bridge/stream       → JSON-RPC → SSE stream
 *   POST      /stream              → alias for /bridge/stream
 *   POST      /api/snapshot        → capture state
 *   POST      /snapshot            → alias for /api/snapshot
 *   POST      /api/restore         → restore state
 *   POST      /restore             → alias for /api/restore
 */

import * as http from "node:http";
import type { BridgeRpcRequest } from "./protocol.js";
import type { HandlerContext } from "./handlers.js";
import {
  getBridgeStatus,
  handleMessageSend,
  handleMessageSendStream,
  handleStatusGet,
  handleHeartbeat,
  handleSnapshotCapture,
  handleSnapshotRestore,
  handleMethodNotFound,
} from "./handlers.js";
import { writeJson, writeHeadOnly, isHeadRequest, readJsonBody } from "../util/http.js";

// ─── Bridge Server Factory ──────────────────────────────────────────────

/**
 * Create the bridge request handler.
 */
function createBridgeRequestHandler(
  ctx: HandlerContext,
): (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void> {
  return async (req: http.IncomingMessage, res: http.ServerResponse) => {
    const url = req.url ?? "/";

    try {
      // ── Health/Status GET endpoints ───────────────────────────────────
      if (
        (req.method === "GET" || isHeadRequest(req)) &&
        (url === "/" ||
          url === "/health" ||
          url === "/bridge" ||
          url === "/bridge/health")
      ) {
        if (isHeadRequest(req)) {
          writeHeadOnly(res, 200, { "Content-Type": "application/json" });
          return;
        }
        writeJson(res, 200, getBridgeStatus(ctx));
        return;
      }

      // ── Snapshot capture ──────────────────────────────────────────────
      if (
        req.method === "POST" &&
        (url === "/api/snapshot" || url === "/snapshot")
      ) {
        handleSnapshotCapture(ctx, res);
        return;
      }

      // ── Snapshot restore ──────────────────────────────────────────────
      if (
        req.method === "POST" &&
        (url === "/api/restore" || url === "/restore")
      ) {
        await handleSnapshotRestore(ctx, req, res);
        return;
      }

      // ── SSE stream endpoint ───────────────────────────────────────────
      if (
        req.method === "POST" &&
        (url === "/bridge/stream" || url === "/stream")
      ) {
        const rpc = await readJsonBody<BridgeRpcRequest>(req, res);
        if (!rpc) return;

        await handleMessageSendStream(rpc, ctx, res);
        return;
      }

      // ── JSON-RPC bridge endpoint ──────────────────────────────────────
      if (req.method === "POST" && url === "/bridge") {
        const rpc = await readJsonBody<BridgeRpcRequest>(req, res);
        if (!rpc) return;

        switch (rpc.method) {
          case "message.send":
            await handleMessageSend(rpc, ctx, res);
            return;
          case "status.get":
            handleStatusGet(rpc, ctx, res);
            return;
          case "heartbeat":
            handleHeartbeat(rpc, ctx, res);
            return;
          default:
            handleMethodNotFound(rpc, res);
            return;
        }
      }

      // ── 404 ───────────────────────────────────────────────────────────
      writeJson(res, 404, { error: "Not Found" });
    } catch (error: unknown) {
      console.error("[cloud-agent] bridge request failed:", error);

      if (!res.headersSent) {
        writeJson(res, 500, {
          error: error instanceof Error ? error.message : String(error),
        });
        return;
      }

      // If headers were already sent (e.g. mid-stream), just end.
      try {
        res.end();
      } catch {
        // Ignore secondary failure while unwinding a broken stream.
      }
    }
  };
}

/**
 * Create bridge HTTP servers on the given ports.
 *
 * @param ctx - Handler context with runtime, snapshot, and port info
 * @returns Array of HTTP servers (one per unique port)
 */
export function createBridgeServers(ctx: HandlerContext): http.Server[] {
  const handler = createBridgeRequestHandler(ctx);

  return ctx.bridgePorts.map((port) => {
    const server = http.createServer(handler);
    server.listen(port, "0.0.0.0", () => {
      const label = port === ctx.primaryBridgePort ? "primary" : "compat";
      console.log(
        `[cloud-agent] Bridge server listening on port ${port} (${label})`,
      );
    });
    return server;
  });
}
