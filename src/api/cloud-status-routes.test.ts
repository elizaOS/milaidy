import type { AgentRuntime } from "@elizaos/core";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { MiladyConfig } from "../config/config";
import { handleCloudStatusRoutes } from "./cloud-status-routes";

type InvokeResult = {
  handled: boolean;
  status: number;
  payload: unknown;
};

function runtimeWithCloudAuth(cloudAuth: unknown): AgentRuntime {
  return {
    getService: vi.fn((name: string) =>
      name === "CLOUD_AUTH" ? cloudAuth : null,
    ),
  } as unknown as AgentRuntime;
}

async function invoke(args: {
  method: string;
  pathname: string;
  config?: MiladyConfig;
  runtime?: AgentRuntime | null;
}): Promise<InvokeResult> {
  let status = 200;
  let payload: unknown = null;

  const handled = await handleCloudStatusRoutes({
    req: {} as never,
    res: {} as never,
    method: args.method,
    pathname: args.pathname,
    config: args.config ?? ({} as MiladyConfig),
    runtime: args.runtime ?? null,
    json: (_res, data, code = 200) => {
      status = code;
      payload = data;
    },
  });

  return { handled, status, payload };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("cloud status routes", () => {
  test("returns false for unrelated routes", async () => {
    const result = await invoke({ method: "GET", pathname: "/api/status" });

    expect(result.handled).toBe(false);
  });

  test("reports cloud status when runtime is not started", async () => {
    const result = await invoke({
      method: "GET",
      pathname: "/api/cloud/status",
      runtime: null,
      config: {} as MiladyConfig,
    });

    expect(result.handled).toBe(true);
    expect(result.payload).toEqual({
      connected: false,
      enabled: false,
      hasApiKey: false,
      reason: "runtime_not_started",
    });
  });

  test("reports cloud status when only api key is present", async () => {
    const result = await invoke({
      method: "GET",
      pathname: "/api/cloud/status",
      runtime: null,
      config: { cloud: { apiKey: "abc123" } } as MiladyConfig,
    });

    expect(result.handled).toBe(true);
    expect(result.payload).toEqual({
      connected: true,
      enabled: true,
      hasApiKey: true,
      userId: undefined,
      organizationId: undefined,
      topUpUrl: "https://www.elizacloud.ai/dashboard/settings?tab=billing",
      reason: "api_key_present_runtime_not_started",
    });
  });

  test("reports authenticated cloud status", async () => {
    const runtime = runtimeWithCloudAuth({
      isAuthenticated: () => true,
      getUserId: () => "user-1",
      getOrganizationId: () => "org-1",
    });

    const result = await invoke({
      method: "GET",
      pathname: "/api/cloud/status",
      runtime,
      config: { cloud: { enabled: true } } as MiladyConfig,
    });

    expect(result.handled).toBe(true);
    expect(result.payload).toEqual({
      connected: true,
      enabled: true,
      hasApiKey: false,
      userId: "user-1",
      organizationId: "org-1",
      topUpUrl: "https://www.elizacloud.ai/dashboard/settings?tab=billing",
      reason: undefined,
    });
  });

  test("returns disconnected credits when auth and api key are missing", async () => {
    const result = await invoke({
      method: "GET",
      pathname: "/api/cloud/credits",
      runtime: null,
      config: {} as MiladyConfig,
    });

    expect(result.handled).toBe(true);
    expect(result.payload).toEqual({ balance: null, connected: false });
  });

  test("fetches credits via configured api key", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ balance: 1.5 }),
      })) as unknown as typeof fetch,
    );

    const result = await invoke({
      method: "GET",
      pathname: "/api/cloud/credits",
      runtime: null,
      config: {
        cloud: { apiKey: "abc123", baseUrl: "https://cloud.example" },
      } as MiladyConfig,
    });

    expect(result.handled).toBe(true);
    expect(result.payload).toEqual({
      connected: true,
      balance: 1.5,
      low: true,
      critical: false,
      topUpUrl: "https://www.elizacloud.ai/dashboard/settings?tab=billing",
    });
  });

  test("returns unexpected response when api key credit shape is invalid", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ nope: true }),
      })) as unknown as typeof fetch,
    );

    const result = await invoke({
      method: "GET",
      pathname: "/api/cloud/credits",
      runtime: null,
      config: { cloud: { apiKey: "abc123" } } as MiladyConfig,
    });

    expect(result.handled).toBe(true);
    expect(result.payload).toEqual({
      balance: null,
      connected: true,
      error: "unexpected response",
    });
  });

  test("reads credits from authenticated cloud client", async () => {
    const runtime = runtimeWithCloudAuth({
      isAuthenticated: () => true,
      getClient: () => ({
        get: vi.fn(async () => ({ balance: 0.4 })),
      }),
    });

    const result = await invoke({
      method: "GET",
      pathname: "/api/cloud/credits",
      runtime,
      config: {} as MiladyConfig,
    });

    expect(result.handled).toBe(true);
    expect(result.payload).toEqual({
      connected: true,
      balance: 0.4,
      low: true,
      critical: true,
      topUpUrl: "https://www.elizacloud.ai/dashboard/settings?tab=billing",
    });
  });

  test("supports wrapped cloud credit response shape", async () => {
    const runtime = runtimeWithCloudAuth({
      isAuthenticated: () => true,
      getClient: () => ({
        get: vi.fn(async () => ({ success: true, data: { balance: 3.2 } })),
      }),
    });

    const result = await invoke({
      method: "GET",
      pathname: "/api/cloud/credits",
      runtime,
      config: {} as MiladyConfig,
    });

    expect(result.handled).toBe(true);
    expect(result.payload).toEqual({
      connected: true,
      balance: 3.2,
      low: false,
      critical: false,
      topUpUrl: "https://www.elizacloud.ai/dashboard/settings?tab=billing",
    });
  });

  test("returns unexpected response for invalid authenticated client payload", async () => {
    const runtime = runtimeWithCloudAuth({
      isAuthenticated: () => true,
      getClient: () => ({
        get: vi.fn(async () => ({ invalid: true })),
      }),
    });

    const result = await invoke({
      method: "GET",
      pathname: "/api/cloud/credits",
      runtime,
      config: {} as MiladyConfig,
    });

    expect(result.handled).toBe(true);
    expect(result.payload).toEqual({
      balance: null,
      connected: true,
      error: "unexpected response",
    });
  });
});
