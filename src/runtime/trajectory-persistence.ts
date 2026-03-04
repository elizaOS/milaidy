import { type IAgentRuntime, Service } from "@elizaos/core";

type TrajectoryStatus = "active" | "completed" | "error" | "timeout";

// ============================================================================
// Types for the full TrajectoryLoggerApi (compatible with trajectory-routes.ts)
// ============================================================================

interface TrajectoryListOptions {
  limit?: number;
  offset?: number;
  source?: string;
  status?: TrajectoryStatus;
  startDate?: string;
  endDate?: string;
  search?: string;
  scenarioId?: string;
  batchId?: string;
  isTrainingData?: boolean;
}

interface TrajectoryListItem {
  id: string;
  agentId: string;
  source: string;
  status: TrajectoryStatus;
  startTime: number;
  endTime: number | null;
  durationMs: number | null;
  stepCount: number;
  llmCallCount: number;
  providerAccessCount: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  createdAt: string;
}

interface TrajectoryListResult {
  trajectories: TrajectoryListItem[];
  total: number;
  offset: number;
  limit: number;
}

interface TrajectoryStep {
  stepId?: string;
  timestamp: number;
  llmCalls?: Array<{
    callId?: string;
    timestamp?: number;
    model?: string;
    systemPrompt?: string;
    userPrompt?: string;
    response?: string;
    temperature?: number;
    maxTokens?: number;
    purpose?: string;
    actionType?: string;
    latencyMs?: number;
    promptTokens?: number;
    completionTokens?: number;
  }>;
  providerAccesses?: Array<{
    providerId?: string;
    providerName?: string;
    purpose?: string;
    data?: Record<string, unknown>;
    query?: Record<string, unknown>;
    timestamp?: number;
  }>;
}

interface Trajectory {
  trajectoryId: string;
  agentId: string;
  startTime: number;
  endTime?: number;
  durationMs?: number;
  steps?: TrajectoryStep[];
  metrics?: { finalStatus?: string };
  metadata?: Record<string, unknown>;
  stepsJson?: string;
}

type TrajectoryExportFormat = "json" | "csv" | "art";

interface TrajectoryExportOptions {
  format: TrajectoryExportFormat;
  includePrompts?: boolean;
  trajectoryIds?: string[];
  startDate?: string;
  endDate?: string;
  scenarioId?: string;
  batchId?: string;
}

interface TrajectoryExportResult {
  filename: string;
  data: string | Uint8Array;
  mimeType: string;
}

type RuntimeDb = {
  execute: (query: { queryChunks: object[] }) => Promise<unknown>;
};

type TrajectoryLoggerLike = {
  listTrajectories?: unknown;
  getTrajectoryDetail?: unknown;
  isEnabled?: () => boolean;
  setEnabled?: (enabled: boolean) => void;
  logLlmCall?: (params: Record<string, unknown>) => void;
  logProviderAccess?: (params: Record<string, unknown>) => void;
  getLlmCallLogs?: () => readonly unknown[];
  getProviderAccessLogs?: () => readonly unknown[];
  llmCalls?: unknown[];
  providerAccess?: unknown[];
};

type PersistedLlmCall = {
  callId: string;
  timestamp: number;
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
};

type PersistedProviderAccess = {
  providerId: string;
  providerName: string;
  timestamp: number;
  data: Record<string, unknown>;
  query?: Record<string, unknown>;
  purpose: string;
};

type PersistedStep = {
  stepId: string;
  stepNumber: number;
  timestamp: number;
  llmCalls: PersistedLlmCall[];
  providerAccesses: PersistedProviderAccess[];
};

type PersistedTrajectory = {
  id: string;
  source: string;
  status: TrajectoryStatus;
  startTime: number;
  endTime: number | null;
  steps: PersistedStep[];
  metadata: Record<string, unknown>;
  totalReward: number;
  createdAt: string;
  updatedAt: string;
};

type StartStepOptions = {
  runtime: IAgentRuntime;
  stepId: string;
  source?: string;
  metadata?: Record<string, unknown>;
};

type CompleteStepOptions = {
  runtime: IAgentRuntime;
  stepId: string;
  status?: TrajectoryStatus;
  source?: string;
  metadata?: Record<string, unknown>;
};

const initializedRuntimes = new WeakSet<object>();
const patchedLoggers = new WeakSet<object>();

const stepWriteQueues = new WeakMap<object, Map<string, Promise<void>>>();
const lastWritePromises = new WeakMap<object, Promise<void>>();

