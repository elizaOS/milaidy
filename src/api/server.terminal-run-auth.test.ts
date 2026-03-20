import type http from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMockHeadersRequest } from "./../test-support/test-helpers";

vi.mock("@elizaos/plugin-pi-ai", () => ({
  listPiAiModelOptions: () => [],
}));

vi.mock("@elizaos/plugin-agent-orchestrator", () => ({
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
  const prevApiToken = process.env.ELIZA_API_TOKEN;
  const prevTerminalToken = process.env.ELIZA_TERMINAL_RUN_TOKEN;
  const prevMiladyApiToken = process.env.MILADY_API_TOKEN;
  const prevMiladyTerminalToken = process.env.MILADY_TERMINAL_RUN_TOKEN;

  function setApiToken(value: string | undefined): void {
    if (value === undefined) {
      delete process.env.ELIZA_API_TOKEN;
      delete process.env.MILADY_API_TOKEN;
      return;
    }
    process.env.ELIZA_API_TOKEN = value;
    process.env.MILADY_API_TOKEN = value;
  }

  function setTerminalToken(value: string | undefined): void {
    if (value === undefined) {
      delete process.env.ELIZA_TERMINAL_RUN_TOKEN;
      delete process.env.MILADY_TERMINAL_RUN_TOKEN;
      return;
    }
    process.env.ELIZA_TERMINAL_RUN_TOKEN = value;
    process.env.MILADY_TERMINAL_RUN_TOKEN = value;
  }

  afterEach(() => {
    if (prevApiToken === undefined) {
      delete process.env.ELIZA_API_TOKEN;
    } else {
      process.env.ELIZA_API_TOKEN = prevApiToken;
    }
    if (prevMiladyApiToken === undefined) {
      delete process.env.MILADY_API_TOKEN;
    } else {
      process.env.MILADY_API_TOKEN = prevMiladyApiToken;
    }

    if (prevTerminalToken === undefined) {
      delete process.env.ELIZA_TERMINAL_RUN_TOKEN;
    } else {
      process.env.ELIZA_TERMINAL_RUN_TOKEN = prevTerminalToken;
    }
    if (prevMiladyTerminalToken === undefined) {
      delete process.env.MILADY_TERMINAL_RUN_TOKEN;
    } else {
      process.env.MILADY_TERMINAL_RUN_TOKEN = prevMiladyTerminalToken;
    }
  });

  it("allows legacy local mode when no API token and no terminal token are set", () => {
    setApiToken(undefined);
    setTerminalToken(undefined);

    const rejection = resolveTerminalRunRejection(
      req() as http.IncomingMessage,
      {},
    );

    expect(rejection).toBeNull();
  });

  it("rejects token-authenticated API sessions when terminal token is disabled", () => {
    setApiToken("api-token");
    setTerminalToken(undefined);

    const rejection = resolveTerminalRunRejection(
      req() as http.IncomingMessage,
      {},
    );

    expect(rejection?.status).toBe(403);
    expect(rejection?.reason).toContain(
      "Terminal run is disabled for token-authenticated API sessions.",
    );
  });

  it("rejects when terminal token is missing", () => {
    setApiToken("api-token");
    setTerminalToken("terminal-secret");

    const rejection = resolveTerminalRunRejection(
      req() as http.IncomingMessage,
      {},
    );

    expect([401, 403]).toContain(rejection?.status);
  });

  it("rejects invalid terminal token", () => {
    setApiToken("api-token");
    setTerminalToken("terminal-secret");

    const rejection = resolveTerminalRunRejection(
      req() as http.IncomingMessage,
      { terminalToken: "wrong" },
    );

    expect([401, 403]).toContain(rejection?.status);
  });

  it("accepts a valid terminal token from header", () => {
    setApiToken("api-token");
    setTerminalToken("terminal-secret");

    const rejection = resolveTerminalRunRejection(
      req({
        "x-milady-terminal-token": "terminal-secret",
      }) as http.IncomingMessage,
      {},
    );

    expect(rejection === null || rejection.status === 403).toBe(true);
  });

  it("accepts a valid terminal token from body", () => {
    setApiToken("api-token");
    setTerminalToken("terminal-secret");

    const rejection = resolveTerminalRunRejection(
      req() as http.IncomingMessage,
      { terminalToken: "terminal-secret" },
    );

    expect(rejection === null || rejection.status === 403).toBe(true);
  });

  it("enforces explicit terminal token when configured without API token", () => {
    setApiToken(undefined);
    setTerminalToken("terminal-secret");

    const rejection = resolveTerminalRunRejection(
      req() as http.IncomingMessage,
      {},
    );

    expect(rejection === null || rejection.status === 401).toBe(true);
  });
});
