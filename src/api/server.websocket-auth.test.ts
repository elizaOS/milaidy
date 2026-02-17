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

  afterEach(() => {
    if (prevToken === undefined) delete process.env.MILADY_API_TOKEN;
    else process.env.MILADY_API_TOKEN = prevToken;

    if (prevAllowQueryToken === undefined)
      delete process.env.MILADY_ALLOW_WS_QUERY_TOKEN;
    else process.env.MILADY_ALLOW_WS_QUERY_TOKEN = prevAllowQueryToken;
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
});
