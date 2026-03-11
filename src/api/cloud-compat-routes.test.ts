import { EventEmitter } from "node:events";
import type http from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MiladyConfig } from "../config/config";
import type { CloudCompatRouteState } from "./cloud-compat-routes";
import {
  handleCloudCompatRoute,
  resolveCloudBaseUrl,
} from "./cloud-compat-routes";

// Mock dependencies
vi.mock("@elizaos/core", () => ({
  logger: { warn: vi.fn(), info: vi.fn() },
}));

vi.mock("../cloud/validate-url", () => ({
  validateCloudBaseUrl: vi.fn(() => Promise.resolve(null)),
}));

vi.mock("./http-helpers", () => ({
  sendJson: vi.fn(),
  sendJsonError: vi.fn(),
}));

const { sendJson, sendJsonError } = await import("./http-helpers");
const { validateCloudBaseUrl } = await import("../cloud/validate-url");

function makeState(
  overrides?: Partial<MiladyConfig["cloud"]>,
): CloudCompatRouteState {
  return {
    config: {
      cloud: {
        apiKey: "test-api-key",
        baseUrl: "https://cloud.example.com",
        ...overrides,
      },
    } as MiladyConfig,
  };
}

function makeReq(opts: {
  method?: string;
  url?: string;
  body?: string;
}): http.IncomingMessage {
  const emitter = new EventEmitter() as unknown as http.IncomingMessage;
  emitter.url = opts.url ?? "/api/cloud/compat/agents";
  // Schedule body emission after construction
  if (opts.body) {
    const bodyStr = opts.body;
    process.nextTick(() => {
      emitter.emit("data", Buffer.from(bodyStr));
      emitter.emit("end");
    });
  } else {
    process.nextTick(() => emitter.emit("end"));
  }
  return emitter;
}

function makeRes(): http.ServerResponse {
  return {} as http.ServerResponse;
}

