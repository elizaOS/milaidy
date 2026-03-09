/**
 * Workflow execution runtime.
 *
 * Bridges compiled workflows with the elizaOS agent runtime:
 * - Executes compiled steps sequentially
 * - Tracks run state and emits step events
 * - Handles hook pause/resume
 * - Manages subworkflow delegation
 * - Provides the sandbox code runner for transform nodes
 *
 * When Workflow DevKit is available, this module delegates durable
 * execution (sleep, retries, hooks) to it. Without it, workflows
 * execute ephemerally with in-process state.
 *
 * @module workflows/runtime
 */

import crypto from "node:crypto";
import type { IAgentRuntime } from "@elizaos/core";
import { compileWorkflow } from "./compiler";
import { loadWorkflows, loadWorkflowRuns, saveWorkflowRuns } from "./storage";
import type {
  CompiledStep,
  WorkflowContext,
  WorkflowDef,
  WorkflowRun,
  WorkflowRunStatus,
  WorkflowStepEvent,
} from "./types";

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let _runtime: IAgentRuntime | null = null;

/** Active runs keyed by runId. */
const activeRuns = new Map<string, WorkflowRun>();

/** Hook resolution callbacks keyed by hookId. */
const pendingHooks = new Map<
  string,
  {
    hookId: string;
    runId: string;
    resolve: (payload: Record<string, unknown>) => void;
  }
>();

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

/**
 * Store the agent runtime reference for workflow execution.
 * Called from the milady plugin init.
 */
export function setWorkflowRuntime(runtime: IAgentRuntime): void {
  _runtime = runtime;
}

export function getWorkflowRuntime(): IAgentRuntime | null {
  return _runtime;
}

// ---------------------------------------------------------------------------
// Sandboxed code runner (reuses custom-actions sandbox pattern)
// ---------------------------------------------------------------------------

type VmRunner = {
  runInNewContext: (
    code: string,
    contextObject: Record<string, unknown>,
    options?: { filename?: string; timeout?: number },
  ) => unknown;
};

let vmRunner: VmRunner | null = null;

async function sandboxCodeRunner(
  code: string,
  params: Record<string, unknown>,
): Promise<unknown> {
  if (typeof process === "undefined" || !process.versions?.node) {
    throw new Error("Code execution is only supported in Node runtimes.");
  }
  if (!vmRunner) {
    vmRunner = (await import("node:vm")) as VmRunner;
  }

  const script = `(async () => { ${code} })();`;
  const context: Record<string, unknown> = Object.create(null);
  context.params = Object.freeze(JSON.parse(JSON.stringify(params)));

  return await vmRunner.runInNewContext(`"use strict"; ${script}`, context, {
    filename: "milady-workflow-transform",
    timeout: 30_000,
  });
}

// ---------------------------------------------------------------------------
// Run management
// ---------------------------------------------------------------------------

function generateRunId(): string {
  return crypto.randomUUID();
}

function createRun(
  workflowId: string,
  workflowName: string,
  input: Record<string, unknown>,
): WorkflowRun {
  const run: WorkflowRun = {
    runId: generateRunId(),
    workflowId,
    workflowName,
    status: "pending",
    input,
    events: [],
    startedAt: new Date().toISOString(),
  };
  activeRuns.set(run.runId, run);
  return run;
}

function updateRunStatus(
  runId: string,
  status: WorkflowRunStatus,
  extra?: Partial<Pick<WorkflowRun, "output" | "error" | "currentNodeId" | "finishedAt">>,
): void {
  const run = activeRuns.get(runId);
  if (!run) return;
  run.status = status;
  if (extra) Object.assign(run, extra);
}

function addStepEvent(runId: string, event: WorkflowStepEvent): void {
  const run = activeRuns.get(runId);
  if (!run) return;
  run.events.push(event);
}

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------

/**
 * Start a workflow run.
 *
 * @param workflowId - The workflow definition ID
 * @param input - Input data passed to the trigger node
 * @returns The created WorkflowRun
 */
