import type http from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { createMockHeadersRequest } from "./../test-support/test-helpers";
import { resolveWalletExportRejection } from "./server";

function req(
  headers: http.IncomingHttpHeaders = {},
): Pick<http.IncomingMessage, "headers"> {
  return createMockHeadersRequest(headers) as Pick<
    http.IncomingMessage,
    "headers"
  >;
}

describe("resolveWalletExportRejection", () => {
  const prevExportToken = process.env.MILADY_WALLET_EXPORT_TOKEN;

  afterEach(() => {
    if (prevExportToken === undefined) {
      delete process.env.MILADY_WALLET_EXPORT_TOKEN;
    } else {
      process.env.MILADY_WALLET_EXPORT_TOKEN = prevExportToken;
    }
  });

  it("rejects when confirmation is missing", () => {
    delete process.env.MILADY_WALLET_EXPORT_TOKEN;
    const rejection = resolveWalletExportRejection(
      req() as http.IncomingMessage,
      {},
    );
    expect(rejection?.status).toBe(403);
    expect(rejection?.reason).toContain("confirm");
  });

  it("rejects when export token feature is disabled", () => {
    delete process.env.MILADY_WALLET_EXPORT_TOKEN;
    const rejection = resolveWalletExportRejection(
      req() as http.IncomingMessage,
      { confirm: true },
    );
    expect(rejection).toEqual({
      status: 403,
      reason:
        "Wallet export is disabled. Set MILADY_WALLET_EXPORT_TOKEN to enable secure exports.",
    });
  });

  it("rejects when export token is missing", () => {
    process.env.MILADY_WALLET_EXPORT_TOKEN = "secret-token";
    const rejection = resolveWalletExportRejection(
      req() as http.IncomingMessage,
      { confirm: true },
    );
    expect(rejection).toEqual({
      status: 401,
      reason:
        "Missing export token. Provide X-Milady-Export-Token header or exportToken in request body.",
    });
  });

  it("rejects when export token is invalid", () => {
    process.env.MILADY_WALLET_EXPORT_TOKEN = "secret-token";
    const rejection = resolveWalletExportRejection(
      req() as http.IncomingMessage,
      { confirm: true, exportToken: "wrong-token" },
    );
    expect(rejection).toEqual({ status: 401, reason: "Invalid export token." });
  });

  it("accepts a valid token from body", () => {
    process.env.MILADY_WALLET_EXPORT_TOKEN = "secret-token";
    const rejection = resolveWalletExportRejection(
      req() as http.IncomingMessage,
      { confirm: true, exportToken: "secret-token" },
    );
    expect(rejection).toBeNull();
  });

  it("accepts a valid token from header", () => {
    process.env.MILADY_WALLET_EXPORT_TOKEN = "secret-token";
    const rejection = resolveWalletExportRejection(
      req({ "x-milady-export-token": "secret-token" }) as http.IncomingMessage,
      { confirm: true },
    );
    expect(rejection).toBeNull();
  });
});
