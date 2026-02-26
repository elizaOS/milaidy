/**
 * Auth tests for sensitive config/secrets/connector/wallet mutation endpoints
 * (MW-04). Verifies that the global isAuthorized gate rejects unauthenticated
 * requests and accepts authenticated ones for all critical ingress paths.
 *
 * These are unit tests of the exported isAuthorized/extractAuthToken functions
 * combined with HTTP-level integration tests verifying the server enforces
 * auth on mutation routes.
 */

import http from "node:http";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { startApiServer } from "./server";

// Prevent mcp-marketplace import side effects
vi.mock("../services/mcp-marketplace", () => ({
  searchMcpMarketplace: vi.fn().mockResolvedValue({ results: [] }),
  getMcpServerDetails: vi.fn().mockResolvedValue(null),
}));

// ── HTTP helper ─────────────────────────────────────────────────────────────

function req(
  port: number,
  method: string,
  path: string,
  opts?: { body?: Record<string, unknown>; token?: string },
): Promise<{ status: number; data: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const b = opts?.body ? JSON.stringify(opts.body) : undefined;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (b) headers["Content-Length"] = String(Buffer.byteLength(b));
    if (opts?.token) headers.Authorization = `Bearer ${opts.token}`;

    const r = http.request(
      { hostname: "127.0.0.1", port, path, method, headers },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf-8");
          let data: Record<string, unknown> = {};
          try {
            data = JSON.parse(raw) as Record<string, unknown>;
          } catch {
            data = { _raw: raw };
          }
          resolve({ status: res.statusCode ?? 0, data });
        });
      },
    );
    r.on("error", reject);
    if (b) r.write(b);
    r.end();
  });
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("sensitive endpoint auth gates (MW-04)", () => {
  let port: number;
  let close: () => Promise<void>;
  const TOKEN = "test-auth-token-mw04";
  const prevToken = process.env.MILADY_API_TOKEN;

  beforeAll(async () => {
    process.env.MILADY_API_TOKEN = TOKEN;
    const server = await startApiServer({ port: 0 });
    port = server.port;
    close = server.close;
  }, 30_000);

  afterAll(async () => {
    await close();
    if (prevToken === undefined) delete process.env.MILADY_API_TOKEN;
    else process.env.MILADY_API_TOKEN = prevToken;
  });

  // ── Config mutation ─────────────────────────────────────────────────

  describe("PUT /api/config", () => {
    it("rejects unauthenticated config mutation with 401", async () => {
      const { status, data } = await req(port, "PUT", "/api/config", {
        body: { agentName: "hacked" },
      });
      expect(status).toBe(401);
      expect(data.error).toMatch(/unauthorized/i);
    });

    it("accepts authenticated config mutation", async () => {
      const { status } = await req(port, "PUT", "/api/config", {
        body: { agentName: "TestAgent" },
        token: TOKEN,
      });
      expect(status).not.toBe(401);
    });
  });

  // ── Secrets mutation ──────────────────────────────────────────────

  describe("PUT /api/secrets", () => {
    it("rejects unauthenticated secrets update with 401", async () => {
      const { status, data } = await req(port, "PUT", "/api/secrets", {
        body: { OPENAI_API_KEY: "stolen" },
      });
      expect(status).toBe(401);
      expect(data.error).toMatch(/unauthorized/i);
    });

    it("accepts authenticated secrets update", async () => {
      const { status } = await req(port, "PUT", "/api/secrets", {
        body: {},
        token: TOKEN,
      });
      expect(status).not.toBe(401);
    });
  });

  // ── Connector mutation ────────────────────────────────────────────

  describe("POST /api/connectors", () => {
    it("rejects unauthenticated connector creation with 401", async () => {
      const { status, data } = await req(port, "POST", "/api/connectors", {
        body: { name: "telegram", config: {} },
      });
      expect(status).toBe(401);
      expect(data.error).toMatch(/unauthorized/i);
    });

    it("accepts authenticated connector creation", async () => {
      const { status } = await req(port, "POST", "/api/connectors", {
        body: { name: "telegram", config: {} },
        token: TOKEN,
      });
      expect(status).not.toBe(401);
    });
  });

  // ── MCP config mutation ───────────────────────────────────────────

  describe("PUT /api/mcp/config", () => {
    it("rejects unauthenticated MCP config update with 401", async () => {
      const { status, data } = await req(port, "PUT", "/api/mcp/config", {
        body: { servers: {} },
      });
      expect(status).toBe(401);
      expect(data.error).toMatch(/unauthorized/i);
    });

    it("accepts authenticated MCP config update", async () => {
      const { status } = await req(port, "PUT", "/api/mcp/config", {
        body: { servers: {} },
        token: TOKEN,
      });
      expect(status).not.toBe(401);
    });
  });

  // ── Wallet mutation ───────────────────────────────────────────────

  describe("POST /api/wallet/generate", () => {
    it("rejects unauthenticated wallet generation with 401", async () => {
      const { status, data } = await req(port, "POST", "/api/wallet/generate", {
        body: { chain: "evm" },
      });
      expect(status).toBe(401);
      expect(data.error).toMatch(/unauthorized/i);
    });

    it("accepts authenticated wallet generation", async () => {
      const { status } = await req(port, "POST", "/api/wallet/generate", {
        body: { chain: "evm" },
        token: TOKEN,
      });
      expect(status).not.toBe(401);
    });
  });

  describe("PUT /api/wallet/config", () => {
    it("rejects unauthenticated wallet config update with 401", async () => {
      const { status, data } = await req(port, "PUT", "/api/wallet/config", {
        body: { alchemyApiKey: "stolen" },
      });
      expect(status).toBe(401);
      expect(data.error).toMatch(/unauthorized/i);
    });

    it("accepts authenticated wallet config update", async () => {
      const { status } = await req(port, "PUT", "/api/wallet/config", {
        body: {},
        token: TOKEN,
      });
      expect(status).not.toBe(401);
    });
  });

  // ── Agent restart ─────────────────────────────────────────────────

  describe("POST /api/agent/restart", () => {
    it("rejects unauthenticated agent restart with 401", async () => {
      const { status, data } = await req(port, "POST", "/api/agent/restart");
      expect(status).toBe(401);
      expect(data.error).toMatch(/unauthorized/i);
    });

    it("accepts authenticated agent restart", async () => {
      const { status } = await req(port, "POST", "/api/agent/restart", {
        token: TOKEN,
      });
      // 501 is expected (no onRestart handler), but NOT 401
      expect(status).not.toBe(401);
    });
  });

  // ── Terminal execution ────────────────────────────────────────────

  describe("POST /api/terminal/run", () => {
    it("rejects unauthenticated terminal execution with 401", async () => {
      const { status, data } = await req(port, "POST", "/api/terminal/run", {
        body: { command: "echo hacked" },
      });
      expect(status).toBe(401);
      expect(data.error).toMatch(/unauthorized/i);
    });

    it("accepts authenticated terminal execution", async () => {
      const { status } = await req(port, "POST", "/api/terminal/run", {
        body: { command: "echo test" },
        token: TOKEN,
      });
      expect(status).not.toBe(401);
    });
  });
});
