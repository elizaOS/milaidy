import { beforeEach, describe, expect, test, vi } from "vitest";
import type { MiladyConfig } from "../config/config";
import { createRouteInvoker } from "../test-support/route-test-helpers";
import {
  handleSubscriptionRoutes,
  type SubscriptionRouteState,
} from "./subscription-routes";

const getSubscriptionStatus = vi.fn(() => [{ id: "openai-codex" }]);
const startAnthropicLogin = vi.fn(async () => ({
  authUrl: "https://auth.example/anthropic",
  submitCode: vi.fn(),
  credentials: Promise.resolve({ expires: null }),
}));
const startCodexLogin = vi.fn(async () => ({
  authUrl: "https://auth.example/openai",
  state: "state-123",
  submitCode: vi.fn(),
  close: vi.fn(),
  credentials: Promise.resolve({ expires: null }),
}));
const saveCredentials = vi.fn();
const applySubscriptionCredentials = vi.fn(async () => undefined);
const deleteCredentials = vi.fn();

vi.mock("../auth/index", () => ({
  getSubscriptionStatus,
  startAnthropicLogin,
  startCodexLogin,
  saveCredentials,
  applySubscriptionCredentials,
  deleteCredentials,
}));

describe("subscription routes", () => {
  let state: SubscriptionRouteState;
  let saveConfig: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    state = {
      config: {} as MiladyConfig,
    };
    saveConfig = vi.fn();
    delete process.env.ANTHROPIC_API_KEY;
  });

  const invoke = createRouteInvoker<
    Record<string, unknown> | null,
    SubscriptionRouteState,
    Record<string, unknown>
  >(
    async (ctx) =>
      handleSubscriptionRoutes({
        req: ctx.req,
        res: ctx.res,
        method: ctx.method,
        pathname: ctx.pathname,
        state: ctx.runtime,
        readJsonBody: async () => ctx.readJsonBody(),
        json: (res, data, status) => ctx.json(res, data, status),
        error: (res, message, status) => ctx.error(res, message, status),
        saveConfig,
      }),
    { runtimeProvider: () => state },
  );

  test("returns false for non-subscription routes", async () => {
    const result = await invoke({
      method: "GET",
      pathname: "/api/status",
    });

    expect(result.handled).toBe(false);
  });

  test("returns subscription status", async () => {
    const result = await invoke({
      method: "GET",
      pathname: "/api/subscription/status",
    });

    expect(result.handled).toBe(true);
    expect(result.status).toBe(200);
    expect(result.payload).toMatchObject({
      providers: [{ id: "openai-codex" }],
    });
    expect(getSubscriptionStatus).toHaveBeenCalledTimes(1);
  });

  test("starts anthropic flow and stores it on state", async () => {
    const result = await invoke({
      method: "POST",
      pathname: "/api/subscription/anthropic/start",
    });

    expect(result.status).toBe(200);
    expect(result.payload).toMatchObject({
      authUrl: "https://auth.example/anthropic",
    });
    expect(state._anthropicFlow).toBeTruthy();
    expect(startAnthropicLogin).toHaveBeenCalledTimes(1);
  });

  test("validates anthropic exchange payload", async () => {
    const result = await invoke({
      method: "POST",
      pathname: "/api/subscription/anthropic/exchange",
      body: {},
    });

    expect(result.status).toBe(400);
    expect(result.payload).toMatchObject({ error: "Missing code" });
  });

  test("validates anthropic setup token format", async () => {
    const result = await invoke({
      method: "POST",
      pathname: "/api/subscription/anthropic/setup-token",
      body: { token: "not-valid" },
    });

    expect(result.status).toBe(400);
    expect(result.payload).toMatchObject({
      error: expect.stringContaining("Invalid token format"),
    });
  });

  test("persists anthropic setup token", async () => {
    const token = "sk-ant-oat01-test-token";
    const result = await invoke({
      method: "POST",
      pathname: "/api/subscription/anthropic/setup-token",
      body: { token },
    });

    expect(result.status).toBe(200);
    expect(process.env.ANTHROPIC_API_KEY).toBe(token);
    expect(state.config.env).toMatchObject({ ANTHROPIC_API_KEY: token });
    expect(saveConfig).toHaveBeenCalledWith(state.config);
  });

  test("deletes known provider credentials", async () => {
    const result = await invoke({
      method: "DELETE",
      pathname: "/api/subscription/openai-codex",
    });

    expect(result.status).toBe(200);
    expect(deleteCredentials).toHaveBeenCalledWith("openai-codex");
  });

  test("rejects unknown provider deletion", async () => {
    const result = await invoke({
      method: "DELETE",
      pathname: "/api/subscription/not-real",
    });

    expect(result.status).toBe(400);
    expect(result.payload).toMatchObject({
      error: expect.stringContaining("Unknown provider"),
    });
  });
});
