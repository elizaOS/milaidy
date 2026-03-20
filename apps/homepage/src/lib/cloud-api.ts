import { clearToken } from "./auth";
import { CLOUD_BASE } from "./runtime-config";

export interface CloudAgentDetail {
  id: string;
  name: string;
  /** Backend returns agentName; mapped to name by listAgents(). */
  agentName?: string;
  status: string;
  model?: string;
  bridgeUrl?: string;
  webUiUrl?: string;
  tokens?: { used: number; limit: number };
  errors?: string[];
  createdAt?: string;
  updatedAt?: string;
  billing?: {
    plan?: string;
    costPerHour?: number;
    totalCost?: number;
    currency?: string;
  };
  uptime?: number;
  region?: string;
}

export interface CloudBackup {
  id: string;
  createdAt: string;
  size?: number;
}

export interface CreditBalance {
  balance: number;
  currency?: string;
}

export interface JobStatus {
  id: string;
  status: "pending" | "in_progress" | "completed" | "failed";
  result?: unknown;
  error?: string;
}

/**
 * Check if a response indicates an authentication failure.
 *
 * Note: 500 errors with generic messages ("Internal Server Error") are NOT treated
 * as auth failures — only when the backend explicitly returns auth-related text.
 * This prevents missing or unimplemented endpoints from triggering logout.
 */
function isCloudAuthFailure(status: number, message: string): boolean {
  // 401 is always an auth failure
  if (status === 401) return true;

  // 403/500 are only auth failures if they contain specific auth-related text
  // (not generic server errors)
  if (status === 403 || status === 500) {
    // Skip generic error messages that don't indicate auth problems
    if (/^Internal Server Error$/i.test(message.trim())) {
      return false;
    }
    // Check for explicit auth-related messages
    return /Invalid or expired API key|API key is inactive|API key has expired|Invalid or expired token/i.test(
      message,
    );
  }

  return false;
}

async function readErrorMessage(res: Response): Promise<string> {
  try {
    const body = await res.json();
    if (typeof body?.error === "string") return body.error;
    return JSON.stringify(body);
  } catch {
    try {
      return await res.text();
    } catch {
      return "";
    }
  }
}

export class CloudClient {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /** Expose the API key so authenticated launch token requests can use it. */
  getToken(): string {
    return this.apiKey;
  }

  /**
   * Make an authenticated request to the Cloud API.
   *
   * @param path - API endpoint path
   * @param opts - Fetch options
   * @param clearAuthOnFailure - If true, clear the stored token on auth failure.
   *   Only the primary auth-checking endpoint (listAgents) should set this to true.
   *   Secondary endpoints like credits/billing should fail gracefully without
   *   nuking auth state, since they may not be implemented on the backend yet.
   */
  private async request<T>(
    path: string,
    opts: RequestInit = {},
    clearAuthOnFailure = false,
  ): Promise<T> {
    const headers = new Headers(opts.headers);
    headers.set("X-Api-Key", this.apiKey);
    if (opts.body && typeof opts.body === "string") {
      headers.set("Content-Type", "application/json");
    }
    const res = await fetch(`${CLOUD_BASE}${path}`, { ...opts, headers });
    if (!res.ok) {
      const errorMessage = await readErrorMessage(res);
      // Only clear the token if this is a primary auth-checking endpoint
      // AND the response indicates an actual auth failure
      if (clearAuthOnFailure && isCloudAuthFailure(res.status, errorMessage)) {
        clearToken();
      }
      throw new Error(
        errorMessage
          ? `Cloud API ${res.status}: ${path}: ${errorMessage}`
          : `Cloud API ${res.status}: ${path}`,
      );
    }
    return res.json();
  }

