/**
 * Trajectory API routes for the Milaidy Control UI.
 *
 * Provides endpoints for:
 * - Listing and searching trajectories
 * - Viewing trajectory details with LLM calls and provider accesses
 * - Exporting trajectories to JSON or CSV
 * - Deleting trajectories
 * - Getting trajectory statistics
 * - Enabling/disabling trajectory logging
 *
 * Uses the @elizaos/plugin-trajectory-logger service for data access.
 */

import type http from "node:http";
import type { AgentRuntime } from "@elizaos/core";
import {
  readJsonBody as parseJsonBody,
  sendJson,
  sendJsonError,
} from "./http-helpers.js";

// Interface for the plugin's TrajectoryLoggerService
interface TrajectoryLoggerService {
  isEnabled(): boolean;
  setEnabled(enabled: boolean): void;
  listTrajectories(
    options: TrajectoryListOptions,
  ): Promise<TrajectoryListResult>;
  getTrajectoryDetail(trajectoryId: string): Promise<Trajectory | null>;
  getStats(): Promise<TrajectoryStats>;
  deleteTrajectories(trajectoryIds: string[]): Promise<number>;
  clearAllTrajectories(): Promise<number>;
  exportTrajectories(
    options: TrajectoryExportOptions,
  ): Promise<{ data: string; filename: string; mimeType: string }>;
}

function isRouteCompatibleTrajectoryLogger(
  candidate: unknown,
): candidate is TrajectoryLoggerService {
  if (!candidate || typeof candidate !== "object") return false;
  const logger = candidate as Partial<TrajectoryLoggerService>;
  return (
    typeof logger.isEnabled === "function" &&
    typeof logger.setEnabled === "function" &&
    typeof logger.listTrajectories === "function" &&
    typeof logger.getTrajectoryDetail === "function" &&
    typeof logger.getStats === "function" &&
    typeof logger.deleteTrajectories === "function" &&
    typeof logger.clearAllTrajectories === "function" &&
    typeof logger.exportTrajectories === "function"
  );
}

interface TrajectoryListOptions {
  limit?: number;
  offset?: number;
  status?: "active" | "completed" | "error" | "timeout";
  source?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
}

interface TrajectoryListItem {
  id: string;
  agentId: string;
  source: string;
  status: "active" | "completed" | "error" | "timeout";
  startTime: number;
  endTime: number | null;
  durationMs: number | null;
  stepCount: number;
  llmCallCount: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalReward: number;
  scenarioId: string | null;
  batchId: string | null;
  createdAt: string;
}

interface TrajectoryListResult {
  trajectories: TrajectoryListItem[];
  total: number;
  offset: number;
  limit: number;
}

interface TrajectoryStats {
  totalTrajectories: number;
  totalSteps: number;
  totalLlmCalls: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  averageDurationMs: number;
  averageReward: number;
  bySource: Record<string, number>;
  byStatus: Record<string, number>;
  byScenario: Record<string, number>;
}

interface TrajectoryExportOptions {
  format: "json" | "art" | "csv";
  includePrompts?: boolean;
  trajectoryIds?: string[];
  startDate?: string;
  endDate?: string;
}

// Plugin's internal types for trajectory data
interface LLMCall {
  callId: string;
  timestamp: number;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  response: string;
  temperature: number;
  maxTokens: number;
  purpose: string;
  actionType?: string;
  promptTokens?: number;
  completionTokens?: number;
  latencyMs?: number;
}

interface ProviderAccess {
  providerId: string;
  providerName: string;
  timestamp: number;
  data: Record<string, unknown>;
  query?: Record<string, unknown>;
  purpose: string;
}

interface TrajectoryStep {
  stepId: string;
  stepNumber: number;
  timestamp: number;
  llmCalls: LLMCall[];
  providerAccesses: ProviderAccess[];
}

interface Trajectory {
  trajectoryId: string;
  agentId: string;
  startTime: number;
  endTime: number;
  durationMs: number;
  steps: TrajectoryStep[];
  totalReward: number;
  metrics: {
    episodeLength: number;
    finalStatus: "completed" | "terminated" | "error" | "timeout";
  };
  metadata: Record<string, unknown>;
}

