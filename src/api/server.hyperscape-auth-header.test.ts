import type http from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { createMockHeadersRequest } from "../test-support/test-helpers";
import { resolveHyperscapeAuthorizationHeader } from "./server";

function req(
  headers: http.IncomingHttpHeaders = {},
): Pick<http.IncomingMessage, "headers"> {
  return createMockHeadersRequest(headers) as Pick<
    http.IncomingMessage,
    "headers"
  >;
}

describe("resolveHyperscapeAuthorizationHeader", () => {
  const previousHyperscapeToken = process.env.HYPERSCAPE_AUTH_TOKEN;

  afterEach(() => {
    if (previousHyperscapeToken === undefined) {
      delete process.env.HYPERSCAPE_AUTH_TOKEN;
    } else {
      process.env.HYPERSCAPE_AUTH_TOKEN = previousHyperscapeToken;
    }
  });

  it("does not forward incoming Authorization headers when hyperscape token is unset", () => {
    delete process.env.HYPERSCAPE_AUTH_TOKEN;

    const auth = resolveHyperscapeAuthorizationHeader(
      req({ authorization: "Bearer milady-control-token" }),
    );

    expect(auth).toBeNull();
  });

  it("uses HYPERSCAPE_AUTH_TOKEN and ignores incoming Authorization header", () => {
    process.env.HYPERSCAPE_AUTH_TOKEN = "hyperscape-secret";

    const auth = resolveHyperscapeAuthorizationHeader(
      req({ authorization: "Bearer milady-control-token" }),
    );

    expect(auth).toBe("Bearer hyperscape-secret");
  });

  it("preserves Bearer prefix on HYPERSCAPE_AUTH_TOKEN", () => {
    process.env.HYPERSCAPE_AUTH_TOKEN = "Bearer hyperscape-secret";

    const auth = resolveHyperscapeAuthorizationHeader(req());

    expect(auth).toBe("Bearer hyperscape-secret");
  });
});
