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
import { WebSocketServer, type WebSocket } from "ws";
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
import { CloudManager } from "../cloud/cloud-manager.js";
import { handleCloudRoute, type CloudRouteState } from "./cloud-routes.js";
import {
  type PluginParamInfo,
  validatePluginConfig,
} from "./plugin-validation.js";
import {
  exportAgent,
  importAgent,
  estimateExportSize,
  AgentExportError,
} from "../services/agent-export.js";
import { handleDatabaseRoute } from "./database.js";
import {
  fetchEvmBalances,
  fetchEvmNfts,
  fetchSolanaBalances,
  fetchSolanaNfts,
  type WalletBalancesResponse,
  type WalletChain,
  type WalletConfigStatus,
  type WalletNftsResponse,
} from "./wallet.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUuid(value: string): boolean {
  return UUID_RE.test(value);
}

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

/** Subset of the MCP service interface for querying live server status. */
interface McpServiceLike {
  getServers(): Array<{
    name: string;
    status: string;
    error?: string;
    tools?: unknown[];
    resources?: unknown[];
  }>;
}

interface GoalDataLike {
  id: UUID;
  name: string;
  description?: string | null;
  ownerType: "agent" | "entity";
  ownerId: UUID;
  isCompleted: boolean;
  completedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

interface TodoDataLike {
  id: UUID;
  name: string;
  description?: string | null;
  type: "daily" | "one-off" | "aspirational";
  priority?: number | null;
  isUrgent: boolean;
  isCompleted: boolean;
  dueDate?: Date | null;
  completedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

interface GoalDataServiceLike {
  createGoal(params: {
    agentId: UUID;
    ownerType: "agent" | "entity";
    ownerId: UUID;
    name: string;
    description?: string;
    metadata?: Record<string, unknown>;
    tags?: string[];
  }): Promise<UUID | null>;
  getGoals(filters?: {
    ownerType?: "agent" | "entity";
    ownerId?: UUID;
    isCompleted?: boolean;
    tags?: string[];
  }): Promise<GoalDataLike[]>;
  getGoal(goalId: UUID): Promise<GoalDataLike | null>;
  updateGoal(goalId: UUID, updates: {
    name?: string;
    description?: string;
    isCompleted?: boolean;
    completedAt?: Date;
    metadata?: Record<string, unknown>;
    tags?: string[];
  }): Promise<boolean>;
}

interface TodoDataServiceLike {
  createTodo(data: {
    agentId: UUID;
    worldId: UUID;
    roomId: UUID;
    entityId: UUID;
    name: string;
    description?: string;
    type: "daily" | "one-off" | "aspirational";
    priority?: number;
    isUrgent?: boolean;
    dueDate?: Date;
    metadata?: Record<string, unknown>;
    tags?: string[];
  }): Promise<UUID>;
  getTodo(todoId: UUID): Promise<TodoDataLike | null>;
  getTodos(filters?: {
    agentId?: UUID;
    worldId?: UUID;
    roomId?: UUID;
    entityId?: UUID;
    type?: "daily" | "one-off" | "aspirational";
    isCompleted?: boolean;
    tags?: string[];
    limit?: number;
  }): Promise<TodoDataLike[]>;
  updateTodo(todoId: UUID, updates: {
    name?: string;
    description?: string;
    priority?: number;
    isUrgent?: boolean;
    isCompleted?: boolean;
    dueDate?: Date;
    completedAt?: Date;
    metadata?: Record<string, unknown>;
  }): Promise<boolean>;
}

interface GoalDataServiceWrapperLike {
  getDataService(): GoalDataServiceLike | null;
}

async function getGoalDataService(runtime: AgentRuntime | null): Promise<GoalDataServiceLike | null> {
  if (!runtime) return null;

  const wrapper = runtime.getService("GOAL_DATA") as GoalDataServiceWrapperLike | null;
  if (wrapper?.getDataService) {
    const svc = wrapper.getDataService();
    if (svc) return svc;
  }

  try {
    const { createGoalDataService } = await import("@elizaos/plugin-goals");
    return createGoalDataService(runtime as unknown as import("@elizaos/core").IAgentRuntime) as GoalDataServiceLike;
  } catch (err) {
    logger.debug(`[milaidy-api] GoalDataService unavailable: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

async function getTodoDataService(runtime: AgentRuntime | null): Promise<TodoDataServiceLike | null> {
  if (!runtime) return null;
  try {
    const { createTodoDataService } = await import("@elizaos/plugin-todo");
    return createTodoDataService(runtime as unknown as import("@elizaos/core").IAgentRuntime) as TodoDataServiceLike;
  } catch (err) {
    logger.debug(`[milaidy-api] TodoDataService unavailable: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

function toIsoOrNull(value: Date | null | undefined): string | null {
  if (!value) return null;
  return value.toISOString();
}

function clampPriority(raw: unknown): number | null {
  if (raw == null) return null;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (Number.isNaN(n)) return null;
  return Math.max(1, Math.min(5, Math.round(n)));
}

function normalizeTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const tags = raw
    .map((tag) => String(tag ?? "").trim().toLowerCase())
    .filter((tag) => tag.length > 0);
  return [...new Set(tags)];
}

function normalizeShareFiles(raw: unknown): ShareIngestFile[] {
  if (!Array.isArray(raw)) return [];
  const out: ShareIngestFile[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const file = entry as Record<string, unknown>;
    const name = String(file.name ?? "").trim();
    if (!name) continue;
    out.push({
      name,
      path: typeof file.path === "string" && file.path.trim() ? file.path.trim() : undefined,
      mimeType: typeof file.mimeType === "string" && file.mimeType.trim() ? file.mimeType.trim() : null,
      size: typeof file.size === "number" && Number.isFinite(file.size) ? file.size : null,
    });
  }
  return out.slice(0, 24);
}

function buildShareSuggestedPrompt(data: {
  title: string | null;
  text: string | null;
  url: string | null;
  files: ShareIngestFile[];
  source: string;
}): string {
  const lines: string[] = [];
  lines.push(`Shared from ${data.source}:`);
  if (data.title) lines.push(`Title: ${data.title}`);
  if (data.url) lines.push(`URL: ${data.url}`);
  if (data.text) {
    lines.push("Content:");
    lines.push(data.text);
  }
  if (data.files.length > 0) {
    lines.push("Files:");
    for (const file of data.files) {
      lines.push(`- ${file.name}${file.path ? ` (${file.path})` : ""}`);
    }
  }
  lines.push("Please analyze this and propose next actions.");
  return lines.join("\n");
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
  shareInbox: ShareIngestItem[];
}

interface ShareIngestFile {
  name: string;
  path?: string;
  mimeType?: string | null;
  size?: number | null;
}

interface ShareIngestItem {
  id: string;
  source: string;
  title: string | null;
  text: string | null;
  url: string | null;
  files: ShareIngestFile[];
  createdAt: number;
  suggestedPrompt: string;
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
  isCore?: boolean; // True if plugin is in CORE_PLUGINS (essential for app)
  isActive?: boolean; // True if plugin is currently loaded in runtime
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

/**
 * Hidden plugin config keys should not be shown in UI metadata surfaces.
 * They may still exist in upstream plugin manifests.
 */
const HIDDEN_PLUGIN_CONFIG_KEYS = new Set([
  "VERCEL_OIDC_TOKEN",
]);

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
      options: Array.isArray(def.options)
        ? (def.options as string[])
        : undefined,
      currentValue: isSet
        ? sensitive
          ? maskValue(envValue ?? "")
          : (envValue ?? null)
        : null,
      isSet,
    };
  });
}

function sanitizePluginIndexEntry(entry: PluginIndexEntry): PluginIndexEntry {
  const configKeys = entry.configKeys.filter((key) => !HIDDEN_PLUGIN_CONFIG_KEYS.has(key));
  const pluginParameters = entry.pluginParameters
    ? Object.fromEntries(
      Object.entries(entry.pluginParameters).filter(([key]) => !HIDDEN_PLUGIN_CONFIG_KEYS.has(key)),
    )
    : undefined;
  const envKey = entry.envKey && HIDDEN_PLUGIN_CONFIG_KEYS.has(entry.envKey) ? null : entry.envKey;

  return {
    ...entry,
    envKey,
    configKeys,
    pluginParameters,
  };
}

/**
 * Discover available plugins from the bundled plugins.json manifest.
 * Falls back to filesystem scanning for monorepo development.
 */
/**
 * Build PluginEntry records for user-installed plugins (from the Store).
 * These are tracked in config.plugins.installs and loaded at runtime,
 * but don't appear in the bundled plugins.json manifest.
 *
 * We read the installed plugin's package.json to extract metadata
 * (name, description, parameters) so they show up in the Plugins Manager
 * with the same level of detail as bundled plugins.
 */
function discoverInstalledPlugins(
  config: MilaidyConfig,
  bundledIds: Set<string>,
): PluginEntry[] {
  const installs = config.plugins?.installs;
  if (!installs || typeof installs !== "object") return [];

  const entries: PluginEntry[] = [];

  for (const [packageName, record] of Object.entries(installs)) {
    // Derive a short id from the package name (e.g. "@elizaos/plugin-foo" → "foo")
    const id = packageName
      .replace(/^@[^/]+\/plugin-/, "")
      .replace(/^@[^/]+\//, "")
      .replace(/^plugin-/, "");

    // Skip if it's already covered by the bundled manifest
    if (bundledIds.has(id)) continue;

    const category = categorizePlugin(id);
    const installPath = record.installPath;

    // Try to read the plugin's package.json for metadata
    let name = packageName;
    let description = `Installed from registry (v${record.version ?? "unknown"})`;

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
            };
            if (pkg.name) name = pkg.name;
            if (pkg.description) description = pkg.description;
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
      configured: true,
      envKey: null,
      category,
      source: "store",
      configKeys: [],
      parameters: [],
      validationErrors: [],
      validationWarnings: [],
    });
  }

  return entries.sort((a, b) => a.name.localeCompare(b.name));
}

