import { fetchWithAuth } from "./auth";

export type ConnectionType = "local" | "remote" | "cloud";

export interface ConnectionInfo {
  url: string;
  type: ConnectionType;
}

export interface AgentStatus {
  state: "running" | "paused" | "stopped";
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
    const res = await fetchWithAuth(`${this.baseUrl}${path}`, opts);
    if (!res.ok) throw new Error(`API ${res.status}: ${path}`);
    return res.json();
  }

  async health(): Promise<{ status: string; uptime: number; memoryUsage?: object }> {
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
    const res = await fetchWithAuth(`${this.baseUrl}/api/agent/export`, {
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
    const res = await fetchWithAuth(`${this.baseUrl}/api/agent/import`, {
      method: "POST",
      body: envelope,
    });
    if (!res.ok) throw new Error(`Import failed: ${res.status}`);
    return res.json();
  }

  async getMetrics(): Promise<MetricsData[]> {
    return this.request("/api/metrics", { method: "GET" });
  }

  async getLogs(opts?: { limit?: number; level?: string }): Promise<LogEntry[]> {
    const params = new URLSearchParams();
    if (opts?.limit) params.set("limit", String(opts.limit));
    if (opts?.level) params.set("level", opts.level);
    const qs = params.toString();
    return this.request(`/api/logs${qs ? `?${qs}` : ""}`, { method: "GET" });
  }

  async getBilling(): Promise<object> {
    return this.request("/api/billing", { method: "GET" });
  }

  async cloudLogin(): Promise<{ ok: boolean; sessionId: string; browserUrl: string }> {
    return this.request("/api/cloud/login", { method: "POST" });
  }

  async cloudLoginPoll(sessionId: string): Promise<{ status: string; apiKey?: string }> {
    return this.request(`/api/cloud/login/status?sessionId=${encodeURIComponent(sessionId)}`, { method: "GET" });
  }
}
