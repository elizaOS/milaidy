import type http from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createMockHttpResponse,
  createMockIncomingMessage,
} from "../test-support/test-helpers";
import type { CloudRouteState } from "./cloud-routes";
import { handleCloudRoute } from "./cloud-routes";

const fetchMock =
  vi.fn<
    (input: string | URL | Request, init?: RequestInit) => Promise<Response>
  >();
const { saveMiladyConfigMock, validateCloudBaseUrlMock } = vi.hoisted(() => ({
  saveMiladyConfigMock: vi.fn<(config: unknown) => void>(),
  validateCloudBaseUrlMock: vi.fn<(rawUrl: string) => Promise<string | null>>(),
}));

vi.mock("../cloud/validate-url", () => ({
  validateCloudBaseUrl: validateCloudBaseUrlMock,
}));

vi.mock("../config/config", () => ({
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
  it("returns false for unknown routes", async () => {
    const { res } = createMockHttpResponse();
    const handled = await handleCloudRoute(
      createMockIncomingMessage({
        method: "GET",
        url: "/api/unknown",
      }),
      res,
      "/api/unknown",
      "GET",
      { config: {}, runtime: null, cloudManager: null } as CloudRouteState,
    );

    expect(handled).toBe(false);
  });

  it("returns 401 for GET /api/cloud/agents without a connected client", async () => {
    const req = createMockIncomingMessage({
      method: "GET",
      url: "/api/cloud/agents",
    });
    const { res, getStatus, getJson } = createMockHttpResponse();
    const state = {
      config: {},
      runtime: null,
      cloudManager: {
        getClient: () => null,
      },
    } as unknown as CloudRouteState;

    const handled = await handleCloudRoute(
      req,
      res,
      "/api/cloud/agents",
      "GET",
      state,
    );

    expect(handled).toBe(true);
    expect(getStatus()).toBe(401);
    expect(getJson()).toEqual({ error: "Not connected to Eliza Cloud" });
  });

  it("returns 400 for POST /api/cloud/agents when agentName is missing", async () => {
    const req = createMockIncomingMessage({
      method: "POST",
      url: "/api/cloud/agents",
      body: { agentConfig: { modelProvider: "openai" } },
      json: true,
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
    expect(getJson()).toEqual({ error: "agentName is required" });
    expect(createAgent).not.toHaveBeenCalled();
  });

  it("returns 401 for POST /api/cloud/agents when cloud manager is disconnected", async () => {
    const req = createMockIncomingMessage({
      method: "POST",
      url: "/api/cloud/agents",
      body: { agentName: "Agent" },
      json: true,
    });
    const { res, getStatus, getJson } = createMockHttpResponse();
    const state = {
      config: {},
      runtime: null,
      cloudManager: {
        getClient: () => null,
      },
    } as unknown as CloudRouteState;

    const handled = await handleCloudRoute(
      req,
      res,
      "/api/cloud/agents",
      "POST",
      state,
    );

    expect(handled).toBe(true);
    expect(getStatus()).toBe(401);
    expect(getJson()).toEqual({ error: "Not connected to Eliza Cloud" });
  });

  it("lists cloud agents when the cloud client is connected", async () => {
    const listAgentsMock = vi.fn().mockResolvedValue([
      {
        id: "agent-1",
      },
    ]);
    const state = {
      config: {},
      runtime: null,
      cloudManager: {
        getClient: () => ({
          listAgents: listAgentsMock,
        }),
      },
    } as unknown as CloudRouteState;
    const { res, getStatus, getJson } = createMockHttpResponse();

    const handled = await handleCloudRoute(
      createMockIncomingMessage({
        method: "GET",
        url: "/api/cloud/agents",
      }),
      res,
      "/api/cloud/agents",
      "GET",
      state,
    );

    expect(handled).toBe(true);
    expect(getStatus()).toBe(200);
    expect(listAgentsMock).toHaveBeenCalledTimes(1);
    expect(getJson()).toEqual({
      ok: true,
      agents: [{ id: "agent-1" }],
    });
  });

  it("returns 400 when validateCloudBaseUrl rejects login base URL", async () => {
    validateCloudBaseUrlMock.mockResolvedValueOnce("Invalid cloud base URL");
    const req = createMockIncomingMessage({
      method: "POST",
      url: "/api/cloud/login",
      body: {},
      json: true,
    });
    const { res, getStatus, getJson } = createMockHttpResponse();

    const handled = await handleCloudRoute(
      req,
      res,
      "/api/cloud/login",
      "POST",
      cloudState(),
    );

    expect(handled).toBe(true);
    expect(getStatus()).toBe(400);
    expect(getJson()).toEqual({ error: "Invalid cloud base URL" });
  });

  it("uses the default cloud base URL for /api/cloud/login", async () => {
    const { res, getStatus, getJson } =
      createMockHttpResponse<Record<string, unknown>>();
    fetchMock.mockResolvedValue({
      ok: true,
      headers: new Headers(),
      json: async () => ({}),
    } as Response);

    const handled = await handleCloudRoute(
      createMockIncomingMessage({
        method: "POST",
        url: "/api/cloud/login",
      }) as http.IncomingMessage,
      res,
      "/api/cloud/login",
      "POST",
      { config: {}, runtime: null, cloudManager: null } as CloudRouteState,
    );

    expect(handled).toBe(true);
    expect(getStatus()).toBe(200);
    expect(getJson().browserUrl).toMatch(
      /^https:\/\/www\.elizacloud\.ai\/auth\/cli-login\?session=/,
    );
  });

  it("requires sessionId for GET /api/cloud/login/status", async () => {
    const req = createMockIncomingMessage({
      method: "GET",
      url: "/api/cloud/login/status",
    });
    const { res, getStatus, getJson } = createMockHttpResponse();

    const handled = await handleCloudRoute(
      req,
      res,
      "/api/cloud/login/status",
      "GET",
      cloudState(),
    );

    expect(handled).toBe(true);
    expect(getStatus()).toBe(400);
    expect(getJson()).toEqual({
      error: "sessionId query parameter is required",
    });
  });

  it("parses status request when request url and host are missing", async () => {
    const req = createMockIncomingMessage({
      method: "GET",
      headers: {},
    }) as http.IncomingMessage;
    delete (req as { url?: string }).url;
    const { res, getStatus, getJson } = createMockHttpResponse();

    const handled = await handleCloudRoute(
      req,
      res,
      "/api/cloud/login/status",
      "GET",
      cloudState(),
    );

    expect(handled).toBe(true);
    expect(getStatus()).toBe(400);
    expect(getJson()).toEqual({
      error: "sessionId query parameter is required",
    });
  });

  it("returns 400 for invalid agent ID on provision endpoint", async () => {
    const req = createMockIncomingMessage({
      method: "POST",
      url: "/api/cloud/agents/not-a-uuid/provision",
    });
    const state = {
      config: {},
      runtime: null,
      cloudManager: {
        getClient: () => ({
          createAgent: vi.fn(),
          deleteAgent: vi.fn(),
          listAgents: vi.fn(),
          getAgent: vi.fn(),
          provision: vi.fn(),
        }),
        connect: vi.fn(),
        getClientStatus: vi.fn(),
        getStatus: vi.fn(),
      },
    } as unknown as CloudRouteState;
    const { res, getStatus, getJson } = createMockHttpResponse();

    const handled = await handleCloudRoute(
      req,
      res,
      "/api/cloud/agents/not-a-uuid/provision",
      "POST",
      state,
    );

    expect(handled).toBe(true);
    expect(getStatus()).toBe(400);
    expect(getJson()).toEqual({
      error: "Invalid agent ID or cloud not connected",
    });
  });

  it("provisions a valid agent ID and returns connection metadata", async () => {
    const validAgentId = "123e4567-e89b-12d3-a456-426614174000";
    const connectMock = vi.fn().mockResolvedValue({ agentName: "Test Agent" });
    const statusMock = vi.fn(() => "connected");
    const req = createMockIncomingMessage({
      method: "POST",
      url: `/api/cloud/agents/${validAgentId}/provision`,
    });
    const state = {
      config: {},
      runtime: null,
      cloudManager: {
        getClient: () => ({
          createAgent: vi.fn(),
          deleteAgent: vi.fn(),
          listAgents: vi.fn(),
        }),
        connect: connectMock,
        getStatus: statusMock,
      },
    } as unknown as CloudRouteState;
    const { res, getStatus, getJson } = createMockHttpResponse();

    const handled = await handleCloudRoute(
      req,
      res,
      `/api/cloud/agents/${validAgentId}/provision`,
      "POST",
      state,
    );

    expect(handled).toBe(true);
    expect(getStatus()).toBe(200);
    expect(connectMock).toHaveBeenCalledWith(validAgentId);
    expect(getJson()).toEqual({
      ok: true,
      agentId: validAgentId,
      agentName: "Test Agent",
      status: "connected",
    });
  });

  it("returns 401 for shutdown when cloud manager has no client", async () => {
    const validAgentId = "123e4567-e89b-12d3-a456-426614174000";
    const req = createMockIncomingMessage({
      method: "POST",
      url: `/api/cloud/agents/${validAgentId}/shutdown`,
    });
    const state = {
      config: {},
      runtime: null,
      cloudManager: {
        getClient: () => null,
      },
    } as unknown as CloudRouteState;
    const { res, getStatus, getJson } = createMockHttpResponse();

    const handled = await handleCloudRoute(
      req,
      res,
      `/api/cloud/agents/${validAgentId}/shutdown`,
      "POST",
      state,
    );

    expect(handled).toBe(true);
    expect(getStatus()).toBe(401);
    expect(getJson()).toEqual({ error: "Not connected to Eliza Cloud" });
  });

  it("disconnects active cloud agent on shutdown and deletes target agent", async () => {
    const validAgentId = "123e4567-e89b-12d3-a456-426614174000";
    const disconnectMock = vi.fn();
    const deleteAgentMock = vi.fn(async () => undefined);
    const req = createMockIncomingMessage({
      method: "POST",
      url: `/api/cloud/agents/${validAgentId}/shutdown`,
    });
    const state = {
      config: {},
      runtime: null,
      cloudManager: {
        getClient: () => ({ deleteAgent: deleteAgentMock }),
        getActiveAgentId: () => validAgentId,
        disconnect: disconnectMock,
      },
    } as unknown as CloudRouteState;
    const { res, getStatus, getJson } = createMockHttpResponse();

    const handled = await handleCloudRoute(
      req,
      res,
      `/api/cloud/agents/${validAgentId}/shutdown`,
      "POST",
      state,
    );

    expect(handled).toBe(true);
    expect(disconnectMock).toHaveBeenCalledTimes(1);
    expect(deleteAgentMock).toHaveBeenCalledWith(validAgentId);
    expect(getStatus()).toBe(200);
    expect(getJson()).toEqual({
      ok: true,
      agentId: validAgentId,
      status: "stopped",
    });
  });

  it("does not disconnect active agent when shutting down a different agent", async () => {
    const validAgentId = "123e4567-e89b-12d3-a456-426614174000";
    const differentAgentId = "987f6543-e21b-34d5-a678-112233445566";
    const disconnectMock = vi.fn();
    const deleteAgentMock = vi.fn(async () => undefined);
    const req = createMockIncomingMessage({
      method: "POST",
      url: `/api/cloud/agents/${validAgentId}/shutdown`,
    });
    const state = {
      config: {},
      runtime: null,
      cloudManager: {
        getClient: () => ({ deleteAgent: deleteAgentMock }),
        getActiveAgentId: () => differentAgentId,
        disconnect: disconnectMock,
      },
    } as unknown as CloudRouteState;
    const { res, getStatus, getJson } = createMockHttpResponse();

    const handled = await handleCloudRoute(
      req,
      res,
      `/api/cloud/agents/${validAgentId}/shutdown`,
      "POST",
      state,
    );

    expect(handled).toBe(true);
    expect(disconnectMock).not.toHaveBeenCalled();
    expect(deleteAgentMock).toHaveBeenCalledWith(validAgentId);
    expect(getStatus()).toBe(200);
    expect(getJson()).toEqual({
      ok: true,
      agentId: validAgentId,
      status: "stopped",
    });
  });

  it("returns 400 for connect with invalid agent ID", async () => {
    const disconnectMock = vi.fn();
    const state = {
      config: {},
      runtime: null,
      cloudManager: {
        getActiveAgentId: vi.fn(),
        disconnect: disconnectMock,
      },
    } as unknown as CloudRouteState;
    const { res, getStatus, getJson } = createMockHttpResponse();
    const handled = await handleCloudRoute(
      createMockIncomingMessage({
        method: "POST",
        url: "/api/cloud/agents/invalid/connect",
      }),
      res,
      "/api/cloud/agents/invalid/connect",
      "POST",
      state,
    );

    expect(handled).toBe(true);
    expect(getStatus()).toBe(400);
    expect(getJson()).toEqual({
      error: "Invalid agent ID or cloud not connected",
    });
    expect(disconnectMock).not.toHaveBeenCalled();
  });

  it("disconnects active cloud agent before connecting a new one", async () => {
    const validAgentId = "123e4567-e89b-12d3-a456-426614174000";
    const connectMock = vi
      .fn()
      .mockResolvedValue({ agentName: "Reconnected Agent" });
    const statusMock = vi.fn(() => "connected");
    const disconnectMock = vi.fn();
    const state = {
      config: {},
      runtime: null,
      cloudManager: {
        getActiveAgentId: vi.fn(() => "00000000-0000-0000-0000-000000000001"),
        disconnect: disconnectMock,
        connect: connectMock,
        getStatus: statusMock,
      },
    } as unknown as CloudRouteState;
    const { res, getStatus, getJson } = createMockHttpResponse();
    const handled = await handleCloudRoute(
      createMockIncomingMessage({
        method: "POST",
        url: `/api/cloud/agents/${validAgentId}/connect`,
      }),
      res,
      `/api/cloud/agents/${validAgentId}/connect`,
      "POST",
      state,
    );

    expect(handled).toBe(true);
    expect(getStatus()).toBe(200);
    expect(disconnectMock).toHaveBeenCalledTimes(1);
    expect(connectMock).toHaveBeenCalledWith(validAgentId);
    expect(getJson()).toEqual({
      ok: true,
      agentId: validAgentId,
      agentName: "Reconnected Agent",
      status: "connected",
    });
  });

  it("returns 400 for shutdown with invalid agent path when cloud manager missing", async () => {
    const req = createMockIncomingMessage({
      method: "POST",
      url: "/api/cloud/agents/invalid/shutdown",
    });
    const state = {
      config: {},
      runtime: null,
      cloudManager: null,
    } as unknown as CloudRouteState;
    const { res, getStatus, getJson } = createMockHttpResponse();

    const handled = await handleCloudRoute(
      req,
      res,
      "/api/cloud/agents/invalid/shutdown",
      "POST",
      state,
    );

    expect(handled).toBe(true);
    expect(getStatus()).toBe(400);
    expect(getJson()).toEqual({
      error: "Invalid agent ID or cloud not connected",
    });
  });

  it("connects and returns proxy metadata for a valid cloud agent id", async () => {
    const validAgentId = "123e4567-e89b-12d3-a456-426614174000";
    const connectMock = vi.fn().mockResolvedValue({ agentName: "Connected Agent" });
    const statusMock = vi.fn(() => "connected");
    const disconnectMock = vi.fn();
    const state = {
      config: {},
      runtime: null,
      cloudManager: {
        getActiveAgentId: vi.fn(),
        disconnect: disconnectMock,
        connect: connectMock,
        getStatus: statusMock,
      },
    } as unknown as CloudRouteState;
    const { res, getStatus, getJson } = createMockHttpResponse();
    const handled = await handleCloudRoute(
      createMockIncomingMessage({
        method: "POST",
        url: `/api/cloud/agents/${validAgentId}/connect`,
      }),
      res,
      `/api/cloud/agents/${validAgentId}/connect`,
      "POST",
      state,
    );

    expect(handled).toBe(true);
    expect(getStatus()).toBe(200);
    expect(disconnectMock).not.toHaveBeenCalled();
    expect(connectMock).toHaveBeenCalledWith(validAgentId);
    expect(getJson()).toEqual({
      ok: true,
      agentId: validAgentId,
      agentName: "Connected Agent",
      status: "connected",
    });
  });

  it("returns a clean response if disconnect config save fails", async () => {
    process.env.ELIZAOS_CLOUD_API_KEY = "ck-test";
    process.env.ELIZAOS_CLOUD_ENABLED = "true";
    saveMiladyConfigMock.mockImplementationOnce(() => {
      throw new Error("failed to write config");
    });
    const disconnectMock = vi.fn();
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
    expect(state.config.cloud?.enabled).toBe(false);
    expect(state.config.cloud?.apiKey).toBeUndefined();
    expect(process.env.ELIZAOS_CLOUD_API_KEY).toBeUndefined();
    expect(process.env.ELIZAOS_CLOUD_ENABLED).toBeUndefined();
    expect(updateAgentMock).toHaveBeenCalledTimes(1);
  });

  it("disconnects runtime state even when cloud manager is missing", async () => {
    const req = createMockIncomingMessage({
      method: "POST",
      url: "/api/cloud/disconnect",
    });
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
        updateAgent: vi.fn(async () => undefined),
      },
      cloudManager: null,
    } as unknown as CloudRouteState;

    const { res, getStatus, getJson } = createMockHttpResponse();
    const handled = await handleCloudRoute(
      req,
      res,
      "/api/cloud/disconnect",
      "POST",
      state,
    );

    expect(handled).toBe(true);
    expect(getStatus()).toBe(200);
    expect(getJson()).toEqual({ ok: true, status: "disconnected" });
    expect(state.runtime?.updateAgent).toHaveBeenCalledTimes(1);
  });

  it("handles runtime secret persistence failures during disconnect", async () => {
    const updateAgentMock = vi.fn(async () => {
      throw new Error("db unavailable");
    });
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
        disconnect: vi.fn(),
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
    expect(updateAgentMock).toHaveBeenCalledTimes(1);
  });

  it("logs non-error disconnect config save failures", async () => {
    saveMiladyConfigMock.mockImplementationOnce(() => {
      throw "disconnect save failed";
    });
    const state = {
      config: {
        cloud: {
          enabled: true,
          apiKey: "ck-test",
        },
      },
      runtime: null,
      cloudManager: null,
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
  });

  it("logs non-error runtime persistence failures during disconnect", async () => {
    const updateAgentMock = vi.fn(async () => {
      throw "db failed";
    });
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
      cloudManager: null,
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
    expect(updateAgentMock).toHaveBeenCalledTimes(1);
  });

  it("initializes empty cloud config during disconnect when missing", async () => {
    const updateAgentMock = vi.fn(async () => undefined);
    const state = {
      config: {},
      runtime: null,
      cloudManager: {
        disconnect: vi.fn(),
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
    expect(state.config.cloud).toEqual({
      enabled: false,
    });
    expect(updateAgentMock).not.toHaveBeenCalled();
  });

  it("initializes missing runtime secrets and handles disconnect DB failure", async () => {
    const updateAgentMock = vi.fn(async () => {
      throw new Error("db unavailable");
    });
    const disconnectMock = vi.fn();
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
          // no secrets object on purpose to exercise fallback initialisation
          name: "test",
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
    expect(updateAgentMock).toHaveBeenCalledWith(
      "00000000-0000-0000-0000-000000000001",
      {
        secrets: {
          ELIZAOS_CLOUD_API_KEY: undefined,
          ELIZAOS_CLOUD_ENABLED: undefined,
        },
      },
    );
    expect(disconnectMock).toHaveBeenCalledTimes(1);
  });

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

  it("returns 502 when cloud login session creation fails with network error", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));

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
    expect(getJson()).toEqual({ error: "Failed to reach Eliza Cloud" });
  });

  it("returns 502 when cloud login session creation is rejected by service", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 503,
      headers: new Headers(),
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
    expect(getJson()).toEqual({
      error: "Failed to create auth session with Eliza Cloud",
    });
  });

  it("returns login session URL when session creation succeeds", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      headers: new Headers(),
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
    expect(res.statusCode).toBe(200);
    const payload = getJson();
    expect(payload.ok).toBe(true);
    expect(typeof payload.sessionId).toBe("string");
    expect(payload.browserUrl).toMatch(
      /^https:\/\/test\.elizacloud\.ai\/auth\/cli-login\?session=/,
    );
  });

  it("skips cloud client init when login status already has a client", async () => {
    const initMock = vi.fn();
    const state = cloudState();
    state.cloudManager = {
      getClient: vi.fn(() => ({ deleteAgent: vi.fn() })),
      init: initMock,
    } as unknown as CloudRouteState["cloudManager"];
    fetchMock.mockResolvedValue({
      ok: true,
      headers: new Headers(),
      json: async () => ({ status: "authenticated", apiKey: "ak-test" }),
    } as Response);

    const { res, getJson } = createMockHttpResponse<Record<string, unknown>>();
    const handled = await handleCloudRoute(
      createMockIncomingMessage({
        url: "/api/cloud/login/status?sessionId=test-session",
      }) as http.IncomingMessage,
      res,
      "/api/cloud/login/status",
      "GET",
      state,
    );

    expect(handled).toBe(true);
    expect(res.statusCode).toBe(200);
    expect(getJson()).toEqual({ status: "authenticated", keyPrefix: undefined });
    expect(initMock).not.toHaveBeenCalled();
  });

  it("logs non-error save failure while handling authenticated login status", async () => {
    saveMiladyConfigMock.mockImplementation(() => {
      throw "persist blocked";
    });
    const state = cloudState();
    state.cloudManager = {
      getClient: () => null,
      init: vi.fn(),
    } as unknown as CloudRouteState["cloudManager"];
    fetchMock.mockResolvedValue({
      ok: true,
      headers: new Headers(),
      json: async () => ({
        status: "authenticated",
        apiKey: "ak-test",
      }),
    } as Response);

    const { res, getJson } = createMockHttpResponse<Record<string, unknown>>();
    const handled = await handleCloudRoute(
      createMockIncomingMessage({
        url: "/api/cloud/login/status?sessionId=test-session",
      }) as http.IncomingMessage,
      res,
      "/api/cloud/login/status",
      "GET",
      state,
    );

    expect(handled).toBe(true);
    expect(res.statusCode).toBe(200);
    expect(getJson()).toEqual({
      status: "authenticated",
      keyPrefix: undefined,
    });
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

  it("returns 400 when cloud login status base URL validation fails", async () => {
    validateCloudBaseUrlMock.mockResolvedValueOnce("Invalid cloud base URL");
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
    expect(res.statusCode).toBe(400);
    expect(getJson()).toEqual({ error: "Invalid cloud base URL" });
  });

  it("returns expired status when cloud session polling returns 404", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 404,
      headers: new Headers(),
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
    expect(res.statusCode).toBe(200);
    expect(getJson()).toEqual({
      status: "expired",
      error: "Session not found or expired",
    });
  });

  it("returns error status when cloud polling returns non-404 failures", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      headers: new Headers(),
      json: async () => ({ error: "server unavailable" }),
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
    expect(res.statusCode).toBe(200);
    expect(getJson()).toEqual({
      status: "error",
      error: "Eliza Cloud returned HTTP 500",
    });
  });

  it("uses default cloud config when saving auth data with missing cloud settings", async () => {
    const initMock = vi.fn();
    const state = cloudState();
    state.config = {};
    state.cloudManager = {
      getClient: () => null,
      init: initMock,
    } as unknown as CloudRouteState["cloudManager"];
    state.runtime = {
      agentId: "00000000-0000-0000-0000-000000000001",
      character: { secrets: {} },
      updateAgent: vi.fn(async () => undefined),
    } as CloudRouteState["runtime"];
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        status: "authenticated",
        apiKey: "ak-missing-config",
      }),
    } as Response);

    const { res, getJson } = createMockHttpResponse<Record<string, unknown>>();
    const handled = await handleCloudRoute(
      createMockIncomingMessage({
        url: "/api/cloud/login/status?sessionId=test-session",
      }) as http.IncomingMessage,
      res,
      "/api/cloud/login/status",
      "GET",
      state,
    );

    expect(handled).toBe(true);
    expect(res.statusCode).toBe(200);
    expect(state.config.cloud).toMatchObject({
      enabled: true,
      apiKey: "ak-missing-config",
    });
    expect(getJson()).toEqual({ status: "authenticated", keyPrefix: undefined });
    expect(initMock).toHaveBeenCalledTimes(1);
  });

  it("returns authenticated state after successful login poll", async () => {
    saveMiladyConfigMock.mockClear();
    const initMock = vi.fn();
    const req = createMockIncomingMessage({
      url: "/api/cloud/login/status?sessionId=test-session",
    });
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        status: "authenticated",
        apiKey: "ak-test",
        keyPrefix: "ak-pfx",
      }),
    } as Response);

    const state = cloudState();
    state.config.cloud = { baseUrl: "https://test.elizacloud.ai" };
    state.cloudManager = {
      getClient: () => null,
      init: initMock,
    } as unknown as CloudRouteState["cloudManager"];

    const { res, getJson } = createMockHttpResponse<Record<string, unknown>>();
    const handled = await handleCloudRoute(
      req as http.IncomingMessage,
      res,
      "/api/cloud/login/status",
      "GET",
      state,
    );

    expect(handled).toBe(true);
    expect(res.statusCode).toBe(200);
    expect(getJson()).toEqual({ status: "authenticated", keyPrefix: "ak-pfx" });
    expect(saveMiladyConfigMock).toHaveBeenCalledWith(state.config);
    expect(initMock).toHaveBeenCalledTimes(1);
    expect(process.env.ELIZAOS_CLOUD_API_KEY).toBe("ak-test");
    expect(process.env.ELIZAOS_CLOUD_ENABLED).toBe("true");
  });

  it("persists authenticated login to runtime and logs non-Error DB failures", async () => {
    const initMock = vi.fn();
    const updateAgentMock = vi.fn(async () => {
      throw "token expired";
    });
    const state = cloudState();
    state.runtime = {
      agentId: "00000000-0000-0000-0000-000000000001",
      character: { secrets: {} },
      updateAgent: updateAgentMock,
    } as CloudRouteState["runtime"];
    state.cloudManager = {
      getClient: () => null,
      init: initMock,
    } as unknown as CloudRouteState["cloudManager"];
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        status: "authenticated",
        apiKey: "ak-runtime",
      }),
    } as Response);

    const { res, getJson } = createMockHttpResponse<Record<string, unknown>>();
    const handled = await handleCloudRoute(
      createMockIncomingMessage({
        url: "/api/cloud/login/status?sessionId=test-session",
      }) as http.IncomingMessage,
      res,
      "/api/cloud/login/status",
      "GET",
      state,
    );

    expect(handled).toBe(true);
    expect(res.statusCode).toBe(200);
    expect(getJson()).toEqual({ status: "authenticated", keyPrefix: undefined });
    expect(updateAgentMock).toHaveBeenCalledTimes(1);
    expect(initMock).toHaveBeenCalledTimes(1);
  });

  it("returns raw status when login session is not authenticated", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        status: "pending",
      }),
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
    expect(res.statusCode).toBe(200);
    expect(getJson()).toEqual({ status: "pending" });
  });

  it("persists runtime DB secrets when they are initially missing", async () => {
    const initMock = vi.fn();
    const updateAgentMock = vi.fn(async () => undefined);
    const state = cloudState();
    state.runtime = {
      agentId: "00000000-0000-0000-0000-000000000001",
      character: {},
      updateAgent: updateAgentMock,
    } as CloudRouteState["runtime"];
    state.cloudManager = {
      getClient: () => null,
      init: initMock,
    } as unknown as CloudRouteState["cloudManager"];
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        status: "authenticated",
        apiKey: "ak-runtime",
      }),
    } as Response);

    const { res, getJson } = createMockHttpResponse<Record<string, unknown>>();
    const handled = await handleCloudRoute(
      createMockIncomingMessage({
        url: "/api/cloud/login/status?sessionId=test-session",
      }) as http.IncomingMessage,
      res,
      "/api/cloud/login/status",
      "GET",
      state,
    );

    expect(handled).toBe(true);
    expect(res.statusCode).toBe(200);
    expect(getJson()).toEqual({
      status: "authenticated",
      keyPrefix: undefined,
    });
    expect(updateAgentMock).toHaveBeenCalledWith(
      "00000000-0000-0000-0000-000000000001",
      {
        secrets: {
          ELIZAOS_CLOUD_API_KEY: "ak-runtime",
          ELIZAOS_CLOUD_ENABLED: "true",
        },
      },
    );
    expect(initMock).toHaveBeenCalledTimes(1);
  });

  it("saves auth data and ignores config save failures during login poll", async () => {
    saveMiladyConfigMock.mockImplementation(() => {
      throw new Error("persist blocked");
    });
    const initMock = vi.fn();
    const state = cloudState();
    const { res, getJson } = createMockHttpResponse<Record<string, unknown>>();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        status: "authenticated",
        apiKey: "ak-test",
      }),
    } as Response);
    state.cloudManager = {
      getClient: () => null,
      init: initMock,
    } as unknown as CloudRouteState["cloudManager"];

    const handled = await handleCloudRoute(
      createMockIncomingMessage({
        url: "/api/cloud/login/status?sessionId=test-session",
      }) as http.IncomingMessage,
      res,
      "/api/cloud/login/status",
      "GET",
      state,
    );

    expect(handled).toBe(true);
    expect(res.statusCode).toBe(200);
    expect(getJson()).toEqual({
      status: "authenticated",
      keyPrefix: undefined,
    });
    expect(initMock).toHaveBeenCalledTimes(1);
    expect(process.env.ELIZAOS_CLOUD_API_KEY).toBe("ak-test");
  });

  it("persists authenticated login to runtime secrets and handles runtime failures", async () => {
    const initMock = vi.fn();
    const updateAgentMock = vi.fn(async () => {
      throw new Error("db unavailable");
    });
    const state = cloudState();
    state.runtime = {
      agentId: "00000000-0000-0000-0000-000000000001",
      character: { secrets: {} },
      updateAgent: updateAgentMock,
    } as CloudRouteState["runtime"];
    state.cloudManager = {
      getClient: () => null,
      init: initMock,
    } as unknown as CloudRouteState["cloudManager"];
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        status: "authenticated",
        apiKey: "ak-runtime",
        keyPrefix: "run-key",
      }),
    } as Response);

    const { res, getJson } = createMockHttpResponse<Record<string, unknown>>();
    const handled = await handleCloudRoute(
      createMockIncomingMessage({
        url: "/api/cloud/login/status?sessionId=test-session",
      }) as http.IncomingMessage,
      res,
      "/api/cloud/login/status",
      "GET",
      state,
    );

    expect(handled).toBe(true);
    expect(res.statusCode).toBe(200);
    expect(getJson()).toEqual({
      status: "authenticated",
      keyPrefix: "run-key",
    });
    expect(updateAgentMock).toHaveBeenCalledWith(
      "00000000-0000-0000-0000-000000000001",
      {
        secrets: {
          ELIZAOS_CLOUD_API_KEY: "ak-runtime",
          ELIZAOS_CLOUD_ENABLED: "true",
        },
      },
    );
    expect(initMock).toHaveBeenCalledTimes(1);
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

  it("returns 502 when status polling fails with non-Error payload", async () => {
    const { res, getJson } = createMockHttpResponse<Record<string, unknown>>();
    fetchMock.mockRejectedValue("connection reset");

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
