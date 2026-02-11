/**
 * Fine-tuning service for Milaidy.
 *
 * Provides:
 * - trajectory listing from runtime database
 * - dataset building from real trajectory rows
 * - long-running training job orchestration
 * - model artifact registry + local activation helpers
 */

import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import crypto from "node:crypto";
import { EventEmitter } from "node:events";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import type { AgentRuntime } from "@elizaos/core";
import { logger } from "@elizaos/core";
import { resolveStateDir } from "../config/paths.js";
import type { MilaidyConfig } from "../config/types.js";

type SqlPrimitive = string | number | boolean | null;
interface SqlCellArray extends Array<SqlCell> {}
type SqlCell = SqlPrimitive | Date | SqlRow | SqlCellArray;
interface SqlRow {
  [key: string]: SqlCell;
}

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

type TrainingJobStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

type TrainingEventKind =
  | "job_started"
  | "job_progress"
  | "job_log"
  | "job_completed"
  | "job_failed"
  | "job_cancelled"
  | "dataset_built"
  | "model_activated"
  | "model_imported";

export interface TrainingStreamEvent {
  kind: TrainingEventKind;
  ts: number;
  message: string;
  jobId?: string;
  modelId?: string;
  datasetId?: string;
  progress?: number;
  phase?: string;
}

export interface TrajectoryQueryOptions {
  limit?: number;
  offset?: number;
}

export interface TrainingTrajectorySummary {
  id: string;
  trajectoryId: string;
  agentId: string;
  archetype: string | null;
  createdAt: string;
  totalReward: number | null;
  aiJudgeReward: number | null;
  episodeLength: number | null;
  hasLlmCalls: boolean;
  llmCallCount: number;
}

export interface TrainingTrajectoryDetail extends TrainingTrajectorySummary {
  stepsJson: string;
  aiJudgeReasoning: string | null;
}

export interface TrainingTrajectoryList {
  available: boolean;
  reason?: string;
  total: number;
  trajectories: TrainingTrajectorySummary[];
}

export interface DatasetBuildOptions {
  limit?: number;
  minLlmCallsPerTrajectory?: number;
}

export interface TrainingDatasetRecord {
  id: string;
  createdAt: string;
  jsonlPath: string;
  trajectoryDir: string;
  metadataPath: string;
  sampleCount: number;
  trajectoryCount: number;
}

export interface StartTrainingOptions {
  datasetId?: string;
  maxTrajectories?: number;
  backend?: "mlx" | "cuda" | "cpu";
  model?: string;
  iterations?: number;
  batchSize?: number;
  learningRate?: number;
}

export interface TrainingJobRecord {
  id: string;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  status: TrainingJobStatus;
  phase: string;
  progress: number;
  error: string | null;
  exitCode: number | null;
  signal: string | null;
  options: StartTrainingOptions;
  datasetId: string;
  pythonRoot: string;
  scriptPath: string;
  outputDir: string;
  logPath: string;
  modelPath: string | null;
  adapterPath: string | null;
  modelId: string | null;
  logs: string[];
}

export interface TrainingModelRecord {
  id: string;
  createdAt: string;
  jobId: string;
  outputDir: string;
  modelPath: string;
  adapterPath: string | null;
  sourceModel: string | null;
  backend: "mlx" | "cuda" | "cpu";
  ollamaModel: string | null;
  active: boolean;
  benchmark: {
    status: "not_run" | "passed" | "failed";
    lastRunAt: string | null;
    output: string | null;
  };
}

export interface ActivateModelResult {
  modelId: string;
  providerModel: string;
  needsRestart: boolean;
}

interface ServiceOptions {
  getRuntime: () => AgentRuntime | null;
  getConfig: () => MilaidyConfig;
  setConfig: (nextConfig: MilaidyConfig) => void;
}

interface SqlExecuteResult {
  rows: SqlRow[];
  fields?: Array<{ name: string }>;
}

interface ParsedLlmCall {
  systemPrompt: string;
  userPrompt: string;
  response: string;
  model?: string;
  purpose?: string;
}

interface ParsedTrajectoryForDataset {
  summary: TrainingTrajectorySummary;
  steps: JsonValue[];
  stepsJson: string;
}

const MAX_STORED_JOB_LOG_LINES = 600;

function isObject(value: JsonValue): value is { [key: string]: JsonValue } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asNumber(value: SqlCell | undefined): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asString(value: SqlCell | undefined): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  if (value instanceof Date) return value.toISOString();
  return null;
}

