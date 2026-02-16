import type http from "node:http";
import type { AgentRuntime, Task } from "@elizaos/core";
import type {
  CompanionActivityResponse,
  CompanionSignal,
  CompanionState,
  CompanionStateResponse,
  RunCompanionActionRequest,
  RunCompanionActionResponse,
  UpdateCompanionSettingsRequest,
  UpdateCompanionSettingsResponse,
} from "../contracts/companion.js";
import {
  applyCompanionDecay,
  applyCompanionSignal,
  buildAutopostDraft,
  buildCompanionSnapshot,
  COMPANION_INTERNAL_TAG,
  COMPANION_STATE_METADATA_KEY,
  COMPANION_TASK_NAME,
  COMPANION_TASK_TAG,
  canAttemptAutopost,
  companionStateChanged,
  createInitialCompanionState,
  dedupeAutopostText,
  normalizeCompanionState,
  recordAutopostResult,
  reviewAutopostCandidate,
  runCompanionAction,
  updateCompanionSettings,
} from "../services/companion-engine.js";
import {
  postToX,
  readXPosterCredentialsFromEnv,
} from "../services/x-poster.js";
import { parseClampedInteger } from "../utils/number-parsing.js";
import type { RouteHelpers } from "./route-helpers.js";

export type CompanionRouteHelpers = RouteHelpers;

interface CompanionRouteContext extends RouteHelpers {
  req: http.IncomingMessage;
  res: http.ServerResponse;
  method: string;
  pathname: string;
  url: URL;
  runtime: AgentRuntime | null;
  broadcastWs?: ((data: Record<string, unknown>) => void) | null;
  addLog?: (
    level: string,
    message: string,
    source?: string,
    tags?: string[],
  ) => void;
}

interface CompanionMutationOptions {
  runtime: AgentRuntime | null;
  signal: CompanionSignal;
  nowMs?: number;
  broadcastWs?: ((data: Record<string, unknown>) => void) | null;
  addLog?: (
    level: string,
    message: string,
    source?: string,
    tags?: string[],
  ) => void;
}

