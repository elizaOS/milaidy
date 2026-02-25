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
 * @module services/swarm-coordinator
 */

import type { ServerResponse } from "node:http";
import type { IAgentRuntime } from "@elizaos/core";
import { ModelType } from "@elizaos/core";
import {
  cleanForChat,
  extractCompletionSummary,
  extractDevServerUrl,
} from "./ansi-utils.js";
import type { PTYService } from "./pty-service.js";
import type { CodingAgentType } from "./pty-types.js";
import {
  buildCoordinationPrompt,
  buildIdleCheckPrompt,
  buildTurnCompletePrompt,
  type CoordinationLLMResponse,
  type DecisionHistoryEntry,
  parseCoordinationResponse,
  type TaskContextSummary,
} from "./swarm-coordinator-prompts.js";

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

// ─── Service ───

/** Maximum consecutive auto-responses before escalating to a human. */
const MAX_AUTO_RESPONSES = 10;

/** Time to buffer events for unregistered sessions (ms). */
const UNREGISTERED_BUFFER_MS = 2000;

/** How long a session can be idle before the watchdog checks on it (ms). */
const IDLE_THRESHOLD_MS = 3 * 60 * 1000; // 3 minutes

/** How often the idle watchdog scans for idle sessions (ms). */
const IDLE_SCAN_INTERVAL_MS = 60 * 1000; // 1 minute

/** Max idle checks before force-escalating a session. */
const MAX_IDLE_CHECKS = 3;

export class SwarmCoordinator {
  static serviceType = "SWARM_COORDINATOR";

  private runtime: IAgentRuntime;
  private ptyService: PTYService | null = null;
  private unsubscribeEvents: (() => void) | null = null;

  /** Per-session task context. */
  private tasks: Map<string, TaskContext> = new Map();

  /** SSE clients receiving live events. */
  private sseClients: Set<ServerResponse> = new Set();

  /** Supervision level (default: autonomous). */
  private supervisionLevel: SupervisionLevel = "autonomous";

  /** Pending confirmations for "confirm" mode. */
  private pendingDecisions: Map<string, PendingDecision> = new Map();

  /** In-flight decision lock — prevents parallel LLM calls for same session. */
  private inFlightDecisions: Set<string> = new Set();

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
  private lastSeenOutput: Map<string, string> = new Map();