function discoverPluginsFromManifest(): PluginEntry[] {
  const thisDir =
    import.meta.dirname ?? path.dirname(new URL(import.meta.url).pathname);
  const packageRoot = findOwnPackageRoot(thisDir);
  const manifestPath = path.join(packageRoot, "plugins.json");

  if (fs.existsSync(manifestPath)) {
    try {
      const index = JSON.parse(fs.readFileSync(manifestPath, "utf-8")) as PluginIndex;
      return index.plugins.map((rawPlugin) => {
        const p = sanitizePluginIndexEntry(rawPlugin);
        const category = categorizePlugin(p.id);
        const envKey = p.envKey;
        const configured = envKey ? Boolean(process.env[envKey]) : p.configKeys.length === 0;
        const parameters = p.pluginParameters ? buildParamDefs(p.pluginParameters) : [];
        const paramInfos: PluginParamInfo[] = parameters.map((pd) => ({
          key: pd.key, required: pd.required, sensitive: pd.sensitive,
          type: pd.type, description: pd.description, default: pd.default,
        }));
        const validation = validatePluginConfig(p.id, category, envKey, p.configKeys, undefined, paramInfos);

          return {
            id: p.id,
            name: p.name,
            description: p.description,
            enabled: false,
            configured,
            envKey,
            category,
            source: "bundled" as const,
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
    "zai",
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
    // @ts-ignore — optional peer dependency, resolved at runtime
    const skillsPkg = await import("@elizaos/skills") as { getSkillsDir: () => string };
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
 * Read raw binary request body with a configurable size limit.
 * Used for agent import file uploads.
 */
function readRawBody(
  req: http.IncomingMessage,
  maxBytes: number,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    req.on("data", (c: Buffer) => {
      totalBytes += c.length;
      if (totalBytes > maxBytes) {
        req.destroy();
        reject(
          new Error(`Request body exceeds maximum size (${maxBytes} bytes)`),
        );
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
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
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
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
    { id: "elizacloud", name: "Eliza Cloud", envKey: null, pluginName: "@elizaos/plugin-elizacloud", keyPrefix: null, description: "Free credits to start, but they run out." },
    { id: "anthropic", name: "Anthropic", envKey: "ANTHROPIC_API_KEY", pluginName: "@elizaos/plugin-anthropic", keyPrefix: "sk-ant-", description: "Claude models." },
    { id: "openai", name: "OpenAI", envKey: "OPENAI_API_KEY", pluginName: "@elizaos/plugin-openai", keyPrefix: "sk-", description: "GPT models." },
    { id: "openrouter", name: "OpenRouter", envKey: "OPENROUTER_API_KEY", pluginName: "@elizaos/plugin-openrouter", keyPrefix: "sk-or-", description: "Access multiple models via one API key." },
    { id: "vercel-ai-gateway", name: "Vercel AI Gateway", envKey: "AI_GATEWAY_API_KEY", pluginName: "@elizaos/plugin-vercel-ai-gateway", keyPrefix: null, description: "OpenAI-compatible gateway to route across providers/models." },
    { id: "gemini", name: "Gemini", envKey: "GOOGLE_API_KEY", pluginName: "@elizaos/plugin-google-genai", keyPrefix: null, description: "Google's Gemini models." },
    { id: "grok", name: "Grok", envKey: "XAI_API_KEY", pluginName: "@elizaos/plugin-xai", keyPrefix: "xai-", description: "xAI's Grok models." },
    { id: "groq", name: "Groq", envKey: "GROQ_API_KEY", pluginName: "@elizaos/plugin-groq", keyPrefix: "gsk_", description: "Fast inference." },
    { id: "deepseek", name: "DeepSeek", envKey: "DEEPSEEK_API_KEY", pluginName: "@elizaos/plugin-deepseek", keyPrefix: "sk-", description: "DeepSeek models." },
    { id: "mistral", name: "Mistral", envKey: "MISTRAL_API_KEY", pluginName: "@elizaos/plugin-mistral", keyPrefix: null, description: "Mistral AI models." },
    { id: "together", name: "Together AI", envKey: "TOGETHER_API_KEY", pluginName: "@elizaos/plugin-together", keyPrefix: null, description: "Open-source model hosting." },
    { id: "ollama", name: "Ollama (local)", envKey: null, pluginName: "@elizaos/plugin-ollama", keyPrefix: null, description: "Local models, no API key needed." },
  ];
}

// ---------------------------------------------------------------------------
// Registry enrichment helpers (trust/risk scoring)
// ---------------------------------------------------------------------------

interface RegistryPluginLike {
  name: string;
  gitRepo: string;
  gitUrl: string;
  description: string;
  homepage: string | null;
  topics: string[];
  stars: number;
  language: string;
  npm: { package: string; v0Version: string | null; v1Version: string | null; v2Version: string | null };
  git: { v0Branch: string | null; v1Branch: string | null; v2Branch: string | null };
  supports: { v0: boolean; v1: boolean; v2: boolean };
}

const NPM_META_TTL_MS = 12 * 60 * 60 * 1000;
const npmPackageModifiedCache = new Map<string, { modifiedAt: string | null; fetchedAt: number }>();

async function getPackageModifiedAt(packageName: string): Promise<string | null> {
  const cached = npmPackageModifiedCache.get(packageName);
  if (cached && Date.now() - cached.fetchedAt < NPM_META_TTL_MS) {
    return cached.modifiedAt;
  }

  let modifiedAt: string | null = null;
  try {
    const resp = await fetch(`https://registry.npmjs.org/${encodeURIComponent(packageName)}`, {
      signal: AbortSignal.timeout(4000),
    });
    if (resp.ok) {
      const data = await resp.json() as { time?: { modified?: string } };
      modifiedAt = typeof data?.time?.modified === "string" ? data.time.modified : null;
    }
  } catch {
    modifiedAt = null;
  }

  npmPackageModifiedCache.set(packageName, { modifiedAt, fetchedAt: Date.now() });
  return modifiedAt;
}

function computeCompatibility(plugin: RegistryPluginLike): { confidence: number; level: "low" | "medium" | "high"; label: string } {
  if (plugin.supports.v2 && plugin.npm.v2Version) {
    return { confidence: 0.95, level: "high", label: "v2 package published" };
  }
  if (plugin.supports.v2 && plugin.git.v2Branch) {
    return { confidence: 0.82, level: "high", label: "v2 branch available" };
  }
  if (plugin.supports.v1 && plugin.npm.v1Version) {
    return { confidence: 0.6, level: "medium", label: "v1 only" };
  }
  if (plugin.supports.v0 && plugin.npm.v0Version) {
    return { confidence: 0.35, level: "low", label: "legacy support only" };
  }
  return { confidence: 0.2, level: "low", label: "compatibility unclear" };
}

function computeMaintenance(modifiedAt: string | null): {
  modifiedAt: string | null;
  daysSinceUpdate: number | null;
  status: "fresh" | "recent" | "stale" | "unknown";
  label: string;
  score: number;
} {
  if (!modifiedAt) {
    return {
      modifiedAt: null,
      daysSinceUpdate: null,
      status: "unknown",
      label: "recency unknown",
      score: 0.45,
    };
  }

  const ts = Date.parse(modifiedAt);
  if (Number.isNaN(ts)) {
    return {
      modifiedAt,
      daysSinceUpdate: null,
      status: "unknown",
      label: "recency unknown",
      score: 0.45,
    };
  }

  const days = Math.max(0, Math.floor((Date.now() - ts) / (24 * 60 * 60 * 1000)));
  if (days <= 45) {
    return { modifiedAt, daysSinceUpdate: days, status: "fresh", label: `updated ${days}d ago`, score: 1 };
  }
  if (days <= 180) {
    return { modifiedAt, daysSinceUpdate: days, status: "recent", label: `updated ${days}d ago`, score: 0.78 };
  }
  return { modifiedAt, daysSinceUpdate: days, status: "stale", label: `updated ${days}d ago`, score: 0.38 };
}

function computeTrustLevel(score: number): "low" | "guarded" | "medium" | "high" {
  if (score >= 80) return "high";
  if (score >= 62) return "medium";
  if (score >= 45) return "guarded";
  return "low";
}

async function enrichRegistryPlugin(
  plugin: RegistryPluginLike,
  isInstalled: boolean,
  fetchRecency = true,
): Promise<RegistryPluginLike & {
  insights: {
    trustScore: number;
    trustLevel: "low" | "guarded" | "medium" | "high";
    maintenance: {
      modifiedAt: string | null;
      daysSinceUpdate: number | null;
      status: "fresh" | "recent" | "stale" | "unknown";
      label: string;
    };
    compatibility: {
      confidence: number;
      level: "low" | "medium" | "high";
      label: string;
    };
    restartImpact: {
      install: "restart-required" | "unknown";
      uninstall: "restart-required" | "unknown";
      label: string;
    };
    badges: string[];
  };
}> {
  const cached = plugin.npm.package ? npmPackageModifiedCache.get(plugin.npm.package) : undefined;
  const modifiedAt = plugin.npm.package
    ? (fetchRecency
      ? await getPackageModifiedAt(plugin.npm.package)
      : (cached?.modifiedAt ?? null))
    : null;
  const maintenance = computeMaintenance(modifiedAt);
  const compatibility = computeCompatibility(plugin);
  const starsScore = Math.min(1, Math.log10((plugin.stars ?? 0) + 1) / 3);
  const trustScore = Math.round((starsScore * 0.35 + maintenance.score * 0.3 + compatibility.confidence * 0.35) * 100);
  const trustLevel = computeTrustLevel(trustScore);
  const restartImpact = {
    install: "restart-required" as const,
    uninstall: "restart-required" as const,
    label: isInstalled ? "restart on uninstall" : "restart on install",
  };

  return {
    ...plugin,
    insights: {
      trustScore,
      trustLevel,
      maintenance: {
        modifiedAt: maintenance.modifiedAt,
        daysSinceUpdate: maintenance.daysSinceUpdate,
        status: maintenance.status,
        label: maintenance.label,
      },
      compatibility,
      restartImpact,
      badges: [
        `maintenance:${maintenance.status}`,
        `compat:${compatibility.level}`,
        `restart:${restartImpact.install}`,
      ],
    },
  };
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
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
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
      cloudProviders: getCloudProviderOptions(),
      models: getModelOptions(),
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
    if (body.theme && body.theme !== "light" && body.theme !== "dark") {
      error(res, "Invalid theme: must be 'light' or 'dark'", 400);
      return;
    }
    if (body.runMode && body.runMode !== "local" && body.runMode !== "cloud") {
      error(res, "Invalid runMode: must be 'local' or 'cloud'", 400);
      return;
    }

    const config = state.config;

    if (!config.agents) config.agents = {};
    if (!config.agents.defaults) config.agents.defaults = {};
    config.agents.defaults.workspace = resolveDefaultAgentWorkspaceDir();

    if (!config.agents.list) config.agents.list = [];
    if (config.agents.list.length === 0) {
      config.agents.list.push({ id: "main", default: true });
    }
    const agent = config.agents.list[0] as Record<string, unknown>;
    agent.name = (body.name as string).trim();
    agent.workspace = resolveDefaultAgentWorkspaceDir();
    if (body.bio) agent.bio = body.bio;
    if (body.systemPrompt) agent.system = body.systemPrompt;
    if (body.style) agent.style = body.style;
    if (body.adjectives) agent.adjectives = body.adjectives;
    if (body.topics) agent.topics = body.topics;
    if (body.messageExamples) agent.messageExamples = body.messageExamples;

    // ── Theme preference ──────────────────────────────────────────────────
    if (body.theme) {
      if (!config.ui) config.ui = {};
      config.ui.theme = body.theme as "light" | "dark";
    }

    // ── Run mode & cloud configuration ────────────────────────────────────
    const runMode = (body.runMode as string) || "local";
    if (!config.cloud) config.cloud = {};
    config.cloud.enabled = runMode === "cloud";

    if (runMode === "cloud") {
      if (body.cloudProvider) {
        config.cloud.provider = body.cloudProvider as string;
      }
      if (body.smallModel) {
        if (!config.models) config.models = {};
        config.models.small = body.smallModel as string;
      }
      if (body.largeModel) {
        if (!config.models) config.models = {};
        config.models.large = body.largeModel as string;
      }
    }

    // ── Local LLM provider ────────────────────────────────────────────────
    if (runMode === "local" && body.provider) {
      if (body.providerApiKey) {
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
    if (body.skillsmpApiKey) {
      if (!config.env) config.env = {};
      (config.env as Record<string, string>).SKILLSMP_API_KEY = body.skillsmpApiKey as string;
      process.env.SKILLSMP_API_KEY = body.skillsmpApiKey as string;
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
      state.shareInbox = [];

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

    if (
      !body.password ||
      typeof body.password !== "string" ||
      body.password.length < 4
    ) {
      error(res, "A password of at least 4 characters is required.", 400);
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
    if (passwordLength < 4 || passwordLength > 1024) {
      error(res, "Invalid password length in request envelope.", 400);
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

  // ── GET /api/workbench/overview ────────────────────────────────────────
  // Goal/Todo overview for the Task + Goal workbench UI.
  if (method === "GET" && pathname === "/api/workbench/overview") {
    const runtime = state.runtime;
    const goalSvc = await getGoalDataService(runtime);
    const todoSvc = await getTodoDataService(runtime);

    let goals: GoalDataLike[] = [];
    let todos: TodoDataLike[] = [];

    if (goalSvc) {
      try {
        goals = await goalSvc.getGoals();
      } catch (err) {
        logger.warn(`[milaidy-api] Failed to load goals for workbench: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (todoSvc) {
      try {
        todos = await todoSvc.getTodos({ limit: 300 });
      } catch (err) {
        logger.warn(`[milaidy-api] Failed to load todos for workbench: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    const openGoals = goals.filter((g) => !g.isCompleted);
    const completedGoals = goals.length - openGoals.length;
    const openTodos = todos.filter((t) => !t.isCompleted);
    const completedTodos = todos.length - openTodos.length;

    const now = Date.now();
    const soonCutoff = now + 24 * 60 * 60 * 1000;
    const dueSoonTodos = openTodos.filter((todo) => {
      const dueAt = todo.dueDate ? new Date(todo.dueDate).getTime() : null;
      return dueAt != null && dueAt >= now && dueAt <= soonCutoff;
    }).length;
    const overdueTodos = openTodos.filter((todo) => {
      const dueAt = todo.dueDate ? new Date(todo.dueDate).getTime() : null;
      return dueAt != null && dueAt < now;
    }).length;

    json(res, {
      goals: goals.map((goal) => ({
        id: goal.id,
        name: goal.name,
        description: goal.description ?? null,
        ownerType: goal.ownerType,
        ownerId: goal.ownerId,
        isCompleted: goal.isCompleted,
        completedAt: toIsoOrNull(goal.completedAt),
        createdAt: toIsoOrNull(goal.createdAt),
        updatedAt: toIsoOrNull(goal.updatedAt),
        tags: goal.tags ?? [],
        metadata: goal.metadata ?? {},
      })),
      todos: todos.map((todo) => ({
        id: todo.id,
        name: todo.name,
        description: todo.description ?? null,
        type: todo.type,
        priority: todo.priority ?? null,
        isUrgent: todo.isUrgent,
        isCompleted: todo.isCompleted,
        dueDate: toIsoOrNull(todo.dueDate),
        completedAt: toIsoOrNull(todo.completedAt),
        createdAt: toIsoOrNull(todo.createdAt),
        updatedAt: toIsoOrNull(todo.updatedAt),
        tags: todo.tags ?? [],
        metadata: todo.metadata ?? {},
      })),
      summary: {
        goalCount: goals.length,
        openGoals: openGoals.length,
        completedGoals,
        todoCount: todos.length,
        openTodos: openTodos.length,
        completedTodos,
        dueSoonTodos,
        overdueTodos,
      },
      autonomy: {
        enabled: true,
        loopRunning: getAutonomySvc(runtime)?.isLoopRunning() ?? false,
      },
    });
    return;
  }

  // ── POST /api/workbench/goals ──────────────────────────────────────────
  if (method === "POST" && pathname === "/api/workbench/goals") {
    if (!state.runtime) {
      error(res, "Agent runtime is not running", 503);
      return;
    }

    const body = await readJsonBody<{
      name?: string;
      description?: string;
      ownerType?: "agent" | "entity";
      ownerId?: string;
      priority?: number | null;
      tags?: unknown;
    }>(req, res);
    if (!body) return;

    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) {
      error(res, "Goal name is required", 400);
      return;
    }

    const goalSvc = await getGoalDataService(state.runtime);
    if (!goalSvc) {
      error(res, "Goal service is not available", 501);
      return;
    }

    const ownerType = body.ownerType === "entity" ? "entity" : "agent";
    const rawOwnerId = body.ownerId?.trim() || (ownerType === "entity"
      ? (state.chatUserId ?? state.runtime.agentId)
      : state.runtime.agentId);
    if (!isValidUuid(rawOwnerId)) {
      error(res, "ownerId must be a valid UUID", 400);
      return;
    }
    const ownerId = rawOwnerId as UUID;
    const priority = clampPriority(body.priority);
    const tags = normalizeTags(body.tags);
    const metadata: Record<string, unknown> = {};
    if (priority != null) metadata.priority = priority;

    try {
      const id = await goalSvc.createGoal({
        agentId: state.runtime.agentId,
        ownerType,
        ownerId,
        name,
        description: typeof body.description === "string" ? body.description.trim() : undefined,
        metadata,
        tags,
      });

      if (!id) {
        error(res, "Failed to create goal", 500);
        return;
      }

      const created = await goalSvc.getGoal(id);
      json(res, {
        ok: true,
        id,
        goal: created ? {
          id: created.id,
          name: created.name,
          description: created.description ?? null,
          ownerType: created.ownerType,
          ownerId: created.ownerId,
          isCompleted: created.isCompleted,
          completedAt: toIsoOrNull(created.completedAt),
          createdAt: toIsoOrNull(created.createdAt),
          updatedAt: toIsoOrNull(created.updatedAt),
          tags: created.tags ?? [],
          metadata: created.metadata ?? {},
        } : null,
      });
    } catch (err) {
      error(res, `Failed to create goal: ${err instanceof Error ? err.message : String(err)}`, 500);
    }
    return;
  }

  // ── PATCH /api/workbench/goals/:id ─────────────────────────────────────
  if (method === "PATCH" && pathname.startsWith("/api/workbench/goals/")) {
    if (!state.runtime) {
      error(res, "Agent runtime is not running", 503);
      return;
    }

    const goalId = decodeURIComponent(pathname.slice("/api/workbench/goals/".length));
    if (!goalId || !isValidUuid(goalId)) {
      error(res, "Valid goal UUID is required", 400);
      return;
    }

    const body = await readJsonBody<{
      name?: string;
      description?: string;
      isCompleted?: boolean;
      priority?: number | null;
      tags?: unknown;
    }>(req, res);
    if (!body) return;

    const goalSvc = await getGoalDataService(state.runtime);
    if (!goalSvc) {
      error(res, "Goal service is not available", 501);
      return;
    }

    const hasAnyField = (
      body.name !== undefined
      || body.description !== undefined
      || body.isCompleted !== undefined
      || body.priority !== undefined
      || body.tags !== undefined
    );
    if (!hasAnyField) {
      error(res, "Request body must include at least one updatable goal field", 400);
      return;
    }

    try {
      const updates: {
        name?: string;
        description?: string;
        isCompleted?: boolean;
        completedAt?: Date;
        metadata?: Record<string, unknown>;
        tags?: string[];
      } = {};

      if (typeof body.name === "string") {
        const nextName = body.name.trim();
        if (!nextName) {
          error(res, "Goal name cannot be empty", 400);
          return;
        }
        updates.name = nextName;
      }

      if (typeof body.description === "string") {
        updates.description = body.description.trim();
      }

      if (typeof body.isCompleted === "boolean") {
        updates.isCompleted = body.isCompleted;
        if (body.isCompleted) updates.completedAt = new Date();
      }

      if (body.priority !== undefined) {
        const existing = await goalSvc.getGoal(goalId as UUID);
        const metadata = { ...(existing?.metadata ?? {}) };
        const priority = clampPriority(body.priority);
        if (priority == null) {
          delete metadata.priority;
        } else {
          metadata.priority = priority;
        }
        updates.metadata = metadata;
      }

      if (body.tags !== undefined) {
        updates.tags = normalizeTags(body.tags);
      }

      const ok = await goalSvc.updateGoal(goalId as UUID, updates);
      if (!ok) {
        error(res, "Goal not found or update failed", 404);
        return;
      }
      json(res, { ok: true, id: goalId });
    } catch (err) {
      error(res, `Failed to update goal: ${err instanceof Error ? err.message : String(err)}`, 500);
    }
    return;
  }

  // ── POST /api/workbench/todos ──────────────────────────────────────────
  if (method === "POST" && pathname === "/api/workbench/todos") {
    if (!state.runtime) {
      error(res, "Agent runtime is not running", 503);
      return;
    }

    const body = await readJsonBody<{
      name?: string;
      description?: string;
      type?: "daily" | "one-off" | "aspirational";
      priority?: number | null;
      isUrgent?: boolean;
      dueDate?: string | null;
      tags?: unknown;
    }>(req, res);
    if (!body) return;

    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) {
      error(res, "Todo name is required", 400);
      return;
    }

    const todoSvc = await getTodoDataService(state.runtime);
    if (!todoSvc) {
      error(res, "Todo service is not available", 501);
      return;
    }

    const runtimeAgentId = state.runtime.agentId as UUID;
    if (!state.chatRoomId) state.chatRoomId = stringToUuid(`${runtimeAgentId}:workbench-room`);
    if (!state.chatUserId) state.chatUserId = stringToUuid(`${runtimeAgentId}:workbench-entity`);

    const todoType = body.type === "daily" || body.type === "aspirational" ? body.type : "one-off";
    const priority = clampPriority(body.priority);
    const parsedDueDate = typeof body.dueDate === "string" && body.dueDate.trim()
      ? new Date(body.dueDate)
      : undefined;
    if (parsedDueDate && Number.isNaN(parsedDueDate.getTime())) {
      error(res, "Invalid dueDate format", 400);
      return;
    }

    try {
      const id = await todoSvc.createTodo({
        agentId: runtimeAgentId,
        worldId: stringToUuid(`${runtimeAgentId}:workbench-world`),
        roomId: state.chatRoomId,
        entityId: state.chatUserId,
        name,
        description: typeof body.description === "string" ? body.description.trim() : undefined,
        type: todoType,
        priority: priority ?? undefined,
        isUrgent: body.isUrgent === true,
        dueDate: parsedDueDate,
        metadata: {
          createdBy: "workbench-ui",
        },
        tags: normalizeTags(body.tags),
      });
      json(res, { ok: true, id });
    } catch (err) {
      error(res, `Failed to create todo: ${err instanceof Error ? err.message : String(err)}`, 500);
    }
    return;
  }

  // ── PATCH /api/workbench/todos/:id ─────────────────────────────────────
  if (method === "PATCH" && pathname.startsWith("/api/workbench/todos/")) {
    if (!state.runtime) {
      error(res, "Agent runtime is not running", 503);
      return;
    }

    const todoId = decodeURIComponent(pathname.slice("/api/workbench/todos/".length));
    if (!todoId || !isValidUuid(todoId)) {
      error(res, "Valid todo UUID is required", 400);
      return;
    }

    const body = await readJsonBody<{
      name?: string;
      description?: string;
      priority?: number | null;
      isUrgent?: boolean;
      isCompleted?: boolean;
      dueDate?: string | null;
    }>(req, res);
    if (!body) return;

    const hasAnyField = (
      body.name !== undefined
      || body.description !== undefined
      || body.priority !== undefined
      || body.isUrgent !== undefined
      || body.isCompleted !== undefined
      || body.dueDate !== undefined
    );
    if (!hasAnyField) {
      error(res, "Request body must include at least one updatable todo field", 400);
      return;
    }

    const todoSvc = await getTodoDataService(state.runtime);
    if (!todoSvc) {
      error(res, "Todo service is not available", 501);
      return;
    }

    try {
      const updates: {
        name?: string;
        description?: string;
        priority?: number;
        isUrgent?: boolean;
        isCompleted?: boolean;
        dueDate?: Date;
        completedAt?: Date;
        metadata?: Record<string, unknown>;
      } = {};

      if (typeof body.name === "string") {
        const nextName = body.name.trim();
        if (!nextName) {
          error(res, "Todo name cannot be empty", 400);
          return;
        }
        updates.name = nextName;
      }

      if (typeof body.description === "string") {
        updates.description = body.description.trim();
      }

      if (body.priority !== undefined) {
        const priority = clampPriority(body.priority);
        if (priority != null) updates.priority = priority;
      }

      if (typeof body.isUrgent === "boolean") {
        updates.isUrgent = body.isUrgent;
      }

      if (typeof body.isCompleted === "boolean") {
        updates.isCompleted = body.isCompleted;
        if (body.isCompleted) updates.completedAt = new Date();
      }

      if (body.dueDate !== undefined) {
        if (typeof body.dueDate === "string" && body.dueDate.trim()) {
          const dueDate = new Date(body.dueDate);
          if (Number.isNaN(dueDate.getTime())) {
            error(res, "Invalid dueDate format", 400);
            return;
          }
          updates.dueDate = dueDate;
        } else {
          updates.metadata = { dueDateClearedAt: new Date().toISOString() };
        }
      }

      const ok = await todoSvc.updateTodo(todoId as UUID, updates);
      if (!ok) {
        error(res, "Todo not found or update failed", 404);
        return;
      }
      json(res, { ok: true, id: todoId });
    } catch (err) {
      error(res, `Failed to update todo: ${err instanceof Error ? err.message : String(err)}`, 500);
    }
    return;
  }

  // ── POST /api/ingest/share ─────────────────────────────────────────────
  if (method === "POST" && pathname === "/api/ingest/share") {
    const body = await readJsonBody<{
      source?: string;
      title?: string;
      text?: string;
      url?: string;
      files?: unknown;
    }>(req, res);
    if (!body) return;

    const source = typeof body.source === "string" && body.source.trim() ? body.source.trim() : "unknown-source";
    const title = typeof body.title === "string" && body.title.trim() ? body.title.trim() : null;
    const text = typeof body.text === "string" && body.text.trim() ? body.text.trim() : null;
    const sharedUrl = typeof body.url === "string" && body.url.trim() ? body.url.trim() : null;
    const files = normalizeShareFiles(body.files);

    if (!title && !text && !sharedUrl && files.length === 0) {
      error(res, "Share payload must include title, text, url, or files", 400);
      return;
    }

    const item: ShareIngestItem = {
      id: crypto.randomUUID(),
      source,
      title,
      text,
      url: sharedUrl,
      files,
      createdAt: Date.now(),
      suggestedPrompt: buildShareSuggestedPrompt({
        source,
        title,
        text,
        url: sharedUrl,
        files,
      }),
    };

    state.shareInbox.push(item);
    if (state.shareInbox.length > 100) state.shareInbox.shift();

    json(res, { ok: true, item });
    return;
  }

  // ── GET /api/ingest/share ──────────────────────────────────────────────
  if (method === "GET" && pathname === "/api/ingest/share") {
    const shouldConsume = url.searchParams.get("consume") === "1" || url.searchParams.get("consume") === "true";
    const items = shouldConsume ? state.shareInbox.splice(0) : [...state.shareInbox];
    json(res, { count: items.length, items });
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

    // Use the Zod-validated data (coerced/transformed) instead of raw body.
    const validated = result.data;
    if (state.runtime) {
      const c = state.runtime.character;
      if (validated.name != null) c.name = validated.name;
      if (validated.bio != null)
        c.bio = Array.isArray(validated.bio) ? validated.bio : [String(validated.bio)];
      if (validated.system != null) c.system = validated.system;
      if (validated.adjectives != null) c.adjectives = validated.adjectives;
      if (validated.topics != null) c.topics = validated.topics;
      if (validated.style != null) c.style = validated.style;
      if (validated.postExamples != null) c.postExamples = validated.postExamples;
    }
    if (validated.name) {
      state.agentName = validated.name;
    }
    json(res, { ok: true, character: validated, agentName: state.agentName });
    return;
  }

  // ── GET /api/character/schema ───────────────────────────────────────────
  if (method === "GET" && pathname === "/api/character/schema") {
    json(res, {
      fields: [
        { key: "name", type: "string", label: "Name", description: "Agent display name", maxLength: 100 },
        { key: "username", type: "string", label: "Username", description: "Agent username for platforms", maxLength: 50 },
        { key: "bio", type: "string | string[]", label: "Bio", description: "Biography — single string or array of points" },
        { key: "system", type: "string", label: "System Prompt", description: "System prompt defining core behavior", maxLength: 10000 },
        { key: "adjectives", type: "string[]", label: "Adjectives", description: "Personality adjectives (e.g. curious, witty)" },
        { key: "topics", type: "string[]", label: "Topics", description: "Topics the agent is knowledgeable about" },
        {
          key: "style", type: "object", label: "Style", description: "Communication style guides", children: [
            { key: "all", type: "string[]", label: "All", description: "Style guidelines for all responses" },
            { key: "chat", type: "string[]", label: "Chat", description: "Style guidelines for chat responses" },
            { key: "post", type: "string[]", label: "Post", description: "Style guidelines for social media posts" },
          ]
        },
        { key: "messageExamples", type: "array", label: "Message Examples", description: "Example conversations demonstrating the agent's voice" },
        { key: "postExamples", type: "string[]", label: "Post Examples", description: "Example social media posts" },
      ],
    });
    return;
  }

  // ── GET /api/plugins ────────────────────────────────────────────────────
  if (method === "GET" && pathname === "/api/plugins") {
    // Re-read config from disk so we pick up plugins installed since server start.
    // The install endpoint writes to milaidy.json but state.config is only loaded
    // once at server startup, so it would be stale without this refresh.
    let freshConfig: MilaidyConfig;
    try {
      freshConfig = loadMilaidyConfig();
    } catch {
      freshConfig = state.config;
    }

    // Merge user-installed plugins into the list (they don't exist in plugins.json)
    const bundledIds = new Set(state.plugins.map((p) => p.id));
    const installedEntries = discoverInstalledPlugins(freshConfig, bundledIds);
    const allPlugins = [...state.plugins, ...installedEntries];

    // Update enabled status from runtime (if available)
    if (state.runtime) {
      const loadedNames = state.runtime.plugins.map((p) => p.name);
      for (const plugin of allPlugins) {
        const suffix = `plugin-${plugin.id}`;
        const packageName = `@elizaos/plugin-${plugin.id}`;
        const isLoaded = loadedNames.some(
          (name) => {
            // Check various name formats
            return name === plugin.id
              || name === suffix
              || name === packageName
              || name.endsWith(`/${suffix}`)
              || name.includes(plugin.id);
          },
        );
        plugin.enabled = isLoaded;
        plugin.isActive = isLoaded; // Mark as active if currently loaded in runtime

        if (isLoaded) {
          logger.debug(`[milaidy-api] Plugin ${plugin.id} is active`);
        }
      }
    }

    // Always refresh current env values and re-validate
    for (const plugin of allPlugins) {
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

    // Handle plugin enable/disable with hot-reload
    if (body.enabled !== undefined) {
      plugin.enabled = body.enabled;

      // Update config.plugins.allow to control which plugins load on next restart
      const pluginPackageName = `@elizaos/plugin-${pluginId}`;

      if (!state.config.plugins) {
        state.config.plugins = {};
      }
      if (!state.config.plugins.allow) {
        // Initialize with currently loaded plugins
        if (state.runtime) {
          // Normalize all plugin names to @elizaos/plugin-* format
          state.config.plugins.allow = state.runtime.plugins
            .map((p) => {
              const name = p.name;
              // If already in full package format, keep it
              if (name.startsWith("@elizaos/plugin-")) {
                return name;
              }
              // Otherwise, convert short name to full package name
              return `@elizaos/plugin-${name}`;
            })
            .filter((name) => {
              // Filter out internal pseudo-plugins that aren't real npm packages
              const internalPlugins = [
                "@elizaos/plugin-bootstrap",
                "@elizaos/plugin-milaidy",
              ];
              return !internalPlugins.includes(name);
            });
        } else {
          // Fallback to CORE_PLUGINS if runtime not available
          const { CORE_PLUGINS } = await import("../runtime/eliza.js");
          state.config.plugins.allow = [...CORE_PLUGINS];
        }
      }

      // Add or remove plugin from allow list
      if (body.enabled) {
        if (!state.config.plugins.allow.includes(pluginPackageName)) {
          state.config.plugins.allow.push(pluginPackageName);
          logger.info(`[milaidy-api] Enabled plugin: ${pluginPackageName}`);
        }
      } else {
        state.config.plugins.allow = state.config.plugins.allow.filter(
          (p) => p !== pluginPackageName
        );
        logger.info(`[milaidy-api] Disabled plugin: ${pluginPackageName}`);
      }

      // Save config with updated plugin list
      try {
        saveMilaidyConfig(state.config);
        logger.info(`[milaidy-api] Saved plugin configuration`);
      } catch (err) {
        logger.warn(`[milaidy-api] Failed to save config: ${err instanceof Error ? err.message : String(err)}`);
      }

      // Trigger runtime restart to apply plugin changes
      if (ctx?.onRestart) {
        const onRestartFn = ctx.onRestart;
        logger.info(`[milaidy-api] Restarting runtime to apply plugin changes...`);
        setImmediate(async () => {
          try {
            const newRuntime = await onRestartFn();
            if (newRuntime) {
              state.runtime = newRuntime;
              state.agentState = "running";
              logger.info(`[milaidy-api] Runtime restarted successfully with updated plugins`);
            }
          } catch (err) {
            logger.error(`[milaidy-api] Runtime restart failed: ${err instanceof Error ? err.message : String(err)}`);
            state.agentState = "not_started";
          }
        });
      }
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

    // Update config.plugins.allow for hot-reload
    if (body.enabled !== undefined) {
      const packageName = `@elizaos/plugin-${pluginId}`;

      // Initialize plugins.allow if it doesn't exist
      if (!state.config.plugins) {
        state.config.plugins = {};
      }
      if (!state.config.plugins.allow) {
        state.config.plugins.allow = [];
      }

      const allowList = state.config.plugins.allow as string[];
      const index = allowList.indexOf(packageName);

      if (body.enabled && index === -1) {
        // Add plugin to allow list
        allowList.push(packageName);
        addLog("info", `Enabled plugin: ${packageName}`, "milaidy-api");
      } else if (!body.enabled && index !== -1) {
        // Remove plugin from allow list
        allowList.splice(index, 1);
        addLog("info", `Disabled plugin: ${packageName}`, "milaidy-api");
      }

      // Save updated config
      try {
        saveMilaidyConfig(state.config);
      } catch (err) {
        logger.warn(
          `[milaidy-api] Failed to save config: ${err instanceof Error ? err.message : err}`,
        );
      }

      // Trigger runtime restart if available
      if (callCtx.onRestart) {
        addLog("info", "Triggering runtime restart...", "milaidy-api");
        callCtx
          .onRestart()
          .then((newRuntime) => {
            if (newRuntime) {
              updateRuntime(newRuntime);
              addLog("info", "Runtime restarted successfully", "milaidy-api");
            } else {
              addLog("warn", "Runtime restart returned null", "milaidy-api");
            }
          })
          .catch((err) => {
            addLog(
              "error",
              `Runtime restart failed: ${err instanceof Error ? err.message : err}`,
              "milaidy-api",
            );
          });
      }
    }

    json(res, { ok: true, plugin });
    return;
  }

  // ── GET /api/registry/plugins ──────────────────────────────────────────
  if (method === "GET" && pathname === "/api/registry/plugins") {
    const { getRegistryPlugins } = await import("../services/registry-client.js");
    const { listInstalledPlugins } = await import("../services/plugin-installer.js");
    try {
      const [registry, installed] = await Promise.all([
        getRegistryPlugins(),
        listInstalledPlugins(),
      ]);
      const installedSet = new Set(installed.map((entry) => entry.name));
      const plugins = Array.from(registry.values()) as RegistryPluginLike[];
      plugins.sort((a, b) => b.stars - a.stars || a.name.localeCompare(b.name));

      // Keep first-load latency bounded while still enriching the most likely picks.
      const recencyBudget = Math.min(25, plugins.length);
      const enriched = await Promise.all(
        plugins.map((plugin, index) => enrichRegistryPlugin(plugin, installedSet.has(plugin.name), index < recencyBudget)),
      );

      json(res, { count: enriched.length, plugins: enriched });
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
    const { listInstalledPlugins } = await import("../services/plugin-installer.js");

    try {
      const info = await getPluginInfo(name);
      if (!info) {
        error(res, `Plugin "${name}" not found in registry`, 404);
        return;
      }
      const installed = await listInstalledPlugins();
      const installedSet = new Set(installed.map((entry) => entry.name));
      const enriched = await enrichRegistryPlugin(info as RegistryPluginLike, installedSet.has(info.name), true);
      json(res, { plugin: enriched });
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

  // ── GET /api/plugins/custom-dir ────────────────────────────────────────
  // Returns the path to the custom drop-in plugins directory so the UI
  // can display it and let users open it in their file manager.
  if (method === "GET" && pathname === "/api/plugins/custom-dir") {
    const { resolveStateDir } = await import("../config/paths.js");
    const { CUSTOM_PLUGINS_DIRNAME, scanDropInPlugins } = await import(
      "../runtime/eliza.js"
    );

    const customDir = path.join(resolveStateDir(), CUSTOM_PLUGINS_DIRNAME);
    const records = await scanDropInPlugins(customDir);
    const plugins = Object.entries(records).map(([name, record]) => ({
      name,
      installPath: record.installPath ?? "",
      version: record.version ?? "0.0.0",
    }));

    json(res, { path: customDir, count: plugins.length, plugins });
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
        } catch {
          /* service may not be available */
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
      // eslint-disable-next-line -- service is loosely typed; cast via unknown
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
      // eslint-disable-next-line -- service is loosely typed; cast via unknown
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

  // ── GET /api/skills/marketplace/search?q=... ─────────────────────────
  if (method === "GET" && pathname === "/api/skills/marketplace/search") {
    const query = (url.searchParams.get("q") ?? "").trim();
    const aiMode = ["1", "true", "yes"].includes((url.searchParams.get("ai") ?? "").toLowerCase());
    const limitParam = url.searchParams.get("limit");
    const rawLimit = limitParam ? Number(limitParam) : 20;
    const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(rawLimit, 50)) : 20;

    if (!query) {
      error(res, "Query parameter 'q' is required", 400);
      return;
    }

    try {
      const { searchSkillsMarketplace } = await import("../services/skill-marketplace.js");
      const results = await searchSkillsMarketplace(query, { limit, aiSearch: aiMode });
      json(res, { query, count: results.length, results });
    } catch (err) {
      error(res, `Skills marketplace search failed: ${err instanceof Error ? err.message : String(err)}`, 502);
    }
    return;
  }

  // ── GET /api/skills/marketplace/installed ─────────────────────────────
  if (method === "GET" && pathname === "/api/skills/marketplace/installed") {
    try {
      const { listInstalledMarketplaceSkills } = await import("../services/skill-marketplace.js");
      const workspaceDir = state.config.agents?.defaults?.workspace ?? resolveDefaultAgentWorkspaceDir();
      const skills = await listInstalledMarketplaceSkills(workspaceDir);
      json(res, { count: skills.length, skills });
    } catch (err) {
      error(res, `Failed to list installed skills: ${err instanceof Error ? err.message : String(err)}`, 500);
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
      source?: "skillsmp" | "manual";
      autoRefresh?: boolean;
    }>(req, res);
    if (!body) return;

    if (!body.githubUrl?.trim() && !body.repository?.trim()) {
      error(res, "Request body must include 'githubUrl' or 'repository'", 400);
      return;
    }

    try {
      const { installMarketplaceSkill } = await import("../services/skill-marketplace.js");
      const workspaceDir = state.config.agents?.defaults?.workspace ?? resolveDefaultAgentWorkspaceDir();
      const installed = await installMarketplaceSkill(workspaceDir, {
        githubUrl: body.githubUrl,
        repository: body.repository,
        path: body.path,
        name: body.name,
        description: body.description,
        source: body.source,
      });

      if (body.autoRefresh !== false) {
        state.skills = await discoverSkills(workspaceDir, state.config, state.runtime);
      }

      json(res, {
        ok: true,
        skill: installed,
        refreshedSkills: body.autoRefresh !== false ? state.skills : undefined,
      });
    } catch (err) {
      error(res, `Skill install failed: ${err instanceof Error ? err.message : String(err)}`, 422);
    }
    return;
  }

  // ── POST /api/skills/marketplace/uninstall ────────────────────────────
  if (method === "POST" && pathname === "/api/skills/marketplace/uninstall") {
    const body = await readJsonBody<{ id?: string; autoRefresh?: boolean }>(req, res);
    if (!body) return;

    const skillId = body.id?.trim();
    if (!skillId) {
      error(res, "Request body must include 'id'", 400);
      return;
    }

    try {
      const { uninstallMarketplaceSkill } = await import("../services/skill-marketplace.js");
      const workspaceDir = state.config.agents?.defaults?.workspace ?? resolveDefaultAgentWorkspaceDir();
      const removed = await uninstallMarketplaceSkill(workspaceDir, skillId);

      if (body.autoRefresh !== false) {
        state.skills = await discoverSkills(workspaceDir, state.config, state.runtime);
      }

      json(res, {
        ok: true,
        skill: removed,
        refreshedSkills: body.autoRefresh !== false ? state.skills : undefined,
      });
    } catch (err) {
      error(res, `Skill uninstall failed: ${err instanceof Error ? err.message : String(err)}`, 422);
    }
    return;
  }

  // ── GET /api/skills/marketplace/config ─────────────────────────────────
  // Returns whether the SKILLSMP_API_KEY is set
  if (method === "GET" && pathname === "/api/skills/marketplace/config") {
    json(res, {
      keySet: Boolean(process.env.SKILLSMP_API_KEY?.trim()),
    });
    return;
  }

  // ── PUT /api/skills/marketplace/config ─────────────────────────────────
  // Update the SKILLSMP_API_KEY (for post-onboarding configuration)
  if (method === "PUT" && pathname === "/api/skills/marketplace/config") {
    const body = await readJsonBody<{ apiKey?: string }>(req, res);
    if (!body) return;

    const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
    if (!apiKey) {
      error(res, "Request body must include 'apiKey'", 400);
      return;
    }

    // Update runtime environment
    process.env.SKILLSMP_API_KEY = apiKey;

    // Persist to config file
    if (!state.config.env) state.config.env = {};
    (state.config.env as Record<string, string>).SKILLSMP_API_KEY = apiKey;
    saveMilaidyConfig(state.config);

    json(res, { ok: true, keySet: true });
    return;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // MCP MARKETPLACE ENDPOINTS
  // ══════════════════════════════════════════════════════════════════════════

  // ── GET /api/mcp/marketplace/search?q=... ─────────────────────────────────
  if (method === "GET" && pathname === "/api/mcp/marketplace/search") {
    const query = url.searchParams.get("q") || "";
    const rawLimit = parseInt(url.searchParams.get("limit") || "30", 10);
    const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(rawLimit, 50)) : 30;

    try {
      const { searchMcpMarketplace } = await import("../services/mcp-marketplace.js");
      const { results } = await searchMcpMarketplace(query || undefined, limit);
      json(res, { ok: true, results });
    } catch (err) {
      error(res, `MCP search failed: ${err instanceof Error ? err.message : String(err)}`, 500);
    }
    return;
  }

  // ── GET /api/mcp/marketplace/details/:name ─────────────────────────────────
  if (method === "GET" && pathname.startsWith("/api/mcp/marketplace/details/")) {
    const name = decodeURIComponent(pathname.slice("/api/mcp/marketplace/details/".length));
    if (!name) {
      error(res, "Server name is required", 400);
      return;
    }
    try {
      const { getMcpServerDetails } = await import("../services/mcp-marketplace.js");
      const details = await getMcpServerDetails(name);
      if (!details) {
        error(res, `Server "${name}" not found in registry`, 404);
        return;
      }
      json(res, { ok: true, server: details });
    } catch (err) {
      error(res, `Failed to fetch server details: ${err instanceof Error ? err.message : String(err)}`, 500);
    }
    return;
  }

  // ── GET /api/mcp/config ────────────────────────────────────────────────────
  // Returns the current MCP server configuration
  if (method === "GET" && pathname === "/api/mcp/config") {
    // MCP config is stored in state.config.plugins["@elizaos/plugin-mcp"].mcp
    const pluginSettings = (state.config.plugins as Record<string, unknown> | undefined)?.["@elizaos/plugin-mcp"] as Record<string, unknown> | undefined;
    const mcpConfigRaw = pluginSettings?.mcp;

    let servers: Record<string, unknown> = {};
    if (typeof mcpConfigRaw === "string") {
      try {
        const parsed = JSON.parse(mcpConfigRaw) as { servers?: Record<string, unknown> };
        servers = parsed.servers || {};
      } catch { /* ignore parse errors */ }
    } else if (typeof mcpConfigRaw === "object" && mcpConfigRaw !== null) {
      servers = (mcpConfigRaw as { servers?: Record<string, unknown> }).servers || {};
    }

    json(res, { ok: true, servers });
    return;
  }

  // ── PUT /api/mcp/config ────────────────────────────────────────────────────
  // Replace entire MCP config
  if (method === "PUT" && pathname === "/api/mcp/config") {
    const body = await readJsonBody<{ servers?: Record<string, Record<string, unknown>> }>(req, res);
    if (!body) return;

    // Security: validate each server the same way POST /api/mcp/config/server does
    const validTypes = ["stdio", "http", "streamable-http", "sse"];
    const allowedCommands = ["npx", "node", "docker", "deno", "bun", "uvx", "python", "python3"];
    const servers = body.servers ?? {};
    for (const [name, cfg] of Object.entries(servers)) {
      if (!cfg || typeof cfg !== "object") {
        error(res, `Server "${name}": config must be an object`, 400);
        return;
      }
      const cfgType = cfg.type;
      if (typeof cfgType !== "string" || !validTypes.includes(cfgType)) {
        error(res, `Server "${name}": config.type must be one of: ${validTypes.join(", ")}`, 400);
        return;
      }
      if (cfgType === "stdio") {
        const cmd = cfg.command;
        if (typeof cmd !== "string" || !cmd.trim()) {
          error(res, `Server "${name}": config.command required for stdio`, 400);
          return;
        }
        const baseName = cmd.trim().split("/").pop()?.split("\\").pop() ?? "";
        if (!allowedCommands.includes(baseName)) {
          error(res, `Server "${name}": command must be one of: ${allowedCommands.join(", ")}`, 400);
          return;
        }
      } else {
        const serverUrl = cfg.url;
        if (typeof serverUrl !== "string" || !serverUrl.trim()) {
          error(res, `Server "${name}": config.url required for remote servers`, 400);
          return;
        }
        try { new URL(serverUrl as string); } catch {
          error(res, `Server "${name}": config.url must be a valid URL`, 400);
          return;
        }
      }
    }

    if (!state.config.plugins) state.config.plugins = {} as unknown as typeof state.config.plugins;
    const plugins = state.config.plugins as Record<string, unknown>;
    if (!plugins["@elizaos/plugin-mcp"]) {
      plugins["@elizaos/plugin-mcp"] = {};
    }

    const pluginConfig = plugins["@elizaos/plugin-mcp"] as Record<string, unknown>;
    pluginConfig.mcp = JSON.stringify({ servers });
    saveMilaidyConfig(state.config);

    json(res, { ok: true });
    return;
  }

  // ── POST /api/mcp/config/server ────────────────────────────────────────────
  // Add or update a single MCP server
  if (method === "POST" && pathname === "/api/mcp/config/server") {
    const body = await readJsonBody<{ name: string; config: Record<string, unknown> }>(req, res);
    if (!body) return;

    const serverName = typeof body.name === "string" ? body.name.trim() : "";
    const serverConfig = body.config;
    if (!serverName) {
      error(res, "Request body must include 'name' (non-empty string)", 400);
      return;
    }
    if (!serverConfig || typeof serverConfig !== "object") {
      error(res, "Request body must include 'config' (object)", 400);
      return;
    }

    // Validate config type
    const validTypes = ["stdio", "http", "streamable-http", "sse"];
    const configType = (serverConfig as Record<string, unknown>).type;
    if (typeof configType !== "string" || !validTypes.includes(configType)) {
      error(res, `config.type must be one of: ${validTypes.join(", ")}`, 400);
      return;
    }

    if (configType === "stdio") {
      const cmd = (serverConfig as Record<string, unknown>).command;
      if (typeof cmd !== "string" || !cmd.trim()) {
        error(res, "config.command is required for stdio servers", 400);
        return;
      }
      // Security: Only allow known safe commands for MCP stdio servers
      const allowedCommands = ["npx", "node", "docker", "deno", "bun", "uvx", "python", "python3"];
      const baseName = cmd.trim().split("/").pop()?.split("\\").pop() ?? "";
      if (!allowedCommands.includes(baseName)) {
        error(res, `config.command must be one of: ${allowedCommands.join(", ")}`, 400);
        return;
      }
    } else {
      const url = (serverConfig as Record<string, unknown>).url;
      if (typeof url !== "string" || !url.trim()) {
        error(res, "config.url is required for remote servers", 400);
        return;
      }
      try { new URL(url as string); } catch {
        error(res, "config.url must be a valid URL", 400);
        return;
      }
    }

    // Get current config
    if (!state.config.plugins) state.config.plugins = {} as unknown as typeof state.config.plugins;
    const mcpPlugins = state.config.plugins as Record<string, unknown>;
    if (!mcpPlugins["@elizaos/plugin-mcp"]) {
      mcpPlugins["@elizaos/plugin-mcp"] = {};
    }
    const pluginConfig = mcpPlugins["@elizaos/plugin-mcp"] as Record<string, unknown>;

    let servers: Record<string, unknown> = {};
    if (typeof pluginConfig.mcp === "string") {
      try {
        const parsed = JSON.parse(pluginConfig.mcp) as { servers?: Record<string, unknown> };
        servers = parsed.servers || {};
      } catch { /* ignore */ }
    } else if (typeof pluginConfig.mcp === "object" && pluginConfig.mcp !== null) {
      servers = (pluginConfig.mcp as { servers?: Record<string, unknown> }).servers || {};
    }

    // Add/update server
    servers[serverName] = serverConfig;
    pluginConfig.mcp = JSON.stringify({ servers });
    saveMilaidyConfig(state.config);

    json(res, { ok: true, name: serverName, requiresRestart: true });
    return;
  }

  // ── DELETE /api/mcp/config/server/:name ────────────────────────────────────
  // Remove a single MCP server
  if (method === "DELETE" && pathname.startsWith("/api/mcp/config/server/")) {
    const serverName = decodeURIComponent(pathname.slice("/api/mcp/config/server/".length));
    if (!serverName) {
      error(res, "Server name is required", 400);
      return;
    }

    // Get current config
    const pluginConfig = (state.config.plugins as Record<string, unknown> | undefined)?.["@elizaos/plugin-mcp"] as Record<string, unknown> | undefined;
    if (!pluginConfig) {
      json(res, { ok: true }); // Already doesn't exist
      return;
    }

    let servers: Record<string, unknown> = {};
    if (typeof pluginConfig.mcp === "string") {
      try {
        const parsed = JSON.parse(pluginConfig.mcp) as { servers?: Record<string, unknown> };
        servers = parsed.servers || {};
      } catch { /* ignore */ }
    } else if (typeof pluginConfig.mcp === "object" && pluginConfig.mcp !== null) {
      servers = (pluginConfig.mcp as { servers?: Record<string, unknown> }).servers || {};
    }

    // Remove server
    delete servers[serverName];
    pluginConfig.mcp = JSON.stringify({ servers });
    saveMilaidyConfig(state.config);

    json(res, { ok: true, requiresRestart: true });
    return;
  }

  // ── GET /api/mcp/status ────────────────────────────────────────────────────
  // Returns live connection status of configured MCP servers
  if (method === "GET" && pathname === "/api/mcp/status") {
    const mcpSvc = state.runtime?.getService("mcp") as McpServiceLike | null;
    if (!mcpSvc || typeof mcpSvc.getServers !== "function") {
      json(res, { ok: true, servers: [] });
      return;
    }
    try {
      const servers = mcpSvc.getServers().map((s) => ({
        name: s.name,
        status: s.status,
        error: s.error || null,
        toolCount: Array.isArray(s.tools) ? s.tools.length : 0,
        resourceCount: Array.isArray(s.resources) ? s.resources.length : 0,
      }));
      json(res, { ok: true, servers });
    } catch (err) {
      error(res, `Failed to get MCP status: ${err instanceof Error ? err.message : String(err)}`, 500);
    }
    return;
  }

  // ══════════════════════════════════════════════════════════════════════════

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
    (state.config.env as Record<string, string>)[envKey] =
      process.env[envKey] ?? "";

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

  // ── Cloud routes (/api/cloud/*) ─────────────────────────────────────────
  if (pathname.startsWith("/api/cloud/")) {
    const cloudState: CloudRouteState = {
      config: state.config,
      cloudManager: state.cloudManager,
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

  // ── POST /api/chat ──────────────────────────────────────────────────────
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
      const body = await readJsonBody<{ text?: string }>(req, res);
      if (!body) return;
      if (!body.text?.trim()) {
        error(res, "text is required");
        return;
      }

      const wantsStream = (req.headers.accept ?? "").includes(
        "text/event-stream",
      );

      if (wantsStream) {
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
        });

        for await (const chunk of proxy.handleChatMessageStream(
          body.text.trim(),
        )) {
          res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
        }
        res.write(`event: done\ndata: {}\n\n`);
        res.end();
      } else {
        const responseText = await proxy.handleChatMessage(body.text.trim());
        json(res, { text: responseText, agentName: proxy.agentName });
      }
      return;
    }

    // ── Local runtime path (existing code below) ───────────────────────
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

  // ── GET /api/cloud/status ─────────────────────────────────────────────
  if (method === "GET" && pathname === "/api/cloud/status") {
    const rt = state.runtime;
    if (!rt) {
      json(res, { connected: false, reason: "runtime_not_started" });
      return;
    }
    const cloudAuth = rt.getService("CLOUD_AUTH") as {
      isAuthenticated: () => boolean;
      getUserId: () => string | undefined;
      getOrganizationId: () => string | undefined;
    } | null;
    if (!cloudAuth || !cloudAuth.isAuthenticated()) {
      json(res, { connected: false, reason: "not_authenticated" });
      return;
    }
    json(res, {
      connected: true,
      userId: cloudAuth.getUserId(),
      organizationId: cloudAuth.getOrganizationId(),
      topUpUrl: "https://www.elizacloud.ai/dashboard/billing",
    });
    return;
  }

  // ── GET /api/cloud/credits ──────────────────────────────────────────────
  if (method === "GET" && pathname === "/api/cloud/credits") {
    const rt = state.runtime;
    if (!rt) {
      json(res, { balance: null, connected: false });
      return;
    }
    const cloudAuth = rt.getService("CLOUD_AUTH") as {
      isAuthenticated: () => boolean;
      getClient: () => { get: <T>(path: string) => Promise<T> };
    } | null;
    if (!cloudAuth || !cloudAuth.isAuthenticated()) {
      json(res, { balance: null, connected: false });
      return;
    }
    let balance: number;
    const client = cloudAuth.getClient();
    try {
      const creditResponse = await client.get<{
        success: boolean;
        data: { balance: number; currency: string };
      }>("/credits/balance");
      balance = creditResponse.data.balance;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "cloud API unreachable";
      logger.warn(`[cloud/credits] Failed to fetch balance: ${msg}`);
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
    shareInbox: [],
  };

  // ── Cloud Manager initialisation ──────────────────────────────────────
  if (config.cloud?.enabled && config.cloud?.apiKey) {
    const mgr = new CloudManager(config.cloud, {
      onStatusChange: (s) => {
        addLog("info", `Cloud connection status: ${s}`, "cloud");
      },
    });
    mgr.init();
    state.cloudManager = mgr;
    addLog("info", "Cloud manager initialised (ELIZA Cloud enabled)", "cloud");
  }

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

  // ── WebSocket Server ─────────────────────────────────────────────────────
  const wss = new WebSocketServer({ noServer: true });
  const wsClients = new Set<WebSocket>();

  // Handle upgrade requests for WebSocket
  server.on("upgrade", (request, socket, head) => {
    try {
      const { pathname } = new URL(
        request.url ?? "/",
        `http://${request.headers.host}`,
      );
      if (pathname === "/ws") {
        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit("connection", ws, request);
        });
      } else {
        socket.destroy();
      }
    } catch (err) {
      logger.error(
        `[milaidy-api] WebSocket upgrade error: ${err instanceof Error ? err.message : err}`,
      );
      socket.destroy();
    }
  });

  // Handle WebSocket connections
  wss.on("connection", (ws: WebSocket) => {
    wsClients.add(ws);
    addLog("info", "WebSocket client connected", "websocket");

    // Send initial status
    try {
      ws.send(
        JSON.stringify({
          type: "status",
          data: {
            agentState: state.agentState,
            agentName: state.agentName,
            model: state.model,
            startedAt: state.startedAt,
          },
        }),
      );
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
        }
      } catch (err) {
        logger.error(
          `[milaidy-api] WebSocket message error: ${err instanceof Error ? err.message : err}`,
        );
      }
    });

    ws.on("close", () => {
      wsClients.delete(ws);
      addLog("info", "WebSocket client disconnected", "websocket");
    });

    ws.on("error", (err) => {
      logger.error(
        `[milaidy-api] WebSocket error: ${err instanceof Error ? err.message : err}`,
      );
      wsClients.delete(ws);
    });
  });

  // Broadcast status to all connected WebSocket clients
  const broadcastStatus = () => {
    const statusData = {
      type: "status",
      data: {
        agentState: state.agentState,
        agentName: state.agentName,
        model: state.model,
        startedAt: state.startedAt,
      },
    };
    const message = JSON.stringify(statusData);
    for (const client of wsClients) {
      if (client.readyState === 1) {
        // OPEN
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

  /** Hot-swap the runtime reference (used after an in-process restart). */
  const updateRuntime = (rt: AgentRuntime): void => {
    state.runtime = rt;
    state.agentState = "running";
    state.agentName = rt.character.name ?? "Milaidy";
    state.startedAt = Date.now();
    addLog("info", `Runtime restarted — agent: ${state.agentName}`, "system");
    // Broadcast status update immediately after restart
    broadcastStatus();
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
            clearInterval(statusInterval);
            wss.close();
            server.close(() => r());
          }),
        updateRuntime,
      });
    });
  });
}
