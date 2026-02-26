/**
 * Stall classification subsystem — determines what a "stalled" coding agent
 * session is doing (finished, waiting for input, still working, or errored).
 *
 * Extracted as standalone functions that receive dependencies as parameters,
 * making them easy to test without coupling to PTYService.
 *
 * @module services/stall-classifier
 */

import { type IAgentRuntime, ModelType } from "@elizaos/core";
import {
  buildTaskCompletionTimeline,
  extractTaskCompletionTraceRecords,
  type StallClassification,
} from "pty-manager";
import type { AgentMetricsTracker } from "./agent-metrics.js";
import { stripAnsi } from "./ansi-utils.js";

/** Everything the classifier needs, passed in from PTYService. */
export interface StallClassifierContext {
  sessionId: string;
  recentOutput: string;
  agentType: string;
  buffers: Map<string, string[]>;
  traceEntries: Array<string | Record<string, unknown>>;
  runtime: IAgentRuntime;
  manager: {
    get(id: string): { startedAt?: string | Date } | null | undefined;
  } | null;
  metricsTracker: AgentMetricsTracker;
  /** Write debug snapshots to ~/.milaidy/debug/ on stall (default: false) */
  debugSnapshots?: boolean;
  log: (msg: string) => void;
}

/**
 * Build the LLM system prompt used to classify stalled output.
 */
export function buildStallClassificationPrompt(
  agentType: string,
  sessionId: string,
  output: string,
): string {
  return (
    `You are Milady, an AI orchestrator managing coding agent sessions. ` +
    `A ${agentType} coding agent (session: ${sessionId}) appears to have stalled — ` +
    `it has stopped producing output while in a busy state.\n\n` +
    `Here is the recent terminal output:\n` +
    `---\n${output.slice(-1500)}\n---\n\n` +
    `Classify what's happening. Read the output carefully and choose the MOST specific match:\n\n` +
    `1. "task_complete" — The agent FINISHED its task and returned to its idle prompt. ` +
    `Strong indicators: a summary of completed work ("Done", "All done", "Here's what was completed"), ` +
    `timing info ("Baked for", "Churned for", "Crunched for", "Cooked for", "Worked for"), ` +
    `or the agent's main prompt symbol (❯) appearing AFTER completion output. ` +
    `If the output contains evidence of completed work followed by an idle prompt, this is ALWAYS task_complete, ` +
    `even though the agent is technically "waiting" — it is waiting for a NEW task, not asking a question.\n\n` +
    `2. "waiting_for_input" — The agent is MID-TASK and blocked on a specific question or permission prompt. ` +
    `The agent has NOT finished its work — it needs a response to continue. ` +
    `Examples: Y/n confirmation, file permission dialogs, "Do you want to proceed?", ` +
    `tool approval prompts, or interactive menus. ` +
    `This is NOT the same as the agent sitting at its idle prompt after finishing work.\n\n` +
    `3. "still_working" — The agent is actively processing (API call, compilation, thinking, etc.) ` +
    `and has not produced final output yet. No prompt or completion summary visible.\n\n` +
    `4. "error" — The agent hit an error state (crash, unrecoverable error, stack trace).\n\n` +
    `5. "tool_running" — The agent is using an external tool (browser automation, ` +
    `MCP tool, etc.). Indicators: "Claude in Chrome", "javascript_tool", ` +
    `"computer_tool", "screenshot", "navigate", tool execution output. ` +
    `The agent is actively working but the terminal may be quiet.\n\n` +
    `IMPORTANT: If you see BOTH completed work output AND an idle prompt (❯), choose "task_complete". ` +
    `Only choose "waiting_for_input" if the agent is clearly asking a question mid-task.\n\n` +
    `If "waiting_for_input", also provide:\n` +
    `- "prompt": the text of what it's asking\n` +
    `- "suggestedResponse": what to type/send. Use "keys:enter" for TUI menu confirmation, ` +
    `"keys:down,enter" to select a non-default option, or plain text like "y" for text prompts.\n\n` +
    `Respond with ONLY a JSON object:\n` +
    `{"state": "...", "prompt": "...", "suggestedResponse": "..."}`
  );
}

/**
 * Write a debug snapshot to ~/.milaidy/debug/ for offline stall analysis.
 */
