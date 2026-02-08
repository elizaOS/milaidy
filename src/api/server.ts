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
import path from "node:path";
import {
  type AgentRuntime,
  ChannelType,
  type Content,
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
function discoverPluginsFromManifest(): PluginEntry[] {
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
          const configured = envKey
            ? Boolean(process.env[envKey])
            : p.configKeys.length === 0;
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
            enabled: false,
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
    // @ts-expect-error — optional dependency; may not ship type declarations
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
      description: "Free credits to start, but they run out.",
    },
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
  if (!expected) return true;
  const provided = extractAuthToken(req);
  if (!provided) return false;
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(provided, "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

async function handleRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  state: ServerState,
  ctx?: RequestContext,
): Promise<void> {
  const method = req.method ?? "GET";
  const url = new URL(
    req.url ?? "/",
    `http://${req.headers.host ?? "localhost"}`,
  );
  const pathname = url.pathname;
  const isAuthEndpoint = pathname.startsWith("/api/auth/");

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

  // ── GET /api/onboarding/options ─────────────────────────────────────────
  if (method === "GET" && pathname === "/api/onboarding/options") {
    json(res, {
      names: pickRandomNames(6),
      styles: STYLE_PRESETS,
      providers: getProviderOptions(),
      sharedStyleRules: "Keep responses brief. Be helpful and concise.",
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

    if (body.provider && body.providerApiKey) {
      if (!config.env) config.env = {};
      const providerOpt = getProviderOptions().find(
        (p) => p.id === body.provider,
      );
      if (providerOpt?.envKey) {
        (config.env as Record<string, string>)[providerOpt.envKey] =
          body.providerApiKey as string;
        process.env[providerOpt.envKey] = body.providerApiKey as string;
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
    saveMilaidyConfig(config);
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
    // Update enabled status from runtime (if available)
    if (state.runtime) {
      const loadedNames = state.runtime.plugins.map((p) => p.name);
      for (const plugin of state.plugins) {
        const suffix = `plugin-${plugin.id}`;
        plugin.enabled = loadedNames.some(
          (name) =>
            name === plugin.id ||
            name === suffix ||
            name.endsWith(`/${suffix}`),
        );
      }
    }

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
    }
    if (body.config) {
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

    // Resolve the extension source path (always available in the repo)
    let extensionPath: string | null = null;
    try {
      const serverDir = path.dirname(new URL(import.meta.url).pathname);
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
    (state.config.env as Record<string, string>)[envKey] = process.env[envKey]!;

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
    } catch {
      // Config path may not be writable in test environments
    }

    json(res, { ok: true, wallets: generated });
    return;
  }

  // ── GET /api/wallet/config ─────────────────────────────────────────────
  if (method === "GET" && pathname === "/api/wallet/config") {
    const addrs = getWalletAddresses();
    const configStatus: WalletConfigStatus = {
      alchemyKeySet: Boolean(process.env.ALCHEMY_API_KEY),
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

  // ── GET /api/config ──────────────────────────────────────────────────────
  if (method === "GET" && pathname === "/api/config") {
    json(res, state.config);
    return;
  }

  // ── PUT /api/config ─────────────────────────────────────────────────────
  if (method === "PUT" && pathname === "/api/config") {
    const body = await readJsonBody(req, res);
    if (!body) return;
    Object.assign(state.config, body);
    try {
      saveMilaidyConfig(state.config);
    } catch {
      // In test environments the config path may not be writable — that's fine.
    }
    json(res, state.config);
    return;
  }

  // ── POST /api/chat ──────────────────────────────────────────────────────
  // Routes messages through the full ElizaOS message pipeline so the agent
  // has conversation memory, context, and always responds (DM + client_chat
  // bypass the shouldRespond LLM evaluation).
  if (method === "POST" && pathname === "/api/chat") {
    const body = await readJsonBody<{ text?: string }>(req, res);
    if (!body) return;
    if (!body.text?.trim()) {
      error(res, "text is required");
      return;
    }

    if (!state.runtime) {
      error(res, "Agent is not running", 503);
      return;
    }

    try {
      const runtime = state.runtime;
      const agentName = runtime.character.name ?? "Milaidy";

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
          type: ChannelType.DM,
        });
      }

      const message = createMessageMemory({
        id: crypto.randomUUID() as UUID,
        entityId: state.chatUserId,
        roomId: state.chatRoomId,
        content: {
          text: body.text.trim(),
          source: "client_chat",
          channelType: ChannelType.DM,
        },
      });

      // Collect the agent's response text from the callback.
      let responseText = "";

      await runtime.messageService?.handleMessage(
        runtime,
        message,
        async (content: Content) => {
          if (content?.text) {
            responseText += content.text;
          }
          return [];
        },
      );

      json(res, {
        text: responseText || "(no response)",
        agentName: state.agentName,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "generation failed";
      error(res, msg, 500);
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

  const plugins = discoverPluginsFromManifest();
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
    model: hasRuntime ? "provided" : undefined,
    startedAt: hasRuntime ? Date.now() : undefined,
    plugins,
    skills,
    logBuffer: [],
    chatRoomId: null,
    chatUserId: null,
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
    !(opts.runtime.logger as Record<string, unknown>)[PATCHED_MARKER]
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

    (rtLogger as Record<string, unknown>)[PATCHED_MARKER] = true;
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
    try {
      await handleRequest(req, res, state, { onRestart });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "internal error";
      addLog("error", msg, "api");
      error(res, msg, 500);
    }
  });

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
            server.close(() => r());
          }),
        updateRuntime,
      });
    });
  });
}
