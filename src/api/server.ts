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
import { type WebSocket, WebSocketServer } from "ws";
import { CloudManager } from "../cloud/cloud-manager.js";
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
import {
  installMarketplaceSkill,
  listInstalledMarketplaceSkills,
  searchSkillsMarketplace,
  uninstallMarketplaceSkill,
} from "../services/skill-marketplace.js";
import { type CloudRouteState, handleCloudRoute } from "./cloud-routes.js";
import { handleDatabaseRoute } from "./database.js";
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

/** Metadata for a web-chat conversation. */
interface ConversationMeta {
  id: string;
  title: string;
  roomId: UUID;
  createdAt: string;
  updatedAt: string;
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
  /** Conversation metadata by conversation id. */
  conversations: Map<string, ConversationMeta>;
  /** Cloud manager for Eliza Cloud integration (null when cloud is disabled). */
  cloudManager: CloudManager | null;
  /** App manager for launching and managing ElizaOS apps. */
  appManager: AppManager;
  /** In-memory queue for share ingest items. */
  shareIngestQueue: ShareIngestItem[];
  /** Transient OAuth flow state for subscription auth. */
  _anthropicFlow?: import("../auth/anthropic.js").AnthropicFlow;
  _codexFlow?: import("../auth/openai-codex.js").CodexFlow;
  _codexFlowTimer?: ReturnType<typeof setTimeout>;
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
    const parsed = JSON.parse(content);
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
                const parsed = JSON.parse(raw);
                if (parsed?.status) scanStatus = parsed.status;
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
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(data));
}

