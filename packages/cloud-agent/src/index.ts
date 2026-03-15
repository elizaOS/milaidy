/**
 * @elizaos/cloud-agent
 *
 * ElizaOS cloud agent daemon — bridge, health, and snapshot services
 * for containerized agents.
 *
 * This is the main entry point. When executed directly (e.g., via tsx or
 * node), it starts the health and bridge servers and initializes the
 * ElizaOS runtime. When imported as a library, it exports the `start()`
 * function and all sub-modules.
 *
 * Architecture:
 *   ┌─────────────────┐    ┌─────────────────────┐
 *   │  Health Server   │    │   Bridge Server(s)   │
 *   │  (PORT: 2138)    │    │  (31337 / 18790)     │
 *   │                  │    │                      │
 *   │  GET /health     │    │  POST /bridge        │
 *   │  GET /           │    │  POST /bridge/stream  │
 *   └─────────────────┘    │  POST /api/snapshot   │
 *                           │  POST /api/restore    │
 *                           │  GET  /health         │
 *                           └──────────┬────────────┘
 *                                      │
 *                           ┌──────────▼────────────┐
 *                           │   Snapshot Manager     │
 *                           │  (in-memory state)     │
 *                           └──────────┬────────────┘
 *                                      │
 *                           ┌──────────▼────────────┐
 *                           │   Agent Runtime        │
 *                           │  (ElizaOS or echo)     │
 *                           └───────────────────────┘
 */

import type {
  CloudAgentOptions,
  CloudAgentRuntime,
  CloudAgentServers,
  PortConfig,
} from "./types.js";
import { SnapshotManager } from "./snapshot/manager.js";
import { initRuntime } from "./runtime/init.js";
import { createHealthServer } from "./health/server.js";
import { createBridgeServers } from "./bridge/server.js";
import type { HandlerContext } from "./bridge/handlers.js";

// ─── Port Parsing ───────────────────────────────────────────────────────

/**
 * Parse a port from an environment variable with validation.
 */
function parsePort(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
    console.warn(
      `[cloud-agent] Invalid ${name}=${raw}; falling back to ${fallback}`,
    );
    return fallback;
  }

  return parsed;
}

/**
 * Resolve port configuration from environment and options.
 */
function resolvePortConfig(options: CloudAgentOptions = {}): PortConfig {
  const healthPort = options.healthPort ?? parsePort("PORT", 2138);
  const primaryBridgePort =
    options.bridgePort ?? parsePort("BRIDGE_PORT", 31337);
  const compatBridgePort =
    options.compatBridgePort ?? parsePort("BRIDGE_COMPAT_PORT", 18790);

  const bridgePorts = Array.from(
    new Set(
      [primaryBridgePort, compatBridgePort].filter(
        (port) => Number.isInteger(port) && port > 0,
      ),
    ),
  );

  return { healthPort, primaryBridgePort, compatBridgePort, bridgePorts };
}

// ─── Main Start Function ────────────────────────────────────────────────

/**
 * Start the cloud agent daemon.
 *
 * Creates and starts:
 *   1. Health server on PORT (default 2138)
 *   2. Bridge server(s) on BRIDGE_PORT (default 31337) and BRIDGE_COMPAT_PORT (default 18790)
 *   3. Agent runtime (ElizaOS or echo-mode fallback)
 *
 * @param options - Optional configuration overrides
 * @returns Server handles for programmatic control
 */
export async function start(
  options: CloudAgentOptions = {},
): Promise<CloudAgentServers> {
  const ports = resolvePortConfig(options);
  const snapshot = new SnapshotManager();

  // Mutable runtime reference — set after async initialization
  let agentRuntime: CloudAgentRuntime | null = options.runtime ?? null;

  const handlerCtx: HandlerContext = {
    getRuntime: () => agentRuntime,
    snapshot,
    bridgePorts: ports.bridgePorts,
    primaryBridgePort: ports.primaryBridgePort,
  };

  // Start servers immediately (they return 503 until runtime is ready)
  const healthServer = createHealthServer(ports.healthPort, {
    getRuntime: () => agentRuntime,
    snapshot,
    bridgePorts: ports.bridgePorts,
    primaryBridgePort: ports.primaryBridgePort,
  });

  const bridgeServers = createBridgeServers(handlerCtx);

  // Shutdown handler
  function shutdown() {
    console.log("[cloud-agent] Shutting down...");
    healthServer.close();
    for (const server of bridgeServers) {
      server.close();
    }
  }

  const servers: CloudAgentServers = {
    healthServer,
    bridgeServers,
    runtime: agentRuntime,
    shutdown,
  };

  // Initialize runtime asynchronously (unless skipped or provided)
  if (!options.skipRuntime && !options.runtime) {
    initRuntime(snapshot)
      .then((runtime) => {
        agentRuntime = runtime;
        servers.runtime = runtime;
        console.log("[cloud-agent] Ready");
      })
      .catch((err) => {
        console.error("[cloud-agent] Runtime init failed:", err);
        // Keep health/bridge listeners alive for diagnostics.
      });
  } else if (options.runtime) {
    console.log("[cloud-agent] Ready (using provided runtime)");
  }

  return servers;
}

// ─── Auto-start when executed directly ──────────────────────────────────

/**
 * Detect if this module is being run as the main entry point.
 * Works with both tsx and compiled node execution.
 */
const isMainModule =
  typeof process !== "undefined" &&
  process.argv[1] &&
  (process.argv[1].endsWith("cloud-agent/src/index.ts") ||
    process.argv[1].endsWith("cloud-agent/dist/index.js") ||
    process.argv[1].includes("@elizaos/cloud-agent"));

if (isMainModule) {
  const servers = await start();

  // Register signal handlers for graceful shutdown
  process.on("SIGTERM", () => {
    servers.shutdown();
    process.exit(0);
  });
  process.on("SIGINT", () => {
    servers.shutdown();
    process.exit(0);
  });
}

// ─── Re-exports ─────────────────────────────────────────────────────────

// Types
export type {
  ChatMode,
  CloudAgentRuntime,
  CloudAgentOptions,
  CloudAgentServers,
  PortConfig,
  AgentState,
  MemoryEntry,
} from "./types.js";

// Bridge protocol
export type {
  BridgeRpcRequest,
  BridgeRpcResponse,
  BridgeRpcNotification,
  BridgeRpcParams,
  BridgeRpcError,
  BridgeMethod,
  BridgeStatus,
  SnapshotData,
  RestoreData,
  MessageSendResult,
  StatusGetResult,
  StreamConnectedEvent,
  StreamChunkEvent,
  StreamDoneEvent,
  StreamErrorEvent,
} from "./bridge/protocol.js";
export { RPC_ERROR } from "./bridge/protocol.js";

// Bridge server
export { createBridgeServers } from "./bridge/server.js";
export type { HandlerContext } from "./bridge/handlers.js";

// Health server
export { createHealthServer } from "./health/server.js";

// Snapshot manager
export { SnapshotManager } from "./snapshot/manager.js";

// Runtime initialization
export { initRuntime } from "./runtime/init.js";

// HTTP utilities
export {
  readRequestBody,
  readRequestBodyBuffer,
  readJsonBody,
  writeJson,
  writeHeadOnly,
  isHeadRequest,
} from "./util/http.js";
