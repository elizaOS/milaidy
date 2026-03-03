import type http from "node:http";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createEnvSandbox } from "../test-support/test-helpers";
import { handleAuthRoutes } from "./auth-routes";

type AuthRouteCallArgs = {
  method: string;
  pathname: string;
  body?: { code?: string } | null;
  remoteAddress?: string | null;
};

describe("auth routes", () => {
  const env = createEnvSandbox(["MILADY_API_TOKEN"]);

  let pairingEnabled: ReturnType<typeof vi.fn>;
  let ensurePairingCode: ReturnType<typeof vi.fn>;
  let normalizePairingCode: ReturnType<typeof vi.fn>;
  let rateLimitPairing: ReturnType<typeof vi.fn>;
  let getPairingExpiresAt: ReturnType<typeof vi.fn>;
  let clearPairing: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    env.clear();
    pairingEnabled = vi.fn(() => false);
    ensurePairingCode = vi.fn(() => null);
    normalizePairingCode = vi.fn((value: string) => value.trim().toUpperCase());
    rateLimitPairing = vi.fn(() => true);
    getPairingExpiresAt = vi.fn(() => Date.now() + 60_000);
    clearPairing = vi.fn();
  });

  afterEach(() => {
    env.restore();
  });

  const invoke = async (args: AuthRouteCallArgs) => {
    const req = {
      socket: {
        remoteAddress: args.remoteAddress ?? "127.0.0.1",
      },
    } as unknown as http.IncomingMessage;
    const res = {} as http.ServerResponse;

    const response = {
      status: 200,
      payload: null as Record<string, unknown> | null,
    };

    const handled = await handleAuthRoutes({
      req,
      res,
      method: args.method,
      pathname: args.pathname,
      readJsonBody: vi.fn(async () => args.body ?? null),
      json: (_res, data, status = 200) => {
        response.status = status;
        response.payload = data as Record<string, unknown>;
      },
      error: (_res, message, status = 400) => {
        response.status = status;
        response.payload = { error: message };
      },
      pairingEnabled,
      ensurePairingCode,
      normalizePairingCode,
      rateLimitPairing,
      getPairingExpiresAt,
      clearPairing,
    });

    return { handled, status: response.status, payload: response.payload };
  };

  test("returns false for non-auth routes", async () => {
    const result = await invoke({
      method: "GET",
      pathname: "/api/status",
    });

    expect(result.handled).toBe(false);
    expect(result.payload).toBeNull();
  });

  test("reports auth status with pairing metadata", async () => {
    process.env.MILADY_API_TOKEN = "token-123";
    pairingEnabled.mockReturnValue(true);
    getPairingExpiresAt.mockReturnValue(1_234_567_890);

    const result = await invoke({
      method: "GET",
      pathname: "/api/auth/status",
    });

    expect(result.handled).toBe(true);
    expect(result.status).toBe(200);
    expect(result.payload).toMatchObject({
      required: true,
      pairingEnabled: true,
      expiresAt: 1_234_567_890,
    });
    expect(ensurePairingCode).toHaveBeenCalledTimes(1);
  });

  test("rejects pair requests when no token is configured", async () => {
    const result = await invoke({
      method: "POST",
      pathname: "/api/auth/pair",
      body: { code: "abcd" },
    });

    expect(result.handled).toBe(true);
    expect(result.status).toBe(400);
    expect(result.payload).toMatchObject({ error: "Pairing not enabled" });
  });

  test("rejects pair requests when pairing is disabled", async () => {
    process.env.MILADY_API_TOKEN = "token-123";
    pairingEnabled.mockReturnValue(false);

    const result = await invoke({
      method: "POST",
      pathname: "/api/auth/pair",
      body: { code: "abcd" },
    });

    expect(result.status).toBe(403);
    expect(result.payload).toMatchObject({ error: "Pairing disabled" });
  });

  test("rejects pair requests when rate limit is exceeded", async () => {
    process.env.MILADY_API_TOKEN = "token-123";
    pairingEnabled.mockReturnValue(true);
    ensurePairingCode.mockReturnValue("ABCD");
    rateLimitPairing.mockReturnValue(false);

    const result = await invoke({
      method: "POST",
      pathname: "/api/auth/pair",
      body: { code: "abcd" },
      remoteAddress: "10.0.0.5",
    });

    expect(result.status).toBe(429);
    expect(result.payload).toMatchObject({
      error: "Too many attempts. Try again later.",
    });
    expect(rateLimitPairing).toHaveBeenCalledWith("10.0.0.5");
  });

  test("rejects expired pairing codes", async () => {
    process.env.MILADY_API_TOKEN = "token-123";
    pairingEnabled.mockReturnValue(true);
    ensurePairingCode.mockReturnValueOnce("ABCD").mockReturnValueOnce("WXYZ");
    getPairingExpiresAt.mockReturnValue(Date.now() - 1);

    const result = await invoke({
      method: "POST",
      pathname: "/api/auth/pair",
      body: { code: "ABCD" },
    });

    expect(result.status).toBe(410);
    expect(result.payload).toMatchObject({
      error: "Pairing code expired. Check server logs for a new code.",
    });
    expect(ensurePairingCode).toHaveBeenCalledTimes(2);
  });

  test("rejects invalid pairing code", async () => {
    process.env.MILADY_API_TOKEN = "token-123";
    pairingEnabled.mockReturnValue(true);
    ensurePairingCode.mockReturnValue("ABCD");
    getPairingExpiresAt.mockReturnValue(Date.now() + 60_000);

    const result = await invoke({
      method: "POST",
      pathname: "/api/auth/pair",
      body: { code: "WRONG" },
    });

    expect(result.status).toBe(403);
    expect(result.payload).toMatchObject({ error: "Invalid pairing code" });
    expect(clearPairing).not.toHaveBeenCalled();
  });

  test("returns token and clears pairing when code is valid", async () => {
    process.env.MILADY_API_TOKEN = "token-123";
    pairingEnabled.mockReturnValue(true);
    ensurePairingCode.mockReturnValue("ABCD");
    getPairingExpiresAt.mockReturnValue(Date.now() + 60_000);

    const result = await invoke({
      method: "POST",
      pathname: "/api/auth/pair",
      body: { code: "abcd" },
    });

    expect(result.status).toBe(200);
    expect(result.payload).toMatchObject({ token: "token-123" });
    expect(clearPairing).toHaveBeenCalledTimes(1);
  });
});