  // Agent management
  async listAgents(): Promise<CloudAgentDetail[]> {
    // listAgents is the canonical auth-checking endpoint: if this fails with
    // an auth error, the token is definitely invalid and should be cleared.
    const data = await this.request<
      | CloudAgentDetail[]
      | { agents?: CloudAgentDetail[]; data?: CloudAgentDetail[] }
    >(
      "/api/v1/milady/agents",
      {
        method: "GET",
      },
      true, // clearAuthOnFailure: this is the primary auth check
    );
    const raw = Array.isArray(data)
      ? data
      : ((data as { agents?: CloudAgentDetail[]; data?: CloudAgentDetail[] })
          .agents ??
        (data as { agents?: CloudAgentDetail[]; data?: CloudAgentDetail[] })
          .data ??
        []);
    // Backend returns agentName; normalize to name for the rest of the app
    return raw.map((a) => ({
      ...a,
      name: a.agentName || a.name || a.id,
    }));
  }

  async getAgent(agentId: string): Promise<CloudAgentDetail> {
    return this.request(`/api/v1/milady/agents/${agentId}`, { method: "GET" });
  }

  async createAgent(config: {
    name: string;
    characterId?: string;
    config?: object;
    environmentVars?: Record<string, string>;
  }): Promise<{ id: string }> {
    // Backend expects agentName (not name) and agentConfig (not config)
    const payload: Record<string, unknown> = {
      agentName: config.name,
    };
    if (config.characterId) payload.characterId = config.characterId;
    if (config.config) payload.agentConfig = config.config;
    if (config.environmentVars)
      payload.environmentVars = config.environmentVars;

    const res = await this.request<{
      success?: boolean;
      data?: { id: string };
      id?: string;
    }>("/api/v1/milady/agents", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    // Backend wraps response in { success, data: { id, ... } }
    const id = res.data?.id ?? res.id ?? "";
    return { id };
  }

  async deleteAgent(agentId: string): Promise<void> {
    await this.request(`/api/v1/milady/agents/${agentId}`, {
      method: "DELETE",
    });
  }

  // Lifecycle
  async provisionAgent(agentId: string): Promise<{ jobId?: string }> {
    return this.request(`/api/v1/milady/agents/${agentId}/provision`, {
      method: "POST",
    });
  }

  async suspendAgent(agentId: string): Promise<void> {
    await this.request(`/api/v1/milady/agents/${agentId}/suspend`, {
      method: "POST",
    });
  }

  async resumeAgent(agentId: string): Promise<{ jobId?: string }> {
    return this.request(`/api/v1/milady/agents/${agentId}/resume`, {
      method: "POST",
    });
  }

  // Snapshots & backups
  async takeSnapshot(agentId: string): Promise<void> {
    await this.request(`/api/v1/milady/agents/${agentId}/snapshot`, {
      method: "POST",
    });
  }

  async listBackups(agentId: string): Promise<CloudBackup[]> {
    const data = await this.request<
      CloudBackup[] | { backups?: CloudBackup[]; data?: CloudBackup[] }
    >(`/api/v1/milady/agents/${agentId}/backups`, { method: "GET" });
    return Array.isArray(data)
      ? data
      : ((data as { backups?: CloudBackup[]; data?: CloudBackup[] }).backups ??
          (data as { backups?: CloudBackup[]; data?: CloudBackup[] }).data ??
          []);
  }

  async restoreBackup(agentId: string, backupId?: string): Promise<void> {
    await this.request(`/api/v1/milady/agents/${agentId}/restore`, {
      method: "POST",
      body: JSON.stringify(backupId ? { backupId } : {}),
    });
  }

  // Bridge (JSON-RPC to sandbox)
  async bridge(
    agentId: string,
    method: string,
    params?: object,
  ): Promise<Record<string, unknown>> {
    return this.request(`/api/v1/milady/agents/${agentId}/bridge`, {
      method: "POST",
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: crypto.randomUUID(),
        method,
        params: params ?? {},
      }),
    });
  }

  async getAgentBridgeStatus(
    agentId: string,
  ): Promise<{ state: string; uptime?: number; memories?: number }> {
    const res = await this.bridge(agentId, "status.get");
    return res.result ?? res;
  }

  // Credits & billing
  async getCreditsBalance(): Promise<CreditBalance> {
    return this.request("/api/credits/balance", { method: "GET" });
  }

  async getCreditsSummary(): Promise<object> {
    return this.request("/api/v1/credits/summary", { method: "GET" });
  }

  // Jobs (async operation polling)
  async getJobStatus(jobId: string): Promise<JobStatus> {
    return this.request(`/api/v1/jobs/${jobId}`, { method: "GET" });
  }

  async pollJobUntilDone(
    jobId: string,
    timeoutMs = 120000,
  ): Promise<JobStatus> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const job = await this.getJobStatus(jobId);
      if (job.status === "completed" || job.status === "failed") return job;
      await new Promise((r) => setTimeout(r, 2000));
    }
    throw new Error("Job timed out");
  }

  // Containers (for container-level monitoring)
  async listContainers(): Promise<Record<string, unknown>[]> {
    const data = await this.request<
      | Record<string, unknown>[]
      | {
          containers?: Record<string, unknown>[];
          data?: Record<string, unknown>[];
        }
    >("/api/v1/containers", {
      method: "GET",
    });
    return Array.isArray(data)
      ? data
      : ((
          data as {
            containers?: Record<string, unknown>[];
            data?: Record<string, unknown>[];
          }
        ).containers ??
          (
            data as {
              containers?: Record<string, unknown>[];
              data?: Record<string, unknown>[];
            }
          ).data ??
          []);
  }

  async getContainerHealth(containerId: string): Promise<object> {
    return this.request(`/api/v1/containers/${containerId}/health`, {
      method: "GET",
    });
  }

  async getContainerMetrics(containerId: string): Promise<object> {
    return this.request(`/api/v1/containers/${containerId}/metrics`, {
      method: "GET",
    });
  }

  async getContainerLogs(containerId: string): Promise<string> {
    const res = await fetch(
      `${CLOUD_BASE}/api/v1/containers/${containerId}/logs`,
      {
        headers: { "X-Api-Key": this.apiKey },
      },
    );
    if (!res.ok) throw new Error(`Logs ${res.status}`);
    return res.text();
  }

  // Billing settings
  async getBillingSettings(): Promise<object> {
    return this.request("/api/v1/billing/settings", { method: "GET" });
  }

  // Pairing token (for opening Web UI with auth handoff)
  async getPairingToken(agentId: string): Promise<{
    token: string;
    redirectUrl: string;
    expiresIn: number;
  }> {
    const res = await this.request<
      | { token: string; redirectUrl: string; expiresIn: number }
      | { data: { token: string; redirectUrl: string; expiresIn: number } }
    >(`/api/v1/milady/agents/${agentId}/pairing-token`, { method: "POST" });
    // Backend may wrap in { data: ... } or return flat
    if ("data" in res && res.data?.redirectUrl) return res.data;
    return res as { token: string; redirectUrl: string; expiresIn: number };
  }

  // Session info
  async getCurrentSession(): Promise<{
    credits?: number;
    requests?: number;
    tokens?: number;
  }> {
    return this.request("/api/sessions/current", { method: "GET" });
  }
}

