import type http from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMockHeadersRequest } from "./../test-support/test-helpers";
import type { WorkflowDef } from "../workflows/types";

vi.mock("@elizaos/plugin-pi-ai", () => ({
  listPiAiModelOptions: () => [],
}));

vi.mock("@elizaos/plugin-agent-orchestrator", () => ({
  createCodingAgentRouteHandler: () => async () => false,
}));

import {
  resolveTerminalRunRejection,
  resolveWorkflowTransformRejection,
} from "./server";

function req(
  headers: http.IncomingHttpHeaders = {},
): Pick<http.IncomingMessage, "headers"> {
  return createMockHeadersRequest(headers) as Pick<
    http.IncomingMessage,
    "headers"
  >;
}

function makeWorkflow(nodes: WorkflowDef["nodes"]): WorkflowDef {
  return {
    id: "workflow-1",
    name: "Workflow",
    description: "",
    nodes,
    edges: [],
    enabled: true,
    version: 1,
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
  };
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

  it("does not require terminal auth for workflows without transform nodes", () => {
    process.env.MILADY_API_TOKEN = "api-token";
    process.env.MILADY_TERMINAL_RUN_TOKEN = "terminal-secret";

    const rejection = resolveWorkflowTransformRejection(
      req() as http.IncomingMessage,
      {},
      makeWorkflow([
        {
          id: "t1",
          type: "trigger",
          label: "Trigger",
          position: { x: 0, y: 0 },
          config: { triggerType: "manual" },
        },
      ]),
    );

    expect(rejection).toBeNull();
  });

  it("requires terminal auth for workflows with transform nodes", () => {
    process.env.MILADY_API_TOKEN = "api-token";
    process.env.MILADY_TERMINAL_RUN_TOKEN = "terminal-secret";

    const rejection = resolveWorkflowTransformRejection(
      req() as http.IncomingMessage,
      {},
      makeWorkflow([
        {
          id: "t1",
          type: "trigger",
          label: "Trigger",
          position: { x: 0, y: 0 },
          config: { triggerType: "manual" },
        },
        {
          id: "tr1",
          type: "transform",
          label: "Transform",
          position: { x: 0, y: 100 },
          config: { code: "return params._last" },
        },
      ]),
    );

    expect(rejection).toEqual({
      status: 401,
      reason:
        "Missing terminal token. Provide X-Milady-Terminal-Token header or terminalToken in request body.",
    });
  });
});
