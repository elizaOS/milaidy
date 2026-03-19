import { logger } from "@elizaos/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ensureApiTokenForBindHost, resolveCorsOrigin } from "./server";

describe("ensureApiTokenForBindHost", () => {
  // Track both ELIZA_* and MILADY_* brand aliases since the server.ts wrapper
  // syncs between them via syncMiladyEnvToEliza / syncElizaEnvToMilady.
  const envKeys = [
    "ELIZA_API_TOKEN",
    "ELIZA_API_BIND",
    "ELIZA_ALLOWED_ORIGINS",
    "MILADY_API_TOKEN",
    "MILADY_API_BIND",
    "MILADY_ALLOWED_ORIGINS",
  ];
  const savedEnv = new Map<string, string | undefined>();

  beforeEach(() => {
    for (const k of envKeys) savedEnv.set(k, process.env[k]);
  });

  afterEach(() => {
    for (const [k, v] of savedEnv) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    vi.restoreAllMocks();
  });

  it.each([
    "127.0.0.1",
    "localhost:2138",
    "[::1]:2138",
    "http://localhost:2138",
    "0:0:0:0:0:0:0:1",
  ])("does not generate a token on loopback bind hosts (%s)", (host) => {
    delete process.env.ELIZA_API_TOKEN;
    ensureApiTokenForBindHost(host);
    expect(process.env.ELIZA_API_TOKEN).toBeUndefined();
  });

  it("preserves an explicitly configured token", () => {
    process.env.ELIZA_API_TOKEN = "existing-token";
    ensureApiTokenForBindHost("0.0.0.0");
    expect(process.env.ELIZA_API_TOKEN).toBe("existing-token");
  });

  it("generates a token for non-loopback binds without logging raw token", () => {
    delete process.env.ELIZA_API_TOKEN;
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});

    ensureApiTokenForBindHost("0.0.0.0:2138");

    const generated = process.env.ELIZA_API_TOKEN ?? "";
    expect(generated).toMatch(/^[a-f0-9]{64}$/);

    const loggedMessages = warnSpy.mock.calls
      .map((call) => call[0])
      .map((value) => String(value));
    expect(loggedMessages.some((message) => message.includes(generated))).toBe(
      false,
    );
  });
});

describe("resolveCorsOrigin", () => {
  let previousBind: string | undefined;
  let previousAllowedOrigins: string | undefined;

  beforeEach(() => {
    previousBind = process.env.ELIZA_API_BIND;
    previousAllowedOrigins = process.env.ELIZA_ALLOWED_ORIGINS;
  });

  afterEach(() => {
    if (previousBind === undefined) {
      delete process.env.ELIZA_API_BIND;
    } else {
      process.env.ELIZA_API_BIND = previousBind;
    }
    if (previousAllowedOrigins === undefined) {
      delete process.env.ELIZA_ALLOWED_ORIGINS;
    } else {
      process.env.ELIZA_ALLOWED_ORIGINS = previousAllowedOrigins;
    }
  });

  it("allows any origin when bound to a wildcard host", () => {
    process.env.ELIZA_API_BIND = "0.0.0.0:2138";
    delete process.env.ELIZA_ALLOWED_ORIGINS;

    expect(resolveCorsOrigin("https://evil.example.com")).toBe(
      "https://evil.example.com",
    );
  });

  it("allows allowlisted origins when not wildcard-bound", () => {
    process.env.ELIZA_API_BIND = "127.0.0.1";
    process.env.ELIZA_ALLOWED_ORIGINS =
      "https://proxy.example.com, https://other.example.com";

    expect(resolveCorsOrigin("https://proxy.example.com")).toBe(
      "https://proxy.example.com",
    );
    expect(resolveCorsOrigin("https://blocked.example.com")).toBeNull();
  });
});
