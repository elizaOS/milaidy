/**
 * Swarm Coordinator — Idle Watchdog
 *
 * Extracted from swarm-coordinator.ts for modularity.
 * Scans active sessions for idle ones and asks the LLM to assess their state.
 *
 * @module services/swarm-idle-watchdog
 */

import { ModelType } from "@elizaos/core";
import { cleanForChat } from "./ansi-utils.js";
import type {
  SwarmCoordinatorContext,
  TaskContext,
} from "./swarm-coordinator.js";
import {
  buildIdleCheckPrompt,
  type CoordinationLLMResponse,
  type DecisionHistoryEntry,
  parseCoordinationResponse,
  type TaskContextSummary,
} from "./swarm-coordinator-prompts.js";
import { executeDecision } from "./swarm-decision-loop.js";

// ─── Constants ───

/** How long a session can be idle before the watchdog checks on it (ms). */
export const IDLE_THRESHOLD_MS = 3 * 60 * 1000; // 3 minutes

/** Max idle checks before force-escalating a session. */
export const MAX_IDLE_CHECKS = 3;

// ─── Idle Watchdog ───

/**
 * Scan all active sessions for idle ones. Called periodically by the watchdog timer.
 */
export async function scanIdleSessions(
  ctx: SwarmCoordinatorContext,
): Promise<void> {
  const now = Date.now();
  for (const taskCtx of ctx.tasks.values()) {
    if (taskCtx.status !== "active") continue;
    const idleMs = now - taskCtx.lastActivityAt;
    if (idleMs < IDLE_THRESHOLD_MS) continue;

    // Skip if already checking this session
    if (ctx.inFlightDecisions.has(taskCtx.sessionId)) continue;

    // Check if PTY output has changed since last scan — if data is flowing,
    // the session is active even without named events (e.g. loading spinners).
    if (ctx.ptyService) {
      try {
        const currentOutput = await ctx.ptyService.getSessionOutput(
          taskCtx.sessionId,
          20,
        );
        const lastSeen = ctx.lastSeenOutput.get(taskCtx.sessionId) ?? "";
        ctx.lastSeenOutput.set(taskCtx.sessionId, currentOutput);
        if (currentOutput !== lastSeen) {
          // Output changed — session is producing data, reset idle state
          taskCtx.lastActivityAt = now;
          taskCtx.idleCheckCount = 0;
          ctx.log(
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
    ctx.log(
      `Idle watchdog: "${taskCtx.label}" idle for ${idleMinutes}m (check ${taskCtx.idleCheckCount}/${MAX_IDLE_CHECKS})`,
    );

    if (taskCtx.idleCheckCount > MAX_IDLE_CHECKS) {
      // Force-escalate — too many idle checks with no resolution
      ctx.log(
        `Idle watchdog: force-escalating "${taskCtx.label}" after ${MAX_IDLE_CHECKS} checks`,
      );
      taskCtx.decisions.push({
        timestamp: now,
        event: "idle_watchdog",
        promptText: `Session idle for ${idleMinutes} minutes`,
        decision: "escalate",
        reasoning: `Force-escalated after ${MAX_IDLE_CHECKS} idle checks with no activity`,
      });
      ctx.broadcast({
        type: "escalation",
        sessionId: taskCtx.sessionId,
        timestamp: now,
        data: {
          reason: "idle_watchdog_max_checks",
          idleMinutes,
          idleCheckCount: taskCtx.idleCheckCount,
        },
      });
      ctx.sendChatMessage(
        `[${taskCtx.label}] Session has been idle for ${idleMinutes} minutes with no progress. Needs your attention.`,
        "coding-agent",
      );
      continue;
    }

    // Ask the LLM what's going on
    await handleIdleCheck(ctx, taskCtx, idleMinutes);
  }
}

/**
 * Handle an idle session by asking the LLM to assess its state.
 */
export async function handleIdleCheck(
  ctx: SwarmCoordinatorContext,
  taskCtx: TaskContext,
  idleMinutes: number,
): Promise<void> {
  const sessionId = taskCtx.sessionId;
  ctx.inFlightDecisions.add(sessionId);
  try {
    let recentOutput = "";
    if (ctx.ptyService) {
      try {
        const raw = await ctx.ptyService.getSessionOutput(sessionId, 50);
        recentOutput = cleanForChat(raw);
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
      const result = await ctx.runtime.useModel(ModelType.TEXT_SMALL, {
        prompt,
      });
      decision = parseCoordinationResponse(result);
    } catch (err) {
      ctx.log(`Idle check LLM call failed: ${err}`);
    }

    if (!decision) {
      ctx.log(
        `Idle check for "${taskCtx.label}": LLM returned invalid response — escalating`,
      );
      ctx.sendChatMessage(
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

    ctx.broadcast({
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
      ctx.sendChatMessage(
        `[${taskCtx.label}] Idle for ${idleMinutes}m — ${actionDesc}`,
        "coding-agent",
      );
    } else if (decision.action === "escalate") {
      ctx.sendChatMessage(
        `[${taskCtx.label}] Idle for ${idleMinutes}m — needs your attention: ${decision.reasoning}`,
        "coding-agent",
      );
    } else if (decision.action === "ignore") {
      ctx.log(
        `Idle check for "${taskCtx.label}": LLM says still working — ${decision.reasoning}`,
      );
    }

    await executeDecision(ctx, sessionId, decision);
  } finally {
    ctx.inFlightDecisions.delete(sessionId);
  }
}
