import fs from "node:fs";
import http from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AgentRuntime } from "@elizaos/core";

// Re-export the full upstream server API.
export * from "@elizaos/autonomous/api/server";

// Override the wallet export rejection function with the hardened version
// that adds rate limiting, audit logging, and a forced confirmation delay.
import {
  ensureApiTokenForBindHost as upstreamEnsureApiTokenForBindHost,
  injectApiBaseIntoHtml as upstreamInjectApiBaseIntoHtml,
  isSafeResetStateDir as upstreamIsSafeResetStateDir,
  resolveCorsOrigin as upstreamResolveCorsOrigin,
  resolveMcpTerminalAuthorizationRejection as upstreamResolveMcpTerminalAuthorizationRejection,
  resolveTerminalRunClientId as upstreamResolveTerminalRunClientId,
  resolveTerminalRunRejection as upstreamResolveTerminalRunRejection,
  resolveWalletExportRejection as upstreamResolveWalletExportRejection,
  resolveWebSocketUpgradeRejection as upstreamResolveWebSocketUpgradeRejection,
  startApiServer as upstreamStartApiServer,
} from "@elizaos/autonomous/api/server";
import { loadElizaConfig, saveElizaConfig } from "../config/config";
import { ensureRuntimeSqlCompatibility } from "../utils/sql-compat";
import { handleCloudRoute } from "./cloud-routes";
import { handleCloudStatusRoutes } from "./cloud-status-routes";
import {
  type WalletExportRejection as CompatWalletExportRejection,
  createHardenedExportGuard,
} from "./wallet-export-guard";

const hardenedGuard = createHardenedExportGuard(
  resolveCompatWalletExportRejection,
);
const require = createRequire(import.meta.url);

const BRAND_ENV_ALIASES = [
  ["MILADY_API_TOKEN", "ELIZA_API_TOKEN"],
  ["MILADY_API_BIND", "ELIZA_API_BIND"],
  ["MILADY_PAIRING_DISABLED", "ELIZA_PAIRING_DISABLED"],
  ["MILADY_ALLOWED_ORIGINS", "ELIZA_ALLOWED_ORIGINS"],
  ["MILADY_ALLOW_NULL_ORIGIN", "ELIZA_ALLOW_NULL_ORIGIN"],
  ["MILADY_ALLOW_WS_QUERY_TOKEN", "ELIZA_ALLOW_WS_QUERY_TOKEN"],
  ["MILADY_WALLET_EXPORT_TOKEN", "ELIZA_WALLET_EXPORT_TOKEN"],
  ["MILADY_TERMINAL_RUN_TOKEN", "ELIZA_TERMINAL_RUN_TOKEN"],
  ["MILADY_USE_PI_AI", "ELIZA_USE_PI_AI"],
  ["MILADY_STATE_DIR", "ELIZA_STATE_DIR"],
  ["MILADY_CONFIG_PATH", "ELIZA_CONFIG_PATH"],
] as const;

const HEADER_ALIASES = [
  ["x-milady-token", "x-eliza-token"],
  ["x-milady-export-token", "x-eliza-export-token"],
  ["x-milady-client-id", "x-eliza-client-id"],
  ["x-milady-terminal-token", "x-eliza-terminal-token"],
  ["x-milady-ui-language", "x-eliza-ui-language"],
  ["x-milady-agent-action", "x-eliza-agent-action"],
] as const;

const PACKAGE_ROOT_NAMES = new Set([
  "milady",
  "miladyai",
  "eliza",
  "elizaai",
  "elizaos",
]);
const miladyMirroredEnvKeys = new Set<string>();
const elizaMirroredEnvKeys = new Set<string>();

type PluginCategory =
  | "ai-provider"
  | "connector"
  | "streaming"
  | "database"
  | "app"
  | "feature";

interface CompatRuntimeState {
  current: AgentRuntime | null;
}

interface ManifestPluginParameter {
  type?: string;
  description?: string;
  required?: boolean;
  sensitive?: boolean;
  default?: string | number | boolean;
  options?: string[];
}

interface ManifestPluginEntry {
  id: string;
  dirName?: string;
  name?: string;
  npmName?: string;
  description?: string;
  tags?: string[];
  category?: string;
  envKey?: string;
  configKeys?: string[];
  version?: string;
  pluginDeps?: string[];
  pluginParameters?: Record<string, ManifestPluginParameter>;
  configUiHints?: Record<string, Record<string, unknown>>;
  icon?: string | null;
  logoUrl?: string | null;
  homepage?: string;
  repository?: string;
  setupGuideUrl?: string;
}

interface PluginManifestFile {
  plugins?: ManifestPluginEntry[];
}

interface RuntimePluginLike {
  name?: string;
  description?: string;
}

interface CompatPluginParameter {
  key: string;
  type: string;
  description: string;
  required: boolean;
  sensitive: boolean;
  default?: string;
  options?: string[];
  currentValue: string | null;
  isSet: boolean;
}

interface CompatPluginRecord {
  id: string;
  name?: string;
  description?: string;
  enabled?: boolean;
  configured?: boolean;
  envKey?: string | null;
  category?: PluginCategory;
  source?: string;
  parameters: CompatPluginParameter[];
  validationErrors: Array<{ field: string; message: string }>;
  validationWarnings?: Array<{ field?: string; message: string }>;
  npmName?: string;
  version?: string;
  isActive?: boolean;
}

const DATABASE_UNAVAILABLE_MESSAGE =
  "Database not available. The agent may not be running or the database adapter is not initialized.";

const CAPABILITY_FEATURE_IDS = new Set([
  "vision",
  "browser",
  "computeruse",
  "coding-agent",
]);

function syncMiladyEnvToEliza(): void {
  for (const [miladyKey, elizaKey] of BRAND_ENV_ALIASES) {
    const value = process.env[miladyKey];
    if (typeof value === "string") {
      process.env[elizaKey] = value;
      elizaMirroredEnvKeys.add(elizaKey);
    } else if (elizaMirroredEnvKeys.has(elizaKey)) {
      delete process.env[elizaKey];
      elizaMirroredEnvKeys.delete(elizaKey);
    }
  }
}

function syncElizaEnvToMilady(): void {
  for (const [miladyKey, elizaKey] of BRAND_ENV_ALIASES) {
    const value = process.env[elizaKey];
    if (typeof value === "string") {
      process.env[miladyKey] = value;
      miladyMirroredEnvKeys.add(miladyKey);
    } else if (miladyMirroredEnvKeys.has(miladyKey)) {
      delete process.env[miladyKey];
      miladyMirroredEnvKeys.delete(miladyKey);
    }
  }
}

