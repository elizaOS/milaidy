import type http from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMockHeadersRequest } from "./../test-support/test-helpers";

vi.mock("@elizaos/plugin-pi-ai", () => ({
  listPiAiModelOptions: () => [],
}));

vi.mock("@milaidy/plugin-coding-agent", () => ({
  createCodingAgentRouteHandler: () => async () => false,
}));

import { extractAuthToken, isAuthorized } from "./server";

function req(headers: http.IncomingHttpHeaders = {}): http.IncomingMessage {
  return createMockHeadersRequest(headers) as http.IncomingMessage;
}

describe("extractAuthToken", () => {
  it("extracts Bearer token from Authorization header", () => {
    const token = extractAuthToken(req({ authorization: "Bearer my-secret" }));
    expect(token).toBe("my-secret");
  });

  it("extracts token from X-Milady-Token header", () => {
    const token = extractAuthToken(req({ "x-milady-token": "milady-tok" }));
    expect(token).toBe("milady-tok");
  });

  it("extracts token from X-Api-Key header", () => {
    const token = extractAuthToken(req({ "x-api-key": "api-key-val" }));
    expect(token).toBe("api-key-val");
  });

  it("returns null when no auth header is present", () => {
    const token = extractAuthToken(req());
    expect(token).toBeNull();
  });

  it("trims whitespace from extracted tokens", () => {
    const token = extractAuthToken(
      req({ authorization: "Bearer  padded-token  " }),
    );
    expect(token).toBe("padded-token");
  });

  it("prefers Authorization header over X-Milady-Token", () => {
    const token = extractAuthToken(
      req({ authorization: "Bearer bearer-tok", "x-milady-token": "alt-tok" }),
    );
    expect(token).toBe("bearer-tok");
  });
});

describe("isAuthorized (global API auth gate)", () => {
  const prevToken = process.env.MILADY_API_TOKEN;

  afterEach(() => {
    if (prevToken === undefined) delete process.env.MILADY_API_TOKEN;
    else process.env.MILADY_API_TOKEN = prevToken;
  });

  it("rejects when MILADY_API_TOKEN is set and no token provided", () => {
    process.env.MILADY_API_TOKEN = "secret-token";
    expect(isAuthorized(req())).toBe(false);
  });

  it("rejects when MILADY_API_TOKEN is set and wrong token provided", () => {
    process.env.MILADY_API_TOKEN = "secret-token";
    expect(isAuthorized(req({ authorization: "Bearer wrong-token" }))).toBe(
      false,
    );
  });

  it("rejects when token has different length than expected", () => {
    process.env.MILADY_API_TOKEN = "secret-token";
    expect(isAuthorized(req({ authorization: "Bearer short" }))).toBe(false);
  });

  it("accepts when MILADY_API_TOKEN is set and correct Bearer token provided", () => {
    process.env.MILADY_API_TOKEN = "secret-token";
    expect(isAuthorized(req({ authorization: "Bearer secret-token" }))).toBe(
      true,
    );
  });

  it("accepts when MILADY_API_TOKEN is set and correct X-Api-Key provided", () => {
    process.env.MILADY_API_TOKEN = "secret-token";
    expect(isAuthorized(req({ "x-api-key": "secret-token" }))).toBe(true);
  });

  it("accepts when MILADY_API_TOKEN is set and correct X-Milady-Token provided", () => {
    process.env.MILADY_API_TOKEN = "secret-token";
    expect(isAuthorized(req({ "x-milady-token": "secret-token" }))).toBe(true);
  });

  it("accepts any request when MILADY_API_TOKEN is unset (open access)", () => {
    delete process.env.MILADY_API_TOKEN;
    expect(isAuthorized(req())).toBe(true);
  });

  it("accepts any request when MILADY_API_TOKEN is empty string", () => {
    process.env.MILADY_API_TOKEN = "   ";
    expect(isAuthorized(req())).toBe(true);
  });
});
