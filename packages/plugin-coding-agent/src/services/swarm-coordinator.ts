/**
 * Swarm Coordinator — Event Bridge & Autonomous Coordination Loop
 *
 * Bridges PTY session events to:
 * 1. SSE clients (frontend dashboard) for real-time status
 * 2. LLM coordination decisions for unhandled blocking prompts
 *
 * The coordinator subscribes to PTYService session events and:
 * - Skips events already handled by auto-response rules (autoResponded=true)
 * - Routes unhandled blocking prompts through supervision levels:
 *   - autonomous: LLM decides immediately
 *   - confirm: queued for human approval
 *   - notify: broadcast only (no action)
 *
 * Heavy logic is extracted into:
 * - swarm-decision-loop.ts  (blocked, turn-complete, LLM decisions)
 * - swarm-idle-watchdog.ts  (idle session scanning)
 *
 * @module services/swarm-coordinator
 */

import type { ServerResponse } from "node:http";
import type { IAgentRuntime } from "@elizaos/core";
import { logger } from "@elizaos/core";
import { extractDevServerUrl } from "./ansi-utils.js";
import type { PTYService } from "./pty-service.js";
import type { CodingAgentType } from "./pty-types.js";
import type { CoordinationLLMResponse } from "./swarm-coordinator-prompts.js";
import {
  executeDecision as execDecision,
  handleBlocked,
  handleTurnComplete,
} from "./swarm-decision-loop.js";
import { scanIdleSessions } from "./swarm-idle-watchdog.js";

// ─── Types ───

/** Callback injected by server.ts to route chat messages to the user's conversation. */
export type ChatMessageCallback = (
  text: string,
  source?: string,
) => Promise<void>;

/** Callback injected by server.ts to relay coordinator events to WebSocket clients. */
export type WsBroadcastCallback = (event: SwarmEvent) => void;

export type SupervisionLevel = "autonomous" | "confirm" | "notify";

export interface TaskContext {
  sessionId: string;
  agentType: CodingAgentType;
  label: string;
  originalTask: string;
  workdir: string;
  status: "active" | "completed" | "error" | "stopped";
  decisions: CoordinationDecision[];
  autoResolvedCount: number;
  registeredAt: number;
  /** Timestamp of the last session event (any type). Used by idle watchdog. */
  lastActivityAt: number;
  /** How many idle checks have been performed on this session. */
  idleCheckCount: number;
}

export interface CoordinationDecision {
  timestamp: number;
  event: string;
  promptText: string;
  decision: "respond" | "escalate" | "ignore" | "complete" | "auto_resolved";
  response?: string;
  reasoning: string;
}

export interface SwarmEvent {
  type: string;
  sessionId: string;
  timestamp: number;
  data: unknown;
}

export interface PendingDecision {
  sessionId: string;
  promptText: string;
  recentOutput: string;
  llmDecision: CoordinationLLMResponse;
  taskContext: TaskContext;
  createdAt: number;
}

/**
 * Context interface exposing internal state and helpers to extracted modules.
 * Implemented by SwarmCoordinator — passed as `this` to module-level functions.
 */
export interface SwarmCoordinatorContext {
  readonly runtime: IAgentRuntime;
  readonly ptyService: PTYService | null;
  readonly tasks: Map<string, TaskContext>;
  readonly inFlightDecisions: Set<string>;
  readonly pendingDecisions: Map<string, PendingDecision>;
  /** Last-seen output snapshot per session — used by idle watchdog. */
  readonly lastSeenOutput: Map<string, string>;
  /** Timestamp of last tool_running chat notification per session — for throttling. */
  readonly lastToolNotification: Map<string, number>;

  broadcast(event: SwarmEvent): void;
  sendChatMessage(text: string, source?: string): void;
  log(message: string): void;
  getSupervisionLevel(): SupervisionLevel;
}

// ─── Constants ───

/** Time to buffer events for unregistered sessions (ms). */
const UNREGISTERED_BUFFER_MS = 2000;

/** How often the idle watchdog scans for idle sessions (ms). */
const IDLE_SCAN_INTERVAL_MS = 60 * 1000; // 1 minute

// ─── Service ───

export class SwarmCoordinator implements SwarmCoordinatorContext {
  static serviceType = "SWARM_COORDINATOR";

  readonly runtime: IAgentRuntime;
  ptyService: PTYService | null = null;
  private unsubscribeEvents: (() => void) | null = null;

  /** Per-session task context. */
  readonly tasks: Map<string, TaskContext> = new Map();

  /** SSE clients receiving live events. */
  private sseClients: Set<ServerResponse> = new Set();

  /** Supervision level (default: autonomous). */
  private supervisionLevel: SupervisionLevel = "autonomous";

