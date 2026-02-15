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
import { createZipArchive } from "./zip-utils.js";

interface TrajectoryLoggerService {
  isEnabled?: () => boolean;
  setEnabled?: (enabled: boolean) => void;
  listTrajectories?: (
    options: TrajectoryListOptions,
  ) => Promise<TrajectoryListResult>;
  getTrajectoryDetail?: (trajectoryId: string) => Promise<Trajectory | null>;
  getStats?: () => Promise<TrajectoryStats>;
  deleteTrajectories?: (trajectoryIds: string[]) => Promise<number>;
  clearAllTrajectories?: () => Promise<number>;
  exportTrajectories?: (
    options: TrajectoryExportOptions,
  ) => Promise<{ data: string; filename: string; mimeType: string }>;
  getLlmCallLogs?: () => readonly unknown[];
  getProviderAccessLogs?: () => readonly unknown[];
}

interface RouteTrajectoryLogger {
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

function ensureTrajectoryLoggerAlwaysEnabled(
  logger: RouteTrajectoryLogger | null,
): void {
  if (!logger) return;
  try {
    if (!logger.isEnabled()) {
      logger.setEnabled(true);
    }
  } catch {
    // Keep route behavior resilient if the logger throws.
  }
}

function isLegacyTrajectoryLogger(
  candidate: unknown,
): candidate is Required<
  Pick<
    TrajectoryLoggerService,
    | "listTrajectories"
    | "getTrajectoryDetail"
    | "getStats"
    | "deleteTrajectories"
    | "clearAllTrajectories"
    | "exportTrajectories"
  >
> &
  TrajectoryLoggerService {
  if (!candidate || typeof candidate !== "object") return false;
  const logger = candidate as Partial<TrajectoryLoggerService>;
  return (
    typeof logger.listTrajectories === "function" &&
    typeof logger.getTrajectoryDetail === "function" &&
    typeof logger.getStats === "function" &&
    typeof logger.deleteTrajectories === "function" &&
    typeof logger.clearAllTrajectories === "function" &&
    typeof logger.exportTrajectories === "function"
  );
}

function isCoreTrajectoryLogger(
  candidate: unknown,
): candidate is Required<
  Pick<TrajectoryLoggerService, "getLlmCallLogs" | "getProviderAccessLogs">
> &
  TrajectoryLoggerService {
  if (!candidate || typeof candidate !== "object") return false;
  const logger = candidate as Partial<TrajectoryLoggerService>;
  return (
    typeof logger.getLlmCallLogs === "function" &&
    typeof logger.getProviderAccessLogs === "function"
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

interface TrajectoryZipExportRequest {
  includePrompts: boolean;
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

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const value of values) {
    if (!seen.has(value)) {
      seen.add(value);
      unique.push(value);
    }
  }
  return unique;
}

function sanitizeFolderName(value: string): string {
  const sanitized = value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return sanitized || "trajectory";
}

function redactTrajectoryPrompts(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactTrajectoryPrompts(item));
  }
  const record = asRecord(value);
  if (!record) return value;

