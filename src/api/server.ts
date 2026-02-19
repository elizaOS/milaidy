/**
 * REST API server for the Milaidy Control UI.
 *
 * Exposes HTTP endpoints that the UI frontend expects, backed by the
 * ElizaOS AgentRuntime. Default port: 2138. In dev mode, the Vite UI
 * dev server proxies /api and /ws here (see scripts/dev-ui.mjs).
 */

import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import {
  type AgentRuntime,
  ChannelType,
  type Content,
  ModelType,
  createMessageMemory,
  logger,
  stringToUuid,
  type UUID,
} from "@elizaos/core";
import {
  configFileExists,
  loadMilaidyConfig,
  type MilaidyConfig,
  saveMilaidyConfig,
} from "../config/config.js";
import { resolveStateDir } from "../config/paths.js";
import { CharacterSchema } from "../config/zod-schema.js";
import { resolveDefaultAgentWorkspaceDir } from "../providers/workspace.js";
import {
  type PluginParamInfo,
  validatePluginConfig,
} from "./plugin-validation.js";
import {
  fetchEvmBalances,
  fetchEvmBalancesPublic,
  fetchEvmNfts,
  fetchSolanaBalancePublic,
  fetchSolanaBalances,
  fetchSolanaNfts,
  generateWalletForChain,
  generateWalletKeys,
  importWallet,
  validatePrivateKey,
  type WalletBalancesResponse,
  type WalletChain,
  type WalletConfigStatus,
  type WalletNftsResponse,
} from "./wallet.js";
import { createRateLimiter } from "../multiuser/rate-limiter.js";
import { createElizaExecutionBackend } from "../multiuser/eliza-executor.js";
import { MultiUserError, MultiUserService } from "../multiuser/service.js";
import { parseSecretKeyringFromEnv } from "../multiuser/security.js";
import {
  classifyCoreIntents,
  isLowContextInput,
  normalizeComponentName,
  resolveComponentTarget,
} from "./intent-engine.js";
import {
  buildCapabilityGraph,
  composeResponseV2,
  interpretIntentV2,
} from "./intent-engine-v2.js";
import { orchestrateUniversalReply } from "./response-orchestrator.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Subset of the core AutonomyService interface we use for lifecycle control. */
interface AutonomyServiceLike {
  enableAutonomy(): Promise<void>;
  disableAutonomy(): Promise<void>;
  isLoopRunning(): boolean;
}

/** Helper to retrieve the AutonomyService from a runtime (may be null). */
function getAutonomySvc(
  runtime: AgentRuntime | null,
): AutonomyServiceLike | null {
  if (!runtime) return null;
  return runtime.getService("AUTONOMY") as AutonomyServiceLike | null;
}

function detectRuntimeModel(runtime: AgentRuntime | null): string | undefined {
  if (!runtime) return undefined;
  const providerOrder = [
    "openai",
    "anthropic",
    "openrouter",
    "google",
    "gemini",
    "xai",
    "grok",
    "groq",
    "deepseek",
    "mistral",
    "together",
    "ollama",
    "elizacloud",
  ] as const;
  const names = runtime.plugins.map((p) => p.name.toLowerCase());
  const matched = providerOrder.find((needle) =>
    names.some((name) => name.includes(needle)),
  );
  return matched ?? undefined;
}

function hasConfiguredAiProvider(state: ServerState): boolean {
  return state.plugins.some(
    (plugin) =>
      plugin.category === "ai-provider" &&
      plugin.enabled &&
      plugin.configured &&
      plugin.validationErrors.length === 0,
  );
}

interface ServerState {
  runtime: AgentRuntime | null;
  config: MilaidyConfig;
  agentState:
    | "not_started"
    | "running"
    | "paused"
    | "stopped"
    | "restarting"
    | "error";
  agentName: string;
  model: string | undefined;
  startedAt: number | undefined;
  plugins: PluginEntry[];
  skills: SkillEntry[];
  logBuffer: LogEntry[];
  chatRoomId: UUID | null;
  chatUserId: UUID | null;
  chatTurnCount: number;
  chatRollingSummary: string | null;
  chatRecentTurns: Array<{ user: string; assistant: string }>;
  inFlightChatRequests: number;
}

interface PluginParamDef {
  key: string;
  type: string;
  description: string;
  required: boolean;
  sensitive: boolean;
  default?: string;
  /** Current value from process.env (masked if sensitive). */
  currentValue: string | null;
  /** Whether a value is currently set in the environment. */
  isSet: boolean;
}

interface PluginEntry {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  configured: boolean;
  envKey: string | null;
  category: "ai-provider" | "connector" | "database" | "feature";
  configKeys: string[];
  parameters: PluginParamDef[];
  validationErrors: Array<{ field: string; message: string }>;
  validationWarnings: Array<{ field: string; message: string }>;
}

interface SkillEntry {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
}

interface LogEntry {
  timestamp: number;
  level: string;
  message: string;
  source: string;
}

type HandleRegistry = Record<string, string>;
type HandleLockRegistry = Record<string, number>;
const HANDLE_CHANGE_LOCK_MS = 48 * 60 * 60 * 1000;

interface PolymarketPositionSummary {
  market: string;
  outcome: string;
  sizeUsd: number;
  currentValueUsd: number;
  pnlUsd: number;
  updatedAt: string | null;
}

interface PolymarketPortfolioResponse {
  wallet: string | null;
  connected: boolean;
  availableBalanceUsd: number | null;
  openExposureUsd: number | null;
  unsettledPnlUsd: number | null;
  openPositionsCount: number;
  positions: PolymarketPositionSummary[];
}

async function checkTcpReachable(
  host: string,
  port: number,
  timeoutMs: number,
): Promise<boolean> {
  return await new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const onDone = (ok: boolean) => {
      socket.removeAllListeners();
      try {
        socket.destroy();
      } catch {
        // ignore
      }
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => onDone(true));
    socket.once("timeout", () => onDone(false));
    socket.once("error", () => onDone(false));
  });
}

async function isOllamaReachable(
  endpoint: string,
  timeoutMs = 250,
): Promise<boolean> {
  // Default Ollama endpoint expected by plugin-ollama
  const raw = endpoint.trim() || "http://localhost:11434";
  let url: URL;
  try {
    // Some configs include /api suffix; URL parsing still works.
    url = new URL(raw);
  } catch {
    try {
      url = new URL(`http://${raw}`);
    } catch {
      return false;
    }
  }
  const host = url.hostname || "localhost";
  const port = url.port
    ? Number.parseInt(url.port, 10)
    : url.protocol === "https:"
      ? 443
      : 80;
  if (!Number.isFinite(port) || port <= 0) return false;
  return await checkTcpReachable(host, port, timeoutMs);
}

// ---------------------------------------------------------------------------
// Package root resolution (for reading bundled plugins.json)
// ---------------------------------------------------------------------------

export function findOwnPackageRoot(startDir: string): string {
  let dir = startDir;
  for (let i = 0; i < 10; i++) {
    const pkgPath = path.join(dir, "package.json");
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as Record<
          string,
          unknown
        >;
        const pkgName = String(pkg.name ?? "").toLowerCase();
        if (pkgName === "milaidy" || pkgName === "milady") return dir;
      } catch {
        /* keep searching */
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return startDir;
}

export const CONFIG_WRITE_ALLOWED_TOP_KEYS = new Set<string>([
  "agent",
  "plugins",
  "wallet",
  "security",
  "cloud",
  "connectors",
  // Backward compatibility for legacy config shape.
  "channels",
]);

const PLUGIN_CONFIG_BLOCKED_KEYS = new Set<string>([
  "MILADY_API_TOKEN",
  "MILADY_WALLET_EXPORT_TOKEN",
  "MILADY_ADMIN_TOKEN",
]);

export function resolvePluginConfigMutationRejections(
  declared: Array<{ key: string }>,
  changes: Record<string, unknown>,
): Array<{ field: string; message: string }> {
  const declaredSet = new Set(
    declared
      .map((entry) => String(entry.key ?? "").trim())
      .filter((key) => key.length > 0),
  );
  const rejections: Array<{ field: string; message: string }> = [];
  for (const key of Object.keys(changes)) {
    if (!declaredSet.has(key)) {
      rejections.push({
        field: key,
        message: `${key} is not a declared config key for this plugin`,
      });
      continue;
    }
    if (PLUGIN_CONFIG_BLOCKED_KEYS.has(key)) {
      rejections.push({
        field: key,
        message: `${key} is blocked for security reasons`,
      });
    }
  }
  return rejections;
}

function isLoopbackBindHost(host: string): boolean {
  const trimmed = host.trim().toLowerCase();
  return (
    trimmed === "" ||
    trimmed === "127.0.0.1" ||
    trimmed === "localhost" ||
    trimmed === "::1"
  );
}

export function ensureApiTokenForBindHost(host: string): void {
  if (process.env.MILADY_API_TOKEN) return;
  if (isLoopbackBindHost(host)) return;
  process.env.MILADY_API_TOKEN = crypto.randomBytes(32).toString("hex");
  logger.warn(
    "[milaidy-api] MILADY_API_TOKEN was auto-generated for non-loopback bind host",
  );
}

function isAllowedWsOrigin(origin: string | undefined): boolean {
  if (!origin) return true;
  const value = origin.trim().toLowerCase();
  return (
    value.startsWith("http://localhost") ||
    value.startsWith("https://localhost") ||
    value.startsWith("http://127.0.0.1") ||
    value.startsWith("https://127.0.0.1")
  );
}

type UpgradeRejection = { status: number; reason: string } | null;

export function resolveWebSocketUpgradeRejection(
  req: http.IncomingMessage,
  requestUrl: URL,
): UpgradeRejection {
  if (requestUrl.pathname !== "/ws") {
    return { status: 404, reason: "Not found" };
  }
  const origin =
    typeof req.headers.origin === "string" ? req.headers.origin : undefined;
  if (!isAllowedWsOrigin(origin)) {
    return { status: 403, reason: "Origin not allowed" };
  }

  const expected = process.env.MILADY_API_TOKEN;
  if (!expected || expected.length === 0) return null;

  const authHeader = req.headers.authorization;
  const bearer =
    typeof authHeader === "string" && authHeader.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length).trim()
      : "";
  if (bearer === expected) return null;

  const allowQueryToken = process.env.MILADY_ALLOW_WS_QUERY_TOKEN === "1";
  const queryToken = requestUrl.searchParams.get("token")?.trim() ?? "";
  if (allowQueryToken && queryToken === expected) return null;

  return { status: 401, reason: "Unauthorized" };
}

export async function persistConversationRoomTitle(
  runtime:
    | Pick<AgentRuntime, "getRoom" | "adapter">
    | null,
  conversation: { roomId: UUID; title: string },
): Promise<boolean> {
  if (!runtime) return false;
  const room = await runtime.getRoom(conversation.roomId);
  if (!room) return false;
  if (room.name === conversation.title) return false;
  const adapter = runtime.adapter as
    | { updateRoom?: (room: { id: UUID; name: string }) => Promise<void> }
    | undefined;
  if (!adapter || typeof adapter.updateRoom !== "function") return false;
  await adapter.updateRoom({ id: conversation.roomId, name: conversation.title });
  return true;
}

export function isSafeResetStateDir(
  targetDir: string,
  homeDir: string,
): boolean {
  const resolvedTarget = path.resolve(targetDir);
  const resolvedHome = path.resolve(homeDir);
  if (resolvedTarget === path.parse(resolvedTarget).root) return false;
  if (resolvedTarget === resolvedHome) return false;
  if (
    resolvedTarget !== resolvedHome &&
    !resolvedTarget.startsWith(`${resolvedHome}${path.sep}`)
  ) {
    return false;
  }
  const segments = resolvedTarget.split(path.sep).filter(Boolean);
  return segments.includes(".milady") || segments.includes("milaidy");
}

export function resolveWalletExportRejection(
  req: Pick<http.IncomingMessage, "headers">,
  body: Record<string, unknown>,
): { status: number; reason: string } | null {
  if (body.confirm !== true) {
    return {
      status: 403,
      reason: "Wallet export requires explicit confirm=true.",
    };
  }

  const expected = process.env.MILADY_WALLET_EXPORT_TOKEN;
  if (!expected) {
    return {
      status: 403,
      reason:
        "Wallet export is disabled. Set MILADY_WALLET_EXPORT_TOKEN to enable secure exports.",
    };
  }

  const headerToken =
    typeof req.headers["x-milady-export-token"] === "string"
      ? req.headers["x-milady-export-token"]
      : undefined;
  const bodyToken =
    typeof body.exportToken === "string" ? body.exportToken : undefined;
  const supplied = (headerToken ?? bodyToken ?? "").trim();
  if (!supplied) {
    return {
      status: 401,
      reason:
        "Missing export token. Provide X-Milady-Export-Token header or exportToken in request body.",
    };
  }
  if (supplied !== expected) {
    return { status: 401, reason: "Invalid export token." };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Plugin discovery
// ---------------------------------------------------------------------------

interface PluginIndexEntry {
  id: string;
  dirName: string;
  name: string;
  npmName: string;
  description: string;
  category: "ai-provider" | "connector" | "database" | "feature";
  envKey: string | null;
  configKeys: string[];
  pluginParameters?: Record<string, Record<string, unknown>>;
}

interface PluginIndex {
  $schema: string;
  generatedAt: string;
  count: number;
  plugins: PluginIndexEntry[];
}

function maskValue(value: string): string {
  if (value.length <= 8) return "****";
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function normalizeHandle(input: string): string {
  const base = input
    .trim()
    .replace(/^@+/, "")
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "");
  if (!base) return "";
  return `@${base}`;
}

function handleRegistryPath(): string {
  return path.join(resolveStateDir(), "handle-registry.json");
}

function handleLockRegistryPath(): string {
  return path.join(resolveStateDir(), "handle-locks.json");
}

function readHandleRegistry(): HandleRegistry {
  try {
    const file = handleRegistryPath();
    if (!fs.existsSync(file)) return {};
    const raw = fs.readFileSync(file, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const out: HandleRegistry = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v !== "string") continue;
      const handle = normalizeHandle(k);
      if (!handle) continue;
      const ownerId = v.trim();
      if (!ownerId) continue;
      out[handle] = ownerId;
    }
    return out;
  } catch {
    return {};
  }
}

function writeHandleRegistry(registry: HandleRegistry): void {
  const file = handleRegistryPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(registry, null, 2), {
    encoding: "utf8",
    mode: 0o600,
  });
}

function readHandleLockRegistry(): HandleLockRegistry {
  try {
    const file = handleLockRegistryPath();
    if (!fs.existsSync(file)) return {};
    const raw = fs.readFileSync(file, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const out: HandleLockRegistry = {};
    for (const [ownerId, lockUntilRaw] of Object.entries(
      parsed as Record<string, unknown>,
    )) {
      if (typeof ownerId !== "string" || !ownerId.trim()) continue;
      const lockUntil =
        typeof lockUntilRaw === "number"
          ? lockUntilRaw
          : Number.parseInt(String(lockUntilRaw), 10);
      if (!Number.isFinite(lockUntil) || lockUntil <= 0) continue;
      out[ownerId] = lockUntil;
    }
    return out;
  } catch {
    return {};
  }
}

function writeHandleLockRegistry(registry: HandleLockRegistry): void {
  const file = handleLockRegistryPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(registry, null, 2), {
    encoding: "utf8",
    mode: 0o600,
  });
}

function findOwnedHandle(claims: HandleRegistry, ownerId: string): string {
  for (const [handle, claimedOwner] of Object.entries(claims)) {
    if (claimedOwner === ownerId) return handle;
  }
  return "";
}

function applyPluginEntryConfigToEnv(config?: MilaidyConfig): void {
  const entries = config?.plugins?.entries;
  if (!entries) return;
  for (const entry of Object.values(entries)) {
    if (!entry?.config) continue;
    for (const [key, value] of Object.entries(entry.config)) {
      if (typeof value === "string" && value.trim()) {
        // Respect plugin-manager/UI config as the source of truth for
        // runtime credentials instead of stale inherited shell env values.
        process.env[key] = value;
      }
    }
  }
}

function buildParamDefs(
  pluginParams: Record<string, Record<string, unknown>>,
): PluginParamDef[] {
  return Object.entries(pluginParams).map(([key, def]) => {
    const envValue = process.env[key];
    const isSet = Boolean(envValue && envValue.trim());
    const sensitive = Boolean(def.sensitive);
    return {
      key,
      type: (def.type as string) ?? "string",
      description: (def.description as string) ?? "",
      required: Boolean(def.required),
      sensitive,
      default: def.default as string | undefined,
      currentValue: isSet
        ? sensitive
          ? maskValue(envValue!)
          : envValue!
        : null,
      isSet,
    };
  });
}

/**
 * Discover available plugins from the bundled plugins.json manifest.
 * Falls back to filesystem scanning for monorepo development.
 */
