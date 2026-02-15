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
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  type AgentRuntime,
  ChannelType,
  type Content,
  createMessageMemory,
  logger,
  ModelType,
  stringToUuid,
  type Task,
  type UUID,
} from "@elizaos/core";
import * as piAi from "@mariozechner/pi-ai";
import { type WebSocket, WebSocketServer } from "ws";
import { CloudManager } from "../cloud/cloud-manager.js";
import {
  configFileExists,
  loadMilaidyConfig,
  type MilaidyConfig,
  saveMilaidyConfig,
} from "../config/config.js";
import { resolveModelsCacheDir, resolveStateDir } from "../config/paths.js";
import type {
  ConnectorConfig,
  CustomActionDef,
} from "../config/types.milaidy.js";
import { CharacterSchema } from "../config/zod-schema.js";
import { EMOTE_BY_ID, EMOTE_CATALOG } from "../emotes/catalog.js";
import { resolveDefaultAgentWorkspaceDir } from "../providers/workspace.js";
import {
  CORE_PLUGINS,
  OPTIONAL_CORE_PLUGINS,
} from "../runtime/core-plugins.js";
import {
  buildTestHandler,
  registerCustomActionLive,
} from "../runtime/custom-actions.js";
import { createPiCredentialProvider } from "../runtime/pi-credentials.js";
import {
  AgentExportError,
  estimateExportSize,
  exportAgent,
  importAgent,
} from "../services/agent-export.js";
import { AppManager } from "../services/app-manager.js";
import {
  getMcpServerDetails,
  searchMcpMarketplace,
} from "../services/mcp-marketplace.js";
import type { SandboxManager } from "../services/sandbox-manager.js";
import {
  installMarketplaceSkill,
  listInstalledMarketplaceSkills,
  searchSkillsMarketplace,
  uninstallMarketplaceSkill,
} from "../services/skill-marketplace.js";
import { TrainingService } from "../services/training-service.js";
import {
  listTriggerTasks,
  readTriggerConfig,
  taskToTriggerSummary,
} from "../triggers/runtime.js";
import { parseClampedInteger } from "../utils/number-parsing.js";
import { type CloudRouteState, handleCloudRoute } from "./cloud-routes.js";
import {
  extractAnthropicSystemAndLastUser,
  extractOpenAiSystemAndLastUser,
  resolveCompatRoomKey,
} from "./compat-utils.js";
import { handleDatabaseRoute } from "./database.js";
import { DropService } from "./drop-service.js";
import {
  readJsonBody as parseJsonBody,
  readRequestBody,
  readRequestBodyBuffer,
  sendJson,
  sendJsonError,
} from "./http-helpers.js";
import { handleKnowledgeRoutes } from "./knowledge-routes.js";
import {
  type PluginParamInfo,
  validatePluginConfig,
} from "./plugin-validation.js";
import { RegistryService } from "./registry-service.js";
import { handleSandboxRoute } from "./sandbox-routes.js";
import { handleTrainingRoutes } from "./training-routes.js";
import { handleTrajectoryRoute } from "./trajectory-routes.js";
import { handleTriggerRoutes } from "./trigger-routes.js";
import {
  generateVerificationMessage,
  isAddressWhitelisted,
  markAddressVerified,
  verifyTweet,
} from "./twitter-verify.js";
import { TxService } from "./tx-service.js";
import {
  fetchEvmBalances,
  fetchEvmNfts,
  fetchSolanaBalances,
  fetchSolanaNfts,
  generateWalletForChain,
  generateWalletKeys,
  getWalletAddresses,
  importWallet,
  validatePrivateKey,
  type WalletBalancesResponse,
  type WalletChain,
  type WalletConfigStatus,
  type WalletNftsResponse,
} from "./wallet.js";

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

function getAgentEventSvc(
  runtime: AgentRuntime | null,
): AgentEventServiceLike | null {
  if (!runtime) return null;
  return runtime.getService("AGENT_EVENT") as AgentEventServiceLike | null;
}

function isUuidLike(value: string): value is UUID {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}

const OG_FILENAME = ".og";

function readOGCodeFromState(): string | null {
  const filePath = path.join(resolveStateDir(), OG_FILENAME);
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, "utf-8").trim();
}

function initializeOGCodeInState(): void {
  const dir = resolveStateDir();
  const filePath = path.join(dir, OG_FILENAME);
  if (fs.existsSync(filePath)) return;

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
  fs.writeFileSync(filePath, crypto.randomUUID(), {
    encoding: "utf-8",
    mode: 0o600,
  });
}

/** Metadata for a web-chat conversation. */
interface ConversationMeta {
  id: string;
  title: string;
  roomId: UUID;
  createdAt: string;
  updatedAt: string;
}

type ChatMode = "simple" | "power";

interface ServerState {
  runtime: AgentRuntime | null;
  config: MilaidyConfig;
  agentState:
    | "not_started"
    | "starting"
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
  eventBuffer: StreamEventEnvelope[];
  nextEventId: number;
  chatRoomId: UUID | null;
  chatUserId: UUID | null;
  chatConnectionReady: { userId: UUID; roomId: UUID; worldId: UUID } | null;
  chatConnectionPromise: Promise<void> | null;
  adminEntityId: UUID | null;
  /** Conversation metadata by conversation id. */
  conversations: Map<string, ConversationMeta>;
  /** Cloud manager for Eliza Cloud integration (null when cloud is disabled). */
  cloudManager: CloudManager | null;
  sandboxManager: SandboxManager | null;
  /** App manager for launching and managing ElizaOS apps. */
  appManager: AppManager;
  /** Fine-tuning/training orchestration service. */
  trainingService: TrainingService | null;
  /** ERC-8004 registry service (null when not configured). */
  registryService: RegistryService | null;
  /** Drop/mint service (null when not configured). */
  dropService: DropService | null;
  /** In-memory queue for share ingest items. */
  shareIngestQueue: ShareIngestItem[];
  /** Broadcast current agent status to all WebSocket clients. Set by startApiServer. */
  broadcastStatus: (() => void) | null;
  /** Broadcast an arbitrary JSON message to all WebSocket clients. Set by startApiServer. */
  broadcastWs: ((data: Record<string, unknown>) => void) | null;
  /** Currently active conversation ID from the frontend (sent via WS). */
  activeConversationId: string | null;
  /** Transient OAuth flow state for subscription auth. */
  _anthropicFlow?: import("../auth/anthropic.js").AnthropicFlow;
  _codexFlow?: import("../auth/openai-codex.js").CodexFlow;
  _codexFlowTimer?: ReturnType<typeof setTimeout>;
  /** System permission states (cached from Electron IPC). */
  permissionStates?: Record<
    string,
    {
      id: string;
      status: string;
      lastChecked: number;
      canRequest: boolean;
    }
  >;
  /** Whether shell access is enabled (can be toggled in UI). */
  shellEnabled?: boolean;
}

interface ShareIngestItem {
  id: string;
  source: string;
  title?: string;
  url?: string;
  text?: string;
  suggestedPrompt: string;
  receivedAt: number;
}

interface PluginParamDef {
  key: string;
  type: string;
  description: string;
  required: boolean;
  sensitive: boolean;
  default?: string;
  /** Predefined options for dropdown selection (e.g. model names). */
  options?: string[];
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
  /** Where the plugin comes from: "bundled" (ships with Milaidy) or "store" (user-installed from registry). */
  source: "bundled" | "store";
  configKeys: string[];
  parameters: PluginParamDef[];
  validationErrors: Array<{ field: string; message: string }>;
  validationWarnings: Array<{ field: string; message: string }>;
  npmName?: string;
  version?: string;
  pluginDeps?: string[];
  /** Whether this plugin is currently active in the runtime. */
  isActive?: boolean;
  /** Error message when plugin is enabled/installed but failed to load. */
  loadError?: string;
  /** Server-provided UI hints for plugin configuration fields. */
  configUiHints?: Record<string, Record<string, unknown>>;
}

interface SkillEntry {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  /** Set automatically when a scan report exists for this skill. */
  scanStatus?: "clean" | "warning" | "critical" | "blocked" | null;
}

interface LogEntry {
  timestamp: number;
  level: string;
  message: string;
  source: string;
  tags: string[];
}

interface AgentEventPayloadLike {
  runId: string;
  seq: number;
  stream: string;
  ts: number;
  data: object;
  sessionKey?: string;
  agentId?: string;
  roomId?: UUID;
}

interface HeartbeatEventPayloadLike {
  ts: number;
  status: string;
  to?: string;
  preview?: string;
  durationMs?: number;
  hasMedia?: boolean;
  reason?: string;
  channel?: string;
  silent?: boolean;
  indicatorType?: string;
}

interface AgentEventServiceLike {
  subscribe: (listener: (event: AgentEventPayloadLike) => void) => () => void;
  subscribeHeartbeat: (
    listener: (event: HeartbeatEventPayloadLike) => void,
  ) => () => void;
}

type StreamEventType = "agent_event" | "heartbeat_event" | "training_event";

interface StreamEventEnvelope {
  type: StreamEventType;
  version: 1;
  eventId: string;
  ts: number;
  runId?: string;
  seq?: number;
  stream?: string;
  sessionKey?: string;
  agentId?: string;
  roomId?: UUID;
  payload: object;
}

// ---------------------------------------------------------------------------
// Response block extraction — parse agent text for structured UI blocks
// ---------------------------------------------------------------------------

/** Content block types returned in the /api/chat and /api/conversations/:id/messages responses. */
type ResponseBlock =
  | { type: "text"; text: string }
  | { type: "ui-spec"; spec: Record<string, unknown>; raw: string }
  | {
      type: "config-form";
      pluginId: string;
      pluginName?: string;
      schema: Record<string, unknown>;
      hints?: Record<string, unknown>;
      values?: Record<string, unknown>;
    };

/** Regex matching fenced JSON code blocks: ```json ... ``` or ``` ... ``` */
const FENCED_JSON_RE_SERVER = /```(?:json)?\s*\n([\s\S]*?)```/g;

/** CONFIG marker pattern: [CONFIG:pluginId] */
const CONFIG_MARKER_RE = /\[CONFIG:([^\]]+)\]/g;

function tryParseJsonServer(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function isUiSpecObject(
  obj: unknown,
): obj is { root: string; elements: Record<string, unknown> } {
  if (obj === null || typeof obj !== "object" || Array.isArray(obj))
    return false;
  const c = obj as Record<string, unknown>;
  return (
    typeof c.root === "string" &&
    c.elements !== null &&
    typeof c.elements === "object" &&
    !Array.isArray(c.elements)
  );
}

/**
 * Scan agent response text for:
 * 1. Fenced UiSpec JSON blocks → extract as { type: "ui-spec", spec, raw }
 * 2. [CONFIG:pluginId] markers → generate { type: "config-form", ... } from plugin list
 * 3. Remaining text → { type: "text", text }
 *
 * Returns { cleanText, blocks } where cleanText has UI blocks/markers removed.
 */
function _extractResponseBlocks(
  responseText: string,
  plugins: PluginEntry[],
): { cleanText: string; blocks: ResponseBlock[] } {
  const blocks: ResponseBlock[] = [];
  let text = responseText;

  // Pass 1: extract fenced UiSpec JSON blocks
  FENCED_JSON_RE_SERVER.lastIndex = 0;
  const uiSpecRanges: Array<{
    start: number;
    end: number;
    block: ResponseBlock;
  }> = [];
  let match: RegExpExecArray | null = FENCED_JSON_RE_SERVER.exec(text);

  while (match !== null) {
    const jsonContent = match[1].trim();
    const parsed = tryParseJsonServer(jsonContent);
    if (parsed !== null && isUiSpecObject(parsed)) {
      uiSpecRanges.push({
        start: match.index,
        end: match.index + match[0].length,
        block: {
          type: "ui-spec",
          spec: parsed as Record<string, unknown>,
          raw: jsonContent,
        },
      });
    }
    match = FENCED_JSON_RE_SERVER.exec(text);
  }

  // Remove UiSpec blocks from text (reverse order to preserve indices)
  if (uiSpecRanges.length > 0) {
    for (let i = uiSpecRanges.length - 1; i >= 0; i--) {
      const r = uiSpecRanges[i];
      blocks.unshift(r.block);
      text = text.slice(0, r.start) + text.slice(r.end);
    }
  }

  // Pass 2: extract [CONFIG:pluginId] markers
  CONFIG_MARKER_RE.lastIndex = 0;
  const configMarkers: Array<{ start: number; end: number; pluginId: string }> =
    [];
  match = CONFIG_MARKER_RE.exec(text);
  while (match !== null) {
    configMarkers.push({
      start: match.index,
      end: match.index + match[0].length,
      pluginId: match[1].trim(),
    });
    match = CONFIG_MARKER_RE.exec(text);
  }

  if (configMarkers.length > 0) {
    for (let i = configMarkers.length - 1; i >= 0; i--) {
      const m = configMarkers[i];
      const plugin = plugins.find((p) => p.id === m.pluginId);
      if (plugin) {
        const schema: Record<string, unknown> = {};
        const values: Record<string, unknown> = {};
        for (const param of plugin.parameters) {
          schema[param.key] = {
            type: param.type,
            description: param.description,
            required: param.required,
          };
          if (param.currentValue !== null)
            values[param.key] = param.currentValue;
        }
        blocks.push({
          type: "config-form",
          pluginId: m.pluginId,
          pluginName: plugin.name,
          schema,
          hints: plugin.configUiHints ?? {},
          values,
        });
      }
      text = text.slice(0, m.start) + text.slice(m.end);
    }
  }

  // Build clean text (trim whitespace from block removal)
  const cleanText = text.replace(/\n{3,}/g, "\n\n").trim();

  // If there's remaining text content, prepend it as a text block
  if (cleanText) {
    blocks.unshift({ type: "text", text: cleanText });
  }

  return { cleanText, blocks };
}

// ---------------------------------------------------------------------------
// Package root resolution (for reading bundled plugins.json)
// ---------------------------------------------------------------------------

function findOwnPackageRoot(startDir: string): string {
  let dir = startDir;
  for (let i = 0; i < 10; i++) {
    const pkgPath = path.join(dir, "package.json");
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as Record<
          string,
          unknown
        >;
        if (pkg.name === "milaidy") return dir;
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
  version?: string;
  pluginDeps?: string[];
  configUiHints?: Record<string, Record<string, unknown>>;
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

function buildParamDefs(
  pluginParams: Record<string, Record<string, unknown>>,
): PluginParamDef[] {
  return Object.entries(pluginParams).map(([key, def]) => {
    const envValue = process.env[key];
    const isSet = Boolean(envValue?.trim());
    const sensitive = Boolean(def.sensitive);
    return {
      key,
      type: (def.type as string) ?? "string",
      description: (def.description as string) ?? "",
      required: Boolean(def.required),
      sensitive,
      default: def.default as string | undefined,
      options: Array.isArray(def.options)
        ? (def.options as string[])
        : undefined,
      currentValue: isSet
        ? sensitive
          ? maskValue(envValue ?? "")
          : (envValue ?? "")
        : null,
      isSet,
    };
  });
}

/**
 * Infer parameter definitions from bare config key names when explicit
 * pluginParameters metadata is not provided.  Uses naming conventions to
 * determine type, sensitivity, requirement level, and a human-readable
 * description.
 */
function _inferParamDefs(configKeys: string[]): PluginParamDef[] {
  return configKeys.map((key) => {
    const upper = key.toUpperCase();

    // Detect sensitive keys
    const sensitive =
      upper.includes("_API_KEY") ||
      upper.includes("_SECRET") ||
      upper.includes("_TOKEN") ||
      upper.includes("_PASSWORD") ||
      upper.includes("_PRIVATE_KEY") ||
      upper.includes("_SIGNING_") ||
      upper.includes("ENCRYPTION_");

    // Detect booleans
    const isBoolean =
      upper.includes("ENABLED") ||
      upper.includes("_ENABLE_") ||
      upper.startsWith("ENABLE_") ||
      upper.includes("DRY_RUN") ||
      upper.includes("_DEBUG") ||
      upper.includes("_VERBOSE") ||
      upper.includes("AUTO_") ||
      upper.includes("FORCE_") ||
      upper.includes("DISABLE_") ||
      upper.includes("SHOULD_") ||
      upper.endsWith("_SSL");

    // Detect numbers
    const isNumber =
      upper.endsWith("_PORT") ||
      upper.endsWith("_INTERVAL") ||
      upper.endsWith("_TIMEOUT") ||
      upper.endsWith("_MS") ||
      upper.endsWith("_MINUTES") ||
      upper.endsWith("_SECONDS") ||
      upper.endsWith("_LIMIT") ||
      upper.endsWith("_MAX") ||
      upper.endsWith("_MIN") ||
      upper.includes("_MAX_") ||
      upper.includes("_MIN_") ||
      upper.endsWith("_COUNT") ||
      upper.endsWith("_SIZE") ||
      upper.endsWith("_STEPS");

    const type = isBoolean ? "boolean" : isNumber ? "number" : "string";

    // Primary keys are required (API keys, tokens, bot tokens, account IDs)
    const required =
      sensitive &&
      (upper.endsWith("_API_KEY") ||
        upper.endsWith("_BOT_TOKEN") ||
        upper.endsWith("_TOKEN") ||
        upper.endsWith("_PRIVATE_KEY"));

    // Generate a human-readable description from the key name
    const description = inferDescription(key);

    const envValue = process.env[key];
    const isSet = Boolean(envValue?.trim());

    return {
      key,
      type,
      description,
      required,
      sensitive,
      default: undefined,
      options: undefined,
      currentValue: isSet
        ? sensitive
          ? maskValue(envValue ?? "")
          : (envValue ?? "")
        : null,
      isSet,
    };
  });
}

/** Derive a human-readable description from an environment variable key. */
function inferDescription(key: string): string {
  const upper = key.toUpperCase();

  // Special well-known suffixes
  if (upper.endsWith("_API_KEY"))
    return `API key for ${prefixLabel(key, "_API_KEY")}`;
  if (upper.endsWith("_BOT_TOKEN"))
    return `Bot token for ${prefixLabel(key, "_BOT_TOKEN")}`;
  if (upper.endsWith("_TOKEN"))
    return `Authentication token for ${prefixLabel(key, "_TOKEN")}`;
  if (upper.endsWith("_SECRET"))
    return `Secret for ${prefixLabel(key, "_SECRET")}`;
  if (upper.endsWith("_PRIVATE_KEY"))
    return `Private key for ${prefixLabel(key, "_PRIVATE_KEY")}`;
  if (upper.endsWith("_PASSWORD"))
    return `Password for ${prefixLabel(key, "_PASSWORD")}`;
  if (upper.endsWith("_RPC_URL"))
    return `RPC endpoint URL for ${prefixLabel(key, "_RPC_URL")}`;
  if (upper.endsWith("_BASE_URL"))
    return `Base URL for ${prefixLabel(key, "_BASE_URL")}`;
  if (upper.endsWith("_URL")) return `URL for ${prefixLabel(key, "_URL")}`;
  if (upper.endsWith("_ENDPOINT"))
    return `Endpoint for ${prefixLabel(key, "_ENDPOINT")}`;
  if (upper.endsWith("_HOST"))
    return `Host address for ${prefixLabel(key, "_HOST")}`;
  if (upper.endsWith("_PORT"))
    return `Port number for ${prefixLabel(key, "_PORT")}`;
  if (upper.endsWith("_MODEL") || upper.includes("_MODEL_"))
    return `Model identifier for ${prefixLabel(key, "_MODEL")}`;
  if (upper.endsWith("_VOICE") || upper.includes("_VOICE_"))
    return `Voice setting for ${prefixLabel(key, "_VOICE")}`;
  if (upper.endsWith("_DIR") || upper.endsWith("_PATH"))
    return `Directory path for ${prefixLabel(key, "_DIR").replace(/_PATH$/i, "")}`;
  if (upper.endsWith("_ENABLED") || upper.startsWith("ENABLE_"))
    return `Enable/disable ${prefixLabel(key, "_ENABLED").replace(/^ENABLE_/i, "")}`;
  if (upper.includes("DRY_RUN")) return `Dry-run mode (no real actions)`;
  if (upper.endsWith("_INTERVAL") || upper.endsWith("_INTERVAL_MINUTES"))
    return `Check interval for ${prefixLabel(key, "_INTERVAL")}`;
  if (upper.endsWith("_TIMEOUT") || upper.endsWith("_TIMEOUT_MS"))
    return `Timeout setting for ${prefixLabel(key, "_TIMEOUT")}`;

  // Generic: convert KEY_NAME to "Key name"
  return key
    .split("_")
    .map((w, i) =>
      i === 0
        ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
        : w.toLowerCase(),
    )
    .join(" ");
}

/** Extract the plugin/service prefix label from a key by removing a known suffix. */
function prefixLabel(key: string, suffix: string): string {
  const raw = key.replace(new RegExp(`${suffix}$`, "i"), "").replace(/_+$/, "");
  if (!raw) return key;
  return raw
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

// ---------------------------------------------------------------------------
// Blocked env keys — dangerous system vars that must never be written via API
// ---------------------------------------------------------------------------

const BLOCKED_ENV_KEYS = new Set([
  "LD_PRELOAD",
  "LD_LIBRARY_PATH",
  "DYLD_INSERT_LIBRARIES",
  "DYLD_LIBRARY_PATH",
  "NODE_OPTIONS",
  "NODE_EXTRA_CA_CERTS",
  "ELECTRON_RUN_AS_NODE",
  "PATH",
  "HOME",
  "SHELL",
  "MILAIDY_API_TOKEN",
  "MILAIDY_WALLET_EXPORT_TOKEN",
  "DATABASE_URL",
  "POSTGRES_URL",
]);

// ---------------------------------------------------------------------------
// Secrets aggregation — collect all sensitive params across plugins
// ---------------------------------------------------------------------------

interface SecretEntry {
  key: string;
  description: string;
  category: string;
  sensitive: boolean;
  required: boolean;
  isSet: boolean;
  maskedValue: string | null;
  usedBy: Array<{ pluginId: string; pluginName: string; enabled: boolean }>;
}

const AI_PROVIDERS = new Set([
  "OPENAI",
  "ANTHROPIC",
  "GOOGLE",
  "MISTRAL",
  "GROQ",
  "COHERE",
  "TOGETHER",
  "FIREWORKS",
  "PERPLEXITY",
  "DEEPSEEK",
  "XAI",
  "OPENROUTER",
  "ELEVENLABS",
  "REPLICATE",
  "HUGGINGFACE",
]);

function inferSecretCategory(key: string): string {
  const upper = key.toUpperCase();

  // AI provider keys
  if (upper.endsWith("_API_KEY")) {
    const prefix = upper.replace(/_API_KEY$/, "");
    if (AI_PROVIDERS.has(prefix)) return "ai-provider";
  }

  // Blockchain
  if (
    upper.endsWith("_RPC_URL") ||
    upper.endsWith("_PRIVATE_KEY") ||
    upper.startsWith("SOLANA_") ||
    upper.startsWith("EVM_") ||
    upper.includes("_WALLET_") ||
    upper.includes("HELIUS") ||
    upper.includes("ALCHEMY") ||
    upper.includes("INFURA") ||
    upper.includes("ANKR") ||
    upper.includes("BIRDEYE")
  ) {
    return "blockchain";
  }

  // Connectors
  if (
    upper.endsWith("_BOT_TOKEN") ||
    upper.startsWith("TELEGRAM_") ||
    upper.startsWith("DISCORD_") ||
    upper.startsWith("TWITTER_") ||
    upper.startsWith("SLACK_") ||
    upper.startsWith("FARCASTER_")
  ) {
    return "connector";
  }

  // Auth
  if (
    upper.endsWith("_TOKEN") ||
    upper.endsWith("_SECRET") ||
    upper.endsWith("_PASSWORD")
  ) {
    return "auth";
  }

  return "other";
}

function aggregateSecrets(plugins: PluginEntry[]): SecretEntry[] {
  const map = new Map<string, SecretEntry>();

  for (const plugin of plugins) {
    for (const param of plugin.parameters) {
      if (!param.sensitive) continue;

      const existing = map.get(param.key);
      if (existing) {
        existing.usedBy.push({
          pluginId: plugin.id,
          pluginName: plugin.name,
          enabled: plugin.enabled,
        });
        // Only mark required if an *enabled* plugin requires it
        if (param.required && plugin.enabled) existing.required = true;
      } else {
        const envValue = process.env[param.key];
        const isSet = Boolean(envValue?.trim());
        map.set(param.key, {
          key: param.key,
          description: param.description || inferDescription(param.key),
          category: inferSecretCategory(param.key),
          sensitive: true,
          required: param.required && plugin.enabled,
          isSet,
          maskedValue: isSet ? maskValue(envValue ?? "") : null,
          usedBy: [
            {
              pluginId: plugin.id,
              pluginName: plugin.name,
              enabled: plugin.enabled,
            },
          ],
        });
      }
    }
  }

  return Array.from(map.values());
}

/**
 * Discover user-installed plugins from the Store (not bundled in the manifest).
 * Reads from config.plugins.installs and tries to enrich with package.json metadata.
 */
function discoverInstalledPlugins(
  config: MilaidyConfig,
  bundledIds: Set<string>,
): PluginEntry[] {
  const installs = config.plugins?.installs;
  if (!installs || typeof installs !== "object") return [];

  const entries: PluginEntry[] = [];

  for (const [packageName, record] of Object.entries(installs)) {
    // Derive a short id from the package name (e.g. "@elizaos/plugin-foo" -> "foo")
    const id = packageName
      .replace(/^@[^/]+\/plugin-/, "")
      .replace(/^@[^/]+\//, "")
      .replace(/^plugin-/, "");

    // Skip if it's already covered by the bundled manifest
    if (bundledIds.has(id)) continue;

    const category = categorizePlugin(id);
    const installPath = (record as Record<string, string>).installPath;

    // Try to read the plugin's package.json for metadata
    let name = packageName;
    let description = `Installed from registry (v${(record as Record<string, string>).version ?? "unknown"})`;
    let pluginConfigKeys: string[] = [];
    let pluginParameters: PluginParamDef[] = [];

    if (installPath) {
      // Check npm layout first, then direct layout
      const candidates = [
        path.join(
          installPath,
          "node_modules",
          ...packageName.split("/"),
          "package.json",
        ),
        path.join(installPath, "package.json"),
      ];
      for (const pkgPath of candidates) {
        try {
          if (fs.existsSync(pkgPath)) {
            const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as {
              name?: string;
              description?: string;
              elizaos?: {
                displayName?: string;
                configKeys?: string[];
                configDefaults?: Record<string, string>;
              };
            };
            if (pkg.name) name = pkg.name;
            if (pkg.description) description = pkg.description;
            if (pkg.elizaos?.displayName) name = pkg.elizaos.displayName;
            if (pkg.elizaos?.configKeys) {
              pluginConfigKeys = pkg.elizaos.configKeys;
              const defaults = pkg.elizaos.configDefaults ?? {};
              pluginParameters = pluginConfigKeys.map((key) => ({
                key,
                label: key,
                description: "",
                required: false,
                sensitive:
                  key.toLowerCase().includes("key") ||
                  key.toLowerCase().includes("secret"),
                type: "string" as const,
                default: defaults[key] ?? undefined,
                isSet: Boolean(process.env[key]?.trim()),
                currentValue: null,
              }));
            }
            break;
          }
        } catch {
          // ignore read errors
        }
      }
    }

    entries.push({
      id,
      name,
      description,
      enabled: false, // Will be updated against the runtime below
      configured:
        pluginConfigKeys.length === 0 || pluginParameters.some((p) => p.isSet),
      envKey: pluginConfigKeys[0] ?? null,
      category,
      source: "store",
      configKeys: pluginConfigKeys,
      parameters: pluginParameters,
      validationErrors: [],
      validationWarnings: [],
    });
  }

  return entries.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Discover available plugins from the bundled plugins.json manifest.
 * Falls back to filesystem scanning for monorepo development.
 */
function discoverPluginsFromManifest(): PluginEntry[] {
  const thisDir =
    import.meta.dirname ?? path.dirname(fileURLToPath(import.meta.url));
  const packageRoot = findOwnPackageRoot(thisDir);
  const manifestPath = path.join(packageRoot, "plugins.json");

  if (fs.existsSync(manifestPath)) {
    try {
      const index = JSON.parse(
        fs.readFileSync(manifestPath, "utf-8"),
      ) as PluginIndex;
      // Keys that are auto-injected by infrastructure and should never be
      // exposed as user-facing "config keys" or parameter definitions.
      const HIDDEN_KEYS = new Set(["VERCEL_OIDC_TOKEN"]);
      return index.plugins
        .map((p) => {
          const category = categorizePlugin(p.id);
          const envKey = p.envKey;
          const filteredConfigKeys = p.configKeys.filter(
            (k) => !HIDDEN_KEYS.has(k),
          );
          const configured = envKey
            ? Boolean(process.env[envKey])
            : filteredConfigKeys.length === 0;
          const filteredParams = p.pluginParameters
            ? Object.fromEntries(
                Object.entries(p.pluginParameters).filter(
                  ([k]) => !HIDDEN_KEYS.has(k),
                ),
              )
            : undefined;
          const parameters = filteredParams
            ? buildParamDefs(filteredParams)
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
            filteredConfigKeys,
            undefined,
            paramInfos,
          );

          return {
            id: p.id,
            name: p.name,
            description: p.description,
            enabled: false,
            configured,
            envKey,
            category,
            source: "bundled" as const,
            configKeys: filteredConfigKeys,
            parameters,
            validationErrors: validation.errors,
            validationWarnings: validation.warnings,
            npmName: p.npmName,
            version: p.version,
            pluginDeps: p.pluginDeps,
            ...(p.configUiHints ? { configUiHints: p.configUiHints } : {}),
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
    "zai",
  ];
  const connectors = [
    "telegram",
    "discord",
    "slack",
    "twitter",
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

// ---------------------------------------------------------------------------
// Skill scan acknowledgments — tracks user review of security findings
// ---------------------------------------------------------------------------

const SKILL_ACK_CACHE_KEY = "milaidy:skill-scan-acknowledgments";

type SkillAcknowledgmentMap = Record<
  string,
  { acknowledgedAt: string; findingCount: number }
>;

async function loadSkillAcknowledgments(
  runtime: AgentRuntime | null,
): Promise<SkillAcknowledgmentMap> {
  if (!runtime) return {};
  try {
    const acks =
      await runtime.getCache<SkillAcknowledgmentMap>(SKILL_ACK_CACHE_KEY);
    return acks ?? {};
  } catch {
    return {};
  }
}

async function saveSkillAcknowledgments(
  runtime: AgentRuntime,
  acks: SkillAcknowledgmentMap,
): Promise<void> {
  try {
    await runtime.setCache(SKILL_ACK_CACHE_KEY, acks);
  } catch (err) {
    logger.debug(
      `[milaidy-api] Failed to save skill acknowledgments: ${err instanceof Error ? err.message : err}`,
    );
  }
}

/**
 * Load a .scan-results.json from the skill's directory on disk.
 *
 * Checks multiple locations because skills can be installed from different sources:
 * - Workspace skills: {workspace}/skills/{id}/
 * - Marketplace skills: {workspace}/skills/.marketplace/{id}/
 * - Catalog-installed (managed) skills: {managed-dir}/{id}/ (default: ./skills/)
 *
 * Also queries the AgentSkillsService for the skill's path when a runtime is available,
 * which covers all sources regardless of directory layout.
 */
async function loadScanReportFromDisk(
  skillId: string,
  workspaceDir: string,
  runtime?: AgentRuntime | null,
): Promise<Record<string, unknown> | null> {
  const fsSync = await import("node:fs");
  const pathMod = await import("node:path");

  const candidates = [
    pathMod.join(workspaceDir, "skills", skillId, ".scan-results.json"),
    pathMod.join(
      workspaceDir,
      "skills",
      ".marketplace",
      skillId,
      ".scan-results.json",
    ),
  ];

  // Also check the path reported by the AgentSkillsService (covers catalog-installed skills
  // whose managed dir might differ from the workspace dir)
  if (runtime) {
    const svc = runtime.getService("AGENT_SKILLS_SERVICE") as
      | { getLoadedSkills?: () => Array<{ slug: string; path: string }> }
      | undefined;
    if (svc?.getLoadedSkills) {
      const loaded = svc.getLoadedSkills().find((s) => s.slug === skillId);
      if (loaded?.path) {
        candidates.push(pathMod.join(loaded.path, ".scan-results.json"));
      }
    }
  }

  // Deduplicate in case paths overlap
  const seen = new Set<string>();
  for (const candidate of candidates) {
    const resolved = pathMod.resolve(candidate);
    if (seen.has(resolved)) continue;
    seen.add(resolved);

    if (!fsSync.existsSync(resolved)) continue;
    const content = fsSync.readFileSync(resolved, "utf-8");
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(content) as Record<string, unknown>;
    } catch {
      continue;
    }
    if (
      typeof parsed.scannedAt === "string" &&
      typeof parsed.status === "string" &&
      Array.isArray(parsed.findings) &&
      Array.isArray(parsed.manifestFindings)
    ) {
      return parsed as Record<string, unknown>;
    }
  }

  return null;
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
              path: string;
            }>;
            getSkillScanStatus?: (
              slug: string,
            ) => "clean" | "warning" | "critical" | "blocked" | null;
          }
        | undefined;
      if (svc && typeof svc.getLoadedSkills === "function") {
        const loadedSkills = svc.getLoadedSkills();

        if (loadedSkills.length > 0) {
          const skills: SkillEntry[] = loadedSkills.map((s) => {
            // Get scan status from in-memory map (fast) or from disk report
            let scanStatus: SkillEntry["scanStatus"] = null;
            if (svc.getSkillScanStatus) {
              scanStatus = svc.getSkillScanStatus(s.slug);
            }
            if (!scanStatus) {
              // Check for .scan-results.json on disk
              const reportPath = path.join(s.path, ".scan-results.json");
              if (fs.existsSync(reportPath)) {
                const raw = fs.readFileSync(reportPath, "utf-8");
                try {
                  const parsed = JSON.parse(raw) as { status?: string };
                  if (parsed.status) {
                    scanStatus = parsed.status as
                      | "clean"
                      | "warning"
                      | "critical"
                      | "blocked";
                  }
                } catch {
                  // Malformed scan report — treat as unscanned.
                }
              }
            }

            return {
              id: s.slug,
              name: s.name || s.slug,
              description: (s.description || "").slice(0, 200),
              enabled: resolveSkillEnabled(s.slug, config, dbPrefs),
              scanStatus,
            };
          });

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
const MAX_IMPORT_BYTES = 512 * 1_048_576; // 512 MB for agent imports
const AGENT_TRANSFER_MIN_PASSWORD_LENGTH = 4;
const AGENT_TRANSFER_MAX_PASSWORD_LENGTH = 1024;

/**
 * Read raw binary request body with a configurable size limit.
 * Used for agent import file uploads.
 */
function readRawBody(
  req: http.IncomingMessage,
  maxBytes: number,
): Promise<Buffer> {
  return readRequestBodyBuffer(req, { maxBytes }).then(
    (body: Buffer | null) => {
      if (body === null) {
        throw new Error(
          `Request body exceeds maximum size (${maxBytes} bytes)`,
        );
      }
      return body;
    },
  );
}

/**
 * Read and parse a JSON request body with size limits and error handling.
 * Returns null (and sends a 4xx response) if reading or parsing fails.
 */
async function readJsonBody<T = Record<string, unknown>>(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<T | null> {
  return parseJsonBody(req, res, {
    maxBytes: MAX_BODY_BYTES,
  });
}

const readBody = (req: http.IncomingMessage): Promise<string> =>
  readRequestBody(req, { maxBytes: MAX_BODY_BYTES }).then(
    (value) => value ?? "",
  );

function json(res: http.ServerResponse, data: unknown, status = 200): void {
  sendJson(res, data, status);
}

function error(res: http.ServerResponse, message: string, status = 400): void {
  sendJsonError(res, message, status);
}

// ---------------------------------------------------------------------------
// Static UI serving (production)
// ---------------------------------------------------------------------------

// Serves the built React dashboard from apps/app/dist/ in production mode.

const STATIC_MIME: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json",
  ".mjs": "application/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
  ".wasm": "application/wasm",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

/** Resolved UI directory. Lazily computed once on first request. */
let uiDir: string | null | undefined;
let uiIndexHtml: Buffer | null = null;

function resolveUiDir(): string | null {
  if (uiDir !== undefined) return uiDir;
  if (process.env.NODE_ENV !== "production") {
    uiDir = null;
    return null;
  }

  const thisDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve("apps/app/dist"),
    path.resolve(thisDir, "../../apps/app/dist"),
  ];

  for (const candidate of candidates) {
    const indexPath = path.join(candidate, "index.html");
    try {
      if (fs.statSync(indexPath).isFile()) {
        uiDir = candidate;
        uiIndexHtml = fs.readFileSync(indexPath);
        logger.info(`[milaidy-api] Serving dashboard UI from ${candidate}`);
        return uiDir;
      }
    } catch {
      // Candidate not present, keep searching.
    }
  }

  uiDir = null;
  logger.info(
    "[milaidy-api] No built UI found — dashboard routes are disabled",
  );
  return null;
}

function sendStaticResponse(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  status: number,
  headers: Record<string, string | number>,
  body?: Buffer,
): void {
  res.writeHead(status, headers);
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  res.end(body);
}

/**
 * Serve built dashboard assets from apps/app/dist with SPA fallback.
 * Returns true when the request is handled.
 */
function serveStaticUi(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pathname: string,
): boolean {
  const root = resolveUiDir();
  if (!root) return false;

  // Keep API and WebSocket namespaces exclusively owned by server handlers.
  if (pathname === "/api" || pathname.startsWith("/api/")) return false;
  if (pathname === "/v1" || pathname.startsWith("/v1/")) return false;
  if (pathname === "/ws") return false;

  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    error(res, "Invalid URL path encoding", 400);
    return true;
  }

  const relativePath = decodedPath.replace(/^\/+/, "");
  const candidatePath = path.resolve(root, relativePath);
  if (
    candidatePath !== root &&
    !candidatePath.startsWith(`${root}${path.sep}`)
  ) {
    error(res, "Forbidden", 403);
    return true;
  }

  try {
    const stat = fs.statSync(candidatePath);
    if (stat.isFile()) {
      const ext = path.extname(candidatePath).toLowerCase();
      const body = fs.readFileSync(candidatePath);
      const cacheControl = relativePath.startsWith("assets/")
        ? "public, max-age=31536000, immutable"
        : "public, max-age=0, must-revalidate";
      sendStaticResponse(
        req,
        res,
        200,
        {
          "Cache-Control": cacheControl,
          "Content-Length": body.length,
          "Content-Type": STATIC_MIME[ext] ?? "application/octet-stream",
        },
        body,
      );
      return true;
    }
  } catch {
    // Missing file falls through to SPA index fallback.
  }

  if (!uiIndexHtml) return false;
  sendStaticResponse(
    req,
    res,
    200,
    {
      "Cache-Control": "public, max-age=0, must-revalidate",
      "Content-Length": uiIndexHtml.length,
      "Content-Type": "text/html; charset=utf-8",
    },
    uiIndexHtml,
  );
  return true;
}

interface ChatGenerationResult {
  text: string;
  agentName: string;
}

interface ChatGenerateOptions {
  onChunk?: (chunk: string) => void;
  isAborted?: () => boolean;
  resolveNoResponseText?: () => string;
}

const INSUFFICIENT_CREDITS_RE =
  /\b(?:insufficient(?:[_\s]+(?:credits?|quota))|insufficient_quota|out of credits|max usage reached|quota(?:\s+exceeded)?)\b/i;

const INSUFFICIENT_CREDITS_CHAT_REPLIES = [
  "Sorry, we're out of credits right now. Please top up your credits and try again.",
  "No model credits left in the tank. Time to top up your credits.",
  "I can't answer on zero credits. Top up your credits and ping me again.",
  "Credit meter is empty. Please top up your credits so I can keep going.",
  "Out of credits, boss. Top up your credits and I am back online.",
] as const;

const GENERIC_NO_RESPONSE_CHAT_REPLY =
  "Sorry, I couldn't generate a response right now. Please try again.";

const DEFAULT_CLOUD_API_BASE_URL = "https://www.elizacloud.ai/api/v1";

function getErrorMessage(err: unknown, fallback = "generation failed"): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return fallback;
}

function isInsufficientCreditsMessage(message: string): boolean {
  return INSUFFICIENT_CREDITS_RE.test(message);
}

function pickInsufficientCreditsChatReply(): string {
  const idx = Math.floor(
    Math.random() * INSUFFICIENT_CREDITS_CHAT_REPLIES.length,
  );
  return INSUFFICIENT_CREDITS_CHAT_REPLIES[idx];
}

function findRecentInsufficientCreditsLog(
  logBuffer: LogEntry[],
  lookbackMs = 60_000,
): LogEntry | null {
  const now = Date.now();
  for (let i = logBuffer.length - 1; i >= 0; i--) {
    const entry = logBuffer[i];
    if (now - entry.timestamp > lookbackMs) break;
    if (isInsufficientCreditsMessage(entry.message)) {
      return entry;
    }
  }
  return null;
}

function resolveNoResponseFallback(logBuffer: LogEntry[]): string {
  if (findRecentInsufficientCreditsLog(logBuffer)) {
    return pickInsufficientCreditsChatReply();
  }
  return GENERIC_NO_RESPONSE_CHAT_REPLY;
}

function getInsufficientCreditsReplyFromError(err: unknown): string | null {
  const msg = getErrorMessage(err, "");
  return isInsufficientCreditsMessage(msg)
    ? pickInsufficientCreditsChatReply()
    : null;
}

function isNoResponsePlaceholder(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.length === 0 || /^\(?no response\)?$/i.test(trimmed);
}

function normalizeChatResponseText(
  text: string,
  logBuffer: LogEntry[],
): string {
  if (!isNoResponsePlaceholder(text)) return text;
  return resolveNoResponseFallback(logBuffer);
}

function resolveCloudApiBaseUrl(rawBaseUrl?: string): string {
  const base = (rawBaseUrl ?? DEFAULT_CLOUD_API_BASE_URL)
    .trim()
    .replace(/\/+$/, "");
  if (base.endsWith("/api/v1")) return base;
  return `${base}/api/v1`;
}

async function fetchCloudCreditsByApiKey(
  baseUrl: string,
  apiKey: string,
): Promise<number | null> {
  const response = await fetch(`${baseUrl}/credits/balance`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    signal: AbortSignal.timeout(10_000),
  });

  const creditResponse = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;

  if (!response.ok) {
    const message =
      typeof creditResponse.error === "string" && creditResponse.error.trim()
        ? creditResponse.error
        : `HTTP ${response.status}`;
    throw new Error(message);
  }

  const rawBalance =
    typeof creditResponse.balance === "number"
      ? creditResponse.balance
      : typeof (creditResponse.data as Record<string, unknown>)?.balance ===
          "number"
        ? ((creditResponse.data as Record<string, unknown>).balance as number)
        : undefined;
  return typeof rawBalance === "number" ? rawBalance : null;
}

function initSse(res: http.ServerResponse): void {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
}

function writeSse(
  res: http.ServerResponse,
  payload: Record<string, string | number | boolean | null | undefined>,
): void {
  if (res.writableEnded || res.destroyed) return;
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function writeSseData(
  res: http.ServerResponse,
  data: string,
  event?: string,
): void {
  if (res.writableEnded || res.destroyed) return;
  if (event) res.write(`event: ${event}\n`);
  res.write(`data: ${data}\n\n`);
}

function writeSseJson(
  res: http.ServerResponse,
  payload: unknown,
  event?: string,
): void {
  writeSseData(res, JSON.stringify(payload), event);
}

async function generateChatResponse(
  runtime: AgentRuntime,
  message: ReturnType<typeof createMessageMemory>,
  agentName: string,
  opts?: ChatGenerateOptions,
): Promise<ChatGenerationResult> {
  let responseText = "";

  const result = await runtime.messageService?.handleMessage(
    runtime,
    message,
    async (content: Content) => {
      if (opts?.isAborted?.()) {
        throw new Error("client_disconnected");
      }

      if (content?.text) {
        responseText += content.text;
        opts?.onChunk?.(content.text);
      }
      return [];
    },
  );

  // Fallback: if callback wasn't used for text, stream + return final text.
  if (!responseText && result?.responseContent?.text) {
    responseText = result.responseContent.text;
    opts?.onChunk?.(result.responseContent.text);
  }

  const noResponseFallback = opts?.resolveNoResponseText?.();
  const finalText = isNoResponsePlaceholder(responseText)
    ? (noResponseFallback ?? (responseText || "(no response)"))
    : responseText;

  return {
    text: finalText,
    agentName,
  };
}

function parseBoundedLimit(rawLimit: string | null, fallback = 15): number {
  return parseClampedInteger(rawLimit, {
    min: 1,
    max: 50,
    fallback,
  });
}

// ---------------------------------------------------------------------------
// Config redaction
// ---------------------------------------------------------------------------

/**
 * Key patterns that indicate a value is sensitive and must be redacted.
 * Matches against the property key at any nesting depth.  Aligned with
 * SENSITIVE_PATTERNS in src/config/schema.ts so every field the UI marks
 * as sensitive is also redacted in the API response.
 *
 * RESIDUAL RISK: Key-based redaction is heuristic — secrets stored under
 * generic keys (e.g. "value", "data", "config") will not be caught.  A
 * stronger approach would be either (a) schema-level `sensitive: true`
 * annotations that drive redaction, or (b) an allowlist that only exposes
 * known-safe fields and strips everything else.  Both require deeper
 * changes to the config schema infrastructure.
 */
const SENSITIVE_KEY_RE =
  /password|secret|api.?key|private.?key|seed.?phrase|authorization|connection.?string|credential|(?<!max)tokens?$/i;

function isBlockedObjectKey(key: string): boolean {
  return key === "__proto__" || key === "constructor" || key === "prototype";
}

function hasBlockedObjectKeyDeep(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.some(hasBlockedObjectKeyDeep);
  if (typeof value !== "object") return false;

  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (isBlockedObjectKey(key)) return true;
    if (hasBlockedObjectKeyDeep(child)) return true;
  }
  return false;
}

function cloneWithoutBlockedObjectKeys<T>(value: T): T {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) {
    return value.map((item) => cloneWithoutBlockedObjectKeys(item)) as T;
  }
  if (typeof value !== "object") return value;

  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (isBlockedObjectKey(key)) continue;
    out[key] = cloneWithoutBlockedObjectKeys(child);
  }
  return out as T;
}

/**
 * Replace any non-empty value with "[REDACTED]".  For arrays, each string
 * element is individually redacted; for objects, all string leaves are
 * redacted.  Non-string primitives (booleans, numbers) are replaced with
 * the string "[REDACTED]" to avoid leaking e.g. numeric PINs.
 */
function redactValue(val: unknown): unknown {
  if (val === null || val === undefined) return val;
  if (typeof val === "string") return val.length > 0 ? "[REDACTED]" : "";
  if (typeof val === "number" || typeof val === "boolean") return "[REDACTED]";
  if (Array.isArray(val)) return val.map(redactValue);
  if (typeof val === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      out[k] = redactValue(v);
    }
    return out;
  }
  return "[REDACTED]";
}

/**
 * Recursively walk a JSON-safe value.  For every object property whose key
 * matches SENSITIVE_KEY_RE, redact the **entire value** regardless of type
 * (string, array, nested object).  This prevents leaks when secrets are
 * stored as arrays (e.g. `apiKeys: ["sk-1","sk-2"]`) or objects.
 * Returns a deep copy — the original is never mutated.
 */
function redactDeep(val: unknown): unknown {
  if (val === null || val === undefined) return val;
  if (Array.isArray(val)) return val.map(redactDeep);
  if (typeof val === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(val as Record<string, unknown>)) {
      if (SENSITIVE_KEY_RE.test(key)) {
        out[key] = redactValue(child);
      } else {
        out[key] = redactDeep(child);
      }
    }
    return out;
  }
  return val;
}

/**
 * Return a deep copy of the config with every sensitive value replaced by
 * "[REDACTED]".  Uses a recursive walk so that ANY future config field
 * whose key matches the sensitive pattern is automatically covered —
 * no manual enumeration required.
 */
function redactConfigSecrets(
  config: Record<string, unknown>,
): Record<string, unknown> {
  return redactDeep(config) as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Skill-ID path-traversal guard
// ---------------------------------------------------------------------------

/**
 * Validate that a user-supplied skill ID is safe to use in filesystem paths.
 * Rejects IDs containing path separators, ".." sequences, or any characters
 * outside the safe set used by the marketplace (`safeName()` in
 * skill-marketplace.ts).  Returns `null` and sends a 400 response if the
 * ID is invalid.
 */
const SAFE_SKILL_ID_RE = /^[a-zA-Z0-9._-]+$/;

function validateSkillId(
  skillId: string,
  res: http.ServerResponse,
): string | null {
  if (
    !skillId ||
    !SAFE_SKILL_ID_RE.test(skillId) ||
    skillId === "." ||
    skillId.includes("..")
  ) {
    const safeDisplay = skillId.slice(0, 80).replace(/[^\x20-\x7e]/g, "?");
    error(res, `Invalid skill ID: "${safeDisplay}"`, 400);
    return null;
  }
  return skillId;
}

// ---------------------------------------------------------------------------
// Onboarding helpers
// ---------------------------------------------------------------------------

// Use shared presets for full parity between CLI and GUI onboarding.
import { STYLE_PRESETS } from "../onboarding-presets.js";

import { pickRandomNames } from "../runtime/onboarding-names.js";

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
      id: "elizacloud",
      name: "Eliza Cloud",
      envKey: null,
      pluginName: "@elizaos/plugin-elizacloud",
      keyPrefix: null,
      description: "Free credits, best option to try the app.",
    },
    {
      id: "anthropic-subscription",
      name: "Anthropic Subscription",
      envKey: null,
      pluginName: "@elizaos/plugin-anthropic",
      keyPrefix: null,
      description:
        "Use your $20-200/mo Claude subscription via OAuth or setup token.",
    },
    {
      id: "openai-subscription",
      name: "OpenAI Subscription",
      envKey: null,
      pluginName: "@elizaos/plugin-openai",
      keyPrefix: null,
      description: "Use your $20-200/mo ChatGPT subscription via OAuth.",
    },
    {
      id: "pi-ai",
      name: "Pi Credentials (pi-ai)",
      envKey: null,
      pluginName: "@mariozechner/pi-ai",
      keyPrefix: null,
      description:
        "Use pi auth (~/.pi/agent/auth.json) for API keys / OAuth (no Milaidy API key required).",
    },
    {
      id: "anthropic",
      name: "Anthropic (API Key)",
      envKey: "ANTHROPIC_API_KEY",
      pluginName: "@elizaos/plugin-anthropic",
      keyPrefix: "sk-ant-",
      description: "Claude models via API key.",
    },
    {
      id: "openai",
      name: "OpenAI (API Key)",
      envKey: "OPENAI_API_KEY",
      pluginName: "@elizaos/plugin-openai",
      keyPrefix: "sk-",
      description: "GPT models via API key.",
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
      id: "gemini",
      name: "Gemini",
      envKey: "GOOGLE_API_KEY",
      pluginName: "@elizaos/plugin-google-genai",
      keyPrefix: null,
      description: "Google's Gemini models.",
    },
    {
      id: "grok",
      name: "Grok",
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
    {
      id: "zai",
      name: "z.ai (GLM Coding Plan)",
      envKey: "ZAI_API_KEY",
      pluginName: "@homunculuslabs/plugin-zai",
      keyPrefix: null,
      description: "GLM models via z.ai Coding Plan.",
    },
  ];
}

function getCloudProviderOptions(): Array<{
  id: string;
  name: string;
  description: string;
}> {
  return [
    {
      id: "elizacloud",
      name: "Eliza Cloud",
      description:
        "Managed cloud infrastructure. Wallets, LLMs, and RPCs included.",
    },
  ];
}

function getModelOptions(): {
  small: Array<{
    id: string;
    name: string;
    provider: string;
    description: string;
  }>;
  large: Array<{
    id: string;
    name: string;
    provider: string;
    description: string;
  }>;
} {
  // All models available via Eliza Cloud (Vercel AI Gateway).
  // IDs use "provider/model" format to match the cloud API routing.
  return {
    small: [
      // OpenAI
      {
        id: "openai/gpt-5-mini",
        name: "GPT-5 Mini",
        provider: "OpenAI",
        description: "Fast and affordable.",
      },
      {
        id: "openai/gpt-4o-mini",
        name: "GPT-4o Mini",
        provider: "OpenAI",
        description: "Compact multimodal model.",
      },
      // Anthropic
      {
        id: "anthropic/claude-sonnet-4",
        name: "Claude Sonnet 4",
        provider: "Anthropic",
        description: "Balanced speed and capability.",
      },
      // Google
      {
        id: "google/gemini-2.5-flash-lite",
        name: "Gemini 2.5 Flash Lite",
        provider: "Google",
        description: "Fastest option.",
      },
      {
        id: "google/gemini-2.5-flash",
        name: "Gemini 2.5 Flash",
        provider: "Google",
        description: "Fast and smart.",
      },
      {
        id: "google/gemini-2.0-flash",
        name: "Gemini 2.0 Flash",
        provider: "Google",
        description: "Multimodal flash model.",
      },
      // Moonshot AI
      {
        id: "moonshotai/kimi-k2-turbo",
        name: "Kimi K2 Turbo",
        provider: "Moonshot AI",
        description: "Extra speed.",
      },
      // DeepSeek
      {
        id: "deepseek/deepseek-v3.2-exp",
        name: "DeepSeek V3.2",
        provider: "DeepSeek",
        description: "Open and powerful.",
      },
    ],
    large: [
      // Anthropic
      {
        id: "anthropic/claude-sonnet-4.5",
        name: "Claude Sonnet 4.5",
        provider: "Anthropic",
        description: "Newest Claude. Excellent reasoning.",
      },
      {
        id: "anthropic/claude-opus-4.5",
        name: "Claude Opus 4.5",
        provider: "Anthropic",
        description: "Most capable Claude model.",
      },
      {
        id: "anthropic/claude-opus-4.1",
        name: "Claude Opus 4.1",
        provider: "Anthropic",
        description: "Deep reasoning powerhouse.",
      },
      {
        id: "anthropic/claude-sonnet-4",
        name: "Claude Sonnet 4",
        provider: "Anthropic",
        description: "Balanced performance.",
      },
      // OpenAI
      {
        id: "openai/gpt-5",
        name: "GPT-5",
        provider: "OpenAI",
        description: "Most capable OpenAI model.",
      },
      {
        id: "openai/gpt-4o",
        name: "GPT-4o",
        provider: "OpenAI",
        description: "Flagship multimodal model.",
      },
      // Google
      {
        id: "google/gemini-3-pro-preview",
        name: "Gemini 3 Pro Preview",
        provider: "Google",
        description: "Advanced reasoning.",
      },
      {
        id: "google/gemini-2.5-pro",
        name: "Gemini 2.5 Pro",
        provider: "Google",
        description: "Strong multimodal reasoning.",
      },
      // Moonshot AI
      {
        id: "moonshotai/kimi-k2-0905",
        name: "Kimi K2",
        provider: "Moonshot AI",
        description: "Fast and capable.",
      },
      // DeepSeek
      {
        id: "deepseek/deepseek-r1",
        name: "DeepSeek R1",
        provider: "DeepSeek",
        description: "Reasoning model.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Dynamic model catalog — per-provider cache, fetch, and serve model lists
// ---------------------------------------------------------------------------

type ModelCategory = "chat" | "embedding" | "image" | "tts" | "stt" | "other";

interface CachedModel {
  id: string;
  name: string;
  category: ModelCategory;
}

interface ProviderCache {
  version: 1;
  providerId: string;
  fetchedAt: string;
  models: CachedModel[];
}

function classifyModel(modelId: string): ModelCategory {
  const id = modelId.toLowerCase();
  if (id.includes("embed") || id.includes("text-embedding")) return "embedding";
  if (
    id.includes("dall-e") ||
    id.includes("dalle") ||
    id.includes("imagen") ||
    id.includes("stable-diffusion") ||
    id.includes("midjourney") ||
    id.includes("flux")
  )
    return "image";
  if (
    id.includes("tts") ||
    id.includes("text-to-speech") ||
    id.includes("eleven_")
  )
    return "tts";
  if (id.includes("whisper") || id.includes("stt") || id.includes("transcrib"))
    return "stt";
  if (
    id.includes("moderation") ||
    id.includes("guard") ||
    id.includes("safety")
  )
    return "other";
  return "chat";
}

/** Map param key → expected model category */
function paramKeyToCategory(paramKey: string): ModelCategory {
  const k = paramKey.toUpperCase();
  if (k.includes("EMBEDDING")) return "embedding";
  if (k.includes("IMAGE")) return "image";
  if (k.includes("TTS")) return "tts";
  if (k.includes("STT") || k.includes("TRANSCRIPTION")) return "stt";
  return "chat";
}

const MODELS_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

const PROVIDER_ENV_KEYS: Record<
  string,
  { envKey: string; altEnvKeys?: string[]; baseUrl?: string }
> = {
  anthropic: { envKey: "ANTHROPIC_API_KEY" },
  openai: { envKey: "OPENAI_API_KEY" },
  groq: { envKey: "GROQ_API_KEY", baseUrl: "https://api.groq.com/openai/v1" },
  xai: { envKey: "XAI_API_KEY", baseUrl: "https://api.x.ai/v1" },
  openrouter: {
    envKey: "OPENROUTER_API_KEY",
    baseUrl: "https://openrouter.ai/api/v1",
  },
  "google-genai": {
    envKey: "GOOGLE_GENERATIVE_AI_API_KEY",
    altEnvKeys: ["GOOGLE_API_KEY"],
  },
  ollama: { envKey: "OLLAMA_BASE_URL" },
  "vercel-ai-gateway": {
    envKey: "AI_GATEWAY_API_KEY",
    altEnvKeys: ["AIGATEWAY_API_KEY"],
  },
};

// ── Per-provider cache read/write ────────────────────────────────────────

function providerCachePath(providerId: string): string {
  return path.join(resolveModelsCacheDir(), `${providerId}.json`);
}

function readProviderCache(providerId: string): ProviderCache | null {
  try {
    const raw = fs.readFileSync(providerCachePath(providerId), "utf-8");
    const cache = JSON.parse(raw) as ProviderCache;
    if (cache.version !== 1 || !cache.fetchedAt || !cache.models) return null;
    const age = Date.now() - new Date(cache.fetchedAt).getTime();
    if (age > MODELS_CACHE_TTL_MS) return null;
    return cache;
  } catch {
    return null;
  }
}

function writeProviderCache(cache: ProviderCache): void {
  try {
    const dir = resolveModelsCacheDir();
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      providerCachePath(cache.providerId),
      JSON.stringify(cache, null, 2),
    );
  } catch (e) {
    logger.warn(
      `[model-catalog] Failed to write cache for ${cache.providerId}: ${e instanceof Error ? e.message : e}`,
    );
  }
}

// ── Provider fetchers ────────────────────────────────────────────────────

/** Fetch models from any provider's /v1/models endpoint (standard REST). */
async function fetchModelsREST(
  providerId: string,
  apiKey: string,
  baseUrl: string,
): Promise<CachedModel[]> {
  try {
    const url = `${baseUrl.replace(/\/+$/, "")}/models`;
    const headers: Record<string, string> = {};
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
    const res = await fetch(url, { headers });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      data?: Array<{ id: string; name?: string; type?: string }>;
    };
    return (data.data ?? [])
      .map((m) => ({
        id: m.id,
        name: m.name ?? m.id,
        category: m.type ? restTypeToCategory(m.type) : classifyModel(m.id),
      }))
      .sort((a, b) => a.id.localeCompare(b.id));
  } catch (e) {
    logger.warn(
      `[model-catalog] Failed to fetch models for ${providerId}: ${e instanceof Error ? e.message : e}`,
    );
    return [];
  }
}

function restTypeToCategory(type: string): ModelCategory {
  const t = type.toLowerCase();
  if (t.includes("embed")) return "embedding";
  if (t === "image" || t.includes("image-generation")) return "image";
  if (t.includes("tts") || t.includes("speech")) return "tts";
  if (t.includes("stt") || t.includes("transcription") || t.includes("whisper"))
    return "stt";
  if (t === "language" || t === "chat" || t.includes("text")) return "chat";
  return classifyModel(type);
}

async function fetchAnthropicModels(apiKey: string): Promise<CachedModel[]> {
  try {
    const headers: Record<string, string> = {
      "anthropic-version": "2023-06-01",
    };
    if (apiKey) headers["x-api-key"] = apiKey;
    const res = await fetch("https://api.anthropic.com/v1/models?limit=100", {
      headers,
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      data?: Array<{ id: string; display_name?: string; type?: string }>;
    };
    return (data.data ?? [])
      .map((m) => ({
        id: m.id,
        name: m.display_name ?? m.id,
        category: classifyModel(m.id),
      }))
      .sort((a, b) => a.id.localeCompare(b.id));
  } catch (e) {
    logger.warn(
      `[model-catalog] Failed to fetch Anthropic models: ${e instanceof Error ? e.message : e}`,
    );
    return [];
  }
}

async function fetchGoogleModels(apiKey: string): Promise<CachedModel[]> {
  try {
    const url = apiKey
      ? `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`
      : "https://generativelanguage.googleapis.com/v1beta/models";
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = (await res.json()) as {
      models?: Array<{ name: string; displayName?: string }>;
    };
    return (data.models ?? []).map((m) => {
      const id = m.name.replace("models/", "");
      return {
        id,
        name: m.displayName ?? id,
        category: classifyModel(id),
      };
    });
  } catch (e) {
    logger.warn(
      `[model-catalog] Failed to fetch Google models: ${e instanceof Error ? e.message : e}`,
    );
    return [];
  }
}

async function fetchOllamaModels(baseUrl: string): Promise<CachedModel[]> {
  try {
    const url = baseUrl.replace(/\/+$/, "");
    const res = await fetch(`${url}/api/tags`);
    if (!res.ok) return [];
    const data = (await res.json()) as { models?: Array<{ name: string }> };
    return (data.models ?? []).map((m) => ({
      id: m.name,
      name: m.name,
      category: classifyModel(m.name),
    }));
  } catch (e) {
    logger.warn(
      `[model-catalog] Failed to fetch Ollama models: ${e instanceof Error ? e.message : e}`,
    );
    return [];
  }
}

/** Fetch ALL OpenRouter models: chat (/api/v1/models) + embeddings (/api/v1/embeddings/models). */
async function fetchOpenRouterModels(apiKey: string): Promise<CachedModel[]> {
  const headers: Record<string, string> = {};
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  interface ORModel {
    id: string;
    name?: string;
    architecture?: { modality?: string; output_modalities?: string[] };
  }

  // Fetch chat/text models and embedding models in parallel
  const [chatRes, embedRes] = await Promise.all([
    fetch("https://openrouter.ai/api/v1/models", { headers }).catch(() => null),
    fetch("https://openrouter.ai/api/v1/embeddings/models", { headers }).catch(
      () => null,
    ),
  ]);

  const models: CachedModel[] = [];

  // Parse chat/text/image models
  if (chatRes?.ok) {
    try {
      const data = (await chatRes.json()) as { data?: ORModel[] };
      for (const m of data.data ?? []) {
        const outputs = m.architecture?.output_modalities ?? [];
        let category: ModelCategory = "chat";
        if (outputs.includes("image")) category = "image";
        else if (outputs.includes("audio")) category = "tts";
        models.push({ id: m.id, name: m.name ?? m.id, category });
      }
    } catch {
      /* parse error */
    }
  }

  // Parse embedding models
  if (embedRes?.ok) {
    try {
      const data = (await embedRes.json()) as { data?: ORModel[] };
      for (const m of data.data ?? []) {
        models.push({ id: m.id, name: m.name ?? m.id, category: "embedding" });
      }
    } catch {
      /* parse error */
    }
  }

  models.sort((a, b) => a.id.localeCompare(b.id));
  return models;
}

/** Fetch Vercel AI Gateway models — no auth required, response has `type` field. */
async function fetchVercelGatewayModels(
  baseUrl: string,
): Promise<CachedModel[]> {
  try {
    const url = `${baseUrl.replace(/\/+$/, "")}/models`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = (await res.json()) as {
      data?: Array<{ id: string; name?: string; type?: string }>;
    };
    return (data.data ?? [])
      .map((m) => ({
        id: m.id,
        name: m.name ?? m.id,
        category: m.type ? restTypeToCategory(m.type) : classifyModel(m.id),
      }))
      .sort((a, b) => a.id.localeCompare(b.id));
  } catch (e) {
    logger.warn(
      `[model-catalog] Failed to fetch Vercel AI Gateway models: ${e instanceof Error ? e.message : e}`,
    );
    return [];
  }
}

async function fetchProviderModels(
  providerId: string,
  apiKey: string,
  baseUrl?: string,
): Promise<CachedModel[]> {
  switch (providerId) {
    case "anthropic":
      return fetchAnthropicModels(apiKey);
    case "google-genai":
      return fetchGoogleModels(apiKey);
    case "ollama":
      return fetchOllamaModels(apiKey);
    case "openrouter":
      return fetchOpenRouterModels(apiKey);
    case "openai":
      return fetchModelsREST(
        providerId,
        apiKey,
        baseUrl ?? "https://api.openai.com/v1",
      );
    case "groq":
      return fetchModelsREST(
        providerId,
        apiKey,
        baseUrl ?? "https://api.groq.com/openai/v1",
      );
    case "xai":
      return fetchModelsREST(
        providerId,
        apiKey,
        baseUrl ?? "https://api.x.ai/v1",
      );
    case "vercel-ai-gateway":
      return fetchVercelGatewayModels(
        baseUrl ?? "https://ai-gateway.vercel.sh/v1",
      );
    default:
      return [];
  }
}

/** Fetch + cache a single provider. Returns cached models or empty array. */
async function getOrFetchProvider(
  providerId: string,
  force = false,
): Promise<CachedModel[]> {
  if (!force) {
    const cached = readProviderCache(providerId);
    if (cached) return cached.models;
  }

  const cfg = PROVIDER_ENV_KEYS[providerId];
  if (!cfg) return [];

  let keyValue = process.env[cfg.envKey]?.trim();
  if (!keyValue && cfg.altEnvKeys) {
    for (const alt of cfg.altEnvKeys) {
      keyValue = process.env[alt]?.trim();
      if (keyValue) break;
    }
  }

  let baseUrl = cfg.baseUrl;
  if (providerId === "vercel-ai-gateway") {
    baseUrl =
      process.env.AI_GATEWAY_BASE_URL?.trim() ||
      "https://ai-gateway.vercel.sh/v1";
  }

  // Listing models doesn't require an API key — fetch from all providers
  const models = await fetchProviderModels(providerId, keyValue ?? "", baseUrl);
  if (models.length > 0) {
    writeProviderCache({
      version: 1,
      providerId,
      fetchedAt: new Date().toISOString(),
      models,
    });
  }
  return models;
}

/** Fetch all configured providers (parallel). Returns map of providerId → models. */
async function getOrFetchAllProviders(
  force = false,
): Promise<Record<string, CachedModel[]>> {
  const result: Record<string, CachedModel[]> = {};
  const fetches: Array<Promise<void>> = [];

  for (const providerId of Object.keys(PROVIDER_ENV_KEYS)) {
    fetches.push(
      getOrFetchProvider(providerId, force).then((models) => {
        if (models.length > 0) result[providerId] = models;
      }),
    );
  }

  await Promise.all(fetches);
  return result;
}

function getPiModelOptions(): Array<{
  id: string;
  name: string;
  provider: string;
  description: string;
}> {
  const options: Array<{
    id: string;
    name: string;
    provider: string;
    description: string;
  }> = [];

  try {
    for (const providerId of piAi.getProviders()) {
      for (const model of piAi.getModels(providerId)) {
        const id = `${model.provider}/${model.id}`;
        options.push({
          id,
          name: model.id,
          provider: model.provider,
          description: model.api,
        });

        // Safety cap in case a provider returns an unexpectedly huge list.
        if (options.length >= 2000) {
          return options;
        }
      }
    }
  } catch (err) {
    logger.warn(
      `[milaidy-api] Failed to enumerate pi-ai models: ${String(err)}`,
    );
  }

  return options;
}

function getInventoryProviderOptions(): Array<{
  id: string;
  name: string;
  description: string;
  rpcProviders: Array<{
    id: string;
    name: string;
    description: string;
    envKey: string | null;
    requiresKey: boolean;
  }>;
}> {
  return [
    {
      id: "evm",
      name: "EVM",
      description: "Ethereum, Base, Arbitrum, Optimism, Polygon.",
      rpcProviders: [
        {
          id: "elizacloud",
          name: "Eliza Cloud",
          description: "Managed RPC. No setup needed.",
          envKey: null,
          requiresKey: false,
        },
        {
          id: "infura",
          name: "Infura",
          description: "Reliable EVM infrastructure.",
          envKey: "INFURA_API_KEY",
          requiresKey: true,
        },
        {
          id: "alchemy",
          name: "Alchemy",
          description: "Full-featured EVM data platform.",
          envKey: "ALCHEMY_API_KEY",
          requiresKey: true,
        },
        {
          id: "ankr",
          name: "Ankr",
          description: "Decentralized RPC provider.",
          envKey: "ANKR_API_KEY",
          requiresKey: true,
        },
      ],
    },
    {
      id: "solana",
      name: "Solana",
      description: "Solana mainnet tokens and NFTs.",
      rpcProviders: [
        {
          id: "elizacloud",
          name: "Eliza Cloud",
          description: "Managed RPC. No setup needed.",
          envKey: null,
          requiresKey: false,
        },
        {
          id: "helius",
          name: "Helius",
          description: "Solana-native data platform.",
          envKey: "HELIUS_API_KEY",
          requiresKey: true,
        },
      ],
    },
  ];
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

function resolveCorsOrigin(origin?: string): string | null {
  if (!origin) return null;
  const trimmed = origin.trim();
  if (!trimmed) return null;

  // Explicit allowlist via env (comma-separated)
  const extra = process.env.MILAIDY_ALLOWED_ORIGINS;
  if (extra) {
    const allow = extra
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
    if (allow.includes(trimmed)) return trimmed;
  }

  if (LOCAL_ORIGIN_RE.test(trimmed)) return trimmed;
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
      "GET, POST, PUT, DELETE, OPTIONS",
    );
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, X-Milaidy-Token, X-Api-Key, X-Milaidy-Export-Token",
    );
  }

  return true;
}

const PAIRING_TTL_MS = 10 * 60 * 1000;
const PAIRING_WINDOW_MS = 10 * 60 * 1000;
const PAIRING_MAX_ATTEMPTS = 5;
const PAIRING_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const API_RESTART_EXIT_CODE = 75;

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

function tokenMatches(expected: string, provided: string): boolean {
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(provided, "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function isLoopbackBindHost(host: string): boolean {
  const normalized = host
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, "");
  if (!normalized) return true;
  if (
    normalized === "localhost" ||
    normalized === "::1" ||
    normalized === "::ffff:127.0.0.1"
  ) {
    return true;
  }
  if (normalized.startsWith("127.")) return true;
  return false;
}

export function ensureApiTokenForBindHost(host: string): void {
  const token = process.env.MILAIDY_API_TOKEN?.trim();
  if (token) return;
  if (isLoopbackBindHost(host)) return;

  const generated = crypto.randomBytes(32).toString("hex");
  process.env.MILAIDY_API_TOKEN = generated;

  logger.warn(
    `[milaidy-api] MILAIDY_API_BIND=${host} is non-loopback and MILAIDY_API_TOKEN is unset.`,
  );
  const tokenFingerprint = `${generated.slice(0, 4)}...${generated.slice(-4)}`;
  logger.warn(
    `[milaidy-api] Generated temporary MILAIDY_API_TOKEN (${tokenFingerprint}) for this process. Set MILAIDY_API_TOKEN explicitly to override.`,
  );
}

function isAuthorized(req: http.IncomingMessage): boolean {
  const expected = process.env.MILAIDY_API_TOKEN?.trim();
  if (!expected) return true;
  const provided = extractAuthToken(req);
  if (!provided) return false;
  return tokenMatches(expected, provided);
}

export interface PluginConfigMutationRejection {
  field: string;
  message: string;
}

export function resolvePluginConfigMutationRejections(
  pluginParams: Array<{ key: string }>,
  config: Record<string, unknown>,
): PluginConfigMutationRejection[] {
  const allowedParamKeys = new Set(
    pluginParams.map((p) => p.key.toUpperCase().trim()),
  );
  const rejections: PluginConfigMutationRejection[] = [];

  for (const key of Object.keys(config)) {
    const normalized = key.toUpperCase().trim();

    if (!allowedParamKeys.has(normalized)) {
      rejections.push({
        field: key,
        message: `${key} is not a declared config key for this plugin`,
      });
      continue;
    }

    if (BLOCKED_ENV_KEYS.has(normalized)) {
      rejections.push({
        field: key,
        message: `${key} is blocked for security reasons`,
      });
    }
  }

  return rejections;
}

interface WalletExportRequestBody {
  confirm?: boolean;
  exportToken?: string;
}

export interface WalletExportRejection {
  status: 401 | 403;
  reason: string;
}

export function resolveWalletExportRejection(
  req: http.IncomingMessage,
  body: WalletExportRequestBody,
): WalletExportRejection | null {
  if (!body.confirm) {
    return {
      status: 403,
      reason:
        'Export requires explicit confirmation. Send { "confirm": true } in the request body.',
    };
  }

  const expected = process.env.MILAIDY_WALLET_EXPORT_TOKEN?.trim();
  if (!expected) {
    return {
      status: 403,
      reason:
        "Wallet export is disabled. Set MILAIDY_WALLET_EXPORT_TOKEN to enable secure exports.",
    };
  }

  const headerToken =
    typeof req.headers["x-milaidy-export-token"] === "string"
      ? req.headers["x-milaidy-export-token"].trim()
      : "";
  const bodyToken =
    typeof body.exportToken === "string" ? body.exportToken.trim() : "";
  const provided = headerToken || bodyToken;

  if (!provided) {
    return {
      status: 401,
      reason:
        "Missing export token. Provide X-Milaidy-Export-Token header or exportToken in request body.",
    };
  }

  if (!tokenMatches(expected, provided)) {
    return { status: 401, reason: "Invalid export token." };
  }

  return null;
}

function extractWsQueryToken(url: URL): string | null {
  const allowQueryToken = process.env.MILAIDY_ALLOW_WS_QUERY_TOKEN === "1";
  if (!allowQueryToken) return null;

  const token =
    url.searchParams.get("token") ??
    url.searchParams.get("apiKey") ??
    url.searchParams.get("api_key");
  return token?.trim() || null;
}

function isWebSocketAuthorized(
  request: http.IncomingMessage,
  url: URL,
): boolean {
  const expected = process.env.MILAIDY_API_TOKEN?.trim();
  if (!expected) return true;

  const headerToken = extractAuthToken(request);
  if (headerToken) return tokenMatches(expected, headerToken);

  const queryToken = extractWsQueryToken(url);
  if (!queryToken) return false;
  return tokenMatches(expected, queryToken);
}

export interface WebSocketUpgradeRejection {
  status: 401 | 403 | 404;
  reason: string;
}

export function resolveWebSocketUpgradeRejection(
  req: http.IncomingMessage,
  wsUrl: URL,
): WebSocketUpgradeRejection | null {
  if (wsUrl.pathname !== "/ws") {
    return { status: 404, reason: "Not found" };
  }

  const origin =
    typeof req.headers.origin === "string" ? req.headers.origin : undefined;
  const allowedOrigin = resolveCorsOrigin(origin);
  if (origin && !allowedOrigin) {
    return { status: 403, reason: "Origin not allowed" };
  }

  if (!isWebSocketAuthorized(req, wsUrl)) {
    return { status: 401, reason: "Unauthorized" };
  }

  return null;
}

const RESET_STATE_ALLOWED_SEGMENTS = new Set([".milaidy", "milaidy"]);

function hasAllowedResetSegment(resolvedState: string): boolean {
  return resolvedState
    .split(path.sep)
    .some((segment) =>
      RESET_STATE_ALLOWED_SEGMENTS.has(segment.trim().toLowerCase()),
    );
}

export function isSafeResetStateDir(
  resolvedState: string,
  homeDir: string,
): boolean {
  const normalizedState = path.resolve(resolvedState);
  const normalizedHome = path.resolve(homeDir);
  const parsedRoot = path.parse(normalizedState).root;

  if (normalizedState === parsedRoot) return false;
  if (normalizedState === normalizedHome) return false;

  const relativeToHome = path.relative(normalizedHome, normalizedState);
  const isUnderHome =
    relativeToHome.length > 0 &&
    !relativeToHome.startsWith("..") &&
    !path.isAbsolute(relativeToHome);
  if (!isUnderHome) return false;

  return hasAllowedResetSegment(normalizedState);
}

type ConversationRoomTitleRef = Pick<
  ConversationMeta,
  "id" | "title" | "roomId"
>;

export async function persistConversationRoomTitle(
  runtime: Pick<AgentRuntime, "getRoom" | "adapter"> | null | undefined,
  conversation: ConversationRoomTitleRef,
): Promise<boolean> {
  if (!runtime) return false;
  const room = await runtime.getRoom(conversation.roomId);
  if (!room) return false;
  if (room.name === conversation.title) return false;

  const adapter = runtime.adapter as {
    updateRoom?: (nextRoom: typeof room) => Promise<void>;
  };
  if (typeof adapter.updateRoom !== "function") return false;

  await adapter.updateRoom({ ...room, name: conversation.title });
  return true;
}

function rejectWebSocketUpgrade(
  socket: import("node:stream").Duplex,
  statusCode: number,
  message: string,
): void {
  const statusText =
    statusCode === 401
      ? "Unauthorized"
      : statusCode === 403
        ? "Forbidden"
        : statusCode === 404
          ? "Not Found"
          : "Bad Request";
  const body = `${message}\n`;
  socket.write(
    `HTTP/1.1 ${statusCode} ${statusText}\r\n` +
      "Connection: close\r\n" +
      "Content-Type: text/plain; charset=utf-8\r\n" +
      `Content-Length: ${Buffer.byteLength(body)}\r\n` +
      "\r\n" +
      body,
  );
  socket.destroy();
}

function decodePathComponent(
  raw: string,
  res: http.ServerResponse,
  fieldName: string,
): string | null {
  try {
    return decodeURIComponent(raw);
  } catch {
    error(res, `Invalid ${fieldName}: malformed URL encoding`, 400);
    return null;
  }
}

const WORKBENCH_TASK_TAG = "workbench-task";
const WORKBENCH_TODO_TAG = "workbench-todo";

interface WorkbenchTaskView {
  id: string;
  name: string;
  description: string;
  tags: string[];
  isCompleted: boolean;
  updatedAt?: number;
}

interface WorkbenchTodoView {
  id: string;
  name: string;
  description: string;
  priority: number | null;
  isUrgent: boolean;
  isCompleted: boolean;
  type: string;
}

interface TodoDataServiceLike {
  createTodo: (input: Record<string, unknown>) => Promise<string>;
  getTodos: (
    filters?: Record<string, unknown>,
  ) => Promise<Array<Record<string, unknown>>>;
  getTodo: (todoId: string) => Promise<Record<string, unknown> | null>;
  updateTodo: (
    todoId: string,
    updates: Record<string, unknown>,
  ) => Promise<boolean>;
  deleteTodo: (todoId: string) => Promise<boolean>;
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function normalizeTimestamp(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string") {
    const asNumber = Number(value);
    if (Number.isFinite(asNumber)) return asNumber;
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function parseNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function readTaskMetadata(task: Task): Record<string, unknown> {
  return asObject(task.metadata) ?? {};
}

function normalizeTaskId(task: Task): string | null {
  return typeof task.id === "string" && task.id.trim().length > 0
    ? task.id
    : null;
}

function readTaskCompleted(task: Task): boolean {
  const metadata = readTaskMetadata(task);
  if (typeof metadata.isCompleted === "boolean") return metadata.isCompleted;
  const todoMeta =
    asObject(metadata.workbenchTodo) ?? asObject(metadata.todo) ?? null;
  if (todoMeta && typeof todoMeta.isCompleted === "boolean") {
    return todoMeta.isCompleted;
  }
  return false;
}

function isWorkbenchTodoTask(task: Task): boolean {
  if (readTriggerConfig(task)) return false;
  const tags = new Set(normalizeStringArray(task.tags));
  if (tags.has(WORKBENCH_TODO_TAG) || tags.has("todo")) return true;
  const metadata = readTaskMetadata(task);
  return (
    asObject(metadata.workbenchTodo) !== null ||
    asObject(metadata.todo) !== null
  );
}

function toWorkbenchTask(task: Task): WorkbenchTaskView | null {
  if (readTriggerConfig(task) || isWorkbenchTodoTask(task)) return null;
  const id = normalizeTaskId(task);
  if (!id) return null;
  const metadata = readTaskMetadata(task);
  const updatedAt =
    normalizeTimestamp(
      (task as unknown as Record<string, unknown>).updatedAt,
    ) ?? normalizeTimestamp(metadata.updatedAt);
  return {
    id,
    name:
      typeof task.name === "string" && task.name.trim().length > 0
        ? task.name
        : "Task",
    description: typeof task.description === "string" ? task.description : "",
    tags: normalizeStringArray(task.tags),
    isCompleted: readTaskCompleted(task),
    ...(updatedAt !== undefined ? { updatedAt } : {}),
  };
}

function toWorkbenchTodo(task: Task): WorkbenchTodoView | null {
  if (!isWorkbenchTodoTask(task)) return null;
  const id = normalizeTaskId(task);
  if (!id) return null;
  const metadata = readTaskMetadata(task);
  const todoMeta =
    asObject(metadata.workbenchTodo) ?? asObject(metadata.todo) ?? {};
  return {
    id,
    name:
      typeof task.name === "string" && task.name.trim().length > 0
        ? task.name
        : "Todo",
    description:
      typeof todoMeta.description === "string"
        ? todoMeta.description
        : typeof task.description === "string"
          ? task.description
          : "",
    priority: parseNullableNumber(todoMeta.priority),
    isUrgent: todoMeta.isUrgent === true,
    isCompleted: readTaskCompleted(task),
    type:
      typeof todoMeta.type === "string" && todoMeta.type.trim().length > 0
        ? todoMeta.type
        : "task",
  };
}

function normalizeTags(value: unknown, required: string[] = []): string[] {
  const next = new Set<string>([
    ...normalizeStringArray(value),
    ...required.map((tag) => tag.trim()).filter((tag) => tag.length > 0),
  ]);
  return [...next];
}

async function getTodoDataService(
  runtime: AgentRuntime,
): Promise<TodoDataServiceLike | null> {
  try {
    const todoModule = (await import("@elizaos/plugin-todo")) as Record<
      string,
      unknown
    >;
    const createTodoDataService = todoModule.createTodoDataService as
      | ((rt: AgentRuntime) => TodoDataServiceLike)
      | undefined;
    if (!createTodoDataService) return null;
    return createTodoDataService(runtime);
  } catch {
    return null;
  }
}

function toWorkbenchTodoFromRecord(
  todo: Record<string, unknown>,
): WorkbenchTodoView | null {
  const id =
    typeof todo.id === "string" && todo.id.trim().length > 0 ? todo.id : null;
  const name =
    typeof todo.name === "string" && todo.name.trim().length > 0
      ? todo.name
      : null;
  if (!id || !name) return null;
  return {
    id,
    name,
    description: typeof todo.description === "string" ? todo.description : "",
    priority: parseNullableNumber(todo.priority),
    isUrgent: todo.isUrgent === true,
    isCompleted: todo.isCompleted === true,
    type:
      typeof todo.type === "string" && todo.type.trim().length > 0
        ? todo.type
        : "task",
  };
}

// ── Runtime debug serialization ─────────────────────────────────────

const RUNTIME_DEBUG_DEFAULT_MAX_DEPTH = 10;
const RUNTIME_DEBUG_MAX_DEPTH_CAP = 24;
const RUNTIME_DEBUG_DEFAULT_MAX_ARRAY_LENGTH = 1000;
const RUNTIME_DEBUG_DEFAULT_MAX_OBJECT_ENTRIES = 1000;
const RUNTIME_DEBUG_DEFAULT_MAX_STRING_LENGTH = 8000;

interface RuntimeDebugSerializeOptions {
  maxDepth: number;
  maxArrayLength: number;
  maxObjectEntries: number;
  maxStringLength: number;
}

interface RuntimeOrderItem {
  index: number;
  name: string;
  className: string;
  id: string | null;
}

interface RuntimeServiceOrderItem {
  index: number;
  serviceType: string;
  count: number;
  instances: RuntimeOrderItem[];
}

function parseDebugPositiveInt(
  raw: string | null,
  fallback: number,
  min: number,
  max: number,
): number {
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  const intValue = Math.floor(parsed);
  if (intValue < min) return min;
  if (intValue > max) return max;
  return intValue;
}

function classNameFor(value: object): string {
  const ctor = (value as { constructor?: { name?: string } }).constructor;
  const maybeName = typeof ctor?.name === "string" ? ctor.name.trim() : "";
  return maybeName || "Object";
}

function stringDataProperty(value: unknown, key: string): string | null {
  if (!value || typeof value !== "object") return null;
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor || !("value" in descriptor)) return null;
  const maybeString = descriptor.value;
  if (typeof maybeString !== "string") return null;
  const trimmed = maybeString.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function describeRuntimeOrder(
  values: unknown[],
  fallbackLabel: string,
): RuntimeOrderItem[] {
  return values.map((value, index) => {
    const className =
      value && typeof value === "object" ? classNameFor(value) : typeof value;
    const name =
      stringDataProperty(value, "name") ??
      stringDataProperty(value, "id") ??
      stringDataProperty(value, "key") ??
      stringDataProperty(value, "serviceType") ??
      `${fallbackLabel} ${index + 1}`;
    const id =
      stringDataProperty(value, "id") ?? stringDataProperty(value, "name");
    return { index, name, className, id };
  });
}

function describeRuntimeServiceOrder(
  servicesMap: Map<string, unknown[]>,
): RuntimeServiceOrderItem[] {
  return Array.from(servicesMap.entries()).map(
    ([serviceType, instances], i) => {
      const values = Array.isArray(instances) ? instances : [];
      return {
        index: i,
        serviceType,
        count: values.length,
        instances: describeRuntimeOrder(values, serviceType),
      };
    },
  );
}

function serializeForRuntimeDebug(
  value: unknown,
  options: RuntimeDebugSerializeOptions,
): unknown {
  const seen = new WeakMap<object, string>();

  const visit = (current: unknown, path: string, depth: number): unknown => {
    if (current === null) return null;

    const kind = typeof current;

    if (kind === "string") {
      if ((current as string).length <= options.maxStringLength) return current;
      return {
        __type: "string",
        length: (current as string).length,
        preview: `${(current as string).slice(0, options.maxStringLength)}...`,
        truncated: true,
      };
    }
    if (kind === "number") {
      const n = current as number;
      if (Number.isFinite(n)) return n;
      return { __type: "number", value: String(n) };
    }
    if (kind === "boolean") return current;
    if (kind === "bigint") return { __type: "bigint", value: String(current) };
    if (kind === "undefined") return { __type: "undefined" };
    if (kind === "symbol") return { __type: "symbol", value: String(current) };
    if (kind === "function") {
      const fn = current as (...args: unknown[]) => unknown;
      return {
        __type: "function",
        name: fn.name || "(anonymous)",
        length: fn.length,
      };
    }

    const obj = current as object;

    if (obj instanceof Date) {
      return { __type: "date", value: obj.toISOString() };
    }
    if (obj instanceof RegExp) {
      return { __type: "regexp", value: String(obj) };
    }
    if (obj instanceof Error) {
      const err = obj as Error & { cause?: unknown };
      const out: Record<string, unknown> = {
        __type: "error",
        name: err.name,
        message: err.message,
      };
      if (err.stack) {
        out.stack =
          err.stack.length > options.maxStringLength
            ? `${err.stack.slice(0, options.maxStringLength)}...`
            : err.stack;
      }
      if (err.cause !== undefined) {
        out.cause = visit(err.cause, `${path}.cause`, depth + 1);
      }
      return out;
    }
    if (Buffer.isBuffer(obj)) {
      const previewLength = Math.min(obj.length, 64);
      return {
        __type: "buffer",
        length: obj.length,
        previewHex: obj.subarray(0, previewLength).toString("hex"),
        truncated: obj.length > previewLength,
      };
    }
    if (ArrayBuffer.isView(obj)) {
      const view = obj as ArrayBufferView;
      const previewLength = Math.min(view.byteLength, 64);
      const bytes = new Uint8Array(view.buffer, view.byteOffset, previewLength);
      return {
        __type: classNameFor(obj),
        byteLength: view.byteLength,
        previewHex: Buffer.from(bytes).toString("hex"),
        truncated: view.byteLength > previewLength,
      };
    }
    if (obj instanceof ArrayBuffer) {
      const previewLength = Math.min(obj.byteLength, 64);
      const bytes = new Uint8Array(obj, 0, previewLength);
      return {
        __type: "array-buffer",
        byteLength: obj.byteLength,
        previewHex: Buffer.from(bytes).toString("hex"),
        truncated: obj.byteLength > previewLength,
      };
    }

    const seenPath = seen.get(obj);
    if (seenPath) return { __type: "circular", ref: seenPath };
    if (depth >= options.maxDepth) {
      return {
        __type: "max-depth",
        className: classNameFor(obj),
        path,
      };
    }
    seen.set(obj, path);

    if (Array.isArray(obj)) {
      const arr = obj as unknown[];
      const limit = Math.min(arr.length, options.maxArrayLength);
      const items = new Array<unknown>(limit);
      for (let i = 0; i < limit; i++) {
        items[i] = visit(arr[i], `${path}[${i}]`, depth + 1);
      }
      const out: Record<string, unknown> = {
        __type: "array",
        length: arr.length,
        items,
      };
      if (arr.length > limit) out.truncatedItems = arr.length - limit;
      return out;
    }

    if (obj instanceof Map) {
      const entries: Array<{ key: unknown; value: unknown }> = [];
      let i = 0;
      for (const [entryKey, entryValue] of obj.entries()) {
        if (i >= options.maxObjectEntries) break;
        entries.push({
          key: visit(entryKey, `${path}.<key:${i}>`, depth + 1),
          value: visit(entryValue, `${path}.<value:${i}>`, depth + 1),
        });
        i += 1;
      }
      const out: Record<string, unknown> = {
        __type: "map",
        size: obj.size,
        entries,
      };
      if (obj.size > entries.length) {
        out.truncatedEntries = obj.size - entries.length;
      }
      return out;
    }

    if (obj instanceof Set) {
      const values: unknown[] = [];
      let i = 0;
      for (const entry of obj.values()) {
        if (i >= options.maxArrayLength) break;
        values.push(visit(entry, `${path}.<set:${i}>`, depth + 1));
        i += 1;
      }
      const out: Record<string, unknown> = {
        __type: "set",
        size: obj.size,
        values,
      };
      if (obj.size > values.length)
        out.truncatedEntries = obj.size - values.length;
      return out;
    }

    if (obj instanceof WeakMap) {
      return { __type: "weak-map" };
    }
    if (obj instanceof WeakSet) {
      return { __type: "weak-set" };
    }
    if (obj instanceof Promise) {
      return { __type: "promise" };
    }

    const ownNames = Object.getOwnPropertyNames(obj);
    const ownSymbols = Object.getOwnPropertySymbols(obj);
    const allKeys: Array<string | symbol> = [...ownNames, ...ownSymbols];
    const limit = Math.min(allKeys.length, options.maxObjectEntries);
    const properties: Record<string, unknown> = {};

    for (let i = 0; i < limit; i++) {
      const propertyKey = allKeys[i];
      const keyLabel =
        typeof propertyKey === "string"
          ? propertyKey
          : `[${String(propertyKey)}]`;
      const descriptor = Object.getOwnPropertyDescriptor(obj, propertyKey);
      if (!descriptor) continue;
      if ("value" in descriptor) {
        properties[keyLabel] = visit(
          descriptor.value,
          `${path}.${keyLabel}`,
          depth + 1,
        );
      } else {
        properties[keyLabel] = {
          __type: "accessor",
          hasGetter: typeof descriptor.get === "function",
          hasSetter: typeof descriptor.set === "function",
          enumerable: descriptor.enumerable,
        };
      }
    }

    if (allKeys.length > limit) {
      properties.__truncatedKeys = allKeys.length - limit;
    }

    const prototype = Object.getPrototypeOf(obj);
    const isPlainObject = prototype === Object.prototype || prototype === null;
    if (isPlainObject) return properties;

    return {
      __type: "object",
      className: classNameFor(obj),
      properties,
    };
  };

  return visit(value, "$", 0);
}

// ── Autonomy → User message routing ──────────────────────────────────

/**
 * Route non-conversation output to the user's active conversation.
 * Stores the message as a Memory in the conversation room and broadcasts
 * a `proactive-message` WS event to the frontend.
 *
 * @param source - Channel label shown in the UI (e.g. "autonomy", "telegram").
 */
async function routeAutonomyToUser(
  state: ServerState,
  responseMessages: import("@elizaos/core").Memory[],
  source = "autonomy",
): Promise<void> {
  const runtime = state.runtime;
  if (!runtime) return;

  // Collect response text from all response messages
  const texts: string[] = [];
  for (const mem of responseMessages) {
    const text = mem.content?.text?.trim();
    if (text) texts.push(text);
  }
  if (texts.length === 0) return;
  const responseText = texts.join("\n\n");

  // Find target conversation (active, or most recent)
  let conv: ConversationMeta | undefined;
  if (state.activeConversationId) {
    conv = state.conversations.get(state.activeConversationId);
  }
  if (!conv) {
    // Fall back to most recently updated conversation
    const sorted = Array.from(state.conversations.values()).sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
    conv = sorted[0];
  }
  if (!conv) return; // No conversations exist yet

  // Store as memory in the conversation's room
  const agentMessage = createMessageMemory({
    id: crypto.randomUUID() as UUID,
    entityId: runtime.agentId,
    roomId: conv.roomId,
    content: {
      text: responseText,
      source,
    },
  });
  await runtime.createMemory(agentMessage, "messages");
  conv.updatedAt = new Date().toISOString();

  // Broadcast to all WS clients
  state.broadcastWs?.({
    type: "proactive-message",
    conversationId: conv.id,
    message: {
      id: agentMessage.id ?? `auto-${Date.now()}`,
      role: "assistant",
      text: responseText,
      timestamp: Date.now(),
      source,
    },
  });
}

/**
 * Monkey-patch `runtime.messageService.handleMessage` to intercept
 * autonomy output and route it to the user's active conversation.
 * Follows the same pattern as phetta-companion-plugin.ts:222-280.
 */
function patchMessageServiceForAutonomy(state: ServerState): void {
  const runtime = state.runtime;
  if (!runtime?.messageService) return;

  const svc = runtime.messageService as unknown as {
    handleMessage: (
      rt: import("@elizaos/core").IAgentRuntime,
      message: import("@elizaos/core").Memory,
      callback?: (
        content: Content,
      ) => Promise<import("@elizaos/core").Memory[]>,
      options?: import("@elizaos/core").MessageProcessingOptions,
    ) => Promise<import("@elizaos/core").MessageProcessingResult>;
    __milaidyAutonomyPatched?: boolean;
  };

  if (svc.__milaidyAutonomyPatched) return;
  svc.__milaidyAutonomyPatched = true;

  const orig = svc.handleMessage.bind(svc);

  svc.handleMessage = async (
    rt: import("@elizaos/core").IAgentRuntime,
    message: import("@elizaos/core").Memory,
    callback?: (content: Content) => Promise<import("@elizaos/core").Memory[]>,
    options?: import("@elizaos/core").MessageProcessingOptions,
  ): Promise<import("@elizaos/core").MessageProcessingResult> => {
    const result = await orig(rt, message, callback, options);

    // Detect non-conversation messages (autonomy, background tasks, etc.)
    const isFromConversation = Array.from(state.conversations.values()).some(
      (c) => c.roomId === message.roomId,
    );

    if (!isFromConversation && result?.responseMessages?.length > 0) {
      // Forward to user's active conversation (fire-and-forget)
      const rawSource = message.content?.source;
      const source = typeof rawSource === "string" ? rawSource : "autonomy";
      void routeAutonomyToUser(state, result.responseMessages, source).catch(
        (err) => {
          logger.warn(
            `[autonomy-route] Failed to route proactive output: ${err instanceof Error ? err.message : String(err)}`,
          );
        },
      );
    }

    return result;
  };
}

async function handleRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  state: ServerState,
  ctx?: RequestContext,
): Promise<void> {
  const method = req.method ?? "GET";
  let url: URL;
  try {
    url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  } catch {
    error(res, "Invalid request URL", 400);
    return;
  }
  const pathname = url.pathname;
  const isAuthEndpoint = pathname.startsWith("/api/auth/");
  const registryService = state.registryService;
  const dropService = state.dropService;

  const scheduleRuntimeRestart = (reason: string, delayMs = 300): void => {
    const restart = () => {
      if (ctx?.onRestart) {
        logger.info(`[milaidy-api] Triggering runtime restart (${reason})...`);
        Promise.resolve(ctx.onRestart())
          .then((newRuntime) => {
            if (!newRuntime) {
              logger.warn("[milaidy-api] Runtime restart returned null");
              return;
            }
            state.runtime = newRuntime;
            state.chatConnectionReady = null;
            state.chatConnectionPromise = null;
            state.agentState = "running";
            state.agentName = newRuntime.character.name ?? "Milaidy";
            state.startedAt = Date.now();
            logger.info("[milaidy-api] Runtime restarted successfully");
            // Notify WebSocket clients so the UI can refresh
            state.broadcastWs?.({
              type: "status",
              state: state.agentState,
              agentName: state.agentName,
              startedAt: state.startedAt,
              restarted: true,
            });
          })
          .catch((err) => {
            logger.error(
              `[milaidy-api] Runtime restart failed: ${err instanceof Error ? err.message : err}`,
            );
          });
        return;
      }

      logger.info(
        `[milaidy-api] No in-process restart handler; exiting for external restart (${reason})`,
      );
      if (process.env.VITEST || process.env.NODE_ENV === "test") {
        logger.info(
          "[milaidy-api] Skipping process.exit during test execution",
        );
        return;
      }
      process.exit(API_RESTART_EXIT_CODE);
    };

    if (delayMs <= 0) {
      restart();
      return;
    }
    setTimeout(restart, delayMs);
  };

  const resolveHyperscapeApiBaseUrl = async (): Promise<string> => {
    const fromEnv = process.env.HYPERSCAPE_API_URL?.trim();
    if (fromEnv) {
      return fromEnv.replace(/\/+$/, "");
    }
    // Default to the local Hyperscape API server. Viewer URLs can point at a
    // client dev server (for example :3333) which does not expose API routes.
    return "http://localhost:5555";
  };

  const resolveHyperscapeAuthorizationHeader = (): string | null => {
    const requestAuth =
      typeof req.headers.authorization === "string"
        ? req.headers.authorization.trim()
        : "";
    if (requestAuth) {
      return requestAuth;
    }

    const envToken = process.env.HYPERSCAPE_AUTH_TOKEN?.trim();
    if (!envToken) {
      return null;
    }
    return /^Bearer\s+/i.test(envToken) ? envToken : `Bearer ${envToken}`;
  };

  const relayHyperscapeApi = async (
    outboundMethod: "GET" | "POST",
    outboundPath: string,
    options?: {
      rawBodyOverride?: string;
      contentTypeOverride?: string | null;
    },
  ): Promise<void> => {
    const baseUrl = await resolveHyperscapeApiBaseUrl();

    let upstreamUrl: URL;
    try {
      upstreamUrl = new URL(outboundPath, baseUrl);
      upstreamUrl.search = url.search;
    } catch {
      error(res, `Invalid Hyperscape API URL: ${baseUrl}`, 500);
      return;
    }

    let rawBody: string | undefined;
    if (options?.rawBodyOverride !== undefined) {
      rawBody = options.rawBodyOverride;
    } else if (outboundMethod === "POST") {
      try {
        rawBody = await readBody(req);
        if (rawBody.trim().length === 0) {
          rawBody = undefined;
        }
      } catch (err) {
        error(
          res,
          `Failed to read request body: ${err instanceof Error ? err.message : String(err)}`,
          400,
        );
        return;
      }
    }

    const outboundHeaders: Record<string, string> = {};
    const contentType =
      options?.contentTypeOverride !== undefined
        ? options.contentTypeOverride
        : typeof req.headers["content-type"] === "string"
          ? req.headers["content-type"]
          : null;
    if (contentType && rawBody !== undefined) {
      outboundHeaders["Content-Type"] = contentType;
    }
    const authorization = resolveHyperscapeAuthorizationHeader();
    if (authorization) {
      outboundHeaders.Authorization = authorization;
    }

    let upstreamResponse: Response;
    try {
      upstreamResponse = await fetch(upstreamUrl.toString(), {
        method: outboundMethod,
        headers: outboundHeaders,
        body: rawBody !== undefined ? rawBody : undefined,
      });
    } catch (err) {
      error(
        res,
        `Failed to reach Hyperscape API: ${err instanceof Error ? err.message : String(err)}`,
        502,
      );
      return;
    }

    const responseText = await upstreamResponse.text();
    const responseType = upstreamResponse.headers.get("content-type");
    if (responseType) {
      res.setHeader("Content-Type", responseType);
    }
    res.statusCode = upstreamResponse.status;
    res.end(responseText);
  };

  if (!applyCors(req, res)) {
    json(res, { error: "Origin not allowed" }, 403);
    return;
  }

  if (method !== "OPTIONS" && !isAuthEndpoint && !isAuthorized(req)) {
    json(res, { error: "Unauthorized" }, 401);
    return;
  }

  // CORS preflight
  if (method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
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

  // ── GET /api/subscription/status ──────────────────────────────────────
  // Returns the status of subscription-based auth providers
  if (method === "GET" && pathname === "/api/subscription/status") {
    try {
      const { getSubscriptionStatus } = await import("../auth/index.js");
      json(res, { providers: getSubscriptionStatus() });
    } catch (err) {
      error(res, `Failed to get subscription status: ${err}`, 500);
    }
    return;
  }

  // ── POST /api/subscription/anthropic/start ──────────────────────────────
  // Start Anthropic OAuth flow — returns URL for user to visit
  if (method === "POST" && pathname === "/api/subscription/anthropic/start") {
    try {
      const { startAnthropicLogin } = await import("../auth/index.js");
      const flow = await startAnthropicLogin();
      // Store flow in server state for the exchange step
      state._anthropicFlow = flow;
      json(res, { authUrl: flow.authUrl });
    } catch (err) {
      error(res, `Failed to start Anthropic login: ${err}`, 500);
    }
    return;
  }

  // ── POST /api/subscription/anthropic/exchange ───────────────────────────
  // Exchange Anthropic auth code for tokens
  if (
    method === "POST" &&
    pathname === "/api/subscription/anthropic/exchange"
  ) {
    const body = await readJsonBody<{ code: string }>(req, res);
    if (!body) return;
    if (!body.code) {
      error(res, "Missing code", 400);
      return;
    }
    try {
      const { saveCredentials, applySubscriptionCredentials } = await import(
        "../auth/index.js"
      );
      const flow = state._anthropicFlow;
      if (!flow) {
        error(res, "No active flow — call /start first", 400);
        return;
      }
      // Submit the code and wait for credentials
      flow.submitCode(body.code);
      const credentials = await flow.credentials;
      saveCredentials("anthropic-subscription", credentials);
      await applySubscriptionCredentials();
      delete state._anthropicFlow;
      json(res, { success: true, expiresAt: credentials.expires });
    } catch (err) {
      error(res, `Anthropic exchange failed: ${err}`, 500);
    }
    return;
  }

  // ── POST /api/subscription/anthropic/setup-token ────────────────────────
  // Accept an Anthropic setup-token (sk-ant-oat01-...) directly
  if (
    method === "POST" &&
    pathname === "/api/subscription/anthropic/setup-token"
  ) {
    const body = await readJsonBody<{ token: string }>(req, res);
    if (!body) return;
    if (!body.token || !body.token.startsWith("sk-ant-")) {
      error(res, "Invalid token format — expected sk-ant-oat01-...", 400);
      return;
    }
    try {
      // Setup tokens are direct API keys — set in env immediately
      process.env.ANTHROPIC_API_KEY = body.token.trim();
      // Also save to config so it persists across restarts
      if (!state.config.env) state.config.env = {};
      (state.config.env as Record<string, string>).ANTHROPIC_API_KEY =
        body.token.trim();
      saveMilaidyConfig(state.config);
      json(res, { success: true });
    } catch (err) {
      error(res, `Failed to save setup token: ${err}`, 500);
    }
    return;
  }

  // ── POST /api/subscription/openai/start ─────────────────────────────────
  // Start OpenAI Codex OAuth flow — returns URL and starts callback server
  if (method === "POST" && pathname === "/api/subscription/openai/start") {
    try {
      const { startCodexLogin } = await import("../auth/index.js");
      // Clean up any stale flow from a previous attempt
      if (state._codexFlow) {
        try {
          state._codexFlow.close();
        } catch (err) {
          logger.debug(
            `[api] OAuth flow cleanup failed: ${err instanceof Error ? err.message : err}`,
          );
        }
      }
      clearTimeout(state._codexFlowTimer);

      const flow = await startCodexLogin();
      // Store flow state + auto-cleanup after 10 minutes
      state._codexFlow = flow;
      state._codexFlowTimer = setTimeout(
        () => {
          try {
            flow.close();
          } catch (err) {
            logger.debug(
              `[api] OAuth flow cleanup failed: ${err instanceof Error ? err.message : err}`,
            );
          }
          delete state._codexFlow;
          delete state._codexFlowTimer;
        },
        10 * 60 * 1000,
      );
      json(res, {
        authUrl: flow.authUrl,
        state: flow.state,
        instructions:
          "Open the URL in your browser. After login, if auto-redirect doesn't work, paste the full redirect URL.",
      });
    } catch (err) {
      error(res, `Failed to start OpenAI login: ${err}`, 500);
    }
    return;
  }

  // ── POST /api/subscription/openai/exchange ──────────────────────────────
  // Exchange OpenAI auth code or wait for callback
  if (method === "POST" && pathname === "/api/subscription/openai/exchange") {
    const body = await readJsonBody<{
      code?: string;
      waitForCallback?: boolean;
    }>(req, res);
    if (!body) return;
    let flow: import("../auth/index.js").CodexFlow | undefined;
    try {
      const { saveCredentials, applySubscriptionCredentials } = await import(
        "../auth/index.js"
      );
      flow = state._codexFlow;

      if (!flow) {
        error(res, "No active flow — call /start first", 400);
        return;
      }

      if (body.code) {
        // Manual code/URL paste — submit to flow
        flow.submitCode(body.code);
      } else if (!body.waitForCallback) {
        error(res, "Provide either code or set waitForCallback: true", 400);
        return;
      }

      // Wait for credentials (either from callback server or manual submission)
      let credentials: import("../auth/index.js").OAuthCredentials;
      try {
        credentials = await flow.credentials;
      } catch (err) {
        try {
          flow.close();
        } catch (closeErr) {
          logger.debug(
            `[api] OAuth flow cleanup failed: ${closeErr instanceof Error ? closeErr.message : closeErr}`,
          );
        }
        delete state._codexFlow;
        clearTimeout(state._codexFlowTimer);
        delete state._codexFlowTimer;
        error(res, `OpenAI exchange failed: ${err}`, 500);
        return;
      }
      saveCredentials("openai-codex", credentials);
      await applySubscriptionCredentials();
      flow.close();
      delete state._codexFlow;
      clearTimeout(state._codexFlowTimer);
      delete state._codexFlowTimer;
      json(res, {
        success: true,
        expiresAt: credentials.expires,
        accountId: credentials.accountId,
      });
    } catch (err) {
      error(res, `OpenAI exchange failed: ${err}`, 500);
    }
    return;
  }

  // ── DELETE /api/subscription/:provider ───────────────────────────────────
  // Remove subscription credentials
  if (method === "DELETE" && pathname.startsWith("/api/subscription/")) {
    const provider = pathname.split("/").pop();
    if (provider === "anthropic-subscription" || provider === "openai-codex") {
      try {
        const { deleteCredentials } = await import("../auth/index.js");
        deleteCredentials(provider);
        json(res, { success: true });
      } catch (err) {
        error(res, `Failed to delete credentials: ${err}`, 500);
      }
    } else {
      error(res, `Unknown provider: ${provider}`, 400);
    }
    return;
  }

  // ── GET /api/status ─────────────────────────────────────────────────────
  if (method === "GET" && pathname === "/api/status") {
    const uptime = state.startedAt ? Date.now() - state.startedAt : undefined;

    // Cloud mode: report cloud connection status alongside local state
    const cloudProxy = state.cloudManager?.getProxy();
    const runMode = cloudProxy ? "cloud" : "local";
    const cloudStatus = state.cloudManager
      ? {
          connectionStatus: state.cloudManager.getStatus(),
          activeAgentId: state.cloudManager.getActiveAgentId(),
        }
      : undefined;

    json(res, {
      state: cloudProxy ? "running" : state.agentState,
      agentName: cloudProxy ? cloudProxy.agentName : state.agentName,
      model: cloudProxy ? "cloud" : state.model,
      uptime,
      startedAt: state.startedAt,
      runMode,
      cloud: cloudStatus,
    });
    return;
  }

  // ── GET /api/runtime ───────────────────────────────────────────────────
  // Deep runtime introspection endpoint for advanced debugging UI.
  if (method === "GET" && pathname === "/api/runtime") {
    const maxDepth = parseDebugPositiveInt(
      url.searchParams.get("depth"),
      RUNTIME_DEBUG_DEFAULT_MAX_DEPTH,
      1,
      RUNTIME_DEBUG_MAX_DEPTH_CAP,
    );
    const maxArrayLength = parseDebugPositiveInt(
      url.searchParams.get("maxArrayLength"),
      RUNTIME_DEBUG_DEFAULT_MAX_ARRAY_LENGTH,
      1,
      5000,
    );
    const maxObjectEntries = parseDebugPositiveInt(
      url.searchParams.get("maxObjectEntries"),
      RUNTIME_DEBUG_DEFAULT_MAX_OBJECT_ENTRIES,
      1,
      5000,
    );
    const maxStringLength = parseDebugPositiveInt(
      url.searchParams.get("maxStringLength"),
      RUNTIME_DEBUG_DEFAULT_MAX_STRING_LENGTH,
      64,
      100_000,
    );

    const serializeOptions: RuntimeDebugSerializeOptions = {
      maxDepth,
      maxArrayLength,
      maxObjectEntries,
      maxStringLength,
    };

    const runtime = state.runtime;
    const generatedAt = Date.now();

    if (!runtime) {
      json(res, {
        runtimeAvailable: false,
        generatedAt,
        settings: serializeOptions,
        meta: {
          agentState: state.agentState,
          agentName: state.agentName,
          model: state.model ?? null,
          pluginCount: 0,
          actionCount: 0,
          providerCount: 0,
          evaluatorCount: 0,
          serviceTypeCount: 0,
          serviceCount: 0,
        },
        order: {
          plugins: [],
          actions: [],
          providers: [],
          evaluators: [],
          services: [],
        },
        sections: {
          runtime: null,
          plugins: [],
          actions: [],
          providers: [],
          evaluators: [],
          services: {},
        },
      });
      return;
    }

    try {
      const servicesMap = runtime.services as unknown as Map<string, unknown[]>;
      const serviceCount = Array.from(servicesMap.values()).reduce(
        (sum, entries) => sum + (Array.isArray(entries) ? entries.length : 0),
        0,
      );
      const orderServices = describeRuntimeServiceOrder(servicesMap);
      const orderPlugins = describeRuntimeOrder(runtime.plugins, "plugin");
      const orderActions = describeRuntimeOrder(runtime.actions, "action");
      const orderProviders = describeRuntimeOrder(
        runtime.providers,
        "provider",
      );
      const orderEvaluators = describeRuntimeOrder(
        runtime.evaluators,
        "evaluator",
      );

      json(res, {
        runtimeAvailable: true,
        generatedAt,
        settings: serializeOptions,
        meta: {
          agentId: runtime.agentId,
          agentState: state.agentState,
          agentName: runtime.character.name ?? state.agentName,
          model: state.model ?? null,
          pluginCount: runtime.plugins.length,
          actionCount: runtime.actions.length,
          providerCount: runtime.providers.length,
          evaluatorCount: runtime.evaluators.length,
          serviceTypeCount: servicesMap.size,
          serviceCount,
        },
        order: {
          plugins: orderPlugins,
          actions: orderActions,
          providers: orderProviders,
          evaluators: orderEvaluators,
          services: orderServices,
        },
        sections: {
          runtime: serializeForRuntimeDebug(runtime, serializeOptions),
          plugins: serializeForRuntimeDebug(runtime.plugins, serializeOptions),
          actions: serializeForRuntimeDebug(runtime.actions, serializeOptions),
          providers: serializeForRuntimeDebug(
            runtime.providers,
            serializeOptions,
          ),
          evaluators: serializeForRuntimeDebug(
            runtime.evaluators,
            serializeOptions,
          ),
          services: serializeForRuntimeDebug(servicesMap, serializeOptions),
        },
      });
    } catch (err) {
      error(
        res,
        `Failed to build runtime debug snapshot: ${err instanceof Error ? err.message : String(err)}`,
        500,
      );
    }
    return;
  }

  // ── GET /api/onboarding/status ──────────────────────────────────────────
  if (method === "GET" && pathname === "/api/onboarding/status") {
    const complete = configFileExists() && Boolean(state.config.agents);
    json(res, { complete });
    return;
  }

  // ── GET /api/onboarding/options ─────────────────────────────────────────
  if (method === "GET" && pathname === "/api/onboarding/options") {
    const piCreds = await createPiCredentialProvider();
    const piDefaultModel = (await piCreds.getDefaultModelSpec()) ?? undefined;

    json(res, {
      names: pickRandomNames(5),
      styles: STYLE_PRESETS,
      providers: getProviderOptions(),
      cloudProviders: getCloudProviderOptions(),
      models: getModelOptions(),
      piModels: getPiModelOptions(),
      piDefaultModel,
      inventoryProviders: getInventoryProviderOptions(),
      sharedStyleRules: "Keep responses brief. Be helpful and concise.",
    });
    return;
  }

  // ── POST /api/onboarding ────────────────────────────────────────────────
  if (method === "POST" && pathname === "/api/onboarding") {
    const body = await readJsonBody(req, res);
    if (!body) return;

    // ── Validate required fields ──────────────────────────────────────────
    if (!body.name || typeof body.name !== "string" || !body.name.trim()) {
      error(res, "Missing or invalid agent name", 400);
      return;
    }
    // Theme is UI-only (milady, haxor, qt314, etc.) — no server validation needed
    if (body.runMode && body.runMode !== "local" && body.runMode !== "cloud") {
      error(res, "Invalid runMode: must be 'local' or 'cloud'", 400);
      return;
    }

    const config = state.config;

    if (!config.agents) config.agents = {};
    if (!config.agents.defaults) config.agents.defaults = {};
    config.agents.defaults.workspace = resolveDefaultAgentWorkspaceDir();
    const onboardingAdminEntityId = stringToUuid(
      `${(body.name as string).trim()}-admin-entity`,
    ) as UUID;
    config.agents.defaults.adminEntityId = onboardingAdminEntityId;
    state.adminEntityId = onboardingAdminEntityId;
    state.chatUserId = onboardingAdminEntityId;
    state.chatConnectionReady = null;
    state.chatConnectionPromise = null;

    if (!config.agents.list) config.agents.list = [];
    if (config.agents.list.length === 0) {
      config.agents.list.push({ id: "main", default: true });
    }
    const agent = config.agents.list[0];
    agent.name = (body.name as string).trim();
    agent.workspace = resolveDefaultAgentWorkspaceDir();
    if (body.bio) agent.bio = body.bio as string[];
    if (body.systemPrompt) agent.system = body.systemPrompt as string;
    if (body.style)
      agent.style = body.style as {
        all?: string[];
        chat?: string[];
        post?: string[];
      };
    if (body.adjectives) agent.adjectives = body.adjectives as string[];
    if (body.topics) agent.topics = body.topics as string[];
    if (body.postExamples) agent.postExamples = body.postExamples as string[];
    if (body.messageExamples)
      agent.messageExamples = body.messageExamples as Array<
        Array<{ user: string; content: { text: string } }>
      >;

    // ── Theme preference ──────────────────────────────────────────────────
    if (body.theme) {
      if (!config.ui) config.ui = {};
      config.ui.theme = body.theme as
        | "milady"
        | "qt314"
        | "web2000"
        | "programmer"
        | "haxor"
        | "psycho";
    }

    // ── Run mode & cloud configuration ────────────────────────────────────
    const runMode = (body.runMode as string) || "local";
    if (!config.cloud) config.cloud = {};
    config.cloud.enabled = runMode === "cloud";

    // ── Sandbox mode (from 3-mode onboarding: off / light / standard / max)
    const sandboxMode = (body.sandboxMode as string) || "off";
    if (sandboxMode !== "off") {
      if (!config.agents) config.agents = {};
      if (!config.agents.defaults) config.agents.defaults = {};
      if (!(config.agents.defaults as Record<string, unknown>).sandbox) {
        (config.agents.defaults as Record<string, unknown>).sandbox = {};
      }
      (
        (config.agents.defaults as Record<string, unknown>).sandbox as Record<
          string,
          unknown
        >
      ).mode = sandboxMode;
      logger.info(`[milaidy-api] Sandbox mode set to: ${sandboxMode}`);
    }

    if (runMode === "cloud") {
      if (body.cloudProvider) {
        config.cloud.provider = body.cloudProvider as string;
      }
      // Always ensure model defaults when cloud is selected so the cloud
      // plugin has valid models to call even if the user didn't pick any.
      if (!config.models) config.models = {};
      config.models.small =
        (body.smallModel as string) ||
        config.models.small ||
        "openai/gpt-5-mini";
      config.models.large =
        (body.largeModel as string) ||
        config.models.large ||
        "anthropic/claude-sonnet-4.5";
    }

    // ── Local LLM provider ────────────────────────────────────────────────
    // Also supports pi-ai (reads credentials from ~/.pi/agent/auth.json).
    {
      // Ensure we don't keep stale pi-ai mode when the user switches providers.
      if (!config.env) config.env = {};
      const envCfg = config.env as Record<string, unknown>;
      const vars = (envCfg.vars ?? {}) as Record<string, string>;

      const providerId = typeof body.provider === "string" ? body.provider : "";
      const wantsPiAi = runMode === "local" && providerId === "pi-ai";

      if (wantsPiAi) {
        vars.MILAIDY_USE_PI_AI = "1";
        process.env.MILAIDY_USE_PI_AI = "1";

        // Optional: persist chosen primary model spec for pi-ai.
        // When omitted, the backend falls back to pi's default model from settings.json.
        if (!config.agents) config.agents = {};
        if (!config.agents.defaults) config.agents.defaults = {};
        if (!config.agents.defaults.model) config.agents.defaults.model = {};

        const primaryModel =
          typeof body.primaryModel === "string" ? body.primaryModel.trim() : "";
        if (primaryModel) {
          config.agents.defaults.model.primary = primaryModel;
        } else {
          delete config.agents.defaults.model.primary;
          if (
            !config.agents.defaults.model.fallbacks ||
            config.agents.defaults.model.fallbacks.length === 0
          ) {
            delete config.agents.defaults.model;
          }
        }
      } else {
        delete vars.MILAIDY_USE_PI_AI;
        delete process.env.MILAIDY_USE_PI_AI;
      }

      // Persist vars back onto config.env
      (envCfg as Record<string, unknown>).vars = vars;

      // API-key providers (envKey backed)
      if (runMode === "local" && providerId && body.providerApiKey) {
        const providerOpt = getProviderOptions().find(
          (p) => p.id === providerId,
        );
        if (providerOpt?.envKey) {
          (config.env as Record<string, string>)[providerOpt.envKey] =
            body.providerApiKey as string;
          process.env[providerOpt.envKey] = body.providerApiKey as string;
        }
      }
    }

    // ── Subscription providers (no API key needed — uses OAuth) ──────────
    // If the user selected a subscription provider during onboarding,
    // note it in config. The actual OAuth flow happens via
    // /api/subscription/{provider}/start + /exchange endpoints.
    if (
      runMode === "local" &&
      (body.provider === "anthropic-subscription" ||
        body.provider === "openai-subscription")
    ) {
      if (!config.agents) config.agents = {};
      if (!config.agents.defaults) config.agents.defaults = {};
      (config.agents.defaults as Record<string, unknown>).subscriptionProvider =
        body.provider;
      logger.info(
        `[milaidy-api] Subscription provider selected: ${body.provider} — complete OAuth via /api/subscription/ endpoints`,
      );
    }

    // ── Connectors (Telegram, Discord, WhatsApp, Twilio, Blooio) ────────
    if (!config.connectors) config.connectors = {};
    if (
      body.telegramToken &&
      typeof body.telegramToken === "string" &&
      body.telegramToken.trim()
    ) {
      config.connectors.telegram = { botToken: body.telegramToken.trim() };
    }
    if (
      body.discordToken &&
      typeof body.discordToken === "string" &&
      body.discordToken.trim()
    ) {
      config.connectors.discord = { botToken: body.discordToken.trim() };
    }
    if (
      body.whatsappSessionPath &&
      typeof body.whatsappSessionPath === "string" &&
      body.whatsappSessionPath.trim()
    ) {
      config.connectors.whatsapp = {
        sessionPath: body.whatsappSessionPath.trim(),
      };
    }
    if (
      body.twilioAccountSid &&
      typeof body.twilioAccountSid === "string" &&
      body.twilioAccountSid.trim() &&
      body.twilioAuthToken &&
      typeof body.twilioAuthToken === "string" &&
      body.twilioAuthToken.trim()
    ) {
      if (!config.env) config.env = {};
      (config.env as Record<string, string>).TWILIO_ACCOUNT_SID = (
        body.twilioAccountSid as string
      ).trim();
      (config.env as Record<string, string>).TWILIO_AUTH_TOKEN = (
        body.twilioAuthToken as string
      ).trim();
      process.env.TWILIO_ACCOUNT_SID = (body.twilioAccountSid as string).trim();
      process.env.TWILIO_AUTH_TOKEN = (body.twilioAuthToken as string).trim();
      if (
        body.twilioPhoneNumber &&
        typeof body.twilioPhoneNumber === "string" &&
        body.twilioPhoneNumber.trim()
      ) {
        (config.env as Record<string, string>).TWILIO_PHONE_NUMBER = (
          body.twilioPhoneNumber as string
        ).trim();
        process.env.TWILIO_PHONE_NUMBER = (
          body.twilioPhoneNumber as string
        ).trim();
      }
    }
    if (
      body.blooioApiKey &&
      typeof body.blooioApiKey === "string" &&
      body.blooioApiKey.trim()
    ) {
      if (!config.env) config.env = {};
      (config.env as Record<string, string>).BLOOIO_API_KEY = (
        body.blooioApiKey as string
      ).trim();
      process.env.BLOOIO_API_KEY = (body.blooioApiKey as string).trim();
      if (
        body.blooioPhoneNumber &&
        typeof body.blooioPhoneNumber === "string" &&
        body.blooioPhoneNumber.trim()
      ) {
        (config.env as Record<string, string>).BLOOIO_PHONE_NUMBER = (
          body.blooioPhoneNumber as string
        ).trim();
        process.env.BLOOIO_PHONE_NUMBER = (
          body.blooioPhoneNumber as string
        ).trim();
      }
    }

    // ── Inventory / RPC providers ─────────────────────────────────────────
    if (Array.isArray(body.inventoryProviders)) {
      if (!config.env) config.env = {};
      const allInventory = getInventoryProviderOptions();
      for (const inv of body.inventoryProviders as Array<{
        chain: string;
        rpcProvider: string;
        rpcApiKey?: string;
      }>) {
        const chainDef = allInventory.find((ip) => ip.id === inv.chain);
        if (!chainDef) continue;
        const rpcDef = chainDef.rpcProviders.find(
          (rp) => rp.id === inv.rpcProvider,
        );
        if (rpcDef?.envKey && inv.rpcApiKey) {
          (config.env as Record<string, string>)[rpcDef.envKey] = inv.rpcApiKey;
          process.env[rpcDef.envKey] = inv.rpcApiKey;
        }
      }
    }

    // ── Generate wallet keys if not already present ───────────────────────
    if (!process.env.EVM_PRIVATE_KEY || !process.env.SOLANA_PRIVATE_KEY) {
      try {
        const walletKeys = generateWalletKeys();

        if (!process.env.EVM_PRIVATE_KEY) {
          if (!config.env) config.env = {};
          (config.env as Record<string, string>).EVM_PRIVATE_KEY =
            walletKeys.evmPrivateKey;
          process.env.EVM_PRIVATE_KEY = walletKeys.evmPrivateKey;
          logger.info(
            `[milaidy-api] Generated EVM wallet: ${walletKeys.evmAddress}`,
          );
        }

        if (!process.env.SOLANA_PRIVATE_KEY) {
          if (!config.env) config.env = {};
          (config.env as Record<string, string>).SOLANA_PRIVATE_KEY =
            walletKeys.solanaPrivateKey;
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
    try {
      saveMilaidyConfig(config);
    } catch (err) {
      logger.error(
        `[milaidy-api] Failed to save config after onboarding: ${err}`,
      );
      error(res, "Failed to save configuration", 500);
      return;
    }
    logger.info(
      `[milaidy-api] Onboarding complete for agent "${body.name}" (mode: ${(body.runMode as string) || "local"})`,
    );
    json(res, { ok: true });
    return;
  }

  // ── POST /api/agent/start ───────────────────────────────────────────────
  if (method === "POST" && pathname === "/api/agent/start") {
    state.agentState = "running";
    state.startedAt = Date.now();
    const detectedModel = state.runtime
      ? (state.runtime.plugins.find(
          (p) =>
            p.name.includes("anthropic") ||
            p.name.includes("openai") ||
            p.name.includes("groq"),
        )?.name ?? "unknown")
      : "unknown";
    state.model = detectedModel;

    // Enable the autonomy task — the core TaskService will pick it up
    // and fire the first tick immediately (updatedAt starts at 0).
    const svc = getAutonomySvc(state.runtime);
    if (svc) await svc.enableAutonomy();

    // Patch messageService for autonomy routing (may be first time if runtime
    // was provided before the API server's patch ran, or after a restart).
    patchMessageServiceForAutonomy(state);

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

  const triggerHandled = await handleTriggerRoutes({
    req,
    res,
    method,
    pathname,
    runtime: state.runtime,
    readJsonBody,
    json,
    error,
  });
  if (triggerHandled) {
    return;
  }

  if (pathname.startsWith("/api/training")) {
    if (!state.trainingService) {
      error(res, "Training service is not available", 503);
      return;
    }
    const trainingHandled = await handleTrainingRoutes({
      req,
      res,
      method,
      pathname,
      runtime: state.runtime,
      trainingService: state.trainingService,
      readJsonBody,
      json,
      error,
    });
    if (trainingHandled) return;
  }

  // ── Knowledge routes (/api/knowledge/*) ─────────────────────────────────
  if (pathname.startsWith("/api/knowledge")) {
    const knowledgeHandled = await handleKnowledgeRoutes({
      req,
      res,
      method,
      pathname,
      url,
      runtime: state.runtime,
      readJsonBody,
      json,
      error,
    });
    if (knowledgeHandled) return;
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
        state.chatConnectionReady = null;
        state.chatConnectionPromise = null;
        state.agentState = "running";
        state.agentName = newRuntime.character.name ?? "Milaidy";
        state.startedAt = Date.now();
        patchMessageServiceForAutonomy(state);
        json(res, {
          ok: true,
          status: {
            state: state.agentState,
            agentName: state.agentName,
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

      // 2. Delete the state directory (~/.milaidy/) which contains
      //    config, workspace, memory, oauth tokens, etc.
      const stateDir = resolveStateDir();

      // Safety: validate the resolved path before recursive deletion.
      // MILAIDY_STATE_DIR can be overridden via env/config — if set to
      // "/" or another sensitive path, rmSync would wipe the filesystem.
      const resolvedState = path.resolve(stateDir);
      const home = os.homedir();
      const isSafe = isSafeResetStateDir(resolvedState, home);
      if (!isSafe) {
        logger.warn(
          `[milaidy-api] Refusing to delete unsafe state dir: "${resolvedState}"`,
        );
        error(
          res,
          `Reset aborted: state directory "${resolvedState}" does not appear safe to delete`,
          400,
        );
        return;
      }

      if (fs.existsSync(resolvedState)) {
        fs.rmSync(resolvedState, { recursive: true, force: true });
      }

      // 3. Reset server state
      state.agentState = "stopped";
      state.agentName = "Milaidy";
      state.model = undefined;
      state.startedAt = undefined;
      state.config = {} as MilaidyConfig;
      state.chatRoomId = null;
      state.chatUserId = null;
      state.chatConnectionReady = null;
      state.chatConnectionPromise = null;

      json(res, { ok: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      error(res, `Reset failed: ${msg}`, 500);
    }
    return;
  }

  // ── POST /api/agent/export ─────────────────────────────────────────────
  // Export the entire agent as a password-encrypted binary file.
  if (method === "POST" && pathname === "/api/agent/export") {
    if (!state.runtime) {
      error(res, "Agent is not running — start it before exporting.", 503);
      return;
    }

    const body = await readJsonBody<{
      password?: string;
      includeLogs?: boolean;
    }>(req, res);
    if (!body) return;

    if (!body.password || typeof body.password !== "string") {
      error(
        res,
        `A password of at least ${AGENT_TRANSFER_MIN_PASSWORD_LENGTH} characters is required.`,
        400,
      );
      return;
    }

    if (body.password.length < AGENT_TRANSFER_MIN_PASSWORD_LENGTH) {
      error(
        res,
        `A password of at least ${AGENT_TRANSFER_MIN_PASSWORD_LENGTH} characters is required.`,
        400,
      );
      return;
    }

    try {
      const fileBuffer = await exportAgent(state.runtime, body.password, {
        includeLogs: body.includeLogs === true,
      });

      const agentName = (state.runtime.character.name ?? "agent")
        .replace(/[^a-zA-Z0-9_-]/g, "_")
        .toLowerCase();
      const timestamp = new Date()
        .toISOString()
        .replace(/[:.]/g, "-")
        .slice(0, 19);
      const filename = `${agentName}-${timestamp}.eliza-agent`;

      res.statusCode = 200;
      res.setHeader("Content-Type", "application/octet-stream");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${filename}"`,
      );
      res.setHeader("Content-Length", fileBuffer.length);
      res.end(fileBuffer);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (err instanceof AgentExportError) {
        error(res, msg, 400);
      } else {
        error(res, `Export failed: ${msg}`, 500);
      }
    }
    return;
  }

  // ── GET /api/agent/export/estimate ─────────────────────────────────────────
  // Get an estimate of the export size before downloading.
  if (method === "GET" && pathname === "/api/agent/export/estimate") {
    if (!state.runtime) {
      error(res, "Agent is not running.", 503);
      return;
    }

    try {
      const estimate = await estimateExportSize(state.runtime);
      json(res, estimate);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      error(res, `Estimate failed: ${msg}`, 500);
    }
    return;
  }

  // ── POST /api/agent/import ─────────────────────────────────────────────
  // Import an agent from a password-encrypted .eliza-agent file.
  if (method === "POST" && pathname === "/api/agent/import") {
    if (!state.runtime) {
      error(res, "Agent is not running — start it before importing.", 503);
      return;
    }

    let rawBody: Buffer;
    try {
      rawBody = await readRawBody(req, MAX_IMPORT_BYTES);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      error(res, msg, 413);
      return;
    }

    if (rawBody.length < 5) {
      error(
        res,
        "Request body is too small — expected password + file data.",
        400,
      );
      return;
    }

    // Parse binary envelope: [4 bytes password length][password][file data]
    const passwordLength = rawBody.readUInt32BE(0);
    if (passwordLength < AGENT_TRANSFER_MIN_PASSWORD_LENGTH) {
      error(
        res,
        `Password must be at least ${AGENT_TRANSFER_MIN_PASSWORD_LENGTH} characters.`,
        400,
      );
      return;
    }
    if (passwordLength > AGENT_TRANSFER_MAX_PASSWORD_LENGTH) {
      error(
        res,
        `Password is too long (max ${AGENT_TRANSFER_MAX_PASSWORD_LENGTH} bytes).`,
        400,
      );
      return;
    }
    if (rawBody.length < 4 + passwordLength + 1) {
      error(
        res,
        "Request body is incomplete — missing file data after password.",
        400,
      );
      return;
    }

    const password = rawBody.subarray(4, 4 + passwordLength).toString("utf-8");
    const fileBuffer = rawBody.subarray(4 + passwordLength);

    try {
      const result = await importAgent(
        state.runtime,
        fileBuffer as Buffer,
        password,
      );
      json(res, result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (err instanceof AgentExportError) {
        error(res, msg, 400);
      } else {
        error(res, `Import failed: ${msg}`, 500);
      }
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

  // ── GET /api/character/random-name ────────────────────────────────────
  if (method === "GET" && pathname === "/api/character/random-name") {
    const names = pickRandomNames(1);
    json(res, { name: names[0] ?? "Reimu" });
    return;
  }

  // ── POST /api/character/generate ────────────────────────────────────
  if (method === "POST" && pathname === "/api/character/generate") {
    const body = await readJsonBody<{
      field: string;
      context: {
        name?: string;
        system?: string;
        bio?: string;
        style?: { all?: string[]; chat?: string[]; post?: string[] };
        postExamples?: string[];
      };
      mode?: "append" | "replace";
    }>(req, res);
    if (!body) return;

    const { field, context: ctx, mode } = body;
    if (!field || !ctx) {
      error(res, "field and context are required", 400);
      return;
    }

    const rt = state.runtime;
    if (!rt) {
      error(res, "Agent runtime not available. Start the agent first.", 503);
      return;
    }

    const charSummary = [
      ctx.name ? `Name: ${ctx.name}` : "",
      ctx.system ? `System prompt: ${ctx.system}` : "",
      ctx.bio ? `Bio: ${ctx.bio}` : "",
      ctx.style?.all?.length ? `Style rules: ${ctx.style.all.join("; ")}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    let prompt = "";

    if (field === "bio") {
      prompt = `Given this character:\n${charSummary}\n\nWrite a concise, compelling bio for this character (3-4 short paragraphs, one per line). Just output the bio lines, nothing else. Match the character's voice and personality.`;
    } else if (field === "style") {
      const existing =
        mode === "append" && ctx.style?.all?.length
          ? `\nExisting style rules (add to these, don't repeat):\n${ctx.style.all.join("\n")}`
          : "";
      prompt = `Given this character:\n${charSummary}${existing}\n\nGenerate 4-6 communication style rules for this character. Output a JSON object with keys "all", "chat", "post", each containing an array of short rule strings. Just output the JSON, nothing else.`;
    } else if (field === "chatExamples") {
      prompt = `Given this character:\n${charSummary}\n\nGenerate 3 example chat conversations showing how this character responds. Output a JSON array where each element is an array of message objects like [{"user":"{{user1}}","content":{"text":"..."}},{"user":"{{agentName}}","content":{"text":"..."}}]. Just output the JSON array, nothing else.`;
    } else if (field === "postExamples") {
      const existing =
        mode === "append" && ctx.postExamples?.length
          ? `\nExisting posts (add new ones, don't repeat):\n${ctx.postExamples.join("\n")}`
          : "";
      prompt = `Given this character:\n${charSummary}${existing}\n\nGenerate 3-5 example social media posts this character would write. Output a JSON array of strings. Just output the JSON array, nothing else.`;
    } else {
      error(res, `Unknown field: ${field}`, 400);
      return;
    }

    try {
      const { ModelType } = await import("@elizaos/core");
      const result = await rt.useModel(ModelType.TEXT_SMALL, {
        prompt,
        temperature: 0.8,
        maxTokens: 1500,
      });
      json(res, { generated: String(result) });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "generation failed";
      logger.error(`[character-generate] ${msg}`);
      error(res, msg, 500);
    }
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

  // ── GET /api/models ─────────────────────────────────────────────────────
  // Optional ?provider=openai to fetch a single provider, or all if omitted.
  // ?refresh=true busts the cache for the requested provider(s).
  if (method === "GET" && pathname === "/api/models") {
    const force = url.searchParams.get("refresh") === "true";
    const specificProvider = url.searchParams.get("provider");

    if (specificProvider) {
      if (force) {
        try {
          fs.unlinkSync(providerCachePath(specificProvider));
        } catch {
          /* ok */
        }
      }
      const models = await getOrFetchProvider(specificProvider, force);
      json(res, { provider: specificProvider, models });
    } else {
      if (force) {
        // Bust all cache files
        try {
          const dir = resolveModelsCacheDir();
          if (fs.existsSync(dir)) {
            for (const f of fs.readdirSync(dir)) {
              if (f.endsWith(".json")) fs.unlinkSync(path.join(dir, f));
            }
          }
        } catch {
          /* ok */
        }
      }
      const all = await getOrFetchAllProviders(force);
      json(res, { providers: all });
    }
    return;
  }

  // ── GET /api/plugins ────────────────────────────────────────────────────
  if (method === "GET" && pathname === "/api/plugins") {
    // Re-read config from disk so we pick up plugins installed since server start.
    let freshConfig: MilaidyConfig;
    try {
      freshConfig = loadMilaidyConfig();
    } catch {
      freshConfig = state.config;
    }

    // Merge user-installed plugins into the list (they don't exist in plugins.json)
    const bundledIds = new Set(state.plugins.map((p) => p.id));
    const installedEntries = discoverInstalledPlugins(freshConfig, bundledIds);
    const allPlugins: PluginEntry[] = [...state.plugins, ...installedEntries];

    // Resolve enabled state from config and loaded state from runtime.
    // "enabled" = user wants it active (config). "isActive" = actually loaded.
    const configEntries = (
      freshConfig.plugins as Record<string, unknown> | undefined
    )?.entries as Record<string, { enabled?: boolean }> | undefined;
    const loadedNames = state.runtime
      ? state.runtime.plugins.map((p) => p.name)
      : [];
    for (const plugin of allPlugins) {
      const suffix = `plugin-${plugin.id}`;
      const packageName = `@elizaos/plugin-${plugin.id}`;
      const isLoaded =
        loadedNames.length > 0 &&
        loadedNames.some((name) => {
          return (
            name === plugin.id ||
            name === suffix ||
            name === packageName ||
            name.endsWith(`/${suffix}`) ||
            name.includes(plugin.id)
          );
        });
      plugin.isActive = isLoaded;
      // Set enabled from config if available, otherwise from runtime
      const configEntry = configEntries?.[plugin.id];
      if (configEntry && typeof configEntry.enabled === "boolean") {
        plugin.enabled = configEntry.enabled;
      } else {
        plugin.enabled = isLoaded;
      }
      // Detect installed-but-failed-to-load plugins
      plugin.loadError = undefined;
      if (plugin.enabled && !isLoaded && state.runtime) {
        const installs = freshConfig.plugins?.installs as
          | Record<string, unknown>
          | undefined;
        const packageName = `@elizaos/plugin-${plugin.id}`;
        const hasInstallRecord =
          installs?.[packageName] || installs?.[plugin.id];
        if (hasInstallRecord) {
          plugin.loadError =
            "Plugin installed but failed to load — the package may be missing compiled files.";
        }
      }
    }

    // Always refresh current env values and re-validate
    for (const plugin of allPlugins) {
      for (const param of plugin.parameters) {
        const envValue = process.env[param.key];
        param.isSet = Boolean(envValue?.trim());
        param.currentValue = param.isSet
          ? param.sensitive
            ? maskValue(envValue ?? "")
            : (envValue ?? "")
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
    }

    // Inject per-provider model options into configUiHints for MODEL fields.
    // Each provider's cache is independent — no cross-population.
    // Always set type: "select" on MODEL fields so they render as dropdowns,
    // even when no models are cached yet (empty dropdown prompts user to fetch).
    for (const plugin of allPlugins) {
      const providerModels = readProviderCache(plugin.id)?.models ?? [];

      for (const param of plugin.parameters) {
        if (!param.key.toUpperCase().includes("MODEL")) continue;

        // Filter to the category this field expects (chat, embedding, image, etc.)
        const expectedCat = paramKeyToCategory(param.key);
        const filtered = providerModels.filter(
          (m) => m.category === expectedCat,
        );

        if (!plugin.configUiHints) plugin.configUiHints = {};
        plugin.configUiHints[param.key] = {
          ...plugin.configUiHints[param.key],
          type: "select",
          options: filtered.map((m) => ({
            value: m.id,
            label: m.name !== m.id ? `${m.name} (${m.id})` : m.id,
          })),
        };
      }
    }

    json(res, { plugins: allPlugins });
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
    }
    if (body.config) {
      const configRejections = resolvePluginConfigMutationRejections(
        plugin.parameters,
        body.config,
      );
      if (configRejections.length > 0) {
        json(
          res,
          { ok: false, plugin, validationErrors: configRejections },
          422,
        );
        return;
      }

      // Only validate the fields actually being submitted — not all required
      // fields. Users may save partial config (e.g. just the API key) from
      // the Settings page; blocking the save because OTHER required fields
      // aren't set yet is counterproductive.
      const configObj = body.config;
      const submittedParamInfos: PluginParamInfo[] = plugin.parameters
        .filter((p) => p.key in configObj)
        .map((p) => ({
          key: p.key,
          required: p.required,
          sensitive: p.sensitive,
          type: p.type,
          description: p.description,
          default: p.default,
        }));
      const configValidation = validatePluginConfig(
        pluginId,
        plugin.category,
        plugin.envKey,
        plugin.configKeys,
        body.config,
        submittedParamInfos,
      );

      if (!configValidation.valid) {
        json(
          res,
          { ok: false, plugin, validationErrors: configValidation.errors },
          422,
        );
        return;
      }

      const allowedParamKeys = new Set(plugin.parameters.map((p) => p.key));

      // Persist config values to state.config.env so they survive restarts
      if (!state.config.env) {
        state.config.env = {};
      }
      for (const [key, value] of Object.entries(body.config)) {
        if (
          allowedParamKeys.has(key) &&
          !BLOCKED_ENV_KEYS.has(key.toUpperCase()) &&
          typeof value === "string" &&
          value.trim()
        ) {
          process.env[key] = value;
          (state.config.env as Record<string, unknown>)[key] = value;
        }
      }
      plugin.configured = true;

      // Save config even when only config values changed (no enable toggle)
      if (body.enabled === undefined) {
        try {
          saveMilaidyConfig(state.config);
        } catch (err) {
          logger.warn(
            `[milaidy-api] Failed to save config: ${err instanceof Error ? err.message : err}`,
          );
        }
      }
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

    // Update config.plugins.entries so the runtime loads/skips this plugin
    if (body.enabled !== undefined) {
      const packageName = `@elizaos/plugin-${pluginId}`;

      if (!state.config.plugins) {
        state.config.plugins = {};
      }
      if (!state.config.plugins.entries) {
        (state.config.plugins as Record<string, unknown>).entries = {};
      }

      const entries = (state.config.plugins as Record<string, unknown>)
        .entries as Record<string, Record<string, unknown>>;
      entries[pluginId] = { enabled: body.enabled };
      logger.info(
        `[milaidy-api] ${body.enabled ? "Enabled" : "Disabled"} plugin: ${packageName}`,
      );

      // Persist capability toggle state in config.features so the runtime
      // can gate related behaviour (e.g. disabling image description when
      // vision is toggled off).
      const CAPABILITY_FEATURE_IDS = new Set([
        "vision",
        "browser",
        "computeruse",
      ]);
      if (CAPABILITY_FEATURE_IDS.has(pluginId)) {
        if (!state.config.features) {
          state.config.features = {};
        }
        state.config.features[pluginId] = body.enabled;
      }

      // Save updated config
      try {
        saveMilaidyConfig(state.config);
      } catch (err) {
        logger.warn(
          `[milaidy-api] Failed to save config: ${err instanceof Error ? err.message : err}`,
        );
      }

      scheduleRuntimeRestart(`Plugin toggle: ${pluginId}`, 300);
    }

    json(res, { ok: true, plugin });
    return;
  }

  // ── GET /api/secrets ─────────────────────────────────────────────────
  if (method === "GET" && pathname === "/api/secrets") {
    // Merge bundled + installed plugins for full parameter coverage
    const bundledIds = new Set(state.plugins.map((p) => p.id));
    const installedEntries = discoverInstalledPlugins(state.config, bundledIds);
    const allPlugins: PluginEntry[] = [...state.plugins, ...installedEntries];

    // Sync enabled status from runtime (same logic as GET /api/plugins)
    if (state.runtime) {
      const loadedNames = state.runtime.plugins.map((p) => p.name);
      for (const plugin of allPlugins) {
        const suffix = `plugin-${plugin.id}`;
        const packageName = `@elizaos/plugin-${plugin.id}`;
        plugin.enabled = loadedNames.some(
          (name) =>
            name === plugin.id ||
            name === suffix ||
            name === packageName ||
            name.endsWith(`/${suffix}`) ||
            name.includes(plugin.id),
        );
      }
    }

    const secrets = aggregateSecrets(allPlugins);
    json(res, { secrets });
    return;
  }

  // ── PUT /api/secrets ─────────────────────────────────────────────────
  if (method === "PUT" && pathname === "/api/secrets") {
    const body = await readJsonBody<{ secrets: Record<string, string> }>(
      req,
      res,
    );
    if (!body) return;
    if (!body.secrets || typeof body.secrets !== "object") {
      error(res, "Missing or invalid 'secrets' object", 400);
      return;
    }

    // Build allowlist from all plugin-declared sensitive params
    const bundledIds = new Set(state.plugins.map((p) => p.id));
    const installedEntries = discoverInstalledPlugins(state.config, bundledIds);
    const allPlugins: PluginEntry[] = [...state.plugins, ...installedEntries];
    const allowedKeys = new Set<string>();
    for (const plugin of allPlugins) {
      for (const param of plugin.parameters) {
        if (param.sensitive) allowedKeys.add(param.key);
      }
    }

    const updated: string[] = [];
    for (const [key, value] of Object.entries(body.secrets)) {
      if (typeof value !== "string" || !value.trim()) continue;
      if (!allowedKeys.has(key)) continue;
      if (BLOCKED_ENV_KEYS.has(key.toUpperCase())) continue;
      process.env[key] = value;
      updated.push(key);
    }

    // Mark affected plugins as configured
    for (const plugin of allPlugins) {
      const pluginKeys = new Set(plugin.parameters.map((p) => p.key));
      if (updated.some((k) => pluginKeys.has(k))) {
        plugin.configured = true;
      }
    }

    json(res, { ok: true, updated });
    return;
  }

  // ── GET /api/registry/plugins ──────────────────────────────────────────
  if (method === "GET" && pathname === "/api/registry/plugins") {
    const { getRegistryPlugins } = await import(
      "../services/registry-client.js"
    );
    const { listInstalledPlugins: listInstalled } = await import(
      "../services/plugin-installer.js"
    );
    try {
      const registry = await getRegistryPlugins();
      const installed = await listInstalled();
      const installedNames = new Set(installed.map((p) => p.name));

      // Also check which plugins are loaded in the runtime
      const loadedNames = state.runtime
        ? new Set(state.runtime.plugins.map((p) => p.name))
        : new Set<string>();

      // Cross-reference with bundled manifest so the Store can hide them
      const bundledIds = new Set(state.plugins.map((p) => p.id));

      const plugins = Array.from(registry.values()).map((p) => {
        const shortId = p.name
          .replace(/^@[^/]+\/plugin-/, "")
          .replace(/^@[^/]+\//, "")
          .replace(/^plugin-/, "");
        return {
          ...p,
          installed: installedNames.has(p.name),
          installedVersion:
            installed.find((i) => i.name === p.name)?.version ?? null,
          loaded:
            loadedNames.has(p.name) ||
            loadedNames.has(p.name.replace("@elizaos/", "")),
          bundled: bundledIds.has(shortId),
        };
      });
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
        ? parseClampedInteger(limitParam, { min: 1, max: 50, fallback: 15 })
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

  // ── POST /api/plugins/:id/test ────────────────────────────────────────
  // Test a plugin's connection / configuration validity.
  const pluginTestMatch =
    method === "POST" && pathname.match(/^\/api\/plugins\/([^/]+)\/test$/);
  if (pluginTestMatch) {
    const pluginId = decodeURIComponent(pluginTestMatch[1]);
    const startMs = Date.now();

    try {
      // Find the plugin in the runtime
      const allPlugins = state.runtime?.plugins ?? [];
      const normalizePluginId = (value: string): string =>
        value.replace(/^@[^/]+\//, "").replace(/^plugin-/, "");

      const normalizedPluginId = normalizePluginId(pluginId);

      const plugin = allPlugins.find((p: { id?: string; name?: string }) => {
        const runtimeName = p.name ?? "";
        const runtimeId = normalizePluginId(runtimeName);
        return (
          p.id === pluginId ||
          p.name === pluginId ||
          runtimeId === pluginId ||
          runtimeId === normalizedPluginId
        );
      });

      if (!plugin) {
        json(
          res,
          {
            success: false,
            pluginId,
            error: "Plugin not found or not loaded",
            durationMs: Date.now() - startMs,
          },
          404,
        );
        return;
      }

      // Check if plugin exposes a test/health method
      const testFn =
        (plugin as unknown as Record<string, unknown>).testConnection ??
        (plugin as unknown as Record<string, unknown>).healthCheck;
      if (typeof testFn === "function") {
        const result = await (
          testFn as () => Promise<{ ok: boolean; message?: string }>
        )();
        json(res, {
          success: result.ok !== false,
          pluginId,
          message:
            result.message ??
            (result.ok !== false
              ? "Connection successful"
              : "Connection failed"),
          durationMs: Date.now() - startMs,
        });
        return;
      }

      // No test function — return a basic "plugin is loaded" status
      json(res, {
        success: true,
        pluginId,
        message: "Plugin is loaded and active (no custom test available)",
        durationMs: Date.now() - startMs,
      });
    } catch (err) {
      json(
        res,
        {
          success: false,
          pluginId,
          error: err instanceof Error ? err.message : String(err),
          durationMs: Date.now() - startMs,
        },
        500,
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

    const npmNamePattern =
      /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;
    if (!npmNamePattern.test(pluginName)) {
      error(res, "Invalid plugin name format", 400);
      return;
    }

    const { installPlugin } = await import("../services/plugin-installer.js");

    try {
      const result = await installPlugin(pluginName, (progress) => {
        logger.info(`[install] ${progress.phase}: ${progress.message}`);
        state.broadcastWs?.({
          type: "install-progress",
          pluginName: progress.pluginName,
          phase: progress.phase,
          message: progress.message,
        });
      });

      if (!result.success) {
        json(res, { ok: false, error: result.error }, 422);
        return;
      }

      // If autoRestart is not explicitly false, restart the agent
      if (body.autoRestart !== false && result.requiresRestart) {
        scheduleRuntimeRestart(`Plugin ${result.pluginName} installed`, 500);
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
        scheduleRuntimeRestart(`Plugin ${pluginName} uninstalled`, 500);
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

  // ── GET /api/plugins/core ────────────────────────────────────────────
  // Returns all core and optional core plugins with their loaded/running status.
  if (method === "GET" && pathname === "/api/plugins/core") {
    // Build a set of loaded plugin names for robust matching.
    // Plugin internal names vary wildly (e.g. "local-ai" for plugin-local-embedding,
    // "eliza-coder" for plugin-code), so we check loaded names against multiple
    // derived forms of the npm package name.
    const loadedNames = state.runtime
      ? new Set(state.runtime.plugins.map((p: { name: string }) => p.name))
      : new Set<string>();

    const isLoaded = (npmName: string): boolean => {
      if (loadedNames.has(npmName)) return true;
      // @elizaos/plugin-foo -> plugin-foo
      const withoutScope = npmName.replace("@elizaos/", "");
      if (loadedNames.has(withoutScope)) return true;
      // plugin-foo -> foo
      const shortId = withoutScope.replace("plugin-", "");
      if (loadedNames.has(shortId)) return true;
      // Check if ANY loaded name contains the short id or vice versa
      for (const n of loadedNames) {
        if (n.includes(shortId) || shortId.includes(n)) return true;
      }
      return false;
    };

    // Check which optional plugins are currently in the allow list
    const allowList = new Set(state.config.plugins?.allow ?? []);

    const makeEntry = (npm: string, isCore: boolean) => {
      const id = npm.replace("@elizaos/plugin-", "");
      return {
        npmName: npm,
        id,
        name: id
          .split("-")
          .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(" "),
        isCore,
        loaded: isLoaded(npm),
        enabled: isCore || allowList.has(npm) || allowList.has(id),
      };
    };

    const coreList = CORE_PLUGINS.map((npm: string) => makeEntry(npm, true));
    const optionalList = OPTIONAL_CORE_PLUGINS.map((npm: string) =>
      makeEntry(npm, false),
    );

    json(res, { core: coreList, optional: optionalList });
    return;
  }

  // ── POST /api/plugins/core/toggle ─────────────────────────────────────
  // Enable or disable an optional core plugin by updating the allow list.
  if (method === "POST" && pathname === "/api/plugins/core/toggle") {
    const body = await readJsonBody<{ npmName: string; enabled: boolean }>(
      req,
      res,
    );
    if (!body || !body.npmName) return;

    // Only allow toggling optional plugins, not core
    const isCorePlugin = (CORE_PLUGINS as readonly string[]).includes(
      body.npmName,
    );
    if (isCorePlugin) {
      error(res, "Core plugins cannot be disabled");
      return;
    }
    const isOptional = (OPTIONAL_CORE_PLUGINS as readonly string[]).includes(
      body.npmName,
    );
    if (!isOptional) {
      error(res, "Unknown optional plugin");
      return;
    }

    // Update the allow list in config
    state.config.plugins = state.config.plugins ?? {};
    state.config.plugins.allow = state.config.plugins.allow ?? [];
    const allow = state.config.plugins.allow;
    const shortId = body.npmName.replace("@elizaos/plugin-", "");

    if (body.enabled) {
      if (!allow.includes(body.npmName) && !allow.includes(shortId)) {
        allow.push(body.npmName);
      }
    } else {
      state.config.plugins.allow = allow.filter(
        (p: string) => p !== body.npmName && p !== shortId,
      );
    }

    try {
      saveMilaidyConfig(state.config);
    } catch (err) {
      logger.warn(
        `[api] Config save failed: ${err instanceof Error ? err.message : err}`,
      );
    }

    // Auto-restart so the change takes effect
    scheduleRuntimeRestart(
      `Plugin ${shortId} ${body.enabled ? "enabled" : "disabled"}`,
      300,
    );

    json(res, {
      ok: true,
      restarting: true,
      message: `${shortId} ${body.enabled ? "enabled" : "disabled"}. Restarting...`,
    });
    return;
  }

  // ── GET /api/skills/catalog ───────────────────────────────────────────
  // Browse the full skill catalog (paginated).
  if (method === "GET" && pathname === "/api/skills/catalog") {
    try {
      const { getCatalogSkills } = await import(
        "../services/skill-catalog-client.js"
      );
      const all = await getCatalogSkills();
      const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
      const perPage = Math.min(
        100,
        Math.max(1, Number(url.searchParams.get("perPage")) || 50),
      );
      const sort = url.searchParams.get("sort") ?? "downloads";
      const sorted = [...all];
      if (sort === "downloads")
        sorted.sort(
          (a, b) =>
            b.stats.downloads - a.stats.downloads || b.updatedAt - a.updatedAt,
        );
      else if (sort === "stars")
        sorted.sort(
          (a, b) => b.stats.stars - a.stats.stars || b.updatedAt - a.updatedAt,
        );
      else if (sort === "updated")
        sorted.sort((a, b) => b.updatedAt - a.updatedAt);
      else if (sort === "name")
        sorted.sort((a, b) =>
          (a.displayName ?? a.slug).localeCompare(b.displayName ?? b.slug),
        );

      // Resolve installed status from the AgentSkillsService
      const installedSlugs = new Set<string>();
      if (state.runtime) {
        try {
          const svc = state.runtime.getService("AGENT_SKILLS_SERVICE") as
            | {
                getLoadedSkills?: () => Array<{ slug: string; source: string }>;
              }
            | undefined;
          if (svc && typeof svc.getLoadedSkills === "function") {
            for (const s of svc.getLoadedSkills()) {
              installedSlugs.add(s.slug);
            }
          }
        } catch (err) {
          logger.debug(
            `[api] Service not available: ${err instanceof Error ? err.message : err}`,
          );
        }
      }
      // Also check locally discovered skills
      for (const s of state.skills) {
        installedSlugs.add(s.id);
      }

      const start = (page - 1) * perPage;
      const skills = sorted.slice(start, start + perPage).map((s) => ({
        ...s,
        installed: installedSlugs.has(s.slug),
      }));
      json(res, {
        total: all.length,
        page,
        perPage,
        totalPages: Math.ceil(all.length / perPage),
        installedCount: installedSlugs.size,
        skills,
      });
    } catch (err) {
      error(
        res,
        `Failed to load skill catalog: ${err instanceof Error ? err.message : String(err)}`,
        500,
      );
    }
    return;
  }

  // ── GET /api/skills/catalog/search ─────────────────────────────────────
  if (method === "GET" && pathname === "/api/skills/catalog/search") {
    const q = url.searchParams.get("q");
    if (!q) {
      error(res, "Missing query parameter ?q=", 400);
      return;
    }
    try {
      const { searchCatalogSkills } = await import(
        "../services/skill-catalog-client.js"
      );
      const limit = Math.min(
        100,
        Math.max(1, Number(url.searchParams.get("limit")) || 30),
      );
      const results = await searchCatalogSkills(q, limit);
      json(res, { query: q, count: results.length, results });
    } catch (err) {
      error(
        res,
        `Skill catalog search failed: ${err instanceof Error ? err.message : String(err)}`,
        500,
      );
    }
    return;
  }

  // ── GET /api/skills/catalog/:slug ──────────────────────────────────────
  if (method === "GET" && pathname.startsWith("/api/skills/catalog/")) {
    const slug = decodeURIComponent(
      pathname.slice("/api/skills/catalog/".length),
    );
    // Exclude "search" which is handled above
    if (slug && slug !== "search") {
      try {
        const { getCatalogSkill } = await import(
          "../services/skill-catalog-client.js"
        );
        const skill = await getCatalogSkill(slug);
        if (!skill) {
          error(res, `Skill "${slug}" not found in catalog`, 404);
          return;
        }
        json(res, { skill });
      } catch (err) {
        error(
          res,
          `Failed to fetch skill: ${err instanceof Error ? err.message : String(err)}`,
          500,
        );
      }
      return;
    }
  }

  // ── POST /api/skills/catalog/refresh ───────────────────────────────────
  if (method === "POST" && pathname === "/api/skills/catalog/refresh") {
    try {
      const { refreshCatalog } = await import(
        "../services/skill-catalog-client.js"
      );
      const skills = await refreshCatalog();
      json(res, { ok: true, count: skills.length });
    } catch (err) {
      error(
        res,
        `Catalog refresh failed: ${err instanceof Error ? err.message : String(err)}`,
        500,
      );
    }
    return;
  }

  // ── POST /api/skills/catalog/install ───────────────────────────────────
  if (method === "POST" && pathname === "/api/skills/catalog/install") {
    const body = await readJsonBody<{ slug: string; version?: string }>(
      req,
      res,
    );
    if (!body) return;
    if (!body.slug) {
      error(res, "Missing required field: slug", 400);
      return;
    }

    if (!state.runtime) {
      error(res, "Agent runtime not available — start the agent first", 503);
      return;
    }

    try {
      const service = state.runtime.getService("AGENT_SKILLS_SERVICE") as
        | {
            install?: (
              slug: string,
              opts?: { version?: string; force?: boolean },
            ) => Promise<boolean>;
            isInstalled?: (slug: string) => Promise<boolean>;
          }
        | undefined;

      if (!service || typeof service.install !== "function") {
        error(
          res,
          "AgentSkillsService not available — ensure @elizaos/plugin-agent-skills is loaded",
          501,
        );
        return;
      }

      const alreadyInstalled =
        typeof service.isInstalled === "function"
          ? await service.isInstalled(body.slug)
          : false;

      if (alreadyInstalled) {
        json(res, {
          ok: true,
          slug: body.slug,
          message: `Skill "${body.slug}" is already installed`,
          alreadyInstalled: true,
        });
        return;
      }

      const success = await service.install(body.slug, {
        version: body.version,
      });

      if (success) {
        // Refresh the skills list so the UI picks up the new skill
        const workspaceDir =
          state.config.agents?.defaults?.workspace ??
          resolveDefaultAgentWorkspaceDir();
        state.skills = await discoverSkills(
          workspaceDir,
          state.config,
          state.runtime,
        );

        json(res, {
          ok: true,
          slug: body.slug,
          message: `Skill "${body.slug}" installed successfully`,
        });
      } else {
        error(res, `Failed to install skill "${body.slug}"`, 500);
      }
    } catch (err) {
      error(
        res,
        `Skill install failed: ${err instanceof Error ? err.message : String(err)}`,
        500,
      );
    }
    return;
  }

  // ── POST /api/skills/catalog/uninstall ─────────────────────────────────
  if (method === "POST" && pathname === "/api/skills/catalog/uninstall") {
    const body = await readJsonBody<{ slug: string }>(req, res);
    if (!body) return;
    if (!body.slug) {
      error(res, "Missing required field: slug", 400);
      return;
    }

    if (!state.runtime) {
      error(res, "Agent runtime not available — start the agent first", 503);
      return;
    }

    try {
      const service = state.runtime.getService("AGENT_SKILLS_SERVICE") as
        | {
            uninstall?: (slug: string) => Promise<boolean>;
          }
        | undefined;

      if (!service || typeof service.uninstall !== "function") {
        error(
          res,
          "AgentSkillsService not available — ensure @elizaos/plugin-agent-skills is loaded",
          501,
        );
        return;
      }

      const success = await service.uninstall(body.slug);

      if (success) {
        // Refresh the skills list
        const workspaceDir =
          state.config.agents?.defaults?.workspace ??
          resolveDefaultAgentWorkspaceDir();
        state.skills = await discoverSkills(
          workspaceDir,
          state.config,
          state.runtime,
        );

        json(res, {
          ok: true,
          slug: body.slug,
          message: `Skill "${body.slug}" uninstalled successfully`,
        });
      } else {
        error(
          res,
          `Failed to uninstall skill "${body.slug}" — it may be a bundled skill`,
          400,
        );
      }
    } catch (err) {
      error(
        res,
        `Skill uninstall failed: ${err instanceof Error ? err.message : String(err)}`,
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

  // ── GET /api/skills/:id/scan ───────────────────────────────────────────
  if (method === "GET" && pathname.match(/^\/api\/skills\/[^/]+\/scan$/)) {
    const skillId = validateSkillId(
      decodeURIComponent(pathname.split("/")[3]),
      res,
    );
    if (!skillId) return;
    const workspaceDir =
      state.config.agents?.defaults?.workspace ??
      resolveDefaultAgentWorkspaceDir();
    const report = await loadScanReportFromDisk(
      skillId,
      workspaceDir,
      state.runtime,
    );
    const acks = await loadSkillAcknowledgments(state.runtime);
    const ack = acks[skillId] ?? null;
    json(res, { ok: true, report, acknowledged: !!ack, acknowledgment: ack });
    return;
  }

  // ── POST /api/skills/:id/acknowledge ──────────────────────────────────
  if (
    method === "POST" &&
    pathname.match(/^\/api\/skills\/[^/]+\/acknowledge$/)
  ) {
    const skillId = validateSkillId(
      decodeURIComponent(pathname.split("/")[3]),
      res,
    );
    if (!skillId) return;
    const body = await readJsonBody<{ enable?: boolean }>(req, res);
    if (!body) return;

    const workspaceDir =
      state.config.agents?.defaults?.workspace ??
      resolveDefaultAgentWorkspaceDir();
    const report = await loadScanReportFromDisk(
      skillId,
      workspaceDir,
      state.runtime,
    );
    if (!report) {
      error(res, `No scan report found for skill "${skillId}".`, 404);
      return;
    }
    if (report.status === "blocked") {
      error(
        res,
        `Skill "${skillId}" is blocked and cannot be acknowledged.`,
        403,
      );
      return;
    }
    if (report.status === "clean") {
      json(res, {
        ok: true,
        message: "No findings to acknowledge.",
        acknowledged: true,
      });
      return;
    }

    const findings = report.findings as Array<Record<string, unknown>>;
    const manifestFindings = report.manifestFindings as Array<
      Record<string, unknown>
    >;
    const totalFindings = findings.length + manifestFindings.length;

    if (state.runtime) {
      const acks = await loadSkillAcknowledgments(state.runtime);
      acks[skillId] = {
        acknowledgedAt: new Date().toISOString(),
        findingCount: totalFindings,
      };
      await saveSkillAcknowledgments(state.runtime, acks);
    }

    if (body.enable === true) {
      const skill = state.skills.find((s) => s.id === skillId);
      if (skill) {
        skill.enabled = true;
        if (state.runtime) {
          const prefs = await loadSkillPreferences(state.runtime);
          prefs[skillId] = true;
          await saveSkillPreferences(state.runtime, prefs);
        }
      }
    }

    json(res, {
      ok: true,
      skillId,
      acknowledged: true,
      enabled: body.enable === true,
      findingCount: totalFindings,
    });
    return;
  }

  // ── POST /api/skills/create ───────────────────────────────────────────
  if (method === "POST" && pathname === "/api/skills/create") {
    const body = await readJsonBody<{ name: string; description?: string }>(
      req,
      res,
    );
    if (!body) return;
    const rawName = body.name?.trim();
    if (!rawName) {
      error(res, "Skill name is required", 400);
      return;
    }

    const slug = rawName
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "");
    if (!slug || slug.length > 64) {
      error(
        res,
        "Skill name must produce a valid slug (1-64 chars, lowercase alphanumeric + hyphens)",
        400,
      );
      return;
    }

    const workspaceDir =
      state.config.agents?.defaults?.workspace ??
      resolveDefaultAgentWorkspaceDir();
    const skillDir = path.join(workspaceDir, "skills", slug);

    if (fs.existsSync(skillDir)) {
      error(res, `Skill "${slug}" already exists`, 409);
      return;
    }

    const description =
      body.description?.trim() || "Describe what this skill does.";
    const template = `---\nname: ${slug}\ndescription: ${description.replace(/"/g, '\\"')}\n---\n\n## Instructions\n\n[Describe what this skill does and how the agent should use it]\n\n## When to Use\n\nUse this skill when [describe trigger conditions].\n\n## Steps\n\n1. [First step]\n2. [Second step]\n3. [Third step]\n`;

    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, "SKILL.md"), template, "utf-8");

    state.skills = await discoverSkills(
      workspaceDir,
      state.config,
      state.runtime,
    );
    const skill = state.skills.find((s) => s.id === slug);
    json(res, {
      ok: true,
      skill: skill ?? { id: slug, name: slug, description, enabled: true },
      path: skillDir,
    });
    return;
  }

  // ── POST /api/skills/:id/open ─────────────────────────────────────────
  if (method === "POST" && pathname.match(/^\/api\/skills\/[^/]+\/open$/)) {
    const skillId = validateSkillId(
      decodeURIComponent(pathname.split("/")[3]),
      res,
    );
    if (!skillId) return;
    const workspaceDir =
      state.config.agents?.defaults?.workspace ??
      resolveDefaultAgentWorkspaceDir();

    const candidates = [
      path.join(workspaceDir, "skills", skillId),
      path.join(workspaceDir, "skills", ".marketplace", skillId),
    ];
    let skillPath: string | null = null;
    for (const c of candidates) {
      if (fs.existsSync(path.join(c, "SKILL.md"))) {
        skillPath = c;
        break;
      }
    }

    // Try AgentSkillsService for bundled skills — copy to workspace for editing
    if (!skillPath && state.runtime) {
      try {
        const svc = state.runtime.getService("AGENT_SKILLS_SERVICE") as
          | {
              getLoadedSkills?: () => Array<{
                slug: string;
                path: string;
                source: string;
              }>;
            }
          | undefined;
        if (svc?.getLoadedSkills) {
          const loaded = svc.getLoadedSkills().find((s) => s.slug === skillId);
          if (loaded) {
            if (loaded.source === "bundled" || loaded.source === "plugin") {
              const targetDir = path.join(workspaceDir, "skills", skillId);
              if (!fs.existsSync(targetDir)) {
                fs.cpSync(loaded.path, targetDir, { recursive: true });
                state.skills = await discoverSkills(
                  workspaceDir,
                  state.config,
                  state.runtime,
                );
              }
              skillPath = targetDir;
            } else {
              skillPath = loaded.path;
            }
          }
        }
      } catch (err) {
        logger.debug(
          `[api] Service not available: ${err instanceof Error ? err.message : err}`,
        );
      }
    }

    if (!skillPath) {
      error(res, `Skill "${skillId}" not found`, 404);
      return;
    }

    const { execFile } = await import("node:child_process");
    const opener =
      process.platform === "darwin"
        ? "open"
        : process.platform === "win32"
          ? "explorer"
          : "xdg-open";
    execFile(opener, [skillPath], (err) => {
      if (err)
        logger.warn(
          `[milaidy-api] Failed to open skill folder: ${err.message}`,
        );
    });
    json(res, { ok: true, path: skillPath });
    return;
  }

  // ── GET /api/skills/:id/source ──────────────────────────────────────────
  if (method === "GET" && pathname.match(/^\/api\/skills\/[^/]+\/source$/)) {
    const skillId = validateSkillId(
      decodeURIComponent(pathname.split("/")[3]),
      res,
    );
    if (!skillId) return;
    const workspaceDir =
      state.config.agents?.defaults?.workspace ??
      resolveDefaultAgentWorkspaceDir();

    const candidates = [
      path.join(workspaceDir, "skills", skillId),
      path.join(workspaceDir, "skills", ".marketplace", skillId),
    ];
    let skillMdPath: string | null = null;
    for (const c of candidates) {
      const md = path.join(c, "SKILL.md");
      if (fs.existsSync(md)) {
        skillMdPath = md;
        break;
      }
    }

    // Try AgentSkillsService for bundled/plugin skills — copy to workspace for editing
    if (!skillMdPath && state.runtime) {
      try {
        const svc = state.runtime.getService("AGENT_SKILLS_SERVICE") as
          | {
              getLoadedSkills?: () => Array<{
                slug: string;
                path: string;
                source: string;
              }>;
            }
          | undefined;
        if (svc?.getLoadedSkills) {
          const loaded = svc.getLoadedSkills().find((s) => s.slug === skillId);
          if (loaded) {
            if (loaded.source === "bundled" || loaded.source === "plugin") {
              const targetDir = path.join(workspaceDir, "skills", skillId);
              if (!fs.existsSync(targetDir)) {
                fs.cpSync(loaded.path, targetDir, { recursive: true });
                state.skills = await discoverSkills(
                  workspaceDir,
                  state.config,
                  state.runtime,
                );
              }
              const md = path.join(targetDir, "SKILL.md");
              if (fs.existsSync(md)) skillMdPath = md;
            } else {
              const md = path.join(loaded.path, "SKILL.md");
              if (fs.existsSync(md)) skillMdPath = md;
            }
          }
        }
      } catch {
        /* ignore */
      }
    }

    if (!skillMdPath) {
      error(res, `Skill "${skillId}" not found`, 404);
      return;
    }

    try {
      const content = fs.readFileSync(skillMdPath, "utf-8");
      json(res, { ok: true, skillId, content, path: skillMdPath });
    } catch (err) {
      error(
        res,
        `Failed to read skill: ${err instanceof Error ? err.message : "unknown"}`,
        500,
      );
    }
    return;
  }

  // ── PUT /api/skills/:id/source ──────────────────────────────────────────
  if (method === "PUT" && pathname.match(/^\/api\/skills\/[^/]+\/source$/)) {
    const skillId = validateSkillId(
      decodeURIComponent(pathname.split("/")[3]),
      res,
    );
    if (!skillId) return;
    const body = await readBody(req);
    if (!body) return;

    let parsed: { content?: string };
    try {
      parsed = JSON.parse(body);
    } catch {
      error(res, "Invalid JSON body", 400);
      return;
    }
    if (typeof parsed.content !== "string") {
      error(res, "Missing 'content' field", 400);
      return;
    }

    const workspaceDir =
      state.config.agents?.defaults?.workspace ??
      resolveDefaultAgentWorkspaceDir();

    const candidates = [
      path.join(workspaceDir, "skills", skillId),
      path.join(workspaceDir, "skills", ".marketplace", skillId),
    ];
    let skillMdPath: string | null = null;
    for (const c of candidates) {
      const md = path.join(c, "SKILL.md");
      if (fs.existsSync(md)) {
        skillMdPath = md;
        break;
      }
    }

    // Try AgentSkillsService for bundled/plugin skills — copy to workspace for editing
    if (!skillMdPath && state.runtime) {
      try {
        const svc = state.runtime.getService("AGENT_SKILLS_SERVICE") as
          | {
              getLoadedSkills?: () => Array<{
                slug: string;
                path: string;
                source: string;
              }>;
            }
          | undefined;
        if (svc?.getLoadedSkills) {
          const loaded = svc.getLoadedSkills().find((s) => s.slug === skillId);
          if (loaded) {
            if (loaded.source === "bundled" || loaded.source === "plugin") {
              const targetDir = path.join(workspaceDir, "skills", skillId);
              if (!fs.existsSync(targetDir)) {
                fs.cpSync(loaded.path, targetDir, { recursive: true });
              }
              const md = path.join(targetDir, "SKILL.md");
              if (fs.existsSync(md)) skillMdPath = md;
            } else {
              const md = path.join(loaded.path, "SKILL.md");
              if (fs.existsSync(md)) skillMdPath = md;
            }
          }
        }
      } catch {
        /* ignore */
      }
    }

    if (!skillMdPath) {
      error(res, `Skill "${skillId}" not found`, 404);
      return;
    }

    try {
      fs.writeFileSync(skillMdPath, parsed.content, "utf-8");
      // Re-discover skills to pick up any name/description changes
      state.skills = await discoverSkills(
        workspaceDir,
        state.config,
        state.runtime,
      );
      const skill = state.skills.find((s) => s.id === skillId);
      json(res, { ok: true, skillId, skill });
    } catch (err) {
      error(
        res,
        `Failed to save skill: ${err instanceof Error ? err.message : "unknown"}`,
        500,
      );
    }
    return;
  }

  // ── DELETE /api/skills/:id ────────────────────────────────────────────
  if (
    method === "DELETE" &&
    pathname.match(/^\/api\/skills\/[^/]+$/) &&
    !pathname.includes("/marketplace")
  ) {
    const skillId = validateSkillId(
      decodeURIComponent(pathname.slice("/api/skills/".length)),
      res,
    );
    if (!skillId) return;
    const workspaceDir =
      state.config.agents?.defaults?.workspace ??
      resolveDefaultAgentWorkspaceDir();

    const wsDir = path.join(workspaceDir, "skills", skillId);
    const mpDir = path.join(workspaceDir, "skills", ".marketplace", skillId);
    let deleted = false;
    let source = "";

    if (fs.existsSync(path.join(wsDir, "SKILL.md"))) {
      fs.rmSync(wsDir, { recursive: true, force: true });
      deleted = true;
      source = "workspace";
    } else if (fs.existsSync(path.join(mpDir, "SKILL.md"))) {
      try {
        const { uninstallMarketplaceSkill } = await import(
          "../services/skill-marketplace.js"
        );
        await uninstallMarketplaceSkill(workspaceDir, skillId);
        deleted = true;
        source = "marketplace";
      } catch (err) {
        error(
          res,
          `Failed to uninstall: ${err instanceof Error ? err.message : String(err)}`,
          500,
        );
        return;
      }
    } else if (state.runtime) {
      try {
        const svc = state.runtime.getService("AGENT_SKILLS_SERVICE") as
          | { uninstall?: (slug: string) => Promise<boolean> }
          | undefined;
        if (svc?.uninstall) {
          deleted = await svc.uninstall(skillId);
          source = "catalog";
        }
      } catch (err) {
        logger.debug(
          `[api] Service not available: ${err instanceof Error ? err.message : err}`,
        );
      }
    }

    if (!deleted) {
      error(
        res,
        `Skill "${skillId}" not found or is a bundled skill that cannot be deleted`,
        404,
      );
      return;
    }

    state.skills = await discoverSkills(
      workspaceDir,
      state.config,
      state.runtime,
    );
    if (state.runtime) {
      const prefs = await loadSkillPreferences(state.runtime);
      delete prefs[skillId];
      await saveSkillPreferences(state.runtime, prefs);
      const acks = await loadSkillAcknowledgments(state.runtime);
      delete acks[skillId];
      await saveSkillAcknowledgments(state.runtime, acks);
    }
    json(res, { ok: true, skillId, source });
    return;
  }

  // ── GET /api/skills/marketplace/search ─────────────────────────────────
  if (method === "GET" && pathname === "/api/skills/marketplace/search") {
    const query = url.searchParams.get("q") ?? "";
    if (!query.trim()) {
      error(res, "Query parameter 'q' is required", 400);
      return;
    }
    try {
      const limitStr = url.searchParams.get("limit");
      const limit = limitStr
        ? parseClampedInteger(limitStr, { min: 1, max: 50, fallback: 20 })
        : 20;
      const results = await searchSkillsMarketplace(query, { limit });
      json(res, { ok: true, results });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      error(res, msg, 502);
    }
    return;
  }

  // ── GET /api/skills/marketplace/installed ─────────────────────────────
  if (method === "GET" && pathname === "/api/skills/marketplace/installed") {
    try {
      const workspaceDir =
        state.config.agents?.defaults?.workspace ??
        resolveDefaultAgentWorkspaceDir();
      const installed = await listInstalledMarketplaceSkills(workspaceDir);
      json(res, { ok: true, skills: installed });
    } catch (err) {
      error(
        res,
        `Failed to list installed skills: ${err instanceof Error ? err.message : err}`,
        500,
      );
    }
    return;
  }

  // ── POST /api/skills/marketplace/install ──────────────────────────────
  if (method === "POST" && pathname === "/api/skills/marketplace/install") {
    const body = await readJsonBody<{
      githubUrl?: string;
      repository?: string;
      path?: string;
      name?: string;
      description?: string;
    }>(req, res);
    if (!body) return;

    if (!body.githubUrl?.trim() && !body.repository?.trim()) {
      error(res, "Install requires a githubUrl or repository", 400);
      return;
    }

    try {
      const workspaceDir =
        state.config.agents?.defaults?.workspace ??
        resolveDefaultAgentWorkspaceDir();
      const result = await installMarketplaceSkill(workspaceDir, {
        githubUrl: body.githubUrl,
        repository: body.repository,
        path: body.path,
        name: body.name,
        description: body.description,
        source: "skillsmp",
      });
      json(res, { ok: true, skill: result });
    } catch (err) {
      error(
        res,
        `Install failed: ${err instanceof Error ? err.message : err}`,
        500,
      );
    }
    return;
  }

  // ── POST /api/skills/marketplace/uninstall ────────────────────────────
  if (method === "POST" && pathname === "/api/skills/marketplace/uninstall") {
    const body = await readJsonBody<{ id?: string }>(req, res);
    if (!body) return;

    if (!body.id?.trim()) {
      error(res, "Request body must include 'id' (skill id to uninstall)", 400);
      return;
    }

    const uninstallId = validateSkillId(body.id.trim(), res);
    if (!uninstallId) return;

    try {
      const workspaceDir =
        state.config.agents?.defaults?.workspace ??
        resolveDefaultAgentWorkspaceDir();
      const result = await uninstallMarketplaceSkill(workspaceDir, uninstallId);
      json(res, { ok: true, skill: result });
    } catch (err) {
      error(
        res,
        `Uninstall failed: ${err instanceof Error ? err.message : err}`,
        500,
      );
    }
    return;
  }

  // ── GET /api/skills/marketplace/config ──────────────────────────────────
  if (method === "GET" && pathname === "/api/skills/marketplace/config") {
    json(res, { keySet: Boolean(process.env.SKILLSMP_API_KEY?.trim()) });
    return;
  }

  // ── PUT /api/skills/marketplace/config ─────────────────────────────────
  if (method === "PUT" && pathname === "/api/skills/marketplace/config") {
    const body = await readJsonBody<{ apiKey?: string }>(req, res);
    if (!body) return;
    const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
    if (!apiKey) {
      error(res, "Request body must include 'apiKey'", 400);
      return;
    }
    process.env.SKILLSMP_API_KEY = apiKey;
    if (!state.config.env) state.config.env = {};
    (state.config.env as Record<string, string>).SKILLSMP_API_KEY = apiKey;
    saveMilaidyConfig(state.config);
    json(res, { ok: true, keySet: true });
    return;
  }

  // ── PUT /api/skills/:id ────────────────────────────────────────────────
  // IMPORTANT: This wildcard route MUST be after all /api/skills/<specific-path> routes
  if (method === "PUT" && pathname.startsWith("/api/skills/")) {
    const skillId = validateSkillId(
      decodeURIComponent(pathname.slice("/api/skills/".length)),
      res,
    );
    if (!skillId) return;
    const body = await readJsonBody<{ enabled?: boolean }>(req, res);
    if (!body) return;

    const skill = state.skills.find((s) => s.id === skillId);
    if (!skill) {
      error(res, `Skill "${skillId}" not found`, 404);
      return;
    }

    // Block enabling skills with unacknowledged scan findings
    if (body.enabled === true) {
      const workspaceDir =
        state.config.agents?.defaults?.workspace ??
        resolveDefaultAgentWorkspaceDir();
      const report = await loadScanReportFromDisk(
        skillId,
        workspaceDir,
        state.runtime,
      );
      if (
        report &&
        (report.status === "critical" || report.status === "warning")
      ) {
        const acks = await loadSkillAcknowledgments(state.runtime);
        const ack = acks[skillId];
        const findings = report.findings as Array<Record<string, unknown>>;
        const manifestFindings = report.manifestFindings as Array<
          Record<string, unknown>
        >;
        const totalFindings = findings.length + manifestFindings.length;
        if (!ack || ack.findingCount !== totalFindings) {
          error(
            res,
            `Skill "${skillId}" has ${totalFindings} security finding(s) that must be acknowledged first. Use POST /api/skills/${skillId}/acknowledge.`,
            409,
          );
          return;
        }
      }
    }

    if (body.enabled !== undefined) {
      skill.enabled = body.enabled;
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

    // Filter by tag — entries must contain the requested tag
    const tagFilter = url.searchParams.get("tag");
    if (tagFilter) entries = entries.filter((e) => e.tags.includes(tagFilter));

    const sinceFilter = url.searchParams.get("since");
    if (sinceFilter) {
      const sinceTs = Number(sinceFilter);
      if (!Number.isNaN(sinceTs))
        entries = entries.filter((e) => e.timestamp >= sinceTs);
    }

    const sources = [...new Set(state.logBuffer.map((e) => e.source))].sort();
    const tags = [...new Set(state.logBuffer.flatMap((e) => e.tags))].sort();
    json(res, { entries: entries.slice(-200), sources, tags });
    return;
  }

  // ── GET /api/agent/events?after=evt-123&limit=200 ───────────────────────
  if (method === "GET" && pathname === "/api/agent/events") {
    const limit = parseClampedInteger(url.searchParams.get("limit"), {
      min: 1,
      max: 1000,
      fallback: 200,
    });
    const afterEventId = url.searchParams.get("after");
    const autonomyEvents = state.eventBuffer.filter(
      (event) =>
        event.type === "agent_event" || event.type === "heartbeat_event",
    );
    let startIndex = 0;
    if (afterEventId) {
      const idx = autonomyEvents.findIndex(
        (event) => event.eventId === afterEventId,
      );
      if (idx >= 0) startIndex = idx + 1;
    }
    const events = autonomyEvents.slice(startIndex, startIndex + limit);
    const latestEventId =
      events.length > 0 ? events[events.length - 1].eventId : null;
    json(res, {
      events,
      latestEventId,
      totalBuffered: autonomyEvents.length,
      replayed: true,
    });
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

    // Resolve the extension source path (always available in the repo)
    let extensionPath: string | null = null;
    try {
      const serverDir = path.dirname(fileURLToPath(import.meta.url));
      extensionPath = path.resolve(
        serverDir,
        "..",
        "..",
        "apps",
        "chrome-extension",
      );
      if (!fs.existsSync(extensionPath)) extensionPath = null;
    } catch {
      // ignore
    }

    json(res, { relayReachable, relayPort, extensionPath });
    return;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Wallet / Inventory routes
  // ═══════════════════════════════════════════════════════════════════════

  // ── GET /api/wallet/addresses ──────────────────────────────────────────
  if (method === "GET" && pathname === "/api/wallet/addresses") {
    const addrs = getWalletAddresses();
    json(res, addrs);
    return;
  }

  // ── GET /api/wallet/balances ───────────────────────────────────────────
  if (method === "GET" && pathname === "/api/wallet/balances") {
    const addrs = getWalletAddresses();
    const alchemyKey = process.env.ALCHEMY_API_KEY;
    const heliusKey = process.env.HELIUS_API_KEY;

    const result: WalletBalancesResponse = { evm: null, solana: null };

    if (addrs.evmAddress && alchemyKey) {
      try {
        const chains = await fetchEvmBalances(addrs.evmAddress, alchemyKey);
        result.evm = { address: addrs.evmAddress, chains };
      } catch (err) {
        logger.warn(`[wallet] EVM balance fetch failed: ${err}`);
      }
    }

    if (addrs.solanaAddress && heliusKey) {
      try {
        const solData = await fetchSolanaBalances(
          addrs.solanaAddress,
          heliusKey,
        );
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
    const addrs = getWalletAddresses();
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

  // ── POST /api/wallet/import ──────────────────────────────────────────
  // Import a wallet by providing a private key + chain.
  if (method === "POST" && pathname === "/api/wallet/import") {
    const body = await readJsonBody<{ chain?: string; privateKey?: string }>(
      req,
      res,
    );
    if (!body) return;

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

    // Persist to config.env so it survives restarts
    if (!state.config.env) state.config.env = {};
    const envKey = chain === "evm" ? "EVM_PRIVATE_KEY" : "SOLANA_PRIVATE_KEY";
    (state.config.env as Record<string, string>)[envKey] =
      process.env[envKey] ?? "";

    try {
      saveMilaidyConfig(state.config);
    } catch (err) {
      logger.warn(
        `[api] Config save failed: ${err instanceof Error ? err.message : err}`,
      );
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
      (state.config.env as Record<string, string>).EVM_PRIVATE_KEY =
        result.privateKey;
      generated.push({ chain: "evm", address: result.address });
      logger.info(`[milaidy-api] Generated EVM wallet: ${result.address}`);
    }

    if (targetChain === "both" || targetChain === "solana") {
      const result = generateWalletForChain("solana");
      process.env.SOLANA_PRIVATE_KEY = result.privateKey;
      (state.config.env as Record<string, string>).SOLANA_PRIVATE_KEY =
        result.privateKey;
      generated.push({ chain: "solana", address: result.address });
      logger.info(`[milaidy-api] Generated Solana wallet: ${result.address}`);
    }

    try {
      saveMilaidyConfig(state.config);
    } catch (err) {
      logger.warn(
        `[api] Config save failed: ${err instanceof Error ? err.message : err}`,
      );
    }

    json(res, { ok: true, wallets: generated });
    return;
  }

  // ── GET /api/wallet/config ─────────────────────────────────────────────
  if (method === "GET" && pathname === "/api/wallet/config") {
    const addrs = getWalletAddresses();
    const configStatus: WalletConfigStatus = {
      alchemyKeySet: Boolean(process.env.ALCHEMY_API_KEY),
      infuraKeySet: Boolean(process.env.INFURA_API_KEY),
      ankrKeySet: Boolean(process.env.ANKR_API_KEY),
      heliusKeySet: Boolean(process.env.HELIUS_API_KEY),
      birdeyeKeySet: Boolean(process.env.BIRDEYE_API_KEY),
      evmChains: ["Ethereum", "Base", "Arbitrum", "Optimism", "Polygon"],
      evmAddress: addrs.evmAddress,
      solanaAddress: addrs.solanaAddress,
    };
    json(res, configStatus);
    return;
  }

  // ── PUT /api/wallet/config ─────────────────────────────────────────────
  if (method === "PUT" && pathname === "/api/wallet/config") {
    const body = await readJsonBody<Record<string, string>>(req, res);
    if (!body) return;
    const allowedKeys = [
      "ALCHEMY_API_KEY",
      "INFURA_API_KEY",
      "ANKR_API_KEY",
      "HELIUS_API_KEY",
      "BIRDEYE_API_KEY",
    ];

    if (!state.config.env) state.config.env = {};

    for (const key of allowedKeys) {
      const value = body[key];
      if (typeof value === "string" && value.trim()) {
        process.env[key] = value.trim();
        (state.config.env as Record<string, string>)[key] = value.trim();
      }
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
    } catch (err) {
      logger.warn(
        `[api] Config save failed: ${err instanceof Error ? err.message : err}`,
      );
    }

    json(res, { ok: true });
    return;
  }

  // ── POST /api/wallet/export ────────────────────────────────────────────
  // SECURITY: Requires explicit confirmation + a dedicated export token.
  if (method === "POST" && pathname === "/api/wallet/export") {
    const body = await readJsonBody<WalletExportRequestBody>(req, res);
    if (!body) return;

    const rejection = resolveWalletExportRejection(req, body);
    if (rejection) {
      error(res, rejection.reason, rejection.status);
      return;
    }

    const evmKey = process.env.EVM_PRIVATE_KEY ?? null;
    const solKey = process.env.SOLANA_PRIVATE_KEY ?? null;
    const addrs = getWalletAddresses();

    logger.warn("[wallet] Private keys exported via API");

    json(res, {
      evm: evmKey ? { privateKey: evmKey, address: addrs.evmAddress } : null,
      solana: solKey
        ? { privateKey: solKey, address: addrs.solanaAddress }
        : null,
    });
    return;
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  ERC-8004 Registry Routes
  // ═══════════════════════════════════════════════════════════════════════

  if (method === "GET" && pathname === "/api/registry/status") {
    if (!registryService) {
      json(res, {
        registered: false,
        tokenId: 0,
        agentName: "",
        agentEndpoint: "",
        capabilitiesHash: "",
        isActive: false,
        tokenURI: "",
        walletAddress: "",
        totalAgents: 0,
        configured: false,
      });
      return;
    }
    const status = await registryService.getStatus();
    json(res, { ...status, configured: true });
    return;
  }

  if (method === "POST" && pathname === "/api/registry/register") {
    if (!registryService) {
      error(
        res,
        "Registry service not configured. Set registry config and EVM_PRIVATE_KEY.",
        503,
      );
      return;
    }
    const body = await readJsonBody<{
      name?: string;
      endpoint?: string;
      tokenURI?: string;
    }>(req, res);
    if (!body) return;

    const agentName = body.name || state.agentName || "Milaidy Agent";
    const endpoint = body.endpoint || "";
    const tokenURI = body.tokenURI || "";

    const result = await registryService.register({
      name: agentName,
      endpoint,
      capabilitiesHash: RegistryService.defaultCapabilitiesHash(),
      tokenURI,
    });
    json(res, result);
    return;
  }

  if (method === "POST" && pathname === "/api/registry/update-uri") {
    if (!registryService) {
      error(res, "Registry service not configured.", 503);
      return;
    }
    const body = await readJsonBody<{ tokenURI?: string }>(req, res);
    if (!body || !body.tokenURI) {
      error(res, "tokenURI is required");
      return;
    }
    const txHash = await registryService.updateTokenURI(body.tokenURI);
    json(res, { ok: true, txHash });
    return;
  }

  if (method === "POST" && pathname === "/api/registry/sync") {
    if (!registryService) {
      error(res, "Registry service not configured.", 503);
      return;
    }
    const body = await readJsonBody<{
      name?: string;
      endpoint?: string;
      tokenURI?: string;
    }>(req, res);
    if (!body) return;

    const agentName = body.name || state.agentName || "Milaidy Agent";
    const endpoint = body.endpoint || "";
    const tokenURI = body.tokenURI || "";

    const txHash = await registryService.syncProfile({
      name: agentName,
      endpoint,
      capabilitiesHash: RegistryService.defaultCapabilitiesHash(),
      tokenURI,
    });
    // Refresh status after sync
    json(res, { ok: true, txHash });
    return;
  }

  if (method === "GET" && pathname === "/api/registry/config") {
    const registryConfig = state.config.registry;
    json(res, {
      configured: Boolean(registryService),
      chainId: 1,
      registryAddress: registryConfig?.registryAddress ?? null,
      collectionAddress: registryConfig?.collectionAddress ?? null,
      explorerUrl: "https://etherscan.io",
    });
    return;
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Drop / Mint Routes
  // ═══════════════════════════════════════════════════════════════════════

  if (method === "GET" && pathname === "/api/drop/status") {
    if (!dropService) {
      json(res, {
        dropEnabled: false,
        publicMintOpen: false,
        whitelistMintOpen: false,
        mintedOut: false,
        currentSupply: 0,
        maxSupply: 2138,
        shinyPrice: "0.1",
        userHasMinted: false,
      });
      return;
    }
    const status = await dropService.getStatus();
    json(res, status);
    return;
  }

  if (method === "POST" && pathname === "/api/drop/mint") {
    if (!dropService) {
      error(res, "Drop service not configured.", 503);
      return;
    }
    const body = await readJsonBody<{
      name?: string;
      endpoint?: string;
      shiny?: boolean;
    }>(req, res);
    if (!body) return;

    const agentName = body.name || state.agentName || "Milaidy Agent";
    const endpoint = body.endpoint || "";

    const result = body.shiny
      ? await dropService.mintShiny(agentName, endpoint)
      : await dropService.mint(agentName, endpoint);
    json(res, result);
    return;
  }

  if (method === "POST" && pathname === "/api/drop/mint-whitelist") {
    if (!dropService) {
      error(res, "Drop service not configured.", 503);
      return;
    }
    const body = await readJsonBody<{
      name?: string;
      endpoint?: string;
      proof?: string[];
    }>(req, res);
    if (!body || !body.proof) {
      error(res, "proof array is required");
      return;
    }

    const agentName = body.name || state.agentName || "Milaidy Agent";
    const endpoint = body.endpoint || "";
    const result = await dropService.mintWithWhitelist(
      agentName,
      endpoint,
      body.proof,
    );
    json(res, result);
    return;
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Whitelist Routes
  // ═══════════════════════════════════════════════════════════════════════

  if (method === "GET" && pathname === "/api/whitelist/status") {
    const addrs = getWalletAddresses();
    const walletAddress = addrs.evmAddress ?? "";
    const twitterVerified = walletAddress
      ? isAddressWhitelisted(walletAddress)
      : false;
    const ogCode = readOGCodeFromState();

    json(res, {
      eligible: twitterVerified,
      twitterVerified,
      ogCode: ogCode ?? null,
      walletAddress,
    });
    return;
  }

  if (method === "POST" && pathname === "/api/whitelist/twitter/message") {
    const addrs = getWalletAddresses();
    const walletAddress = addrs.evmAddress ?? "";
    if (!walletAddress) {
      error(res, "EVM wallet not configured. Complete onboarding first.");
      return;
    }
    const agentName = state.agentName || "Milaidy Agent";
    const message = generateVerificationMessage(agentName, walletAddress);
    json(res, { message, walletAddress });
    return;
  }

  if (method === "POST" && pathname === "/api/whitelist/twitter/verify") {
    const body = await readJsonBody<{ tweetUrl?: string }>(req, res);
    if (!body || !body.tweetUrl) {
      error(res, "tweetUrl is required");
      return;
    }

    const addrs = getWalletAddresses();
    const walletAddress = addrs.evmAddress ?? "";
    if (!walletAddress) {
      error(res, "EVM wallet not configured.");
      return;
    }

    const result = await verifyTweet(body.tweetUrl, walletAddress);
    if (result.verified && result.handle) {
      markAddressVerified(walletAddress, body.tweetUrl, result.handle);
    }
    json(res, result);
    return;
  }

  // ── GET /api/update/status ───────────────────────────────────────────────
  if (method === "GET" && pathname === "/api/update/status") {
    const { VERSION } = await import("../runtime/version.js");
    const {
      resolveChannel,
      checkForUpdate,
      fetchAllChannelVersions,
      CHANNEL_DIST_TAGS,
    } = await import("../services/update-checker.js");
    const { detectInstallMethod } = await import("../services/self-updater.js");
    const channel = resolveChannel(state.config.update);

    const [check, versions] = await Promise.all([
      checkForUpdate({ force: req.url?.includes("force=true") }),
      fetchAllChannelVersions(),
    ]);

    json(res, {
      currentVersion: VERSION,
      channel,
      installMethod: detectInstallMethod(),
      updateAvailable: check.updateAvailable,
      latestVersion: check.latestVersion,
      channels: {
        stable: versions.stable,
        beta: versions.beta,
        nightly: versions.nightly,
      },
      distTags: CHANNEL_DIST_TAGS,
      lastCheckAt: state.config.update?.lastCheckAt ?? null,
      error: check.error,
    });
    return;
  }

  // ── PUT /api/update/channel ────────────────────────────────────────────
  if (method === "PUT" && pathname === "/api/update/channel") {
    const body = (await readJsonBody(req, res)) as { channel?: string } | null;
    if (!body) return;
    const ch = body.channel;
    if (ch !== "stable" && ch !== "beta" && ch !== "nightly") {
      error(res, `Invalid channel "${ch}". Must be stable, beta, or nightly.`);
      return;
    }
    state.config.update = {
      ...state.config.update,
      channel: ch,
      lastCheckAt: undefined,
      lastCheckVersion: undefined,
    };
    saveMilaidyConfig(state.config);
    json(res, { channel: ch });
    return;
  }

  // ── GET /api/connectors ──────────────────────────────────────────────────
  if (method === "GET" && pathname === "/api/connectors") {
    const connectors = state.config.connectors ?? state.config.channels ?? {};
    json(res, {
      connectors: redactConfigSecrets(connectors as Record<string, unknown>),
    });
    return;
  }

  // ── POST /api/connectors ─────────────────────────────────────────────────
  if (method === "POST" && pathname === "/api/connectors") {
    const body = await readJsonBody(req, res);
    if (!body) return;
    const name = body.name;
    const config = body.config;
    if (!name || typeof name !== "string" || !name.trim()) {
      error(res, "Missing connector name", 400);
      return;
    }
    // Prevent prototype pollution via special keys
    const connectorName = name.trim();
    if (isBlockedObjectKey(connectorName)) {
      error(
        res,
        'Invalid connector name: "__proto__", "constructor", and "prototype" are reserved',
        400,
      );
      return;
    }
    if (!config || typeof config !== "object") {
      error(res, "Missing connector config", 400);
      return;
    }
    if (!state.config.connectors) state.config.connectors = {};
    state.config.connectors[connectorName] = config as ConnectorConfig;
    try {
      saveMilaidyConfig(state.config);
    } catch {
      /* test envs */
    }
    json(res, {
      connectors: redactConfigSecrets(
        (state.config.connectors ?? {}) as Record<string, unknown>,
      ),
    });
    return;
  }

  // ── DELETE /api/connectors/:name ─────────────────────────────────────────
  if (method === "DELETE" && pathname.startsWith("/api/connectors/")) {
    const name = decodeURIComponent(pathname.slice("/api/connectors/".length));
    if (!name || isBlockedObjectKey(name)) {
      error(res, "Missing or invalid connector name", 400);
      return;
    }
    if (
      state.config.connectors &&
      Object.hasOwn(state.config.connectors, name)
    ) {
      delete state.config.connectors[name];
    }
    // Also remove from legacy channels key
    if (state.config.channels && Object.hasOwn(state.config.channels, name)) {
      delete state.config.channels[name];
    }
    try {
      saveMilaidyConfig(state.config);
    } catch {
      /* test envs */
    }
    json(res, {
      connectors: redactConfigSecrets(
        (state.config.connectors ?? {}) as Record<string, unknown>,
      ),
    });
    return;
  }

  // ── POST /api/restart ───────────────────────────────────────────────────
  if (method === "POST" && pathname === "/api/restart") {
    json(res, { ok: true, message: "Restarting..." });
    setTimeout(() => process.exit(0), 1000);
    return;
  }

  // ── GET /api/config/schema ───────────────────────────────────────────────
  if (method === "GET" && pathname === "/api/config/schema") {
    const { buildConfigSchema } = await import("../config/schema.js");
    const result = buildConfigSchema();
    json(res, result);
    return;
  }

  // ── GET /api/config ──────────────────────────────────────────────────────
  if (method === "GET" && pathname === "/api/config") {
    json(res, redactConfigSecrets(state.config));
    return;
  }

  // ── PUT /api/config ─────────────────────────────────────────────────────
  if (method === "PUT" && pathname === "/api/config") {
    const body = await readJsonBody(req, res);
    if (!body) return;

    // --- Security: validate and safely merge config updates ----------------

    // Only accept known top-level keys from MilaidyConfig.
    // Unknown or dangerous keys are silently dropped.
    const ALLOWED_TOP_KEYS = new Set([
      "meta",
      "auth",
      "env",
      "wizard",
      "diagnostics",
      "logging",
      "update",
      "browser",
      "ui",
      "skills",
      "plugins",
      "models",
      "nodeHost",
      "agents",
      "tools",
      "bindings",
      "broadcast",
      "audio",
      "messages",
      "commands",
      "approvals",
      "session",
      "web",
      "channels",
      "cron",
      "hooks",
      "discovery",
      "talk",
      "gateway",
      "memory",
      "database",
      "cloud",
      "x402",
      "mcp",
      "features",
    ]);

    // Keys that could enable prototype pollution.
    /**
     * Deep-merge `src` into `target`, only touching keys present in `src`.
     * Prevents prototype pollution by rejecting dangerous key names at every
     * level.  Performs a recursive merge for plain objects so that partial
     * updates don't wipe sibling keys.
     */
    function safeMerge(
      target: Record<string, unknown>,
      src: Record<string, unknown>,
    ): void {
      for (const key of Object.keys(src)) {
        if (isBlockedObjectKey(key)) continue;
        const srcVal = src[key];
        const tgtVal = target[key];
        if (
          srcVal !== null &&
          typeof srcVal === "object" &&
          !Array.isArray(srcVal) &&
          tgtVal !== null &&
          typeof tgtVal === "object" &&
          !Array.isArray(tgtVal)
        ) {
          safeMerge(
            tgtVal as Record<string, unknown>,
            srcVal as Record<string, unknown>,
          );
        } else {
          target[key] = srcVal;
        }
      }
    }

    // Filter to allowed top-level keys, then deep-merge.
    const filtered: Record<string, unknown> = {};
    for (const key of Object.keys(body)) {
      if (ALLOWED_TOP_KEYS.has(key) && !isBlockedObjectKey(key)) {
        filtered[key] = body[key];
      }
    }

    // Security: keep auth/step-up secrets out of API-driven config writes so
    // secret rotation remains an out-of-band operation.
    if (
      filtered.env &&
      typeof filtered.env === "object" &&
      !Array.isArray(filtered.env)
    ) {
      const envPatch = filtered.env as Record<string, unknown>;
      // Defense-in-depth: strip step-up secrets from persisted config before
      // merge, even though BLOCKED_ENV_KEYS also blocks them during process.env
      // sync below. Keeping both guards prevents accidental persistence if one
      // path changes in future refactors.
      delete envPatch.MILAIDY_API_TOKEN;
      delete envPatch.MILAIDY_WALLET_EXPORT_TOKEN;
      if (
        envPatch.vars &&
        typeof envPatch.vars === "object" &&
        !Array.isArray(envPatch.vars)
      ) {
        delete (envPatch.vars as Record<string, unknown>).MILAIDY_API_TOKEN;
        delete (envPatch.vars as Record<string, unknown>)
          .MILAIDY_WALLET_EXPORT_TOKEN;
      }
    }

    safeMerge(state.config as Record<string, unknown>, filtered);

    // If the client updated env vars, synchronise them into process.env so
    // subsequent hot-restarts see the latest values (loadMilaidyConfig()
    // only fills missing env vars and does not override existing ones).
    if (
      filtered.env &&
      typeof filtered.env === "object" &&
      !Array.isArray(filtered.env)
    ) {
      const envPatch = filtered.env as Record<string, unknown>;

      // 1) env.vars.* (preferred)
      const vars = envPatch.vars;
      if (vars && typeof vars === "object" && !Array.isArray(vars)) {
        for (const [k, v] of Object.entries(vars as Record<string, unknown>)) {
          if (BLOCKED_ENV_KEYS.has(k.toUpperCase())) continue;
          const str = typeof v === "string" ? v : "";
          if (str.trim()) {
            process.env[k] = str;
          } else {
            delete process.env[k];
          }
        }
      }

      // 2) Direct env.* string keys (legacy)
      for (const [k, v] of Object.entries(envPatch)) {
        if (k === "vars" || k === "shellEnv") continue;
        if (BLOCKED_ENV_KEYS.has(k.toUpperCase())) continue;
        if (typeof v !== "string") continue;
        if (v.trim()) process.env[k] = v;
        else delete process.env[k];
      }

      // Keep config clean: drop empty env.vars entries so we don't persist
      // null/empty-string tombstones forever.
      const cfgEnv = (state.config as Record<string, unknown>).env;
      if (cfgEnv && typeof cfgEnv === "object" && !Array.isArray(cfgEnv)) {
        const cfgVars = (cfgEnv as Record<string, unknown>).vars;
        if (cfgVars && typeof cfgVars === "object" && !Array.isArray(cfgVars)) {
          for (const [k, v] of Object.entries(
            cfgVars as Record<string, unknown>,
          )) {
            if (typeof v !== "string" || !v.trim()) {
              delete (cfgVars as Record<string, unknown>)[k];
            }
          }
        }
      }
    }

    try {
      saveMilaidyConfig(state.config);
    } catch (err) {
      logger.warn(
        `[api] Config save failed: ${err instanceof Error ? err.message : err}`,
      );
    }
    json(res, redactConfigSecrets(state.config));
    return;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Permission routes (/api/permissions/*)
  // System permissions for computer use, microphone, camera, etc.
  // ═══════════════════════════════════════════════════════════════════════

  // ── GET /api/permissions ───────────────────────────────────────────────
  // Returns all system permission states
  if (method === "GET" && pathname === "/api/permissions") {
    const permStates = state.permissionStates ?? {};
    json(res, {
      permissions: permStates,
      platform: process.platform,
      shellEnabled: state.shellEnabled ?? true,
    });
    return;
  }

  // ── GET /api/permissions/shell ─────────────────────────────────────────
  // Return shell toggle status in a stable shape for UI clients.
  if (method === "GET" && pathname === "/api/permissions/shell") {
    const enabled = state.shellEnabled ?? true;
    if (!state.permissionStates) {
      state.permissionStates = {};
    }
    const shellState = state.permissionStates.shell;
    const permission = {
      id: "shell",
      status: enabled ? "granted" : "denied",
      lastChecked: shellState?.lastChecked ?? Date.now(),
      canRequest: false,
    };
    state.permissionStates.shell = permission;

    // Keep the legacy top-level permission fields for compatibility with
    // callers that previously treated /api/permissions/shell as a generic
    // /api/permissions/:id response.
    json(res, {
      enabled,
      ...permission,
      permission,
    });
    return;
  }

  // ── GET /api/permissions/:id ───────────────────────────────────────────
  // Returns a single permission state
  if (method === "GET" && pathname.startsWith("/api/permissions/")) {
    const permId = pathname.slice("/api/permissions/".length);
    if (!permId || permId.includes("/")) {
      error(res, "Invalid permission ID", 400);
      return;
    }
    const permStates = state.permissionStates ?? {};
    const permState = permStates[permId];
    if (!permState) {
      json(res, {
        id: permId,
        status: "not-applicable",
        lastChecked: Date.now(),
        canRequest: false,
      });
      return;
    }
    json(res, permState);
    return;
  }

  // ── POST /api/permissions/refresh ──────────────────────────────────────
  // Force refresh all permission states (clears cache)
  if (method === "POST" && pathname === "/api/permissions/refresh") {
    // Signal to the client that they should refresh permissions via IPC
    // The actual permission checking happens in the Electron main process
    json(res, {
      message: "Permission refresh requested",
      action: "ipc:permissions:refresh",
    });
    return;
  }

  // ── POST /api/permissions/:id/request ──────────────────────────────────
  // Request a specific permission (triggers system prompt or opens settings)
  if (
    method === "POST" &&
    pathname.match(/^\/api\/permissions\/[^/]+\/request$/)
  ) {
    const permId = pathname.split("/")[3];
    json(res, {
      message: `Permission request for ${permId}`,
      action: `ipc:permissions:request:${permId}`,
    });
    return;
  }

  // ── POST /api/permissions/:id/open-settings ────────────────────────────
  // Open system settings for a specific permission
  if (
    method === "POST" &&
    pathname.match(/^\/api\/permissions\/[^/]+\/open-settings$/)
  ) {
    const permId = pathname.split("/")[3];
    json(res, {
      message: `Opening settings for ${permId}`,
      action: `ipc:permissions:openSettings:${permId}`,
    });
    return;
  }

  // ── PUT /api/permissions/shell ─────────────────────────────────────────
  // Toggle shell access enabled/disabled
  if (method === "PUT" && pathname === "/api/permissions/shell") {
    const body = await readJsonBody(req, res);
    if (!body) return;
    const enabled = body.enabled === true;
    state.shellEnabled = enabled;

    // Update permission state
    if (!state.permissionStates) {
      state.permissionStates = {};
    }
    state.permissionStates.shell = {
      id: "shell",
      status: enabled ? "granted" : "denied",
      lastChecked: Date.now(),
      canRequest: false,
    };

    // Save to config
    if (!state.config.features) {
      state.config.features = {};
    }
    state.config.features.shellEnabled = enabled;
    saveMilaidyConfig(state.config);

    // If a runtime is active, restart so plugin loading honors the new
    // shellEnabled flag and shell tools are loaded/unloaded consistently.
    if (state.runtime && ctx?.onRestart) {
      scheduleRuntimeRestart(
        `Shell access ${enabled ? "enabled" : "disabled"}`,
      );
    }

    json(res, {
      shellEnabled: enabled,
      permission: state.permissionStates.shell,
    });
    return;
  }

  // ── PUT /api/permissions/state ─────────────────────────────────────────
  // Update permission states from Electron (called by renderer after IPC)
  if (method === "PUT" && pathname === "/api/permissions/state") {
    const body = await readJsonBody(req, res);
    if (!body) return;
    if (body.permissions && typeof body.permissions === "object") {
      state.permissionStates = body.permissions as Record<
        string,
        {
          id: string;
          status: string;
          lastChecked: number;
          canRequest: boolean;
        }
      >;
    }
    json(res, { updated: true, permissions: state.permissionStates });
    return;
  }

  // ── Cloud routes (/api/cloud/*) ─────────────────────────────────────────
  if (pathname.startsWith("/api/cloud/")) {
    const cloudState: CloudRouteState = {
      config: state.config,
      cloudManager: state.cloudManager,
      runtime: state.runtime,
    };
    const handled = await handleCloudRoute(
      req,
      res,
      pathname,
      method,
      cloudState,
    );
    if (handled) return;
  }

  // ── Sandbox routes (/api/sandbox/*) ────────────────────────────────────
  if (pathname.startsWith("/api/sandbox")) {
    const handled = await handleSandboxRoute(req, res, pathname, method, {
      sandboxManager: state.sandboxManager,
    });
    if (handled) return;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Conversation routes (/api/conversations/*)
  // ═══════════════════════════════════════════════════════════════════════

  const ensureAdminEntityId = (): UUID => {
    if (state.adminEntityId) {
      return state.adminEntityId;
    }
    const configured = state.config.agents?.defaults?.adminEntityId?.trim();
    const nextAdminEntityId =
      configured && isUuidLike(configured)
        ? configured
        : (stringToUuid(`${state.agentName}-admin-entity`) as UUID);
    if (configured && !isUuidLike(configured)) {
      logger.warn(
        `[milaidy-api] Invalid agents.defaults.adminEntityId "${configured}", using deterministic fallback`,
      );
    }
    state.adminEntityId = nextAdminEntityId;
    state.chatUserId = state.adminEntityId;
    return nextAdminEntityId;
  };

  // Ensure ownership + admin role metadata contract on the world.
  const ensureWorldOwnershipAndRoles = async (
    runtime: AgentRuntime,
    worldId: UUID,
    ownerId: UUID,
  ): Promise<void> => {
    const world = await runtime.getWorld(worldId);
    if (!world) return;
    let needsUpdate = false;
    if (!world.metadata) {
      world.metadata = {};
      needsUpdate = true;
    }
    if (
      !world.metadata.ownership ||
      typeof world.metadata.ownership !== "object" ||
      (world.metadata.ownership as { ownerId?: string }).ownerId !== ownerId
    ) {
      world.metadata.ownership = { ownerId };
      needsUpdate = true;
    }
    const metadataWithRoles = world.metadata as {
      roles?: Record<string, string>;
    };
    const roles = metadataWithRoles.roles ?? {};
    if (roles[ownerId] !== "OWNER") {
      roles[ownerId] = "OWNER";
      metadataWithRoles.roles = roles;
      needsUpdate = true;
    }
    if (needsUpdate) {
      await runtime.updateWorld(world);
    }
  };

  // Helper: ensure the room for a conversation is set up.
  // Also ensures the world has ownership metadata so the settings provider
  // can find it via findWorldsForOwner during onboarding.
  const ensureConversationRoom = async (
    conv: ConversationMeta,
  ): Promise<void> => {
    if (!state.runtime) return;
    const runtime = state.runtime;
    const agentName = runtime.character.name ?? "Milaidy";
    const userId = ensureAdminEntityId();
    const worldId = stringToUuid(`${agentName}-web-chat-world`);
    const messageServerId = stringToUuid(`${agentName}-web-server`) as UUID;
    await runtime.ensureConnection({
      entityId: userId,
      roomId: conv.roomId,
      worldId,
      userName: "User",
      source: "client_chat",
      channelId: `web-conv-${conv.id}`,
      type: ChannelType.DM,
      messageServerId,
      metadata: { ownership: { ownerId: userId } },
    });
    await ensureWorldOwnershipAndRoles(runtime, worldId as UUID, userId);
  };

  const syncConversationRoomTitle = async (
    conv: ConversationMeta,
  ): Promise<void> => {
    try {
      await persistConversationRoomTitle(state.runtime, conv);
    } catch (err) {
      logger.debug(
        `[conversations] Failed to persist room title for ${conv.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  };

  const ensureLegacyChatConnection = async (
    runtime: AgentRuntime,
    agentName: string,
  ): Promise<void> => {
    const userId = ensureAdminEntityId();
    if (!state.chatRoomId) {
      state.chatRoomId = stringToUuid(`${agentName}-web-chat-room`);
    }
    state.chatUserId = userId;

    const roomId = state.chatRoomId;
    const worldId = stringToUuid(`${agentName}-web-chat-world`) as UUID;
    const messageServerId = stringToUuid(`${agentName}-web-server`) as UUID;
    const target = { userId, roomId, worldId };

    while (true) {
      const ready = state.chatConnectionReady;
      if (
        ready &&
        ready.userId === target.userId &&
        ready.roomId === target.roomId &&
        ready.worldId === target.worldId
      ) {
        return;
      }

      if (!state.chatConnectionPromise) {
        state.chatConnectionPromise = (async () => {
          await runtime.ensureConnection({
            entityId: target.userId,
            roomId: target.roomId,
            worldId: target.worldId,
            userName: "User",
            source: "client_chat",
            channelId: `${agentName}-web-chat`,
            type: ChannelType.DM,
            messageServerId,
            metadata: { ownership: { ownerId: target.userId } },
          });
          await ensureWorldOwnershipAndRoles(
            runtime,
            target.worldId,
            target.userId,
          );
          state.chatConnectionReady = target;
        })().finally(() => {
          state.chatConnectionPromise = null;
        });
      }

      await state.chatConnectionPromise;
    }
  };

  const ensureCompatChatConnection = async (
    runtime: AgentRuntime,
    agentName: string,
    channelIdPrefix: string,
    roomKey: string,
  ): Promise<{ userId: UUID; roomId: UUID; worldId: UUID }> => {
    const userId = ensureAdminEntityId();
    const roomId = stringToUuid(
      `${agentName}-${channelIdPrefix}-room-${roomKey}`,
    ) as UUID;
    const worldId = stringToUuid(`${agentName}-web-chat-world`) as UUID;
    const messageServerId = stringToUuid(`${agentName}-web-server`) as UUID;

    await runtime.ensureConnection({
      entityId: userId,
      roomId,
      worldId,
      userName: "User",
      source: "client_chat",
      channelId: `${channelIdPrefix}-${roomKey}`,
      type: ChannelType.DM,
      messageServerId,
      metadata: { ownership: { ownerId: userId } },
    });
    await ensureWorldOwnershipAndRoles(runtime, worldId, userId);

    return { userId, roomId, worldId };
  };

  // -------------------------------------------------------------------------
  // OpenAI / Anthropic compatibility endpoints
  // -------------------------------------------------------------------------

  // ── GET /v1/models (OpenAI compatible) ─────────────────────────────────
  if (method === "GET" && pathname === "/v1/models") {
    const created = Math.floor(Date.now() / 1000);
    const ids = new Set<string>();
    ids.add("milaidy");
    if (state.agentName?.trim()) ids.add(state.agentName.trim());
    if (state.runtime?.character.name?.trim())
      ids.add(state.runtime.character.name.trim());

    json(res, {
      object: "list",
      data: Array.from(ids).map((id) => ({
        id,
        object: "model",
        created,
        owned_by: "milaidy",
      })),
    });
    return;
  }

  // ── GET /v1/models/:id (OpenAI compatible) ─────────────────────────────
  if (method === "GET" && /^\/v1\/models\/[^/]+$/.test(pathname)) {
    const created = Math.floor(Date.now() / 1000);
    const raw = pathname.split("/")[3] ?? "";
    const decoded = decodePathComponent(raw, res, "model id");
    if (!decoded) return;
    const id = decoded.trim();
    if (!id) {
      json(
        res,
        {
          error: {
            message: "Model id is required",
            type: "invalid_request_error",
          },
        },
        400,
      );
      return;
    }
    json(res, { id, object: "model", created, owned_by: "milaidy" });
    return;
  }

  // ── POST /v1/chat/completions (OpenAI compatible) ──────────────────────
  if (method === "POST" && pathname === "/v1/chat/completions") {
    const body = await readJsonBody<Record<string, unknown>>(req, res);
    if (!body) return;
    if (hasBlockedObjectKeyDeep(body)) {
      json(
        res,
        {
          error: {
            message: "Request body contains a blocked object key",
            type: "invalid_request_error",
          },
        },
        400,
      );
      return;
    }
    const safeBody = cloneWithoutBlockedObjectKeys(body);

    const extracted = extractOpenAiSystemAndLastUser(safeBody.messages);
    if (!extracted) {
      json(
        res,
        {
          error: {
            message:
              "messages must be an array containing at least one user message",
            type: "invalid_request_error",
          },
        },
        400,
      );
      return;
    }

    const roomKey = resolveCompatRoomKey(safeBody).slice(0, 120);
    const wantsStream =
      safeBody.stream === true ||
      (req.headers.accept ?? "").includes("text/event-stream");
    const requestedModel =
      typeof safeBody.model === "string" && safeBody.model.trim()
        ? safeBody.model.trim()
        : null;

    const mode: ChatMode = "power";
    const prompt = extracted.system
      ? `${extracted.system}\n\n${extracted.user}`.trim()
      : extracted.user;

    const proxy = state.cloudManager?.getProxy();
    const created = Math.floor(Date.now() / 1000);
    const id = `chatcmpl-${crypto.randomUUID()}`;
    const model =
      requestedModel ?? proxy?.agentName ?? state.agentName ?? "milaidy";

    if (wantsStream) {
      initSse(res);
      let aborted = false;
      req.on("close", () => {
        aborted = true;
      });

      const sendChunk = (
        delta: Record<string, unknown>,
        finishReason: string | null,
      ) => {
        writeSseData(
          res,
          JSON.stringify({
            id,
            object: "chat.completion.chunk",
            created,
            model,
            choices: [
              {
                index: 0,
                delta,
                finish_reason: finishReason,
              },
            ],
          }),
        );
      };

      try {
        if (!proxy && !state.runtime) {
          writeSseData(
            res,
            JSON.stringify({
              error: {
                message: "Agent is not running",
                type: "service_unavailable",
              },
            }),
          );
          writeSseData(res, "[DONE]");
          return;
        }

        sendChunk({ role: "assistant" }, null);

        let fullText = "";

        if (proxy) {
          for await (const chunk of proxy.handleChatMessageStream(
            prompt,
            "openai-compat",
            mode,
          )) {
            if (aborted) throw new Error("client_disconnected");
            fullText += chunk;
            if (chunk) sendChunk({ content: chunk }, null);
          }
        } else {
          const runtime = state.runtime;
          if (!runtime) throw new Error("Agent is not running");
          const agentName = runtime.character.name ?? "Milaidy";
          const { userId, roomId } = await ensureCompatChatConnection(
            runtime,
            agentName,
            "openai-compat",
            roomKey,
          );

          const message = createMessageMemory({
            id: crypto.randomUUID() as UUID,
            entityId: userId,
            roomId,
            content: {
              text: prompt,
              mode,
              simple: false,
              source: "compat_openai",
              channelType: ChannelType.DM,
            },
          });

          await generateChatResponse(runtime, message, state.agentName, {
            isAborted: () => aborted,
            onChunk: (chunk) => {
              fullText += chunk;
              if (chunk) sendChunk({ content: chunk }, null);
            },
            resolveNoResponseText: () =>
              resolveNoResponseFallback(state.logBuffer),
          });
        }

        const resolved = normalizeChatResponseText(fullText, state.logBuffer);
        if (
          (fullText.trim().length === 0 || isNoResponsePlaceholder(fullText)) &&
          resolved.trim()
        ) {
          // Ensure clients receive a non-empty completion even if the model returned "(no response)".
          sendChunk({ content: resolved }, null);
        }

        sendChunk({}, "stop");
        writeSseData(res, "[DONE]");
      } catch (err) {
        if (!aborted) {
          writeSseData(
            res,
            JSON.stringify({
              error: {
                message: getErrorMessage(err),
                type: "server_error",
              },
            }),
          );
          writeSseData(res, "[DONE]");
        }
      } finally {
        res.end();
      }
      return;
    }

    // Non-streaming
    try {
      let responseText: string;

      if (proxy) {
        responseText = await proxy.handleChatMessage(
          prompt,
          "openai-compat",
          mode,
        );
      } else {
        if (!state.runtime) {
          json(
            res,
            {
              error: {
                message: "Agent is not running",
                type: "service_unavailable",
              },
            },
            503,
          );
          return;
        }
        const runtime = state.runtime;
        const agentName = runtime.character.name ?? "Milaidy";
        const { userId, roomId } = await ensureCompatChatConnection(
          runtime,
          agentName,
          "openai-compat",
          roomKey,
        );
        const message = createMessageMemory({
          id: crypto.randomUUID() as UUID,
          entityId: userId,
          roomId,
          content: {
            text: prompt,
            mode,
            simple: false,
            source: "compat_openai",
            channelType: ChannelType.DM,
          },
        });
        const result = await generateChatResponse(
          runtime,
          message,
          state.agentName,
          {
            resolveNoResponseText: () =>
              resolveNoResponseFallback(state.logBuffer),
          },
        );
        responseText = result.text;
      }

      const resolvedText = normalizeChatResponseText(
        responseText,
        state.logBuffer,
      );
      json(res, {
        id,
        object: "chat.completion",
        created,
        model,
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: resolvedText },
            finish_reason: "stop",
          },
        ],
      });
    } catch (err) {
      json(
        res,
        { error: { message: getErrorMessage(err), type: "server_error" } },
        500,
      );
    }
    return;
  }

  // ── POST /v1/messages (Anthropic compatible) ───────────────────────────
  if (method === "POST" && pathname === "/v1/messages") {
    const body = await readJsonBody<Record<string, unknown>>(req, res);
    if (!body) return;
    if (hasBlockedObjectKeyDeep(body)) {
      json(
        res,
        {
          error: {
            type: "invalid_request_error",
            message: "Request body contains a blocked object key",
          },
        },
        400,
      );
      return;
    }
    const safeBody = cloneWithoutBlockedObjectKeys(body);

    const extracted = extractAnthropicSystemAndLastUser({
      system: safeBody.system,
      messages: safeBody.messages,
    });
    if (!extracted) {
      json(
        res,
        {
          error: {
            type: "invalid_request_error",
            message:
              "messages must be an array containing at least one user message",
          },
        },
        400,
      );
      return;
    }

    const roomKey = resolveCompatRoomKey(safeBody).slice(0, 120);
    const wantsStream =
      safeBody.stream === true ||
      (req.headers.accept ?? "").includes("text/event-stream");
    const requestedModel =
      typeof safeBody.model === "string" && safeBody.model.trim()
        ? safeBody.model.trim()
        : null;

    const mode: ChatMode = "power";
    const prompt = extracted.system
      ? `${extracted.system}\n\n${extracted.user}`.trim()
      : extracted.user;

    const proxy = state.cloudManager?.getProxy();
    const id = `msg_${crypto.randomUUID().replace(/-/g, "")}`;
    const model =
      requestedModel ?? proxy?.agentName ?? state.agentName ?? "milaidy";

    if (wantsStream) {
      initSse(res);
      let aborted = false;
      req.on("close", () => {
        aborted = true;
      });

      try {
        if (!proxy && !state.runtime) {
          writeSseJson(
            res,
            {
              type: "error",
              error: {
                type: "service_unavailable",
                message: "Agent is not running",
              },
            },
            "error",
          );
          return;
        }

        writeSseJson(
          res,
          {
            type: "message_start",
            message: {
              id,
              type: "message",
              role: "assistant",
              model,
              content: [],
              stop_reason: null,
              stop_sequence: null,
              usage: { input_tokens: 0, output_tokens: 0 },
            },
          },
          "message_start",
        );
        writeSseJson(
          res,
          {
            type: "content_block_start",
            index: 0,
            content_block: { type: "text", text: "" },
          },
          "content_block_start",
        );

        let fullText = "";

        const onDelta = (chunk: string) => {
          if (!chunk) return;
          fullText += chunk;
          writeSseJson(
            res,
            {
              type: "content_block_delta",
              index: 0,
              delta: { type: "text_delta", text: chunk },
            },
            "content_block_delta",
          );
        };

        if (proxy) {
          for await (const chunk of proxy.handleChatMessageStream(
            prompt,
            "anthropic-compat",
            mode,
          )) {
            if (aborted) throw new Error("client_disconnected");
            onDelta(chunk);
          }
        } else {
          const runtime = state.runtime;
          if (!runtime) throw new Error("Agent is not running");
          const agentName = runtime.character.name ?? "Milaidy";
          const { userId, roomId } = await ensureCompatChatConnection(
            runtime,
            agentName,
            "anthropic-compat",
            roomKey,
          );

          const message = createMessageMemory({
            id: crypto.randomUUID() as UUID,
            entityId: userId,
            roomId,
            content: {
              text: prompt,
              mode,
              simple: false,
              source: "compat_anthropic",
              channelType: ChannelType.DM,
            },
          });

          await generateChatResponse(runtime, message, state.agentName, {
            isAborted: () => aborted,
            onChunk: onDelta,
            resolveNoResponseText: () =>
              resolveNoResponseFallback(state.logBuffer),
          });
        }

        const resolved = normalizeChatResponseText(fullText, state.logBuffer);
        if (
          (fullText.trim().length === 0 || isNoResponsePlaceholder(fullText)) &&
          resolved.trim()
        ) {
          onDelta(resolved);
        }

        writeSseJson(
          res,
          { type: "content_block_stop", index: 0 },
          "content_block_stop",
        );
        writeSseJson(
          res,
          {
            type: "message_delta",
            delta: { stop_reason: "end_turn", stop_sequence: null },
            usage: { output_tokens: 0 },
          },
          "message_delta",
        );
        writeSseJson(res, { type: "message_stop" }, "message_stop");
      } catch (err) {
        if (!aborted) {
          writeSseJson(
            res,
            {
              type: "error",
              error: { type: "server_error", message: getErrorMessage(err) },
            },
            "error",
          );
        }
      } finally {
        res.end();
      }
      return;
    }

    // Non-streaming
    try {
      let responseText: string;

      if (proxy) {
        responseText = await proxy.handleChatMessage(
          prompt,
          "anthropic-compat",
          mode,
        );
      } else {
        if (!state.runtime) {
          json(
            res,
            {
              error: {
                type: "service_unavailable",
                message: "Agent is not running",
              },
            },
            503,
          );
          return;
        }
        const runtime = state.runtime;
        const agentName = runtime.character.name ?? "Milaidy";
        const { userId, roomId } = await ensureCompatChatConnection(
          runtime,
          agentName,
          "anthropic-compat",
          roomKey,
        );
        const message = createMessageMemory({
          id: crypto.randomUUID() as UUID,
          entityId: userId,
          roomId,
          content: {
            text: prompt,
            mode,
            simple: false,
            source: "compat_anthropic",
            channelType: ChannelType.DM,
          },
        });
        const result = await generateChatResponse(
          runtime,
          message,
          state.agentName,
          {
            resolveNoResponseText: () =>
              resolveNoResponseFallback(state.logBuffer),
          },
        );
        responseText = result.text;
      }

      const resolvedText = normalizeChatResponseText(
        responseText,
        state.logBuffer,
      );
      json(res, {
        id,
        type: "message",
        role: "assistant",
        model,
        content: [{ type: "text", text: resolvedText }],
        stop_reason: "end_turn",
        stop_sequence: null,
        usage: { input_tokens: 0, output_tokens: 0 },
      });
    } catch (err) {
      json(
        res,
        { error: { type: "server_error", message: getErrorMessage(err) } },
        500,
      );
    }
    return;
  }

  // ── GET /api/conversations ──────────────────────────────────────────
  if (method === "GET" && pathname === "/api/conversations") {
    const convos = Array.from(state.conversations.values()).sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
    json(res, { conversations: convos });
    return;
  }

  // ── POST /api/conversations ─────────────────────────────────────────
  if (method === "POST" && pathname === "/api/conversations") {
    const body = await readJsonBody<{ title?: string }>(req, res);
    if (!body) return;
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const roomId = stringToUuid(`web-conv-${id}`);
    const conv: ConversationMeta = {
      id,
      title: body.title?.trim() || "New Chat",
      roomId,
      createdAt: now,
      updatedAt: now,
    };
    state.conversations.set(id, conv);
    if (state.runtime) {
      await ensureConversationRoom(conv);
      await syncConversationRoomTitle(conv);
    }
    json(res, { conversation: conv });
    return;
  }

  // ── GET /api/conversations/:id/messages ─────────────────────────────
  if (
    method === "GET" &&
    /^\/api\/conversations\/[^/]+\/messages$/.test(pathname)
  ) {
    const convId = decodeURIComponent(pathname.split("/")[3]);
    const conv = state.conversations.get(convId);
    if (!conv) {
      error(res, "Conversation not found", 404);
      return;
    }
    if (!state.runtime || state.agentState !== "running") {
      json(res, { messages: [] });
      return;
    }
    try {
      const memories = await state.runtime.getMemories({
        roomId: conv.roomId,
        tableName: "messages",
        count: 200,
      });
      // Sort by createdAt ascending
      memories.sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
      const agentId = state.runtime.agentId;
      const messages = memories.map((m) => {
        const contentSource = (m.content as Record<string, unknown>)?.source;
        return {
          id: m.id ?? "",
          role: m.entityId === agentId ? "assistant" : "user",
          text: (m.content as { text?: string })?.text ?? "",
          timestamp: m.createdAt ?? 0,
          source:
            typeof contentSource === "string" && contentSource !== "client_chat"
              ? contentSource
              : undefined,
        };
      });
      json(res, { messages });
    } catch (err) {
      logger.warn(
        `[conversations] Failed to fetch messages: ${err instanceof Error ? err.message : String(err)}`,
      );
      json(res, { error: "Failed to fetch messages" }, 500);
    }
    return;
  }

  // ── POST /api/conversations/:id/messages/stream ─────────────────────
  if (
    method === "POST" &&
    /^\/api\/conversations\/[^/]+\/messages\/stream$/.test(pathname)
  ) {
    const convId = decodeURIComponent(pathname.split("/")[3]);
    const conv = state.conversations.get(convId);
    if (!conv) {
      error(res, "Conversation not found", 404);
      return;
    }

    const body = await readJsonBody<{ text?: string; mode?: string }>(req, res);
    if (!body) return;
    if (!body.text?.trim()) {
      error(res, "text is required");
      return;
    }
    if (body.mode && body.mode !== "simple" && body.mode !== "power") {
      error(res, "mode must be 'simple' or 'power'", 400);
      return;
    }
    const mode: ChatMode = body.mode === "simple" ? "simple" : "power";
    const prompt = body.text.trim();

    // Cloud proxy path
    const proxy = state.cloudManager?.getProxy();
    if (proxy) {
      initSse(res);
      let fullText = "";
      try {
        for await (const chunk of proxy.handleChatMessageStream(
          prompt,
          conv.roomId,
          mode,
        )) {
          fullText += chunk;
          writeSse(res, { type: "token", text: chunk });
        }

        const resolvedText = normalizeChatResponseText(
          fullText,
          state.logBuffer,
        );
        conv.updatedAt = new Date().toISOString();
        writeSse(res, {
          type: "done",
          fullText: resolvedText,
          agentName: proxy.agentName,
        });
      } catch (err) {
        const creditReply = getInsufficientCreditsReplyFromError(err);
        if (creditReply) {
          conv.updatedAt = new Date().toISOString();
          writeSse(res, {
            type: "done",
            fullText: creditReply,
            agentName: proxy.agentName,
          });
        } else {
          writeSse(res, {
            type: "error",
            message: getErrorMessage(err),
          });
        }
      } finally {
        res.end();
      }
      return;
    }

    if (!state.runtime) {
      error(res, "Agent is not running", 503);
      return;
    }

    initSse(res);
    let aborted = false;
    req.on("close", () => {
      aborted = true;
    });

    try {
      const runtime = state.runtime;
      const userId = ensureAdminEntityId();
      await ensureConversationRoom(conv);

      const message = createMessageMemory({
        id: crypto.randomUUID() as UUID,
        entityId: userId,
        roomId: conv.roomId,
        content: {
          text: prompt,
          mode,
          simple: mode === "simple",
          source: "client_chat",
          channelType: ChannelType.DM,
        },
      });

      const result = await generateChatResponse(
        runtime,
        message,
        state.agentName,
        {
          isAborted: () => aborted,
          onChunk: (chunk) => {
            writeSse(res, { type: "token", text: chunk });
          },
          resolveNoResponseText: () =>
            resolveNoResponseFallback(state.logBuffer),
        },
      );

      if (!aborted) {
        conv.updatedAt = new Date().toISOString();
        writeSse(res, {
          type: "done",
          fullText: result.text,
          agentName: result.agentName,
        });
      }
    } catch (err) {
      if (!aborted) {
        const creditReply = getInsufficientCreditsReplyFromError(err);
        if (creditReply) {
          conv.updatedAt = new Date().toISOString();
          writeSse(res, {
            type: "done",
            fullText: creditReply,
            agentName: state.agentName,
          });
        } else {
          writeSse(res, {
            type: "error",
            message: getErrorMessage(err),
          });
        }
      }
    } finally {
      res.end();
    }
    return;
  }

  // ── POST /api/conversations/:id/messages ────────────────────────────
  if (
    method === "POST" &&
    /^\/api\/conversations\/[^/]+\/messages$/.test(pathname)
  ) {
    const convId = decodeURIComponent(pathname.split("/")[3]);
    const conv = state.conversations.get(convId);
    if (!conv) {
      error(res, "Conversation not found", 404);
      return;
    }
    const body = await readJsonBody<{ text?: string; mode?: string }>(req, res);
    if (!body) return;
    if (!body.text?.trim()) {
      error(res, "text is required");
      return;
    }
    if (body.mode && body.mode !== "simple" && body.mode !== "power") {
      error(res, "mode must be 'simple' or 'power'", 400);
      return;
    }
    const mode: ChatMode = body.mode === "simple" ? "simple" : "power";
    if (!state.runtime) {
      error(res, "Agent is not running", 503);
      return;
    }

    // Cloud proxy path
    const proxy = state.cloudManager?.getProxy();
    if (proxy) {
      try {
        const responseText = await proxy.handleChatMessage(
          body.text.trim(),
          conv.roomId,
          mode,
        );
        const resolvedText = normalizeChatResponseText(
          responseText,
          state.logBuffer,
        );
        conv.updatedAt = new Date().toISOString();
        json(res, { text: resolvedText, agentName: proxy.agentName });
      } catch (err) {
        const creditReply = getInsufficientCreditsReplyFromError(err);
        if (creditReply) {
          conv.updatedAt = new Date().toISOString();
          json(res, { text: creditReply, agentName: proxy.agentName });
        } else {
          error(res, getErrorMessage(err), 500);
        }
      }
      return;
    }

    try {
      const runtime = state.runtime;
      const userId = ensureAdminEntityId();
      await ensureConversationRoom(conv);

      const message = createMessageMemory({
        id: crypto.randomUUID() as UUID,
        entityId: userId,
        roomId: conv.roomId,
        content: {
          text: body.text.trim(),
          mode,
          simple: mode === "simple",
          source: "client_chat",
          channelType: ChannelType.DM,
        },
      });

      const result = await generateChatResponse(
        runtime,
        message,
        state.agentName,
        {
          resolveNoResponseText: () =>
            resolveNoResponseFallback(state.logBuffer),
        },
      );

      conv.updatedAt = new Date().toISOString();
      json(res, {
        text: result.text,
        agentName: result.agentName,
      });
    } catch (err) {
      const creditReply = getInsufficientCreditsReplyFromError(err);
      if (creditReply) {
        conv.updatedAt = new Date().toISOString();
        json(res, {
          text: creditReply,
          agentName: state.agentName,
        });
      } else {
        error(res, getErrorMessage(err), 500);
      }
    }
    return;
  }

  // ── POST /api/conversations/:id/greeting ───────────────────────────
  // Pick a random postExample from the character as the opening message.
  // No model call, no latency, no cost — already in the agent's voice.
  // Stored as an agent message so it persists on refresh.
  if (
    method === "POST" &&
    /^\/api\/conversations\/[^/]+\/greeting$/.test(pathname)
  ) {
    const convId = decodeURIComponent(pathname.split("/")[3]);
    const conv = state.conversations.get(convId);
    if (!conv) {
      error(res, "Conversation not found", 404);
      return;
    }

    const runtime = state.runtime;
    const charName = runtime?.character.name ?? state.agentName ?? "Milaidy";
    const FALLBACK_MSG = `Hey! I'm ${charName}. What's on your mind?`;

    // Collect post examples from the character
    const postExamples = runtime?.character.postExamples ?? [];
    const greeting =
      postExamples.length > 0
        ? postExamples[Math.floor(Math.random() * postExamples.length)]
        : FALLBACK_MSG;

    // Store the greeting as an agent message so it persists on refresh
    if (runtime && state.agentState === "running") {
      try {
        await ensureConversationRoom(conv);
        const agentMemory = createMessageMemory({
          id: crypto.randomUUID() as UUID,
          entityId: runtime.agentId,
          roomId: conv.roomId,
          content: {
            text: greeting,
            source: "agent_greeting",
            channelType: ChannelType.DM,
          },
        });
        await runtime.createMemory(agentMemory, "messages");
      } catch (memErr) {
        logger.debug(
          `[greeting] Failed to store greeting memory: ${memErr instanceof Error ? memErr.message : String(memErr)}`,
        );
      }
    }

    conv.updatedAt = new Date().toISOString();
    json(res, {
      text: greeting,
      agentName: charName,
      generated: postExamples.length > 0,
    });
    return;
  }

  // ── PATCH /api/conversations/:id ────────────────────────────────────
  if (
    method === "PATCH" &&
    /^\/api\/conversations\/[^/]+$/.test(pathname) &&
    !pathname.endsWith("/messages")
  ) {
    const convId = decodeURIComponent(pathname.split("/")[3]);
    const conv = state.conversations.get(convId);
    if (!conv) {
      error(res, "Conversation not found", 404);
      return;
    }
    const body = await readJsonBody<{ title?: string }>(req, res);
    if (!body) return;
    if (body.title?.trim()) {
      conv.title = body.title.trim();
      conv.updatedAt = new Date().toISOString();
      await syncConversationRoomTitle(conv);
    }
    json(res, { conversation: conv });
    return;
  }

  // ── DELETE /api/conversations/:id ───────────────────────────────────
  if (
    method === "DELETE" &&
    /^\/api\/conversations\/[^/]+$/.test(pathname) &&
    !pathname.endsWith("/messages")
  ) {
    const convId = decodeURIComponent(pathname.split("/")[3]);
    state.conversations.delete(convId);
    json(res, { ok: true });
    return;
  }

  // ── POST /api/chat/stream ────────────────────────────────────────────
  if (method === "POST" && pathname === "/api/chat/stream") {
    const body = await readJsonBody<{ text?: string; mode?: string }>(req, res);
    if (!body) return;
    if (!body.text?.trim()) {
      error(res, "text is required");
      return;
    }
    if (body.mode && body.mode !== "simple" && body.mode !== "power") {
      error(res, "mode must be 'simple' or 'power'", 400);
      return;
    }
    const mode: ChatMode = body.mode === "simple" ? "simple" : "power";
    const prompt = body.text.trim();

    // Cloud proxy path
    const proxy = state.cloudManager?.getProxy();
    if (proxy) {
      initSse(res);
      let fullText = "";
      try {
        for await (const chunk of proxy.handleChatMessageStream(
          prompt,
          "web-chat",
          mode,
        )) {
          fullText += chunk;
          writeSse(res, { type: "token", text: chunk });
        }

        const resolvedText = normalizeChatResponseText(
          fullText,
          state.logBuffer,
        );
        writeSse(res, {
          type: "done",
          fullText: resolvedText,
          agentName: proxy.agentName,
        });
      } catch (err) {
        const creditReply = getInsufficientCreditsReplyFromError(err);
        if (creditReply) {
          writeSse(res, {
            type: "done",
            fullText: creditReply,
            agentName: proxy.agentName,
          });
        } else {
          writeSse(res, {
            type: "error",
            message: getErrorMessage(err),
          });
        }
      } finally {
        res.end();
      }
      return;
    }

    if (!state.runtime) {
      error(res, "Agent is not running", 503);
      return;
    }

    initSse(res);
    let aborted = false;
    req.on("close", () => {
      aborted = true;
    });

    try {
      const runtime = state.runtime;
      const agentName = runtime.character.name ?? "Milaidy";
      await ensureLegacyChatConnection(runtime, agentName);
      const chatUserId = state.chatUserId;
      const chatRoomId = state.chatRoomId;
      if (!chatUserId || !chatRoomId) {
        throw new Error("Legacy chat connection was not initialized");
      }

      const message = createMessageMemory({
        id: crypto.randomUUID() as UUID,
        entityId: chatUserId,
        roomId: chatRoomId,
        content: {
          text: prompt,
          mode,
          simple: mode === "simple",
          source: "client_chat",
          channelType: ChannelType.DM,
        },
      });

      const result = await generateChatResponse(
        runtime,
        message,
        state.agentName,
        {
          isAborted: () => aborted,
          onChunk: (chunk) => {
            writeSse(res, { type: "token", text: chunk });
          },
          resolveNoResponseText: () =>
            resolveNoResponseFallback(state.logBuffer),
        },
      );

      if (!aborted) {
        writeSse(res, {
          type: "done",
          fullText: result.text,
          agentName: result.agentName,
        });
      }
    } catch (err) {
      if (!aborted) {
        const creditReply = getInsufficientCreditsReplyFromError(err);
        if (creditReply) {
          writeSse(res, {
            type: "done",
            fullText: creditReply,
            agentName: state.agentName,
          });
        } else {
          writeSse(res, {
            type: "error",
            message: getErrorMessage(err),
          });
        }
      }
    } finally {
      res.end();
    }
    return;
  }

  // ── POST /api/chat (legacy — routes to default conversation) ───────
  // Routes messages through the full ElizaOS message pipeline so the agent
  // has conversation memory, context, and always responds (DM + client_chat
  // bypass the shouldRespond LLM evaluation).
  //
  // Cloud mode: when a cloud proxy is active, messages are forwarded to the
  // remote sandbox instead of the local runtime.  Supports SSE streaming
  // when the client sends Accept: text/event-stream.
  if (method === "POST" && pathname === "/api/chat") {
    // ── Cloud proxy path ───────────────────────────────────────────────
    const proxy = state.cloudManager?.getProxy();
    if (proxy) {
      const body = await readJsonBody<{ text?: string; mode?: string }>(
        req,
        res,
      );
      if (!body) return;
      if (!body.text?.trim()) {
        error(res, "text is required");
        return;
      }
      if (body.mode && body.mode !== "simple" && body.mode !== "power") {
        error(res, "mode must be 'simple' or 'power'", 400);
        return;
      }
      const mode: ChatMode = body.mode === "simple" ? "simple" : "power";

      const wantsStream = (req.headers.accept ?? "").includes(
        "text/event-stream",
      );

      if (wantsStream) {
        initSse(res);
        let fullText = "";

        try {
          for await (const chunk of proxy.handleChatMessageStream(
            body.text.trim(),
            "web-chat",
            mode,
          )) {
            fullText += chunk;
            writeSse(res, { type: "token", text: chunk });
          }
          const resolvedText = normalizeChatResponseText(
            fullText,
            state.logBuffer,
          );
          writeSse(res, {
            type: "done",
            fullText: resolvedText,
            agentName: proxy.agentName,
          });
        } catch (err) {
          const creditReply = getInsufficientCreditsReplyFromError(err);
          if (creditReply) {
            writeSse(res, {
              type: "done",
              fullText: creditReply,
              agentName: proxy.agentName,
            });
          } else {
            writeSse(res, {
              type: "error",
              message: getErrorMessage(err),
            });
          }
        }
        res.end();
      } else {
        try {
          const responseText = await proxy.handleChatMessage(
            body.text.trim(),
            "web-chat",
            mode,
          );
          const resolvedText = normalizeChatResponseText(
            responseText,
            state.logBuffer,
          );
          json(res, { text: resolvedText, agentName: proxy.agentName });
        } catch (err) {
          const creditReply = getInsufficientCreditsReplyFromError(err);
          if (creditReply) {
            json(res, { text: creditReply, agentName: proxy.agentName });
          } else {
            error(res, getErrorMessage(err), 500);
          }
        }
      }
      return;
    }

    // ── Local runtime path (existing code below) ───────────────────────
    const body = await readJsonBody<{ text?: string; mode?: string }>(req, res);
    if (!body) return;
    if (!body.text?.trim()) {
      error(res, "text is required");
      return;
    }
    if (body.mode && body.mode !== "simple" && body.mode !== "power") {
      error(res, "mode must be 'simple' or 'power'", 400);
      return;
    }
    const mode: ChatMode = body.mode === "simple" ? "simple" : "power";

    if (!state.runtime) {
      error(res, "Agent is not running", 503);
      return;
    }

    try {
      const runtime = state.runtime;
      const agentName = runtime.character.name ?? "Milaidy";
      await ensureLegacyChatConnection(runtime, agentName);
      const chatUserId = state.chatUserId;
      const chatRoomId = state.chatRoomId;
      if (!chatUserId || !chatRoomId) {
        throw new Error("Legacy chat connection was not initialized");
      }

      const message = createMessageMemory({
        id: crypto.randomUUID() as UUID,
        entityId: chatUserId,
        roomId: chatRoomId,
        content: {
          text: body.text.trim(),
          mode,
          simple: mode === "simple",
          source: "client_chat",
          channelType: ChannelType.DM,
        },
      });

      const result = await generateChatResponse(
        runtime,
        message,
        state.agentName,
        {
          resolveNoResponseText: () =>
            resolveNoResponseFallback(state.logBuffer),
        },
      );

      json(res, {
        text: result.text,
        agentName: result.agentName,
      });
    } catch (err) {
      const creditReply = getInsufficientCreditsReplyFromError(err);
      if (creditReply) {
        json(res, {
          text: creditReply,
          agentName: state.agentName,
        });
      } else {
        error(res, getErrorMessage(err), 500);
      }
    }
    return;
  }

  // ── Database management API ─────────────────────────────────────────────
  if (pathname.startsWith("/api/database/")) {
    const handled = await handleDatabaseRoute(
      req,
      res,
      state.runtime,
      pathname,
    );
    if (handled) return;
  }

  // ── Trajectory management API ──────────────────────────────────────────
  if (pathname.startsWith("/api/trajectories")) {
    const handled = await handleTrajectoryRoute(
      req,
      res,
      state.runtime,
      pathname,
    );
    if (handled) return;
  }

  // ── GET /api/cloud/status ─────────────────────────────────────────────
  if (method === "GET" && pathname === "/api/cloud/status") {
    const cloudEnabled = Boolean(state.config.cloud?.enabled);
    const hasApiKey = Boolean(state.config.cloud?.apiKey);
    const rt = state.runtime;
    if (!rt) {
      json(res, {
        connected: false,
        enabled: cloudEnabled,
        hasApiKey,
        reason: "runtime_not_started",
      });
      return;
    }
    const cloudAuth = rt.getService("CLOUD_AUTH") as {
      isAuthenticated: () => boolean;
      getUserId: () => string | undefined;
      getOrganizationId: () => string | undefined;
    } | null;
    if (cloudAuth?.isAuthenticated()) {
      json(res, {
        connected: true,
        enabled: cloudEnabled,
        hasApiKey,
        userId: cloudAuth.getUserId(),
        organizationId: cloudAuth.getOrganizationId(),
        topUpUrl: "https://www.elizacloud.ai/dashboard/billing",
      });
      return;
    }
    json(res, {
      connected: false,
      enabled: cloudEnabled,
      hasApiKey,
      reason: hasApiKey
        ? "api_key_present_not_authenticated"
        : "not_authenticated",
    });
    return;
  }

  // ── GET /api/cloud/credits ──────────────────────────────────────────────
  if (method === "GET" && pathname === "/api/cloud/credits") {
    const rt = state.runtime;
    const cloudAuth = rt
      ? (rt.getService("CLOUD_AUTH") as {
          isAuthenticated: () => boolean;
          getClient: () => { get: <T>(path: string) => Promise<T> };
        } | null)
      : null;
    const configApiKey = state.config.cloud?.apiKey?.trim();

    if (!cloudAuth || !cloudAuth.isAuthenticated()) {
      if (!configApiKey) {
        json(res, { balance: null, connected: false });
        return;
      }

      try {
        const balance = await fetchCloudCreditsByApiKey(
          resolveCloudApiBaseUrl(state.config.cloud?.baseUrl),
          configApiKey,
        );
        if (typeof balance !== "number") {
          json(res, {
            balance: null,
            connected: true,
            error: "unexpected response",
          });
          return;
        }
        const low = balance < 2.0;
        const critical = balance < 0.5;
        json(res, {
          connected: true,
          balance,
          low,
          critical,
          topUpUrl: "https://www.elizacloud.ai/dashboard/billing",
        });
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "cloud API unreachable";
        logger.debug(
          `[cloud/credits] Failed to fetch balance via API key: ${msg}`,
        );
        json(res, { balance: null, connected: true, error: msg });
      }
      return;
    }

    const authenticatedCloudAuth = cloudAuth as {
      isAuthenticated: () => boolean;
      getClient: () => { get: <T>(path: string) => Promise<T> };
    };

    let balance: number;
    const client = authenticatedCloudAuth.getClient();
    try {
      // The cloud API returns either { balance: number } (direct)
      // or { success: true, data: { balance: number } } (wrapped).
      // Handle both formats gracefully.
      const creditResponse =
        await client.get<Record<string, unknown>>("/credits/balance");
      const rawBalance =
        typeof creditResponse?.balance === "number"
          ? creditResponse.balance
          : typeof (creditResponse?.data as Record<string, unknown>)
                ?.balance === "number"
            ? ((creditResponse.data as Record<string, unknown>)
                .balance as number)
            : undefined;
      if (typeof rawBalance !== "number") {
        logger.debug(
          `[cloud/credits] Unexpected response shape: ${JSON.stringify(creditResponse)}`,
        );
        json(res, {
          balance: null,
          connected: true,
          error: "unexpected response",
        });
        return;
      }
      balance = rawBalance;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "cloud API unreachable";
      logger.debug(`[cloud/credits] Failed to fetch balance: ${msg}`);
      json(res, { balance: null, connected: true, error: msg });
      return;
    }
    const low = balance < 2.0;
    const critical = balance < 0.5;
    json(res, {
      connected: true,
      balance,
      low,
      critical,
      topUpUrl: "https://www.elizacloud.ai/dashboard/billing",
    });
    return;
  }

  // ── App routes (/api/apps/*) ──────────────────────────────────────────
  if (method === "GET" && pathname === "/api/apps") {
    const apps = await state.appManager.listAvailable();
    json(res, apps);
    return;
  }

  if (method === "GET" && pathname === "/api/apps/search") {
    const query = url.searchParams.get("q") ?? "";
    if (!query.trim()) {
      json(res, []);
      return;
    }
    const limit = parseBoundedLimit(url.searchParams.get("limit"));
    const results = await state.appManager.search(query, limit);
    json(res, results);
    return;
  }

  if (method === "GET" && pathname === "/api/apps/installed") {
    json(res, state.appManager.listInstalled());
    return;
  }

  // Launch an app: install its plugin (if needed), return viewer config
  if (method === "POST" && pathname === "/api/apps/launch") {
    const body = await readJsonBody<{ name?: string }>(req, res);
    if (!body) return;
    if (!body.name?.trim()) {
      error(res, "name is required");
      return;
    }
    const result = await state.appManager.launch(body.name.trim());
    json(res, result);
    return;
  }

  // Stop an app: disconnects session and uninstalls plugin when installed
  if (method === "POST" && pathname === "/api/apps/stop") {
    const body = await readJsonBody<{ name?: string }>(req, res);
    if (!body) return;
    if (!body.name?.trim()) {
      error(res, "name is required");
      return;
    }
    const appName = body.name.trim();
    const result = await state.appManager.stop(appName);
    json(res, result);
    return;
  }

  if (method === "GET" && pathname.startsWith("/api/apps/info/")) {
    const appName = decodeURIComponent(
      pathname.slice("/api/apps/info/".length),
    );
    if (!appName) {
      error(res, "app name is required");
      return;
    }
    const info = await state.appManager.getInfo(appName);
    if (!info) {
      error(res, `App "${appName}" not found in registry`, 404);
      return;
    }
    json(res, info);
    return;
  }

  // ── GET /api/apps/plugins — non-app plugins from registry ───────────
  if (method === "GET" && pathname === "/api/apps/plugins") {
    const { listNonAppPlugins } = await import(
      "../services/registry-client.js"
    );
    try {
      const plugins = await listNonAppPlugins();
      json(res, plugins);
    } catch (err) {
      error(
        res,
        `Failed to list plugins: ${err instanceof Error ? err.message : String(err)}`,
        502,
      );
    }
    return;
  }

  // ── GET /api/apps/plugins/search?q=... — search non-app plugins ─────
  if (method === "GET" && pathname === "/api/apps/plugins/search") {
    const query = url.searchParams.get("q") ?? "";
    if (!query.trim()) {
      json(res, []);
      return;
    }
    const { searchNonAppPlugins } = await import(
      "../services/registry-client.js"
    );
    try {
      const limit = parseBoundedLimit(url.searchParams.get("limit"));
      const results = await searchNonAppPlugins(query, limit);
      json(res, results);
    } catch (err) {
      error(
        res,
        `Plugin search failed: ${err instanceof Error ? err.message : String(err)}`,
        502,
      );
    }
    return;
  }

  // ── POST /api/apps/refresh — refresh the registry cache ─────────────
  if (method === "POST" && pathname === "/api/apps/refresh") {
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

  // ── Hyperscape control proxy routes ──────────────────────────────────
  if (method === "GET" && pathname === "/api/apps/hyperscape/embedded-agents") {
    await relayHyperscapeApi("GET", "/api/embedded-agents");
    return;
  }

  if (
    method === "POST" &&
    pathname === "/api/apps/hyperscape/embedded-agents"
  ) {
    await relayHyperscapeApi("POST", "/api/embedded-agents");
    return;
  }

  if (method === "POST") {
    const embeddedActionMatch = pathname.match(
      /^\/api\/apps\/hyperscape\/embedded-agents\/([^/]+)\/(start|stop|pause|resume|command)$/,
    );
    if (embeddedActionMatch) {
      const characterId = decodeURIComponent(embeddedActionMatch[1]);
      const action = embeddedActionMatch[2];
      await relayHyperscapeApi(
        "POST",
        `/api/embedded-agents/${encodeURIComponent(characterId)}/${action}`,
      );
      return;
    }

    const messageMatch = pathname.match(
      /^\/api\/apps\/hyperscape\/agents\/([^/]+)\/message$/,
    );
    if (messageMatch) {
      const agentId = decodeURIComponent(messageMatch[1]);
      const body = await readJsonBody<{ content?: string }>(req, res);
      if (!body) return;
      const content = body.content?.trim();
      if (!content) {
        error(res, "content is required");
        return;
      }
      await relayHyperscapeApi(
        "POST",
        `/api/embedded-agents/${encodeURIComponent(agentId)}/command`,
        {
          rawBodyOverride: JSON.stringify({
            command: "chat",
            data: { message: content },
          }),
          contentTypeOverride: "application/json",
        },
      );
      return;
    }
  }

  if (method === "GET") {
    const goalMatch = pathname.match(
      /^\/api\/apps\/hyperscape\/agents\/([^/]+)\/goal$/,
    );
    if (goalMatch) {
      const agentId = decodeURIComponent(goalMatch[1]);
      await relayHyperscapeApi(
        "GET",
        `/api/agents/${encodeURIComponent(agentId)}/goal`,
      );
      return;
    }

    const quickActionsMatch = pathname.match(
      /^\/api\/apps\/hyperscape\/agents\/([^/]+)\/quick-actions$/,
    );
    if (quickActionsMatch) {
      const agentId = decodeURIComponent(quickActionsMatch[1]);
      await relayHyperscapeApi(
        "GET",
        `/api/agents/${encodeURIComponent(agentId)}/quick-actions`,
      );
      return;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Workbench routes
  // ═══════════════════════════════════════════════════════════════════════

  // ── GET /api/workbench/overview ──────────────────────────────────────
  if (method === "GET" && pathname === "/api/workbench/overview") {
    const tasks: WorkbenchTaskView[] = [];
    const triggers: Array<
      NonNullable<ReturnType<typeof taskToTriggerSummary>>
    > = [];
    const todos: WorkbenchTodoView[] = [];
    const summary = {
      totalTasks: 0,
      completedTasks: 0,
      totalTriggers: 0,
      activeTriggers: 0,
      totalTodos: 0,
      completedTodos: 0,
    };
    const latestAutonomyEvent = [...state.eventBuffer]
      .reverse()
      .find(
        (event) =>
          event.type === "agent_event" &&
          (event.stream === "assistant" ||
            event.stream === "provider" ||
            event.stream === "evaluator"),
      );
    const autonomySvc = getAutonomySvc(state.runtime);
    const autonomy = {
      enabled: true,
      thinking: autonomySvc?.isLoopRunning() ?? false,
      lastEventAt: latestAutonomyEvent?.ts ?? null,
    };
    let tasksAvailable = false;
    let triggersAvailable = false;
    let todosAvailable = false;
    let runtimeTasks: Task[] = [];
    let todoData: TodoDataServiceLike | null = null;

    if (state.runtime) {
      try {
        runtimeTasks = await state.runtime.getTasks({});
        tasksAvailable = true;
        todosAvailable = true;

        for (const task of runtimeTasks) {
          const todo = toWorkbenchTodo(task);
          if (todo) {
            todos.push(todo);
            continue;
          }
          const mappedTask = toWorkbenchTask(task);
          if (mappedTask) {
            tasks.push(mappedTask);
          }
        }
      } catch {
        tasksAvailable = false;
        todosAvailable = false;
      }

      try {
        todoData = await getTodoDataService(state.runtime);
        if (todoData) {
          const dbTodos = await todoData.getTodos({
            agentId: state.runtime.agentId,
          });
          todosAvailable = true;
          for (const rawTodo of dbTodos) {
            const mapped = toWorkbenchTodoFromRecord(rawTodo);
            if (mapped) {
              todos.push(mapped);
            }
          }
        }
      } catch {
        // plugin todo unavailable or errored; keep fallback todos
      }

      try {
        const triggerTasks = await listTriggerTasks(state.runtime);
        triggersAvailable = true;
        for (const task of triggerTasks) {
          const summaryItem = taskToTriggerSummary(task);
          if (summaryItem) {
            triggers.push(summaryItem);
          }
        }
      } catch {
        if (tasksAvailable) {
          triggersAvailable = true;
          for (const task of runtimeTasks) {
            const summaryItem = taskToTriggerSummary(task);
            if (summaryItem) {
              triggers.push(summaryItem);
            }
          }
        }
      }
    }

    if (todos.length > 1) {
      const dedupedTodos = new Map<string, WorkbenchTodoView>();
      for (const todo of todos) {
        dedupedTodos.set(todo.id, todo);
      }
      todos.length = 0;
      todos.push(...dedupedTodos.values());
    }

    tasks.sort((a, b) => a.name.localeCompare(b.name));
    todos.sort((a, b) => a.name.localeCompare(b.name));
    triggers.sort((a, b) => a.displayName.localeCompare(b.displayName));
    summary.totalTasks = tasks.length;
    summary.completedTasks = tasks.filter((task) => task.isCompleted).length;
    summary.totalTriggers = triggers.length;
    summary.activeTriggers = triggers.filter(
      (trigger) => trigger.enabled,
    ).length;
    summary.totalTodos = todos.length;
    summary.completedTodos = todos.filter((todo) => todo.isCompleted).length;

    json(res, {
      tasks,
      triggers,
      todos,
      summary,
      autonomy,
      tasksAvailable,
      triggersAvailable,
      todosAvailable,
    });
    return;
  }

  // ── GET /api/workbench/tasks ─────────────────────────────────────────
  if (method === "GET" && pathname === "/api/workbench/tasks") {
    if (!state.runtime) {
      error(res, "Agent runtime is not available", 503);
      return;
    }
    const runtimeTasks = await state.runtime.getTasks({});
    const tasks = runtimeTasks
      .map((task) => toWorkbenchTask(task))
      .filter((task): task is WorkbenchTaskView => task !== null)
      .sort((a, b) => a.name.localeCompare(b.name));
    json(res, { tasks });
    return;
  }

  // ── POST /api/workbench/tasks ────────────────────────────────────────
  if (method === "POST" && pathname === "/api/workbench/tasks") {
    if (!state.runtime) {
      error(res, "Agent runtime is not available", 503);
      return;
    }
    const body = await readJsonBody<{
      name?: string;
      description?: string;
      tags?: string[];
      isCompleted?: boolean;
    }>(req, res);
    if (!body) return;
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) {
      error(res, "name is required", 400);
      return;
    }
    const description =
      typeof body.description === "string" ? body.description : "";
    const isCompleted = body.isCompleted === true;
    const metadata = {
      isCompleted,
      workbench: { kind: "task" },
    };
    const taskId = await state.runtime.createTask({
      name,
      description,
      tags: normalizeTags(body.tags, [WORKBENCH_TASK_TAG]),
      metadata,
    });
    const created = await state.runtime.getTask(taskId);
    const task = created ? toWorkbenchTask(created) : null;
    if (!task) {
      error(res, "Task created but unavailable", 500);
      return;
    }
    json(res, { task }, 201);
    return;
  }

  const taskItemMatch = /^\/api\/workbench\/tasks\/([^/]+)$/.exec(pathname);
  if (taskItemMatch && ["GET", "PUT", "DELETE"].includes(method)) {
    if (!state.runtime) {
      error(res, "Agent runtime is not available", 503);
      return;
    }
    const decodedTaskId = decodePathComponent(taskItemMatch[1], res, "task id");
    if (!decodedTaskId) return;
    const task = await state.runtime.getTask(decodedTaskId as UUID);
    const taskView = task ? toWorkbenchTask(task) : null;
    if (!task || !taskView || !task.id) {
      error(res, "Task not found", 404);
      return;
    }

    if (method === "GET") {
      json(res, { task: taskView });
      return;
    }

    if (method === "DELETE") {
      await state.runtime.deleteTask(task.id);
      json(res, { ok: true });
      return;
    }

    const body = await readJsonBody<{
      name?: string;
      description?: string;
      tags?: string[];
      isCompleted?: boolean;
    }>(req, res);
    if (!body) return;

    const update: Partial<Task> = {};
    if (typeof body.name === "string") {
      const name = body.name.trim();
      if (!name) {
        error(res, "name cannot be empty", 400);
        return;
      }
      update.name = name;
    }
    if (typeof body.description === "string") {
      update.description = body.description;
    }
    if (body.tags !== undefined) {
      update.tags = normalizeTags(body.tags, [WORKBENCH_TASK_TAG]);
    }
    if (typeof body.isCompleted === "boolean") {
      update.metadata = {
        ...readTaskMetadata(task),
        isCompleted: body.isCompleted,
      };
    }
    await state.runtime.updateTask(task.id, update);
    const refreshed = await state.runtime.getTask(task.id);
    const refreshedView = refreshed ? toWorkbenchTask(refreshed) : null;
    if (!refreshedView) {
      error(res, "Task updated but unavailable", 500);
      return;
    }
    json(res, { task: refreshedView });
    return;
  }

  // ── GET /api/workbench/todos ─────────────────────────────────────────
  if (method === "GET" && pathname === "/api/workbench/todos") {
    if (!state.runtime) {
      error(res, "Agent runtime is not available", 503);
      return;
    }
    const runtimeTasks = await state.runtime.getTasks({});
    const todos = runtimeTasks
      .map((task) => toWorkbenchTodo(task))
      .filter((todo): todo is WorkbenchTodoView => todo !== null)
      .sort((a, b) => a.name.localeCompare(b.name));
    const todoData = await getTodoDataService(state.runtime);
    if (todoData) {
      try {
        const dbTodos = await todoData.getTodos({
          agentId: state.runtime.agentId,
        });
        for (const rawTodo of dbTodos) {
          const mapped = toWorkbenchTodoFromRecord(rawTodo);
          if (mapped) {
            const existingIndex = todos.findIndex(
              (todo) => todo.id === mapped.id,
            );
            if (existingIndex >= 0) {
              todos[existingIndex] = mapped;
            } else {
              todos.push(mapped);
            }
          }
        }
        todos.sort((a, b) => a.name.localeCompare(b.name));
      } catch {
        // fallback to task-backed todos only
      }
    }
    json(res, { todos });
    return;
  }

  // ── POST /api/workbench/todos ────────────────────────────────────────
  if (method === "POST" && pathname === "/api/workbench/todos") {
    if (!state.runtime) {
      error(res, "Agent runtime is not available", 503);
      return;
    }
    const body = await readJsonBody<{
      name?: string;
      description?: string;
      priority?: number | string | null;
      isUrgent?: boolean;
      type?: string;
      isCompleted?: boolean;
      tags?: string[];
    }>(req, res);
    if (!body) return;
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) {
      error(res, "name is required", 400);
      return;
    }
    const description =
      typeof body.description === "string" ? body.description : "";
    const isCompleted = body.isCompleted === true;
    const priority = parseNullableNumber(body.priority);
    const isUrgent = body.isUrgent === true;
    const type =
      typeof body.type === "string" && body.type.trim().length > 0
        ? body.type.trim()
        : "task";

    const todoData = await getTodoDataService(state.runtime);
    if (todoData) {
      try {
        const now = Date.now();
        const roomId =
          (
            state.runtime.getService("AUTONOMY") as {
              getAutonomousRoomId?: () => UUID;
            } | null
          )?.getAutonomousRoomId?.() ??
          stringToUuid(`workbench-todo-room-${state.runtime.agentId}`);
        const worldId = stringToUuid(
          `workbench-todo-world-${state.runtime.agentId}`,
        );
        const entityId =
          state.adminEntityId ?? stringToUuid(`workbench-todo-entity-${now}`);
        const createdTodoId = await todoData.createTodo({
          agentId: state.runtime.agentId,
          worldId,
          roomId,
          entityId,
          name,
          description: description || name,
          type,
          priority: priority ?? undefined,
          isUrgent,
          metadata: {
            createdAt: new Date(now).toISOString(),
            source: "workbench-api",
          },
          tags: normalizeTags(body.tags, ["TODO"]),
        });
        const createdDbTodo = await todoData.getTodo(createdTodoId);
        const mappedDbTodo = createdDbTodo
          ? toWorkbenchTodoFromRecord(createdDbTodo)
          : null;
        if (mappedDbTodo) {
          json(res, { todo: mappedDbTodo }, 201);
          return;
        }
      } catch {
        // fallback to task-backed todo creation
      }
    }

    const metadata = {
      isCompleted,
      workbenchTodo: {
        description,
        priority,
        isUrgent,
        isCompleted,
        type,
      },
    };
    const taskId = await state.runtime.createTask({
      name,
      description,
      tags: normalizeTags(body.tags, [WORKBENCH_TODO_TAG, "todo"]),
      metadata,
    });
    const created = await state.runtime.getTask(taskId);
    const todo = created ? toWorkbenchTodo(created) : null;
    if (!todo) {
      error(res, "Todo created but unavailable", 500);
      return;
    }
    json(res, { todo }, 201);
    return;
  }

  const todoCompleteMatch = /^\/api\/workbench\/todos\/([^/]+)\/complete$/.exec(
    pathname,
  );
  if (method === "POST" && todoCompleteMatch) {
    if (!state.runtime) {
      error(res, "Agent runtime is not available", 503);
      return;
    }
    const decodedTodoId = decodePathComponent(
      todoCompleteMatch[1],
      res,
      "todo id",
    );
    if (!decodedTodoId) return;
    const body = await readJsonBody<{ isCompleted?: boolean }>(req, res);
    if (!body) return;
    const isCompleted = body.isCompleted === true;
    const todoData = await getTodoDataService(state.runtime);
    if (todoData) {
      try {
        await todoData.updateTodo(decodedTodoId, {
          isCompleted,
          completedAt: isCompleted ? new Date() : null,
        });
        json(res, { ok: true });
        return;
      } catch {
        // fallback to task-backed path
      }
    }
    const todoTask = await state.runtime.getTask(decodedTodoId as UUID);
    if (!todoTask || !todoTask.id || !toWorkbenchTodo(todoTask)) {
      error(res, "Todo not found", 404);
      return;
    }
    const metadata = readTaskMetadata(todoTask);
    const todoMeta =
      asObject(metadata.workbenchTodo) ?? asObject(metadata.todo) ?? {};
    await state.runtime.updateTask(todoTask.id, {
      metadata: {
        ...metadata,
        isCompleted,
        workbenchTodo: {
          ...todoMeta,
          isCompleted,
        },
      },
    });
    json(res, { ok: true });
    return;
  }

  const todoItemMatch = /^\/api\/workbench\/todos\/([^/]+)$/.exec(pathname);
  if (todoItemMatch && ["GET", "PUT", "DELETE"].includes(method)) {
    if (!state.runtime) {
      error(res, "Agent runtime is not available", 503);
      return;
    }
    const decodedTodoId = decodePathComponent(todoItemMatch[1], res, "todo id");
    if (!decodedTodoId) return;
    const todoData = await getTodoDataService(state.runtime);

    if (method === "GET" && todoData) {
      try {
        const dbTodo = await todoData.getTodo(decodedTodoId);
        const mapped = dbTodo ? toWorkbenchTodoFromRecord(dbTodo) : null;
        if (mapped) {
          json(res, { todo: mapped });
          return;
        }
      } catch {
        // fallback to task-backed path
      }
    }

    if (method === "GET") {
      const todoTask = await state.runtime.getTask(decodedTodoId as UUID);
      const todoView = todoTask ? toWorkbenchTodo(todoTask) : null;
      if (!todoTask || !todoTask.id || !todoView) {
        error(res, "Todo not found", 404);
        return;
      }
      json(res, { todo: todoView });
      return;
    }

    if (method === "DELETE" && todoData) {
      try {
        await todoData.deleteTodo(decodedTodoId);
        json(res, { ok: true });
        return;
      } catch {
        // fallback to task-backed path
      }
    }

    if (method === "DELETE") {
      const todoTask = await state.runtime.getTask(decodedTodoId as UUID);
      if (!todoTask?.id || !toWorkbenchTodo(todoTask)) {
        error(res, "Todo not found", 404);
        return;
      }
      await state.runtime.deleteTask(todoTask.id);
      json(res, { ok: true });
      return;
    }

    const body = await readJsonBody<{
      name?: string;
      description?: string;
      priority?: number | string | null;
      isUrgent?: boolean;
      type?: string;
      isCompleted?: boolean;
      tags?: string[];
    }>(req, res);
    if (!body) return;

    if (todoData) {
      try {
        const updates: Record<string, unknown> = {};
        if (typeof body.name === "string") {
          const name = body.name.trim();
          if (!name) {
            error(res, "name cannot be empty", 400);
            return;
          }
          updates.name = name;
        }
        if (typeof body.description === "string") {
          updates.description = body.description;
        }
        if (body.priority !== undefined) {
          updates.priority = parseNullableNumber(body.priority);
        }
        if (typeof body.isUrgent === "boolean") {
          updates.isUrgent = body.isUrgent;
        }
        if (typeof body.type === "string" && body.type.trim().length > 0) {
          updates.type = body.type.trim();
        }
        if (typeof body.isCompleted === "boolean") {
          updates.isCompleted = body.isCompleted;
          updates.completedAt = body.isCompleted ? new Date() : null;
        }
        await todoData.updateTodo(decodedTodoId, updates);
        const refreshedDbTodo = await todoData.getTodo(decodedTodoId);
        const refreshedMapped = refreshedDbTodo
          ? toWorkbenchTodoFromRecord(refreshedDbTodo)
          : null;
        if (refreshedMapped) {
          json(res, { todo: refreshedMapped });
          return;
        }
      } catch {
        // fallback to task-backed path
      }
    }

    const todoTask = await state.runtime.getTask(decodedTodoId as UUID);
    const todoView = todoTask ? toWorkbenchTodo(todoTask) : null;
    if (!todoTask || !todoTask.id || !todoView) {
      error(res, "Todo not found", 404);
      return;
    }

    const update: Partial<Task> = {};
    if (typeof body.name === "string") {
      const name = body.name.trim();
      if (!name) {
        error(res, "name cannot be empty", 400);
        return;
      }
      update.name = name;
    }
    if (typeof body.description === "string") {
      update.description = body.description;
    }
    if (body.tags !== undefined) {
      update.tags = normalizeTags(body.tags, [WORKBENCH_TODO_TAG, "todo"]);
    }

    const metadata = readTaskMetadata(todoTask);
    const existingTodoMeta =
      asObject(metadata.workbenchTodo) ?? asObject(metadata.todo) ?? {};
    const nextTodoMeta: Record<string, unknown> = {
      ...existingTodoMeta,
    };
    if (typeof body.description === "string") {
      nextTodoMeta.description = body.description;
    }
    if (body.priority !== undefined) {
      nextTodoMeta.priority = parseNullableNumber(body.priority);
    }
    if (typeof body.isUrgent === "boolean") {
      nextTodoMeta.isUrgent = body.isUrgent;
    }
    if (typeof body.type === "string" && body.type.trim().length > 0) {
      nextTodoMeta.type = body.type.trim();
    }

    let isCompleted = readTaskCompleted(todoTask);
    if (typeof body.isCompleted === "boolean") {
      isCompleted = body.isCompleted;
    }
    nextTodoMeta.isCompleted = isCompleted;
    update.metadata = {
      ...metadata,
      isCompleted,
      workbenchTodo: nextTodoMeta,
    };

    await state.runtime.updateTask(todoTask.id, update);
    const refreshed = await state.runtime.getTask(todoTask.id);
    const refreshedTodo = refreshed ? toWorkbenchTodo(refreshed) : null;
    if (!refreshedTodo) {
      error(res, "Todo updated but unavailable", 500);
      return;
    }
    json(res, { todo: refreshedTodo });
    return;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Share ingest routes
  // ═══════════════════════════════════════════════════════════════════════

  // ── POST /api/ingest/share ───────────────────────────────────────────
  if (method === "POST" && pathname === "/api/ingest/share") {
    const body = await readJsonBody<{
      source?: string;
      title?: string;
      url?: string;
      text?: string;
    }>(req, res);
    if (!body) return;

    const item: ShareIngestItem = {
      id: crypto.randomUUID(),
      source: (body.source as string) ?? "unknown",
      title: body.title as string | undefined,
      url: body.url as string | undefined,
      text: body.text as string | undefined,
      suggestedPrompt: body.title
        ? `What do you think about "${body.title}"?`
        : body.url
          ? `Can you analyze this: ${body.url}`
          : body.text
            ? `What are your thoughts on: ${(body.text as string).slice(0, 100)}`
            : "What do you think about this shared content?",
      receivedAt: Date.now(),
    };
    state.shareIngestQueue.push(item);
    json(res, { ok: true, item });
    return;
  }

  // ── GET /api/ingest/share ────────────────────────────────────────────
  if (method === "GET" && pathname === "/api/ingest/share") {
    const consume = url.searchParams.get("consume") === "1";
    if (consume) {
      const items = [...state.shareIngestQueue];
      state.shareIngestQueue.length = 0;
      json(res, { items });
    } else {
      json(res, { items: state.shareIngestQueue });
    }
    return;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // MCP marketplace routes
  // ═══════════════════════════════════════════════════════════════════════

  // ── GET /api/mcp/marketplace/search ──────────────────────────────────
  if (method === "GET" && pathname === "/api/mcp/marketplace/search") {
    const query = url.searchParams.get("q") ?? "";
    const limitStr = url.searchParams.get("limit");
    const limit = limitStr
      ? parseClampedInteger(limitStr, { min: 1, max: 50, fallback: 30 })
      : 30;
    try {
      const result = await searchMcpMarketplace(query || undefined, limit);
      json(res, { ok: true, results: result.results });
    } catch (err) {
      error(
        res,
        `MCP marketplace search failed: ${err instanceof Error ? err.message : err}`,
        502,
      );
    }
    return;
  }

  // ── GET /api/mcp/marketplace/details/:name ───────────────────────────
  if (
    method === "GET" &&
    pathname.startsWith("/api/mcp/marketplace/details/")
  ) {
    const serverName = decodePathComponent(
      pathname.slice("/api/mcp/marketplace/details/".length),
      res,
      "server name",
    );
    if (serverName === null) return;
    if (!serverName.trim()) {
      error(res, "Server name is required", 400);
      return;
    }
    try {
      const details = await getMcpServerDetails(serverName);
      if (!details) {
        error(res, `MCP server "${serverName}" not found`, 404);
        return;
      }
      json(res, { ok: true, server: details });
    } catch (err) {
      error(
        res,
        `Failed to fetch server details: ${err instanceof Error ? err.message : err}`,
        502,
      );
    }
    return;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // MCP config routes
  // ═══════════════════════════════════════════════════════════════════════

  // ── GET /api/mcp/config ──────────────────────────────────────────────
  if (method === "GET" && pathname === "/api/mcp/config") {
    const servers = state.config.mcp?.servers ?? {};
    json(res, { ok: true, servers: redactDeep(servers) });
    return;
  }

  // ── POST /api/mcp/config/server ──────────────────────────────────────
  if (method === "POST" && pathname === "/api/mcp/config/server") {
    const body = await readJsonBody<{
      name?: string;
      config?: Record<string, unknown>;
    }>(req, res);
    if (!body) return;

    const serverName = (body.name as string | undefined)?.trim();
    if (!serverName) {
      error(res, "Server name is required", 400);
      return;
    }
    if (isBlockedObjectKey(serverName)) {
      error(
        res,
        'Invalid server name: "__proto__", "constructor", and "prototype" are reserved',
        400,
      );
      return;
    }

    const config = body.config as Record<string, unknown> | undefined;
    if (!config || typeof config !== "object") {
      error(res, "Server config object is required", 400);
      return;
    }
    if (hasBlockedObjectKeyDeep(config)) {
      error(
        res,
        'Invalid server config: "__proto__", "constructor", and "prototype" are not allowed',
        400,
      );
      return;
    }

    const configType = config.type as string | undefined;
    const validTypes = ["stdio", "http", "streamable-http", "sse"];
    if (!configType || !validTypes.includes(configType)) {
      error(
        res,
        `Invalid config type. Must be one of: ${validTypes.join(", ")}`,
        400,
      );
      return;
    }

    if (configType === "stdio" && !config.command) {
      error(res, "Command is required for stdio servers", 400);
      return;
    }

    if (
      (configType === "http" ||
        configType === "streamable-http" ||
        configType === "sse") &&
      !config.url
    ) {
      error(res, "URL is required for remote servers", 400);
      return;
    }

    if (!state.config.mcp) state.config.mcp = {};
    if (!state.config.mcp.servers) state.config.mcp.servers = {};
    const sanitized = cloneWithoutBlockedObjectKeys(config);
    state.config.mcp.servers[serverName] = sanitized as NonNullable<
      NonNullable<typeof state.config.mcp>["servers"]
    >[string];

    try {
      saveMilaidyConfig(state.config);
    } catch (err) {
      logger.warn(
        `[api] Config save failed: ${err instanceof Error ? err.message : err}`,
      );
    }

    json(res, { ok: true, name: serverName, requiresRestart: true });
    return;
  }

  // ── DELETE /api/mcp/config/server/:name ──────────────────────────────
  if (method === "DELETE" && pathname.startsWith("/api/mcp/config/server/")) {
    const serverName = decodePathComponent(
      pathname.slice("/api/mcp/config/server/".length),
      res,
      "server name",
    );
    if (serverName === null) return;
    if (isBlockedObjectKey(serverName)) {
      error(
        res,
        'Invalid server name: "__proto__", "constructor", and "prototype" are reserved',
        400,
      );
      return;
    }

    if (state.config.mcp?.servers?.[serverName]) {
      delete state.config.mcp.servers[serverName];
      try {
        saveMilaidyConfig(state.config);
      } catch (err) {
        logger.warn(
          `[api] Config save failed: ${err instanceof Error ? err.message : err}`,
        );
      }
    }

    json(res, { ok: true, requiresRestart: true });
    return;
  }

  // ── PUT /api/mcp/config ──────────────────────────────────────────────
  if (method === "PUT" && pathname === "/api/mcp/config") {
    const body = await readJsonBody<{
      servers?: Record<string, unknown>;
    }>(req, res);
    if (!body) return;

    if (!state.config.mcp) state.config.mcp = {};
    if (body.servers && typeof body.servers === "object") {
      if (hasBlockedObjectKeyDeep(body.servers)) {
        error(
          res,
          'Invalid servers config: "__proto__", "constructor", and "prototype" are not allowed',
          400,
        );
        return;
      }
      const sanitized = cloneWithoutBlockedObjectKeys(body.servers);
      state.config.mcp.servers = sanitized as NonNullable<
        NonNullable<typeof state.config.mcp>["servers"]
      >;
    }

    try {
      saveMilaidyConfig(state.config);
    } catch (err) {
      logger.warn(
        `[api] Config save failed: ${err instanceof Error ? err.message : err}`,
      );
    }

    json(res, { ok: true });
    return;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // MCP status route
  // ═══════════════════════════════════════════════════════════════════════

  // ── GET /api/mcp/status ──────────────────────────────────────────────
  if (method === "GET" && pathname === "/api/mcp/status") {
    const servers: Array<{
      name: string;
      status: string;
      toolCount: number;
      resourceCount: number;
    }> = [];

    // If runtime has an MCP service, enumerate active servers
    if (state.runtime) {
      try {
        const mcpService = state.runtime.getService("MCP") as {
          getServers?: () => Array<{
            name: string;
            status: string;
            tools?: unknown[];
            resources?: unknown[];
          }>;
        } | null;
        if (mcpService && typeof mcpService.getServers === "function") {
          for (const s of mcpService.getServers()) {
            servers.push({
              name: s.name,
              status: s.status,
              toolCount: Array.isArray(s.tools) ? s.tools.length : 0,
              resourceCount: Array.isArray(s.resources)
                ? s.resources.length
                : 0,
            });
          }
        }
      } catch (err) {
        logger.debug(
          `[api] Service not available: ${err instanceof Error ? err.message : err}`,
        );
      }
    }

    json(res, { ok: true, servers });
    return;
  }

  // ── GET /api/emotes ──────────────────────────────────────────────────────
  if (method === "GET" && pathname === "/api/emotes") {
    json(res, { emotes: EMOTE_CATALOG });
    return;
  }

  // ── POST /api/emote ─────────────────────────────────────────────────────
  if (method === "POST" && pathname === "/api/emote") {
    const body = await readJsonBody<{ emoteId?: string }>(req, res);
    if (!body) return;
    const emote = body.emoteId ? EMOTE_BY_ID.get(body.emoteId) : undefined;
    if (!emote) {
      error(res, `Unknown emote: ${body.emoteId ?? "(none)"}`);
      return;
    }
    state.broadcastWs?.({
      type: "emote",
      emoteId: emote.id,
      glbPath: emote.glbPath,
      duration: emote.duration,
      loop: emote.loop,
    });
    json(res, { ok: true });
    return;
  }

  // ── POST /api/terminal/run ──────────────────────────────────────────────
  // Execute a shell command server-side and stream output via WebSocket.
  if (method === "POST" && pathname === "/api/terminal/run") {
    if (state.shellEnabled === false) {
      error(res, "Shell access is disabled", 403);
      return;
    }

    const body = await readJsonBody<{ command?: string }>(req, res);
    if (!body) return;
    const command = typeof body.command === "string" ? body.command.trim() : "";
    if (!command) {
      error(res, "Missing or empty command");
      return;
    }

    // Guard against excessively long commands (likely injection or abuse)
    if (command.length > 4096) {
      error(res, "Command exceeds maximum length (4096 chars)", 400);
      return;
    }

    // Respond immediately — output streams via WebSocket
    json(res, { ok: true });

    // Spawn in background and broadcast output
    const { spawn } = await import("node:child_process");
    const runId = `run-${Date.now()}`;

    state.broadcastWs?.({
      type: "terminal-output",
      runId,
      event: "start",
      command,
    });

    const proc = spawn(command, {
      shell: true,
      cwd: process.cwd(),
      env: { ...process.env, FORCE_COLOR: "0" },
    });

    proc.stdout?.on("data", (chunk: Buffer) => {
      state.broadcastWs?.({
        type: "terminal-output",
        runId,
        event: "stdout",
        data: chunk.toString("utf-8"),
      });
    });

    proc.stderr?.on("data", (chunk: Buffer) => {
      state.broadcastWs?.({
        type: "terminal-output",
        runId,
        event: "stderr",
        data: chunk.toString("utf-8"),
      });
    });

    proc.on("close", (code: number | null) => {
      state.broadcastWs?.({
        type: "terminal-output",
        runId,
        event: "exit",
        code: code ?? 1,
      });
    });

    proc.on("error", (err: Error) => {
      state.broadcastWs?.({
        type: "terminal-output",
        runId,
        event: "error",
        data: err.message,
      });
    });

    return;
  }

  // ── Custom Actions CRUD ──────────────────────────────────────────────

  if (method === "GET" && pathname === "/api/custom-actions") {
    const config = loadMilaidyConfig();
    json(res, { actions: config.customActions ?? [] });
    return;
  }

  if (method === "POST" && pathname === "/api/custom-actions") {
    const body = await readJsonBody<Record<string, unknown>>(req, res);
    if (!body) return;

    const name = typeof body.name === "string" ? body.name.trim() : "";
    const description =
      typeof body.description === "string" ? body.description.trim() : "";

    if (!name || !description) {
      error(res, "name and description are required", 400);
      return;
    }

    const handler = body.handler as CustomActionDef["handler"] | undefined;
    const validHandlerTypes = new Set(["http", "shell", "code"]);
    if (!handler || !handler.type || !validHandlerTypes.has(handler.type)) {
      error(
        res,
        "handler with valid type (http, shell, code) is required",
        400,
      );
      return;
    }

    // Validate type-specific required fields
    if (
      handler.type === "http" &&
      (typeof handler.url !== "string" || !handler.url.trim())
    ) {
      error(res, "HTTP handler requires a url", 400);
      return;
    }
    if (
      handler.type === "shell" &&
      (typeof handler.command !== "string" || !handler.command.trim())
    ) {
      error(res, "Shell handler requires a command", 400);
      return;
    }
    if (
      handler.type === "code" &&
      (typeof handler.code !== "string" || !handler.code.trim())
    ) {
      error(res, "Code handler requires code", 400);
      return;
    }

    const now = new Date().toISOString();
    const actionDef: CustomActionDef = {
      id: crypto.randomUUID(),
      name: name.toUpperCase().replace(/\s+/g, "_"),
      description,
      similes: Array.isArray(body.similes)
        ? body.similes.filter((s): s is string => typeof s === "string")
        : [],
      parameters: Array.isArray(body.parameters)
        ? (body.parameters as Array<{
            name: string;
            description: string;
            required: boolean;
          }>)
        : [],
      handler,
      enabled: body.enabled !== false,
      createdAt: now,
      updatedAt: now,
    };

    const config = loadMilaidyConfig();
    if (!config.customActions) config.customActions = [];
    config.customActions.push(actionDef);
    saveMilaidyConfig(config);

    // Hot-register into the running agent so it's available immediately
    if (actionDef.enabled) {
      registerCustomActionLive(actionDef);
    }

    json(res, { ok: true, action: actionDef });
    return;
  }

  // Generate a custom action definition from a natural language prompt
  if (method === "POST" && pathname === "/api/custom-actions/generate") {
    const body = await readJsonBody<{ prompt?: string }>(req, res);
    if (!body) return;

    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    if (!prompt) {
      error(res, "prompt is required", 400);
      return;
    }

    const runtime = state.runtime;
    if (!runtime) {
      error(res, "Agent runtime not available", 503);
      return;
    }

    try {
      const systemPrompt = [
        "You are a helper that generates custom action definitions from natural language descriptions.",
        "Given a user's description of what they want an action to do, generate a JSON object with these fields:",
        "",
        "- name: string (UPPER_SNAKE_CASE action name)",
        "- description: string (clear description of what the action does)",
        '- handlerType: "http" | "shell" | "code"',
        "- handler: object with type-specific fields:",
        '  For http: { type: "http", method: "GET"|"POST"|etc, url: string, headers?: object, bodyTemplate?: string }',
        '  For shell: { type: "shell", command: string }',
        '  For code: { type: "code", code: string }',
        "- parameters: array of { name: string, description: string, required: boolean }",
        "",
        "Use {{paramName}} placeholders in URLs, body templates, and shell commands.",
        "For code handlers, parameters are available via params.paramName and fetch() is available.",
        "",
        "Respond with ONLY the JSON object, no markdown fences or explanation.",
      ].join("\n");

      const llmResponse = await runtime.useModel(ModelType.TEXT_SMALL, {
        prompt: `${systemPrompt}\n\nUser request: ${prompt}`,
        stopSequences: [],
      });

      // Parse the JSON from the LLM response
      const text =
        typeof llmResponse === "string" ? llmResponse : String(llmResponse);
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        error(res, "Failed to generate action definition", 500);
        return;
      }

      const generated = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
      json(res, { ok: true, generated });
    } catch (err) {
      error(
        res,
        `Generation failed: ${err instanceof Error ? err.message : String(err)}`,
        500,
      );
    }
    return;
  }

  const customActionMatch = pathname.match(/^\/api\/custom-actions\/([^/]+)$/);
  const customActionTestMatch = pathname.match(
    /^\/api\/custom-actions\/([^/]+)\/test$/,
  );

  if (method === "POST" && customActionTestMatch) {
    const actionId = decodeURIComponent(customActionTestMatch[1]);
    const body = await readJsonBody<{ params?: Record<string, string> }>(
      req,
      res,
    );
    if (!body) return;

    const config = loadMilaidyConfig();
    const def = (config.customActions ?? []).find((a) => a.id === actionId);
    if (!def) {
      error(res, "Action not found", 404);
      return;
    }

    const testParams = body.params ?? {};
    const start = Date.now();
    try {
      const handler = buildTestHandler(def);
      const result = await handler(testParams);
      json(res, {
        ok: result.ok,
        output: result.output,
        durationMs: Date.now() - start,
      });
    } catch (err) {
      json(res, {
        ok: false,
        output: "",
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - start,
      });
    }
    return;
  }

  if (method === "PUT" && customActionMatch) {
    const actionId = decodeURIComponent(customActionMatch[1]);
    const body = await readJsonBody<Record<string, unknown>>(req, res);
    if (!body) return;

    const config = loadMilaidyConfig();
    const actions = config.customActions ?? [];
    const idx = actions.findIndex((a) => a.id === actionId);
    if (idx === -1) {
      error(res, "Action not found", 404);
      return;
    }

    const existing = actions[idx];

    // Validate handler if provided in the update
    let newHandler = existing.handler;
    if (body.handler != null) {
      const h = body.handler as Record<string, unknown>;
      const hValidTypes = new Set(["http", "shell", "code"]);
      if (!h.type || !hValidTypes.has(h.type as string)) {
        error(res, "handler.type must be http, shell, or code", 400);
        return;
      }
      newHandler = h as unknown as CustomActionDef["handler"];
    }

    const updated: CustomActionDef = {
      ...existing,
      name:
        typeof body.name === "string"
          ? body.name.trim().toUpperCase().replace(/\s+/g, "_")
          : existing.name,
      description:
        typeof body.description === "string"
          ? body.description.trim()
          : existing.description,
      similes: Array.isArray(body.similes)
        ? body.similes.filter((s): s is string => typeof s === "string")
        : existing.similes,
      parameters: Array.isArray(body.parameters)
        ? (body.parameters as CustomActionDef["parameters"])
        : existing.parameters,
      handler: newHandler,
      enabled:
        typeof body.enabled === "boolean" ? body.enabled : existing.enabled,
      updatedAt: new Date().toISOString(),
    };

    actions[idx] = updated;
    config.customActions = actions;
    saveMilaidyConfig(config);

    json(res, { ok: true, action: updated });
    return;
  }

  if (method === "DELETE" && customActionMatch) {
    const actionId = decodeURIComponent(customActionMatch[1]);

    const config = loadMilaidyConfig();
    const actions = config.customActions ?? [];
    const idx = actions.findIndex((a) => a.id === actionId);
    if (idx === -1) {
      error(res, "Action not found", 404);
      return;
    }

    actions.splice(idx, 1);
    config.customActions = actions;
    saveMilaidyConfig(config);

    json(res, { ok: true });
    return;
  }

  // ── Static UI serving (production) ──────────────────────────────────────
  if (method === "GET" || method === "HEAD") {
    if (serveStaticUi(req, res, pathname)) return;
  }

  // ── Fallback ────────────────────────────────────────────────────────────
  error(res, "Not found", 404);
}

// ---------------------------------------------------------------------------
// Early log capture — re-exported from the standalone module so existing
// callers that `import { captureEarlyLogs } from "../api/server"` keep
// working.  The implementation lives in `./early-logs.ts` to avoid pulling
// the entire server dependency graph into lightweight consumers (e.g. the
// headless `startEliza()` path).
// ---------------------------------------------------------------------------
import { captureEarlyLogs, flushEarlyLogs } from "./early-logs";
export { captureEarlyLogs };

// ---------------------------------------------------------------------------
// Server start
// ---------------------------------------------------------------------------

export async function startApiServer(opts?: {
  port?: number;
  runtime?: AgentRuntime;
  /** Initial state when starting without a runtime (e.g. embedded bootstrapping). */
  initialAgentState?: "not_started" | "starting" | "stopped" | "error";
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
  ensureApiTokenForBindHost(host);

  let config: MilaidyConfig;
  try {
    config = loadMilaidyConfig();
  } catch (err) {
    logger.warn(
      `[milaidy-api] Failed to load config, starting with defaults: ${err instanceof Error ? err.message : err}`,
    );
    config = {} as MilaidyConfig;
  }

  // Wallet/inventory routes read from process.env at request-time.
  // Hydrate persisted config.env values so addresses remain visible after restarts.
  const persistedEnv = config.env as Record<string, string> | undefined;
  const envKeysToHydrate = [
    "EVM_PRIVATE_KEY",
    "SOLANA_PRIVATE_KEY",
    "ALCHEMY_API_KEY",
    "INFURA_API_KEY",
    "ANKR_API_KEY",
    "HELIUS_API_KEY",
    "BIRDEYE_API_KEY",
    "SOLANA_RPC_URL",
  ] as const;
  for (const key of envKeysToHydrate) {
    const value = persistedEnv?.[key];
    if (typeof value === "string" && value.trim() && !process.env[key]) {
      process.env[key] = value.trim();
    }
  }

  const plugins = discoverPluginsFromManifest();
  const workspaceDir =
    config.agents?.defaults?.workspace ?? resolveDefaultAgentWorkspaceDir();

  const hasRuntime = opts?.runtime != null;
  const initialAgentState = hasRuntime
    ? "running"
    : (opts?.initialAgentState ?? "not_started");
  const agentName = hasRuntime
    ? (opts.runtime?.character.name ?? "Milaidy")
    : (config.agents?.list?.[0]?.name ??
      config.ui?.assistant?.name ??
      "Milaidy");

  const state: ServerState = {
    runtime: opts?.runtime ?? null,
    config,
    agentState: initialAgentState,
    agentName,
    model: hasRuntime ? "provided" : undefined,
    startedAt:
      hasRuntime || initialAgentState === "starting" ? Date.now() : undefined,
    plugins,
    // Filled asynchronously after server start to keep startup latency low.
    skills: [],
    logBuffer: [],
    eventBuffer: [],
    nextEventId: 1,
    chatRoomId: null,
    chatUserId: null,
    chatConnectionReady: null,
    chatConnectionPromise: null,
    adminEntityId: null,
    conversations: new Map(),
    cloudManager: null,
    sandboxManager: null,
    appManager: new AppManager(),
    trainingService: null,
    registryService: null,
    dropService: null,
    shareIngestQueue: [],
    broadcastStatus: null,
    broadcastWs: null,
    activeConversationId: null,
    permissionStates: {},
    shellEnabled: config.features?.shellEnabled !== false,
  };

  const trainingService = new TrainingService({
    getRuntime: () => state.runtime,
    getConfig: () => state.config,
    setConfig: (nextConfig: MilaidyConfig) => {
      state.config = nextConfig;
      saveMilaidyConfig(nextConfig);
    },
  });
  // Register immediately so /api/training routes are available without a startup race.
  state.trainingService = trainingService;
  const configuredAdminEntityId = config.agents?.defaults?.adminEntityId;
  if (configuredAdminEntityId && isUuidLike(configuredAdminEntityId)) {
    state.adminEntityId = configuredAdminEntityId;
    state.chatUserId = state.adminEntityId;
  } else if (configuredAdminEntityId) {
    logger.warn(
      `[milaidy-api] Ignoring invalid agents.defaults.adminEntityId "${configuredAdminEntityId}"`,
    );
  }

  // Wire the app manager to the runtime if already running
  if (state.runtime) {
    // AppManager doesn't need a runtime reference — it just installs plugins
  }

  const addLog = (
    level: string,
    message: string,
    source = "system",
    tags: string[] = [],
  ) => {
    let resolvedSource = source;
    if (source === "auto" || source === "system") {
      const bracketMatch = /^\[([^\]]+)\]\s*/.exec(message);
      if (bracketMatch) resolvedSource = bracketMatch[1];
    }
    // Auto-tag based on source when no explicit tags provided
    const resolvedTags =
      tags.length > 0
        ? tags
        : resolvedSource === "runtime" || resolvedSource === "autonomy"
          ? ["agent"]
          : resolvedSource === "api" || resolvedSource === "websocket"
            ? ["server"]
            : resolvedSource === "cloud"
              ? ["server", "cloud"]
              : ["system"];
    state.logBuffer.push({
      timestamp: Date.now(),
      level,
      message,
      source: resolvedSource,
      tags: resolvedTags,
    });
    if (state.logBuffer.length > 1000) state.logBuffer.shift();
  };

  // ── Flush early-captured logs into the main buffer ────────────────────
  const earlyEntries = flushEarlyLogs();
  if (earlyEntries.length > 0) {
    for (const entry of earlyEntries) {
      state.logBuffer.push(entry);
    }
    if (state.logBuffer.length > 1000) {
      state.logBuffer.splice(0, state.logBuffer.length - 1000);
    }
    addLog(
      "info",
      `Flushed ${earlyEntries.length} early startup log entries`,
      "system",
      ["system"],
    );
  }

  addLog(
    "info",
    `Discovered ${plugins.length} plugins, loading skills in background`,
    "system",
    ["system", "plugins"],
  );

  // Warm per-provider model caches in background (non-blocking)
  void getOrFetchAllProviders().catch(() => {});

  // ── Intercept loggers so ALL agent/plugin/service logs appear in the UI ──
  // We patch both the global `logger` singleton from @elizaos/core (used by
  // eliza.ts, services, plugins, etc.) AND the runtime instance logger.
  // A marker prevents double-patching on hot-restart and avoids stacking
  // wrapper functions that would leak memory.
  const PATCHED_MARKER = "__milaidyLogPatched";
  const LEVELS = ["debug", "info", "warn", "error"] as const;

  /**
   * Patch a logger object so every log call also feeds into the UI log buffer.
   * Returns true if patching was performed, false if already patched.
   */
  const patchLogger = (
    target: typeof logger,
    defaultSource: string,
    defaultTags: string[],
  ): boolean => {
    if ((target as unknown as Record<string, unknown>)[PATCHED_MARKER]) {
      return false;
    }

    for (const lvl of LEVELS) {
      const original = target[lvl].bind(target);
      // pino / adze signature: logger.info(obj, msg) or logger.info(msg)
      const patched: (typeof target)[typeof lvl] = (
        ...args: Parameters<typeof original>
      ) => {
        let msg = "";
        let source = defaultSource;
        let tags = [...defaultTags];
        if (typeof args[0] === "string") {
          msg = args[0];
        } else if (args[0] && typeof args[0] === "object") {
          const obj = args[0] as Record<string, unknown>;
          if (typeof obj.src === "string") source = obj.src;
          // Extract tags from structured log objects
          if (Array.isArray(obj.tags)) {
            tags = [...tags, ...(obj.tags as string[])];
          }
          msg = typeof args[1] === "string" ? args[1] : JSON.stringify(obj);
        }
        // Auto-extract source from [bracket] prefixes (e.g. "[milaidy] ...")
        const bracketMatch = /^\[([^\]]+)\]\s*/.exec(msg);
        if (bracketMatch && source === defaultSource) {
          source = bracketMatch[1];
        }
        // Auto-tag based on source context
        if (source !== defaultSource && !tags.includes(source)) {
          tags.push(source);
        }
        if (msg) addLog(lvl, msg, source, tags);
        return original(...args);
      };
      target[lvl] = patched;
    }

    (target as unknown as Record<string, unknown>)[PATCHED_MARKER] = true;
    return true;
  };

  // 1) Patch the global @elizaos/core logger — this captures ALL log calls
  //    from eliza.ts, services, plugins, cloud, hooks, etc.
  if (patchLogger(logger, "agent", ["agent"])) {
    addLog(
      "info",
      "Global logger connected — all agent logs will stream to the UI",
      "system",
      ["system", "agent"],
    );
  }

  // 2) Patch the runtime instance logger (if it's a different object)
  //    This catches logs from runtime internals that use their own logger child.
  if (opts?.runtime?.logger && opts.runtime.logger !== logger) {
    if (patchLogger(opts.runtime.logger, "runtime", ["agent", "runtime"])) {
      addLog(
        "info",
        "Runtime logger connected — runtime logs will stream to the UI",
        "system",
        ["system", "agent"],
      );
    }
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
      ["agent", "autonomy"],
    );
  }

  // Store the restart callback on the state so the route handler can access it.
  const onRestart = opts?.onRestart ?? null;

  const server = http.createServer(async (req, res) => {
    try {
      await handleRequest(req, res, state, { onRestart });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "internal error";
      addLog("error", msg, "api", ["server", "api"]);
      error(res, msg, 500);
    }
  });

  const broadcastWs = (payload: object): void => {
    const message = JSON.stringify(payload);
    for (const client of wsClients) {
      if (client.readyState === 1) {
        try {
          client.send(message);
        } catch (err) {
          logger.error(
            `[milaidy-api] WebSocket broadcast error: ${err instanceof Error ? err.message : err}`,
          );
        }
      }
    }
  };

  const pushEvent = (
    event: Omit<StreamEventEnvelope, "eventId" | "version">,
  ) => {
    const envelope: StreamEventEnvelope = {
      ...event,
      eventId: `evt-${state.nextEventId}`,
      version: 1,
    };
    state.nextEventId += 1;
    state.eventBuffer.push(envelope);
    if (state.eventBuffer.length > 1500) {
      state.eventBuffer.splice(0, state.eventBuffer.length - 1500);
    }
    broadcastWs(envelope);
  };

  let detachRuntimeStreams: (() => void) | null = null;
  let detachTrainingStream: (() => void) | null = null;
  const bindRuntimeStreams = (runtime: AgentRuntime | null) => {
    if (detachRuntimeStreams) {
      detachRuntimeStreams();
      detachRuntimeStreams = null;
    }
    const svc = getAgentEventSvc(runtime);
    if (!svc) return;

    const unsubAgentEvents = svc.subscribe((event) => {
      pushEvent({
        type: "agent_event",
        ts: event.ts,
        runId: event.runId,
        seq: event.seq,
        stream: event.stream,
        sessionKey: event.sessionKey,
        agentId: event.agentId,
        roomId: event.roomId,
        payload: event.data,
      });
    });

    const unsubHeartbeat = svc.subscribeHeartbeat((event) => {
      pushEvent({
        type: "heartbeat_event",
        ts: event.ts,
        payload: event,
      });
    });

    detachRuntimeStreams = () => {
      unsubAgentEvents();
      unsubHeartbeat();
    };
  };

  const bindTrainingStream = () => {
    if (detachTrainingStream) {
      detachTrainingStream();
      detachTrainingStream = null;
    }
    if (!state.trainingService) return;
    detachTrainingStream = state.trainingService.subscribe((event) => {
      pushEvent({
        type: "training_event",
        ts: Date.now(),
        payload: event,
      });
    });
  };

  // ── Deferred startup work (non-blocking) ────────────────────────────────
  // Keep API startup fast: listen first, then warm optional subsystems.
  const startDeferredStartupWork = () => {
    void (async () => {
      try {
        const discoveredSkills = await discoverSkills(
          workspaceDir,
          state.config,
          state.runtime,
        );
        state.skills = discoveredSkills;
        addLog(
          "info",
          `Discovered ${discoveredSkills.length} skills`,
          "system",
          ["system", "plugins"],
        );
      } catch (err) {
        logger.warn(
          `[milaidy-api] Skill discovery failed during startup: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    })();

    void (async () => {
      try {
        await trainingService.initialize();
        bindTrainingStream();
        addLog("info", "Training service initialised", "system", [
          "system",
          "training",
        ]);
      } catch (err) {
        logger.error(
          `[milaidy-api] Training service init failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    })();

    void (async () => {
      if (!state.config.cloud?.enabled || !state.config.cloud.apiKey) return;
      const mgr = new CloudManager(state.config.cloud, {
        onStatusChange: (s) => {
          addLog("info", `Cloud connection status: ${s}`, "cloud", [
            "server",
            "cloud",
          ]);
        },
      });

      try {
        await mgr.init();
        state.cloudManager = mgr;
        addLog(
          "info",
          "Cloud manager initialised (Eliza Cloud enabled)",
          "cloud",
          ["server", "cloud"],
        );
      } catch (err) {
        addLog(
          "warn",
          `Cloud manager init failed: ${err instanceof Error ? err.message : String(err)}`,
          "cloud",
          ["server", "cloud"],
        );
      }
    })();

    void (async () => {
      initializeOGCodeInState();

      // Get EVM private key from runtime secrets (preferred) or config.env (fallback)
      const runtime = state.runtime;
      const evmKey =
        (runtime?.getSetting?.("EVM_PRIVATE_KEY") as string | undefined) ??
        (state.config.env as Record<string, string> | undefined)
          ?.EVM_PRIVATE_KEY;
      const registryConfig = state.config.registry;
      if (
        !evmKey ||
        !registryConfig?.registryAddress ||
        !registryConfig.mainnetRpc
      ) {
        return;
      }

      try {
        const txService = new TxService(registryConfig.mainnetRpc, evmKey);
        state.registryService = new RegistryService(
          txService,
          registryConfig.registryAddress,
        );

        if (registryConfig.collectionAddress) {
          const dropEnabled = state.config.features?.dropEnabled === true;
          state.dropService = new DropService(
            txService,
            registryConfig.collectionAddress,
            dropEnabled,
          );
        }

        addLog(
          "info",
          `ERC-8004 registry service initialised (${registryConfig.registryAddress})`,
          "system",
          ["system"],
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        addLog("warn", `ERC-8004 registry service disabled: ${msg}`, "system", [
          "system",
        ]);
        logger.warn({ err }, "Failed to initialize ERC-8004 registry service");
      }
    })();
  };

  // ── WebSocket Server ─────────────────────────────────────────────────────
  const wss = new WebSocketServer({ noServer: true });
  const wsClients = new Set<WebSocket>();
  bindRuntimeStreams(opts?.runtime ?? null);
  bindTrainingStream();

  // Handle upgrade requests for WebSocket
  server.on("upgrade", (request, socket, head) => {
    try {
      const wsUrl = new URL(
        request.url ?? "/",
        `http://${request.headers.host ?? "localhost"}`,
      );
      const rejection = resolveWebSocketUpgradeRejection(request, wsUrl);
      if (rejection) {
        rejectWebSocketUpgrade(socket, rejection.status, rejection.reason);
        return;
      }
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
      });
    } catch (err) {
      logger.error(
        `[milaidy-api] WebSocket upgrade error: ${err instanceof Error ? err.message : err}`,
      );
      rejectWebSocketUpgrade(socket, 404, "Not found");
    }
  });

  // Handle WebSocket connections
  wss.on("connection", (ws: WebSocket) => {
    wsClients.add(ws);
    addLog("info", "WebSocket client connected", "websocket", [
      "server",
      "websocket",
    ]);

    // Send initial status and latest stream events.
    try {
      ws.send(
        JSON.stringify({
          type: "status",
          state: state.agentState,
          agentName: state.agentName,
          model: state.model,
          startedAt: state.startedAt,
        }),
      );
      const replay = state.eventBuffer.slice(-120);
      for (const event of replay) {
        ws.send(JSON.stringify(event));
      }
    } catch (err) {
      logger.error(
        `[milaidy-api] WebSocket send error: ${err instanceof Error ? err.message : err}`,
      );
    }

    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === "ping") {
          ws.send(JSON.stringify({ type: "pong" }));
        } else if (msg.type === "active-conversation") {
          state.activeConversationId =
            typeof msg.conversationId === "string" ? msg.conversationId : null;
        }
      } catch (err) {
        logger.error(
          `[milaidy-api] WebSocket message error: ${err instanceof Error ? err.message : err}`,
        );
      }
    });

    ws.on("close", () => {
      wsClients.delete(ws);
      addLog("info", "WebSocket client disconnected", "websocket", [
        "server",
        "websocket",
      ]);
    });

    ws.on("error", (err) => {
      logger.error(
        `[milaidy-api] WebSocket error: ${err instanceof Error ? err.message : err}`,
      );
      wsClients.delete(ws);
    });
  });

  // Broadcast status to all connected WebSocket clients (flattened — PR #36 fix)
  const broadcastStatus = () => {
    broadcastWs({
      type: "status",
      state: state.agentState,
      agentName: state.agentName,
      model: state.model,
      startedAt: state.startedAt,
    });
  };

  // Make broadcastStatus accessible to route handlers via state
  state.broadcastStatus = broadcastStatus;

  // Generic broadcast — sends an arbitrary JSON payload to all WS clients.
  state.broadcastWs = (data: Record<string, unknown>) => {
    const message = JSON.stringify(data);
    for (const client of wsClients) {
      if (client.readyState === 1) {
        try {
          client.send(message);
        } catch (err) {
          logger.error(
            `[milaidy-api] WebSocket broadcast error: ${err instanceof Error ? err.message : err}`,
          );
        }
      }
    }
  };

  // Make broadcastStatus accessible to route handlers via state
  state.broadcastStatus = broadcastStatus;

  // Generic broadcast — sends an arbitrary JSON payload to all WS clients.
  state.broadcastWs = (data: Record<string, unknown>) => {
    const message = JSON.stringify(data);
    for (const client of wsClients) {
      if (client.readyState === 1) {
        try {
          client.send(message);
        } catch (err) {
          logger.error(
            `[milaidy-api] WebSocket broadcast error: ${err instanceof Error ? err.message : err}`,
          );
        }
      }
    }
  };

  // Broadcast status every 5 seconds
  const statusInterval = setInterval(broadcastStatus, 5000);

  /**
   * Restore the in-memory conversation list from the database.
   * Web-chat rooms live in a deterministic world; we scan it for rooms
   * whose channelId starts with "web-conv-" and reconstruct the metadata.
   */
  const restoreConversationsFromDb = async (
    rt: AgentRuntime,
  ): Promise<void> => {
    try {
      const agentName = rt.character.name ?? "Milaidy";
      const worldId = stringToUuid(`${agentName}-web-chat-world`);
      const rooms = await rt.getRoomsByWorld(worldId);
      if (!rooms?.length) return;

      let restored = 0;
      for (const room of rooms) {
        // channelId is "web-conv-{uuid}" — extract the conversation id
        const channelId =
          typeof room.channelId === "string" ? room.channelId : "";
        if (!channelId.startsWith("web-conv-")) continue;
        const convId = channelId.replace("web-conv-", "");
        if (!convId || state.conversations.has(convId)) continue;

        // Peek at the latest message to get a timestamp
        let updatedAt = new Date().toISOString();
        try {
          const msgs = await rt.getMemories({
            roomId: room.id as UUID,
            tableName: "messages",
            count: 1,
          });
          if (msgs.length > 0 && msgs[0].createdAt) {
            updatedAt = new Date(msgs[0].createdAt).toISOString();
          }
        } catch {
          // non-fatal — use current time
        }

        state.conversations.set(convId, {
          id: convId,
          title:
            ((room as unknown as Record<string, unknown>).name as string) ||
            "Chat",
          roomId: room.id as UUID,
          createdAt: updatedAt,
          updatedAt,
        });
        restored++;
      }
      if (restored > 0) {
        addLog(
          "info",
          `Restored ${restored} conversation(s) from database`,
          "system",
          ["system"],
        );
      }
    } catch (err) {
      logger.warn(
        `[milaidy-api] Failed to restore conversations from DB: ${err instanceof Error ? err.message : err}`,
      );
    }
  };

  // Restore conversations from DB at initial boot (if runtime was passed in)
  if (opts?.runtime) {
    void restoreConversationsFromDb(opts.runtime);
  }

  /** Hot-swap the runtime reference (used after an in-process restart). */
  const updateRuntime = (rt: AgentRuntime): void => {
    state.runtime = rt;
    state.chatConnectionReady = null;
    state.chatConnectionPromise = null;
    bindRuntimeStreams(rt);
    // AppManager doesn't need a runtime reference
    state.agentState = "running";
    state.agentName = rt.character.name ?? "Milaidy";
    state.startedAt = Date.now();
    addLog("info", `Runtime restarted — agent: ${state.agentName}`, "system", [
      "system",
      "agent",
    ]);

    // Restore conversations from DB so they survive restarts
    void restoreConversationsFromDb(rt);

    // Broadcast status update immediately after restart
    broadcastStatus();
    // Re-patch the new runtime's messageService for autonomy routing
    patchMessageServiceForAutonomy(state);
  };

  // Patch the initial runtime (if provided) for autonomy routing
  patchMessageServiceForAutonomy(state);

  return new Promise((resolve) => {
    server.listen(port, host, () => {
      const addr = server.address();
      const actualPort = typeof addr === "object" && addr ? addr.port : port;
      const displayHost =
        typeof addr === "object" && addr ? addr.address : host;
      addLog(
        "info",
        `API server listening on http://${displayHost}:${actualPort}`,
        "system",
        ["server", "system"],
      );
      logger.info(
        `[milaidy-api] Listening on http://${displayHost}:${actualPort}`,
      );
      startDeferredStartupWork();
      resolve({
        port: actualPort,
        close: () =>
          new Promise<void>((r) => {
            const closeAllConnections = (
              server as { closeAllConnections?: () => void }
            ).closeAllConnections;
            const closeIdleConnections = (
              server as { closeIdleConnections?: () => void }
            ).closeIdleConnections;

            clearInterval(statusInterval);
            if (detachRuntimeStreams) {
              detachRuntimeStreams();
              detachRuntimeStreams = null;
            }
            if (detachTrainingStream) {
              detachTrainingStream();
              detachTrainingStream = null;
            }
            for (const ws of wsClients) {
              if (ws.readyState === 1 || ws.readyState === 0) {
                ws.terminate();
              }
            }
            wsClients.clear();
            wss.close();
            const closeTimeout = setTimeout(() => r(), 5_000);
            const resolved = { done: false };
            const finalize = () => {
              if (!resolved.done) {
                resolved.done = true;
                clearTimeout(closeTimeout);
                r();
              }
            };
            if (typeof closeAllConnections === "function") {
              try {
                closeAllConnections();
              } catch {
                // Bun/Node server internals vary by runtime; non-fatal on shutdown.
              }
            }
            if (typeof closeIdleConnections === "function") {
              try {
                closeIdleConnections();
              } catch {
                // Bun/Node server internals vary by runtime; non-fatal on shutdown.
              }
            }
            server.close(finalize);
          }),
        updateRuntime,
      });
    });
  });
}