  const redacted: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(record)) {
    if (
      key === "systemPrompt" ||
      key === "system_prompt" ||
      key === "userPrompt" ||
      key === "user_prompt" ||
      key === "response"
    ) {
      redacted[key] = "[redacted]";
      continue;
    }
    redacted[key] = redactTrajectoryPrompts(val);
  }
  return redacted;
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
  logger: RouteTrajectoryLogger,
  trajectoryId: string,
): Promise<TrajectoryStep[] | null> {
  const withRawSql = logger as RouteTrajectoryLogger &
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
  logger: RouteTrajectoryLogger,
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

async function resolveTrajectoryIdsForZipExport(
  logger: RouteTrajectoryLogger,
  request: TrajectoryZipExportRequest,
): Promise<string[]> {
  const requestedIds = uniqueStrings(
    (request.trajectoryIds ?? [])
      .map((id) => id.trim())
      .filter((id) => id.length > 0),
  );
  if (requestedIds.length > 0) {
    return requestedIds;
  }

  const limit = 500;
  let offset = 0;
  let total = Number.POSITIVE_INFINITY;
  const ids: string[] = [];

  while (offset < total) {
    const page = await logger.listTrajectories({
      limit,
      offset,
      startDate: request.startDate,
      endDate: request.endDate,
    });
    total = Math.max(0, page.total);
    for (const row of page.trajectories) {
      if (typeof row.id === "string" && row.id.length > 0) {
        ids.push(row.id);
      }
    }
    if (page.trajectories.length === 0) break;
    offset += page.trajectories.length;
  }

  return uniqueStrings(ids);
}

async function buildZipExport(
  logger: RouteTrajectoryLogger,
  request: TrajectoryZipExportRequest,
): Promise<{ data: Buffer; filename: string; mimeType: string }> {
  const trajectoryIds = await resolveTrajectoryIdsForZipExport(logger, request);
  const includePrompts = request.includePrompts;

  const entries: Array<{ name: string; data: string }> = [];
  const manifestRows: Array<Record<string, unknown>> = [];
  const missingTrajectoryIds: string[] = [];
  const folderNameCounts = new Map<string, number>();

  for (const trajectoryId of trajectoryIds) {
    const detail = await getTrajectoryDetailWithFallback(logger, trajectoryId);
    if (!detail) {
      missingTrajectoryIds.push(trajectoryId);
      continue;
    }

    const normalizedDetail = includePrompts
      ? detail
      : (redactTrajectoryPrompts(detail) as Trajectory);
    const uiDetail = trajectoryToUIDetail(normalizedDetail);

    const baseFolder = sanitizeFolderName(trajectoryId);
    const seenCount = folderNameCounts.get(baseFolder) ?? 0;
    folderNameCounts.set(baseFolder, seenCount + 1);
    const folderName =
      seenCount === 0 ? baseFolder : `${baseFolder}-${seenCount + 1}`;

    entries.push({
      name: `${folderName}/trajectory.json`,
      data: JSON.stringify(normalizedDetail, null, 2),
    });
    entries.push({
      name: `${folderName}/summary.json`,
      data: JSON.stringify(uiDetail.trajectory, null, 2),
    });
    entries.push({
      name: `${folderName}/llm-calls.json`,
      data: JSON.stringify(uiDetail.llmCalls, null, 2),
    });
    entries.push({
      name: `${folderName}/provider-accesses.json`,
      data: JSON.stringify(uiDetail.providerAccesses, null, 2),
    });

    manifestRows.push({
      trajectoryId: trajectoryId,
      folder: folderName,
      source: uiDetail.trajectory.source,
      status: uiDetail.trajectory.status,
      startTime: uiDetail.trajectory.startTime,
      endTime: uiDetail.trajectory.endTime,
      llmCallCount: uiDetail.llmCalls.length,
      providerAccessCount: uiDetail.providerAccesses.length,
      totalPromptTokens: uiDetail.trajectory.totalPromptTokens,
      totalCompletionTokens: uiDetail.trajectory.totalCompletionTokens,
      createdAt: uiDetail.trajectory.createdAt,
    });
  }

  const manifest = {
    exportedAt: new Date().toISOString(),
    includePrompts,
    requestedTrajectoryCount: trajectoryIds.length,
    exportedTrajectoryCount: manifestRows.length,
    missingTrajectoryIds,
    trajectories: manifestRows,
  };

  entries.unshift({
    name: "manifest.json",
    data: JSON.stringify(manifest, null, 2),
  });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const archive = createZipArchive(
    entries.map((entry) => ({
      name: entry.name,
      data: entry.data,
    })),
  );
  return {
    data: archive,
    filename: `trajectories-${timestamp}.zip`,
    mimeType: "application/zip",
  };
}

async function readJsonBody<T = Record<string, unknown>>(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<T | null> {
  return parseJsonBody(req, res, {
    maxBytes: 2 * 1024 * 1024,
  });
}

function trajectorySource(traj: Trajectory): string {
  const metadata = asRecord(traj.metadata) ?? {};
  return toText(readRecordValue(metadata, ["source"]), "runtime");
}

function trajectoryStatus(
  traj: Trajectory,
): "active" | "completed" | "error" | "timeout" {
  const finalStatus = toText(
    readRecordValue(traj.metrics, ["finalStatus"]),
    "",
  );
  if (finalStatus === "error") return "error";
  if (finalStatus === "timeout") return "timeout";
  if (traj.endTime && traj.endTime > traj.startTime) return "completed";
  return "active";
}

function aggregateTrajectoryTokenUsage(traj: Trajectory): {
  prompt: number;
  completion: number;
  llmCalls: number;
} {
  let prompt = 0;
  let completion = 0;
  let llmCalls = 0;
  const steps = toArray(traj.steps as unknown);
  for (const step of steps) {
    for (const call of stepCalls(step)) {
      llmCalls += 1;
      prompt +=
        toOptionalNumber(
          readRecordValue(asRecord(call) ?? {}, ["promptTokens"]),
        ) ?? 0;
      completion +=
        toOptionalNumber(
          readRecordValue(asRecord(call) ?? {}, ["completionTokens"]),
        ) ?? 0;
    }
  }
  return { prompt, completion, llmCalls };
}

function buildCoreTrajectories(
  logger: Required<
    Pick<TrajectoryLoggerService, "getLlmCallLogs" | "getProviderAccessLogs">
  >,
  runtime: AgentRuntime,
): Trajectory[] {
  const groups = new Map<
    string,
    { llmCalls: LLMCall[]; providerAccesses: ProviderAccess[] }
  >();

  const ensureGroup = (stepId: string) => {
    let group = groups.get(stepId);
    if (!group) {
      group = { llmCalls: [], providerAccesses: [] };
      groups.set(stepId, group);
    }
    return group;
  };

  const llmLogs = toArray(logger.getLlmCallLogs());
  for (let i = 0; i < llmLogs.length; i += 1) {
    const row = asRecord(llmLogs[i]);
    if (!row) continue;
    const stepId = toText(
      readRecordValue(row, ["stepId", "step_id"]),
      `step-${i + 1}`,
    );
    if (!stepId) continue;
    ensureGroup(stepId).llmCalls.push({
      callId: `${stepId}-call-${i + 1}`,
      timestamp: toNumber(readRecordValue(row, ["timestamp"]), Date.now()),
      model: toText(readRecordValue(row, ["model"]), "unknown"),
      systemPrompt: toText(
        readRecordValue(row, ["systemPrompt", "system_prompt"]),
        "",
      ),
      userPrompt: toText(
        readRecordValue(row, ["userPrompt", "user_prompt"]),
        "",
      ),
      response: toText(readRecordValue(row, ["response"]), ""),
      temperature: toNumber(readRecordValue(row, ["temperature"]), 0),
      maxTokens: toNumber(readRecordValue(row, ["maxTokens", "max_tokens"]), 0),
      purpose: toText(readRecordValue(row, ["purpose"]), "action"),
      actionType: toText(
        readRecordValue(row, ["actionType", "action_type"]),
        "runtime.useModel",
      ),
      latencyMs: toOptionalNumber(readRecordValue(row, ["latencyMs"])) ?? 0,
      promptTokens: toOptionalNumber(readRecordValue(row, ["promptTokens"])),
      completionTokens: toOptionalNumber(
        readRecordValue(row, ["completionTokens"]),
      ),
    });
  }

  const providerLogs = toArray(logger.getProviderAccessLogs());
  for (let i = 0; i < providerLogs.length; i += 1) {
    const row = asRecord(providerLogs[i]);
    if (!row) continue;
    const stepId = toText(
      readRecordValue(row, ["stepId", "step_id"]),
      `step-${i + 1}`,
    );
    if (!stepId) continue;
    ensureGroup(stepId).providerAccesses.push({
      providerId: `${stepId}-provider-${i + 1}`,
      providerName: toText(
        readRecordValue(row, ["providerName", "provider_name"]),
        "unknown",
      ),
      timestamp: toNumber(readRecordValue(row, ["timestamp"]), Date.now()),
      data: toObject(readRecordValue(row, ["data"])) ?? {},
      query: toObject(readRecordValue(row, ["query"])),
      purpose: toText(readRecordValue(row, ["purpose"]), ""),
    });
  }

  const trajectories: Trajectory[] = [];
  for (const [stepId, group] of groups.entries()) {
    const llmCalls = group.llmCalls
      .slice()
      .sort((a, b) => a.timestamp - b.timestamp);
    const providerAccesses = group.providerAccesses
      .slice()
      .sort((a, b) => a.timestamp - b.timestamp);
    const timestamps = [
      ...llmCalls.map((call) => call.timestamp),
      ...providerAccesses.map((access) => access.timestamp),
    ];
    const startTime =
      timestamps.length > 0 ? Math.min(...timestamps) : Date.now();
    const endTime = timestamps.length > 0 ? Math.max(...timestamps) : startTime;
    trajectories.push({
      trajectoryId: stepId,
      agentId: runtime.agentId,
      startTime,
      endTime,
      durationMs: Math.max(0, endTime - startTime),
      steps: [
        {
          stepId,
          stepNumber: 0,
          timestamp: startTime,
          llmCalls,
          providerAccesses,
        } as unknown as TrajectoryStep,
      ],
      totalReward: 0,
      metrics: {
        episodeLength: 1,
        finalStatus: "completed",
      },
      metadata: {
        source: "runtime",
      },
    });
  }

  trajectories.sort((a, b) => b.startTime - a.startTime);
  return trajectories;
}

function filterCoreTrajectories(
  trajectories: Trajectory[],
  options: Partial<TrajectoryListOptions>,
): Trajectory[] {
  let out = trajectories.slice();
  if (options.status) {
    out = out.filter((traj) => trajectoryStatus(traj) === options.status);
  }
  if (options.source) {
    out = out.filter((traj) => trajectorySource(traj) === options.source);
  }
  if (options.startDate) {
    const startMs = Date.parse(options.startDate);
    if (Number.isFinite(startMs)) {
      out = out.filter((traj) => traj.startTime >= startMs);
    }
  }
  if (options.endDate) {
    const endMs = Date.parse(options.endDate);
    if (Number.isFinite(endMs)) {
      out = out.filter((traj) => traj.startTime <= endMs);
    }
  }
  if (options.search && options.search.trim().length > 0) {
    const needle = options.search.trim().toLowerCase();
    out = out.filter((traj) => {
      if (traj.trajectoryId.toLowerCase().includes(needle)) return true;
      if (trajectorySource(traj).toLowerCase().includes(needle)) return true;
      const steps = toArray(traj.steps as unknown);
      for (const step of steps) {
        for (const call of stepCalls(step)) {
          const row = asRecord(call);
          if (!row) continue;
          const haystack = [
            toText(readRecordValue(row, ["model"]), ""),
            toText(readRecordValue(row, ["userPrompt", "user_prompt"]), ""),
            toText(readRecordValue(row, ["response"]), ""),
          ]
            .join(" ")
            .toLowerCase();
          if (haystack.includes(needle)) return true;
        }
      }
      return false;
    });
  }
  return out;
}

function trajectoriesToCsv(trajectories: Trajectory[]): string {
  const header = [
    "id",
    "agentId",
    "source",
    "status",
    "startTime",
    "endTime",
    "durationMs",
    "llmCallCount",
    "providerAccessCount",
    "totalPromptTokens",
    "totalCompletionTokens",
    "createdAt",
  ];
  const csvEscape = (value: unknown) =>
    `"${String(value ?? "").replace(/"/g, '""')}"`;
  const rows = trajectories.map((traj) => {
    const detail = trajectoryToUIDetail(traj);
    return [
      detail.trajectory.id,
      detail.trajectory.agentId,
      detail.trajectory.source,
      detail.trajectory.status,
      detail.trajectory.startTime,
      detail.trajectory.endTime ?? "",
      detail.trajectory.durationMs ?? "",
      detail.llmCalls.length,
      detail.providerAccesses.length,
      detail.trajectory.totalPromptTokens,
      detail.trajectory.totalCompletionTokens,
      detail.trajectory.createdAt,
    ]
      .map(csvEscape)
      .join(",");
  });
  return [header.join(","), ...rows].join("\n");
}

function trajectoriesToArtJsonl(trajectories: Trajectory[]): string {
  const lines = trajectories.map((traj) => {
    const detail = trajectoryToUIDetail(traj);
    const messages: Array<{
      role: "system" | "user" | "assistant";
      content: string;
    }> = [];
    const firstCall = detail.llmCalls[0];
    if (firstCall?.systemPrompt) {
      messages.push({
        role: "system",
        content: firstCall.systemPrompt,
      });
    }
    for (const call of detail.llmCalls) {
      messages.push({
        role: "user",
        content: call.userPrompt,
      });
      messages.push({
        role: "assistant",
        content: call.response,
      });
    }
    return JSON.stringify({
      messages,
      reward: 0,
      metadata: {
        trajectoryId: detail.trajectory.id,
        agentId: detail.trajectory.agentId,
      },
    });
  });
  return `${lines.join("\n")}\n`;
}

function createLegacyRouteLogger(
  logger: TrajectoryLoggerService,
): RouteTrajectoryLogger | null {
  if (!isLegacyTrajectoryLogger(logger)) return null;
  const withRawSql = logger as TrajectoryLoggerService &
    RawSqlTrajectoryLoggerBridge;
  const adapted: RouteTrajectoryLogger & RawSqlTrajectoryLoggerBridge = {
    isEnabled: () =>
      typeof logger.isEnabled === "function" ? logger.isEnabled() : true,
    setEnabled: (enabled) => {
      if (typeof logger.setEnabled === "function") {
        logger.setEnabled(enabled);
      }
    },
    listTrajectories: (options) => logger.listTrajectories(options),
    getTrajectoryDetail: (trajectoryId) =>
      logger.getTrajectoryDetail(trajectoryId),
    getStats: () => logger.getStats(),
    deleteTrajectories: (trajectoryIds) =>
      logger.deleteTrajectories(trajectoryIds),
    clearAllTrajectories: () => logger.clearAllTrajectories(),
    exportTrajectories: (options) => logger.exportTrajectories(options),
  };
  if (typeof withRawSql.executeRawSql === "function") {
    adapted.executeRawSql = withRawSql.executeRawSql.bind(withRawSql);
  }
  return adapted;
}

function createCoreRouteLogger(
  logger: TrajectoryLoggerService,
  runtime: AgentRuntime,
): RouteTrajectoryLogger | null {
  if (!isCoreTrajectoryLogger(logger)) return null;

  const core = logger as Required<
    Pick<TrajectoryLoggerService, "getLlmCallLogs" | "getProviderAccessLogs">
  >;

  const listCore = (options: Partial<TrajectoryListOptions>) =>
    filterCoreTrajectories(buildCoreTrajectories(core, runtime), options);

  const getMutableArrays = () => {
    const raw = logger as {
      llmCalls?: Array<Record<string, unknown>>;
      providerAccess?: Array<Record<string, unknown>>;
    };
    return {
      llmCalls: Array.isArray(raw.llmCalls) ? raw.llmCalls : null,
      providerAccess: Array.isArray(raw.providerAccess)
        ? raw.providerAccess
        : null,
    };
  };

  return {
    isEnabled: () => true,
    setEnabled: (_enabled: boolean) => {
      // Core logger is always on; no runtime toggle.
    },
    listTrajectories: async (options) => {
      const filtered = listCore(options);
      const limit = Math.max(1, Math.min(500, options.limit ?? 50));
      const offset = Math.max(0, options.offset ?? 0);
      const paged = filtered.slice(offset, offset + limit);
      return {
        trajectories: paged.map((traj) => {
          const tokenUsage = aggregateTrajectoryTokenUsage(traj);
          return {
            id: traj.trajectoryId,
            agentId: traj.agentId,
            source: trajectorySource(traj),
            status: trajectoryStatus(traj),
            startTime: traj.startTime,
            endTime: traj.endTime ?? null,
            durationMs: traj.durationMs ?? null,
            stepCount: toArray(traj.steps as unknown).length,
            llmCallCount: tokenUsage.llmCalls,
            totalPromptTokens: tokenUsage.prompt,
            totalCompletionTokens: tokenUsage.completion,
            totalReward: 0,
            scenarioId: null,
            batchId: null,
            createdAt: new Date(traj.startTime).toISOString(),
          };
        }),
        total: filtered.length,
        offset,
        limit,
      };
    },
    getTrajectoryDetail: async (trajectoryId) => {
      const all = listCore({});
      return all.find((traj) => traj.trajectoryId === trajectoryId) ?? null;
    },
    getStats: async () => {
      const all = listCore({});
      let totalSteps = 0;
      let totalLlmCalls = 0;
      let totalPromptTokens = 0;
      let totalCompletionTokens = 0;
      let durationSum = 0;
      const bySource: Record<string, number> = {};
      const byStatus: Record<string, number> = {};
      for (const traj of all) {
        const status = trajectoryStatus(traj);
        const source = trajectorySource(traj);
        bySource[source] = (bySource[source] ?? 0) + 1;
        byStatus[status] = (byStatus[status] ?? 0) + 1;
        totalSteps += toArray(traj.steps as unknown).length;
        totalLlmCalls += aggregateTrajectoryTokenUsage(traj).llmCalls;
        totalPromptTokens += aggregateTrajectoryTokenUsage(traj).prompt;
        totalCompletionTokens += aggregateTrajectoryTokenUsage(traj).completion;
        durationSum += traj.durationMs || 0;
      }
      return {
        totalTrajectories: all.length,
        totalSteps,
        totalLlmCalls,
        totalPromptTokens,
        totalCompletionTokens,
        averageDurationMs:
          all.length > 0 ? Math.round(durationSum / all.length) : 0,
        averageReward: 0,
        bySource,
        byStatus,
        byScenario: {},
      };
    },
    deleteTrajectories: async (trajectoryIds) => {
      const ids = new Set(trajectoryIds);
      if (ids.size === 0) return 0;
      const { llmCalls, providerAccess } = getMutableArrays();
      const removed = new Set<string>();
      if (llmCalls) {
        const keep = llmCalls.filter((row) => {
          const stepId = toText(
            readRecordValue(row, ["stepId", "step_id"]),
            "",
          );
          if (stepId && ids.has(stepId)) {
            removed.add(stepId);
            return false;
          }
          return true;
        });
        llmCalls.splice(0, llmCalls.length, ...keep);
      }
      if (providerAccess) {
        const keep = providerAccess.filter((row) => {
          const stepId = toText(
            readRecordValue(row, ["stepId", "step_id"]),
            "",
          );
          if (stepId && ids.has(stepId)) {
            removed.add(stepId);
            return false;
          }
          return true;
        });
        providerAccess.splice(0, providerAccess.length, ...keep);
      }
      return removed.size;
    },
    clearAllTrajectories: async () => {
      const { llmCalls, providerAccess } = getMutableArrays();
      const allIds = new Set(
        listCore({}).map((trajectory) => trajectory.trajectoryId),
      );
      if (llmCalls) llmCalls.splice(0, llmCalls.length);
      if (providerAccess) providerAccess.splice(0, providerAccess.length);
      return allIds.size;
    },
    exportTrajectories: async (options) => {
      const trajectoryIdSet = new Set(options.trajectoryIds ?? []);
      let selected = filterCoreTrajectories(
        buildCoreTrajectories(core, runtime),
        {
          startDate: options.startDate,
          endDate: options.endDate,
        },
      );
      if (trajectoryIdSet.size > 0) {
        selected = selected.filter((traj) =>
          trajectoryIdSet.has(traj.trajectoryId),
        );
      }
      const includePrompts = options.includePrompts !== false;
      const payload = includePrompts
        ? selected
        : selected.map((traj) => redactTrajectoryPrompts(traj) as Trajectory);
      if (options.format === "csv") {
        return {
          data: trajectoriesToCsv(payload),
          filename: "trajectories.csv",
          mimeType: "text/csv",
        };
      }
      if (options.format === "art") {
        return {
          data: trajectoriesToArtJsonl(payload),
          filename: "trajectories.art.jsonl",
          mimeType: "application/x-ndjson",
        };
      }
      return {
        data: JSON.stringify(payload, null, 2),
        filename: "trajectories.json",
        mimeType: "application/json",
      };
    },
  };
}

function scoreTrajectoryLoggerCandidate(
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
  if (isLegacyTrajectoryLogger(candidate)) score += 20;
  if (isCoreTrajectoryLogger(candidate)) score += 10;
  if (candidateWithRuntime.initialized === true) score += 3;
  if (candidateWithRuntime.runtime?.adapter) score += 3;
  if (typeof candidateWithRuntime.startTrajectory === "function") score += 2;
  if (typeof candidateWithRuntime.endTrajectory === "function") score += 2;
  return score;
}

function getTrajectoryLogger(
  runtime: AgentRuntime | null,
): RouteTrajectoryLogger | null {
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
    if (!candidate || typeof candidate !== "object" || seen.has(candidate))
      return;
    seen.add(candidate);
    services.push(candidate as TrajectoryLoggerService);
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
    const score = scoreTrajectoryLoggerCandidate(svc);
    if (score > bestScore) {
      best = svc;
      bestScore = score;
    }
  }

  if (!best) return null;

  const legacy = createLegacyRouteLogger(best);
  if (legacy) {
    ensureTrajectoryLoggerAlwaysEnabled(legacy);
    return legacy;
  }

  const core = createCoreRouteLogger(best, runtime);
  if (core) {
    ensureTrajectoryLoggerAlwaysEnabled(core);
    return core;
  }

  return null;
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
  const finalStatus = toText(traj.metrics?.finalStatus, "");
  const normalizedEndTime =
    typeof traj.endTime === "number" && traj.endTime > 0 ? traj.endTime : null;
  const status: "active" | "completed" | "error" =
    finalStatus === "timeout" ||
    finalStatus === "terminated" ||
    finalStatus === "error"
      ? "error"
      : finalStatus === "completed"
        ? "completed"
        : normalizedEndTime
          ? "completed"
          : "active";

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
  const normalizedDurationMs =
    status === "active"
      ? null
      : typeof traj.durationMs === "number"
        ? traj.durationMs
        : null;
  const updatedAtMs = normalizedEndTime ?? traj.startTime;
  const trajectory: UITrajectoryRecord = {
    id: traj.trajectoryId,
    agentId: traj.agentId,
    roomId: toNullableString(metadata.roomId),
    entityId: toNullableString(metadata.entityId),
    conversationId: toNullableString(metadata.conversationId),
    source: toText(metadata.source, "chat"),
    status,
    startTime: traj.startTime,
    endTime: normalizedEndTime,
    durationMs: normalizedDurationMs,
    llmCallCount: llmCalls.length,
    providerAccessCount: providerAccesses.length,
    totalPromptTokens,
    totalCompletionTokens,
    metadata: traj.metadata,
    createdAt: new Date(traj.startTime).toISOString(),
    updatedAt: new Date(updatedAtMs).toISOString(),
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

  ensureTrajectoryLoggerAlwaysEnabled(logger);
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

  // Trajectory logging is always-on in Milaidy. Ignore disable requests.
  logger.setEnabled(true);

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
    (body.format !== "json" &&
      body.format !== "csv" &&
      body.format !== "art" &&
      body.format !== "zip")
  ) {
    sendJsonError(res, "Format must be 'json', 'csv', 'art', or 'zip'", 400);
    return;
  }

  if (body.format === "zip") {
    const zipResult = await buildZipExport(logger, {
      includePrompts: body.includePrompts !== false,
      trajectoryIds: body.trajectoryIds,
      startDate: body.startDate,
      endDate: body.endDate,
    });

    res.statusCode = 200;
    res.setHeader("Content-Type", zipResult.mimeType);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${zipResult.filename}"`,
    );
    res.end(zipResult.data);
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