function asIsoString(value: SqlCell | undefined): string {
  if (value instanceof Date) return value.toISOString();
  const asText = asString(value);
  if (!asText) return new Date(0).toISOString();
  const parsed = new Date(asText);
  if (Number.isNaN(parsed.getTime())) return new Date(0).toISOString();
  return parsed.toISOString();
}

function pickCell(row: SqlRow, ...keys: string[]): SqlCell | undefined {
  for (const key of keys) {
    if (Object.hasOwn(row, key)) {
      return row[key];
    }
  }
  return undefined;
}

function parseJson(text: string): JsonValue | null {
  try {
    return JSON.parse(text) as JsonValue;
  } catch {
    return null;
  }
}

function parseStepsCell(stepsCell: SqlCell | undefined): JsonValue[] {
  if (typeof stepsCell === "string") {
    const parsed = parseJson(stepsCell);
    if (Array.isArray(parsed)) return parsed;
    return [];
  }
  if (Array.isArray(stepsCell)) {
    return stepsCell as JsonValue[];
  }
  return [];
}

function extractLlmCallsFromSteps(steps: JsonValue[]): ParsedLlmCall[] {
  const calls: ParsedLlmCall[] = [];
  for (const step of steps) {
    if (!isObject(step)) continue;
    const stepCallsValue = step.llmCalls ?? step.llm_calls;
    if (!Array.isArray(stepCallsValue)) continue;
    for (const rawCall of stepCallsValue) {
      if (!isObject(rawCall)) continue;
      const systemPrompt = String(
        rawCall.systemPrompt ?? rawCall.system_prompt ?? "",
      );
      const userPrompt = String(
        rawCall.userPrompt ?? rawCall.user_prompt ?? "",
      );
      const response = String(rawCall.response ?? "");
      if (
        systemPrompt.trim().length < 8 ||
        userPrompt.trim().length < 8 ||
        response.trim().length < 8
      ) {
        continue;
      }
      const modelValue = rawCall.model;
      const purposeValue = rawCall.purpose;
      calls.push({
        systemPrompt,
        userPrompt,
        response,
        model: typeof modelValue === "string" ? modelValue : undefined,
        purpose: typeof purposeValue === "string" ? purposeValue : undefined,
      });
    }
  }
  return calls;
}

function summarizeTrajectory(row: SqlRow): TrainingTrajectorySummary {
  const steps = parseStepsCell(pickCell(row, "stepsJson", "steps_json"));
  const llmCalls = extractLlmCallsFromSteps(steps);
  const trajectoryId =
    asString(pickCell(row, "trajectoryId", "trajectory_id", "id")) ??
    "unknown-trajectory";
  const id = asString(pickCell(row, "id")) ?? trajectoryId;
  const agentId =
    asString(pickCell(row, "agentId", "agent_id")) ?? "unknown-agent";
  const createdAt = asIsoString(pickCell(row, "createdAt", "created_at"));
  return {
    id,
    trajectoryId,
    agentId,
    archetype: asString(pickCell(row, "archetype")),
    createdAt,
    totalReward: asNumber(pickCell(row, "totalReward", "total_reward")),
    aiJudgeReward: asNumber(pickCell(row, "aiJudgeReward", "ai_judge_reward")),
    episodeLength: asNumber(pickCell(row, "episodeLength", "episode_length")),
    hasLlmCalls: llmCalls.length > 0,
    llmCallCount: llmCalls.length,
  };
}

export class TrainingService {
  private readonly emitter = new EventEmitter();
  private readonly getRuntime: () => AgentRuntime | null;
  private readonly getConfig: () => MilaidyConfig;
  private readonly setConfig: (nextConfig: MilaidyConfig) => void;

  private initialized = false;
  private readonly baseDir: string;
  private readonly datasetsDir: string;
  private readonly jobsDir: string;
  private readonly modelsDir: string;

  private readonly datasets = new Map<string, TrainingDatasetRecord>();
  private readonly jobs = new Map<string, TrainingJobRecord>();
  private readonly models = new Map<string, TrainingModelRecord>();
  private readonly processes = new Map<
    string,
    ChildProcessWithoutNullStreams
  >();

