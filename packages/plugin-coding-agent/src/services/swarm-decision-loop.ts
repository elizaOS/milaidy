/**
 * Swarm Coordinator — Decision Loop & Blocked/Turn-Complete Handlers
 *
 * Extracted from swarm-coordinator.ts for modularity.
 * All functions are pure async helpers that receive a SwarmCoordinatorContext
 * to access shared state and services.
 *
 * @module services/swarm-decision-loop
 */

import { ModelType } from "@elizaos/core";
import { cleanForChat, extractCompletionSummary } from "./ansi-utils.js";
import type {
  SwarmCoordinatorContext,
  TaskContext,
} from "./swarm-coordinator.js";
import {
  buildCoordinationPrompt,
  buildTurnCompletePrompt,
  type CoordinationLLMResponse,
  type DecisionHistoryEntry,
  parseCoordinationResponse,
  type TaskContextSummary,
} from "./swarm-coordinator-prompts.js";

// ─── Constants ───

/** Maximum consecutive auto-responses before escalating to a human. */
const MAX_AUTO_RESPONSES = 10;

// ─── Helpers ───

/** Build a TaskContextSummary from a TaskContext. */
function toContextSummary(taskCtx: TaskContext): TaskContextSummary {
  return {
    sessionId: taskCtx.sessionId,
    agentType: taskCtx.agentType,
    label: taskCtx.label,
    originalTask: taskCtx.originalTask,
    workdir: taskCtx.workdir,
  };
}

/** Extract recent non-auto-resolved decisions as history entries. */
function toDecisionHistory(taskCtx: TaskContext): DecisionHistoryEntry[] {
  return taskCtx.decisions
    .filter((d) => d.decision !== "auto_resolved")
    .slice(-5)
    .map((d) => ({
      event: d.event,
      promptText: d.promptText,
      action: d.decision,
      response: d.response,
      reasoning: d.reasoning,
    }));
}

/** Format a decision's response for recording. */
function formatDecisionResponse(
  decision: CoordinationLLMResponse,
): string | undefined {
  if (decision.action !== "respond") return undefined;
  return decision.useKeys
    ? `keys:${decision.keys?.join(",")}`
    : decision.response;
}

/** Fetch recent PTY output, returning empty string on failure. */
async function fetchRecentOutput(
  ctx: SwarmCoordinatorContext,
  sessionId: string,
  lines = 50,
): Promise<string> {
  if (!ctx.ptyService) return "";
  try {
    return await ctx.ptyService.getSessionOutput(sessionId, lines);
  } catch {
    return "";
  }
}

// ─── LLM Decision ───

/**
 * Ask the LLM to make a coordination decision about a blocked agent.
 */
export async function makeCoordinationDecision(
  ctx: SwarmCoordinatorContext,
  taskCtx: TaskContext,
  promptText: string,
  recentOutput: string,
): Promise<CoordinationLLMResponse | null> {
  const prompt = buildCoordinationPrompt(
    toContextSummary(taskCtx),
    promptText,
    recentOutput,
    toDecisionHistory(taskCtx),
  );

  try {
    const result = await ctx.runtime.useModel(ModelType.TEXT_SMALL, {
      prompt,
    });
    return parseCoordinationResponse(result);
  } catch (err) {
    ctx.log(`LLM coordination call failed: ${err}`);
    return null;
  }
}

/**
 * Execute a coordination decision — send response, complete session, escalate, or ignore.
 */
