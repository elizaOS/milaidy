import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CloudApiClient, CloudClient } from "../lib/cloud-api";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

beforeEach(() => {
  mockFetch.mockReset();
  localStorage.clear();
});
afterEach(() => localStorage.clear());

describe("CloudApiClient", () => {
  const client = new CloudApiClient({
    url: "http://localhost:2138",
    type: "local",
  });

  it("health() calls GET /api/health", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ status: "ok", uptime: 100 }),
    });
    const result = await client.health();
    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:2138/api/health",
      expect.objectContaining({ method: "GET" }),
    );
    expect(result.status).toBe("ok");
  });

  it("health() falls back to /health when /api/health returns 404", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 404 })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ status: "ok", uptime: 50 }),
      });

    const result = await client.health();

    expect(mockFetch).toHaveBeenNthCalledWith(
      1,
      "http://localhost:2138/api/health",
      expect.objectContaining({ method: "GET" }),
    );
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      "http://localhost:2138/health",
      expect.objectContaining({ method: "GET" }),
    );
    expect(result.status).toBe("ok");
  });

  it("startAgent() calls POST /api/agent/start", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ ok: true, status: { state: "paused" } }),
    });
    const result = await client.startAgent();
    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:2138/api/agent/start",
      expect.objectContaining({ method: "POST" }),
    );
    expect(result.ok).toBe(true);
  });

  it("playAgent() chains start then resume", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ ok: true, status: { state: "paused" } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ ok: true, status: { state: "running" } }),
      });
    const result = await client.playAgent();
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result.status.state).toBe("running");
  });

  it("exportAgent() calls POST /api/agent/export with password", async () => {
    const blob = new Blob(["data"]);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      blob: () => Promise.resolve(blob),
    });
    const result = await client.exportAgent("mypass");
    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:2138/api/agent/export",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ password: "mypass" }),
      }),
    );
    expect(result).toBeInstanceOf(Blob);
  });

  it("exportAgent() forwards Authorization for remote agents", async () => {
    const remoteClient = new CloudApiClient({
      url: "https://agent.example.com",
      type: "remote",
      authToken: "secret-token",
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      blob: () => Promise.resolve(new Blob(["data"])),
    });

    await remoteClient.exportAgent("mypass");

    const headers = mockFetch.mock.calls[0][1].headers as Headers;
    expect(headers.get("Authorization")).toBe("Bearer secret-token");
  });

  it("stopAgent() calls POST /api/agent/stop", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ ok: true, status: { state: "stopped" } }),
    });
    const result = await client.stopAgent();
    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:2138/api/agent/stop",
      expect.objectContaining({ method: "POST" }),
    );
    expect(result.ok).toBe(true);
  });

  it("pauseAgent() calls POST /api/agent/pause", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ ok: true, status: { state: "paused" } }),
    });
    const result = await client.pauseAgent();
    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:2138/api/agent/pause",
      expect.objectContaining({ method: "POST" }),
    );
    expect(result.ok).toBe(true);
  });

  it("resumeAgent() calls POST /api/agent/resume", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ ok: true, status: { state: "running" } }),
    });
    const result = await client.resumeAgent();
    expect(result.ok).toBe(true);
  });

  it("getAgentStatus() calls GET /api/agent/status", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          agentName: "Test",
          model: "gpt-4",
          state: "running",
        }),
    });
    const result = await client.getAgentStatus();
    expect(result.agentName).toBe("Test");
    expect(result.state).toBe("running");
  });

  it("getMetrics() calls GET /api/metrics", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve([
          {
            cpu: 50,
            memoryMb: 512,
            diskMb: 1024,
            timestamp: "2026-01-01T00:00:00Z",
          },
        ]),
    });
    const result = await client.getMetrics();
    expect(result).toHaveLength(1);
    expect(result[0].cpu).toBe(50);
  });

  it("getLogs() calls GET /api/logs with query params", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve([
          {
            level: "info",
            message: "test",
            timestamp: "2026-01-01",
            agentName: "A",
          },
        ]),
    });
    const result = await client.getLogs({ limit: 10, level: "error" });
    expect(mockFetch.mock.calls[0][0]).toContain(
      "/api/logs?limit=10&level=error",
    );
    expect(result).toHaveLength(1);
  });

  it("getLogs() calls GET /api/logs without query params when none given", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve([]),
    });
    await client.getLogs();
    expect(mockFetch.mock.calls[0][0]).toBe("http://localhost:2138/api/logs");
  });

  it("estimateExportSize() calls GET /api/agent/export/estimate", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ sizeBytes: 1048576 }),
    });
    const result = await client.estimateExportSize();
    expect(result.sizeBytes).toBe(1048576);
  });

  it("importAgent() builds binary envelope correctly", async () => {
    const mockFile = new File(["file-content"], "test.bin");
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ ok: true }),
    });
    const result = await client.importAgent(mockFile, "pass");
    const body = mockFetch.mock.calls[0][1].body;
    expect(body).toBeInstanceOf(Blob);
    expect(result.ok).toBe(true);
  });

  it("importAgent() forwards Authorization for remote agents", async () => {
    const remoteClient = new CloudApiClient({
      url: "https://agent.example.com",
      type: "remote",
      authToken: "secret-token",
    });
    const mockFile = new File(["file-content"], "test.bin");

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ ok: true }),
    });

    await remoteClient.importAgent(mockFile, "pass");

    const headers = mockFetch.mock.calls[0][1].headers as Headers;
    expect(headers.get("Authorization")).toBe("Bearer secret-token");
  });

  it("getBilling() calls GET /api/billing", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ plan: "pro" }),
    });
    const result = await client.getBilling();
    expect(result).toEqual({ plan: "pro" });
  });

  it("throws on non-ok response", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });
    await expect(client.health()).rejects.toThrow("API 500");
  });

  it("strips trailing slash from URL", () => {
    const c = new CloudApiClient({
      url: "http://localhost:2138/",
      type: "local",
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ status: "ok", uptime: 0 }),
    });
    c.health();
    expect(mockFetch.mock.calls[0][0]).toBe("http://localhost:2138/api/health");
  });
});

