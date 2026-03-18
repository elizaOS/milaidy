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
  const client = new CloudApiClient({ url: "http://localhost:2138", type: "local" });

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
        ok: true, status: 200,
        json: () => Promise.resolve({ ok: true, status: { state: "paused" } }),
      })
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: () => Promise.resolve({ ok: true, status: { state: "running" } }),
      });
    const result = await client.playAgent();
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result.status.state).toBe("running");
  });

  it("exportAgent() calls POST /api/agent/export with password", async () => {
    const blob = new Blob(["data"]);
    mockFetch.mockResolvedValueOnce({
      ok: true, status: 200,
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
});

describe("CloudClient", () => {
  const cc = new CloudClient("test-api-key");

  it("listAgents() calls GET /api/v1/milady/agents with X-Api-Key", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve([{ id: "a1", name: "Agent1", status: "running" }]),
    });
    const agents = await cc.listAgents();
    expect(mockFetch).toHaveBeenCalledWith(
      "https://www.elizacloud.ai/api/v1/milady/agents",
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
      "https://www.elizacloud.ai/api/v1/milady/agents/agent-123/suspend",
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
      "https://www.elizacloud.ai/api/v1/milady/agents/agent-123/resume",
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
      "https://www.elizacloud.ai/api/credits/balance",
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
      "https://www.elizacloud.ai/api/v1/milady/agents/agent-123/snapshot",
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
});