export async function startWorkflow(
  workflowId: string,
  input: Record<string, unknown> = {},
): Promise<WorkflowRun> {
  if (!_runtime) {
    throw new Error("Workflow runtime not initialized");
  }

  // Load workflow definition
  const workflows = loadWorkflows();
  const def = workflows.find((w) => w.id === workflowId);
  if (!def) {
    throw new Error(`Workflow "${workflowId}" not found`);
  }
  if (!def.enabled) {
    throw new Error(`Workflow "${def.name}" is disabled`);
  }

  // Compile
  const compiled = compileWorkflow(def, _runtime, sandboxCodeRunner);

  // Create run
  const run = createRun(def.id, def.name, input);

  // Execute asynchronously (don't block the API response)
  executeWorkflow(compiled, run, input).catch((err) => {
    updateRunStatus(run.runId, "failed", {
      error: err instanceof Error ? err.message : String(err),
      finishedAt: new Date().toISOString(),
    });
    persistRun(run.runId);
  });

  return run;
}

/**
 * Execute a compiled workflow.
 */
async function executeWorkflow(
  compiled: CompiledWorkflow,
  run: WorkflowRun,
  input: Record<string, unknown>,
): Promise<void> {
  updateRunStatus(run.runId, "running");

  const ctx: WorkflowContext = {
    trigger: { ...input, startedAt: run.startedAt },
    results: {},
    _last: input,
    runId: run.runId,
    workflowId: compiled.workflowId,
  };

  try {
    for (const step of compiled.entrySteps) {
      if (isRunCancelled(run.runId)) {
        break;
      }

      const result = await executeStep(step, ctx, run);

      if (isRunCancelled(run.runId)) {
        break;
      }

      // Check for hook pause
      if (isHookResult(result)) {
        const hookId = (result as Record<string, unknown>).hookId as string;
        updateRunStatus(run.runId, "paused", { currentNodeId: step.nodeId });
        persistRun(run.runId);

        // Wait for hook resolution
        const hookPayload = await waitForHook(hookId, run.runId);
        if (isRunCancelled(run.runId) || hookPayload.__cancelled === true) {
          break;
        }

        ctx.results[step.nodeId] = hookPayload;
        ctx._last = hookPayload;
        if (!isRunCancelled(run.runId)) {
          updateRunStatus(run.runId, "running");
        }
        continue;
      }

      // Check for subworkflow
      if (isSubworkflowResult(result)) {
        const subId = (result as Record<string, unknown>).workflowId as string;
        const subRun = await startWorkflow(subId, ctx.results);
        ctx.results[step.nodeId] = subRun;
        ctx._last = subRun;
        continue;
      }

      ctx.results[step.nodeId] = result;
      ctx._last = result;
    }

    if (!isRunCancelled(run.runId)) {
      updateRunStatus(run.runId, "completed", {
        output: ctx._last,
        finishedAt: new Date().toISOString(),
      });
    }
  } catch (err) {
    if (isRunCancelled(run.runId)) {
      persistRun(run.runId);
      return;
    }

    updateRunStatus(run.runId, "failed", {
      error: err instanceof Error ? err.message : String(err),
      finishedAt: new Date().toISOString(),
    });
  }

  persistRun(run.runId);
}

/**
 * Execute a single step with event tracking.
 */
async function executeStep(
  step: CompiledStep,
  ctx: WorkflowContext,
  run: WorkflowRun,
): Promise<unknown> {
  const event: WorkflowStepEvent = {
    stepId: crypto.randomUUID(),
    nodeId: step.nodeId,
    nodeLabel: step.label,
    nodeType: step.nodeType,
    status: "started",
    startedAt: new Date().toISOString(),
    attempt: 1,
  };

  addStepEvent(run.runId, event);
  updateRunStatus(run.runId, run.status, { currentNodeId: step.nodeId });

  try {
    const result = await step.execute(ctx);
    event.status = "completed";
    event.output = result as Record<string, unknown>;
    event.finishedAt = new Date().toISOString();
    return result;
  } catch (err) {
    event.status = "failed";
    event.error = err instanceof Error ? err.message : String(err);
    event.finishedAt = new Date().toISOString();
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Hook pause/resume
// ---------------------------------------------------------------------------

function waitForHook(
  hookId: string,
  runId: string,
): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    pendingHooks.set(getPendingHookKey(hookId, runId), { hookId, runId, resolve });
  });
}