export type ConnectionType = "local" | "remote" | "cloud";

export interface ConnectionInfo {
  url: string;
  type: ConnectionType;
  /** Optional bearer token for agents that require auth (e.g. MILADY_API_TOKEN).
   *  Sent as `Authorization: Bearer {authToken}`.
   *  Note: X-Api-Key is NOT used here because agent CORS only allows "Authorization". */
  authToken?: string;
}

export interface AgentStatus {
  state: "running" | "paused" | "stopped" | "provisioning" | "unknown";
  uptime?: number;
  memories?: number;
  agentName: string;
  model: string;
}

export interface MetricsData {
  cpu: number;
  memoryMb: number;
  diskMb: number;
  timestamp: string;
}

export interface LogEntry {
  level: "info" | "warn" | "error";
  message: string;
  timestamp: string;
  agentName: string;
}

/**
 * Synthetic health response returned when an agent is auth-gated but alive.
 * The `_synthetic` flag signals to callers that no real data was retrieved,
 * so they can skip further probes (like getAgentStatus).
 */
function makeUnauthenticatedHealthResponse() {
  return {
    status: "ok",
    ready: true,
    uptime: 0,
    agentState: "running",
    _synthetic: true as const,
  };
}

/**
 * Synthetic status returned when an agent is auth-gated but alive.
 */
