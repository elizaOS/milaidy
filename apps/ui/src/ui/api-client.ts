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
  walletApiKeys?: {
    ALCHEMY_API_KEY?: string;
    HELIUS_API_KEY?: string;
  };
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
  isCore?: boolean; // True if plugin is in CORE_PLUGINS (essential for app to run)
  isActive?: boolean; // True if plugin is currently loaded in runtime
}

export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  timestamp: number;
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
export interface WalletConfigStatus { alchemyKeySet: boolean; heliusKeySet: boolean; birdeyeKeySet: boolean; evmChains: string[]; evmAddress: string | null; solanaAddress: string | null }
export interface WalletExportResult { evm: { privateKey: string; address: string | null } | null; solana: { privateKey: string; address: string | null } | null }

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

  // Wallet

  async getWalletAddresses(): Promise<WalletAddresses> { return this.fetch("/api/wallet/addresses"); }
  async getWalletBalances(): Promise<WalletBalancesResponse> { return this.fetch("/api/wallet/balances"); }
  async getWalletNfts(): Promise<WalletNftsResponse> { return this.fetch("/api/wallet/nfts"); }
  async getWalletConfig(): Promise<WalletConfigStatus> { return this.fetch("/api/wallet/config"); }
  async updateWalletConfig(config: Record<string, string>): Promise<{ ok: boolean }> { return this.fetch("/api/wallet/config", { method: "PUT", body: JSON.stringify(config) }); }
  async exportWalletKeys(): Promise<WalletExportResult> { return this.fetch("/api/wallet/export", { method: "POST", body: JSON.stringify({ confirm: true }) }); }

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
