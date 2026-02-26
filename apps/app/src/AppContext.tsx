/**
 * Global application state via React Context.
 *
 * Children access state and actions through the useApp() hook.
 */

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  type AgentStartupDiagnostics,
  type AgentStatus,
  type AppViewerAuthMessage,
  type CatalogSkill,
  type CharacterData,
  type CodingAgentSession,
  type Conversation,
  type ConversationChannelType,
  type ConversationMessage,
  type CreateTriggerRequest,
  type CustomActionDef,
  client,
  type DropStatus,
  type ExtensionStatus,
  type ImageAttachment,
  type LogEntry,
  type McpMarketplaceResult,
  type McpRegistryServerDetail,
  type McpServerConfig,
  type McpServerStatus,
  type MintResult,
  type OnboardingOptions,
  type PluginInfo,
  type RegistryPlugin,
  type RegistryStatus,
  type ReleaseChannel,
  type SkillInfo,
  type SkillMarketplaceResult,
  type SkillScanReportSummary,
  type StreamEventEnvelope,
  type StylePreset,
  type SystemPermissionId,
  type TriggerHealthSnapshot,
  type TriggerRunRecord,
  type TriggerSummary,
  type UpdateStatus,
  type UpdateTriggerRequest,
  type WalletAddresses,
  type WalletBalancesResponse,
  type WalletConfigStatus,
  type WalletExportResult,
  type WalletNftsResponse,
  type WhitelistStatus,
  type WorkbenchOverview,
} from "./api-client";
import { resolveAppAssetUrl } from "./asset-url";
import {
  type AutonomyEventStore,
  type AutonomyRunHealthMap,
  buildAutonomyGapReplayRequests,
  hasPendingAutonomyGaps,
  markPendingAutonomyGapsPartial,
  mergeAutonomyEvents,
} from "./autonomy-events";
import {
  expandSavedCustomCommand,
  loadSavedCustomCommands,
  normalizeSlashCommandName,
  splitCommandArgs,
} from "./chat-commands";
import { pathForTab, type Tab, tabFromPath } from "./navigation";
import { getMissingOnboardingPermissions } from "./onboarding-permissions";

// ── VRM helpers ─────────────────────────────────────────────────────────

/** Number of built-in milady VRM avatars shipped with the app. */
export const VRM_COUNT = 8;

function normalizeAvatarIndex(index: number): number {
  if (!Number.isFinite(index)) return 1;
  const n = Math.trunc(index);
  if (n === 0) return 0;
  if (n < 1 || n > VRM_COUNT) return 1;
  return n;
}

/** Resolve a built-in VRM index (1–8) to its public asset URL. */
export function getVrmUrl(index: number): string {
  const normalized = normalizeAvatarIndex(index);
  const safeIndex = normalized > 0 ? normalized : 1;
  return resolveAppAssetUrl(`vrms/${safeIndex}.vrm`);
}

/** Resolve a built-in VRM index (1–8) to its preview thumbnail URL. */
export function getVrmPreviewUrl(index: number): string {
  const normalized = normalizeAvatarIndex(index);
  const safeIndex = normalized > 0 ? normalized : 1;
  return resolveAppAssetUrl(`vrms/previews/milady-${safeIndex}.png`);
}

// ── Theme ──────────────────────────────────────────────────────────────

const THEME_STORAGE_KEY = "milady:theme";

export type ThemeName =
  | "milady"
  | "qt314"
  | "web2000"
  | "programmer"
  | "haxor"
  | "psycho";

export const THEMES: ReadonlyArray<{
  id: ThemeName;
  label: string;
  hint: string;
}> = [
  { id: "milady", label: "milady", hint: "clean black & white" },
  { id: "qt314", label: "qt3.14", hint: "soft pastels" },
  { id: "web2000", label: "web2000", hint: "green hacker vibes" },
  { id: "programmer", label: "programmer", hint: "vscode dark" },
  { id: "haxor", label: "haxor", hint: "terminal green" },
  { id: "psycho", label: "psycho", hint: "pure chaos" },
];

const VALID_THEMES = new Set<string>(THEMES.map((t) => t.id));
const AGENT_TRANSFER_MIN_PASSWORD_LENGTH = 4;

function loadTheme(): ThemeName {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored && VALID_THEMES.has(stored)) return stored as ThemeName;
  } catch {
    /* ignore */
  }
  return "milady";
}

function applyTheme(name: ThemeName) {
  document.documentElement.setAttribute("data-theme", name);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, name);
  } catch {
    /* ignore */
  }
}

/* ── Avatar persistence ───────────────────────────────────────────────── */
const AVATAR_INDEX_KEY = "milady_avatar_index";

function loadAvatarIndex(): number {
  try {
    const stored = localStorage.getItem(AVATAR_INDEX_KEY);
    if (stored) {
      const n = parseInt(stored, 10);
      return normalizeAvatarIndex(n);
    }
  } catch {
    /* ignore */
  }
  return 1;
}

function saveAvatarIndex(index: number) {
  try {
    localStorage.setItem(AVATAR_INDEX_KEY, String(normalizeAvatarIndex(index)));
  } catch {
    /* ignore */
  }
}

/* ── Chat UI persistence ──────────────────────────────────────────────── */
const CHAT_AVATAR_VISIBLE_KEY = "milady:chat:avatarVisible";
const CHAT_VOICE_MUTED_KEY = "milady:chat:voiceMuted";

function loadChatAvatarVisible(): boolean {
  try {
    const stored = localStorage.getItem(CHAT_AVATAR_VISIBLE_KEY);
    return stored === null ? true : stored === "true";
  } catch {
    return true;
  }
}

function loadChatVoiceMuted(): boolean {
  try {
    const stored = localStorage.getItem(CHAT_VOICE_MUTED_KEY);
    return stored === null ? true : stored === "true";
  } catch {
    return true;
  }
}

function saveChatAvatarVisible(value: boolean): void {
  try {
    localStorage.setItem(CHAT_AVATAR_VISIBLE_KEY, String(value));
  } catch {
    /* ignore */
  }
}

function saveChatVoiceMuted(value: boolean): void {
  try {
    localStorage.setItem(CHAT_VOICE_MUTED_KEY, String(value));
  } catch {
    /* ignore */
  }
}

// ── Onboarding step type ───────────────────────────────────────────────

export type OnboardingStep =
  | "welcome"
  | "name"
  | "avatar"
  | "style"
  | "theme"
  | "mint"
  | "runMode"
  | "dockerSetup"
  | "cloudProvider"
  | "modelSelection"
  | "cloudLogin"
  | "llmProvider"
  | "inventorySetup"
  | "connectors"
  | "permissions";

interface OnboardingNextOptions {
  allowPermissionBypass?: boolean;
}

const ONBOARDING_PERMISSION_LABELS: Record<SystemPermissionId, string> = {
  accessibility: "Accessibility",
  "screen-recording": "Screen Recording",
  microphone: "Microphone",
  camera: "Camera",
  shell: "Shell Access",
};

// ── Action notice ──────────────────────────────────────────────────────

interface ActionNotice {
  tone: string;
  text: string;
}

type LifecycleAction =
  | "start"
  | "stop"
  | "pause"
  | "resume"
  | "restart"
  | "reset";

const LIFECYCLE_MESSAGES: Record<
  LifecycleAction,
  {
    inProgress: string;
    progress: string;
    success: string;
    verb: string;
  }
> = {
  start: {
    inProgress: "starting",
    progress: "Starting agent...",
    success: "Agent started.",
    verb: "start",
  },
  stop: {
    inProgress: "stopping",
    progress: "Stopping agent...",
    success: "Agent stopped.",
    verb: "stop",
  },
  pause: {
    inProgress: "pausing",
    progress: "Pausing agent...",
    success: "Agent paused.",
    verb: "pause",
  },
  resume: {
    inProgress: "resuming",
    progress: "Resuming agent...",
    success: "Agent resumed.",
    verb: "resume",
  },
  restart: {
    inProgress: "restarting",
    progress: "Restarting agent...",
    success: "Agent restarted.",
    verb: "restart",
  },
  reset: {
    inProgress: "resetting",
    progress: "Resetting agent...",
    success: "Agent reset. Returning to onboarding.",
    verb: "reset",
  },
};

type GamePostMessageAuthPayload = AppViewerAuthMessage;