  constructor(options: ServiceOptions) {
    this.getRuntime = options.getRuntime;
    this.getConfig = options.getConfig;
    this.setConfig = options.setConfig;

    this.baseDir = path.join(resolveStateDir(), "training");
    this.datasetsDir = path.join(this.baseDir, "datasets");
    this.jobsDir = path.join(this.baseDir, "jobs");
    this.modelsDir = path.join(this.baseDir, "models");
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    await fs.mkdir(this.datasetsDir, { recursive: true });
    await fs.mkdir(this.jobsDir, { recursive: true });
    await fs.mkdir(this.modelsDir, { recursive: true });
    await this.loadState();
    this.initialized = true;
  }

  subscribe(listener: (event: TrainingStreamEvent) => void): () => void {
    this.emitter.on("event", listener);
    return () => {
      this.emitter.off("event", listener);
    };
  }

  private emit(event: TrainingStreamEvent): void {
    this.emitter.emit("event", event);
  }

  private stateFile(name: "datasets" | "jobs" | "models"): string {
    return path.join(this.baseDir, `${name}.json`);
  }

  private async loadState(): Promise<void> {
    const datasetFile = this.stateFile("datasets");
    const jobFile = this.stateFile("jobs");
    const modelFile = this.stateFile("models");

    if (existsSync(datasetFile)) {
      const raw = await fs.readFile(datasetFile, "utf-8");
      const parsed = JSON.parse(raw) as TrainingDatasetRecord[];
      for (const record of parsed) {
        this.datasets.set(record.id, record);
      }
    }

    if (existsSync(jobFile)) {
      const raw = await fs.readFile(jobFile, "utf-8");
      const parsed = JSON.parse(raw) as TrainingJobRecord[];
      for (const record of parsed) {
        this.jobs.set(record.id, record);
      }
    }

    if (existsSync(modelFile)) {
      const raw = await fs.readFile(modelFile, "utf-8");
      const parsed = JSON.parse(raw) as TrainingModelRecord[];
      for (const record of parsed) {
        this.models.set(record.id, record);
      }
    }
  }

  private async saveState(): Promise<void> {
    await fs.writeFile(
      this.stateFile("datasets"),
      `${JSON.stringify(Array.from(this.datasets.values()), null, 2)}\n`,
      "utf-8",
    );
    await fs.writeFile(
      this.stateFile("jobs"),
      `${JSON.stringify(Array.from(this.jobs.values()), null, 2)}\n`,
      "utf-8",
    );
    await fs.writeFile(
      this.stateFile("models"),
      `${JSON.stringify(Array.from(this.models.values()), null, 2)}\n`,
      "utf-8",
    );
  }

  private async getSqlHelper(): Promise<{
    raw: (query: string) => { queryChunks: object[] };
  }> {
    const drizzle = (await import("drizzle-orm")) as {
      sql: { raw: (query: string) => { queryChunks: object[] } };
    };
    return drizzle.sql;
  }

  private async executeRawSql(
    runtime: AgentRuntime,
    sqlText: string,
  ): Promise<{ rows: SqlRow[]; columns: string[] }> {
    const sqlHelper = await this.getSqlHelper();
    const db = runtime.adapter.db as {
      execute(query: { queryChunks: object[] }): Promise<SqlExecuteResult>;
    };
    const query = sqlHelper.raw(sqlText);
    const result = await db.execute(query);
    const rows = Array.isArray(result.rows) ? result.rows : [];
    const columns =
      result.fields && Array.isArray(result.fields)
        ? result.fields.map((field) => field.name)
        : rows.length > 0
          ? Object.keys(rows[0])
          : [];
    return { rows, columns };
  }

  private async trajectoriesTableExists(
    runtime: AgentRuntime,
  ): Promise<boolean> {
    const probe = await this.executeRawSql(
      runtime,
      "SELECT to_regclass('public.trajectories') AS table_name",
    );
    if (probe.rows.length === 0) return false;
    return asString(pickCell(probe.rows[0], "table_name")) !== null;
  }

  async listTrajectories(
    options: TrajectoryQueryOptions = {},
  ): Promise<TrainingTrajectoryList> {
    await this.initialize();
    const runtime = this.getRuntime();
    if (!runtime) {
      return {
        available: false,
        reason: "runtime_not_started",
        total: 0,
        trajectories: [],
      };
    }

    const hasTable = await this.trajectoriesTableExists(runtime);
    if (!hasTable) {
      return {
        available: false,
        reason: "trajectories_table_missing",
        total: 0,
        trajectories: [],
      };
    }

    const offset = Math.max(0, options.offset ?? 0);
    const limit = Math.min(500, Math.max(1, options.limit ?? 100));

    const totalResult = await this.executeRawSql(
      runtime,
      "SELECT count(*)::int AS total FROM trajectories",
    );
    const total = asNumber(pickCell(totalResult.rows[0] ?? {}, "total")) ?? 0;

    const rowsResult = await this.executeRawSql(
      runtime,
      `SELECT * FROM trajectories
       ORDER BY COALESCE(created_at, createdAt) DESC
       LIMIT ${limit} OFFSET ${offset}`,
    );

    const trajectories = rowsResult.rows.map(summarizeTrajectory);
    return {
      available: true,
      total,
      trajectories,
    };
  }

