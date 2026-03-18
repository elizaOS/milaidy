export const CLOUD_BASE = "https://www.elizacloud.ai";

export interface CloudAgentDetail {
  id: string;
  agentName: string;
  name?: string; // fallback
  status: string;
  databaseStatus?: string;
  model?: string;
  bridgeUrl?: string;
  tokens?: { used: number; limit: number };
  errorMessage?: string | null;
  lastBackupAt?: string | null;
  lastHeartbeatAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  token_address?: string | null;
  token_chain?: string | null;
  token_name?: string | null;
  token_ticker?: string | null;
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

export interface BridgeResponse {
  jsonrpc: string;
  id: string;
  result?: Record<string, unknown>;
  error?: { code: number; message: string };
}

export class CloudClient {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async request<T>(path: string, opts: RequestInit = {}): Promise<T> {
    const headers = new Headers(opts.headers);
    headers.set("X-Api-Key", this.apiKey);
    if (opts.body && typeof opts.body === "string") {
      headers.set("Content-Type", "application/json");
    }
    const res = await fetch(`${CLOUD_BASE}${path}`, { ...opts, headers });
    if (!res.ok) throw new Error(`Cloud API ${res.status}: ${path}`);
    return res.json();
  }

  // Agent management
  async listAgents(): Promise<CloudAgentDetail[]> {
    // Cloud API returns { success: true, data: [...] }
    const json = await this.request<Record<string, unknown>>(
      "/api/v1/milady/agents",
      {
        method: "GET",
      },
    );
    const agents =
      (json as { data?: CloudAgentDetail[] }).data ??
      (json as { agents?: CloudAgentDetail[] }).agents ??
      (Array.isArray(json) ? json : []);
    return agents as CloudAgentDetail[];
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
    return this.request("/api/v1/milady/agents", {
      method: "POST",
      body: JSON.stringify(config),
    });
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
  ): Promise<BridgeResponse> {
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
    return (res.result ?? res) as {
      state: string;
      uptime?: number;
      memories?: number;
    };
  }

  // Credits & billing
  async getCreditsBalance(): Promise<CreditBalance> {
    return this.request("/api/credits/balance", { method: "GET" });
  }

  async getCreditsSummary(): Promise<Record<string, unknown>> {
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

  async getContainerHealth(
    containerId: string,
  ): Promise<Record<string, unknown>> {
    return this.request(`/api/v1/containers/${containerId}/health`, {
      method: "GET",
    });
  }

  async getContainerMetrics(
    containerId: string,
  ): Promise<Record<string, unknown>> {
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
  async getBillingSettings(): Promise<Record<string, unknown>> {
    return this.request("/api/v1/billing/settings", { method: "GET" });
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

export class CloudApiClient {
  private baseUrl: string;
  private type: ConnectionType;

  constructor(connection: ConnectionInfo) {
    this.baseUrl = connection.url.replace(/\/$/, "");
    this.type = connection.type;
  }

  private async request<T>(path: string, opts: RequestInit = {}): Promise<T> {
    // Use plain fetch — local/remote agents don't use cloud API keys.
    // fetchWithAuth would leak the cloud API key to arbitrary URLs.
    const res = await fetch(`${this.baseUrl}${path}`, opts);
    if (!res.ok) throw new Error(`API ${res.status}: ${path}`);
    return res.json();
  }

  async health(): Promise<{
    status: string;
    uptime: number;
    memoryUsage?: Record<string, unknown>;
  }> {
    return this.request("/api/health", { method: "GET" });
  }

  async getAgentStatus(): Promise<AgentStatus> {
    return this.request("/api/agent/status", { method: "GET" });
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
    const res = await fetch(`${this.baseUrl}/api/agent/export`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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

  async getBilling(): Promise<Record<string, unknown>> {
    return this.request("/api/billing", { method: "GET" });
  }
}
