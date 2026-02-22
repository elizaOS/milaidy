import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { startApiServer } from "../src/api/server";
import type { OAuthCredentials } from "../src/auth/types";

const getSubscriptionStatus = vi.fn(() => [{ id: "openai-codex" }]);
const startAnthropicLogin = vi.fn();
const startCodexLogin = vi.fn();
const saveCredentials = vi.fn();
const applySubscriptionCredentials = vi.fn(async () => undefined);
const deleteCredentials = vi.fn();

vi.mock("../src/auth/index", () => ({
  getSubscriptionStatus,
  startAnthropicLogin,
  startCodexLogin,
  saveCredentials,
  applySubscriptionCredentials,
  deleteCredentials,
}));

interface ReqResponse {
  status: number;
  data: Record<string, unknown>;
}

function req(
  port: number,
  method: string,
  requestPath: string,
  body?: Record<string, unknown>,
): Promise<ReqResponse> {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : undefined;
    const request = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: requestPath,
        method,
        headers: {
          "Content-Type": "application/json",
          ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf-8");
          let data: Record<string, unknown> = {};
          try {
            data = JSON.parse(raw) as Record<string, unknown>;
          } catch {
            data = { _raw: raw };
          }
          resolve({ status: response.statusCode ?? 0, data });
        });
      },
    );

    request.on("error", reject);
    if (payload) request.write(payload);
    request.end();
  });
}

function saveEnv(...keys: string[]): { restore: () => void } {
  const saved: Record<string, string | undefined> = {};
  for (const key of keys) {
    saved[key] = process.env[key];
  }
  return {
    restore() {
      for (const key of keys) {
        if (saved[key] === undefined) delete process.env[key];
        else process.env[key] = saved[key];
      }
    },
  };
}

function makeCredentials(expires = Date.now() + 60_000): OAuthCredentials {
  return {
    access: "access-token",
    refresh: "refresh-token",
    expires,
  };
}

describe("subscription auth routes (e2e contract)", () => {
  let port = 0;
  let closeServer: (() => Promise<void>) | null = null;
  let stateDir = "";
  let envBackup: { restore: () => void };

  beforeAll(async () => {
    envBackup = saveEnv(
      "MILADY_STATE_DIR",
      "MILADY_CONFIG_PATH",
      "MILADY_API_TOKEN",
      "MILADY_PAIRING_DISABLED",
      "ANTHROPIC_API_KEY",
    );

    stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "milady-subscription-"));
    process.env.MILADY_STATE_DIR = stateDir;
    delete process.env.MILADY_CONFIG_PATH;
    delete process.env.MILADY_API_TOKEN;
    delete process.env.MILADY_PAIRING_DISABLED;
    delete process.env.ANTHROPIC_API_KEY;

    const server = await startApiServer({ port: 0 });
    port = server.port;
    closeServer = server.close;
  }, 60_000);

  afterAll(async () => {
    if (closeServer) {
      await closeServer();
    }
    await fs.rm(stateDir, { recursive: true, force: true });
    envBackup.restore();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.ANTHROPIC_API_KEY;
  });

  it("runs anthropic start->exchange and applies credentials", async () => {
    const submitCode = vi.fn();
    const credentials = makeCredentials();

    startAnthropicLogin.mockResolvedValueOnce({
      authUrl: "https://auth.example/anthropic",
      submitCode,
      credentials: Promise.resolve(credentials),
    });

    const startRes = await req(
      port,
      "POST",
      "/api/subscription/anthropic/start",
    );
    expect(startRes.status).toBe(200);
    expect(startRes.data.authUrl).toBe("https://auth.example/anthropic");

    const exchangeRes = await req(
      port,
      "POST",
      "/api/subscription/anthropic/exchange",
      { code: "code#state" },
    );

    expect(exchangeRes.status).toBe(200);
    expect(exchangeRes.data.success).toBe(true);
    expect(exchangeRes.data.expiresAt).toBe(credentials.expires);
    expect(submitCode).toHaveBeenCalledWith("code#state");
    expect(saveCredentials).toHaveBeenCalledWith(
      "anthropic-subscription",
      credentials,
    );
    expect(applySubscriptionCredentials).toHaveBeenCalledTimes(1);
  });

  it("persists anthropic setup token to config file and env", async () => {
    const token = "sk-ant-oat01-integration-test";

    const setupRes = await req(
      port,
      "POST",
      "/api/subscription/anthropic/setup-token",
      { token },
    );
    expect(setupRes.status).toBe(200);
    expect(setupRes.data.success).toBe(true);
    expect(process.env.ANTHROPIC_API_KEY).toBe(token);

    const configPath = path.join(stateDir, "milady.json");
    const rawConfig = await fs.readFile(configPath, "utf-8");
    const parsed = JSON.parse(rawConfig) as { env?: Record<string, string> };
    expect(parsed.env?.ANTHROPIC_API_KEY).toBe(token);
  });

  it("cleans up failed openai exchange flow and supports retry start", async () => {
    const firstFlowClose = vi.fn();
    const firstFlowSubmitCode = vi.fn();
    const firstCredentials = Promise.reject(new Error("callback timeout"));
    void firstCredentials.catch(() => {});

    const secondFlowClose = vi.fn();

    startCodexLogin
      .mockResolvedValueOnce({
        authUrl: "https://auth.example/openai?state=first",
        state: "first",
        submitCode: firstFlowSubmitCode,
        credentials: firstCredentials,
        close: firstFlowClose,
      })
      .mockResolvedValueOnce({
        authUrl: "https://auth.example/openai?state=second",
        state: "second",
        submitCode: vi.fn(),
        credentials: Promise.resolve(makeCredentials()),
        close: secondFlowClose,
      });

    const firstStart = await req(port, "POST", "/api/subscription/openai/start");
    expect(firstStart.status).toBe(200);
    expect(firstStart.data.authUrl).toBe(
      "https://auth.example/openai?state=first",
    );

    const exchangeFail = await req(
      port,
      "POST",
      "/api/subscription/openai/exchange",
      { code: "invalid-code" },
    );
    expect(exchangeFail.status).toBe(500);
    expect(exchangeFail.data.error).toBe("OpenAI exchange failed");
    expect(firstFlowSubmitCode).toHaveBeenCalledWith("invalid-code");
    expect(saveCredentials).not.toHaveBeenCalled();

    const exchangeAfterCleanup = await req(
      port,
      "POST",
      "/api/subscription/openai/exchange",
      { waitForCallback: true },
    );
    expect(exchangeAfterCleanup.status).toBe(400);
    expect(exchangeAfterCleanup.data.error).toContain("No active flow");

    const retryStart = await req(port, "POST", "/api/subscription/openai/start");
    expect(retryStart.status).toBe(200);
    expect(retryStart.data.authUrl).toBe(
      "https://auth.example/openai?state=second",
    );
    expect(firstFlowClose).toHaveBeenCalledTimes(1);
    expect(secondFlowClose).not.toHaveBeenCalled();
  });
});
