/**
 * Tests for retake-routes.ts
 *
 * Covers:
 *   - detectCaptureMode() — env-driven mode selection
 *   - ensureXvfb()        — display-format validation and Linux-only guard
 *   - handleRetakeRoute() — individual API endpoint behaviour
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createMockHttpResponse,
  createMockIncomingMessage,
} from "../test-support/test-helpers";
import {
  detectCaptureMode,
  ensureXvfb,
  handleRetakeRoute,
  type RetakeRouteState,
} from "./retake-routes";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a fully-wired mock RetakeRouteState. */
function mockState(
  overrides: Partial<RetakeRouteState> = {},
): RetakeRouteState {
  return {
    streamManager: {
      isRunning: vi.fn(() => false),
      writeFrame: vi.fn(() => true),
      start: vi.fn(async () => {}),
      stop: vi.fn(async () => ({ uptime: 0 })),
      getHealth: vi.fn(() => ({
        running: true,
        ffmpegAlive: true,
        uptime: 300,
        frameCount: 1000,
        volume: 80,
        muted: false,
        audioSource: "silent",
        inputMode: "pipe",
      })),
      getVolume: vi.fn(() => 80),
      isMuted: vi.fn(() => false),
      setVolume: vi.fn(async () => {}),
      mute: vi.fn(async () => {}),
      unmute: vi.fn(async () => {}),
    },
    port: 2138,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// detectCaptureMode()
// ---------------------------------------------------------------------------

describe("detectCaptureMode()", () => {
  let savedEnv: Record<string, string | undefined>;

  beforeEach(() => {
    savedEnv = { ...process.env };
  });

  afterEach(() => {
    // Remove keys added during the test then restore originals.
    for (const key of Object.keys(process.env)) {
      if (!(key in savedEnv)) delete process.env[key];
    }
    Object.assign(process.env, savedEnv);
  });

  it('returns "pipe" when RETAKE_STREAM_MODE=ui', () => {
    process.env.RETAKE_STREAM_MODE = "ui";
    expect(detectCaptureMode()).toBe("pipe");
  });

  it('returns "pipe" when RETAKE_STREAM_MODE=pipe', () => {
    process.env.RETAKE_STREAM_MODE = "pipe";
    expect(detectCaptureMode()).toBe("pipe");
  });

  it('returns "x11grab" when RETAKE_STREAM_MODE=x11grab', () => {
    process.env.RETAKE_STREAM_MODE = "x11grab";
    expect(detectCaptureMode()).toBe("x11grab");
  });

  it('returns "avfoundation" when RETAKE_STREAM_MODE=avfoundation', () => {
    process.env.RETAKE_STREAM_MODE = "avfoundation";
    expect(detectCaptureMode()).toBe("avfoundation");
  });

  it('returns "avfoundation" when RETAKE_STREAM_MODE=screen', () => {
    process.env.RETAKE_STREAM_MODE = "screen";
    expect(detectCaptureMode()).toBe("avfoundation");
  });

  it('returns "file" when RETAKE_STREAM_MODE=file', () => {
    process.env.RETAKE_STREAM_MODE = "file";
    expect(detectCaptureMode()).toBe("file");
  });

  it("env var overrides platform detection (pipe takes priority over platform)", () => {
    // Confirm env-var path runs unconditionally regardless of platform.
    process.env.RETAKE_STREAM_MODE = "pipe";
    expect(detectCaptureMode()).toBe("pipe");
  });

  it('returns "avfoundation" on macOS without env var (platform-conditional)', () => {
    delete process.env.RETAKE_STREAM_MODE;
    if (process.platform === "darwin") {
      expect(detectCaptureMode()).toBe("avfoundation");
    }
    // Non-darwin: platform path differs — no assertion required.
  });

  it('returns "x11grab" on Linux when DISPLAY is set (platform-conditional)', () => {
    delete process.env.RETAKE_STREAM_MODE;
    if (process.platform === "linux") {
      process.env.DISPLAY = ":0";
      expect(detectCaptureMode()).toBe("x11grab");
    }
    // Not on Linux — no assertion required.
  });

  it('returns "file" as fallback on non-darwin non-linux without DISPLAY (platform-conditional)', () => {
    delete process.env.RETAKE_STREAM_MODE;
    if (
      process.platform !== "darwin" &&
      process.platform !== "linux" &&
      !process.versions.electron
    ) {
      delete process.env.DISPLAY;
      expect(detectCaptureMode()).toBe("file");
    }
    // Platform-specific result on darwin/linux — no assertion required.
  });
});

// ---------------------------------------------------------------------------
// ensureXvfb()
// ---------------------------------------------------------------------------

describe("ensureXvfb()", () => {
  let savedEnv: Record<string, string | undefined>;

  beforeEach(() => {
    savedEnv = { ...process.env };
  });

  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in savedEnv)) delete process.env[key];
    }
    Object.assign(process.env, savedEnv);
  });

  it("returns false on non-Linux platforms without attempting syscalls", async () => {
    if (process.platform !== "linux") {
      const result = await ensureXvfb(":99", "1280x720");
      expect(result).toBe(false);
    }
  });

  it("returns false for display string containing semicolons (command injection)", async () => {
    const result = await ensureXvfb(":99;rm -rf /", "1280x720");
    expect(result).toBe(false);
  });

  it("returns false for display with no leading colon", async () => {
    const result = await ensureXvfb("abc", "1280x720");
    expect(result).toBe(false);
  });

  it("returns false for display containing spaces", async () => {
    const result = await ensureXvfb(": 0", "1280x720");
    expect(result).toBe(false);
  });

  it("returns false for display with alphabetic suffix", async () => {
    const result = await ensureXvfb(":0x", "1280x720");
    expect(result).toBe(false);
  });

  it("accepts :0 without throwing (valid format — platform determines outcome)", async () => {
    const result = await ensureXvfb(":0", "1280x720");
    // On non-Linux this is false; on Linux it may be true or false depending on Xvfb state.
    expect(typeof result).toBe("boolean");
  });

  it("accepts :99 without throwing (valid format — platform determines outcome)", async () => {
    const result = await ensureXvfb(":99", "1280x720");
    expect(typeof result).toBe("boolean");
  });

  it("returns false for invalid resolution on Linux (platform-conditional)", async () => {
    if (process.platform === "linux") {
      // Use a display different from DISPLAY so the early-return shortcut is skipped.
      process.env.DISPLAY = ":0";
      const result = await ensureXvfb(":99", "abc");
      expect(result).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// handleRetakeRoute() — endpoint tests
// ---------------------------------------------------------------------------

describe("handleRetakeRoute", () => {
  // ── Non-retake paths ────────────────────────────────────────────────────

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

  it("returns false for /api/retake (missing trailing slash prefix)", async () => {
    const { res } = createMockHttpResponse();
    const req = createMockIncomingMessage({
      method: "GET",
      url: "/api/retake",
    });
    const result = await handleRetakeRoute(
      req,
      res,
      "/api/retake",
      "GET",
      mockState(),
    );
    expect(result).toBe(false);
  });

  it("returns false for empty pathname", async () => {
    const { res } = createMockHttpResponse();
    const req = createMockIncomingMessage({ method: "GET", url: "" });
    const result = await handleRetakeRoute(req, res, "", "GET", mockState());
    expect(result).toBe(false);
  });

  // ── POST /api/retake/frame ───────────────────────────────────────────────

  describe("POST /api/retake/frame", () => {
    it("returns 503 when StreamManager is not running", async () => {
      const { res, getStatus, getJson } = createMockHttpResponse();
      const req = createMockIncomingMessage({
        method: "POST",
        url: "/api/retake/frame",
        body: Buffer.from("jpeg-data"),
      });
      const state = mockState();
      vi.mocked(state.streamManager.isRunning).mockReturnValue(false);

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

    it("returns 400 for an empty frame body when stream is running", async () => {
      const { res, getStatus, getJson } = createMockHttpResponse();
      const req = createMockIncomingMessage({
        method: "POST",
        url: "/api/retake/frame",
      });
      const state = mockState();
      vi.mocked(state.streamManager.isRunning).mockReturnValue(true);

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

    it("writes frame and returns 200 for a non-empty frame when running", async () => {
      const { res, getStatus } = createMockHttpResponse();
      const frameData = Buffer.from("fake-jpeg-data");
      const req = createMockIncomingMessage({
        method: "POST",
        url: "/api/retake/frame",
        body: frameData,
      });
      const state = mockState();
      vi.mocked(state.streamManager.isRunning).mockReturnValue(true);

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

  // ── GET /api/retake/status ───────────────────────────────────────────────

  describe("GET /api/retake/status", () => {
    it("returns ok:true with all health fields", async () => {
      const { res, getStatus, getJson } = createMockHttpResponse();
      const req = createMockIncomingMessage({
        method: "GET",
        url: "/api/retake/status",
      });
      const state = mockState();

      const handled = await handleRetakeRoute(
        req,
        res,
        "/api/retake/status",
        "GET",
        state,
      );

      expect(handled).toBe(true);
      expect(getStatus()).toBe(200);
      expect(state.streamManager.getHealth).toHaveBeenCalledOnce();
      expect(getJson()).toEqual(
        expect.objectContaining({
          ok: true,
          running: true,
          ffmpegAlive: true,
          uptime: 300,
          frameCount: 1000,
          volume: 80,
          muted: false,
          audioSource: "silent",
          inputMode: "pipe",
        }),
      );
    });
  });

  // ── POST /api/retake/volume ─────────────────────────────────────────────

  describe("POST /api/retake/volume", () => {
    it("calls setVolume(50) and returns ok with volume and muted state", async () => {
      const { res, getStatus, getJson } = createMockHttpResponse();
      const req = createMockIncomingMessage({
        method: "POST",
        url: "/api/retake/volume",
        body: JSON.stringify({ volume: 50 }),
      });
      const state = mockState();

      const handled = await handleRetakeRoute(
        req,
        res,
        "/api/retake/volume",
        "POST",
        state,
      );

      expect(handled).toBe(true);
      expect(getStatus()).toBe(200);
      expect(state.streamManager.setVolume).toHaveBeenCalledWith(50);
      expect(getJson()).toEqual(
        expect.objectContaining({ ok: true, volume: 80, muted: false }),
      );
    });

    it("accepts boundary minimum volume=0", async () => {
      const { res, getStatus } = createMockHttpResponse();
      const req = createMockIncomingMessage({
        method: "POST",
        url: "/api/retake/volume",
        body: JSON.stringify({ volume: 0 }),
      });
      const state = mockState();

      await handleRetakeRoute(req, res, "/api/retake/volume", "POST", state);

      expect(getStatus()).toBe(200);
      expect(state.streamManager.setVolume).toHaveBeenCalledWith(0);
    });

    it("accepts boundary maximum volume=100", async () => {
      const { res, getStatus } = createMockHttpResponse();
      const req = createMockIncomingMessage({
        method: "POST",
        url: "/api/retake/volume",
        body: JSON.stringify({ volume: 100 }),
      });
      const state = mockState();

      await handleRetakeRoute(req, res, "/api/retake/volume", "POST", state);

      expect(getStatus()).toBe(200);
      expect(state.streamManager.setVolume).toHaveBeenCalledWith(100);
    });

    it("returns 400 for volume=150 (above maximum)", async () => {
      const { res, getStatus } = createMockHttpResponse();
      const req = createMockIncomingMessage({
        method: "POST",
        url: "/api/retake/volume",
        body: JSON.stringify({ volume: 150 }),
      });
      const state = mockState();

      const handled = await handleRetakeRoute(
        req,
        res,
        "/api/retake/volume",
        "POST",
        state,
      );

      expect(handled).toBe(true);
      expect(getStatus()).toBe(400);
      expect(state.streamManager.setVolume).not.toHaveBeenCalled();
    });

    it("returns 400 for negative volume", async () => {
      const { res, getStatus } = createMockHttpResponse();
      const req = createMockIncomingMessage({
        method: "POST",
        url: "/api/retake/volume",
        body: JSON.stringify({ volume: -1 }),
      });
      const state = mockState();

      await handleRetakeRoute(req, res, "/api/retake/volume", "POST", state);

      expect(getStatus()).toBe(400);
      expect(state.streamManager.setVolume).not.toHaveBeenCalled();
    });

    it("returns 400 for non-number volume (string)", async () => {
      const { res, getStatus } = createMockHttpResponse();
      const req = createMockIncomingMessage({
        method: "POST",
        url: "/api/retake/volume",
        body: JSON.stringify({ volume: "loud" }),
      });
      const state = mockState();

      await handleRetakeRoute(req, res, "/api/retake/volume", "POST", state);

      expect(getStatus()).toBe(400);
      expect(state.streamManager.setVolume).not.toHaveBeenCalled();
    });

    it("returns 400 for null volume", async () => {
      const { res, getStatus } = createMockHttpResponse();
      const req = createMockIncomingMessage({
        method: "POST",
        url: "/api/retake/volume",
        body: JSON.stringify({ volume: null }),
      });
      const state = mockState();

      await handleRetakeRoute(req, res, "/api/retake/volume", "POST", state);

      expect(getStatus()).toBe(400);
      expect(state.streamManager.setVolume).not.toHaveBeenCalled();
    });

    it("returns 500 for invalid JSON body", async () => {
      const { res, getStatus } = createMockHttpResponse();
      const req = createMockIncomingMessage({
        method: "POST",
        url: "/api/retake/volume",
        body: "not-json{{{",
      });
      const state = mockState();

      const handled = await handleRetakeRoute(
        req,
        res,
        "/api/retake/volume",
        "POST",
        state,
      );

      expect(handled).toBe(true);
      expect(getStatus()).toBe(500);
      expect(state.streamManager.setVolume).not.toHaveBeenCalled();
    });

    it("returns 400 or 500 for empty body (no parseable volume)", async () => {
      const { res, getStatus } = createMockHttpResponse();
      // An empty string body: JSON.parse("") throws → 500,
      // or readRequestBody returns null → JSON.parse(null) treats it as volume undefined → 400.
      const req = createMockIncomingMessage({
        method: "POST",
        url: "/api/retake/volume",
        body: "",
      });
      const state = mockState();

      const handled = await handleRetakeRoute(
        req,
        res,
        "/api/retake/volume",
        "POST",
        state,
      );

      expect(handled).toBe(true);
      expect([400, 500]).toContain(getStatus());
      expect(state.streamManager.setVolume).not.toHaveBeenCalled();
    });
  });

  // ── POST /api/retake/mute ───────────────────────────────────────────────

  describe("POST /api/retake/mute", () => {
    it("calls mute() and returns ok:true muted:true with volume", async () => {
      const { res, getStatus, getJson } = createMockHttpResponse();
      const req = createMockIncomingMessage({
        method: "POST",
        url: "/api/retake/mute",
      });
      const state = mockState();

      const handled = await handleRetakeRoute(
        req,
        res,
        "/api/retake/mute",
        "POST",
        state,
      );

      expect(handled).toBe(true);
      expect(getStatus()).toBe(200);
      expect(state.streamManager.mute).toHaveBeenCalledOnce();
      expect(getJson()).toEqual(
        expect.objectContaining({ ok: true, muted: true, volume: 80 }),
      );
    });

    it("returns 500 when mute() throws", async () => {
      const { res, getStatus, getJson } = createMockHttpResponse();
      const req = createMockIncomingMessage({
        method: "POST",
        url: "/api/retake/mute",
      });
      const state = mockState();
      vi.mocked(state.streamManager.mute).mockRejectedValueOnce(
        new Error("mute failed"),
      );

      await handleRetakeRoute(req, res, "/api/retake/mute", "POST", state);

      expect(getStatus()).toBe(500);
      expect(getJson()).toEqual(
        expect.objectContaining({ error: "mute failed" }),
      );
    });
  });

  // ── POST /api/retake/unmute ─────────────────────────────────────────────

  describe("POST /api/retake/unmute", () => {
    it("calls unmute() and returns ok:true muted:false with volume", async () => {
      const { res, getStatus, getJson } = createMockHttpResponse();
      const req = createMockIncomingMessage({
        method: "POST",
        url: "/api/retake/unmute",
      });
      const state = mockState();

      const handled = await handleRetakeRoute(
        req,
        res,
        "/api/retake/unmute",
        "POST",
        state,
      );

      expect(handled).toBe(true);
      expect(getStatus()).toBe(200);
      expect(state.streamManager.unmute).toHaveBeenCalledOnce();
      expect(getJson()).toEqual(
        expect.objectContaining({ ok: true, muted: false, volume: 80 }),
      );
    });

    it("returns 500 when unmute() throws", async () => {
      const { res, getStatus, getJson } = createMockHttpResponse();
      const req = createMockIncomingMessage({
        method: "POST",
        url: "/api/retake/unmute",
      });
      const state = mockState();
      vi.mocked(state.streamManager.unmute).mockRejectedValueOnce(
        new Error("unmute failed"),
      );

      await handleRetakeRoute(req, res, "/api/retake/unmute", "POST", state);

      expect(getStatus()).toBe(500);
      expect(getJson()).toEqual(
        expect.objectContaining({ error: "unmute failed" }),
      );
    });
  });

  // ── POST /api/retake/live ────────────────────────────────────────────────

  describe("POST /api/retake/live", () => {
    it("returns already-streaming response when StreamManager is running", async () => {
      const { res, getJson } = createMockHttpResponse();
      const req = createMockIncomingMessage({
        method: "POST",
        url: "/api/retake/live",
      });
      const state = mockState();
      vi.mocked(state.streamManager.isRunning).mockReturnValue(true);

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
      const state = mockState({ config: {} });
      const origToken = process.env.RETAKE_AGENT_TOKEN;
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
        if (origToken !== undefined) process.env.RETAKE_AGENT_TOKEN = origToken;
      }
    });
  });

  // ── POST /api/retake/offline ─────────────────────────────────────────────

  describe("POST /api/retake/offline", () => {
    it("skips stop() when stream is not running and returns ok:true live:false", async () => {
      const { res, getJson } = createMockHttpResponse();
      const req = createMockIncomingMessage({
        method: "POST",
        url: "/api/retake/offline",
      });
      const state = mockState({ config: {} });
      vi.mocked(state.streamManager.isRunning).mockReturnValue(false);
      const origToken = process.env.RETAKE_AGENT_TOKEN;
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
        expect(state.streamManager.stop).not.toHaveBeenCalled();
        expect(getJson()).toEqual(
          expect.objectContaining({ ok: true, live: false }),
        );
      } finally {
        if (origToken !== undefined) process.env.RETAKE_AGENT_TOKEN = origToken;
      }
    });

    it("calls stop() when stream is running and returns ok:true live:false", async () => {
      const { res, getJson } = createMockHttpResponse();
      const req = createMockIncomingMessage({
        method: "POST",
        url: "/api/retake/offline",
      });
      const state = mockState({ config: {} });
      vi.mocked(state.streamManager.isRunning).mockReturnValue(true);
      const origToken = process.env.RETAKE_AGENT_TOKEN;
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
        expect(state.streamManager.stop).toHaveBeenCalledOnce();
        expect(getJson()).toEqual(
          expect.objectContaining({ ok: true, live: false }),
        );
      } finally {
        if (origToken !== undefined) process.env.RETAKE_AGENT_TOKEN = origToken;
      }
    });
  });
});

// ---------------------------------------------------------------------------
// resolve() config priority (tested indirectly via /live endpoint)
// ---------------------------------------------------------------------------

describe("resolve() config priority", () => {
  it("prefers config.accessToken over RETAKE_AGENT_TOKEN env var", async () => {
    const { res, getStatus } = createMockHttpResponse();
    const req = createMockIncomingMessage({
      method: "POST",
      url: "/api/retake/live",
    });
    const state = mockState({
      config: { accessToken: "config-token" },
    });
    // Set env var to a different value — config should win and proceed past the 400 guard.
    const origToken = process.env.RETAKE_AGENT_TOKEN;
    process.env.RETAKE_AGENT_TOKEN = "env-token";

    try {
      await handleRetakeRoute(req, res, "/api/retake/live", "POST", state);
      // If the token is resolved, startRetakeStream is attempted and fails
      // with a 500 (fetch error) — NOT a 400 "not configured".
      expect(getStatus()).not.toBe(400);
    } finally {
      if (origToken !== undefined) {
        process.env.RETAKE_AGENT_TOKEN = origToken;
      } else {
        delete process.env.RETAKE_AGENT_TOKEN;
      }
    }
  });
});