function makeUnauthenticatedAgentStatus(): AgentStatus {
  return {
    state: "running",
    agentName: "",
    model: "—",
    uptime: 0,
  };
}

/**
 * Check if this is a Milady-hosted agent URL (milady.ai or waifu.fun).
 * These agents have known endpoint structures and don't need legacy fallbacks.
 */
function isMiladyAgent(url: string): boolean {
  return /milady\.ai|waifu\.fun/i.test(url);
}

export class CloudApiClient {
  private baseUrl: string;
  private type: ConnectionType;
  private authToken?: string;

  constructor(connection: ConnectionInfo) {
    this.baseUrl = connection.url.replace(/\/$/, "");
    this.type = connection.type;
    this.authToken = connection.authToken;
  }

  private buildHeaders(opts: RequestInit = {}): Headers {
    // Use Authorization for local/remote agents because their browser CORS policy
    // explicitly allows bearer auth, while custom headers like X-Api-Key may be blocked.
    const headers = new Headers(opts.headers);
    if (this.authToken) {
      headers.set("Authorization", `Bearer ${this.authToken}`);
    }
    return headers;
  }

  private async rawFetch(
    path: string,
    opts: RequestInit = {},
  ): Promise<Response> {
    return fetch(`${this.baseUrl}${path}`, {
      ...opts,
      headers: this.buildHeaders(opts),
    });
  }

  private async request<T>(path: string, opts: RequestInit = {}): Promise<T> {
    const res = await this.rawFetch(path, opts);
    if (!res.ok) throw new Error(`API ${res.status}: ${path}`);
    return res.json();
  }

  async health(options?: { signal?: AbortSignal }): Promise<{
    status?: string;
    ready?: boolean;
    uptime: number;
    memoryUsage?: object;
    agentState?: string;
    /** True if this is a synthetic response (agent is auth-gated but alive). */
    _synthetic?: boolean;
  }> {
    const fetchOpts: RequestInit = { method: "GET" };
    if (options?.signal) fetchOpts.signal = options.signal;

    const primary = await this.rawFetch("/api/health", fetchOpts);
    if (primary.ok) {
      return primary.json();
    }

    // If auth is required (401/403) and we don't have a token, the agent is
    // alive but auth-gated. Return a synthetic "running" response immediately.
    // No need to probe additional endpoints — a 401 proves the agent is up.
    if (primary.status === 401 || primary.status === 403) {
      if (!this.authToken) {
        // Agent is alive (returned 401), just auth-protected.
        return makeUnauthenticatedHealthResponse();
      }
      // We have a token but it was rejected — that's a real auth failure.
      throw new Error(`API ${primary.status}: /api/health`);
    }

    if (primary.status !== 404) {
      throw new Error(`API ${primary.status}: /api/health`);
    }

    // Only try legacy /health fallback for non-Milady agents.
    // Milady agents always have /api/health, so 404 means something is wrong.
    if (isMiladyAgent(this.baseUrl)) {
      throw new Error(`API ${primary.status}: /api/health`);
    }

    const fallback = await this.rawFetch("/health", fetchOpts);
    if (!fallback.ok) {
      throw new Error(`API ${fallback.status}: /health`);
    }
    return fallback.json();
  }

