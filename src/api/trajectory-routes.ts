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

function jsonResponse(
  res: http.ServerResponse,
  data: unknown,
  status = 200,
): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(data));
}

function errorResponse(
  res: http.ServerResponse,
  message: string,
  status = 400,
): void {
  jsonResponse(res, { error: message }, status);
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    req.on("data", (c: Buffer) => {
      totalBytes += c.length;
      if (totalBytes > 2 * 1024 * 1024) {
        reject(new Error("Request body too large"));
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString()));
    req.on("error", reject);
  });
}

async function readJsonBody<T = Record<string, unknown>>(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<T | null> {
  let raw: string;
  try {
    raw = await readBody(req);
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Failed to read request body";
    errorResponse(res, msg, 413);
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) {
      errorResponse(res, "Request body must be a JSON object", 400);
      return null;
    }
    return parsed as T;
  } catch {
    errorResponse(res, "Invalid JSON in request body", 400);
    return null;
  }
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
  if (typeof runtimeLike.getServicesByType === "function") {
    const byType = runtimeLike.getServicesByType("trajectory_logger");
    if (Array.isArray(byType)) {
      services.push(...(byType as TrajectoryLoggerService[]));
    } else if (byType) {
      services.push(byType as TrajectoryLoggerService);
    }
  }
  if (services.length === 0 && typeof runtimeLike.getService === "function") {
    const single = runtimeLike.getService("trajectory_logger");
    if (single) {
      services.push(single as TrajectoryLoggerService);
    }
  }
  if (services.length === 0) return null;

  // Find the service that has the listTrajectories method (the full plugin version)
  for (const svc of services) {
    if (typeof svc.listTrajectories === "function") {
      return svc;
    }
  }

  // Fallback to first service (may not have all methods)
  return services[0] ?? null;
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

  for (const step of traj.steps) {
    for (const call of step.llmCalls) {
      totalPromptTokens += call.promptTokens ?? 0;
      totalCompletionTokens += call.completionTokens ?? 0;

      llmCalls.push({
        id: call.callId,
        trajectoryId: traj.trajectoryId,
        stepId: step.stepId,
        model: call.model,
        systemPrompt: call.systemPrompt,
        userPrompt: call.userPrompt,
        response: call.response,
        temperature: call.temperature,
        maxTokens: call.maxTokens,
        purpose: call.purpose,
        actionType: call.actionType ?? "",
        latencyMs: call.latencyMs ?? 0,
        promptTokens: call.promptTokens,
        completionTokens: call.completionTokens,
        timestamp: call.timestamp,
        createdAt: new Date(call.timestamp).toISOString(),
      });
    }

    for (const access of step.providerAccesses) {
      providerAccesses.push({
        id: access.providerId,
        trajectoryId: traj.trajectoryId,
        stepId: step.stepId,
        providerName: access.providerName,
        purpose: access.purpose,
        data: access.data,
        query: access.query,
        timestamp: access.timestamp,
        createdAt: new Date(access.timestamp).toISOString(),
      });
    }
  }

  const trajectory: UITrajectoryRecord = {
    id: traj.trajectoryId,
    agentId: traj.agentId,
    roomId: (traj.metadata.roomId as string) ?? null,
    entityId: (traj.metadata.entityId as string) ?? null,
    conversationId: null,
    source: (traj.metadata.source as string) ?? "chat",
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
    errorResponse(res, "Trajectory logger service not available", 503);
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

  jsonResponse(res, uiResult);
}

async function handleGetTrajectoryDetail(
  _req: http.IncomingMessage,
  res: http.ServerResponse,
  runtime: AgentRuntime,
  trajectoryId: string,
): Promise<void> {
  const logger = getTrajectoryLogger(runtime);
  if (!logger) {
    errorResponse(res, "Trajectory logger service not available", 503);
    return;
  }

  const trajectory = await logger.getTrajectoryDetail(trajectoryId);
  if (!trajectory) {
    errorResponse(res, `Trajectory "${trajectoryId}" not found`, 404);
    return;
  }

  // Transform to UI-compatible format
  const uiDetail = trajectoryToUIDetail(trajectory);
  jsonResponse(res, uiDetail);
}

async function handleGetStats(
  _req: http.IncomingMessage,
  res: http.ServerResponse,
  runtime: AgentRuntime,
): Promise<void> {
  const logger = getTrajectoryLogger(runtime);
  if (!logger) {
    errorResponse(res, "Trajectory logger service not available", 503);
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

  jsonResponse(res, uiStats);
}

async function handleGetConfig(
  _req: http.IncomingMessage,
  res: http.ServerResponse,
  runtime: AgentRuntime,
): Promise<void> {
  const logger = getTrajectoryLogger(runtime);
  if (!logger) {
    errorResponse(res, "Trajectory logger service not available", 503);
    return;
  }

  jsonResponse(res, {
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
    errorResponse(res, "Trajectory logger service not available", 503);
    return;
  }

  const body = await readJsonBody<{ enabled?: boolean }>(req, res);
  if (!body) return;

  if (typeof body.enabled === "boolean") {
    logger.setEnabled(body.enabled);
  }

  jsonResponse(res, {
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
    errorResponse(res, "Trajectory logger service not available", 503);
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
    errorResponse(res, "Format must be 'json', 'csv', or 'art'", 400);
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
    errorResponse(res, "Trajectory logger service not available", 503);
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
    errorResponse(
      res,
      "Request must include 'trajectoryIds' array or 'clearAll: true'",
      400,
    );
    return;
  }

  jsonResponse(res, { deleted });
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
    errorResponse(
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
