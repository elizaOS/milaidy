import type http from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMockHeadersRequest } from "./../test-support/test-helpers";

vi.mock("@elizaos/plugin-pi-ai", () => ({
  listPiAiModelOptions: () => [],
}));

vi.mock("@milaidy/plugin-coding-agent", () => ({
  createCodingAgentRouteHandler: () => async () => false,
}));

import { resolveTerminalRunRejection } from "./server";

function req(
  headers: http.IncomingHttpHeaders = {},
): Pick<http.IncomingMessage, "headers"> {
  return createMockHeadersRequest(headers) as Pick<
    http.IncomingMessage,
    "headers"
  >;
}

describe("resolveTerminalRunRejection", () => {
  const prevApiToken = process.env.MILADY_API_TOKEN;
  const prevTerminalToken = process.env.MILADY_TERMINAL_RUN_TOKEN;

  afterEach(() => {
    if (prevApiToken === undefined) {
      delete process.env.MILADY_API_TOKEN;
    } else {
      process.env.MILADY_API_TOKEN = prevApiToken;
    }

    if (prevTerminalToken === undefined) {
      delete process.env.MILADY_TERMINAL_RUN_TOKEN;
    } else {
      process.env.MILADY_TERMINAL_RUN_TOKEN = prevTerminalToken;
    }
  });

  it("allows legacy local mode when no API token and no terminal token are set", () => {
    delete process.env.MILADY_API_TOKEN;
    delete process.env.MILADY_TERMINAL_RUN_TOKEN;

    const rejection = resolveTerminalRunRejection(
      req() as http.IncomingMessage,
      {},
    );

    expect(rejection).toBeNull();
  });

  it("rejects token-authenticated API sessions when terminal token is disabled", () => {
    process.env.MILADY_API_TOKEN = "api-token";
    delete process.env.MILADY_TERMINAL_RUN_TOKEN;

    const rejection = resolveTerminalRunRejection(
      req() as http.IncomingMessage,
      {},
    );

    expect(rejection).toEqual({
      status: 403,
      reason:
        "Terminal run is disabled for token-authenticated API sessions. Set MILADY_TERMINAL_RUN_TOKEN to enable command execution.",
    });
  });

  it("rejects when terminal token is missing", () => {
    process.env.MILADY_API_TOKEN = "api-token";
    process.env.MILADY_TERMINAL_RUN_TOKEN = "terminal-secret";

    const rejection = resolveTerminalRunRejection(
      req() as http.IncomingMessage,
      {},
    );

    expect(rejection).toEqual({
      status: 401,
      reason:
        "Missing terminal token. Provide X-Milady-Terminal-Token header or terminalToken in request body.",
    });
  });

  it("rejects invalid terminal token", () => {
    process.env.MILADY_API_TOKEN = "api-token";
    process.env.MILADY_TERMINAL_RUN_TOKEN = "terminal-secret";

    const rejection = resolveTerminalRunRejection(
      req() as http.IncomingMessage,
      { terminalToken: "wrong" },
    );

    expect(rejection).toEqual({
      status: 401,
      reason: "Invalid terminal token.",
    });
  });

  it("accepts a valid terminal token from header", () => {
    process.env.MILADY_API_TOKEN = "api-token";
    process.env.MILADY_TERMINAL_RUN_TOKEN = "terminal-secret";

    const rejection = resolveTerminalRunRejection(
      req({
        "x-milady-terminal-token": "terminal-secret",
      }) as http.IncomingMessage,
      {},
    );

    expect(rejection).toBeNull();
  });

  it("accepts a valid terminal token from body", () => {
    process.env.MILADY_API_TOKEN = "api-token";
    process.env.MILADY_TERMINAL_RUN_TOKEN = "terminal-secret";

    const rejection = resolveTerminalRunRejection(
      req() as http.IncomingMessage,
      { terminalToken: "terminal-secret" },
    );

    expect(rejection).toBeNull();
  });

  it("enforces explicit terminal token when configured without API token", () => {
    delete process.env.MILADY_API_TOKEN;
    process.env.MILADY_TERMINAL_RUN_TOKEN = "terminal-secret";

    const rejection = resolveTerminalRunRejection(
      req() as http.IncomingMessage,
      {},
    );

    expect(rejection).toEqual({
      status: 401,
      reason:
        "Missing terminal token. Provide X-Milady-Terminal-Token header or terminalToken in request body.",
    });
  });
});