  /** Pending confirmations for "confirm" mode. */
  readonly pendingDecisions: Map<string, PendingDecision> = new Map();

  /** In-flight decision lock — prevents parallel LLM calls for same session. */
  readonly inFlightDecisions: Set<string> = new Set();

  /** Callback to send chat messages to the user's conversation UI. */
  private chatCallback: ChatMessageCallback | null = null;

  /** Callback to relay coordinator events to WebSocket clients. */
  private wsBroadcast: WsBroadcastCallback | null = null;

  /** Buffer for events arriving before task registration. */
  private unregisteredBuffer: Map<
    string,
    Array<{ event: string; data: unknown; receivedAt: number }>
  > = new Map();

  /** Idle watchdog timer handle. */
  private idleWatchdogTimer: ReturnType<typeof setInterval> | null = null;

  /** Last-seen output snapshot per session — used by idle watchdog to detect data flow. */
  readonly lastSeenOutput: Map<string, string> = new Map();

  /** Timestamp of last tool_running chat notification per session — for throttling. */
  readonly lastToolNotification: Map<string, number> = new Map();

  constructor(runtime: IAgentRuntime) {
    this.runtime = runtime;
  }

  // ─── Chat Callback ───

  /** Inject a callback (from server.ts) to route messages to the user's chat UI. */
  setChatCallback(cb: ChatMessageCallback): void {
    this.chatCallback = cb;
    this.log("Chat callback wired");
  }

  /** Inject a callback (from server.ts) to relay events to WebSocket clients. */
  setWsBroadcast(cb: WsBroadcastCallback): void {
    this.wsBroadcast = cb;
    this.log("WS broadcast callback wired");
  }

  /** Null-safe wrapper — sends a message to the user's conversation if callback is set. */
  sendChatMessage(text: string, source?: string): void {
    if (!this.chatCallback) return;
    this.chatCallback(text, source).catch((err) => {
      this.log(`Failed to send chat message: ${err}`);
    });
  }

  // ─── Lifecycle ───

  /**
   * Initialize the coordinator by subscribing to PTY session events.
   * Called from plugin init after services are ready.
   */
  start(ptyService: PTYService): void {
    this.ptyService = ptyService;
    this.unsubscribeEvents = ptyService.onSessionEvent(
      (sessionId, event, data) => {
        this.handleSessionEvent(sessionId, event, data).catch((err) => {
          this.log(`Error handling event: ${err}`);
        });
      },
    );

    // Start idle watchdog
    this.idleWatchdogTimer = setInterval(() => {
      scanIdleSessions(this).catch((err) => {
        this.log(`Idle watchdog error: ${err}`);
      });
    }, IDLE_SCAN_INTERVAL_MS);

    this.log("SwarmCoordinator started");
  }

  stop(): void {
    if (this.idleWatchdogTimer) {
      clearInterval(this.idleWatchdogTimer);
      this.idleWatchdogTimer = null;
    }
    if (this.unsubscribeEvents) {
      this.unsubscribeEvents();
      this.unsubscribeEvents = null;
    }
    // Close all SSE connections
    for (const client of this.sseClients) {
      if (!client.writableEnded) {
        client.end();
      }
    }
    this.sseClients.clear();
    this.tasks.clear();
    this.pendingDecisions.clear();
    this.inFlightDecisions.clear();
    this.unregisteredBuffer.clear();
    this.lastSeenOutput.clear();
    this.lastToolNotification.clear();
    this.log("SwarmCoordinator stopped");
  }

  // ─── Task Registration ───

  registerTask(
    sessionId: string,
    context: {
      agentType: CodingAgentType;
      label: string;
      originalTask: string;
      workdir: string;
    },
  ): void {
    this.tasks.set(sessionId, {
      sessionId,
      agentType: context.agentType,
      label: context.label,
      originalTask: context.originalTask,
      workdir: context.workdir,
      status: "active",
      decisions: [],
      autoResolvedCount: 0,
      registeredAt: Date.now(),
      lastActivityAt: Date.now(),
      idleCheckCount: 0,
    });

    this.broadcast({
      type: "task_registered",
      sessionId,
      timestamp: Date.now(),
      data: {
        agentType: context.agentType,
        label: context.label,
        originalTask: context.originalTask,
      },
    });

    // Flush any buffered events for this session
    const buffered = this.unregisteredBuffer.get(sessionId);
    if (buffered) {
      this.unregisteredBuffer.delete(sessionId);
      for (const entry of buffered) {
        this.handleSessionEvent(sessionId, entry.event, entry.data).catch(
          (err) => {
            this.log(`Error replaying buffered event: ${err}`);
          },
        );
      }
    }
  }