function mirrorCompatHeaders(req: Pick<http.IncomingMessage, "headers">): void {
  for (const [miladyHeader, elizaHeader] of HEADER_ALIASES) {
    const miladyValue = req.headers[miladyHeader];
    const elizaValue = req.headers[elizaHeader];

    if (miladyValue != null && elizaValue == null) {
      req.headers[elizaHeader] = miladyValue;
    }

    if (elizaValue != null && miladyValue == null) {
      req.headers[miladyHeader] = elizaValue;
    }
  }
}

function normalizeCompatReason(reason: string): string {
  return reason
    .replaceAll("MILADY_WALLET_EXPORT_TOKEN", "ELIZA_WALLET_EXPORT_TOKEN")
    .replaceAll("MILADY_TERMINAL_RUN_TOKEN", "ELIZA_TERMINAL_RUN_TOKEN")
    .replaceAll("X-Milady-Export-Token", "X-Eliza-Export-Token")
    .replaceAll("X-Milady-Terminal-Token", "X-Eliza-Terminal-Token");
}

function normalizeCompatRejection(
  rejection: { status: number; reason: string } | null,
): { status: number; reason: string } | null {
  if (!rejection) {
    return rejection;
  }

  return {
    ...rejection,
    reason: normalizeCompatReason(rejection.reason),
  };
}

function runWithCompatAuthContext<T>(
  req: Pick<http.IncomingMessage, "headers">,
  operation: () => T,
): T {
  syncElizaEnvToMilady();
  syncMiladyEnvToEliza();
  mirrorCompatHeaders(req);

  try {
    return operation();
  } finally {
    syncMiladyEnvToEliza();
    syncElizaEnvToMilady();
  }
}

function resolveCompatWalletExportRejection(
  ...args: Parameters<typeof upstreamResolveWalletExportRejection>
): { status: number; reason: string } | null {
  const [req] = args;
  return runWithCompatAuthContext(req, () =>
    normalizeCompatRejection(upstreamResolveWalletExportRejection(...args)),
  );
}

function extractHeaderValue(
  value: string | string[] | undefined,
): string | null {
  if (typeof value === "string") {
    return value;
  }
  return Array.isArray(value) && typeof value[0] === "string" ? value[0] : null;
}

function getCompatApiToken(): string | null {
  const token =
    process.env.ELIZA_API_TOKEN?.trim() ?? process.env.MILADY_API_TOKEN?.trim();
  return token ? token : null;
}

function getProvidedApiToken(
  req: Pick<http.IncomingMessage, "headers">,
): string | null {
  const authHeader = extractHeaderValue(req.headers.authorization);
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice("Bearer ".length).trim();
  }

  return (
    extractHeaderValue(req.headers["x-eliza-token"]) ??
    extractHeaderValue(req.headers["x-milady-token"])
  );
}

function ensureCompatApiAuthorized(
  req: Pick<http.IncomingMessage, "headers">,
  res: http.ServerResponse,
): boolean {
  const expectedToken = getCompatApiToken();
  if (!expectedToken) {
    return true;
  }

  if (getProvidedApiToken(req) === expectedToken) {
    return true;
  }

  sendJsonErrorResponse(res, 401, "Unauthorized");
  return false;
}

