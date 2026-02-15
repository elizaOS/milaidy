/**
 * API client for the Milaidy backend.
 *
 * Thin fetch wrapper + WebSocket for real-time chat/events.
 * Replaces the gateway WebSocket protocol entirely.
 */

import type { ConfigUiHint } from "./types";
import type {
  AudioGenConfig,
  AudioGenProvider,
  CustomActionDef,
  CustomActionHandler,
  DatabaseProviderType,
  ImageConfig,
  ImageProvider,
  MediaConfig,
  MediaMode,
  ReleaseChannel,
  VideoConfig,
  VideoProvider,
  VisionConfig,
  VisionProvider,
} from "../../../src/config/types.milaidy.js";
import type { StylePreset } from "../../../src/contracts/onboarding.js";
import type {
  EvmChainBalance,
  EvmNft,
  EvmTokenBalance,
  SolanaNft,
  SolanaTokenBalance,
  WalletAddresses,
  WalletBalancesResponse,
  WalletConfigStatus,
  WalletNftsResponse,
} from "../../../src/contracts/wallet.js";
import type { DropStatus, MintResult } from "../../../src/contracts/drop.js";
import type { VerificationResult } from "../../../src/contracts/verification.js";
import type {
  AllPermissionsState,
  PermissionState,
  PermissionStatus,
  SystemPermissionDefinition,
  SystemPermissionId,
} from "../../../src/permissions/types.js";

export type {
  AudioGenConfig,
  AudioGenProvider,
  CustomActionDef,
  CustomActionHandler,
  DatabaseProviderType,
  ImageConfig,
  ImageProvider,
  MediaConfig,
  MediaMode,
  ReleaseChannel,
  VideoConfig,
  VideoProvider,
  VisionConfig,
  VisionProvider,
};
export type { StylePreset };
export type {
  EvmChainBalance,
  EvmNft,
  EvmTokenBalance,
  SolanaNft,
  SolanaTokenBalance,
  WalletAddresses,
  WalletBalancesResponse,
  WalletConfigStatus,
  WalletNftsResponse,
};
export type { DropStatus, MintResult };
export type { VerificationResult };
export type {
  AllPermissionsState,
  PermissionState,
  PermissionStatus,
  SystemPermissionId,
  SystemPermissionDefinition as PermissionDefinition,
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DatabaseStatus {
  provider: DatabaseProviderType;
  connected: boolean;
  serverVersion: string | null;
  tableCount: number;
  pgliteDataDir: string | null;
  postgresHost: string | null;
}

export interface DatabaseConfigResponse {
  config: {
    provider?: DatabaseProviderType;
    pglite?: { dataDir?: string };
    postgres?: {
      connectionString?: string;
      host?: string;
      port?: number;
      database?: string;
      user?: string;
      password?: string;
      ssl?: boolean;
    };
  };
  activeProvider: DatabaseProviderType;
  needsRestart: boolean;
}

export interface ConnectionTestResult {
  success: boolean;
  serverVersion: string | null;
  error: string | null;
  durationMs: number;
}

export interface TableInfo {
  name: string;
  schema: string;
  rowCount: number;
  columns: ColumnInfo[];
}

export interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
  defaultValue: string | null;
  isPrimaryKey: boolean;
}

export interface TableRowsResponse {
  table: string;
  rows: Record<string, unknown>[];
  columns: string[];
  total: number;
  offset: number;
  limit: number;
}

export interface QueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  durationMs: number;
}

export type AgentState = "not_started" | "starting" | "running" | "paused" | "stopped" | "restarting" | "error";

export interface AgentStatus {
  state: AgentState;
  agentName: string;
  model: string | undefined;
  uptime: number | undefined;
  startedAt: number | undefined;
}

export interface RuntimeOrderItem {
  index: number;
  name: string;
  className: string;
  id: string | null;
}

export interface RuntimeServiceOrderItem {
  index: number;
  serviceType: string;
  count: number;
  instances: RuntimeOrderItem[];
}

export interface RuntimeDebugSnapshot {
  runtimeAvailable: boolean;
  generatedAt: number;
  settings: {
    maxDepth: number;
    maxArrayLength: number;
    maxObjectEntries: number;
    maxStringLength: number;
  };
  meta: {
    agentId?: string;
    agentState: AgentState;
    agentName: string;
    model: string | null;
    pluginCount: number;
    actionCount: number;
    providerCount: number;
    evaluatorCount: number;
    serviceTypeCount: number;
    serviceCount: number;
  };
  order: {
    plugins: RuntimeOrderItem[];
    actions: RuntimeOrderItem[];
    providers: RuntimeOrderItem[];
    evaluators: RuntimeOrderItem[];
    services: RuntimeServiceOrderItem[];
  };
  sections: {
    runtime: unknown;
    plugins: unknown;
    actions: unknown;
    providers: unknown;
    evaluators: unknown;
    services: unknown;
  };
}

export type TriggerType = "interval" | "once" | "cron";
export type TriggerWakeMode = "inject_now" | "next_autonomy_cycle";
export type TriggerLastStatus = "success" | "error" | "skipped";

export interface TriggerSummary {
  id: string;
  taskId: string;
  displayName: string;
  instructions: string;
  triggerType: TriggerType;
  enabled: boolean;
  wakeMode: TriggerWakeMode;
  createdBy: string;
  timezone?: string;
  intervalMs?: number;
  scheduledAtIso?: string;
  cronExpression?: string;
  maxRuns?: number;
  runCount: number;
  nextRunAtMs?: number;
  lastRunAtIso?: string;
  lastStatus?: TriggerLastStatus;
  lastError?: string;
  updatedAt?: number;
  updateInterval?: number;
}

export interface TriggerRunRecord {
  triggerRunId: string;
  triggerId: string;
  taskId: string;
  startedAt: number;
  finishedAt: number;
  status: TriggerLastStatus;
  error?: string;
  latencyMs: number;
  source: "scheduler" | "manual";
}

export interface TriggerHealthSnapshot {
  triggersEnabled: boolean;
  activeTriggers: number;
  disabledTriggers: number;
  totalExecutions: number;
  totalFailures: number;
  totalSkipped: number;
  lastExecutionAt?: number;
}

export interface CreateTriggerRequest {
  displayName?: string;
  instructions?: string;
  triggerType?: TriggerType;
  wakeMode?: TriggerWakeMode;
  enabled?: boolean;
  createdBy?: string;
  timezone?: string;
  intervalMs?: number;
  scheduledAtIso?: string;
  cronExpression?: string;
  maxRuns?: number;
}

export interface UpdateTriggerRequest {
  displayName?: string;
  instructions?: string;
  triggerType?: TriggerType;
  wakeMode?: TriggerWakeMode;
  enabled?: boolean;
  timezone?: string;
  intervalMs?: number;
  scheduledAtIso?: string;
  cronExpression?: string;
  maxRuns?: number;
}

export interface MessageExample {
  user: string;
  content: { text: string };
}

export interface ProviderOption {
  id: string;
  name: string;
  envKey: string | null;
  pluginName: string;
  keyPrefix: string | null;
  description: string;
}

export interface CloudProviderOption {
  id: string;
  name: string;
  description: string;
}

export interface ModelOption {
  id: string;
  name: string;
  provider: string;
  description: string;
}

export interface RpcProviderOption {
  id: string;
  name: string;
  description: string;
  envKey: string | null;
  requiresKey: boolean;
}

export interface InventoryProviderOption {
  id: string;
  name: string;
  description: string;
  rpcProviders: RpcProviderOption[];
}

export interface OpenRouterModelOption {
  id: string;
  name: string;
  description: string;
}

export interface OnboardingOptions {
  names: string[];
  styles: StylePreset[];
  providers: ProviderOption[];
  cloudProviders: CloudProviderOption[];
  models: {
    small: ModelOption[];
    large: ModelOption[];
  };
  /** Optional: model catalog from pi-ai (used when selecting provider "pi-ai"). */
  piModels?: ModelOption[];
  /** Default provider/model from pi settings.json, if available. */
  piDefaultModel?: string;
  openrouterModels?: OpenRouterModelOption[];
  inventoryProviders: InventoryProviderOption[];
  sharedStyleRules: string;
}

/** Configuration for a single messaging connector. */
export interface ConnectorConfig {
  enabled?: boolean;
  botToken?: string;
  token?: string;
  apiKey?: string;
  [key: string]: string | boolean | number | string[] | Record<string, unknown> | undefined;
}

export interface OnboardingData {
  name: string;
  theme: string;
  runMode: "local" | "cloud";
  /** Sandbox execution mode: "off" (rawdog), "light" (cloud), "standard" (local sandbox), "max". */
  sandboxMode?: "off" | "light" | "standard" | "max";
  bio: string[];
  systemPrompt: string;
  style?: {
    all: string[];
    chat: string[];
    post: string[];
  };
  adjectives?: string[];
  topics?: string[];
  postExamples?: string[];
  messageExamples?: MessageExample[][];
  // Cloud-specific
  cloudProvider?: string;
  smallModel?: string;
  largeModel?: string;
  // Local-specific
  provider?: string;
  providerApiKey?: string;
  openrouterModel?: string;
  /** Optional primary model spec (provider/model) for local providers (currently used by pi-ai). */
  primaryModel?: string;
  subscriptionProvider?: string;
  // Messaging channel setup
  channels?: Record<string, unknown>;
  // Inventory / wallet setup
  inventoryProviders?: Array<{
    chain: string;
    rpcProvider: string;
    rpcApiKey?: string;
  }>;
  // Connector setup (Telegram, Discord, etc.)
  connectors?: Record<string, ConnectorConfig>;
  telegramToken?: string;
  discordToken?: string;
  whatsappSessionPath?: string;
  twilioAccountSid?: string;
  twilioAuthToken?: string;
  twilioPhoneNumber?: string;
  blooioApiKey?: string;
  blooioPhoneNumber?: string;
}

export interface SandboxPlatformStatus {
  platform: string;
  arch?: string;
  dockerInstalled?: boolean;
  dockerAvailable?: boolean;
  dockerRunning?: boolean;
  appleContainerAvailable?: boolean;
  wsl2?: boolean;
  recommended?: string;
}

export interface SandboxStartResponse {
  success: boolean;
  message: string;
  waitMs?: number;
  error?: string;
}

export interface SecretInfo {
  key: string;
  description: string;
  category: string;
  sensitive: boolean;
  required: boolean;
  isSet: boolean;
  maskedValue: string | null;
  usedBy: Array<{ pluginId: string; pluginName: string; enabled: boolean }>;
}

export interface PluginParamDef {
  key: string;
  type: string;
  description: string;
  required: boolean;
  sensitive: boolean;
  default?: string;
  /** Predefined options for dropdown selection (e.g. model names). */
  options?: string[];
  currentValue: string | null;
  isSet: boolean;
}

export interface PluginInfo {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  configured: boolean;
  envKey: string | null;
  category: "ai-provider" | "connector" | "database" | "app" | "feature";
  source: "bundled" | "store";
  parameters: PluginParamDef[];
  validationErrors: Array<{ field: string; message: string }>;
  validationWarnings: Array<{ field: string; message: string }>;
  npmName?: string;
  version?: string;
  pluginDeps?: string[];
  /** Whether this plugin is actually loaded and running in the runtime. */
  isActive?: boolean;
  /** Error message when plugin is installed but failed to load. */
  loadError?: string;
  /** Server-provided UI hints for plugin configuration fields. */
  configUiHints?: Record<string, ConfigUiHint>;
  /** Optional icon URL or emoji for the plugin card header. */
  icon?: string | null;
}