export async function writeStallSnapshot(
  sessionId: string,
  agentType: string,
  recentOutput: string,
  effectiveOutput: string,
  buffers: Map<string, string[]>,
  traceEntries: Array<string | Record<string, unknown>>,
  log: (msg: string) => void,
): Promise<void> {
  try {
    const fs = await import("node:fs");
    const os = await import("node:os");
    const path = await import("node:path");
    const snapshotDir = path.join(os.homedir(), ".milaidy", "debug");
    fs.mkdirSync(snapshotDir, { recursive: true });
    const ourBuffer = buffers.get(sessionId);
    const ourTail = ourBuffer
      ? ourBuffer.slice(-100).join("\n")
      : "(no buffer)";
    void ourTail; // used in snapshot context but not directly printed
    let traceTimeline = "(no trace entries)";
    try {
      const records = extractTaskCompletionTraceRecords(traceEntries);
      const timeline = buildTaskCompletionTimeline(records, {
        adapterType: agentType,
      });
      traceTimeline = JSON.stringify(timeline, null, 2);
    } catch (e) {
      traceTimeline = `(trace error: ${e})`;
    }
    const snapshot = [
      `=== STALL SNAPSHOT @ ${new Date().toISOString()} ===`,
      `Session: ${sessionId} | Agent: ${agentType}`,
      `recentOutput length: ${recentOutput.length} | effectiveOutput length: ${effectiveOutput.length}`,
      ``,
      `--- effectiveOutput (what LLM sees) ---`,
      effectiveOutput.slice(-1500),
      ``,
      `--- trace timeline ---`,
      traceTimeline,
      ``,
      `--- raw trace entries (last 20 of ${traceEntries.length}) ---`,
      traceEntries.slice(-20).join("\n"),
      ``,
    ].join("\n");
    const snapshotPath = path.join(
      snapshotDir,
      `stall-snapshot-${sessionId}.txt`,
    );
    fs.writeFileSync(snapshotPath, snapshot);
    log(`Stall snapshot → ${snapshotPath}`);
  } catch (_) {
    /* best-effort */
  }
}

/**
 * Main stall classification logic. Determines what a stalled session is doing
 * by checking the buffer, building a prompt, and asking the LLM.
 */
export async function classifyStallOutput(
  ctx: StallClassifierContext,
): Promise<StallClassification | null> {
  const {
    sessionId,
    recentOutput,
    agentType,
    buffers,
    traceEntries,
    runtime,
    manager,
    metricsTracker,
    log,
  } = ctx;

  metricsTracker.incrementStalls(agentType);

  // Use our own buffer if pty-manager's recentOutput is empty or too short.
  let effectiveOutput = recentOutput;
  if (!recentOutput || recentOutput.trim().length < 200) {
    const ourBuffer = buffers.get(sessionId);
    if (ourBuffer && ourBuffer.length > 0) {
      const rawTail = ourBuffer.slice(-100).join("\n");
      const stripped = stripAnsi(rawTail);
      if (stripped.length > effectiveOutput.length) {
        effectiveOutput = stripped;
        log(
          `Using own buffer for stall classification (${effectiveOutput.length} chars after stripping, pty-manager had ${recentOutput.length})`,
        );
      }
    }
  }

  const systemPrompt = buildStallClassificationPrompt(
    agentType,
    sessionId,
    effectiveOutput,
  );

  // Dump debug snapshot for offline analysis (opt-in via PTYServiceConfig.debug)
  if (ctx.debugSnapshots) {
    await writeStallSnapshot(
      sessionId,
      agentType,
      recentOutput,
      effectiveOutput,
      buffers,
      traceEntries,
      log,
    );
  }

  try {
    log(`Stall detected for ${sessionId}, asking LLM to classify...`);
    const result = await runtime.useModel(ModelType.TEXT_SMALL, {
      prompt: systemPrompt,
    });

    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      log(`Stall classification: no JSON in LLM response`);
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const validStates: string[] = [
      "waiting_for_input",
      "still_working",
      "task_complete",
      "error",
      "tool_running",
    ];
    if (!validStates.includes(parsed.state)) {
      log(`Stall classification: invalid state "${parsed.state}"`);
      return null;
    }
    // Map tool_running → still_working (StallClassification doesn't have tool_running)
    const mappedState: StallClassification["state"] =
      parsed.state === "tool_running" ? "still_working" : parsed.state;
    const classification: StallClassification = {
      state: mappedState,
      prompt: parsed.prompt,
      suggestedResponse: parsed.suggestedResponse,
    };
    log(
      `Stall classification for ${sessionId}: ${classification.state}${classification.suggestedResponse ? ` → "${classification.suggestedResponse}"` : ""}`,
    );
    if (classification.state === "task_complete") {
      const session = manager?.get(sessionId);
      const durationMs = session?.startedAt
        ? Date.now() - new Date(session.startedAt).getTime()
        : 0;
      metricsTracker.recordCompletion(agentType, "classifier", durationMs);
    }
    return classification;
  } catch (err) {
    log(`Stall classification failed: ${err}`);
    return null;
  }
}