  getTaskContext(sessionId: string): TaskContext | undefined {
    return this.tasks.get(sessionId);
  }

  getAllTaskContexts(): TaskContext[] {
    return Array.from(this.tasks.values());
  }

  // ─── SSE Client Management ───

  /**
   * Register an SSE client. Returns an unsubscribe function.
   * Sends a snapshot of current state on connect.
   */
  addSseClient(res: ServerResponse): () => void {
    this.sseClients.add(res);

    // Send snapshot on connect
    const snapshot: SwarmEvent = {
      type: "snapshot",
      sessionId: "*",
      timestamp: Date.now(),
      data: {
        tasks: this.getAllTaskContexts(),
        supervisionLevel: this.supervisionLevel,
        pendingCount: this.pendingDecisions.size,
      },
    };
    this.writeSseEvent(res, snapshot);

    // Remove on close
    const cleanup = () => {
      this.sseClients.delete(res);
    };
    res.on("close", cleanup);

    return cleanup;
  }

  broadcast(event: SwarmEvent): void {
    const dead: ServerResponse[] = [];
    for (const client of this.sseClients) {
      if (client.writableEnded) {
        dead.push(client);
        continue;
      }
      this.writeSseEvent(client, event);
    }
    // Cleanup dead connections
    for (const d of dead) {
      this.sseClients.delete(d);
    }
    // Relay to WebSocket clients
    this.wsBroadcast?.(event);
  }

  private writeSseEvent(res: ServerResponse, event: SwarmEvent): void {
    try {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    } catch {
      // Connection may have closed
    }
  }

  // ─── Event Handling ───

  async handleSessionEvent(
    sessionId: string,
    event: string,
    data: unknown,
  ): Promise<void> {
    const taskCtx = this.tasks.get(sessionId);

    // Buffer events for unregistered sessions (race condition guard)
    if (!taskCtx) {
      if (
        event === "blocked" ||
        event === "task_complete" ||
        event === "error"
      ) {
        let buffer = this.unregisteredBuffer.get(sessionId);
        if (!buffer) {
          buffer = [];
          this.unregisteredBuffer.set(sessionId, buffer);
        }
        buffer.push({ event, data, receivedAt: Date.now() });

        // Re-check after delay
        setTimeout(() => {
          const stillBuffered = this.unregisteredBuffer.get(sessionId);
          if (stillBuffered && stillBuffered.length > 0) {
            const ctx = this.tasks.get(sessionId);
            if (ctx) {
              // Task was registered — flush
              this.unregisteredBuffer.delete(sessionId);
              for (const entry of stillBuffered) {
                this.handleSessionEvent(
                  sessionId,
                  entry.event,
                  entry.data,
                ).catch(() => {});
              }
            } else {
              // Still no task context — discard
              this.unregisteredBuffer.delete(sessionId);
              this.log(
                `Discarding ${stillBuffered.length} buffered events for unregistered session ${sessionId}`,
              );
            }
          }
        }, UNREGISTERED_BUFFER_MS);
      }
      return;
    }

    // Update activity timestamp — resets idle watchdog for this session
    taskCtx.lastActivityAt = Date.now();
    taskCtx.idleCheckCount = 0;

    // Route by event type
    switch (event) {
      case "blocked":
        await handleBlocked(this, sessionId, taskCtx, data);
        break;

      case "task_complete": {
        // The adapter detected a turn completion (agent back at idle prompt).
        // Don't immediately stop — ask the LLM if the overall task is done
        // or if the agent needs more turns.
        this.broadcast({
          type: "turn_complete",
          sessionId,
          timestamp: Date.now(),
          data,
        });

        await handleTurnComplete(this, sessionId, taskCtx, data);
        break;
      }

      case "error": {
        taskCtx.status = "error";
        this.broadcast({
          type: "error",
          sessionId,
          timestamp: Date.now(),
          data,
        });

        // Send error message to chat UI
        const errorMsg =
          (data as { message?: string }).message ?? "unknown error";
        this.sendChatMessage(
          `"${taskCtx.label}" hit an error: ${errorMsg}`,
          "coding-agent",
        );
        break;
      }

      case "stopped":
        taskCtx.status = "stopped";
        this.broadcast({
          type: "stopped",
          sessionId,
          timestamp: Date.now(),
          data,
        });
        break;

      case "ready":
        this.broadcast({
          type: "ready",
          sessionId,
          timestamp: Date.now(),
          data,
        });
        break;

      case "tool_running": {
        // Agent is actively working via an external tool — keep watchdog happy
        taskCtx.lastActivityAt = Date.now();
        taskCtx.idleCheckCount = 0;

        this.broadcast({
          type: "tool_running",
          sessionId,
          timestamp: Date.now(),
          data,
        });

        // Throttle chat notifications: at most one per 30s per session
        const toolData = data as {
          toolName?: string;
          description?: string;
        };
        const now = Date.now();
        const lastNotif = this.lastToolNotification.get(sessionId) ?? 0;
        if (now - lastNotif > 30_000) {
          this.lastToolNotification.set(sessionId, now);
          const toolDesc =
            toolData.description ?? toolData.toolName ?? "an external tool";

          // Try to extract a dev server URL from recent output
          let urlSuffix = "";
          if (this.ptyService) {
            try {
              const recentOutput = await this.ptyService.getSessionOutput(
                sessionId,
                50,
              );
              const devUrl = extractDevServerUrl(recentOutput);
              if (devUrl) {
                urlSuffix = ` Dev server running at ${devUrl}`;
              }
            } catch {
              // Best-effort — don't block on failure
            }
          }

          this.sendChatMessage(
            `[${taskCtx.label}] Running ${toolDesc}.${urlSuffix} The agent is working outside the terminal — I'll let it finish.`,
            "coding-agent",
          );
        }
        break;
      }

      default:
        // Broadcast unknown events for observability
        this.broadcast({
          type: event,
          sessionId,
          timestamp: Date.now(),
          data,
        });
    }
  }