function discoverPluginsFromManifest(config?: MilaidyConfig): PluginEntry[] {
  const thisDir =
    import.meta.dirname ?? path.dirname(new URL(import.meta.url).pathname);
  const packageRoot = findOwnPackageRoot(thisDir);
  const manifestPath = path.join(packageRoot, "plugins.json");

  if (fs.existsSync(manifestPath)) {
    try {
      const index = JSON.parse(
        fs.readFileSync(manifestPath, "utf-8"),
      ) as PluginIndex;
      return index.plugins
        .map((p) => {
          const category = categorizePlugin(p.id);
          const envKey = p.envKey;
          const storedEntry = config?.plugins?.entries?.[p.id];
          const storedConfig = storedEntry?.config ?? {};
          const hasStoredConfig = Object.keys(storedConfig).length > 0;
          const configured = envKey
            ? Boolean(process.env[envKey]) || hasStoredConfig
            : p.configKeys.length === 0 || hasStoredConfig;
          const parameters = p.pluginParameters
            ? buildParamDefs(p.pluginParameters)
            : [];
          const paramInfos: PluginParamInfo[] = parameters.map((pd) => ({
            key: pd.key,
            required: pd.required,
            sensitive: pd.sensitive,
            type: pd.type,
            description: pd.description,
            default: pd.default,
          }));
          const validation = validatePluginConfig(
            p.id,
            category,
            envKey,
            p.configKeys,
            undefined,
            paramInfos,
          );

          return {
            id: p.id,
            name: p.name,
            description: p.description,
            enabled: storedEntry?.enabled ?? false,
            configured,
            envKey,
            category,
            configKeys: p.configKeys,
            parameters,
            validationErrors: validation.errors,
            validationWarnings: validation.warnings,
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name));
    } catch (err) {
      logger.debug(
        `[milaidy-api] Failed to read plugins.json: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  // Fallback: no manifest found
  logger.debug(
    "[milaidy-api] plugins.json not found — run `npm run generate:plugins`",
  );
  return [];
}

function pluginIdFromPackageName(name: string): string {
  if (name.startsWith("@elizaos/plugin-")) {
    return name.replace("@elizaos/plugin-", "");
  }
  if (name.startsWith("plugin-")) {
    return name.replace("plugin-", "");
  }
  const idx = name.lastIndexOf("/plugin-");
  if (idx >= 0) {
    return name.slice(idx + "/plugin-".length);
  }
  // Fallback: last path segment
  const parts = name.split("/");
  return parts[parts.length - 1] ?? name;
}

function formatPluginNameFromId(id: string): string {
  return id
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function findEnvKeyFromParamKeys(keys: string[]): string | null {
  return (
    keys.find(
      (k) =>
        k.endsWith("_API_KEY") ||
        k.endsWith("_BOT_TOKEN") ||
        k.endsWith("_TOKEN"),
    ) ?? null
  );
}

function mergeInstalledPluginsIntoState(state: ServerState): void {
  const installs = state.config.plugins?.installs ?? {};
  const existing = new Set(state.plugins.map((p) => p.id));
  const added: PluginEntry[] = [];

  for (const [packageName, record] of Object.entries(installs)) {
    const id = pluginIdFromPackageName(packageName);
    if (existing.has(id)) continue;

    let pkgName = formatPluginNameFromId(id);
    let description = "";
    let pluginParams: Record<string, Record<string, unknown>> = {};

    const installPath = (record as Record<string, unknown>)?.installPath;
    if (typeof installPath === "string" && installPath.trim()) {
      try {
        const pkgPath = path.join(installPath, "package.json");
        if (fs.existsSync(pkgPath)) {
          const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as Record<
            string,
            unknown
          >;
          if (typeof pkg.name === "string" && pkg.name.trim()) {
            pkgName = pkg.name;
          }
          if (typeof pkg.description === "string") {
            description = pkg.description;
          }
          const agentConfig = pkg.agentConfig as
            | Record<string, unknown>
            | undefined;
          const params = agentConfig?.pluginParameters as
            | Record<string, Record<string, unknown>>
            | undefined;
          if (params && typeof params === "object") {
            pluginParams = params;
          }
        }
      } catch {
        // Non-fatal: installed plugin may be missing metadata.
      }
    }

    const configKeys = Object.keys(pluginParams);
    const envKey = findEnvKeyFromParamKeys(configKeys);
    const category = categorizePlugin(id);
    const storedEntry = state.config.plugins?.entries?.[id];
    const storedConfig = storedEntry?.config ?? {};
    const hasStoredConfig = Object.keys(storedConfig).length > 0;
    const configured = envKey
      ? Boolean(process.env[envKey]) || hasStoredConfig
      : configKeys.length === 0 || hasStoredConfig;
    const parameters =
      Object.keys(pluginParams).length > 0 ? buildParamDefs(pluginParams) : [];
    const paramInfos: PluginParamInfo[] = parameters.map((pd) => ({
      key: pd.key,
      required: pd.required,
      sensitive: pd.sensitive,
      type: pd.type,
      description: pd.description,
      default: pd.default,
    }));
    const validation = validatePluginConfig(
      id,
      category,
      envKey,
      configKeys,
      undefined,
      paramInfos,
    );

    added.push({
      id,
      name:
        typeof pkgName === "string" && pkgName.trim()
          ? pkgName
          : formatPluginNameFromId(id),
      description,
      enabled: storedEntry?.enabled ?? true,
      configured,
      envKey,
      category,
      configKeys,
      parameters,
      validationErrors: validation.errors,
      validationWarnings: validation.warnings,
    });
  }

  if (added.length === 0) return;
  state.plugins = [...state.plugins, ...added].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
}

function categorizePlugin(
  id: string,
): "ai-provider" | "connector" | "database" | "feature" {
  const aiProviders = [
    "openai",
    "anthropic",
    "groq",
    "xai",
    "ollama",
    "openrouter",
    "google-genai",
    "local-ai",
    "vercel-ai-gateway",
    "deepseek",
    "together",
    "mistral",
    "cohere",
    "perplexity",
    "qwen",
    "minimax",
  ];
  const connectors = [
    "telegram",
    "discord",
    "slack",
    "whatsapp",
    "signal",
    "imessage",
    "bluebubbles",
    "farcaster",
    "bluesky",
    "matrix",
    "nostr",
    "msteams",
    "mattermost",
    "google-chat",
    "feishu",
    "line",
    "zalo",
    "zalouser",
    "tlon",
    "twitch",
    "nextcloud-talk",
    "instagram",
  ];
  const databases = ["sql", "localdb", "inmemorydb"];

  if (aiProviders.includes(id)) return "ai-provider";
  if (connectors.includes(id)) return "connector";
  if (databases.includes(id)) return "database";
  return "feature";
}

// ---------------------------------------------------------------------------
// Skills discovery + database-backed preferences
// ---------------------------------------------------------------------------

/** Cache key for persisting skill enable/disable state in the agent database. */
const SKILL_PREFS_CACHE_KEY = "milaidy:skill-preferences";

/** Shape stored in the cache: maps skill ID → enabled flag. */
type SkillPreferencesMap = Record<string, boolean>;

/**
 * Load persisted skill preferences from the agent's database.
 * Returns an empty map when the runtime or database isn't available.
 */
async function loadSkillPreferences(
  runtime: AgentRuntime | null,
): Promise<SkillPreferencesMap> {
  if (!runtime) return {};
  try {
    const prefs = await runtime.getCache<SkillPreferencesMap>(
      SKILL_PREFS_CACHE_KEY,
    );
    return prefs ?? {};
  } catch {
    return {};
  }
}

/**
 * Persist skill preferences to the agent's database.
 */
async function saveSkillPreferences(
  runtime: AgentRuntime,
  prefs: SkillPreferencesMap,
): Promise<void> {
  try {
    await runtime.setCache(SKILL_PREFS_CACHE_KEY, prefs);
  } catch (err) {
    logger.debug(
      `[milaidy-api] Failed to save skill preferences: ${err instanceof Error ? err.message : err}`,
    );
  }
}

/**
 * Determine whether a skill should be enabled.
 *
 * Priority (highest first):
 *   1. Database preferences (per-agent, persisted via PUT /api/skills/:id)
 *   2. `skills.denyBundled` config — always blocks
 *   3. `skills.entries[id].enabled` config — per-skill default
 *   4. `skills.allowBundled` config — whitelist mode
 *   5. Default: enabled
 */
function resolveSkillEnabled(
  id: string,
  config: MilaidyConfig,
  dbPrefs: SkillPreferencesMap,
): boolean {
  // Database preference takes priority (explicit user action)
  if (id in dbPrefs) return dbPrefs[id];

  const skillsCfg = config.skills;

  // Deny list always blocks
  if (skillsCfg?.denyBundled?.includes(id)) return false;

  // Per-skill config entry
  const entry = skillsCfg?.entries?.[id];
  if (entry && entry.enabled === false) return false;
  if (entry && entry.enabled === true) return true;

  // Allowlist: if set, only listed skills are enabled
  if (skillsCfg?.allowBundled && skillsCfg.allowBundled.length > 0) {
    return skillsCfg.allowBundled.includes(id);
  }

  return true;
}

/**
 * Discover skills from @elizaos/skills and workspace, applying
 * database preferences and config filtering.
 *
 * When a runtime is available, skills are primarily sourced from the
 * AgentSkillsService (which has already loaded, validated, and
 * precedence-resolved all skills). Filesystem scanning is used as a
 * fallback when the service isn't registered.
 */
async function discoverSkills(
  workspaceDir: string,
  config: MilaidyConfig,
  runtime: AgentRuntime | null,
): Promise<SkillEntry[]> {
  // Load persisted preferences from the agent database
  const dbPrefs = await loadSkillPreferences(runtime);

  // ── Primary path: pull from AgentSkillsService (most accurate) ──────────
  if (runtime) {
    try {
      const service = runtime.getService("AGENT_SKILLS_SERVICE");
      // eslint-disable-next-line -- runtime service is loosely typed; cast via unknown
      const svc = service as unknown as
        | {
            getLoadedSkills?: () => Array<{
              slug: string;
              name: string;
              description: string;
              source: string;
            }>;
          }
        | undefined;
      if (svc && typeof svc.getLoadedSkills === "function") {
        const loadedSkills = svc.getLoadedSkills();

        if (loadedSkills.length > 0) {
          const skills: SkillEntry[] = loadedSkills.map((s) => ({
            id: s.slug,
            name: s.name || s.slug,
            description: (s.description || "").slice(0, 200),
            enabled: resolveSkillEnabled(s.slug, config, dbPrefs),
          }));

          return skills.sort((a, b) => a.name.localeCompare(b.name));
        }
      }
    } catch {
      logger.debug(
        "[milaidy-api] AgentSkillsService not available, falling back to filesystem scan",
      );
    }
  }

  // ── Fallback: filesystem scanning ───────────────────────────────────────
  const skillsDirs: string[] = [];

  // Bundled skills from the @elizaos/skills package
  try {
    const skillsPkg = (await import("@elizaos/skills")) as {
      getSkillsDir: () => string;
    };
    const bundledDir = skillsPkg.getSkillsDir();
    if (bundledDir && fs.existsSync(bundledDir)) {
      skillsDirs.push(bundledDir);
    }
  } catch {
    logger.debug(
      "[milaidy-api] @elizaos/skills not available for skill discovery",
    );
  }

  // Workspace-local skills
  const workspaceSkills = path.join(workspaceDir, "skills");
  if (fs.existsSync(workspaceSkills)) {
    skillsDirs.push(workspaceSkills);
  }

  // Extra dirs from config
  const extraDirs = config.skills?.load?.extraDirs;
  if (extraDirs) {
    for (const dir of extraDirs) {
      if (fs.existsSync(dir)) skillsDirs.push(dir);
    }
  }

  const skills: SkillEntry[] = [];
  const seen = new Set<string>();

  for (const dir of skillsDirs) {
    scanSkillsDir(dir, skills, seen, config, dbPrefs);
  }

  return skills.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Recursively scan a directory for SKILL.md files, applying config filtering.
 */
function scanSkillsDir(
  dir: string,
  skills: SkillEntry[],
  seen: Set<string>,
  config: MilaidyConfig,
  dbPrefs: SkillPreferencesMap,
): void {
  if (!fs.existsSync(dir)) return;

  for (const entry of fs.readdirSync(dir)) {
    if (
      entry.startsWith(".") ||
      entry === "node_modules" ||
      entry === "src" ||
      entry === "dist"
    )
      continue;

    const entryPath = path.join(dir, entry);
    let stat: fs.Stats;
    try {
      stat = fs.statSync(entryPath);
    } catch {
      continue;
    }

    if (!stat.isDirectory()) continue;

    const skillMd = path.join(entryPath, "SKILL.md");
    if (fs.existsSync(skillMd)) {
      if (seen.has(entry)) continue;
      seen.add(entry);

      try {
        const content = fs.readFileSync(skillMd, "utf-8");

        let skillName = entry;
        let description = "";

        // Parse YAML frontmatter
        const fmMatch = /^---\s*\n([\s\S]*?)\n---/.exec(content);
        if (fmMatch) {
          const fmBlock = fmMatch[1];
          const nameMatch = /^name:\s*(.+)$/m.exec(fmBlock);
          const descMatch = /^description:\s*(.+)$/m.exec(fmBlock);
          if (nameMatch)
            skillName = nameMatch[1].trim().replace(/^["']|["']$/g, "");
          if (descMatch)
            description = descMatch[1].trim().replace(/^["']|["']$/g, "");
        }

        // Fallback to heading / first paragraph
        if (!description) {
          const lines = content.split("\n");
          const heading = lines.find((l) => l.trim().startsWith("#"));
          if (heading) skillName = heading.replace(/^#+\s*/, "").trim();
          const descLine = lines.find(
            (l) =>
              l.trim() &&
              !l.trim().startsWith("#") &&
              !l.trim().startsWith("---"),
          );
          description = descLine?.trim() ?? "";
        }

        skills.push({
          id: entry,
          name: skillName,
          description: description.slice(0, 200),
          enabled: resolveSkillEnabled(entry, config, dbPrefs),
        });
      } catch {
        /* skip unreadable */
      }
    } else {
      // Recurse into subdirectories for nested skill groups
      scanSkillsDir(entryPath, skills, seen, config, dbPrefs);
    }
  }
}

// ---------------------------------------------------------------------------
// Request helpers
// ---------------------------------------------------------------------------

/** Maximum request body size (1 MB) — prevents memory-based DoS. */
const MAX_BODY_BYTES = 1_048_576;
const MAX_CHAT_TEXT_CHARS = Math.max(
  256,
  Number(process.env.MILAIDY_MAX_CHAT_TEXT_CHARS ?? "12000"),
);
const API_RATE_LIMIT_WINDOW_MS = Math.max(
  1_000,
  Number(process.env.MILAIDY_API_RATE_LIMIT_WINDOW_MS ?? "60000"),
);
const API_RATE_LIMIT_MAX_REQUESTS = Math.max(
  10,
  Number(process.env.MILAIDY_API_RATE_LIMIT_MAX_REQUESTS ?? "300"),
);
const CHAT_MAX_CONCURRENCY = Math.max(
  1,
  Number(process.env.MILAIDY_CHAT_MAX_CONCURRENCY ?? "8"),
);
const CHAT_RESPONSE_TIMEOUT_MS = Math.max(
  5_000,
  Number(process.env.MILAIDY_CHAT_RESPONSE_TIMEOUT_MS ?? "12000"),
);
const CHAT_PIPELINE_TIMEOUT_MS = Math.max(
  3_000,
  Number(process.env.MILAIDY_CHAT_PIPELINE_TIMEOUT_MS ?? "7000"),
);
const CHAT_PIPELINE_MAX_RETRIES = Math.max(
  0,
  Number(process.env.MILAIDY_CHAT_PIPELINE_MAX_RETRIES ?? "0"),
);
const CHAT_PIPELINE_USE_MULTI_STEP =
  process.env.MILAIDY_CHAT_PIPELINE_USE_MULTI_STEP === "1";
const CHAT_FALLBACK_ALLOW_LARGE =
  process.env.MILAIDY_CHAT_FALLBACK_ALLOW_LARGE === "1";
const UNIVERSAL_ROUTER_ENABLED =
  process.env.MILAIDY_UNIVERSAL_ROUTER !== "0";
const INTENT_ENGINE_V2_ENABLED = process.env.MILAIDY_INTENT_ENGINE_V2 === "1";

const IS_PRODUCTION_RUNTIME =
  process.env.MILAIDY_ENV === "production" ||
  process.env.NODE_ENV === "production";
const STRICT_PROD_SECURITY =
  IS_PRODUCTION_RUNTIME && process.env.MILAIDY_PROD_STRICT_SECURITY !== "0";
const apiRateLimiter = createRateLimiter();
const MULTIUSER_V2_ENABLED = process.env.MILAIDY_MULTIUSER_ENABLE === "1";
const MULTIUSER_ENFORCE_V2_ONLY =
  process.env.MILAIDY_MULTIUSER_ENFORCE_V2 === "1";
const REQUIRE_LEGACY_API_TOKEN =
  process.env.MILAIDY_REQUIRE_API_TOKEN === "1" ||
  MULTIUSER_ENFORCE_V2_ONLY ||
  (STRICT_PROD_SECURITY && process.env.MILAIDY_REQUIRE_API_TOKEN !== "0");
const REQUIRE_USER_PROVIDER_SECRET =
  process.env.MILAIDY_REQUIRE_USER_PROVIDER_SECRET !== "0";
let multiUserService: MultiUserService | null = null;
let multiUserInitError: string | null = null;
if (MULTIUSER_V2_ENABLED || MULTIUSER_ENFORCE_V2_ONLY) {
  try {
    multiUserService = new MultiUserService();
  } catch (err) {
    multiUserInitError = err instanceof Error ? err.message : String(err);
  }
}

function buildMultiUserPreflightReport(): {
  enabled: boolean;
  strictV2Only: boolean;
  requireLegacyApiToken: boolean;
  requireUserProviderSecret: boolean;
  ready: boolean;
  serviceInitialized: boolean;
  missingEnv: string[];
  checks: Array<{ key: string; ok: boolean; detail: string }>;
  initError: string | null;
} {
  const checks: Array<{ key: string; ok: boolean; detail: string }> = [];

  const jwtSecret = process.env.MILAIDY_AUTH_JWT_SECRET?.trim() ?? "";
  const jwtOk = jwtSecret.length >= 32;
  checks.push({
    key: "MILAIDY_AUTH_JWT_SECRET",
    ok: jwtOk,
    detail: jwtOk
      ? "set (length >= 32)"
      : "missing or too short (min 32 chars)",
  });

  let keyringOk = false;
  let keyringDetail = "configured";
  try {
    parseSecretKeyringFromEnv(process.env);
    keyringOk = true;
  } catch (err) {
    keyringOk = false;
    keyringDetail =
      err instanceof Error ? err.message : "invalid keyring configuration";
  }
  checks.push({
    key: "MILAIDY_SECRET_KEYS + MILAIDY_SECRET_KEY_ACTIVE_VERSION",
    ok: keyringOk,
    detail: keyringDetail,
  });

  const allowOrigins = process.env.MILAIDY_ALLOWED_ORIGINS?.trim() ?? "";
  checks.push({
    key: "MILAIDY_ALLOWED_ORIGINS",
    ok: Boolean(allowOrigins),
    detail: allowOrigins || "missing",
  });

  if (STRICT_PROD_SECURITY) {
    checks.push({
      key: "MILAIDY_MULTIUSER_ENFORCE_V2",
      ok: MULTIUSER_ENFORCE_V2_ONLY,
      detail: MULTIUSER_ENFORCE_V2_ONLY
        ? "strict v2 enabled"
        : "must be 1 in production strict mode",
    });
    checks.push({
      key: "MILAIDY_ALLOW_LAN_ORIGINS",
      ok: process.env.MILAIDY_ALLOW_LAN_ORIGINS === "0",
      detail:
        process.env.MILAIDY_ALLOW_LAN_ORIGINS === "0"
          ? "disabled"
          : "must be 0 in production strict mode",
    });
  }

  const limiterInfo = apiRateLimiter.info();
  checks.push({
    key: "rate_limiter",
    ok: STRICT_PROD_SECURITY ? limiterInfo.distributed : true,
    detail:
      STRICT_PROD_SECURITY && !limiterInfo.distributed
        ? "distributed backend required in production strict mode"
        : `${limiterInfo.mode}${limiterInfo.failClosed ? " (fail-closed)" : ""}`,
  });

  const persistence = multiUserService?.getPersistenceInfo();
  if (persistence) {
    checks.push({
      key: "multiuser_persistence",
      ok: STRICT_PROD_SECURITY ? persistence.productionSafe : true,
      detail: `${persistence.mode}:${persistence.path}`,
    });
  }

  const missingEnv: string[] = [];
  if (!jwtOk) missingEnv.push("MILAIDY_AUTH_JWT_SECRET");
  if (!keyringOk) {
    const hasKeys = Boolean(process.env.MILAIDY_SECRET_KEYS?.trim());
    const hasActive = Boolean(
      process.env.MILAIDY_SECRET_KEY_ACTIVE_VERSION?.trim(),
    );
    if (!hasKeys) missingEnv.push("MILAIDY_SECRET_KEYS");
    if (!hasActive) missingEnv.push("MILAIDY_SECRET_KEY_ACTIVE_VERSION");
  }
  if (!allowOrigins) missingEnv.push("MILAIDY_ALLOWED_ORIGINS");

  const enabled = MULTIUSER_V2_ENABLED || MULTIUSER_ENFORCE_V2_ONLY;
  const ready = enabled ? checks.every((c) => c.ok) : true;
  return {
    enabled,
    strictV2Only: MULTIUSER_ENFORCE_V2_ONLY,
    requireLegacyApiToken: REQUIRE_LEGACY_API_TOKEN,
    requireUserProviderSecret: REQUIRE_USER_PROVIDER_SECRET,
    ready,
    serviceInitialized: Boolean(multiUserService),
    missingEnv,
    checks,
    initError: multiUserInitError,
  };
}

function applySecurityHeaders(res: http.ServerResponse): void {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
}

function getClientIp(req: http.IncomingMessage): string {
  const xff =
    typeof req.headers["x-forwarded-for"] === "string"
      ? req.headers["x-forwarded-for"]
      : undefined;
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.socket.remoteAddress ?? "unknown";
}

async function checkApiRateLimit(
  req: http.IncomingMessage,
): Promise<{ allowed: boolean; retryAfterSec: number }> {
  const ip = getClientIp(req);
  const decision = await apiRateLimiter.check(
    ip,
    API_RATE_LIMIT_MAX_REQUESTS,
    API_RATE_LIMIT_WINDOW_MS,
  );
  return {
    allowed: decision.allowed,
    retryAfterSec: decision.retryAfterSec,
  };
}

function cleanupApiRateLimits(): void {
  apiRateLimiter.cleanup();
}

function extractBearerToken(req: http.IncomingMessage): string | null {
  const header =
    typeof req.headers.authorization === "string"
      ? req.headers.authorization.trim()
      : "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match?.[1]) return null;
  const token = match[1].trim();
  return token || null;
}

function normalizeConfiguredEvmAddress(
  value: string | undefined,
): string | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return null;
  return /^0x[a-fA-F0-9]{40}$/.test(trimmed) ? trimmed : null;
}

function normalizeConfiguredSolanaAddress(
  value: string | undefined,
): string | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return null;
  // Base58 public keys are typically 32-44 chars.
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(trimmed) ? trimmed : null;
}

/**
 * User-connected wallet addresses only.
 *
 * Intentionally excludes signer-derived addresses from private keys to avoid
 * showing "auto connected" wallets that the user did not explicitly connect.
 */
function getConnectedWalletAddresses(): {
  evmAddress: string | null;
  solanaAddress: string | null;
} {
  return {
    evmAddress: normalizeConfiguredEvmAddress(process.env.EVM_ADDRESS),
    solanaAddress: normalizeConfiguredSolanaAddress(process.env.SOLANA_ADDRESS),
  };
}

function getOptionalMultiUserContextFromBearer(
  req: http.IncomingMessage,
): { userId: string; displayName: string } | null {
  if (!multiUserService) return null;
  const bearer = extractBearerToken(req);
  if (!bearer) return null;
  try {
    const ctx = multiUserService.getSessionFromAccessToken(bearer);
    return { userId: ctx.user.id, displayName: ctx.user.displayName };
  } catch {
    return null;
  }
}

function getEffectiveConnectedWalletAddresses(req: http.IncomingMessage): {
  evmAddress: string | null;
  solanaAddress: string | null;
} {
  const ctx = getOptionalMultiUserContextFromBearer(req);
  if (ctx && multiUserService) {
    const binding = multiUserService.getWalletBinding(ctx.userId);
    return {
      evmAddress: normalizeConfiguredEvmAddress(
        binding.evmAddress ?? undefined,
      ),
      solanaAddress: normalizeConfiguredSolanaAddress(
        binding.solanaAddress ?? undefined,
      ),
    };
  }
  return getConnectedWalletAddresses();
}

function getConfiguredUiHandle(config: MilaidyConfig): string | null {
  const raw = (config as { ui?: { user?: { handle?: unknown } } }).ui?.user
    ?.handle;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return trimmed.startsWith("@") ? trimmed : `@${trimmed}`;
}

function maskSecretValue(value: string): string {
  if (value.length <= 8) return "********";
  return `${value.slice(0, 4)}...${value.slice(-2)}`;
}

function redactConfigForResponse(config: MilaidyConfig): MilaidyConfig {
  const cloned = structuredClone(config);
  const env = (cloned as { env?: Record<string, unknown> }).env;
  if (env && typeof env === "object") {
    const redacted: Record<string, unknown> = {};
    for (const [key, raw] of Object.entries(env)) {
      const value = typeof raw === "string" ? raw : String(raw ?? "");
      redacted[key] = maskSecretValue(value);
    }
    (cloned as { env?: Record<string, unknown> }).env = redacted;
  }
  return cloned;
}

function validateSafeConfigPatch(
  input: Record<string, unknown>,
): Record<string, unknown> {
  const allowedTopLevel = new Set(["ui"]);
  for (const key of Object.keys(input)) {
    if (!allowedTopLevel.has(key)) {
      throw new MultiUserError(
        `Unsupported config field: ${key}`,
        422,
        "INVALID_CONFIG_PATCH",
      );
    }
  }

  const out: Record<string, unknown> = {};
  const ui = input.ui;
  if (ui !== undefined) {
    if (!ui || typeof ui !== "object" || Array.isArray(ui)) {
      throw new MultiUserError(
        "ui must be an object",
        422,
        "INVALID_CONFIG_PATCH",
      );
    }
    const uiObj = ui as Record<string, unknown>;
    const uiOut: Record<string, unknown> = {};
    if (uiObj.assistant !== undefined) {
      if (
        !uiObj.assistant ||
        typeof uiObj.assistant !== "object" ||
        Array.isArray(uiObj.assistant)
      ) {
        throw new MultiUserError(
          "ui.assistant must be an object",
          422,
          "INVALID_CONFIG_PATCH",
        );
      }
      const assistant = uiObj.assistant as Record<string, unknown>;
      const assistantOut: Record<string, unknown> = {};
      if (assistant.name !== undefined) {
        if (
          typeof assistant.name !== "string" ||
          !assistant.name.trim() ||
          assistant.name.length > 120
        ) {
          throw new MultiUserError(
            "ui.assistant.name must be a non-empty string up to 120 chars",
            422,
            "INVALID_CONFIG_PATCH",
          );
        }
        assistantOut.name = assistant.name.trim();
      }
      uiOut.assistant = assistantOut;
    }
    if (uiObj.user !== undefined) {
      if (
        !uiObj.user ||
        typeof uiObj.user !== "object" ||
        Array.isArray(uiObj.user)
      ) {
        throw new MultiUserError(
          "ui.user must be an object",
          422,
          "INVALID_CONFIG_PATCH",
        );
      }
      const user = uiObj.user as Record<string, unknown>;
      const userOut: Record<string, unknown> = {};

      if (user.handle !== undefined) {
        if (typeof user.handle !== "string") {
          throw new MultiUserError(
            "ui.user.handle must be a string",
            422,
            "INVALID_CONFIG_PATCH",
          );
        }
        const trimmed = user.handle.trim();
        if (!trimmed) {
          throw new MultiUserError(
            "ui.user.handle cannot be empty",
            422,
            "INVALID_CONFIG_PATCH",
          );
        }
        if (trimmed.length > 32) {
          throw new MultiUserError(
            "ui.user.handle must be 32 chars or fewer",
            422,
            "INVALID_CONFIG_PATCH",
          );
        }
        // Allow "@name" or "name". Normalization is handled in the UI.
        userOut.handle = trimmed;
      }

      if (user.accent !== undefined) {
        if (typeof user.accent !== "string") {
          throw new MultiUserError(
            "ui.user.accent must be a string",
            422,
            "INVALID_CONFIG_PATCH",
          );
        }
        const trimmed = user.accent.trim();
        if (!/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
          throw new MultiUserError(
            "ui.user.accent must be a hex color like #ff8800",
            422,
            "INVALID_CONFIG_PATCH",
          );
        }
        userOut.accent = trimmed;
      }

      if (user.imageUrl !== undefined) {
        if (typeof user.imageUrl !== "string") {
          throw new MultiUserError(
            "ui.user.imageUrl must be a string",
            422,
            "INVALID_CONFIG_PATCH",
          );
        }
        const trimmed = user.imageUrl.trim();
        if (!trimmed || trimmed.length > 1024) {
          throw new MultiUserError(
            "ui.user.imageUrl must be a non-empty string up to 1024 chars",
            422,
            "INVALID_CONFIG_PATCH",
          );
        }
        userOut.imageUrl = trimmed;
      }

      if (user.responseMode !== undefined) {
        if (typeof user.responseMode !== "string") {
          throw new MultiUserError(
            "ui.user.responseMode must be a string",
            422,
            "INVALID_CONFIG_PATCH",
          );
        }
        const trimmed = user.responseMode.trim();
        if (!trimmed || trimmed.length > 80) {
          throw new MultiUserError(
            "ui.user.responseMode must be a non-empty string up to 80 chars",
            422,
            "INVALID_CONFIG_PATCH",
          );
        }
        userOut.responseMode = trimmed;
      }

      uiOut.user = userOut;
    }
    out.ui = uiOut;
  }

  return out;
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    req.on("data", (c: Buffer) => {
      totalBytes += c.length;
      if (totalBytes > MAX_BODY_BYTES) {
        req.destroy();
        reject(
          new Error(
            `Request body exceeds maximum size (${MAX_BODY_BYTES} bytes)`,
          ),
        );
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

/**
 * Read and parse a JSON request body with size limits and error handling.
 * Returns null (and sends a 4xx response) if reading or parsing fails.
 */
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
    error(res, msg, 413);
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) {
      error(res, "Request body must be a JSON object", 400);
      return null;
    }
    return parsed as T;
  } catch {
    error(res, "Invalid JSON in request body", 400);
    return null;
  }
}

function json(res: http.ServerResponse, data: unknown, status = 200): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(data));
}

function error(res: http.ServerResponse, message: string, status = 400): void {
  json(res, { error: message }, status);
}

function codedError(
  res: http.ServerResponse,
  message: string,
  code: string,
  status = 400,
): void {
  json(res, { error: message, code }, status);
}

async function fetchJsonTimeout<T>(
  url: string,
  timeoutMs = 5000,
): Promise<T | null> {
  try {
    const resp = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!resp.ok) return null;
    return (await resp.json()) as T;
  } catch {
    return null;
  }
}

interface PolymarketMarketContext {
  id: string;
  slug: string | null;
  question: string;
  active: boolean | null;
  endDateIso: string | null;
  volumeUsd: number | null;
  liquidityUsd: number | null;
  yesPrice: number | null;
  noPrice: number | null;
}

const polymarketIntelCache: {
  hot: PolymarketMarketContext[];
  byQuery: Map<string, PolymarketMarketContext[]>;
} = {
  hot: [],
  byQuery: new Map<string, PolymarketMarketContext[]>(),
};

function isPolymarketMarketCurrent(endDateIso: string | null): boolean {
  if (!endDateIso) return true;
  const endMs = Date.parse(endDateIso);
  if (!Number.isFinite(endMs)) return true;
  // Exclude markets that have already ended (small grace for clock drift).
  return endMs > Date.now() - 5 * 60 * 1000;
}

function inferPolymarketTopicHint(text: string): string | null {
  const lower = text.toLowerCase();
  if (
    /\b(sport|sports|nfl|nba|mlb|nhl|epl|soccer|football|basketball|tennis|golf|ufc|mma|f1|formula 1|super bowl|world cup|olympic)\b/.test(
      lower,
    )
  ) {
    return "sports";
  }
  return null;
}

function isLikelyJunkMarketQuestion(question: string): boolean {
  const q = question.trim();
  if (!q) return true;
  if (q.length < 16) return true;
  if (/\[new market\]/i.test(q)) return true;
  if (/\b(awef|asdf|qwer|zxcv|test market|dummy)\b/i.test(q)) return true;
  return false;
}

function matchesTopicHint(
  market: PolymarketMarketContext,
  topicHint: string | null,
): boolean {
  if (!topicHint) return true;
  const text = `${market.question} ${market.slug ?? ""}`.toLowerCase();
  if (topicHint === "sports") {
    return /\b(sport|nfl|nba|mlb|nhl|epl|soccer|football|basketball|tennis|golf|ufc|mma|f1|formula 1|super bowl|world cup|olympic|championship|playoff)\b/.test(
      text,
    );
  }
  return true;
}

function filterPolymarketMarkets(
  markets: PolymarketMarketContext[],
  topicHint: string | null,
): PolymarketMarketContext[] {
  return markets.filter((m) => {
    if (!isPolymarketMarketCurrent(m.endDateIso)) return false;
    if (m.active === false) return false;
    if (isLikelyJunkMarketQuestion(m.question)) return false;
    const hasDepth =
      (m.volumeUsd != null && m.volumeUsd > 0) ||
      (m.liquidityUsd != null && m.liquidityUsd > 0);
    if (!hasDepth) return false;
    if (!matchesTopicHint(m, topicHint)) return false;
    return true;
  });
}

function marketLookupQueryFromUserText(userText: string): string {
  const stripped = userText
    .toLowerCase()
    .replace(
      /\b(polymarket|market|markets|bet|bets|odds|outcome|outcomes|price|prices|topic|topics|on|about|for|can|you|find|lookup|look up|what|is|the|a|an)\b/g,
      " ",
    )
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return stripped.slice(0, 96);
}

async function fetchPolymarketMarketContext(
  query: string,
  topicHint: string | null = null,
): Promise<PolymarketMarketContext[]> {
  if (!query.trim()) return [];
  const encoded = encodeURIComponent(query.trim());
  const urls = [
    `https://gamma-api.polymarket.com/markets?limit=8&active=true&closed=false&search=${encoded}`,
    `https://gamma-api.polymarket.com/markets?limit=8&search=${encoded}`,
  ];

  for (const url of urls) {
    const data = await fetchJsonTimeout<unknown>(url, 4200);
    if (!Array.isArray(data) || data.length === 0) continue;
    const rows = data
      .map((m) => {
        const row = m as Record<string, unknown>;
        const question =
          (typeof row.question === "string" && row.question.trim()) ||
          (typeof row.title === "string" && row.title.trim()) ||
          "";
        if (!question) return null;
        const rawVolume =
          toFiniteNumber(row.volume) ??
          toFiniteNumber(row.volumeNum) ??
          toFiniteNumber(row.volume24hr) ??
          null;
        const rawLiquidity =
          toFiniteNumber(row.liquidity) ??
          toFiniteNumber(row.liquidityNum) ??
          null;
        const id =
          (typeof row.id === "string" && row.id.trim()) ||
          (typeof row.conditionId === "string" && row.conditionId.trim()) ||
          question;
        const slug =
          (typeof row.slug === "string" && row.slug.trim()) || null;
        const active =
          typeof row.active === "boolean"
            ? row.active
            : typeof row.closed === "boolean"
              ? !row.closed
              : null;
        const endDateIso =
          (typeof row.endDate === "string" && row.endDate) ||
          (typeof row.end_date_iso === "string" && row.end_date_iso) ||
          null;
        let yesPrice: number | null = null;
        let noPrice: number | null = null;
        const pricesRaw = row.outcomePrices;
        const applyPrices = (arr: unknown[]): void => {
          const first = toFiniteNumber(arr[0]);
          const second = toFiniteNumber(arr[1]);
          if (first != null) yesPrice = first <= 1 ? first * 100 : first;
          if (second != null) noPrice = second <= 1 ? second * 100 : second;
        };
        if (Array.isArray(pricesRaw)) {
          applyPrices(pricesRaw);
        } else if (typeof pricesRaw === "string" && pricesRaw.trim()) {
          try {
            const parsed = JSON.parse(pricesRaw) as unknown;
            if (Array.isArray(parsed)) applyPrices(parsed);
          } catch {
            // ignore malformed price payloads
          }
        }
        return {
          id,
          slug,
          question,
          active,
          endDateIso,
          volumeUsd: rawVolume,
          liquidityUsd: rawLiquidity,
          yesPrice,
          noPrice,
        } satisfies PolymarketMarketContext;
      })
      .filter((r): r is PolymarketMarketContext => r != null);

    const filtered = filterPolymarketMarkets(rows, topicHint);
    if (filtered.length === 0) continue;
    filtered.sort((a, b) => (b.volumeUsd ?? 0) - (a.volumeUsd ?? 0));
    const out = filtered.slice(0, 3);
    polymarketIntelCache.byQuery.set(query.toLowerCase(), out);
    return out;
  }

  // Fallback: CLOB markets feed + local filtering.
  const clob = await fetchJsonTimeout<{
    data?: Array<Record<string, unknown>>;
  }>("https://clob.polymarket.com/markets", 4500);
  const clobRows = Array.isArray(clob?.data) ? clob.data : [];
  if (clobRows.length > 0) {
    const terms = query
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length >= 3);
    const mapped = clobRows
      .map((row) => {
        const question =
          (typeof row.question === "string" && row.question.trim()) ||
          (typeof row.description === "string" && row.description.trim()) ||
          "";
        if (!question) return null;
        const qLower = question.toLowerCase();
        if (terms.length > 0 && !terms.some((w) => qLower.includes(w))) {
          return null;
        }
        const endDateIso =
          (typeof row.end_date_iso === "string" && row.end_date_iso) ||
          (typeof row.endDate === "string" && row.endDate) ||
          null;
        const volumeUsd =
          toFiniteNumber(row.volume) ?? toFiniteNumber(row.volume_num) ?? null;
        const liquidityUsd =
          toFiniteNumber(row.liquidity) ??
          toFiniteNumber(row.liquidity_num) ??
          null;
        const tokens = Array.isArray(row.tokens)
          ? (row.tokens as Array<Record<string, unknown>>)
          : [];
        let yesPrice: number | null = null;
        let noPrice: number | null = null;
        const yesToken = tokens.find(
          (t) =>
            typeof t.outcome === "string" &&
            t.outcome.toLowerCase().includes("yes"),
        );
        const noToken = tokens.find(
          (t) =>
            typeof t.outcome === "string" &&
            t.outcome.toLowerCase().includes("no"),
        );
        const yp = toFiniteNumber(yesToken?.price);
        const np = toFiniteNumber(noToken?.price);
        if (yp != null) yesPrice = yp <= 1 ? yp * 100 : yp;
        if (np != null) noPrice = np <= 1 ? np * 100 : np;
        return {
          id:
            (typeof row.condition_id === "string" && row.condition_id) ||
            question,
          slug:
            (typeof row.market_slug === "string" && row.market_slug) || null,
          question,
          active:
            typeof row.accepting_orders === "boolean"
              ? row.accepting_orders
              : null,
          endDateIso,
          volumeUsd,
          liquidityUsd,
          yesPrice,
          noPrice,
        } satisfies PolymarketMarketContext;
      })
      .filter((m): m is PolymarketMarketContext => m != null)
      .filter((m) => filterPolymarketMarkets([m], topicHint).length > 0)
      .sort((a, b) => (b.volumeUsd ?? 0) - (a.volumeUsd ?? 0))
      .slice(0, 3);
    if (mapped.length > 0) {
      polymarketIntelCache.byQuery.set(query.toLowerCase(), mapped);
      return mapped;
    }
  }

  return polymarketIntelCache.byQuery.get(query.toLowerCase()) ?? [];
}

async function fetchHotPolymarketMarkets(
  topicHint: string | null = null,
): Promise<PolymarketMarketContext[]> {
  const url =
    "https://gamma-api.polymarket.com/markets?limit=10&active=true&closed=false";
  const data = await fetchJsonTimeout<unknown>(url, 4200);
  if (!Array.isArray(data) || data.length === 0) return [];
  const rows = data
    .map((m) => {
      const row = m as Record<string, unknown>;
      const question =
        (typeof row.question === "string" && row.question.trim()) ||
        (typeof row.title === "string" && row.title.trim()) ||
        "";
      if (!question) return null;
      const rawVolume =
        toFiniteNumber(row.volume) ??
        toFiniteNumber(row.volumeNum) ??
        toFiniteNumber(row.volume24hr) ??
        null;
      const rawLiquidity =
        toFiniteNumber(row.liquidity) ??
        toFiniteNumber(row.liquidityNum) ??
        null;
      const id =
        (typeof row.id === "string" && row.id.trim()) ||
        (typeof row.conditionId === "string" && row.conditionId.trim()) ||
        question;
      const slug = (typeof row.slug === "string" && row.slug.trim()) || null;
      const active =
        typeof row.active === "boolean"
          ? row.active
          : typeof row.closed === "boolean"
            ? !row.closed
            : null;
      const endDateIso =
        (typeof row.endDate === "string" && row.endDate) ||
        (typeof row.end_date_iso === "string" && row.end_date_iso) ||
        null;
      let yesPrice: number | null = null;
      let noPrice: number | null = null;
      const pricesRaw = row.outcomePrices;
      const applyPrices = (arr: unknown[]): void => {
        const first = toFiniteNumber(arr[0]);
        const second = toFiniteNumber(arr[1]);
        if (first != null) yesPrice = first <= 1 ? first * 100 : first;
        if (second != null) noPrice = second <= 1 ? second * 100 : second;
      };
      if (Array.isArray(pricesRaw)) {
        applyPrices(pricesRaw);
      } else if (typeof pricesRaw === "string" && pricesRaw.trim()) {
        try {
          const parsed = JSON.parse(pricesRaw) as unknown;
          if (Array.isArray(parsed)) applyPrices(parsed);
        } catch {
          // ignore malformed price payloads
        }
      }
      return {
        id,
        slug,
        question,
        active,
        endDateIso,
        volumeUsd: rawVolume,
        liquidityUsd: rawLiquidity,
        yesPrice,
        noPrice,
      } satisfies PolymarketMarketContext;
    })
    .filter((r): r is PolymarketMarketContext => r != null);
  const filtered = filterPolymarketMarkets(rows, topicHint);
  filtered.sort((a, b) => (b.volumeUsd ?? 0) - (a.volumeUsd ?? 0));
  const primary = filtered.slice(0, 5);
  if (primary.length > 0) {
    polymarketIntelCache.hot = primary;
    return primary;
  }

  // Fallback: CLOB live markets feed.
  const clob = await fetchJsonTimeout<{
    data?: Array<Record<string, unknown>>;
  }>("https://clob.polymarket.com/markets", 4500);
  const clobRows = Array.isArray(clob?.data) ? clob.data : [];
  if (clobRows.length > 0) {
    const mapped = clobRows
      .map((row) => {
        const question =
          (typeof row.question === "string" && row.question.trim()) ||
          (typeof row.description === "string" && row.description.trim()) ||
          "";
        if (!question) return null;
        const endDateIso =
          (typeof row.end_date_iso === "string" && row.end_date_iso) ||
          (typeof row.endDate === "string" && row.endDate) ||
          null;
        const volumeUsd =
          toFiniteNumber(row.volume) ?? toFiniteNumber(row.volume_num) ?? null;
        const liquidityUsd =
          toFiniteNumber(row.liquidity) ??
          toFiniteNumber(row.liquidity_num) ??
          null;
        const tokens = Array.isArray(row.tokens)
          ? (row.tokens as Array<Record<string, unknown>>)
          : [];
        let yesPrice: number | null = null;
        let noPrice: number | null = null;
        const yesToken = tokens.find(
          (t) =>
            typeof t.outcome === "string" &&
            t.outcome.toLowerCase().includes("yes"),
        );
        const noToken = tokens.find(
          (t) =>
            typeof t.outcome === "string" &&
            t.outcome.toLowerCase().includes("no"),
        );
        const yp = toFiniteNumber(yesToken?.price);
        const np = toFiniteNumber(noToken?.price);
        if (yp != null) yesPrice = yp <= 1 ? yp * 100 : yp;
        if (np != null) noPrice = np <= 1 ? np * 100 : np;
        return {
          id:
            (typeof row.condition_id === "string" && row.condition_id) ||
            question,
          slug:
            (typeof row.market_slug === "string" && row.market_slug) || null,
          question,
          active:
            typeof row.accepting_orders === "boolean"
              ? row.accepting_orders
              : null,
          endDateIso,
          volumeUsd,
          liquidityUsd,
          yesPrice,
          noPrice,
        } satisfies PolymarketMarketContext;
      })
      .filter((m): m is PolymarketMarketContext => m != null)
      .filter((m) => filterPolymarketMarkets([m], topicHint).length > 0)
      .sort((a, b) => (b.volumeUsd ?? 0) - (a.volumeUsd ?? 0))
      .slice(0, 5);
    if (mapped.length > 0) {
      polymarketIntelCache.hot = mapped;
      return mapped;
    }
  }

  if (topicHint) {
    const topicCached = polymarketIntelCache.hot.filter((m) =>
      matchesTopicHint(m, topicHint),
    );
    if (topicCached.length > 0) return topicCached;
  }
  return polymarketIntelCache.hot;
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Onboarding helpers
// ---------------------------------------------------------------------------

// Use shared presets for full parity between CLI and GUI onboarding.
import { STYLE_PRESETS } from "../onboarding-presets.js";

/**
 * User-facing onboarding character presets.
 * Keep this list deterministic (no random shuffle) so UI themes stay stable.
 */
const ONBOARDING_PRESET_NAMES: readonly string[] = [
  "Reimu",
  "Marisa",
  "Sakuya",
  "Remilia",
  "Koishi",
  "Yukari",
];

function getProviderOptions(): Array<{
  id: string;
  name: string;
  envKey: string | null;
  pluginName: string;
  keyPrefix: string | null;
  description: string;
}> {
  return [
    {
      id: "anthropic",
      name: "Anthropic",
      envKey: "ANTHROPIC_API_KEY",
      pluginName: "@elizaos/plugin-anthropic",
      keyPrefix: "sk-ant-",
      description: "Claude models.",
    },
    {
      id: "openai",
      name: "OpenAI",
      envKey: "OPENAI_API_KEY",
      pluginName: "@elizaos/plugin-openai",
      keyPrefix: "sk-",
      description: "GPT models.",
    },
    {
      id: "openrouter",
      name: "OpenRouter",
      envKey: "OPENROUTER_API_KEY",
      pluginName: "@elizaos/plugin-openrouter",
      keyPrefix: "sk-or-",
      description: "Access multiple models via one API key.",
    },
    {
      id: "google-genai",
      name: "Gemini",
      envKey: "GOOGLE_API_KEY",
      pluginName: "@elizaos/plugin-google-genai",
      keyPrefix: null,
      description: "Google's Gemini models.",
    },
    {
      id: "xai",
      name: "xAI (Grok)",
      envKey: "XAI_API_KEY",
      pluginName: "@elizaos/plugin-xai",
      keyPrefix: "xai-",
      description: "xAI's Grok models.",
    },
    {
      id: "groq",
      name: "Groq",
      envKey: "GROQ_API_KEY",
      pluginName: "@elizaos/plugin-groq",
      keyPrefix: "gsk_",
      description: "Fast inference.",
    },
    {
      id: "deepseek",
      name: "DeepSeek",
      envKey: "DEEPSEEK_API_KEY",
      pluginName: "@elizaos/plugin-deepseek",
      keyPrefix: "sk-",
      description: "DeepSeek models.",
    },
    {
      id: "mistral",
      name: "Mistral",
      envKey: "MISTRAL_API_KEY",
      pluginName: "@elizaos/plugin-mistral",
      keyPrefix: null,
      description: "Mistral AI models.",
    },
    {
      id: "together",
      name: "Together AI",
      envKey: "TOGETHER_API_KEY",
      pluginName: "@elizaos/plugin-together",
      keyPrefix: null,
      description: "Open-source model hosting.",
    },
    {
      id: "ollama",
      name: "Ollama (local)",
      envKey: null,
      pluginName: "@elizaos/plugin-ollama",
      keyPrefix: null,
      description: "Local models, no API key needed.",
    },
  ];
}

function setSingleEnabledAiProviderInConfig(
  config: MilaidyConfig,
  providerId: string,
): void {
  const providerIds = new Set(
    getProviderOptions()
      .filter((p) => p.envKey || p.id === "ollama")
      .map((p) => p.id),
  );
  if (!providerIds.has(providerId)) return;

  config.plugins ??= {};
  config.plugins.entries ??= {};

  for (const id of providerIds) {
    const entry = (config.plugins.entries[id] ??= {});
    entry.enabled = id === providerId;
  }
}

function setSingleEnabledAiProviderInState(
  plugins: PluginEntry[],
  providerId: string,
): void {
  for (const plugin of plugins) {
    if (plugin.category !== "ai-provider") continue;
    plugin.enabled = plugin.id === providerId;
  }
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

interface RequestContext {
  onRestart: (() => Promise<AgentRuntime | null>) | null;
}

const LOCAL_ORIGIN_RE = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;
const APP_ORIGIN_RE =
  /^(capacitor|capacitor-electron|app):\/\/(localhost|-)?$/i;
const PRIVATE_LAN_ORIGIN_RE =
  /^https?:\/\/((10\.\d{1,3}\.\d{1,3}\.\d{1,3})|(192\.168\.\d{1,3}\.\d{1,3})|(172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})|(169\.254\.\d{1,3}\.\d{1,3})|([a-z0-9-]+\.local))(:\d+)?$/i;

function resolveCorsOrigin(origin?: string): string | null {
  if (!origin) return null;
  const trimmed = origin.trim();
  if (!trimmed) return null;

  // Explicit allowlist via env (comma-separated)
  const extra = process.env.MILAIDY_ALLOWED_ORIGINS;
  const strictCors =
    STRICT_PROD_SECURITY && process.env.MILAIDY_STRICT_CORS !== "0";
  if (extra) {
    const allow = extra
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
    if (allow.includes(trimmed)) return trimmed;
  }
  if (strictCors) return null;

  if (LOCAL_ORIGIN_RE.test(trimmed)) return trimmed;
  const allowLanOrigins = process.env.MILAIDY_ALLOW_LAN_ORIGINS !== "0";
  if (allowLanOrigins && PRIVATE_LAN_ORIGIN_RE.test(trimmed)) return trimmed;
  if (APP_ORIGIN_RE.test(trimmed)) return trimmed;
  if (trimmed === "null" && process.env.MILAIDY_ALLOW_NULL_ORIGIN === "1")
    return "null";
  return null;
}

function applyCors(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): boolean {
  const origin =
    typeof req.headers.origin === "string" ? req.headers.origin : undefined;
  const allowed = resolveCorsOrigin(origin);

  if (origin && !allowed) return false;

  if (allowed) {
    res.setHeader("Access-Control-Allow-Origin", allowed);
    res.setHeader("Vary", "Origin");
    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    );
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, X-Milaidy-Token, X-Api-Key",
    );
  }

  return true;
}

const PAIRING_TTL_MS = 10 * 60 * 1000;
const PAIRING_WINDOW_MS = 10 * 60 * 1000;
const PAIRING_MAX_ATTEMPTS = 5;
const PAIRING_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

let pairingCode: string | null = null;
let pairingExpiresAt = 0;
const pairingAttempts = new Map<string, { count: number; resetAt: number }>();

function pairingEnabled(): boolean {
  return (
    Boolean(process.env.MILAIDY_API_TOKEN?.trim()) &&
    process.env.MILAIDY_PAIRING_DISABLED !== "1"
  );
}

function normalizePairingCode(code: string): string {
  return code.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

function generatePairingCode(): string {
  const bytes = crypto.randomBytes(8);
  let raw = "";
  for (let i = 0; i < bytes.length; i++) {
    raw += PAIRING_ALPHABET[bytes[i] % PAIRING_ALPHABET.length];
  }
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}`;
}

function ensurePairingCode(): string | null {
  if (!pairingEnabled()) return null;
  const now = Date.now();
  if (!pairingCode || now > pairingExpiresAt) {
    pairingCode = generatePairingCode();
    pairingExpiresAt = now + PAIRING_TTL_MS;
    logger.warn(
      `[milaidy-api] Pairing code: ${pairingCode} (valid for 10 minutes)`,
    );
  }
  return pairingCode;
}

function rateLimitPairing(ip: string | null): boolean {
  const key = ip ?? "unknown";
  const now = Date.now();
  const current = pairingAttempts.get(key);
  if (!current || now > current.resetAt) {
    pairingAttempts.set(key, { count: 1, resetAt: now + PAIRING_WINDOW_MS });
    return true;
  }
  if (current.count >= PAIRING_MAX_ATTEMPTS) return false;
  current.count += 1;
  return true;
}

function extractAuthToken(req: http.IncomingMessage): string | null {
  const auth =
    typeof req.headers.authorization === "string"
      ? req.headers.authorization.trim()
      : "";
  if (auth) {
    const match = /^Bearer\s+(.+)$/i.exec(auth);
    if (match?.[1]) return match[1].trim();
  }

  const header =
    (typeof req.headers["x-milaidy-token"] === "string" &&
      req.headers["x-milaidy-token"]) ||
    (typeof req.headers["x-api-key"] === "string" && req.headers["x-api-key"]);
  if (typeof header === "string" && header.trim()) return header.trim();

  return null;
}

function isAuthorized(req: http.IncomingMessage): boolean {
  const expected = process.env.MILAIDY_API_TOKEN?.trim();
  if (!expected) return !REQUIRE_LEGACY_API_TOKEN;
  const provided = extractAuthToken(req);
  if (!provided) return false;
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(provided, "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

async function handleMultiUserV2Request(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  state: ServerState,
): Promise<boolean> {
  const method = req.method ?? "GET";
  const url = new URL(
    req.url ?? "/",
    `http://${req.headers.host ?? "localhost"}`,
  );
  const pathname = url.pathname;
  if (!pathname.startsWith("/api/v2/")) return false;
  if (method === "GET" && pathname === "/api/v2/preflight") {
    json(res, buildMultiUserPreflightReport());
    return true;
  }
  if (!multiUserService) {
    json(
      res,
      {
        error: "Multi-user v2 API is not configured",
        code: "MULTIUSER_NOT_CONFIGURED",
        detail: multiUserInitError ?? "Unknown initialization error",
      },
      503,
    );
    return true;
  }

  if (state.runtime && !multiUserService.hasExecutionBackend()) {
    multiUserService.setExecutionBackend(
      createElizaExecutionBackend({
        getRuntime: () => state.runtime,
        getEntitySettings: (userId) =>
          multiUserService!.getRuntimeEntitySettings(userId),
      }),
    );
  }

  const authBypass =
    (method === "POST" && pathname === "/api/v2/auth/signup") ||
    (method === "POST" && pathname === "/api/v2/auth/login") ||
    (method === "POST" && pathname === "/api/v2/auth/refresh");

  let ctx: ReturnType<
    typeof multiUserService.getSessionFromAccessToken
  > | null = null;
  if (!authBypass) {
    const bearer = extractBearerToken(req);
    if (!bearer) {
      json(res, { error: "Unauthorized", code: "UNAUTHORIZED" }, 401);
      return true;
    }
    try {
      ctx = multiUserService.getSessionFromAccessToken(bearer);
    } catch (err) {
      if (err instanceof MultiUserError) {
        json(res, { error: err.message, code: err.code }, err.status);
        return true;
      }
      json(res, { error: "Unauthorized", code: "UNAUTHORIZED" }, 401);
      return true;
    }
  }

  try {
    // ── POST /api/v2/auth/signup ────────────────────────────────────────
    if (method === "POST" && pathname === "/api/v2/auth/signup") {
      const body = await readJsonBody(req, res);
      if (!body) return true;
      const parsed = multiUserService.parseSignup(body);
      const result = await multiUserService.signup(parsed, {
        userAgent:
          typeof req.headers["user-agent"] === "string"
            ? req.headers["user-agent"]
            : null,
        ipAddress: getClientIp(req),
      });
      json(res, result, 201);
      return true;
    }

    // ── POST /api/v2/auth/login ─────────────────────────────────────────
    if (method === "POST" && pathname === "/api/v2/auth/login") {
      const body = await readJsonBody(req, res);
      if (!body) return true;
      const parsed = multiUserService.parseLogin(body);
      const result = await multiUserService.login(parsed, {
        userAgent:
          typeof req.headers["user-agent"] === "string"
            ? req.headers["user-agent"]
            : null,
        ipAddress: getClientIp(req),
      });
      json(res, result);
      return true;
    }

    // ── POST /api/v2/auth/refresh ───────────────────────────────────────
    if (method === "POST" && pathname === "/api/v2/auth/refresh") {
      const body = await readJsonBody<{ refreshToken?: string }>(req, res);
      if (!body) return true;
      const refreshToken =
        typeof body.refreshToken === "string" ? body.refreshToken : "";
      const result = multiUserService.refresh(refreshToken);
      json(res, result);
      return true;
    }

    // ── POST /api/v2/auth/logout ────────────────────────────────────────
    if (method === "POST" && pathname === "/api/v2/auth/logout") {
      multiUserService.revokeSession(ctx!.session.id);
      json(res, { ok: true });
      return true;
    }

    // ── GET /api/v2/auth/me ─────────────────────────────────────────────
    if (method === "GET" && pathname === "/api/v2/auth/me") {
      json(res, { user: multiUserService.getMe(ctx!) });
      return true;
    }

    // ── GET|PATCH /api/v2/settings ──────────────────────────────────────
    if (pathname === "/api/v2/settings" && method === "GET") {
      json(res, multiUserService.getSettings(ctx!.user.id));
      return true;
    }
    if (pathname === "/api/v2/settings" && method === "PATCH") {
      const body = await readJsonBody(req, res);
      if (!body) return true;
      const patch = multiUserService.parseTenantPatch(body);
      json(res, multiUserService.patchSettings(ctx!.user.id, patch));
      return true;
    }

    // ── Integrations + secrets ───────────────────────────────────────────
    if (pathname === "/api/v2/integrations" && method === "GET") {
      json(res, {
        integrations: multiUserService.listIntegrations(ctx!.user.id),
      });
      return true;
    }
    if (pathname === "/api/v2/integrations/secrets" && method === "POST") {
      const body = await readJsonBody(req, res);
      if (!body) return true;
      const reqBody = multiUserService.parseSecretUpsert(body);
      json(res, multiUserService.upsertSecret(ctx!.user.id, reqBody));
      return true;
    }
    if (
      pathname.startsWith("/api/v2/integrations/secrets/") &&
      method === "DELETE"
    ) {
      const parts = pathname.split("/").filter(Boolean);
      // /api/v2/integrations/secrets/:integrationId/:secretKey
      const integrationId = parts[4] ?? "";
      const secretKey = parts[5] ?? "";
      if (!integrationId || !secretKey) {
        error(res, "integrationId and secretKey are required", 400);
        return true;
      }
      json(
        res,
        multiUserService.deleteSecret(
          ctx!.user.id,
          decodeURIComponent(integrationId),
          decodeURIComponent(secretKey),
        ),
      );
      return true;
    }

    // ── Permissions ──────────────────────────────────────────────────────
    if (pathname === "/api/v2/permissions" && method === "GET") {
      json(res, multiUserService.getPermissions(ctx!.user.id));
      return true;
    }
    if (pathname === "/api/v2/permissions" && method === "PATCH") {
      const body = await readJsonBody(req, res);
      if (!body) return true;
      const patch = multiUserService.parsePermissionPatch(body);
      json(res, multiUserService.patchPermissions(ctx!.user.id, patch));
      return true;
    }

    // ── Wallet bindings (user-scoped) ───────────────────────────────────
    if (pathname === "/api/v2/wallet/addresses" && method === "GET") {
      json(res, multiUserService.getWalletBinding(ctx!.user.id));
      return true;
    }
    if (pathname === "/api/v2/wallet/addresses" && method === "PUT") {
      const body = await readJsonBody<Record<string, unknown>>(req, res);
      if (!body) return true;
      const evmAddress =
        typeof body.evmAddress === "string" ? body.evmAddress : null;
      const solanaAddress =
        typeof body.solanaAddress === "string" ? body.solanaAddress : null;
      json(
        res,
        multiUserService.setWalletBinding(ctx!.user.id, {
          evmAddress,
          solanaAddress,
        }),
      );
      return true;
    }
    if (pathname === "/api/v2/wallet/disconnect" && method === "POST") {
      json(res, multiUserService.clearWalletBinding(ctx!.user.id));
      return true;
    }

    // ── Chat sessions + messages ────────────────────────────────────────
    if (pathname === "/api/v2/chat/sessions" && method === "GET") {
      json(res, { sessions: multiUserService.listChatSessions(ctx!.user.id) });
      return true;
    }
    if (pathname === "/api/v2/chat/sessions" && method === "POST") {
      const body = await readJsonBody(req, res);
      if (!body) return true;
      const reqBody = multiUserService.parseChatSessionCreate(body);
      json(
        res,
        { session: multiUserService.createChatSession(ctx!.user.id, reqBody) },
        201,
      );
      return true;
    }
    if (
      pathname.startsWith("/api/v2/chat/sessions/") &&
      pathname.endsWith("/messages") &&
      method === "GET"
    ) {
      const parts = pathname.split("/").filter(Boolean);
      const sessionId = parts[4] ?? "";
      if (!sessionId) {
        error(res, "sessionId is required", 400);
        return true;
      }
      json(res, {
        messages: multiUserService.listMessages(
          ctx!.user.id,
          decodeURIComponent(sessionId),
        ),
      });
      return true;
    }
    if (pathname === "/api/v2/chat/messages" && method === "POST") {
      const body = await readJsonBody(req, res);
      if (!body) return true;
      const reqBody = multiUserService.parseChatSend(body);
      const result = await multiUserService.sendMessage(ctx!.user.id, reqBody);
      json(res, result, 201);
      return true;
    }

    // ── Actions / execution / confirmations ─────────────────────────────
    if (pathname === "/api/v2/actions/preview" && method === "POST") {
      const body = await readJsonBody(req, res);
      if (!body) return true;
      const action = multiUserService.parseActionExecute(body);
      json(res, multiUserService.previewAction(ctx!.user.id, action));
      return true;
    }
    if (pathname === "/api/v2/actions/execute" && method === "POST") {
      const body = await readJsonBody(req, res);
      if (!body) return true;
      const action = multiUserService.parseActionExecute(body);
      json(res, await multiUserService.executeAction(ctx!.user.id, action));
      return true;
    }
    if (pathname === "/api/v2/actions/confirm" && method === "POST") {
      const body = await readJsonBody(req, res);
      if (!body) return true;
      const reqBody = multiUserService.parseConfirm(body);
      json(res, await multiUserService.confirmAction(ctx!.user.id, reqBody));
      return true;
    }
    if (pathname.startsWith("/api/v2/actions/") && method === "GET") {
      const parts = pathname.split("/").filter(Boolean);
      const executionJobId = parts[3] ?? "";
      if (
        !executionJobId ||
        executionJobId === "preview" ||
        executionJobId === "confirm" ||
        executionJobId === "execute"
      ) {
        error(res, "executionJobId is required", 400);
        return true;
      }
      json(
        res,
        multiUserService.getActionStatus(
          ctx!.user.id,
          decodeURIComponent(executionJobId),
        ),
      );
      return true;
    }

    // ── Audit + governance ───────────────────────────────────────────────
    if (pathname === "/api/v2/audit" && method === "GET") {
      json(res, { audit: multiUserService.listAudit(ctx!.user.id) });
      return true;
    }
    if (pathname === "/api/v2/limits" && method === "GET") {
      json(res, multiUserService.getLimitsStatus(ctx!.user.id));
      return true;
    }
    if (pathname === "/api/v2/quotas" && method === "GET") {
      json(res, multiUserService.getQuotaStatus(ctx!.user.id));
      return true;
    }

    error(res, "Not found", 404);
    return true;
  } catch (err) {
    if (err instanceof MultiUserError) {
      if (err.retryAfterSec != null) {
        res.setHeader("Retry-After", String(err.retryAfterSec));
      }
      json(res, { error: err.message, code: err.code }, err.status);
      return true;
    }
    json(res, { error: "Internal server error", code: "INTERNAL" }, 500);
    return true;
  }
}