  async getTrajectoryById(
    trajectoryId: string,
  ): Promise<TrainingTrajectoryDetail | null> {
    await this.initialize();
    const runtime = this.getRuntime();
    if (!runtime) return null;
    const hasTable = await this.trajectoriesTableExists(runtime);
    if (!hasTable) return null;

    const safeId = trajectoryId.replace(/'/g, "''");
    const rowsResult = await this.executeRawSql(
      runtime,
      `SELECT * FROM trajectories
       WHERE trajectory_id = '${safeId}' OR "trajectoryId" = '${safeId}' OR id = '${safeId}'
       LIMIT 1`,
    );
    if (rowsResult.rows.length === 0) return null;
    const row = rowsResult.rows[0];
    const summary = summarizeTrajectory(row);
    const stepsCell = pickCell(row, "stepsJson", "steps_json");
    const stepsJson =
      typeof stepsCell === "string"
        ? stepsCell
        : JSON.stringify(stepsCell ?? []);
    return {
      ...summary,
      stepsJson,
      aiJudgeReasoning: asString(
        pickCell(row, "aiJudgeReasoning", "ai_judge_reasoning"),
      ),
    };
  }

  private async getTrajectoriesForDataset(
    limit: number,
  ): Promise<ParsedTrajectoryForDataset[]> {
    const listed = await this.listTrajectories({ limit, offset: 0 });
    if (!listed.available) return [];
    const trajectories: ParsedTrajectoryForDataset[] = [];
    for (const summary of listed.trajectories) {
      const detail = await this.getTrajectoryById(summary.trajectoryId);
      if (!detail) continue;
      const parsedSteps = parseJson(detail.stepsJson);
      const steps = Array.isArray(parsedSteps) ? parsedSteps : [];
      trajectories.push({
        summary,
        steps,
        stepsJson: detail.stepsJson,
      });
    }
    return trajectories;
  }

  async buildDataset(
    options: DatasetBuildOptions = {},
  ): Promise<TrainingDatasetRecord> {
    await this.initialize();
    const maxTrajectories = Math.max(1, Math.min(5000, options.limit ?? 250));
    const minLlmCalls = Math.max(1, options.minLlmCallsPerTrajectory ?? 1);

    const trajectories = await this.getTrajectoriesForDataset(maxTrajectories);
    const datasetId = `dataset-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
    const datasetDir = path.join(this.datasetsDir, datasetId);
    const jsonlPath = path.join(datasetDir, "training-data.jsonl");
    const metadataPath = path.join(datasetDir, "metadata.json");
    const trajectoryDir = path.join(datasetDir, "trajectories");

    await fs.mkdir(datasetDir, { recursive: true });
    await fs.mkdir(trajectoryDir, { recursive: true });

    const lines: string[] = [];
    let includedTrajectories = 0;
    for (const item of trajectories) {
      const llmCalls = extractLlmCallsFromSteps(item.steps);
      if (llmCalls.length < minLlmCalls) continue;
      includedTrajectories++;
      const filePayload = {
        trajectory: {
          id: item.summary.id,
          trajectoryId: item.summary.trajectoryId,
          agentId: item.summary.agentId,
          archetype: item.summary.archetype ?? "default",
          stepsJson: item.stepsJson,
          episodeLength: item.summary.episodeLength ?? 0,
          totalReward: item.summary.totalReward ?? 0,
          finalPnL: 0,
        },
      };
      const trajectoryFile = path.join(
        trajectoryDir,
        `${item.summary.trajectoryId}.json`,
      );
      await fs.writeFile(
        trajectoryFile,
        `${JSON.stringify(filePayload, null, 2)}\n`,
        "utf-8",
      );

      for (const call of llmCalls) {
        const sample = {
          trajectory_id: item.summary.trajectoryId,
          agent_id: item.summary.agentId,
          archetype: item.summary.archetype ?? "default",
          messages: [
            { role: "system", content: call.systemPrompt },
            { role: "user", content: call.userPrompt },
            { role: "assistant", content: call.response },
          ],
          metadata: {
            source: "milaidy",
            model: call.model ?? null,
            purpose: call.purpose ?? null,
            ai_judge_reward: item.summary.aiJudgeReward,
            total_reward: item.summary.totalReward,
            created_at: item.summary.createdAt,
          },
        };
        lines.push(JSON.stringify(sample));
      }
    }

    await fs.writeFile(jsonlPath, `${lines.join("\n")}\n`, "utf-8");
    const record: TrainingDatasetRecord = {
      id: datasetId,
      createdAt: new Date().toISOString(),
      jsonlPath,
      trajectoryDir,
      metadataPath,
      sampleCount: lines.length,
      trajectoryCount: includedTrajectories,
    };
    await fs.writeFile(
      metadataPath,
      `${JSON.stringify(record, null, 2)}\n`,
      "utf-8",
    );

    this.datasets.set(record.id, record);
    await this.saveState();

    this.emit({
      kind: "dataset_built",
      ts: Date.now(),
      message: `Dataset ${record.id} built with ${record.sampleCount} samples`,
      datasetId: record.id,
    });

    return record;
  }

  listDatasets(): TrainingDatasetRecord[] {
    return Array.from(this.datasets.values()).sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );
  }

  private resolvePythonRoot(): string {
    const override = process.env.MILAIDY_TRAINING_PYTHON_ROOT?.trim();
    if (override && override.length > 0) return path.resolve(override);
    return path.resolve(process.cwd(), "../eliza/packages/training/python");
  }

  private resolveTrainingScript(pythonRoot: string): string {
    const override = process.env.MILAIDY_TRAINING_SCRIPT?.trim();
    if (override && override.length > 0) return path.resolve(override);
    return path.join(pythonRoot, "scripts", "train_local.py");
  }

  private parseProgressFromLine(
    currentProgress: number,
    line: string,
  ): { progress: number; phase: string } {
    const normalized = line.toLowerCase();
    if (normalized.includes("loading real training data")) {
      return {
        progress: Math.max(currentProgress, 0.1),
        phase: "loading_data",
      };
    }
    if (
      normalized.includes("converted") &&
      normalized.includes("training samples")
    ) {
      return {
        progress: Math.max(currentProgress, 0.25),
        phase: "preparing_samples",
      };
    }
    if (normalized.includes("training with")) {
      return { progress: Math.max(currentProgress, 0.45), phase: "training" };
    }
    if (normalized.includes("training complete")) {
      return { progress: Math.max(currentProgress, 0.95), phase: "finalizing" };
    }
    if (normalized.includes("validating")) {
      return { progress: Math.max(currentProgress, 0.9), phase: "validating" };
    }
    return { progress: currentProgress, phase: "running" };
  }

  private parseModelPathFromLine(line: string): string | null {
    const match = line.match(/Model\/adapter saved to:\s*(.+)$/i);
    if (!match) return null;
    return match[1].trim();
  }

  private async appendLogLine(
    job: TrainingJobRecord,
    line: string,
  ): Promise<void> {
    if (line.trim().length === 0) return;
    job.logs.push(line);
    if (job.logs.length > MAX_STORED_JOB_LOG_LINES) {
      job.logs = job.logs.slice(job.logs.length - MAX_STORED_JOB_LOG_LINES);
    }
    await fs.appendFile(job.logPath, `${line}\n`, "utf-8");
  }

  private async handleJobOutput(jobId: string, text: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job || job.status !== "running") return;

    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trimEnd())
      .filter((line) => line.length > 0);

    for (const line of lines) {
      await this.appendLogLine(job, line);
      const parsedPath = this.parseModelPathFromLine(line);
      if (parsedPath) {
        job.modelPath = path.resolve(parsedPath);
        if (parsedPath.includes("adapter")) {
          job.adapterPath = path.resolve(parsedPath);
        }
      }
      const nextProgress = this.parseProgressFromLine(job.progress, line);
      if (
        nextProgress.progress > job.progress ||
        nextProgress.phase !== job.phase
      ) {
        job.progress = nextProgress.progress;
        job.phase = nextProgress.phase;
        this.emit({
          kind: "job_progress",
          ts: Date.now(),
          message: `Job ${job.id} ${job.phase}`,
          jobId: job.id,
          progress: job.progress,
          phase: job.phase,
        });
      }

      this.emit({
        kind: "job_log",
        ts: Date.now(),
        message: line,
        jobId: job.id,
      });
    }
    this.jobs.set(job.id, job);
    await this.saveState();
  }

  private async registerModelFromJob(job: TrainingJobRecord): Promise<string> {
    const modelId = `model-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
    const resolvedModelPath = job.modelPath ?? job.outputDir;
    const modelRecord: TrainingModelRecord = {
      id: modelId,
      createdAt: new Date().toISOString(),
      jobId: job.id,
      outputDir: job.outputDir,
      modelPath: resolvedModelPath,
      adapterPath: job.adapterPath,
      sourceModel: job.options.model ?? null,
      backend: job.options.backend ?? "cpu",
      ollamaModel: null,
      active: false,
      benchmark: {
        status: "not_run",
        lastRunAt: null,
        output: null,
      },
    };
    this.models.set(modelId, modelRecord);
    await this.saveState();
    return modelId;
  }

  private async handleJobExit(
    jobId: string,
    exitCode: number | null,
    signal: string | null,
  ): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) return;