let cachedSqlRaw: ((query: string) => { queryChunks: object[] }) | null = null;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function toText(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value;
  if (value === undefined || value === null) return fallback;
  return String(value);
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
  if (value === null || value === undefined) return undefined;
  const parsed = toNumber(value, Number.NaN);
  return Number.isFinite(parsed) ? parsed : undefined;
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

function parseJsonValue(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function parseMetadata(value: unknown): Record<string, unknown> {
  const parsed = parseJsonValue(value);
  const record = asRecord(parsed);
  return record ?? {};
}

function parseSteps(value: unknown): PersistedStep[] {
  const parsed = parseJsonValue(value);
  if (Array.isArray(parsed)) {
    return parsed as PersistedStep[];
  }
  const record = asRecord(parsed);
  if (!record) return [];
  const nested = parseJsonValue(readRecordValue(record, ["steps"]));
  return Array.isArray(nested) ? (nested as PersistedStep[]) : [];
}

function sqlQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function sqlNumber(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "NULL";
  return String(value);
}

async function getSqlRaw(): Promise<
  (query: string) => { queryChunks: object[] }
> {
  if (cachedSqlRaw) return cachedSqlRaw;
  const drizzle = (await import("drizzle-orm")) as {
    sql: { raw: (query: string) => { queryChunks: object[] } };
  };
  cachedSqlRaw = drizzle.sql.raw;
  return cachedSqlRaw;
}

function getRuntimeDb(runtime: IAgentRuntime): RuntimeDb | null {
  const runtimeLike = runtime as unknown as {
    adapter?: {
      db?: RuntimeDb;
    };
    databaseAdapter?: {
      db?: RuntimeDb;
    };
  };
  const db = runtimeLike.adapter?.db || runtimeLike.databaseAdapter?.db;
  if (!db || typeof db.execute !== "function") return null;
  return db;
}

function hasRuntimeDb(runtime: IAgentRuntime): boolean {
  return Boolean(getRuntimeDb(runtime));
}

async function executeRawSql(
  runtime: IAgentRuntime,
  sqlText: string,
): Promise<unknown> {
  const db = getRuntimeDb(runtime);
  if (!db) {
    throw new Error("runtime database adapter unavailable");
  }
  const raw = await getSqlRaw();
  return db.execute(raw(sqlText));
}

function extractRows(result: unknown): unknown[] {
  if (Array.isArray(result)) return result;
  const record = asRecord(result);
  if (!record) return [];
  return Array.isArray(record.rows) ? record.rows : [];
}

function warnRuntime(
  runtime: IAgentRuntime,
  message: string,
  err?: unknown,
): void {
  const runtimeLike = runtime as unknown as {
    logger?: {
      warn?: (meta: Record<string, unknown>, message: string) => void;
    };
  };
  if (runtimeLike.logger?.warn) {
    runtimeLike.logger.warn(
      { err, src: "milady", subsystem: "trajectory-db" },
      message,
    );
  }
}

async function ensureTrajectoriesTable(
  runtime: IAgentRuntime,
): Promise<boolean> {
  const key = runtime as unknown as object;
  if (initializedRuntimes.has(key)) return true;

  try {
    await executeRawSql(
      runtime,
      `CREATE TABLE IF NOT EXISTS trajectories (
        id TEXT PRIMARY KEY,
        trajectory_id TEXT,
        agent_id TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'runtime',
        status TEXT NOT NULL DEFAULT 'completed',
        start_time BIGINT NOT NULL,
        end_time BIGINT,
        duration_ms BIGINT,
        step_count INTEGER NOT NULL DEFAULT 0,
        llm_call_count INTEGER NOT NULL DEFAULT 0,
        provider_access_count INTEGER NOT NULL DEFAULT 0,
        total_prompt_tokens INTEGER NOT NULL DEFAULT 0,
        total_completion_tokens INTEGER NOT NULL DEFAULT 0,
        total_reward REAL NOT NULL DEFAULT 0,
        steps_json TEXT NOT NULL DEFAULT '[]',
        metadata TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        episode_length INTEGER,
        ai_judge_reward REAL,
        ai_judge_reasoning TEXT,
        archetype TEXT
      )`,
    );

    // Backfill legacy installations where the table already existed with an
    // older column set. CREATE TABLE IF NOT EXISTS does not add missing columns.
    const requiredColumns: Array<[name: string, definition: string]> = [
      ["trajectory_id", "TEXT"],
      ["agent_id", "TEXT NOT NULL DEFAULT ''"],
      ["source", "TEXT NOT NULL DEFAULT 'runtime'"],
      ["status", "TEXT NOT NULL DEFAULT 'completed'"],
      ["start_time", "BIGINT NOT NULL DEFAULT 0"],
      ["end_time", "BIGINT"],
      ["duration_ms", "BIGINT"],
      ["step_count", "INTEGER NOT NULL DEFAULT 0"],
      ["llm_call_count", "INTEGER NOT NULL DEFAULT 0"],
      ["provider_access_count", "INTEGER NOT NULL DEFAULT 0"],
      ["total_prompt_tokens", "INTEGER NOT NULL DEFAULT 0"],
      ["total_completion_tokens", "INTEGER NOT NULL DEFAULT 0"],
      ["total_reward", "REAL NOT NULL DEFAULT 0"],
      ["steps_json", "TEXT NOT NULL DEFAULT '[]'"],
      ["metadata", "TEXT NOT NULL DEFAULT '{}'"],
      ["created_at", "TEXT NOT NULL DEFAULT ''"],
      ["updated_at", "TEXT NOT NULL DEFAULT ''"],
      ["episode_length", "INTEGER"],
      ["ai_judge_reward", "REAL"],
      ["ai_judge_reasoning", "TEXT"],
      ["archetype", "TEXT"],
    ];
    for (const [columnName, columnDef] of requiredColumns) {
      await executeRawSql(
        runtime,
        `ALTER TABLE trajectories ADD COLUMN IF NOT EXISTS ${columnName} ${columnDef}`,
      );
    }

    initializedRuntimes.add(key);
    return true;
  } catch (err) {
    console.error(
      "[trajectory-persistence] ensureTrajectoriesTable error:",
      err,
    );
    return false;
  }
}

function normalizeStatus(
  value: unknown,
  fallback: TrajectoryStatus,
): TrajectoryStatus {
  const status = toText(value, "").toLowerCase();
  if (
    status === "active" ||
    status === "completed" ||
    status === "error" ||
    status === "timeout"
  ) {
    return status;
  }
  return fallback;
}

function normalizeStepId(value: unknown): string | null {
  const stepId = toText(value, "").trim();
  return stepId.length > 0 ? stepId : null;
}

function normalizeLlmCallPayload(
  args: unknown[],
): { stepId: string; params: Record<string, unknown> } | null {
  if (args.length === 0) return null;
  if (typeof args[0] === "string") {
    const stepId = normalizeStepId(args[0]);
    const details = asRecord(args[1]);
    if (!stepId || !details) return null;
    return {
      stepId,
      params: {
        ...details,
        stepId,
      },
    };
  }

  const params = asRecord(args[0]);
  if (!params) return null;
  const stepId = normalizeStepId(params.stepId);
  if (!stepId) return null;
  if (params.stepId === stepId) {
    return {
      stepId,
      params,
    };
  }
  return {
    stepId,
    params: {
      ...params,
      stepId,
    },
  };
}

function normalizeProviderAccessPayload(
  args: unknown[],
): { stepId: string; params: Record<string, unknown> } | null {
  if (args.length === 0) return null;
  if (typeof args[0] === "string") {
    const stepId = normalizeStepId(args[0]);
    const details = asRecord(args[1]);
    if (!stepId || !details) return null;
    return {
      stepId,
      params: {
        ...details,
        stepId,
      },
    };
  }

  const params = asRecord(args[0]);
  if (!params) return null;
  const stepId = normalizeStepId(params.stepId);
  if (!stepId) return null;
  if (params.stepId === stepId) {
    return {
      stepId,
      params,
    };
  }
  return {
    stepId,
    params: {
      ...params,
      stepId,
    },
  };
}

function isNumericVectorString(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed === "[array]") return true;
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) return false;
  const inner = trimmed.slice(1, -1).trim();
  if (!inner) return false;
  const parts = inner
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (parts.length < 8) return false;
  const sampleSize = Math.min(parts.length, 16);
  for (let i = 0; i < sampleSize; i += 1) {
    const numeric = Number(parts[i]);
    if (!Number.isFinite(numeric)) return false;
  }
  return true;
}

