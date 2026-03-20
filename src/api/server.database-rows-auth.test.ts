/**
 * Regression test: GET /api/database/tables/:name/rows must require auth when
 * a token is configured. Without the auth guard an attacker on the same
 * network can read arbitrary table data.
 *
 * See issue #1172 — UX Persona Audit (DB rows endpoint missing auth guard).
 */

import http from "node:http";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { startApiServer } from "./server";

vi.mock("../services/mcp-marketplace", () => ({
  searchMcpMarketplace: vi.fn().mockResolvedValue({ results: [] }),
  getMcpServerDetails: vi.fn().mockResolvedValue(null),
}));

function get(
  port: number,
  path: string,
  token?: string,
): Promise<{ status: number; data: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    const r = http.request(
      { hostname: "127.0.0.1", port, path, method: "GET", headers },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          let data: Record<string, unknown> = {};
          try {
            data = JSON.parse(Buffer.concat(chunks).toString("utf-8")) as Record<string, unknown>;
          } catch {
            data = {};
          }
          resolve({ status: res.statusCode ?? 0, data });
        });
      },
    );
    r.on("error", reject);
    r.end();
  });
}

describe("GET /api/database/tables/:name/rows — auth gate", () => {
  let port: number;
  let close: () => Promise<void>;
  const TOKEN = "test-db-rows-auth-token";
  const prevToken = process.env.ELIZA_API_TOKEN;

  beforeAll(async () => {
    process.env.ELIZA_API_TOKEN = TOKEN;
    const server = await startApiServer({ port: 0 });
    port = server.port;
    close = server.close;
  }, 30_000);

  afterAll(async () => {
    await close();
    if (prevToken === undefined) {
      delete process.env.ELIZA_API_TOKEN;
    } else {
      process.env.ELIZA_API_TOKEN = prevToken;
    }
  });

  it("rejects unauthenticated request with 401", async () => {
    const { status, data } = await get(port, "/api/database/tables/accounts/rows");
    expect(status).toBe(401);
    expect(data.error).toMatch(/unauthorized/i);
  });

  it("rejects wrong token with 401", async () => {
    const { status, data } = await get(
      port,
      "/api/database/tables/accounts/rows",
      "wrong-token",
    );
    expect(status).toBe(401);
    expect(data.error).toMatch(/unauthorized/i);
  });

  it("accepts valid token (may return 503 if no runtime, but not 401)", async () => {
    const { status } = await get(
      port,
      "/api/database/tables/accounts/rows",
      TOKEN,
    );
    // With auth satisfied, the request proceeds further.
    // Without a running runtime it returns 503 (service unavailable) — that is
    // expected and acceptable. The important thing is it is NOT 401.
    expect(status).not.toBe(401);
  });
});