describe("CloudClient", () => {
  const cc = new CloudClient("test-api-key");

  it("listAgents() calls GET /api/v1/milady/agents with X-Api-Key", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve([{ id: "a1", name: "Agent1", status: "running" }]),
    });
    const agents = await cc.listAgents();
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/milady/agents"),
      expect.objectContaining({ method: "GET" }),
    );
    // Verify X-Api-Key header
    const call = mockFetch.mock.calls[0];
    const headers = call[1].headers as Headers;
    expect(headers.get("X-Api-Key")).toBe("test-api-key");
    expect(agents).toHaveLength(1);
    expect(agents[0].id).toBe("a1");
  });

  it("suspendAgent() calls POST /api/v1/milady/agents/:id/suspend", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
    });
    await cc.suspendAgent("agent-123");
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/milady/agents/agent-123/suspend"),
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("resumeAgent() calls POST /api/v1/milady/agents/:id/resume", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ jobId: "job-1" }),
    });
    const result = await cc.resumeAgent("agent-123");
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/milady/agents/agent-123/resume"),
      expect.objectContaining({ method: "POST" }),
    );
    expect(result.jobId).toBe("job-1");
  });

  it("getCreditsBalance() calls GET /api/credits/balance", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ balance: 5000, currency: "credits" }),
    });
    const balance = await cc.getCreditsBalance();
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/credits/balance"),
      expect.objectContaining({ method: "GET" }),
    );
    expect(balance.balance).toBe(5000);
  });

  it("takeSnapshot() calls POST /api/v1/milady/agents/:id/snapshot", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
    });
    await cc.takeSnapshot("agent-123");
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/milady/agents/agent-123/snapshot"),
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("listBackups() calls GET /api/v1/milady/agents/:id/backups", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve([{ id: "b1", createdAt: "2026-01-01" }]),
    });
    const backups = await cc.listBackups("agent-123");
    expect(backups).toHaveLength(1);
    expect(backups[0].id).toBe("b1");
  });

  it("throws on non-ok response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: () => Promise.resolve({ error: "forbidden" }),
    });
    await expect(cc.listAgents()).rejects.toThrow("Cloud API 403");
  });

  it("deleteAgent() calls DELETE", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
    });
    await cc.deleteAgent("agent-1");
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/milady/agents/agent-1"),
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("provisionAgent() calls POST provision", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 202,
      json: () => Promise.resolve({ jobId: "job-1" }),
    });
    const result = await cc.provisionAgent("agent-1");
    expect(result.jobId).toBe("job-1");
    expect(mockFetch.mock.calls[0][0]).toContain("/agent-1/provision");
  });

  it("bridge() sends JSON-RPC", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ result: { state: "running" } }),
    });
    const result = await cc.bridge("agent-1", "status.get");
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.method).toBe("status.get");
    expect(body.jsonrpc).toBe("2.0");
    expect(body.id).toBeDefined();
    expect(result.result.state).toBe("running");
  });

  it("bridge() passes params", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ result: {} }),
    });
    await cc.bridge("agent-1", "config.set", { key: "value" });
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.params).toEqual({ key: "value" });
  });

  it("getAgentBridgeStatus() returns result from bridge", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({ result: { state: "running", uptime: 100 } }),
    });
    const status = await cc.getAgentBridgeStatus("agent-1");
    expect(status.state).toBe("running");
    expect(status.uptime).toBe(100);
  });

  it("getContainerLogs() returns text", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: () => Promise.resolve("log line 1\nlog line 2"),
    });
    const logs = await cc.getContainerLogs("container-1");
    expect(logs).toContain("log line 1");
    expect(logs).toContain("log line 2");
  });

  it("getContainerLogs() throws on non-ok", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });
    await expect(cc.getContainerLogs("missing")).rejects.toThrow("Logs 404");
  });

  it("getCurrentSession() returns session stats", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ credits: 100, requests: 50, tokens: 1000 }),
    });
    const session = await cc.getCurrentSession();
    expect(session.credits).toBe(100);
    expect(session.requests).toBe(50);
    expect(session.tokens).toBe(1000);
  });

  it("createAgent() sends config as body", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ success: true, data: { id: "new-agent" } }),
    });
    const result = await cc.createAgent({ name: "Test Agent" });
    expect(result.id).toBe("new-agent");
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.agentName).toBe("Test Agent");
  });

  it("getAgent() calls GET /api/v1/milady/agents/:id", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({ id: "a1", name: "Agent1", status: "running" }),
    });
    const agent = await cc.getAgent("a1");
    expect(agent.id).toBe("a1");
    expect(mockFetch.mock.calls[0][0]).toContain("/agents/a1");
  });

  it("restoreBackup() sends backupId in body", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
    });
    await cc.restoreBackup("agent-1", "backup-42");
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.backupId).toBe("backup-42");
  });

  it("restoreBackup() sends empty body when no backupId", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
    });
    await cc.restoreBackup("agent-1");
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body).toEqual({});
  });

  it("getJobStatus() calls GET /api/v1/jobs/:id", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ id: "j1", status: "completed" }),
    });
    const job = await cc.getJobStatus("j1");
    expect(job.status).toBe("completed");
    expect(mockFetch.mock.calls[0][0]).toContain("/jobs/j1");
  });

  it("listContainers() returns array", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve([{ id: "c1" }]),
    });
    const containers = await cc.listContainers();
    expect(containers).toHaveLength(1);
  });

  it("listContainers() unwraps nested data", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ containers: [{ id: "c1" }, { id: "c2" }] }),
    });
    const containers = await cc.listContainers();
    expect(containers).toHaveLength(2);
  });

  it("getContainerHealth() calls GET /api/v1/containers/:id/health", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ healthy: true }),
    });
    const health = await cc.getContainerHealth("c1");
    expect(health).toEqual({ healthy: true });
  });

  it("getContainerMetrics() calls GET /api/v1/containers/:id/metrics", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ cpu: 25 }),
    });
    const metrics = await cc.getContainerMetrics("c1");
    expect(metrics).toEqual({ cpu: 25 });
  });

  it("getCreditsSummary() calls GET /api/v1/credits/summary", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ total: 500 }),
    });
    const summary = await cc.getCreditsSummary();
    expect(summary).toEqual({ total: 500 });
  });

  it("listAgents() unwraps nested agents property", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ agents: [{ id: "a1" }, { id: "a2" }] }),
    });
    const agents = await cc.listAgents();
    expect(agents).toHaveLength(2);
  });

  it("listAgents() unwraps nested data property", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ data: [{ id: "a1" }] }),
    });
    const agents = await cc.listAgents();
    expect(agents).toHaveLength(1);
  });

  it("listBackups() unwraps nested backups property", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({ backups: [{ id: "b1", createdAt: "2026-01-01" }] }),
    });
    const backups = await cc.listBackups("agent-1");
    expect(backups).toHaveLength(1);
  });

  it("sets Content-Type for JSON body requests", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ id: "new" }),
    });
    await cc.createAgent({ name: "Test" });
    const headers = mockFetch.mock.calls[0][1].headers as Headers;
    expect(headers.get("Content-Type")).toBe("application/json");
  });
});