/**
 * Resolve a pending hook, resuming the paused workflow.
 */
export function resolveHook(
  hookId: string,
  payload: Record<string, unknown> = {},
): boolean {
  for (const [key, hook] of pendingHooks.entries()) {
    if (hook.hookId !== hookId) {
      continue;
    }

    pendingHooks.delete(key);
    hook.resolve(payload);
    return true;
  }

  return false;
}

/**
 * List all pending hooks (for UI display).
 */
export function listPendingHooks(): Array<{
  hookId: string;
  runId: string;
}> {
  return Array.from(pendingHooks.values()).map(({ hookId, runId }) => ({
    hookId,
    runId,
  }));
}

// ---------------------------------------------------------------------------
// Run queries
// ---------------------------------------------------------------------------

/**
 * Get a workflow run by ID.
 */
export function getWorkflowRun(runId: string): WorkflowRun | null {
  return activeRuns.get(runId) ?? null;
}

/**
 * List runs for a specific workflow, or all runs.
 */
export function listWorkflowRuns(workflowId?: string): WorkflowRun[] {
  const runs = Array.from(activeRuns.values());
  if (workflowId) {
    return runs.filter((r) => r.workflowId === workflowId);
  }
  return runs;
}

/**
 * Cancel a running workflow.
 */
export function cancelWorkflowRun(runId: string): boolean {
  const run = activeRuns.get(runId);
  if (!run) return false;
  if (run.status === "completed" || run.status === "cancelled") return false;

  updateRunStatus(runId, "cancelled", {
    finishedAt: new Date().toISOString(),
  });

  // Clean up any pending hooks for this run
  for (const [hookId, hook] of pendingHooks.entries()) {
    if (hook.runId === runId) {
      pendingHooks.delete(hookId);
      hook.resolve({ __cancelled: true });
    }
  }

  persistRun(runId);
  return true;
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

/**
 * Persist a run to storage (called after status changes).
 */
function persistRun(runId: string): void {
  const run = activeRuns.get(runId);
  if (!run) return;

  try {
    const allRuns = loadWorkflowRuns();
    const idx = allRuns.findIndex((r) => r.runId === runId);
    if (idx >= 0) {
      allRuns[idx] = run;
    } else {
      allRuns.push(run);
    }
    // Keep only the last 100 runs to avoid unbounded growth
    const trimmed =
      allRuns.length > 100 ? allRuns.slice(allRuns.length - 100) : allRuns;
    saveWorkflowRuns(trimmed);
  } catch {
    // Storage errors are non-fatal for execution
  }
}

/**
 * Load persisted runs into memory (called at startup).
 */
export function hydrateRuns(): void {
  try {
    const runs = loadWorkflowRuns();
    for (const run of runs) {
      // Only hydrate non-active runs (completed/failed/cancelled)
      // Active runs from a previous process are marked as failed
      if (
        run.status === "running" ||
        run.status === "pending" ||
        run.status === "paused" ||
        run.status === "sleeping"
      ) {
        run.status = "failed";
        run.error = "Process restarted while workflow was running";
        run.finishedAt = new Date().toISOString();
      }
      activeRuns.set(run.runId, run);
    }
  } catch {
    // Non-fatal
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isHookResult(result: unknown): boolean {
  return (
    typeof result === "object" &&
    result !== null &&
    (result as Record<string, unknown>).__hook === true
  );
}

function isSubworkflowResult(result: unknown): boolean {
  return (
    typeof result === "object" &&
    result !== null &&
    (result as Record<string, unknown>).__subworkflow === true
  );
}

function getPendingHookKey(hookId: string, runId: string): string {
  return `${runId}:${hookId}`;
}

function isRunCancelled(runId: string): boolean {
  return activeRuns.get(runId)?.status === "cancelled";
}
