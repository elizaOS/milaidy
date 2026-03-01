/**
 * API client for the Milaidy backend.
 *
 * Thin fetch wrapper + WebSocket for real-time chat/events.
 * Replaces the gateway WebSocket protocol entirely.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

export interface OnboardingOptions {
  names: string[];
  styles: StylePreset[];
  providers: ProviderOption[];
  sharedStyleRules: string;
}

export interface OnboardingData {
  name: string;
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
  provider?: string;
  providerApiKey?: string;
  telegramBotToken?: string;
  discordBotToken?: string;
}

export interface PluginParamDef {
  key: string;
  type: string;
  description: string;
  required: boolean;
  sensitive: boolean;
  default?: string;
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
  parameters: PluginParamDef[];
  validationErrors: Array<{ field: string; message: string }>;
  validationWarnings: Array<{ field: string; message: string }>;
}

export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  timestamp: number;
}

export interface ChatSecurityContext {
  confirmBeforeExecution: boolean;
  confirmBeforeSpend: boolean;
  spendGuardEnabled: boolean;
  polymarketExecutionEnabled: boolean;
  dailySpendLimitUsd: number;
  perTradeLimitUsd: number;
  cooldownSeconds: number;
}

export interface SkillInfo {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
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
export interface WalletConfigStatus { alchemyKeySet: boolean; heliusKeySet: boolean; birdeyeKeySet: boolean; evmPublicSource: boolean; solanaPublicSource: boolean; pricePublicSource: boolean; walletExportEnabled: boolean; solanaWalletConnected: boolean; walletConnectionLocked: boolean; evmConfiguredAddress: string | null; solanaConfiguredAddress: string | null; evmSigningEnabled: boolean; solanaSigningEnabled: boolean; evmChains: string[]; evmAddress: string | null; solanaAddress: string | null }
export interface WalletExportResult { evm: { privateKey: string; address: string | null } | null; solana: { privateKey: string; address: string | null } | null }
export type WalletChain = "evm" | "solana" | "both";
export interface WalletGenerateResponse { ok: boolean; wallets: Array<{ chain: "evm" | "solana"; address: string }> }
export interface WalletImportResponse { ok: boolean; chain: "evm" | "solana"; address: string | null }
export interface WalletConnectedDataResponse {
  account:
    | { mode: "user"; userId: string; displayName: string; username: string | null }
    | { mode: "server"; username: string | null };
  addresses: WalletAddresses;
  balances: WalletBalancesResponse;
  nfts: WalletNftsResponse;
  polymarket: PolymarketPortfolioResponse;
}
export interface PolymarketPositionSummary {
  market: string;
  outcome: string;
  sizeUsd: number;
  currentValueUsd: number;
  pnlUsd: number;
  updatedAt: string | null;
}
export interface PolymarketPortfolioResponse {
  wallet: string | null;
  connected: boolean;
  availableBalanceUsd: number | null;
  openExposureUsd: number | null;
  unsettledPnlUsd: number | null;
  openPositionsCount: number;
  positions: PolymarketPositionSummary[];
}
export interface HandleCheckResponse {
  ok: boolean;
  handle: string;
  available: boolean;
  owner: "self" | "other" | "none";
  lockUntil?: number | null;
}
export interface HandleClaimResponse { ok: boolean; handle: string; lockUntil?: number | null }

export interface UiConfigResponse {
  ui?: {
    assistant?: { name?: string };
    user?: { handle?: string; accent?: string; imageUrl?: string; responseMode?: string };
  };
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
  private _useV2Api: boolean;
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
    const v2Global =
      typeof window !== "undefined"
        ? (window as Record<string, unknown>).__MILAIDY_USE_V2_API__
        : undefined;
    this._useV2Api = v2Global === true;
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

  get useV2Api(): boolean {
    return this._useV2Api;
  }

  setUseV2Api(enabled: boolean): void {
    this._useV2Api = Boolean(enabled);
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
      throw new Error("Milaidy API is unavailable in this context");
    }
    const makeRequest = async (token: string | null) => {
      const isChatRoute =
        path.startsWith("/api/chat") || path.startsWith("/api/v2/chat");
      const timeoutMs = isChatRoute ? 8000 : 12000;
      const timeoutPromise = new Promise<never>((_, reject) => {
        const t = setTimeout(() => {
          clearTimeout(t);
          reject(new Error(`Request timeout after ${timeoutMs}ms: ${path}`));
        }, timeoutMs);
      });
      return Promise.race([
        fetch(`${this.baseUrl}${path}`, {
          ...init,
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...init?.headers,
          },
        }),
        timeoutPromise,
      ]) as Promise<Response>;
    };

    const requestWithBackendRetry = async (token: string | null): Promise<Response> => {
      // Fail fast on chat so users aren't stuck waiting on retries.
      // Non-chat routes can retry a bit longer during startup/restarts.
      const isChatRoute =
        path.startsWith("/api/chat") || path.startsWith("/api/v2/chat");
      const maxAttempts = isChatRoute ? 3 : 10;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const res = await makeRequest(token);
        if (res.status !== 503) return res;

        const body = await res.clone().json().catch(() => ({})) as Record<string, unknown>;
        const errMsg = typeof body.error === "string" ? body.error : "";
        const isBackendNotReady = errMsg.toLowerCase().includes("backend not ready");
        if (!isBackendNotReady || attempt === maxAttempts) {
          return res;
        }

        const delayMs = Math.min(250 * attempt, 2000);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
      return makeRequest(token);
    };

    const token = this.apiToken;
    let res = await requestWithBackendRetry(token);
    if (res.status === 401 && !token) {
      const retryToken = this.apiToken;
      if (retryToken) {
        res = await requestWithBackendRetry(retryToken);
      }
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText })) as Record<string, unknown>;
      const err = new Error((typeof body.error === "string" ? body.error : "") || `HTTP ${res.status}`);
      (err as Error & { status?: number; details?: Record<string, unknown> }).status = res.status;
      (err as Error & { status?: number; details?: Record<string, unknown> }).details = body;
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

  async installPlugin(name: string, autoRestart = true): Promise<{ ok: boolean; message?: string }> {
    return this.fetch("/api/plugins/install", {
      method: "POST",
      body: JSON.stringify({ name, autoRestart }),
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

  async getConfig(): Promise<UiConfigResponse> {
    return this.fetch("/api/config");
  }

  async updateConfig(patch: UiConfigResponse): Promise<UiConfigResponse> {
    return this.fetch("/api/config", { method: "PUT", body: JSON.stringify(patch) });
  }

  async getExtensionStatus(): Promise<ExtensionStatus> {
    return this.fetch("/api/extension/status");
  }

  // Wallet

  async getWalletAddresses(): Promise<WalletAddresses> { return this.fetch("/api/wallet/addresses"); }
  async getWalletBalances(): Promise<WalletBalancesResponse> { return this.fetch("/api/wallet/balances"); }
  async getWalletNfts(): Promise<WalletNftsResponse> { return this.fetch("/api/wallet/nfts"); }
  async getWalletConnectedData(): Promise<WalletConnectedDataResponse> { return this.fetch("/api/wallet/connected-data"); }
  async generateWallet(chain: WalletChain = "both"): Promise<WalletGenerateResponse> { return this.fetch("/api/wallet/generate", { method: "POST", body: JSON.stringify({ chain }) }); }
  async importWallet(chain: "evm" | "solana", privateKey: string): Promise<WalletImportResponse> { return this.fetch("/api/wallet/import", { method: "POST", body: JSON.stringify({ chain, privateKey }) }); }
  async getWalletConfig(): Promise<WalletConfigStatus> { return this.fetch("/api/wallet/config"); }
  async updateWalletConfig(config: Record<string, string>): Promise<{ ok: boolean }> { return this.fetch("/api/wallet/config", { method: "PUT", body: JSON.stringify(config) }); }
  async disconnectWallet(): Promise<{ ok: boolean }> {
    try {
      return await this.fetch("/api/wallet/disconnect", { method: "POST" });
    } catch (err) {
      const status = (err as Error & { status?: number }).status;
      // Compatibility fallback for older servers exposing only the v2 route.
      if (status === 404) {
        try {
          return await this.fetch("/api/v2/wallet/disconnect", {
            method: "POST",
          });
        } catch {
          // Fall through to config-clear fallback.
        }
      }
      try {
        // Route-independent fallback: request explicit wallet disconnect via
        // wallet config update so stale route/version mismatches don't block UX.
        await this.updateWalletConfig({
          EVM_ADDRESS: "",
          SOLANA_ADDRESS: "",
          WALLET_DISCONNECT: "1",
        });
        return { ok: true };
      } catch {
        // Preserve the original error when all fallback paths fail.
      }
      throw err;
    }
  }
  async exportWalletKeys(): Promise<WalletExportResult> { return this.fetch("/api/wallet/export", { method: "POST", body: JSON.stringify({ confirm: true }) }); }
  async getPolymarketPortfolio(): Promise<PolymarketPortfolioResponse> { return this.fetch("/api/polymarket/portfolio"); }

  async checkHandle(handle: string, ownerId?: string): Promise<HandleCheckResponse> {
    const params = new URLSearchParams({ handle });
    if (ownerId) params.set("ownerId", ownerId);
    return this.fetch(`/api/handles/check?${params.toString()}`);
  }

  async claimHandle(handle: string, ownerId: string, previousHandle?: string): Promise<HandleClaimResponse> {
    return this.fetch("/api/handles/claim", {
      method: "POST",
      body: JSON.stringify({ handle, ownerId, previousHandle }),
    });
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
  async sendChatRest(
    text: string,
    securityContext?: ChatSecurityContext,
    signal?: AbortSignal,
  ): Promise<{ text: string; agentName: string }> {
    if (this._useV2Api) {
      try {
        const v2 = await this.fetch<{
          userMessage: { id: string; sessionId: string; role: "user"; content: string; createdAt: string };
          assistantMessage: { id: string; sessionId: string; role: "assistant"; content: string; createdAt: string };
        }>("/api/v2/chat/messages", {
          method: "POST",
          body: JSON.stringify({
            content: text,
            ...(securityContext ? { securityContext } : {}),
          }),
          signal,
        });
        return {
          text: v2.assistantMessage?.content ?? "No assistant response returned.",
          agentName: "Milaidy",
        };
      } catch (err) {
        const status = (err as { status?: number }).status;
        // Non-breaking rollout: if v2 route isn't ready, fall back to legacy chat.
        if (status !== 404 && status !== 410 && status !== 503) {
          throw err;
        }
      }
    }

    return this.fetch<{ text: string; agentName: string }>("/api/chat", {
      method: "POST",
      body: JSON.stringify({
        text,
        ...(securityContext ? { securityContext } : {}),
      }),
      signal,
    });
  }

  /** @deprecated Prefer {@link sendChatRest} — WebSocket chat may silently drop messages. */
  sendChat(text: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "chat", text }));
    }
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
