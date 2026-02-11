import crypto from "node:crypto";
import type http from "node:http";
import {
  type AgentRuntime,
  stringToUuid,
  type Task,
  type UUID,
} from "@elizaos/core";
import {
  executeTriggerTask,
  getTriggerHealthSnapshot,
  getTriggerLimit,
  listTriggerTasks,
  readTriggerConfig,
  readTriggerRuns,
  TRIGGER_TASK_NAME,
  TRIGGER_TASK_TAGS,
  taskToTriggerSummary,
  triggersFeatureEnabled,
} from "../triggers/runtime.js";
import {
  buildTriggerConfig,
  buildTriggerMetadata,
  DISABLED_TRIGGER_INTERVAL_MS,
  normalizeTriggerDraft,
} from "../triggers/scheduling.js";
import type {
  CreateTriggerRequest,
  TriggerSummary,
  TriggerTaskMetadata,
  UpdateTriggerRequest,
} from "../triggers/types.js";

export interface TriggerRouteHelpers {
  json: (res: http.ServerResponse, data: object, status?: number) => void;
  error: (res: http.ServerResponse, message: string, status?: number) => void;
  readJsonBody: <T extends object>(
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ) => Promise<T | null>;
}

export interface TriggerRouteContext extends TriggerRouteHelpers {
  req: http.IncomingMessage;
  res: http.ServerResponse;
  method: string;
  pathname: string;
  runtime: AgentRuntime | null;
}

function trim(s: string): string {
  return s.trim().replace(/\s+/g, " ");
}

async function findTask(
  runtime: AgentRuntime,
  id: string,
): Promise<Task | null> {
  const tasks = await listTriggerTasks(runtime);
  return (
    tasks.find((t) => {
      const trigger = readTriggerConfig(t);
      return trigger?.triggerId === id || t.id === id;
    }) ?? null
  );
}