// UI-compatible response types
interface UITrajectoryRecord {
  id: string;
  agentId: string;
  roomId: string | null;
  entityId: string | null;
  conversationId: string | null;
  source: string;
  status: "active" | "completed" | "error";
  startTime: number;
  endTime: number | null;
  durationMs: number | null;
  llmCallCount: number;
  providerAccessCount: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

interface UILlmCall {
  id: string;
  trajectoryId: string;
  stepId: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  response: string;
  temperature: number;
  maxTokens: number;
  purpose: string;
  actionType: string;
  latencyMs: number;
  promptTokens?: number;
  completionTokens?: number;
  timestamp: number;
  createdAt: string;
}

interface UIProviderAccess {
  id: string;
  trajectoryId: string;
  stepId: string;
  providerName: string;
  purpose: string;
  data: Record<string, unknown>;
  query?: Record<string, unknown>;
  timestamp: number;
  createdAt: string;
}

interface UITrajectoryDetailResult {
  trajectory: UITrajectoryRecord;
  llmCalls: UILlmCall[];
  providerAccesses: UIProviderAccess[];
}

interface RawSqlTrajectoryLoggerBridge {
  executeRawSql?: (
    sql: string,
  ) => Promise<{ rows?: unknown[] } | unknown[] | null | undefined>;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readRecordValue(
  record: Record<string, unknown>,
  keys: string[],
): unknown {
  for (const key of keys) {
    if (key in record) return record[key];
  }
  return undefined;
}

function toArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  return [];
}

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function toOptionalNumber(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  const parsed = toNumber(value, Number.NaN);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function toText(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return fallback;
  return String(value);
}

function toNullableString(value: unknown): string | null {
  const normalized = toText(value, "").trim();
  return normalized.length > 0 ? normalized : null;
}

function toObject(value: unknown): Record<string, unknown> | undefined {
  const record = asRecord(value);
  return record ?? undefined;
}

function parseJsonValue(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function stepCalls(step: unknown): unknown[] {
  const record = asRecord(step);
  if (!record) return [];
  return toArray(
    parseJsonValue(
      readRecordValue(record, ["llmCalls", "llm_calls", "calls", "llm"]),
    ),
  );
}

function stepProviderAccesses(step: unknown): unknown[] {
  const record = asRecord(step);
  if (!record) return [];
  return toArray(
    parseJsonValue(
      readRecordValue(record, [
        "providerAccesses",
        "provider_accesses",
        "providerLogs",
      ]),
    ),
  );
}

function hasTrajectoryCallData(traj: Trajectory): boolean {
  const steps = toArray(traj.steps as unknown);
  for (const step of steps) {
    if (stepCalls(step).length > 0 || stepProviderAccesses(step).length > 0) {
      return true;
    }
  }
  return false;
}

function extractRows(result: unknown): unknown[] {
  if (Array.isArray(result)) return result;
  const record = asRecord(result);
  if (!record) return [];
  const rows = record.rows;
  return Array.isArray(rows) ? rows : [];
}

function parseStepsValue(value: unknown): TrajectoryStep[] | null {
  const parsed = parseJsonValue(value);
  if (Array.isArray(parsed)) return parsed as TrajectoryStep[];
  const parsedRecord = asRecord(parsed);
  if (!parsedRecord) return null;
  const nested = parseJsonValue(readRecordValue(parsedRecord, ["steps"]));
  if (Array.isArray(nested)) return nested as TrajectoryStep[];
  return null;
}

async function loadTrajectoryStepsFallback(
  logger: TrajectoryLoggerService,
  trajectoryId: string,
): Promise<TrajectoryStep[] | null> {
  const withRawSql = logger as TrajectoryLoggerService &
    RawSqlTrajectoryLoggerBridge;
  if (typeof withRawSql.executeRawSql !== "function") return null;

  const safeId = trajectoryId.replace(/'/g, "''");
  const result = await withRawSql.executeRawSql(
    `SELECT steps_json FROM trajectories WHERE id = '${safeId}' LIMIT 1`,
  );
  const rows = extractRows(result);
  if (rows.length === 0) return null;

  const row = asRecord(rows[0]);
  if (!row) return null;

  return parseStepsValue(
    readRecordValue(row, ["steps_json", "stepsJson", "steps"]),
  );
}

async function getTrajectoryDetailWithFallback(
  logger: TrajectoryLoggerService,
  trajectoryId: string,
): Promise<Trajectory | null> {
  const trajectory = await logger.getTrajectoryDetail(trajectoryId);
  if (!trajectory || hasTrajectoryCallData(trajectory)) {
    return trajectory;
  }

  try {
    const fallbackSteps = await loadTrajectoryStepsFallback(
      logger,
      trajectoryId,
    );
    if (fallbackSteps && fallbackSteps.length > 0) {
      return {
        ...trajectory,
        steps: fallbackSteps,
      };
    }
  } catch {
    // Keep serving the original payload if SQL fallback is unavailable.
  }

  return trajectory;
}

function scoreTrajectoryLoggerServiceCandidate(
  candidate: TrajectoryLoggerService | null,
): number {
  if (!candidate) return -1;
  const candidateWithRuntime = candidate as TrajectoryLoggerService & {
    runtime?: { adapter?: unknown };
    initialized?: boolean;
    startTrajectory?: unknown;
    endTrajectory?: unknown;
  };
  let score = 0;
  if (typeof candidate.listTrajectories === "function") score += 3;
  if (typeof candidate.getStats === "function") score += 2;
  if (typeof candidateWithRuntime.startTrajectory === "function") score += 2;
  if (typeof candidateWithRuntime.endTrajectory === "function") score += 2;
  if (candidateWithRuntime.initialized === true) score += 3;
  if (candidateWithRuntime.runtime?.adapter) score += 3;
  const enabled =
    typeof candidate.isEnabled === "function" ? candidate.isEnabled() : true;
  if (enabled) score += 1;
  return score;
}

async function readJsonBody<T = Record<string, unknown>>(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<T | null> {
  return parseJsonBody(req, res, {
    maxBytes: 2 * 1024 * 1024,
  });
}

function getTrajectoryLogger(
  runtime: AgentRuntime | null,
): TrajectoryLoggerService | null {
  if (!runtime) return null;

  // Runtime API shape differs across versions:
  // - newer runtimes expose getServicesByType()
  // - older/test runtimes may only expose getService()
  const runtimeLike = runtime as unknown as {
    getServicesByType?: (serviceType: string) => unknown;
    getService?: (serviceType: string) => unknown;
  };

  const services: TrajectoryLoggerService[] = [];
  const seen = new Set<unknown>();
  const pushCandidate = (candidate: unknown) => {
    if (!candidate || seen.has(candidate)) return;
    seen.add(candidate);
    if (isRouteCompatibleTrajectoryLogger(candidate)) {
      services.push(candidate);
    }
  };

  if (typeof runtimeLike.getServicesByType === "function") {
    const byType = runtimeLike.getServicesByType("trajectory_logger");
    if (Array.isArray(byType)) {
      for (const candidate of byType) {
        pushCandidate(candidate);
      }
    } else if (byType) {
      pushCandidate(byType);
    }
  }
  if (typeof runtimeLike.getService === "function") {
    const single = runtimeLike.getService("trajectory_logger");
    pushCandidate(single);
  }
  if (services.length === 0) return null;

  let best: TrajectoryLoggerService | null = null;
  let bestScore = -1;
  for (const svc of services) {
    const score = scoreTrajectoryLoggerServiceCandidate(svc);
    if (score > bestScore) {
      best = svc;
      bestScore = score;
    }
  }

  return best ?? null;
}

/**
 * Transform plugin's TrajectoryListItem to UI-compatible TrajectoryRecord
 */
function listItemToUIRecord(item: TrajectoryListItem): UITrajectoryRecord {
  const status =
    item.status === "timeout" || item.status === "error"
      ? "error"
      : item.status;
  return {
    id: item.id,
    agentId: item.agentId,
    roomId: null,
    entityId: null,
    conversationId: null,
    source: item.source,
    status: status as "active" | "completed" | "error",
    startTime: item.startTime,
    endTime: item.endTime,
    durationMs: item.durationMs,
    llmCallCount: item.llmCallCount,
    providerAccessCount: 0,
    totalPromptTokens: item.totalPromptTokens,
    totalCompletionTokens: item.totalCompletionTokens,
    metadata: {},
    createdAt: item.createdAt,
    updatedAt: item.createdAt,
  };
}

/**
 * Transform plugin's Trajectory to UI-compatible TrajectoryDetailResult
 */
function trajectoryToUIDetail(traj: Trajectory): UITrajectoryDetailResult {
  const status =
    traj.metrics.finalStatus === "timeout" ||
    traj.metrics.finalStatus === "terminated"
      ? "error"
      : traj.metrics.finalStatus;

  // Flatten all LLM calls from all steps
  const llmCalls: UILlmCall[] = [];
  const providerAccesses: UIProviderAccess[] = [];

  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;

  const steps = toArray(traj.steps as unknown);
  for (let stepIndex = 0; stepIndex < steps.length; stepIndex += 1) {
    const step = asRecord(steps[stepIndex]);
    if (!step) continue;

    const stepId = toText(
      readRecordValue(step, ["stepId", "step_id", "id"]),
      `step-${stepIndex + 1}`,
    );
    const calls = stepCalls(step);
    for (let callIndex = 0; callIndex < calls.length; callIndex += 1) {
      const call = asRecord(calls[callIndex]);
      if (!call) continue;

      const timestamp = toNumber(
        readRecordValue(call, ["timestamp", "createdAt", "created_at"]),
        traj.startTime,
      );
      const promptTokens = toOptionalNumber(
        readRecordValue(call, ["promptTokens", "prompt_tokens"]),
      );
      const completionTokens = toOptionalNumber(
        readRecordValue(call, ["completionTokens", "completion_tokens"]),
      );

      llmCalls.push({
        id: toText(
          readRecordValue(call, ["callId", "call_id", "id"]),
          `${stepId}-call-${callIndex + 1}`,
        ),
        trajectoryId: traj.trajectoryId,
        stepId,
        model: toText(readRecordValue(call, ["model"]), "unknown"),
        systemPrompt: toText(
          readRecordValue(call, ["systemPrompt", "system_prompt"]),
          "",
        ),
        userPrompt: toText(
          readRecordValue(call, ["userPrompt", "user_prompt", "prompt"]),
          "",
        ),
        response: toText(
          readRecordValue(call, ["response", "output", "text"]),
          "",
        ),
        temperature: toNumber(readRecordValue(call, ["temperature"]), 0),
        maxTokens: toNumber(
          readRecordValue(call, ["maxTokens", "max_tokens"]),
          0,
        ),
        purpose: toText(readRecordValue(call, ["purpose"]), ""),
        actionType: toText(
          readRecordValue(call, ["actionType", "action_type"]),
          "",
        ),
        latencyMs: toNumber(
          readRecordValue(call, ["latencyMs", "latency_ms"]),
          0,
        ),
        promptTokens,
        completionTokens,
        timestamp,
        createdAt: new Date(timestamp).toISOString(),
      });

      totalPromptTokens += promptTokens ?? 0;
      totalCompletionTokens += completionTokens ?? 0;
    }

    const accesses = stepProviderAccesses(step);
    for (let accessIndex = 0; accessIndex < accesses.length; accessIndex += 1) {
      const access = asRecord(accesses[accessIndex]);
      if (!access) continue;

      const timestamp = toNumber(
        readRecordValue(access, ["timestamp", "createdAt", "created_at"]),
        traj.startTime,
      );

      providerAccesses.push({
        id: toText(
          readRecordValue(access, ["providerId", "provider_id", "id"]),
          `${stepId}-provider-${accessIndex + 1}`,
        ),
        trajectoryId: traj.trajectoryId,
        stepId,
        providerName: toText(
          readRecordValue(access, ["providerName", "provider_name"]),
          "unknown",
        ),
        purpose: toText(readRecordValue(access, ["purpose"]), ""),
        data: toObject(readRecordValue(access, ["data"])) ?? {},
        query: toObject(readRecordValue(access, ["query"])),
        timestamp,
        createdAt: new Date(timestamp).toISOString(),
      });
    }
  }

  const metadata = asRecord(traj.metadata) ?? {};
  const trajectory: UITrajectoryRecord = {
    id: traj.trajectoryId,
    agentId: traj.agentId,
    roomId: toNullableString(metadata.roomId),
    entityId: toNullableString(metadata.entityId),
    conversationId: null,
    source: toText(metadata.source, "chat"),
    status: status as "active" | "completed" | "error",
    startTime: traj.startTime,
    endTime: traj.endTime,
    durationMs: traj.durationMs,
    llmCallCount: llmCalls.length,
    providerAccessCount: providerAccesses.length,
    totalPromptTokens,
    totalCompletionTokens,
    metadata: traj.metadata,
    createdAt: new Date(traj.startTime).toISOString(),
    updatedAt: new Date(traj.endTime).toISOString(),
  };

  return { trajectory, llmCalls, providerAccesses };
}

async function handleGetTrajectories(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  runtime: AgentRuntime,
): Promise<void> {
  const logger = getTrajectoryLogger(runtime);
  if (!logger) {
    sendJsonError(res, "Trajectory logger service not available", 503);
    return;
  }

  const url = new URL(
    req.url ?? "/",
    `http://${req.headers.host ?? "localhost"}`,
  );

  const options: TrajectoryListOptions = {
    limit: Math.min(
      500,
      Math.max(1, Number(url.searchParams.get("limit")) || 50),
    ),
    offset: Math.max(0, Number(url.searchParams.get("offset")) || 0),
    source: url.searchParams.get("source") || undefined,
    status:
      (url.searchParams.get("status") as "active" | "completed" | "error") ||
      undefined,
    startDate: url.searchParams.get("startDate") || undefined,
    endDate: url.searchParams.get("endDate") || undefined,
    search: url.searchParams.get("search") || undefined,
  };

  const result = await logger.listTrajectories(options);

  // Transform to UI-compatible format
  const uiResult = {
    trajectories: result.trajectories.map(listItemToUIRecord),
    total: result.total,
    offset: result.offset,
    limit: result.limit,
  };

  sendJson(res, uiResult);
}

async function handleGetTrajectoryDetail(
  _req: http.IncomingMessage,
  res: http.ServerResponse,
  runtime: AgentRuntime,
  trajectoryId: string,
): Promise<void> {
  const logger = getTrajectoryLogger(runtime);
  if (!logger) {
    sendJsonError(res, "Trajectory logger service not available", 503);
    return;
  }

  const trajectory = await getTrajectoryDetailWithFallback(
    logger,
    trajectoryId,
  );
  if (!trajectory) {
    sendJsonError(res, `Trajectory "${trajectoryId}" not found`, 404);
    return;
  }

  // Transform to UI-compatible format
  const uiDetail = trajectoryToUIDetail(trajectory);
  sendJson(res, uiDetail);
}

async function handleGetStats(
  _req: http.IncomingMessage,
  res: http.ServerResponse,
  runtime: AgentRuntime,
): Promise<void> {
  const logger = getTrajectoryLogger(runtime);
  if (!logger) {
    sendJsonError(res, "Trajectory logger service not available", 503);
    return;
  }

  const stats = await logger.getStats();

  // Transform to UI-compatible format
  const uiStats = {
    totalTrajectories: stats.totalTrajectories,
    totalLlmCalls: stats.totalLlmCalls,
    totalProviderAccesses: 0, // Not tracked at aggregate level
    totalPromptTokens: stats.totalPromptTokens,
    totalCompletionTokens: stats.totalCompletionTokens,
    averageDurationMs: stats.averageDurationMs,
    bySource: stats.bySource,
    byModel: {}, // Would need additional query to aggregate by model
  };

  sendJson(res, uiStats);
}

async function handleGetConfig(
  _req: http.IncomingMessage,
  res: http.ServerResponse,
  runtime: AgentRuntime,
): Promise<void> {
  const logger = getTrajectoryLogger(runtime);
  if (!logger) {
    sendJsonError(res, "Trajectory logger service not available", 503);
    return;
  }

  sendJson(res, {
    enabled: logger.isEnabled(),
  });
}

async function handlePutConfig(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  runtime: AgentRuntime,
): Promise<void> {
  const logger = getTrajectoryLogger(runtime);
  if (!logger) {
    sendJsonError(res, "Trajectory logger service not available", 503);
    return;
  }

  const body = await readJsonBody<{ enabled?: boolean }>(req, res);
  if (!body) return;

  if (typeof body.enabled === "boolean") {
    logger.setEnabled(body.enabled);
  }

  sendJson(res, {
    enabled: logger.isEnabled(),
  });
}

async function handleExportTrajectories(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  runtime: AgentRuntime,
): Promise<void> {
  const logger = getTrajectoryLogger(runtime);
  if (!logger) {
    sendJsonError(res, "Trajectory logger service not available", 503);
    return;
  }

  const body = await readJsonBody<{
    format?: string;
    includePrompts?: boolean;
    trajectoryIds?: string[];
    startDate?: string;
    endDate?: string;
  }>(req, res);
  if (!body) return;

  if (
    !body.format ||
    (body.format !== "json" && body.format !== "csv" && body.format !== "art")
  ) {
    sendJsonError(res, "Format must be 'json', 'csv', or 'art'", 400);
    return;
  }

  const exportOptions: TrajectoryExportOptions = {
    format: body.format as "json" | "art" | "csv",
    includePrompts: body.includePrompts,
    trajectoryIds: body.trajectoryIds,
    startDate: body.startDate,
    endDate: body.endDate,
  };

  const result = await logger.exportTrajectories(exportOptions);

  res.statusCode = 200;
  res.setHeader("Content-Type", result.mimeType);
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${result.filename}"`,
  );
  res.end(result.data);
}

async function handleDeleteTrajectories(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  runtime: AgentRuntime,
): Promise<void> {
  const logger = getTrajectoryLogger(runtime);
  if (!logger) {
    sendJsonError(res, "Trajectory logger service not available", 503);
    return;
  }

  const body = await readJsonBody<{
    trajectoryIds?: string[];
    clearAll?: boolean;
  }>(req, res);
  if (!body) return;

  let deleted = 0;

  if (body.clearAll === true) {
    deleted = await logger.clearAllTrajectories();
  } else if (body.trajectoryIds && Array.isArray(body.trajectoryIds)) {
    deleted = await logger.deleteTrajectories(body.trajectoryIds);
  } else {
    sendJsonError(
      res,
      "Request must include 'trajectoryIds' array or 'clearAll: true'",
      400,
    );
    return;
  }

  sendJson(res, { deleted });
}

/**
 * Route a trajectory API request. Returns true if handled, false if not matched.
 *
 * Expected URL patterns:
 *   GET    /api/trajectories                     - List trajectories
 *   GET    /api/trajectories/stats               - Get statistics
 *   GET    /api/trajectories/config              - Get logging config
 *   PUT    /api/trajectories/config              - Update logging config
 *   POST   /api/trajectories/export              - Export trajectories
 *   DELETE /api/trajectories                     - Delete trajectories
 *   GET    /api/trajectories/:id                 - Get trajectory detail
 */
export async function handleTrajectoryRoute(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  runtime: AgentRuntime | null,
  pathname: string,
): Promise<boolean> {
  const method = req.method ?? "GET";

  if (!runtime?.adapter) {
    sendJsonError(
      res,
      "Database not available. The agent may not be running or the database adapter is not initialized.",
      503,
    );
    return true;
  }

  if (method === "GET" && pathname === "/api/trajectories") {
    await handleGetTrajectories(req, res, runtime);
    return true;
  }

  if (method === "GET" && pathname === "/api/trajectories/stats") {
    await handleGetStats(req, res, runtime);
    return true;
  }

  if (method === "GET" && pathname === "/api/trajectories/config") {
    await handleGetConfig(req, res, runtime);
    return true;
  }

  if (method === "PUT" && pathname === "/api/trajectories/config") {
    await handlePutConfig(req, res, runtime);
    return true;
  }

  if (method === "POST" && pathname === "/api/trajectories/export") {
    await handleExportTrajectories(req, res, runtime);
    return true;
  }

  if (method === "DELETE" && pathname === "/api/trajectories") {
    await handleDeleteTrajectories(req, res, runtime);
    return true;
  }

  const detailMatch = pathname.match(/^\/api\/trajectories\/([^/]+)$/);
  if (detailMatch && method === "GET") {
    const trajectoryId = decodeURIComponent(detailMatch[1]);
    if (
      trajectoryId !== "stats" &&
      trajectoryId !== "config" &&
      trajectoryId !== "export"
    ) {
      await handleGetTrajectoryDetail(req, res, runtime, trajectoryId);
      return true;
    }
  }

  return false;
}