function shouldSuppressNoInputEmbeddingCall(
  params: Record<string, unknown>,
): boolean {
  const model = toText(params.model, "").toLowerCase();
  const actionType = toText(params.actionType, "").toLowerCase();
  const purpose = toText(params.purpose, "").toLowerCase();
  const isEmbedding =
    model.includes("embed") ||
    actionType.includes("embed") ||
    purpose.includes("embed");
  if (!isEmbedding) return false;
  const userPrompt = toText(params.userPrompt ?? params.input, "").trim();
  if (userPrompt.length > 0) return false;
  const response = toText(params.response, "");
  if (!response.trim()) return true;
  return isNumericVectorString(response);
}

function isLegacyTrajectoryLogger(logger: TrajectoryLoggerLike): boolean {
  return (
    typeof logger.listTrajectories === "function" &&
    typeof logger.getTrajectoryDetail === "function"
  );
}

function resolveTrajectoryLogger(
  runtime: IAgentRuntime,
): TrajectoryLoggerLike | null {
  const runtimeLike = runtime as unknown as {
    getServicesByType?: (serviceType: string) => unknown;
    getService?: (serviceType: string) => unknown;
  };

  const candidates: TrajectoryLoggerLike[] = [];
  const seen = new Set<unknown>();
  const push = (candidate: unknown): void => {
    if (!candidate || typeof candidate !== "object" || seen.has(candidate))
      return;
    seen.add(candidate);
    candidates.push(candidate as TrajectoryLoggerLike);
  };

  if (typeof runtimeLike.getServicesByType === "function") {
    const byType = runtimeLike.getServicesByType("trajectory_logger");
    if (Array.isArray(byType)) {
      for (const item of byType) push(item);
    } else {
      push(byType);
    }
  }
  if (typeof runtimeLike.getService === "function") {
    push(runtimeLike.getService("trajectory_logger"));
  }

  if (candidates.length === 0) return null;

  let best: TrajectoryLoggerLike | null = null;
  let bestScore = -1;
  for (const candidate of candidates) {
    let score = 0;
    if (isLegacyTrajectoryLogger(candidate)) score += 100;
    if (typeof candidate.logLlmCall === "function") score += 10;
    if (typeof candidate.logProviderAccess === "function") score += 10;
    if (typeof candidate.getLlmCallLogs === "function") score += 2;
    if (typeof candidate.getProviderAccessLogs === "function") score += 2;
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  return best;
}

function enqueueStepWrite(
  runtime: IAgentRuntime,
  stepId: string,
  work: () => Promise<void>,
): Promise<void> {
  const runtimeKey = runtime as unknown as object;
  let perStep = stepWriteQueues.get(runtimeKey);
  if (!perStep) {
    perStep = new Map<string, Promise<void>>();
    stepWriteQueues.set(runtimeKey, perStep);
  }

  const previous = perStep.get(stepId) ?? Promise.resolve();
  const current = previous
    .catch(() => undefined)
    .then(work)
    .catch((err: unknown) => {
      warnRuntime(
        runtime,
        "Failed to write trajectory update to database",
        err,
      );
    })
    .finally(() => {
      const latest = perStep?.get(stepId);
      if (latest === current) {
        perStep?.delete(stepId);
      }
    });

  perStep.set(stepId, current);
  return current;
}

function createBaseTrajectory(
  stepId: string,
  now: number,
  source?: string,
  metadata?: Record<string, unknown>,
): PersistedTrajectory {
  const normalizedSource = source?.trim() || "runtime";
  const createdAt = new Date(now).toISOString();
  return {
    id: stepId,
    source: normalizedSource,
    status: "active",
    startTime: now,
    endTime: null,
    steps: [
      {
        stepId,
        stepNumber: 0,
        timestamp: now,
        llmCalls: [],
        providerAccesses: [],
      },
    ],
    metadata: {
      ...(metadata ?? {}),
    },
    totalReward: 0,
    createdAt,
    updatedAt: createdAt,
  };
}

function ensureStep(
  trajectory: PersistedTrajectory,
  stepId: string,
  now: number,
): PersistedStep {
  let step = trajectory.steps.find((item) => item.stepId === stepId);
  if (!step) {
    step = {
      stepId,
      stepNumber: trajectory.steps.length,
      timestamp: now,
      llmCalls: [],
      providerAccesses: [],
    };
    trajectory.steps.push(step);
  }
  return step;
}

function mergeMetadata(
  existing: Record<string, unknown>,
  incoming?: Record<string, unknown>,
): Record<string, unknown> {
  if (!incoming) return existing;
  const merged: Record<string, unknown> = { ...existing };
  for (const [key, value] of Object.entries(incoming)) {
    if (value !== undefined) merged[key] = value;
  }
  return merged;
}

function collectTrajectoryTimestamps(
  trajectory: PersistedTrajectory,
): number[] {
  const timestamps: number[] = [trajectory.startTime];
  for (const step of trajectory.steps) {
    timestamps.push(step.timestamp);
    for (const call of step.llmCalls) {
      timestamps.push(call.timestamp);
    }
    for (const access of step.providerAccesses) {
      timestamps.push(access.timestamp);
    }
  }
  return timestamps.filter((value) => Number.isFinite(value));
}

function summarizeTrajectory(trajectory: PersistedTrajectory): {
  startTime: number;
  endTime: number;
  llmCallCount: number;
  providerAccessCount: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
} {
  const timestamps = collectTrajectoryTimestamps(trajectory);
  const startTime =
    timestamps.length > 0 ? Math.min(...timestamps) : Date.now();
  const endTime = timestamps.length > 0 ? Math.max(...timestamps) : startTime;

  let llmCallCount = 0;
  let providerAccessCount = 0;
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;

  for (const step of trajectory.steps) {
    llmCallCount += step.llmCalls.length;
    providerAccessCount += step.providerAccesses.length;
    for (const call of step.llmCalls) {
      totalPromptTokens += call.promptTokens ?? 0;
      totalCompletionTokens += call.completionTokens ?? 0;
    }
  }

  return {
    startTime,
    endTime,
    llmCallCount,
    providerAccessCount,
    totalPromptTokens,
    totalCompletionTokens,
  };
}

async function loadTrajectoryById(
  runtime: IAgentRuntime,
  stepId: string,
): Promise<PersistedTrajectory | null> {
  const safeId = sqlQuote(stepId);
  try {
    const result = await executeRawSql(
      runtime,
      `SELECT * FROM trajectories WHERE id = ${safeId} LIMIT 1`,
    );
    const rows = extractRows(result);
    if (rows.length === 0) return null;
    const row = asRecord(rows[0]);
    if (!row) return null;

    const startTime = toNumber(
      readRecordValue(row, ["start_time", "startTime"]),
      Date.now(),
    );
    const endTime =
      toOptionalNumber(readRecordValue(row, ["end_time", "endTime"])) ?? null;
    const steps = parseSteps(
      readRecordValue(row, ["steps_json", "stepsJson", "steps"]),
    );

    return {
      id: toText(
        readRecordValue(row, ["id", "trajectory_id", "trajectoryId"]),
        stepId,
      ),
      source: toText(readRecordValue(row, ["source"]), "runtime"),
      status: normalizeStatus(readRecordValue(row, ["status"]), "completed"),
      startTime,
      endTime,
      steps,
      metadata: parseMetadata(readRecordValue(row, ["metadata", "meta"])),
      totalReward: toNumber(
        readRecordValue(row, ["total_reward", "totalReward"]),
        0,
      ),
      createdAt: toText(
        readRecordValue(row, ["created_at", "createdAt"]),
        new Date(startTime).toISOString(),
      ),
      updatedAt: toText(
        readRecordValue(row, ["updated_at", "updatedAt"]),
        new Date(endTime ?? startTime).toISOString(),
      ),
    };
  } catch {
    return null;
  }
}

async function saveTrajectory(
  runtime: IAgentRuntime,
  trajectory: PersistedTrajectory,
): Promise<boolean> {
  const summary = summarizeTrajectory(trajectory);
  const isActive = trajectory.status === "active";
  const endTime = isActive ? null : (trajectory.endTime ?? summary.endTime);
  const durationMs =
    typeof endTime === "number"
      ? Math.max(0, endTime - summary.startTime)
      : null;
  const createdAt =
    trajectory.createdAt || new Date(summary.startTime).toISOString();
  const updatedAt =
    trajectory.updatedAt || new Date(endTime ?? summary.endTime).toISOString();

  const sql = `INSERT INTO trajectories (
      id,
      trajectory_id,
      agent_id,
      source,
      status,
      start_time,
      end_time,
      duration_ms,
      step_count,
      llm_call_count,
      provider_access_count,
      total_prompt_tokens,
      total_completion_tokens,
      total_reward,
      steps_json,
      metadata,
      created_at,
      updated_at,
      episode_length
    ) VALUES (
      ${sqlQuote(trajectory.id)},
      ${sqlQuote(trajectory.id)},
      ${sqlQuote(runtime.agentId)},
      ${sqlQuote(trajectory.source)},
      ${sqlQuote(trajectory.status)},
      ${sqlNumber(summary.startTime)},
      ${sqlNumber(endTime)},
      ${sqlNumber(durationMs)},
      ${sqlNumber(trajectory.steps.length)},
      ${sqlNumber(summary.llmCallCount)},
      ${sqlNumber(summary.providerAccessCount)},
      ${sqlNumber(summary.totalPromptTokens)},
      ${sqlNumber(summary.totalCompletionTokens)},
      ${sqlNumber(trajectory.totalReward)},
      ${sqlQuote(JSON.stringify(trajectory.steps))},
      ${sqlQuote(JSON.stringify(trajectory.metadata))},
      ${sqlQuote(createdAt)},
      ${sqlQuote(updatedAt)},
      ${sqlNumber(trajectory.steps.length)}
    )
    ON CONFLICT (id) DO UPDATE SET
      trajectory_id = EXCLUDED.trajectory_id,
      agent_id = EXCLUDED.agent_id,
      source = EXCLUDED.source,
      status = EXCLUDED.status,
      start_time = EXCLUDED.start_time,
      end_time = EXCLUDED.end_time,
      duration_ms = EXCLUDED.duration_ms,
      step_count = EXCLUDED.step_count,
      llm_call_count = EXCLUDED.llm_call_count,
      provider_access_count = EXCLUDED.provider_access_count,
      total_prompt_tokens = EXCLUDED.total_prompt_tokens,
      total_completion_tokens = EXCLUDED.total_completion_tokens,
      total_reward = EXCLUDED.total_reward,
      steps_json = EXCLUDED.steps_json,
      metadata = EXCLUDED.metadata,
      created_at = EXCLUDED.created_at,
      updated_at = EXCLUDED.updated_at,
      episode_length = EXCLUDED.episode_length`;

  try {
    await executeRawSql(runtime, sql);
    return true;
  } catch (err) {
    console.error("[trajectory-persistence] saveTrajectory error:", err);
    return false;
  }
}

async function appendLlmCall(
  runtime: IAgentRuntime,
  stepId: string,
  params: Record<string, unknown>,
): Promise<void> {
  if (shouldSuppressNoInputEmbeddingCall(params)) return;

  const now = toNumber(params.timestamp, Date.now());
  const trajectory =
    (await loadTrajectoryById(runtime, stepId)) ??
    createBaseTrajectory(stepId, now);

  trajectory.source = trajectory.source || "runtime";
  trajectory.status =
    trajectory.status === "active" ? "active" : trajectory.status;

  const step = ensureStep(trajectory, stepId, now);
  const call: PersistedLlmCall = {
    callId: toText(params.callId, `${stepId}-call-${step.llmCalls.length + 1}`),
    timestamp: now,
    model: toText(params.model, "unknown"),
    systemPrompt: toText(params.systemPrompt, ""),
    userPrompt: toText(params.userPrompt ?? params.input, ""),
    response: toText(params.response, ""),
    temperature: toNumber(params.temperature, 0),
    maxTokens: toNumber(params.maxTokens, 0),
    purpose: toText(params.purpose, "action"),
    actionType: toText(params.actionType, "runtime.useModel"),
    latencyMs: toNumber(params.latencyMs, 0),
  };

  const promptTokens = toOptionalNumber(params.promptTokens);
  const completionTokens = toOptionalNumber(params.completionTokens);
  if (promptTokens !== undefined) call.promptTokens = promptTokens;
  if (completionTokens !== undefined) call.completionTokens = completionTokens;

  step.llmCalls.push(call);
  trajectory.startTime = Math.min(trajectory.startTime, now);
  trajectory.endTime = Math.max(trajectory.endTime ?? now, now);
  trajectory.updatedAt = new Date(now).toISOString();

  await saveTrajectory(runtime, trajectory);
}

async function appendProviderAccess(
  runtime: IAgentRuntime,
  stepId: string,
  params: Record<string, unknown>,
): Promise<void> {
  const now = toNumber(params.timestamp, Date.now());
  const trajectory =
    (await loadTrajectoryById(runtime, stepId)) ??
    createBaseTrajectory(stepId, now);

  trajectory.source = trajectory.source || "runtime";
  trajectory.status =
    trajectory.status === "active" ? "active" : trajectory.status;

  const step = ensureStep(trajectory, stepId, now);
  const access: PersistedProviderAccess = {
    providerId: toText(
      params.providerId,
      `${stepId}-provider-${step.providerAccesses.length + 1}`,
    ),
    providerName: toText(params.providerName, "unknown"),
    timestamp: now,
    data: asRecord(params.data) ?? {},
    query: asRecord(params.query) ?? undefined,
    purpose: toText(params.purpose, "provider"),
  };

  step.providerAccesses.push(access);
  trajectory.startTime = Math.min(trajectory.startTime, now);
  trajectory.endTime = Math.max(trajectory.endTime ?? now, now);
  trajectory.updatedAt = new Date(now).toISOString();

  await saveTrajectory(runtime, trajectory);
}

export function installDatabaseTrajectoryLogger(runtime: IAgentRuntime): void {
  if (!hasRuntimeDb(runtime)) {
    console.warn(
      "[trajectory-persistence] installDatabaseTrajectoryLogger: no database adapter found on runtime",
    );
    return;
  }

  const logger = resolveTrajectoryLogger(runtime);
  if (!logger) {
    console.warn(
      "[trajectory-persistence] installDatabaseTrajectoryLogger: no logger found to patch",
    );
    return;
  }
  console.warn(
    "[trajectory-persistence] installDatabaseTrajectoryLogger: patched logger!",
  );

  const loggerObject = logger as unknown as object;
  if (patchedLoggers.has(loggerObject)) return;

  if (typeof logger.isEnabled === "function" && !logger.isEnabled()) {
    try {
      logger.setEnabled?.(true);
    } catch {
      // Ignore logger enable failures and continue.
    }
  }

  if (Array.isArray(logger.llmCalls)) {
    logger.llmCalls.splice(0, logger.llmCalls.length);
  }
  if (Array.isArray(logger.providerAccess)) {
    logger.providerAccess.splice(0, logger.providerAccess.length);
  }

  type VariadicLoggerCall = (...args: unknown[]) => unknown;
  const originalLogLlmCall =
    typeof logger.logLlmCall === "function"
      ? ((logger.logLlmCall as unknown as VariadicLoggerCall).bind(
          logger,
        ) as VariadicLoggerCall)
      : null;
  const originalLogProviderAccess =
    typeof logger.logProviderAccess === "function"
      ? ((logger.logProviderAccess as unknown as VariadicLoggerCall).bind(
          logger,
        ) as VariadicLoggerCall)
      : null;

  logger.logLlmCall = ((...args: unknown[]) => {
    if (originalLogLlmCall) {
      try {
        originalLogLlmCall(...args);
      } catch (err) {
        warnRuntime(runtime, "Trajectory logger logLlmCall threw", err);
      }
    }

    const normalized = normalizeLlmCallPayload(args);
    if (!normalized) return;

    const writePromise = enqueueStepWrite(
      runtime,
      normalized.stepId,
      async () => {
        const tableReady = await ensureTrajectoriesTable(runtime);
        if (!tableReady) return;
        await appendLlmCall(runtime, normalized.stepId, normalized.params);
      },
    );
    const runtimeKey = runtime as unknown as object;
    lastWritePromises.set(runtimeKey, writePromise);
  }) as unknown as (params: Record<string, unknown>) => void;

  logger.logProviderAccess = ((...args: unknown[]) => {
    if (originalLogProviderAccess) {
      try {
        originalLogProviderAccess(...args);
      } catch (err) {
        warnRuntime(runtime, "Trajectory logger logProviderAccess threw", err);
      }
    }

    const normalized = normalizeProviderAccessPayload(args);
    if (!normalized) return;

    const writePromise = enqueueStepWrite(
      runtime,
      normalized.stepId,
      async () => {
        const tableReady = await ensureTrajectoriesTable(runtime);
        if (!tableReady) return;
        await appendProviderAccess(
          runtime,
          normalized.stepId,
          normalized.params,
        );
      },
    );
    const runtimeKey = runtime as unknown as object;
    lastWritePromises.set(runtimeKey, writePromise);
  }) as unknown as (params: Record<string, unknown>) => void;

  logger.getLlmCallLogs = () => [];
  logger.getProviderAccessLogs = () => [];

  patchedLoggers.add(loggerObject);

  void ensureTrajectoriesTable(runtime);
}

export async function startTrajectoryStepInDatabase({
  runtime,
  stepId,
  source,
  metadata,
}: StartStepOptions): Promise<boolean> {
  if (!hasRuntimeDb(runtime)) return false;
  const normalizedStepId = normalizeStepId(stepId);
  if (!normalizedStepId) return false;

  const tableReady = await ensureTrajectoriesTable(runtime);
  if (!tableReady) return false;

  await enqueueStepWrite(runtime, normalizedStepId, async () => {
    const now = Date.now();
    const trajectory =
      (await loadTrajectoryById(runtime, normalizedStepId)) ??
      createBaseTrajectory(normalizedStepId, now, source, metadata);

    trajectory.source = source?.trim() || trajectory.source || "runtime";
    trajectory.status = "active";
    trajectory.metadata = mergeMetadata(trajectory.metadata, metadata);
    trajectory.startTime = Math.min(trajectory.startTime, now);
    trajectory.endTime = null;
    ensureStep(trajectory, normalizedStepId, now);
    trajectory.updatedAt = new Date(now).toISOString();

    await saveTrajectory(runtime, trajectory);
  });

  return true;
}

export async function completeTrajectoryStepInDatabase({
  runtime,
  stepId,
  status = "completed",
  source,
  metadata,
}: CompleteStepOptions): Promise<boolean> {
  if (!hasRuntimeDb(runtime)) return false;
  const normalizedStepId = normalizeStepId(stepId);
  if (!normalizedStepId) return false;

  const tableReady = await ensureTrajectoriesTable(runtime);
  if (!tableReady) return false;

  await enqueueStepWrite(runtime, normalizedStepId, async () => {
    const now = Date.now();
    const trajectory =
      (await loadTrajectoryById(runtime, normalizedStepId)) ??
      createBaseTrajectory(normalizedStepId, now, source, metadata);

    trajectory.source = source?.trim() || trajectory.source || "runtime";
    trajectory.status = normalizeStatus(status, "completed");
    trajectory.metadata = mergeMetadata(trajectory.metadata, metadata);
    trajectory.endTime = Math.max(trajectory.endTime ?? now, now);
    trajectory.startTime = Math.min(trajectory.startTime, now);
    ensureStep(trajectory, normalizedStepId, now);
    trajectory.updatedAt = new Date(now).toISOString();

    await saveTrajectory(runtime, trajectory);
  });

  return true;
}

export async function loadPersistedTrajectoryRows(
  runtime: IAgentRuntime,
  maxRows = 5000,
): Promise<Record<string, unknown>[] | null> {
  if (!hasRuntimeDb(runtime)) return null;
  const tableReady = await ensureTrajectoriesTable(runtime);
  if (!tableReady) return [];

  const safeLimit = Math.max(1, Math.min(10000, Math.trunc(maxRows)));
  try {
    const result = await executeRawSql(
      runtime,
      `SELECT * FROM trajectories ORDER BY created_at DESC LIMIT ${safeLimit}`,
    );
    const rows = extractRows(result);
    return rows
      .map((row) => asRecord(row))
      .filter((row): row is Record<string, unknown> => Boolean(row));
  } catch {
    return null;
  }
}

export async function deletePersistedTrajectoryRows(
  runtime: IAgentRuntime,
  trajectoryIds: string[],
): Promise<number | null> {
  if (!hasRuntimeDb(runtime)) return null;
  const tableReady = await ensureTrajectoriesTable(runtime);
  if (!tableReady) return 0;

  const normalized = trajectoryIds
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
  if (normalized.length === 0) return 0;

  const values = normalized.map((id) => sqlQuote(id)).join(", ");
  try {
    const result = await executeRawSql(
      runtime,
      `DELETE FROM trajectories WHERE id IN (${values}) RETURNING id`,
    );
    return extractRows(result).length;
  } catch {
    try {
      await executeRawSql(
        runtime,
        `DELETE FROM trajectories WHERE id IN (${values})`,
      );
      return normalized.length;
    } catch {
      return null;
    }
  }
}

export async function clearPersistedTrajectoryRows(
  runtime: IAgentRuntime,
): Promise<number | null> {
  if (!hasRuntimeDb(runtime)) return null;
  const tableReady = await ensureTrajectoriesTable(runtime);
  if (!tableReady) return 0;

  try {
    const countResult = await executeRawSql(
      runtime,
      "SELECT count(*) AS total FROM trajectories",
    );
    const countRow = asRecord(extractRows(countResult)[0]);
    const total = toNumber(countRow?.total, 0);
    await executeRawSql(runtime, "DELETE FROM trajectories");
    return total;
  } catch {
    return null;
  }
}

/**
 * Wait for all pending trajectory writes to complete.
 * Useful for tests to ensure writes are flushed before assertions.
 */
export async function flushTrajectoryWrites(
  runtime: IAgentRuntime,
): Promise<void> {
  const runtimeKey = runtime as unknown as object;
  const perStep = stepWriteQueues.get(runtimeKey);
  if (perStep) {
    const pending = Array.from(perStep.values());
    if (pending.length > 0) {
      await Promise.all(pending);
    }
  }
  const lastWrite = lastWritePromises.get(runtimeKey);
  if (lastWrite) {
    await lastWrite;
  }
}

// ============================================================================
// DatabaseTrajectoryLogger - Full implementation for trajectory-routes.ts
// ============================================================================

/**
 * Database-backed trajectory logger service that implements the full API
 * expected by trajectory-routes.ts. This service reads from and writes to
 * the database for trajectory persistence.
 */
export class DatabaseTrajectoryLogger extends Service {
  static serviceType = "trajectory_logger";
  capabilityDescription =
    "Database-backed trajectory logging service for LLM call persistence";

  private enabled = true;

  /**
   * Static start method required by @elizaos/core runtime.
   */
  static async start(runtime: IAgentRuntime): Promise<Service> {
    const service = new DatabaseTrajectoryLogger(runtime);
    await service.initialize();
    return service;
  }

  async initialize(): Promise<void> {
    if (hasRuntimeDb(this.runtime)) {
      await ensureTrajectoriesTable(this.runtime);
    }
  }

  async stop(): Promise<void> {
    await flushTrajectoryWrites(this.runtime);
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  logLlmCall(params: Record<string, unknown>): void {
    if (!this.enabled) return;
    const normalized = normalizeLlmCallPayload([params]);
    if (!normalized) return;

    const writePromise = enqueueStepWrite(
      this.runtime,
      normalized.stepId,
      async () => {
        const tableReady = await ensureTrajectoriesTable(this.runtime);
        if (!tableReady) return;
        await appendLlmCall(this.runtime, normalized.stepId, normalized.params);
      },
    );
    const runtimeKey = this.runtime as unknown as object;
    lastWritePromises.set(runtimeKey, writePromise);
  }

  logProviderAccess(params: Record<string, unknown>): void {
    if (!this.enabled) return;
    const normalized = normalizeProviderAccessPayload([params]);
    if (!normalized) return;

    const writePromise = enqueueStepWrite(
      this.runtime,
      normalized.stepId,
      async () => {
        const tableReady = await ensureTrajectoriesTable(this.runtime);
        if (!tableReady) return;
        await appendProviderAccess(
          this.runtime,
          normalized.stepId,
          normalized.params,
        );
      },
    );
    const runtimeKey = this.runtime as unknown as object;
    lastWritePromises.set(runtimeKey, writePromise);
  }

  getLlmCallLogs(): readonly unknown[] {
    return [];
  }

  getProviderAccessLogs(): readonly unknown[] {
    return [];
  }

  async listTrajectories(
    options: TrajectoryListOptions,
  ): Promise<TrajectoryListResult> {
    if (!hasRuntimeDb(this.runtime)) {
      return { trajectories: [], total: 0, offset: 0, limit: 50 };
    }

    const tableReady = await ensureTrajectoriesTable(this.runtime);
    if (!tableReady) {
      return { trajectories: [], total: 0, offset: 0, limit: 50 };
    }

    const limit = Math.min(500, Math.max(1, options.limit ?? 50));
    const offset = Math.max(0, options.offset ?? 0);

    // Build WHERE clause
    const whereClauses: string[] = [];
    if (options.source) {
      whereClauses.push(`source = ${sqlQuote(options.source)}`);
    }
    if (options.status) {
      whereClauses.push(`status = ${sqlQuote(options.status)}`);
    }
    if (options.startDate) {
      const startTime = new Date(options.startDate).getTime();
      if (Number.isFinite(startTime)) {
        whereClauses.push(`start_time >= ${startTime}`);
      }
    }
    if (options.endDate) {
      const endTime = new Date(options.endDate).getTime();
      if (Number.isFinite(endTime)) {
        whereClauses.push(`start_time <= ${endTime}`);
      }
    }
    if (options.search) {
      const searchPattern = `%${options.search.replace(/[%_]/g, "\\$&")}%`;
      whereClauses.push(`id LIKE ${sqlQuote(searchPattern)}`);
    }

    const whereClause =
      whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

    try {
      // Get total count
      const countResult = await executeRawSql(
        this.runtime,
        `SELECT count(*) AS total FROM trajectories ${whereClause}`,
      );
      const countRow = asRecord(extractRows(countResult)[0]);
      const total = toNumber(countRow?.total, 0);

      // Get rows
      const result = await executeRawSql(
        this.runtime,
        `SELECT * FROM trajectories ${whereClause} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`,
      );

      const rows = extractRows(result);
      const trajectories: TrajectoryListItem[] = rows
        .map((row) => {
          const r = asRecord(row);
          if (!r) return null;
          return {
            id: toText(r.id ?? r.trajectory_id, ""),
            agentId: toText(r.agent_id, this.runtime.agentId),
            source: toText(r.source, "runtime"),
            status: normalizeStatus(r.status, "completed"),
            startTime: toNumber(r.start_time, Date.now()),
            endTime: toOptionalNumber(r.end_time) ?? null,
            durationMs: toOptionalNumber(r.duration_ms) ?? null,
            stepCount: toNumber(r.step_count, 0),
            llmCallCount: toNumber(r.llm_call_count, 0),
            providerAccessCount: toNumber(r.provider_access_count, 0),
            totalPromptTokens: toNumber(r.total_prompt_tokens, 0),
            totalCompletionTokens: toNumber(r.total_completion_tokens, 0),
            createdAt: toText(
              r.created_at,
              new Date(toNumber(r.start_time, Date.now())).toISOString(),
            ),
          };
        })
        .filter((item): item is TrajectoryListItem => item !== null);

      return { trajectories, total, offset, limit };
    } catch (err) {
      console.error("[DatabaseTrajectoryLogger] listTrajectories error:", err);
      return { trajectories: [], total: 0, offset, limit };
    }
  }

  async getTrajectoryDetail(trajectoryId: string): Promise<Trajectory | null> {
    if (!hasRuntimeDb(this.runtime)) return null;

    const tableReady = await ensureTrajectoriesTable(this.runtime);
    if (!tableReady) return null;

    const persisted = await loadTrajectoryById(this.runtime, trajectoryId);
    if (!persisted) return null;

    return {
      trajectoryId: persisted.id,
      agentId: this.runtime.agentId,
      startTime: persisted.startTime,
      endTime: persisted.endTime ?? undefined,
      durationMs: persisted.endTime
        ? persisted.endTime - persisted.startTime
        : undefined,
      steps: persisted.steps.map((step) => ({
        stepId: step.stepId,
        timestamp: step.timestamp,
        llmCalls: step.llmCalls,
        providerAccesses: step.providerAccesses,
      })),
      metrics: { finalStatus: persisted.status },
      metadata: persisted.metadata,
      stepsJson: JSON.stringify(persisted.steps),
    };
  }

  async getStats(): Promise<unknown> {
    if (!hasRuntimeDb(this.runtime)) {
      return { total: 0, byStatus: {}, bySource: {} };
    }

    const tableReady = await ensureTrajectoriesTable(this.runtime);
    if (!tableReady) {
      return { total: 0, byStatus: {}, bySource: {} };
    }

    try {
      const countResult = await executeRawSql(
        this.runtime,
        "SELECT count(*) AS total FROM trajectories",
      );
      const countRow = asRecord(extractRows(countResult)[0]);
      const total = toNumber(countRow?.total, 0);

      return {
        total,
        enabled: this.enabled,
        byStatus: {},
        bySource: {},
      };
    } catch {
      return { total: 0, byStatus: {}, bySource: {} };
    }
  }

  async deleteTrajectories(trajectoryIds: string[]): Promise<number> {
    const result = await deletePersistedTrajectoryRows(
      this.runtime,
      trajectoryIds,
    );
    return result ?? 0;
  }

  async clearAllTrajectories(): Promise<number> {
    const result = await clearPersistedTrajectoryRows(this.runtime);
    return result ?? 0;
  }

  async exportTrajectories(
    options: TrajectoryExportOptions,
  ): Promise<TrajectoryExportResult> {
    const listResult = await this.listTrajectories({
      limit: 10000,
      startDate: options.startDate,
      endDate: options.endDate,
    });

    let ids = listResult.trajectories.map((t) => t.id);
    if (options.trajectoryIds && options.trajectoryIds.length > 0) {
      const idSet = new Set(options.trajectoryIds);
      ids = ids.filter((id) => idSet.has(id));
    }

    const trajectories: Trajectory[] = [];
    for (const id of ids) {
      const detail = await this.getTrajectoryDetail(id);
      if (detail) trajectories.push(detail);
    }

    if (options.format === "json") {
      return {
        filename: `trajectories-${Date.now()}.json`,
        data: JSON.stringify(trajectories, null, 2),
        mimeType: "application/json",
      };
    }

    if (options.format === "csv") {
      const rows = [
        "id,agentId,startTime,endTime,status,llmCallCount,promptTokens,completionTokens",
      ];
      for (const t of trajectories) {
        const llmCount = t.steps?.reduce(
          (sum, s) => sum + (s.llmCalls?.length ?? 0),
          0,
        );
        const promptTokens = t.steps?.reduce(
          (sum, s) =>
            sum +
            (s.llmCalls?.reduce((s2, c) => s2 + (c.promptTokens ?? 0), 0) ?? 0),
          0,
        );
        const completionTokens = t.steps?.reduce(
          (sum, s) =>
            sum +
            (s.llmCalls?.reduce((s2, c) => s2 + (c.completionTokens ?? 0), 0) ??
              0),
          0,
        );
        rows.push(
          `${t.trajectoryId},${t.agentId},${t.startTime},${t.endTime ?? ""},${t.metrics?.finalStatus ?? ""},${llmCount ?? 0},${promptTokens ?? 0},${completionTokens ?? 0}`,
        );
      }
      return {
        filename: `trajectories-${Date.now()}.csv`,
        data: rows.join("\n"),
        mimeType: "text/csv",
      };
    }

    // Default to JSON for 'art' format
    return {
      filename: `trajectories-${Date.now()}.json`,
      data: JSON.stringify(trajectories, null, 2),
      mimeType: "application/json",
    };
  }
}

/**
 * Create and register a database-backed trajectory logger service on the runtime.
 * This replaces any existing trajectory_logger service with one that persists to the database.
 */
export function createDatabaseTrajectoryLogger(
  runtime: IAgentRuntime,
): DatabaseTrajectoryLogger {
  const logger = new DatabaseTrajectoryLogger(runtime);
  return logger;
}
