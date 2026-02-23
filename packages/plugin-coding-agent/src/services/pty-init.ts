/**
 * PTY manager initialization — extracted from PTYService.initialize().
 *
 * Creates either a BunCompatiblePTYManager (for Bun runtime) or PTYManager
 * (for Node), wires up event handlers, and returns the configured manager.
 *
 * @module services/pty-init
 */

import { createAllAdapters } from "coding-agent-adapters";
import {
  BunCompatiblePTYManager,
  isBun,
  PTYManager,
  type PTYManagerConfig,
  type SessionHandle,
  type SessionMessage,
  ShellAdapter,
  type StallClassification,
  type WorkerSessionHandle,
} from "pty-manager";
import { captureTaskResponse } from "./ansi-utils.js";
import type { PTYServiceConfig } from "./pty-types.js";

/**
 * All callbacks and state that the initialization logic needs
 * from the surrounding PTYService instance.
 */
export interface InitContext {
  serviceConfig: PTYServiceConfig;
  classifyStall: (
    sessionId: string,
    recentOutput: string,
  ) => Promise<StallClassification | null>;
  emitEvent: (sessionId: string, event: string, data: unknown) => void;
  handleGeminiAuth: (sessionId: string) => void;
  sessionOutputBuffers: Map<string, string[]>;
  taskResponseMarkers: Map<string, number>;
  metricsTracker: {
    recordCompletion(type: string, method: string, durationMs: number): void;
  };
  traceEntries: Array<string | Record<string, unknown>>;
  maxTraceEntries: number;
  log: (msg: string) => void;
}

/** Value returned by {@link initializePTYManager}. */
export interface InitResult {
  manager: PTYManager | BunCompatiblePTYManager;
  usingBunWorker: boolean;
}

/**
 * Create and configure a PTY manager for the current runtime.
 *
 * - **Bun**: instantiates a {@link BunCompatiblePTYManager} that spawns a
 *   Node worker process and communicates via JSON-RPC over stdio.
 * - **Node**: instantiates a {@link PTYManager} directly and registers
 *   all built-in adapters in-process.
 */