export interface CorePluginEntry {
  npmName: string;
  id: string;
  name: string;
  isCore: boolean;
  loaded: boolean;
  enabled: boolean;
}

export interface CorePluginsResponse {
  core: CorePluginEntry[];
  optional: CorePluginEntry[];
}

export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  timestamp: number;
}

// Conversations
export interface Conversation {
  id: string;
  title: string;
  roomId: string;
  createdAt: string;
  updatedAt: string;
}

// ── A2UI Content Blocks (Agent-to-UI) ────────────────────────────────

/** A plain text content block. */
export interface TextBlock {
  type: "text";
  text: string;
}

/** An inline config form block — renders ConfigRenderer in chat. */
export interface ConfigFormBlock {
  type: "config-form";
  pluginId: string;
  pluginName?: string;
  schema: Record<string, unknown>;
  hints?: Record<string, unknown>;
  values?: Record<string, unknown>;
}

/** A UiSpec interactive UI block extracted from agent response. */
export interface UiSpecBlock {
  type: "ui-spec";
  spec: Record<string, unknown>;
  raw?: string;
}

/** Union of all content block types. */
export type ContentBlock = TextBlock | ConfigFormBlock | UiSpecBlock;

export interface ConfigSchemaResponse {
  schema: unknown;
  uiHints: Record<string, unknown>;
  version: string;
  generatedAt: string;
}

export interface ConversationMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  timestamp: number;
  /** Structured content blocks (A2UI). When present, `text` is the fallback. */
  blocks?: ContentBlock[];
  /** Source channel when forwarded from another channel (e.g. "autonomy"). */
  source?: string;
}

export type ConversationMode = "simple" | "power";

export interface SkillInfo {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  scanStatus?: "clean" | "warning" | "critical" | "blocked" | null;
}

export interface SkillScanReportSummary {
  scannedAt: string;
  status: "clean" | "warning" | "critical" | "blocked";
  summary: { scannedFiles: number; critical: number; warn: number; info: number };
  findings: Array<{ ruleId: string; severity: string; file: string; line: number; message: string; evidence: string }>;
  manifestFindings: Array<{ ruleId: string; severity: string; file: string; message: string }>;
  skillPath: string;
}

// Skill Catalog types

export interface CatalogSkillStats {
  comments: number;
  downloads: number;
  installsAllTime: number;
  installsCurrent: number;
  stars: number;
  versions: number;
}

export interface CatalogSkillVersion {
  version: string;
  createdAt: number;
  changelog: string;
}

export interface CatalogSkill {
  slug: string;
  displayName: string;
  summary: string | null;
  tags: Record<string, string>;
  stats: CatalogSkillStats;
  createdAt: number;
  updatedAt: number;
  latestVersion: CatalogSkillVersion | null;
  installed?: boolean;
}

export interface CatalogSearchResult {
  slug: string;
  displayName: string;
  summary: string | null;
  score: number;
  latestVersion: string | null;
  downloads: number;
  stars: number;
  installs: number;
}

export interface LogEntry {
  timestamp: number;
  level: string;
  message: string;
  source: string;
  tags: string[];
}

export interface LogsResponse {
  entries: LogEntry[];
  sources: string[];
  tags: string[];
}

export interface LogsFilter {
  source?: string;
  level?: string;
  tag?: string;
  since?: number;
}

export type StreamEventType = "agent_event" | "heartbeat_event" | "training_event";

export interface StreamEventEnvelope {
  type: StreamEventType;
  version: 1;
  eventId: string;
  ts: number;
  runId?: string;
  seq?: number;
  stream?: string;
  sessionKey?: string;
  agentId?: string;
  roomId?: string;
  payload: object;
}

