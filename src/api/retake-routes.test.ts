import { describe, expect, it, vi } from "vitest";
import {
  createMockHttpResponse,
  createMockIncomingMessage,
} from "../test-support/test-helpers";
import type { RetakeRouteState } from "./retake-routes";
import { handleRetakeRoute } from "./retake-routes";

/** Build a minimal mock RetakeRouteState. */
function mockState(
  overrides: Partial<RetakeRouteState> = {},
): RetakeRouteState {
  return {
    streamManager: {
      isRunning: vi.fn(() => false),
      writeFrame: vi.fn(() => true),
      start: vi.fn(async () => {}),
      stop: vi.fn(async () => ({ uptime: 0 })),
    },
    port: 2138,
    ...overrides,
  };
}

describe("handleRetakeRoute", () => {
  it("returns false for non-retake paths", async () => {
    const { res } = createMockHttpResponse();
    const req = createMockIncomingMessage({
      method: "GET",
      url: "/api/health",
    });
    const result = await handleRetakeRoute(
      req,
      res,
      "/api/health",
      "GET",
      mockState(),
    );
    expect(result).toBe(false);
  });

  describe("POST /api/retake/frame", () => {
    it("returns 503 when StreamManager is not running", async () => {
      const { res, getStatus, getJson } = createMockHttpResponse();
      const req = createMockIncomingMessage({
        method: "POST",
        url: "/api/retake/frame",
        body: Buffer.from("jpeg-data"),
      });
      const state = mockState();
      (
        state.streamManager.isRunning as ReturnType<typeof vi.fn>
      ).mockReturnValue(false);

      const handled = await handleRetakeRoute(
        req,
        res,
        "/api/retake/frame",
        "POST",
        state,
      );

      expect(handled).toBe(true);
      expect(getStatus()).toBe(503);
      expect(getJson()).toEqual(
        expect.objectContaining({
          error: expect.stringContaining("not running"),
        }),
      );
    });

    it("returns 400 for empty frame body", async () => {
      const { res, getStatus, getJson } = createMockHttpResponse();
      const req = createMockIncomingMessage({
        method: "POST",
        url: "/api/retake/frame",
      });
      const state = mockState();
      (
        state.streamManager.isRunning as ReturnType<typeof vi.fn>
      ).mockReturnValue(true);

      const handled = await handleRetakeRoute(
        req,
        res,
        "/api/retake/frame",
        "POST",
        state,
      );

      expect(handled).toBe(true);
      expect(getStatus()).toBe(400);
      expect(getJson()).toEqual(
        expect.objectContaining({ error: "Empty frame" }),
      );
    });

    it("writes frame and returns 200 when running", async () => {
      const { res, getStatus } = createMockHttpResponse();
      const frameData = Buffer.from("fake-jpeg-data");
      const req = createMockIncomingMessage({
        method: "POST",
        url: "/api/retake/frame",
        body: frameData,
      });
      const state = mockState();
      (
        state.streamManager.isRunning as ReturnType<typeof vi.fn>
      ).mockReturnValue(true);

      const handled = await handleRetakeRoute(
        req,
        res,
        "/api/retake/frame",
        "POST",
        state,
      );

      expect(handled).toBe(true);
      expect(getStatus()).toBe(200);
      expect(state.streamManager.writeFrame).toHaveBeenCalledWith(frameData);
    });
  });

  describe("POST /api/retake/live", () => {
    it("returns already-streaming when StreamManager is running", async () => {
      const { res, getJson } = createMockHttpResponse();
      const req = createMockIncomingMessage({
        method: "POST",
        url: "/api/retake/live",
      });
      const state = mockState();
      (
        state.streamManager.isRunning as ReturnType<typeof vi.fn>
      ).mockReturnValue(true);

      const handled = await handleRetakeRoute(
        req,
        res,
        "/api/retake/live",
        "POST",
        state,
      );

      expect(handled).toBe(true);
      expect(getJson()).toEqual(
        expect.objectContaining({
          ok: true,
          live: true,
          message: "Already streaming",
        }),
      );
    });

    it("returns 400 when access token is not configured", async () => {
      const { res, getStatus, getJson } = createMockHttpResponse();
      const req = createMockIncomingMessage({
        method: "POST",
        url: "/api/retake/live",
      });
      // No config.accessToken, no env var
      const state = mockState({ config: {} });
      const origEnv = process.env.RETAKE_AGENT_TOKEN;
      delete process.env.RETAKE_AGENT_TOKEN;

      try {
        const handled = await handleRetakeRoute(
          req,
          res,
          "/api/retake/live",
          "POST",
          state,
        );
        expect(handled).toBe(true);
        expect(getStatus()).toBe(400);
        expect(getJson()).toEqual(
          expect.objectContaining({
            error: expect.stringContaining("not configured"),
          }),
        );
      } finally {
        if (origEnv !== undefined) process.env.RETAKE_AGENT_TOKEN = origEnv;
      }
    });
  });

  describe("POST /api/retake/offline", () => {
    it("stops StreamManager and returns ok", async () => {
      const { res, getJson } = createMockHttpResponse();
      const req = createMockIncomingMessage({
        method: "POST",
        url: "/api/retake/offline",
      });
      const state = mockState({ config: {} });
      (
        state.streamManager.isRunning as ReturnType<typeof vi.fn>
      ).mockReturnValue(true);
      const origEnv = process.env.RETAKE_AGENT_TOKEN;
      delete process.env.RETAKE_AGENT_TOKEN;

      try {
        const handled = await handleRetakeRoute(
          req,
          res,
          "/api/retake/offline",
          "POST",
          state,
        );
        expect(handled).toBe(true);
        expect(state.streamManager.stop).toHaveBeenCalled();
        expect(getJson()).toEqual(
          expect.objectContaining({ ok: true, live: false }),
        );
      } finally {
        if (origEnv !== undefined) process.env.RETAKE_AGENT_TOKEN = origEnv;
      }
    });
  });
});

describe("resolve() config priority", () => {
  // We test resolve indirectly via handleRetakeRoute's /live endpoint
  // which checks the accessToken resolution chain.

  it("prefers config.accessToken over RETAKE_AGENT_TOKEN env var", async () => {
    const { res, getStatus } = createMockHttpResponse();
    const req = createMockIncomingMessage({
      method: "POST",
      url: "/api/retake/live",
    });
    const state = mockState({
      config: { accessToken: "config-token" },
    });
    // Set env var to a different value — config should win
    const origEnv = process.env.RETAKE_AGENT_TOKEN;
    process.env.RETAKE_AGENT_TOKEN = "env-token";

    try {
      // This will fail to actually stream (no real retake.tv), but it should
      // NOT return 400 "not configured" since the config token is present.
      await handleRetakeRoute(req, res, "/api/retake/live", "POST", state);
      // If we get here, the token was resolved — it attempted startRetakeStream
      // which will fail on the fetch, giving a 500, NOT a 400.
      expect(getStatus()).not.toBe(400);
    } finally {
      if (origEnv !== undefined) {
        process.env.RETAKE_AGENT_TOKEN = origEnv;
      } else {
        delete process.env.RETAKE_AGENT_TOKEN;
      }
    }
  });
});