async function readCompatJsonBody(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<Record<string, unknown> | null> {
  const chunks: Buffer[] = [];

  try {
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
  } catch {
    sendJsonErrorResponse(res, 400, "Invalid request body");
    return null;
  }

  if (chunks.length === 0) {
    return {};
  }

  try {
    const parsed = JSON.parse(
      Buffer.concat(chunks).toString("utf8"),
    ) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      sendJsonErrorResponse(res, 400, "Invalid JSON body");
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    sendJsonErrorResponse(res, 400, "Invalid JSON body");
    return null;
  }
}

function resolveCompatConfigPaths(): {
  elizaConfigPath?: string;
  miladyConfigPath?: string;
} {
  const sharedStateDir =
    process.env.MILADY_STATE_DIR?.trim() || process.env.ELIZA_STATE_DIR?.trim();
  const miladyConfigPath =
    process.env.MILADY_CONFIG_PATH?.trim() ||
    (sharedStateDir ? path.join(sharedStateDir, "milady.json") : undefined);
  const elizaConfigPath =
    process.env.ELIZA_CONFIG_PATH?.trim() ||
    (sharedStateDir ? path.join(sharedStateDir, "eliza.json") : undefined);

  return { elizaConfigPath, miladyConfigPath };
}

function syncCompatConfigFiles(): void {
  const { elizaConfigPath, miladyConfigPath } = resolveCompatConfigPaths();
  if (
    !elizaConfigPath ||
    !miladyConfigPath ||
    elizaConfigPath === miladyConfigPath
  ) {
    return;
  }

  const sourcePath = fs.existsSync(elizaConfigPath)
    ? elizaConfigPath
    : fs.existsSync(miladyConfigPath)
      ? miladyConfigPath
      : undefined;

  if (!sourcePath) {
    return;
  }

  const targetPath =
    sourcePath === elizaConfigPath ? miladyConfigPath : elizaConfigPath;
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.copyFileSync(sourcePath, targetPath);
}

function maskValue(value: string): string {
  if (value.length <= 8) return "****";
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

function sanitizeIdentifier(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const sanitized = trimmed.replace(/[^a-zA-Z0-9_]/g, "");
  return sanitized.length > 0 ? sanitized : null;
}

function sqlLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function sendJsonResponse(
  res: http.ServerResponse,
  status: number,
  body: unknown,
): void {
  if (res.headersSent) return;
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function sendJsonErrorResponse(
  res: http.ServerResponse,
  status: number,
  message: string,
): void {
  sendJsonResponse(res, status, { error: message });
}

const WORKBENCH_TODO_TAG = "workbench-todo";

type WorkbenchTodoResponse = {
  id: string;
  name: string;
  description: string;
  priority: number | null;
  isUrgent: boolean;
  isCompleted: boolean;
  type: string;
};

function asCompatObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function readCompatTaskMetadata(
  task: Record<string, unknown>,
): Record<string, unknown> {
  return asCompatObject(task.metadata) ?? {};
}

function normalizeCompatStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function parseCompatNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? null : parsed;
  }

  return null;
}

function readCompatTaskCompleted(task: Record<string, unknown>): boolean {
  const metadata = readCompatTaskMetadata(task);

  if (typeof metadata.isCompleted === "boolean") {
    return metadata.isCompleted;
  }

  const todoMeta =
    asCompatObject(metadata.workbenchTodo) ?? asCompatObject(metadata.todo);
  if (todoMeta && typeof todoMeta.isCompleted === "boolean") {
    return todoMeta.isCompleted;
  }

  return false;
}

function normalizeCompatTodoTags(value: unknown, defaults: string[]): string[] {
  const tags = new Set(
    defaults.map((entry) => entry.trim()).filter((entry) => entry.length > 0),
  );

  for (const tag of normalizeCompatStringArray(value)) {
    tags.add(tag);
  }

  return [...tags];
}

function toTaskBackedWorkbenchTodo(
  task: Record<string, unknown> | null | undefined,
): WorkbenchTodoResponse | null {
  if (!task) {
    return null;
  }

  const id =
    typeof task.id === "string" && task.id.trim().length > 0 ? task.id : null;
  if (!id) {
    return null;
  }

  const tags = new Set(normalizeCompatStringArray(task.tags));
  const metadata = readCompatTaskMetadata(task);
  const todoMeta =
    asCompatObject(metadata.workbenchTodo) ?? asCompatObject(metadata.todo);

  if (!tags.has(WORKBENCH_TODO_TAG) && !tags.has("todo") && !todoMeta) {
    return null;
  }

  const name =
    typeof task.name === "string" && task.name.trim().length > 0
      ? task.name
      : "Todo";

  return {
    id,
    name,
    description:
      typeof todoMeta?.description === "string"
        ? todoMeta.description
        : typeof task.description === "string"
          ? task.description
          : "",
    priority: parseCompatNullableNumber(todoMeta?.priority),
    isUrgent: todoMeta?.isUrgent === true,
    isCompleted: readCompatTaskCompleted(task),
    type:
      typeof todoMeta?.type === "string" && todoMeta.type.trim().length > 0
        ? todoMeta.type
        : "task",
  };
}

function runtimeHasTodoDatabase(runtime: AgentRuntime | null): boolean {
  const db = (runtime as { db?: unknown } | null)?.db;
  return !!db && typeof db === "object";
}

function decodeCompatTodoId(
  rawValue: string,
  res: http.ServerResponse,
): string | null {
  try {
    const decoded = decodeURIComponent(rawValue);
    if (decoded.trim().length === 0) {
      sendJsonErrorResponse(res, 400, "Invalid todo id");
      return null;
    }
    return decoded;
  } catch {
    sendJsonErrorResponse(res, 400, "Invalid todo id");
    return null;
  }
}

async function handleTaskBackedWorkbenchTodoRoute(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  runtime: AgentRuntime | null,
  pathname: string,
  method: string,
): Promise<boolean> {
  if (!runtime) {
    return false;
  }

  if (
    pathname !== "/api/workbench/todos" &&
    !pathname.startsWith("/api/workbench/todos/")
  ) {
    return false;
  }

  if (!ensureCompatApiAuthorized(req, res)) {
    return true;
  }

  const getTaskList = async () =>
    (
      (await runtime.getTasks({})) as unknown as Array<Record<string, unknown>>
    ).map((task) => task as Record<string, unknown>);

  if (method === "GET" && pathname === "/api/workbench/todos") {
    const todos = (await getTaskList())
      .map((task) => toTaskBackedWorkbenchTodo(task))
      .filter((todo): todo is WorkbenchTodoResponse => todo !== null)
      .sort((left, right) => left.name.localeCompare(right.name));

    sendJsonResponse(res, 200, { todos });
    return true;
  }

  if (method === "POST" && pathname === "/api/workbench/todos") {
    const body = await readCompatJsonBody(req, res);
    if (body == null) {
      return true;
    }

    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) {
      sendJsonErrorResponse(res, 400, "name is required");
      return true;
    }

    const description =
      typeof body.description === "string" ? body.description : "";
    const type =
      typeof body.type === "string" && body.type.trim().length > 0
        ? body.type.trim()
        : "task";

    const taskId = await runtime.createTask({
      name,
      description,
      tags: normalizeCompatTodoTags(body.tags, [WORKBENCH_TODO_TAG, "todo"]),
      metadata: {
        isCompleted: false,
        workbenchTodo: {
          description,
          priority: parseCompatNullableNumber(body.priority),
          isUrgent: body.isUrgent === true,
          isCompleted: false,
          type,
        },
      },
    });

    const created = await runtime.getTask(taskId);
    const todo = toTaskBackedWorkbenchTodo(
      created as Record<string, unknown> | null,
    );
    if (!todo) {
      sendJsonErrorResponse(res, 500, "Todo created but unavailable");
      return true;
    }

    sendJsonResponse(res, 201, { todo });
    return true;
  }

  const todoCompleteMatch = /^\/api\/workbench\/todos\/([^/]+)\/complete$/.exec(
    pathname,
  );
  if (method === "POST" && todoCompleteMatch) {
    const todoId = decodeCompatTodoId(todoCompleteMatch[1], res);
    if (!todoId) {
      return true;
    }

    const body = await readCompatJsonBody(req, res);
    if (body == null) {
      return true;
    }

    const todoTask = (await runtime.getTask(todoId)) as Record<
      string,
      unknown
    > | null;
    const todo = toTaskBackedWorkbenchTodo(todoTask);
    if (!todoTask || !todo) {
      sendJsonErrorResponse(res, 404, "Todo not found");
      return true;
    }

    const metadata = readCompatTaskMetadata(todoTask);
    const todoMeta =
      asCompatObject(metadata.workbenchTodo) ?? asCompatObject(metadata.todo);
    const isCompleted = body.isCompleted === true;

    await runtime.updateTask(todoId, {
      metadata: {
        ...metadata,
        isCompleted,
        workbenchTodo: {
          ...(todoMeta ?? {}),
          isCompleted,
        },
      },
    });

    sendJsonResponse(res, 200, { ok: true });
    return true;
  }

  const todoItemMatch = /^\/api\/workbench\/todos\/([^/]+)$/.exec(pathname);
  if (!todoItemMatch) {
    return false;
  }

  const todoId = decodeCompatTodoId(todoItemMatch[1], res);
  if (!todoId) {
    return true;
  }

  if (method === "GET") {
    const todoTask = (await runtime.getTask(todoId)) as Record<
      string,
      unknown
    > | null;
    const todo = toTaskBackedWorkbenchTodo(todoTask);
    if (!todoTask || !todo) {
      sendJsonErrorResponse(res, 404, "Todo not found");
      return true;
    }

    sendJsonResponse(res, 200, { todo });
    return true;
  }

  if (method === "DELETE") {
    const todoTask = (await runtime.getTask(todoId)) as Record<
      string,
      unknown
    > | null;
    if (!todoTask || !toTaskBackedWorkbenchTodo(todoTask)) {
      sendJsonErrorResponse(res, 404, "Todo not found");
      return true;
    }

    await runtime.deleteTask(todoId);
    sendJsonResponse(res, 200, { ok: true });
    return true;
  }

  if (method === "PUT") {
    const body = await readCompatJsonBody(req, res);
    if (body == null) {
      return true;
    }

    const todoTask = (await runtime.getTask(todoId)) as Record<
      string,
      unknown
    > | null;
    const existingTodo = toTaskBackedWorkbenchTodo(todoTask);
    if (!todoTask || !existingTodo) {
      sendJsonErrorResponse(res, 404, "Todo not found");
      return true;
    }

    if (typeof body.name === "string" && body.name.trim().length === 0) {
      sendJsonErrorResponse(res, 400, "name cannot be empty");
      return true;
    }

    const metadata = readCompatTaskMetadata(todoTask);
    const todoMeta =
      asCompatObject(metadata.workbenchTodo) ?? asCompatObject(metadata.todo);
    const nextTodoMeta: Record<string, unknown> = {
      ...(todoMeta ?? {}),
    };
    const update: Record<string, unknown> = {};

    if (typeof body.name === "string") {
      update.name = body.name.trim();
    }
    if (typeof body.description === "string") {
      update.description = body.description;
      nextTodoMeta.description = body.description;
    }
    if (body.priority !== undefined) {
      nextTodoMeta.priority = parseCompatNullableNumber(body.priority);
    }
    if (typeof body.isUrgent === "boolean") {
      nextTodoMeta.isUrgent = body.isUrgent;
    }
    if (typeof body.type === "string" && body.type.trim().length > 0) {
      nextTodoMeta.type = body.type.trim();
    }
    if (body.tags !== undefined) {
      update.tags = normalizeCompatTodoTags(body.tags, [
        WORKBENCH_TODO_TAG,
        "todo",
      ]);
    }

    const isCompleted =
      typeof body.isCompleted === "boolean"
        ? body.isCompleted
        : existingTodo.isCompleted;
    nextTodoMeta.isCompleted = isCompleted;

    update.metadata = {
      ...metadata,
      isCompleted,
      workbenchTodo: nextTodoMeta,
    };

    await runtime.updateTask(todoId, update);

    const refreshed = await runtime.getTask(todoId);
    const todo = toTaskBackedWorkbenchTodo(
      refreshed as Record<string, unknown> | null,
    );
    if (!todo) {
      sendJsonErrorResponse(res, 500, "Todo updated but unavailable");
      return true;
    }

    sendJsonResponse(res, 200, { todo });
    return true;
  }

  return false;
}