export async function handleTriggerRoutes(
  ctx: TriggerRouteContext,
): Promise<boolean> {
  const { method, pathname, req, res, runtime, readJsonBody, json, error } =
    ctx;
  if (!pathname.startsWith("/api/triggers")) return false;
  if (!runtime) {
    error(res, "Agent is not running", 503);
    return true;
  }
  if (!triggersFeatureEnabled(runtime) && pathname !== "/api/triggers/health") {
    error(res, "Triggers are disabled by configuration", 503);
    return true;
  }

  // GET /api/triggers/health
  if (method === "GET" && pathname === "/api/triggers/health") {
    json(res, await getTriggerHealthSnapshot(runtime));
    return true;
  }

  // GET /api/triggers
  if (method === "GET" && pathname === "/api/triggers") {
    const tasks = await listTriggerTasks(runtime);
    const triggers = tasks
      .map(taskToTriggerSummary)
      .filter((s): s is TriggerSummary => s !== null)
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
    json(res, { triggers });
    return true;
  }

  // POST /api/triggers — create
  if (method === "POST" && pathname === "/api/triggers") {
    const body = await readJsonBody<CreateTriggerRequest>(req, res);
    if (!body) return true;

    const creator = trim(body.createdBy ?? "") || "api";
    const normalized = normalizeTriggerDraft({
      input: { ...body, enabled: body.enabled ?? true, createdBy: creator },
      fallback: {
        displayName: trim(body.displayName ?? "") || "New Trigger",
        instructions: trim(body.instructions ?? ""),
        triggerType: body.triggerType ?? "interval",
        wakeMode: body.wakeMode ?? "inject_now",
        enabled: body.enabled ?? true,
        createdBy: creator,
      },
    });
    if (!normalized.draft) {
      error(res, normalized.error ?? "Invalid trigger request", 400);
      return true;
    }

    const existingTasks = await listTriggerTasks(runtime);
    const activeCount = existingTasks.filter((t) => {
      const tr = readTriggerConfig(t);
      return tr?.enabled && tr.createdBy === creator;
    }).length;
    const limit = getTriggerLimit(runtime);
    if (activeCount >= limit) {
      error(res, `Active trigger limit reached (${limit})`, 429);
      return true;
    }

    const triggerId = stringToUuid(crypto.randomUUID());
    const trigger = buildTriggerConfig({ draft: normalized.draft, triggerId });

    const duplicate = existingTasks.find((t) => {
      const et = readTriggerConfig(t);
      return et?.enabled && et.dedupeKey && et.dedupeKey === trigger.dedupeKey;
    });
    if (duplicate?.id) {
      error(res, "Equivalent trigger already exists", 409);
      return true;
    }

    const metadata = buildTriggerMetadata({ trigger, nowMs: Date.now() });
    if (!metadata) {
      error(res, "Unable to compute trigger schedule", 400);
      return true;
    }

    const roomId = (
      runtime.getService("AUTONOMY") as { getAutonomousRoomId?(): UUID } | null
    )?.getAutonomousRoomId?.();
    const taskId = await runtime.createTask({
      name: TRIGGER_TASK_NAME,
      description: trigger.displayName,
      roomId,
      tags: [...TRIGGER_TASK_TAGS],
      metadata,
    });
    const created = await runtime.getTask(taskId);
    const summary = created ? taskToTriggerSummary(created) : null;
    if (!summary) {
      error(res, "Trigger created but summary could not be generated", 500);
      return true;
    }
    json(res, { trigger: summary }, 201);
    return true;
  }

  // GET /api/triggers/:id/runs
  const runsMatch = /^\/api\/triggers\/([^/]+)\/runs$/.exec(pathname);
  if (method === "GET" && runsMatch) {
    const task = await findTask(runtime, decodeURIComponent(runsMatch[1]));
    if (!task) {
      error(res, "Trigger not found", 404);
      return true;
    }
    json(res, { runs: readTriggerRuns(task) });
    return true;
  }

  // POST /api/triggers/:id/execute
  const execMatch = /^\/api\/triggers\/([^/]+)\/execute$/.exec(pathname);
  if (method === "POST" && execMatch) {
    const task = await findTask(runtime, decodeURIComponent(execMatch[1]));
    if (!task) {
      error(res, "Trigger not found", 404);
      return true;
    }
    const result = await executeTriggerTask(runtime, task, {
      source: "manual",
      force: true,
    });
    const refreshed = task.id ? await runtime.getTask(task.id) : null;
    json(res, {
      ok: true,
      result,
      trigger: refreshed ? taskToTriggerSummary(refreshed) : null,
    });
    return true;
  }

  // GET/PUT/DELETE /api/triggers/:id
  const itemMatch = /^\/api\/triggers\/([^/]+)$/.exec(pathname);
  if (!itemMatch) return false;
  const triggerId = decodeURIComponent(itemMatch[1]);

  if (method === "GET") {
    const task = await findTask(runtime, triggerId);
    if (!task) {
      error(res, "Trigger not found", 404);
      return true;
    }
    const summary = taskToTriggerSummary(task);
    if (!summary) {
      error(res, "Trigger metadata is invalid", 500);
      return true;
    }
    json(res, { trigger: summary });
    return true;
  }

  if (method === "DELETE") {
    const task = await findTask(runtime, triggerId);
    if (!task?.id) {
      error(res, "Trigger not found", 404);
      return true;
    }
    await runtime.deleteTask(task.id);
    json(res, { ok: true });
    return true;
  }

  if (method === "PUT") {
    const task = await findTask(runtime, triggerId);
    if (!task?.id) {
      error(res, "Trigger not found", 404);
      return true;
    }
    const current = readTriggerConfig(task);
    if (!current) {
      error(res, "Trigger metadata is invalid", 500);
      return true;
    }

    const body = await readJsonBody<UpdateTriggerRequest>(req, res);
    if (!body) return true;

    const merged = {
      ...body,
      createdBy: current.createdBy,
      intervalMs: body.intervalMs ?? current.intervalMs,
      scheduledAtIso: body.scheduledAtIso ?? current.scheduledAtIso,
      cronExpression: body.cronExpression ?? current.cronExpression,
      maxRuns: body.maxRuns ?? current.maxRuns,
    };
    const normalized = normalizeTriggerDraft({
      input: merged,
      fallback: {
        displayName: current.displayName,
        instructions: current.instructions,
        triggerType: current.triggerType,
        wakeMode: current.wakeMode,
        enabled: body.enabled ?? current.enabled,
        createdBy: current.createdBy,
      },
    });
    if (!normalized.draft) {
      error(res, normalized.error ?? "Invalid update", 400);
      return true;
    }

    const nextTrigger = buildTriggerConfig({
      draft: normalized.draft,
      triggerId: current.triggerId,
      previous: current,
    });
    const existingMeta = (task.metadata ?? {}) as TriggerTaskMetadata;
    const existingRuns = readTriggerRuns(task);

    let nextMeta: TriggerTaskMetadata;
    if (!nextTrigger.enabled) {
      nextMeta = {
        ...existingMeta,
        updatedAt: Date.now(),
        updateInterval: DISABLED_TRIGGER_INTERVAL_MS,
        trigger: {
          ...nextTrigger,
          nextRunAtMs: Date.now() + DISABLED_TRIGGER_INTERVAL_MS,
        },
        triggerRuns: existingRuns,
      };
    } else {
      const built = buildTriggerMetadata({
        existingMetadata: existingMeta,
        trigger: nextTrigger,
        nowMs: Date.now(),
      });
      if (!built) {
        error(res, "Unable to compute trigger schedule", 400);
        return true;
      }
      nextMeta = built;
    }

    await runtime.updateTask(task.id, {
      description: nextTrigger.displayName,
      metadata: nextMeta as Task["metadata"],
    });
    const refreshed = await runtime.getTask(task.id);
    if (!refreshed) {
      error(res, "Trigger updated but no longer available", 500);
      return true;
    }
    const summary = taskToTriggerSummary(refreshed);
    if (!summary) {
      error(res, "Trigger metadata is invalid", 500);
      return true;
    }
    json(res, { trigger: summary });
    return true;
  }

  return false;
}