async function handleRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  state: ServerState,
  ctx?: RequestContext,
): Promise<void> {
  applySecurityHeaders(res);
  const method = req.method ?? "GET";
  const url = new URL(
    req.url ?? "/",
    `http://${req.headers.host ?? "localhost"}`,
  );
  const pathname = url.pathname;
  const isAuthEndpoint = pathname.startsWith("/api/auth/");
  const isV2Endpoint = pathname.startsWith("/api/v2/");
  const hasLegacyApiToken = Boolean(process.env.MILAIDY_API_TOKEN?.trim());

  if (!["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"].includes(method)) {
    res.setHeader("Allow", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
    json(res, { error: "Method not allowed" }, 405);
    return;
  }

  if (!applyCors(req, res)) {
    json(res, { error: "Origin not allowed" }, 403);
    return;
  }

  if (
    method !== "OPTIONS" &&
    !isAuthEndpoint &&
    !isV2Endpoint &&
    REQUIRE_LEGACY_API_TOKEN &&
    !hasLegacyApiToken
  ) {
    json(
      res,
      {
        error:
          "Legacy API token is required by server policy but MILAIDY_API_TOKEN is not set.",
      },
      503,
    );
    return;
  }

  if (
    method !== "OPTIONS" &&
    !isAuthEndpoint &&
    !isV2Endpoint &&
    !isAuthorized(req)
  ) {
    json(res, { error: "Unauthorized" }, 401);
    return;
  }

  // CORS preflight
  if (method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  // Generic API rate limiting for abuse control.
  // Pairing has its own stricter attempt limiter; this is a global guardrail.
  const limiter = await checkApiRateLimit(req);
  if (!limiter.allowed) {
    res.setHeader("Retry-After", String(limiter.retryAfterSec));
    json(res, { error: "Too many requests. Please retry shortly." }, 429);
    return;
  }

  if (isV2Endpoint) {
    await handleMultiUserV2Request(req, res, state);
    return;
  }

  if (MULTIUSER_ENFORCE_V2_ONLY && pathname.startsWith("/api/")) {
    json(
      res,
      {
        error:
          "Legacy API is disabled in strict multi-user mode. Use /api/v2/* endpoints.",
        code: "LEGACY_API_DISABLED",
      },
      410,
    );
    return;
  }

  // ── GET /api/auth/status ───────────────────────────────────────────────
  if (method === "GET" && pathname === "/api/auth/status") {
    const required = Boolean(process.env.MILAIDY_API_TOKEN?.trim());
    const enabled = pairingEnabled();
    if (enabled) ensurePairingCode();
    json(res, {
      required,
      pairingEnabled: enabled,
      expiresAt: enabled ? pairingExpiresAt : null,
    });
    return;
  }

  // ── POST /api/auth/pair ────────────────────────────────────────────────
  if (method === "POST" && pathname === "/api/auth/pair") {
    const body = await readJsonBody<{ code?: string }>(req, res);
    if (!body) return;

    const token = process.env.MILAIDY_API_TOKEN?.trim();
    if (!token) {
      error(res, "Pairing not enabled", 400);
      return;
    }
    if (!pairingEnabled()) {
      error(res, "Pairing disabled", 403);
      return;
    }
    if (!rateLimitPairing(req.socket.remoteAddress ?? null)) {
      error(res, "Too many attempts. Try again later.", 429);
      return;
    }

    const provided = normalizePairingCode(body.code ?? "");
    const current = ensurePairingCode();
    if (!current || Date.now() > pairingExpiresAt) {
      ensurePairingCode();
      error(
        res,
        "Pairing code expired. Check server logs for a new code.",
        410,
      );
      return;
    }

    const expected = normalizePairingCode(current);
    const a = Buffer.from(expected, "utf8");
    const b = Buffer.from(provided, "utf8");
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      error(res, "Invalid pairing code", 403);
      return;
    }

    pairingCode = null;
    pairingExpiresAt = 0;
    json(res, { token });
    return;
  }

  // ── GET /api/status ─────────────────────────────────────────────────────
  if (method === "GET" && pathname === "/api/status") {
    const uptime = state.startedAt ? Date.now() - state.startedAt : undefined;
    json(res, {
      state: state.agentState,
      agentName: state.agentName,
      model: state.model,
      uptime,
      startedAt: state.startedAt,
    });
    return;
  }

  // ── GET /api/onboarding/status ──────────────────────────────────────────
  if (method === "GET" && pathname === "/api/onboarding/status") {
    const complete = configFileExists() && Boolean(state.config.agents);
    json(res, { complete });
    return;
  }

  // ── GET /api/handles/check ───────────────────────────────────────────────
  if (method === "GET" && pathname === "/api/handles/check") {
    const requested =
      typeof url.searchParams.get("handle") === "string"
        ? (url.searchParams.get("handle") ?? "")
        : "";
    const ownerId = (url.searchParams.get("ownerId") ?? "").trim();
    const handle = normalizeHandle(requested);
    if (!handle || handle.length < 3) {
      error(res, "Invalid handle", 422);
      return;
    }
    const claims = readHandleRegistry();
    const claimedBy = claims[handle];
    const available =
      !claimedBy || (ownerId.length > 0 && claimedBy === ownerId);
    const owner: "self" | "other" | "none" = !claimedBy
      ? "none"
      : ownerId.length > 0 && claimedBy === ownerId
        ? "self"
        : "other";
    let lockUntil: number | null = null;
    if (ownerId.length > 0) {
      const locks = readHandleLockRegistry();
      const maybe = locks[ownerId];
      if (Number.isFinite(maybe) && (maybe as number) > Date.now()) {
        lockUntil = maybe as number;
      }
    }
    json(res, { ok: true, handle, available, owner, lockUntil });
    return;
  }

  // ── POST /api/handles/claim ─────────────────────────────────────────────
  if (method === "POST" && pathname === "/api/handles/claim") {
    const body = await readJsonBody<{
      handle?: string;
      ownerId?: string;
      previousHandle?: string;
    }>(req, res);
    if (!body) return;

    const handle = normalizeHandle(body.handle ?? "");
    const ownerId = (body.ownerId ?? "").trim();
    const previousHandle = normalizeHandle(body.previousHandle ?? "");

    if (!handle || handle.length < 3) {
      error(res, "Invalid handle", 422);
      return;
    }
    if (!ownerId || ownerId.length < 8 || ownerId.length > 128) {
      error(res, "Invalid owner id", 422);
      return;
    }

    const claims = readHandleRegistry();
    const locks = readHandleLockRegistry();
    const now = Date.now();
    const currentHandle = findOwnedHandle(claims, ownerId);
    const changingHandle = Boolean(currentHandle && currentHandle !== handle);
    const existingLockUntil = locks[ownerId];
    if (
      changingHandle &&
      Number.isFinite(existingLockUntil) &&
      (existingLockUntil as number) > now
    ) {
      const lockUntil = existingLockUntil as number;
      json(
        res,
        {
          ok: false,
          error: "Handle change locked for 48h",
          lockUntil,
          retryAfterSec: Math.max(1, Math.ceil((lockUntil - now) / 1000)),
        },
        429,
      );
      return;
    }

    if (
      previousHandle &&
      previousHandle !== handle &&
      claims[previousHandle] === ownerId
    ) {
      delete claims[previousHandle];
    }
    if (
      currentHandle &&
      currentHandle !== handle &&
      claims[currentHandle] === ownerId
    ) {
      delete claims[currentHandle];
    }

    const existingOwner = claims[handle];
    if (existingOwner && existingOwner !== ownerId) {
      json(
        res,
        { ok: false, error: "Handle already claimed by another user" },
        409,
      );
      return;
    }

    claims[handle] = ownerId;
    writeHandleRegistry(claims);
    let nextLockUntil: number | null = null;
    if (currentHandle !== handle) {
      nextLockUntil = now + HANDLE_CHANGE_LOCK_MS;
      locks[ownerId] = nextLockUntil;
      writeHandleLockRegistry(locks);
    } else if (
      Number.isFinite(existingLockUntil) &&
      (existingLockUntil as number) > now
    ) {
      nextLockUntil = existingLockUntil as number;
    }
    json(res, { ok: true, handle, lockUntil: nextLockUntil });
    return;
  }

  // ── GET /api/onboarding/options ─────────────────────────────────────────
  if (method === "GET" && pathname === "/api/onboarding/options") {
    // Provide a runtime-free hint for Ollama so UI can explain that the local
    // server must be installed/running even though no API key is needed.
    const ollamaReachable = await isOllamaReachable(
      process.env.OLLAMA_API_ENDPOINT || "http://localhost:11434",
    );
    json(res, {
      names: [...ONBOARDING_PRESET_NAMES],
      styles: STYLE_PRESETS,
      providers: getProviderOptions().map((p) => {
        if (p.id !== "ollama") return p;
        return {
          ...p,
          description: ollamaReachable
            ? "Local models, no API key needed. (Ollama detected)"
            : "Local models, no API key needed. Requires Ollama running on this device.",
        };
      }),
      sharedStyleRules:
        "Be concise, grounded, and action-oriented. Milaidy is an agentic workspace with subtle milady degen signal.",
    });
    return;
  }

  // ── POST /api/onboarding ────────────────────────────────────────────────
  if (method === "POST" && pathname === "/api/onboarding") {
    const body = await readJsonBody(req, res);
    if (!body) return;
    const config = state.config;

    if (!config.agents) config.agents = {};
    if (!config.agents.defaults) config.agents.defaults = {};
    config.agents.defaults.workspace = resolveDefaultAgentWorkspaceDir();

    if (!config.agents.list) config.agents.list = [];
    if (config.agents.list.length === 0) {
      config.agents.list.push({ id: "main", default: true });
    }
    const agent = config.agents.list[0] as Record<string, unknown>;
    agent.name = body.name;
    agent.workspace = resolveDefaultAgentWorkspaceDir();
    if (body.bio) agent.bio = body.bio;
    if (body.systemPrompt) agent.system = body.systemPrompt;
    if (body.style) agent.style = body.style;
    if (body.adjectives) agent.adjectives = body.adjectives;
    if (body.topics) agent.topics = body.topics;
    if (body.messageExamples) agent.messageExamples = body.messageExamples;

    if (typeof body.provider === "string" && body.provider.trim()) {
      const providerOpt = getProviderOptions().find(
        (p) => p.id === body.provider,
      );
      if (providerOpt) {
        // Persist provider selection even for providers that don't require a key (e.g. Ollama).
        setSingleEnabledAiProviderInConfig(config, providerOpt.id);
        setSingleEnabledAiProviderInState(state.plugins, providerOpt.id);
        if (
          providerOpt.envKey &&
          typeof body.providerApiKey === "string" &&
          body.providerApiKey.trim()
        ) {
          // Store provider secrets in the same place as the Plugins UI so they
          // are re-applied on runtime startup via applyPluginEntryConfigToEnv().
          config.plugins ??= {};
          config.plugins.entries ??= {};
          const entry = (config.plugins.entries[providerOpt.id] ??= {});
          entry.config = {
            ...(entry.config ?? {}),
            [providerOpt.envKey]: body.providerApiKey,
          };

          // Legacy/back-compat: keep config.env populated too (some older paths read it).
          if (!config.env) config.env = {};
          (config.env as Record<string, string>)[providerOpt.envKey] =
            body.providerApiKey;

          process.env[providerOpt.envKey] = body.providerApiKey;
        }
      }
    }

    if (body.telegramBotToken) {
      if (!config.env) config.env = {};
      (config.env as Record<string, string>).TELEGRAM_BOT_TOKEN =
        body.telegramBotToken as string;
      process.env.TELEGRAM_BOT_TOKEN = body.telegramBotToken as string;
    }
    if (body.discordBotToken) {
      if (!config.env) config.env = {};
      (config.env as Record<string, string>).DISCORD_API_TOKEN =
        body.discordBotToken as string;
      process.env.DISCORD_API_TOKEN = body.discordBotToken as string;
    }

    // ── Generate wallet keys if not already present ───────────────────────
    if (!process.env.EVM_PRIVATE_KEY || !process.env.SOLANA_PRIVATE_KEY) {
      try {
        const walletKeys = generateWalletKeys();

        if (!process.env.EVM_PRIVATE_KEY) {
          process.env.EVM_PRIVATE_KEY = walletKeys.evmPrivateKey;
          logger.info(
            `[milaidy-api] Generated EVM wallet: ${walletKeys.evmAddress}`,
          );
        }

        if (!process.env.SOLANA_PRIVATE_KEY) {
          process.env.SOLANA_PRIVATE_KEY = walletKeys.solanaPrivateKey;
          logger.info(
            `[milaidy-api] Generated Solana wallet: ${walletKeys.solanaAddress}`,
          );
        }
      } catch (err) {
        logger.warn(`[milaidy-api] Failed to generate wallet keys: ${err}`);
      }
    }

    state.config = config;
    state.agentName = (body.name as string) ?? state.agentName;
    saveMilaidyConfig(config);
    json(res, { ok: true });
    return;
  }

  // ── POST /api/agent/start ───────────────────────────────────────────────
  if (method === "POST" && pathname === "/api/agent/start") {
    state.agentState = "running";
    state.startedAt = Date.now();
    state.model = detectRuntimeModel(state.runtime) ?? "unknown";

    // Enable the autonomy task — the core TaskService will pick it up
    // and fire the first tick immediately (updatedAt starts at 0).
    const svc = getAutonomySvc(state.runtime);
    if (svc) await svc.enableAutonomy();

    json(res, {
      ok: true,
      status: {
        state: state.agentState,
        agentName: state.agentName,
        model: state.model,
        uptime: 0,
        startedAt: state.startedAt,
      },
    });
    return;
  }

  // ── POST /api/agent/stop ────────────────────────────────────────────────
  if (method === "POST" && pathname === "/api/agent/stop") {
    const svc = getAutonomySvc(state.runtime);
    if (svc) await svc.disableAutonomy();

    state.agentState = "stopped";
    state.startedAt = undefined;
    state.model = undefined;
    json(res, {
      ok: true,
      status: { state: state.agentState, agentName: state.agentName },
    });
    return;
  }

  // ── POST /api/agent/pause ───────────────────────────────────────────────
  if (method === "POST" && pathname === "/api/agent/pause") {
    const svc = getAutonomySvc(state.runtime);
    if (svc) await svc.disableAutonomy();

    state.agentState = "paused";
    json(res, {
      ok: true,
      status: {
        state: state.agentState,
        agentName: state.agentName,
        model: state.model,
        uptime: state.startedAt ? Date.now() - state.startedAt : undefined,
        startedAt: state.startedAt,
      },
    });
    return;
  }

  // ── POST /api/agent/resume ──────────────────────────────────────────────
  if (method === "POST" && pathname === "/api/agent/resume") {
    // Re-enable the autonomy task — first tick fires immediately
    // because the new task is created with updatedAt: 0.
    const svc = getAutonomySvc(state.runtime);
    if (svc) await svc.enableAutonomy();

    state.agentState = "running";
    json(res, {
      ok: true,
      status: {
        state: state.agentState,
        agentName: state.agentName,
        model: state.model,
        uptime: state.startedAt ? Date.now() - state.startedAt : undefined,
        startedAt: state.startedAt,
      },
    });
    return;
  }

  // ── POST /api/agent/restart ────────────────────────────────────────────
  if (method === "POST" && pathname === "/api/agent/restart") {
    if (!ctx?.onRestart) {
      error(
        res,
        "Restart is not supported in this mode (no restart handler registered)",
        501,
      );
      return;
    }

    // Reject if already mid-restart to prevent overlapping restarts.
    if (state.agentState === "restarting") {
      error(res, "A restart is already in progress", 409);
      return;
    }

    const previousState = state.agentState;
    state.agentState = "restarting";
    try {
      const newRuntime = await ctx.onRestart();
      if (newRuntime) {
        state.runtime = newRuntime;
        state.agentState = "running";
        state.agentName = newRuntime.character.name ?? "Milaidy";
        state.startedAt = Date.now();
        state.model = detectRuntimeModel(newRuntime) ?? "unknown";
        json(res, {
          ok: true,
          status: {
            state: state.agentState,
            agentName: state.agentName,
            model: state.model,
            startedAt: state.startedAt,
          },
        });
      } else {
        // Restore previous state instead of permanently stuck in "error"
        state.agentState = previousState;
        error(
          res,
          "Restart handler returned null — runtime failed to re-initialize",
          500,
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Restore previous state so the UI can retry
      state.agentState = previousState;
      error(res, `Restart failed: ${msg}`, 500);
    }
    return;
  }

  // ── POST /api/agent/reset ──────────────────────────────────────────────
  // Wipe config, workspace (memory), and return to onboarding.
  if (method === "POST" && pathname === "/api/agent/reset") {
    try {
      // 1. Stop the runtime if it's running
      if (state.runtime) {
        try {
          await state.runtime.stop();
        } catch (stopErr) {
          const msg =
            stopErr instanceof Error ? stopErr.message : String(stopErr);
          logger.warn(
            `[milaidy-api] Error stopping runtime during reset: ${msg}`,
          );
        }
        state.runtime = null;
      }

      // Also release any claimed @handles (and 48h locks) even if the state
      // directory cannot be fully removed for some reason. This keeps "Reset
      // Milaidy" aligned with the UI expectation that a full reset makes the
      // previous username available again on this server.
      try {
        const handleRegistry = handleRegistryPath();
        if (fs.existsSync(handleRegistry))
          fs.rmSync(handleRegistry, { force: true });
      } catch {
        // ignore
      }
      try {
        const handleLocks = handleLockRegistryPath();
        if (fs.existsSync(handleLocks)) fs.rmSync(handleLocks, { force: true });
      } catch {
        // ignore
      }

      // 2. Delete the state directory (~/.milaidy/) which contains
      //    config, workspace, memory, oauth tokens, etc.
      const stateDir = resolveStateDir();
      if (fs.existsSync(stateDir)) {
        fs.rmSync(stateDir, { recursive: true, force: true });
      }

      // 3. Reset server state
      state.agentState = "stopped";
      state.agentName = "Milaidy";
      state.model = undefined;
      state.startedAt = undefined;
      state.config = {} as MilaidyConfig;
      state.chatRoomId = null;
      state.chatUserId = null;
      state.chatTurnCount = 0;
      state.chatRollingSummary = null;
      state.chatRecentTurns = [];

      json(res, { ok: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      error(res, `Reset failed: ${msg}`, 500);
    }
    return;
  }

  // ── POST /api/agent/autonomy ────────────────────────────────────────────
  // Autonomy is always enabled; kept for backward compat.
  if (method === "POST" && pathname === "/api/agent/autonomy") {
    json(res, { ok: true, autonomy: true });
    return;
  }

  // ── GET /api/agent/autonomy ─────────────────────────────────────────────
  // Autonomy is always enabled.
  if (method === "GET" && pathname === "/api/agent/autonomy") {
    json(res, { enabled: true });
    return;
  }

  // ── GET /api/character ──────────────────────────────────────────────────
  if (method === "GET" && pathname === "/api/character") {
    // Character data lives in the runtime / database, not the config file.
    const rt = state.runtime;
    const merged: Record<string, unknown> = {};
    if (rt) {
      const c = rt.character;
      if (c.name) merged.name = c.name;
      if (c.bio) merged.bio = c.bio;
      if (c.system) merged.system = c.system;
      if (c.adjectives) merged.adjectives = c.adjectives;
      if (c.topics) merged.topics = c.topics;
      if (c.style) merged.style = c.style;
      if (c.postExamples) merged.postExamples = c.postExamples;
    }

    json(res, { character: merged, agentName: state.agentName });
    return;
  }

  // ── PUT /api/character ──────────────────────────────────────────────────
  if (method === "PUT" && pathname === "/api/character") {
    const body = await readJsonBody(req, res);
    if (!body) return;

    const result = CharacterSchema.safeParse(body);
    if (!result.success) {
      const issues = result.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      }));
      json(res, { ok: false, validationErrors: issues }, 422);
      return;
    }

    // Character data lives in the runtime (backed by DB), not the config file.
    if (state.runtime) {
      const c = state.runtime.character;
      if (body.name != null) c.name = body.name as string;
      if (body.bio != null)
        c.bio = Array.isArray(body.bio)
          ? (body.bio as string[])
          : [String(body.bio)];
      if (body.system != null) c.system = body.system as string;
      if (body.adjectives != null) c.adjectives = body.adjectives as string[];
      if (body.topics != null) c.topics = body.topics as string[];
      if (body.style != null)
        c.style = body.style as NonNullable<typeof c.style>;
      if (body.postExamples != null)
        c.postExamples = body.postExamples as string[];
    }
    if (body.name) {
      state.agentName = body.name as string;
    }
    json(res, { ok: true, character: body, agentName: state.agentName });
    return;
  }

  // ── GET /api/character/schema ───────────────────────────────────────────
  if (method === "GET" && pathname === "/api/character/schema") {
    json(res, {
      fields: [
        {
          key: "name",
          type: "string",
          label: "Name",
          description: "Agent display name",
          maxLength: 100,
        },
        {
          key: "username",
          type: "string",
          label: "Username",
          description: "Agent username for platforms",
          maxLength: 50,
        },
        {
          key: "bio",
          type: "string | string[]",
          label: "Bio",
          description: "Biography — single string or array of points",
        },
        {
          key: "system",
          type: "string",
          label: "System Prompt",
          description: "System prompt defining core behavior",
          maxLength: 10000,
        },
        {
          key: "adjectives",
          type: "string[]",
          label: "Adjectives",
          description: "Personality adjectives (e.g. curious, witty)",
        },
        {
          key: "topics",
          type: "string[]",
          label: "Topics",
          description: "Topics the agent is knowledgeable about",
        },
        {
          key: "style",
          type: "object",
          label: "Style",
          description: "Communication style guides",
          children: [
            {
              key: "all",
              type: "string[]",
              label: "All",
              description: "Style guidelines for all responses",
            },
            {
              key: "chat",
              type: "string[]",
              label: "Chat",
              description: "Style guidelines for chat responses",
            },
            {
              key: "post",
              type: "string[]",
              label: "Post",
              description: "Style guidelines for social media posts",
            },
          ],
        },
        {
          key: "messageExamples",
          type: "array",
          label: "Message Examples",
          description: "Example conversations demonstrating the agent's voice",
        },
        {
          key: "postExamples",
          type: "string[]",
          label: "Post Examples",
          description: "Example social media posts",
        },
      ],
    });
    return;
  }

  // ── GET /api/plugins ────────────────────────────────────────────────────
  if (method === "GET" && pathname === "/api/plugins") {
    // Include any user-installed plugins in the unified list so their setup
    // UI and enable/disable toggles work the same as bundled plugins.
    mergeInstalledPluginsIntoState(state);

    // Keep enabled status sourced from persisted config/user selection.
    // Runtime plugin snapshots can lag during restarts and cause UI toggles
    // (especially model/memory) to appear to "flip back".

    // Always refresh current env values and re-validate
    for (const plugin of state.plugins) {
      for (const param of plugin.parameters) {
        const envValue = process.env[param.key];
        param.isSet = Boolean(envValue && envValue.trim());
        param.currentValue = param.isSet
          ? param.sensitive
            ? maskValue(envValue!)
            : envValue!
          : null;
      }
      const paramInfos: PluginParamInfo[] = plugin.parameters.map((p) => ({
        key: p.key,
        required: p.required,
        sensitive: p.sensitive,
        type: p.type,
        description: p.description,
        default: p.default,
      }));
      const validation = validatePluginConfig(
        plugin.id,
        plugin.category,
        plugin.envKey,
        plugin.configKeys,
        undefined,
        paramInfos,
      );
      plugin.validationErrors = validation.errors;
      plugin.validationWarnings = validation.warnings;

      // Runtime reachability checks for local providers.
      if (plugin.id === "ollama" && plugin.enabled) {
        const endpoint = (
          process.env.OLLAMA_API_ENDPOINT ??
          process.env.OLLAMA_BASE_URL ??
          "http://localhost:11434"
        ).trim();
        const reachable = await isOllamaReachable(endpoint, 300);
        if (!reachable) {
          // Fail-closed for chat: Ollama cannot work if the local server isn't running.
          const existing = plugin.validationErrors.some(
            (e) => e.field === "OLLAMA_API_ENDPOINT",
          );
          if (!existing) {
            plugin.validationErrors.push({
              field: "OLLAMA_API_ENDPOINT",
              message: `Ollama is not reachable at ${endpoint}. Install and run Ollama on this device, then restart Milaidy.`,
            });
          }
        }
      }
    }

    json(res, { plugins: state.plugins });
    return;
  }

  // ── PUT /api/plugins/:id ────────────────────────────────────────────────
  if (method === "PUT" && pathname.startsWith("/api/plugins/")) {
    const pluginId = pathname.slice("/api/plugins/".length);
    const body = await readJsonBody<{
      enabled?: boolean;
      config?: Record<string, string>;
    }>(req, res);
    if (!body) return;

    const plugin = state.plugins.find((p) => p.id === pluginId);
    if (!plugin) {
      error(res, `Plugin "${pluginId}" not found`, 404);
      return;
    }

    if (body.enabled !== undefined) {
      plugin.enabled = body.enabled;
      if (body.enabled && plugin.category === "ai-provider") {
        setSingleEnabledAiProviderInState(state.plugins, plugin.id);
      }
    }
    if (body.config) {
      // Server-side safety: keep known duplicate credential fields in sync so
      // clients can provide only one of the pair.
      if (typeof body.config === "object" && body.config) {
        const cfg = body.config as Record<string, unknown>;
        if (pluginId === "openai") {
          const api =
            typeof cfg.OPENAI_API_KEY === "string"
              ? cfg.OPENAI_API_KEY.trim()
              : "";
          const emb =
            typeof cfg.OPENAI_EMBEDDING_API_KEY === "string"
              ? cfg.OPENAI_EMBEDDING_API_KEY.trim()
              : "";
          if (api && !emb) cfg.OPENAI_EMBEDDING_API_KEY = api;
          if (emb && !api) cfg.OPENAI_API_KEY = emb;
        } else if (pluginId === "vercel-ai-gateway") {
          const a =
            typeof cfg.AI_GATEWAY_API_KEY === "string"
              ? cfg.AI_GATEWAY_API_KEY.trim()
              : "";
          const b =
            typeof cfg.AIGATEWAY_API_KEY === "string"
              ? cfg.AIGATEWAY_API_KEY.trim()
              : "";
          if (a && !b) cfg.AIGATEWAY_API_KEY = a;
          if (b && !a) cfg.AI_GATEWAY_API_KEY = b;
        }
      }

      const pluginParamInfos: PluginParamInfo[] = plugin.parameters.map(
        (p) => ({
          key: p.key,
          required: p.required,
          sensitive: p.sensitive,
          type: p.type,
          description: p.description,
          default: p.default,
        }),
      );
      const configValidation = validatePluginConfig(
        pluginId,
        plugin.category,
        plugin.envKey,
        Object.keys(body.config),
        body.config,
        pluginParamInfos,
      );

      if (!configValidation.valid) {
        json(
          res,
          { ok: false, plugin, validationErrors: configValidation.errors },
          422,
        );
        return;
      }

      for (const [key, value] of Object.entries(body.config)) {
        if (typeof value === "string" && value.trim()) {
          process.env[key] = value;
        }
      }
      plugin.configured = true;
      if (plugin.category === "ai-provider") {
        plugin.enabled = true;
        setSingleEnabledAiProviderInState(state.plugins, plugin.id);
      }
    }

    // Persist plugin settings to config
    try {
      const nextConfig = state.config;
      nextConfig.plugins ??= {};
      nextConfig.plugins.entries ??= {};
      const entry = (nextConfig.plugins.entries[pluginId] ??= {});
      if (body.enabled !== undefined) {
        entry.enabled = body.enabled;
        if (body.enabled && plugin.category === "ai-provider") {
          setSingleEnabledAiProviderInConfig(nextConfig, plugin.id);
        }
      }
      if (body.config) {
        entry.config = {
          ...(entry.config ?? {}),
          ...body.config,
        };
        if (plugin.category === "ai-provider") {
          setSingleEnabledAiProviderInConfig(nextConfig, plugin.id);
        }
      }
      saveMilaidyConfig(nextConfig);
      state.config = nextConfig;
    } catch (err) {
      logger.warn(
        `[milaidy-api] Failed to persist plugin config: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    // Refresh validation
    const refreshParamInfos: PluginParamInfo[] = plugin.parameters.map((p) => ({
      key: p.key,
      required: p.required,
      sensitive: p.sensitive,
      type: p.type,
      description: p.description,
      default: p.default,
    }));
    const updated = validatePluginConfig(
      pluginId,
      plugin.category,
      plugin.envKey,
      plugin.configKeys,
      undefined,
      refreshParamInfos,
    );
    plugin.validationErrors = updated.errors;
    plugin.validationWarnings = updated.warnings;

    json(res, { ok: true, plugin });
    return;
  }

  // ── GET /api/registry/plugins ──────────────────────────────────────────
  if (method === "GET" && pathname === "/api/registry/plugins") {
    const { getRegistryPlugins } = await import(
      "../services/registry-client.js"
    );
    try {
      const registry = await getRegistryPlugins();
      const plugins = Array.from(registry.values());
      json(res, { count: plugins.length, plugins });
    } catch (err) {
      error(
        res,
        `Failed to fetch registry: ${err instanceof Error ? err.message : String(err)}`,
        502,
      );
    }
    return;
  }

  // ── GET /api/registry/plugins/:name ─────────────────────────────────────
  if (
    method === "GET" &&
    pathname.startsWith("/api/registry/plugins/") &&
    pathname.length > "/api/registry/plugins/".length
  ) {
    const name = decodeURIComponent(
      pathname.slice("/api/registry/plugins/".length),
    );
    const { getPluginInfo } = await import("../services/registry-client.js");

    try {
      const info = await getPluginInfo(name);
      if (!info) {
        error(res, `Plugin "${name}" not found in registry`, 404);
        return;
      }
      json(res, { plugin: info });
    } catch (err) {
      error(
        res,
        `Failed to look up plugin: ${err instanceof Error ? err.message : String(err)}`,
        502,
      );
    }
    return;
  }

  // ── GET /api/registry/search?q=... ──────────────────────────────────────
  if (method === "GET" && pathname === "/api/registry/search") {
    const query = url.searchParams.get("q") || "";
    if (!query.trim()) {
      error(res, "Query parameter 'q' is required", 400);
      return;
    }

    const { searchPlugins } = await import("../services/registry-client.js");

    try {
      const limitParam = url.searchParams.get("limit");
      const limit = limitParam
        ? Math.min(Math.max(Number(limitParam), 1), 50)
        : 15;
      const results = await searchPlugins(query, limit);
      json(res, { query, count: results.length, results });
    } catch (err) {
      error(
        res,
        `Search failed: ${err instanceof Error ? err.message : String(err)}`,
        502,
      );
    }
    return;
  }

  // ── POST /api/registry/refresh ──────────────────────────────────────────
  if (method === "POST" && pathname === "/api/registry/refresh") {
    const { refreshRegistry } = await import("../services/registry-client.js");

    try {
      const registry = await refreshRegistry();
      json(res, { ok: true, count: registry.size });
    } catch (err) {
      error(
        res,
        `Refresh failed: ${err instanceof Error ? err.message : String(err)}`,
        502,
      );
    }
    return;
  }

  // ── POST /api/plugins/install ───────────────────────────────────────────
  // Install a plugin from the registry and restart the agent.
  if (method === "POST" && pathname === "/api/plugins/install") {
    const body = await readJsonBody<{ name: string; autoRestart?: boolean }>(
      req,
      res,
    );
    if (!body) return;
    const pluginName = body.name?.trim();

    if (!pluginName) {
      error(res, "Request body must include 'name' (plugin package name)", 400);
      return;
    }

    const { installPlugin } = await import("../services/plugin-installer.js");

    try {
      const result = await installPlugin(pluginName, (progress) => {
        logger.info(`[install] ${progress.phase}: ${progress.message}`);
      });

      if (!result.success) {
        json(res, { ok: false, error: result.error }, 422);
        return;
      }

      // If autoRestart is not explicitly false, restart the agent
      if (body.autoRestart !== false && result.requiresRestart) {
        const { requestRestart } = await import("../runtime/restart.js");
        // Defer the restart so the HTTP response is sent first
        setTimeout(() => {
          Promise.resolve(
            requestRestart(`Plugin ${result.pluginName} installed`),
          ).catch((err) => {
            logger.error(
              `[api] Restart after install failed: ${err instanceof Error ? err.message : String(err)}`,
            );
          });
        }, 500);
      }

      json(res, {
        ok: true,
        plugin: {
          name: result.pluginName,
          version: result.version,
          installPath: result.installPath,
        },
        requiresRestart: result.requiresRestart,
        message: result.requiresRestart
          ? `${result.pluginName} installed. Agent will restart to load it.`
          : `${result.pluginName} installed.`,
      });
    } catch (err) {
      error(
        res,
        `Install failed: ${err instanceof Error ? err.message : String(err)}`,
        500,
      );
    }
    return;
  }

  // ── POST /api/plugins/uninstall ─────────────────────────────────────────
  if (method === "POST" && pathname === "/api/plugins/uninstall") {
    const body = await readJsonBody<{ name: string; autoRestart?: boolean }>(
      req,
      res,
    );
    if (!body) return;
    const pluginName = body.name?.trim();

    if (!pluginName) {
      error(res, "Request body must include 'name' (plugin package name)", 400);
      return;
    }

    const { uninstallPlugin } = await import("../services/plugin-installer.js");

    try {
      const result = await uninstallPlugin(pluginName);

      if (!result.success) {
        json(res, { ok: false, error: result.error }, 422);
        return;
      }

      if (body.autoRestart !== false && result.requiresRestart) {
        const { requestRestart } = await import("../runtime/restart.js");
        setTimeout(() => {
          Promise.resolve(
            requestRestart(`Plugin ${pluginName} uninstalled`),
          ).catch((err) => {
            logger.error(
              `[api] Restart after uninstall failed: ${err instanceof Error ? err.message : String(err)}`,
            );
          });
        }, 500);
      }

      json(res, {
        ok: true,
        pluginName: result.pluginName,
        requiresRestart: result.requiresRestart,
        message: result.requiresRestart
          ? `${pluginName} uninstalled. Agent will restart.`
          : `${pluginName} uninstalled.`,
      });
    } catch (err) {
      error(
        res,
        `Uninstall failed: ${err instanceof Error ? err.message : String(err)}`,
        500,
      );
    }
    return;
  }

  // ── GET /api/plugins/installed ──────────────────────────────────────────
  // List plugins that were installed from the registry at runtime.
  if (method === "GET" && pathname === "/api/plugins/installed") {
    const { listInstalledPlugins } = await import(
      "../services/plugin-installer.js"
    );

    try {
      const installed = await listInstalledPlugins();
      json(res, { count: installed.length, plugins: installed });
    } catch (err) {
      error(
        res,
        `Failed to list installed plugins: ${err instanceof Error ? err.message : String(err)}`,
        500,
      );
    }
    return;
  }

  // ── GET /api/skills ─────────────────────────────────────────────────────
  if (method === "GET" && pathname === "/api/skills") {
    json(res, { skills: state.skills });
    return;
  }

  // ── POST /api/skills/refresh ──────────────────────────────────────────
  if (method === "POST" && pathname === "/api/skills/refresh") {
    try {
      const workspaceDir =
        state.config.agents?.defaults?.workspace ??
        resolveDefaultAgentWorkspaceDir();
      state.skills = await discoverSkills(
        workspaceDir,
        state.config,
        state.runtime,
      );
      json(res, { ok: true, skills: state.skills });
    } catch (err) {
      error(
        res,
        `Failed to refresh skills: ${err instanceof Error ? err.message : err}`,
        500,
      );
    }
    return;
  }

  // ── PUT /api/skills/:id ────────────────────────────────────────────────
  if (method === "PUT" && pathname.startsWith("/api/skills/")) {
    const skillId = decodeURIComponent(pathname.slice("/api/skills/".length));
    const body = await readJsonBody<{ enabled?: boolean }>(req, res);
    if (!body) return;

    const skill = state.skills.find((s) => s.id === skillId);
    if (!skill) {
      error(res, `Skill "${skillId}" not found`, 404);
      return;
    }

    if (body.enabled !== undefined) {
      skill.enabled = body.enabled;

      // Persist to the agent's database (cache table, scoped per-agent)
      if (state.runtime) {
        const prefs = await loadSkillPreferences(state.runtime);
        prefs[skillId] = body.enabled;
        await saveSkillPreferences(state.runtime, prefs);
      }
    }

    json(res, { ok: true, skill });
    return;
  }

  // ── GET /api/logs ───────────────────────────────────────────────────────
  if (method === "GET" && pathname === "/api/logs") {
    let entries = state.logBuffer;

    const sourceFilter = url.searchParams.get("source");
    if (sourceFilter)
      entries = entries.filter((e) => e.source === sourceFilter);

    const levelFilter = url.searchParams.get("level");
    if (levelFilter) entries = entries.filter((e) => e.level === levelFilter);

    const sinceFilter = url.searchParams.get("since");
    if (sinceFilter) {
      const sinceTs = Number(sinceFilter);
      if (!Number.isNaN(sinceTs))
        entries = entries.filter((e) => e.timestamp >= sinceTs);
    }

    const sources = [...new Set(state.logBuffer.map((e) => e.source))].sort();
    json(res, { entries: entries.slice(-200), sources });
    return;
  }

  // ── GET /api/extension/status ─────────────────────────────────────────
  // Check if the Chrome extension relay server is reachable.
  if (method === "GET" && pathname === "/api/extension/status") {
    const relayPort = 18792;
    let relayReachable = false;
    try {
      const resp = await fetch(`http://127.0.0.1:${relayPort}/`, {
        method: "HEAD",
        signal: AbortSignal.timeout(2000),
      });
      relayReachable = resp.ok || resp.status < 500;
    } catch {
      relayReachable = false;
    }

    // Resolve extension path for UI without exposing local username/home path.
    let extensionPath: string | null = null;
    try {
      const serverDir = path.dirname(new URL(import.meta.url).pathname);
      const absoluteExtensionPath = path.resolve(
        serverDir,
        "..",
        "..",
        "apps",
        "chrome-extension",
      );
      extensionPath = fs.existsSync(absoluteExtensionPath)
        ? "apps/chrome-extension"
        : null;
    } catch {
      // ignore
    }

    json(res, { relayReachable, relayPort, extensionPath });
    return;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Wallet / Inventory routes
  // ═══════════════════════════════════════════════════════════════════════

  // ── GET /api/polymarket/portfolio ─────────────────────────────────────
  if (method === "GET" && pathname === "/api/polymarket/portfolio") {
    const addrs = getEffectiveConnectedWalletAddresses(req);
    const wallet = addrs.evmAddress ?? addrs.solanaAddress ?? null;

    const empty: PolymarketPortfolioResponse = {
      wallet,
      connected: false,
      availableBalanceUsd: null,
      openExposureUsd: null,
      unsettledPnlUsd: null,
      openPositionsCount: 0,
      positions: [],
    };

    if (!addrs.evmAddress) {
      json(res, empty);
      return;
    }

    const encodedWallet = encodeURIComponent(addrs.evmAddress);
    // Public data API endpoints; when unavailable, we return graceful nulls.
    const positionsUrl = `https://data-api.polymarket.com/positions?user=${encodedWallet}&sizeThreshold=0`;
    const valueUrl = `https://data-api.polymarket.com/value?user=${encodedWallet}`;
    const [positionsData, valueData] = await Promise.all([
      fetchJsonTimeout<unknown[]>(positionsUrl, 5500),
      fetchJsonTimeout<Record<string, unknown>>(valueUrl, 4500),
    ]);

    const positions: PolymarketPositionSummary[] = Array.isArray(positionsData)
      ? positionsData
          .map((p) => {
            const row = p as Record<string, unknown>;
            const market =
              (typeof row.question === "string" && row.question) ||
              (typeof row.market === "string" && row.market) ||
              (typeof row.title === "string" && row.title) ||
              "Polymarket market";
            const outcome =
              (typeof row.outcome === "string" && row.outcome) ||
              (typeof row.outcomeName === "string" && row.outcomeName) ||
              "—";
            const sizeUsd =
              toFiniteNumber(row.size) ??
              toFiniteNumber(row.sizeUsd) ??
              toFiniteNumber(row.amount) ??
              0;
            const currentValueUsd =
              toFiniteNumber(row.currentValue) ??
              toFiniteNumber(row.value) ??
              sizeUsd;
            const pnlUsd =
              toFiniteNumber(row.cashPnl) ??
              toFiniteNumber(row.pnl) ??
              currentValueUsd - sizeUsd;
            const updatedAt =
              (typeof row.updatedAt === "string" && row.updatedAt) ||
              (typeof row.lastUpdated === "string" && row.lastUpdated) ||
              null;
            if (sizeUsd <= 0 && currentValueUsd <= 0) return null;
            return {
              market,
              outcome,
              sizeUsd,
              currentValueUsd,
              pnlUsd,
              updatedAt,
            };
          })
          .filter((p): p is PolymarketPositionSummary => p != null)
      : [];

    const openExposureUsd = positions.reduce(
      (sum, p) => sum + p.currentValueUsd,
      0,
    );
    const unsettledPnlUsd = positions.reduce((sum, p) => sum + p.pnlUsd, 0);

    const availableBalanceUsd =
      toFiniteNumber(valueData?.balance) ??
      toFiniteNumber(valueData?.availableBalance) ??
      toFiniteNumber(valueData?.available) ??
      null;

    json(res, {
      wallet: addrs.evmAddress,
      connected: true,
      availableBalanceUsd,
      openExposureUsd: positions.length > 0 ? openExposureUsd : null,
      unsettledPnlUsd: positions.length > 0 ? unsettledPnlUsd : null,
      openPositionsCount: positions.length,
      positions,
    } satisfies PolymarketPortfolioResponse);
    return;
  }

  // ── GET /api/wallet/addresses ──────────────────────────────────────────
  if (method === "GET" && pathname === "/api/wallet/addresses") {
    const addrs = getEffectiveConnectedWalletAddresses(req);
    json(res, addrs);
    return;
  }

  // ── GET /api/wallet/balances ───────────────────────────────────────────
  if (method === "GET" && pathname === "/api/wallet/balances") {
    const addrs = getEffectiveConnectedWalletAddresses(req);
    const alchemyKey = process.env.ALCHEMY_API_KEY;
    const heliusKey = process.env.HELIUS_API_KEY;

    const result: WalletBalancesResponse = { evm: null, solana: null };

    if (addrs.evmAddress) {
      try {
        const chains = alchemyKey
          ? await fetchEvmBalances(addrs.evmAddress, alchemyKey)
          : await fetchEvmBalancesPublic(addrs.evmAddress);
        result.evm = { address: addrs.evmAddress, chains };
      } catch (err) {
        logger.warn(`[wallet] EVM balance fetch failed: ${err}`);
      }
    }

    if (addrs.solanaAddress) {
      try {
        const solData = heliusKey
          ? await fetchSolanaBalances(addrs.solanaAddress, heliusKey)
          : await fetchSolanaBalancePublic(addrs.solanaAddress);
        result.solana = { address: addrs.solanaAddress, ...solData };
      } catch (err) {
        logger.warn(`[wallet] Solana balance fetch failed: ${err}`);
      }
    }

    json(res, result);
    return;
  }

  // ── GET /api/wallet/nfts ───────────────────────────────────────────────
  if (method === "GET" && pathname === "/api/wallet/nfts") {
    const addrs = getEffectiveConnectedWalletAddresses(req);
    const alchemyKey = process.env.ALCHEMY_API_KEY;
    const heliusKey = process.env.HELIUS_API_KEY;

    const result: WalletNftsResponse = { evm: [], solana: null };

    if (addrs.evmAddress && alchemyKey) {
      try {
        result.evm = await fetchEvmNfts(addrs.evmAddress, alchemyKey);
      } catch (err) {
        logger.warn(`[wallet] EVM NFT fetch failed: ${err}`);
      }
    }

    if (addrs.solanaAddress && heliusKey) {
      try {
        const nfts = await fetchSolanaNfts(addrs.solanaAddress, heliusKey);
        result.solana = { nfts };
      } catch (err) {
        logger.warn(`[wallet] Solana NFT fetch failed: ${err}`);
      }
    }

    json(res, result);
    return;
  }

  // ── GET /api/wallet/connected-data ────────────────────────────────────
  // Unified account-scoped wallet snapshot for UI reads.
  if (method === "GET" && pathname === "/api/wallet/connected-data") {
    const userCtx = getOptionalMultiUserContextFromBearer(req);
    const addrs = getEffectiveConnectedWalletAddresses(req);
    const alchemyKey = process.env.ALCHEMY_API_KEY;
    const heliusKey = process.env.HELIUS_API_KEY;

    const balances: WalletBalancesResponse = { evm: null, solana: null };
    const nfts: WalletNftsResponse = { evm: [], solana: null };

    if (addrs.evmAddress) {
      try {
        const chains = alchemyKey
          ? await fetchEvmBalances(addrs.evmAddress, alchemyKey)
          : await fetchEvmBalancesPublic(addrs.evmAddress);
        balances.evm = { address: addrs.evmAddress, chains };
      } catch (err) {
        logger.warn(`[wallet] unified EVM balance fetch failed: ${err}`);
      }
      if (alchemyKey) {
        try {
          nfts.evm = await fetchEvmNfts(addrs.evmAddress, alchemyKey);
        } catch (err) {
          logger.warn(`[wallet] unified EVM NFT fetch failed: ${err}`);
        }
      }
    }

    if (addrs.solanaAddress) {
      try {
        const solData = heliusKey
          ? await fetchSolanaBalances(addrs.solanaAddress, heliusKey)
          : await fetchSolanaBalancePublic(addrs.solanaAddress);
        balances.solana = { address: addrs.solanaAddress, ...solData };
      } catch (err) {
        logger.warn(`[wallet] unified Solana balance fetch failed: ${err}`);
      }
      if (heliusKey) {
        try {
          const solNfts = await fetchSolanaNfts(addrs.solanaAddress, heliusKey);
          nfts.solana = { nfts: solNfts };
        } catch (err) {
          logger.warn(`[wallet] unified Solana NFT fetch failed: ${err}`);
        }
      }
    }

    const polymarketWallet = addrs.evmAddress ?? addrs.solanaAddress ?? null;
    let polymarket: PolymarketPortfolioResponse = {
      wallet: polymarketWallet,
      connected: false,
      availableBalanceUsd: null,
      openExposureUsd: null,
      unsettledPnlUsd: null,
      openPositionsCount: 0,
      positions: [],
    };
    if (addrs.evmAddress) {
      const encodedWallet = encodeURIComponent(addrs.evmAddress);
      const positionsUrl = `https://data-api.polymarket.com/positions?user=${encodedWallet}&sizeThreshold=0`;
      const valueUrl = `https://data-api.polymarket.com/value?user=${encodedWallet}`;
      const [positionsData, valueData] = await Promise.all([
        fetchJsonTimeout<unknown[]>(positionsUrl, 5500),
        fetchJsonTimeout<Record<string, unknown>>(valueUrl, 4500),
      ]);
      const positions: PolymarketPositionSummary[] = Array.isArray(
        positionsData,
      )
        ? positionsData
            .map((p) => {
              const row = p as Record<string, unknown>;
              const market =
                (typeof row.question === "string" && row.question) ||
                (typeof row.market === "string" && row.market) ||
                (typeof row.title === "string" && row.title) ||
                "Polymarket market";
              const outcome =
                (typeof row.outcome === "string" && row.outcome) ||
                (typeof row.outcomeName === "string" && row.outcomeName) ||
                "—";
              const sizeUsd =
                toFiniteNumber(row.size) ??
                toFiniteNumber(row.sizeUsd) ??
                toFiniteNumber(row.amount) ??
                0;
              const currentValueUsd =
                toFiniteNumber(row.currentValue) ??
                toFiniteNumber(row.value) ??
                sizeUsd;
              const pnlUsd =
                toFiniteNumber(row.cashPnl) ??
                toFiniteNumber(row.pnl) ??
                currentValueUsd - sizeUsd;
              const updatedAt =
                (typeof row.updatedAt === "string" && row.updatedAt) ||
                (typeof row.lastUpdated === "string" && row.lastUpdated) ||
                null;
              if (sizeUsd <= 0 && currentValueUsd <= 0) return null;
              return {
                market,
                outcome,
                sizeUsd,
                currentValueUsd,
                pnlUsd,
                updatedAt,
              };
            })
            .filter((p): p is PolymarketPositionSummary => p != null)
        : [];
      polymarket = {
        wallet: addrs.evmAddress,
        connected: true,
        availableBalanceUsd:
          toFiniteNumber(valueData?.balance) ??
          toFiniteNumber(valueData?.availableBalance) ??
          toFiniteNumber(valueData?.available) ??
          null,
        openExposureUsd:
          positions.length > 0
            ? positions.reduce((sum, p) => sum + p.currentValueUsd, 0)
            : null,
        unsettledPnlUsd:
          positions.length > 0
            ? positions.reduce((sum, p) => sum + p.pnlUsd, 0)
            : null,
        openPositionsCount: positions.length,
        positions,
      };
    }

    const configuredHandle = getConfiguredUiHandle(state.config);
    json(res, {
      account: userCtx
        ? {
            mode: "user",
            userId: userCtx.userId,
            displayName: userCtx.displayName,
            username:
              configuredHandle ??
              (userCtx.displayName.startsWith("@")
                ? userCtx.displayName
                : `@${userCtx.displayName}`),
          }
        : { mode: "server", username: configuredHandle },
      addresses: addrs,
      balances,
      nfts,
      polymarket,
    });
    return;
  }

  // ── POST /api/wallet/import ──────────────────────────────────────────
  // Import a wallet by providing a private key + chain.
  if (method === "POST" && pathname === "/api/wallet/import") {
    const body = await readJsonBody<{ chain?: string; privateKey?: string }>(
      req,
      res,
    );
    if (!body) return;

    const userCtx = getOptionalMultiUserContextFromBearer(req);
    if (userCtx) {
      error(
        res,
        "Wallet import is disabled for user-scoped sessions. Connect a public wallet address instead.",
        403,
      );
      return;
    }

    const currentConnected = getEffectiveConnectedWalletAddresses(req);
    if (currentConnected.evmAddress || currentConnected.solanaAddress) {
      error(
        res,
        "A wallet is already connected. Disconnect it before importing another wallet.",
        409,
      );
      return;
    }

    if (!body.privateKey?.trim()) {
      error(res, "privateKey is required");
      return;
    }

    // Auto-detect chain if not specified
    let chain: WalletChain;
    if (body.chain === "evm" || body.chain === "solana") {
      chain = body.chain;
    } else if (body.chain) {
      error(
        res,
        `Unsupported chain: ${body.chain}. Must be "evm" or "solana".`,
      );
      return;
    } else {
      // Auto-detect from key format
      const detection = validatePrivateKey(body.privateKey.trim());
      chain = detection.chain;
    }

    const result = importWallet(chain, body.privateKey.trim());

    if (!result.success) {
      error(res, result.error ?? "Import failed", 422);
      return;
    }

    // Keep private keys only in process env; do not persist to config on disk.
    if (!state.config.env) state.config.env = {};

    // Set imported wallet as the active connected wallet and enforce single-wallet mode.
    if (chain === "evm") {
      process.env.EVM_ADDRESS = result.address ?? "";
      delete process.env.SOLANA_ADDRESS;
      (state.config.env as Record<string, string>).EVM_ADDRESS =
        result.address ?? "";
      delete (state.config.env as Record<string, string>).SOLANA_ADDRESS;
    } else {
      process.env.SOLANA_ADDRESS = result.address ?? "";
      delete process.env.EVM_ADDRESS;
      (state.config.env as Record<string, string>).SOLANA_ADDRESS =
        result.address ?? "";
      delete (state.config.env as Record<string, string>).EVM_ADDRESS;
    }

    try {
      saveMilaidyConfig(state.config);
    } catch {
      // Config path may not be writable in test environments
    }

    json(res, {
      ok: true,
      chain,
      address: result.address,
    });
    return;
  }

  // ── POST /api/wallet/generate ──────────────────────────────────────────
  // Generate a new wallet for a specific chain (or both).
  if (method === "POST" && pathname === "/api/wallet/generate") {
    const body = await readJsonBody<{ chain?: string }>(req, res);
    if (!body) return;

    const userCtx = getOptionalMultiUserContextFromBearer(req);
    if (userCtx) {
      error(
        res,
        "Wallet generation is disabled for user-scoped sessions. Connect a public wallet address instead.",
        403,
      );
      return;
    }

    const currentConnected = getEffectiveConnectedWalletAddresses(req);
    if (currentConnected.evmAddress || currentConnected.solanaAddress) {
      error(
        res,
        "A wallet is already connected. Disconnect it before creating another wallet.",
        409,
      );
      return;
    }

    const chain = body.chain as string | undefined;
    const validChains: Array<WalletChain | "both"> = ["evm", "solana", "both"];

    if (chain && !validChains.includes(chain as WalletChain | "both")) {
      error(
        res,
        `Unsupported chain: ${chain}. Must be "evm", "solana", or "both".`,
      );
      return;
    }

    const targetChain = (chain ?? "both") as WalletChain | "both";

    if (!state.config.env) state.config.env = {};

    const generated: Array<{ chain: WalletChain; address: string }> = [];

    if (targetChain === "both" || targetChain === "evm") {
      const result = generateWalletForChain("evm");
      process.env.EVM_PRIVATE_KEY = result.privateKey;
      generated.push({ chain: "evm", address: result.address });
      logger.info(`[milaidy-api] Generated EVM wallet: ${result.address}`);
      // Set as active connected wallet when generating a single-chain wallet.
      if (targetChain === "evm") {
        process.env.EVM_ADDRESS = result.address;
        delete process.env.SOLANA_ADDRESS;
        (state.config.env as Record<string, string>).EVM_ADDRESS =
          result.address;
        delete (state.config.env as Record<string, string>).SOLANA_ADDRESS;
      }
    }

    if (targetChain === "both" || targetChain === "solana") {
      const result = generateWalletForChain("solana");
      process.env.SOLANA_PRIVATE_KEY = result.privateKey;
      generated.push({ chain: "solana", address: result.address });
      logger.info(`[milaidy-api] Generated Solana wallet: ${result.address}`);
      // Set as active connected wallet when generating a single-chain wallet.
      if (targetChain === "solana") {
        process.env.SOLANA_ADDRESS = result.address;
        delete process.env.EVM_ADDRESS;
        (state.config.env as Record<string, string>).SOLANA_ADDRESS =
          result.address;
        delete (state.config.env as Record<string, string>).EVM_ADDRESS;
      }
    }

    try {
      saveMilaidyConfig(state.config);
    } catch {
      // Config path may not be writable in test environments
    }

    json(res, { ok: true, wallets: generated });
    return;
  }

  // ── GET /api/wallet/config ─────────────────────────────────────────────
  if (method === "GET" && pathname === "/api/wallet/config") {
    const addrs = getEffectiveConnectedWalletAddresses(req);
    const evmConfiguredAddress = addrs.evmAddress;
    const solanaConfiguredAddress = addrs.solanaAddress;
    const walletConnectionLocked = Boolean(
      evmConfiguredAddress || solanaConfiguredAddress,
    );
    const configStatus: WalletConfigStatus = {
      alchemyKeySet: Boolean(process.env.ALCHEMY_API_KEY),
      heliusKeySet: Boolean(process.env.HELIUS_API_KEY),
      birdeyeKeySet: Boolean(process.env.BIRDEYE_API_KEY),
      evmPublicSource: Boolean(addrs.evmAddress),
      solanaPublicSource: Boolean(addrs.solanaAddress),
      pricePublicSource: Boolean(
        process.env.HELIUS_API_KEY || process.env.BIRDEYE_API_KEY,
      ),
      solanaWalletConnected: Boolean(solanaConfiguredAddress),
      walletConnectionLocked,
      evmConfiguredAddress,
      solanaConfiguredAddress,
      evmSigningEnabled: Boolean(process.env.EVM_PRIVATE_KEY),
      solanaSigningEnabled: Boolean(process.env.SOLANA_PRIVATE_KEY),
      evmChains: ["Ethereum", "Base", "Arbitrum", "Optimism", "Polygon"],
      evmAddress: addrs.evmAddress,
      solanaAddress: addrs.solanaAddress,
      walletExportEnabled: process.env.MILAIDY_ALLOW_WALLET_EXPORT === "1",
    };
    json(res, configStatus);
    return;
  }

  // ── PUT /api/wallet/config ─────────────────────────────────────────────
  if (method === "PUT" && pathname === "/api/wallet/config") {
    const body = await readJsonBody<Record<string, string>>(req, res);
    if (!body) return;
    const nextEvmAddress =
      typeof body.EVM_ADDRESS === "string"
        ? normalizeConfiguredEvmAddress(body.EVM_ADDRESS)
        : null;
    const nextSolanaAddress =
      typeof body.SOLANA_ADDRESS === "string"
        ? normalizeConfiguredSolanaAddress(body.SOLANA_ADDRESS)
        : null;

    if (
      typeof body.EVM_ADDRESS === "string" &&
      body.EVM_ADDRESS.trim() &&
      !nextEvmAddress
    ) {
      error(res, "Invalid EVM_ADDRESS format", 422);
      return;
    }
    if (
      typeof body.SOLANA_ADDRESS === "string" &&
      body.SOLANA_ADDRESS.trim() &&
      !nextSolanaAddress
    ) {
      error(res, "Invalid SOLANA_ADDRESS format", 422);
      return;
    }
    if (nextEvmAddress && nextSolanaAddress) {
      error(
        res,
        "Connect one wallet at a time. Provide EVM_ADDRESS or SOLANA_ADDRESS, not both.",
        422,
      );
      return;
    }

    const userCtx = getOptionalMultiUserContextFromBearer(req);
    const connected = getEffectiveConnectedWalletAddresses(req);
    const hasConnected = Boolean(
      connected.evmAddress || connected.solanaAddress,
    );
    const isAddressUpdate = Boolean(nextEvmAddress || nextSolanaAddress);
    if (hasConnected && isAddressUpdate) {
      const sameAsCurrent =
        (nextEvmAddress && nextEvmAddress === connected.evmAddress) ||
        (nextSolanaAddress && nextSolanaAddress === connected.solanaAddress);
      if (!sameAsCurrent) {
        error(
          res,
          "A wallet is already connected. Disconnect it before connecting a different wallet.",
          409,
        );
        return;
      }
    }

    if (userCtx && multiUserService) {
      // User-scoped: persist only wallet addresses per user, never shared infra keys.
      const hasEvmField = Object.prototype.hasOwnProperty.call(
        body,
        "EVM_ADDRESS",
      );
      const hasSolField = Object.prototype.hasOwnProperty.call(
        body,
        "SOLANA_ADDRESS",
      );
      if (hasEvmField || hasSolField) {
        const current = multiUserService.getWalletBinding(userCtx.userId);
        const targetEvm = hasEvmField
          ? (nextEvmAddress ?? null)
          : current.evmAddress;
        const targetSol = hasSolField
          ? (nextSolanaAddress ?? null)
          : current.solanaAddress;
        const unchanged =
          targetEvm === current.evmAddress &&
          targetSol === current.solanaAddress;
        if (!unchanged) {
          multiUserService.setWalletBinding(userCtx.userId, {
            evmAddress: targetEvm,
            solanaAddress: targetSol,
          });
        }
      }
    } else {
      const allowedKeys = [
        "ALCHEMY_API_KEY",
        "HELIUS_API_KEY",
        "BIRDEYE_API_KEY",
        "EVM_ADDRESS",
        "SOLANA_ADDRESS",
      ];

      if (!state.config.env) state.config.env = {};

      for (const key of allowedKeys) {
        const value = body[key];
        if (typeof value === "string" && value.trim()) {
          process.env[key] = value.trim();
          (state.config.env as Record<string, string>)[key] = value.trim();
        }
      }

      // Enforce one active connected wallet at a time.
      if (nextEvmAddress) {
        process.env.EVM_ADDRESS = nextEvmAddress;
        delete process.env.SOLANA_ADDRESS;
        (state.config.env as Record<string, string>).EVM_ADDRESS =
          nextEvmAddress;
        delete (state.config.env as Record<string, string>).SOLANA_ADDRESS;
      } else if (nextSolanaAddress) {
        process.env.SOLANA_ADDRESS = nextSolanaAddress;
        delete process.env.EVM_ADDRESS;
        (state.config.env as Record<string, string>).SOLANA_ADDRESS =
          nextSolanaAddress;
        delete (state.config.env as Record<string, string>).EVM_ADDRESS;
      }

      // If Helius key is set, also update SOLANA_RPC_URL for the plugin
      const heliusValue = body.HELIUS_API_KEY;
      if (typeof heliusValue === "string" && heliusValue.trim()) {
        const rpcUrl = `https://mainnet.helius-rpc.com/?api-key=${heliusValue.trim()}`;
        process.env.SOLANA_RPC_URL = rpcUrl;
        (state.config.env as Record<string, string>).SOLANA_RPC_URL = rpcUrl;
      }

      try {
        saveMilaidyConfig(state.config);
      } catch {
        // Config path may not be writable in test environments
      }
    }

    json(res, { ok: true });
    return;
  }

  // ── POST /api/wallet/disconnect ────────────────────────────────────────
  // Clear connected wallet addresses so a new wallet can be connected.
  // Keep backend signer keys intact to avoid breaking existing agent flows.
  if (method === "POST" && pathname === "/api/wallet/disconnect") {
    const userCtx = getOptionalMultiUserContextFromBearer(req);
    if (userCtx && multiUserService) {
      json(res, multiUserService.clearWalletBinding(userCtx.userId));
      return;
    }

    const keysToClear = ["EVM_ADDRESS", "SOLANA_ADDRESS"];

    for (const key of keysToClear) {
      delete process.env[key];
    }

    if (state.config.env) {
      for (const key of keysToClear) {
        delete (state.config.env as Record<string, string>)[key];
      }
    }

    try {
      saveMilaidyConfig(state.config);
    } catch {
      // Config path may not be writable in test environments
    }

    json(res, { ok: true });
    return;
  }

  // ── POST /api/wallet/export ────────────────────────────────────────────
  // SECURITY: Requires { confirm: true } in the request body to prevent
  // accidental exposure of private keys.
  if (method === "POST" && pathname === "/api/wallet/export") {
    const body = await readJsonBody<{ confirm?: boolean }>(req, res);
    if (!body) return;

    if (!body.confirm) {
      error(
        res,
        'Export requires explicit confirmation. Send { "confirm": true } in the request body.',
        403,
      );
      return;
    }

    if (process.env.MILAIDY_ALLOW_WALLET_EXPORT !== "1") {
      error(res, "Wallet key export is disabled by server policy.", 403);
      return;
    }

    const evmKey = process.env.EVM_PRIVATE_KEY ?? null;
    const solKey = process.env.SOLANA_PRIVATE_KEY ?? null;
    const addrs = getEffectiveConnectedWalletAddresses(req);

    logger.warn("[wallet] Private keys exported via API");

    json(res, {
      evm: evmKey ? { privateKey: evmKey, address: addrs.evmAddress } : null,
      solana: solKey
        ? { privateKey: solKey, address: addrs.solanaAddress }
        : null,
    });
    return;
  }

  // ── GET /api/config ──────────────────────────────────────────────────────
  if (method === "GET" && pathname === "/api/config") {
    json(res, redactConfigForResponse(state.config));
    return;
  }

  // ── PUT /api/config ─────────────────────────────────────────────────────
  if (method === "PUT" && pathname === "/api/config") {
    if (MULTIUSER_ENFORCE_V2_ONLY) {
      error(res, "Config writes are disabled in strict multi-user mode.", 403);
      return;
    }
    const body = await readJsonBody(req, res);
    if (!body) return;
    let patch: Record<string, unknown>;
    try {
      patch = validateSafeConfigPatch(body);
    } catch (err) {
      if (err instanceof MultiUserError) {
        error(res, err.message, err.status);
        return;
      }
      error(res, "Invalid config patch", 422);
      return;
    }
    Object.assign(state.config, patch);
    try {
      saveMilaidyConfig(state.config);
    } catch {
      // In test environments the config path may not be writable — that's fine.
    }
    json(res, redactConfigForResponse(state.config));
    return;
  }

  // ── POST /api/chat ──────────────────────────────────────────────────────
  // Routes messages through the full ElizaOS message pipeline so the agent
  // has conversation memory, context, and always responds (DM + client_chat
  // bypass the shouldRespond LLM evaluation).
  if (method === "POST" && pathname === "/api/chat") {
    const chatRequestStartedAt = Date.now();
    const body = await readJsonBody<{
      text?: string;
      securityContext?: {
        confirmBeforeExecution?: boolean;
        confirmBeforeSpend?: boolean;
        spendGuardEnabled?: boolean;
        polymarketExecutionEnabled?: boolean;
        dailySpendLimitUsd?: number;
        perTradeLimitUsd?: number;
        cooldownSeconds?: number;
      };
    }>(req, res);
    if (!body) return;
    const userText = body.text?.trim();
    const chatSecurityContext = body.securityContext;
    if (!userText) {
      error(res, "text is required");
      return;
    }
    if (userText.length > MAX_CHAT_TEXT_CHARS) {
      error(
        res,
        `text exceeds maximum length (${MAX_CHAT_TEXT_CHARS} chars)`,
        413,
      );
      return;
    }

    // Early hard route: Polymarket market-intel requests should always return
    // live public context and must not depend on wallet/plugin execution setup.
    const recentTurnContext = state.chatRecentTurns
      .slice(-3)
      .map((t) => `${t.user} ${t.assistant}`)
      .join(" ");
    const earlyContext = `${userText} ${recentTurnContext}`.toLowerCase();
    const mentionsPolymarket =
      /\b(polymarket|poly\s*market|ply\s*market|prediction\s*market|poly)\b/i.test(
        earlyContext,
      );
    const wantsHotMarkets =
      /\b(hot|trending|current|popular|live)\b/i.test(earlyContext) &&
      /\b(markets?|bets?|vets?|odds|topics?)\b/i.test(earlyContext);
    const isLiveCorrection =
      /\b(i meant live|meant live|live not|not kive)\b/i.test(userText);
    const wantsIntelOnly =
      !/\b(execute|place|run|for me|on my behalf|connect|setup|configure|enable)\b/i.test(
        earlyContext,
      );
    if (
      mentionsPolymarket &&
      wantsIntelOnly &&
      (wantsHotMarkets || isLiveCorrection)
    ) {
      const topicHint = inferPolymarketTopicHint(earlyContext);
      let markets = await fetchHotPolymarketMarkets(topicHint);
      if (markets.length === 0 && topicHint) {
        markets = await fetchHotPolymarketMarkets(null);
      }
      if (markets.length > 0) {
        const lines: string[] = ["Live Polymarket hot topics right now:"];
        if (topicHint === "sports") {
          lines[0] = "Live Polymarket hot sports topics right now:";
        }
        for (const [index, market] of markets.entries()) {
          const vol =
            market.volumeUsd == null
              ? "n/a"
              : `$${market.volumeUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
          const liq =
            market.liquidityUsd == null
              ? "n/a"
              : `$${market.liquidityUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
          const yesNo =
            market.yesPrice != null && market.noPrice != null
              ? `, YES ${market.yesPrice.toFixed(0)}c / NO ${market.noPrice.toFixed(0)}c`
              : "";
          const endAt = market.endDateIso
            ? `, ends ${new Date(market.endDateIso).toLocaleDateString()}`
            : "";
          lines.push(
            `${index + 1}) ${market.question} (vol ${vol}, liq ${liq}${yesNo}${endAt}${market.active === false ? ", inactive" : ""})`,
          );
        }
        lines.push("Hot = highest live volume/liquidity among active markets.");
        lines.push(
          "If you want execution later, I can prepare entries once setup is enabled.",
        );
        const assistant = lines.join("\n");
        state.chatTurnCount += 1;
        state.chatRecentTurns.push({ user: userText, assistant });
        if (state.chatRecentTurns.length > 12) state.chatRecentTurns.shift();
        json(res, { text: assistant, agentName: state.agentName });
        return;
      }
      const fallback =
        "I couldn’t pull the live Polymarket feed right this second.\n" +
        "Try again in a moment, or send a specific topic (for example: election, fed rates, crypto ETF) and I’ll fetch matching live markets.";
      state.chatTurnCount += 1;
      state.chatRecentTurns.push({ user: userText, assistant: fallback });
      if (state.chatRecentTurns.length > 12) state.chatRecentTurns.shift();
      json(res, { text: fallback, agentName: state.agentName });
      return;
    }

    // Early route: topic-focused polymarket intel (e.g. "poly bet fed rates")
    // should return live matching markets, even without "hot/live" keywords.
    if (mentionsPolymarket && wantsIntelOnly) {
      const topicHint = inferPolymarketTopicHint(earlyContext);
      const userTopicQuery = marketLookupQueryFromUserText(userText);
      const contextTopicQuery = marketLookupQueryFromUserText(earlyContext);
      const looksUseful = (q: string): boolean =>
        q.length >= 3 &&
        !/^(rn|now|today|go|continue|yes continue|poly|polymarket|market|markets|bet|bets)$/i.test(
          q,
        );
      const topicQuery = looksUseful(userTopicQuery)
        ? userTopicQuery
        : looksUseful(contextTopicQuery)
          ? contextTopicQuery
          : "";
      const followThroughIntent =
        /^(go|continue|continue please|yes continue|keep going)$/i.test(
          userText.trim(),
        );
      const queryLooksUseful = looksUseful(topicQuery);
      if (queryLooksUseful) {
        const topicMarkets = await fetchPolymarketMarketContext(
          topicQuery,
          topicHint,
        );
        if (topicMarkets.length > 0) {
          const lines: string[] = [
            `Live Polymarket matches for “${topicQuery}”:`,
          ];
          for (const [index, market] of topicMarkets.entries()) {
            const vol =
              market.volumeUsd == null
                ? "n/a"
                : `$${market.volumeUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
            const liq =
              market.liquidityUsd == null
                ? "n/a"
                : `$${market.liquidityUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
            const yesNo =
              market.yesPrice != null && market.noPrice != null
                ? `, YES ${market.yesPrice.toFixed(0)}c / NO ${market.noPrice.toFixed(0)}c`
                : "";
            lines.push(
              `${index + 1}) ${market.question} (vol ${vol}, liq ${liq}${yesNo})`,
            );
          }
          lines.push(
            "If you want, I can narrow this to top 1-2 setups by liquidity and risk.",
          );
          const assistant = lines.join("\n");
          state.chatTurnCount += 1;
          state.chatRecentTurns.push({ user: userText, assistant });
          if (state.chatRecentTurns.length > 12) state.chatRecentTurns.shift();
          json(res, { text: assistant, agentName: state.agentName });
          return;
        }
      }
      if (followThroughIntent && queryLooksUseful) {
        const topicMarkets = await fetchPolymarketMarketContext(
          topicQuery,
          topicHint,
        );
        if (topicMarkets.length > 0) {
          const lines: string[] = [
            `Continuing with live Polymarket matches for “${topicQuery}”:`,
          ];
          for (const [index, market] of topicMarkets.entries()) {
            const vol =
              market.volumeUsd == null
                ? "n/a"
                : `$${market.volumeUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
            const liq =
              market.liquidityUsd == null
                ? "n/a"
                : `$${market.liquidityUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
            lines.push(`${index + 1}) ${market.question} (vol ${vol}, liq ${liq})`);
          }
          const assistant = lines.join("\n");
          state.chatTurnCount += 1;
          state.chatRecentTurns.push({ user: userText, assistant });
          if (state.chatRecentTurns.length > 12) state.chatRecentTurns.shift();
          json(res, { text: assistant, agentName: state.agentName });
          return;
        }
      }
    }

    const chatUserCtx = getOptionalMultiUserContextFromBearer(req);
    const configuredHandle = getConfiguredUiHandle(state.config);
    const mentionFromDisplayName = (() => {
      const raw = chatUserCtx?.displayName?.trim() ?? "";
      if (!raw) return null;
      const compact = raw.replace(/\s+/g, "");
      if (!compact) return null;
      return compact.startsWith("@") ? compact : `@${compact}`;
    })();
    const usernameForMention = configuredHandle ?? mentionFromDisplayName;
    const coreIntents = classifyCoreIntents(userText);
    const {
      isGenericOpener,
      capabilityIntent,
      toolSafetyReviewIntent,
      socialCheckInIntent,
      genericHowItWorksIntent,
      gettingStartedIntent,
      platformIntent,
      agentOverviewIntent,
      workflowExplainIntent,
      marketsAppsIntent,
      explainPluginsIntent,
      inAppTradeBetAppsIntent,
      securityControlsIntent,
      postSetupExecutionIntent,
      nextStepIntent,
      setupNoTargetIntent,
      planningAdviceIntent,
    } = coreIntents;
    const isLowContext = isLowContextInput(userText, {
      agentOverviewIntent,
      workflowExplainIntent,
    });
    const shouldMentionUsernameOnFirstReply =
      state.chatTurnCount === 0 &&
      isGenericOpener &&
      Boolean(usernameForMention);
    const ambiguousThisIntent =
      /\bwhat this does\b/i.test(userText) &&
      !/\b(milaidy|this platform|the platform|workspace)\b/i.test(userText);
    const globalLower = userText.toLowerCase();
    const lowerUserText = globalLower;
    const lastAssistantTextForFlow =
      [...state.chatRecentTurns]
        .reverse()
        .map((t) => t.assistant)
        .find((txt) => typeof txt === "string" && txt.trim().length > 0) ?? "";
    const continuationAnswerIntent = (() => {
      const trimmed = userText.trim();
      const userIsShort = trimmed.length > 0 && trimmed.length <= 120;
      const explicitContinue =
        /^(continue|continue please|go on|carry on|proceed|yes continue|keep going|do it|run it)$/i.test(
          trimmed,
        );
      const looksLikeConstraintAnswer =
        /\b(no|none|yes|yep|nah|nope|without|with)\b/i.test(trimmed) &&
        /\b(constraint|restriction|limit|allergy|budget|mobility|preference|preferences)\b/i.test(
          `${trimmed} ${lastAssistantTextForFlow}`,
        );
      const priorAskedQuestion =
        /\?\s*$/.test(lastAssistantTextForFlow.trim()) ||
        /\bquick question\b/i.test(lastAssistantTextForFlow) ||
        /\b(any|what)\b.*\b(constraint|restriction|allerg|budget|mobility|preference)\b/i.test(
          lastAssistantTextForFlow,
        );
      return (
        userIsShort &&
        (explicitContinue || (priorAskedQuestion && looksLikeConstraintAnswer))
      );
    })();
    const planningPromptedForRiskHorizon =
      /\b(time horizon|risk level|risk-aware plan)\b/i.test(
        lastAssistantTextForFlow,
      );
    const riskLevelAnswer =
      /\b(low|medium|high|conservative|moderate|aggressive)\b/i.exec(
        userText,
      )?.[1] ?? null;
    const horizonAnswer =
      /\b(\d+\s*(d|day|days|w|week|weeks|m|month|months|y|year|years)|short[- ]term|mid[- ]term|long[- ]term)\b/i.exec(
        userText,
      )?.[1] ?? null;
    const planningFollowupAnswerIntent =
      planningPromptedForRiskHorizon &&
      Boolean(riskLevelAnswer || horizonAnswer) &&
      userText.trim().length <= 120;
    const continueConversationIntent =
      /\b(continue|pick up|resume|where we (were|was) last chatting|where we left off|carry on)\b/i.test(
        userText,
      );
    const hasConcreteFollowupIntent =
      /\b(find|show|list|fetch|lookup|look up|bet|bets|trade|polymarket|market|markets|fed|rates|topic|topics)\b/i.test(
        userText,
      );
    const acknowledgementIntent =
      /^(thanks|thank you|thx|ty|nice|great|awesome|cool|perfect)[!. ]*$/i.test(
        userText.trim(),
      );
    const genericHelpIntent =
      /^(help|help me|can you help|i need help|assist me)[!. ]*$/i.test(
        userText.trim(),
      );
    const resolvePluginTarget = () =>
      resolveComponentTarget(userText, state.plugins, lastAssistantTextForFlow);

    const commitChatTurn = (assistantText: string): void => {
      const assistant = assistantText.trim();
      if (!assistant) return;
      state.chatTurnCount += 1;
      state.chatRecentTurns.push({ user: userText, assistant });
      if (state.chatRecentTurns.length > 12) state.chatRecentTurns.shift();

      if (!state.chatRollingSummary || state.chatTurnCount % 4 === 0) {
        const recent = state.chatRecentTurns.slice(-6);
        const packed = recent
          .map((t, i) => {
            const u = t.user.replace(/\s+/g, " ").slice(0, 140);
            const a = t.assistant.replace(/\s+/g, " ").slice(0, 180);
            return `T${i + 1} U:${u} | A:${a}`;
          })
          .join("\n");
        state.chatRollingSummary = packed.slice(0, 1600);
      }
    };

    const stableHash = (s: string): number => {
      let h = 0;
      for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) | 0;
      return Math.abs(h);
    };
    const chooseVariant = <T>(seed: string, options: readonly T[]): T =>
      options[stableHash(seed) % options.length]!;

    const isPolymarketIntelAsk = (() => {
      const text = `${userText} ${state.chatRecentTurns
        .slice(-3)
        .map((t) => t.user)
        .join(" ")}`.toLowerCase();
      return (
        /\b(polymarket|poly\s*market|ply\s*market|prediction\s*market|poly)\b/i.test(
          text,
        ) &&
        /\b(hot|trending|current|popular|live)\b/i.test(text) &&
        /\b(markets?|bets?|vets?|odds|topics?)\b/i.test(text) &&
        !/\b(execute|place|run|on my behalf|for me)\b/i.test(text)
      );
    })();

    const rewriteDullReply = (inputText: string): string => {
      let out = inputText.trim();
      const providersReady = state.plugins
        .filter(
          (p) =>
            p.category === "ai-provider" &&
            p.enabled &&
            p.validationErrors.length === 0,
        )
        .map((p) => normalizeComponentName(p.name));
      const integrationsReady = state.plugins
        .filter(
          (p) =>
            p.category === "connector" &&
            p.enabled &&
            p.validationErrors.length === 0,
        )
        .map((p) => normalizeComponentName(p.name));

      if (/^tell me your goal in one line/i.test(out)) {
        return (
          "I’m with you. Tell me what outcome you want and I’ll map the next steps.\n" +
          `Ready now: provider=${providersReady.length ? providersReady.join(", ") : "none"}, integrations=${integrationsReady.length ? integrationsReady.join(", ") : "none"}.`
        );
      }

      if (/^understood\.\s*continuing:.*quick plan:/is.test(out)) {
        return (
          "Got it. I’ll keep this practical.\n" +
          "Tell me the exact outcome you want first, and I’ll give the direct path."
        );
      }

      if (
        isPolymarketIntelAsk &&
        /blocked by setup|not ready yet|execution.*blocked|not have live market feeds/i.test(
          out,
        )
      ) {
        const hot = polymarketIntelCache.hot.slice(0, 5);
        if (hot.length > 0) {
          const lines: string[] = ["Live Polymarket hot topics right now:"];
          for (const [index, market] of hot.entries()) {
            const vol =
              market.volumeUsd == null
                ? "n/a"
                : `$${market.volumeUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
            const liq =
              market.liquidityUsd == null
                ? "n/a"
                : `$${market.liquidityUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
            lines.push(`${index + 1}) ${market.question} (vol ${vol}, liq ${liq})`);
          }
          lines.push(
            "If you want execution later, I can prep the same markets once setup is enabled.",
          );
          return lines.join("\n");
        }
        return (
          "I couldn’t load live Polymarket markets right this second.\n" +
          "Try again in a moment, or send a topic (fed rates, election, crypto ETF) and I’ll fetch matching live markets."
        );
      }

      return out;
    };
    const enforcePrecisionReply = (inputText: string): string => {
      let out = inputText.trim().replace(/\n{3,}/g, "\n\n");
      if (!out) return out;

      // Strip meta narration so answers stay direct.
      out = out
        .replace(/^Got it —.*quick summary and next step:\s*/is, "")
        .replace(
          /^Understood\.\s*Continuing:.*I[’']ll answer this directly first, then give the exact follow-up checks\/actions\.\s*/is,
          "",
        );

      // Keep one focused question max for conversational clarity.
      if (!isPolymarketIntelAsk) {
        let seenQuestion = false;
        out = out.replace(/[^?\n]*\?/g, (chunk) => {
          if (!seenQuestion) {
            seenQuestion = true;
            return chunk;
          }
          return chunk.replace(/\?/g, ".");
        });
      }

      // Prevent long generic walls in normal conversation.
      const lines = out.split("\n");
      const numberedListStyle = /\b1\)|2\)|3\)\b/.test(out);
      if (!isPolymarketIntelAsk && !numberedListStyle && lines.length > 7) {
        out = lines.slice(0, 6).join("\n");
      }

      return out.trim();
    };

    const replyText = (text: string): void => {
      let finalText = enforcePrecisionReply(rewriteDullReply(text));
      if (
        shouldMentionUsernameOnFirstReply &&
        usernameForMention &&
        finalText &&
        !finalText.toLowerCase().includes(usernameForMention.toLowerCase())
      ) {
        const greetingMatch = /^\s*(hey|hi|hello|yo|gm)\b/i.exec(finalText);
        if (greetingMatch) {
          const greetingRaw = greetingMatch[1] ?? "Hey";
          const greeting =
            greetingRaw.length > 1
              ? greetingRaw[0]!.toUpperCase() +
                greetingRaw.slice(1).toLowerCase()
              : greetingRaw.toUpperCase();
          const tail = finalText
            .slice(greetingMatch[0].length)
            .trimStart()
            .replace(/^[,\-:\s]+/, "");
          finalText = tail
            ? `${greeting} ${usernameForMention}, ${tail}`
            : `${greeting} ${usernameForMention},`;
        } else {
          finalText = `Hey ${usernameForMention}, ${finalText}`;
        }
      }
      // Global anti-repeat guard: if we're about to send nearly the same reply
      // as recent assistant messages, rewrite/augment so flow doesn't feel stuck.
      const recentAssistantNormalized = state.chatRecentTurns
        .slice(-4)
        .map((t) => t.assistant.replace(/\s+/g, " ").trim().toLowerCase())
        .filter(Boolean);
      const normalizedFinal = finalText
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
      const continuationLikeInput =
        /^(continue|continue please|go on|carry on|proceed|yes continue|keep going|do it|run it)$/i.test(
          userText.trim(),
        );
      const socialPraiseInput =
        /\b(damn|dope|nice|sick|fire|awesome|great|love it|love this|that'?s (awesome|great|dope))\b/i.test(
          userText,
        ) ||
        /^(thanks|thank you|thx|ty)\b/i.test(userText.trim());
      const clarificationFollowUpInput =
        /\b(i mean|not (right now|rn)|once (it|this) is set up|when (it|this) is set up|when setup is complete)\b/i.test(
          userText,
        );
      const platformExecutionContext =
        /\b(provider|plugin|integration|app|apps|wallet|polymarket|discord|telegram|ai settings|markets\s*&\s*apps)\b/i.test(
          `${userText} ${priorGoalHint}`,
        );
      if (
        normalizedFinal &&
        recentAssistantNormalized.includes(normalizedFinal)
      ) {
        if (
          continuationLikeInput ||
          (priorGoalHint &&
            !platformExecutionContext &&
            !socialPraiseInput &&
            !clarificationFollowUpInput)
        ) {
          finalText = chooseVariant(
            `${normalizedFinal}:${state.chatTurnCount}:${userText.length}`,
            [
              `Continuing your current task: “${priorGoalHint || "active goal"}”. I’ll keep this concise and actionable.`,
              `Got it — continuing from your current goal${priorGoalHint ? ` (“${priorGoalHint}”)` : ""}.`,
              `Understood. I’m continuing the same workflow${priorGoalHint ? ` (“${priorGoalHint}”)` : ""}.`,
            ] as const,
          );
        } else if (finalText.length <= 220) {
          finalText = chooseVariant(
            `${normalizedFinal}:${state.chatTurnCount}:${userText.length}`,
            [
              "Let’s keep momentum. Give me the exact provider/integration and action, and I’ll execute the next step.",
              "I can run this now. Send target + outcome in one line and I’ll take it from there.",
              "Ready to execute. Tell me what component to use and the result you want.",
            ] as const,
          );
        } else {
          const tail = chooseVariant(
            `${normalizedFinal}:${state.chatTurnCount}`,
            [
              "Next: give me the exact target + action and I’ll execute.",
              "If you want, name the component and I’ll run the next step now.",
              "Send one concrete command and I’ll execute from here.",
            ] as const,
          );
          finalText = `${finalText}\n${tail}`;
        }
      }
      if (finalText) commitChatTurn(finalText);
      // Smooth pacing: deterministic responses should not feel "instant/scripted"
      // compared to model responses. Keep a small latency floor with jitter.
      const minReplyMs = 520 + (stableHash(userText) % 220);
      const elapsed = Date.now() - chatRequestStartedAt;
      const waitMs = Math.max(0, minReplyMs - elapsed);
      const send = () =>
        json(res, {
          text: finalText,
          agentName: state.agentName,
        });
      if (waitMs > 0) {
        setTimeout(send, waitMs);
      } else {
        send();
      }
    };

    const recentTurnsContext = (() => {
      const turns = state.chatRecentTurns.slice(-5);
      if (turns.length === 0) return "";
      const packed = turns
        .map((t, i) => {
          const u = t.user.replace(/\s+/g, " ").slice(0, 200);
          const a = t.assistant.replace(/\s+/g, " ").slice(0, 240);
          return `${i + 1}. User: ${u}\n   Milaidy: ${a}`;
        })
        .join("\n");
      return `Recent conversation turns:\n${packed}\n\n`;
    })();
    const summaryContext =
      state.chatRollingSummary && state.chatRollingSummary.trim()
        ? `Session context summary:\n${state.chatRollingSummary}\n\n`
        : "";
    const fastContext = `${recentTurnsContext}${summaryContext}`;
    const readyPlugins = state.plugins
      .filter((p) => p.enabled && p.validationErrors.length === 0)
      .map((p) => p.name)
      .slice(0, 10);
    const blockedPlugins = state.plugins
      .filter((p) => p.enabled && p.validationErrors.length > 0)
      .map(
        (p) =>
          `${p.name}${p.validationErrors[0]?.field ? ` (${p.validationErrors[0].field})` : ""}`,
      )
      .slice(0, 8);
    const runtimeLimitationsContext =
      `Runtime capability context:\n` +
      `- Ready components (providers/integrations): ${readyPlugins.length > 0 ? readyPlugins.join(", ") : "none"}.\n` +
      `- Enabled but blocked by setup: ${blockedPlugins.length > 0 ? blockedPlugins.join(", ") : "none"}.\n` +
      `- You must never imply an unavailable capability is ready.\n` +
      `- If a request needs unavailable capability, state the blocker briefly and ask for the next required input/setup step.\n\n`;
    const priorGoalHint = (() => {
      const isPhatic = (text: string) =>
        /^(hey|hi|hello|yo|sup|gm|good morning|good afternoon|good evening|hola|how are you|how you doing|hows it going|thanks|thank you|thx|ty|yes|yes continue|continue|help|help me)\b/i.test(
          text.trim(),
        );
      const recent = [...state.chatRecentTurns].reverse();
      const match = recent.find((turn) => {
        const t = turn.user?.trim() ?? "";
        return t.length >= 8 && !isPhatic(t);
      });
      if (match?.user) return match.user.replace(/\s+/g, " ").slice(0, 110);
      const summary = state.chatRollingSummary ?? "";
      if (!summary.trim()) return "";
      const summaryLines = summary
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .reverse();
      for (const line of summaryLines) {
        const m = /\bU:(.+?)\s+\|\s+A:/.exec(line);
        const candidate = m?.[1]?.trim() ?? "";
        if (!candidate) continue;
        if (isPhatic(candidate)) continue;
        return candidate.replace(/\s+/g, " ").slice(0, 110);
      }
      return "";
    })();
    const universalWalletAddrs = getEffectiveConnectedWalletAddresses(req);
    const hasModelRuntime =
      Boolean(state.runtime) && hasConfiguredAiProvider(state);
    const highRiskDeterministicIntent =
      /\b(execute|execution|trade|bet|swap|transfer|send|withdraw|wallet|private key|secret|security|confirmations?|limits?|cooldown)\b/i.test(
        userText,
      );
    const marketsAppsPlanAsk =
      marketsAppsIntent &&
      /\b(action plan|next action plan|plan)\b/i.test(userText);
    const preferConversationFirst =
      hasModelRuntime &&
      !highRiskDeterministicIntent &&
      !acknowledgementIntent &&
      !genericHelpIntent &&
      !continueConversationIntent &&
      userText.trim().length >= 10;

    if (marketsAppsPlanAsk) {
      const enabledIntegrations = state.plugins
        .filter(
          (p) =>
            p.category === "connector" &&
            p.enabled &&
            p.configured &&
            p.validationErrors.length === 0,
        )
        .map((p) => normalizeComponentName(p.name));
      replyText(
        "Perfect. I’ll treat Markets & Apps as Milaidy integrations (not geography/industry markets).\n" +
          `Current integrations ready: ${enabledIntegrations.length ? enabledIntegrations.join(", ") : "none"}.\n` +
          "Next move: pick 1 distribution app and 1 execution app, then I’ll build your exact 5-step setup + run plan.",
      );
      return;
    }

    if (preferConversationFirst) {
      try {
        const dynamicPrompt =
          `You are ${state.runtime!.character.name ?? "Milaidy"}, an execution-capable workspace operator.\n` +
          "Priority behavior:\n" +
          "1) Understand the user's exact meaning from their wording; do not default to canned blocks.\n" +
          "2) If context is incomplete, ask one focused follow-up question.\n" +
          "3) Keep replies concise and conversational (1-4 lines).\n" +
          "4) Only mention setup blockers when they are directly relevant.\n" +
          "5) Never claim an unavailable integration/capability is ready.\n" +
          "6) Prefer one clear recommendation over long option menus.\n" +
          "7) Avoid meta narration (no 'quick summary', no 'continuing').\n" +
          "8) In Milaidy context, 'Markets & Apps' means integrations/connectors configuration. Do not reinterpret this as geographic or industry market strategy unless the user explicitly asks go-to-market/geography/vertical strategy.\n\n" +
          runtimeLimitationsContext +
          fastContext +
          `User message:\n${userText}`;

        const quick = await Promise.race([
          state.runtime!.useModel(ModelType.TEXT_SMALL, { prompt: dynamicPrompt }),
          new Promise<string>((_, reject) =>
            setTimeout(
              () => reject(new Error("Conversation-first dynamic reasoning timed out")),
              7000,
            ),
          ),
        ]);
        if (typeof quick === "string" && quick.trim()) {
          replyText(quick.trim());
          return;
        }
      } catch {
        // Fall through to deterministic router stack.
      }
    }

    if (UNIVERSAL_ROUTER_ENABLED && !preferConversationFirst) {
      const universalReply = orchestrateUniversalReply({
        userText,
        turns: state.chatRecentTurns,
        plugins: state.plugins.map((p) => ({
          id: p.id,
          name: p.name,
          category: p.category,
          enabled: p.enabled,
          configured: p.configured,
          validationErrors: p.validationErrors,
          parameters: p.parameters.map((pm) => ({
            key: pm.key,
            required: pm.required,
          })),
        })),
        username: usernameForMention ?? null,
        walletConnected: Boolean(
          universalWalletAddrs.evmAddress || universalWalletAddrs.solanaAddress,
        ),
      });
      if (universalReply) {
        replyText(universalReply);
        return;
      }
    }
    if (INTENT_ENGINE_V2_ENABLED && !preferConversationFirst) {
      const addrs = getEffectiveConnectedWalletAddresses(req);
      const capabilityGraph = buildCapabilityGraph(
        state.plugins.map((p) => ({
          id: p.id,
          name: p.name,
          category: p.category,
          enabled: p.enabled,
          configured: p.configured,
          validationErrors: p.validationErrors,
        })),
        Boolean(addrs.evmAddress || addrs.solanaAddress),
      );
      const interpreted = interpretIntentV2(userText, {
        lastAssistantText: lastAssistantTextForFlow,
      });
      const v2Reply = composeResponseV2(interpreted, capabilityGraph, {
        username: usernameForMention,
        priorGoal: priorGoalHint || null,
      });
      if (v2Reply) {
        replyText(v2Reply);
        return;
      }
    }

    const polymarketContextText =
      `${userText} ${priorGoalHint} ${lastAssistantTextForFlow}`.toLowerCase();
    const polymarketPolicyIntent =
      /\b(polymarket|poly market|poly|bet|bets|trade|trades|execution)\b/i.test(
        polymarketContextText,
      ) &&
      /\b(random|randomized|randomise|randomize|choose|chose|decide|variables?|limits?|on my behalf|from my limit|within my limit)\b/i.test(
        userText,
      );
    if (polymarketPolicyIntent) {
      replyText(
        "Yes — I can choose bet variables within your configured limits, but only after setup is complete.\n" +
          "Safety still applies: confirmations, per-trade cap, daily cap, cooldown, and execution toggle.\n" +
          "If you want randomized execution, define the guardrails (allowed market scope, per-trade max, daily cap), and I’ll stay inside them.",
      );
      return;
    }

    const wantsHotPolymarketNow =
      /\b(hot|trending|current|popular|live)\b/i.test(
        polymarketContextText,
      ) &&
      /\b(polymarket|poly\s*market|ply\s*market|prediction\s*market|poly)\b/i.test(
        polymarketContextText,
      );
    const polymarketTopicLookupIntent =
      /\b(polymarket|poly\s*market|ply\s*market|prediction\s*market|poly|bet|bets|odds|outcome)\b/i.test(
        polymarketContextText,
      ) &&
      /\b(on|about|for|topic|find|lookup|look up|what are|show|list|hot|trending|current|popular|live)\b/i.test(
        polymarketContextText,
      ) &&
      !/\b(markets?\s*&?\s*apps?|action plan|next action plan)\b/i.test(
        polymarketContextText,
      ) &&
      !/\b(can you|will you|would you|able|on my behalf|limit|limits|random|variables?|choose|decide)\b/i.test(
        polymarketContextText,
      ) &&
      !/\b(setup|set up|configure|config|connect|enable|manage|api key|token)\b/i.test(
        polymarketContextText,
      );
    if (polymarketTopicLookupIntent) {
      const query = marketLookupQueryFromUserText(userText);
      const topicHint = inferPolymarketTopicHint(
        `${polymarketContextText} ${query}`,
      );
      let markets =
        wantsHotPolymarketNow || query.length < 3
          ? await fetchHotPolymarketMarkets(topicHint)
          : await fetchPolymarketMarketContext(query, topicHint);
      if (markets.length === 0 && !wantsHotPolymarketNow) {
        markets = await fetchHotPolymarketMarkets(topicHint);
      }
      if (markets.length === 0 && topicHint) {
        markets = await fetchHotPolymarketMarkets(null);
      }
      if (markets.length > 0) {
        const lines: string[] = [];
        if (!wantsHotPolymarketNow && query.length >= 3) {
          lines.push(`Live Polymarket context for “${query}”:`);
        } else {
          lines.push(
            topicHint === "sports"
              ? "Live Polymarket hot sports topics right now:"
              : "Live Polymarket hot topics right now:",
          );
        }
        for (const [index, market] of markets.entries()) {
          const vol =
            market.volumeUsd == null
              ? "n/a"
              : `$${market.volumeUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
          const liq =
            market.liquidityUsd == null
              ? "n/a"
              : `$${market.liquidityUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
          const yesNo =
            market.yesPrice != null && market.noPrice != null
              ? `, YES ${market.yesPrice.toFixed(0)}c / NO ${market.noPrice.toFixed(0)}c`
              : "";
          const endAt = market.endDateIso
            ? `, ends ${new Date(market.endDateIso).toLocaleDateString()}`
            : "";
          lines.push(
            `${index + 1}) ${market.question} (vol ${vol}, liq ${liq}${yesNo}${endAt}${market.active === false ? ", inactive" : ""})`,
          );
        }
        lines.push(
          "Hot = highest live volume/liquidity among active markets from public data.",
        );
        lines.push(
          "If you want to execute, tell me: exact market line, outcome (YES/NO), and amount (USD).",
        );
        lines.push(
          "Execution still requires wallet + Polymarket setup + confirmation/limits.",
        );
        replyText(lines.join("\n"));
        return;
      }
    }

    const explicitFlowIntent =
      marketsAppsIntent ||
      explainPluginsIntent ||
      inAppTradeBetAppsIntent ||
      securityControlsIntent ||
      postSetupExecutionIntent ||
      nextStepIntent ||
      setupNoTargetIntent ||
      gettingStartedIntent;
    const conversationalReasoningIntent =
      /\b(plan|advice|explain|understand|how|what|why|help|guide|workflow|strategy|ideas?|invest|travel|write|draft|email|calendar)\b/i.test(
        userText,
      );
    const shouldTryEarlyDynamicReasoning =
      Boolean(state.runtime) &&
      hasConfiguredAiProvider(state) &&
      !preferConversationFirst &&
      !explicitFlowIntent &&
      !acknowledgementIntent &&
      !genericHelpIntent &&
      !isLowContext &&
      userText.trim().length >= 12 &&
      conversationalReasoningIntent;
    if (shouldTryEarlyDynamicReasoning) {
      try {
        const dynamicPrompt =
          `You are ${state.runtime!.character.name ?? "Milaidy"}, an execution-capable workspace operator.\n` +
          "Respond like a real conversation partner, not a template.\n" +
          "Rules:\n" +
          "1) Briefly acknowledge the user goal.\n" +
          "2) Provide direct, useful guidance now.\n" +
          "3) If critical input is missing, ask only one focused question.\n" +
          "4) Do not invent unavailable integrations; use runtime context.\n" +
          "5) For money actions, require confirmations/limits before execution.\n" +
          "6) In Milaidy context, 'Markets & Apps' means integrations/connectors configuration, not geography/industry strategy unless explicitly requested.\n\n" +
          runtimeLimitationsContext +
          fastContext +
          `User message:\n${userText}`;

        const quick = await Promise.race([
          state.runtime!.useModel(ModelType.TEXT_SMALL, { prompt: dynamicPrompt }),
          new Promise<string>((_, reject) =>
            setTimeout(
              () => reject(new Error("Early dynamic reasoning timed out")),
              7000,
            ),
          ),
        ]);
        if (typeof quick === "string" && quick.trim()) {
          replyText(quick.trim());
          return;
        }
      } catch {
        // Fall through to deterministic flow and existing model paths.
      }
    }

    const universalResponseStructure =
      "Universal reply style for every message:\n" +
      "- Sound like a real operator in conversation, not a form/template.\n" +
      "- Keep replies short by default (1-4 lines).\n" +
      "- Align to user intent, then give the best next step.\n" +
      "- Ask one focused follow-up question only when critical detail is missing.\n" +
      "- If blocked, state blocker plainly and give one concrete next step.\n\n";
    const buildNoModelContinuityReply = (input: string): string => {
      const t = input.trim();
      const lower = t.toLowerCase();
      const readyProviders = state.plugins
        .filter(
          (p) =>
            p.category === "ai-provider" &&
            p.enabled &&
            p.validationErrors.length === 0,
        )
        .map((p) => normalizeComponentName(p.name));
      const readyIntegrations = state.plugins
        .filter(
          (p) =>
            p.category === "connector" &&
            p.enabled &&
            p.validationErrors.length === 0,
        )
        .map((p) => normalizeComponentName(p.name));
      const polymarketHotAsk =
        /\b(polymarket|poly\s*market|ply\s*market|poly)\b/i.test(lower) &&
        /\b(hot|trending|current|popular|live)\b/i.test(lower) &&
        /\b(markets?|bets?|vets?|odds|topics?)\b/i.test(lower);
      if (polymarketHotAsk) {
        const hot = polymarketIntelCache.hot.slice(0, 5);
        if (hot.length > 0) {
          const lines: string[] = ["Latest cached Polymarket hot topics:"];
          for (const [index, market] of hot.entries()) {
            const vol =
              market.volumeUsd == null
                ? "n/a"
                : `$${market.volumeUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
            const liq =
              market.liquidityUsd == null
                ? "n/a"
                : `$${market.liquidityUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
            lines.push(`${index + 1}) ${market.question} (vol ${vol}, liq ${liq})`);
          }
          lines.push(
            "I can fetch a fresh list again in a moment, or filter by a topic like fed rates/election/crypto ETF.",
          );
          return lines.join("\n");
        }
        return (
          "I couldn’t load the live Polymarket feed right now.\n" +
          "Try again in a moment, or give a topic (fed rates, election, crypto ETF) and I’ll pull matching markets."
        );
      }
      const recentUserText = state.chatRecentTurns
        .slice(-6)
        .map((turn) => turn.user)
        .join(" ");
      const combined = `${recentUserText} ${t}`.toLowerCase();
      const hasContext = combined.replace(/\s+/g, " ").trim().length >= 16;
      if (hasContext) {
        const continuationLike =
          /^(continue|continue please|go on|carry on|proceed|yes continue|keep going|do it|run it|pick up where we left off|continue where we was last chatting)$/i.test(
            t,
          );
        const goal = (continuationLike && priorGoalHint ? priorGoalHint : t)
          .replace(/\s+/g, " ")
          .trim();
        const asksDirectQuestion =
          /\?/.test(t) ||
          /^\s*(what|when|why|how|where|who|which|can you|could you|would you|will you|do you|does it|is it|are you|should i|should we|need to)\b/i.test(
            t,
          );
        if (
          asksDirectQuestion &&
          /\b(dog|pet)\b/i.test(goal) &&
          /\b(quar+antine|quaranteen|quarantine)\b/i.test(goal)
        ) {
          return (
            "Short answer: quarantine may be avoidable if all entry requirements are met, but you must verify current destination and carrier rules.\n" +
            "Check in order:\n" +
            "1) Official destination pet-entry rules\n" +
            "2) Airline pet policy for your route\n" +
            "3) Vet certificate/vaccination timeline\n" +
            "If you want, I’ll draft a UK -> Romania dog-travel checklist next."
          );
        }
        if (
          /\b(travel|trip|holiday|vacation|fly|flight|train|ferry)\b/i.test(
            goal,
          )
        ) {
          return (
            `Understood. Continuing: “${goal}”.\n` +
            "Quick execution plan:\n" +
            "1) Confirm entry + transport rules (country, carrier, pet policy).\n" +
            "2) Prepare required documents + vet timeline.\n" +
            "3) Book pet-compatible transport and accommodation.\n" +
            "4) Build a travel-day checklist (carrier, meds, food/water, backups).\n" +
            "5) Final 72h checks and contingency plan.\n" +
            "If you want, I’ll now draft this as a day-by-day checklist."
          );
        }
        if (asksDirectQuestion) {
          return (
            "Got it. I can answer this directly.\n" +
            "Tell me the exact integration or outcome you mean so I can stay precise."
          );
        }
        if (continuationLike) {
          return (
            `Continuing: “${goal || "your active task"}”.\n` +
            "Share the next detail and I’ll keep the same flow."
          );
        }
        return (
          `Got it — you’re asking about “${goal || "your current task"}”.\n` +
          `Current readiness: provider=${readyProviders.length ? readyProviders.join(", ") : "none"}, integrations=${readyIntegrations.length ? readyIntegrations.join(", ") : "none"}.\n` +
          "Give me one concrete outcome and I’ll return the exact next steps."
        );
      }
      if (
        /\b(then what|what next|next step|what now|after that)\b/.test(lower)
      ) {
        return "Next: name the provider/integration you want to run, and I’ll give the exact execute path.";
      }
      if (
        /\b(how (this|it) works?|how do you work|how does this work)\b/.test(
          lower,
        )
      ) {
        return (
          "If you’re referring to how the Milaidy workspace works: I interpret your goal, map it to enabled providers/integrations, then execute with permissions and safety checks. " +
          "If a capability is blocked, I’ll tell you exactly what to enable next. Share your goal and I’ll run the next step."
        );
      }
      if (
        /\b(plan|planning|trip|travel|itinerary|roadmap|strategy)\b/.test(lower)
      ) {
        return "I can help. What’s your destination and budget range?";
      }
      if (/\b(reminder|calendar|email|mail|message|draft|send)\b/.test(lower)) {
        return "I can do that. Share recipient + exact time/timezone first.";
      }
      if (/\b(bet|trade|swap|transfer|send|polymarket|wallet)\b/.test(lower)) {
        return "I can handle this. What exact action and amount do you want?";
      }
      return (
        `I can help with that.\n` +
        `Ready now: provider=${readyProviders.length ? readyProviders.join(", ") : "none"}, integrations=${readyIntegrations.length ? readyIntegrations.join(", ") : "none"}.\n` +
        "Tell me the exact outcome you want and I’ll map the next actions."
      );
    };
    const globalTarget = resolvePluginTarget();
    const universalHypotheticalCapabilityIntent =
      /\b(when|if|once|after|what if)\b/.test(globalLower) &&
      /\b(configure|configured|enable|enabled|setup|set up|connected|complete)\b/.test(
        globalLower,
      ) &&
      /\b(can you|will you|would you|be able|are you able|will it|would it|does it)\b/.test(
        globalLower,
      );
    if (universalHypotheticalCapabilityIntent && globalTarget) {
      const missing = (globalTarget.validationErrors ?? []).map((e) => e.field);
      const componentLabel =
        globalTarget.category === "ai-provider" ? "provider" : "integration";
      const settingsTab =
        globalTarget.category === "ai-provider"
          ? "AI Settings"
          : "Markets & Apps";
      const yesLead = `Yes — once ${globalTarget.name} is enabled/configured, I can operate through it.`;
      if (
        globalTarget.enabled &&
        globalTarget.configured &&
        missing.length === 0
      ) {
        replyText(
          `${yesLead}\n` +
            `Current status: ready.\n` +
            `Tell me the exact action you want and I’ll run it with required safety checks.`,
        );
      } else {
        replyText(
          `${yesLead}\n` +
            `Current status: not ready (${missing.length > 0 ? missing.join(", ") : `${componentLabel} disabled or not configured`}).\n` +
            `Next: ${settingsTab} -> ${globalTarget.name} -> Manage, save, restart Milaidy.`,
        );
      }
      return;
    }

    if (inAppTradeBetAppsIntent) {
      const tradeBetIntegrations = state.plugins
        .filter((p) => p.category === "connector")
        .filter((p) =>
          /\b(polymarket|discord|telegram|slack|wallet|evm|solana)\b/i.test(
            `${p.id} ${p.name}`,
          ),
        )
        .sort((a, b) => Number(b.enabled) - Number(a.enabled));
      const enabled = tradeBetIntegrations
        .filter((p) => p.enabled)
        .map((p) => p.name);
      const available = tradeBetIntegrations
        .filter((p) => !p.enabled)
        .map((p) => p.name);
      replyText(
        `In this Milaidy workspace, I only use in-app Markets & Apps integrations.\n` +
          `Enabled for actions right now: ${enabled.length ? enabled.join(", ") : "none"}.\n` +
          `Available to enable: ${available.length ? available.slice(0, 5).join(", ") : "no additional trade/bet integrations detected"}.\n` +
          `If you want trading/betting here, enable Polymarket in Markets & Apps, then turn execution on in Security.`,
      );
      return;
    }

    if (marketsAppsIntent || explainPluginsIntent) {
      const connectors = state.plugins
        .filter((p) => p.category === "connector")
        .sort((a, b) => Number(b.enabled) - Number(a.enabled))
        .slice(0, 8);
      const enabled = connectors.filter((p) => p.enabled).map((p) => p.name);
      const notEnabled = connectors
        .filter((p) => !p.enabled)
        .map((p) => p.name);
      const setupHypothetical =
        /\b(what if|if i add|if i put|if i enter|if i set)\b/i.test(userText) &&
        /\b(will it work|would it work|does it work|work then)\b/i.test(userText);
      if (setupHypothetical) {
        const asksTelegram = /\btelegram\b/i.test(userText);
        const telegram = state.plugins.find((p) =>
          /\btelegram\b/i.test(`${p.id} ${p.name}`),
        );
        if (asksTelegram && !telegram) {
          replyText(
            "If Telegram is available in your Markets & Apps list and fully configured, yes, it should work.\n" +
              "Right now I don’t detect a Telegram integration in this workspace build, so there’s nothing to enable yet.\n" +
              "Next: install/enable the Telegram integration, then add token/credentials in Markets & Apps -> Telegram -> Manage.",
          );
          return;
        }
        if (telegram) {
          const missing = (telegram.validationErrors ?? []).map((e) => e.field);
          if (telegram.enabled && telegram.configured && missing.length === 0) {
            replyText(
              "Yes. Telegram is setup-ready here, so once you add your bot details and save, it should work.\n" +
                "After saving, restart Milaidy and send one test post command.",
            );
          } else {
            replyText(
              "Yes, it can work once setup is complete.\n" +
                `Current Telegram status: ${missing.length > 0 ? `missing ${missing.join(", ")}` : "not fully enabled/configured"}.\n` +
                "Next: Markets & Apps -> Telegram -> Manage, fill required fields, save, restart Milaidy, then run a test message.",
            );
          }
          return;
        }
        replyText(
          "Yes, once the integration is fully configured in Markets & Apps, it should work.\n" +
            "After saving credentials, restart Milaidy and run one smoke test action to confirm.",
        );
        return;
      }
      replyText(
        `Markets & Apps is where you manage external integrations Milaidy can use.\n` +
          `Enabled now: ${enabled.length ? enabled.join(", ") : "none"}.\n` +
          `Available to connect: ${notEnabled.length ? notEnabled.slice(0, 4).join(", ") : "already configured"}.\n` +
          `Tell me one app (e.g. Discord, Telegram, Polymarket) and I’ll walk setup or execution.`,
      );
      return;
    }

    if (postSetupExecutionIntent) {
      const providers = state.plugins
        .filter(
          (p) =>
            p.category === "ai-provider" &&
            p.enabled &&
            p.validationErrors.length === 0,
        )
        .map((p) => normalizeComponentName(p.name))
        .slice(0, 2);
      const integrations = state.plugins
        .filter(
          (p) =>
            p.category === "connector" &&
            p.enabled &&
            p.validationErrors.length === 0,
        )
        .map((p) => normalizeComponentName(p.name))
        .slice(0, 4);
      replyText(
        `After setup, execution is simple: you give a direct command in chat, I validate permissions/safety, then execute through the enabled component.\n` +
          `Ready now: provider=${providers.length ? providers.join(", ") : "not connected"}, integrations=${integrations.length ? integrations.join(", ") : "none enabled"}.\n` +
          `For spend/bet actions, confirmations + limits in Security must pass.\n` +
          `Tell me the exact action you want to run now.`,
      );
      return;
    }

    if (nextStepIntent) {
      const setupContextDetected =
        /\bsetup\b/i.test(lastAssistantTextForFlow) ||
        /\bmanage\b/i.test(lastAssistantTextForFlow) ||
        /\bsave\b/i.test(lastAssistantTextForFlow) ||
        /\brestart\b/i.test(lastAssistantTextForFlow);
      if (setupContextDetected && globalTarget) {
        const missing = (globalTarget.validationErrors ?? []).map(
          (e) => e.field,
        );
        const settingsTab =
          globalTarget.category === "ai-provider"
            ? "AI Settings"
            : "Markets & Apps";
        if (
          globalTarget.enabled &&
          globalTarget.configured &&
          missing.length === 0
        ) {
          replyText(
            `${globalTarget.name} is setup-ready.\n` +
              `Now give me a direct command (for example: “use ${globalTarget.name} to run X”).\n` +
              `I’ll validate permissions/safety and execute.`,
          );
        } else {
          replyText(
            `Next for ${globalTarget.name}: ${settingsTab} -> ${globalTarget.name} -> Manage, complete required fields, save, restart Milaidy.\n` +
              `Then send your direct command and I’ll execute through it.`,
          );
        }
        return;
      }
      const enabledProvider = state.plugins.find(
        (p) =>
          p.category === "ai-provider" &&
          p.enabled &&
          p.validationErrors.length === 0,
      );
      const enabledIntegrations = state.plugins
        .filter(
          (p) =>
            p.category === "connector" &&
            p.enabled &&
            p.validationErrors.length === 0,
        )
        .map((p) => normalizeComponentName(p.name))
        .slice(0, 4);
      replyText(
        `Next step depends on your target.\n` +
          `Provider ready: ${enabledProvider ? normalizeComponentName(enabledProvider.name) : "none"}.\n` +
          `Integrations ready: ${enabledIntegrations.length ? enabledIntegrations.join(", ") : "none"}.\n` +
          `Tell me which one you want to run, and I’ll execute the exact flow.`,
      );
      return;
    }

    if (continueConversationIntent && !hasConcreteFollowupIntent) {
      if (priorGoalHint) {
        replyText(
          `Continuing from: “${priorGoalHint}”.\n` +
            "Send your next question and I’ll keep this in the same flow.",
        );
      } else {
        replyText(
          "I can continue, but I don’t have a prior goal in this active session. Send one line of context and I’ll pick it up immediately.",
        );
      }
      return;
    }

    if (setupNoTargetIntent && !globalTarget) {
      replyText(
        "I can route setup immediately.\n" +
          "If this is an AI provider, open AI Settings.\n" +
          "If this is an integration/app, open Markets & Apps.\n" +
          "Tell me the exact name (for example OpenAI, Discord, Telegram, Polymarket) and I’ll give the exact steps.",
      );
      return;
    }

    if (acknowledgementIntent) {
      if (priorGoalHint) {
        replyText(
          `Anytime. We can keep moving on “${priorGoalHint}” whenever you’re ready.`,
        );
      } else {
        replyText(
          "Anytime. When you’re ready, send the next task and I’ll run it.",
        );
      }
      return;
    }

    if (genericHelpIntent) {
      if (priorGoalHint) {
        replyText(
          `Happy to help. Do you want to continue with “${priorGoalHint}” or start a new task?`,
        );
      } else {
        replyText(
          "Happy to help. Tell me what you want to do first and I’ll take the next step.",
        );
      }
      return;
    }

    if (planningAdviceIntent) {
      replyText(
        "I can help with that. I’ll give you a practical step-by-step plan and risk controls, not hype.\n" +
          "Before I draft it, tell me your time horizon and risk level (low / medium / high).",
      );
      return;
    }

    if (planningFollowupAnswerIntent) {
      const normalizedRisk = (() => {
        const value = (riskLevelAnswer ?? "").toLowerCase();
        if (value === "conservative") return "low";
        if (value === "moderate") return "medium";
        if (value === "aggressive") return "high";
        return value || "medium";
      })();
      const horizon = (horizonAnswer ?? "not specified").toLowerCase();

      const addrs = getEffectiveConnectedWalletAddresses(req);
      const connected = Boolean(addrs.evmAddress || addrs.solanaAddress);

      let walletSummary = "Portfolio snapshot: wallet not connected.";
      if (connected && addrs.solanaAddress) {
        const withTimeout = async <T>(
          promise: Promise<T>,
          ms: number,
        ): Promise<T | null> => {
          let timer: ReturnType<typeof setTimeout> | null = null;
          try {
            return await Promise.race([
              promise,
              new Promise<null>((resolve) => {
                timer = setTimeout(() => resolve(null), ms);
              }),
            ]);
          } finally {
            if (timer) clearTimeout(timer);
          }
        };

        const heliusKey = process.env.HELIUS_API_KEY;
        const sol = await withTimeout(
          heliusKey
            ? fetchSolanaBalances(addrs.solanaAddress, heliusKey)
            : fetchSolanaBalancePublic(addrs.solanaAddress),
          3000,
        );
        if (sol) {
          const solValue = Number.parseFloat(sol.solValueUsd || "0");
          walletSummary =
            `Portfolio snapshot: ${sol.solBalance} SOL` +
            ` (${Number.isFinite(solValue) ? `$${solValue.toFixed(2)}` : "$0.00"}).`;
        } else {
          walletSummary = "Portfolio snapshot: wallet connected (live value unavailable right now).";
        }
      }

      const riskChecks =
        normalizedRisk === "low"
          ? [
              "Risk check (low): keep 80-95% in core assets/stable exposure.",
              "Cap any high-volatility positions to a small sleeve (<=10%).",
              "Use predefined loss limits and avoid leverage.",
            ]
          : normalizedRisk === "high"
            ? [
                "Risk check (high): cap max drawdown per idea before entry.",
                "Keep strict per-position and daily loss limits.",
                "Use staged entries/exits; avoid full-size single entries.",
              ]
            : [
                "Risk check (medium): keep most capital in core positions.",
                "Limit speculative sleeve and use clear stop/exit rules.",
                "Rebalance on schedule instead of impulse changes.",
              ];

      replyText(
        `Locked in: risk=${normalizedRisk}, horizon=${horizon}.\n` +
          `${walletSummary}\n` +
          `${riskChecks.join("\n")}\n` +
          "If you want, I’ll now produce a 5-step action plan from this profile.",
      );
      return;
    }

    if (isLowContext && !continuationAnswerIntent) {
      replyText("Tell me your goal in one line and I’ll take the next step.");
      return;
    }
    const asksForGuideNow =
      /\b(send|share|give)\b.*\bguide\b/.test(lowerUserText) ||
      /^(guide|setup guide|send guide)$/i.test(userText.trim());
    const priorWasReminderEmailFlow =
      /\btwo-step task\b/i.test(lastAssistantTextForFlow) &&
      /\bcalendar reminder\b/i.test(lastAssistantTextForFlow) &&
      /\bemail\b/i.test(lastAssistantTextForFlow);
    const aiProvidersReady = state.plugins
      .filter(
        (p) =>
          p.category === "ai-provider" &&
          p.enabled &&
          p.validationErrors.length === 0,
      )
      .map((p) => normalizeComponentName(p.name))
      .slice(0, 3);
    const integrationsReady = state.plugins
      .filter(
        (p) =>
          p.category === "connector" &&
          p.enabled &&
          p.validationErrors.length === 0,
      )
      .map((p) => normalizeComponentName(p.name))
      .slice(0, 5);

    if (toolSafetyReviewIntent) {
      const providerState = aiProvidersReady.length
        ? aiProvidersReady.join(", ")
        : "none enabled";
      const integrationsState = integrationsReady.length
        ? integrationsReady.join(", ")
        : "none enabled";
      let confirmationsState = "Unknown (not available in this chat session)";
      let spendGuardState = "Unknown (not available in this chat session)";
      let polymarketExecutionState = "Unknown (not available in this chat session)";
      if (
        chatSecurityContext &&
        typeof chatSecurityContext.confirmBeforeSpend === "boolean" &&
        typeof chatSecurityContext.confirmBeforeExecution === "boolean" &&
        typeof chatSecurityContext.spendGuardEnabled === "boolean" &&
        typeof chatSecurityContext.polymarketExecutionEnabled === "boolean"
      ) {
        confirmationsState =
          chatSecurityContext.confirmBeforeSpend &&
            chatSecurityContext.confirmBeforeExecution
            ? "ON"
            : "OFF";
        spendGuardState = chatSecurityContext.spendGuardEnabled ? "ON" : "OFF";
        polymarketExecutionState = chatSecurityContext.polymarketExecutionEnabled
          ? "ON"
          : "OFF";
      } else {
        const userCtx = getOptionalMultiUserContextFromBearer(req);
        if (userCtx && multiUserService) {
          try {
            const perms = multiUserService.getPermissions(userCtx.userId);
            const poly = perms.integrations.find(
              (i) => i.integrationId === "polymarket",
            );
            confirmationsState =
              perms.polymarket.confirmationMode === "required" ? "ON" : "OFF";
            spendGuardState =
              perms.polymarket.level === "disabled" ? "OFF" : "ON";
            polymarketExecutionState = poly?.executionEnabled ? "ON" : "OFF";
          } catch {
            // keep unknown if permissions cannot be read
          }
        }
      }
      const capsLine =
        chatSecurityContext &&
          Number.isFinite(chatSecurityContext.dailySpendLimitUsd) &&
          Number.isFinite(chatSecurityContext.perTradeLimitUsd) &&
          Number.isFinite(chatSecurityContext.cooldownSeconds)
          ? `- Limits: daily $${Number(chatSecurityContext.dailySpendLimitUsd).toFixed(0)}, per-trade $${Number(chatSecurityContext.perTradeLimitUsd).toFixed(0)}, cooldown ${Number(chatSecurityContext.cooldownSeconds).toFixed(0)}s\n`
          : "";
      replyText(
        "Current app state:\n" +
          `- AI provider: ${providerState}\n` +
          `- Markets & Apps: ${integrationsState}\n` +
          `- Security: confirmations ${confirmationsState}, spend guard ${spendGuardState}, polymarket execution ${polymarketExecutionState}\n` +
          capsLine +
          "Safer defaults:\n" +
          "- Keep confirmations ON for execution and spend/bet actions.\n" +
          "- Keep spend guard ON and start with conservative daily/per-trade caps.\n" +
          "- Keep high-risk integrations disabled until actively needed.\n" +
          "- Rotate API keys regularly and use least-privilege scopes.\n" +
          "- Enable execution only for the specific workflow you are running.\n" +
          "Do you handle sensitive data (PII/PHI/proprietary) so I can tighten this baseline further?",
      );
      return;
    }

    if (asksForGuideNow && priorWasReminderEmailFlow) {
      replyText(
        "Perfect — here’s the quick setup guide:\n" +
          "1. Open Markets & Apps and enable your calendar connector (Google Calendar or Outlook).\n" +
          "2. Open Markets & Apps and enable your email connector (Gmail/SMTP or Outlook Mail).\n" +
          "3. Add required credentials in Manage for each connector, save, then restart Milaidy.\n" +
          "4. Come back with reminder time + timezone and your contact email, and I’ll draft the message and queue both actions.",
      );
      return;
    }
    if (capabilityIntent) {
      replyText(
        `Milaidy can reason, plan, and execute through enabled platform components. ` +
          `AI provider: ${aiProvidersReady.length ? aiProvidersReady.join(", ") : "not connected"}. ` +
          `Markets & Apps integrations: ${integrationsReady.length ? integrationsReady.join(", ") : "none enabled"}. ` +
          `For high-risk actions (trades/transfers/bets), execution requires permissions, confirmations, and limits.`,
      );
      return;
    }

    if (socialCheckInIntent) {
      const openerName = usernameForMention ? ` ${usernameForMention}` : "";
      if (priorGoalHint) {
        replyText(
          `Hey${openerName}, I’m good. We’re currently on: “${priorGoalHint}”. Continue this flow or switch goals?`,
        );
        return;
      }
      const socialVariants = [
        `Hey${openerName}, I’m good and ready to run. What are we tackling first?`,
        `Hey${openerName}, all good on my side. What should we run first?`,
        `Hey${openerName}, fully live. What do you want to execute first?`,
      ] as const;
      const line = socialVariants[state.chatTurnCount % socialVariants.length]!;
      replyText(line);
      return;
    }

    if (genericHowItWorksIntent) {
      const enabledPlugins = state.plugins.filter((p) => p.enabled);
      const readyComponents = enabledPlugins
        .filter((p) => p.validationErrors.length === 0)
        .map((p) => normalizeComponentName(p.name))
        .slice(0, 8);
      const blockedPlugins = enabledPlugins
        .filter((p) => p.validationErrors.length > 0)
        .map((p) => p.name)
        .slice(0, 6);
      replyText(
        `If you’re referring to how the Milaidy workspace works, here’s the flow:\n` +
          `1) I understand your goal.\n` +
          `2) I plan the next action.\n` +
          `3) I execute only through enabled providers and integrations.\n` +
          `Ready now: ${readyComponents.length ? readyComponents.join(", ") : "none"}.\n` +
          `Needs setup: ${blockedPlugins.length ? blockedPlugins.join(", ") : "none"}.\n` +
          `High-risk actions (trades/transfers/bets) require execution toggles, confirmations, and limits.\n` +
          `Tell me your goal and I’ll handle the next step.`,
      );
      return;
    }

    if (agentOverviewIntent || workflowExplainIntent) {
      const enabledPlugins = state.plugins.filter((p) => p.enabled);
      const providers = enabledPlugins
        .filter(
          (p) =>
            p.category === "ai-provider" && p.validationErrors.length === 0,
        )
        .map((p) => normalizeComponentName(p.name))
        .slice(0, 2);
      const integrations = enabledPlugins
        .filter(
          (p) => p.category === "connector" && p.validationErrors.length === 0,
        )
        .map((p) => normalizeComponentName(p.name))
        .slice(0, 4);
      replyText(
        `Milaidy workflow is simple: you give a goal, I reason on it, then execute through enabled components.\n` +
          `AI provider: ${providers.length ? providers.join(", ") : "not connected"}.\n` +
          `Markets & Apps integrations: ${integrations.length ? integrations.join(", ") : "none enabled"}.\n` +
          `For risky actions, confirmations + limits are enforced in Security.`,
      );
      return;
    }

    if (isGenericOpener && !capabilityIntent) {
      const openerName = usernameForMention ? ` ${usernameForMention}` : "";
      if (priorGoalHint) {
        replyText(
          `Hey${openerName}, want to continue with “${priorGoalHint}” or start a new task?`,
        );
        return;
      }
      const enabledPlugins = state.plugins.filter((p) => p.enabled);
      const readyComponents = enabledPlugins
        .filter((p) => p.validationErrors.length === 0)
        .map((p) => normalizeComponentName(p.name))
        .slice(0, 4);
      const openerVariants = [
        `Hey${openerName}, Milaidy workspace is live.\n` +
          `I can plan and execute through AI Settings + Markets & Apps${readyComponents.length ? ` (${readyComponents.join(", ")})` : ""}.\n` +
          `Tell me your goal and I’ll take the next step.`,
        `Hey${openerName}, Milaidy is live.\n` +
          `I can run tasks through AI Settings + Markets & Apps${readyComponents.length ? ` (${readyComponents.join(", ")})` : ""}.\n` +
          `Drop your first objective and I’ll route it.`,
        `Hey${openerName}, workspace is up.\n` +
          `Execution is available through AI Settings + Markets & Apps${readyComponents.length ? ` (${readyComponents.join(", ")})` : ""}.\n` +
          `Tell me what you want done first.`,
      ] as const;
      const line = openerVariants[state.chatTurnCount % openerVariants.length]!;
      replyText(line);
      return;
    }

    if (platformIntent) {
      const enabledPlugins = state.plugins.filter((p) => p.enabled);
      const readyComponents = enabledPlugins
        .filter((p) => p.validationErrors.length === 0)
        .map((p) => normalizeComponentName(p.name))
        .slice(0, 6);
      replyText(
        `Milaidy is an agent workspace: you chat goals, it plans, then executes through enabled providers/integrations.\n` +
          `Right now it can use: ${readyComponents.length ? readyComponents.join(", ") : "no ready components yet"}.\n` +
          `For money actions, confirmations and limits stay in control.\n` +
          `Tell me one task and I’ll walk it end-to-end.`,
      );
      return;
    }

    if (ambiguousThisIntent) {
      replyText(
        "Happy to break it down. What is “this” — a feature, button, file, or command?",
      );
      return;
    }

    if (gettingStartedIntent) {
      const activeProvider = state.plugins.find(
        (p) => p.category === "ai-provider" && p.enabled,
      );
      const providerReady =
        activeProvider != null &&
        activeProvider.validationErrors.length === 0 &&
        (activeProvider.id === "ollama" ||
          !(activeProvider.envKey ?? "").trim() ||
          activeProvider.parameters.some(
            (pm) => pm.key === activeProvider.envKey && pm.isSet,
          ));
      const addrs = getEffectiveConnectedWalletAddresses(req);
      const walletConnected = Boolean(addrs.evmAddress || addrs.solanaAddress);
      const appsEnabled = state.plugins
        .filter((p) => p.category === "connector" && p.enabled)
        .map((p) => p.name)
        .slice(0, 4);

      const lines: string[] = [];
      lines.push("Fast start:");
      lines.push(
        `1) AI provider: ${providerReady ? "connected" : "connect in AI Settings"}`,
      );
      lines.push(
        `2) Wallet: ${walletConnected ? "connected" : "connect in Portfolio"}`,
      );
      lines.push(
        `3) Apps: ${appsEnabled.length ? appsEnabled.join(", ") : "enable what you need in Markets & Apps"}`,
      );
      lines.push("Then tell me one task and I’ll run it step-by-step.");
      replyText(lines.join("\n"));
      return;
    }

    if (securityControlsIntent) {
      replyText(
        "In Milaidy, go to Security (right-side tab in the main nav).\n" +
          "Use Action confirmations for:\n" +
          "- Confirm before execution actions\n" +
          "- Confirm before spend/bet actions\n" +
          "- Daily spend limit, per-trade limit, cooldown\n" +
          "- Spend guard and Polymarket execution toggle\n" +
          "Markets & Apps is only for enabling integrations; limits/confirmations are managed in Security.",
      );
      return;
    }

    const dynamicPluginHelpResponse = (() => {
      const lower = userText.toLowerCase();
      const normalized = lower.replace(/[^a-z0-9]+/g, " ");
      const upper = userText.toUpperCase();
      const asksPluginOperationWithoutTarget =
        /\b(plugin|plugins|provider|providers|integration|integrations)\b/.test(
          lower,
        ) && /\b(how|use|operate|work|works|working|run)\b/.test(lower);
      const findPluginTarget = () => {
        const resolved = resolvePluginTarget();
        if (resolved) return resolved;
        // Follow-up fallback: infer target from the most recent assistant setup reply.
        const lastAssistant = [...state.chatRecentTurns]
          .reverse()
          .map((t) => t.assistant)
          .find((txt) => typeof txt === "string" && txt.trim().length > 0);
        if (lastAssistant) {
          const setupMatch = /^([A-Za-z0-9 ._-]+)\s+setup\b/i.exec(
            lastAssistant.trim(),
          );
          if (setupMatch?.[1]) {
            const name = setupMatch[1].trim().toLowerCase();
            const fromName = state.plugins.find(
              (p) => p.name.toLowerCase() === name,
            );
            if (fromName) return fromName;
          }
        }
        return null;
      };
      const genericExecutionAsk =
        /\b(can you|will you|are you able|could you)\b/.test(lower) &&
        /\b(trade|bet|execute|place|swap|send|transfer)\b/.test(lower);
      const target = findPluginTarget();
      if (!target) {
        if (asksPluginOperationWithoutTarget) {
          const readyProviders = state.plugins
            .filter(
              (p) =>
                p.category === "ai-provider" &&
                p.enabled &&
                p.validationErrors.length === 0,
            )
            .map((p) => normalizeComponentName(p.name))
            .slice(0, 4);
          const readyIntegrations = state.plugins
            .filter(
              (p) =>
                p.category === "connector" &&
                p.enabled &&
                p.validationErrors.length === 0,
            )
            .map((p) => normalizeComponentName(p.name))
            .slice(0, 6);
          const blockedProviders = state.plugins
            .filter(
              (p) =>
                p.category === "ai-provider" &&
                p.enabled &&
                p.validationErrors.length > 0,
            )
            .map((p) => normalizeComponentName(p.name))
            .slice(0, 4);
          const blockedIntegrations = state.plugins
            .filter(
              (p) =>
                p.category === "connector" &&
                p.enabled &&
                p.validationErrors.length > 0,
            )
            .map((p) => normalizeComponentName(p.name))
            .slice(0, 6);
          return (
            `I operate in 4 steps: detect intent, map to enabled component, validate setup/permissions, then execute.\n` +
            `Ready now: provider=${readyProviders.length ? readyProviders.join(", ") : "none"}, integrations=${readyIntegrations.length ? readyIntegrations.join(", ") : "none"}.\n` +
            `Needs setup: provider=${blockedProviders.length ? blockedProviders.join(", ") : "none"}, integrations=${blockedIntegrations.length ? blockedIntegrations.join(", ") : "none"}.\n` +
            `Tell me the exact provider/integration name and your goal, and I’ll walk it end-to-end.`
          );
        }
        const genericCredentialAsk =
          /\b(how do i get|where do i get|how to get|don'?t know how to get|i do not know how to get)\b/.test(
            lower,
          ) &&
          /\b(api key|token|secret|credential|credentials?|private key|application id|client id)\b/.test(
            lower,
          );
        if (genericCredentialAsk) {
          return "I can help with that. Tell me the service name (for example Discord, Telegram, OpenAI, Polymarket), and I’ll give exact credential steps.";
        }
        if (!genericExecutionAsk) return null;
        const polymarket = state.plugins.find((p) => p.id === "polymarket");
        if (!polymarket)
          return "I can execute enabled actions, but no trading integration is available right now.";

        const missing = polymarket.validationErrors.map((e) => e.field);
        const addrs = getEffectiveConnectedWalletAddresses(req);
        const walletConnected = Boolean(
          addrs.evmAddress || addrs.solanaAddress,
        );
        const lines: string[] = [];
        if (
          polymarket.enabled &&
          polymarket.configured &&
          missing.length === 0
        ) {
          lines.push(
            "Yes — I can help execute Polymarket bets with confirmation.",
          );
        } else {
          lines.push("Not yet — Polymarket execution is blocked by setup.");
        }
        if (missing.length > 0) lines.push(`Blockers: ${missing.join(", ")}.`);
        lines.push(
          "Do this: Markets & Apps -> Polymarket -> Manage, save, restart Milaidy.",
        );
        lines.push(
          walletConnected
            ? "Then set Security -> Polymarket execution to ON and keep confirmations ON."
            : "Then connect wallet in Portfolio, set Security -> Polymarket execution ON, keep confirmations ON.",
        );
        return lines.join("\n");
      }

      const missing = (target.validationErrors ?? []).map((e) => e.field);
      const humanizeBlocker = (field: string): string => {
        const key = field.trim().toUpperCase();
        if (key.includes("PRIVATE_KEY") || key.includes("SECRET"))
          return "trading signer is not configured";
        if (key.includes("API_KEY") || key.includes("TOKEN")) {
          return target.category === "ai-provider"
            ? "required provider credentials are missing"
            : "required integration credentials are missing";
        }
        return field;
      };
      const missingHuman = missing.map(humanizeBlocker);
      const componentLabel =
        target.category === "ai-provider" ? "provider" : "integration";
      const requiredKeys = (target.parameters ?? [])
        .filter((p) => Boolean(p.required))
        .map((p) => p.key);
      const settingsTab =
        target.category === "ai-provider" ? "AI Settings" : "Markets & Apps";
      const addrs = getEffectiveConnectedWalletAddresses(req);
      const walletConnected = Boolean(addrs.evmAddress || addrs.solanaAddress);
      const asksExecutionCapability =
        /\b(can you|will you|are you able|execute tasks?|run tasks?|do it for me)\b/.test(
          lower,
        ) ||
        (/\bexecute\b/.test(lower) &&
          /\bdiscord|telegram|polymarket|plugin|bet|trade\b/.test(lower)) ||
        (target.id === "polymarket" &&
          (/\b(bet|bets|wager|place|position|trade)\b/.test(lower) ||
            /\bpolymarket\s*bet\b|polymarketbet|polybet\b/.test(lower)));
      const wantsMarketIntelOnly =
        target.id === "polymarket" &&
        /\b(hot|trending|current|popular|live|list|show|why)\b/.test(lower) &&
        !/\b(execute|place|run|for me|on my behalf)\b/.test(lower);
      const asksHypotheticalCapability =
        /\b(when|once|if)\b/.test(lower) &&
        /\b(configure|configured|enable|enabled|setup|set up)\b/.test(lower) &&
        /\b(can you|will you|would you|be able)\b/.test(lower);
      const asksHowItWorks =
        /\b(how does|how do|how)\b/.test(lower) &&
        /\b(work|works|working|flow|operate|operates|use|using|behave|behavior)\b/.test(
          lower,
        );
      const asksHowToUseTarget =
        /\b(how (do|to) (i )?use|how to operate|operate with|use with|work with)\b/.test(
          lower,
        ) &&
        (lower.includes(target.id.toLowerCase()) ||
          lower.includes(target.name.toLowerCase()) ||
          /\bplugin|provider|integration\b/.test(lower));
      const asksCredentialSource =
        /\b(how do i get|where (do|can) i get|where is|how to get|i do not know how to get|don'?t know how to get)\b/.test(
          lower,
        ) &&
        /\b(api key|token|private key|application id|client id|secret|credential|credentials?)\b/.test(
          lower,
        );

      if (asksExecutionCapability && !wantsMarketIntelOnly) {
        const lines: string[] = [];
        const positiveConditional = chooseVariant(lower, [
          `Yes — once ${target.name} is configured and enabled, I can execute actions there with confirmation.`,
          `Yes — after setup is complete, I can run ${target.name} actions from chat with the required safety checks.`,
          `Yes — once enabled and configured, ${target.name} actions are available through Milaidy.`,
        ] as const);
        const readyLead = chooseVariant(lower, [
          `Yes — ${target.name} can run with confirmation.`,
          `Yes — ${target.name} execution is available with confirmation.`,
          `Yes — I can run ${target.name} actions once confirmation rules pass.`,
        ] as const);
        const blockedLead = chooseVariant(lower, [
          `Not ready yet — ${target.name} execution is blocked by setup.`,
          `${target.name} isn’t execution-ready yet — setup is still incomplete.`,
          `Execution for ${target.name} is currently blocked by setup.`,
        ] as const);
        if (target.enabled && target.configured && missing.length === 0) {
          lines.push(readyLead);
        } else if (asksHypotheticalCapability) {
          lines.push(positiveConditional);
        } else {
          lines.push(blockedLead);
        }
        if (missing.length > 0) {
          lines.push(`Missing: ${[...new Set(missingHuman)].join(", ")}.`);
        }
        lines.push(
          `Next: ${settingsTab} -> ${target.name} -> Manage, save, restart Milaidy.`,
        );
        if (target.id === "polymarket") {
          lines.push(
            "Polymarket readiness: plugin enabled, signer configured, wallet connected, execution ON in Security, confirmations ON.",
          );
          lines.push(
            walletConnected
              ? "Then set Security -> Polymarket execution to ON and keep confirmations ON."
              : "Then connect wallet in Portfolio, set Security -> Polymarket execution ON, keep confirmations ON.",
          );
        }
        return lines.join("\n");
      }

      if (asksHowItWorks) {
        const lines: string[] = [];
        lines.push(`${target.name} works like this:`);
        lines.push("1. You state the goal in chat.");
        lines.push(
          "2. Milaidy maps it to this integration and validates setup/permissions.",
        );
        if (target.id === "polymarket") {
          lines.push(
            "3. For bets: execution toggle + confirmations + spend limits must pass.",
          );
          lines.push(
            "4. If approved, the action executes and is logged in Security.",
          );
        } else {
          lines.push(
            "3. If setup is valid, Milaidy prepares and runs the action.",
          );
          lines.push(
            "4. Result comes back in chat; errors include blocker + next step.",
          );
        }
        if (!target.enabled || !target.configured || missing.length > 0) {
          lines.push("");
          lines.push(
            `Current blocker: ${
              missing.length > 0
                ? missing.join(", ")
                : !target.enabled
                  ? `${componentLabel} is disabled`
                  : `${componentLabel} not fully configured`
            }.`,
          );
          lines.push(
            `To enable: ${settingsTab} -> ${target.name} -> Manage, save, restart Milaidy.`,
          );
        } else {
          lines.push("");
          lines.push("Status: ready to run when you ask.");
        }
        return lines.join("\n");
      }

      if (asksHowToUseTarget) {
        const usageByCategory: Record<string, string> = {
          "ai-provider":
            "Use this provider for Milaidy reasoning/generation after enabling and adding credentials.",
          connector:
            "Use this integration by asking Milaidy to perform actions through it (send/read/sync tasks).",
          database:
            "Use this as memory/state backend; Milaidy will persist and retrieve context through it.",
          feature:
            "Use this runtime feature by asking Milaidy for the capability it unlocks.",
        };
        const usageLine =
          usageByCategory[target.category] ??
          "Enable it, configure required fields, then ask Milaidy for the exact task.";
        const lines: string[] = [];
        lines.push(`${target.name} operation model:`);
        lines.push(usageLine);
        lines.push(
          `Status: enabled=${target.enabled ? "yes" : "no"}, configured=${target.configured ? "yes" : "no"}${missing.length ? `, blockers=${missing.join(", ")}` : ""}.`,
        );
        lines.push(
          `Next step: ${settingsTab} -> ${target.name} -> Manage, save, restart Milaidy.`,
        );
        lines.push(
          "Then give me one concrete action and I’ll execute or explain blockers immediately.",
        );
        return lines.join("\n");
      }

      if (asksCredentialSource) {
        const lines: string[] = [];
        if (target.id === "discord") {
          lines.push(
            "Get Discord credentials from the Discord Developer Portal:",
          );
          lines.push(
            "1. Go to https://discord.com/developers/applications and open/create your app.",
          );
          lines.push(
            "2. General Information -> copy Application ID -> use as DISCORD_APPLICATION_ID.",
          );
          lines.push(
            "3. Bot tab -> add a bot (if missing), then copy Bot Token -> use as DISCORD_API_TOKEN.",
          );
          lines.push(
            "4. Paste both in Markets & Apps -> Discord -> Manage, save, restart Milaidy.",
          );
          return lines.join("\n");
        }
        if (target.id === "telegram") {
          lines.push("Get your Telegram bot token from BotFather:");
          lines.push("1. Open Telegram and chat with @BotFather.");
          lines.push("2. Run /newbot and complete setup.");
          lines.push(
            "3. Copy the token BotFather returns -> TELEGRAM_BOT_TOKEN.",
          );
          lines.push(
            "4. Paste it in Markets & Apps -> Telegram -> Manage, save, restart Milaidy.",
          );
          return lines.join("\n");
        }
        if (target.id === "openai") {
          lines.push("Get your OpenAI API key from the OpenAI dashboard:");
          lines.push("1. Open https://platform.openai.com/api-keys.");
          lines.push("2. Create a new secret key and copy it once.");
          lines.push(
            "3. Paste in AI Settings -> OpenAI -> Manage (API key field), save, restart Milaidy.",
          );
          return lines.join("\n");
        }
        if (target.id === "polymarket") {
          lines.push(
            "For Polymarket execution, you need a signing key configured by the app owner/operator.",
          );
          lines.push(
            "If this is a user-facing app, do not ask end users for private keys directly.",
          );
          lines.push(
            "Set up backend signer flow, then enable execution in Security with confirmations/limits.",
          );
          return lines.join("\n");
        }
        lines.push(
          `For ${target.name}, get the required credentials from the provider’s developer dashboard.`,
        );
        if (requiredKeys.length > 0) {
          lines.push(`You need: ${requiredKeys.join(", ")}.`);
        }
        lines.push(
          `Then open ${settingsTab} -> ${target.name} -> Manage, save, restart Milaidy.`,
        );
        return lines.join("\n");
      }

      const setupIntent =
        /\b(setup|set up|configure|config|connect|enable|install|token|api key|plugin)\b/.test(
          lower,
        ) || /\bhow (do|to)\b/.test(lower);
      const strippedTargetText = normalized
        .replace(new RegExp(`\\b${target.id.toLowerCase()}\\b`, "g"), " ")
        .replace(
          new RegExp(
            `\\b${target.name.toLowerCase().replace(/[^a-z0-9]+/g, " ")}\\b`,
            "g",
          ),
          " ",
        )
        .replace(/\s+/g, " ")
        .trim();
      if (!setupIntent && strippedTargetText.length <= 8) {
        return `${target.name}: tell me your intent — setup, how it works, or execute — and I’ll take you through it.`;
      }
      if (!setupIntent) return null;

      const lines: string[] = [];
      lines.push(
        chooseVariant(lower, [
          `${target.name} setup — quickest path:`,
          `To set up ${target.name}, do this:`,
          `Quick ${target.name} setup flow:`,
        ] as const),
      );
      lines.push(`1. Open ${settingsTab} -> ${target.name} -> Manage.`);
      if (missing.length > 0) {
        lines.push(`2. Add missing field(s): ${missing.join(", ")}.`);
      } else if (requiredKeys.length > 0) {
        lines.push(
          `2. Confirm required field(s) are set: ${requiredKeys.join(", ")}.`,
        );
      } else {
        lines.push(
          `2. Enable the ${componentLabel} and review any optional settings you need.`,
        );
      }
      lines.push("3. Save changes.");
      lines.push("4. Restart Milaidy so plugin/runtime changes load.");
      if (target.id === "polymarket") {
        if (!walletConnected) {
          lines.push("5. Connect your wallet in Portfolio.");
        } else {
          lines.push("5. Wallet is connected.");
        }
        lines.push(
          "6. In Security, turn Polymarket execution ON only when ready to place real bets.",
        );
        lines.push("7. Keep confirmations and spend limits enabled.");
        lines.push("8. Test with a small amount first.");
      }
      lines.push("");
      lines.push(
        `Current status: enabled=${target.enabled ? "yes" : "no"}, configured=${target.configured ? "yes" : "no"}.`,
      );
      return lines.join("\n");
    })();

    if (dynamicPluginHelpResponse) {
      replyText(dynamicPluginHelpResponse);
      return;
    }

    const orchestrationIntent =
      /\b(reminder|calendar|schedule|event)\b/i.test(userText) &&
      /\b(email|mail|gmail|outlook)\b/i.test(userText) &&
      /\b(can you|help|set|create|send|draft|need)\b/i.test(userText);
    if (orchestrationIntent) {
      const enabledPlugins = state.plugins.filter((p) => p.enabled);
      const hasCalendarConnector = enabledPlugins.some((p) =>
        /\bgoogle|calendar|outlook\b/i.test(`${p.id} ${p.name}`),
      );
      const hasEmailConnector = enabledPlugins.some((p) =>
        /\bemail|mail|gmail|outlook\b/i.test(`${p.id} ${p.name}`),
      );
      const dayMatch = userText.match(/\b(\d{1,2})\s*(day|days)\b/i);
      const inDays = dayMatch ? Number(dayMatch[1]) : null;
      const timelineHint = Number.isFinite(inDays)
        ? `in ${inDays} days`
        : /\bnext week\b/i.test(userText)
          ? "next week"
          : "on your requested date";
      const recipientMatch =
        /\bemail(?:ing)?\s+(?:my\s+)?([a-z][a-z0-9' -]{1,30})\b/i.exec(
          userText,
        ) ??
        /\bmail\s+(?:my\s+)?([a-z][a-z0-9' -]{1,30})\b/i.exec(userText) ??
        /\bto\s+(?:my\s+)?([a-z][a-z0-9' -]{1,30})\b/i.exec(userText);
      const recipientRaw = recipientMatch?.[1]?.trim() ?? "";
      const recipient = recipientRaw
        ? recipientRaw.replace(/\s+/g, " ")
        : "your contact";
      const recipientLabel =
        recipient === "your contact" ? "Contact email" : `${recipient} email`;
      const emailTaskLine =
        recipient === "your contact"
          ? "then send the email"
          : `then email ${recipient}`;

      const lines: string[] = [];
      lines.push(
        `Yes — I can handle that. We’ll do this in two steps: calendar reminder ${timelineHint}, ${emailTaskLine}.`,
      );
      lines.push("");
      lines.push("Send me:");
      lines.push(`- ${recipientLabel}`);
      lines.push("- Reminder date/time + timezone");
      lines.push("- Email tone (formal/casual) + send now or draft first");
      lines.push("");
      lines.push(
        `Connector status: calendar=${hasCalendarConnector ? "ready" : "not detected"}, email=${hasEmailConnector ? "ready" : "not detected"}.`,
      );
      lines.push(
        'If either connector is missing, say "send setup guide" and I’ll walk you through it.',
      );
      replyText(lines.join("\n"));
      return;
    }

    // Fast path for wallet/portfolio queries: answer from wallet data with a
    // strict timeout, bypassing slow model/tool chains.
    const actionIntent =
      /\b(bet|bets|wager|trade|swap|execute|send|transfer|place)\b/i.test(
        userText,
      );
    const strategyIntent =
      /\b(scale|grow|optimi[sz]e|improve|strategy|plan|invest|allocation|allocate|rebalance|thesis|ideas?)\b/i.test(
        userText,
      ) || /\bwhat can we do\b/i.test(userText);
    const walletSnapshotIntent =
      /\b(show|check|view|refresh|get|fetch|what'?s|whats|how much)\b/i.test(
        userText,
      ) &&
      /\b(wallet|portfolio|holdings|balance|balances|token|tokens|nft|nfts|positions?)\b/i.test(
        userText,
      );
    const walletIntent =
      (walletSnapshotIntent ||
        /\b(my )?wallet snapshot\b/i.test(userText) ||
        /\b(balance(s)?|holdings?)\b/i.test(userText)) &&
      !actionIntent &&
      !strategyIntent;
    if (walletIntent) {
      const addrs = getEffectiveConnectedWalletAddresses(req);
      const connected = Boolean(addrs.evmAddress || addrs.solanaAddress);
      if (!connected) {
        replyText(
          "No wallet is connected yet. Connect a wallet in Portfolio to view balances.",
        );
        return;
      }

      const withTimeout = async <T>(
        promise: Promise<T>,
        ms: number,
      ): Promise<T | null> => {
        let timer: ReturnType<typeof setTimeout> | null = null;
        try {
          return await Promise.race([
            promise,
            new Promise<null>((resolve) => {
              timer = setTimeout(() => resolve(null), ms);
            }),
          ]);
        } finally {
          if (timer) clearTimeout(timer);
        }
      };

      const heliusKey = process.env.HELIUS_API_KEY;
      const alchemyKey = process.env.ALCHEMY_API_KEY;

      const [sol, evmChains] = await Promise.all([
        addrs.solanaAddress
          ? withTimeout(
              heliusKey
                ? fetchSolanaBalances(addrs.solanaAddress, heliusKey)
                : fetchSolanaBalancePublic(addrs.solanaAddress),
              3500,
            )
          : Promise.resolve(null),
        addrs.evmAddress
          ? withTimeout(
              alchemyKey
                ? fetchEvmBalances(addrs.evmAddress, alchemyKey)
                : fetchEvmBalancesPublic(addrs.evmAddress),
              3500,
            )
          : Promise.resolve(null),
      ]);

      const lines: string[] = [];
      if (addrs.solanaAddress) {
        if (sol) {
          const solValue = Number.parseFloat(sol.solValueUsd || "0");
          lines.push(`Solana wallet: ${addrs.solanaAddress}`);
          lines.push(
            `Balance: ${sol.solBalance} SOL (${Number.isFinite(solValue) ? `$${solValue.toFixed(2)}` : "$0.00"})`,
          );
        } else {
          lines.push(`Solana wallet: ${addrs.solanaAddress}`);
          lines.push("Balance: connected (live balance unavailable right now)");
        }
      } else {
        lines.push("Solana wallet: not connected");
        lines.push("Balance: unavailable");
      }

      replyText(lines.join("\n"));
      return;
    }

    // Fast path for normal conversational prompts: try a direct small-model
    // response first to keep chat snappy for common questions.
    const toolHeavyIntent =
      /\b(send|transfer|bet|trade|swap|execute|sign|wallet|portfolio|polymarket|plugin|connect)\b/i.test(
        userText,
      );
    const shouldPreferFastReply = userText.length <= 320 && !toolHeavyIntent;

    if (!state.runtime) {
      error(res, "Agent is not running", 503);
      return;
    }

    if (!hasConfiguredAiProvider(state)) {
      json(
        res,
        {
          error:
            "AI provider not connected. Open AI Settings and connect your provider key to chat.",
          code: "AI_PROVIDER_REQUIRED",
        },
        412,
      );
      return;
    }

    if (state.inFlightChatRequests >= CHAT_MAX_CONCURRENCY) {
      error(res, "Chat is busy. Please retry shortly.", 429);
      return;
    }

    state.inFlightChatRequests += 1;

    let responseText = "";
    const tryDirectModelFallback = async (): Promise<{
      text: string;
      errors: string[];
      largeStatus: "not-run" | "ok" | "empty" | "error";
      smallStatus: "not-run" | "ok" | "empty" | "error";
    }> => {
      const errors: string[] = [];
      let text = "";
      let largeStatus: "not-run" | "ok" | "empty" | "error" = "not-run";
      let smallStatus: "not-run" | "ok" | "empty" | "error" = "not-run";

      // Prefer SMALL first for lower latency in chat fallback mode.
      try {
        const small = await state.runtime!.useModel(ModelType.TEXT_SMALL, {
          prompt:
            `You are ${state.runtime!.character.name ?? "Milaidy"}. Reply helpfully and concisely to the user.\n\n` +
            runtimeLimitationsContext +
            fastContext +
            `User message:\n${userText}`,
        });
        if (typeof small === "string" && small.trim()) {
          text = small.trim();
          smallStatus = "ok";
        } else {
          smallStatus = "empty";
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`TEXT_SMALL: ${msg}`);
        smallStatus = "error";
      }

      if (!text && CHAT_FALLBACK_ALLOW_LARGE) {
        try {
          const large = await state.runtime!.useModel(ModelType.TEXT_LARGE, {
            prompt:
              `You are ${state.runtime!.character.name ?? "Milaidy"}. Reply helpfully and concisely to the user.\n\n` +
              runtimeLimitationsContext +
              fastContext +
              `User message:\n${userText}`,
          });
          if (typeof large === "string" && large.trim()) {
            text = large.trim();
            largeStatus = "ok";
          } else {
            largeStatus = "empty";
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          errors.push(`TEXT_LARGE: ${msg}`);
          largeStatus = "error";
        }
      }

      return { text, errors, largeStatus, smallStatus };
    };

    try {
      const runtime = state.runtime;
      const agentName = runtime.character.name ?? "Milaidy";

      const activeProvider = state.plugins.find(
        (p) => p.category === "ai-provider" && p.enabled,
      );
      // Fail fast for OpenAI misconfiguration to avoid slow timeout loops.
      if (activeProvider?.id === "openai") {
        const openaiKey = (process.env.OPENAI_API_KEY ?? "").trim();
        const embeddingKey = (
          process.env.OPENAI_EMBEDDING_API_KEY ?? ""
        ).trim();
        const looksPlaceholder = (v: string) =>
          !v || /replace[_-]?me/i.test(v) || /\.\.\./.test(v);
        if (looksPlaceholder(openaiKey)) {
          codedError(
            res,
            "Provider authentication failed. Verify your OpenAI API key, then restart Milaidy.",
            "PROVIDER_AUTH",
            401,
          );
          return;
        }
        // OpenAI embeddings usually use the same key; mirror at runtime when
        // only OPENAI_API_KEY is present to keep chat responsive.
        if (!embeddingKey && openaiKey) {
          process.env.OPENAI_EMBEDDING_API_KEY = openaiKey;
        }
      }
      // Fail fast for Ollama: it can never work unless the local daemon is running.
      if (activeProvider?.id === "ollama") {
        const endpoint = (
          process.env.OLLAMA_API_ENDPOINT ??
          process.env.OLLAMA_BASE_URL ??
          "http://localhost:11434"
        ).trim();
        const reachable = await isOllamaReachable(endpoint, 300);
        if (!reachable) {
          codedError(
            res,
            "Provider not running: start Ollama on this device, then restart Milaidy.",
            "PROVIDER_NOT_RUNNING",
            503,
          );
          return;
        }
      }

      const shouldRunUniversalStructuredReply = userText.length <= 1400;
      if (shouldRunUniversalStructuredReply) {
        try {
          const structured = await Promise.race([
            runtime.useModel(ModelType.TEXT_SMALL, {
              prompt:
                `You are ${runtime.character.name ?? "Milaidy"}, an execution-focused workspace operator.\n` +
                "Universal response policy (apply to every user input):\n" +
                "1) Infer user intent and desired outcome from the latest message + recent context.\n" +
                "2) Check capability/permission limits from runtime context before proposing execution.\n" +
                "3) Respond conversationally (no rigid template), with: clear understanding, immediate next action, and only missing critical inputs.\n" +
                "4) If blocked, state blocker plainly and provide one concrete next step.\n" +
                "5) Keep momentum; avoid generic chatbot filler and avoid repeating prior setup blocks unless user asks.\n" +
                "6) If user asks broad/open-ended questions, provide a practical plan and continue the conversation.\n" +
                "7) For high-risk actions (funds/trades/bets), require confirmation/limits before execution.\n\n" +
                "When context is unclear, ask one concise clarifying question before giving a long answer.\n\n" +
                universalResponseStructure +
                runtimeLimitationsContext +
                fastContext +
                `User message:\n${userText}`,
            }),
            new Promise<string>((_, reject) =>
              setTimeout(
                () => reject(new Error("Structured reply timed out")),
                9000,
              ),
            ),
          ]);
          if (typeof structured === "string" && structured.trim()) {
            replyText(structured.trim());
            return;
          }
        } catch {
          // Continue to other paths.
        }
      }

      if (shouldPreferFastReply) {
        try {
          const fast = await Promise.race([
            state.runtime!.useModel(ModelType.TEXT_SMALL, {
              prompt:
                `You are ${state.runtime!.character.name ?? "Milaidy"}, an agentic workspace assistant built for autonomous execution across chat, wallets, and connected apps.\n` +
                "Respond clearly and directly. Do not mention internal tooling.\n\n" +
                universalResponseStructure +
                runtimeLimitationsContext +
                fastContext +
                `User message:\n${userText}`,
            }),
            new Promise<string>((_, reject) =>
              setTimeout(() => reject(new Error("Fast reply timed out")), 8000),
            ),
          ]);
          if (typeof fast === "string" && fast.trim()) {
            replyText(fast.trim());
            return;
          }
        } catch {
          // Fall back to full message pipeline below.
        }
      }

      // Lazily initialise a persistent chat room + user for the web UI so
      // that conversation memory accumulates across messages.
      if (!state.chatUserId || !state.chatRoomId) {
        state.chatUserId = crypto.randomUUID() as UUID;
        state.chatRoomId = stringToUuid(`${agentName}-web-chat-room`);
        const worldId = stringToUuid(`${agentName}-web-chat-world`);
        await runtime.ensureConnection({
          entityId: state.chatUserId,
          roomId: state.chatRoomId,
          worldId,
          userName: "User",
          source: "client_chat",
          channelId: `${agentName}-web-chat`,
          // Use SELF to avoid triggering core "settings onboarding" provider
          // paths that expect server/world ownership relationships.
          type: ChannelType.SELF,
        });
      }

      const message = createMessageMemory({
        id: crypto.randomUUID() as UUID,
        entityId: state.chatUserId,
        roomId: state.chatRoomId,
        content: {
          text: userText,
          source: "client_chat",
          channelType: ChannelType.SELF,
        },
      });

      let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
      let messageResponseText = "";
      let messageReason: string | null = null;
      try {
        await Promise.race([
          (async () => {
            if (!runtime.messageService) return;
            const result = await runtime.messageService.handleMessage(
              runtime,
              message,
              async (content: Content) => {
                if (content?.text) {
                  responseText += content.text;
                }
                return [];
              },
              {
                // Favor responsive chat UX in the web app.
                useMultiStep: CHAT_PIPELINE_USE_MULTI_STEP,
                maxRetries: CHAT_PIPELINE_MAX_RETRIES,
                timeoutDuration: CHAT_PIPELINE_TIMEOUT_MS,
                shouldRespondModel: "small",
              },
            );
            if (!result || typeof result !== "object") return;
            const parsed = result as {
              responseContent?: Content | null;
              reason?: string;
            };
            const candidateText = (
              parsed.responseContent as { text?: string } | null | undefined
            )?.text;
            messageResponseText =
              typeof candidateText === "string" ? candidateText : "";
            messageReason =
              typeof parsed.reason === "string" ? parsed.reason : null;
          })(),
          new Promise<never>((_, reject) => {
            timeoutHandle = setTimeout(
              () => reject(new Error("Chat response timed out")),
              CHAT_RESPONSE_TIMEOUT_MS,
            );
          }),
        ]);
      } finally {
        if (timeoutHandle) clearTimeout(timeoutHandle);
      }

      // Some message-service paths return text only in responseContent and do
      // not emit callback chunks. Capture that result before declaring no output.
      const fallbackText = messageResponseText.trim();
      if (!responseText.trim() && fallbackText) {
        responseText = fallbackText;
      }

      // Last-resort fallback: if the message pipeline produced no visible
      // assistant text, directly invoke the active model so chat still works.
      const {
        text: directFallbackText,
        errors: directFallbackErrors,
        largeStatus: textLargeStatus,
        smallStatus: textSmallStatus,
      } = !responseText.trim()
        ? await tryDirectModelFallback()
        : {
            text: "",
            errors: [],
            largeStatus: "not-run" as const,
            smallStatus: "not-run" as const,
          };
      if (!responseText.trim() && directFallbackText) {
        responseText = directFallbackText;
      }

      if (!responseText.trim()) {
        const activeProvider = state.plugins.find(
          (p) =>
            p.category === "ai-provider" &&
            p.enabled &&
            p.validationErrors.length === 0,
        );
        const providerHint = activeProvider
          ? `Active provider: ${activeProvider.name}.`
          : "No active AI provider detected.";
        const runtimeReason = messageReason
          ? ` Runtime reason: ${messageReason}.`
          : "";
        const directFallbackReason =
          directFallbackErrors.length > 0
            ? ` Direct fallback errors: ${directFallbackErrors.join(" | ")}.`
            : "";
        const fallbackStatusReason = ` Fallback status: TEXT_LARGE=${textLargeStatus}, TEXT_SMALL=${textSmallStatus}.`;

        const combined =
          `${messageReason ?? ""} ${directFallbackErrors.join(" ")}`.toLowerCase();
        if (
          combined.includes("you exceeded your current quota") ||
          combined.includes("insufficient_quota") ||
          (combined.includes("quota") && combined.includes("billing"))
        ) {
          throw new Error(
            `Provider quota reached. ${providerHint} Update billing/usage limits, then retry.`,
          );
        }
        if (
          combined.includes("invalid api key") ||
          combined.includes("incorrect api key") ||
          combined.includes("unauthorized") ||
          combined.includes("401")
        ) {
          throw new Error(
            `Provider authentication failed. ${providerHint} Verify your API key and selected model, then restart Milaidy.`,
          );
        }
        if (combined.includes("no handler found for delegate type")) {
          throw new Error(
            `Provider plugin is not available for the selected model. ${providerHint} Enable a model provider in AI Settings and restart Milaidy.`,
          );
        }
        throw new Error(
          `No assistant response was produced. ${providerHint}${runtimeReason}${directFallbackReason}${fallbackStatusReason} Verify provider key/model configuration and restart Milaidy.`,
        );
      }

      replyText(responseText);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "generation failed";
      const msgLower = msg.toLowerCase();
      const isTimeout =
        msgLower.includes("timed out") ||
        msgLower.includes("timeout") ||
        msgLower.includes("exceeded timeout");
      // If we already have a partial response, return it instead of surfacing
      // a terminal timeout error to the UI.
      if (isTimeout && responseText.trim()) {
        replyText(responseText);
      } else if (isTimeout) {
        // Timeout fallback: attempt one short direct model call before failing.
        try {
          const direct = await Promise.race([
            tryDirectModelFallback(),
            new Promise<{
              text: string;
              errors: string[];
              largeStatus: "not-run" | "ok" | "empty" | "error";
              smallStatus: "not-run" | "ok" | "empty" | "error";
            }>((_, reject) => {
              setTimeout(
                () => reject(new Error("Direct fallback timed out")),
                6000,
              );
            }),
          ]);
          if (direct.text.trim()) {
            replyText(direct.text.trim());
            return;
          }
          const fallbackCombined = direct.errors.join(" ").toLowerCase();
          if (
            fallbackCombined.includes("insufficient_quota") ||
            fallbackCombined.includes("you exceeded your current quota") ||
            (fallbackCombined.includes("quota") &&
              fallbackCombined.includes("billing"))
          ) {
            codedError(
              res,
              "Provider quota reached. Update billing/usage limits, then retry.",
              "PROVIDER_QUOTA",
              402,
            );
            return;
          }
          if (
            fallbackCombined.includes("invalid api key") ||
            fallbackCombined.includes("incorrect api key") ||
            fallbackCombined.includes("unauthorized") ||
            fallbackCombined.includes("401")
          ) {
            codedError(
              res,
              "Provider authentication failed. Verify your API key, then restart Milaidy.",
              "PROVIDER_AUTH",
              401,
            );
            return;
          }
          // Generic recovery pass: produce a shorter, completion-focused answer
          // from current context before falling back to non-model continuity text.
          try {
            const recovery = await Promise.race([
              state.runtime!.useModel(ModelType.TEXT_SMALL, {
                prompt:
                  `You are ${state.runtime!.character.name ?? "Milaidy"}.\n` +
                  "The previous generation timed out. Continue the user's request with a concise but complete answer.\n" +
                  "Rules:\n" +
                  "- Do not ask broad reset questions.\n" +
                  "- Use existing context and deliver the next useful output now.\n" +
                  "- Keep it short enough to avoid timeout.\n\n" +
                  fastContext +
                  `User message:\n${userText}`,
              }),
              new Promise<string>((_, reject) =>
                setTimeout(
                  () => reject(new Error("Recovery reply timed out")),
                  3500,
                ),
              ),
            ]);
            if (typeof recovery === "string" && recovery.trim()) {
              replyText(recovery.trim());
              return;
            }
          } catch {
            // Continue to non-model fallback.
          }
        } catch {
          // Fall through to timeout response.
        }
        replyText(buildNoModelContinuityReply(userText));
        return;
      } else {
        // Map provider errors into a small set of user-safe categories.
        const isQuota =
          msgLower.includes("provider quota reached") ||
          msgLower.includes("insufficient_quota") ||
          msgLower.includes("you exceeded your current quota") ||
          (msgLower.includes("quota") && msgLower.includes("billing"));
        const isAuth =
          msgLower.includes("invalid api key") ||
          msgLower.includes("incorrect api key") ||
          msgLower.includes("unauthorized") ||
          msgLower.includes("authentication") ||
          msgLower.includes("401");
        const isOllamaDown =
          msgLower.includes("ollama") &&
          (msgLower.includes("not reachable") ||
            msgLower.includes("connection refused") ||
            msgLower.includes("econnrefused") ||
            msgLower.includes("11434") ||
            msgLower.includes("unable to connect"));
        const isProviderNotLoaded =
          msgLower.includes("no handler found for delegate type") ||
          msgLower.includes("provider plugin is not available") ||
          msgLower.includes("delegate type") ||
          msgLower.includes("cannot find package") ||
          msgLower.includes("module_not_found") ||
          msgLower.includes("no assistant response was produced");

        if (isQuota) {
          codedError(
            res,
            "Provider quota reached. Update billing/usage limits, then retry.",
            "PROVIDER_QUOTA",
            402,
          );
        } else if (isAuth) {
          codedError(
            res,
            "Provider authentication failed. Verify your API key, then restart Milaidy.",
            "PROVIDER_AUTH",
            401,
          );
        } else if (isOllamaDown) {
          codedError(
            res,
            "Provider not running: start Ollama on this device, then restart Milaidy.",
            "PROVIDER_NOT_RUNNING",
            503,
          );
        } else if (isProviderNotLoaded) {
          codedError(
            res,
            "Provider not loaded yet. Restart Milaidy to apply your AI Settings.",
            "PROVIDER_RESTART_REQUIRED",
            503,
          );
        } else if (
          msgLower.includes("provider") ||
          msgLower.includes("model")
        ) {
          codedError(
            res,
            "Provider error. Restart Milaidy to apply your AI Settings.",
            "PROVIDER_RESTART_REQUIRED",
            503,
          );
        } else {
          error(res, "Error generating text. Please try again later.", 500);
        }
      }
    } finally {
      state.inFlightChatRequests = Math.max(0, state.inFlightChatRequests - 1);
    }
    return;
  }

  // ── Fallback ────────────────────────────────────────────────────────────
  error(res, "Not found", 404);
}

// ---------------------------------------------------------------------------
// Server start
// ---------------------------------------------------------------------------

export async function startApiServer(opts?: {
  port?: number;
  runtime?: AgentRuntime;
  /**
   * Called when the UI requests a restart via `POST /api/agent/restart`.
   * Should stop the current runtime, create a new one, and return it.
   * If omitted the endpoint returns 501 (not supported in this mode).
   */
  onRestart?: () => Promise<AgentRuntime | null>;
}): Promise<{
  port: number;
  close: () => Promise<void>;
  updateRuntime: (rt: AgentRuntime) => void;
}> {
  const port = opts?.port ?? 2138;
  const host =
    (process.env.MILAIDY_API_BIND ?? "127.0.0.1").trim() || "127.0.0.1";

  let config: MilaidyConfig;
  try {
    config = loadMilaidyConfig();
  } catch (err) {
    logger.warn(
      `[milaidy-api] Failed to load config, starting with defaults: ${err instanceof Error ? err.message : err}`,
    );
    config = {} as MilaidyConfig;
  }

  applyPluginEntryConfigToEnv(config);
  const plugins = discoverPluginsFromManifest(config);
  const workspaceDir =
    config.agents?.defaults?.workspace ?? resolveDefaultAgentWorkspaceDir();
  const skills = await discoverSkills(
    workspaceDir,
    config,
    opts?.runtime ?? null,
  );

  const hasRuntime = opts?.runtime != null;
  const agentName = hasRuntime
    ? (opts.runtime!.character.name ?? "Milaidy")
    : (config.agents?.list?.[0]?.name ??
      config.ui?.assistant?.name ??
      "Milaidy");

  const state: ServerState = {
    runtime: opts?.runtime ?? null,
    config,
    agentState: hasRuntime ? "running" : "not_started",
    agentName,
    model: hasRuntime
      ? (detectRuntimeModel(opts?.runtime ?? null) ?? "unknown")
      : undefined,
    startedAt: hasRuntime ? Date.now() : undefined,
    plugins,
    skills,
    logBuffer: [],
    chatRoomId: null,
    chatUserId: null,
    chatTurnCount: 0,
    chatRollingSummary: null,
    chatRecentTurns: [],
    inFlightChatRequests: 0,
  };

  const addLog = (level: string, message: string, source = "system") => {
    let resolvedSource = source;
    if (source === "auto" || source === "system") {
      const bracketMatch = /^\[([^\]]+)\]\s*/.exec(message);
      if (bracketMatch) resolvedSource = bracketMatch[1];
    }
    state.logBuffer.push({
      timestamp: Date.now(),
      level,
      message,
      source: resolvedSource,
    });
    if (state.logBuffer.length > 1000) state.logBuffer.shift();
  };

  addLog(
    "info",
    `Discovered ${plugins.length} plugins, ${skills.length} skills`,
  );

  // ── Intercept runtime logger so all plugin/autonomy logs appear in the UI ─
  // Guard against double-patching: if the logger was already patched (e.g.
  // after a hot-restart) we skip to avoid stacking wrapper functions that
  // would leak memory and slow down every log call.
  const PATCHED_MARKER = "__milaidyLogPatched";
  if (
    opts?.runtime?.logger &&
    !(opts.runtime.logger as unknown as Record<string, unknown>)[PATCHED_MARKER]
  ) {
    const rtLogger = opts.runtime.logger;
    const LEVELS = ["debug", "info", "warn", "error"] as const;

    for (const lvl of LEVELS) {
      const original = rtLogger[lvl].bind(rtLogger);
      // pino signature: logger.info(obj, msg) or logger.info(msg)
      const patched: (typeof rtLogger)[typeof lvl] = (
        ...args: Parameters<typeof original>
      ) => {
        let msg = "";
        let source = "runtime";
        if (typeof args[0] === "string") {
          msg = args[0];
        } else if (args[0] && typeof args[0] === "object") {
          const obj = args[0] as Record<string, unknown>;
          if (typeof obj.src === "string") source = obj.src;
          msg = typeof args[1] === "string" ? args[1] : JSON.stringify(obj);
        }
        if (msg) addLog(lvl, msg, source);
        return original(...args);
      };
      rtLogger[lvl] = patched;
    }

    (rtLogger as unknown as Record<string, unknown>)[PATCHED_MARKER] = true;
    addLog(
      "info",
      "Runtime logger connected — logs will stream to the UI",
      "system",
    );
  }

  // Autonomy is managed by the core AutonomyService + TaskService.
  // The AutonomyService creates a recurring task (tagged "queue") that the
  // TaskService picks up and executes on its 1 s polling interval.
  // enableAutonomy: true on the runtime auto-creates the task during init.
  if (opts?.runtime) {
    addLog(
      "info",
      "Autonomy is always enabled — managed by the core task system",
      "autonomy",
    );
  }

  // Store the restart callback on the state so the route handler can access it.
  const onRestart = opts?.onRestart ?? null;

  const server = http.createServer(async (req, res) => {
    const requestId = crypto.randomUUID();
    res.setHeader("X-Request-Id", requestId);
    try {
      await handleRequest(req, res, state, { onRestart });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "internal error";
      addLog("error", `[request:${requestId}] ${msg}`, "api");
      if (!res.headersSent) {
        error(res, "Internal server error", 500);
      } else {
        res.end();
      }
    }
  });

  server.requestTimeout = Math.max(
    5_000,
    Number(process.env.MILAIDY_API_REQUEST_TIMEOUT_MS ?? "30000"),
  );
  server.headersTimeout = Math.max(
    5_000,
    Number(process.env.MILAIDY_API_HEADERS_TIMEOUT_MS ?? "35000"),
  );

  const rateCleanupTimer = setInterval(cleanupApiRateLimits, 60_000);
  // Avoid keeping the process alive solely for cleanup housekeeping.
  rateCleanupTimer.unref();

  /** Hot-swap the runtime reference (used after an in-process restart). */
  const updateRuntime = (rt: AgentRuntime): void => {
    state.runtime = rt;
    state.agentState = "running";
    state.agentName = rt.character.name ?? "Milaidy";
    state.startedAt = Date.now();
    addLog("info", `Runtime restarted — agent: ${state.agentName}`, "system");
  };

  return new Promise((resolve) => {
    server.listen(port, host, () => {
      const addr = server.address();
      const actualPort = typeof addr === "object" && addr ? addr.port : port;
      const displayHost =
        typeof addr === "object" && addr ? addr.address : host;
      addLog(
        "info",
        `API server listening on http://${displayHost}:${actualPort}`,
      );
      logger.info(
        `[milaidy-api] Listening on http://${displayHost}:${actualPort}`,
      );
      resolve({
        port: actualPort,
        close: () =>
          new Promise<void>((r) => {
            clearInterval(rateCleanupTimer);
            server.close(() => r());
          }),
        updateRuntime,
      });
    });
  });
}
