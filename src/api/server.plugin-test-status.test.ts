/**
 * P4-01 regression test: POST /api/plugins/:id/test must return HTTP 422
 * (not 200) when the test fails.
 *
 * See issue #1172 — UX Persona Audit.
 */

import http from "node:http";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { startApiServer } from "./server";

vi.mock("../services/mcp-marketplace", () => ({
  searchMcpMarketplace: vi.fn().mockResolvedValue({ results: [] }),
  getMcpServerDetails: vi.fn().mockResolvedValue(null),
}));

function req(
  port: number,
  path: string,
  token?: string,
): Promise<{ status: number; data: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Content-Length": "0",
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    const r = http.request(
      { hostname: "127.0.0.1", port, path, method: "POST", headers },
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

describe("POST /api/plugins/:id/test — HTTP status codes (P4-01)", () => {
  let port: number;
  let close: () => Promise<void>;

  const prevToken = process.env.ELIZA_API_TOKEN;
  const prevTelegramToken = process.env.TELEGRAM_BOT_TOKEN;

  beforeAll(async () => {
    // No API token set — auth gate is open (default install behaviour)
    delete process.env.ELIZA_API_TOKEN;
    // No Telegram token configured — simulates missing config
    delete process.env.TELEGRAM_BOT_TOKEN;

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
    if (prevTelegramToken === undefined) {
      delete process.env.TELEGRAM_BOT_TOKEN;
    } else {
      process.env.TELEGRAM_BOT_TOKEN = prevTelegramToken;
    }
  });

  it("returns 422 when Telegram bot token is not configured", async () => {
    const { status, data } = await req(port, "/api/plugins/telegram/test");
    expect(status).toBe(422);
    expect(data.success).toBe(false);
    expect(typeof data.error).toBe("string");
  });

  it("returns JSON body with success:false on 422 response", async () => {
    const { data } = await req(port, "/api/plugins/telegram/test");
    expect(data).toMatchObject({
      success: false,
      pluginId: "telegram",
    });
  });

  it("does NOT return 200 for a failed Telegram test", async () => {
    const { status } = await req(port, "/api/plugins/telegram/test");
    expect(status).not.toBe(200);
  });

  it("returns 200 for a plugin with no custom test (generic success)", async () => {
    // A non-Telegram plugin that is loaded falls through to the generic success
    // path. We use a plugin id that won't be registered — it returns 200 with
    // success:true and the fallback message.
    const { status, data } = await req(port, "/api/plugins/unknown-plugin/test");
    expect(status).toBe(200);
    expect(data.success).toBe(true);
  });
});
