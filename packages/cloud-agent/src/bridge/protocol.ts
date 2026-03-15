/**
 * Bridge Protocol Types
 *
 * TypeScript interfaces for the JSON-RPC bridge protocol used between
 * the cloud agent container and the Eliza Cloud proxy.
 *
 * The bridge uses a JSON-RPC 2.0-like protocol over HTTP:
 *   - POST /bridge          → JSON-RPC request/response
 *   - POST /bridge/stream   → JSON-RPC request → SSE stream
 *   - POST /api/snapshot    → capture in-memory state
 *   - POST /api/restore     → restore in-memory state
 */

// ─── JSON-RPC Base Types ────────────────────────────────────────────────

/**
 * Supported bridge RPC methods.
 */
export type BridgeMethod =
  | "message.send"
  | "status.get"
  | "heartbeat";

/**
 * Parameters for bridge RPC requests.
 */
export interface BridgeRpcParams {
  /** Message text to send to the agent. */
  text?: string;
  /** Room/conversation ID. */
  roomId?: string;
  /** Chat mode: "simple" or "power". */
  mode?: string;
  /** Channel type hint (e.g., "dm", "group"). */
  channelType?: string;
}

/**
 * Incoming JSON-RPC request from the bridge client.
 */
export interface BridgeRpcRequest {
  /** JSON-RPC version (should be "2.0"). */
  jsonrpc?: string;
  /** Request ID for correlating responses. */
  id?: string | number;
  /** RPC method name. */
  method?: string;
  /** Method parameters. */
  params?: BridgeRpcParams;
}

/**
 * JSON-RPC success result for message.send.
 */
export interface MessageSendResult {
  /** Response text from the agent. */
  text: string;
  /** Additional metadata. */
  metadata: {
    timestamp: number;
  };
}

/**
 * JSON-RPC success result for status.get.
 */
export interface StatusGetResult {
  /** Agent status: "running" or "initializing". */
  status: "running" | "initializing";
  /** Seconds since process start. */
  uptime: number;
  /** Number of memories in state. */
  memoriesCount: number;
  /** ISO timestamp of when the agent started. */
  startedAt: string;
  /** Active bridge ports. */
  bridgePorts: number[];
  /** Primary bridge port. */
  primaryBridgePort: number;
}

/**
 * JSON-RPC error object.
 */
export interface BridgeRpcError {
  /** Error code (JSON-RPC standard or custom). */
  code: number;
  /** Human-readable error message. */
  message: string;
}

/**
 * JSON-RPC response envelope.
 */
export interface BridgeRpcResponse {
  jsonrpc: "2.0";
  /** Correlated request ID. */
  id?: string | number;
  /** Success result (mutually exclusive with error). */
  result?: MessageSendResult | StatusGetResult | Record<string, unknown>;
  /** Error (mutually exclusive with result). */
  error?: BridgeRpcError;
}

/**
 * JSON-RPC notification (no id, used for heartbeat.ack).
 */
export interface BridgeRpcNotification {
  jsonrpc: "2.0";
  /** Notification method. */
  method: string;
  /** Notification parameters. */
  params?: Record<string, unknown>;
}

// ─── SSE Stream Events ──────────────────────────────────────────────────

/**
 * SSE "connected" event data — sent when stream is established.
 */
export interface StreamConnectedEvent {
  rpcId?: string | number;
  timestamp: number;
  bridgePorts: number[];
}

/**
 * SSE "chunk" event data — a piece of the agent's response.
 */
export interface StreamChunkEvent {
  text: string;
}

/**
 * SSE "done" event data — stream completed successfully.
 */
export interface StreamDoneEvent {
  rpcId?: string | number;
  timestamp: number;
}

/**
 * SSE "error" event data — stream encountered an error.
 */
export interface StreamErrorEvent {
  message: string;
  timestamp: number;
}

// ─── Bridge Status ──────────────────────────────────────────────────────

/**
 * Bridge health/status response returned by GET endpoints.
 */
export interface BridgeStatus {
  service: "elizaos-cloud-agent-bridge";
  status: "healthy" | "initializing";
  uptime: number;
  startedAt: string;
  memoryUsage: number;
  runtimeReady: boolean;
  bridgePorts: number[];
  primaryBridgePort: number;
}

// ─── Snapshot Types ─────────────────────────────────────────────────────

/**
 * Snapshot capture response.
 */
export interface SnapshotData {
  memories: Array<Record<string, unknown>>;
  config: Record<string, unknown>;
  workspaceFiles: Record<string, string>;
  timestamp: string;
}

/**
 * Snapshot restore request body.
 */
export interface RestoreData {
  memories?: Array<Record<string, unknown>>;
  config?: Record<string, unknown>;
  workspaceFiles?: Record<string, string>;
}

// ─── JSON-RPC Error Codes ───────────────────────────────────────────────

/** Standard JSON-RPC error codes. */
export const RPC_ERROR = {
  /** Method not found. */
  METHOD_NOT_FOUND: -32601,
  /** Server error — runtime not ready. */
  SERVER_ERROR: -32000,
} as const;
