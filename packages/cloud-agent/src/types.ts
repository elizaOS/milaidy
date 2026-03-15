/**
 * Shared types for the @elizaos/cloud-agent package.
 *
 * These types define the runtime abstraction, state shape, and configuration
 * used across all modules (bridge, health, snapshot, runtime).
 */

// ─── Chat Mode ──────────────────────────────────────────────────────────

/**
 * Chat mode controls how the agent processes a message.
 * - `"simple"`: minimal context, faster responses
 * - `"power"`: full context, richer reasoning
 */
export type ChatMode = "simple" | "power";

// ─── Agent Runtime Abstraction ──────────────────────────────────────────

/**
 * The runtime interface that the bridge talks to. This is implemented by
 * either a real ElizaOS AgentRuntime or the echo-mode fallback.
 */
export interface CloudAgentRuntime {
  /** Process a message and return the full response text. */
  processMessage(
    text: string,
    roomId: string,
    mode: ChatMode,
  ): Promise<string>;

  /** Process a message with streaming chunks via the onChunk callback. */
  processMessageStream(
    text: string,
    roomId: string,
    mode: ChatMode,
    onChunk: (chunk: string) => void,
  ): Promise<string>;

  /** Return all in-memory chat memories. */
  getMemories(): Array<MemoryEntry>;

  /** Return current agent configuration. */
  getConfig(): Record<string, unknown>;
}

// ─── State / Snapshot ───────────────────────────────────────────────────

/**
 * A single memory entry in the chat history.
 */
export interface MemoryEntry {
  role: string;
  text: string;
  timestamp: number;
  [key: string]: unknown;
}

/**
 * The full in-memory state that persists across snapshots.
 * This is the shape of what gets captured/restored.
 */
export interface AgentState {
  /** Chat history — user and assistant messages. */
  memories: MemoryEntry[];
  /** Agent configuration (arbitrary key-value). */
  config: Record<string, unknown>;
  /** Workspace file contents (path → content). */
  workspaceFiles: Record<string, string>;
  /** ISO timestamp of when the agent started. */
  startedAt: string;
}

// ─── Port Configuration ─────────────────────────────────────────────────

/**
 * Parsed port configuration from environment variables.
 */
export interface PortConfig {
  /** Health endpoint port (default: 2138). */
  healthPort: number;
  /** Primary bridge port (default: 31337). */
  primaryBridgePort: number;
  /** Compatibility bridge port (default: 18790). */
  compatBridgePort: number;
  /** Deduplicated list of active bridge ports. */
  bridgePorts: number[];
}

// ─── Server Handles ─────────────────────────────────────────────────────

/**
 * Returned by the main `start()` function — handles to running servers
 * for programmatic control and graceful shutdown.
 */
export interface CloudAgentServers {
  /** The health endpoint HTTP server. */
  healthServer: import("node:http").Server;
  /** Bridge HTTP servers (one per unique bridge port). */
  bridgeServers: import("node:http").Server[];
  /** The initialized runtime (null if still initializing). */
  runtime: CloudAgentRuntime | null;
  /** Graceful shutdown — closes all servers and exits. */
  shutdown(): void;
}

// ─── Start Options ──────────────────────────────────────────────────────

/**
 * Options for starting the cloud agent programmatically.
 */
export interface CloudAgentOptions {
  /** Override health port (default: env PORT or 2138). */
  healthPort?: number;
  /** Override primary bridge port (default: env BRIDGE_PORT or 31337). */
  bridgePort?: number;
  /** Override compat bridge port (default: env BRIDGE_COMPAT_PORT or 18790). */
  compatBridgePort?: number;
  /** Custom runtime to use instead of auto-initializing. */
  runtime?: CloudAgentRuntime;
  /** Skip runtime initialization entirely (useful for testing). */
  skipRuntime?: boolean;
}