interface CompanionTickOptions {
  runtime: AgentRuntime | null;
  nowMs?: number;
  broadcastWs?: ((data: Record<string, unknown>) => void) | null;
  addLog?: (
    level: string,
    message: string,
    source?: string,
    tags?: string[],
  ) => void;
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readTaskMetadata(task: Task): Record<string, unknown> {
  return asObject(task.metadata) ?? {};
}

function hasTaskId(task: Task): task is Task & { id: string } {
  return typeof task.id === "string" && task.id.length > 0;
}

function taskHasTag(task: Task, tag: string): boolean {
  if (!Array.isArray(task.tags)) return false;
  return task.tags.some(
    (entry) =>
      typeof entry === "string" && entry.toLowerCase() === tag.toLowerCase(),
  );
}

function isCompanionTask(task: Task): boolean {
  const nameMatch =
    typeof task.name === "string" && task.name.trim() === COMPANION_TASK_NAME;
  return nameMatch || taskHasTag(task, COMPANION_TASK_TAG);
}

function buildCompanionTaskMetadata(
  task: Task,
  state: CompanionState,
  nowMs: number,
): Record<string, unknown> {
  const previous = readTaskMetadata(task);
  return {
    ...previous,
    updatedAt: nowMs,
    [COMPANION_STATE_METADATA_KEY]: state,
  };
}

async function findCompanionTask(runtime: AgentRuntime): Promise<Task | null> {
  const tasks = await runtime.getTasks({});
  return tasks.find((task) => isCompanionTask(task)) ?? null;
}

async function ensureCompanionTask(
  runtime: AgentRuntime,
  nowMs: number,
  timezoneHint?: string,
): Promise<Task> {
  const existing = await findCompanionTask(runtime);
  if (existing) return existing;

  const initialState = createInitialCompanionState(
    nowMs,
    timezoneHint ?? "UTC",
  );

  const taskId = await runtime.createTask({
    name: COMPANION_TASK_NAME,
    description: "Persistent companion simulation state",
    tags: [COMPANION_INTERNAL_TAG, COMPANION_TASK_TAG],
    metadata: {
      [COMPANION_STATE_METADATA_KEY]: initialState,
      updatedAt: nowMs,
    },
  });

  const created = await runtime.getTask(taskId);
  if (!created) {
    throw new Error("Companion task creation failed");
  }

  return created;
}

async function saveCompanionState(
  runtime: AgentRuntime,
  task: Task,
  state: CompanionState,
  nowMs: number,
): Promise<Task> {
  if (!hasTaskId(task)) {
    throw new Error("Companion task missing id");
  }

  const nextMetadata = buildCompanionTaskMetadata(task, state, nowMs);

  await runtime.updateTask(task.id, {
    metadata: nextMetadata as Task["metadata"],
    tags: Array.from(
      new Set([
        ...(Array.isArray(task.tags) ? task.tags : []),
        COMPANION_INTERNAL_TAG,
        COMPANION_TASK_TAG,
      ]),
    ),
    description:
      typeof task.description === "string" && task.description.trim().length > 0
        ? task.description
        : "Persistent companion simulation state",
    name:
      typeof task.name === "string" && task.name.trim().length > 0
        ? task.name
        : COMPANION_TASK_NAME,
  });

  const refreshed = await runtime.getTask(task.id);
  if (!refreshed) {
    throw new Error("Companion task missing after update");
  }
  return refreshed;
}

async function loadCompanionState(
  runtime: AgentRuntime,
  nowMs: number,
  timezoneHint?: string,
): Promise<{ task: Task; state: CompanionState; changed: boolean }> {
  const task = await ensureCompanionTask(runtime, nowMs, timezoneHint);
  const metadata = readTaskMetadata(task);
  const rawState = metadata[COMPANION_STATE_METADATA_KEY];
  const normalized = normalizeCompanionState(
    rawState,
    nowMs,
    timezoneHint ?? "UTC",
  );

  let state = normalized;
  if (timezoneHint && timezoneHint !== state.daily.timezone) {
    state = updateCompanionSettings(state, { timezone: timezoneHint }, nowMs);
  }

  state = applyCompanionDecay(state, nowMs);

  const changed = !rawState || companionStateChanged(normalized, state);
  return { task, state, changed };
}

function emitCompanionState(
  broadcastWs: ((data: Record<string, unknown>) => void) | null | undefined,
  state: CompanionState,
  nowMs: number,
): void {
  if (!broadcastWs) return;
  const snapshot = buildCompanionSnapshot(state, nowMs);
  broadcastWs({ type: "companion-state", snapshot });
}

function normalizePolicyReview(
  text: string,
  policyLevel: CompanionState["autopost"]["policyLevel"],
): { ok: true; text: string } | { ok: false; reason: string } {
  const first = reviewAutopostCandidate(text, policyLevel);
  if (first.decision === "allow") return { ok: true, text: first.text };
  if (first.decision === "block") {
    return { ok: false, reason: first.reason ?? "policy_block" };
  }

  const second = reviewAutopostCandidate(first.text, policyLevel);
  if (second.decision === "allow") return { ok: true, text: second.text };
  return { ok: false, reason: second.reason ?? "policy_rewrite_failed" };
}

export async function applyCompanionSignalMutation(
  options: CompanionMutationOptions,
): Promise<CompanionState | null> {
  const { runtime, signal, nowMs = Date.now(), broadcastWs, addLog } = options;
  if (!runtime) return null;

  const loaded = await loadCompanionState(runtime, nowMs);
  const nextState = applyCompanionSignal(loaded.state, signal, nowMs);
  const changed =
    companionStateChanged(loaded.state, nextState) || loaded.changed;

  if (!changed) return nextState;

  const savedTask = await saveCompanionState(
    runtime,
    loaded.task,
    nextState,
    nowMs,
  );
  const savedState = normalizeCompanionState(
    readTaskMetadata(savedTask)[COMPANION_STATE_METADATA_KEY],
    nowMs,
  );
  emitCompanionState(broadcastWs, savedState, nowMs);

  if (signal === "external-source") {
    addLog?.("info", "Companion social reward: external-source", "companion", [
      "companion",
      "social",
    ]);
  }

  return savedState;
}

async function runAutopostAttempt(
  state: CompanionState,
  nowMs: number,
  addLog?: CompanionTickOptions["addLog"],
): Promise<CompanionState> {
  const gate = canAttemptAutopost(state, nowMs);
  if (!gate.ok) {
    return state;
  }

  const draft = buildAutopostDraft(state);
  const reviewed = normalizePolicyReview(draft, state.autopost.policyLevel);
  if (!reviewed.ok) {
    const reason = reviewed.reason;
    addLog?.(
      "warn",
      `Companion autopost skipped by policy: ${reason}`,
      "companion",
      ["companion", "social", "autopost"],
    );
    return recordAutopostResult(state, nowMs, {
      ok: false,
      reason,
    });
  }

  const text = reviewed.text;
  if (dedupeAutopostText(state, text)) {
    addLog?.(
      "info",
      "Companion autopost skipped due to duplicate content",
      "companion",
      ["companion", "social", "autopost"],
    );
    return recordAutopostResult(state, nowMs, {
      ok: false,
      reason: "duplicate_content",
    });
  }

  if (state.autopost.dryRun) {
    addLog?.("info", "Companion autopost dry-run success", "companion", [
      "companion",
      "social",
      "autopost",
    ]);
    return recordAutopostResult(state, nowMs, {
      ok: true,
      dryRun: true,
      postedText: text,
    });
  }

  const credentials = readXPosterCredentialsFromEnv();
  if (!credentials) {
    addLog?.(
      "warn",
      "Companion autopost disabled because X credentials are missing",
      "companion",
      ["companion", "social", "autopost"],
    );
    const disabled = updateCompanionSettings(
      state,
      { autopostEnabled: false },
      nowMs,
    );
    return recordAutopostResult(disabled, nowMs, {
      ok: false,
      reason: "missing_credentials",
    });
  }

  const result = await postToX({ text, credentials });
  if (result.ok) {
    addLog?.("info", "Companion autopost published to X", "companion", [
      "companion",
      "social",
      "autopost",
    ]);
    return recordAutopostResult(state, nowMs, {
      ok: true,
      postedText: text,
    });
  }

  addLog?.(
    result.category === "rate_limit" ? "warn" : "error",
    `Companion autopost failed (${result.category}): ${result.error ?? "unknown error"}`,
    "companion",
    ["companion", "social", "autopost"],
  );

  return recordAutopostResult(state, nowMs, {
    ok: false,
    reason: result.category,
    error: result.error,
  });
}

export async function runCompanionMinuteTick(
  options: CompanionTickOptions,
): Promise<CompanionState | null> {
  const { runtime, nowMs = Date.now(), broadcastWs, addLog } = options;
  if (!runtime) return null;

  const loaded = await loadCompanionState(runtime, nowMs);
  let nextState = loaded.state;

  nextState = await runAutopostAttempt(nextState, nowMs, addLog);

  const changed =
    companionStateChanged(loaded.state, nextState) || loaded.changed;
  if (!changed) return nextState;

  const savedTask = await saveCompanionState(
    runtime,
    loaded.task,
    nextState,
    nowMs,
  );
  const savedState = normalizeCompanionState(
    readTaskMetadata(savedTask)[COMPANION_STATE_METADATA_KEY],
    nowMs,
  );
  emitCompanionState(broadcastWs, savedState, nowMs);
  return savedState;
}

export async function handleCompanionRoutes(
  ctx: CompanionRouteContext,
): Promise<boolean> {
  const {
    method,
    pathname,
    req,
    res,
    url,
    runtime,
    readJsonBody,
    json,
    error,
    broadcastWs,
  } = ctx;

  if (!pathname.startsWith("/api/companion")) return false;
  if (!runtime) {
    error(res, "Agent is not running", 503);
    return true;
  }

  const nowMs = Date.now();

  // GET /api/companion/state
  if (method === "GET" && pathname === "/api/companion/state") {
    const timezoneHint = url.searchParams.get("timezone") ?? undefined;
    const loaded = await loadCompanionState(runtime, nowMs, timezoneHint);

    if (loaded.changed) {
      await saveCompanionState(runtime, loaded.task, loaded.state, nowMs);
    }

    const payload: CompanionStateResponse = {
      snapshot: buildCompanionSnapshot(loaded.state, nowMs),
    };
    json(res, payload);
    return true;
  }

  // GET /api/companion/activity?limit=50
  if (method === "GET" && pathname === "/api/companion/activity") {
    const limit = parseClampedInteger(url.searchParams.get("limit"), {
      min: 1,
      max: 200,
      fallback: 50,
    });

    const loaded = await loadCompanionState(runtime, nowMs);

    if (loaded.changed) {
      await saveCompanionState(runtime, loaded.task, loaded.state, nowMs);
    }

    const activity = loaded.state.activity.slice(-limit).reverse();
    const payload: CompanionActivityResponse = { activity };
    json(res, payload);
    return true;
  }

  // POST /api/companion/actions
  if (method === "POST" && pathname === "/api/companion/actions") {
    const body = await readJsonBody<RunCompanionActionRequest>(req, res);
    if (!body) return true;

    if (
      body.action !== "feed" &&
      body.action !== "rest" &&
      body.action !== "manual_share"
    ) {
      error(res, "Invalid action", 400);
      return true;
    }

    const loaded = await loadCompanionState(runtime, nowMs);
    const result = runCompanionAction(loaded.state, body.action, nowMs);
    if (!result.ok) {
      const actionError = result.error;
      const payload: RunCompanionActionResponse = {
        ok: false,
        error: actionError,
        snapshot: buildCompanionSnapshot(result.state, nowMs),
      };
      json(res, payload, 409);
      return true;
    }

    const savedTask = await saveCompanionState(
      runtime,
      loaded.task,
      result.state,
      nowMs,
    );
    const savedState = normalizeCompanionState(
      readTaskMetadata(savedTask)[COMPANION_STATE_METADATA_KEY],
      nowMs,
    );
    emitCompanionState(broadcastWs, savedState, nowMs);

    const payload: RunCompanionActionResponse = {
      ok: true,
      snapshot: buildCompanionSnapshot(savedState, nowMs),
    };
    json(res, payload);
    return true;
  }

  // PUT /api/companion/settings
  if (method === "PUT" && pathname === "/api/companion/settings") {
    const body = await readJsonBody<UpdateCompanionSettingsRequest>(req, res);
    if (!body) return true;

    const loaded = await loadCompanionState(runtime, nowMs);
    const nextState = updateCompanionSettings(loaded.state, body, nowMs);

    const savedTask = await saveCompanionState(
      runtime,
      loaded.task,
      nextState,
      nowMs,
    );
    const savedState = normalizeCompanionState(
      readTaskMetadata(savedTask)[COMPANION_STATE_METADATA_KEY],
      nowMs,
    );

    emitCompanionState(broadcastWs, savedState, nowMs);

    const payload: UpdateCompanionSettingsResponse = {
      snapshot: buildCompanionSnapshot(savedState, nowMs),
    };
    json(res, payload);
    return true;
  }

  return false;
}
