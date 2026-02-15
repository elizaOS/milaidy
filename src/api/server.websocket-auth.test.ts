import type http from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { createMockHeadersRequest } from "./../test-support/test-helpers.js";
import { resolveWebSocketUpgradeRejection } from "./server.js";

function req(
  headers: http.IncomingHttpHeaders = {},
): Pick<http.IncomingMessage, "headers"> {
  return createMockHeadersRequest(headers) as Pick<
    http.IncomingMessage,
    "headers"
  >;
}

describe("resolveWebSocketUpgradeRejection", () => {
  const prevToken = process.env.MILAIDY_API_TOKEN;

  afterEach(() => {
    if (prevToken === undefined) delete process.env.MILAIDY_API_TOKEN;
    else process.env.MILAIDY_API_TOKEN = prevToken;
  });

  it("rejects non-/ws paths", () => {
    const rejection = resolveWebSocketUpgradeRejection(
      req() as http.IncomingMessage,
      new URL("ws://localhost/not-ws"),
    );
    expect(rejection).toEqual({ status: 404, reason: "Not found" });
  });

  it("rejects disallowed origins", () => {
    delete process.env.MILAIDY_API_TOKEN;
    const rejection = resolveWebSocketUpgradeRejection(
      req({ origin: "https://evil.example" }) as http.IncomingMessage,
      new URL("ws://localhost/ws"),
    );
    expect(rejection).toEqual({ status: 403, reason: "Origin not allowed" });
  });

  it("rejects unauthenticated upgrades when API token is enabled", () => {
    process.env.MILAIDY_API_TOKEN = "test-token";
    const rejection = resolveWebSocketUpgradeRejection(
      req() as http.IncomingMessage,
      new URL("ws://localhost/ws"),
    );
    expect(rejection).toEqual({ status: 401, reason: "Unauthorized" });
  });

  it("accepts valid bearer token", () => {
    process.env.MILAIDY_API_TOKEN = "test-token";
    const rejection = resolveWebSocketUpgradeRejection(
      req({ authorization: "Bearer test-token" }) as http.IncomingMessage,
      new URL("ws://localhost/ws"),
    );
    expect(rejection).toBeNull();
  });

  it("accepts valid query token", () => {
    process.env.MILAIDY_API_TOKEN = "test-token";
    const rejection = resolveWebSocketUpgradeRejection(
      req() as http.IncomingMessage,
      new URL("ws://localhost/ws?token=test-token"),
    );
    expect(rejection).toBeNull();
  });

  it("accepts when token auth is disabled and origin is local", () => {
    delete process.env.MILAIDY_API_TOKEN;
    const rejection = resolveWebSocketUpgradeRejection(
      req({ origin: "http://localhost:5173" }) as http.IncomingMessage,
      new URL("ws://localhost/ws"),
    );
    expect(rejection).toBeNull();
  });
});
