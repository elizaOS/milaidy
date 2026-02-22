import type http from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createMockHttpResponse,
  createMockIncomingMessage,
} from "../test-support/test-helpers";
import type { CloudRouteState } from "./cloud-routes";
import { handleCloudRoute } from "./cloud-routes";

const {
  createSpanMock,
  spanSuccessMock,
  spanFailureMock,
  validateCloudBaseUrlMock,
  saveMiladyConfigMock,
} = vi.hoisted(() => ({
  createSpanMock: vi.fn(),
  spanSuccessMock: vi.fn(),
  spanFailureMock: vi.fn(),
  validateCloudBaseUrlMock: vi.fn<(rawUrl: string) => Promise<string | null>>(),
  saveMiladyConfigMock: vi.fn<(config: unknown) => void>(),
}));

vi.mock("../diagnostics/integration-observability", () => ({
  createIntegrationTelemetrySpan: createSpanMock,
}));

vi.mock("../cloud/validate-url", () => ({
  validateCloudBaseUrl: validateCloudBaseUrlMock,
}));

vi.mock("../config/config", () => ({
  saveMiladyConfig: saveMiladyConfigMock,
}));

function cloudState(): CloudRouteState {
  return {
    config: {},
    runtime: null,
    cloudManager: null,
  } as CloudRouteState;
}

describe("cloud routes observability", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    validateCloudBaseUrlMock.mockResolvedValue(null);
    createSpanMock.mockReturnValue({
      success: spanSuccessMock,
      failure: spanFailureMock,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("records success for cloud login create-session flow", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({}),
      } as Response),
    );

    const req = createMockIncomingMessage({
      method: "POST",
      url: "/api/cloud/login",
    }) as http.IncomingMessage;
    const { res, getStatus } = createMockHttpResponse();

    const handled = await handleCloudRoute(
      req,
      res,
      "/api/cloud/login",
      "POST",
      cloudState(),
    );

    expect(handled).toBe(true);
    expect(getStatus()).toBe(200);
    expect(createSpanMock).toHaveBeenCalledWith({
      boundary: "cloud",
      operation: "login_create_session",
      timeoutMs: 10_000,
    });
    expect(spanSuccessMock).toHaveBeenCalledWith({ statusCode: 200 });
    expect(spanFailureMock).not.toHaveBeenCalled();
  });

  it("records failure when cloud login create-session times out", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("request timeout")),
    );

    const req = createMockIncomingMessage({
      method: "POST",
      url: "/api/cloud/login",
    }) as http.IncomingMessage;
    const { res, getStatus, getJson } = createMockHttpResponse();

    const handled = await handleCloudRoute(
      req,
      res,
      "/api/cloud/login",
      "POST",
      cloudState(),
    );

    expect(handled).toBe(true);
    expect(getStatus()).toBe(504);
    expect(getJson()).toEqual({ error: "Eliza Cloud login request timed out" });
    expect(spanFailureMock).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 504 }),
    );
  });
});
