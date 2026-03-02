import type http from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createMockHttpResponse,
  createMockIncomingMessage,
} from "../test-support/test-helpers.js";
import type { CloudRouteState } from "./cloud-routes.js";
import { handleCloudRoute } from "./cloud-routes.js";

const fetchMock =
  vi.fn<
    (input: string | URL | Request, init?: RequestInit) => Promise<Response>
  >();
const { saveMiladyConfigMock, validateCloudBaseUrlMock } = vi.hoisted(() => ({
  saveMiladyConfigMock: vi.fn<(config: unknown) => void>(),
  validateCloudBaseUrlMock: vi.fn<(rawUrl: string) => Promise<string | null>>(),
}));

vi.mock("../cloud/validate-url.js", () => ({
  validateCloudBaseUrl: validateCloudBaseUrlMock,
}));

vi.mock("../config/config.js", () => ({
  saveMiladyConfig: saveMiladyConfigMock,
}));

function createState(createAgent: (args: unknown) => Promise<unknown>) {
  return {
    config: {} as CloudRouteState["config"],
    runtime: null,
    cloudManager: {
      getClient: () => ({
        listAgents: async () => [],
        createAgent,
      }),
    },
  } as unknown as CloudRouteState;
}

describe("handleCloudRoute", () => {
  it("returns 400 for invalid JSON in POST /api/cloud/agents", async () => {
    const req = createMockIncomingMessage({
      method: "POST",
      url: "/api/cloud/agents",
      headers: {},
      bodyChunks: [Buffer.from("{")],
    });
    const { res, getStatus, getJson } = createMockHttpResponse();
    const createAgent = vi.fn().mockResolvedValue({ id: "agent-1" });

    const handled = await handleCloudRoute(
      req,
      res,
      "/api/cloud/agents",
      "POST",
      createState(createAgent),
    );

    expect(handled).toBe(true);
    expect(getStatus()).toBe(400);
    expect(getJson()).toEqual({ error: "Invalid JSON in request body" });
    expect(createAgent).not.toHaveBeenCalled();
  });

  it("returns 413 when POST /api/cloud/agents body exceeds size limit", async () => {
    const req = createMockIncomingMessage({
      method: "POST",
      url: "/api/cloud/agents",
      headers: {},
      bodyChunks: [Buffer.alloc(1_048_577, "a")],
    });
    const { res, getStatus, getJson } = createMockHttpResponse();
    const createAgent = vi.fn().mockResolvedValue({ id: "agent-1" });

    const handled = await handleCloudRoute(
      req,
      res,
      "/api/cloud/agents",
      "POST",
      createState(createAgent),
    );

    expect(handled).toBe(true);
    expect(getStatus()).toBe(413);
    expect(getJson()).toEqual({ error: "Request body too large" });
    expect(createAgent).not.toHaveBeenCalled();
  });

  it("keeps successful create-agent behavior for valid JSON", async () => {
    const req = createMockIncomingMessage({
      method: "POST",
      url: "/api/cloud/agents",
      headers: {},
      body: JSON.stringify({
        agentName: "My Agent",
        agentConfig: { modelProvider: "openai" },
      }),
    });
    const { res, getStatus, getJson } = createMockHttpResponse();
    const createAgent = vi.fn().mockResolvedValue({ id: "agent-1" });

    const handled = await handleCloudRoute(
      req,
      res,
      "/api/cloud/agents",
      "POST",
      createState(createAgent),
    );

    expect(handled).toBe(true);
    expect(getStatus()).toBe(201);
    expect(createAgent).toHaveBeenCalledTimes(1);
    expect(getJson()).toEqual({ ok: true, agent: { id: "agent-1" } });
  });

  it("clears cached cloud auth state for POST /api/cloud/disconnect", async () => {
    saveMiladyConfigMock.mockClear();
    process.env.ELIZAOS_CLOUD_API_KEY = "ck-test";
    process.env.ELIZAOS_CLOUD_ENABLED = "true";

    const disconnectMock = vi.fn(async () => undefined);
    const updateAgentMock = vi.fn(async () => undefined);
    const state = {
      config: {
        cloud: {
          enabled: true,
          apiKey: "ck-test",
        },
      },
      runtime: {
        agentId: "00000000-0000-0000-0000-000000000001",
        character: {
          secrets: {
            ELIZAOS_CLOUD_API_KEY: "ck-test",
            ELIZAOS_CLOUD_ENABLED: "true",
          },
        },
        updateAgent: updateAgentMock,
      },
      cloudManager: {
        disconnect: disconnectMock,
      },
    } as unknown as CloudRouteState;

    const { res, getStatus, getJson } = createMockHttpResponse();
    const handled = await handleCloudRoute(
      createMockIncomingMessage({
        method: "POST",
        url: "/api/cloud/disconnect",
      }),
      res,
      "/api/cloud/disconnect",
      "POST",
      state,
    );

    expect(handled).toBe(true);
    expect(getStatus()).toBe(200);
    expect(getJson()).toEqual({ ok: true, status: "disconnected" });
    expect(disconnectMock).toHaveBeenCalledTimes(1);
    expect(saveMiladyConfigMock).toHaveBeenCalledTimes(1);

    expect(state.config.cloud?.enabled).toBe(false);
    expect(state.config.cloud?.apiKey).toBeUndefined();
    expect(process.env.ELIZAOS_CLOUD_API_KEY).toBeUndefined();
    expect(process.env.ELIZAOS_CLOUD_ENABLED).toBeUndefined();

    expect(updateAgentMock).toHaveBeenCalledTimes(1);
    const updatePayload = updateAgentMock.mock.calls[0]?.[1] as {
      secrets?: Record<string, unknown>;
    };
    expect(updatePayload.secrets?.ELIZAOS_CLOUD_API_KEY).toBeUndefined();
    expect(updatePayload.secrets?.ELIZAOS_CLOUD_ENABLED).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Timeout behavior tests
// ---------------------------------------------------------------------------

function timeoutError(message = "The operation was aborted due to timeout") {
  const err = new Error(message);
  err.name = "TimeoutError";
  return err;
}

function cloudState(): CloudRouteState {
  return {
    config: { cloud: { baseUrl: "https://test.elizacloud.ai" } },
    cloudManager: null,
    runtime: null,
  } as unknown as CloudRouteState;
}

describe("handleCloudRoute timeout behavior", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    validateCloudBaseUrlMock.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.ELIZAOS_CLOUD_API_KEY;
    delete process.env.ELIZAOS_CLOUD_ENABLED;
  });

  it("returns 504 when cloud login session creation times out", async () => {
    let capturedSignal: AbortSignal | null | undefined;
    fetchMock.mockImplementation(async (_input, init) => {
      capturedSignal = init?.signal;
      throw timeoutError();
    });

    const { res, getJson } = createMockHttpResponse<Record<string, unknown>>();
    const handled = await handleCloudRoute(
      createMockIncomingMessage({
        url: "/api/cloud/login",
      }) as http.IncomingMessage,
      res,
      "/api/cloud/login",
      "POST",
      cloudState(),
    );

    expect(handled).toBe(true);
    expect(res.statusCode).toBe(504);
    expect(getJson().error).toBe("Eliza Cloud login request timed out");
    expect(capturedSignal).toBeInstanceOf(AbortSignal);
  });

  it("rejects redirected cloud login session creation", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 302,
      statusText: "Found",
      headers: new Headers({
        location: "http://169.254.169.254/latest/meta-data",
      }),
      json: async () => ({}),
    } as Response);

    const { res, getJson } = createMockHttpResponse<Record<string, unknown>>();
    const handled = await handleCloudRoute(
      createMockIncomingMessage({
        url: "/api/cloud/login",
      }) as http.IncomingMessage,
      res,
      "/api/cloud/login",
      "POST",
      cloudState(),
    );

    expect(handled).toBe(true);
    expect(res.statusCode).toBe(502);
    expect(getJson().error).toBe(
      "Eliza Cloud login request was redirected; redirects are not allowed",
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "https://test.elizacloud.ai/api/auth/cli-session",
      expect.objectContaining({ redirect: "manual" }),
    );
  });

  it("returns 504 when cloud login status polling times out", async () => {
    fetchMock.mockRejectedValue(timeoutError());

    const { res, getJson } = createMockHttpResponse<Record<string, unknown>>();
    const handled = await handleCloudRoute(
      createMockIncomingMessage({
        url: "/api/cloud/login/status?sessionId=test-session",
      }) as http.IncomingMessage,
      res,
      "/api/cloud/login/status",
      "GET",
      cloudState(),
    );

    expect(handled).toBe(true);
    expect(res.statusCode).toBe(504);
    expect(getJson()).toEqual({
      status: "error",
      error: "Eliza Cloud status request timed out",
    });
  });

  it("rejects redirected cloud login status polling", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 307,
      statusText: "Temporary Redirect",
      headers: new Headers({
        location: "http://127.0.0.1:8080/internal",
      }),
      json: async () => ({}),
    } as Response);

    const { res, getJson } = createMockHttpResponse<Record<string, unknown>>();
    const handled = await handleCloudRoute(
      createMockIncomingMessage({
        url: "/api/cloud/login/status?sessionId=test-session",
      }) as http.IncomingMessage,
      res,
      "/api/cloud/login/status",
      "GET",
      cloudState(),
    );

    expect(handled).toBe(true);
    expect(res.statusCode).toBe(502);
    expect(getJson()).toEqual({
      status: "error",
      error:
        "Eliza Cloud status request was redirected; redirects are not allowed",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://test.elizacloud.ai/api/auth/cli-session/test-session",
      expect.objectContaining({ redirect: "manual" }),
    );
  });

  it("returns 502 when cloud polling fails for non-timeout network errors", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));

    const { res, getJson } = createMockHttpResponse<Record<string, unknown>>();
    const handled = await handleCloudRoute(
      createMockIncomingMessage({
        url: "/api/cloud/login/status?sessionId=test-session",
      }) as http.IncomingMessage,
      res,
      "/api/cloud/login/status",
      "GET",
      cloudState(),
    );

    expect(handled).toBe(true);
    expect(res.statusCode).toBe(502);
    expect(getJson()).toEqual({
      status: "error",
      error: "Failed to reach Eliza Cloud",
    });
  });
});