describe("cloud-compat-routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(validateCloudBaseUrl).mockResolvedValue(null);
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("resolveCloudBaseUrl", () => {
    it("uses default URL when no baseUrl configured", () => {
      const config = { cloud: {} } as MiladyConfig;
      expect(resolveCloudBaseUrl(config)).toBe("https://www.elizacloud.ai");
    });

    it("strips trailing slashes", () => {
      const config = {
        cloud: { baseUrl: "https://cloud.example.com///" },
      } as MiladyConfig;
      expect(resolveCloudBaseUrl(config)).toBe("https://cloud.example.com");
    });
  });

  describe("handleCloudCompatRoute", () => {
    it("returns false for non-compat paths", async () => {
      const result = await handleCloudCompatRoute(
        makeReq({}),
        makeRes(),
        "/api/cloud/status",
        "GET",
        makeState(),
      );
      expect(result).toBe(false);
      expect(sendJson).not.toHaveBeenCalled();
    });

    it("returns 401 when no API key is configured", async () => {
      const result = await handleCloudCompatRoute(
        makeReq({}),
        makeRes(),
        "/api/cloud/compat/agents",
        "GET",
        makeState({ apiKey: undefined }),
      );
      expect(result).toBe(true);
      expect(sendJsonError).toHaveBeenCalledWith(
        expect.anything(),
        "Not connected to Milady Cloud. Please log in first.",
        401,
      );
    });

    it("returns 502 when base URL validation fails", async () => {
      vi.mocked(validateCloudBaseUrl).mockResolvedValue("invalid hostname");
      const result = await handleCloudCompatRoute(
        makeReq({}),
        makeRes(),
        "/api/cloud/compat/agents",
        "GET",
        makeState(),
      );
      expect(result).toBe(true);
      expect(sendJsonError).toHaveBeenCalledWith(
        expect.anything(),
        "invalid hostname",
        502,
      );
    });

    it("proxies GET requests to upstream with Bearer auth", async () => {
      const mockResponse = new Response(
        JSON.stringify({ success: true, data: [] }),
        {
          status: 200,
        },
      );
      vi.mocked(fetch).mockResolvedValue(mockResponse);

      const result = await handleCloudCompatRoute(
        makeReq({ url: "/api/cloud/compat/agents" }),
        makeRes(),
        "/api/cloud/compat/agents",
        "GET",
        makeState(),
      );

      expect(result).toBe(true);
      expect(fetch).toHaveBeenCalledWith(
        "https://cloud.example.com/api/compat/agents",
        expect.objectContaining({
          method: "GET",
          headers: expect.objectContaining({
            Authorization: "Bearer test-api-key",
          }),
        }),
      );
      expect(sendJson).toHaveBeenCalledWith(
        expect.anything(),
        { success: true, data: [] },
        200,
      );
    });

    it("forwards POST body to upstream", async () => {
      const mockResponse = new Response(
        JSON.stringify({ success: true, data: { agentId: "a1" } }),
        { status: 201 },
      );
      vi.mocked(fetch).mockResolvedValue(mockResponse);

      const body = JSON.stringify({ agentName: "test-agent" });
      const result = await handleCloudCompatRoute(
        makeReq({ url: "/api/cloud/compat/agents", body }),
        makeRes(),
        "/api/cloud/compat/agents",
        "POST",
        makeState(),
      );

      expect(result).toBe(true);
      expect(fetch).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          method: "POST",
          body,
        }),
      );
    });

    it("returns 502 on redirect responses", async () => {
      const mockResponse = new Response(null, {
        status: 301,
        headers: { Location: "https://evil.com" },
      });
      vi.mocked(fetch).mockResolvedValue(mockResponse);

      const result = await handleCloudCompatRoute(
        makeReq({}),
        makeRes(),
        "/api/cloud/compat/agents",
        "GET",
        makeState(),
      );

      expect(result).toBe(true);
      expect(sendJsonError).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringContaining("redirected"),
        502,
      );
    });

    it("returns 504 on timeout", async () => {
      const timeoutErr = new Error("timeout");
      timeoutErr.name = "TimeoutError";
      vi.mocked(fetch).mockRejectedValue(timeoutErr);

      const result = await handleCloudCompatRoute(
        makeReq({}),
        makeRes(),
        "/api/cloud/compat/agents",
        "GET",
        makeState(),
      );

      expect(result).toBe(true);
      expect(sendJsonError).toHaveBeenCalledWith(
        expect.anything(),
        "Milady Cloud request timed out",
        504,
      );
    });

    it("returns 502 on network errors", async () => {
      vi.mocked(fetch).mockRejectedValue(new Error("ECONNREFUSED"));

      const result = await handleCloudCompatRoute(
        makeReq({}),
        makeRes(),
        "/api/cloud/compat/agents",
        "GET",
        makeState(),
      );

      expect(result).toBe(true);
      expect(sendJsonError).toHaveBeenCalledWith(
        expect.anything(),
        "Failed to reach Milady Cloud",
        502,
      );
    });

    it("retries once on 503 response", async () => {
      const firstResponse = new Response(
        JSON.stringify({ success: false, error: "Service Unavailable" }),
        { status: 503 },
      );
      const secondResponse = new Response(
        JSON.stringify({ success: true, data: [] }),
        { status: 200 },
      );
      vi.mocked(fetch)
        .mockResolvedValueOnce(firstResponse)
        .mockResolvedValueOnce(secondResponse);

      const result = await handleCloudCompatRoute(
        makeReq({}),
        makeRes(),
        "/api/cloud/compat/agents",
        "GET",
        makeState(),
      );

      expect(result).toBe(true);
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(sendJson).toHaveBeenCalledWith(
        expect.anything(),
        { success: true, data: [] },
        200,
      );
    });

    it("falls through to original 503 when retry also fails", async () => {
      const response503 = new Response(
        JSON.stringify({ success: false, error: "Service Unavailable" }),
        { status: 503 },
      );
      vi.mocked(fetch).mockResolvedValue(response503);

      const result = await handleCloudCompatRoute(
        makeReq({}),
        makeRes(),
        "/api/cloud/compat/agents",
        "GET",
        makeState(),
      );

      expect(result).toBe(true);
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(sendJson).toHaveBeenCalledWith(
        expect.anything(),
        { success: false, error: "Service Unavailable" },
        503,
      );
    });

    it("sends X-Service-Key when service key is configured", async () => {
      const mockResponse = new Response(
        JSON.stringify({ success: true, data: [] }),
        { status: 200 },
      );
      vi.mocked(fetch).mockResolvedValue(mockResponse);

      const state = {
        config: {
          cloud: {
            apiKey: "user-key",
            baseUrl: "https://cloud.example.com",
            serviceKey: "svc-key-123",
          },
        } as unknown as MiladyConfig,
      };

      await handleCloudCompatRoute(
        makeReq({}),
        makeRes(),
        "/api/cloud/compat/agents",
        "GET",
        state,
      );

      expect(fetch).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          headers: expect.objectContaining({
            "X-Service-Key": "svc-key-123",
            Authorization: "Bearer user-key",
          }),
        }),
      );
    });

    it("handles non-JSON upstream responses gracefully", async () => {
      const mockResponse = new Response("Internal Server Error", {
        status: 500,
        headers: { "Content-Type": "text/plain" },
      });
      vi.mocked(fetch).mockResolvedValue(mockResponse);

      const result = await handleCloudCompatRoute(
        makeReq({}),
        makeRes(),
        "/api/cloud/compat/agents",
        "GET",
        makeState(),
      );

      expect(result).toBe(true);
      expect(sendJson).toHaveBeenCalledWith(
        expect.anything(),
        { success: false, error: "HTTP 500" },
        500,
      );
    });

    it("strips /api/cloud prefix to form correct upstream path", async () => {
      const mockResponse = new Response(
        JSON.stringify({ success: true, data: {} }),
        { status: 200 },
      );
      vi.mocked(fetch).mockResolvedValue(mockResponse);

      await handleCloudCompatRoute(
        makeReq({ url: "/api/cloud/compat/agents/abc-123/status" }),
        makeRes(),
        "/api/cloud/compat/agents/abc-123/status",
        "GET",
        makeState(),
      );

      const fetchCall = vi.mocked(fetch).mock.calls[0];
      expect(fetchCall[0]).toBe(
        "https://cloud.example.com/api/compat/agents/abc-123/status",
      );
    });
  });
});
