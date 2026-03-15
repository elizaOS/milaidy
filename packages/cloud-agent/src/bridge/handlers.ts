/**
 * Bridge RPC Handlers
 *
 * Individual handler functions for each JSON-RPC method supported by
 * the bridge server. Each handler takes the parsed RPC request and
 * returns the appropriate response.
 */

import type * as http from "node:http";
import type { ChatMode, CloudAgentRuntime } from "../types.js";
import type { SnapshotManager } from "../snapshot/manager.js";
import type {
  BridgeRpcRequest,
  BridgeStatus,
  RestoreData,
} from "./protocol.js";
import { RPC_ERROR } from "./protocol.js";
import { writeJson, readJsonBody } from "../util/http.js";

// ─── Handler Context ────────────────────────────────────────────────────

/**
 * Shared context passed to all handlers.
 */
export interface HandlerContext {
  /** The current runtime (null if not yet initialized). */
  getRuntime(): CloudAgentRuntime | null;
  /** The snapshot manager for state operations. */
  snapshot: SnapshotManager;
  /** Active bridge ports for status reporting. */
  bridgePorts: number[];
  /** Primary bridge port for status reporting. */
  primaryBridgePort: number;
}

// ─── Status / Health ────────────────────────────────────────────────────

/**
 * Get the bridge status object (used by health endpoints).
 */
export function getBridgeStatus(ctx: HandlerContext): BridgeStatus {
  const runtime = ctx.getRuntime();
  return {
    service: "elizaos-cloud-agent-bridge",
    status: runtime ? "healthy" : "initializing",
    uptime: process.uptime(),
    startedAt: ctx.snapshot.startedAt,
    memoryUsage: process.memoryUsage().rss,
    runtimeReady: runtime !== null,
    bridgePorts: ctx.bridgePorts,
    primaryBridgePort: ctx.primaryBridgePort,
  };
}

// ─── message.send Handler ───────────────────────────────────────────────

/**
 * Handle the "message.send" JSON-RPC method.
 * Sends a message to the agent and returns the response.
 */
export async function handleMessageSend(
  rpc: BridgeRpcRequest,
  ctx: HandlerContext,
  res: http.ServerResponse,
): Promise<void> {
  const runtime = ctx.getRuntime();

  if (!runtime) {
    writeJson(res, 503, {
      jsonrpc: "2.0",
      id: rpc.id,
      error: { code: RPC_ERROR.SERVER_ERROR, message: "Agent runtime not ready" },
    });
    return;
  }

  const text = rpc.params?.text ?? "";
  const roomId = rpc.params?.roomId ?? "default";
  const mode: ChatMode = rpc.params?.mode === "simple" ? "simple" : "power";

  const responseText = await runtime.processMessage(text, roomId, mode);

  writeJson(res, 200, {
    jsonrpc: "2.0",
    id: rpc.id,
    result: { text: responseText, metadata: { timestamp: Date.now() } },
  });
}

// ─── message.send Stream Handler ────────────────────────────────────────

/**
 * Handle streaming "message.send" via SSE.
 * Opens an event stream and sends chunks as they arrive.
 */
export async function handleMessageSendStream(
  rpc: BridgeRpcRequest,
  ctx: HandlerContext,
  res: http.ServerResponse,
): Promise<void> {
  const runtime = ctx.getRuntime();

  if (!runtime) {
    writeJson(res, 503, { error: "Agent runtime not ready" });
    return;
  }

  if (rpc.method !== "message.send") {
    writeJson(res, 400, { error: "Only message.send is streamable" });
    return;
  }

  // Switch to SSE mode
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  const sendEvent = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  const text = rpc.params?.text ?? "";
  const roomId = rpc.params?.roomId ?? "default";
  const mode: ChatMode = rpc.params?.mode === "simple" ? "simple" : "power";

  sendEvent("connected", {
    rpcId: rpc.id,
    timestamp: Date.now(),
    bridgePorts: ctx.bridgePorts,
  });

  try {
    await runtime.processMessageStream(text, roomId, mode, (chunk: string) => {
      sendEvent("chunk", { text: chunk });
    });

    sendEvent("done", { rpcId: rpc.id, timestamp: Date.now() });
  } catch (error: unknown) {
    console.error("[cloud-agent] stream bridge error:", error);
    sendEvent("error", {
      message: error instanceof Error ? error.message : String(error),
      timestamp: Date.now(),
    });
  }

  res.end();
}

// ─── status.get Handler ─────────────────────────────────────────────────

/**
 * Handle the "status.get" JSON-RPC method.
 */
export function handleStatusGet(
  rpc: BridgeRpcRequest,
  ctx: HandlerContext,
  res: http.ServerResponse,
): void {
  const runtime = ctx.getRuntime();

  writeJson(res, 200, {
    jsonrpc: "2.0",
    id: rpc.id,
    result: {
      status: runtime ? "running" : "initializing",
      uptime: process.uptime(),
      memoriesCount: ctx.snapshot.memories.length,
      startedAt: ctx.snapshot.startedAt,
      bridgePorts: ctx.bridgePorts,
      primaryBridgePort: ctx.primaryBridgePort,
    },
  });
}

// ─── heartbeat Handler ──────────────────────────────────────────────────

/**
 * Handle the "heartbeat" JSON-RPC method.
 */
export function handleHeartbeat(
  _rpc: BridgeRpcRequest,
  ctx: HandlerContext,
  res: http.ServerResponse,
): void {
  const runtime = ctx.getRuntime();

  writeJson(res, 200, {
    jsonrpc: "2.0",
    method: "heartbeat.ack",
    params: { timestamp: Date.now(), runtimeReady: runtime !== null },
  });
}

// ─── Snapshot Handlers ──────────────────────────────────────────────────

/**
 * Handle POST /api/snapshot — capture current state.
 */
export function handleSnapshotCapture(
  ctx: HandlerContext,
  res: http.ServerResponse,
): void {
  writeJson(res, 200, ctx.snapshot.capture());
}

/**
 * Handle POST /api/restore — restore state from snapshot.
 */
export async function handleSnapshotRestore(
  ctx: HandlerContext,
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  const incoming = await readJsonBody<RestoreData>(req, res);
  if (!incoming) return;

  ctx.snapshot.restore(incoming);
  writeJson(res, 200, { success: true });
}

// ─── Method Not Found ───────────────────────────────────────────────────

/**
 * Handle an unknown JSON-RPC method.
 */
export function handleMethodNotFound(
  rpc: BridgeRpcRequest,
  res: http.ServerResponse,
): void {
  writeJson(res, 200, {
    jsonrpc: "2.0",
    id: rpc.id,
    error: {
      code: RPC_ERROR.METHOD_NOT_FOUND,
      message: `Method not found: ${rpc.method}`,
    },
  });
}