    this.processes.delete(jobId);
    job.exitCode = exitCode;
    job.signal = signal;
    job.completedAt = new Date().toISOString();

    if (job.status === "cancelled") {
      await this.saveState();
      this.emit({
        kind: "job_cancelled",
        ts: Date.now(),
        message: `Job ${job.id} cancelled`,
        jobId: job.id,
      });
      return;
    }

    if (exitCode === 0) {
      job.status = "completed";
      job.progress = 1;
      job.phase = "completed";
      const modelId = await this.registerModelFromJob(job);
      job.modelId = modelId;
      this.jobs.set(job.id, job);
      await this.saveState();
      this.emit({
        kind: "job_completed",
        ts: Date.now(),
        message: `Job ${job.id} completed`,
        jobId: job.id,
        modelId,
        progress: 1,
        phase: "completed",
      });
      return;
    }

    job.status = "failed";
    job.phase = "failed";
    job.error = `Training process exited with code ${String(exitCode)}${signal ? ` (signal ${signal})` : ""}`;
    this.jobs.set(job.id, job);
    await this.saveState();
    this.emit({
      kind: "job_failed",
      ts: Date.now(),
      message: job.error,
      jobId: job.id,
      progress: job.progress,
      phase: "failed",
    });
  }

  async startTrainingJob(
    options: StartTrainingOptions = {},
  ): Promise<TrainingJobRecord> {
    await this.initialize();
    const runningJob = Array.from(this.jobs.values()).find(
      (job) => job.status === "running" || job.status === "queued",
    );
    if (runningJob) {
      throw new Error(`A training job is already running (${runningJob.id})`);
    }

    let datasetId = options.datasetId;
    if (!datasetId) {
      const built = await this.buildDataset({
        limit: options.maxTrajectories ?? 250,
      });
      datasetId = built.id;
    }

    const dataset = this.datasets.get(datasetId);
    if (!dataset) {
      throw new Error(`Dataset ${datasetId} not found`);
    }

    const pythonRoot = this.resolvePythonRoot();
    const scriptPath = this.resolveTrainingScript(pythonRoot);
    if (!existsSync(scriptPath)) {
      throw new Error(
        `Training script not found at ${scriptPath}. Set MILAIDY_TRAINING_SCRIPT to override.`,
      );
    }

    const outputDir = path.join(this.modelsDir, `job-${Date.now()}`);
    await fs.mkdir(outputDir, { recursive: true });

    const logPath = path.join(this.jobsDir, `job-${Date.now()}.log`);
    const jobId = `job-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
    const job: TrainingJobRecord = {
      id: jobId,
      createdAt: new Date().toISOString(),
      startedAt: new Date().toISOString(),
      completedAt: null,
      status: "running",
      phase: "starting",
      progress: 0.02,
      error: null,
      exitCode: null,
      signal: null,
      options,
      datasetId: dataset.id,
      pythonRoot,
      scriptPath,
      outputDir,
      logPath,
      modelPath: null,
      adapterPath: null,
      modelId: null,
      logs: [],
    };
    this.jobs.set(job.id, job);
    await this.saveState();

    const args: string[] = [
      scriptPath,
      "--source-dir",
      dataset.trajectoryDir,
      "--output",
      outputDir,
      "--backend",
      options.backend ?? "cpu",
      "--validate",
      "false",
    ];
    if (options.model && options.model.trim().length > 0) {
      args.push("--model", options.model.trim());
    }
    if (options.iterations && options.iterations > 0) {
      args.push("--iters", String(options.iterations));
    }
    if (options.batchSize && options.batchSize > 0) {
      args.push("--batch-size", String(options.batchSize));
    }
    if (options.learningRate && options.learningRate > 0) {
      args.push("--lr", String(options.learningRate));
    }

    const pythonExecutable =
      process.env.MILAIDY_TRAINING_PYTHON_EXECUTABLE?.trim() || "python3";
    const processHandle = spawn(pythonExecutable, args, {
      cwd: pythonRoot,
      env: process.env,
      stdio: "pipe",
    });
    this.processes.set(job.id, processHandle);

    processHandle.stdout.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf-8");
      void this.handleJobOutput(job.id, text);
    });
    processHandle.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf-8");
      void this.handleJobOutput(job.id, text);
    });
    processHandle.on("close", (code: number | null, signal: string | null) => {
      void this.handleJobExit(job.id, code, signal);
    });
    processHandle.on("error", (err: Error) => {
      const active = this.jobs.get(job.id);
      if (!active) return;
      active.status = "failed";
      active.phase = "failed";
      active.error = err.message;
      active.completedAt = new Date().toISOString();
      this.jobs.set(active.id, active);
      void this.saveState();
      this.emit({
        kind: "job_failed",
        ts: Date.now(),
        message: err.message,
        jobId: active.id,
        phase: active.phase,
      });
    });

    this.emit({
      kind: "job_started",
      ts: Date.now(),
      message: `Training job ${job.id} started`,
      jobId: job.id,
      progress: job.progress,
      phase: job.phase,
      datasetId: dataset.id,
    });

    logger.info(
      `[training-service] started job ${job.id} datasetId=${dataset.id} outputDir=${outputDir} backend=${options.backend ?? "cpu"}`,
    );

    return job;
  }

  listJobs(): TrainingJobRecord[] {
    return Array.from(this.jobs.values()).sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );
  }

  getJob(jobId: string): TrainingJobRecord | null {
    return this.jobs.get(jobId) ?? null;
  }

  async cancelJob(jobId: string): Promise<TrainingJobRecord> {
    await this.initialize();
    const job = this.jobs.get(jobId);
    if (!job) throw new Error(`Job ${jobId} not found`);
    if (job.status !== "running" && job.status !== "queued") return job;

    const processHandle = this.processes.get(job.id);
    if (processHandle) {
      processHandle.kill("SIGTERM");
      this.processes.delete(job.id);
    }
    job.status = "cancelled";
    job.phase = "cancelled";
    job.completedAt = new Date().toISOString();
    this.jobs.set(job.id, job);
    await this.saveState();
    this.emit({
      kind: "job_cancelled",
      ts: Date.now(),
      message: `Training job ${job.id} cancelled`,
      jobId: job.id,
      phase: "cancelled",
    });
    return job;
  }

  listModels(): TrainingModelRecord[] {
    return Array.from(this.models.values()).sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );
  }

  getModel(modelId: string): TrainingModelRecord | null {
    return this.models.get(modelId) ?? null;
  }

  async importModelToOllama(
    modelId: string,
    options?: {
      modelName?: string;
      baseModel?: string;
      ollamaUrl?: string;
    },
  ): Promise<TrainingModelRecord> {
    await this.initialize();
    const model = this.models.get(modelId);
    if (!model) throw new Error(`Model ${modelId} not found`);
    if (!model.adapterPath) {
      throw new Error(
        "Model has no adapter path. Local Ollama import currently requires a LoRA adapter output.",
      );
    }

    const config = this.getConfig();
    const baseModel =
      options?.baseModel?.trim() ||
      model.sourceModel ||
      config.models?.large ||
      "qwen2.5:7b-instruct";
    const ollamaModelName =
      options?.modelName?.trim() ||
      `milaidy-ft-${model.id.slice(Math.max(0, model.id.length - 8))}`;
    const ollamaUrl = options?.ollamaUrl?.trim() || "http://localhost:11434";
    const modelfile = `FROM ${baseModel}\nADAPTER ${model.adapterPath}\nPARAMETER temperature 0.2\n`;

    const response = await fetch(`${ollamaUrl}/api/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: ollamaModelName,
        modelfile,
        stream: false,
      }),
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Ollama create failed (${response.status}): ${errorText.slice(0, 400)}`,
      );
    }

    model.ollamaModel = ollamaModelName;
    this.models.set(model.id, model);
    await this.saveState();
    this.emit({
      kind: "model_imported",
      ts: Date.now(),
      message: `Model ${model.id} imported to Ollama as ${ollamaModelName}`,
      modelId: model.id,
    });
    return model;
  }

  async activateModel(
    modelId: string,
    providerModel?: string,
  ): Promise<ActivateModelResult> {
    await this.initialize();
    const model = this.models.get(modelId);
    if (!model) throw new Error(`Model ${modelId} not found`);

    const configuredModel =
      providerModel?.trim() ||
      (model.ollamaModel ? `ollama/${model.ollamaModel}` : null);
    if (!configuredModel) {
      throw new Error(
        "No provider model value provided. Import to Ollama first or pass providerModel.",
      );
    }

    for (const entry of this.models.values()) {
      entry.active = entry.id === model.id;
      this.models.set(entry.id, entry);
    }

    const config = this.getConfig();
    const nextConfig: MilaidyConfig = {
      ...config,
      agents: {
        ...config.agents,
        defaults: {
          ...config.agents?.defaults,
          model: {
            ...(typeof config.agents?.defaults?.model === "object" &&
            config.agents?.defaults?.model !== null
              ? config.agents.defaults.model
              : {}),
            primary: configuredModel,
          },
        },
      },
      env: {
        ...(config.env ?? {}),
        ...(model.ollamaModel
          ? {
              OLLAMA_MODEL: model.ollamaModel,
              AGENT_LLM_PROVIDER: "ollama",
            }
          : {}),
      },
    };
    this.setConfig(nextConfig);
    await this.saveState();

    this.emit({
      kind: "model_activated",
      ts: Date.now(),
      message: `Model ${model.id} activated as ${configuredModel}`,
      modelId: model.id,
    });

    return {
      modelId: model.id,
      providerModel: configuredModel,
      needsRestart: true,
    };
  }

  async benchmarkModel(modelId: string): Promise<{
    status: "passed" | "failed";
    output: string;
  }> {
    await this.initialize();
    const model = this.models.get(modelId);
    if (!model) throw new Error(`Model ${modelId} not found`);
    if (!model.adapterPath) {
      throw new Error("Benchmark requires adapterPath from training output");
    }

    const pythonRoot = this.resolvePythonRoot();
    const benchmarkScript = path.join(
      pythonRoot,
      "scripts",
      "test_trained_model.py",
    );
    if (!existsSync(benchmarkScript)) {
      throw new Error(
        `Benchmark script not found at ${benchmarkScript}. Set MILAIDY_TRAINING_PYTHON_ROOT to override.`,
      );
    }

    const pythonExecutable =
      process.env.MILAIDY_TRAINING_PYTHON_EXECUTABLE?.trim() || "python3";
    const args = [
      benchmarkScript,
      "--adapter-path",
      model.adapterPath,
      "--validate",
    ];

    const output = await new Promise<string>((resolve, reject) => {
      const child = spawn(pythonExecutable, args, {
        cwd: pythonRoot,
        env: process.env,
        stdio: "pipe",
      });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString("utf-8");
      });
      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString("utf-8");
      });
      child.on("error", (err: Error) => reject(err));
      child.on("close", (code: number | null) => {
        const combined = `${stdout}\n${stderr}`.trim();
        if (code === 0) resolve(combined);
        else
          reject(
            new Error(
              combined || `Benchmark failed with exit code ${String(code)}`,
            ),
          );
      });
    });

    model.benchmark = {
      status: "passed",
      lastRunAt: new Date().toISOString(),
      output,
    };
    this.models.set(model.id, model);
    await this.saveState();
    return { status: "passed", output };
  }

  getStatus(): {
    runningJobs: number;
    queuedJobs: number;
    completedJobs: number;
    failedJobs: number;
    modelCount: number;
    datasetCount: number;
  } {
    const jobs = Array.from(this.jobs.values());
    return {
      runningJobs: jobs.filter((job) => job.status === "running").length,
      queuedJobs: jobs.filter((job) => job.status === "queued").length,
      completedJobs: jobs.filter((job) => job.status === "completed").length,
      failedJobs: jobs.filter((job) => job.status === "failed").length,
      modelCount: this.models.size,
      datasetCount: this.datasets.size,
    };
  }
}
