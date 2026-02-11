/**
 * Global application state via React Context.
 *
 * Children access state and actions through the useApp() hook.
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import {
  client,
  type AgentStatus,
  type CharacterData,
  type PluginInfo,
  type SkillInfo,
  type LogEntry,
  type OnboardingOptions,
  type ExtensionStatus,
  type RegistryPlugin,
  type CatalogSkill,
  type WalletAddresses,
  type WalletBalancesResponse,
  type WalletNftsResponse,
  type WalletConfigStatus,
  type WalletExportResult,
  type SkillMarketplaceResult,
  type WorkbenchOverview,
  type McpServerConfig,
  type McpMarketplaceResult,
  type McpRegistryServerDetail,
  type McpServerStatus,
  type UpdateStatus,
  type ReleaseChannel,
  type Conversation,
  type ConversationMessage,
  type ConversationMode,
  type CreateTriggerRequest,
  type StylePreset,
  type StreamEventEnvelope,
  type TriggerHealthSnapshot,
  type TriggerRunRecord,
  type TriggerSummary,
  type UpdateTriggerRequest,
  type AppViewerAuthMessage,
  type RegistryStatus,
  type DropStatus,
  type MintResult,
  type WhitelistStatus,
} from "./api-client";
import { tabFromPath, pathForTab, type Tab } from "./navigation";
import { SkillScanReportSummary } from "./api-client";

// ── VRM helpers ─────────────────────────────────────────────────────────

/** Number of built-in milady VRM avatars shipped with the app. */
export const VRM_COUNT = 8;

/** Resolve a built-in VRM index (1–8) to its public asset URL. */
export function getVrmUrl(index: number): string {
  return `/vrms/${index}.vrm`;
}

/** Resolve a built-in VRM index (1–8) to its preview thumbnail URL. */
export function getVrmPreviewUrl(index: number): string {
  return `/vrms/previews/milady-${index}.png`;
}

// ── Theme ──────────────────────────────────────────────────────────────

const THEME_STORAGE_KEY = "milaidy:theme";

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
const AVATAR_INDEX_KEY = "milaidy_avatar_index";

function loadAvatarIndex(): number {
  try {
    const stored = localStorage.getItem(AVATAR_INDEX_KEY);
    if (stored) {
      const n = parseInt(stored, 10);
      if (!Number.isNaN(n) && n >= 0) return n;
    }
  } catch { /* ignore */ }
  return 1;
}

function saveAvatarIndex(index: number) {
  try {
    localStorage.setItem(AVATAR_INDEX_KEY, String(index));
  } catch { /* ignore */ }
}

// ── Onboarding step type ───────────────────────────────────────────────

export type OnboardingStep =
  | "welcome"
  | "name"
  | "avatar"
  | "style"
  | "theme"
  | "runMode"
  | "dockerSetup"
  | "cloudProvider"
  | "modelSelection"
  | "cloudLogin"
  | "llmProvider"
  | "inventorySetup"
  | "connectors"
  | "permissions";

// ── Action notice ──────────────────────────────────────────────────────

interface ActionNotice {
  tone: string;
  text: string;
}

type GamePostMessageAuthPayload = AppViewerAuthMessage;