async function executeRawSql(
  runtime: AgentRuntime,
  sqlText: string,
): Promise<{
  rows: Record<string, unknown>[];
  columns: string[];
}> {
  const db = runtime.adapter?.db as
    | {
        execute: (query: { queryChunks: unknown[] }) => Promise<{
          rows: Record<string, unknown>[];
          fields?: Array<{ name: string }>;
        }>;
      }
    | undefined;
  if (!db?.execute) {
    throw new Error("Database adapter not available");
  }

  const { sql } = await import("drizzle-orm");
  const result = await db.execute(sql.raw(sqlText));
  const rows = Array.isArray(result.rows) ? result.rows : [];
  const columns = Array.isArray(result.fields)
    ? result.fields.map((field) => field.name)
    : Object.keys(rows[0] ?? {});

  return { rows, columns };
}

async function _getTableColumnNames(
  runtime: AgentRuntime,
  tableName: string,
  schemaName = "public",
): Promise<Set<string>> {
  const columns = new Set<string>();

  try {
    const { rows } = await executeRawSql(
      runtime,
      `SELECT column_name
         FROM information_schema.columns
        WHERE table_schema = ${sqlLiteral(schemaName)}
          AND table_name = ${sqlLiteral(tableName)}
        ORDER BY ordinal_position`,
    );

    for (const row of rows) {
      const value = row.column_name;
      if (typeof value === "string" && value.length > 0) {
        columns.add(value);
      }
    }
  } catch {
    // Fall through to PRAGMA for PGlite/SQLite compatibility.
  }

  if (columns.size > 0) {
    return columns;
  }

  try {
    const { rows } = await executeRawSql(
      runtime,
      `PRAGMA table_info(${sanitizeIdentifier(tableName)})`,
    );
    for (const row of rows) {
      const value = row.name;
      if (typeof value === "string" && value.length > 0) {
        columns.add(value);
      }
    }
  } catch {
    // Ignore missing-table/missing-pragma support.
  }

  return columns;
}

function normalizePluginCategory(value: string | undefined): PluginCategory {
  switch (value) {
    case "ai-provider":
    case "connector":
    case "streaming":
    case "database":
    case "app":
      return value;
    default:
      return "feature";
  }
}