export async function initializePTYManager(
  ctx: InitContext,
): Promise<InitResult> {
  const usingBunWorker = isBun();

  if (usingBunWorker) {
    // Use Bun-compatible manager that spawns a Node worker
    ctx.log("Detected Bun runtime, using BunCompatiblePTYManager");
    const bunManager = new BunCompatiblePTYManager({
      adapterModules: ["coding-agent-adapters"],
      stallDetectionEnabled: true,
      stallTimeoutMs: 4000,
      onStallClassify: async (
        sessionId: string,
        recentOutput: string,
        _stallDurationMs: number,
      ) => {
        return ctx.classifyStall(sessionId, recentOutput);
      },
    });

    // Set up event forwarding for worker-based manager
    bunManager.on("session_ready", (session: WorkerSessionHandle) => {
      ctx.log(
        `session_ready event received for ${session.id} (type: ${session.type}, status: ${session.status})`,
      );
      ctx.emitEvent(session.id, "ready", { session });
    });

    bunManager.on("session_exit", (id: string, code: number) => {
      ctx.emitEvent(id, "stopped", { reason: `exit code ${code}` });
    });

    bunManager.on("session_error", (id: string, error: string) => {
      ctx.emitEvent(id, "error", { message: error });
    });

    bunManager.on(
      "blocking_prompt",
      (
        session: WorkerSessionHandle,
        promptInfo: unknown,
        autoResponded: boolean,
      ) => {
        const info = promptInfo as
          | { type?: string; prompt?: string }
          | undefined;
        ctx.log(
          `blocking_prompt for ${session.id}: type=${info?.type}, autoResponded=${autoResponded}, prompt="${(info?.prompt ?? "").slice(0, 80)}"`,
        );
        ctx.emitEvent(session.id, "blocked", { promptInfo, autoResponded });
      },
    );

    bunManager.on(
      "login_required",
      (session: WorkerSessionHandle, instructions?: string, url?: string) => {
        // Auto-handle Gemini auth flow
        if (session.type === "gemini") {
          ctx.handleGeminiAuth(session.id);
        }
        ctx.emitEvent(session.id, "login_required", { instructions, url });
      },
    );

    bunManager.on("task_complete", (session: WorkerSessionHandle) => {
      const response = captureTaskResponse(
        session.id,
        ctx.sessionOutputBuffers,
        ctx.taskResponseMarkers,
      );
      const durationMs = session.startedAt
        ? Date.now() - new Date(session.startedAt).getTime()
        : 0;
      ctx.metricsTracker.recordCompletion(
        session.type,
        "fast-path",
        durationMs,
      );
      ctx.log(
        `Task complete for ${session.id} (adapter fast-path), response: ${response.length} chars`,
      );
      ctx.emitEvent(session.id, "task_complete", { session, response });
    });

    bunManager.on("message", (message: SessionMessage) => {
      ctx.emitEvent(message.sessionId, "message", message);
    });

    // Log worker-level stderr (pino logs from pty-manager worker process).
    // Strip the "Invalid JSON from worker:" prefix that BunCompatiblePTYManager
    // adds when stderr lines aren't valid JSON-RPC responses.
    bunManager.on("worker_error", (err: unknown) => {
      const raw = typeof err === "string" ? err : String(err);
      const msg = raw.replace(/^Invalid JSON from worker:\s*/i, "").trim();
      if (!msg) return;
      // Capture task completion trace entries for timeline analysis
      if (msg.includes("Task completion trace")) {
        ctx.traceEntries.push(msg);
        if (ctx.traceEntries.length > ctx.maxTraceEntries) {
          ctx.traceEntries.splice(
            0,
            ctx.traceEntries.length - ctx.maxTraceEntries,
          );
        }
      }
      // Show operational logs at info level
      if (
        msg.includes("ready") ||
        msg.includes("blocking") ||
        msg.includes("auto-response") ||
        msg.includes("Auto-responding") ||
        msg.includes("detectReady") ||
        msg.includes("stall") ||
        msg.includes("Stall") ||
        msg.includes("Task completion") ||
        msg.includes("Spawning") ||
        msg.includes("PTY session")
      ) {
        console.log("[PTYService/Worker]", msg);
      } else {
        console.error("[PTYService/Worker]", msg.slice(0, 200));
      }
    });

    bunManager.on("worker_exit", (info: { code: number; signal: string }) => {
      console.error("[PTYService] Worker exited:", info);
    });

    await bunManager.waitForReady();
    return { manager: bunManager, usingBunWorker: true };
  }

  // Use native PTYManager directly in Node
  ctx.log("Using native PTYManager");
  const managerConfig: PTYManagerConfig = {
    maxLogLines: ctx.serviceConfig.maxLogLines,
    stallDetectionEnabled: true,
    stallTimeoutMs: 4000,
    onStallClassify: async (
      sessionId: string,
      recentOutput: string,
      _stallDurationMs: number,
    ) => {
      return ctx.classifyStall(sessionId, recentOutput);
    },
  };

  const nodeManager = new PTYManager(managerConfig);

  // Register built-in adapters
  nodeManager.registerAdapter(new ShellAdapter());

  // Register coding agent adapters (claude, gemini, codex, aider)
  if (ctx.serviceConfig.registerCodingAdapters) {
    const codingAdapters = createAllAdapters();
    for (const adapter of codingAdapters) {
      nodeManager.registerAdapter(adapter);
      ctx.log(`Registered ${adapter.adapterType} adapter`);
    }
  }

  // Set up event forwarding
  nodeManager.on("session_ready", (session: SessionHandle) => {
    ctx.emitEvent(session.id, "ready", { session });
  });

  nodeManager.on(
    "blocking_prompt",
    (session: SessionHandle, promptInfo: unknown, autoResponded: boolean) => {
      ctx.emitEvent(session.id, "blocked", { promptInfo, autoResponded });
    },
  );

  nodeManager.on(
    "login_required",
    (session: SessionHandle, instructions?: string, url?: string) => {
      if (session.type === "gemini") {
        ctx.handleGeminiAuth(session.id);
      }
      ctx.emitEvent(session.id, "login_required", { instructions, url });
    },
  );

  nodeManager.on("task_complete", (session: SessionHandle) => {
    const response = captureTaskResponse(
      session.id,
      ctx.sessionOutputBuffers,
      ctx.taskResponseMarkers,
    );
    const durationMs = session.startedAt
      ? Date.now() - new Date(session.startedAt).getTime()
      : 0;
    ctx.metricsTracker.recordCompletion(session.type, "fast-path", durationMs);
    ctx.log(
      `Task complete for ${session.id} (adapter fast-path), response: ${response.length} chars`,
    );
    ctx.emitEvent(session.id, "task_complete", { session, response });
  });

  nodeManager.on(
    "session_stopped",
    (session: SessionHandle, reason: string) => {
      ctx.emitEvent(session.id, "stopped", { reason });
    },
  );

  nodeManager.on("session_error", (session: SessionHandle, error: string) => {
    ctx.emitEvent(session.id, "error", { message: error });
  });

  nodeManager.on("message", (message: SessionMessage) => {
    ctx.emitEvent(message.sessionId, "message", message);
  });

  return { manager: nodeManager, usingBunWorker: false };
}
