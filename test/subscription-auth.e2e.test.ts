import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
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
    await fs.rm(stateDir, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100,
    });
    envBackup.restore();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.ANTHROPIC_API_KEY;
  });

  // ── Anthropic OAuth flow ─────────────────────────────────────────────────

  describe("Anthropic OAuth flow", () => {
    it("runs start->exchange and applies credentials", async () => {
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

    it("returns 400 when exchange is called without an active flow", async () => {
      const res = await req(
        port,
        "POST",
        "/api/subscription/anthropic/exchange",
        { code: "some-code" },
      );
      expect(res.status).toBe(400);
      expect(res.data.error).toContain("No active flow");
    });

    it("returns 400 when exchange is called with missing code field", async () => {
      const res = await req(
        port,
        "POST",
        "/api/subscription/anthropic/exchange",
        {},
      );
      expect(res.status).toBe(400);
      expect(res.data.error).toContain("Missing code");
    });

    it("persists setup token to config file and env", async () => {
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

    it("returns 400 for setup-token with invalid format", async () => {
      const res = await req(
        port,
        "POST",
        "/api/subscription/anthropic/setup-token",
        { token: "invalid-token-format" },
      );
      expect(res.status).toBe(400);
      expect(res.data.error).toContain("Invalid token format");
    });
  });

  // ── OpenAI OAuth flow ────────────────────────────────────────────────────

  describe("OpenAI OAuth flow", () => {
    it("runs start->exchange with code and saves credentials", async () => {
      const submitCode = vi.fn();
      const closeFn = vi.fn();
      const credentials = makeCredentials();

      startCodexLogin.mockResolvedValueOnce({
        authUrl: "https://auth.example/openai",
        state: "openai-state",
        submitCode,
        credentials: Promise.resolve(credentials),
        close: closeFn,
      });

      const startRes = await req(
        port,
        "POST",
        "/api/subscription/openai/start",
      );
      expect(startRes.status).toBe(200);
      expect(startRes.data.authUrl).toBe("https://auth.example/openai");
      expect(startRes.data.state).toBe("openai-state");

      const exchangeRes = await req(
        port,
        "POST",
        "/api/subscription/openai/exchange",
        { code: "openai-auth-code" },
      );

      expect(exchangeRes.status).toBe(200);
      expect(exchangeRes.data.success).toBe(true);
      expect(exchangeRes.data.expiresAt).toBe(credentials.expires);
      expect(submitCode).toHaveBeenCalledWith("openai-auth-code");
      expect(saveCredentials).toHaveBeenCalledWith("openai-codex", credentials);
      expect(applySubscriptionCredentials).toHaveBeenCalledTimes(1);
      expect(closeFn).toHaveBeenCalledTimes(1);
    });

    it("returns 400 when exchange is called without an active flow", async () => {
      const res = await req(port, "POST", "/api/subscription/openai/exchange", {
        code: "some-code",
      });
      expect(res.status).toBe(400);
      expect(res.data.error).toContain("No active flow");
    });

    it("returns 400 when exchange has neither code nor waitForCallback", async () => {
      // Need an active flow so we get past the "No active flow" check
      startCodexLogin.mockResolvedValueOnce({
        authUrl: "https://auth.example/openai",
        state: "s",
        submitCode: vi.fn(),
        credentials: Promise.resolve(makeCredentials()),
        close: vi.fn(),
      });
      await req(port, "POST", "/api/subscription/openai/start");

      const res = await req(
        port,
        "POST",
        "/api/subscription/openai/exchange",
        {},
      );
      expect(res.status).toBe(400);
      expect(res.data.error).toContain(
        "Provide either code or set waitForCallback",
      );
    });

    it("cleans up failed exchange flow and supports retry start", async () => {
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

      const firstStart = await req(
        port,
        "POST",
        "/api/subscription/openai/start",
      );
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

      const retryStart = await req(
        port,
        "POST",
        "/api/subscription/openai/start",
      );
      expect(retryStart.status).toBe(200);
      expect(retryStart.data.authUrl).toBe(
        "https://auth.example/openai?state=second",
      );
      expect(firstFlowClose).toHaveBeenCalledTimes(1);
      expect(secondFlowClose).not.toHaveBeenCalled();
    });
  });

  // ── Subscription status & credential deletion ────────────────────────────

  describe("Subscription status & credential deletion", () => {
    it("GET /api/subscription/status returns providers array", async () => {
      const res = await req(port, "GET", "/api/subscription/status");
      expect(res.status).toBe(200);
      expect(res.data.providers).toEqual([{ id: "openai-codex" }]);
      expect(getSubscriptionStatus).toHaveBeenCalledTimes(1);
    });

    it("DELETE /api/subscription/anthropic-subscription succeeds", async () => {
      const res = await req(
        port,
        "DELETE",
        "/api/subscription/anthropic-subscription",
      );
      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      expect(deleteCredentials).toHaveBeenCalledWith("anthropic-subscription");
    });

    it("DELETE /api/subscription/openai-codex succeeds", async () => {
      const res = await req(port, "DELETE", "/api/subscription/openai-codex");
      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      expect(deleteCredentials).toHaveBeenCalledWith("openai-codex");
    });

    it("DELETE /api/subscription/unknown-provider returns 400", async () => {
      const res = await req(
        port,
        "DELETE",
        "/api/subscription/unknown-provider",
      );
      expect(res.status).toBe(400);
      expect(res.data.error).toContain("Unknown provider");
    });
  });

  // ── Flow lifecycle guards ────────────────────────────────────────────────

  describe("Flow lifecycle guards", () => {
    it("OpenAI start is idempotent — closes previous flow before starting new one", async () => {
      const firstClose = vi.fn();
      const secondClose = vi.fn();

      startCodexLogin
        .mockResolvedValueOnce({
          authUrl: "https://auth.example/openai?first",
          state: "first",
          submitCode: vi.fn(),
          credentials: new Promise(() => {}),
          close: firstClose,
        })
        .mockResolvedValueOnce({
          authUrl: "https://auth.example/openai?second",
          state: "second",
          submitCode: vi.fn(),
          credentials: new Promise(() => {}),
          close: secondClose,
        });

      const first = await req(port, "POST", "/api/subscription/openai/start");
      expect(first.status).toBe(200);

      const second = await req(port, "POST", "/api/subscription/openai/start");
      expect(second.status).toBe(200);
      expect(second.data.authUrl).toBe("https://auth.example/openai?second");

      expect(firstClose).toHaveBeenCalledTimes(1);
      expect(secondClose).not.toHaveBeenCalled();
    });

    it("Anthropic flow is cleaned up from state after successful exchange", async () => {
      const submitCode = vi.fn();
      const credentials = makeCredentials();

      startAnthropicLogin.mockResolvedValueOnce({
        authUrl: "https://auth.example/anthropic",
        submitCode,
        credentials: Promise.resolve(credentials),
      });

      await req(port, "POST", "/api/subscription/anthropic/start");
      const exchangeRes = await req(
        port,
        "POST",
        "/api/subscription/anthropic/exchange",
        { code: "valid-code" },
      );
      expect(exchangeRes.status).toBe(200);
      expect(exchangeRes.data.success).toBe(true);

      // A second exchange without a new start should fail — flow was cleaned up
      const secondExchange = await req(
        port,
        "POST",
        "/api/subscription/anthropic/exchange",
        { code: "another-code" },
      );
      expect(secondExchange.status).toBe(400);
      expect(secondExchange.data.error).toContain("No active flow");
    });
  });
});