const AGENT_STATES: ReadonlySet<AgentStatus["state"]> = new Set([
  "not_started",
  "starting",
  "running",
  "paused",
  "stopped",
  "restarting",
  "error",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseAgentStatusEvent(
  data: Record<string, unknown>,
): AgentStatus | null {
  const state = data.state;
  const agentName = data.agentName;
  if (
    typeof state !== "string" ||
    !AGENT_STATES.has(state as AgentStatus["state"])
  ) {
    return null;
  }
  if (typeof agentName !== "string") return null;
  const model = typeof data.model === "string" ? data.model : undefined;
  const startedAt =
    typeof data.startedAt === "number" ? data.startedAt : undefined;
  const uptime = typeof data.uptime === "number" ? data.uptime : undefined;
  const startup = parseAgentStartupDiagnostics(data.startup);
  return {
    state: state as AgentStatus["state"],
    agentName,
    model,
    startedAt,
    uptime,
    startup,
  };
}

function parseAgentStartupDiagnostics(
  value: unknown,
): AgentStartupDiagnostics | undefined {
  if (!isRecord(value)) return undefined;
  const phase = value.phase;
  const attempt = value.attempt;
  if (typeof phase !== "string" || typeof attempt !== "number") {
    return undefined;
  }
  const startup: AgentStartupDiagnostics = { phase, attempt };
  if (typeof value.lastError === "string") startup.lastError = value.lastError;
  if (typeof value.lastErrorAt === "number")
    startup.lastErrorAt = value.lastErrorAt;
  if (typeof value.nextRetryAt === "number")
    startup.nextRetryAt = value.nextRetryAt;
  return startup;
}

function parseStreamEventEnvelopeEvent(
  data: Record<string, unknown>,
): StreamEventEnvelope | null {
  const type = data.type;
  const eventId = data.eventId;
  const ts = data.ts;
  const payload = data.payload;
  if (
    (type !== "agent_event" &&
      type !== "heartbeat_event" &&
      type !== "training_event") ||
    typeof eventId !== "string" ||
    typeof ts !== "number" ||
    !isRecord(payload)
  ) {
    return null;
  }

  const envelope: StreamEventEnvelope = {
    type,
    version: 1,
    eventId,
    ts,
    payload,
  };
  if (typeof data.runId === "string") envelope.runId = data.runId;
  if (typeof data.seq === "number") envelope.seq = data.seq;
  if (typeof data.stream === "string") envelope.stream = data.stream;
  if (typeof data.sessionKey === "string")
    envelope.sessionKey = data.sessionKey;
  if (typeof data.agentId === "string") envelope.agentId = data.agentId;
  if (typeof data.roomId === "string") envelope.roomId = data.roomId;
  return envelope;
}

function parseConversationMessageEvent(
  value: unknown,
): ConversationMessage | null {
  if (!isRecord(value)) return null;
  const id = value.id;
  const role = value.role;
  const text = value.text;
  const timestamp = value.timestamp;
  const source = value.source;
  const from = value.from;
  if (
    typeof id !== "string" ||
    (role !== "user" && role !== "assistant") ||
    typeof text !== "string" ||
    typeof timestamp !== "number"
  ) {
    return null;
  }
  const parsed: ConversationMessage = { id, role, text, timestamp };
  if (typeof source === "string" && source.length > 0) {
    parsed.source = source;
  }
  if (typeof from === "string" && from.length > 0) {
    parsed.from = from;
  }
  return parsed;
}

function parseProactiveMessageEvent(
  data: Record<string, unknown>,
): { conversationId: string; message: ConversationMessage } | null {
  const conversationId = data.conversationId;
  if (typeof conversationId !== "string") return null;
  const message = parseConversationMessageEvent(data.message);
  if (!message) return null;
  return { conversationId, message };
}

function computeStreamingDelta(existing: string, incoming: string): string {
  if (!incoming) return "";
  if (!existing) return incoming;
  if (incoming === existing) return "";
  if (incoming.startsWith(existing)) return incoming.slice(existing.length);
  if (existing.startsWith(incoming)) return "";

  // Small chunks are usually raw token deltas; keep them even if they
  // duplicate suffix characters (e.g., "l" + "l" in "Hello").
  if (incoming.length <= 3) return incoming;

  const maxOverlap = Math.min(existing.length, incoming.length);
  for (let overlap = maxOverlap; overlap > 0; overlap -= 1) {
    if (existing.endsWith(incoming.slice(0, overlap))) {
      const delta = incoming.slice(overlap);
      if (!delta && overlap === incoming.length) return "";
      return delta;
    }
  }
  return incoming;
}

function normalizeStreamComparisonText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function shouldApplyFinalStreamText(
  streamed: string,
  finalText: string,
): boolean {
  if (!finalText.trim()) return false;
  if (!streamed) return true;
  if (streamed === finalText) return false;
  return (
    normalizeStreamComparisonText(streamed) !==
    normalizeStreamComparisonText(finalText)
  );
}

type SlashCommandInput = {
  name: string;
  argsRaw: string;
};

function parseSlashCommandInput(text: string): SlashCommandInput | null {
  if (!text.startsWith("/")) return null;
  const body = text.slice(1).trim();
  if (!body) return null;
  const firstSpace = body.search(/\s/);
  if (firstSpace === -1) {
    return { name: normalizeSlashCommandName(body), argsRaw: "" };
  }
  return {
    name: normalizeSlashCommandName(body.slice(0, firstSpace)),
    argsRaw: body.slice(firstSpace + 1).trim(),
  };
}

function normalizeCustomActionName(value: string): string {
  return value
    .trim()
    .replace(/[\s-]+/g, "_")
    .toUpperCase();
}

function parseCustomActionParams(
  action: CustomActionDef,
  argsRaw: string,
): {
  params: Record<string, string>;
  missingRequired: string[];
} {
  const tokens = splitCommandArgs(argsRaw);
  const named = new Map<string, string>();
  const positional: string[] = [];

  for (const token of tokens) {
    const eq = token.indexOf("=");
    if (eq > 0) {
      const key = token.slice(0, eq).trim().toLowerCase();
      const value = token.slice(eq + 1).trim();
      if (key) {
        named.set(key, value);
        continue;
      }
    }
    positional.push(token);
  }

  const params: Record<string, string> = {};
  const defs = Array.isArray(action.parameters) ? action.parameters : [];
  const defsByLower = new Map(
    defs.map((def) => [def.name.trim().toLowerCase(), def.name]),
  );

  for (const [key, value] of named) {
    const canonical = defsByLower.get(key);
    if (canonical) {
      params[canonical] = value;
    } else {
      params[key] = value;
    }
  }

  for (const def of defs) {
    if (params[def.name] == null && positional.length > 0) {
      params[def.name] = positional.shift() as string;
    }
  }

  if (positional.length > 0) {
    const sink = defs.find((def) =>
      ["input", "text", "query", "message", "prompt"].includes(
        def.name.toLowerCase(),
      ),
    );
    if (sink) {
      const existing = params[sink.name];
      params[sink.name] = existing
        ? `${existing} ${positional.join(" ")}`
        : positional.join(" ");
    }
  }

  const missingRequired = defs
    .filter((def) => def.required)
    .map((def) => def.name)
    .filter((name) => !(params[name] ?? "").trim());

  return { params, missingRequired };
}

function formatSearchBullet(label: string, items: string[]): string {
  if (items.length === 0) return `${label}: none`;
  return `${label}:\n${items.map((item) => `- ${item}`).join("\n")}`;
}

type LoadConversationMessagesResult =
  | { ok: true }
  | { ok: false; status?: number; message: string };

export type StartupPhase = "starting-backend" | "initializing-agent";

export type StartupErrorReason =
  | "backend-timeout"
  | "backend-unreachable"
  | "agent-timeout"
  | "agent-error";

export interface StartupErrorState {
  reason: StartupErrorReason;
  phase: StartupPhase;
  message: string;
  detail?: string;
  status?: number;
  path?: string;
}

const BACKEND_STARTUP_TIMEOUT_MS = 30_000;
const AGENT_READY_TIMEOUT_MS = 90_000;

interface ApiLikeError {
  kind?: string;
  status?: number;
  path?: string;
  message?: string;
}

function asApiLikeError(err: unknown): ApiLikeError | null {
  if (!isRecord(err)) return null;
  const kind = err.kind;
  const status = err.status;
  const path = err.path;
  const message = err.message;
  const hasApiShape =
    typeof kind === "string" ||
    typeof status === "number" ||
    typeof path === "string";
  if (!hasApiShape) return null;
  return {
    kind: typeof kind === "string" ? kind : undefined,
    status: typeof status === "number" ? status : undefined,
    path: typeof path === "string" ? path : undefined,
    message: typeof message === "string" ? message : undefined,
  };
}

function formatStartupErrorDetail(err: unknown): string | undefined {
  const apiErr = asApiLikeError(err);
  if (apiErr) {
    const parts: string[] = [];
    if (apiErr.path) parts.push(apiErr.path);
    if (typeof apiErr.status === "number") parts.push(`HTTP ${apiErr.status}`);
    if (apiErr.message) parts.push(apiErr.message);
    return parts.filter(Boolean).join(" - ");
  }
  if (err instanceof Error && err.message.trim()) {
    return err.message.trim();
  }
  return undefined;
}

// ── Context value type ─────────────────────────────────────────────────

export interface AppState {
  // Core
  tab: Tab;
  currentTheme: ThemeName;
  connected: boolean;
  agentStatus: AgentStatus | null;
  onboardingComplete: boolean;
  onboardingLoading: boolean;
  startupPhase: StartupPhase;
  startupError: StartupErrorState | null;
  authRequired: boolean;
  actionNotice: ActionNotice | null;
  lifecycleBusy: boolean;
  lifecycleAction: LifecycleAction | null;

  // Deferred restart
  pendingRestart: boolean;
  pendingRestartReasons: string[];
  restartBannerDismissed: boolean;

  // Pairing
  pairingEnabled: boolean;
  pairingExpiresAt: number | null;
  pairingCodeInput: string;
  pairingError: string | null;
  pairingBusy: boolean;

  // Chat
  chatInput: string;
  chatSending: boolean;
  chatFirstTokenReceived: boolean;
  chatAvatarVisible: boolean;
  chatAgentVoiceMuted: boolean;
  chatAvatarSpeaking: boolean;
  conversations: Conversation[];
  activeConversationId: string | null;
  conversationMessages: ConversationMessage[];
  autonomousEvents: StreamEventEnvelope[];
  autonomousLatestEventId: string | null;
  autonomousRunHealthByRunId: AutonomyRunHealthMap;
  /** Active PTY coding agent sessions from the SwarmCoordinator. */
  ptySessions: CodingAgentSession[];
  /** Conversation IDs with unread proactive messages from the agent. */
  unreadConversations: Set<string>;

  // Triggers
  triggers: TriggerSummary[];
  triggersLoading: boolean;
  triggersSaving: boolean;
  triggerRunsById: Record<string, TriggerRunRecord[]>;
  triggerHealth: TriggerHealthSnapshot | null;
  triggerError: string | null;

  // Plugins
  plugins: PluginInfo[];
  pluginFilter: "all" | "ai-provider" | "connector" | "feature";
  pluginStatusFilter: "all" | "enabled" | "disabled";
  pluginSearch: string;
  pluginSettingsOpen: Set<string>;
  pluginAdvancedOpen: Set<string>;
  pluginSaving: Set<string>;
  pluginSaveSuccess: Set<string>;

  // Skills
  skills: SkillInfo[];
  skillsSubTab: "my" | "browse";
  skillCreateFormOpen: boolean;
  skillCreateName: string;
  skillCreateDescription: string;
  skillCreating: boolean;
  skillReviewReport: SkillScanReportSummary | null;
  skillReviewId: string;
  skillReviewLoading: boolean;
  skillToggleAction: string;
  skillsMarketplaceQuery: string;
  skillsMarketplaceResults: SkillMarketplaceResult[];
  skillsMarketplaceError: string;
  skillsMarketplaceLoading: boolean;
  skillsMarketplaceAction: string;
  skillsMarketplaceManualGithubUrl: string;

  // Logs
  logs: LogEntry[];
  logSources: string[];
  logTags: string[];
  logTagFilter: string;
  logLevelFilter: string;
  logSourceFilter: string;

  // Wallet / Inventory
  walletAddresses: WalletAddresses | null;
  walletConfig: WalletConfigStatus | null;
  walletBalances: WalletBalancesResponse | null;
  walletNfts: WalletNftsResponse | null;
  walletLoading: boolean;
  walletNftsLoading: boolean;
  inventoryView: "tokens" | "nfts";
  walletExportData: WalletExportResult | null;
  walletExportVisible: boolean;
  walletApiKeySaving: boolean;
  inventorySort: "chain" | "symbol" | "value";
  walletError: string | null;

  // ERC-8004 Registry
  registryStatus: RegistryStatus | null;
  registryLoading: boolean;
  registryRegistering: boolean;
  registryError: string | null;

  // Drop / Mint
  dropStatus: DropStatus | null;
  dropLoading: boolean;
  mintInProgress: boolean;
  mintResult: MintResult | null;
  mintError: string | null;
  mintShiny: boolean;

  // Whitelist
  whitelistStatus: WhitelistStatus | null;
  whitelistLoading: boolean;
  twitterVerifyMessage: string | null;
  twitterVerifyUrl: string;
  twitterVerifying: boolean;

  // Character
  characterData: CharacterData | null;
  characterLoading: boolean;
  characterSaving: boolean;
  characterSaveSuccess: string | null;
  characterSaveError: string | null;
  characterDraft: CharacterData;
  selectedVrmIndex: number;
  customVrmUrl: string;

  // Cloud
  cloudEnabled: boolean;
  cloudConnected: boolean;
  cloudCredits: number | null;
  cloudCreditsLow: boolean;
  cloudCreditsCritical: boolean;
  cloudTopUpUrl: string;
  cloudUserId: string | null;
  cloudLoginBusy: boolean;
  cloudLoginError: string | null;
  cloudDisconnecting: boolean;

  // Updates
  updateStatus: UpdateStatus | null;
  updateLoading: boolean;
  updateChannelSaving: boolean;

  // Extension
  extensionStatus: ExtensionStatus | null;
  extensionChecking: boolean;

  // Store
  storePlugins: RegistryPlugin[];
  storeSearch: string;
  storeFilter: "all" | "installed" | "ai-provider" | "connector" | "feature";
  storeLoading: boolean;
  storeInstalling: Set<string>;
  storeUninstalling: Set<string>;
  storeError: string | null;
  storeDetailPlugin: RegistryPlugin | null;
  storeSubTab: "plugins" | "skills";

  // Catalog
  catalogSkills: CatalogSkill[];
  catalogTotal: number;
  catalogPage: number;
  catalogTotalPages: number;
  catalogSort: "downloads" | "stars" | "updated" | "name";
  catalogSearch: string;
  catalogLoading: boolean;
  catalogError: string | null;
  catalogDetailSkill: CatalogSkill | null;
  catalogInstalling: Set<string>;
  catalogUninstalling: Set<string>;

  // Workbench
  workbenchLoading: boolean;
  workbench: WorkbenchOverview | null;
  workbenchTasksAvailable: boolean;
  workbenchTriggersAvailable: boolean;
  workbenchTodosAvailable: boolean;

  // Agent export/import
  exportBusy: boolean;
  exportPassword: string;
  exportIncludeLogs: boolean;
  exportError: string | null;
  exportSuccess: string | null;
  importBusy: boolean;
  importPassword: string;
  importFile: File | null;
  importError: string | null;
  importSuccess: string | null;

  // Onboarding
  onboardingStep: OnboardingStep;
  onboardingOptions: OnboardingOptions | null;
  onboardingName: string;
  onboardingStyle: string;
  onboardingTheme: ThemeName;
  onboardingRunMode: "local-rawdog" | "local-sandbox" | "cloud" | "";
  onboardingCloudProvider: string;
  onboardingSmallModel: string;
  onboardingLargeModel: string;
  onboardingProvider: string;
  onboardingApiKey: string;
  onboardingOpenRouterModel: string;
  onboardingPrimaryModel: string;
  onboardingTelegramToken: string;
  onboardingDiscordToken: string;
  onboardingWhatsAppSessionPath: string;
  onboardingTwilioAccountSid: string;
  onboardingTwilioAuthToken: string;
  onboardingTwilioPhoneNumber: string;
  onboardingBlooioApiKey: string;
  onboardingBlooioPhoneNumber: string;
  onboardingGithubToken: string;
  onboardingSubscriptionTab: "token" | "oauth";
  onboardingSelectedChains: Set<string>;
  onboardingRpcSelections: Record<string, string>;
  onboardingRpcKeys: Record<string, string>;
  onboardingAvatar: number;
  onboardingRestarting: boolean;

  // Command palette
  commandPaletteOpen: boolean;
  commandQuery: string;
  commandActiveIndex: number;
  closeCommandPalette: () => void;

  // Emote picker
  emotePickerOpen: boolean;

  // MCP
  mcpConfiguredServers: Record<string, McpServerConfig>;
  mcpServerStatuses: McpServerStatus[];
  mcpMarketplaceQuery: string;
  mcpMarketplaceResults: McpMarketplaceResult[];
  mcpMarketplaceLoading: boolean;
  mcpAction: string;
  mcpAddingServer: McpRegistryServerDetail | null;
  mcpAddingResult: McpMarketplaceResult | null;
  mcpEnvInputs: Record<string, string>;
  mcpHeaderInputs: Record<string, string>;

  // Share ingest
  droppedFiles: string[];
  shareIngestNotice: string;

  // Chat image attachments queued for the next message
  chatPendingImages: ImageAttachment[];

  // Game
  activeGameApp: string;
  activeGameDisplayName: string;
  activeGameViewerUrl: string;
  activeGameSandbox: string;
  activeGamePostMessageAuth: boolean;
  activeGamePostMessagePayload: GamePostMessageAuthPayload | null;

  /** When true, the game iframe persists as a floating overlay across all tabs. */
  gameOverlayEnabled: boolean;

  // Sub-tabs
  appsSubTab: "browse" | "games";
  agentSubTab: "character" | "inventory" | "knowledge";
  pluginsSubTab: "features" | "connectors" | "plugins";
  databaseSubTab: "tables" | "media" | "vectors";

  // Config text
  configRaw: Record<string, unknown>;
  configText: string;
}

export interface AppActions {
  // Navigation
  setTab: (tab: Tab) => void;
  setTheme: (theme: ThemeName) => void;

  // Lifecycle
  handleStart: () => Promise<void>;
  handleStop: () => Promise<void>;
  handlePauseResume: () => Promise<void>;
  handleRestart: () => Promise<void>;
  handleReset: () => Promise<void>;
  retryStartup: () => void;
  dismissRestartBanner: () => void;
  triggerRestart: () => Promise<void>;

  // Chat
  handleChatSend: (channelType?: ConversationChannelType) => Promise<void>;
  handleChatStop: () => void;
  handleChatClear: () => Promise<void>;
  handleNewConversation: () => Promise<void>;
  setChatPendingImages: React.Dispatch<React.SetStateAction<ImageAttachment[]>>;
  handleSelectConversation: (id: string) => Promise<void>;
  handleDeleteConversation: (id: string) => Promise<void>;
  handleRenameConversation: (id: string, title: string) => Promise<void>;

  // Triggers
  loadTriggers: () => Promise<void>;
  createTrigger: (
    request: CreateTriggerRequest,
  ) => Promise<TriggerSummary | null>;
  updateTrigger: (
    id: string,
    request: UpdateTriggerRequest,
  ) => Promise<TriggerSummary | null>;
  deleteTrigger: (id: string) => Promise<boolean>;
  runTriggerNow: (id: string) => Promise<boolean>;
  loadTriggerRuns: (id: string) => Promise<void>;
  loadTriggerHealth: () => Promise<void>;

  // Pairing
  handlePairingSubmit: () => Promise<void>;

  // Plugins
  loadPlugins: () => Promise<void>;
  handlePluginToggle: (pluginId: string, enabled: boolean) => Promise<void>;
  handlePluginConfigSave: (
    pluginId: string,
    config: Record<string, string>,
  ) => Promise<void>;

  // Skills
  loadSkills: () => Promise<void>;
  refreshSkills: () => Promise<void>;
  handleSkillToggle: (skillId: string, enabled: boolean) => Promise<void>;
  handleCreateSkill: () => Promise<void>;
  handleOpenSkill: (skillId: string) => Promise<void>;
  handleDeleteSkill: (skillId: string, name: string) => Promise<void>;
  handleReviewSkill: (skillId: string) => Promise<void>;
  handleAcknowledgeSkill: (skillId: string) => Promise<void>;
  searchSkillsMarketplace: () => Promise<void>;
  installSkillFromMarketplace: (item: SkillMarketplaceResult) => Promise<void>;
  uninstallMarketplaceSkill: (skillId: string, name: string) => Promise<void>;
  installSkillFromGithubUrl: () => Promise<void>;

  // Logs
  loadLogs: () => Promise<void>;

  // Inventory
  loadInventory: () => Promise<void>;
  loadBalances: () => Promise<void>;
  loadNfts: () => Promise<void>;
  handleWalletApiKeySave: (config: Record<string, string>) => Promise<void>;
  handleExportKeys: () => Promise<void>;

  // Registry / Drop
  loadRegistryStatus: () => Promise<void>;
  registerOnChain: () => Promise<void>;
  syncRegistryProfile: () => Promise<void>;
  loadDropStatus: () => Promise<void>;
  mintFromDrop: (shiny: boolean) => Promise<void>;
  loadWhitelistStatus: () => Promise<void>;

  // Character
  loadCharacter: () => Promise<void>;
  handleSaveCharacter: () => Promise<void>;
  handleCharacterFieldInput: <K extends keyof CharacterData>(
    field: K,
    value: CharacterData[K],
  ) => void;
  handleCharacterArrayInput: (
    field: "adjectives" | "topics" | "postExamples",
    value: string,
  ) => void;
  handleCharacterStyleInput: (
    subfield: "all" | "chat" | "post",
    value: string,
  ) => void;
  handleCharacterMessageExamplesInput: (value: string) => void;

  // Onboarding
  handleOnboardingNext: (options?: OnboardingNextOptions) => Promise<void>;
  handleOnboardingBack: () => void;

  // Cloud
  handleCloudLogin: () => Promise<void>;
  handleCloudDisconnect: () => Promise<void>;

  // Updates
  loadUpdateStatus: (force?: boolean) => Promise<void>;
  handleChannelChange: (channel: ReleaseChannel) => Promise<void>;

  // Extension
  checkExtensionStatus: () => Promise<void>;

  // Emote picker
  openEmotePicker: () => void;
  closeEmotePicker: () => void;

  // Workbench
  loadWorkbench: () => Promise<void>;

  // Agent export/import
  handleAgentExport: () => Promise<void>;
  handleAgentImport: () => Promise<void>;

  // Action notice
  setActionNotice: (
    text: string,
    tone?: "info" | "success" | "error",
    ttlMs?: number,
  ) => void;

  // Generic state setter
  setState: <K extends keyof AppState>(key: K, value: AppState[K]) => void;

  // Clipboard
  copyToClipboard: (text: string) => Promise<void>;
}

type AppContextValue = AppState & AppActions;

const AppContext = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}

// ── Provider ───────────────────────────────────────────────────────────

export function AppProvider({ children }: { children: ReactNode }) {
  // --- Core state ---
  const [tab, setTabRaw] = useState<Tab>("chat");
  const [currentTheme, setCurrentTheme] = useState<ThemeName>(loadTheme);
  const [connected, setConnected] = useState(false);
  const [agentStatus, setAgentStatus] = useState<AgentStatus | null>(null);
  const [onboardingComplete, setOnboardingComplete] = useState(false);
  const [onboardingLoading, setOnboardingLoading] = useState(true);
  const [startupPhase, setStartupPhase] =
    useState<StartupPhase>("starting-backend");
  const [startupError, setStartupError] = useState<StartupErrorState | null>(
    null,
  );
  const [startupRetryNonce, setStartupRetryNonce] = useState(0);
  const [authRequired, setAuthRequired] = useState(false);
  const [actionNotice, setActionNoticeState] = useState<ActionNotice | null>(
    null,
  );
  const [lifecycleBusy, setLifecycleBusy] = useState(false);
  const [lifecycleAction, setLifecycleAction] =
    useState<LifecycleAction | null>(null);

  // --- Deferred restart ---
  const [pendingRestart, setPendingRestart] = useState(false);
  const [pendingRestartReasons, setPendingRestartReasons] = useState<string[]>(
    [],
  );
  const [restartBannerDismissed, setRestartBannerDismissed] = useState(false);

  // --- Pairing ---
  const [pairingEnabled, setPairingEnabled] = useState(false);
  const [pairingExpiresAt, setPairingExpiresAt] = useState<number | null>(null);
  const [pairingCodeInput, setPairingCodeInput] = useState("");
  const [pairingError, setPairingError] = useState<string | null>(null);
  const [pairingBusy, setPairingBusy] = useState(false);

  // --- Chat ---
  const [chatInput, setChatInput] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const [chatFirstTokenReceived, setChatFirstTokenReceived] = useState(false);
  const [chatAvatarVisible, setChatAvatarVisible] = useState(
    loadChatAvatarVisible,
  );
  const [chatAgentVoiceMuted, setChatAgentVoiceMuted] =
    useState(loadChatVoiceMuted);
  const [chatAvatarSpeaking, setChatAvatarSpeaking] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<
    string | null
  >(null);
  const [conversationMessages, setConversationMessages] = useState<
    ConversationMessage[]
  >([]);
  const [autonomousEvents, setAutonomousEvents] = useState<
    StreamEventEnvelope[]
  >([]);
  const [autonomousLatestEventId, setAutonomousLatestEventId] = useState<
    string | null
  >(null);
  const [autonomousRunHealthByRunId, setAutonomousRunHealthByRunId] =
    useState<AutonomyRunHealthMap>({});
  const [ptySessions, setPtySessions] = useState<CodingAgentSession[]>([]);
  const [unreadConversations, setUnreadConversations] = useState<Set<string>>(
    new Set(),
  );
  const autonomousStoreRef = useRef<AutonomyEventStore>({
    eventsById: {},
    eventOrder: [],
    runIndex: {},
    watermark: null,
  });
  const autonomousEventsRef = useRef<StreamEventEnvelope[]>([]);
  const autonomousLatestEventIdRef = useRef<string | null>(null);
  const autonomousRunHealthByRunIdRef = useRef<AutonomyRunHealthMap>({});
  const autonomousReplayInFlightRef = useRef(false);
  const activeConversationIdRef = useRef<string | null>(null);
  const conversationsRef = useRef<Conversation[]>([]);

  useEffect(() => {
    autonomousEventsRef.current = autonomousEvents;
  }, [autonomousEvents]);

  useEffect(() => {
    autonomousLatestEventIdRef.current = autonomousLatestEventId;
  }, [autonomousLatestEventId]);

  useEffect(() => {
    autonomousRunHealthByRunIdRef.current = autonomousRunHealthByRunId;
  }, [autonomousRunHealthByRunId]);

  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  useEffect(() => {
    saveChatAvatarVisible(chatAvatarVisible);
  }, [chatAvatarVisible]);

  useEffect(() => {
    saveChatVoiceMuted(chatAgentVoiceMuted);
  }, [chatAgentVoiceMuted]);

  // --- Triggers ---
  const [triggers, setTriggers] = useState<TriggerSummary[]>([]);
  const [triggersLoading, setTriggersLoading] = useState(false);
  const [triggersSaving, setTriggersSaving] = useState(false);
  const [triggerRunsById, setTriggerRunsById] = useState<
    Record<string, TriggerRunRecord[]>
  >({});
  const [triggerHealth, setTriggerHealth] =
    useState<TriggerHealthSnapshot | null>(null);
  const [triggerError, setTriggerError] = useState<string | null>(null);

  // --- Plugins ---
  const [plugins, setPlugins] = useState<PluginInfo[]>([]);
  const [pluginFilter, setPluginFilter] = useState<
    "all" | "ai-provider" | "connector" | "feature"
  >("all");
  const [pluginStatusFilter, setPluginStatusFilter] = useState<
    "all" | "enabled" | "disabled"
  >("all");
  const [pluginSearch, setPluginSearch] = useState("");
  const [pluginSettingsOpen, setPluginSettingsOpen] = useState<Set<string>>(
    new Set(),
  );
  const [pluginAdvancedOpen, setPluginAdvancedOpen] = useState<Set<string>>(
    new Set(),
  );
  const [pluginSaving, setPluginSaving] = useState<Set<string>>(new Set());
  const [pluginSaveSuccess, setPluginSaveSuccess] = useState<Set<string>>(
    new Set(),
  );

  // --- Skills ---
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [skillsSubTab, setSkillsSubTab] = useState<"my" | "browse">("my");
  const [skillCreateFormOpen, setSkillCreateFormOpen] = useState(false);
  const [skillCreateName, setSkillCreateName] = useState("");
  const [skillCreateDescription, setSkillCreateDescription] = useState("");
  const [skillCreating, setSkillCreating] = useState(false);
  const [skillReviewReport, setSkillReviewReport] =
    useState<SkillScanReportSummary | null>(null);
  const [skillReviewId, setSkillReviewId] = useState("");
  const [skillReviewLoading, setSkillReviewLoading] = useState(false);
  const [skillToggleAction, setSkillToggleAction] = useState("");
  const [skillsMarketplaceQuery, setSkillsMarketplaceQuery] = useState("");
  const [skillsMarketplaceResults, setSkillsMarketplaceResults] = useState<
    SkillMarketplaceResult[]
  >([]);
  const [skillsMarketplaceError, setSkillsMarketplaceError] = useState("");
  const [skillsMarketplaceLoading, setSkillsMarketplaceLoading] =
    useState(false);
  const [skillsMarketplaceAction, setSkillsMarketplaceAction] = useState("");
  const [
    skillsMarketplaceManualGithubUrl,
    setSkillsMarketplaceManualGithubUrl,
  ] = useState("");

  // --- Logs ---
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logSources, setLogSources] = useState<string[]>([]);
  const [logTags, setLogTags] = useState<string[]>([]);
  const [logTagFilter, setLogTagFilter] = useState("");
  const [logLevelFilter, setLogLevelFilter] = useState("");
  const [logSourceFilter, setLogSourceFilter] = useState("");

  // --- Wallet / Inventory ---
  const [walletAddresses, setWalletAddresses] =
    useState<WalletAddresses | null>(null);
  const [walletConfig, setWalletConfig] = useState<WalletConfigStatus | null>(
    null,
  );
  const [walletBalances, setWalletBalances] =
    useState<WalletBalancesResponse | null>(null);
  const [walletNfts, setWalletNfts] = useState<WalletNftsResponse | null>(null);
  const [walletLoading, setWalletLoading] = useState(false);
  const [walletNftsLoading, setWalletNftsLoading] = useState(false);
  const [inventoryView, setInventoryView] = useState<"tokens" | "nfts">(
    "tokens",
  );
  const [walletExportData, setWalletExportData] =
    useState<WalletExportResult | null>(null);
  const [walletExportVisible, setWalletExportVisible] = useState(false);
  const [walletApiKeySaving, setWalletApiKeySaving] = useState(false);
  const [inventorySort, setInventorySort] = useState<
    "chain" | "symbol" | "value"
  >("value");
  const [walletError, setWalletError] = useState<string | null>(null);

  // --- ERC-8004 Registry ---
  const [registryStatus, setRegistryStatus] = useState<RegistryStatus | null>(
    null,
  );
  const [registryLoading, setRegistryLoading] = useState(false);
  const [registryRegistering, setRegistryRegistering] = useState(false);
  const [registryError, setRegistryError] = useState<string | null>(null);

  // --- Drop / Mint ---
  const [dropStatus, setDropStatus] = useState<DropStatus | null>(null);
  const [dropLoading, setDropLoading] = useState(false);
  const [mintInProgress, setMintInProgress] = useState(false);
  const [mintResult, setMintResult] = useState<MintResult | null>(null);
  const [mintError, setMintError] = useState<string | null>(null);
  const [mintShiny, setMintShiny] = useState(false);

  // --- Whitelist ---
  const [whitelistStatus, setWhitelistStatus] =
    useState<WhitelistStatus | null>(null);
  const [whitelistLoading, setWhitelistLoading] = useState(false);
  const [twitterVerifyMessage] = useState<string | null>(null);
  const [twitterVerifyUrl] = useState("");
  const [twitterVerifying] = useState(false);

  // --- Character ---
  const [characterData, setCharacterData] = useState<CharacterData | null>(
    null,
  );
  const [characterLoading, setCharacterLoading] = useState(false);
  const [characterSaving, setCharacterSaving] = useState(false);
  const [characterSaveSuccess, setCharacterSaveSuccess] = useState<
    string | null
  >(null);
  const [characterSaveError, setCharacterSaveError] = useState<string | null>(
    null,
  );
  const [characterDraft, setCharacterDraft] = useState<CharacterData>({});
  const [selectedVrmIndex, setSelectedVrmIndexRaw] = useState(loadAvatarIndex);
  const [customVrmUrl, setCustomVrmUrl] = useState("");

  // Wrap setter to also persist to localStorage
  const setSelectedVrmIndex = useCallback((v: number) => {
    const normalized = normalizeAvatarIndex(v);
    setSelectedVrmIndexRaw(normalized);
    saveAvatarIndex(normalized);
  }, []);

  // --- Cloud ---
  const [cloudEnabled, setCloudEnabled] = useState(false);
  const [cloudConnected, setCloudConnected] = useState(false);
  const [cloudCredits, setCloudCredits] = useState<number | null>(null);
  const [cloudCreditsLow, setCloudCreditsLow] = useState(false);
  const [cloudCreditsCritical, setCloudCreditsCritical] = useState(false);
  const [cloudTopUpUrl, setCloudTopUpUrl] = useState(
    "https://www.elizacloud.ai/dashboard/settings?tab=billing",
  );
  const [cloudUserId, setCloudUserId] = useState<string | null>(null);
  const [cloudLoginBusy, setCloudLoginBusy] = useState(false);
  const [cloudLoginError, setCloudLoginError] = useState<string | null>(null);
  const [cloudDisconnecting, setCloudDisconnecting] = useState(false);

  // --- Updates ---
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);
  const [updateLoading, setUpdateLoading] = useState(false);
  const [updateChannelSaving, setUpdateChannelSaving] = useState(false);

  // --- Extension ---
  const [extensionStatus, setExtensionStatus] =
    useState<ExtensionStatus | null>(null);
  const [extensionChecking, setExtensionChecking] = useState(false);

  // --- Store ---
  const [storePlugins, setStorePlugins] = useState<RegistryPlugin[]>([]);
  const [storeSearch, setStoreSearch] = useState("");
  const [storeFilter, setStoreFilter] = useState<
    "all" | "installed" | "ai-provider" | "connector" | "feature"
  >("all");
  const [storeLoading, setStoreLoading] = useState(false);
  const [storeInstalling, setStoreInstalling] = useState<Set<string>>(
    new Set(),
  );
  const [storeUninstalling, setStoreUninstalling] = useState<Set<string>>(
    new Set(),
  );
  const [storeError, setStoreError] = useState<string | null>(null);
  const [storeDetailPlugin, setStoreDetailPlugin] =
    useState<RegistryPlugin | null>(null);
  const [storeSubTab, setStoreSubTab] = useState<"plugins" | "skills">(
    "plugins",
  );

  // --- Catalog ---
  const [catalogSkills, setCatalogSkills] = useState<CatalogSkill[]>([]);
  const [catalogTotal, setCatalogTotal] = useState(0);
  const [catalogPage, setCatalogPage] = useState(1);
  const [catalogTotalPages, setCatalogTotalPages] = useState(1);
  const [catalogSort, setCatalogSort] = useState<
    "downloads" | "stars" | "updated" | "name"
  >("downloads");
  const [catalogSearch, setCatalogSearch] = useState("");
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [catalogDetailSkill, setCatalogDetailSkill] =
    useState<CatalogSkill | null>(null);
  const [catalogInstalling, setCatalogInstalling] = useState<Set<string>>(
    new Set(),
  );
  const [catalogUninstalling, setCatalogUninstalling] = useState<Set<string>>(
    new Set(),
  );

  // --- Workbench ---
  const [workbenchLoading, setWorkbenchLoading] = useState(false);
  const [workbench, setWorkbench] = useState<WorkbenchOverview | null>(null);
  const [workbenchTasksAvailable, setWorkbenchTasksAvailable] = useState(false);
  const [workbenchTriggersAvailable, setWorkbenchTriggersAvailable] =
    useState(false);
  const [workbenchTodosAvailable, setWorkbenchTodosAvailable] = useState(false);

  // --- Agent export/import ---
  const [exportBusy, setExportBusy] = useState(false);
  const [exportPassword, setExportPassword] = useState("");
  const [exportIncludeLogs, setExportIncludeLogs] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportSuccess, setExportSuccess] = useState<string | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [importPassword, setImportPassword] = useState("");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);

  // --- Onboarding ---
  const [onboardingStep, setOnboardingStep] =
    useState<OnboardingStep>("welcome");
  const [onboardingOptions, setOnboardingOptions] =
    useState<OnboardingOptions | null>(null);
  const [onboardingName, setOnboardingName] = useState("");
  const [onboardingStyle, setOnboardingStyle] = useState("");
  const [onboardingTheme, setOnboardingTheme] = useState<ThemeName>(loadTheme);
  const [onboardingRunMode, setOnboardingRunMode] = useState<
    "local-rawdog" | "local-sandbox" | "cloud" | ""
  >("");
  const [onboardingCloudProvider, setOnboardingCloudProvider] = useState("");
  const [onboardingSmallModel, setOnboardingSmallModel] = useState(
    "moonshotai/kimi-k2-turbo",
  );
  const [onboardingLargeModel, setOnboardingLargeModel] = useState(
    "moonshotai/kimi-k2-0905",
  );
  const [onboardingProvider, setOnboardingProvider] = useState("");
  const [onboardingApiKey, setOnboardingApiKey] = useState("");
  const [onboardingOpenRouterModel, setOnboardingOpenRouterModel] =
    useState("");
  const [onboardingPrimaryModel, setOnboardingPrimaryModel] = useState("");
  const [onboardingTelegramToken, setOnboardingTelegramToken] = useState("");
  const [onboardingDiscordToken, setOnboardingDiscordToken] = useState("");
  const [onboardingWhatsAppSessionPath, setOnboardingWhatsAppSessionPath] =
    useState("");
  const [onboardingTwilioAccountSid, setOnboardingTwilioAccountSid] =
    useState("");
  const [onboardingTwilioAuthToken, setOnboardingTwilioAuthToken] =
    useState("");
  const [onboardingTwilioPhoneNumber, setOnboardingTwilioPhoneNumber] =
    useState("");
  const [onboardingBlooioApiKey, setOnboardingBlooioApiKey] = useState("");
  const [onboardingBlooioPhoneNumber, setOnboardingBlooioPhoneNumber] =
    useState("");
  const [onboardingGithubToken, setOnboardingGithubToken] = useState("");
  const [onboardingSubscriptionTab, setOnboardingSubscriptionTab] = useState<
    "token" | "oauth"
  >("token");
  const [onboardingSelectedChains, setOnboardingSelectedChains] = useState<
    Set<string>
  >(new Set(["evm", "solana"]));
  const [onboardingRpcSelections, setOnboardingRpcSelections] = useState<
    Record<string, string>
  >({});
  const [onboardingRpcKeys, setOnboardingRpcKeys] = useState<
    Record<string, string>
  >({});
  const [onboardingAvatar, setOnboardingAvatar] = useState(1);
  const [onboardingRestarting, setOnboardingRestarting] = useState(false);

  // --- Command palette ---
  const [commandPaletteOpen, _setCommandPaletteOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");
  const [commandActiveIndex, setCommandActiveIndex] = useState(0);

  // --- Emote picker ---
  const [emotePickerOpen, setEmotePickerOpen] = useState(false);

  // --- MCP ---
  const [mcpConfiguredServers, setMcpConfiguredServers] = useState<
    Record<string, McpServerConfig>
  >({});
  const [mcpServerStatuses, setMcpServerStatuses] = useState<McpServerStatus[]>(
    [],
  );
  const [mcpMarketplaceQuery, setMcpMarketplaceQuery] = useState("");
  const [mcpMarketplaceResults, setMcpMarketplaceResults] = useState<
    McpMarketplaceResult[]
  >([]);
  const [mcpMarketplaceLoading, setMcpMarketplaceLoading] = useState(false);
  const [mcpAction, setMcpAction] = useState("");
  const [mcpAddingServer, setMcpAddingServer] =
    useState<McpRegistryServerDetail | null>(null);
  const [mcpAddingResult, setMcpAddingResult] =
    useState<McpMarketplaceResult | null>(null);
  const [mcpEnvInputs, setMcpEnvInputs] = useState<Record<string, string>>({});
  const [mcpHeaderInputs, setMcpHeaderInputs] = useState<
    Record<string, string>
  >({});

  // --- Share ingest ---
  const [droppedFiles, setDroppedFiles] = useState<string[]>([]);
  const [shareIngestNotice, setShareIngestNotice] = useState("");

  // --- Chat pending images ---
  const [chatPendingImages, setChatPendingImages] = useState<ImageAttachment[]>(
    [],
  );

  // --- Game ---
  const [activeGameApp, setActiveGameApp] = useState("");
  const [activeGameDisplayName, setActiveGameDisplayName] = useState("");
  const [activeGameViewerUrl, setActiveGameViewerUrl] = useState("");
  const [activeGameSandbox, setActiveGameSandbox] = useState(
    "allow-scripts allow-same-origin allow-popups",
  );
  const [activeGamePostMessageAuth, setActiveGamePostMessageAuth] =
    useState(false);
  const [activeGamePostMessagePayload, setActiveGamePostMessagePayload] =
    useState<GamePostMessageAuthPayload | null>(null);
  const [gameOverlayEnabled, setGameOverlayEnabled] = useState(false);

  // --- Admin ---
  const [appsSubTab, setAppsSubTab] = useState<"browse" | "games">("browse");
  const [agentSubTab, setAgentSubTab] = useState<
    "character" | "inventory" | "knowledge"
  >("character");
  const [pluginsSubTab, setPluginsSubTab] = useState<
    "features" | "connectors" | "plugins"
  >("features");
  const [databaseSubTab, setDatabaseSubTab] = useState<
    "tables" | "media" | "vectors"
  >("tables");

  // --- Config ---
  const [configRaw, setConfigRaw] = useState<Record<string, unknown>>({});
  const [configText, setConfigText] = useState("");

  // --- Refs for timers ---
  const actionNoticeTimer = useRef<number | null>(null);
  const cloudPollInterval = useRef<number | null>(null);
  const cloudLoginPollTimer = useRef<number | null>(null);
  const prevAgentStateRef = useRef<string | null>(null);
  const lifecycleBusyRef = useRef(false);
  const lifecycleActionRef = useRef<LifecycleAction | null>(null);
  /** Synchronous lock for onboarding finish to prevent duplicate same-tick submits. */
  const onboardingFinishBusyRef = useRef(false);
  const pairingBusyRef = useRef(false);
  /** Guards against double-greeting when both init and state-transition paths fire. */
  const greetingFiredRef = useRef(false);
  const chatAbortRef = useRef<AbortController | null>(null);
  /** Synchronous lock so same-tick chat submits cannot double-send. */
  const chatSendBusyRef = useRef(false);
  /** Synchronous lock for export action to prevent duplicate clicks in the same tick. */
  const exportBusyRef = useRef(false);
  /** Synchronous lock for import action to prevent duplicate clicks in the same tick. */
  const importBusyRef = useRef(false);
  /** Synchronous lock for wallet API key save to prevent duplicate clicks in the same tick. */
  const walletApiKeySavingRef = useRef(false);
  /** Synchronous lock for cloud login action to prevent duplicate clicks in the same tick. */
  const cloudLoginBusyRef = useRef(false);
  /** Synchronous lock for update channel changes to prevent duplicate submits. */
  const updateChannelSavingRef = useRef(false);
  /** Synchronous lock for onboarding completion submit to prevent duplicate clicks. */
  const onboardingFinishSavingRef = useRef(false);

  // ── Action notice ──────────────────────────────────────────────────

  const setActionNotice = useCallback(
    (
      text: string,
      tone: "info" | "success" | "error" = "info",
      ttlMs = 2800,
    ) => {
      setActionNoticeState({ tone, text });
      if (actionNoticeTimer.current != null) {
        window.clearTimeout(actionNoticeTimer.current);
      }
      actionNoticeTimer.current = window.setTimeout(() => {
        setActionNoticeState(null);
        actionNoticeTimer.current = null;
      }, ttlMs);
    },
    [],
  );

  // ── Clipboard ──────────────────────────────────────────────────────

  const copyToClipboard = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
  }, []);

  // ── Theme ──────────────────────────────────────────────────────────

  const setTheme = useCallback((name: ThemeName) => {
    setCurrentTheme(name);
    applyTheme(name);
  }, []);

  // ── Navigation ─────────────────────────────────────────────────────

  const setTab = useCallback(
    (newTab: Tab) => {
      setTabRaw(newTab);
      if (newTab === "apps") {
        setAppsSubTab(activeGameViewerUrl.trim() ? "games" : "browse");
      }
      const path = pathForTab(newTab);
      // In Electron packaged builds (file:// URLs), use hash routing to avoid
      // "Not allowed to load local resource: file:///..." errors.
      if (window.location.protocol === "file:") {
        window.location.hash = path;
      } else {
        window.history.pushState(null, "", path);
      }
    },
    [activeGameViewerUrl],
  );

  const sortTriggersByNextRun = useCallback(
    (items: TriggerSummary[]): TriggerSummary[] => {
      return [...items].sort((a: TriggerSummary, b: TriggerSummary) => {
        const aNext = a.nextRunAtMs ?? Number.MAX_SAFE_INTEGER;
        const bNext = b.nextRunAtMs ?? Number.MAX_SAFE_INTEGER;
        if (aNext !== bNext) return aNext - bNext;
        return a.displayName.localeCompare(b.displayName);
      });
    },
    [],
  );

  // ── Data loading ───────────────────────────────────────────────────

  const loadPlugins = useCallback(async () => {
    try {
      const { plugins: p } = await client.getPlugins();
      setPlugins(p);
    } catch {
      /* ignore */
    }
  }, []);

  const loadSkills = useCallback(async () => {
    try {
      const { skills: s } = await client.getSkills();
      setSkills(s);
    } catch {
      /* ignore */
    }
  }, []);

  const refreshSkills = useCallback(async () => {
    try {
      const { skills: s } = await client.refreshSkills();
      setSkills(s);
    } catch {
      try {
        const { skills: s } = await client.getSkills();
        setSkills(s);
      } catch {
        /* ignore */
      }
    }
  }, []);

  const loadLogs = useCallback(async () => {
    try {
      const filter: Record<string, string> = {};
      if (logTagFilter) filter.tag = logTagFilter;
      if (logLevelFilter) filter.level = logLevelFilter;
      if (logSourceFilter) filter.source = logSourceFilter;
      const data = await client.getLogs(
        Object.keys(filter).length > 0 ? filter : undefined,
      );
      setLogs(data.entries);
      if (data.sources?.length) setLogSources(data.sources);
      if (data.tags?.length) setLogTags(data.tags);
    } catch {
      /* ignore */
    }
  }, [logTagFilter, logLevelFilter, logSourceFilter]);

  const loadTriggerHealth = useCallback(async () => {
    try {
      const health = await client.getTriggerHealth();
      setTriggerHealth(health);
    } catch {
      setTriggerHealth(null);
    }
  }, []);

  const loadTriggers = useCallback(async () => {
    setTriggersLoading(true);
    try {
      const data = await client.getTriggers();
      setTriggers(sortTriggersByNextRun(data.triggers));
      setTriggerError(null);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load triggers";
      setTriggerError(message);
      setTriggers([]);
    } finally {
      setTriggersLoading(false);
    }
  }, [sortTriggersByNextRun]);

  const loadTriggerRuns = useCallback(async (id: string) => {
    try {
      const data = await client.getTriggerRuns(id);
      setTriggerRunsById((prev: Record<string, TriggerRunRecord[]>) => ({
        ...prev,
        [id]: data.runs,
      }));
      setTriggerError(null);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load trigger runs";
      setTriggerError(message);
    }
  }, []);

  const createTrigger = useCallback(
    async (request: CreateTriggerRequest): Promise<TriggerSummary | null> => {
      setTriggersSaving(true);
      try {
        const response = await client.createTrigger(request);
        const created = response.trigger;
        setTriggers((prev: TriggerSummary[]) => {
          const merged = prev.filter(
            (item: TriggerSummary) => item.id !== created.id,
          );
          merged.push(created);
          return sortTriggersByNextRun(merged);
        });
        setTriggerError(null);
        void loadTriggerHealth();
        return created;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to create trigger";
        setTriggerError(message);
        return null;
      } finally {
        setTriggersSaving(false);
      }
    },
    [loadTriggerHealth, sortTriggersByNextRun],
  );

  const updateTrigger = useCallback(
    async (
      id: string,
      request: UpdateTriggerRequest,
    ): Promise<TriggerSummary | null> => {
      setTriggersSaving(true);
      try {
        const response = await client.updateTrigger(id, request);
        const updated = response.trigger;
        setTriggers((prev: TriggerSummary[]) => {
          const merged = prev.map((item: TriggerSummary) =>
            item.id === updated.id ? updated : item,
          );
          return sortTriggersByNextRun(merged);
        });
        setTriggerError(null);
        void loadTriggerHealth();
        return updated;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to update trigger";
        setTriggerError(message);
        return null;
      } finally {
        setTriggersSaving(false);
      }
    },
    [loadTriggerHealth, sortTriggersByNextRun],
  );

  const deleteTrigger = useCallback(
    async (id: string): Promise<boolean> => {
      setTriggersSaving(true);
      try {
        await client.deleteTrigger(id);
        setTriggers((prev: TriggerSummary[]) =>
          prev.filter((item: TriggerSummary) => item.id !== id),
        );
        setTriggerRunsById((prev: Record<string, TriggerRunRecord[]>) => {
          const next: Record<string, TriggerRunRecord[]> = {};
          for (const [key, runs] of Object.entries(prev)) {
            if (key !== id) next[key] = runs;
          }
          return next;
        });
        setTriggerError(null);
        void loadTriggerHealth();
        return true;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to delete trigger";
        setTriggerError(message);
        return false;
      } finally {
        setTriggersSaving(false);
      }
    },
    [loadTriggerHealth],
  );

  const runTriggerNow = useCallback(
    async (id: string): Promise<boolean> => {
      setTriggersSaving(true);
      try {
        const response = await client.runTriggerNow(id);
        if (response.trigger) {
          const trigger = response.trigger;
          setTriggers((prev: TriggerSummary[]) => {
            const idx = prev.findIndex(
              (item: TriggerSummary) => item.id === id,
            );
            if (idx === -1) {
              return sortTriggersByNextRun([...prev, trigger]);
            }
            const updated = [...prev];
            updated[idx] = trigger;
            return sortTriggersByNextRun(updated);
          });
        } else {
          await loadTriggers();
        }
        await loadTriggerRuns(id);
        void loadTriggerHealth();
        setTriggerError(null);
        return response.ok;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to run trigger";
        setTriggerError(message);
        return false;
      } finally {
        setTriggersSaving(false);
      }
    },
    [loadTriggerHealth, loadTriggerRuns, loadTriggers, sortTriggersByNextRun],
  );

  const applyAutonomyEventMerge = useCallback(
    (incomingEvents: StreamEventEnvelope[], replay = false) => {
      const merged = mergeAutonomyEvents({
        store: autonomousStoreRef.current,
        incomingEvents,
        runHealthByRunId: autonomousRunHealthByRunIdRef.current,
        replay,
      });
      autonomousStoreRef.current = merged.store;
      autonomousEventsRef.current = merged.events;
      autonomousLatestEventIdRef.current = merged.latestEventId;
      autonomousRunHealthByRunIdRef.current = merged.runHealthByRunId;

      setAutonomousEvents(merged.events);
      setAutonomousLatestEventId(merged.latestEventId);
      setAutonomousRunHealthByRunId(merged.runHealthByRunId);

      return merged;
    },
    [],
  );

  const fetchAutonomyReplay = useCallback(async () => {
    if (autonomousReplayInFlightRef.current) return;
    autonomousReplayInFlightRef.current = true;
    try {
      const afterEventId = autonomousStoreRef.current.watermark ?? undefined;
      const replay = await client.getAgentEvents({
        afterEventId,
        limit: 300,
      });

      if (replay.events.length > 0) {
        applyAutonomyEventMerge(replay.events);
      }

      const gapReplays = buildAutonomyGapReplayRequests(
        autonomousRunHealthByRunIdRef.current,
        autonomousStoreRef.current,
      ).slice(0, 4);

      for (const request of gapReplays) {
        const gapReplay = await client.getAgentEvents({
          runId: request.runId,
          fromSeq: request.fromSeq,
          limit: 300,
        });
        if (gapReplay.events.length > 0) {
          applyAutonomyEventMerge(gapReplay.events);
        }
      }

      if (hasPendingAutonomyGaps(autonomousRunHealthByRunIdRef.current)) {
        const partial = markPendingAutonomyGapsPartial(
          autonomousRunHealthByRunIdRef.current,
          Date.now(),
        );
        autonomousRunHealthByRunIdRef.current = partial;
        setAutonomousRunHealthByRunId(partial);
      }
    } catch (err) {
      if (hasPendingAutonomyGaps(autonomousRunHealthByRunIdRef.current)) {
        const partial = markPendingAutonomyGapsPartial(
          autonomousRunHealthByRunIdRef.current,
          Date.now(),
        );
        autonomousRunHealthByRunIdRef.current = partial;
        setAutonomousRunHealthByRunId(partial);
      }
      console.warn("[milady] Failed to fetch autonomous event replay", err);
    } finally {
      autonomousReplayInFlightRef.current = false;
    }
  }, [applyAutonomyEventMerge]);

  const appendAutonomousEvent = useCallback(
    (event: StreamEventEnvelope) => {
      const merged = applyAutonomyEventMerge([event]);
      if (merged.runsWithNewGaps.length > 0) {
        void fetchAutonomyReplay();
      }
    },
    [applyAutonomyEventMerge, fetchAutonomyReplay],
  );

  const loadConversations = useCallback(async (): Promise<
    Conversation[] | null
  > => {
    try {
      const { conversations: c } = await client.listConversations();
      setConversations(c);
      return c;
    } catch {
      return null;
    }
  }, []);

  const loadConversationMessages = useCallback(
    async (convId: string): Promise<LoadConversationMessagesResult> => {
      try {
        const { messages } = await client.getConversationMessages(convId);
        setConversationMessages(messages);
        return { ok: true };
      } catch (err) {
        const status = (err as { status?: number }).status;
        if (status === 404) {
          const refreshed = await client.listConversations().catch(() => null);
          if (refreshed) {
            setConversations(refreshed.conversations);
            if (activeConversationIdRef.current === convId) {
              const fallbackId = refreshed.conversations[0]?.id ?? null;
              setActiveConversationId(fallbackId);
              activeConversationIdRef.current = fallbackId;
            }
          } else if (activeConversationIdRef.current === convId) {
            setActiveConversationId(null);
            activeConversationIdRef.current = null;
          }
        }
        setConversationMessages([]);
        return {
          ok: false,
          status,
          message:
            err instanceof Error
              ? err.message
              : "Failed to load conversation messages",
        };
      }
    },
    [],
  );

  const loadWalletConfig = useCallback(async () => {
    try {
      const cfg = await client.getWalletConfig();
      setWalletConfig(cfg);
      setWalletAddresses({
        evmAddress: cfg.evmAddress,
        solanaAddress: cfg.solanaAddress,
      });
      setWalletError(null);
    } catch (err) {
      setWalletError(
        `Failed to load wallet config: ${err instanceof Error ? err.message : "network error"}`,
      );
    }
  }, []);

  const loadBalances = useCallback(async () => {
    setWalletLoading(true);
    setWalletError(null);
    try {
      const b = await client.getWalletBalances();
      setWalletBalances(b);
    } catch (err) {
      setWalletError(
        `Failed to fetch balances: ${err instanceof Error ? err.message : "network error"}`,
      );
    }
    setWalletLoading(false);
  }, []);

  const loadNfts = useCallback(async () => {
    setWalletNftsLoading(true);
    setWalletError(null);
    try {
      const n = await client.getWalletNfts();
      setWalletNfts(n);
    } catch (err) {
      setWalletError(
        `Failed to fetch NFTs: ${err instanceof Error ? err.message : "network error"}`,
      );
    }
    setWalletNftsLoading(false);
  }, []);

  const loadInventory = useCallback(async () => {
    await loadWalletConfig();
  }, [loadWalletConfig]);

  const loadCharacter = useCallback(async () => {
    setCharacterLoading(true);
    setCharacterSaveError(null);
    setCharacterSaveSuccess(null);
    try {
      const { character } = await client.getCharacter();
      setCharacterData(character);
      setCharacterDraft({
        name: character.name ?? "",
        username: character.username ?? "",
        bio: Array.isArray(character.bio)
          ? character.bio.join("\n")
          : (character.bio ?? ""),
        system: character.system ?? "",
        adjectives: character.adjectives ?? [],
        topics: character.topics ?? [],
        style: {
          all: character.style?.all ?? [],
          chat: character.style?.chat ?? [],
          post: character.style?.post ?? [],
        },
        postExamples: character.postExamples ?? [],
      });
    } catch {
      setCharacterData(null);
      setCharacterDraft({});
    }
    setCharacterLoading(false);
  }, []);

  const loadWorkbench = useCallback(async () => {
    setWorkbenchLoading(true);
    try {
      const result = await client.getWorkbenchOverview();
      setWorkbench(result);
      setWorkbenchTasksAvailable(result.tasksAvailable ?? false);
      setWorkbenchTriggersAvailable(result.triggersAvailable ?? false);
      setWorkbenchTodosAvailable(result.todosAvailable ?? false);
    } catch {
      setWorkbench(null);
      setWorkbenchTasksAvailable(false);
      setWorkbenchTriggersAvailable(false);
      setWorkbenchTodosAvailable(false);
    } finally {
      setWorkbenchLoading(false);
    }
  }, []);

  const loadUpdateStatus = useCallback(async (force = false) => {
    setUpdateLoading(true);
    try {
      const status = await client.getUpdateStatus(force);
      setUpdateStatus(status);
    } catch {
      /* ignore */
    }
    setUpdateLoading(false);
  }, []);

  const checkExtensionStatus = useCallback(async () => {
    setExtensionChecking(true);
    try {
      const ext = await client.getExtensionStatus();
      setExtensionStatus(ext);
    } catch {
      setExtensionStatus({
        relayReachable: false,
        relayPort: 18792,
        extensionPath: null,
      });
    }
    setExtensionChecking(false);
  }, []);

  const pollCloudCredits = useCallback(async () => {
    const cloudStatus = await client.getCloudStatus().catch(() => null);
    if (!cloudStatus) {
      setCloudConnected(false);
      setCloudCredits(null);
      setCloudCreditsLow(false);
      setCloudCreditsCritical(false);
      return;
    }
    // A cached cloud API key represents a completed login and should be shared
    // across all views, even before runtime CLOUD_AUTH fully initializes.
    const isConnected = Boolean(cloudStatus.connected || cloudStatus.hasApiKey);
    setCloudEnabled(Boolean(cloudStatus.enabled ?? false));
    setCloudConnected(Boolean(isConnected));
    setCloudUserId(cloudStatus.userId ?? null);
    if (cloudStatus.topUpUrl) setCloudTopUpUrl(cloudStatus.topUpUrl);
    if (isConnected) {
      const credits = await client.getCloudCredits().catch(() => null);
      if (credits && typeof credits.balance === "number") {
        setCloudCredits(credits.balance);
        setCloudCreditsLow(credits.low ?? false);
        setCloudCreditsCritical(credits.critical ?? false);
        if (credits.topUpUrl) setCloudTopUpUrl(credits.topUpUrl);
      } else {
        setCloudCredits(null);
        setCloudCreditsLow(false);
        setCloudCreditsCritical(false);
        if (credits?.topUpUrl) setCloudTopUpUrl(credits.topUpUrl);
      }
    } else {
      setCloudCredits(null);
      setCloudCreditsLow(false);
      setCloudCreditsCritical(false);
    }
  }, []);

  // ── Lifecycle actions ──────────────────────────────────────────────

  const beginLifecycleAction = useCallback(
    (action: LifecycleAction): boolean => {
      if (lifecycleBusyRef.current) {
        const activeAction =
          lifecycleActionRef.current ?? lifecycleAction ?? action;
        setActionNotice(
          `Agent action already in progress (${LIFECYCLE_MESSAGES[activeAction].inProgress}). Please wait.`,
          "info",
          2800,
        );
        return false;
      }
      lifecycleBusyRef.current = true;
      lifecycleActionRef.current = action;
      setLifecycleBusy(true);
      setLifecycleAction(action);
      return true;
    },
    [lifecycleAction, setActionNotice],
  );

  const finishLifecycleAction = useCallback(() => {
    lifecycleBusyRef.current = false;
    lifecycleActionRef.current = null;
    setLifecycleBusy(false);
    setLifecycleAction(null);
  }, []);

  const handleStart = useCallback(async () => {
    if (!beginLifecycleAction("start")) return;
    setActionNotice(LIFECYCLE_MESSAGES.start.progress, "info", 3000);
    try {
      const s = await client.startAgent();
      setAgentStatus(s);
      setActionNotice(LIFECYCLE_MESSAGES.start.success, "success", 2400);
    } catch (err) {
      setActionNotice(
        `Failed to ${LIFECYCLE_MESSAGES.start.verb} agent: ${
          err instanceof Error ? err.message : "unknown error"
        }`,
        "error",
        4200,
      );
    } finally {
      finishLifecycleAction();
    }
  }, [beginLifecycleAction, finishLifecycleAction, setActionNotice]);

  const handleStop = useCallback(async () => {
    if (!beginLifecycleAction("stop")) return;
    setActionNotice(LIFECYCLE_MESSAGES.stop.progress, "info", 3000);
    try {
      const s = await client.stopAgent();
      setAgentStatus(s);
      setActionNotice(LIFECYCLE_MESSAGES.stop.success, "success", 2400);
    } catch (err) {
      setActionNotice(
        `Failed to ${LIFECYCLE_MESSAGES.stop.verb} agent: ${
          err instanceof Error ? err.message : "unknown error"
        }`,
        "error",
        4200,
      );
    } finally {
      finishLifecycleAction();
    }
  }, [beginLifecycleAction, finishLifecycleAction, setActionNotice]);

  const handlePauseResume = useCallback(async () => {
    if (!agentStatus) return;
    const action: LifecycleAction | null =
      agentStatus.state === "running"
        ? "pause"
        : agentStatus.state === "paused"
          ? "resume"
          : null;
    if (!action) return;
    if (!beginLifecycleAction(action)) return;
    setActionNotice(LIFECYCLE_MESSAGES[action].progress, "info", 3000);
    try {
      if (agentStatus.state === "running") {
        setAgentStatus(await client.pauseAgent());
      } else if (agentStatus.state === "paused") {
        setAgentStatus(await client.resumeAgent());
      }
      setActionNotice(LIFECYCLE_MESSAGES[action].success, "success", 2400);
    } catch (err) {
      setActionNotice(
        `Failed to ${LIFECYCLE_MESSAGES[action].verb} agent: ${
          err instanceof Error ? err.message : "unknown error"
        }`,
        "error",
        4200,
      );
    } finally {
      finishLifecycleAction();
    }
  }, [
    agentStatus,
    beginLifecycleAction,
    finishLifecycleAction,
    setActionNotice,
  ]);

  const handleRestart = useCallback(async () => {
    if (!beginLifecycleAction("restart")) return;
    setActionNotice(LIFECYCLE_MESSAGES.restart.progress, "info", 3200);
    try {
      setAgentStatus({
        ...(agentStatus ?? {
          agentName: "Milady",
          model: undefined,
          uptime: undefined,
          startedAt: undefined,
        }),
        state: "restarting",
      });
      // Server restart clears in-memory conversations — reset client state
      setActiveConversationId(null);
      setConversationMessages([]);
      setConversations([]);
      const s = await client.restartAgent();
      setAgentStatus(s);
      setPendingRestart(false);
      setPendingRestartReasons([]);
      setActionNotice(LIFECYCLE_MESSAGES.restart.success, "success", 2400);
    } catch (err) {
      setActionNotice(
        `Failed to ${LIFECYCLE_MESSAGES.restart.verb} agent: ${
          err instanceof Error ? err.message : "unknown error"
        }`,
        "error",
        4200,
      );
      setTimeout(async () => {
        try {
          setAgentStatus(await client.getStatus());
        } catch {
          /* ignore */
        }
      }, 3000);
    } finally {
      finishLifecycleAction();
    }
  }, [
    agentStatus,
    beginLifecycleAction,
    finishLifecycleAction,
    setActionNotice,
  ]);

  const dismissRestartBanner = useCallback(() => {
    setRestartBannerDismissed(true);
  }, []);

  const triggerRestart = useCallback(async () => {
    await handleRestart();
  }, [handleRestart]);

  const retryStartup = useCallback(() => {
    setStartupError(null);
    setAuthRequired(false);
    setOnboardingLoading(true);
    setStartupPhase("starting-backend");
    setStartupRetryNonce((prev) => prev + 1);
  }, []);

  const handleReset = useCallback(async () => {
    if (lifecycleBusyRef.current) {
      const activeAction =
        lifecycleActionRef.current ?? lifecycleAction ?? "reset";
      setActionNotice(
        `Agent action already in progress (${LIFECYCLE_MESSAGES[activeAction].inProgress}). Please wait.`,
        "info",
        2800,
      );
      return;
    }
    const confirmed = window.confirm(
      "This will completely reset the agent — wiping all config, memory, and data.\n\n" +
        "You will be taken back to the onboarding wizard.\n\n" +
        "Are you sure?",
    );
    if (!confirmed) return;
    if (!beginLifecycleAction("reset")) return;
    setActionNotice(LIFECYCLE_MESSAGES.reset.progress, "info", 3200);
    try {
      await client.resetAgent();
      setAgentStatus(null);
      setOnboardingComplete(false);
      setOnboardingStep("welcome");
      setConversationMessages([]);
      setActiveConversationId(null);
      activeConversationIdRef.current = null;
      setConversations([]);
      setPlugins([]);
      setSkills([]);
      setLogs([]);
      try {
        const options = await client.getOnboardingOptions();
        setOnboardingOptions(options);
      } catch {
        /* ignore */
      }
      setActionNotice(LIFECYCLE_MESSAGES.reset.success, "success", 3200);
    } catch (err) {
      setActionNotice(
        `Failed to ${LIFECYCLE_MESSAGES.reset.verb} agent: ${
          err instanceof Error ? err.message : "unknown error"
        }`,
        "error",
        4200,
      );
      window.alert("Reset failed. Check the console for details.");
    } finally {
      finishLifecycleAction();
    }
  }, [
    lifecycleAction,
    beginLifecycleAction,
    finishLifecycleAction,
    setActionNotice,
  ]);

  // ── Chat ───────────────────────────────────────────────────────────

  /** Request an agent greeting for a conversation and add it to messages. */
  const fetchGreeting = useCallback(async (convId: string) => {
    setChatSending(true);
    try {
      const data = await client.requestGreeting(convId);
      if (data.text) {
        setConversationMessages((prev: ConversationMessage[]) => [
          ...prev,
          {
            id: `greeting-${Date.now()}`,
            role: "assistant",
            text: data.text,
            timestamp: Date.now(),
          },
        ]);
      }
    } catch {
      /* greeting failed silently — user can still chat */
    } finally {
      setChatSending(false);
    }
  }, []);

  const handleNewConversation = useCallback(async () => {
    try {
      const { conversation } = await client.createConversation();
      setConversations((prev) => [conversation, ...prev]);
      setActiveConversationId(conversation.id);
      activeConversationIdRef.current = conversation.id;
      setConversationMessages([]);
      // Agent sends the first message
      greetingFiredRef.current = true;
      void fetchGreeting(conversation.id);
      client.sendWsMessage({
        type: "active-conversation",
        conversationId: conversation.id,
      });
    } catch {
      /* ignore */
    }
  }, [fetchGreeting]);

  const appendLocalCommandTurn = useCallback(
    (userText: string, assistantText: string) => {
      const now = Date.now();
      const nonce = Math.random().toString(36).slice(2, 8);
      setConversationMessages((prev: ConversationMessage[]) => [
        ...prev,
        {
          id: `local-user-${now}-${nonce}`,
          role: "user",
          text: userText,
          timestamp: now,
        },
        {
          id: `local-assistant-${now}-${nonce}`,
          role: "assistant",
          text: assistantText,
          timestamp: now,
          source: "local_command",
        },
      ]);
    },
    [],
  );

  const tryHandlePrefixedChatCommand = useCallback(
    async (
      rawText: string,
    ): Promise<{ handled: boolean; rewrittenText?: string }> => {
      const slash = parseSlashCommandInput(rawText);
      if (slash) {
        const savedCommand = loadSavedCustomCommands().find(
          (command) => normalizeSlashCommandName(command.name) === slash.name,
        );
        if (savedCommand) {
          const rewrittenText = expandSavedCustomCommand(
            savedCommand.text,
            slash.argsRaw,
          );
          if (!rewrittenText.trim()) {
            appendLocalCommandTurn(
              rawText,
              `Saved command "/${slash.name}" is empty.`,
            );
            return { handled: true };
          }
          return { handled: false, rewrittenText };
        }

        if (slash.name === "commands") {
          const customActions = (await client.listCustomActions()).filter(
            (action) => action.enabled,
          );
          const customCommandNames = customActions
            .map((action) => `/${action.name.toLowerCase()}`)
            .sort();
          const savedCommandNames = loadSavedCustomCommands()
            .map((command) => `/${normalizeSlashCommandName(command.name)}`)
            .sort();
          const lines = [
            formatSearchBullet("Saved / commands", savedCommandNames),
            formatSearchBullet("Custom action / commands", customCommandNames),
            "Use #remember ... to save memory notes. Use #memory or #knowledge to target retrieval.",
            "Use $query for a quick, non-persistent context answer.",
          ];
          appendLocalCommandTurn(rawText, lines.join("\n\n"));
          return { handled: true };
        }

        let customActions: CustomActionDef[] = [];
        try {
          customActions = (await client.listCustomActions()).filter(
            (action) => action.enabled,
          );
        } catch {
          // If custom actions can't be loaded, fall back to normal slash routing.
          return { handled: false };
        }

        const customAction = customActions.find(
          (action) =>
            normalizeCustomActionName(action.name).toLowerCase() === slash.name,
        );
        if (customAction) {
          const { params, missingRequired } = parseCustomActionParams(
            customAction,
            slash.argsRaw,
          );
          if (missingRequired.length > 0) {
            appendLocalCommandTurn(
              rawText,
              `Missing required parameter(s): ${missingRequired.join(", ")}`,
            );
            return { handled: true };
          }

          const result = await client.testCustomAction(customAction.id, params);
          if (!result.ok) {
            appendLocalCommandTurn(
              rawText,
              `Custom action "${customAction.name}" failed: ${
                result.error ?? "unknown error"
              }`,
            );
            return { handled: true };
          }

          appendLocalCommandTurn(
            rawText,
            result.output?.trim() || `(no output from ${customAction.name})`,
          );
          return { handled: true };
        }
      }

      if (rawText.startsWith("#")) {
        const commandBody = rawText.slice(1).trim();
        if (!commandBody) {
          appendLocalCommandTurn(
            rawText,
            "Usage: #remember <text>, #memory <query>, #knowledge <query>, or #<query>.",
          );
          return { handled: true };
        }

        const lower = commandBody.toLowerCase();
        if (
          lower.startsWith("remember ") ||
          lower.startsWith("remmeber ") ||
          lower.startsWith("save ")
        ) {
          const memoryText = commandBody
            .replace(/^(remember|remmeber|save)\s+/i, "")
            .trim();
          if (!memoryText) {
            appendLocalCommandTurn(rawText, "Nothing to remember.");
            return { handled: true };
          }
          await client.rememberMemory(memoryText);
          appendLocalCommandTurn(rawText, `Saved memory note: "${memoryText}"`);
          return { handled: true };
        }

        let scope: "memory" | "knowledge" | "all" = "all";
        let query = commandBody;
        if (lower.startsWith("memory ")) {
          scope = "memory";
          query = commandBody.slice("memory ".length).trim();
        } else if (lower.startsWith("knowledge ")) {
          scope = "knowledge";
          query = commandBody.slice("knowledge ".length).trim();
        } else if (lower.startsWith("all ")) {
          scope = "all";
          query = commandBody.slice("all ".length).trim();
        }

        if (!query) {
          appendLocalCommandTurn(rawText, "Search query cannot be empty.");
          return { handled: true };
        }

        const [memoryResult, knowledgeResult] = await Promise.all([
          scope === "knowledge"
            ? Promise.resolve(null)
            : client.searchMemory(query, { limit: 6 }),
          scope === "memory"
            ? Promise.resolve(null)
            : client.searchKnowledge(query, { threshold: 0.2, limit: 6 }),
        ]);

        const memoryLines =
          memoryResult?.results.map(
            (item, index) =>
              `${index + 1}. ${item.text.replace(/\s+/g, " ").trim()}`,
          ) ?? [];
        const knowledgeLines =
          knowledgeResult?.results.map(
            (item, index) =>
              `${index + 1}. ${item.text.replace(/\s+/g, " ").trim()} (sim ${item.similarity.toFixed(2)})`,
          ) ?? [];

        appendLocalCommandTurn(
          rawText,
          [
            scope === "memory"
              ? "Memory search"
              : scope === "knowledge"
                ? "Knowledge search"
                : "Memory + knowledge search",
            "",
            scope === "knowledge"
              ? ""
              : formatSearchBullet("Memories", memoryLines),
            scope === "memory"
              ? ""
              : formatSearchBullet("Knowledge", knowledgeLines),
          ]
            .filter(Boolean)
            .join("\n\n"),
        );
        return { handled: true };
      }

      if (rawText.startsWith("$")) {
        const queryRaw = rawText.slice(1).trim();
        if (queryRaw) {
          appendLocalCommandTurn(
            rawText,
            "Use bare `$` only. `$ <text>` is not supported.",
          );
          return { handled: true };
        }
        const query =
          "What is most relevant from memory and knowledge right now?";

        const quick = await client.quickContext(query, { limit: 6 });
        const memoryLines = quick.memories.map(
          (item, index) =>
            `${index + 1}. ${item.text.replace(/\s+/g, " ").trim()}`,
        );
        const knowledgeLines = quick.knowledge.map(
          (item, index) =>
            `${index + 1}. ${item.text.replace(/\s+/g, " ").trim()} (sim ${item.similarity.toFixed(2)})`,
        );
        appendLocalCommandTurn(
          rawText,
          [
            quick.answer,
            "",
            formatSearchBullet("Memories used", memoryLines),
            formatSearchBullet("Knowledge used", knowledgeLines),
          ].join("\n"),
        );
        return { handled: true };
      }

      return { handled: false };
    },
    [appendLocalCommandTurn],
  );

  const handleChatSend = useCallback(
    async (channelType: ConversationChannelType = "DM") => {
      const rawText = chatInput.trim();
      if (!rawText) return;
      if (chatSendBusyRef.current || chatSending) return;
      chatSendBusyRef.current = true;

      // Capture and clear pending images before async work
      const imagesToSend = chatPendingImages.length
        ? chatPendingImages
        : undefined;
      setChatPendingImages([]);

      try {
        let text = rawText;
        let commandResult: { handled: boolean; rewrittenText?: string };
        try {
          commandResult = await tryHandlePrefixedChatCommand(rawText);
        } catch (err) {
          appendLocalCommandTurn(
            rawText,
            `Command failed: ${err instanceof Error ? err.message : "unknown error"}`,
          );
          setChatInput("");
          return;
        }
        if (commandResult.handled) {
          setChatInput("");
          return;
        }
        if (
          typeof commandResult.rewrittenText === "string" &&
          commandResult.rewrittenText.trim()
        ) {
          text = commandResult.rewrittenText.trim();
        }

        let convId: string = activeConversationId ?? "";
        if (!convId) {
          try {
            const { conversation } = await client.createConversation();
            setConversations((prev) => [conversation, ...prev]);
            setActiveConversationId(conversation.id);
            activeConversationIdRef.current = conversation.id;
            convId = conversation.id;
          } catch {
            return;
          }
        }

        // Keep server-side active conversation in sync for proactive routing.
        client.sendWsMessage({
          type: "active-conversation",
          conversationId: convId,
        });

        const now = Date.now();
        const userMsgId = `temp-${now}`;
        const assistantMsgId = `temp-resp-${now}`;

        setConversationMessages((prev: ConversationMessage[]) => [
          ...prev,
          { id: userMsgId, role: "user", text, timestamp: now },
          { id: assistantMsgId, role: "assistant", text: "", timestamp: now },
        ]);
        setChatInput("");
        setChatSending(true);
        setChatFirstTokenReceived(false);

        const controller = new AbortController();
        chatAbortRef.current = controller;
        let streamedAssistantText = "";

        try {
          const data = await client.sendConversationMessageStream(
            convId,
            text,
            (token) => {
              const delta = computeStreamingDelta(streamedAssistantText, token);
              if (!delta) return;
              streamedAssistantText += delta;
              setChatFirstTokenReceived(true);
              setConversationMessages((prev) =>
                prev.map((message) =>
                  message.id === assistantMsgId
                    ? { ...message, text: `${message.text}${delta}` }
                    : message,
                ),
              );
            },
            channelType,
            controller.signal,
            imagesToSend,
          );

          if (shouldApplyFinalStreamText(streamedAssistantText, data.text)) {
            setConversationMessages((prev) => {
              let changed = false;
              const next = prev.map((message) => {
                if (message.id !== assistantMsgId) return message;
                if (message.text === data.text) return message;
                changed = true;
                return { ...message, text: data.text };
              });
              return changed ? next : prev;
            });
          }
          void loadConversations();
        } catch (err) {
          const abortError = err as Error;
          if (abortError.name === "AbortError") {
            setConversationMessages((prev) =>
              prev.filter(
                (message) =>
                  !(message.id === assistantMsgId && !message.text.trim()),
              ),
            );
            return;
          }

          // If the conversation was lost (server restart), create a fresh one and retry once.
          const status = (err as { status?: number }).status;
          if (status === 404) {
            try {
              const { conversation } = await client.createConversation();
              setConversations((prev) => [conversation, ...prev]);
              setActiveConversationId(conversation.id);
              activeConversationIdRef.current = conversation.id;
              client.sendWsMessage({
                type: "active-conversation",
                conversationId: conversation.id,
              });

              const retryData = await client.sendConversationMessage(
                conversation.id,
                text,
                channelType,
                imagesToSend,
              );
              setConversationMessages([
                {
                  id: `temp-${Date.now()}`,
                  role: "user",
                  text,
                  timestamp: Date.now(),
                },
                {
                  id: `temp-resp-${Date.now()}`,
                  role: "assistant",
                  text: retryData.text,
                  timestamp: Date.now(),
                },
              ]);
            } catch {
              setConversationMessages((prev) =>
                prev.filter(
                  (message) =>
                    !(message.id === assistantMsgId && !message.text.trim()),
                ),
              );
            }
          } else {
            await loadConversationMessages(convId);
          }
        } finally {
          if (chatAbortRef.current === controller) {
            chatAbortRef.current = null;
          }
          setChatSending(false);
          setChatFirstTokenReceived(false);
        }
      } finally {
        chatSendBusyRef.current = false;
      }
    },
    [
      chatInput,
      chatSending,
      chatPendingImages,
      activeConversationId,
      loadConversationMessages,
      loadConversations,
      appendLocalCommandTurn,
      tryHandlePrefixedChatCommand,
    ],
  );

  const handleChatStop = useCallback(() => {
    chatSendBusyRef.current = false;
    chatAbortRef.current?.abort();
    chatAbortRef.current = null;
    setChatSending(false);
    setChatFirstTokenReceived(false);
  }, []);

  const handleChatClear = useCallback(async () => {
    const convId = activeConversationId;
    if (!convId) {
      setActionNotice("No active conversation to clear.", "info", 2200);
      return;
    }
    try {
      await client.deleteConversation(convId);
      setActiveConversationId(null);
      activeConversationIdRef.current = null;
      setConversationMessages([]);
      setUnreadConversations((prev) => {
        const next = new Set(prev);
        next.delete(convId);
        return next;
      });
      await loadConversations();
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (status === 404) {
        setActiveConversationId(null);
        activeConversationIdRef.current = null;
        setConversationMessages([]);
        setUnreadConversations((prev) => {
          const next = new Set(prev);
          next.delete(convId);
          return next;
        });
        await loadConversations();
        setActionNotice("Conversation was already cleared.", "info", 2600);
        return;
      }
      setActionNotice(
        `Failed to clear conversation: ${err instanceof Error ? err.message : "network error"}`,
        "error",
        4200,
      );
    }
  }, [activeConversationId, loadConversations, setActionNotice]);

  const handleSelectConversation = useCallback(
    async (id: string) => {
      if (id === activeConversationId) return;
      const previousActive = activeConversationId;
      setActiveConversationId(id);
      activeConversationIdRef.current = id;
      client.sendWsMessage({ type: "active-conversation", conversationId: id });
      setUnreadConversations((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      const loaded = await loadConversationMessages(id);
      if (loaded.ok) return;

      if (loaded.status === 404) {
        const refreshed = await loadConversations();
        const fallbackId = refreshed?.[0]?.id ?? null;
        if (fallbackId) {
          setActiveConversationId(fallbackId);
          activeConversationIdRef.current = fallbackId;
          client.sendWsMessage({
            type: "active-conversation",
            conversationId: fallbackId,
          });
          const fallbackLoaded = await loadConversationMessages(fallbackId);
          if (!fallbackLoaded.ok) {
            setActionNotice(
              `Failed to load fallback conversation: ${fallbackLoaded.message}`,
              "error",
              4200,
            );
          }
        } else {
          setActiveConversationId(null);
          activeConversationIdRef.current = null;
          setConversationMessages([]);
        }
        setActionNotice(
          "Conversation was not found. Refreshed the conversation list.",
          "info",
          3200,
        );
        return;
      }

      setActiveConversationId(previousActive);
      activeConversationIdRef.current = previousActive;
      if (previousActive) {
        client.sendWsMessage({
          type: "active-conversation",
          conversationId: previousActive,
        });
        const restored = await loadConversationMessages(previousActive);
        if (!restored.ok) {
          setActionNotice(
            `Failed to restore previous conversation: ${restored.message}`,
            "error",
            4200,
          );
        }
      } else {
        setConversationMessages([]);
      }
      setActionNotice(
        `Failed to load conversation: ${loaded.message}`,
        "error",
        4200,
      );
    },
    [
      activeConversationId,
      loadConversationMessages,
      loadConversations,
      setActionNotice,
    ],
  );

  const handleDeleteConversation = useCallback(
    async (id: string) => {
      const deletingActive = activeConversationId === id;
      try {
        await client.deleteConversation(id);
        setConversations((prev) =>
          prev.filter((conversation) => conversation.id !== id),
        );
        setUnreadConversations((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        if (deletingActive) {
          setActiveConversationId(null);
          activeConversationIdRef.current = null;
          setConversationMessages([]);
        }
        const refreshed = await loadConversations();
        if (deletingActive) {
          const fallbackId = refreshed?.[0]?.id ?? null;
          if (fallbackId) {
            setActiveConversationId(fallbackId);
            activeConversationIdRef.current = fallbackId;
            client.sendWsMessage({
              type: "active-conversation",
              conversationId: fallbackId,
            });
            const fallbackLoaded = await loadConversationMessages(fallbackId);
            if (!fallbackLoaded.ok) {
              setActionNotice(
                `Failed to load fallback conversation: ${fallbackLoaded.message}`,
                "error",
                4200,
              );
            }
          }
        }
      } catch (err) {
        const status = (err as { status?: number }).status;
        if (status === 404) {
          setConversations((prev) =>
            prev.filter((conversation) => conversation.id !== id),
          );
          setUnreadConversations((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
          if (deletingActive) {
            setActiveConversationId(null);
            activeConversationIdRef.current = null;
            setConversationMessages([]);
          }
          await loadConversations();
          setActionNotice(
            "Conversation was already deleted. Refreshed the conversation list.",
            "info",
            3200,
          );
          return;
        }
        setActionNotice(
          `Failed to delete conversation: ${err instanceof Error ? err.message : "network error"}`,
          "error",
          4200,
        );
      }
    },
    [
      activeConversationId,
      loadConversationMessages,
      loadConversations,
      setActionNotice,
    ],
  );

  const handleRenameConversation = useCallback(
    async (id: string, title: string) => {
      const trimmed = title.trim();
      if (!trimmed) {
        setActionNotice("Conversation title cannot be empty.", "error", 2800);
        return;
      }
      try {
        const { conversation } = await client.renameConversation(id, trimmed);
        setConversations((prev) =>
          prev.map((existing) =>
            existing.id === id ? conversation : existing,
          ),
        );
      } catch (err) {
        const status = (err as { status?: number }).status;
        if (status === 404) {
          await loadConversations();
          setActionNotice(
            "Conversation was not found. Refreshed the conversation list.",
            "info",
            3200,
          );
          return;
        }
        setActionNotice(
          `Failed to rename conversation: ${err instanceof Error ? err.message : "network error"}`,
          "error",
          4200,
        );
      }
    },
    [loadConversations, setActionNotice],
  );

  // ── Pairing ────────────────────────────────────────────────────────

  const handlePairingSubmit = useCallback(async () => {
    if (pairingBusyRef.current || pairingBusy) return;
    const code = pairingCodeInput.trim();
    if (!code) {
      setPairingError("Enter the pairing code from the server logs.");
      return;
    }
    setPairingError(null);
    pairingBusyRef.current = true;
    setPairingBusy(true);
    try {
      const { token } = await client.pair(code);
      client.setToken(token);
      window.location.reload();
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (status === 410)
        setPairingError("Pairing code expired. Check logs for a new code.");
      else if (status === 429)
        setPairingError("Too many attempts. Try again later.");
      else setPairingError("Pairing failed. Check the code and try again.");
    } finally {
      pairingBusyRef.current = false;
      setPairingBusy(false);
    }
  }, [pairingBusy, pairingCodeInput]);

  // ── Plugin actions ─────────────────────────────────────────────────

  const handlePluginToggle = useCallback(
    async (pluginId: string, enabled: boolean) => {
      const plugin = plugins.find((p: PluginInfo) => p.id === pluginId);
      const pluginName = plugin?.name ?? pluginId;
      if (
        enabled &&
        plugin?.validationErrors &&
        plugin.validationErrors.length > 0
      ) {
        setPluginSettingsOpen((prev) => new Set([...prev, pluginId]));
        setActionNotice(
          `${pluginName} has required settings. Configure them after enabling.`,
          "info",
          3400,
        );
      }
      try {
        setActionNotice(
          `${enabled ? "Enabling" : "Disabling"} ${pluginName}...`,
          "info",
          4200,
        );
        await client.updatePlugin(pluginId, { enabled });
        await loadPlugins();
        setActionNotice(
          `${pluginName} ${enabled ? "enabled" : "disabled"}. Restart required to apply.`,
          "success",
          2800,
        );
      } catch (err) {
        await loadPlugins().catch(() => {
          /* ignore */
        });
        setActionNotice(
          `Failed to ${enabled ? "enable" : "disable"} ${pluginName}: ${
            err instanceof Error ? err.message : "unknown error"
          }`,
          "error",
          4200,
        );
      }
    },
    [plugins, loadPlugins, setActionNotice],
  );

  const handlePluginConfigSave = useCallback(
    async (pluginId: string, config: Record<string, string>) => {
      if (Object.keys(config).length === 0) return;
      setPluginSaving((prev) => new Set([...prev, pluginId]));
      try {
        await client.updatePlugin(pluginId, { config });

        // Check if this is an AI provider plugin
        const plugin = plugins.find((p) => p.id === pluginId);
        const isAiProvider = plugin?.category === "ai-provider";

        await loadPlugins();
        setActionNotice(
          isAiProvider
            ? "Provider settings saved. Restart required to apply."
            : "Plugin settings saved.",
          "success",
        );
        setPluginSaveSuccess((prev) => new Set([...prev, pluginId]));
        setTimeout(() => {
          setPluginSaveSuccess((prev) => {
            const next = new Set(prev);
            next.delete(pluginId);
            return next;
          });
        }, 2000);
      } catch (err) {
        setActionNotice(
          `Save failed: ${err instanceof Error ? err.message : "unknown error"}`,
          "error",
          3800,
        );
      } finally {
        setPluginSaving((prev) => {
          const next = new Set(prev);
          next.delete(pluginId);
          return next;
        });
      }
    },
    [loadPlugins, setActionNotice, plugins],
  );

  // ── Skill actions ──────────────────────────────────────────────────

  const handleSkillToggle = useCallback(
    async (skillId: string, enabled: boolean) => {
      setSkillToggleAction(skillId);
      try {
        const { skill } = await client.updateSkill(skillId, enabled);
        setSkills((prev) =>
          prev.map((s) =>
            s.id === skillId ? { ...s, enabled: skill.enabled } : s,
          ),
        );
        setActionNotice(
          `${skill.name} ${skill.enabled ? "enabled" : "disabled"}.`,
          "success",
        );
      } catch (err) {
        setActionNotice(
          `Failed to update skill: ${err instanceof Error ? err.message : "unknown error"}`,
          "error",
          4200,
        );
      } finally {
        setSkillToggleAction("");
      }
    },
    [setActionNotice],
  );

  const handleCreateSkill = useCallback(async () => {
    const name = skillCreateName.trim();
    if (!name) return;
    setSkillCreating(true);
    try {
      const result = await client.createSkill(
        name,
        skillCreateDescription.trim() || "",
      );
      setSkillCreateName("");
      setSkillCreateDescription("");
      setSkillCreateFormOpen(false);
      setActionNotice(`Skill "${name}" created.`, "success");
      await refreshSkills();
      if (result.path)
        await client.openSkill(result.skill?.id ?? name).catch(() => undefined);
    } catch (err) {
      setActionNotice(
        `Failed to create skill: ${err instanceof Error ? err.message : "error"}`,
        "error",
        4200,
      );
    } finally {
      setSkillCreating(false);
    }
  }, [skillCreateName, skillCreateDescription, refreshSkills, setActionNotice]);

  const handleOpenSkill = useCallback(
    async (skillId: string) => {
      try {
        await client.openSkill(skillId);
        setActionNotice("Opening skill folder...", "success", 2000);
      } catch (err) {
        setActionNotice(
          `Failed to open: ${err instanceof Error ? err.message : "error"}`,
          "error",
          4200,
        );
      }
    },
    [setActionNotice],
  );

  const handleDeleteSkill = useCallback(
    async (skillId: string, skillName: string) => {
      if (!confirm(`Delete skill "${skillName}"? This cannot be undone.`))
        return;
      try {
        await client.deleteSkill(skillId);
        setActionNotice(`Skill "${skillName}" deleted.`, "success");
        await refreshSkills();
      } catch (err) {
        setActionNotice(
          `Failed to delete: ${err instanceof Error ? err.message : "error"}`,
          "error",
          4200,
        );
      }
    },
    [refreshSkills, setActionNotice],
  );

  const handleReviewSkill = useCallback(async (skillId: string) => {
    setSkillReviewId(skillId);
    setSkillReviewLoading(true);
    setSkillReviewReport(null);
    try {
      const { report } = await client.getSkillScanReport(skillId);
      setSkillReviewReport(report);
    } catch {
      setSkillReviewReport(null);
    } finally {
      setSkillReviewLoading(false);
    }
  }, []);

  const handleAcknowledgeSkill = useCallback(
    async (skillId: string) => {
      try {
        await client.acknowledgeSkill(skillId, true);
        setActionNotice(
          `Skill "${skillId}" acknowledged and enabled.`,
          "success",
        );
        setSkillReviewReport(null);
        setSkillReviewId("");
        await refreshSkills();
      } catch (err) {
        setActionNotice(
          `Failed: ${err instanceof Error ? err.message : "error"}`,
          "error",
          4200,
        );
      }
    },
    [refreshSkills, setActionNotice],
  );

  const searchSkillsMarketplace = useCallback(async () => {
    const query = skillsMarketplaceQuery.trim();
    if (!query) {
      setSkillsMarketplaceResults([]);
      setSkillsMarketplaceError("");
      return;
    }
    setSkillsMarketplaceLoading(true);
    setSkillsMarketplaceError("");
    try {
      const { results } = await client.searchSkillsMarketplace(
        query,
        false,
        20,
      );
      setSkillsMarketplaceResults(results);
    } catch (err) {
      setSkillsMarketplaceResults([]);
      setSkillsMarketplaceError(
        err instanceof Error ? err.message : "unknown error",
      );
    } finally {
      setSkillsMarketplaceLoading(false);
    }
  }, [skillsMarketplaceQuery]);

  const installSkillFromMarketplace = useCallback(
    async (item: SkillMarketplaceResult) => {
      setSkillsMarketplaceAction(`install:${item.id}`);
      try {
        await client.installMarketplaceSkill({
          slug: item.slug ?? item.id,
          githubUrl: item.githubUrl,
          repository: item.repository,
          path: item.path ?? undefined,
          name: item.name,
          description: item.description,
          source: item.source ?? "clawhub",
          autoRefresh: true,
        });
        await refreshSkills();
        setActionNotice(`Installed skill: ${item.name}`, "success");
      } catch (err) {
        setActionNotice(
          `Skill install failed: ${err instanceof Error ? err.message : "unknown error"}`,
          "error",
          4200,
        );
      } finally {
        setSkillsMarketplaceAction("");
      }
    },
    [refreshSkills, setActionNotice],
  );

  const installSkillFromGithubUrl = useCallback(async () => {
    const githubUrl = skillsMarketplaceManualGithubUrl.trim();
    if (!githubUrl) return;
    setSkillsMarketplaceAction("install:manual");
    try {
      let repository: string | undefined;
      let skillPath: string | undefined;
      let inferredName: string | undefined;
      try {
        const parsed = new URL(githubUrl);
        if (parsed.hostname === "github.com") {
          const parts = parsed.pathname.split("/").filter(Boolean);
          if (parts.length >= 2) repository = `${parts[0]}/${parts[1]}`;
          if (parts[2] === "tree" && parts.length >= 5) {
            skillPath = parts.slice(4).join("/");
            inferredName = parts[parts.length - 1];
          }
        }
      } catch {
        /* keep raw URL */
      }
      await client.installMarketplaceSkill({
        githubUrl,
        repository,
        path: skillPath,
        name: inferredName,
        source: "manual",
        autoRefresh: true,
      });
      setSkillsMarketplaceManualGithubUrl("");
      await refreshSkills();
      setActionNotice("Skill installed from GitHub URL.", "success");
    } catch (err) {
      setActionNotice(
        `GitHub install failed: ${err instanceof Error ? err.message : "unknown error"}`,
        "error",
        4200,
      );
    } finally {
      setSkillsMarketplaceAction("");
    }
  }, [skillsMarketplaceManualGithubUrl, refreshSkills, setActionNotice]);

  const uninstallMarketplaceSkill = useCallback(
    async (skillId: string, name: string) => {
      setSkillsMarketplaceAction(`uninstall:${skillId}`);
      try {
        await client.deleteSkill(skillId);
        await refreshSkills();
        setActionNotice(`Uninstalled skill: ${name}`, "success");
      } catch (err) {
        setActionNotice(
          `Skill uninstall failed: ${err instanceof Error ? err.message : "unknown error"}`,
          "error",
          4200,
        );
      } finally {
        setSkillsMarketplaceAction("");
      }
    },
    [refreshSkills, setActionNotice],
  );

  // ── Inventory actions ──────────────────────────────────────────────

  const handleWalletApiKeySave = useCallback(
    async (config: Record<string, string>) => {
      if (Object.keys(config).length === 0) return;
      if (walletApiKeySavingRef.current || walletApiKeySaving) return;
      walletApiKeySavingRef.current = true;
      setWalletApiKeySaving(true);
      setWalletError(null);
      try {
        await client.updateWalletConfig(config);
        await loadWalletConfig();
        await loadBalances();
        setActionNotice(
          "Wallet API keys saved. Restart required to apply.",
          "success",
        );
      } catch (err) {
        setWalletError(
          `Failed to save API keys: ${err instanceof Error ? err.message : "network error"}`,
        );
      } finally {
        walletApiKeySavingRef.current = false;
        setWalletApiKeySaving(false);
      }
    },
    [walletApiKeySaving, loadWalletConfig, loadBalances, setActionNotice],
  );

  const handleExportKeys = useCallback(async () => {
    if (walletExportVisible) {
      setWalletExportVisible(false);
      setWalletExportData(null);
      return;
    }
    const confirmed = window.confirm(
      "This will reveal your private keys.\n\nNEVER share your private keys with anyone.\nAnyone with your private keys can steal all funds in your wallets.\n\nContinue?",
    );
    if (!confirmed) return;
    const exportToken = window.prompt(
      "Enter your wallet export token (MILADY_WALLET_EXPORT_TOKEN):",
      "",
    );
    if (exportToken === null) return;
    if (!exportToken.trim()) {
      setWalletError("Wallet export token is required.");
      return;
    }
    try {
      const data = await client.exportWalletKeys(exportToken.trim());
      setWalletExportData(data);
      setWalletExportVisible(true);
      setTimeout(() => {
        setWalletExportVisible(false);
        setWalletExportData(null);
      }, 60_000);
    } catch (err) {
      setWalletError(
        `Failed to export keys: ${err instanceof Error ? err.message : "network error"}`,
      );
    }
  }, [walletExportVisible]);

  // ── Registry / Drop / Whitelist actions ─────────────────────────────

  const loadRegistryStatus = useCallback(async () => {
    setRegistryLoading(true);
    setRegistryError(null);
    try {
      const status = await client.getRegistryStatus();
      setRegistryStatus(status);
    } catch (err) {
      setRegistryError(
        err instanceof Error ? err.message : "Failed to load registry status",
      );
    } finally {
      setRegistryLoading(false);
    }
  }, []);

  const registerOnChain = useCallback(async () => {
    setRegistryRegistering(true);
    setRegistryError(null);
    try {
      await client.registerAgent({
        name: characterDraft?.name || agentStatus?.agentName,
      });
      await loadRegistryStatus();
    } catch (err) {
      setRegistryError(
        err instanceof Error ? err.message : "Registration failed",
      );
    } finally {
      setRegistryRegistering(false);
    }
  }, [characterDraft?.name, agentStatus?.agentName, loadRegistryStatus]);

  const syncRegistryProfile = useCallback(async () => {
    setRegistryRegistering(true);
    setRegistryError(null);
    try {
      await client.syncRegistryProfile({
        name: characterDraft?.name || agentStatus?.agentName,
      });
      await loadRegistryStatus();
    } catch (err) {
      setRegistryError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setRegistryRegistering(false);
    }
  }, [characterDraft?.name, agentStatus?.agentName, loadRegistryStatus]);

  const loadDropStatus = useCallback(async () => {
    setDropLoading(true);
    try {
      const status = await client.getDropStatus();
      setDropStatus(status);
    } catch {
      // Non-critical -- drop may not be configured
    } finally {
      setDropLoading(false);
    }
  }, []);

  const mintFromDrop = useCallback(
    async (shiny: boolean) => {
      setMintInProgress(true);
      setMintShiny(shiny);
      setMintError(null);
      setMintResult(null);
      try {
        const result = await client.mintAgent({
          name: characterDraft?.name || agentStatus?.agentName,
          shiny,
        });
        setMintResult(result);
        await loadRegistryStatus();
        await loadDropStatus();
      } catch (err) {
        setMintError(err instanceof Error ? err.message : "Mint failed");
      } finally {
        setMintInProgress(false);
        setMintShiny(false);
      }
    },
    [
      characterDraft?.name,
      agentStatus?.agentName,
      loadRegistryStatus,
      loadDropStatus,
    ],
  );

  const loadWhitelistStatus = useCallback(async () => {
    setWhitelistLoading(true);
    try {
      const status = await client.getWhitelistStatus();
      setWhitelistStatus(status);
    } catch {
      // Non-critical
    } finally {
      setWhitelistLoading(false);
    }
  }, []);

  // ── Character actions ──────────────────────────────────────────────

  const handleSaveCharacter = useCallback(async () => {
    setCharacterSaving(true);
    setCharacterSaveError(null);
    setCharacterSaveSuccess(null);
    try {
      const draft = { ...characterDraft };
      if (typeof draft.bio === "string") {
        const lines = draft.bio
          .split("\n")
          .map((l: string) => l.trim())
          .filter((l: string) => l.length > 0);
        draft.bio = lines.length > 0 ? lines : undefined;
      }
      if (Array.isArray(draft.adjectives) && draft.adjectives.length === 0)
        delete draft.adjectives;
      if (Array.isArray(draft.topics) && draft.topics.length === 0)
        delete draft.topics;
      if (Array.isArray(draft.postExamples) && draft.postExamples.length === 0)
        delete draft.postExamples;
      if (
        Array.isArray(draft.messageExamples) &&
        draft.messageExamples.length === 0
      )
        delete draft.messageExamples;
      if (draft.style) {
        const s = draft.style;
        if (s.all && s.all.length === 0) delete s.all;
        if (s.chat && s.chat.length === 0) delete s.chat;
        if (s.post && s.post.length === 0) delete s.post;
        if (!s.all && !s.chat && !s.post) delete draft.style;
      }
      if (draft.name) draft.username = draft.name;
      if (!draft.name) delete draft.name;
      if (!draft.username) delete draft.username;
      if (!draft.system) delete draft.system;
      const { agentName } = await client.updateCharacter(draft);
      // Also persist avatar selection to config (under "ui" which is allowlisted)
      try {
        await client.updateConfig({
          ui: { avatarIndex: selectedVrmIndex },
        });
      } catch {
        /* non-fatal */
      }
      setCharacterSaveSuccess("Character saved successfully.");
      if (agentName && agentStatus) {
        setAgentStatus({ ...agentStatus, agentName });
      }
      await loadCharacter();
    } catch (err) {
      setCharacterSaveError(
        `Failed to save: ${err instanceof Error ? err.message : "unknown error"}`,
      );
    }
    setCharacterSaving(false);
  }, [characterDraft, agentStatus, loadCharacter, selectedVrmIndex]);

  const handleCharacterFieldInput = useCallback(
    <K extends keyof CharacterData>(field: K, value: CharacterData[K]) => {
      setCharacterDraft((prev: CharacterData) => ({ ...prev, [field]: value }));
    },
    [],
  );

  const handleCharacterArrayInput = useCallback(
    (field: "adjectives" | "topics" | "postExamples", value: string) => {
      const items = value
        .split("\n")
        .map((s: string) => s.trim())
        .filter((s: string) => s.length > 0);
      setCharacterDraft((prev: CharacterData) => ({ ...prev, [field]: items }));
    },
    [],
  );

  const handleCharacterStyleInput = useCallback(
    (subfield: "all" | "chat" | "post", value: string) => {
      const items = value
        .split("\n")
        .map((s: string) => s.trim())
        .filter((s: string) => s.length > 0);
      setCharacterDraft((prev: CharacterData) => ({
        ...prev,
        style: { ...(prev.style ?? {}), [subfield]: items },
      }));
    },
    [],
  );

  const handleCharacterMessageExamplesInput = useCallback((value: string) => {
    if (!value.trim()) {
      setCharacterDraft((prev: CharacterData) => ({
        ...prev,
        messageExamples: [],
      }));
      return;
    }
    const blocks = value.split(/\n\s*\n/).filter((b) => b.trim().length > 0);
    const parsed = blocks.map((block) => {
      const lines = block.split("\n").filter((l) => l.trim().length > 0);
      const examples = lines.map((line) => {
        const colonIdx = line.indexOf(":");
        if (colonIdx > 0) {
          return {
            name: line.slice(0, colonIdx).trim(),
            content: { text: line.slice(colonIdx + 1).trim() },
          };
        }
        return { name: "User", content: { text: line.trim() } };
      });
      return { examples };
    });
    setCharacterDraft((prev: CharacterData) => ({
      ...prev,
      messageExamples: parsed,
    }));
  }, []);

  // ── Onboarding ─────────────────────────────────────────────────────

  const handleOnboardingFinish = useCallback(async () => {
    if (onboardingFinishBusyRef.current || onboardingRestarting) return;
    if (!onboardingOptions) return;
    if (onboardingFinishSavingRef.current || onboardingRestarting) return;
    const style = onboardingOptions.styles.find(
      (s: StylePreset) => s.catchphrase === onboardingStyle,
    );
    const systemPrompt = style?.system
      ? style.system.replace(/\{\{name\}\}/g, onboardingName)
      : `You are ${onboardingName}, an autonomous AI agent powered by ElizaOS. ${onboardingOptions.sharedStyleRules}`;

    const isLocalMode =
      onboardingRunMode === "local-rawdog" ||
      onboardingRunMode === "local-sandbox";
    const inventoryProviders: Array<{
      chain: string;
      rpcProvider: string;
      rpcApiKey?: string;
    }> = [];
    if (isLocalMode) {
      for (const chain of onboardingSelectedChains) {
        const rpcProvider = onboardingRpcSelections[chain] || "elizacloud";
        const rpcApiKey =
          onboardingRpcKeys[`${chain}:${rpcProvider}`] || undefined;
        inventoryProviders.push({ chain, rpcProvider, rpcApiKey });
      }
    }

    // Map the 3-mode selection to the API's runMode field
    // "local-rawdog" and "local-sandbox" both map to "local" for backward compat
    // Sandbox mode is additionally stored as a separate flag
    const apiRunMode = onboardingRunMode === "cloud" ? "cloud" : "local";

    onboardingFinishBusyRef.current = true;
    setOnboardingRestarting(true);
    onboardingFinishSavingRef.current = true;

    try {
      await client.submitOnboarding({
        name: onboardingName,
        theme: onboardingTheme,
        runMode: apiRunMode as "local" | "cloud",
        sandboxMode:
          onboardingRunMode === "local-sandbox"
            ? "standard"
            : onboardingRunMode === "cloud"
              ? "light"
              : "off",
        bio: style?.bio ?? ["An autonomous AI agent."],
        systemPrompt,
        style: style?.style,
        adjectives: style?.adjectives,
        topics: style?.topics,
        postExamples: style?.postExamples,
        messageExamples: style?.messageExamples,
        cloudProvider:
          onboardingRunMode === "cloud" ? onboardingCloudProvider : undefined,
        smallModel:
          onboardingRunMode === "cloud" ? onboardingSmallModel : undefined,
        largeModel:
          onboardingRunMode === "cloud" ? onboardingLargeModel : undefined,
        provider: isLocalMode ? onboardingProvider || undefined : undefined,
        providerApiKey: isLocalMode ? onboardingApiKey || undefined : undefined,
        primaryModel: isLocalMode
          ? onboardingPrimaryModel.trim() || undefined
          : undefined,
        inventoryProviders:
          inventoryProviders.length > 0 ? inventoryProviders : undefined,
        // Connectors
        telegramToken: onboardingTelegramToken.trim() || undefined,
        discordToken: onboardingDiscordToken.trim() || undefined,
        whatsappSessionPath: onboardingWhatsAppSessionPath.trim() || undefined,
        twilioAccountSid: onboardingTwilioAccountSid.trim() || undefined,
        twilioAuthToken: onboardingTwilioAuthToken.trim() || undefined,
        twilioPhoneNumber: onboardingTwilioPhoneNumber.trim() || undefined,
        blooioApiKey: onboardingBlooioApiKey.trim() || undefined,
        blooioPhoneNumber: onboardingBlooioPhoneNumber.trim() || undefined,
        githubToken: onboardingGithubToken.trim() || undefined,
      });
      setOnboardingComplete(true);
      setTab("chat");
      try {
        setAgentStatus(await client.restartAgent());
      } catch {
        /* ignore */
      }
    } catch (err) {
      window.alert(
        `Setup failed: ${err instanceof Error ? err.message : "network error"}. Please try again.`,
      );
    } finally {
      onboardingFinishSavingRef.current = false;
      onboardingFinishBusyRef.current = false;
      setOnboardingRestarting(false);
    }
  }, [
    onboardingRestarting,
    onboardingOptions,
    onboardingStyle,
    onboardingName,
    onboardingTheme,
    onboardingRunMode,
    onboardingCloudProvider,
    onboardingSmallModel,
    onboardingLargeModel,
    onboardingProvider,
    onboardingApiKey,
    onboardingPrimaryModel,
    onboardingSelectedChains,
    onboardingRpcSelections,
    onboardingRpcKeys,
    onboardingTelegramToken,
    onboardingDiscordToken,
    onboardingWhatsAppSessionPath,
    onboardingTwilioAccountSid,
    onboardingTwilioAuthToken,
    onboardingTwilioPhoneNumber,
    onboardingBlooioApiKey,
    onboardingBlooioPhoneNumber,
    onboardingGithubToken,
    setTab,
  ]);

  const handleOnboardingNext = useCallback(
    async (options?: OnboardingNextOptions) => {
      const opts = onboardingOptions;
      switch (onboardingStep) {
        case "welcome":
          setOnboardingStep("name");
          break;
        case "name":
          setOnboardingStep("avatar");
          break;
        case "avatar":
          setOnboardingStep("style");
          break;
        case "style":
          setOnboardingStep("theme");
          break;
        case "theme": {
          setTheme(onboardingTheme);
          // If drop is enabled and user hasn't minted, go to mint step
          if (
            dropStatus?.dropEnabled &&
            !dropStatus.userHasMinted &&
            !dropStatus.mintedOut
          ) {
            setOnboardingStep("mint");
          } else {
            setOnboardingStep("runMode");
          }
          break;
        }
        case "mint":
          setOnboardingStep("runMode");
          break;
        case "runMode":
          if (onboardingRunMode === "cloud") {
            if (opts && opts.cloudProviders.length === 1) {
              setOnboardingCloudProvider(opts.cloudProviders[0].id);
            }
            setOnboardingStep("cloudProvider");
          } else if (onboardingRunMode === "local-sandbox") {
            setOnboardingStep("dockerSetup");
          } else {
            // local-rawdog: skip docker, go straight to LLM provider
            setOnboardingStep("llmProvider");
          }
          break;
        case "dockerSetup":
          setOnboardingStep("llmProvider");
          break;
        case "cloudProvider":
          setOnboardingStep("modelSelection");
          break;
        case "modelSelection":
          if (cloudConnected) {
            setOnboardingStep("connectors");
          } else {
            setOnboardingStep("cloudLogin");
          }
          break;
        case "cloudLogin":
          setOnboardingStep("connectors");
          break;
        case "llmProvider":
          setOnboardingStep("inventorySetup");
          break;
        case "inventorySetup":
          setOnboardingStep("connectors");
          break;
        case "connectors":
          setOnboardingStep("permissions");
          break;
        case "permissions": {
          if (options?.allowPermissionBypass) {
            await handleOnboardingFinish();
            break;
          }
          try {
            const permissions = await client.getPermissions();
            const missingPermissions =
              getMissingOnboardingPermissions(permissions);
            if (missingPermissions.length > 0) {
              const missingLabels = missingPermissions
                .map((id) => ONBOARDING_PERMISSION_LABELS[id] ?? id)
                .join(", ");
              setActionNotice(
                `Missing required permissions: ${missingLabels}. Grant them or use "Skip for Now".`,
                "error",
                5200,
              );
              return;
            }
          } catch (err) {
            setActionNotice(
              `Could not verify permissions (${err instanceof Error ? err.message : "unknown error"}). Use "Skip for Now" to continue.`,
              "error",
              5200,
            );
            return;
          }
          await handleOnboardingFinish();
          break;
        }
      }
    },
    [
      onboardingStep,
      onboardingOptions,
      onboardingRunMode,
      onboardingTheme,
      setTheme,
      cloudConnected,
      setActionNotice,
      handleOnboardingFinish,
      dropStatus?.dropEnabled,
      dropStatus?.userHasMinted,
      dropStatus?.mintedOut,
    ],
  );

  const handleOnboardingBack = useCallback(() => {
    switch (onboardingStep) {
      case "name":
        setOnboardingStep("welcome");
        break;
      case "avatar":
        setOnboardingStep("name");
        break;
      case "style":
        setOnboardingStep("avatar");
        break;
      case "theme":
        setOnboardingStep("style");
        break;
      case "mint":
        setOnboardingStep("theme");
        break;
      case "runMode":
        if (
          dropStatus?.dropEnabled &&
          !dropStatus.userHasMinted &&
          !dropStatus.mintedOut
        ) {
          setOnboardingStep("mint");
        } else {
          setOnboardingStep("theme");
        }
        break;
      case "cloudProvider":
        setOnboardingStep("runMode");
        break;
      case "modelSelection":
        setOnboardingStep("cloudProvider");
        break;
      case "cloudLogin":
        setOnboardingStep("modelSelection");
        if (cloudLoginPollTimer.current) {
          clearInterval(cloudLoginPollTimer.current);
          cloudLoginPollTimer.current = null;
        }
        cloudLoginBusyRef.current = false;
        setCloudLoginBusy(false);
        setCloudLoginError(null);
        break;
      case "dockerSetup":
        setOnboardingStep("runMode");
        break;
      case "llmProvider":
        if (onboardingRunMode === "local-sandbox") {
          setOnboardingStep("dockerSetup");
        } else {
          setOnboardingStep("runMode");
        }
        break;
      case "inventorySetup":
        setOnboardingStep("llmProvider");
        break;
      case "connectors":
        // Go back to whichever path we came from
        if (onboardingRunMode === "cloud") {
          setOnboardingStep("modelSelection");
        } else {
          setOnboardingStep("inventorySetup");
        }
        break;
      case "permissions":
        setOnboardingStep("connectors");
        break;
    }
  }, [
    onboardingStep,
    onboardingRunMode,
    dropStatus?.dropEnabled,
    dropStatus?.userHasMinted,
    dropStatus?.mintedOut,
  ]);

  // ── Cloud ──────────────────────────────────────────────────────────

  const handleCloudLogin = useCallback(async () => {
    if (cloudLoginBusyRef.current || cloudLoginBusy) return;
    cloudLoginBusyRef.current = true;
    setCloudLoginBusy(true);
    setCloudLoginError(null);
    try {
      const resp = await client.cloudLogin();
      if (!resp.ok) throw new Error("Failed to start login session");
      window.open(resp.browserUrl, "_blank");
      // Poll for completion
      let attempts = 0;
      cloudLoginPollTimer.current = window.setInterval(async () => {
        attempts++;
        if (attempts > 120) {
          if (cloudLoginPollTimer.current)
            clearInterval(cloudLoginPollTimer.current);
          setCloudLoginError("Login timed out. Please try again.");
          cloudLoginBusyRef.current = false;
          setCloudLoginBusy(false);
          return;
        }
        try {
          const poll = await client.cloudLoginPoll(resp.sessionId);
          if (poll.status === "authenticated") {
            if (cloudLoginPollTimer.current)
              clearInterval(cloudLoginPollTimer.current);
            cloudLoginBusyRef.current = false;
            setCloudLoginBusy(false);
            // Immediately reflect the login in the UI — don't wait for the
            // background poll which may race with the config save.
            setCloudConnected(true);
            setCloudEnabled(true);
            setActionNotice(
              "Logged in to Eliza Cloud successfully.",
              "success",
              6000,
            );
            void loadWalletConfig();
            // Delay the credit fetch slightly so the backend has time to
            // persist the API key before we query cloud status / credits.
            setTimeout(() => void pollCloudCredits(), 2000);
          } else if (poll.status === "expired" || poll.status === "error") {
            if (cloudLoginPollTimer.current)
              clearInterval(cloudLoginPollTimer.current);
            setCloudLoginError(
              poll.error ?? "Session expired. Please try again.",
            );
            cloudLoginBusyRef.current = false;
            setCloudLoginBusy(false);
          }
        } catch {
          /* keep trying */
        }
      }, 1000);
    } catch (err) {
      setCloudLoginError(err instanceof Error ? err.message : "Login failed");
      cloudLoginBusyRef.current = false;
      setCloudLoginBusy(false);
    }
  }, [cloudLoginBusy, setActionNotice, pollCloudCredits, loadWalletConfig]);

  const handleCloudDisconnect = useCallback(async () => {
    if (
      !confirm(
        "Disconnect from Eliza Cloud? The agent will need a local AI provider to continue working.",
      )
    )
      return;
    setCloudDisconnecting(true);
    try {
      await client.cloudDisconnect();
      setCloudEnabled(false);
      setCloudConnected(false);
      setCloudCredits(null);
      setCloudUserId(null);
      setActionNotice("Disconnected from Eliza Cloud.", "success");
    } catch (err) {
      setActionNotice(
        `Disconnect failed: ${err instanceof Error ? err.message : "error"}`,
        "error",
      );
    } finally {
      setCloudDisconnecting(false);
    }
  }, [setActionNotice]);

  // ── Updates ────────────────────────────────────────────────────────

  const handleChannelChange = useCallback(
    async (channel: ReleaseChannel) => {
      if (updateChannelSavingRef.current || updateChannelSaving) return;
      if (updateStatus?.channel === channel) return;
      updateChannelSavingRef.current = true;
      setUpdateChannelSaving(true);
      try {
        await client.setUpdateChannel(channel);
        await loadUpdateStatus(true);
      } catch {
        /* ignore */
      } finally {
        updateChannelSavingRef.current = false;
        setUpdateChannelSaving(false);
      }
    },
    [updateChannelSaving, updateStatus, loadUpdateStatus],
  );

  // ── Agent export/import ────────────────────────────────────────────

  const handleAgentExport = useCallback(async () => {
    if (exportBusyRef.current || exportBusy) return;
    if (!exportPassword) {
      setExportError("Password is required.");
      setExportSuccess(null);
      return;
    }
    if (exportPassword.length < AGENT_TRANSFER_MIN_PASSWORD_LENGTH) {
      setExportError(
        `Password must be at least ${AGENT_TRANSFER_MIN_PASSWORD_LENGTH} characters.`,
      );
      setExportSuccess(null);
      return;
    }
    try {
      exportBusyRef.current = true;
      setExportBusy(true);
      setExportError(null);
      setExportSuccess(null);
      const resp = await client.exportAgent(exportPassword, exportIncludeLogs);
      const blob = await resp.blob();
      const disposition = resp.headers.get("Content-Disposition") ?? "";
      const filenameMatch = /filename="?([^"]+)"?/.exec(disposition);
      const filename = filenameMatch?.[1] ?? "agent-export.eliza-agent";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setExportSuccess(
        `Exported successfully (${(blob.size / 1024).toFixed(0)} KB)`,
      );
      setExportPassword("");
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Export failed");
    } finally {
      exportBusyRef.current = false;
      setExportBusy(false);
    }
  }, [exportBusy, exportPassword, exportIncludeLogs]);

  const handleAgentImport = useCallback(async () => {
    if (importBusyRef.current || importBusy) return;
    if (!importFile) {
      setImportError("Select an export file before importing.");
      setImportSuccess(null);
      return;
    }
    if (!importPassword) {
      setImportError("Password is required.");
      setImportSuccess(null);
      return;
    }
    if (importPassword.length < AGENT_TRANSFER_MIN_PASSWORD_LENGTH) {
      setImportError(
        `Password must be at least ${AGENT_TRANSFER_MIN_PASSWORD_LENGTH} characters.`,
      );
      setImportSuccess(null);
      return;
    }
    try {
      importBusyRef.current = true;
      setImportBusy(true);
      setImportError(null);
      setImportSuccess(null);
      const fileBuffer = await importFile.arrayBuffer();
      const result = await client.importAgent(importPassword, fileBuffer);
      const counts = result.counts;
      const summary = [
        counts.memories ? `${counts.memories} memories` : null,
        counts.entities ? `${counts.entities} entities` : null,
        counts.rooms ? `${counts.rooms} rooms` : null,
      ]
        .filter(Boolean)
        .join(", ");
      setImportSuccess(
        `Imported "${result.agentName}" successfully: ${summary || "no data"}. Restart the agent to activate.`,
      );
      setImportPassword("");
      setImportFile(null);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Import failed");
    } finally {
      importBusyRef.current = false;
      setImportBusy(false);
    }
  }, [importBusy, importFile, importPassword]);

  // ── Emote picker ────────────────────────────────────────────────────

  const closeCommandPalette = useCallback(() => {
    _setCommandPaletteOpen(false);
    setCommandQuery("");
    setCommandActiveIndex(0);
  }, []);

  const openEmotePicker = useCallback(() => {
    setEmotePickerOpen(true);
  }, []);

  const closeEmotePicker = useCallback(() => {
    setEmotePickerOpen(false);
  }, []);

  // ── Generic state setter ───────────────────────────────────────────

  const setState = useCallback(
    <K extends keyof AppState>(key: K, value: AppState[K]) => {
      const setterMap: Partial<{
        [S in keyof AppState]: (v: AppState[S]) => void;
      }> = {
        tab: setTabRaw,
        chatInput: setChatInput,
        chatAvatarVisible: setChatAvatarVisible,
        chatAgentVoiceMuted: setChatAgentVoiceMuted,
        chatAvatarSpeaking: setChatAvatarSpeaking,
        autonomousRunHealthByRunId: setAutonomousRunHealthByRunId,
        startupError: setStartupError,
        pairingCodeInput: setPairingCodeInput,
        pluginFilter: setPluginFilter,
        pluginStatusFilter: setPluginStatusFilter,
        pluginSearch: setPluginSearch,
        pluginSettingsOpen: setPluginSettingsOpen,
        pluginAdvancedOpen: setPluginAdvancedOpen,
        skillsSubTab: setSkillsSubTab,
        skillCreateFormOpen: setSkillCreateFormOpen,
        skillCreateName: setSkillCreateName,
        skillCreateDescription: setSkillCreateDescription,
        skillsMarketplaceQuery: setSkillsMarketplaceQuery,
        skillsMarketplaceManualGithubUrl: setSkillsMarketplaceManualGithubUrl,
        logTagFilter: setLogTagFilter,
        logLevelFilter: setLogLevelFilter,
        logSourceFilter: setLogSourceFilter,
        inventoryView: setInventoryView,
        inventorySort: setInventorySort,
        exportPassword: setExportPassword,
        exportIncludeLogs: setExportIncludeLogs,
        exportError: setExportError,
        exportSuccess: setExportSuccess,
        importPassword: setImportPassword,
        importFile: setImportFile,
        importError: setImportError,
        importSuccess: setImportSuccess,
        onboardingName: setOnboardingName,
        onboardingStyle: setOnboardingStyle,
        onboardingTheme: setOnboardingTheme,
        onboardingRunMode: setOnboardingRunMode,
        onboardingCloudProvider: setOnboardingCloudProvider,
        onboardingSmallModel: setOnboardingSmallModel,
        onboardingLargeModel: setOnboardingLargeModel,
        onboardingProvider: setOnboardingProvider,
        onboardingApiKey: setOnboardingApiKey,
        onboardingSelectedChains: setOnboardingSelectedChains,
        onboardingRpcSelections: setOnboardingRpcSelections,
        onboardingOpenRouterModel: setOnboardingOpenRouterModel,
        onboardingPrimaryModel: setOnboardingPrimaryModel,
        onboardingTelegramToken: setOnboardingTelegramToken,
        onboardingDiscordToken: setOnboardingDiscordToken,
        onboardingWhatsAppSessionPath: setOnboardingWhatsAppSessionPath,
        onboardingTwilioAccountSid: setOnboardingTwilioAccountSid,
        onboardingTwilioAuthToken: setOnboardingTwilioAuthToken,
        onboardingTwilioPhoneNumber: setOnboardingTwilioPhoneNumber,
        onboardingBlooioApiKey: setOnboardingBlooioApiKey,
        onboardingBlooioPhoneNumber: setOnboardingBlooioPhoneNumber,
        onboardingGithubToken: setOnboardingGithubToken,
        onboardingSubscriptionTab: setOnboardingSubscriptionTab,
        onboardingRpcKeys: setOnboardingRpcKeys,
        onboardingAvatar: setOnboardingAvatar,
        onboardingRestarting: setOnboardingRestarting,
        cloudEnabled: setCloudEnabled,
        selectedVrmIndex: setSelectedVrmIndex,
        customVrmUrl: setCustomVrmUrl,
        commandQuery: setCommandQuery,
        commandActiveIndex: setCommandActiveIndex,
        emotePickerOpen: setEmotePickerOpen,
        storeSearch: setStoreSearch,
        storeFilter: setStoreFilter,
        storeSubTab: setStoreSubTab,
        catalogSearch: setCatalogSearch,
        catalogSort: setCatalogSort,
        catalogPage: setCatalogPage,
        skillReviewId: setSkillReviewId,
        skillReviewReport: setSkillReviewReport,
        activeGameApp: setActiveGameApp,
        activeGameDisplayName: setActiveGameDisplayName,
        activeGameViewerUrl: setActiveGameViewerUrl,
        activeGameSandbox: setActiveGameSandbox,
        activeGamePostMessageAuth: setActiveGamePostMessageAuth,
        activeGamePostMessagePayload: setActiveGamePostMessagePayload,
        gameOverlayEnabled: setGameOverlayEnabled,
        storePlugins: setStorePlugins,
        storeLoading: setStoreLoading,
        storeInstalling: setStoreInstalling,
        storeUninstalling: setStoreUninstalling,
        storeError: setStoreError,
        storeDetailPlugin: setStoreDetailPlugin,
        catalogSkills: setCatalogSkills,
        catalogTotal: setCatalogTotal,
        catalogTotalPages: setCatalogTotalPages,
        catalogLoading: setCatalogLoading,
        catalogError: setCatalogError,
        catalogDetailSkill: setCatalogDetailSkill,
        catalogInstalling: setCatalogInstalling,
        catalogUninstalling: setCatalogUninstalling,
        mcpConfiguredServers: setMcpConfiguredServers,
        mcpServerStatuses: setMcpServerStatuses,
        mcpMarketplaceQuery: setMcpMarketplaceQuery,
        mcpMarketplaceResults: setMcpMarketplaceResults,
        mcpMarketplaceLoading: setMcpMarketplaceLoading,
        mcpAction: setMcpAction,
        mcpAddingServer: setMcpAddingServer,
        mcpAddingResult: setMcpAddingResult,
        mcpEnvInputs: setMcpEnvInputs,
        mcpHeaderInputs: setMcpHeaderInputs,
        droppedFiles: setDroppedFiles,
        shareIngestNotice: setShareIngestNotice,
        appsSubTab: setAppsSubTab,
        agentSubTab: setAgentSubTab,
        pluginsSubTab: setPluginsSubTab,
        databaseSubTab: setDatabaseSubTab,
        configRaw: setConfigRaw,
        configText: setConfigText,
      };
      const setter = setterMap[key];
      if (setter) setter(value);
    },
    [setSelectedVrmIndex],
  );

  // ── Initialization ─────────────────────────────────────────────────

  useEffect(() => {
    applyTheme(currentTheme);
    const startupRunId = startupRetryNonce;
    let unbindStatus: (() => void) | null = null;
    let unbindAgentEvents: (() => void) | null = null;
    let unbindHeartbeatEvents: (() => void) | null = null;
    let unbindProactiveMessages: (() => void) | null = null;
    let cancelled = false;
    const describeBackendFailure = (
      err: unknown,
      timedOut: boolean,
    ): StartupErrorState => {
      const apiErr = asApiLikeError(err);
      if (apiErr?.kind === "http" && apiErr.status === 404) {
        return {
          reason: "backend-unreachable",
          phase: "starting-backend",
          message:
            "Backend API routes are unavailable on this origin (received 404).",
          detail: formatStartupErrorDetail(err),
          status: apiErr.status,
          path: apiErr.path,
        };
      }
      if (timedOut || apiErr?.kind === "timeout") {
        return {
          reason: "backend-timeout",
          phase: "starting-backend",
          message: `Backend did not become reachable within ${Math.round(
            BACKEND_STARTUP_TIMEOUT_MS / 1000,
          )}s.`,
          detail: formatStartupErrorDetail(err),
          status: apiErr?.status,
          path: apiErr?.path,
        };
      }
      return {
        reason: "backend-unreachable",
        phase: "starting-backend",
        message: "Failed to reach backend during startup.",
        detail: formatStartupErrorDetail(err),
        status: apiErr?.status,
        path: apiErr?.path,
      };
    };
    const describeAgentFailure = (
      err: unknown,
      timedOut: boolean,
      diagnostics?: AgentStartupDiagnostics,
    ): StartupErrorState => {
      const detail =
        diagnostics?.lastError ||
        formatStartupErrorDetail(err) ||
        "Agent runtime did not report a reason.";
      if (timedOut) {
        return {
          reason: "agent-timeout",
          phase: "initializing-agent",
          message: `Agent did not reach running or paused within ${Math.round(
            AGENT_READY_TIMEOUT_MS / 1000,
          )}s.`,
          detail,
        };
      }
      return {
        reason: "agent-error",
        phase: "initializing-agent",
        message: "Agent runtime reported a startup error.",
        detail,
      };
    };
    const STARTUP_WARN_PREFIX = "[milady][startup:init]";
    const logStartupWarning = (scope: string, err: unknown) => {
      console.warn(`${STARTUP_WARN_PREFIX} ${scope}`, err);
    };

    // Detect popout mode — lightweight init that skips agent lifecycle.
    const isPopoutMode = (() => {
      if (typeof window === "undefined") return false;
      const params = new URLSearchParams(
        window.location.search || window.location.hash.split("?")[1] || "",
      );
      return params.has("popout");
    })();

    const initApp = async () => {
      // Popout fast-path: just connect WS and fetch events. No agent
      // lifecycle, no onboarding, no auth gates.
      if (isPopoutMode) {
        setOnboardingComplete(true);
        setOnboardingLoading(false);

        // Wait for API to be reachable (it's already running from the main window)
        for (let i = 0; i < 30 && !cancelled; i++) {
          try {
            const status = await client.getStatus();
            setAgentStatus(status);
            setConnected(true);
            break;
          } catch {
            await new Promise<void>((r) => setTimeout(r, 500));
          }
        }

        client.connectWs();
        unbindStatus = client.onWsEvent(
          "status",
          (data: Record<string, unknown>) => {
            const nextStatus = parseAgentStatusEvent(data);
            if (nextStatus) setAgentStatus(nextStatus);
          },
        );
        unbindAgentEvents = client.onWsEvent(
          "agent_event",
          (data: Record<string, unknown>) => {
            const event = parseStreamEventEnvelopeEvent(data);
            if (event) appendAutonomousEvent(event);
          },
        );
        unbindHeartbeatEvents = client.onWsEvent(
          "heartbeat_event",
          (data: Record<string, unknown>) => {
            const event = parseStreamEventEnvelopeEvent(data);
            if (event) appendAutonomousEvent(event);
          },
        );

        await fetchAutonomyReplay();

        return;
      }

      if (import.meta.env.DEV && startupRunId > 0) {
        console.debug(`[milady] Retrying startup run #${startupRunId}`);
      }
      const BASE_DELAY_MS = 250;
      const MAX_DELAY_MS = 1000;
      const sleep = (ms: number) =>
        new Promise<void>((resolve) => setTimeout(resolve, ms));
      let onboardingNeedsOptions = false;
      let requiresAuth = false;
      let latestAuth: {
        required: boolean;
        pairingEnabled: boolean;
        expiresAt: number | null;
      } = {
        required: false,
        pairingEnabled: false,
        expiresAt: null,
      };
      setStartupError(null);
      setStartupPhase("starting-backend");
      setAuthRequired(false);
      setConnected(false);
      const backendDeadlineAt = Date.now() + BACKEND_STARTUP_TIMEOUT_MS;
      let lastBackendError: unknown = null;

      // Keep the splash screen up until the backend is reachable.
      let backendAttempts = 0;
      while (!cancelled) {
        if (Date.now() >= backendDeadlineAt) {
          setStartupError(describeBackendFailure(lastBackendError, true));
          setOnboardingLoading(false);
          return;
        }
        try {
          const auth = await client.getAuthStatus();
          latestAuth = auth;
          if (auth.required && !client.hasToken()) {
            setAuthRequired(true);
            setPairingEnabled(auth.pairingEnabled);
            setPairingExpiresAt(auth.expiresAt);
            requiresAuth = true;
            break;
          }
          const { complete } = await client.getOnboardingStatus();
          setOnboardingComplete(complete);
          onboardingNeedsOptions = !complete;
          break;
        } catch (err) {
          const apiErr = asApiLikeError(err);
          if (apiErr?.status === 401 && client.hasToken()) {
            client.setToken(null);
            setAuthRequired(true);
            setPairingEnabled(latestAuth.pairingEnabled);
            setPairingExpiresAt(latestAuth.expiresAt);
            requiresAuth = true;
            break;
          }
          if (apiErr?.status === 404) {
            setStartupError(describeBackendFailure(err, false));
            setOnboardingLoading(false);
            return;
          }
          lastBackendError = err;
          backendAttempts += 1;
          const delay = Math.min(
            BASE_DELAY_MS * 2 ** Math.min(backendAttempts, 2),
            MAX_DELAY_MS,
          );
          await sleep(delay);
        }
      }
      if (cancelled) {
        return;
      }

      if (requiresAuth) {
        setOnboardingLoading(false);
        return;
      }

      // On fresh installs, unblock to onboarding as soon as options are available.
      if (onboardingNeedsOptions) {
        const optionsDeadlineAt = Date.now() + BACKEND_STARTUP_TIMEOUT_MS;
        let optionsError: unknown = null;
        while (!cancelled) {
          if (Date.now() >= optionsDeadlineAt) {
            setStartupError(describeBackendFailure(optionsError, true));
            setOnboardingLoading(false);
            return;
          }
          try {
            const options = await client.getOnboardingOptions();
            setOnboardingOptions(options);
            setOnboardingLoading(false);
            return;
          } catch (err) {
            const apiErr = asApiLikeError(err);
            if (apiErr?.status === 401 && client.hasToken()) {
              client.setToken(null);
              setAuthRequired(true);
              setPairingEnabled(latestAuth.pairingEnabled);
              setPairingExpiresAt(latestAuth.expiresAt);
              setOnboardingLoading(false);
              return;
            }
            if (apiErr?.status === 404) {
              setStartupError(describeBackendFailure(err, false));
              setOnboardingLoading(false);
              return;
            }
            optionsError = err;
            await sleep(500);
          }
        }
        return;
      }

      setStartupPhase("initializing-agent");

      // Existing installs: keep loading until the runtime reports ready.
      let agentReady = false;
      const agentDeadlineAt = Date.now() + AGENT_READY_TIMEOUT_MS;
      let lastAgentError: unknown = null;
      let lastAgentDiagnostics: AgentStartupDiagnostics | undefined;
      while (!cancelled) {
        if (Date.now() >= agentDeadlineAt) {
          setStartupError(
            describeAgentFailure(lastAgentError, true, lastAgentDiagnostics),
          );
          setOnboardingLoading(false);
          return;
        }
        try {
          let status = await client.getStatus();
          setAgentStatus(status);
          setConnected(true);
          lastAgentDiagnostics = status.startup;

          // Hydrate deferred restart state
          if (status.pendingRestart) {
            setPendingRestart(true);
            setPendingRestartReasons(status.pendingRestartReasons ?? []);
          }

          if (status.state === "not_started" || status.state === "stopped") {
            try {
              status = await client.startAgent();
              setAgentStatus(status);
              lastAgentDiagnostics = status.startup;
            } catch (err) {
              lastAgentError = err;
            }
          }

          if (status.state === "running" || status.state === "paused") {
            agentReady = true;
            break;
          }

          if (status.state === "error") {
            setStartupError(
              describeAgentFailure(lastAgentError, false, status.startup),
            );
            setOnboardingLoading(false);
            return;
          }
        } catch (err) {
          const apiErr = asApiLikeError(err);
          if (apiErr?.status === 401 && client.hasToken()) {
            client.setToken(null);
            setAuthRequired(true);
            setPairingEnabled(latestAuth.pairingEnabled);
            setPairingExpiresAt(latestAuth.expiresAt);
            setOnboardingLoading(false);
            return;
          }
          lastAgentError = err;
          setConnected(false);
        }
        await sleep(500);
      }
      if (cancelled) return;

      if (!agentReady) {
        setStartupError(
          describeAgentFailure(lastAgentError, true, lastAgentDiagnostics),
        );
        setOnboardingLoading(false);
        return;
      }

      setStartupError(null);
      setOnboardingLoading(false);

      // Load conversations — if none exist, create one and request a greeting
      let greetConvId: string | null = null;
      try {
        const { conversations: c } = await client.listConversations();
        setConversations(c);
        if (c.length > 0) {
          const latest = c[0];
          setActiveConversationId(latest.id);
          activeConversationIdRef.current = latest.id;
          client.sendWsMessage({
            type: "active-conversation",
            conversationId: latest.id,
          });
          try {
            const { messages } = await client.getConversationMessages(
              latest.id,
            );
            setConversationMessages(messages);
            // If the latest conversation has no messages, queue a greeting
            if (messages.length === 0) {
              greetConvId = latest.id;
            }
          } catch (err) {
            logStartupWarning(
              "failed to load latest conversation messages",
              err,
            );
          }
        } else {
          // First launch — create a conversation and greet
          try {
            const { conversation } = await client.createConversation();
            setConversations([conversation]);
            setActiveConversationId(conversation.id);
            activeConversationIdRef.current = conversation.id;
            client.sendWsMessage({
              type: "active-conversation",
              conversationId: conversation.id,
            });
            setConversationMessages([]);
            greetConvId = conversation.id;
          } catch (err) {
            logStartupWarning("failed to create initial conversation", err);
          }
        }
      } catch (err) {
        logStartupWarning("failed to list conversations", err);
      }

      // If the agent is already running and we have a conversation needing a
      // greeting, fire it now. Otherwise the agent-state-transition effect
      // below will trigger it once the agent starts.
      if (greetConvId) {
        try {
          const s = await client.getStatus();
          if (s.state === "running" && !greetingFiredRef.current) {
            greetingFiredRef.current = true;
            setChatSending(true);
            try {
              const data = await client.requestGreeting(greetConvId);
              if (data.text) {
                setConversationMessages((prev: ConversationMessage[]) => [
                  ...prev,
                  {
                    id: `greeting-${Date.now()}`,
                    role: "assistant",
                    text: data.text,
                    timestamp: Date.now(),
                  },
                ]);
              }
            } catch (err) {
              logStartupWarning("failed to request greeting", err);
            }
            setChatSending(false);
          }
        } catch (err) {
          logStartupWarning(
            "failed to confirm runtime state for greeting",
            err,
          );
        }
      }

      void loadWorkbench();

      // Hydrate coding agent sessions
      client
        .getCodingAgentStatus()
        .then((status) => {
          if (status?.tasks) {
            setPtySessions(
              status.tasks.map((t) => ({
                sessionId: t.sessionId,
                agentType: t.agentType ?? "claude",
                label: t.label ?? t.sessionId,
                originalTask: t.originalTask ?? "",
                workdir: t.workdir ?? "",
                status: t.status ?? "active",
                decisionCount: t.decisionCount ?? 0,
                autoResolvedCount: t.autoResolvedCount ?? 0,
              })),
            );
          }
        })
        .catch(() => {}); // non-critical

      // Connect WebSocket
      client.connectWs();
      unbindStatus = client.onWsEvent(
        "status",
        (data: Record<string, unknown>) => {
          const nextStatus = parseAgentStatusEvent(data);
          if (nextStatus) {
            setAgentStatus(nextStatus);
            // Auto-refresh plugins when agent reports a restart
            if (data.restarted) {
              setPendingRestart(false);
              setPendingRestartReasons([]);
              void loadPlugins();
            }
          }
          // Sync pending restart state from periodic broadcasts
          if (typeof data.pendingRestart === "boolean") {
            setPendingRestart(data.pendingRestart);
          }
          if (Array.isArray(data.pendingRestartReasons)) {
            setPendingRestartReasons(
              data.pendingRestartReasons.filter(
                (el): el is string => typeof el === "string",
              ),
            );
          }
        },
      );
      client.onWsEvent("restart-required", (data: Record<string, unknown>) => {
        if (Array.isArray(data.reasons)) {
          setPendingRestartReasons(
            data.reasons.filter((el): el is string => typeof el === "string"),
          );
          setPendingRestart(true);
          setRestartBannerDismissed(false);
        }
      });
      unbindAgentEvents = client.onWsEvent(
        "agent_event",
        (data: Record<string, unknown>) => {
          const event = parseStreamEventEnvelopeEvent(data);
          if (event) {
            appendAutonomousEvent(event);
          }
        },
      );
      unbindHeartbeatEvents = client.onWsEvent(
        "heartbeat_event",
        (data: Record<string, unknown>) => {
          const event = parseStreamEventEnvelopeEvent(data);
          if (event) {
            appendAutonomousEvent(event);
          }
        },
      );

      await fetchAutonomyReplay();

      // Handle proactive messages from autonomy
      unbindProactiveMessages = client.onWsEvent(
        "proactive-message",
        (data: Record<string, unknown>) => {
          const parsed = parseProactiveMessageEvent(data);
          if (!parsed) return;
          const { conversationId: convId, message: msg } = parsed;

          if (convId === activeConversationIdRef.current) {
            // Active conversation — append in real-time (deduplicate by id)
            setConversationMessages((prev) => {
              if (prev.some((m) => m.id === msg.id)) return prev;
              return [...prev, msg];
            });
          } else {
            // Non-active — mark unread
            setUnreadConversations((prev) => new Set([...prev, convId]));
          }

          // Synthesize agent_event for non-retake sources (e.g. discord)
          // so they appear in the StreamView activity feed
          if (
            msg.source &&
            msg.source !== "retake" &&
            msg.source !== "client_chat" &&
            msg.role === "user"
          ) {
            appendAutonomousEvent({
              type: "agent_event",
              version: 1,
              eventId: `synth-${msg.id}`,
              ts: msg.timestamp,
              stream: "message",
              payload: {
                text: msg.text,
                from: msg.from,
                source: msg.source,
                direction: "inbound",
                channel: msg.source,
              },
            });
          }

          // Bump conversation to top of list
          setConversations((prev) => {
            const updated = prev.map((c) =>
              c.id === convId
                ? { ...c, updatedAt: new Date().toISOString() }
                : c,
            );
            return updated.sort(
              (a, b) =>
                new Date(b.updatedAt).getTime() -
                new Date(a.updatedAt).getTime(),
            );
          });
        },
      );

      // Handle conversation updates (e.g. title changes)
      client.onWsEvent(
        "conversation-updated",
        (data: Record<string, unknown>) => {
          const conv = data.conversation as Conversation;
          if (conv?.id) {
            setConversations((prev) => {
              const updated = prev.map((c) => (c.id === conv.id ? conv : c));
              return updated.sort(
                (a, b) =>
                  new Date(b.updatedAt).getTime() -
                  new Date(a.updatedAt).getTime(),
              );
            });
          }
        },
      );

      // Handle PTY session events from SwarmCoordinator
      client.onWsEvent("pty-session-event", (data: Record<string, unknown>) => {
        const eventType = (data.eventType ?? data.type) as string;
        const sessionId = data.sessionId as string;
        if (!sessionId) return;

        if (eventType === "task_registered") {
          const d = data.data as Record<string, unknown> | undefined;
          setPtySessions((prev) => [
            ...prev.filter((s) => s.sessionId !== sessionId),
            {
              sessionId,
              agentType: (d?.agentType as string) ?? "claude",
              label: (d?.label as string) ?? sessionId,
              originalTask: (d?.originalTask as string) ?? "",
              workdir: (d?.workdir as string) ?? "",
              status: "active",
              decisionCount: 0,
              autoResolvedCount: 0,
            },
          ]);
        } else if (eventType === "task_complete" || eventType === "stopped") {
          setPtySessions((prev) =>
            prev.filter((s) => s.sessionId !== sessionId),
          );
        } else if (eventType === "blocked" || eventType === "escalation") {
          setPtySessions((prev) =>
            prev.map((s) =>
              s.sessionId === sessionId
                ? { ...s, status: "blocked" as const }
                : s,
            ),
          );
        } else if (eventType === "tool_running") {
          const d = data.data as Record<string, unknown> | undefined;
          const toolDesc =
            (d?.description as string) ??
            (d?.toolName as string) ??
            "external tool";
          setPtySessions((prev) =>
            prev.map((s) =>
              s.sessionId === sessionId
                ? {
                    ...s,
                    status: "tool_running" as const,
                    toolDescription: toolDesc,
                  }
                : s,
            ),
          );
        } else if (
          eventType === "coordination_decision" ||
          eventType === "blocked_auto_resolved" ||
          eventType === "ready"
        ) {
          setPtySessions((prev) =>
            prev.map((s) =>
              s.sessionId === sessionId
                ? {
                    ...s,
                    status: "active" as const,
                    toolDescription: undefined,
                  }
                : s,
            ),
          );
        } else if (eventType === "error") {
          setPtySessions((prev) =>
            prev.map((s) =>
              s.sessionId === sessionId
                ? { ...s, status: "error" as const }
                : s,
            ),
          );
        }
      });

      // Load wallet addresses for header
      try {
        setWalletAddresses(await client.getWalletAddresses());
      } catch (err) {
        logStartupWarning("failed to load wallet addresses", err);
      }

      // Restore avatar selection from config (server-persisted under "ui")
      let resolvedIndex = loadAvatarIndex();
      try {
        const cfg = await client.getConfig();
        const ui = cfg.ui as Record<string, unknown> | undefined;
        if (ui?.avatarIndex != null) {
          resolvedIndex = normalizeAvatarIndex(Number(ui.avatarIndex));
          setSelectedVrmIndex(resolvedIndex);
        }
      } catch (err) {
        logStartupWarning("failed to load config for avatar selection", err);
      }
      // If custom avatar selected, verify the file still exists on the server
      if (resolvedIndex === 0) {
        const hasVrm = await client.hasCustomVrm();
        if (hasVrm) {
          setCustomVrmUrl(`/api/avatar/vrm?t=${Date.now()}`);
        } else {
          setSelectedVrmIndex(1);
        }
      }

      // Cloud polling
      pollCloudCredits();
      cloudPollInterval.current = window.setInterval(
        () => pollCloudCredits(),
        60_000,
      );

      // Load tab from URL — use hash in file:// mode (Electron packaged builds)
      const navPath =
        window.location.protocol === "file:"
          ? window.location.hash.replace(/^#/, "") || "/"
          : window.location.pathname;
      const urlTab = tabFromPath(navPath);
      if (urlTab) {
        setTabRaw(urlTab);
        if (urlTab === "plugins" || urlTab === "connectors") {
          void loadPlugins();
          if (urlTab === "plugins") {
            void loadSkills();
          }
        }
        if (urlTab === "settings") {
          void checkExtensionStatus();
          void loadWalletConfig();
          void loadCharacter();
          void loadUpdateStatus();
          void loadPlugins();
        }
        if (urlTab === "character") {
          void loadCharacter();
        }
        if (urlTab === "wallets") {
          void loadInventory();
        }
      }
    };

    void initApp();

    // Navigation listener — use hashchange in file:// mode (Electron packaged builds)
    const isFileProtocol = window.location.protocol === "file:";
    const handleNavChange = () => {
      const navPath = isFileProtocol
        ? window.location.hash.replace(/^#/, "") || "/"
        : window.location.pathname;
      const t = tabFromPath(navPath);
      if (t) setTabRaw(t);
    };
    const navEvent = isFileProtocol ? "hashchange" : "popstate";
    window.addEventListener(navEvent, handleNavChange);

    return () => {
      cancelled = true;
      window.removeEventListener(navEvent, handleNavChange);
      if (cloudPollInterval.current) clearInterval(cloudPollInterval.current);
      if (cloudLoginPollTimer.current)
        clearInterval(cloudLoginPollTimer.current);
      unbindStatus?.();
      unbindAgentEvents?.();
      unbindHeartbeatEvents?.();
      unbindProactiveMessages?.();
      client.disconnectWs();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    appendAutonomousEvent,
    checkExtensionStatus,
    currentTheme,
    fetchAutonomyReplay,
    loadCharacter,
    loadInventory,
    loadPlugins,
    loadSkills,
    loadUpdateStatus,
    loadWalletConfig,
    loadWorkbench, // Cloud polling
    pollCloudCredits,
    setSelectedVrmIndex,
    startupRetryNonce,
  ]);

  // When agent transitions to "running", send a greeting if conversation is empty
  useEffect(() => {
    const current = agentStatus?.state ?? null;
    const prev = prevAgentStateRef.current;
    prevAgentStateRef.current = current;

    if (current === "running" && prev !== "running") {
      void loadWorkbench();

      // Agent just started — greet if conversation is empty.
      // The greetingFiredRef guard prevents double-greeting when both the
      // init mount effect and this state-transition effect race to fire.
      if (
        activeConversationId &&
        conversationMessages.length === 0 &&
        !chatSending &&
        !greetingFiredRef.current
      ) {
        greetingFiredRef.current = true;
        void fetchGreeting(activeConversationId);
      }
    }
  }, [
    agentStatus?.state,
    loadWorkbench,
    activeConversationId,
    conversationMessages.length,
    chatSending,
    fetchGreeting,
  ]);

  // ── Context value ──────────────────────────────────────────────────

  const value: AppContextValue = {
    // State
    tab,
    currentTheme,
    connected,
    agentStatus,
    onboardingComplete,
    onboardingLoading,
    startupPhase,
    startupError,
    authRequired,
    actionNotice,
    lifecycleBusy,
    lifecycleAction,
    pendingRestart,
    pendingRestartReasons,
    restartBannerDismissed,
    pairingEnabled,
    pairingExpiresAt,
    pairingCodeInput,
    pairingError,
    pairingBusy,
    chatInput,
    chatSending,
    chatFirstTokenReceived,
    chatAvatarVisible,
    chatAgentVoiceMuted,
    chatAvatarSpeaking,
    conversations,
    activeConversationId,
    conversationMessages,
    autonomousEvents,
    autonomousLatestEventId,
    autonomousRunHealthByRunId,
    ptySessions,
    unreadConversations,
    triggers,
    triggersLoading,
    triggersSaving,
    triggerRunsById,
    triggerHealth,
    triggerError,
    plugins,
    pluginFilter,
    pluginStatusFilter,
    pluginSearch,
    pluginSettingsOpen,
    pluginAdvancedOpen,
    pluginSaving,
    pluginSaveSuccess,
    skills,
    skillsSubTab,
    skillCreateFormOpen,
    skillCreateName,
    skillCreateDescription,
    skillCreating,
    skillReviewReport,
    skillReviewId,
    skillReviewLoading,
    skillToggleAction,
    skillsMarketplaceQuery,
    skillsMarketplaceResults,
    skillsMarketplaceError,
    skillsMarketplaceLoading,
    skillsMarketplaceAction,
    skillsMarketplaceManualGithubUrl,
    logs,
    logSources,
    logTags,
    logTagFilter,
    logLevelFilter,
    logSourceFilter,
    walletAddresses,
    walletConfig,
    walletBalances,
    walletNfts,
    walletLoading,
    walletNftsLoading,
    inventoryView,
    walletExportData,
    walletExportVisible,
    walletApiKeySaving,
    inventorySort,
    walletError,
    registryStatus,
    registryLoading,
    registryRegistering,
    registryError,
    dropStatus,
    dropLoading,
    mintInProgress,
    mintResult,
    mintError,
    mintShiny,
    whitelistStatus,
    whitelistLoading,
    twitterVerifyMessage,
    twitterVerifyUrl,
    twitterVerifying,
    characterData,
    characterLoading,
    characterSaving,
    characterSaveSuccess,
    characterSaveError,
    characterDraft,
    selectedVrmIndex,
    customVrmUrl,
    cloudEnabled,
    cloudConnected,
    cloudCredits,
    cloudCreditsLow,
    cloudCreditsCritical,
    cloudTopUpUrl,
    cloudUserId,
    cloudLoginBusy,
    cloudLoginError,
    cloudDisconnecting,
    updateStatus,
    updateLoading,
    updateChannelSaving,
    extensionStatus,
    extensionChecking,
    storePlugins,
    storeSearch,
    storeFilter,
    storeLoading,
    storeInstalling,
    storeUninstalling,
    storeError,
    storeDetailPlugin,
    storeSubTab,
    catalogSkills,
    catalogTotal,
    catalogPage,
    catalogTotalPages,
    catalogSort,
    catalogSearch,
    catalogLoading,
    catalogError,
    catalogDetailSkill,
    catalogInstalling,
    catalogUninstalling,
    workbenchLoading,
    workbench,
    workbenchTasksAvailable,
    workbenchTriggersAvailable,
    workbenchTodosAvailable,
    exportBusy,
    exportPassword,
    exportIncludeLogs,
    exportError,
    exportSuccess,
    importBusy,
    importPassword,
    importFile,
    importError,
    importSuccess,
    onboardingStep,
    onboardingOptions,
    onboardingName,
    onboardingStyle,
    onboardingTheme,
    onboardingRunMode,
    onboardingCloudProvider,
    onboardingSmallModel,
    onboardingLargeModel,
    onboardingProvider,
    onboardingApiKey,
    onboardingOpenRouterModel,
    onboardingPrimaryModel,
    onboardingTelegramToken,
    onboardingDiscordToken,
    onboardingWhatsAppSessionPath,
    onboardingTwilioAccountSid,
    onboardingTwilioAuthToken,
    onboardingTwilioPhoneNumber,
    onboardingBlooioApiKey,
    onboardingBlooioPhoneNumber,
    onboardingGithubToken,
    onboardingSubscriptionTab,
    onboardingSelectedChains,
    onboardingRpcSelections,
    onboardingRpcKeys,
    onboardingAvatar,
    onboardingRestarting,
    commandPaletteOpen,
    commandQuery,
    commandActiveIndex,
    closeCommandPalette,
    emotePickerOpen,
    mcpConfiguredServers,
    mcpServerStatuses,
    mcpMarketplaceQuery,
    mcpMarketplaceResults,
    mcpMarketplaceLoading,
    mcpAction,
    mcpAddingServer,
    mcpAddingResult,
    mcpEnvInputs,
    mcpHeaderInputs,
    droppedFiles,
    shareIngestNotice,
    chatPendingImages,
    activeGameApp,
    activeGameDisplayName,
    activeGameViewerUrl,
    activeGameSandbox,
    activeGamePostMessageAuth,
    gameOverlayEnabled,
    appsSubTab,
    agentSubTab,
    pluginsSubTab,
    databaseSubTab,
    configRaw,
    configText,
    activeGamePostMessagePayload,

    // Actions
    setTab,
    setTheme,
    handleStart,
    handleStop,
    handlePauseResume,
    handleRestart,
    handleReset,
    retryStartup,
    dismissRestartBanner,
    triggerRestart,
    handleChatSend,
    handleChatStop,
    handleChatClear,
    handleNewConversation,
    setChatPendingImages,
    handleSelectConversation,
    handleDeleteConversation,
    handleRenameConversation,
    loadTriggers,
    createTrigger,
    updateTrigger,
    deleteTrigger,
    runTriggerNow,
    loadTriggerRuns,
    loadTriggerHealth,
    handlePairingSubmit,
    loadPlugins,
    handlePluginToggle,
    handlePluginConfigSave,
    loadSkills,
    refreshSkills,
    handleSkillToggle,
    handleCreateSkill,
    handleOpenSkill,
    handleDeleteSkill,
    handleReviewSkill,
    handleAcknowledgeSkill,
    searchSkillsMarketplace,
    installSkillFromMarketplace,
    uninstallMarketplaceSkill,
    installSkillFromGithubUrl,
    loadLogs,
    loadInventory,
    loadBalances,
    loadNfts,
    handleWalletApiKeySave,
    handleExportKeys,
    loadRegistryStatus,
    registerOnChain,
    syncRegistryProfile,
    loadDropStatus,
    mintFromDrop,
    loadWhitelistStatus,
    loadCharacter,
    handleSaveCharacter,
    handleCharacterFieldInput,
    handleCharacterArrayInput,
    handleCharacterStyleInput,
    handleCharacterMessageExamplesInput,
    handleOnboardingNext,
    handleOnboardingBack,
    handleCloudLogin,
    handleCloudDisconnect,
    loadUpdateStatus,
    handleChannelChange,
    checkExtensionStatus,
    openEmotePicker,
    closeEmotePicker,
    loadWorkbench,
    handleAgentExport,
    handleAgentImport,
    setActionNotice,
    setState,
    copyToClipboard,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