function normalizePluginId(rawName: string): string {
  return rawName
    .replace(/^@[^/]+\/plugin-/, "")
    .replace(/^@[^/]+\/app-/, "")
    .replace(/^@[^/]+\//, "")
    .replace(/^(plugin|app)-/, "");
}

function titleCasePluginId(id: string): string {
  return id
    .split("-")
    .filter((segment) => segment.length > 0)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function buildPluginParamDefs(
  parameters: Record<string, ManifestPluginParameter> | undefined,
): Array<{
  key: string;
  type: string;
  description: string;
  required: boolean;
  sensitive: boolean;
  default?: string;
  options?: string[];
  currentValue: string | null;
  isSet: boolean;
}> {
  if (!parameters) {
    return [];
  }

  return Object.entries(parameters).map(([key, definition]) => {
    const rawValue = process.env[key];
    const isSet = Boolean(rawValue?.trim());
    const sensitive = Boolean(definition.sensitive);

    return {
      key,
      type: definition.type ?? "string",
      description: definition.description ?? "",
      required: Boolean(definition.required),
      sensitive,
      default:
        definition.default === undefined
          ? undefined
          : String(definition.default),
      options: Array.isArray(definition.options)
        ? definition.options
        : undefined,
      currentValue: isSet
        ? sensitive
          ? maskValue(rawValue ?? "")
          : (rawValue ?? "")
        : null,
      isSet,
    };
  });
}

function findNearestFile(
  startDir: string,
  fileName: string,
  maxDepth = 12,
): string | null {
  let dir = path.resolve(startDir);

  for (let depth = 0; depth <= maxDepth; depth += 1) {
    const candidate = path.join(dir, fileName);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }

  return null;
}

function resolvePluginManifestPath(): string | null {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    process.cwd(),
    moduleDir,
    path.dirname(process.execPath),
    path.join(path.dirname(process.execPath), "..", "Resources", "app"),
  ];

  for (const candidate of candidates) {
    const manifestPath = findNearestFile(candidate, "plugins.json");
    if (manifestPath) {
      return manifestPath;
    }
  }

  return null;
}

function resolveInstalledPackageVersion(
  packageName: string | undefined,
): string | null {
  if (!packageName) {
    return null;
  }

  try {
    const packageJsonPath = require.resolve(`${packageName}/package.json`);
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as {
      version?: unknown;
    };
    return typeof pkg.version === "string" ? pkg.version : null;
  } catch {
    return null;
  }
}

function resolveLoadedPluginNames(runtime: AgentRuntime | null): Set<string> {
  const loadedNames = new Set<string>();

  for (const plugin of runtime?.plugins ?? []) {
    const name = (plugin as RuntimePluginLike).name;
    if (typeof name === "string" && name.length > 0) {
      loadedNames.add(name);
    }
  }

  return loadedNames;
}

function isPluginLoaded(
  pluginId: string,
  npmName: string | undefined,
  loadedNames: Set<string>,
): boolean {
  const expectedNames = new Set<string>([
    pluginId,
    `plugin-${pluginId}`,
    `app-${pluginId}`,
    npmName ?? "",
  ]);

  for (const loadedName of loadedNames) {
    if (expectedNames.has(loadedName)) {
      return true;
    }
    if (
      loadedName.endsWith(`/plugin-${pluginId}`) ||
      loadedName.endsWith(`/app-${pluginId}`) ||
      loadedName.includes(pluginId)
    ) {
      return true;
    }
  }

  return false;
}

function buildPluginListResponse(runtime: AgentRuntime | null): {
  plugins: Array<Record<string, unknown>>;
} {
  const config = loadElizaConfig();
  const loadedNames = resolveLoadedPluginNames(runtime);
  const manifestPath = resolvePluginManifestPath();
  const manifest = manifestPath
    ? (JSON.parse(fs.readFileSync(manifestPath, "utf8")) as PluginManifestFile)
    : null;

  const configEntries = config.plugins?.entries ?? {};
  const installEntries = config.plugins?.installs ?? {};
  const plugins = new Map<string, Record<string, unknown>>();

  for (const entry of manifest?.plugins ?? []) {
    const pluginId = normalizePluginId(entry.id);
    const parameters = buildPluginParamDefs(entry.pluginParameters);
    const enabled =
      typeof configEntries[pluginId]?.enabled === "boolean"
        ? Boolean(configEntries[pluginId]?.enabled)
        : isPluginLoaded(pluginId, entry.npmName, loadedNames);
    const validationErrors = parameters
      .filter((parameter) => parameter.required && !parameter.isSet)
      .map((parameter) => ({
        field: parameter.key,
        message: "Required value is not configured.",
      }));

    plugins.set(pluginId, {
      id: pluginId,
      name: entry.name ?? titleCasePluginId(pluginId),
      description: entry.description ?? "",
      tags: entry.tags ?? [],
      enabled,
      configured: validationErrors.length === 0,
      envKey: entry.envKey ?? null,
      category: normalizePluginCategory(entry.category),
      source: "bundled",
      parameters,
      validationErrors,
      validationWarnings: [],
      npmName: entry.npmName,
      version:
        resolveInstalledPackageVersion(entry.npmName) ??
        entry.version ??
        undefined,
      pluginDeps: entry.pluginDeps,
      isActive: isPluginLoaded(pluginId, entry.npmName, loadedNames),
      configUiHints: entry.configUiHints,
      icon: entry.logoUrl ?? entry.icon ?? null,
      homepage: entry.homepage,
      repository: entry.repository,
      setupGuideUrl: entry.setupGuideUrl,
    });
  }

  for (const plugin of runtime?.plugins ?? []) {
    const pluginName =
      typeof (plugin as RuntimePluginLike).name === "string"
        ? (plugin as RuntimePluginLike).name
        : "";
    if (!pluginName) {
      continue;
    }

    const pluginId = normalizePluginId(pluginName);
    const existing = plugins.get(pluginId);
    if (existing) {
      existing.isActive = true;
      if (
        existing.enabled !== true &&
        configEntries[pluginId]?.enabled == null
      ) {
        existing.enabled = true;
      }
      if (!existing.version) {
        existing.version =
          resolveInstalledPackageVersion(pluginName) ?? undefined;
      }
      continue;
    }

    plugins.set(pluginId, {
      id: pluginId,
      name: titleCasePluginId(pluginId),
      description:
        (plugin as RuntimePluginLike).description ??
        "Loaded runtime plugin discovered without manifest metadata.",
      tags: [],
      enabled:
        typeof configEntries[pluginId]?.enabled === "boolean"
          ? Boolean(configEntries[pluginId]?.enabled)
          : true,
      configured: true,
      envKey: null,
      category: "feature",
      source: "bundled",
      parameters: [],
      validationErrors: [],
      validationWarnings: [],
      npmName: pluginName,
      version: resolveInstalledPackageVersion(pluginName) ?? undefined,
      isActive: true,
      icon: null,
    });
  }

  for (const [pluginName, installRecord] of Object.entries(installEntries)) {
    const pluginId = normalizePluginId(pluginName);
    if (plugins.has(pluginId)) {
      continue;
    }

    plugins.set(pluginId, {
      id: pluginId,
      name: titleCasePluginId(pluginId),
      description: "Installed store plugin.",
      tags: [],
      enabled:
        typeof configEntries[pluginId]?.enabled === "boolean"
          ? Boolean(configEntries[pluginId]?.enabled)
          : false,
      configured: true,
      envKey: null,
      category: "feature",
      source: "store",
      parameters: [],
      validationErrors: [],
      validationWarnings: [],
      npmName: pluginName,
      version:
        typeof installRecord?.version === "string"
          ? installRecord.version
          : (resolveInstalledPackageVersion(pluginName) ?? undefined),
      isActive: isPluginLoaded(pluginId, pluginName, loadedNames),
      icon: null,
    });
  }

  const pluginList = Array.from(plugins.values()).sort((left, right) =>
    String(left.name ?? "").localeCompare(String(right.name ?? "")),
  );
  return { plugins: pluginList };
}

function validateCompatPluginConfig(
  plugin: CompatPluginRecord,
  config: Record<string, unknown>,
): {
  errors: Array<{ field: string; message: string }>;
  values: Record<string, string>;
} {
  const paramMap = new Map(
    plugin.parameters.map((parameter) => [parameter.key, parameter]),
  );
  const errors: Array<{ field: string; message: string }> = [];
  const values: Record<string, string> = {};

  for (const [key, rawValue] of Object.entries(config)) {
    const parameter = paramMap.get(key);
    if (!parameter) {
      errors.push({
        field: key,
        message: `${key} is not a declared config key for this plugin`,
      });
      continue;
    }

    if (typeof rawValue !== "string") {
      errors.push({
        field: key,
        message: "Plugin config values must be strings.",
      });
      continue;
    }

    const trimmed = rawValue.trim();
    if (parameter.required && trimmed.length === 0) {
      errors.push({
        field: key,
        message: "Required value is not configured.",
      });
      continue;
    }

    values[key] = rawValue;
  }

  return { errors, values };
}

function persistCompatPluginMutation(
  pluginId: string,
  body: Record<string, unknown>,
  plugin: CompatPluginRecord,
): {
  status: number;
  payload: Record<string, unknown>;
} {
  const config = loadElizaConfig();
  config.plugins ??= {};
  config.plugins.entries ??= {};
  config.plugins.entries[pluginId] ??= {};
  const pluginEntry = config.plugins.entries[pluginId] as Record<
    string,
    unknown
  >;

  if (typeof body.enabled === "boolean") {
    pluginEntry.enabled = body.enabled;

    if (CAPABILITY_FEATURE_IDS.has(pluginId)) {
      config.features ??= {};
      config.features[pluginId] = body.enabled;
    }
  }

  if (body.config !== undefined) {
    if (
      !body.config ||
      typeof body.config !== "object" ||
      Array.isArray(body.config)
    ) {
      return {
        status: 400,
        payload: { ok: false, error: "Plugin config must be a JSON object." },
      };
    }

    const configObject = body.config as Record<string, unknown>;
    const { errors, values } = validateCompatPluginConfig(plugin, configObject);
    if (errors.length > 0) {
      return {
        status: 422,
        payload: { ok: false, plugin, validationErrors: errors },
      };
    }

    const nextConfig =
      pluginEntry.config &&
      typeof pluginEntry.config === "object" &&
      !Array.isArray(pluginEntry.config)
        ? { ...(pluginEntry.config as Record<string, unknown>) }
        : {};

    config.env ??= {};
    for (const [key, value] of Object.entries(values)) {
      process.env[key] = value;
      config.env[key] = value;
      nextConfig[key] = value;
    }

    pluginEntry.config = nextConfig;
  }

  saveElizaConfig(config);

  const refreshed = (
    buildPluginListResponse(null).plugins as unknown as CompatPluginRecord[]
  ).find((candidate) => candidate.id === pluginId);

  return {
    status: 200,
    payload: {
      ok: true,
      plugin: refreshed ?? plugin,
    },
  };
}

async function handleDatabaseRowsCompatRoute(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  runtime: AgentRuntime | null,
  pathname: string,
): Promise<boolean> {
  const match = /^\/api\/database\/tables\/([^/]+)\/rows$/.exec(pathname);
  if ((req.method ?? "GET").toUpperCase() !== "GET" || !match) {
    return false;
  }

  if (!runtime) {
    sendJsonErrorResponse(res, 503, DATABASE_UNAVAILABLE_MESSAGE);
    return true;
  }

  const tableName = sanitizeIdentifier(decodeURIComponent(match[1]));
  const requestUrl = new URL(req.url ?? "/", "http://localhost");
  const schemaName = sanitizeIdentifier(requestUrl.searchParams.get("schema"));

  if (!tableName) {
    sendJsonErrorResponse(res, 400, "Invalid table name");
    return true;
  }

  let resolvedSchema = schemaName;

  if (!resolvedSchema) {
    const { rows } = await executeRawSql(
      runtime,
      `SELECT table_schema AS schema
         FROM information_schema.tables
        WHERE table_name = ${sqlLiteral(tableName)}
          AND table_schema NOT IN ('pg_catalog', 'information_schema')
          AND table_type = 'BASE TABLE'
        ORDER BY CASE WHEN table_schema = 'public' THEN 0 ELSE 1 END,
                 table_schema`,
    );

    const schemas = rows
      .map((row) => row.schema)
      .filter((value): value is string => typeof value === "string");

    if (schemas.length === 0) {
      sendJsonErrorResponse(res, 404, `Unknown table "${tableName}"`);
      return true;
    }

    if (schemas.length > 1 && !schemas.includes("public")) {
      sendJsonErrorResponse(
        res,
        409,
        `Table "${tableName}" exists in multiple schemas; specify ?schema=<name>.`,
      );
      return true;
    }

    resolvedSchema = schemas.includes("public") ? "public" : schemas[0];
  }

  const columnResult = await executeRawSql(
    runtime,
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_name = ${sqlLiteral(tableName)}
        AND table_schema = ${sqlLiteral(resolvedSchema)}
      ORDER BY ordinal_position`,
  );

  const columns = columnResult.rows
    .map((row) => row.column_name)
    .filter((value): value is string => typeof value === "string");

  if (columns.length === 0) {
    sendJsonErrorResponse(
      res,
      404,
      `No readable columns found for ${resolvedSchema}.${tableName}`,
    );
    return true;
  }

  const limit = Math.max(
    1,
    Math.min(
      500,
      Number.parseInt(requestUrl.searchParams.get("limit") ?? "", 10) || 50,
    ),
  );
  const offset = Math.max(
    0,
    Number.parseInt(requestUrl.searchParams.get("offset") ?? "", 10) || 0,
  );
  const sortColumn = sanitizeIdentifier(requestUrl.searchParams.get("sort"));
  const order =
    requestUrl.searchParams.get("order") === "desc" ? "DESC" : "ASC";
  const search = requestUrl.searchParams.get("search")?.trim();

  const filters: string[] = [];
  if (search) {
    const escapedSearch = search.replace(/'/g, "''");
    filters.push(
      `(${columns
        .map(
          (columnName) =>
            `CAST(${quoteIdent(columnName)} AS TEXT) ILIKE '%${escapedSearch}%'`,
        )
        .join(" OR ")})`,
    );
  }
  const whereClause =
    filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";

  const orderBy =
    sortColumn && columns.includes(sortColumn)
      ? `ORDER BY ${quoteIdent(sortColumn)} ${order}`
      : "";
  const qualifiedTable = `${quoteIdent(resolvedSchema)}.${quoteIdent(tableName)}`;

  const countResult = await executeRawSql(
    runtime,
    `SELECT count(*)::int AS total FROM ${qualifiedTable} ${whereClause}`,
  );
  const total =
    typeof countResult.rows[0]?.total === "number"
      ? countResult.rows[0].total
      : Number(countResult.rows[0]?.total ?? 0);

  const rowsResult = await executeRawSql(
    runtime,
    `SELECT * FROM ${qualifiedTable}
      ${whereClause}
      ${orderBy}
      LIMIT ${limit}
     OFFSET ${offset}`,
  );

  sendJsonResponse(res, 200, {
    table: tableName,
    schema: resolvedSchema,
    rows: rowsResult.rows,
    columns,
    total,
    offset,
    limit,
  });
  return true;
}

async function handleMiladyCompatRoute(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  state: CompatRuntimeState,
): Promise<boolean> {
  const method = (req.method ?? "GET").toUpperCase();
  const url = new URL(req.url ?? "/", "http://localhost");

  if (
    !runtimeHasTodoDatabase(state.current) &&
    (await handleTaskBackedWorkbenchTodoRoute(
      req,
      res,
      state.current,
      url.pathname,
      method,
    ))
  ) {
    return true;
  }

  const cloudConfigPath =
    url.pathname === "/api/cloud/status" ||
    url.pathname === "/api/cloud/credits" ||
    url.pathname === "/api/cloud/disconnect";

  if (cloudConfigPath) {
    if (!ensureCompatApiAuthorized(req, res)) {
      return true;
    }

    const config = loadElizaConfig();

    if (
      url.pathname === "/api/cloud/status" ||
      url.pathname === "/api/cloud/credits"
    ) {
      return handleCloudStatusRoutes({
        req,
        res,
        method,
        pathname: url.pathname,
        config,
        runtime: state.current,
        json: (_res, body, status = 200) => {
          sendJsonResponse(res, status, body);
        },
      });
    }

    return handleCloudRoute(req, res, url.pathname, method, {
      config,
      runtime: state.current,
      cloudManager: null,
    });
  }

  if (method === "GET" && url.pathname === "/api/plugins") {
    if (!ensureCompatApiAuthorized(req, res)) {
      return true;
    }

    sendJsonResponse(res, 200, buildPluginListResponse(state.current));
    return true;
  }

  if (method === "GET" && url.pathname === "/api/config") {
    if (!ensureCompatApiAuthorized(req, res)) {
      return true;
    }

    sendJsonResponse(res, 200, loadElizaConfig());
    return true;
  }

  if (method === "PUT" && url.pathname.startsWith("/api/plugins/")) {
    if (!ensureCompatApiAuthorized(req, res)) {
      return true;
    }

    const body = await readCompatJsonBody(req, res);
    if (body == null) {
      return true;
    }

    const pluginId = normalizePluginId(
      decodeURIComponent(url.pathname.slice("/api/plugins/".length)),
    );
    const plugin = (
      buildPluginListResponse(state.current)
        .plugins as unknown as CompatPluginRecord[]
    ).find((candidate) => candidate.id === pluginId);

    if (!plugin) {
      sendJsonErrorResponse(res, 404, `Plugin "${pluginId}" not found`);
      return true;
    }

    const result = persistCompatPluginMutation(pluginId, body, plugin);
    sendJsonResponse(res, result.status, result.payload);
    return true;
  }

  return handleDatabaseRowsCompatRoute(req, res, state.current, url.pathname);
}

function patchHttpCreateServerForMiladyCompat(
  state?: CompatRuntimeState,
): () => void {
  const originalCreateServer = http.createServer.bind(http);

  http.createServer = ((...args: Parameters<typeof originalCreateServer>) => {
    const [firstArg, secondArg] = args;
    const listener =
      typeof firstArg === "function"
        ? firstArg
        : typeof secondArg === "function"
          ? secondArg
          : undefined;

    if (!listener) {
      return originalCreateServer(...args);
    }

    const wrappedListener: http.RequestListener = async (req, res) => {
      syncMiladyEnvToEliza();
      syncElizaEnvToMilady();
      mirrorCompatHeaders(req);

      res.on("finish", () => {
        syncElizaEnvToMilady();
        syncCompatConfigFiles();
      });

      if (state) {
        const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
        if (
          pathname.startsWith("/api/database") ||
          pathname.startsWith("/api/trajectories")
        ) {
          await ensureRuntimeSqlCompatibility(state.current);
        }

        if (await handleMiladyCompatRoute(req, res, state)) {
          return;
        }
      }

      listener(req, res);
    };

    if (typeof firstArg === "function") {
      return originalCreateServer(wrappedListener);
    }

    return originalCreateServer(firstArg, wrappedListener);
  }) as typeof http.createServer;

  return () => {
    http.createServer = originalCreateServer as typeof http.createServer;
  };
}

/**
 * Hardened wallet export rejection function.
 *
 * Wraps the upstream token validation with per-IP rate limiting (1 per 10 min),
 * audit logging (IP + UA), and a 10s confirmation delay via single-use nonces.
 */
export function resolveWalletExportRejection(
  ...args: Parameters<typeof upstreamResolveWalletExportRejection>
): { status: number; reason: string } | null {
  return hardenedGuard(...args);
}

export function resolveMcpTerminalAuthorizationRejection(
  ...args: Parameters<typeof upstreamResolveMcpTerminalAuthorizationRejection>
): ReturnType<typeof upstreamResolveMcpTerminalAuthorizationRejection> {
  const [req] = args;
  return runWithCompatAuthContext(req, () =>
    normalizeCompatRejection(
      upstreamResolveMcpTerminalAuthorizationRejection(...args),
    ),
  );
}

export function resolveTerminalRunRejection(
  ...args: Parameters<typeof upstreamResolveTerminalRunRejection>
): { status: number; reason: string } | null {
  const [req] = args;
  return runWithCompatAuthContext(req, () =>
    normalizeCompatRejection(upstreamResolveTerminalRunRejection(...args)),
  );
}

export function resolveWebSocketUpgradeRejection(
  ...args: Parameters<typeof upstreamResolveWebSocketUpgradeRejection>
): ReturnType<typeof upstreamResolveWebSocketUpgradeRejection> {
  const [req] = args;
  return runWithCompatAuthContext(req, () =>
    upstreamResolveWebSocketUpgradeRejection(...args),
  );
}

export function resolveTerminalRunClientId(
  ...args: Parameters<typeof upstreamResolveTerminalRunClientId>
): ReturnType<typeof upstreamResolveTerminalRunClientId> {
  const [req] = args;
  return runWithCompatAuthContext(req, () =>
    upstreamResolveTerminalRunClientId(...args),
  );
}

export function injectApiBaseIntoHtml(
  ...args: Parameters<typeof upstreamInjectApiBaseIntoHtml>
): ReturnType<typeof upstreamInjectApiBaseIntoHtml> {
  const [, externalBase] = args;
  const trimmedBase = externalBase?.trim();
  const injected = upstreamInjectApiBaseIntoHtml(...args);

  if (!trimmedBase) {
    return injected;
  }

  const legacySnippet = `window.__MILADY_API_BASE__=${JSON.stringify(trimmedBase)};`;
  const compatSnippet = `${legacySnippet}window.__ELIZA_API_BASE__=${JSON.stringify(trimmedBase)};`;
  const text = injected.toString("utf8");

  if (text.includes("window.__ELIZA_API_BASE__")) {
    return injected;
  }

  if (!text.includes(legacySnippet)) {
    return injected;
  }

  return Buffer.from(text.replace(legacySnippet, compatSnippet), "utf8");
}

export function isSafeResetStateDir(
  ...args: Parameters<typeof upstreamIsSafeResetStateDir>
): ReturnType<typeof upstreamIsSafeResetStateDir> {
  if (upstreamIsSafeResetStateDir(...args)) {
    return true;
  }

  const [resolvedState, homeDir] = args;
  const normalizedState = path.resolve(resolvedState);
  const normalizedHome = path.resolve(homeDir);
  const parsedRoot = path.parse(normalizedState).root;

  if (normalizedState === parsedRoot || normalizedState === normalizedHome) {
    return false;
  }

  const relativeToHome = path.relative(normalizedHome, normalizedState);
  const isUnderHome =
    relativeToHome.length > 0 &&
    !relativeToHome.startsWith("..") &&
    !path.isAbsolute(relativeToHome);
  if (!isUnderHome) {
    return false;
  }

  return normalizedState
    .split(path.sep)
    .some((segment) => segment.trim().toLowerCase() === ".eliza");
}

export function findOwnPackageRoot(startDir: string): string {
  let dir = startDir;

  for (let i = 0; i < 10; i += 1) {
    const packageJsonPath = path.join(dir, "package.json");
    if (fs.existsSync(packageJsonPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as {
          name?: unknown;
        };
        const packageName =
          typeof pkg.name === "string" ? pkg.name.toLowerCase() : "";

        if (PACKAGE_ROOT_NAMES.has(packageName)) {
          return dir;
        }

        if (fs.existsSync(path.join(dir, "plugins.json"))) {
          return dir;
        }
      } catch {
        // Keep walking upward until we find a readable package root.
      }
    }

    const parent = path.dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }

  return startDir;
}

export function ensureApiTokenForBindHost(
  ...args: Parameters<typeof upstreamEnsureApiTokenForBindHost>
): ReturnType<typeof upstreamEnsureApiTokenForBindHost> {
  syncMiladyEnvToEliza();
  const result = upstreamEnsureApiTokenForBindHost(...args);
  syncElizaEnvToMilady();
  return result;
}

export function resolveCorsOrigin(
  ...args: Parameters<typeof upstreamResolveCorsOrigin>
): ReturnType<typeof upstreamResolveCorsOrigin> {
  syncMiladyEnvToEliza();
  const result = upstreamResolveCorsOrigin(...args);
  syncElizaEnvToMilady();
  return result;
}

export async function startApiServer(
  ...args: Parameters<typeof upstreamStartApiServer>
): Promise<Awaited<ReturnType<typeof upstreamStartApiServer>>> {
  syncMiladyEnvToEliza();
  syncElizaEnvToMilady();
  const compatState: CompatRuntimeState = {
    current: (args[0]?.runtime as AgentRuntime | null) ?? null,
  };
  const restoreCreateServer = patchHttpCreateServerForMiladyCompat(compatState);

  try {
    if (compatState.current) {
      await ensureRuntimeSqlCompatibility(compatState.current);
    }

    const server = await upstreamStartApiServer(...args);
    const originalUpdateRuntime = server.updateRuntime as (
      runtime: AgentRuntime,
    ) => void;

    server.updateRuntime = (runtime: AgentRuntime) => {
      compatState.current = runtime;
      void ensureRuntimeSqlCompatibility(runtime);
      originalUpdateRuntime(runtime);
    };

    syncElizaEnvToMilady();
    syncCompatConfigFiles();
    return server;
  } finally {
    restoreCreateServer();
  }
}

/**
 * Build the Authorization header value to use when forwarding requests to
 * Hyperscape. Returns `null` when no token is configured.
 *
 * - When `HYPERSCAPE_AUTH_TOKEN` is set, its value is used (prefixed with
 *   "Bearer " if not already present) regardless of any incoming header.
 * - When the env var is unset, returns `null` so callers know not to forward
 *   any credentials.
 */
export function resolveHyperscapeAuthorizationHeader(
  _req: Pick<http.IncomingMessage, "headers">,
): string | null {
  const token = process.env.HYPERSCAPE_AUTH_TOKEN;
  if (!token) return null;
  return token.startsWith("Bearer ") ? token : `Bearer ${token}`;
}
