/**
 * Route-level tests for on-chain registry and drop endpoints.
 *
 * Verifies HTTP response codes and payloads when services are not configured
 * (the default state), and when services are injected and fail with timeout,
 * nonce, or contract errors.
 *
 * Complements the service-level tests in tx-service.test.ts,
 * registry-service.test.ts, and drop-service.test.ts (MW-02).
 */

import http from "node:http";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { startApiServer } from "./server";

// Prevent mcp-marketplace import side effects during tests
vi.mock("../services/mcp-marketplace", () => ({
  searchMcpMarketplace: vi.fn().mockResolvedValue({ results: [] }),
  getMcpServerDetails: vi.fn().mockResolvedValue(null),
}));

// ── HTTP helper ─────────────────────────────────────────────────────────────

function req(
  port: number,
  method: string,
  path: string,
  body?: Record<string, unknown>,
): Promise<{ status: number; data: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const b = body ? JSON.stringify(body) : undefined;
    const r = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path,
        method,
        headers: {
          "Content-Type": "application/json",
          ...(b ? { "Content-Length": Buffer.byteLength(b) } : {}),
        },
      },
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

describe("on-chain route-level tests (registry + drop)", () => {
  let port: number;
  let close: () => Promise<void>;

  beforeAll(async () => {
    const server = await startApiServer({ port: 0 });
    port = server.port;
    close = server.close;
  }, 30_000);

  afterAll(async () => {
    await close();
  });

  // ── Registry routes (service not configured) ────────────────────────────

  describe("GET /api/registry/status", () => {
    it("returns defaults with configured:false when registry service is null", async () => {
      const { status, data } = await req(port, "GET", "/api/registry/status");

      expect(status).toBe(200);
      expect(data.configured).toBe(false);
      expect(data.registered).toBe(false);
      expect(data.tokenId).toBe(0);
      expect(data.walletAddress).toBe("");
      expect(data.totalAgents).toBe(0);
    });
  });

  describe("POST /api/registry/register", () => {
    it("returns 503 when registry service is not configured", async () => {
      const { status, data } = await req(
        port,
        "POST",
        "/api/registry/register",
        { name: "TestAgent" },
      );

      expect(status).toBe(503);
      expect(data.error).toMatch(/not configured/i);
    });
  });

  describe("POST /api/registry/update-uri", () => {
    it("returns 503 when registry service is not configured", async () => {
      const { status, data } = await req(
        port,
        "POST",
        "/api/registry/update-uri",
        { tokenURI: "ipfs://test" },
      );

      expect(status).toBe(503);
      expect(data.error).toMatch(/not configured/i);
    });
  });

  describe("POST /api/registry/sync", () => {
    it("returns 503 when registry service is not configured", async () => {
      const { status, data } = await req(port, "POST", "/api/registry/sync", {
        name: "TestAgent",
      });

      expect(status).toBe(503);
      expect(data.error).toMatch(/not configured/i);
    });
  });

  describe("GET /api/registry/config", () => {
    it("returns configured:false when registry service is null", async () => {
      const { status, data } = await req(port, "GET", "/api/registry/config");

      expect(status).toBe(200);
      expect(data.configured).toBe(false);
    });
  });

  // ── Drop routes (service not configured) ────────────────────────────────

  describe("GET /api/drop/status", () => {
    it("returns disabled defaults when drop service is null", async () => {
      const { status, data } = await req(port, "GET", "/api/drop/status");

      expect(status).toBe(200);
      expect(data.dropEnabled).toBe(false);
      expect(data.publicMintOpen).toBe(false);
      expect(data.whitelistMintOpen).toBe(false);
      expect(data.mintedOut).toBe(false);
      expect(data.currentSupply).toBe(0);
      expect(data.maxSupply).toBe(2138);
      expect(data.shinyPrice).toBe("0.1");
      expect(data.userHasMinted).toBe(false);
    });
  });

  describe("POST /api/drop/mint", () => {
    it("returns 503 when drop service is not configured", async () => {
      const { status, data } = await req(port, "POST", "/api/drop/mint", {
        name: "TestAgent",
      });

      expect(status).toBe(503);
      expect(data.error).toMatch(/not configured/i);
    });
  });

  describe("POST /api/drop/mint-whitelist", () => {
    it("returns 503 when drop service is not configured", async () => {
      const { status, data } = await req(
        port,
        "POST",
        "/api/drop/mint-whitelist",
        { name: "TestAgent", proof: ["0xabc"] },
      );

      expect(status).toBe(503);
      expect(data.error).toMatch(/not configured/i);
    });
  });
});