const AGENT_STATES: ReadonlySet<AgentStatus["state"]> = new Set([
  "not_started",
  "running",
  "paused",
  "stopped",
  "restarting",
  "error",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseAgentStatusEvent(data: Record<string, unknown>): AgentStatus | null {
  const state = data.state;
  const agentName = data.agentName;
  if (typeof state !== "string" || !AGENT_STATES.has(state as AgentStatus["state"])) {
    return null;
  }
  if (typeof agentName !== "string") return null;
  const model = typeof data.model === "string" ? data.model : undefined;
  const startedAt = typeof data.startedAt === "number" ? data.startedAt : undefined;
  const uptime = typeof data.uptime === "number" ? data.uptime : undefined;
  return {
    state: state as AgentStatus["state"],
    agentName,
    model,
    startedAt,
    uptime,
  };
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
  if (typeof data.sessionKey === "string") envelope.sessionKey = data.sessionKey;
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
  if (
    typeof id !== "string" ||
    (role !== "user" && role !== "assistant") ||
    typeof text !== "string" ||
    typeof timestamp !== "number"
  ) {
    return null;
  }
  return { id, role, text, timestamp };
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

// ── Context value type ─────────────────────────────────────────────────

export interface AppState {
  // Core
  tab: Tab;
  currentTheme: ThemeName;
  connected: boolean;
  agentStatus: AgentStatus | null;
  onboardingComplete: boolean;
  onboardingLoading: boolean;
  authRequired: boolean;
  actionNotice: ActionNotice | null;

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
  conversations: Conversation[];
  activeConversationId: string | null;
  conversationMessages: ConversationMessage[];
  autonomousEvents: StreamEventEnvelope[];
  autonomousLatestEventId: string | null;
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
  workbenchGoalsAvailable: boolean;
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

  // Game
  activeGameApp: string;
  activeGameDisplayName: string;
  activeGameViewerUrl: string;
  activeGameSandbox: string;
  activeGamePostMessageAuth: boolean;
  activeGamePostMessagePayload: GamePostMessageAuthPayload | null;

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

  // Chat
  handleChatSend: (mode?: ConversationMode) => Promise<void>;
  handleChatStop: () => void;
  handleChatClear: () => Promise<void>;
  handleNewConversation: () => Promise<void>;
  handleSelectConversation: (id: string) => Promise<void>;
  handleDeleteConversation: (id: string) => Promise<void>;
  handleRenameConversation: (id: string, title: string) => Promise<void>;

  // Triggers
  loadTriggers: () => Promise<void>;
  createTrigger: (request: CreateTriggerRequest) => Promise<TriggerSummary | null>;
  updateTrigger: (id: string, request: UpdateTriggerRequest) => Promise<TriggerSummary | null>;
  deleteTrigger: (id: string) => Promise<boolean>;
  runTriggerNow: (id: string) => Promise<boolean>;
  loadTriggerRuns: (id: string) => Promise<void>;
  loadTriggerHealth: () => Promise<void>;

  // Pairing
  handlePairingSubmit: () => Promise<void>;

  // Plugins
  loadPlugins: () => Promise<void>;
  handlePluginToggle: (pluginId: string, enabled: boolean) => Promise<void>;
  handlePluginConfigSave: (pluginId: string, config: Record<string, string>) => Promise<void>;

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
  handleCharacterArrayInput: (field: "adjectives" | "topics" | "postExamples", value: string) => void;
  handleCharacterStyleInput: (subfield: "all" | "chat" | "post", value: string) => void;
  handleCharacterMessageExamplesInput: (value: string) => void;

  // Onboarding
  handleOnboardingNext: () => Promise<void>;
  handleOnboardingBack: () => void;

  // Cloud
  handleCloudLogin: () => Promise<void>;
  handleCloudDisconnect: () => Promise<void>;

  // Updates
  loadUpdateStatus: (force?: boolean) => Promise<void>;
  handleChannelChange: (channel: ReleaseChannel) => Promise<void>;

  // Extension
  checkExtensionStatus: () => Promise<void>;

  // Command palette
  openCommandPalette: () => void;
  closeCommandPalette: () => void;

  // Emote picker
  openEmotePicker: () => void;
  closeEmotePicker: () => void;

  // Workbench
  loadWorkbench: () => Promise<void>;

  // Agent export/import
  handleAgentExport: () => Promise<void>;
  handleAgentImport: () => Promise<void>;

  // Action notice
  setActionNotice: (text: string, tone?: "info" | "success" | "error", ttlMs?: number) => void;

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
  const [authRequired, setAuthRequired] = useState(false);
  const [actionNotice, setActionNoticeState] = useState<ActionNotice | null>(null);

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
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [conversationMessages, setConversationMessages] = useState<ConversationMessage[]>([]);
  const [autonomousEvents, setAutonomousEvents] = useState<StreamEventEnvelope[]>([]);
  const [autonomousLatestEventId, setAutonomousLatestEventId] = useState<string | null>(null);
  const [unreadConversations, setUnreadConversations] = useState<Set<string>>(new Set());
  const activeConversationIdRef = useRef<string | null>(null);

  // --- Triggers ---
  const [triggers, setTriggers] = useState<TriggerSummary[]>([]);
  const [triggersLoading, setTriggersLoading] = useState(false);
  const [triggersSaving, setTriggersSaving] = useState(false);
  const [triggerRunsById, setTriggerRunsById] = useState<Record<string, TriggerRunRecord[]>>({});
  const [triggerHealth, setTriggerHealth] = useState<TriggerHealthSnapshot | null>(null);
  const [triggerError, setTriggerError] = useState<string | null>(null);

  // --- Plugins ---
  const [plugins, setPlugins] = useState<PluginInfo[]>([]);
  const [pluginFilter, setPluginFilter] = useState<"all" | "ai-provider" | "connector" | "feature">("all");
  const [pluginStatusFilter, setPluginStatusFilter] = useState<"all" | "enabled" | "disabled">("all");
  const [pluginSearch, setPluginSearch] = useState("");
  const [pluginSettingsOpen, setPluginSettingsOpen] = useState<Set<string>>(new Set());
  const [pluginAdvancedOpen, setPluginAdvancedOpen] = useState<Set<string>>(new Set());
  const [pluginSaving, setPluginSaving] = useState<Set<string>>(new Set());
  const [pluginSaveSuccess, setPluginSaveSuccess] = useState<Set<string>>(new Set());

  // --- Skills ---
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [skillsSubTab, setSkillsSubTab] = useState<"my" | "browse">("my");
  const [skillCreateFormOpen, setSkillCreateFormOpen] = useState(false);
  const [skillCreateName, setSkillCreateName] = useState("");
  const [skillCreateDescription, setSkillCreateDescription] = useState("");
  const [skillCreating, setSkillCreating] = useState(false);
  const [skillReviewReport, setSkillReviewReport] = useState<SkillScanReportSummary | null>(null);
  const [skillReviewId, setSkillReviewId] = useState("");
  const [skillReviewLoading, setSkillReviewLoading] = useState(false);
  const [skillToggleAction, setSkillToggleAction] = useState("");
  const [skillsMarketplaceQuery, setSkillsMarketplaceQuery] = useState("");
  const [skillsMarketplaceResults, setSkillsMarketplaceResults] = useState<SkillMarketplaceResult[]>([]);
  const [skillsMarketplaceError, setSkillsMarketplaceError] = useState("");
  const [skillsMarketplaceLoading, setSkillsMarketplaceLoading] = useState(false);
  const [skillsMarketplaceAction, setSkillsMarketplaceAction] = useState("");
  const [skillsMarketplaceManualGithubUrl, setSkillsMarketplaceManualGithubUrl] = useState("");

  // --- Logs ---
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logSources, setLogSources] = useState<string[]>([]);
  const [logTags, setLogTags] = useState<string[]>([]);
  const [logTagFilter, setLogTagFilter] = useState("");
  const [logLevelFilter, setLogLevelFilter] = useState("");
  const [logSourceFilter, setLogSourceFilter] = useState("");

  // --- Wallet / Inventory ---
  const [walletAddresses, setWalletAddresses] = useState<WalletAddresses | null>(null);
  const [walletConfig, setWalletConfig] = useState<WalletConfigStatus | null>(null);
  const [walletBalances, setWalletBalances] = useState<WalletBalancesResponse | null>(null);
  const [walletNfts, setWalletNfts] = useState<WalletNftsResponse | null>(null);
  const [walletLoading, setWalletLoading] = useState(false);
  const [walletNftsLoading, setWalletNftsLoading] = useState(false);
  const [inventoryView, setInventoryView] = useState<"tokens" | "nfts">("tokens");
  const [walletExportData, setWalletExportData] = useState<WalletExportResult | null>(null);
  const [walletExportVisible, setWalletExportVisible] = useState(false);
  const [walletApiKeySaving, setWalletApiKeySaving] = useState(false);
  const [inventorySort, setInventorySort] = useState<"chain" | "symbol" | "value">("value");
  const [walletError, setWalletError] = useState<string | null>(null);

  // --- ERC-8004 Registry ---
  const [registryStatus, setRegistryStatus] = useState<RegistryStatus | null>(null);
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
  const [whitelistStatus, setWhitelistStatus] = useState<WhitelistStatus | null>(null);
  const [whitelistLoading, setWhitelistLoading] = useState(false);
  const [twitterVerifyMessage, setTwitterVerifyMessage] = useState<string | null>(null);
  const [twitterVerifyUrl, setTwitterVerifyUrl] = useState("");
  const [twitterVerifying, setTwitterVerifying] = useState(false);

  // --- Character ---
  const [characterData, setCharacterData] = useState<CharacterData | null>(null);
  const [characterLoading, setCharacterLoading] = useState(false);
  const [characterSaving, setCharacterSaving] = useState(false);
  const [characterSaveSuccess, setCharacterSaveSuccess] = useState<string | null>(null);
  const [characterSaveError, setCharacterSaveError] = useState<string | null>(null);
  const [characterDraft, setCharacterDraft] = useState<CharacterData>({});
  const [selectedVrmIndex, setSelectedVrmIndexRaw] = useState(loadAvatarIndex);
  const [customVrmUrl, setCustomVrmUrl] = useState("");

  // Wrap setter to also persist to localStorage
  const setSelectedVrmIndex = useCallback((v: number) => {
    setSelectedVrmIndexRaw(v);
    saveAvatarIndex(v);
  }, []);

  // --- Cloud ---
  const [cloudEnabled, setCloudEnabled] = useState(false);
  const [cloudConnected, setCloudConnected] = useState(false);
  const [cloudCredits, setCloudCredits] = useState<number | null>(null);
  const [cloudCreditsLow, setCloudCreditsLow] = useState(false);
  const [cloudCreditsCritical, setCloudCreditsCritical] = useState(false);
  const [cloudTopUpUrl, setCloudTopUpUrl] = useState("https://www.elizacloud.ai/dashboard/billing");
  const [cloudUserId, setCloudUserId] = useState<string | null>(null);
  const [cloudLoginBusy, setCloudLoginBusy] = useState(false);
  const [cloudLoginError, setCloudLoginError] = useState<string | null>(null);
  const [cloudDisconnecting, setCloudDisconnecting] = useState(false);

  // --- Updates ---
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);
  const [updateLoading, setUpdateLoading] = useState(false);
  const [updateChannelSaving, setUpdateChannelSaving] = useState(false);

  // --- Extension ---
  const [extensionStatus, setExtensionStatus] = useState<ExtensionStatus | null>(null);
  const [extensionChecking, setExtensionChecking] = useState(false);

  // --- Store ---
  const [storePlugins, setStorePlugins] = useState<RegistryPlugin[]>([]);
  const [storeSearch, setStoreSearch] = useState("");
  const [storeFilter, setStoreFilter] = useState<"all" | "installed" | "ai-provider" | "connector" | "feature">("all");
  const [storeLoading, setStoreLoading] = useState(false);
  const [storeInstalling, setStoreInstalling] = useState<Set<string>>(new Set());
  const [storeUninstalling, setStoreUninstalling] = useState<Set<string>>(new Set());
  const [storeError, setStoreError] = useState<string | null>(null);
  const [storeDetailPlugin, setStoreDetailPlugin] = useState<RegistryPlugin | null>(null);
  const [storeSubTab, setStoreSubTab] = useState<"plugins" | "skills">("plugins");

  // --- Catalog ---
  const [catalogSkills, setCatalogSkills] = useState<CatalogSkill[]>([]);
  const [catalogTotal, setCatalogTotal] = useState(0);
  const [catalogPage, setCatalogPage] = useState(1);
  const [catalogTotalPages, setCatalogTotalPages] = useState(1);
  const [catalogSort, setCatalogSort] = useState<"downloads" | "stars" | "updated" | "name">("downloads");
  const [catalogSearch, setCatalogSearch] = useState("");
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [catalogDetailSkill, setCatalogDetailSkill] = useState<CatalogSkill | null>(null);
  const [catalogInstalling, setCatalogInstalling] = useState<Set<string>>(new Set());
  const [catalogUninstalling, setCatalogUninstalling] = useState<Set<string>>(new Set());

  // --- Workbench ---
  const [workbenchLoading, setWorkbenchLoading] = useState(false);
  const [workbench, setWorkbench] = useState<WorkbenchOverview | null>(null);
  const [workbenchGoalsAvailable, setWorkbenchGoalsAvailable] = useState(false);
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
  const [onboardingStep, setOnboardingStep] = useState<OnboardingStep>("welcome");
  const [onboardingOptions, setOnboardingOptions] = useState<OnboardingOptions | null>(null);
  const [onboardingName, setOnboardingName] = useState("");
  const [onboardingStyle, setOnboardingStyle] = useState("");
  const [onboardingTheme, setOnboardingTheme] = useState<ThemeName>(loadTheme);
  const [onboardingRunMode, setOnboardingRunMode] = useState<"local-rawdog" | "local-sandbox" | "cloud" | "">("");
  const [onboardingCloudProvider, setOnboardingCloudProvider] = useState("");
  const [onboardingSmallModel, setOnboardingSmallModel] = useState("moonshotai/kimi-k2-turbo");
  const [onboardingLargeModel, setOnboardingLargeModel] = useState("moonshotai/kimi-k2-0905");
  const [onboardingProvider, setOnboardingProvider] = useState("");
  const [onboardingApiKey, setOnboardingApiKey] = useState("");
  const [onboardingOpenRouterModel, setOnboardingOpenRouterModel] = useState("");
  const [onboardingPrimaryModel, setOnboardingPrimaryModel] = useState("");
  const [onboardingTelegramToken, setOnboardingTelegramToken] = useState("");
  const [onboardingDiscordToken, setOnboardingDiscordToken] = useState("");
  const [onboardingWhatsAppSessionPath, setOnboardingWhatsAppSessionPath] = useState("");
  const [onboardingTwilioAccountSid, setOnboardingTwilioAccountSid] = useState("");
  const [onboardingTwilioAuthToken, setOnboardingTwilioAuthToken] = useState("");
  const [onboardingTwilioPhoneNumber, setOnboardingTwilioPhoneNumber] = useState("");
  const [onboardingBlooioApiKey, setOnboardingBlooioApiKey] = useState("");
  const [onboardingBlooioPhoneNumber, setOnboardingBlooioPhoneNumber] = useState("");
  const [onboardingSubscriptionTab, setOnboardingSubscriptionTab] = useState<"token" | "oauth">("token");
  const [onboardingSelectedChains, setOnboardingSelectedChains] = useState<Set<string>>(new Set(["evm", "solana"]));
  const [onboardingRpcSelections, setOnboardingRpcSelections] = useState<Record<string, string>>({});
  const [onboardingRpcKeys, setOnboardingRpcKeys] = useState<Record<string, string>>({});
  const [onboardingAvatar, setOnboardingAvatar] = useState(1);
  const [onboardingRestarting, setOnboardingRestarting] = useState(false);

  // --- Command palette ---
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");
  const [commandActiveIndex, setCommandActiveIndex] = useState(0);

  // --- Emote picker ---
  const [emotePickerOpen, setEmotePickerOpen] = useState(false);

  // --- MCP ---
  const [mcpConfiguredServers, setMcpConfiguredServers] = useState<Record<string, McpServerConfig>>({});
  const [mcpServerStatuses, setMcpServerStatuses] = useState<McpServerStatus[]>([]);
  const [mcpMarketplaceQuery, setMcpMarketplaceQuery] = useState("");
  const [mcpMarketplaceResults, setMcpMarketplaceResults] = useState<McpMarketplaceResult[]>([]);
  const [mcpMarketplaceLoading, setMcpMarketplaceLoading] = useState(false);
  const [mcpAction, setMcpAction] = useState("");
  const [mcpAddingServer, setMcpAddingServer] = useState<McpRegistryServerDetail | null>(null);
  const [mcpAddingResult, setMcpAddingResult] = useState<McpMarketplaceResult | null>(null);
  const [mcpEnvInputs, setMcpEnvInputs] = useState<Record<string, string>>({});
  const [mcpHeaderInputs, setMcpHeaderInputs] = useState<Record<string, string>>({});

  // --- Share ingest ---
  const [droppedFiles, setDroppedFiles] = useState<string[]>([]);
  const [shareIngestNotice, setShareIngestNotice] = useState("");

  // --- Game ---
  const [activeGameApp, setActiveGameApp] = useState("");
  const [activeGameDisplayName, setActiveGameDisplayName] = useState("");
  const [activeGameViewerUrl, setActiveGameViewerUrl] = useState("");
  const [activeGameSandbox, setActiveGameSandbox] = useState("allow-scripts allow-same-origin allow-popups");
  const [activeGamePostMessageAuth, setActiveGamePostMessageAuth] = useState(false);
  const [activeGamePostMessagePayload, setActiveGamePostMessagePayload] = useState<GamePostMessageAuthPayload | null>(null);

  // --- Admin ---
  const [appsSubTab, setAppsSubTab] = useState<"browse" | "games">("browse");
  const [agentSubTab, setAgentSubTab] = useState<"character" | "inventory" | "knowledge">("character");
  const [pluginsSubTab, setPluginsSubTab] = useState<"features" | "connectors" | "plugins">("features");
  const [databaseSubTab, setDatabaseSubTab] = useState<"tables" | "media" | "vectors">("tables");

  // --- Config ---
  const [configRaw, setConfigRaw] = useState<Record<string, unknown>>({});
  const [configText, setConfigText] = useState("");

  // --- Refs for timers ---
  const actionNoticeTimer = useRef<number | null>(null);
  const cloudPollInterval = useRef<number | null>(null);
  const cloudLoginPollTimer = useRef<number | null>(null);
  const prevAgentStateRef = useRef<string | null>(null);
  /** Guards against double-greeting when both init and state-transition paths fire. */
  const greetingFiredRef = useRef(false);
  const chatAbortRef = useRef<AbortController | null>(null);

  // ── Action notice ──────────────────────────────────────────────────

  const setActionNotice = useCallback(
    (text: string, tone: "info" | "success" | "error" = "info", ttlMs = 2800) => {
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
      window.history.pushState(null, "", path);
    },
    [activeGameViewerUrl],
  );

  const sortTriggersByNextRun = useCallback((items: TriggerSummary[]): TriggerSummary[] => {
    return [...items].sort((a: TriggerSummary, b: TriggerSummary) => {
      const aNext = a.nextRunAtMs ?? Number.MAX_SAFE_INTEGER;
      const bNext = b.nextRunAtMs ?? Number.MAX_SAFE_INTEGER;
      if (aNext !== bNext) return aNext - bNext;
      return a.displayName.localeCompare(b.displayName);
    });
  }, []);

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
      const message = err instanceof Error ? err.message : "Failed to load triggers";
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
      const message = err instanceof Error ? err.message : "Failed to load trigger runs";
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
          const merged = prev.filter((item: TriggerSummary) => item.id !== created.id);
          merged.push(created);
          return sortTriggersByNextRun(merged);
        });
        setTriggerError(null);
        void loadTriggerHealth();
        return created;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to create trigger";
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
        const message = err instanceof Error ? err.message : "Failed to update trigger";
        setTriggerError(message);
        return null;
      } finally {
        setTriggersSaving(false);
      }
    },
    [loadTriggerHealth, sortTriggersByNextRun],
  );

  const deleteTrigger = useCallback(async (id: string): Promise<boolean> => {
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
      const message = err instanceof Error ? err.message : "Failed to delete trigger";
      setTriggerError(message);
      return false;
    } finally {
      setTriggersSaving(false);
    }
  }, [loadTriggerHealth]);

  const runTriggerNow = useCallback(async (id: string): Promise<boolean> => {
    setTriggersSaving(true);
    try {
      const response = await client.runTriggerNow(id);
      if (response.trigger) {
        const trigger = response.trigger;
        setTriggers((prev: TriggerSummary[]) => {
          const idx = prev.findIndex((item: TriggerSummary) => item.id === id);
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
      const message = err instanceof Error ? err.message : "Failed to run trigger";
      setTriggerError(message);
      return false;
    } finally {
      setTriggersSaving(false);
    }
  }, [loadTriggerHealth, loadTriggerRuns, loadTriggers, sortTriggersByNextRun]);

  const appendAutonomousEvent = useCallback((event: StreamEventEnvelope) => {
    setAutonomousEvents((prev) => {
      if (prev.some((entry) => entry.eventId === event.eventId)) {
        return prev;
      }
      const merged = [...prev, event];
      if (merged.length > 1200) {
        return merged.slice(merged.length - 1200);
      }
      return merged;
    });
    setAutonomousLatestEventId(event.eventId);
  }, []);

  const loadConversations = useCallback(async () => {
    try {
      const { conversations: c } = await client.listConversations();
      setConversations(c);
    } catch {
      setConversations([]);
    }
  }, []);

  const loadConversationMessages = useCallback(async (convId: string) => {
    try {
      const { messages } = await client.getConversationMessages(convId);
      setConversationMessages(messages);
    } catch (err) {
      // If the conversation no longer exists (server restarted), clear it
      const status = (err as { status?: number }).status;
      if (status === 404) {
        setActiveConversationId(null);
        setConversations([]);
      }
      setConversationMessages([]);
    }
  }, []);

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
      setWalletError(`Failed to load wallet config: ${err instanceof Error ? err.message : "network error"}`);
    }
  }, []);

  const loadBalances = useCallback(async () => {
    setWalletLoading(true);
    setWalletError(null);
    try {
      const b = await client.getWalletBalances();
      setWalletBalances(b);
    } catch (err) {
      setWalletError(`Failed to fetch balances: ${err instanceof Error ? err.message : "network error"}`);
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
      setWalletError(`Failed to fetch NFTs: ${err instanceof Error ? err.message : "network error"}`);
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
        bio: Array.isArray(character.bio) ? character.bio.join("\n") : (character.bio ?? ""),
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
      setWorkbenchGoalsAvailable(result.goalsAvailable ?? false);
      setWorkbenchTodosAvailable(result.todosAvailable ?? false);
    } catch {
      setWorkbench(null);
      setWorkbenchGoalsAvailable(false);
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
      setExtensionStatus({ relayReachable: false, relayPort: 18792, extensionPath: null });
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
    setCloudEnabled(cloudStatus.enabled ?? false);
    // "Connected" should reflect authenticated cloud availability, not just
    // whether an API key is present in config.
    const isConnected = Boolean(cloudStatus.connected);
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

  const handleStart = useCallback(async () => {
    try {
      const s = await client.startAgent();
      setAgentStatus(s);
    } catch {
      /* ignore */
    }
  }, []);

  const handleStop = useCallback(async () => {
    try {
      const s = await client.stopAgent();
      setAgentStatus(s);
    } catch {
      /* ignore */
    }
  }, []);

  const handlePauseResume = useCallback(async () => {
    if (!agentStatus) return;
    try {
      if (agentStatus.state === "running") {
        setAgentStatus(await client.pauseAgent());
      } else if (agentStatus.state === "paused") {
        setAgentStatus(await client.resumeAgent());
      }
    } catch {
      /* ignore */
    }
  }, [agentStatus]);

  const handleRestart = useCallback(async () => {
    try {
      setAgentStatus({
        ...(agentStatus ?? { agentName: "Milaidy", model: undefined, uptime: undefined, startedAt: undefined }),
        state: "restarting",
      });
      // Server restart clears in-memory conversations — reset client state
      setActiveConversationId(null);
      setConversationMessages([]);
      setConversations([]);
      const s = await client.restartAgent();
      setAgentStatus(s);
    } catch {
      setTimeout(async () => {
        try {
          setAgentStatus(await client.getStatus());
        } catch {
          /* ignore */
        }
      }, 3000);
    }
  }, [agentStatus]);

  const handleReset = useCallback(async () => {
    const confirmed = window.confirm(
      "This will completely reset the agent — wiping all config, memory, and data.\n\n" +
        "You will be taken back to the onboarding wizard.\n\n" +
        "Are you sure?",
    );
    if (!confirmed) return;
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
    } catch {
      window.alert("Reset failed. Check the console for details.");
    }
  }, []);

  // ── Chat ───────────────────────────────────────────────────────────

  /** Request an agent greeting for a conversation and add it to messages. */
  const fetchGreeting = useCallback(async (convId: string) => {
    setChatSending(true);
    try {
      const data = await client.requestGreeting(convId);
      if (data.text) {
        setConversationMessages((prev: ConversationMessage[]) => [
          ...prev,
          { id: `greeting-${Date.now()}`, role: "assistant", text: data.text, timestamp: Date.now() },
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
      client.sendWsMessage({ type: "active-conversation", conversationId: conversation.id });
    } catch {
      /* ignore */
    }
  }, [fetchGreeting]);

  const handleChatSend = useCallback(async (mode: ConversationMode = "simple") => {
    const text = chatInput.trim();
    if (!text || chatSending) return;

    let convId: string = activeConversationId ?? "";
    if (!convId) {
      try {
        const { conversation } = await client.createConversation();
        setConversations((prev) => [conversation, ...prev]);
        setActiveConversationId(conversation.id);
        activeConversationIdRef.current = conversation.id;
        client.sendWsMessage({ type: "active-conversation", conversationId: conversation.id });
        convId = conversation.id;
      } catch {
        return;
      }
    }

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

    try {
      const data = await client.sendConversationMessageStream(
        convId,
        text,
        (token) => {
          setChatFirstTokenReceived(true);
          setConversationMessages((prev) =>
            prev.map((message) =>
              message.id === assistantMsgId
                ? { ...message, text: `${message.text}${token}` }
                : message,
            ),
          );
        },
        mode,
        controller.signal,
      );

      setConversationMessages((prev) =>
        prev.map((message) =>
          message.id === assistantMsgId
            ? { ...message, text: data.text }
            : message,
        ),
      );
      await loadConversations();
    } catch (err) {
      const abortError = err as Error;
      if (abortError.name === "AbortError") {
        setConversationMessages((prev) =>
          prev.filter((message) => !(message.id === assistantMsgId && !message.text.trim())),
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

          const retryData = await client.sendConversationMessage(
            conversation.id,
            text,
            mode,
          );
          setConversationMessages([
            { id: `temp-${Date.now()}`, role: "user", text, timestamp: Date.now() },
            {
              id: `temp-resp-${Date.now()}`,
              role: "assistant",
              text: retryData.text,
              timestamp: Date.now(),
            },
          ]);
        } catch {
          setConversationMessages((prev) =>
            prev.filter((message) => !(message.id === assistantMsgId && !message.text.trim())),
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
  }, [chatInput, chatSending, activeConversationId, loadConversationMessages, loadConversations]);

  const handleChatStop = useCallback(() => {
    chatAbortRef.current?.abort();
    chatAbortRef.current = null;
    setChatSending(false);
    setChatFirstTokenReceived(false);
  }, []);

  const handleChatClear = useCallback(async () => {
    if (activeConversationId) {
      await client.deleteConversation(activeConversationId);
      setActiveConversationId(null);
      activeConversationIdRef.current = null;
      setConversationMessages([]);
      await loadConversations();
    }
  }, [activeConversationId, loadConversations]);

  const handleSelectConversation = useCallback(
    async (id: string) => {
      if (id === activeConversationId) return;
      setActiveConversationId(id);
      activeConversationIdRef.current = id;
      client.sendWsMessage({ type: "active-conversation", conversationId: id });
      setUnreadConversations((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      await loadConversationMessages(id);
    },
    [activeConversationId, loadConversationMessages],
  );

  const handleDeleteConversation = useCallback(
    async (id: string) => {
      await client.deleteConversation(id);
      if (activeConversationId === id) {
        setActiveConversationId(null);
        activeConversationIdRef.current = null;
        setConversationMessages([]);
      }
      await loadConversations();
    },
    [activeConversationId, loadConversations],
  );

  const handleRenameConversation = useCallback(
    async (id: string, title: string) => {
      await client.renameConversation(id, title);
      await loadConversations();
    },
    [loadConversations],
  );

  // ── Pairing ────────────────────────────────────────────────────────

  const handlePairingSubmit = useCallback(async () => {
    const code = pairingCodeInput.trim();
    if (!code) {
      setPairingError("Enter the pairing code from the server logs.");
      return;
    }
    setPairingError(null);
    setPairingBusy(true);
    try {
      const { token } = await client.pair(code);
      client.setToken(token);
      window.location.reload();
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (status === 410) setPairingError("Pairing code expired. Check logs for a new code.");
      else if (status === 429) setPairingError("Too many attempts. Try again later.");
      else setPairingError("Pairing failed. Check the code and try again.");
    } finally {
      setPairingBusy(false);
    }
  }, [pairingCodeInput]);

  // ── Plugin actions ─────────────────────────────────────────────────

  const handlePluginToggle = useCallback(
    async (pluginId: string, enabled: boolean) => {
      const plugin = plugins.find((p: PluginInfo) => p.id === pluginId);
      if (enabled && plugin?.validationErrors && plugin.validationErrors.length > 0) {
        setPluginSettingsOpen((prev) => new Set([...prev, pluginId]));
      }
      try {
        await client.updatePlugin(pluginId, { enabled });
        setPlugins((prev: PluginInfo[]) =>
          prev.map((p: PluginInfo) => (p.id === pluginId ? { ...p, enabled } : p)),
        );
      } catch {
        /* ignore */
      }
    },
    [plugins, setActionNotice],
  );

  const handlePluginConfigSave = useCallback(
    async (pluginId: string, config: Record<string, string>) => {
      if (Object.keys(config).length === 0) return;
      setPluginSaving((prev) => new Set([...prev, pluginId]));
      try {
        await client.updatePlugin(pluginId, { config });

        // Check if this is an AI provider plugin
        const plugin = plugins.find(p => p.id === pluginId);
        const isAiProvider = plugin?.category === 'ai-provider';

        // Restart agent if AI provider (API keys need restart to take effect)
        if (isAiProvider) {
          await client.restartAgent();
        }

        await loadPlugins();
        setActionNotice(
          isAiProvider
            ? "Plugin settings saved and agent restarted."
            : "Plugin settings saved.",
          "success"
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
          prev.map((s) => (s.id === skillId ? { ...s, enabled: skill.enabled } : s)),
        );
        setActionNotice(`${skill.name} ${skill.enabled ? "enabled" : "disabled"}.`, "success");
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
      const result = await client.createSkill(name, skillCreateDescription.trim() || "");
      setSkillCreateName("");
      setSkillCreateDescription("");
      setSkillCreateFormOpen(false);
      setActionNotice(`Skill "${name}" created.`, "success");
      await refreshSkills();
      if (result.path) await client.openSkill(result.skill?.id ?? name).catch(() => undefined);
    } catch (err) {
      setActionNotice(`Failed to create skill: ${err instanceof Error ? err.message : "error"}`, "error", 4200);
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
        setActionNotice(`Failed to open: ${err instanceof Error ? err.message : "error"}`, "error", 4200);
      }
    },
    [setActionNotice],
  );

  const handleDeleteSkill = useCallback(
    async (skillId: string, skillName: string) => {
      if (!confirm(`Delete skill "${skillName}"? This cannot be undone.`)) return;
      try {
        await client.deleteSkill(skillId);
        setActionNotice(`Skill "${skillName}" deleted.`, "success");
        await refreshSkills();
      } catch (err) {
        setActionNotice(`Failed to delete: ${err instanceof Error ? err.message : "error"}`, "error", 4200);
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
        setActionNotice(`Skill "${skillId}" acknowledged and enabled.`, "success");
        setSkillReviewReport(null);
        setSkillReviewId("");
        await refreshSkills();
      } catch (err) {
        setActionNotice(`Failed: ${err instanceof Error ? err.message : "error"}`, "error", 4200);
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
      const { results } = await client.searchSkillsMarketplace(query, false, 20);
      setSkillsMarketplaceResults(results);
    } catch (err) {
      setSkillsMarketplaceResults([]);
      setSkillsMarketplaceError(err instanceof Error ? err.message : "unknown error");
    } finally {
      setSkillsMarketplaceLoading(false);
    }
  }, [skillsMarketplaceQuery]);

  const installSkillFromMarketplace = useCallback(
    async (item: SkillMarketplaceResult) => {
      setSkillsMarketplaceAction(`install:${item.id}`);
      try {
        await client.installMarketplaceSkill({
          githubUrl: item.githubUrl,
          repository: item.repository,
          path: item.path ?? undefined,
          name: item.name,
          description: item.description,
          source: "skillsmp",
          autoRefresh: true,
        });
        await refreshSkills();
        setActionNotice(`Installed skill: ${item.name}`, "success");
      } catch (err) {
        setActionNotice(`Skill install failed: ${err instanceof Error ? err.message : "unknown error"}`, "error", 4200);
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
      setActionNotice(`GitHub install failed: ${err instanceof Error ? err.message : "unknown error"}`, "error", 4200);
    } finally {
      setSkillsMarketplaceAction("");
    }
  }, [skillsMarketplaceManualGithubUrl, refreshSkills, setActionNotice]);

  const uninstallMarketplaceSkill = useCallback(
    async (skillId: string, name: string) => {
      setSkillsMarketplaceAction(`uninstall:${skillId}`);
      try {
        await client.uninstallMarketplaceSkill(skillId, true);
        await refreshSkills();
        setActionNotice(`Uninstalled skill: ${name}`, "success");
      } catch (err) {
        setActionNotice(`Skill uninstall failed: ${err instanceof Error ? err.message : "unknown error"}`, "error", 4200);
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
      setWalletApiKeySaving(true);
      setWalletError(null);
      try {
        await client.updateWalletConfig(config);
        await client.restartAgent();
        await loadWalletConfig();
        await loadBalances();
        setActionNotice("Wallet API keys saved and agent restarted.", "success");
      } catch (err) {
        setWalletError(`Failed to save API keys: ${err instanceof Error ? err.message : "network error"}`);
      }
      setWalletApiKeySaving(false);
    },
    [loadWalletConfig, loadBalances, setActionNotice],
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
    try {
      const data = await client.exportWalletKeys();
      setWalletExportData(data);
      setWalletExportVisible(true);
      setTimeout(() => {
        setWalletExportVisible(false);
        setWalletExportData(null);
      }, 60_000);
    } catch (err) {
      setWalletError(`Failed to export keys: ${err instanceof Error ? err.message : "network error"}`);
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
      setRegistryError(err instanceof Error ? err.message : "Failed to load registry status");
    } finally {
      setRegistryLoading(false);
    }
  }, []);

  const registerOnChain = useCallback(async () => {
    setRegistryRegistering(true);
    setRegistryError(null);
    try {
      await client.registerAgent({ name: characterDraft?.name || agentStatus?.name });
      await loadRegistryStatus();
    } catch (err) {
      setRegistryError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setRegistryRegistering(false);
    }
  }, [characterDraft?.name, agentStatus?.name, loadRegistryStatus]);

  const syncRegistryProfile = useCallback(async () => {
    setRegistryRegistering(true);
    setRegistryError(null);
    try {
      await client.syncRegistryProfile({ name: characterDraft?.name || agentStatus?.name });
      await loadRegistryStatus();
    } catch (err) {
      setRegistryError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setRegistryRegistering(false);
    }
  }, [characterDraft?.name, agentStatus?.name, loadRegistryStatus]);

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

  const mintFromDrop = useCallback(async (shiny: boolean) => {
    setMintInProgress(true);
    setMintError(null);
    setMintResult(null);
    try {
      const result = await client.mintAgent({
        name: characterDraft?.name || agentStatus?.name,
        shiny,
      });
      setMintResult(result);
      await loadRegistryStatus();
      await loadDropStatus();
    } catch (err) {
      setMintError(err instanceof Error ? err.message : "Mint failed");
    } finally {
      setMintInProgress(false);
    }
  }, [characterDraft?.name, agentStatus?.name, loadRegistryStatus, loadDropStatus]);

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
        const lines = draft.bio.split("\n").map((l: string) => l.trim()).filter((l: string) => l.length > 0);
        draft.bio = lines.length > 0 ? lines : undefined;
      }
      if (Array.isArray(draft.adjectives) && draft.adjectives.length === 0) delete draft.adjectives;
      if (Array.isArray(draft.topics) && draft.topics.length === 0) delete draft.topics;
      if (Array.isArray(draft.postExamples) && draft.postExamples.length === 0) delete draft.postExamples;
      if (Array.isArray(draft.messageExamples) && draft.messageExamples.length === 0) delete draft.messageExamples;
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
      // Also persist avatar selection to config
      try {
        await client.updateConfig({ settings: { avatarIndex: selectedVrmIndex } });
      } catch { /* non-fatal */ }
      setCharacterSaveSuccess("Character saved successfully.");
      if (agentName && agentStatus) {
        setAgentStatus({ ...agentStatus, agentName });
      }
      await loadCharacter();
    } catch (err) {
      setCharacterSaveError(`Failed to save: ${err instanceof Error ? err.message : "unknown error"}`);
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
      const items = value.split("\n").map((s: string) => s.trim()).filter((s: string) => s.length > 0);
      setCharacterDraft((prev: CharacterData) => ({ ...prev, [field]: items }));
    },
    [],
  );

  const handleCharacterStyleInput = useCallback(
    (subfield: "all" | "chat" | "post", value: string) => {
      const items = value.split("\n").map((s: string) => s.trim()).filter((s: string) => s.length > 0);
      setCharacterDraft((prev: CharacterData) => ({
        ...prev,
        style: { ...(prev.style ?? {}), [subfield]: items },
      }));
    },
    [],
  );

  const handleCharacterMessageExamplesInput = useCallback(
    (value: string) => {
      if (!value.trim()) {
        setCharacterDraft((prev: CharacterData) => ({ ...prev, messageExamples: [] }));
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
      setCharacterDraft((prev: CharacterData) => ({ ...prev, messageExamples: parsed }));
    },
    [],
  );

  // ── Onboarding ─────────────────────────────────────────────────────

  const handleOnboardingNext = useCallback(async () => {
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
        setOnboardingStep("runMode");
        break;
      }
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
      case "permissions":
        await handleOnboardingFinish();
        break;
    }
  }, [onboardingStep, onboardingOptions, onboardingRunMode, onboardingTheme, setTheme, cloudConnected]);

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
      case "runMode":
        setOnboardingStep("theme");
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
  }, [onboardingStep, onboardingOptions, onboardingRunMode]);

  const handleOnboardingFinish = useCallback(async () => {
    if (!onboardingOptions) return;
    const style = onboardingOptions.styles.find((s: StylePreset) => s.catchphrase === onboardingStyle);
    const systemPrompt = style?.system
      ? style.system.replace(/\{\{name\}\}/g, onboardingName)
      : `You are ${onboardingName}, an autonomous AI agent powered by ElizaOS. ${onboardingOptions.sharedStyleRules}`;

    const isLocalMode = onboardingRunMode === "local-rawdog" || onboardingRunMode === "local-sandbox";
    const inventoryProviders: Array<{ chain: string; rpcProvider: string; rpcApiKey?: string }> = [];
    if (isLocalMode) {
      for (const chain of onboardingSelectedChains) {
        const rpcProvider = onboardingRpcSelections[chain] || "elizacloud";
        const rpcApiKey = onboardingRpcKeys[`${chain}:${rpcProvider}`] || undefined;
        inventoryProviders.push({ chain, rpcProvider, rpcApiKey });
      }
    }

    // Map the 3-mode selection to the API's runMode field
    // "local-rawdog" and "local-sandbox" both map to "local" for backward compat
    // Sandbox mode is additionally stored as a separate flag
    const apiRunMode = onboardingRunMode === "cloud" ? "cloud" : "local";

    setOnboardingRestarting(true);
    try {
      await client.submitOnboarding({
        name: onboardingName,
        theme: onboardingTheme,
        runMode: apiRunMode as "local" | "cloud",
        sandboxMode: onboardingRunMode === "local-sandbox" ? "standard" : onboardingRunMode === "cloud" ? "light" : "off",
        bio: style?.bio ?? ["An autonomous AI agent."],
        systemPrompt,
        style: style?.style,
        adjectives: style?.adjectives,
        topics: style?.topics,
        postExamples: style?.postExamples,
        messageExamples: style?.messageExamples,
        cloudProvider: onboardingRunMode === "cloud" ? onboardingCloudProvider : undefined,
        smallModel: onboardingRunMode === "cloud" ? onboardingSmallModel : undefined,
        largeModel: onboardingRunMode === "cloud" ? onboardingLargeModel : undefined,
        provider: isLocalMode ? onboardingProvider || undefined : undefined,
        providerApiKey: isLocalMode ? onboardingApiKey || undefined : undefined,
        inventoryProviders: inventoryProviders.length > 0 ? inventoryProviders : undefined,
        // Connectors
        telegramToken: onboardingTelegramToken.trim() || undefined,
        discordToken: onboardingDiscordToken.trim() || undefined,
        whatsappSessionPath: onboardingWhatsAppSessionPath.trim() || undefined,
        twilioAccountSid: onboardingTwilioAccountSid.trim() || undefined,
        twilioAuthToken: onboardingTwilioAuthToken.trim() || undefined,
        twilioPhoneNumber: onboardingTwilioPhoneNumber.trim() || undefined,
        blooioApiKey: onboardingBlooioApiKey.trim() || undefined,
        blooioPhoneNumber: onboardingBlooioPhoneNumber.trim() || undefined,
      });
    } catch (err) {
      setOnboardingRestarting(false);
      window.alert(`Setup failed: ${err instanceof Error ? err.message : "network error"}. Please try again.`);
      return;
    }

    setOnboardingComplete(true);
    setTab("chat");
    try {
      setAgentStatus(await client.restartAgent());
    } catch {
      /* ignore */
    }
    setOnboardingRestarting(false);
  }, [
    onboardingOptions, onboardingStyle, onboardingName, onboardingTheme,
    onboardingRunMode, onboardingCloudProvider, onboardingSmallModel,
    onboardingLargeModel, onboardingProvider, onboardingApiKey,
    onboardingPrimaryModel,
    onboardingSelectedChains, onboardingRpcSelections, onboardingRpcKeys,
    onboardingTelegramToken, onboardingDiscordToken, onboardingWhatsAppSessionPath,
    onboardingTwilioAccountSid, onboardingTwilioAuthToken, onboardingTwilioPhoneNumber,
    onboardingBlooioApiKey, onboardingBlooioPhoneNumber,
    setTab,
  ]);

  // ── Cloud ──────────────────────────────────────────────────────────

  const handleCloudLogin = useCallback(async () => {
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
          if (cloudLoginPollTimer.current) clearInterval(cloudLoginPollTimer.current);
          setCloudLoginError("Login timed out. Please try again.");
          setCloudLoginBusy(false);
          return;
        }
        try {
          const poll = await client.cloudLoginPoll(resp.sessionId);
          if (poll.status === "authenticated") {
            if (cloudLoginPollTimer.current) clearInterval(cloudLoginPollTimer.current);
            setCloudLoginBusy(false);
            // Immediately reflect the login in the UI — don't wait for the
            // background poll which may race with the config save.
            setCloudConnected(true);
            setCloudEnabled(true);
            setActionNotice("Logged in to Eliza Cloud successfully.", "success", 6000);
            void loadWalletConfig();
            // Delay the credit fetch slightly so the backend has time to
            // persist the API key before we query cloud status / credits.
            setTimeout(() => void pollCloudCredits(), 2000);
          } else if (poll.status === "expired" || poll.status === "error") {
            if (cloudLoginPollTimer.current) clearInterval(cloudLoginPollTimer.current);
            setCloudLoginError(poll.error ?? "Session expired. Please try again.");
            setCloudLoginBusy(false);
          }
        } catch {
          /* keep trying */
        }
      }, 1000);
    } catch (err) {
      setCloudLoginError(err instanceof Error ? err.message : "Login failed");
      setCloudLoginBusy(false);
    }
  }, [setActionNotice, pollCloudCredits, loadWalletConfig]);

  const handleCloudDisconnect = useCallback(async () => {
    if (!confirm("Disconnect from Eliza Cloud? The agent will need a local AI provider to continue working."))
      return;
    setCloudDisconnecting(true);
    try {
      await client.cloudDisconnect();
      setCloudConnected(false);
      setCloudCredits(null);
      setCloudUserId(null);
      setActionNotice("Disconnected from Eliza Cloud.", "success");
    } catch (err) {
      setActionNotice(`Disconnect failed: ${err instanceof Error ? err.message : "error"}`, "error");
    } finally {
      setCloudDisconnecting(false);
    }
  }, [setActionNotice]);

  // ── Updates ────────────────────────────────────────────────────────

  const handleChannelChange = useCallback(
    async (channel: ReleaseChannel) => {
      if (updateStatus?.channel === channel) return;
      setUpdateChannelSaving(true);
      try {
        await client.setUpdateChannel(channel);
        await loadUpdateStatus(true);
      } catch {
        /* ignore */
      }
      setUpdateChannelSaving(false);
    },
    [updateStatus, loadUpdateStatus],
  );

  // ── Agent export/import ────────────────────────────────────────────

  const handleAgentExport = useCallback(async () => {
    if (exportBusy || exportPassword.length < 4) return;
    setExportBusy(true);
    setExportError(null);
    setExportSuccess(null);
    try {
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
      setExportSuccess(`Exported successfully (${(blob.size / 1024).toFixed(0)} KB)`);
      setExportPassword("");
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExportBusy(false);
    }
  }, [exportBusy, exportPassword, exportIncludeLogs]);

  const handleAgentImport = useCallback(async () => {
    if (importBusy || !importFile || importPassword.length < 4) return;
    setImportBusy(true);
    setImportError(null);
    setImportSuccess(null);
    try {
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
      setImportSuccess(`Imported "${result.agentName}" successfully: ${summary || "no data"}. Restart the agent to activate.`);
      setImportPassword("");
      setImportFile(null);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImportBusy(false);
    }
  }, [importBusy, importFile, importPassword]);

  // ── Command palette ────────────────────────────────────────────────

  const openCommandPalette = useCallback(() => {
    setCommandQuery("");
    setCommandActiveIndex(0);
    setCommandPaletteOpen(true);
  }, []);

  const closeCommandPalette = useCallback(() => {
    setCommandPaletteOpen(false);
  }, []);

  // ── Emote picker ────────────────────────────────────────────────────

  const openEmotePicker = useCallback(() => {
    setEmotePickerOpen(true);
  }, []);

  const closeEmotePicker = useCallback(() => {
    setEmotePickerOpen(false);
  }, []);

  // ── Generic state setter ───────────────────────────────────────────

  const setState = useCallback(<K extends keyof AppState>(key: K, value: AppState[K]) => {
    const setterMap: Partial<{ [S in keyof AppState]: (v: AppState[S]) => void }> = {
      tab: setTabRaw,
      chatInput: setChatInput,
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
      importPassword: setImportPassword,
      importFile: setImportFile,
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
      onboardingSubscriptionTab: setOnboardingSubscriptionTab,
      onboardingRpcKeys: setOnboardingRpcKeys,
      onboardingAvatar: setOnboardingAvatar,
      onboardingRestarting: setOnboardingRestarting,
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
  }, []);

  // ── Initialization ─────────────────────────────────────────────────

  useEffect(() => {
    applyTheme(currentTheme);
    let unbindStatus: (() => void) | null = null;
    let unbindAgentEvents: (() => void) | null = null;
    let unbindHeartbeatEvents: (() => void) | null = null;
    let unbindProactiveMessages: (() => void) | null = null;

    const initApp = async () => {
      const MAX_RETRIES = 15;
      const BASE_DELAY_MS = 1000;
      const MAX_DELAY_MS = 5000;
      let serverReady = false;

      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
          const auth = await client.getAuthStatus();
          if (auth.required && !client.hasToken()) {
            setAuthRequired(true);
            setPairingEnabled(auth.pairingEnabled);
            setPairingExpiresAt(auth.expiresAt);
            serverReady = true;
            break;
          }
          const { complete } = await client.getOnboardingStatus();
          setOnboardingComplete(complete);
          if (!complete) {
            const options = await client.getOnboardingOptions();
            setOnboardingOptions(options);
          }
          serverReady = true;
          break;
        } catch {
          if (attempt < MAX_RETRIES) {
            const delay = Math.min(BASE_DELAY_MS * 2 ** attempt, MAX_DELAY_MS);
            await new Promise((r) => setTimeout(r, delay));
          }
        }
      }
      if (!serverReady) {
        console.warn("[milaidy] Could not reach server after retries.");
      }
      setOnboardingLoading(false);

      if (authRequired) return;

      // Load conversations — if none exist, create one and request a greeting
      let greetConvId: string | null = null;
      try {
        const { conversations: c } = await client.listConversations();
        setConversations(c);
        if (c.length > 0) {
          const latest = c[0];
          setActiveConversationId(latest.id);
          activeConversationIdRef.current = latest.id;
          client.sendWsMessage({ type: "active-conversation", conversationId: latest.id });
          try {
            const { messages } = await client.getConversationMessages(latest.id);
            setConversationMessages(messages);
            // If the latest conversation has no messages, queue a greeting
            if (messages.length === 0) {
              greetConvId = latest.id;
            }
          } catch {
            /* ignore */
          }
        } else {
          // First launch — create a conversation and greet
          try {
            const { conversation } = await client.createConversation();
            setConversations([conversation]);
            setActiveConversationId(conversation.id);
            setConversationMessages([]);
            greetConvId = conversation.id;
          } catch {
            /* ignore */
          }
        }
      } catch {
        /* ignore */
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
                  { id: `greeting-${Date.now()}`, role: "assistant", text: data.text, timestamp: Date.now() },
                ]);
              }
            } catch { /* ignore */ }
            setChatSending(false);
          }
        } catch { /* ignore */ }
      }

      void loadWorkbench();

      // Connect WebSocket
      client.connectWs();
      unbindStatus = client.onWsEvent("status", (data: Record<string, unknown>) => {
        const nextStatus = parseAgentStatusEvent(data);
        if (nextStatus) {
          setAgentStatus(nextStatus);
        }
      });
      unbindAgentEvents = client.onWsEvent("agent_event", (data: Record<string, unknown>) => {
        const event = parseStreamEventEnvelopeEvent(data);
        if (event) {
          appendAutonomousEvent(event);
        }
      });
      unbindHeartbeatEvents = client.onWsEvent("heartbeat_event", (data: Record<string, unknown>) => {
        const event = parseStreamEventEnvelopeEvent(data);
        if (event) {
          appendAutonomousEvent(event);
        }
      });

      try {
        const replay = await client.getAgentEvents({ limit: 300 });
        if (replay.events.length > 0) {
          setAutonomousEvents(replay.events);
          setAutonomousLatestEventId(replay.latestEventId);
        }
      } catch (err) {
        console.warn("[milaidy] Failed to fetch autonomous event replay", err);
      }

      // Handle proactive messages from autonomy
      unbindProactiveMessages = client.onWsEvent("proactive-message", (data: Record<string, unknown>) => {
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
      });

      // Load status
      try {
        const status = await client.getStatus();
        setAgentStatus(status);
        setConnected(true);

        // Keep runtime available by default when the app opens.
        if (status.state === "not_started" || status.state === "stopped") {
          try {
            const started = await client.startAgent();
            setAgentStatus(started);
          } catch {
            /* ignore */
          }
        }
      } catch {
        setConnected(false);
      }

      // Load wallet addresses for header
      try {
        setWalletAddresses(await client.getWalletAddresses());
      } catch {
        /* ignore */
      }

      // Restore avatar selection from config (server-persisted)
      try {
        const cfg = await client.getConfig();
        const settings = cfg.settings as Record<string, unknown> | undefined;
        if (settings?.avatarIndex != null) {
          const idx = Number(settings.avatarIndex);
          if (!Number.isNaN(idx) && idx >= 0) {
            setSelectedVrmIndex(idx);
          }
        }
      } catch {
        /* ignore — localStorage fallback already loaded */
      }

      // Cloud polling
      pollCloudCredits();
      cloudPollInterval.current = window.setInterval(() => pollCloudCredits(), 60_000);

      // Load tab from URL
      const urlTab = tabFromPath(window.location.pathname);
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

    initApp();

    // Popstate listener
    const handlePopState = () => {
      const t = tabFromPath(window.location.pathname);
      if (t) setTabRaw(t);
    };
    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
      if (cloudPollInterval.current) clearInterval(cloudPollInterval.current);
      if (cloudLoginPollTimer.current) clearInterval(cloudLoginPollTimer.current);
      unbindStatus?.();
      unbindAgentEvents?.();
      unbindHeartbeatEvents?.();
      unbindProactiveMessages?.();
      client.disconnectWs();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appendAutonomousEvent]);

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
      if (activeConversationId && conversationMessages.length === 0 && !chatSending && !greetingFiredRef.current) {
        greetingFiredRef.current = true;
        void fetchGreeting(activeConversationId);
      }
    }
  }, [agentStatus?.state, loadWorkbench, activeConversationId, conversationMessages.length, chatSending, fetchGreeting]);

  // ── Context value ──────────────────────────────────────────────────

  const value: AppContextValue = {
    // State
    tab, currentTheme, connected, agentStatus, onboardingComplete, onboardingLoading,
    authRequired, actionNotice,
    pairingEnabled, pairingExpiresAt, pairingCodeInput, pairingError, pairingBusy,
    chatInput, chatSending, chatFirstTokenReceived, conversations, activeConversationId, conversationMessages,
    autonomousEvents, autonomousLatestEventId, unreadConversations,
    triggers, triggersLoading, triggersSaving, triggerRunsById, triggerHealth, triggerError,
    plugins, pluginFilter, pluginStatusFilter, pluginSearch, pluginSettingsOpen,
    pluginAdvancedOpen, pluginSaving, pluginSaveSuccess,
    skills, skillsSubTab, skillCreateFormOpen, skillCreateName, skillCreateDescription,
    skillCreating, skillReviewReport, skillReviewId, skillReviewLoading, skillToggleAction,
    skillsMarketplaceQuery, skillsMarketplaceResults, skillsMarketplaceError,
    skillsMarketplaceLoading, skillsMarketplaceAction, skillsMarketplaceManualGithubUrl,
    logs, logSources, logTags, logTagFilter, logLevelFilter, logSourceFilter,
    walletAddresses, walletConfig, walletBalances, walletNfts, walletLoading,
    walletNftsLoading, inventoryView, walletExportData, walletExportVisible,
    walletApiKeySaving, inventorySort, walletError,
    registryStatus, registryLoading, registryRegistering, registryError,
    dropStatus, dropLoading, mintInProgress, mintResult, mintError, mintShiny,
    whitelistStatus, whitelistLoading, twitterVerifyMessage, twitterVerifyUrl, twitterVerifying,
    characterData, characterLoading, characterSaving, characterSaveSuccess,
    characterSaveError, characterDraft, selectedVrmIndex, customVrmUrl,
    cloudEnabled, cloudConnected, cloudCredits, cloudCreditsLow, cloudCreditsCritical,
    cloudTopUpUrl, cloudUserId, cloudLoginBusy, cloudLoginError, cloudDisconnecting,
    updateStatus, updateLoading, updateChannelSaving,
    extensionStatus, extensionChecking,
    storePlugins, storeSearch, storeFilter, storeLoading, storeInstalling,
    storeUninstalling, storeError, storeDetailPlugin, storeSubTab,
    catalogSkills, catalogTotal, catalogPage, catalogTotalPages, catalogSort,
    catalogSearch, catalogLoading, catalogError, catalogDetailSkill,
    catalogInstalling, catalogUninstalling,
    workbenchLoading, workbench, workbenchGoalsAvailable, workbenchTodosAvailable,
    exportBusy, exportPassword, exportIncludeLogs, exportError, exportSuccess,
    importBusy, importPassword, importFile, importError, importSuccess,
    onboardingStep, onboardingOptions, onboardingName, onboardingStyle, onboardingTheme,
    onboardingRunMode, onboardingCloudProvider, onboardingSmallModel, onboardingLargeModel,
    onboardingProvider, onboardingApiKey, onboardingOpenRouterModel, onboardingPrimaryModel,
    onboardingTelegramToken, onboardingDiscordToken, onboardingWhatsAppSessionPath,
    onboardingTwilioAccountSid, onboardingTwilioAuthToken, onboardingTwilioPhoneNumber,
    onboardingBlooioApiKey, onboardingBlooioPhoneNumber, onboardingSubscriptionTab,
    onboardingSelectedChains, onboardingRpcSelections, onboardingRpcKeys,
    onboardingAvatar, onboardingRestarting,
    commandPaletteOpen, commandQuery, commandActiveIndex, emotePickerOpen,
    mcpConfiguredServers, mcpServerStatuses, mcpMarketplaceQuery, mcpMarketplaceResults,
    mcpMarketplaceLoading, mcpAction, mcpAddingServer, mcpAddingResult,
    mcpEnvInputs, mcpHeaderInputs,
    droppedFiles, shareIngestNotice,
    activeGameApp, activeGameDisplayName, activeGameViewerUrl, activeGameSandbox,
    activeGamePostMessageAuth,
    appsSubTab, agentSubTab, pluginsSubTab, databaseSubTab,
    configRaw, configText,
    activeGamePostMessagePayload,

    // Actions
    setTab, setTheme,
    handleStart, handleStop, handlePauseResume, handleRestart, handleReset,
    handleChatSend, handleChatStop, handleChatClear, handleNewConversation,
    handleSelectConversation, handleDeleteConversation, handleRenameConversation,
    loadTriggers, createTrigger, updateTrigger, deleteTrigger, runTriggerNow,
    loadTriggerRuns, loadTriggerHealth,
    handlePairingSubmit,
    loadPlugins, handlePluginToggle, handlePluginConfigSave,
    loadSkills, refreshSkills, handleSkillToggle, handleCreateSkill,
    handleOpenSkill, handleDeleteSkill, handleReviewSkill, handleAcknowledgeSkill,
    searchSkillsMarketplace, installSkillFromMarketplace, uninstallMarketplaceSkill, installSkillFromGithubUrl,
    loadLogs,
    loadInventory, loadBalances, loadNfts, handleWalletApiKeySave, handleExportKeys,
    loadRegistryStatus, registerOnChain, syncRegistryProfile, loadDropStatus, mintFromDrop, loadWhitelistStatus,
    loadCharacter, handleSaveCharacter, handleCharacterFieldInput,
    handleCharacterArrayInput, handleCharacterStyleInput, handleCharacterMessageExamplesInput,
    handleOnboardingNext, handleOnboardingBack,
    handleCloudLogin, handleCloudDisconnect,
    loadUpdateStatus, handleChannelChange,
    checkExtensionStatus,
    openCommandPalette, closeCommandPalette,
    openEmotePicker, closeEmotePicker,
    loadWorkbench,
    handleAgentExport, handleAgentImport,
    setActionNotice,
    setState,
    copyToClipboard,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
