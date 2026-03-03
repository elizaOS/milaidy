import type http from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { createMockHeadersRequest } from "./../test-support/test-helpers";
import { resolveWebSocketUpgradeRejection } from "./server";

function req(
  headers: http.IncomingHttpHeaders = {},
): Pick<http.IncomingMessage, "headers"> {
  return createMockHeadersRequest(headers) as Pick<
    http.IncomingMessage,
    "headers"
  >;
}

describe("resolveWebSocketUpgradeRejection", () => {
  const prevToken = process.env.MILADY_API_TOKEN;
  const prevAllowQueryToken = process.env.MILADY_ALLOW_WS_QUERY_TOKEN;
  const prevAllowedOrigins = process.env.MILADY_ALLOWED_ORIGINS;
  const prevAllowNullOrigin = process.env.MILADY_ALLOW_NULL_ORIGIN;

  afterEach(() => {
    if (prevToken === undefined) delete process.env.MILADY_API_TOKEN;
    else process.env.MILADY_API_TOKEN = prevToken;

    if (prevAllowQueryToken === undefined)
      delete process.env.MILADY_ALLOW_WS_QUERY_TOKEN;
    else process.env.MILADY_ALLOW_WS_QUERY_TOKEN = prevAllowQueryToken;

    if (prevAllowedOrigins === undefined)
      delete process.env.MILADY_ALLOWED_ORIGINS;
    else process.env.MILADY_ALLOWED_ORIGINS = prevAllowedOrigins;

    if (prevAllowNullOrigin === undefined)
      delete process.env.MILADY_ALLOW_NULL_ORIGIN;
    else process.env.MILADY_ALLOW_NULL_ORIGIN = prevAllowNullOrigin;
  });

  it("rejects non-/ws paths", () => {
    const rejection = resolveWebSocketUpgradeRejection(
      req() as http.IncomingMessage,
      new URL("ws://localhost/not-ws"),
    );
    expect(rejection).toEqual({ status: 404, reason: "Not found" });
  });

  it("rejects disallowed origins", () => {
    delete process.env.MILADY_API_TOKEN;
    const rejection = resolveWebSocketUpgradeRejection(
      req({ origin: "https://evil.example" }) as http.IncomingMessage,
      new URL("ws://localhost/ws"),
    );
    expect(rejection).toEqual({ status: 403, reason: "Origin not allowed" });
  });

  it("rejects unauthenticated upgrades when API token is enabled", () => {
    process.env.MILADY_API_TOKEN = "test-token";
    const rejection = resolveWebSocketUpgradeRejection(
      req() as http.IncomingMessage,
      new URL("ws://localhost/ws"),
    );
    expect(rejection).toEqual({ status: 401, reason: "Unauthorized" });
  });

  it("accepts valid bearer token", () => {
    process.env.MILADY_API_TOKEN = "test-token";
    const rejection = resolveWebSocketUpgradeRejection(
      req({ authorization: "Bearer test-token" }) as http.IncomingMessage,
      new URL("ws://localhost/ws"),
    );
    expect(rejection).toBeNull();
  });

  it("rejects query token auth by default", () => {
    process.env.MILADY_API_TOKEN = "test-token";
    delete process.env.MILADY_ALLOW_WS_QUERY_TOKEN;

    const rejection = resolveWebSocketUpgradeRejection(
      req() as http.IncomingMessage,
      new URL("ws://localhost/ws?token=test-token"),
    );
    expect(rejection).toEqual({ status: 401, reason: "Unauthorized" });
  });

  it("accepts valid query token when explicitly enabled", () => {
    process.env.MILADY_API_TOKEN = "test-token";
    process.env.MILADY_ALLOW_WS_QUERY_TOKEN = "1";
    const rejection = resolveWebSocketUpgradeRejection(
      req() as http.IncomingMessage,
      new URL("ws://localhost/ws?token=test-token"),
    );
    expect(rejection).toBeNull();
  });

  it("accepts when token auth is disabled and origin is local", () => {
    delete process.env.MILADY_API_TOKEN;
    const rejection = resolveWebSocketUpgradeRejection(
      req({ origin: "http://localhost:5173" }) as http.IncomingMessage,
      new URL("ws://localhost/ws"),
    );
    expect(rejection).toBeNull();
  });

  it.each([
    "http://[::1]:5173",
    "http://[0:0:0:0:0:0:0:1]:5173",
  ])("accepts IPv6 local origin when token auth is disabled (%s)", (origin) => {
    delete process.env.MILADY_API_TOKEN;
    const rejection = resolveWebSocketUpgradeRejection(
      req({ origin }) as http.IncomingMessage,
      new URL("ws://localhost/ws"),
    );
    expect(rejection).toBeNull();
  });

  it("rejects invalid bearer token", () => {
    process.env.MILADY_API_TOKEN = "test-token";
    const rejection = resolveWebSocketUpgradeRejection(
      req({ authorization: "Bearer wrong-token" }) as http.IncomingMessage,
      new URL("ws://localhost/ws"),
    );
    expect(rejection).toEqual({ status: 401, reason: "Unauthorized" });
  });

  it("accepts X-Milady-Token header auth", () => {
    process.env.MILADY_API_TOKEN = "test-token";
    const rejection = resolveWebSocketUpgradeRejection(
      req({ "x-milady-token": "test-token" }) as http.IncomingMessage,
      new URL("ws://localhost/ws"),
    );
    expect(rejection).toBeNull();
  });

  it("rejects wrong query token when query auth enabled", () => {
    process.env.MILADY_API_TOKEN = "test-token";
    process.env.MILADY_ALLOW_WS_QUERY_TOKEN = "1";
    const rejection = resolveWebSocketUpgradeRejection(
      req() as http.IncomingMessage,
      new URL("ws://localhost/ws?token=wrong-token"),
    );
    expect(rejection).toEqual({ status: 401, reason: "Unauthorized" });
  });

  it.each([
    "capacitor://localhost",
    "app://localhost",
    "capacitor-electron://localhost",
    "app://-",
  ])("accepts app-protocol origins (%s)", (origin) => {
    delete process.env.MILADY_API_TOKEN;
    const rejection = resolveWebSocketUpgradeRejection(
      req({ origin }) as http.IncomingMessage,
      new URL("ws://localhost/ws"),
    );
    expect(rejection).toBeNull();
  });

  it("accepts custom allowlisted origins via env", () => {
    delete process.env.MILADY_API_TOKEN;
    process.env.MILADY_ALLOWED_ORIGINS = "https://trusted.example.com";
    const rejection = resolveWebSocketUpgradeRejection(
      req({ origin: "https://trusted.example.com" }) as http.IncomingMessage,
      new URL("ws://localhost/ws"),
    );
    expect(rejection).toBeNull();
  });

  it("accepts upgrade when no origin header is present", () => {
    delete process.env.MILADY_API_TOKEN;
    const rejection = resolveWebSocketUpgradeRejection(
      req() as http.IncomingMessage,
      new URL("ws://localhost/ws"),
    );
    expect(rejection).toBeNull();
  });

  it("rejects whitespace-only bearer token", () => {
    process.env.MILADY_API_TOKEN = "test-token";
    const rejection = resolveWebSocketUpgradeRejection(
      req({ authorization: "Bearer   " }) as http.IncomingMessage,
      new URL("ws://localhost/ws"),
    );
    expect(rejection).toEqual({ status: 401, reason: "Unauthorized" });
  });

  it("accepts query token via apiKey param when enabled", () => {
    process.env.MILADY_API_TOKEN = "test-token";
    process.env.MILADY_ALLOW_WS_QUERY_TOKEN = "1";
    const rejection = resolveWebSocketUpgradeRejection(
      req() as http.IncomingMessage,
      new URL("ws://localhost/ws?apiKey=test-token"),
    );
    expect(rejection).toBeNull();
  });

  it("accepts query token via api_key param when enabled", () => {
    process.env.MILADY_API_TOKEN = "test-token";
    process.env.MILADY_ALLOW_WS_QUERY_TOKEN = "1";
    const rejection = resolveWebSocketUpgradeRejection(
      req() as http.IncomingMessage,
      new URL("ws://localhost/ws?api_key=test-token"),
    );
    expect(rejection).toBeNull();
  });

  it("accepts null origin when MILADY_ALLOW_NULL_ORIGIN=1", () => {
    delete process.env.MILADY_API_TOKEN;
    process.env.MILADY_ALLOW_NULL_ORIGIN = "1";
    const rejection = resolveWebSocketUpgradeRejection(
      req({ origin: "null" }) as http.IncomingMessage,
      new URL("ws://localhost/ws"),
    );
    expect(rejection).toBeNull();
  });
});
