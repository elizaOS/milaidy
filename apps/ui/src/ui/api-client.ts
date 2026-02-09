/**
 * API client for the Milaidy backend.
 *
 * Thin fetch wrapper + WebSocket for real-time chat/events.
 * Replaces the gateway WebSocket protocol entirely.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// Database types
export type DatabaseProviderType = "pglite" | "postgres";

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

export type AgentState = "not_started" | "running" | "paused" | "stopped" | "restarting" | "error";

export interface AgentStatus {
  state: AgentState;
  agentName: string;
  model: string | undefined;
  uptime: number | undefined;
  startedAt: number | undefined;
}

export interface MessageExample {
  user: string;
  content: { text: string };
}

export interface StylePreset {
  catchphrase: string;
  hint: string;
  bio: string[];
  system: string;
  style: {
    all: string[];
    chat: string[];
    post: string[];
  };
  adjectives: string[];
  topics: string[];
  messageExamples: MessageExample[][];
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

export interface OnboardingOptions {
  names: string[];
  styles: StylePreset[];
  providers: ProviderOption[];
  cloudProviders: CloudProviderOption[];
  models: {
    small: ModelOption[];
    large: ModelOption[];
  };
  inventoryProviders: InventoryProviderOption[];
  sharedStyleRules: string;
}

export interface OnboardingData {
  name: string;
  theme: string;
  runMode: "local" | "cloud";
  bio: string[];
  systemPrompt: string;
  style?: {
    all: string[];
    chat: string[];
    post: string[];
  };
  adjectives?: string[];
  topics?: string[];
  messageExamples?: MessageExample[][];
  // Cloud-specific
  cloudProvider?: string;
  smallModel?: string;
  largeModel?: string;
  // Local-specific
  provider?: string;
  providerApiKey?: string;
  // Inventory / wallet setup
  inventoryProviders?: Array<{
    chain: string;
    rpcProvider: string;
    rpcApiKey?: string;
  }>;
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
  category: "ai-provider" | "connector" | "database" | "feature";
  source: "bundled" | "store";
  parameters: PluginParamDef[];
  validationErrors: Array<{ field: string; message: string }>;
  validationWarnings: Array<{ field: string; message: string }>;
  npmName?: string;
  version?: string;
  pluginDeps?: string[];
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

export interface ConversationMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  timestamp: number;
}

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

// Wallet types

export interface WalletAddresses { evmAddress: string | null; solanaAddress: string | null }
export interface EvmTokenBalance { symbol: string; name: string; contractAddress: string; balance: string; decimals: number; valueUsd: string; logoUrl: string }
export interface EvmChainBalance { chain: string; chainId: number; nativeBalance: string; nativeSymbol: string; nativeValueUsd: string; tokens: EvmTokenBalance[]; error: string | null }
export interface SolanaTokenBalance { symbol: string; name: string; mint: string; balance: string; decimals: number; valueUsd: string; logoUrl: string }
export interface WalletBalancesResponse {
  evm: { address: string; chains: EvmChainBalance[] } | null;
  solana: { address: string; solBalance: string; solValueUsd: string; tokens: SolanaTokenBalance[] } | null;
}
export interface EvmNft { contractAddress: string; tokenId: string; name: string; description: string; imageUrl: string; collectionName: string; tokenType: string }
export interface SolanaNft { mint: string; name: string; description: string; imageUrl: string; collectionName: string }
export interface WalletNftsResponse { evm: Array<{ chain: string; nfts: EvmNft[] }>; solana: { nfts: SolanaNft[] } | null }
export interface WalletConfigStatus { alchemyKeySet: boolean; heliusKeySet: boolean; birdeyeKeySet: boolean; evmChains: string[]; evmAddress: string | null; solanaAddress: string | null }
export interface WalletExportResult { evm: { privateKey: string; address: string | null } | null; solana: { privateKey: string; address: string | null } | null }

// Software Updates
export type ReleaseChannel = "stable" | "beta" | "nightly";
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
export interface CloudStatus { connected: boolean; userId?: string; organizationId?: string; topUpUrl?: string; reason?: string }
export interface CloudCredits { connected: boolean; balance: number | null; low?: boolean; critical?: boolean; topUpUrl?: string }

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
export interface WorkbenchGoal {
  id: string;
  name: string;
  description?: string;
  tags: string[];
  metadata?: { priority?: number };
  isCompleted: boolean;
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
  goals: WorkbenchGoal[];
  todos: WorkbenchTodo[];
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
export interface AppViewerConfig {
  url: string;
  embedParams?: Record<string, string>;
  postMessageAuth?: boolean;
  sandbox?: string;
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
  viewer: AppViewerConfig | null;
}

// WebSocket

export type WsEventHandler = (data: Record<string, unknown>) => void;

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class MilaidyClient {
  private _baseUrl: string;
  private _explicitBase: boolean;
  private _token: string | null;
  private ws: WebSocket | null = null;
  private wsHandlers = new Map<string, Set<WsEventHandler>>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private backoffMs = 500;

  constructor(baseUrl?: string, token?: string) {
    this._explicitBase = baseUrl != null;
    const stored =
      typeof window !== "undefined"
        ? window.sessionStorage.getItem("milaidy_api_token")
        : null;
    this._token = token?.trim() || stored || null;
    // Priority: explicit arg > Capacitor/Electron injected global > same origin (Vite proxy)
    const global = typeof window !== "undefined"
      ? (window as Record<string, unknown>).__MILAIDY_API_BASE__
      : undefined;
    this._baseUrl = baseUrl ?? (typeof global === "string" ? global : "");
  }

  /**
   * Resolve the API base URL lazily.
   * In Electron the main process injects window.__MILAIDY_API_BASE__ after the
   * page loads (once the agent runtime starts). Re-checking on every call
   * ensures we pick up the injected value even if it wasn't set at construction.
   */
  private get baseUrl(): string {
    if (!this._baseUrl && !this._explicitBase && typeof window !== "undefined") {
      const injected = (window as Record<string, unknown>).__MILAIDY_API_BASE__;
      if (typeof injected === "string") {
        this._baseUrl = injected;
      }
    }
    return this._baseUrl;
  }

  private get apiToken(): string | null {
    if (this._token) return this._token;
    if (typeof window === "undefined") return null;
    const injected = (window as Record<string, unknown>).__MILAIDY_API_TOKEN__;
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

  async getOnboardingStatus(): Promise<{ complete: boolean }> {
    return this.fetch("/api/onboarding/status");
  }

  async getAuthStatus(): Promise<{ required: boolean; pairingEnabled: boolean; expiresAt: number | null }> {
    return this.fetch("/api/auth/status");
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

  async resetAgent(): Promise<void> {
    await this.fetch("/api/agent/reset", { method: "POST" });
  }

  async getPlugins(): Promise<{ plugins: PluginInfo[] }> {
    return this.fetch("/api/plugins");
  }

  async updatePlugin(id: string, config: Record<string, unknown>): Promise<void> {
    await this.fetch(`/api/plugins/${id}`, {
      method: "PUT",
      body: JSON.stringify(config),
    });
  }

  async getSkills(): Promise<{ skills: SkillInfo[] }> {
    return this.fetch("/api/skills");
  }

  async refreshSkills(): Promise<{ ok: boolean; skills: SkillInfo[] }> {
    return this.fetch("/api/skills/refresh", { method: "POST" });
  }

  async getLogs(): Promise<{ entries: LogEntry[] }> {
    return this.fetch("/api/logs");
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
  async exportWalletKeys(): Promise<WalletExportResult> { return this.fetch("/api/wallet/export", { method: "POST", body: JSON.stringify({ confirm: true }) }); }

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

  // Apps & Registry
  async listApps(): Promise<RegistryAppInfo[]> { return this.fetch("/api/apps"); }
  async searchApps(query: string): Promise<RegistryAppInfo[]> { return this.fetch(`/api/apps/search?q=${encodeURIComponent(query)}`); }
  async listInstalledApps(): Promise<InstalledAppInfo[]> { return this.fetch("/api/apps/installed"); }
  async stopApp(name: string): Promise<{ success: boolean }> {
    return this.fetch("/api/apps/stop", { method: "POST", body: JSON.stringify({ name }) });
  }
  async getAppInfo(name: string): Promise<RegistryAppInfo> { return this.fetch(`/api/apps/info/${encodeURIComponent(name)}`); }
  /** Launch an app: installs its plugin (if needed), returns viewer config for iframe. */
  async launchApp(name: string): Promise<AppLaunchResult> {
    return this.fetch("/api/apps/launch", { method: "POST", body: JSON.stringify({ name }) });
  }
  async listRegistryPlugins(): Promise<RegistryPluginItem[]> { return this.fetch("/api/apps/plugins"); }
  async searchRegistryPlugins(query: string): Promise<RegistryPluginItem[]> { return this.fetch(`/api/apps/plugins/search?q=${encodeURIComponent(query)}`); }

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

  async getWorkbenchOverview(): Promise<WorkbenchOverview & { goalsAvailable?: boolean; todosAvailable?: boolean }> {
    return this.fetch("/api/workbench/overview");
  }

  async createWorkbenchGoal(data: { name: string; description: string; tags: string[]; priority: number }): Promise<void> {
    await this.fetch("/api/workbench/goals", { method: "POST", body: JSON.stringify(data) });
  }

  async updateWorkbenchGoal(goalId: string, data: { name?: string; description?: string; tags?: string[]; priority?: number }): Promise<void> {
    await this.fetch(`/api/workbench/goals/${encodeURIComponent(goalId)}`, { method: "PUT", body: JSON.stringify(data) });
  }

  async setWorkbenchGoalCompleted(goalId: string, isCompleted: boolean): Promise<void> {
    await this.fetch(`/api/workbench/goals/${encodeURIComponent(goalId)}/complete`, { method: "POST", body: JSON.stringify({ isCompleted }) });
  }

  async createWorkbenchTodo(data: { name: string; description: string; priority: number; isUrgent: boolean; type: string }): Promise<void> {
    await this.fetch("/api/workbench/todos", { method: "POST", body: JSON.stringify(data) });
  }

  async updateWorkbenchTodo(todoId: string, data: { priority?: number; isUrgent?: boolean }): Promise<void> {
    await this.fetch(`/api/workbench/todos/${encodeURIComponent(todoId)}`, { method: "PUT", body: JSON.stringify(data) });
  }

  async setWorkbenchTodoCompleted(todoId: string, isCompleted: boolean): Promise<void> {
    await this.fetch(`/api/workbench/todos/${encodeURIComponent(todoId)}/complete`, { method: "POST", body: JSON.stringify({ isCompleted }) });
  }

  // Registry

  async refreshRegistry(): Promise<void> {
    await this.fetch("/api/apps/refresh", { method: "POST" });
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
    const url = `${protocol}//${host}/ws`;

    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      this.backoffMs = 500;
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

  onWsEvent(type: string, handler: WsEventHandler): () => void {
    if (!this.wsHandlers.has(type)) {
      this.wsHandlers.set(type, new Set());
    }
    this.wsHandlers.get(type)!.add(handler);
    return () => {
      this.wsHandlers.get(type)?.delete(handler);
    };
  }

  /**
   * Send a chat message via the REST endpoint (reliable — does not depend on
   * a WebSocket connection).  Returns the agent's response text.
   */
  async sendChatRest(text: string): Promise<{ text: string; agentName: string }> {
    return this.fetch<{ text: string; agentName: string }>("/api/chat", {
      method: "POST",
      body: JSON.stringify({ text }),
    });
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

  async sendConversationMessage(id: string, text: string): Promise<{ text: string; agentName: string }> {
    return this.fetch(`/api/conversations/${encodeURIComponent(id)}/messages`, {
      method: "POST",
      body: JSON.stringify({ text }),
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

  disconnectWs(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
  }
}

// Singleton
export const client = new MilaidyClient();