// Fine-tuning / training
export type TrainingJobStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export interface TrainingStatus {
  runningJobs: number;
  queuedJobs: number;
  completedJobs: number;
  failedJobs: number;
  modelCount: number;
  datasetCount: number;
  runtimeAvailable: boolean;
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

export type TrainingEventKind =
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

export interface AgentEventsResponse {
  events: StreamEventEnvelope[];
  latestEventId: string | null;
  totalBuffered: number;
  replayed: boolean;
}

export interface ExtensionStatus {
  relayReachable: boolean;
  relayPort: number;
  extensionPath: string | null;
}

// Registry / Plugin Store types

export interface RegistryPlugin {
  name: string;
  gitRepo: string;
  gitUrl: string;
  description: string;
  homepage: string | null;
  topics: string[];
  stars: number;
  language: string;
  npm: {
    package: string;
    v0Version: string | null;
    v1Version: string | null;
    v2Version: string | null;
  };
  git: {
    v0Branch: string | null;
    v1Branch: string | null;
    v2Branch: string | null;
  };
  supports: { v0: boolean; v1: boolean; v2: boolean };
  installed: boolean;
  installedVersion: string | null;
  loaded: boolean;
  bundled: boolean;
}

export interface RegistrySearchResult {
  name: string;
  description: string;
  score: number;
  tags: string[];
  latestVersion: string | null;
  stars: number;
  supports: { v0: boolean; v1: boolean; v2: boolean };
  repository: string;
}

export interface InstalledPlugin {
  name: string;
  version: string;
  installPath: string;
  installedAt: string;
}

export interface PluginInstallResult {
  ok: boolean;
  plugin?: { name: string; version: string; installPath: string };
  requiresRestart?: boolean;
  message?: string;
  error?: string;
}

export interface WalletExportResult { evm: { privateKey: string; address: string | null } | null; solana: { privateKey: string; address: string | null } | null }

// Software Updates
export interface UpdateStatus {
  currentVersion: string;
  channel: ReleaseChannel;
  installMethod: string;
  updateAvailable: boolean;
  latestVersion: string | null;
  channels: Record<ReleaseChannel, string | null>;
  distTags: Record<ReleaseChannel, string>;
  lastCheckAt: string | null;
  error: string | null;
}

// Cloud
export interface CloudStatus { connected: boolean; enabled?: boolean; hasApiKey?: boolean; userId?: string; organizationId?: string; topUpUrl?: string; reason?: string }
export interface CloudCredits { connected: boolean; balance: number | null; low?: boolean; critical?: boolean; topUpUrl?: string }
export interface CloudLoginResponse { ok: boolean; sessionId: string; browserUrl: string }
export interface CloudLoginPollResponse { status: "pending" | "authenticated" | "expired" | "error"; keyPrefix?: string; error?: string }

// Skills Marketplace
export interface SkillMarketplaceResult {
  id: string;
  name: string;
  description: string;
  githubUrl: string;
  repository: string;
  path?: string;
  tags?: string[];
  score?: number;
  source?: string;
}

// Share Ingest
export interface ShareIngestPayload {
  title?: string;
  url?: string;
  text?: string;
  files?: Array<{ name: string }>;
}

export interface ShareIngestItem {
  suggestedPrompt: string;
  files: Array<{ name: string }>;
}

// Workbench
export interface WorkbenchTask {
  id: string;
  name: string;
  description: string;
  tags: string[];
  isCompleted: boolean;
  updatedAt?: number;
}

export interface WorkbenchTodo {
  id: string;
  name: string;
  description: string;
  priority: number | null;
  isUrgent: boolean;
  isCompleted: boolean;
  type: string;
}

export interface WorkbenchOverview {
  tasks: WorkbenchTask[];
  triggers: TriggerSummary[];
  todos: WorkbenchTodo[];
  autonomy?: {
    enabled: boolean;
    thinking: boolean;
    lastEventAt?: number | null;
  };
}

// MCP
export interface McpServerConfig {
  type: "stdio" | "streamable-http" | "sse";
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
  headers?: Record<string, string>;
}

export interface McpMarketplaceResult {
  name: string;
  description?: string;
  connectionType: string;
  npmPackage?: string;
  dockerImage?: string;
}

export interface McpRegistryServerDetail {
  packages?: Array<{
    environmentVariables: Array<{ name: string; default?: string; isRequired?: boolean }>;
    packageArguments?: Array<{ default?: string }>;
  }>;
  remotes?: Array<{
    type?: string;
    url: string;
    headers: Array<{ name: string; isRequired?: boolean }>;
  }>;
}

export interface McpServerStatus {
  name: string;
  connected: boolean;
  error?: string;
}

// Voice / TTS config
export type VoiceProvider = "elevenlabs" | "simple-voice" | "edge";
export type VoiceMode = "cloud" | "own-key";

export interface VoiceConfig {
  provider?: VoiceProvider;
  mode?: VoiceMode;
  elevenlabs?: {
    apiKey?: string;
    voiceId?: string;
    modelId?: string;
    stability?: number;
    similarityBoost?: number;
    speed?: number;
  };
  edge?: {
    voice?: string;
    lang?: string;
    rate?: string;
    pitch?: string;
    volume?: string;
  };
}

// Character
export interface CharacterData {
  name?: string;
  username?: string;
  bio?: string | string[];
  system?: string;
  adjectives?: string[];
  topics?: string[];
  style?: {
    all?: string[];
    chat?: string[];
    post?: string[];
  };
  messageExamples?: Array<{ examples: Array<{ name: string; content: { text: string } }> }>;
  postExamples?: string[];
}

// Registry plugin (non-app entries from the registry)
export interface RegistryPluginItem {
  name: string;
  description: string;
  stars: number;
  repository: string;
  topics: string[];
  latestVersion: string | null;
  supports: { v0: boolean; v1: boolean; v2: boolean };
  npm: { package: string; v0Version: string | null; v1Version: string | null; v2Version: string | null };
}

// App types
export interface AppViewerAuthMessage {
  type: string;
  authToken?: string;
  sessionToken?: string;
  agentId?: string;
}

export interface AppViewerConfig {
  url: string;
  embedParams?: Record<string, string>;
  postMessageAuth?: boolean;
  sandbox?: string;
  authMessage?: AppViewerAuthMessage;
}
export interface RegistryAppInfo {
  name: string;
  displayName: string;
  description: string;
  category: string;
  launchType: string;
  launchUrl: string | null;
  icon: string | null;
  capabilities: string[];
  stars: number;
  repository: string;
  latestVersion: string | null;
  supports: { v0: boolean; v1: boolean; v2: boolean };
  npm: { package: string; v0Version: string | null; v1Version: string | null; v2Version: string | null };
  viewer?: AppViewerConfig;
}
export interface InstalledAppInfo { name: string; displayName: string; version: string; installPath: string; installedAt: string; isRunning: boolean }
export interface AppLaunchResult {
  pluginInstalled: boolean;
  needsRestart: boolean;
  displayName: string;
  launchType: string;
  launchUrl: string | null;
  viewer: AppViewerConfig | null;
}
export interface AppStopResult {
  success: boolean;
  appName: string;
  stoppedAt: string;
  pluginUninstalled: boolean;
  needsRestart: boolean;
  stopScope: "plugin-uninstalled" | "viewer-session" | "no-op";
  message: string;
}

export type HyperscapeScriptedRole =
  | "combat"
  | "woodcutting"
  | "fishing"
  | "mining"
  | "balanced";

export type HyperscapeEmbeddedAgentControlAction =
  | "start"
  | "stop"
  | "pause"
  | "resume";

export type HyperscapeJsonValue =
  | string
  | number
  | boolean
  | null
  | HyperscapeJsonValue[]
  | { [key: string]: HyperscapeJsonValue };

export type HyperscapePosition =
  | [number, number, number]
  | {
      x: number;
      y: number;
      z: number;
    };

export interface HyperscapeEmbeddedAgent {
  agentId: string;
  characterId: string;
  accountId: string;
  name: string;
  scriptedRole: HyperscapeScriptedRole | null;
  state: string;
  entityId: string | null;
  position: HyperscapePosition | null;
  health: number | null;
  maxHealth: number | null;
  startedAt: number | null;
  lastActivity: number | null;
  error: string | null;
}

export interface HyperscapeEmbeddedAgentsResponse {
  success: boolean;
  agents: HyperscapeEmbeddedAgent[];
  count: number;
  error?: string;
}

export interface HyperscapeActionResponse {
  success: boolean;
  message?: string;
  error?: string;
}

export interface HyperscapeEmbeddedAgentMutationResponse
  extends HyperscapeActionResponse {
  agent?: HyperscapeEmbeddedAgent | null;
}

export interface HyperscapeAvailableGoal {
  id: string;
  type: string;
  description: string;
  priority: number;
}

export interface HyperscapeGoalState {
  type?: string;
  description?: string;
  progress?: number;
  target?: number;
  progressPercent?: number;
  elapsedMs?: number;
  startedAt?: number;
  locked?: boolean;
  lockedBy?: string;
}

export interface HyperscapeAgentGoalResponse {
  success: boolean;
  goal: HyperscapeGoalState | null;
  availableGoals?: HyperscapeAvailableGoal[];
  goalsPaused?: boolean;
  message?: string;
  error?: string;
}

export interface HyperscapeQuickCommand {
  id: string;
  label: string;
  command: string;
  icon: string;
  available: boolean;
  reason?: string;
}

export interface HyperscapeNearbyLocation {
  id: string;
  name: string;
  type: string;
  distance: number;
}

export interface HyperscapeInventoryItem {
  id: string;
  name: string;
  slot: number;
  quantity: number;
  canEquip: boolean;
  canUse: boolean;
  canDrop: boolean;
}

export interface HyperscapeQuickActionsResponse {
  success: boolean;
  nearbyLocations: HyperscapeNearbyLocation[];
  availableGoals: HyperscapeAvailableGoal[];
  quickCommands: HyperscapeQuickCommand[];
  inventory: HyperscapeInventoryItem[];
  playerPosition: [number, number, number] | null;
  message?: string;
  error?: string;
}

// Trajectories
export interface TrajectoryRecord {
  id: string;
  agentId: string;
  roomId: string | null;
  entityId: string | null;
  conversationId: string | null;
  source: string;
  status: "active" | "completed" | "error";
  startTime: number;
  endTime: number | null;
  durationMs: number | null;
  llmCallCount: number;
  providerAccessCount: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface TrajectoryLlmCall {
  id: string;
  trajectoryId: string;
  stepId: string;
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
  timestamp: number;
  createdAt: string;
}

export interface TrajectoryProviderAccess {
  id: string;
  trajectoryId: string;
  stepId: string;
  providerName: string;
  purpose: string;
  data: Record<string, unknown>;
  query?: Record<string, unknown>;
  timestamp: number;
  createdAt: string;
}

export interface TrajectoryListOptions {
  limit?: number;
  offset?: number;
  source?: string;
  status?: "active" | "completed" | "error";
  startDate?: string;
  endDate?: string;
  search?: string;
}

export interface TrajectoryListResult {
  trajectories: TrajectoryRecord[];
  total: number;
  offset: number;
  limit: number;
}

export interface TrajectoryDetailResult {
  trajectory: TrajectoryRecord;
  llmCalls: TrajectoryLlmCall[];
  providerAccesses: TrajectoryProviderAccess[];
}

export interface TrajectoryStats {
  totalTrajectories: number;
  totalLlmCalls: number;
  totalProviderAccesses: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  averageDurationMs: number;
  bySource: Record<string, number>;
  byModel: Record<string, number>;
}

export interface TrajectoryConfig {
  enabled: boolean;
}

export type TrajectoryExportFormat = "json" | "csv";

export interface TrajectoryExportOptions {
  format: TrajectoryExportFormat;
  includePrompts?: boolean;
  trajectoryIds?: string[];
  startDate?: string;
  endDate?: string;
}

// Knowledge types
export interface KnowledgeStats {
  documentCount: number;
  fragmentCount: number;
  agentId: string;
}

export interface KnowledgeDocument {
  id: string;
  filename: string;
  contentType: string;
  fileSize: number;
  createdAt: number;
  fragmentCount: number;
  source: string;
  url?: string;
  content?: { text?: string };
}

export interface KnowledgeDocumentDetail extends KnowledgeDocument {
  content: { text?: string };
}

export interface KnowledgeDocumentsResponse {
  documents: KnowledgeDocument[];
  total: number;
  limit: number;
  offset: number;
}

export interface KnowledgeFragment {
  id: string;
  text: string;
  position?: number;
  createdAt: number;
}

export interface KnowledgeFragmentsResponse {
  documentId: string;
  fragments: KnowledgeFragment[];
  count: number;
}

export interface KnowledgeSearchResult {
  id: string;
  text: string;
  similarity: number;
  documentId?: string;
  documentTitle?: string;
  position?: number;
}

export interface KnowledgeSearchResponse {
  query: string;
  threshold: number;
  results: KnowledgeSearchResult[];
  count: number;
}

export interface KnowledgeUploadResult {
  ok: boolean;
  documentId: string;
  fragmentCount: number;
  filename?: string;
  contentType?: string;
  isYouTubeTranscript?: boolean;
}

// WebSocket

export type WsEventHandler = (data: Record<string, unknown>) => void;

// ---------------------------------------------------------------------------
// ERC-8004 Registry & Drop types
// ---------------------------------------------------------------------------

export interface RegistryStatus {
  registered: boolean;
  tokenId: number;
  agentName: string;
  agentEndpoint: string;
  capabilitiesHash: string;
  isActive: boolean;
  tokenURI: string;
  walletAddress: string;
  totalAgents: number;
  configured: boolean;
}

export interface RegistrationResult {
  tokenId: number;
  txHash: string;
}

export interface RegistryConfig {
  configured: boolean;
  chainId: number;
  registryAddress: string | null;
  collectionAddress: string | null;
  explorerUrl: string;
}

export interface WhitelistStatus {
  eligible: boolean;
  twitterVerified: boolean;
  ogCode: string | null;
  walletAddress: string;
}

export interface VerificationMessageResponse {
  message: string;
  walletAddress: string;
}

// ---------------------------------------------------------------------------
// System Permissions
// ---------------------------------------------------------------------------

declare global {
  interface Window {
    __MILAIDY_API_BASE__?: string;
    __MILAIDY_API_TOKEN__?: string;
  }
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

const GENERIC_NO_RESPONSE_TEXT =
  "Sorry, I couldn't generate a response right now. Please try again.";
const AGENT_TRANSFER_MIN_PASSWORD_LENGTH = 4;

export class MilaidyClient {
  private _baseUrl: string;
  private _explicitBase: boolean;
  private _token: string | null;
  private ws: WebSocket | null = null;
  private wsHandlers = new Map<string, Set<WsEventHandler>>();
  private wsSendQueue: string[] = [];
  private readonly wsSendQueueLimit = 32;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private backoffMs = 500;

  private static resolveElectronLocalFallbackBase(): string {
    if (typeof window === "undefined") return "";
    const proto = window.location.protocol;
    // In capacitor-electron mode the main process injects the live API base
    // once the embedded agent has bound a port. Avoid eager localhost probes
    // to prevent noisy ERR_CONNECTION_REFUSED logs during startup.
    if (proto === "capacitor-electron:") return "";
    // Legacy Electron file:// mode fallback.
    if (proto === "file:" && /\bElectron\b/i.test(window.navigator.userAgent)) {
      return "http://localhost:2138";
    }
    return "";
  }

  constructor(baseUrl?: string, token?: string) {
    this._explicitBase = baseUrl != null;
    const stored =
      typeof window !== "undefined"
        ? window.sessionStorage.getItem("milaidy_api_token")
        : null;
    this._token = token?.trim() || stored || null;
    // Priority: explicit arg > Capacitor/Electron injected global > same origin (Vite proxy)
    const injectedBase =
      typeof window !== "undefined" ? window.__MILAIDY_API_BASE__ : undefined;
    this._baseUrl =
      baseUrl ??
      (injectedBase ?? MilaidyClient.resolveElectronLocalFallbackBase());
  }

  /**
   * Resolve the API base URL lazily.
   * In Electron the main process injects window.__MILAIDY_API_BASE__ after the
   * page loads (once the agent runtime starts). Re-checking on every call
   * ensures we pick up the injected value even if it wasn't set at construction.
   */
  private get baseUrl(): string {
    if (!this._explicitBase && typeof window !== "undefined") {
      const injected = window.__MILAIDY_API_BASE__;
      // In Electron the API base can be injected after initial render. Always
      // prefer the injected value when present so the client can switch away
      // from the localhost fallback once the main process publishes the real
      // endpoint.
      if (injected && injected !== this._baseUrl) {
        this._baseUrl = injected;
      } else if (!this._baseUrl) {
        this._baseUrl = MilaidyClient.resolveElectronLocalFallbackBase();
      }
    }
    return this._baseUrl;
  }

  private get apiToken(): string | null {
    if (this._token) return this._token;
    if (typeof window === "undefined") return null;
    const injected = window.__MILAIDY_API_TOKEN__;
    if (typeof injected === "string" && injected.trim()) return injected.trim();
    return null;
  }

  hasToken(): boolean {
    return Boolean(this.apiToken);
  }

  setToken(token: string | null): void {
    this._token = token?.trim() || null;
    if (typeof window !== "undefined") {
      if (this._token) {
        window.sessionStorage.setItem("milaidy_api_token", this._token);
      } else {
        window.sessionStorage.removeItem("milaidy_api_token");
      }
    }
  }

  /** True when we have a usable HTTP(S) API endpoint. */
  get apiAvailable(): boolean {
    if (this.baseUrl) return true;
    if (typeof window !== "undefined") {
      const proto = window.location.protocol;
      return proto === "http:" || proto === "https:";
    }
    return false;
  }

  // --- REST API ---

  private async fetch<T>(path: string, init?: RequestInit): Promise<T> {
    if (!this.apiAvailable) {
      throw new Error("API not available (no HTTP origin)");
    }
    const makeRequest = (token: string | null) => fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init?.headers,
      },
    });

    const token = this.apiToken;
    let res = await makeRequest(token);
    if (res.status === 401 && !token) {
      const retryToken = this.apiToken;
      if (retryToken) {
        res = await makeRequest(retryToken);
      }
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText })) as Record<string, string>;
      const err = new Error(body.error ?? `HTTP ${res.status}`);
      (err as Error & { status?: number }).status = res.status;
      throw err;
    }
    return res.json() as Promise<T>;
  }

  async getStatus(): Promise<AgentStatus> {
    return this.fetch("/api/status");
  }

  async getRuntimeSnapshot(opts?: {
    depth?: number;
    maxArrayLength?: number;
    maxObjectEntries?: number;
    maxStringLength?: number;
  }): Promise<RuntimeDebugSnapshot> {
    const params = new URLSearchParams();
    if (typeof opts?.depth === "number") params.set("depth", String(opts.depth));
    if (typeof opts?.maxArrayLength === "number") {
      params.set("maxArrayLength", String(opts.maxArrayLength));
    }
    if (typeof opts?.maxObjectEntries === "number") {
      params.set("maxObjectEntries", String(opts.maxObjectEntries));
    }
    if (typeof opts?.maxStringLength === "number") {
      params.set("maxStringLength", String(opts.maxStringLength));
    }
    const qs = params.toString();
    return this.fetch(`/api/runtime${qs ? `?${qs}` : ""}`);
  }

  async playEmote(emoteId: string): Promise<{ ok: boolean }> {
    return this.fetch("/api/emote", {
      method: "POST",
      body: JSON.stringify({ emoteId }),
    });
  }

  async runTerminalCommand(command: string): Promise<{ ok: boolean }> {
    return this.fetch("/api/terminal/run", {
      method: "POST",
      body: JSON.stringify({ command }),
    });
  }

  async getOnboardingStatus(): Promise<{ complete: boolean }> {
    return this.fetch("/api/onboarding/status");
  }

  async getAuthStatus(): Promise<{ required: boolean; pairingEnabled: boolean; expiresAt: number | null }> {
    try {
      return await this.fetch("/api/auth/status");
    } catch (err: unknown) {
      const status = (err as Error & { status?: number })?.status;
      if (status === 401) {
        // Server requires auth
        return { required: true, pairingEnabled: false, expiresAt: null };
      }
      if (status === 404) {
        // npm-installed server without auth routes — no auth required
        return { required: false, pairingEnabled: false, expiresAt: null };
      }
      // Other errors (500, network) — re-throw so caller can handle
      throw err;
    }
  }

  async pair(code: string): Promise<{ token: string }> {
    const res = await this.fetch<{ token: string }>("/api/auth/pair", {
      method: "POST",
      body: JSON.stringify({ code }),
    });
    return res;
  }

  async getOnboardingOptions(): Promise<OnboardingOptions> {
    return this.fetch("/api/onboarding/options");
  }

  async submitOnboarding(data: OnboardingData): Promise<void> {
    await this.fetch("/api/onboarding", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async startAnthropicLogin(): Promise<{ authUrl: string }> {
    return this.fetch("/api/subscription/anthropic/start", { method: "POST" });
  }

  async exchangeAnthropicCode(code: string): Promise<{
    success: boolean;
    expiresAt?: string;
    error?: string;
  }> {
    return this.fetch("/api/subscription/anthropic/exchange", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
  }

  async submitAnthropicSetupToken(token: string): Promise<{ success: boolean }> {
    return this.fetch("/api/subscription/anthropic/setup-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
  }

  async startOpenAILogin(): Promise<{ authUrl: string; state: string; instructions: string }> {
    return this.fetch("/api/subscription/openai/start", { method: "POST" });
  }

  async exchangeOpenAICode(code: string): Promise<{
    success: boolean;
    expiresAt?: string;
    accountId?: string;
    error?: string;
  }> {
    return this.fetch("/api/subscription/openai/exchange", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
  }

  async getSandboxPlatform(): Promise<SandboxPlatformStatus> {
    return this.fetch("/api/sandbox/platform");
  }

  async startDocker(): Promise<SandboxStartResponse> {
    return this.fetch("/api/sandbox/docker/start", { method: "POST" });
  }

  async startAgent(): Promise<AgentStatus> {
    const res = await this.fetch<{ status: AgentStatus }>("/api/agent/start", { method: "POST" });
    return res.status;
  }

  async stopAgent(): Promise<AgentStatus> {
    const res = await this.fetch<{ status: AgentStatus }>("/api/agent/stop", { method: "POST" });
    return res.status;
  }

  async pauseAgent(): Promise<AgentStatus> {
    const res = await this.fetch<{ status: AgentStatus }>("/api/agent/pause", { method: "POST" });
    return res.status;
  }

  async resumeAgent(): Promise<AgentStatus> {
    const res = await this.fetch<{ status: AgentStatus }>("/api/agent/resume", { method: "POST" });
    return res.status;
  }

  async restartAgent(): Promise<AgentStatus> {
    const res = await this.fetch<{ status: AgentStatus }>("/api/agent/restart", { method: "POST" });
    return res.status;
  }

  /**
   * Restart the agent if possible, or wait for an in-progress restart to finish.
   * Polls status until the agent state is "running".
   */
  async restartAndWait(maxWaitMs = 30000): Promise<AgentStatus> {
    // Try triggering a restart; 409 means one is already in progress
    try {
      await this.restartAgent();
    } catch {
      // Already restarting — that's fine, we'll poll
    }
    // Poll until running
    const start = Date.now();
    const interval = 1000;
    while (Date.now() - start < maxWaitMs) {
      await new Promise((r) => setTimeout(r, interval));
      try {
        const status = await this.getStatus();
        if (status.state === "running") return status;
      } catch {
        // Server may be briefly unavailable during restart
      }
    }
    // Return whatever we get after timeout
    return this.getStatus();
  }

  async resetAgent(): Promise<void> {
    await this.fetch("/api/agent/reset", { method: "POST" });
  }

  async getConfig(): Promise<Record<string, unknown>> {
    return this.fetch("/api/config");
  }

  async getConfigSchema(): Promise<ConfigSchemaResponse> {
    return this.fetch("/api/config/schema");
  }

  async updateConfig(patch: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this.fetch("/api/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
  }

  // ── Connectors ──────────────────────────────────────────────────────

  async getConnectors(): Promise<{ connectors: Record<string, ConnectorConfig> }> {
    return this.fetch("/api/connectors");
  }

  async saveConnector(name: string, config: ConnectorConfig): Promise<{ connectors: Record<string, ConnectorConfig> }> {
    return this.fetch("/api/connectors", {
      method: "POST",
      body: JSON.stringify({ name, config }),
    });
  }

  async deleteConnector(name: string): Promise<{ connectors: Record<string, ConnectorConfig> }> {
    return this.fetch(`/api/connectors/${encodeURIComponent(name)}`, {
      method: "DELETE",
    });
  }

  async getTriggers(): Promise<{ triggers: TriggerSummary[] }> {
    return this.fetch("/api/triggers");
  }

  async getTrigger(id: string): Promise<{ trigger: TriggerSummary }> {
    return this.fetch(`/api/triggers/${encodeURIComponent(id)}`);
  }

  async createTrigger(
    request: CreateTriggerRequest,
  ): Promise<{ trigger: TriggerSummary }> {
    return this.fetch("/api/triggers", {
      method: "POST",
      body: JSON.stringify(request),
    });
  }

  async updateTrigger(
    id: string,
    request: UpdateTriggerRequest,
  ): Promise<{ trigger: TriggerSummary }> {
    return this.fetch(`/api/triggers/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(request),
    });
  }

  async deleteTrigger(id: string): Promise<{ ok: boolean }> {
    return this.fetch(`/api/triggers/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  }

  async runTriggerNow(
    id: string,
  ): Promise<{
    ok: boolean;
    result: {
      status: TriggerLastStatus;
      error?: string;
      taskDeleted: boolean;
    };
    trigger?: TriggerSummary;
  }> {
    return this.fetch(`/api/triggers/${encodeURIComponent(id)}/execute`, {
      method: "POST",
    });
  }

  async getTriggerRuns(id: string): Promise<{ runs: TriggerRunRecord[] }> {
    return this.fetch(`/api/triggers/${encodeURIComponent(id)}/runs`);
  }

  async getTriggerHealth(): Promise<TriggerHealthSnapshot> {
    return this.fetch("/api/triggers/health");
  }

  // Fine-tuning / training
  async getTrainingStatus(): Promise<TrainingStatus> {
    return this.fetch("/api/training/status");
  }

  async listTrainingTrajectories(opts?: {
    limit?: number;
    offset?: number;
  }): Promise<TrainingTrajectoryList> {
    const params = new URLSearchParams();
    if (typeof opts?.limit === "number") params.set("limit", String(opts.limit));
    if (typeof opts?.offset === "number")
      params.set("offset", String(opts.offset));
    const qs = params.toString();
    return this.fetch(`/api/training/trajectories${qs ? `?${qs}` : ""}`);
  }

  async getTrainingTrajectory(
    trajectoryId: string,
  ): Promise<{ trajectory: TrainingTrajectoryDetail }> {
    return this.fetch(
      `/api/training/trajectories/${encodeURIComponent(trajectoryId)}`,
    );
  }

  async listTrainingDatasets(): Promise<{ datasets: TrainingDatasetRecord[] }> {
    return this.fetch("/api/training/datasets");
  }

  async buildTrainingDataset(options?: {
    limit?: number;
    minLlmCallsPerTrajectory?: number;
  }): Promise<{ dataset: TrainingDatasetRecord }> {
    return this.fetch("/api/training/datasets/build", {
      method: "POST",
      body: JSON.stringify(options ?? {}),
    });
  }

  async listTrainingJobs(): Promise<{ jobs: TrainingJobRecord[] }> {
    return this.fetch("/api/training/jobs");
  }

  async startTrainingJob(
    options?: StartTrainingOptions,
  ): Promise<{ job: TrainingJobRecord }> {
    return this.fetch("/api/training/jobs", {
      method: "POST",
      body: JSON.stringify(options ?? {}),
    });
  }

  async getTrainingJob(jobId: string): Promise<{ job: TrainingJobRecord }> {
    return this.fetch(`/api/training/jobs/${encodeURIComponent(jobId)}`);
  }

  async cancelTrainingJob(jobId: string): Promise<{ job: TrainingJobRecord }> {
    return this.fetch(`/api/training/jobs/${encodeURIComponent(jobId)}/cancel`, {
      method: "POST",
    });
  }

  async listTrainingModels(): Promise<{ models: TrainingModelRecord[] }> {
    return this.fetch("/api/training/models");
  }

  async importTrainingModelToOllama(
    modelId: string,
    options?: {
      modelName?: string;
      baseModel?: string;
      ollamaUrl?: string;
    },
  ): Promise<{ model: TrainingModelRecord }> {
    return this.fetch(
      `/api/training/models/${encodeURIComponent(modelId)}/import-ollama`,
      {
        method: "POST",
        body: JSON.stringify(options ?? {}),
      },
    );
  }

  async activateTrainingModel(
    modelId: string,
    providerModel?: string,
  ): Promise<{
    modelId: string;
    providerModel: string;
    needsRestart: boolean;
  }> {
    return this.fetch(`/api/training/models/${encodeURIComponent(modelId)}/activate`, {
      method: "POST",
      body: JSON.stringify({ providerModel }),
    });
  }

  async benchmarkTrainingModel(modelId: string): Promise<{
    status: "passed" | "failed";
    output: string;
  }> {
    return this.fetch(
      `/api/training/models/${encodeURIComponent(modelId)}/benchmark`,
      {
        method: "POST",
      },
    );
  }

  async getPlugins(): Promise<{ plugins: PluginInfo[] }> {
    return this.fetch("/api/plugins");
  }

  async fetchModels(provider: string, refresh = true): Promise<{ provider: string; models: unknown[] }> {
    const params = new URLSearchParams({ provider });
    if (refresh) params.set("refresh", "true");
    return this.fetch(`/api/models?${params.toString()}`);
  }

  async getCorePlugins(): Promise<CorePluginsResponse> {
    return this.fetch("/api/plugins/core");
  }

  async toggleCorePlugin(npmName: string, enabled: boolean): Promise<{ ok: boolean; restarting?: boolean; message?: string }> {
    return this.fetch("/api/plugins/core/toggle", {
      method: "POST",
      body: JSON.stringify({ npmName, enabled }),
    });
  }

  async updatePlugin(id: string, config: Record<string, unknown>): Promise<{ ok: boolean; restarting?: boolean }> {
    return this.fetch(`/api/plugins/${id}`, {
      method: "PUT",
      body: JSON.stringify(config),
    });
  }

  async getSecrets(): Promise<{ secrets: SecretInfo[] }> {
    return this.fetch("/api/secrets");
  }

  async updateSecrets(secrets: Record<string, string>): Promise<{ ok: boolean; updated: string[] }> {
    return this.fetch("/api/secrets", {
      method: "PUT",
      body: JSON.stringify({ secrets }),
    });
  }

  async testPluginConnection(id: string): Promise<{ success: boolean; pluginId: string; message?: string; error?: string; durationMs: number }> {
    return this.fetch(`/api/plugins/${encodeURIComponent(id)}/test`, {
      method: "POST",
    });
  }

  async restart(): Promise<{ ok: boolean }> {
    return this.fetch("/api/restart", { method: "POST" });
  }

  async getSkills(): Promise<{ skills: SkillInfo[] }> {
    return this.fetch("/api/skills");
  }

  async refreshSkills(): Promise<{ ok: boolean; skills: SkillInfo[] }> {
    return this.fetch("/api/skills/refresh", { method: "POST" });
  }

  async getLogs(filter?: LogsFilter): Promise<LogsResponse> {
    const params = new URLSearchParams();
    if (filter?.source) params.set("source", filter.source);
    if (filter?.level) params.set("level", filter.level);
    if (filter?.tag) params.set("tag", filter.tag);
    if (filter?.since) params.set("since", String(filter.since));
    const qs = params.toString();
    return this.fetch(`/api/logs${qs ? `?${qs}` : ""}`);
  }

  async getAgentEvents(opts?: {
    afterEventId?: string;
    limit?: number;
  }): Promise<AgentEventsResponse> {
    const params = new URLSearchParams();
    if (opts?.afterEventId) params.set("after", opts.afterEventId);
    if (typeof opts?.limit === "number") params.set("limit", String(opts.limit));
    const qs = params.toString();
    return this.fetch(`/api/agent/events${qs ? `?${qs}` : ""}`);
  }

  async getExtensionStatus(): Promise<ExtensionStatus> {
    return this.fetch("/api/extension/status");
  }

  // Skill Catalog

  async getSkillCatalog(opts?: { page?: number; perPage?: number; sort?: string }): Promise<{
    total: number;
    page: number;
    perPage: number;
    totalPages: number;
    skills: CatalogSkill[];
  }> {
    const params = new URLSearchParams();
    if (opts?.page) params.set("page", String(opts.page));
    if (opts?.perPage) params.set("perPage", String(opts.perPage));
    if (opts?.sort) params.set("sort", opts.sort);
    const qs = params.toString();
    return this.fetch(`/api/skills/catalog${qs ? `?${qs}` : ""}`);
  }

  async searchSkillCatalog(query: string, limit = 30): Promise<{
    query: string;
    count: number;
    results: CatalogSearchResult[];
  }> {
    return this.fetch(`/api/skills/catalog/search?q=${encodeURIComponent(query)}&limit=${limit}`);
  }

  async getSkillCatalogDetail(slug: string): Promise<{ skill: CatalogSkill }> {
    return this.fetch(`/api/skills/catalog/${encodeURIComponent(slug)}`);
  }

  async refreshSkillCatalog(): Promise<{ ok: boolean; count: number }> {
    return this.fetch("/api/skills/catalog/refresh", { method: "POST" });
  }

  async installCatalogSkill(slug: string, version?: string): Promise<{
    ok: boolean;
    slug: string;
    message: string;
    alreadyInstalled?: boolean;
  }> {
    return this.fetch("/api/skills/catalog/install", {
      method: "POST",
      body: JSON.stringify({ slug, version }),
    });
  }

  async uninstallCatalogSkill(slug: string): Promise<{
    ok: boolean;
    slug: string;
    message: string;
  }> {
    return this.fetch("/api/skills/catalog/uninstall", {
      method: "POST",
      body: JSON.stringify({ slug }),
    });
  }

  // Registry / Plugin Store

  async getRegistryPlugins(): Promise<{ count: number; plugins: RegistryPlugin[] }> {
    return this.fetch("/api/registry/plugins");
  }

  async getRegistryPluginInfo(name: string): Promise<{ plugin: RegistryPlugin }> {
    return this.fetch(`/api/registry/plugins/${encodeURIComponent(name)}`);
  }

  async getInstalledPlugins(): Promise<{ count: number; plugins: InstalledPlugin[] }> {
    return this.fetch("/api/plugins/installed");
  }

  async installRegistryPlugin(name: string, autoRestart = true): Promise<PluginInstallResult> {
    return this.fetch("/api/plugins/install", {
      method: "POST",
      body: JSON.stringify({ name, autoRestart }),
    });
  }

  async uninstallRegistryPlugin(name: string, autoRestart = true): Promise<{ ok: boolean; pluginName: string; message: string; error?: string }> {
    return this.fetch("/api/plugins/uninstall", {
      method: "POST",
      body: JSON.stringify({ name, autoRestart }),
    });
  }

  // Agent Export / Import

  /**
   * Export the agent as a password-encrypted .eliza-agent file.
   * Returns the raw Response so the caller can stream the binary body.
   */
  async exportAgent(password: string, includeLogs = false): Promise<Response> {
    if (password.length < AGENT_TRANSFER_MIN_PASSWORD_LENGTH) {
      throw new Error(
        `Password must be at least ${AGENT_TRANSFER_MIN_PASSWORD_LENGTH} characters.`,
      );
    }
    if (!this.apiAvailable) {
      throw new Error("API not available (no HTTP origin)");
    }
    const token = this.apiToken;
    const res = await fetch(`${this.baseUrl}/api/agent/export`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ password, includeLogs }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText })) as Record<string, string>;
      const err = new Error(body.error ?? `HTTP ${res.status}`);
      (err as Error & { status?: number }).status = res.status;
      throw err;
    }
    return res;
  }

  /** Get an estimate of the export size. */
  async getExportEstimate(): Promise<{
    estimatedBytes: number;
    memoriesCount: number;
    entitiesCount: number;
    roomsCount: number;
    worldsCount: number;
    tasksCount: number;
  }> {
    return this.fetch("/api/agent/export/estimate");
  }

  /**
   * Import an agent from a password-encrypted .eliza-agent file.
   * Encodes the password and file into a binary envelope.
   */
  async importAgent(
    password: string,
    fileBuffer: ArrayBuffer,
  ): Promise<{
    success: boolean;
    agentId: string;
    agentName: string;
    counts: Record<string, number>;
  }> {
    if (password.length < AGENT_TRANSFER_MIN_PASSWORD_LENGTH) {
      throw new Error(
        `Password must be at least ${AGENT_TRANSFER_MIN_PASSWORD_LENGTH} characters.`,
      );
    }
    if (!this.apiAvailable) {
      throw new Error("API not available (no HTTP origin)");
    }
    const passwordBytes = new TextEncoder().encode(password);
    const envelope = new Uint8Array(4 + passwordBytes.length + fileBuffer.byteLength);
    const view = new DataView(envelope.buffer);
    view.setUint32(0, passwordBytes.length, false);
    envelope.set(passwordBytes, 4);
    envelope.set(new Uint8Array(fileBuffer), 4 + passwordBytes.length);

    const token = this.apiToken;
    const res = await fetch(`${this.baseUrl}/api/agent/import`, {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: envelope,
    });

    const data = await res.json() as {
      error?: string;
      success?: boolean;
      agentId?: string;
      agentName?: string;
      counts?: Record<string, number>;
    };
    if (!res.ok || !data.success) {
      throw new Error(data.error ?? `Import failed (${res.status})`);
    }
    return data as {
      success: boolean;
      agentId: string;
      agentName: string;
      counts: Record<string, number>;
    };
  }

  // Character

  async getCharacter(): Promise<{ character: CharacterData; agentName: string }> {
    return this.fetch("/api/character");
  }

  async getRandomName(): Promise<{ name: string }> {
    return this.fetch("/api/character/random-name");
  }

  async generateCharacterField(
    field: string,
    context: { name?: string; system?: string; bio?: string; style?: { all?: string[]; chat?: string[]; post?: string[] }; postExamples?: string[] },
    mode?: "append" | "replace",
  ): Promise<{ generated: string }> {
    return this.fetch("/api/character/generate", {
      method: "POST",
      body: JSON.stringify({ field, context, mode }),
    });
  }

  async updateCharacter(character: CharacterData): Promise<{ ok: boolean; character: CharacterData; agentName: string }> {
    return this.fetch("/api/character", {
      method: "PUT",
      body: JSON.stringify(character),
    });
  }

  // Wallet

  async getWalletAddresses(): Promise<WalletAddresses> { return this.fetch("/api/wallet/addresses"); }
  async getWalletBalances(): Promise<WalletBalancesResponse> { return this.fetch("/api/wallet/balances"); }
  async getWalletNfts(): Promise<WalletNftsResponse> { return this.fetch("/api/wallet/nfts"); }
  async getWalletConfig(): Promise<WalletConfigStatus> { return this.fetch("/api/wallet/config"); }
  async updateWalletConfig(config: Record<string, string>): Promise<{ ok: boolean }> { return this.fetch("/api/wallet/config", { method: "PUT", body: JSON.stringify(config) }); }
  async exportWalletKeys(exportToken: string): Promise<WalletExportResult> {
    return this.fetch("/api/wallet/export", {
      method: "POST",
      body: JSON.stringify({ confirm: true, exportToken }),
    });
  }

  // Software Updates
  async getUpdateStatus(force = false): Promise<UpdateStatus> {
    return this.fetch(`/api/update/status${force ? "?force=true" : ""}`);
  }
  async setUpdateChannel(channel: "stable" | "beta" | "nightly"): Promise<{ channel: string }> {
    return this.fetch("/api/update/channel", { method: "PUT", body: JSON.stringify({ channel }) });
  }

  // Cloud
  async getCloudStatus(): Promise<CloudStatus> { return this.fetch("/api/cloud/status"); }
  async getCloudCredits(): Promise<CloudCredits> { return this.fetch("/api/cloud/credits"); }
  async cloudLogin(): Promise<CloudLoginResponse> { return this.fetch("/api/cloud/login", { method: "POST" }); }
  async cloudLoginPoll(sessionId: string): Promise<CloudLoginPollResponse> { return this.fetch(`/api/cloud/login/status?sessionId=${encodeURIComponent(sessionId)}`); }
  async cloudDisconnect(): Promise<{ ok: boolean }> { return this.fetch("/api/cloud/disconnect", { method: "POST" }); }

  // Apps & Registry
  async listApps(): Promise<RegistryAppInfo[]> { return this.fetch("/api/apps"); }
  async searchApps(query: string): Promise<RegistryAppInfo[]> { return this.fetch(`/api/apps/search?q=${encodeURIComponent(query)}`); }
  async listInstalledApps(): Promise<InstalledAppInfo[]> { return this.fetch("/api/apps/installed"); }
  async stopApp(name: string): Promise<AppStopResult> {
    return this.fetch("/api/apps/stop", { method: "POST", body: JSON.stringify({ name }) });
  }
  async getAppInfo(name: string): Promise<RegistryAppInfo> { return this.fetch(`/api/apps/info/${encodeURIComponent(name)}`); }
  /** Launch an app: installs its plugin (if needed), returns viewer config for iframe. */
  async launchApp(name: string): Promise<AppLaunchResult> {
    return this.fetch("/api/apps/launch", { method: "POST", body: JSON.stringify({ name }) });
  }
  async listRegistryPlugins(): Promise<RegistryPluginItem[]> { return this.fetch("/api/apps/plugins"); }
  async searchRegistryPlugins(query: string): Promise<RegistryPluginItem[]> { return this.fetch(`/api/apps/plugins/search?q=${encodeURIComponent(query)}`); }
  async listHyperscapeEmbeddedAgents(): Promise<HyperscapeEmbeddedAgentsResponse> {
    return this.fetch("/api/apps/hyperscape/embedded-agents");
  }
  async createHyperscapeEmbeddedAgent(input: {
    characterId: string;
    autoStart?: boolean;
    scriptedRole?: HyperscapeScriptedRole;
  }): Promise<HyperscapeEmbeddedAgentMutationResponse> {
    return this.fetch("/api/apps/hyperscape/embedded-agents", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }
  async controlHyperscapeEmbeddedAgent(
    characterId: string,
    action: HyperscapeEmbeddedAgentControlAction,
  ): Promise<HyperscapeEmbeddedAgentMutationResponse> {
    return this.fetch(
      `/api/apps/hyperscape/embedded-agents/${encodeURIComponent(characterId)}/${action}`,
      { method: "POST" },
    );
  }
  async sendHyperscapeEmbeddedAgentCommand(
    characterId: string,
    command: string,
    data?: { [key: string]: HyperscapeJsonValue },
  ): Promise<HyperscapeActionResponse> {
    return this.fetch(
      `/api/apps/hyperscape/embedded-agents/${encodeURIComponent(characterId)}/command`,
      {
        method: "POST",
        body: JSON.stringify({ command, data }),
      },
    );
  }
  async sendHyperscapeAgentMessage(
    agentId: string,
    content: string,
  ): Promise<HyperscapeActionResponse> {
    return this.fetch(
      `/api/apps/hyperscape/agents/${encodeURIComponent(agentId)}/message`,
      {
        method: "POST",
        body: JSON.stringify({ content }),
      },
    );
  }
  async getHyperscapeAgentGoal(
    agentId: string,
  ): Promise<HyperscapeAgentGoalResponse> {
    return this.fetch(
      `/api/apps/hyperscape/agents/${encodeURIComponent(agentId)}/goal`,
    );
  }
  async getHyperscapeAgentQuickActions(
    agentId: string,
  ): Promise<HyperscapeQuickActionsResponse> {
    return this.fetch(
      `/api/apps/hyperscape/agents/${encodeURIComponent(agentId)}/quick-actions`,
    );
  }

  // Skills Marketplace

  async searchSkillsMarketplace(query: string, installed: boolean, limit: number): Promise<{ results: SkillMarketplaceResult[] }> {
    const params = new URLSearchParams({ q: query, installed: String(installed), limit: String(limit) });
    return this.fetch(`/api/skills/marketplace/search?${params}`);
  }

  async getSkillsMarketplaceConfig(): Promise<{ keySet: boolean }> {
    return this.fetch("/api/skills/marketplace/config");
  }

  async updateSkillsMarketplaceConfig(apiKey: string): Promise<{ keySet: boolean }> {
    return this.fetch("/api/skills/marketplace/config", { method: "PUT", body: JSON.stringify({ apiKey }) });
  }

  async installMarketplaceSkill(data: {
    githubUrl: string;
    repository?: string;
    path?: string;
    name?: string;
    description?: string;
    source: string;
    autoRefresh?: boolean;
  }): Promise<void> {
    await this.fetch("/api/skills/marketplace/install", { method: "POST", body: JSON.stringify(data) });
  }

  async uninstallMarketplaceSkill(skillId: string, autoRefresh: boolean): Promise<void> {
    await this.fetch(`/api/skills/marketplace/${encodeURIComponent(skillId)}`, {
      method: "DELETE",
      body: JSON.stringify({ autoRefresh }),
    });
  }

  async updateSkill(skillId: string, enabled: boolean): Promise<{ skill: SkillInfo }> {
    return this.fetch(`/api/skills/${encodeURIComponent(skillId)}`, {
      method: "PUT",
      body: JSON.stringify({ enabled }),
    });
  }

  // ── Skill CRUD & Security ────────────────────────────────────────────────

  async createSkill(name: string, description: string): Promise<{ ok: boolean; skill: SkillInfo; path: string }> {
    return this.fetch("/api/skills/create", { method: "POST", body: JSON.stringify({ name, description }) });
  }

  async openSkill(id: string): Promise<{ ok: boolean; path: string }> {
    return this.fetch(`/api/skills/${encodeURIComponent(id)}/open`, { method: "POST" });
  }

  async getSkillSource(id: string): Promise<{ ok: boolean; skillId: string; content: string; path: string }> {
    return this.fetch(`/api/skills/${encodeURIComponent(id)}/source`);
  }

  async saveSkillSource(id: string, content: string): Promise<{ ok: boolean; skillId: string; skill: SkillInfo }> {
    return this.fetch(`/api/skills/${encodeURIComponent(id)}/source`, {
      method: "PUT",
      body: JSON.stringify({ content }),
    });
  }

  async deleteSkill(id: string): Promise<{ ok: boolean; skillId: string; source: string }> {
    return this.fetch(`/api/skills/${encodeURIComponent(id)}`, { method: "DELETE" });
  }

  async getSkillScanReport(id: string): Promise<{
    ok: boolean;
    report: SkillScanReportSummary | null;
    acknowledged: boolean;
    acknowledgment: { acknowledgedAt: string; findingCount: number } | null;
  }> {
    return this.fetch(`/api/skills/${encodeURIComponent(id)}/scan`);
  }

  async acknowledgeSkill(id: string, enable: boolean): Promise<{
    ok: boolean;
    skillId: string;
    acknowledged: boolean;
    enabled: boolean;
    findingCount: number;
  }> {
    return this.fetch(`/api/skills/${encodeURIComponent(id)}/acknowledge`, {
      method: "POST",
      body: JSON.stringify({ enable }),
    });
  }

  // Workbench

  async getWorkbenchOverview(): Promise<
    WorkbenchOverview & {
      tasksAvailable?: boolean;
      triggersAvailable?: boolean;
      todosAvailable?: boolean;
    }
  > {
    return this.fetch("/api/workbench/overview");
  }

  async listWorkbenchTasks(): Promise<{ tasks: WorkbenchTask[] }> {
    return this.fetch("/api/workbench/tasks");
  }

  async getWorkbenchTask(taskId: string): Promise<{ task: WorkbenchTask }> {
    return this.fetch(`/api/workbench/tasks/${encodeURIComponent(taskId)}`);
  }

  async createWorkbenchTask(data: {
    name: string;
    description?: string;
    tags?: string[];
    isCompleted?: boolean;
  }): Promise<{ task: WorkbenchTask }> {
    return this.fetch("/api/workbench/tasks", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateWorkbenchTask(
    taskId: string,
    data: {
      name?: string;
      description?: string;
      tags?: string[];
      isCompleted?: boolean;
    },
  ): Promise<{ task: WorkbenchTask }> {
    return this.fetch(`/api/workbench/tasks/${encodeURIComponent(taskId)}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async deleteWorkbenchTask(taskId: string): Promise<{ ok: boolean }> {
    return this.fetch(`/api/workbench/tasks/${encodeURIComponent(taskId)}`, {
      method: "DELETE",
    });
  }

  async listWorkbenchTodos(): Promise<{ todos: WorkbenchTodo[] }> {
    return this.fetch("/api/workbench/todos");
  }

  async getWorkbenchTodo(todoId: string): Promise<{ todo: WorkbenchTodo }> {
    return this.fetch(`/api/workbench/todos/${encodeURIComponent(todoId)}`);
  }

  async createWorkbenchTodo(data: {
    name: string;
    description?: string;
    priority?: number;
    isUrgent?: boolean;
    type?: string;
    isCompleted?: boolean;
  }): Promise<{ todo: WorkbenchTodo }> {
    return this.fetch("/api/workbench/todos", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateWorkbenchTodo(
    todoId: string,
    data: {
      name?: string;
      description?: string;
      priority?: number;
      isUrgent?: boolean;
      type?: string;
      isCompleted?: boolean;
    },
  ): Promise<{ todo: WorkbenchTodo }> {
    return this.fetch(`/api/workbench/todos/${encodeURIComponent(todoId)}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async setWorkbenchTodoCompleted(todoId: string, isCompleted: boolean): Promise<void> {
    await this.fetch(`/api/workbench/todos/${encodeURIComponent(todoId)}/complete`, {
      method: "POST",
      body: JSON.stringify({ isCompleted }),
    });
  }

  async deleteWorkbenchTodo(todoId: string): Promise<{ ok: boolean }> {
    return this.fetch(`/api/workbench/todos/${encodeURIComponent(todoId)}`, {
      method: "DELETE",
    });
  }

  // Registry

  async refreshRegistry(): Promise<void> {
    await this.fetch("/api/apps/refresh", { method: "POST" });
  }

  // Knowledge

  async getKnowledgeStats(): Promise<KnowledgeStats> {
    return this.fetch("/api/knowledge/stats");
  }

  async listKnowledgeDocuments(options?: {
    limit?: number;
    offset?: number;
  }): Promise<KnowledgeDocumentsResponse> {
    const params = new URLSearchParams();
    if (options?.limit) params.set("limit", String(options.limit));
    if (options?.offset) params.set("offset", String(options.offset));
    const query = params.toString();
    return this.fetch(`/api/knowledge/documents${query ? `?${query}` : ""}`);
  }

  async getKnowledgeDocument(documentId: string): Promise<{ document: KnowledgeDocumentDetail }> {
    return this.fetch(`/api/knowledge/documents/${encodeURIComponent(documentId)}`);
  }

  async deleteKnowledgeDocument(documentId: string): Promise<{ ok: boolean; deletedFragments: number }> {
    return this.fetch(`/api/knowledge/documents/${encodeURIComponent(documentId)}`, {
      method: "DELETE",
    });
  }

  async uploadKnowledgeDocument(data: {
    content: string;
    filename: string;
    contentType?: string;
    metadata?: Record<string, unknown>;
  }): Promise<KnowledgeUploadResult> {
    return this.fetch("/api/knowledge/documents", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async uploadKnowledgeFromUrl(url: string, metadata?: Record<string, unknown>): Promise<KnowledgeUploadResult> {
    return this.fetch("/api/knowledge/documents/url", {
      method: "POST",
      body: JSON.stringify({ url, metadata }),
    });
  }

  async searchKnowledge(
    query: string,
    options?: { threshold?: number; limit?: number },
  ): Promise<KnowledgeSearchResponse> {
    const params = new URLSearchParams({ q: query });
    if (options?.threshold !== undefined) params.set("threshold", String(options.threshold));
    if (options?.limit !== undefined) params.set("limit", String(options.limit));
    return this.fetch(`/api/knowledge/search?${params}`);
  }

  async getKnowledgeFragments(documentId: string): Promise<KnowledgeFragmentsResponse> {
    return this.fetch(`/api/knowledge/fragments/${encodeURIComponent(documentId)}`);
  }

  // MCP

  async getMcpConfig(): Promise<{ servers: Record<string, McpServerConfig> }> {
    return this.fetch("/api/mcp/config");
  }

  async getMcpStatus(): Promise<{ servers: McpServerStatus[] }> {
    return this.fetch("/api/mcp/status");
  }

  async searchMcpMarketplace(query: string, limit: number): Promise<{ results: McpMarketplaceResult[] }> {
    const params = new URLSearchParams({ q: query, limit: String(limit) });
    return this.fetch(`/api/mcp/marketplace/search?${params}`);
  }

  async getMcpServerDetails(name: string): Promise<{ server: McpRegistryServerDetail }> {
    return this.fetch(`/api/mcp/marketplace/${encodeURIComponent(name)}`);
  }

  async addMcpServer(name: string, config: McpServerConfig): Promise<void> {
    await this.fetch("/api/mcp/servers", { method: "POST", body: JSON.stringify({ name, config }) });
  }

  async removeMcpServer(name: string): Promise<void> {
    await this.fetch(`/api/mcp/servers/${encodeURIComponent(name)}`, { method: "DELETE" });
  }

  // Share Ingest

  async ingestShare(payload: ShareIngestPayload): Promise<{ item: ShareIngestItem }> {
    return this.fetch("/api/ingest/share", { method: "POST", body: JSON.stringify(payload) });
  }

  async consumeShareIngest(): Promise<{ items: ShareIngestItem[] }> {
    return this.fetch("/api/share/consume", { method: "POST" });
  }

  // WebSocket

  connectWs(): void {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    let host: string;
    if (this.baseUrl) {
      host = new URL(this.baseUrl).host;
    } else {
      // In non-HTTP environments (Electron capacitor-electron://, file://, etc.)
      // window.location.host may be empty or a non-routable placeholder like "-".
      const loc = window.location;
      if (loc.protocol !== "http:" && loc.protocol !== "https:") return;
      host = loc.host;
    }

    if (!host) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    let url = `${protocol}//${host}/ws`;
    const token = this.apiToken;
    if (token) {
      url += `?token=${encodeURIComponent(token)}`;
    }

    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      this.backoffMs = 500;
      if (this.wsSendQueue.length > 0 && this.ws?.readyState === WebSocket.OPEN) {
        const pending = this.wsSendQueue;
        this.wsSendQueue = [];
        for (let i = 0; i < pending.length; i++) {
          if (this.ws?.readyState !== WebSocket.OPEN) {
            this.wsSendQueue = pending.slice(i).concat(this.wsSendQueue);
            break;
          }
          try {
            this.ws.send(pending[i]);
          } catch {
            this.wsSendQueue = pending.slice(i).concat(this.wsSendQueue);
            break;
          }
        }
      }
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data as string) as Record<string, unknown>;
        const type = data.type as string;
        const handlers = this.wsHandlers.get(type);
        if (handlers) {
          for (const handler of handlers) {
            handler(data);
          }
        }
        // Also fire "all" handlers
        const allHandlers = this.wsHandlers.get("*");
        if (allHandlers) {
          for (const handler of allHandlers) {
            handler(data);
          }
        }
      } catch {
        // ignore parse errors
      }
    };

    this.ws.onclose = () => {
      this.ws = null;
      this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      // close handler will fire
    };
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connectWs();
    }, this.backoffMs);
    this.backoffMs = Math.min(this.backoffMs * 1.5, 10000);
  }

  /** Send an arbitrary JSON message over the WebSocket connection. */
  sendWsMessage(data: Record<string, unknown>): void {
    const payload = JSON.stringify(data);
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(payload);
      return;
    }

    // Keep only the newest active-conversation update while disconnected.
    if (data.type === "active-conversation") {
      this.wsSendQueue = this.wsSendQueue.filter((queued) => {
        try {
          const parsed = JSON.parse(queued) as { type?: unknown };
          return parsed.type !== "active-conversation";
        } catch {
          return true;
        }
      });
    }

    if (this.wsSendQueue.length >= this.wsSendQueueLimit) {
      this.wsSendQueue.shift();
    }
    this.wsSendQueue.push(payload);

    if (!this.ws || this.ws.readyState === WebSocket.CLOSED) {
      this.connectWs();
    }
  }

  onWsEvent(type: string, handler: WsEventHandler): () => void {
    if (!this.wsHandlers.has(type)) {
      this.wsHandlers.set(type, new Set());
    }
    this.wsHandlers.get(type)!.add(handler);
    return () => {
      this.wsHandlers.get(type)?.delete(handler);
    };
  }

  private normalizeAssistantText(text: string): string {
    const trimmed = text.trim();
    if (trimmed.length === 0 || /^\(?no response\)?$/i.test(trimmed)) {
      return GENERIC_NO_RESPONSE_TEXT;
    }
    return text;
  }

  private async streamChatEndpoint(
    path: string,
    text: string,
    onToken: (token: string) => void,
    mode: ConversationMode = "simple",
    signal?: AbortSignal,
  ): Promise<{ text: string; agentName: string }> {
    if (!this.apiAvailable) {
      throw new Error("API not available (no HTTP origin)");
    }

    const token = this.apiToken;
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ text, mode }),
      signal,
    });

    if (!res.ok) {
      const body = await res
        .json()
        .catch(() => ({ error: res.statusText })) as Record<string, string>;
      const err = new Error(body.error ?? `HTTP ${res.status}`);
      (err as Error & { status?: number }).status = res.status;
      throw err;
    }

    if (!res.body) {
      throw new Error("Streaming not supported by this browser");
    }

    const decoder = new TextDecoder();
    const reader = res.body.getReader();
    let buffer = "";
    let fullText = "";
    let doneText: string | null = null;
    let doneAgentName: string | null = null;

    const parseDataLine = (line: string): void => {
      const payload = line.startsWith("data:") ? line.slice(5).trim() : "";
      if (!payload) return;

      let parsed: {
        type?: string;
        text?: string;
        fullText?: string;
        agentName?: string;
        message?: string;
      };
      try {
        parsed = JSON.parse(payload) as {
          type?: string;
          text?: string;
          fullText?: string;
          agentName?: string;
          message?: string;
        };
      } catch {
        return;
      }

      if (parsed.type === "token") {
        const chunk = parsed.text ?? "";
        if (chunk) {
          fullText += chunk;
          onToken(chunk);
        }
        return;
      }

      if (parsed.type === "done") {
        if (typeof parsed.fullText === "string") doneText = parsed.fullText;
        if (typeof parsed.agentName === "string" && parsed.agentName.trim()) {
          doneAgentName = parsed.agentName;
        }
        return;
      }

      if (parsed.type === "error") {
        throw new Error(parsed.message ?? "generation failed");
      }

      // Backward compatibility with legacy stream payloads: { text: "..." }
      if (parsed.text) {
        fullText += parsed.text;
        onToken(parsed.text);
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      let eventBreak = buffer.indexOf("\n\n");
      while (eventBreak !== -1) {
        const rawEvent = buffer.slice(0, eventBreak);
        buffer = buffer.slice(eventBreak + 2);
        for (const line of rawEvent.split("\n")) {
          if (!line.startsWith("data:")) continue;
          parseDataLine(line);
        }
        eventBreak = buffer.indexOf("\n\n");
      }
    }

    if (buffer.trim()) {
      for (const line of buffer.split("\n")) {
        if (line.startsWith("data:")) parseDataLine(line);
      }
    }

    const resolvedText = this.normalizeAssistantText(doneText ?? fullText);
    return {
      text: resolvedText,
      agentName: doneAgentName ?? "Milaidy",
    };
  }

  /**
   * Send a chat message via the REST endpoint (reliable — does not depend on
   * a WebSocket connection).  Returns the agent's response text.
   */
  async sendChatRest(
    text: string,
    mode: ConversationMode = "simple",
  ): Promise<{ text: string; agentName: string }> {
    const response = await this.fetch<{ text: string; agentName: string }>(
      "/api/chat",
      {
        method: "POST",
        body: JSON.stringify({ text, mode }),
      },
    );
    return {
      ...response,
      text: this.normalizeAssistantText(response.text),
    };
  }

  async sendChatStream(
    text: string,
    onToken: (token: string) => void,
    mode: ConversationMode = "simple",
    signal?: AbortSignal,
  ): Promise<{ text: string; agentName: string }> {
    return this.streamChatEndpoint(
      "/api/chat/stream",
      text,
      onToken,
      mode,
      signal,
    );
  }

  // Conversations

  async listConversations(): Promise<{ conversations: Conversation[] }> {
    return this.fetch("/api/conversations");
  }

  async createConversation(title?: string): Promise<{ conversation: Conversation }> {
    return this.fetch("/api/conversations", {
      method: "POST",
      body: JSON.stringify({ title }),
    });
  }

  async getConversationMessages(id: string): Promise<{ messages: ConversationMessage[] }> {
    return this.fetch(`/api/conversations/${encodeURIComponent(id)}/messages`);
  }

  async sendConversationMessage(
    id: string,
    text: string,
    mode: ConversationMode = "simple",
  ): Promise<{ text: string; agentName: string; blocks?: ContentBlock[] }> {
    const response = await this.fetch<{
      text: string;
      agentName: string;
      blocks?: ContentBlock[];
    }>(`/api/conversations/${encodeURIComponent(id)}/messages`, {
      method: "POST",
      body: JSON.stringify({ text, mode }),
    });
    return {
      ...response,
      text: this.normalizeAssistantText(response.text),
    };
  }

  async sendConversationMessageStream(
    id: string,
    text: string,
    onToken: (token: string) => void,
    mode: ConversationMode = "simple",
    signal?: AbortSignal,
  ): Promise<{ text: string; agentName: string }> {
    return this.streamChatEndpoint(
      `/api/conversations/${encodeURIComponent(id)}/messages/stream`,
      text,
      onToken,
      mode,
      signal,
    );
  }

  async requestGreeting(id: string): Promise<{ text: string; agentName: string; generated: boolean }> {
    return this.fetch(`/api/conversations/${encodeURIComponent(id)}/greeting`, {
      method: "POST",
    });
  }

  async renameConversation(id: string, title: string): Promise<{ conversation: Conversation }> {
    return this.fetch(`/api/conversations/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify({ title }),
    });
  }

  async deleteConversation(id: string): Promise<{ ok: boolean }> {
    return this.fetch(`/api/conversations/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  }

  /** @deprecated Prefer {@link sendChatRest} — WebSocket chat may silently drop messages. */
  sendChat(text: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "chat", text }));
    }
  }

  // ── Database API ──────────────────────────────────────────────────────

  async getDatabaseStatus(): Promise<DatabaseStatus> {
    return this.fetch("/api/database/status");
  }

  async getDatabaseConfig(): Promise<DatabaseConfigResponse> {
    return this.fetch("/api/database/config");
  }

  async saveDatabaseConfig(config: {
    provider?: DatabaseProviderType;
    pglite?: { dataDir?: string };
    postgres?: {
      connectionString?: string;
      host?: string;
      port?: number;
      database?: string;
      user?: string;
      password?: string;
      ssl?: boolean;
    };
  }): Promise<{ saved: boolean; needsRestart: boolean }> {
    return this.fetch("/api/database/config", {
      method: "PUT",
      body: JSON.stringify(config),
    });
  }

  async testDatabaseConnection(creds: {
    connectionString?: string;
    host?: string;
    port?: number;
    database?: string;
    user?: string;
    password?: string;
    ssl?: boolean;
  }): Promise<ConnectionTestResult> {
    return this.fetch("/api/database/test", {
      method: "POST",
      body: JSON.stringify(creds),
    });
  }

  async getDatabaseTables(): Promise<{ tables: TableInfo[] }> {
    return this.fetch("/api/database/tables");
  }

  async getDatabaseRows(
    table: string,
    opts?: { offset?: number; limit?: number; sort?: string; order?: "asc" | "desc"; search?: string },
  ): Promise<TableRowsResponse> {
    const params = new URLSearchParams();
    if (opts?.offset != null) params.set("offset", String(opts.offset));
    if (opts?.limit != null) params.set("limit", String(opts.limit));
    if (opts?.sort) params.set("sort", opts.sort);
    if (opts?.order) params.set("order", opts.order);
    if (opts?.search) params.set("search", opts.search);
    const qs = params.toString();
    return this.fetch(`/api/database/tables/${encodeURIComponent(table)}/rows${qs ? `?${qs}` : ""}`);
  }

  async insertDatabaseRow(
    table: string,
    data: Record<string, unknown>,
  ): Promise<{ inserted: boolean; row: Record<string, unknown> | null }> {
    return this.fetch(`/api/database/tables/${encodeURIComponent(table)}/rows`, {
      method: "POST",
      body: JSON.stringify({ data }),
    });
  }

  async updateDatabaseRow(
    table: string,
    where: Record<string, unknown>,
    data: Record<string, unknown>,
  ): Promise<{ updated: boolean; row: Record<string, unknown> }> {
    return this.fetch(`/api/database/tables/${encodeURIComponent(table)}/rows`, {
      method: "PUT",
      body: JSON.stringify({ where, data }),
    });
  }

  async deleteDatabaseRow(
    table: string,
    where: Record<string, unknown>,
  ): Promise<{ deleted: boolean; row: Record<string, unknown> }> {
    return this.fetch(`/api/database/tables/${encodeURIComponent(table)}/rows`, {
      method: "DELETE",
      body: JSON.stringify({ where }),
    });
  }

  async executeDatabaseQuery(
    sql: string,
    readOnly = true,
  ): Promise<QueryResult> {
    return this.fetch("/api/database/query", {
      method: "POST",
      body: JSON.stringify({ sql, readOnly }),
    });
  }

  // ── Trajectories ─────────────────────────────────────────────────────

  async getTrajectories(options?: TrajectoryListOptions): Promise<TrajectoryListResult> {
    const params = new URLSearchParams();
    if (options?.limit) params.set("limit", String(options.limit));
    if (options?.offset) params.set("offset", String(options.offset));
    if (options?.source) params.set("source", options.source);
    if (options?.status) params.set("status", options.status);
    if (options?.startDate) params.set("startDate", options.startDate);
    if (options?.endDate) params.set("endDate", options.endDate);
    if (options?.search) params.set("search", options.search);
    const query = params.toString();
    return this.fetch(`/api/trajectories${query ? `?${query}` : ""}`);
  }

  async getTrajectoryDetail(trajectoryId: string): Promise<TrajectoryDetailResult> {
    return this.fetch(`/api/trajectories/${encodeURIComponent(trajectoryId)}`);
  }

  async getTrajectoryStats(): Promise<TrajectoryStats> {
    return this.fetch("/api/trajectories/stats");
  }

  async getTrajectoryConfig(): Promise<TrajectoryConfig> {
    return this.fetch("/api/trajectories/config");
  }

  async updateTrajectoryConfig(config: Partial<TrajectoryConfig>): Promise<TrajectoryConfig> {
    return this.fetch("/api/trajectories/config", {
      method: "PUT",
      body: JSON.stringify(config),
    });
  }

  async exportTrajectories(options: TrajectoryExportOptions): Promise<Blob> {
    if (!this.apiAvailable) {
      throw new Error("API not available (no HTTP origin)");
    }
    const token = this.apiToken;
    const res = await fetch(`${this.baseUrl}/api/trajectories/export`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(options),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText })) as Record<string, string>;
      throw new Error(body.error ?? `HTTP ${res.status}`);
    }
    return res.blob();
  }

  async deleteTrajectories(trajectoryIds: string[]): Promise<{ deleted: number }> {
    return this.fetch("/api/trajectories", {
      method: "DELETE",
      body: JSON.stringify({ trajectoryIds }),
    });
  }

  async clearAllTrajectories(): Promise<{ deleted: number }> {
    return this.fetch("/api/trajectories", {
      method: "DELETE",
      body: JSON.stringify({ clearAll: true }),
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  System Permissions
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Get all system permission states.
   */
  async getPermissions(): Promise<AllPermissionsState> {
    return this.fetch("/api/permissions");
  }

  /**
   * Get a single permission state.
   */
  async getPermission(id: SystemPermissionId): Promise<PermissionState> {
    return this.fetch(`/api/permissions/${id}`);
  }

  /**
   * Request a specific permission (triggers OS prompt if applicable).
   */
  async requestPermission(id: SystemPermissionId): Promise<PermissionState> {
    return this.fetch(`/api/permissions/${id}/request`, { method: "POST" });
  }

  /**
   * Open system settings for a specific permission.
   */
  async openPermissionSettings(id: SystemPermissionId): Promise<void> {
    await this.fetch(`/api/permissions/${id}/open-settings`, { method: "POST" });
  }

  /**
   * Refresh all permission states from the OS.
   */
  async refreshPermissions(): Promise<AllPermissionsState> {
    return this.fetch("/api/permissions/refresh", { method: "POST" });
  }

  /**
   * Enable or disable shell access.
   */
  async setShellEnabled(enabled: boolean): Promise<PermissionState> {
    return this.fetch("/api/permissions/shell", {
      method: "PUT",
      body: JSON.stringify({ enabled }),
    });
  }

  /**
   * Get shell enabled status.
   */
  async isShellEnabled(): Promise<boolean> {
    const result = await this.fetch<{ enabled: boolean }>("/api/permissions/shell");
    return result.enabled;
  }

  disconnectWs(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
    this.wsSendQueue = [];
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  ERC-8004 Registry
  // ═══════════════════════════════════════════════════════════════════════

  async getRegistryStatus(): Promise<RegistryStatus> {
    return this.fetch("/api/registry/status");
  }

  async registerAgent(params?: {
    name?: string;
    endpoint?: string;
    tokenURI?: string;
  }): Promise<RegistrationResult> {
    return this.fetch("/api/registry/register", {
      method: "POST",
      body: JSON.stringify(params ?? {}),
    });
  }

  async updateRegistryTokenURI(tokenURI: string): Promise<{ ok: boolean; txHash: string }> {
    return this.fetch("/api/registry/update-uri", {
      method: "POST",
      body: JSON.stringify({ tokenURI }),
    });
  }

  async syncRegistryProfile(params?: {
    name?: string;
    endpoint?: string;
    tokenURI?: string;
  }): Promise<{ ok: boolean; txHash: string }> {
    return this.fetch("/api/registry/sync", {
      method: "POST",
      body: JSON.stringify(params ?? {}),
    });
  }

  async getRegistryConfig(): Promise<RegistryConfig> {
    return this.fetch("/api/registry/config");
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Drop / Mint
  // ═══════════════════════════════════════════════════════════════════════

  async getDropStatus(): Promise<DropStatus> {
    return this.fetch("/api/drop/status");
  }

  async mintAgent(params?: {
    name?: string;
    endpoint?: string;
    shiny?: boolean;
  }): Promise<MintResult> {
    return this.fetch("/api/drop/mint", {
      method: "POST",
      body: JSON.stringify(params ?? {}),
    });
  }

  async mintAgentWhitelist(params: {
    name?: string;
    endpoint?: string;
    proof: string[];
  }): Promise<MintResult> {
    return this.fetch("/api/drop/mint-whitelist", {
      method: "POST",
      body: JSON.stringify(params),
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Whitelist
  // ═══════════════════════════════════════════════════════════════════════

  async getWhitelistStatus(): Promise<WhitelistStatus> {
    return this.fetch("/api/whitelist/status");
  }

  async generateTwitterVerificationMessage(): Promise<VerificationMessageResponse> {
    return this.fetch("/api/whitelist/twitter/message", { method: "POST" });
  }

  async verifyTwitter(tweetUrl: string): Promise<VerificationResult> {
    return this.fetch("/api/whitelist/twitter/verify", {
      method: "POST",
      body: JSON.stringify({ tweetUrl }),
    });
  }

  // ── Custom Actions ─────────────────────────────────────────────────────

  async listCustomActions(): Promise<CustomActionDef[]> {
    const data = await this.fetch<{ actions: CustomActionDef[] }>("/api/custom-actions");
    return data.actions;
  }

  async createCustomAction(
    action: Omit<CustomActionDef, "id" | "createdAt" | "updatedAt">,
  ): Promise<CustomActionDef> {
    const data = await this.fetch<{ ok: boolean; action: CustomActionDef }>(
      "/api/custom-actions",
      { method: "POST", body: JSON.stringify(action) },
    );
    return data.action;
  }

  async updateCustomAction(
    id: string,
    action: Partial<CustomActionDef>,
  ): Promise<CustomActionDef> {
    const data = await this.fetch<{ ok: boolean; action: CustomActionDef }>(
      `/api/custom-actions/${encodeURIComponent(id)}`,
      { method: "PUT", body: JSON.stringify(action) },
    );
    return data.action;
  }

  async deleteCustomAction(id: string): Promise<void> {
    await this.fetch(`/api/custom-actions/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  }

  async testCustomAction(
    id: string,
    params: Record<string, string>,
  ): Promise<{ ok: boolean; output: string; error?: string; durationMs: number }> {
    return this.fetch(
      `/api/custom-actions/${encodeURIComponent(id)}/test`,
      { method: "POST", body: JSON.stringify({ params }) },
    );
  }

  async generateCustomAction(
    prompt: string,
  ): Promise<{ ok: boolean; generated: Record<string, unknown> }> {
    return this.fetch("/api/custom-actions/generate", {
      method: "POST",
      body: JSON.stringify({ prompt }),
    });
  }
}

// Singleton
export const client = new MilaidyClient();