  // ─── LLM Decision (delegated) ───

  async makeCoordinationDecision(
    taskCtx: TaskContext,
    promptText: string,
    recentOutput: string,
  ): Promise<CoordinationLLMResponse | null> {
    // Re-export for backward compatibility — delegates to module function
    const { makeCoordinationDecision: mkDecision } = await import(
      "./swarm-decision-loop.js"
    );
    return mkDecision(this, taskCtx, promptText, recentOutput);
  }

  async executeDecision(
    sessionId: string,
    decision: CoordinationLLMResponse,
  ): Promise<void> {
    return execDecision(this, sessionId, decision);
  }

  // ─── Supervision ───

  setSupervisionLevel(level: SupervisionLevel): void {
    this.supervisionLevel = level;
    this.broadcast({
      type: "supervision_changed",
      sessionId: "*",
      timestamp: Date.now(),
      data: { level },
    });
    this.log(`Supervision level set to: ${level}`);
  }

  getSupervisionLevel(): SupervisionLevel {
    return this.supervisionLevel;
  }

  // ─── Confirmation Queue ───

  getPendingConfirmations(): PendingDecision[] {
    return Array.from(this.pendingDecisions.values());
  }

  async confirmDecision(
    sessionId: string,
    approved: boolean,
    override?: { response?: string; useKeys?: boolean; keys?: string[] },
  ): Promise<void> {
    const pending = this.pendingDecisions.get(sessionId);
    if (!pending) {
      throw new Error(`No pending decision for session ${sessionId}`);
    }

    this.pendingDecisions.delete(sessionId);
    const taskCtx = this.tasks.get(sessionId);

    if (approved) {
      // Use override if provided, otherwise use LLM suggestion
      const decision: CoordinationLLMResponse = override
        ? {
            action: "respond",
            response: override.response,
            useKeys: override.useKeys,
            keys: override.keys,
            reasoning: "Human-approved (with override)",
          }
        : pending.llmDecision;

      if (taskCtx) {
        taskCtx.decisions.push({
          timestamp: Date.now(),
          event: "blocked",
          promptText: pending.promptText,
          decision: decision.action,
          response:
            decision.action === "respond"
              ? decision.useKeys
                ? `keys:${decision.keys?.join(",")}`
                : decision.response
              : undefined,
          reasoning: `Human-approved: ${decision.reasoning}`,
        });
        taskCtx.autoResolvedCount = 0;
      }

      await this.executeDecision(sessionId, decision);

      this.broadcast({
        type: "confirmation_approved",
        sessionId,
        timestamp: Date.now(),
        data: {
          action: decision.action,
          response: decision.response,
          useKeys: decision.useKeys,
          keys: decision.keys,
        },
      });
    } else {
      // Rejected — record and broadcast
      if (taskCtx) {
        taskCtx.decisions.push({
          timestamp: Date.now(),
          event: "blocked",
          promptText: pending.promptText,
          decision: "escalate",
          reasoning: "Human rejected the suggested action",
        });
      }

      this.broadcast({
        type: "confirmation_rejected",
        sessionId,
        timestamp: Date.now(),
        data: { prompt: pending.promptText },
      });
    }
  }

  // ─── Internal ───

  log(message: string): void {
    logger.info(`[SwarmCoordinator] ${message}`);
  }
}
