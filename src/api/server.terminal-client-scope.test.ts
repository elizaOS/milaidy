import type http from "node:http";
import { describe, expect, it } from "vitest";
import { createMockHeadersRequest } from "../test-support/test-helpers";
import { normalizeWsClientId, resolveTerminalRunClientId } from "./server";

function req(
  headers: http.IncomingHttpHeaders = {},
): Pick<http.IncomingMessage, "headers"> {
  return createMockHeadersRequest(headers) as Pick<
    http.IncomingMessage,
    "headers"
  >;
}

describe("normalizeWsClientId", () => {
  it("accepts safe client ids and trims whitespace", () => {
    expect(normalizeWsClientId("  ui-abc_123.xyz  ")).toBe("ui-abc_123.xyz");
  });

  it("rejects empty, unsafe, and overly long ids", () => {
    expect(normalizeWsClientId("")).toBeNull();
    expect(normalizeWsClientId("bad$id")).toBeNull();
    expect(normalizeWsClientId("a".repeat(129))).toBeNull();
    expect(normalizeWsClientId(undefined)).toBeNull();
  });
});

describe("resolveTerminalRunClientId", () => {
  it("prefers X-Milady-Client-Id header over request body", () => {
    const request = req({ "x-milady-client-id": "header-client" });
    expect(
      resolveTerminalRunClientId(request, { clientId: "body-client" }),
    ).toBe("header-client");
  });

  it("accepts first value from multi-value header", () => {
    const request = req({
      "x-milady-client-id": ["first-client", "second-client"],
    });
    expect(resolveTerminalRunClientId(request, null)).toBe("first-client");
  });

  it("falls back to body client id when header is invalid", () => {
    const request = req({ "x-milady-client-id": "bad$id" });
    expect(
      resolveTerminalRunClientId(request, { clientId: "body-client" }),
    ).toBe("body-client");
  });

  it("returns null when neither header nor body has a valid client id", () => {
    const request = req();
    expect(
      resolveTerminalRunClientId(request, { clientId: "bad$id" }),
    ).toBeNull();
    expect(resolveTerminalRunClientId(request, null)).toBeNull();
  });
});