  /** Timestamp of last tool_running chat notification per session — for throttling. */
  private lastToolNotification: Map<string, number> = new Map();

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
  private sendChatMessage(text: string, source?: string): void {
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
      this.scanIdleSessions().catch((err) => {
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
        this.handleSessionEvent(entry.event, sessionId, entry.data).catch(
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

  private broadcast(event: SwarmEvent): void {
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
        await this.handleBlocked(sessionId, taskCtx, data);
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

        await this.handleTurnComplete(sessionId, taskCtx, data);
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

  private async handleBlocked(
    sessionId: string,
    taskCtx: TaskContext,
    data: unknown,
  ): Promise<void> {
    // Event data from pty-init: { promptInfo: BlockingPromptInfo, autoResponded: boolean }
    const eventData = data as {
      promptInfo?: {
        type?: string;
        prompt?: string;
        canAutoRespond?: boolean;
        instructions?: string;
      };
      autoResponded?: boolean;
    };

    // Extract prompt text from promptInfo (the actual blocking prompt info object)
    const promptText =
      eventData.promptInfo?.prompt ?? eventData.promptInfo?.instructions ?? "";

    // Auto-responded by rules — log and broadcast, no LLM needed
    if (eventData.autoResponded) {
      taskCtx.autoResolvedCount++;
      taskCtx.decisions.push({
        timestamp: Date.now(),
        event: "blocked",
        promptText,
        decision: "auto_resolved",
        reasoning: "Handled by auto-response rules",
      });

      this.broadcast({
        type: "blocked_auto_resolved",
        sessionId,
        timestamp: Date.now(),
        data: {
          prompt: promptText,
          promptType: eventData.promptInfo?.type,
          autoResolvedCount: taskCtx.autoResolvedCount,
        },
      });

      // Throttled chat message: 1st, 2nd, then every 5th
      const count = taskCtx.autoResolvedCount;
      if (count <= 2 || count % 5 === 0) {
        const excerpt =
          promptText.length > 120
            ? `${promptText.slice(0, 120)}...`
            : promptText;
        this.sendChatMessage(
          `[${taskCtx.label}] Approved: ${excerpt}`,
          "coding-agent",
        );
      }
      return;
    }

    // Broadcast that the agent is blocked (for all supervision levels)
    this.broadcast({
      type: "blocked",
      sessionId,
      timestamp: Date.now(),
      data: {
        prompt: promptText,
        promptType: eventData.promptInfo?.type,
        supervisionLevel: this.supervisionLevel,
      },
    });

    // Safety check: escalate after too many consecutive auto-responses
    if (taskCtx.autoResolvedCount >= MAX_AUTO_RESPONSES) {
      taskCtx.decisions.push({
        timestamp: Date.now(),
        event: "blocked",
        promptText,
        decision: "escalate",
        reasoning: `Escalating after ${MAX_AUTO_RESPONSES} consecutive auto-responses`,
      });
      this.broadcast({
        type: "escalation",
        sessionId,
        timestamp: Date.now(),
        data: {
          prompt: promptText,
          reason: "max_auto_responses_exceeded",
        },
      });
      return;
    }

    // Route based on supervision level
    switch (this.supervisionLevel) {
      case "autonomous":
        await this.handleAutonomousDecision(
          sessionId,
          taskCtx,
          promptText,
          "", // recentOutput fetched by handleAutonomousDecision from PTY
        );
        break;

      case "confirm":
        await this.handleConfirmDecision(
          sessionId,
          taskCtx,
          promptText,
          "", // recentOutput fetched by handleConfirmDecision from PTY
        );
        break;

      case "notify":
        // Notify mode — broadcast only, no action
        taskCtx.decisions.push({
          timestamp: Date.now(),
          event: "blocked",
          promptText,
          decision: "escalate",
          reasoning: "Supervision level is notify — broadcasting only",
        });
        break;
    }
  }

  // ─── Turn Completion Assessment ───

  /**
   * Handle a turn completion event. Instead of immediately stopping the session,
   * ask the LLM whether the overall task is done or the agent needs more turns.
   */
  private async handleTurnComplete(
    sessionId: string,
    taskCtx: TaskContext,
    data: unknown,
  ): Promise<void> {
    // Debounce — skip if already assessing this session
    if (this.inFlightDecisions.has(sessionId)) {
      this.log(
        `Skipping turn-complete assessment for ${sessionId} (in-flight)`,
      );
      return;
    }

    this.inFlightDecisions.add(sessionId);
    try {
      this.log(
        `Turn complete for "${taskCtx.label}" — assessing whether task is done`,
      );

      // Get the turn output — prefer the captured response, fall back to PTY output
      const rawResponse = (data as { response?: string }).response ?? "";
      let turnOutput = cleanForChat(rawResponse);
      if (!turnOutput && this.ptyService) {
        try {
          const raw = await this.ptyService.getSessionOutput(sessionId, 50);
          turnOutput = cleanForChat(raw);
        } catch {
          turnOutput = "";
        }
      }

      const contextSummary: TaskContextSummary = {
        sessionId,
        agentType: taskCtx.agentType,
        label: taskCtx.label,
        originalTask: taskCtx.originalTask,
        workdir: taskCtx.workdir,
      };

      const decisionHistory: DecisionHistoryEntry[] = taskCtx.decisions
        .filter((d) => d.decision !== "auto_resolved")
        .slice(-5)
        .map((d) => ({
          event: d.event,
          promptText: d.promptText,
          action: d.decision,
          response: d.response,
          reasoning: d.reasoning,
        }));

      const prompt = buildTurnCompletePrompt(
        contextSummary,
        turnOutput,
        decisionHistory,
      );

      let decision: CoordinationLLMResponse | null = null;
      try {
        const result = await this.runtime.useModel(ModelType.TEXT_SMALL, {
          prompt,
        });
        decision = parseCoordinationResponse(result);
      } catch (err) {
        this.log(`Turn-complete LLM call failed: ${err}`);
      }

      if (!decision) {
        // LLM failed — fall back to completing (safer than leaving session hanging)
        this.log(
          `Turn-complete for "${taskCtx.label}": LLM invalid response — defaulting to complete`,
        );
        decision = {
          action: "complete",
          reasoning: "LLM returned invalid response — defaulting to complete",
        };
      }

      // Log the decision
      this.log(
        `Turn assessment for "${taskCtx.label}": ${decision.action}${
          decision.action === "respond"
            ? ` → "${(decision.response ?? "").slice(0, 80)}"`
            : ""
        } — ${decision.reasoning.slice(0, 120)}`,
      );

      // Record
      taskCtx.decisions.push({
        timestamp: Date.now(),
        event: "turn_complete",
        promptText: "Agent finished a turn",
        decision: decision.action,
        response:
          decision.action === "respond"
            ? decision.useKeys
              ? `keys:${decision.keys?.join(",")}`
              : decision.response
            : undefined,
        reasoning: decision.reasoning,
      });

      this.broadcast({
        type: "turn_assessment",
        sessionId,
        timestamp: Date.now(),
        data: {
          action: decision.action,
          reasoning: decision.reasoning,
        },
      });

      // Chat message
      if (decision.action === "respond") {
        const instruction = decision.response ?? "";
        const preview =
          instruction.length > 120
            ? `${instruction.slice(0, 120)}...`
            : instruction;
        this.sendChatMessage(
          `[${taskCtx.label}] Turn done, continuing: ${preview}`,
          "coding-agent",
        );
      } else if (decision.action === "escalate") {
        this.sendChatMessage(
          `[${taskCtx.label}] Turn finished — needs your attention: ${decision.reasoning}`,
          "coding-agent",
        );
      }
      // "complete" chat message is handled by executeDecision

      await this.executeDecision(sessionId, decision);
    } finally {
      this.inFlightDecisions.delete(sessionId);
    }
  }

  // ─── LLM Decision Loop ───

  async makeCoordinationDecision(
    taskCtx: TaskContext,
    promptText: string,
    recentOutput: string,
  ): Promise<CoordinationLLMResponse | null> {
    const contextSummary: TaskContextSummary = {
      sessionId: taskCtx.sessionId,
      agentType: taskCtx.agentType,
      label: taskCtx.label,
      originalTask: taskCtx.originalTask,
      workdir: taskCtx.workdir,
    };

    const decisionHistory: DecisionHistoryEntry[] = taskCtx.decisions
      .filter((d) => d.decision !== "auto_resolved")
      .slice(-5)
      .map((d) => ({
        event: d.event,
        promptText: d.promptText,
        action: d.decision,
        response: d.response,
        reasoning: d.reasoning,
      }));

    const prompt = buildCoordinationPrompt(
      contextSummary,
      promptText,
      recentOutput,
      decisionHistory,
    );

    try {
      const result = await this.runtime.useModel(ModelType.TEXT_SMALL, {
        prompt,
      });
      return parseCoordinationResponse(result);
    } catch (err) {
      this.log(`LLM coordination call failed: ${err}`);
      return null;
    }
  }

  async executeDecision(
    sessionId: string,
    decision: CoordinationLLMResponse,
  ): Promise<void> {
    if (!this.ptyService) return;

    switch (decision.action) {
      case "respond":
        if (decision.useKeys && decision.keys) {
          await this.ptyService.sendKeysToSession(sessionId, decision.keys);
        } else if (decision.response !== undefined) {
          await this.ptyService.sendToSession(sessionId, decision.response);
        }
        break;

      case "complete": {
        // LLM recognized the task is done — trigger completion flow
        const taskCtx = this.tasks.get(sessionId);
        if (taskCtx) {
          taskCtx.status = "completed";
        }
        this.broadcast({
          type: "task_complete",
          sessionId,
          timestamp: Date.now(),
          data: { reasoning: decision.reasoning },
        });

        // Extract meaningful artifacts (PR URLs, commits) instead of
        // dumping raw terminal output which is full of TUI noise.
        let summary = "";
        try {
          const rawOutput = await this.ptyService.getSessionOutput(
            sessionId,
            50,
          );
          summary = extractCompletionSummary(rawOutput);
        } catch {
          /* ignore */
        }

        this.sendChatMessage(
          summary
            ? `Finished "${taskCtx?.label ?? sessionId}".\n\n${summary}`
            : `Finished "${taskCtx?.label ?? sessionId}".`,
          "coding-agent",
        );

        // Stop the session
        this.ptyService.stopSession(sessionId).catch((err) => {
          this.log(
            `Failed to stop session after LLM-detected completion: ${err}`,
          );
        });
        break;
      }

      case "escalate":
        this.broadcast({
          type: "escalation",
          sessionId,
          timestamp: Date.now(),
          data: {
            reasoning: decision.reasoning,
          },
        });
        break;

      case "ignore":
        // No action needed
        break;
    }
  }

  private async handleAutonomousDecision(
    sessionId: string,
    taskCtx: TaskContext,
    promptText: string,
    recentOutput: string,
  ): Promise<void> {
    // Debounce: skip if decision already in-flight for this session
    if (this.inFlightDecisions.has(sessionId)) {
      this.log(`Skipping duplicate decision for ${sessionId} (in-flight)`);
      return;
    }

    this.inFlightDecisions.add(sessionId);
    try {
      // Get recent output from PTY if not provided
      let output = recentOutput;
      if (!output && this.ptyService) {
        try {
          output = await this.ptyService.getSessionOutput(sessionId, 50);
        } catch {
          output = "";
        }
      }

      const decision = await this.makeCoordinationDecision(
        taskCtx,
        promptText,
        output,
      );

      if (!decision) {
        // LLM returned invalid response — escalate
        taskCtx.decisions.push({
          timestamp: Date.now(),
          event: "blocked",
          promptText,
          decision: "escalate",
          reasoning: "LLM returned invalid coordination response",
        });
        this.broadcast({
          type: "escalation",
          sessionId,
          timestamp: Date.now(),
          data: {
            prompt: promptText,
            reason: "invalid_llm_response",
          },
        });
        return;
      }

      // Record the decision
      taskCtx.decisions.push({
        timestamp: Date.now(),
        event: "blocked",
        promptText,
        decision: decision.action,
        response:
          decision.action === "respond"
            ? decision.useKeys
              ? `keys:${decision.keys?.join(",")}`
              : decision.response
            : undefined,
        reasoning: decision.reasoning,
      });

      // Reset auto-resolved count on manual decision
      taskCtx.autoResolvedCount = 0;

      // Broadcast the decision
      this.broadcast({
        type: "coordination_decision",
        sessionId,
        timestamp: Date.now(),
        data: {
          action: decision.action,
          response: decision.response,
          useKeys: decision.useKeys,
          keys: decision.keys,
          reasoning: decision.reasoning,
        },
      });

      // Send chat message for LLM decisions (always — they're infrequent)
      if (decision.action === "respond") {
        const actionDesc = decision.useKeys
          ? `Sent keys: ${decision.keys?.join(", ")}`
          : decision.response
            ? `Responded: ${decision.response.length > 100 ? `${decision.response.slice(0, 100)}...` : decision.response}`
            : "Responded";
        const reasonExcerpt =
          decision.reasoning.length > 150
            ? `${decision.reasoning.slice(0, 150)}...`
            : decision.reasoning;
        this.sendChatMessage(
          `[${taskCtx.label}] ${actionDesc} — ${reasonExcerpt}`,
          "coding-agent",
        );
      } else if (decision.action === "escalate") {
        this.sendChatMessage(
          `[${taskCtx.label}] Needs your attention: ${decision.reasoning}`,
          "coding-agent",
        );
      }

      // Execute
      await this.executeDecision(sessionId, decision);
    } finally {
      this.inFlightDecisions.delete(sessionId);
    }
  }

  private async handleConfirmDecision(
    sessionId: string,
    taskCtx: TaskContext,
    promptText: string,
    recentOutput: string,
  ): Promise<void> {
    // Debounce
    if (this.inFlightDecisions.has(sessionId)) return;

    this.inFlightDecisions.add(sessionId);
    try {
      let output = recentOutput;
      if (!output && this.ptyService) {
        try {
          output = await this.ptyService.getSessionOutput(sessionId, 50);
        } catch {
          output = "";
        }
      }

      const decision = await this.makeCoordinationDecision(
        taskCtx,
        promptText,
        output,
      );

      if (!decision) {
        // Queue for human with no LLM suggestion
        this.pendingDecisions.set(sessionId, {
          sessionId,
          promptText,
          recentOutput: output,
          llmDecision: {
            action: "escalate",
            reasoning: "LLM returned invalid response — needs human review",
          },
          taskContext: taskCtx,
          createdAt: Date.now(),
        });
      } else {
        // Queue the LLM's suggestion for human approval
        this.pendingDecisions.set(sessionId, {
          sessionId,
          promptText,
          recentOutput: output,
          llmDecision: decision,
          taskContext: taskCtx,
          createdAt: Date.now(),
        });
      }

      this.broadcast({
        type: "pending_confirmation",
        sessionId,
        timestamp: Date.now(),
        data: {
          prompt: promptText,
          suggestedAction: decision?.action,
          suggestedResponse: decision?.response,
          reasoning: decision?.reasoning,
        },
      });
    } finally {
      this.inFlightDecisions.delete(sessionId);
    }
  }

  // ─── Idle Watchdog ───

  /**
   * Scan all active sessions for idle ones. Called periodically by the watchdog timer.
   */
  private async scanIdleSessions(): Promise<void> {
    const now = Date.now();
    for (const taskCtx of this.tasks.values()) {
      if (taskCtx.status !== "active") continue;
      const idleMs = now - taskCtx.lastActivityAt;
      if (idleMs < IDLE_THRESHOLD_MS) continue;

      // Skip if already checking this session
      if (this.inFlightDecisions.has(taskCtx.sessionId)) continue;

      // Check if PTY output has changed since last scan — if data is flowing,
      // the session is active even without named events (e.g. loading spinners).
      if (this.ptyService) {
        try {
          const currentOutput = await this.ptyService.getSessionOutput(
            taskCtx.sessionId,
            20,
          );
          const lastSeen = this.lastSeenOutput.get(taskCtx.sessionId) ?? "";
          this.lastSeenOutput.set(taskCtx.sessionId, currentOutput);
          if (currentOutput !== lastSeen) {
            // Output changed — session is producing data, reset idle state
            taskCtx.lastActivityAt = now;
            taskCtx.idleCheckCount = 0;
            this.log(
              `Idle watchdog: "${taskCtx.label}" has fresh PTY output — not idle`,
            );
            continue;
          }
        } catch {
          // Can't read output — proceed with idle check
        }
      }

      taskCtx.idleCheckCount++;
      const idleMinutes = Math.round(idleMs / 60_000);
      this.log(
        `Idle watchdog: "${taskCtx.label}" idle for ${idleMinutes}m (check ${taskCtx.idleCheckCount}/${MAX_IDLE_CHECKS})`,
      );

      if (taskCtx.idleCheckCount > MAX_IDLE_CHECKS) {
        // Force-escalate — too many idle checks with no resolution
        this.log(
          `Idle watchdog: force-escalating "${taskCtx.label}" after ${MAX_IDLE_CHECKS} checks`,
        );
        taskCtx.decisions.push({
          timestamp: now,
          event: "idle_watchdog",
          promptText: `Session idle for ${idleMinutes} minutes`,
          decision: "escalate",
          reasoning: `Force-escalated after ${MAX_IDLE_CHECKS} idle checks with no activity`,
        });
        this.broadcast({
          type: "escalation",
          sessionId: taskCtx.sessionId,
          timestamp: now,
          data: {
            reason: "idle_watchdog_max_checks",
            idleMinutes,
            idleCheckCount: taskCtx.idleCheckCount,
          },
        });
        this.sendChatMessage(
          `[${taskCtx.label}] Session has been idle for ${idleMinutes} minutes with no progress. Needs your attention.`,
          "coding-agent",
        );
        continue;
      }

      // Ask the LLM what's going on
      await this.handleIdleCheck(taskCtx, idleMinutes);
    }
  }

  /**
   * Handle an idle session by asking the LLM to assess its state.
   */
  private async handleIdleCheck(
    taskCtx: TaskContext,
    idleMinutes: number,
  ): Promise<void> {
    const sessionId = taskCtx.sessionId;
    this.inFlightDecisions.add(sessionId);
    try {
      let recentOutput = "";
      if (this.ptyService) {
        try {
          recentOutput = await this.ptyService.getSessionOutput(sessionId, 50);
        } catch {
          recentOutput = "";
        }
      }

      const contextSummary: TaskContextSummary = {
        sessionId,
        agentType: taskCtx.agentType,
        label: taskCtx.label,
        originalTask: taskCtx.originalTask,
        workdir: taskCtx.workdir,
      };

      const decisionHistory: DecisionHistoryEntry[] = taskCtx.decisions
        .filter((d) => d.decision !== "auto_resolved")
        .slice(-5)
        .map((d) => ({
          event: d.event,
          promptText: d.promptText,
          action: d.decision,
          response: d.response,
          reasoning: d.reasoning,
        }));

      const prompt = buildIdleCheckPrompt(
        contextSummary,
        recentOutput,
        idleMinutes,
        taskCtx.idleCheckCount,
        MAX_IDLE_CHECKS,
        decisionHistory,
      );

      let decision: CoordinationLLMResponse | null = null;
      try {
        const result = await this.runtime.useModel(ModelType.TEXT_SMALL, {
          prompt,
        });
        decision = parseCoordinationResponse(result);
      } catch (err) {
        this.log(`Idle check LLM call failed: ${err}`);
      }

      if (!decision) {
        this.log(
          `Idle check for "${taskCtx.label}": LLM returned invalid response — escalating`,
        );
        this.sendChatMessage(
          `[${taskCtx.label}] Session idle for ${idleMinutes}m — couldn't determine status. Needs your attention.`,
          "coding-agent",
        );
        return;
      }

      // Record the decision
      taskCtx.decisions.push({
        timestamp: Date.now(),
        event: "idle_watchdog",
        promptText: `Session idle for ${idleMinutes} minutes`,
        decision: decision.action,
        response:
          decision.action === "respond"
            ? decision.useKeys
              ? `keys:${decision.keys?.join(",")}`
              : decision.response
            : undefined,
        reasoning: decision.reasoning,
      });

      this.broadcast({
        type: "idle_check_decision",
        sessionId,
        timestamp: Date.now(),
        data: {
          action: decision.action,
          idleMinutes,
          idleCheckNumber: taskCtx.idleCheckCount,
          reasoning: decision.reasoning,
        },
      });

      // Send chat message
      if (decision.action === "complete") {
        // executeDecision handles chat + stop for "complete"
      } else if (decision.action === "respond") {
        const actionDesc = decision.useKeys
          ? `Sent keys: ${decision.keys?.join(", ")}`
          : `Nudged: ${decision.response ?? ""}`;
        this.sendChatMessage(
          `[${taskCtx.label}] Idle for ${idleMinutes}m — ${actionDesc}`,
          "coding-agent",
        );
      } else if (decision.action === "escalate") {
        this.sendChatMessage(
          `[${taskCtx.label}] Idle for ${idleMinutes}m — needs your attention: ${decision.reasoning}`,
          "coding-agent",
        );
      } else if (decision.action === "ignore") {
        this.log(
          `Idle check for "${taskCtx.label}": LLM says still working — ${decision.reasoning}`,
        );
      }

      await this.executeDecision(sessionId, decision);
    } finally {
      this.inFlightDecisions.delete(sessionId);
    }
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

  private log(message: string): void {
    console.log(`[SwarmCoordinator] ${message}`);
  }
}

/**
 * Wire the SwarmCoordinator to the PTYService after plugin init.
 * Called from the plugin's init() function.
 *
 * If PTYService isn't available yet (async service startup race),
 * retries every 500ms for up to 10s before giving up.
 */
export function wireSwarmCoordinator(runtime: IAgentRuntime): SwarmCoordinator {
  const coordinator = new SwarmCoordinator(runtime);

  const tryConnect = () => {
    const ptyService = runtime.getService("PTY_SERVICE") as unknown as
      | PTYService
      | undefined;
    if (ptyService) {
      coordinator.start(ptyService);
      return true;
    }
    return false;
  };

  if (!tryConnect()) {
    console.log(
      "[SwarmCoordinator] PTYService not ready yet — retrying (up to 10s)...",
    );
    let attempts = 0;
    const maxAttempts = 20; // 20 × 500ms = 10s
    const interval = setInterval(() => {
      attempts++;
      if (tryConnect()) {
        clearInterval(interval);
      } else if (attempts >= maxAttempts) {
        clearInterval(interval);
        console.warn(
          "[SwarmCoordinator] PTYService not available after 10s — coordinator inactive",
        );
      }
    }, 500);
  }

  return coordinator;
}
