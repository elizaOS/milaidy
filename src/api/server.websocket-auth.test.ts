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
  const prevToken = process.env.ELIZA_API_TOKEN;
  const prevMiladyToken = process.env.MILADY_API_TOKEN;
  const prevAllowQueryToken = process.env.ELIZA_ALLOW_WS_QUERY_TOKEN;
  const prevMiladyAllowQueryToken = process.env.MILADY_ALLOW_WS_QUERY_TOKEN;
  const prevAllowedOrigins = process.env.ELIZA_ALLOWED_ORIGINS;
  const prevMiladyAllowedOrigins = process.env.MILADY_ALLOWED_ORIGINS;
  const prevAllowNullOrigin = process.env.ELIZA_ALLOW_NULL_ORIGIN;
  const prevMiladyAllowNullOrigin = process.env.MILADY_ALLOW_NULL_ORIGIN;

  function setApiToken(value: string | undefined): void {
    if (value === undefined) {
      delete process.env.ELIZA_API_TOKEN;
      delete process.env.MILADY_API_TOKEN;
      return;
    }
    process.env.ELIZA_API_TOKEN = value;
    process.env.MILADY_API_TOKEN = value;
  }

  function setAllowQueryToken(value: string | undefined): void {
    if (value === undefined) {
      delete process.env.ELIZA_ALLOW_WS_QUERY_TOKEN;
      delete process.env.MILADY_ALLOW_WS_QUERY_TOKEN;
      return;
    }
    process.env.ELIZA_ALLOW_WS_QUERY_TOKEN = value;
    process.env.MILADY_ALLOW_WS_QUERY_TOKEN = value;
  }

  function setAllowedOrigins(value: string | undefined): void {
    if (value === undefined) {
      delete process.env.ELIZA_ALLOWED_ORIGINS;
      delete process.env.MILADY_ALLOWED_ORIGINS;
      return;
    }
    process.env.ELIZA_ALLOWED_ORIGINS = value;
    process.env.MILADY_ALLOWED_ORIGINS = value;
  }

  function setAllowNullOrigin(value: string | undefined): void {
    if (value === undefined) {
      delete process.env.ELIZA_ALLOW_NULL_ORIGIN;
      delete process.env.MILADY_ALLOW_NULL_ORIGIN;
      return;
    }
    process.env.ELIZA_ALLOW_NULL_ORIGIN = value;
    process.env.MILADY_ALLOW_NULL_ORIGIN = value;
  }

  afterEach(() => {
    if (prevToken === undefined) {
      delete process.env.ELIZA_API_TOKEN;
    } else {
      process.env.ELIZA_API_TOKEN = prevToken;
    }
    if (prevMiladyToken === undefined) {
      delete process.env.MILADY_API_TOKEN;
    } else {
      process.env.MILADY_API_TOKEN = prevMiladyToken;
    }
    if (prevAllowQueryToken === undefined) {
      delete process.env.ELIZA_ALLOW_WS_QUERY_TOKEN;
    } else {
      process.env.ELIZA_ALLOW_WS_QUERY_TOKEN = prevAllowQueryToken;
    }
    if (prevMiladyAllowQueryToken === undefined) {
      delete process.env.MILADY_ALLOW_WS_QUERY_TOKEN;
    } else {
      process.env.MILADY_ALLOW_WS_QUERY_TOKEN = prevMiladyAllowQueryToken;
    }
    if (prevAllowedOrigins === undefined) {
      delete process.env.ELIZA_ALLOWED_ORIGINS;
    } else {
      process.env.ELIZA_ALLOWED_ORIGINS = prevAllowedOrigins;
    }
    if (prevMiladyAllowedOrigins === undefined) {
      delete process.env.MILADY_ALLOWED_ORIGINS;
    } else {
      process.env.MILADY_ALLOWED_ORIGINS = prevMiladyAllowedOrigins;
    }
    if (prevAllowNullOrigin === undefined) {
      delete process.env.ELIZA_ALLOW_NULL_ORIGIN;
    } else {
      process.env.ELIZA_ALLOW_NULL_ORIGIN = prevAllowNullOrigin;
    }
    if (prevMiladyAllowNullOrigin === undefined) {
      delete process.env.MILADY_ALLOW_NULL_ORIGIN;
    } else {
      process.env.MILADY_ALLOW_NULL_ORIGIN = prevMiladyAllowNullOrigin;
    }
  });

  it("rejects non-/ws paths", () => {
    const rejection = resolveWebSocketUpgradeRejection(
      req() as http.IncomingMessage,
      new URL("ws://localhost/not-ws"),
    );
    expect(rejection).toEqual({ status: 404, reason: "Not found" });
  });

  it("rejects disallowed origins", () => {
    setApiToken(undefined);
    const rejection = resolveWebSocketUpgradeRejection(
      req({ origin: "https://evil.example" }) as http.IncomingMessage,
      new URL("ws://localhost/ws"),
    );
    expect(rejection).toEqual({ status: 403, reason: "Origin not allowed" });
  });

  it("rejects unauthenticated upgrades when API token is enabled", () => {
    setApiToken("test-token");
    setAllowQueryToken(undefined);
    const rejection = resolveWebSocketUpgradeRejection(
      req() as http.IncomingMessage,
      new URL("ws://localhost/ws"),
    );
    expect(rejection).toEqual({ status: 401, reason: "Unauthorized" });
  });

  it("accepts valid bearer token", () => {
    setApiToken("test-token");
    const rejection = resolveWebSocketUpgradeRejection(
      req({ authorization: "Bearer test-token" }) as http.IncomingMessage,
      new URL("ws://localhost/ws"),
    );
    expect(rejection).toBeNull();
  });

  it("rejects query token auth by default", () => {
    setApiToken("test-token");
    setAllowQueryToken(undefined);

    const rejection = resolveWebSocketUpgradeRejection(
      req() as http.IncomingMessage,
      new URL("ws://localhost/ws?token=test-token"),
    );
    expect(rejection).toEqual({ status: 401, reason: "Unauthorized" });
  });

  it("accepts valid query token when explicitly enabled", () => {
    setApiToken("test-token");
    setAllowQueryToken("1");
    const rejection = resolveWebSocketUpgradeRejection(
      req() as http.IncomingMessage,
      new URL("ws://localhost/ws?token=test-token"),
    );
    expect(rejection).toBeNull();
  });

  it("accepts when token auth is disabled and origin is local", () => {
    setApiToken(undefined);
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
    setApiToken(undefined);
    const rejection = resolveWebSocketUpgradeRejection(
      req({ origin }) as http.IncomingMessage,
      new URL("ws://localhost/ws"),
    );
    expect(rejection).toBeNull();
  });

  it("rejects invalid bearer token", () => {
    setApiToken("test-token");
    const rejection = resolveWebSocketUpgradeRejection(
      req({ authorization: "Bearer wrong-token" }) as http.IncomingMessage,
      new URL("ws://localhost/ws"),
    );
    expect(rejection).toEqual({ status: 401, reason: "Unauthorized" });
  });

  it("accepts X-Eliza-Token header auth", () => {
    setApiToken("test-token");
    const rejection = resolveWebSocketUpgradeRejection(
      req({ "x-milady-token": "test-token" }) as http.IncomingMessage,
      new URL("ws://localhost/ws"),
    );
    expect(rejection).toBeNull();
  });

  it("rejects wrong query token when query auth enabled", () => {
    setApiToken("test-token");
    setAllowQueryToken("1");
    const rejection = resolveWebSocketUpgradeRejection(
      req() as http.IncomingMessage,
      new URL("ws://localhost/ws?token=wrong-token"),
    );
    expect(rejection).toEqual({ status: 401, reason: "Unauthorized" });
  });

  it.each([
    "capacitor://localhost",
    "app://localhost",
    "electrobun://localhost",
    "app://-",
  ])("accepts app-protocol origins (%s)", (origin) => {
    setApiToken(undefined);
    const rejection = resolveWebSocketUpgradeRejection(
      req({ origin }) as http.IncomingMessage,
      new URL("ws://localhost/ws"),
    );
    expect(rejection).toBeNull();
  });

  it("accepts custom allowlisted origins via env", () => {
    setApiToken(undefined);
    setAllowedOrigins("https://trusted.example.com");
    const rejection = resolveWebSocketUpgradeRejection(
      req({ origin: "https://trusted.example.com" }) as http.IncomingMessage,
      new URL("ws://localhost/ws"),
    );
    expect(rejection).toBeNull();
  });

  it("accepts upgrade when no origin header is present", () => {
    setApiToken(undefined);
    const rejection = resolveWebSocketUpgradeRejection(
      req() as http.IncomingMessage,
      new URL("ws://localhost/ws"),
    );
    expect(rejection).toBeNull();
  });

  it("rejects whitespace-only bearer token", () => {
    setApiToken("test-token");
    const rejection = resolveWebSocketUpgradeRejection(
      req({ authorization: "Bearer   " }) as http.IncomingMessage,
      new URL("ws://localhost/ws"),
    );
    expect(rejection).toEqual({ status: 401, reason: "Unauthorized" });
  });

  it("accepts query token via apiKey param when enabled", () => {
    setApiToken("test-token");
    setAllowQueryToken("1");
    const rejection = resolveWebSocketUpgradeRejection(
      req() as http.IncomingMessage,
      new URL("ws://localhost/ws?apiKey=test-token"),
    );
    expect(rejection).toBeNull();
  });

  it("accepts query token via api_key param when enabled", () => {
    setApiToken("test-token");
    setAllowQueryToken("1");
    const rejection = resolveWebSocketUpgradeRejection(
      req() as http.IncomingMessage,
      new URL("ws://localhost/ws?api_key=test-token"),
    );
    expect(rejection).toBeNull();
  });

  it("accepts null origin when ELIZA_ALLOW_NULL_ORIGIN=1", () => {
    setApiToken(undefined);
    setAllowNullOrigin("1");
    const rejection = resolveWebSocketUpgradeRejection(
      req({ origin: "null" }) as http.IncomingMessage,
      new URL("ws://localhost/ws"),
    );
    expect(rejection).toBeNull();
  });
});