export async function executeDecision(
  ctx: SwarmCoordinatorContext,
  sessionId: string,
  decision: CoordinationLLMResponse,
): Promise<void> {
  if (!ctx.ptyService) return;

  switch (decision.action) {
    case "respond":
      if (decision.useKeys && decision.keys) {
        await ctx.ptyService.sendKeysToSession(sessionId, decision.keys);
      } else if (decision.response !== undefined) {
        await ctx.ptyService.sendToSession(sessionId, decision.response);
      }
      break;

    case "complete": {
      // LLM recognized the task is done — trigger completion flow
      const taskCtx = ctx.tasks.get(sessionId);
      if (taskCtx) {
        taskCtx.status = "completed";
      }
      ctx.broadcast({
        type: "task_complete",
        sessionId,
        timestamp: Date.now(),
        data: { reasoning: decision.reasoning },
      });

      // Extract meaningful artifacts (PR URLs, commits) instead of
      // dumping raw terminal output which is full of TUI noise.
      let summary = "";
      try {
        const rawOutput = await ctx.ptyService.getSessionOutput(sessionId, 50);
        summary = extractCompletionSummary(rawOutput);
      } catch {
        /* ignore */
      }

      ctx.sendChatMessage(
        summary
          ? `Finished "${taskCtx?.label ?? sessionId}".\n\n${summary}`
          : `Finished "${taskCtx?.label ?? sessionId}".`,
        "coding-agent",
      );

      // Stop the session
      ctx.ptyService.stopSession(sessionId).catch((err) => {
        ctx.log(`Failed to stop session after LLM-detected completion: ${err}`);
      });
      break;
    }

    case "escalate":
      ctx.broadcast({
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

// ─── Event Handlers ───

/**
 * Handle a "blocked" session event — auto-resolved, escalated, or routed to decision loop.
 */
export async function handleBlocked(
  ctx: SwarmCoordinatorContext,
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

    ctx.broadcast({
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
        promptText.length > 120 ? `${promptText.slice(0, 120)}...` : promptText;
      ctx.sendChatMessage(
        `[${taskCtx.label}] Approved: ${excerpt}`,
        "coding-agent",
      );
    }
    return;
  }

  // Broadcast that the agent is blocked (for all supervision levels)
  ctx.broadcast({
    type: "blocked",
    sessionId,
    timestamp: Date.now(),
    data: {
      prompt: promptText,
      promptType: eventData.promptInfo?.type,
      supervisionLevel: ctx.getSupervisionLevel(),
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
    ctx.broadcast({
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
  switch (ctx.getSupervisionLevel()) {
    case "autonomous":
      await handleAutonomousDecision(ctx, sessionId, taskCtx, promptText, "");
      break;

    case "confirm":
      await handleConfirmDecision(ctx, sessionId, taskCtx, promptText, "");
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
export async function handleTurnComplete(
  ctx: SwarmCoordinatorContext,
  sessionId: string,
  taskCtx: TaskContext,
  data: unknown,
): Promise<void> {
  // Debounce — skip if already assessing this session
  if (ctx.inFlightDecisions.has(sessionId)) {
    ctx.log(`Skipping turn-complete assessment for ${sessionId} (in-flight)`);
    return;
  }

  ctx.inFlightDecisions.add(sessionId);
  try {
    ctx.log(
      `Turn complete for "${taskCtx.label}" — assessing whether task is done`,
    );

    // Get the turn output — prefer the captured response, fall back to PTY output
    const rawResponse = (data as { response?: string }).response ?? "";
    let turnOutput = cleanForChat(rawResponse);
    if (!turnOutput) {
      const raw = await fetchRecentOutput(ctx, sessionId);
      turnOutput = cleanForChat(raw);
    }

    const prompt = buildTurnCompletePrompt(
      toContextSummary(taskCtx),
      turnOutput,
      toDecisionHistory(taskCtx),
    );

    let decision: CoordinationLLMResponse | null = null;
    try {
      const result = await ctx.runtime.useModel(ModelType.TEXT_SMALL, {
        prompt,
      });
      decision = parseCoordinationResponse(result);
    } catch (err) {
      ctx.log(`Turn-complete LLM call failed: ${err}`);
    }

    if (!decision) {
      // LLM failed — fall back to completing (safer than leaving session hanging)
      ctx.log(
        `Turn-complete for "${taskCtx.label}": LLM invalid response — defaulting to complete`,
      );
      decision = {
        action: "complete",
        reasoning: "LLM returned invalid response — defaulting to complete",
      };
    }

    // Log the decision
    ctx.log(
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
      response: formatDecisionResponse(decision),
      reasoning: decision.reasoning,
    });

    ctx.broadcast({
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
      ctx.sendChatMessage(
        `[${taskCtx.label}] Turn done, continuing: ${preview}`,
        "coding-agent",
      );
    } else if (decision.action === "escalate") {
      ctx.sendChatMessage(
        `[${taskCtx.label}] Turn finished — needs your attention: ${decision.reasoning}`,
        "coding-agent",
      );
    }
    // "complete" chat message is handled by executeDecision

    await executeDecision(ctx, sessionId, decision);
  } finally {
    ctx.inFlightDecisions.delete(sessionId);
  }
}

// ─── Autonomous / Confirm Decision Flows ───

/**
 * Handle an autonomous decision for a blocked session — call the LLM and execute immediately.
 */
export async function handleAutonomousDecision(
  ctx: SwarmCoordinatorContext,
  sessionId: string,
  taskCtx: TaskContext,
  promptText: string,
  recentOutput: string,
): Promise<void> {
  // Debounce: skip if decision already in-flight for this session
  if (ctx.inFlightDecisions.has(sessionId)) {
    ctx.log(`Skipping duplicate decision for ${sessionId} (in-flight)`);
    return;
  }

  ctx.inFlightDecisions.add(sessionId);
  try {
    // Get recent output from PTY if not provided
    let output = recentOutput;
    if (!output) {
      output = await fetchRecentOutput(ctx, sessionId);
    }

    const decision = await makeCoordinationDecision(
      ctx,
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
      ctx.broadcast({
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
      response: formatDecisionResponse(decision),
      reasoning: decision.reasoning,
    });

    // Reset auto-resolved count on manual decision
    taskCtx.autoResolvedCount = 0;

    // Broadcast the decision
    ctx.broadcast({
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
      ctx.sendChatMessage(
        `[${taskCtx.label}] ${actionDesc} — ${reasonExcerpt}`,
        "coding-agent",
      );
    } else if (decision.action === "escalate") {
      ctx.sendChatMessage(
        `[${taskCtx.label}] Needs your attention: ${decision.reasoning}`,
        "coding-agent",
      );
    }

    // Execute
    await executeDecision(ctx, sessionId, decision);
  } finally {
    ctx.inFlightDecisions.delete(sessionId);
  }
}

/**
 * Handle a confirm-mode decision — call LLM, then queue for human approval.
 */
export async function handleConfirmDecision(
  ctx: SwarmCoordinatorContext,
  sessionId: string,
  taskCtx: TaskContext,
  promptText: string,
  recentOutput: string,
): Promise<void> {
  // Debounce
  if (ctx.inFlightDecisions.has(sessionId)) return;

  ctx.inFlightDecisions.add(sessionId);
  try {
    let output = recentOutput;
    if (!output) {
      output = await fetchRecentOutput(ctx, sessionId);
    }

    const decision = await makeCoordinationDecision(
      ctx,
      taskCtx,
      promptText,
      output,
    );

    if (!decision) {
      // Queue for human with no LLM suggestion
      ctx.pendingDecisions.set(sessionId, {
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
      ctx.pendingDecisions.set(sessionId, {
        sessionId,
        promptText,
        recentOutput: output,
        llmDecision: decision,
        taskContext: taskCtx,
        createdAt: Date.now(),
      });
    }

    ctx.broadcast({
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
    ctx.inFlightDecisions.delete(sessionId);
  }
}