function error(res: http.ServerResponse, message: string, status = 400): void {
  json(res, { error: message }, status);
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
      description: "Free credits to start, but they run out.",
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
  return {
    small: [
      {
        id: "claude-haiku",
        name: "Claude Haiku (latest)",
        provider: "anthropic",
        description: "Fast and efficient. Default small model.",
      },
      {
        id: "gpt-4o-mini",
        name: "GPT-4o Mini",
        provider: "openai",
        description: "OpenAI's compact model.",
      },
      {
        id: "gemini-flash",
        name: "Gemini Flash",
        provider: "google",
        description: "Google's fast model.",
      },
    ],
    large: [
      {
        id: "claude-sonnet-4-5",
        name: "Claude Sonnet 4.5",
        provider: "anthropic",
        description: "Powerful reasoning. Default large model.",
      },
      {
        id: "gpt-4o",
        name: "GPT-4o",
        provider: "openai",
        description: "OpenAI's flagship model.",
      },
      {
        id: "claude-opus-4-6",
        name: "Claude Opus 4.6",
        provider: "anthropic",
        description: "Most capable Claude model. Deep reasoning.",
      },
      {
        id: "gemini-pro",
        name: "Gemini Pro",
        provider: "google",
        description: "Google's advanced model.",
      },
    ],
  };
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
        } catch {
          /* */
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
          } catch {
            /* */
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
        } catch {
          /* */
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
    // Theme is UI-only (milady, haxor, qt314, etc.) — no server validation needed
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

    // Update enabled status from runtime (if available)
    if (state.runtime) {
      const loadedNames = state.runtime.plugins.map((p) => p.name);
      for (const plugin of allPlugins) {
        const suffix = `plugin-${plugin.id}`;
        const packageName = `@elizaos/plugin-${plugin.id}`;
        const isLoaded = loadedNames.some((name) => {
          return (
            name === plugin.id ||
            name === suffix ||
            name === packageName ||
            name.endsWith(`/${suffix}`) ||
            name.includes(plugin.id)
          );
        });
        plugin.enabled = isLoaded;
        plugin.isActive = isLoaded;
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
        logger.info(`[milaidy-api] Enabled plugin: ${packageName}`);
      } else if (!body.enabled && index !== -1) {
        // Remove plugin from allow list
        allowList.splice(index, 1);
        logger.info(`[milaidy-api] Disabled plugin: ${packageName}`);
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
      if (ctx?.onRestart) {
        logger.info("[milaidy-api] Triggering runtime restart...");
        ctx
          .onRestart()
          .then((newRuntime) => {
            if (newRuntime) {
              state.runtime = newRuntime;
              state.agentState = "running";
              state.agentName = newRuntime.character.name ?? "Milaidy";
              state.startedAt = Date.now();
              logger.info("[milaidy-api] Runtime restarted successfully");
            } else {
              logger.warn("[milaidy-api] Runtime restart returned null");
            }
          })
          .catch((err) => {
            logger.error(
              `[milaidy-api] Runtime restart failed: ${err instanceof Error ? err.message : err}`,
            );
          });
      }
    }

    json(res, { ok: true, plugin });
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
      } catch {
        /* service unavailable */
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
      } catch {
        /* service unavailable */
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
      const limit = limitStr ? Math.min(Math.max(Number(limitStr), 1), 50) : 20;
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
    const BLOCKED_KEYS = new Set(["__proto__", "constructor", "prototype"]);

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
        if (BLOCKED_KEYS.has(key)) continue;
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
      if (ALLOWED_TOP_KEYS.has(key) && !BLOCKED_KEYS.has(key)) {
        filtered[key] = body[key];
      }
    }

    safeMerge(state.config as Record<string, unknown>, filtered);

    try {
      saveMilaidyConfig(state.config);
    } catch {
      // In test environments the config path may not be writable — that's fine.
    }
    json(res, redactConfigSecrets(state.config));
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

  // ═══════════════════════════════════════════════════════════════════════
  // Conversation routes (/api/conversations/*)
  // ═══════════════════════════════════════════════════════════════════════

  // Helper: ensure a persistent chat user exists.
  const ensureChatUser = async (): Promise<UUID> => {
    if (!state.chatUserId) {
      state.chatUserId = crypto.randomUUID() as UUID;
    }
    return state.chatUserId;
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
    const userId = await ensureChatUser();
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
    // Ensure the world has ownership metadata so the settings provider
    // can locate it via findWorldsForOwner during onboarding / DM flows.
    const world = await runtime.getWorld(worldId);
    if (world) {
      let needsUpdate = false;
      if (!world.metadata) {
        world.metadata = {};
        needsUpdate = true;
      }
      if (
        !world.metadata.ownership ||
        typeof world.metadata.ownership !== "object" ||
        (world.metadata.ownership as { ownerId: string }).ownerId !== userId
      ) {
        world.metadata.ownership = { ownerId: userId };
        needsUpdate = true;
      }
      if (needsUpdate) {
        await runtime.updateWorld(world);
      }
    }
  };

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
    if (!state.runtime) {
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
      const messages = memories.map((m) => ({
        id: m.id ?? "",
        role: m.entityId === agentId ? "assistant" : "user",
        text: (m.content as { text?: string })?.text ?? "",
        timestamp: m.createdAt ?? 0,
      }));
      json(res, { messages });
    } catch (err) {
      error(
        res,
        `Failed to fetch messages: ${err instanceof Error ? err.message : String(err)}`,
        500,
      );
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

    // Cloud proxy path
    const proxy = state.cloudManager?.getProxy();
    if (proxy) {
      const responseText = await proxy.handleChatMessage(body.text.trim());
      conv.updatedAt = new Date().toISOString();
      json(res, { text: responseText, agentName: proxy.agentName });
      return;
    }

    try {
      const runtime = state.runtime;
      const userId = await ensureChatUser();
      await ensureConversationRoom(conv);

      const message = createMessageMemory({
        id: crypto.randomUUID() as UUID,
        entityId: userId,
        roomId: conv.roomId,
        content: {
          text: body.text.trim(),
          source: "client_chat",
          channelType: ChannelType.DM,
        },
      });

      let responseText = "";
      const result = await runtime.messageService?.handleMessage(
        runtime,
        message,
        async (content: Content) => {
          if (content?.text) {
            responseText += content.text;
          }
          return [];
        },
      );

      // Fallback: if the callback didn't capture text (e.g. "actions" mode
      // where processActions drives the callback), pull it from the return
      // value which always carries the primary responseContent.
      if (!responseText && result?.responseContent?.text) {
        responseText = result.responseContent.text;
      }

      conv.updatedAt = new Date().toISOString();
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
        // Use a deterministic messageServerId so the settings provider
        // can reference the world by serverId after it is found.
        const messageServerId = stringToUuid(`${agentName}-web-server`) as UUID;
        await runtime.ensureConnection({
          entityId: state.chatUserId,
          roomId: state.chatRoomId,
          worldId,
          userName: "User",
          source: "client_chat",
          channelId: `${agentName}-web-chat`,
          type: ChannelType.DM,
          messageServerId,
          metadata: { ownership: { ownerId: state.chatUserId } },
        });
        // Ensure the world has ownership metadata so the settings
        // provider can locate it via findWorldsForOwner during onboarding.
        // This also handles worlds that already exist from a prior session
        // but were created without ownership metadata.
        const world = await runtime.getWorld(worldId);
        if (world) {
          let needsUpdate = false;
          if (!world.metadata) {
            world.metadata = {};
            needsUpdate = true;
          }
          if (
            !world.metadata.ownership ||
            typeof world.metadata.ownership !== "object" ||
            (world.metadata.ownership as { ownerId: string }).ownerId !==
              state.chatUserId
          ) {
            world.metadata.ownership = {
              ownerId: state.chatUserId ?? "",
            };
            needsUpdate = true;
          }
          if (needsUpdate) {
            await runtime.updateWorld(world);
          }
        }
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

      const result = await runtime.messageService?.handleMessage(
        runtime,
        message,
        async (content: Content) => {
          if (content?.text) {
            responseText += content.text;
          }
          return [];
        },
      );

      // Fallback: use the return value's responseContent when the callback
      // didn't capture text (e.g. "actions" mode).
      if (!responseText && result?.responseContent?.text) {
        responseText = result.responseContent.text;
      }

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
    if (!cloudAuth || !cloudAuth.isAuthenticated()) {
      json(res, {
        connected: false,
        enabled: cloudEnabled,
        hasApiKey,
        reason: "not_authenticated",
      });
      return;
    }
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
    const limitStr = url.searchParams.get("limit");
    const limit = limitStr
      ? Math.min(Math.max(parseInt(limitStr, 10), 1), 50)
      : 15;
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
      const limitStr = url.searchParams.get("limit");
      const limit = limitStr
        ? Math.min(Math.max(parseInt(limitStr, 10), 1), 50)
        : 15;
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

  // ═══════════════════════════════════════════════════════════════════════
  // Workbench routes
  // ═══════════════════════════════════════════════════════════════════════

  // ── GET /api/workbench/overview ──────────────────────────────────────
  if (method === "GET" && pathname === "/api/workbench/overview") {
    const goals: unknown[] = [];
    const todos: unknown[] = [];
    const summary = {
      totalGoals: 0,
      completedGoals: 0,
      totalTodos: 0,
      completedTodos: 0,
    };
    const autonomy = { enabled: true, thinking: false };
    let goalsAvailable = false;
    let todosAvailable = false;

    if (state.runtime) {
      // Goals: access via the GOAL_DATA service registered by @elizaos/plugin-goals
      try {
        const goalService = state.runtime.getService("GOAL_DATA" as never) as {
          getDataService?: () => {
            getGoals: (
              filters: Record<string, unknown>,
            ) => Promise<Record<string, unknown>[]>;
          } | null;
        } | null;
        const goalData = goalService?.getDataService?.();
        goalsAvailable = goalData != null;
        if (goalData) {
          const dbGoals = await goalData.getGoals({
            ownerId: state.runtime.agentId,
            ownerType: "agent",
          });
          goals.push(...dbGoals);
          summary.totalGoals = dbGoals.length;
          summary.completedGoals = dbGoals.filter(
            (g) => g.isCompleted === true,
          ).length;
        }
      } catch {
        // Plugin not loaded or errored — goals unavailable
      }

      // Todos: create a data service on the fly (plugin-todo pattern)
      try {
        const todoModule = (await import(
          "@elizaos/plugin-todo"
        )) as unknown as Record<string, unknown>;
        const createTodoDataService = todoModule.createTodoDataService as
          | ((rt: unknown) => {
              getTodos: (
                filters: Record<string, unknown>,
              ) => Promise<Record<string, unknown>[]>;
            })
          | undefined;
        if (createTodoDataService) {
          const todoData = createTodoDataService(state.runtime);
          todosAvailable = true;
          const dbTodos = await todoData.getTodos({
            agentId: state.runtime.agentId,
          });
          todos.push(...dbTodos);
          summary.totalTodos = dbTodos.length;
          summary.completedTodos = dbTodos.filter(
            (t) => t.isCompleted === true,
          ).length;
        }
      } catch {
        // Plugin not loaded or errored — todos unavailable
      }
    }

    json(res, {
      goals,
      todos,
      summary,
      autonomy,
      goalsAvailable,
      todosAvailable,
    });
    return;
  }

  // ── PATCH /api/workbench/goals/:id ───────────────────────────────────
  if (method === "PATCH" && pathname.startsWith("/api/workbench/goals/")) {
    if (!state.runtime) {
      error(res, "Agent runtime is not available", 503);
      return;
    }
    const goalId = pathname.slice("/api/workbench/goals/".length);
    const body = await readJsonBody(req, res);
    if (!body) return;
    json(res, { ok: true, goalId, updated: body });
    return;
  }

  // ── POST /api/workbench/goals ────────────────────────────────────────
  if (method === "POST" && pathname === "/api/workbench/goals") {
    if (!state.runtime) {
      error(res, "Agent runtime is not available", 503);
      return;
    }
    const body = await readJsonBody(req, res);
    if (!body) return;
    json(res, { ok: true, goal: body });
    return;
  }

  // ── PATCH /api/workbench/todos/:id ───────────────────────────────────
  if (method === "PATCH" && pathname.startsWith("/api/workbench/todos/")) {
    if (!state.runtime) {
      error(res, "Agent runtime is not available", 503);
      return;
    }
    const todoId = pathname.slice("/api/workbench/todos/".length);
    const body = await readJsonBody(req, res);
    if (!body) return;
    json(res, { ok: true, todoId, updated: body });
    return;
  }

  // ── POST /api/workbench/todos ────────────────────────────────────────
  if (method === "POST" && pathname === "/api/workbench/todos") {
    if (!state.runtime) {
      error(res, "Agent runtime is not available", 503);
      return;
    }
    const body = await readJsonBody(req, res);
    if (!body) return;
    json(res, { ok: true, todo: body });
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
    const limit = limitStr ? Math.min(Math.max(Number(limitStr), 1), 50) : 30;
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
    const serverName = decodeURIComponent(
      pathname.slice("/api/mcp/marketplace/details/".length),
    );
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

    const config = body.config as Record<string, unknown> | undefined;
    if (!config || typeof config !== "object") {
      error(res, "Server config object is required", 400);
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
    state.config.mcp.servers[serverName] = config as NonNullable<
      NonNullable<typeof state.config.mcp>["servers"]
    >[string];

    try {
      saveMilaidyConfig(state.config);
    } catch {
      // Config path may not be writable in test environments
    }

    json(res, { ok: true, name: serverName, requiresRestart: true });
    return;
  }

  // ── DELETE /api/mcp/config/server/:name ──────────────────────────────
  if (method === "DELETE" && pathname.startsWith("/api/mcp/config/server/")) {
    const serverName = decodeURIComponent(
      pathname.slice("/api/mcp/config/server/".length),
    );

    if (state.config.mcp?.servers?.[serverName]) {
      delete state.config.mcp.servers[serverName];
      try {
        saveMilaidyConfig(state.config);
      } catch {
        // Config path may not be writable in test environments
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
      state.config.mcp.servers = body.servers as NonNullable<
        NonNullable<typeof state.config.mcp>["servers"]
      >;
    }

    try {
      saveMilaidyConfig(state.config);
    } catch {
      // Config path may not be writable in test environments
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
      } catch {
        // MCP service not available
      }
    }

    json(res, { ok: true, servers });
    return;
  }

  // ── Fallback ────────────────────────────────────────────────────────────
  error(res, "Not found", 404);
}

// ---------------------------------------------------------------------------
// Early log capture
// ---------------------------------------------------------------------------
// Call `captureEarlyLogs()` BEFORE starting the runtime to buffer logs from
// the global @elizaos/core logger.  The buffered entries are flushed into
// the API server's logBuffer when `startApiServer` runs.
// ---------------------------------------------------------------------------

interface EarlyLogEntry {
  timestamp: number;
  level: string;
  message: string;
  source: string;
  tags: string[];
}

let earlyLogBuffer: EarlyLogEntry[] | null = null;
let earlyPatchCleanup: (() => void) | null = null;

/**
 * Start capturing logs from the global @elizaos/core logger before the API
 * server is up.  Call this once, early in the startup flow (e.g. before
 * `startEliza`).  When `startApiServer` runs it will flush and take over.
 */
export function captureEarlyLogs(): void {
  if (earlyLogBuffer) return; // already capturing
  // If the global logger is already fully patched (e.g. dev-server started
  // the API server before calling startEliza), skip early capture entirely.
  if ((logger as unknown as Record<string, unknown>).__milaidyLogPatched)
    return;
  earlyLogBuffer = [];
  const EARLY_PATCHED = "__milaidyEarlyPatched";
  if ((logger as unknown as Record<string, unknown>)[EARLY_PATCHED]) return;

  const LEVELS = ["debug", "info", "warn", "error"] as const;
  const originals = new Map<string, (...args: unknown[]) => void>();

  for (const lvl of LEVELS) {
    const original = logger[lvl].bind(logger);
    originals.set(lvl, original as (...args: unknown[]) => void);
    const earlyPatched: (typeof logger)[typeof lvl] = (
      ...args: Parameters<typeof original>
    ) => {
      let msg = "";
      let source = "agent";
      const tags = ["agent"];
      if (typeof args[0] === "string") {
        msg = args[0];
      } else if (args[0] && typeof args[0] === "object") {
        const obj = args[0] as Record<string, unknown>;
        if (typeof obj.src === "string") source = obj.src;
        msg = typeof args[1] === "string" ? args[1] : JSON.stringify(obj);
      }
      const bracketMatch = /^\[([^\]]+)\]\s*/.exec(msg);
      if (bracketMatch && source === "agent") source = bracketMatch[1];
      if (source !== "agent" && !tags.includes(source)) tags.push(source);
      earlyLogBuffer?.push({
        timestamp: Date.now(),
        level: lvl,
        message: msg,
        source,
        tags,
      });
      return original(...args);
    };
    logger[lvl] = earlyPatched;
  }

  (logger as unknown as Record<string, unknown>)[EARLY_PATCHED] = true;

  earlyPatchCleanup = () => {
    // Restore originals so `patchLogger` inside `startApiServer` can re-patch
    for (const lvl of LEVELS) {
      const orig = originals.get(lvl);
      if (orig) logger[lvl] = orig as (typeof logger)[typeof lvl];
    }
    delete (logger as unknown as Record<string, unknown>)[EARLY_PATCHED];
    // Don't set the main PATCHED_MARKER — `patchLogger` will do that
    delete (logger as unknown as Record<string, unknown>).__milaidyLogPatched;
  };
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
    ? (opts.runtime?.character.name ?? "Milaidy")
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
    conversations: new Map(),
    cloudManager: null,
    appManager: new AppManager(),
    shareIngestQueue: [],
  };

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
  if (earlyLogBuffer && earlyLogBuffer.length > 0) {
    for (const entry of earlyLogBuffer) {
      state.logBuffer.push(entry);
    }
    if (state.logBuffer.length > 1000) {
      state.logBuffer.splice(0, state.logBuffer.length - 1000);
    }
    addLog(
      "info",
      `Flushed ${earlyLogBuffer.length} early startup log entries`,
      "system",
      ["system"],
    );
  }
  // Clean up early capture so the main patchLogger can take over
  if (earlyPatchCleanup) {
    earlyPatchCleanup();
    earlyPatchCleanup = null;
  }
  earlyLogBuffer = null;

  // ── Cloud Manager initialisation ──────────────────────────────────────
  if (config.cloud?.enabled && config.cloud?.apiKey) {
    const mgr = new CloudManager(config.cloud, {
      onStatusChange: (s) => {
        addLog("info", `Cloud connection status: ${s}`, "cloud", [
          "server",
          "cloud",
        ]);
      },
    });
    mgr.init();
    state.cloudManager = mgr;
    addLog("info", "Cloud manager initialised (Eliza Cloud enabled)", "cloud", [
      "server",
      "cloud",
    ]);
  }

  addLog(
    "info",
    `Discovered ${plugins.length} plugins, ${skills.length} skills`,
    "system",
    ["system", "plugins"],
  );

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

  // ── WebSocket Server ─────────────────────────────────────────────────────
  const wss = new WebSocketServer({ noServer: true });
  const wsClients = new Set<WebSocket>();

  // Handle upgrade requests for WebSocket
  server.on("upgrade", (request, socket, head) => {
    try {
      const { pathname: wsPath } = new URL(
        request.url ?? "/",
        `http://${request.headers.host}`,
      );
      if (wsPath === "/ws") {
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
    addLog("info", "WebSocket client connected", "websocket", [
      "server",
      "websocket",
    ]);

    // Send initial status (flattened shape — matches UI AgentStatus)
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
    const statusData = {
      type: "status",
      state: state.agentState,
      agentName: state.agentName,
      model: state.model,
      startedAt: state.startedAt,
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
    // AppManager doesn't need a runtime reference
    state.agentState = "running";
    state.agentName = rt.character.name ?? "Milaidy";
    state.startedAt = Date.now();
    addLog("info", `Runtime restarted — agent: ${state.agentName}`, "system", [
      "system",
      "agent",
    ]);
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
        "system",
        ["server", "system"],
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