  async getAgentStatus(options?: {
    signal?: AbortSignal;
  }): Promise<AgentStatus> {
    // Our self-hosted agents expose /api/status (not /api/agent/status).
    // Try /api/status first (returns agentName, state, uptime directly),
    // then fall back to /api/agent/status for compatibility with older or
    // partially implemented backends.
    const fetchOpts: RequestInit = { method: "GET" };
    if (options?.signal) fetchOpts.signal = options.signal;

    const primary = await this.rawFetch("/api/status", fetchOpts);
    if (primary.ok) {
      try {
        const data = (await primary.json()) as {
          state?: string;
          agentName?: string;
          uptime?: number;
          memories?: number;
          model?: string;
        };
        if (data.state) {
          return {
            state: data.state as AgentStatus["state"],
            agentName: data.agentName ?? "Agent",
            model: data.model ?? "—",
            uptime: data.uptime,
            memories: data.memories,
          };
        }
      } catch {
        // Invalid JSON, fall through to legacy endpoint
      }
    } else if (primary.status === 401 || primary.status === 403) {
      // If /api/status is auth-gated and we don't have a token, the agent is
      // alive but protected. Return a synthetic "running" response immediately.
      if (!this.authToken) {
        return makeUnauthenticatedAgentStatus();
      }
      // We have a token but it was rejected — that's a real auth failure.
      throw new Error(`API ${primary.status}: /api/status`);
    } else if (primary.status !== 404) {
      throw new Error(`API ${primary.status}: /api/status`);
    }

    // Only try legacy /api/agent/status fallback for non-Milady agents.
    // Milady agents always have /api/status, so 404/error means something is wrong.
    if (isMiladyAgent(this.baseUrl)) {
      throw new Error(`API ${primary.status}: /api/status`);
    }

    const legacy = await this.rawFetch("/api/agent/status", fetchOpts);
    if (legacy.ok) {
      return legacy.json();
    }
    if (legacy.status === 401 || legacy.status === 403) {
      if (!this.authToken) {
        return makeUnauthenticatedAgentStatus();
      }
      throw new Error(`API ${legacy.status}: /api/agent/status`);
    }
    throw new Error(`API ${legacy.status}: /api/agent/status`);
  }

  async startAgent(): Promise<{ ok: boolean; status: { state: string } }> {
    return this.request("/api/agent/start", { method: "POST" });
  }

  async stopAgent(): Promise<{ ok: boolean; status: { state: string } }> {
    return this.request("/api/agent/stop", { method: "POST" });
  }

  async pauseAgent(): Promise<{ ok: boolean; status: { state: string } }> {
    return this.request("/api/agent/pause", { method: "POST" });
  }

  async resumeAgent(): Promise<{ ok: boolean; status: { state: string } }> {
    return this.request("/api/agent/resume", { method: "POST" });
  }

  async playAgent(): Promise<{ ok: boolean; status: { state: string } }> {
    await this.startAgent();
    return this.resumeAgent();
  }

  async exportAgent(password: string, includeLogs?: boolean): Promise<Blob> {
    const headers = this.buildHeaders();
    headers.set("Content-Type", "application/json");

    const res = await fetch(`${this.baseUrl}/api/agent/export`, {
      method: "POST",
      headers,
      body: JSON.stringify({ password, includeLogs }),
    });
    if (!res.ok) throw new Error(`Export failed: ${res.status}`);
    return res.blob();
  }

  async estimateExportSize(): Promise<{ sizeBytes: number }> {
    return this.request("/api/agent/export/estimate", { method: "GET" });
  }

  async importAgent(file: File, password: string): Promise<{ ok: boolean }> {
    const passwordBytes = new TextEncoder().encode(password);
    const fileBytes = new Uint8Array(await file.arrayBuffer());
    const lengthBuf = new ArrayBuffer(4);
    new DataView(lengthBuf).setUint32(0, passwordBytes.length);
    const envelope = new Blob([lengthBuf, passwordBytes, fileBytes]);
    const res = await fetch(`${this.baseUrl}/api/agent/import`, {
      method: "POST",
      headers: this.buildHeaders(),
      body: envelope,
    });
    if (!res.ok) throw new Error(`Import failed: ${res.status}`);
    return res.json();
  }

  async getMetrics(): Promise<MetricsData[]> {
    return this.request("/api/metrics", { method: "GET" });
  }

  async getLogs(opts?: {
    limit?: number;
    level?: string;
  }): Promise<LogEntry[]> {
    const params = new URLSearchParams();
    if (opts?.limit) params.set("limit", String(opts.limit));
    if (opts?.level) params.set("level", opts.level);
    const qs = params.toString();
    return this.request(`/api/logs${qs ? `?${qs}` : ""}`, { method: "GET" });
  }

  async getBilling(): Promise<object> {
    return this.request("/api/billing", { method: "GET" });
  }
}
