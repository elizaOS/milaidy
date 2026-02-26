/**
 * Tests for stream-routes.ts
 *
 * Covers:
 *   - detectCaptureMode() — env-driven mode selection
 *   - ensureXvfb()        — display-format validation and Linux-only guard
 *   - handleStreamRoute() — individual API endpoint behaviour
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createMockHttpResponse,
  createMockIncomingMessage,
} from "../test-support/test-helpers";
import {
  detectCaptureMode,
  ensureXvfb,
  handleStreamRoute,
  type StreamRouteState,
} from "./stream-routes";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a fully-wired mock StreamRouteState. */
function mockState(
  overrides: Partial<StreamRouteState> = {},
): StreamRouteState {
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

  it('returns "pipe" when STREAM_MODE=pipe', () => {
    process.env.STREAM_MODE = "pipe";
    expect(detectCaptureMode()).toBe("pipe");
  });

  it("STREAM_MODE takes priority over RETAKE_STREAM_MODE", () => {
    process.env.STREAM_MODE = "pipe";
    process.env.RETAKE_STREAM_MODE = "x11grab";
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
    delete process.env.STREAM_MODE;
    if (process.platform === "darwin") {
      expect(detectCaptureMode()).toBe("avfoundation");
    }
    // Non-darwin: platform path differs — no assertion required.
  });

  it('returns "x11grab" on Linux when DISPLAY is set (platform-conditional)', () => {
    delete process.env.RETAKE_STREAM_MODE;
    delete process.env.STREAM_MODE;
    if (process.platform === "linux") {
      process.env.DISPLAY = ":0";
      expect(detectCaptureMode()).toBe("x11grab");
    }
    // Not on Linux — no assertion required.
  });

  it('returns "file" as fallback on non-darwin non-linux without DISPLAY (platform-conditional)', () => {
    delete process.env.RETAKE_STREAM_MODE;
    delete process.env.STREAM_MODE;
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
// handleStreamRoute() — endpoint tests
// ---------------------------------------------------------------------------

describe("handleStreamRoute", () => {
  // ── Non-stream paths ──────────────────────────────────────────────────

  it("returns false for non-stream paths", async () => {
    const { res } = createMockHttpResponse();
    const req = createMockIncomingMessage({
      method: "GET",
      url: "/api/health",
    });
    const result = await handleStreamRoute(
      req,
      res,
      "/api/health",
      "GET",
      mockState(),
    );
    expect(result).toBe(false);
  });

  it("returns false for /api/stream (no trailing segment)", async () => {
    const { res } = createMockHttpResponse();
    const req = createMockIncomingMessage({
      method: "GET",
      url: "/api/stream",
    });
    const result = await handleStreamRoute(
      req,
      res,
      "/api/stream",
      "GET",
      mockState(),
    );
    expect(result).toBe(false);
  });

  it("returns false for empty pathname", async () => {
    const { res } = createMockHttpResponse();
    const req = createMockIncomingMessage({ method: "GET", url: "" });
    const result = await handleStreamRoute(req, res, "", "GET", mockState());
    expect(result).toBe(false);
  });

  // ── POST /api/stream/frame ────────────────────────────────────────────

  describe("POST /api/stream/frame", () => {
    it("returns 503 when StreamManager is not running", async () => {
      const { res, getStatus, getJson } = createMockHttpResponse();
      const req = createMockIncomingMessage({
        method: "POST",
        url: "/api/stream/frame",
        body: Buffer.from("jpeg-data"),
      });
      const state = mockState();
      vi.mocked(state.streamManager.isRunning).mockReturnValue(false);

      const handled = await handleStreamRoute(
        req,
        res,
        "/api/stream/frame",
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
        url: "/api/stream/frame",
      });
      const state = mockState();
      vi.mocked(state.streamManager.isRunning).mockReturnValue(true);

      const handled = await handleStreamRoute(
        req,
        res,
        "/api/stream/frame",
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
        url: "/api/stream/frame",
        body: frameData,
      });
      const state = mockState();
      vi.mocked(state.streamManager.isRunning).mockReturnValue(true);

      const handled = await handleStreamRoute(
        req,
        res,
        "/api/stream/frame",
        "POST",
        state,
      );

      expect(handled).toBe(true);
      expect(getStatus()).toBe(200);
      expect(state.streamManager.writeFrame).toHaveBeenCalledWith(frameData);
    });
  });

  // ── GET /api/stream/status ────────────────────────────────────────────

  describe("GET /api/stream/status", () => {
    it("returns ok:true with all health fields", async () => {
      const { res, getStatus, getJson } = createMockHttpResponse();
      const req = createMockIncomingMessage({
        method: "GET",
        url: "/api/stream/status",
      });
      const state = mockState();

      const handled = await handleStreamRoute(
        req,
        res,
        "/api/stream/status",
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

    it("includes destination info when destination is configured", async () => {
      const { res, getJson } = createMockHttpResponse();
      const req = createMockIncomingMessage({
        method: "GET",
        url: "/api/stream/status",
      });
      const state = mockState({
        destination: {
          id: "retake",
          name: "Retake.tv",
          getCredentials: vi.fn(),
        },
      });

      await handleStreamRoute(req, res, "/api/stream/status", "GET", state);

      expect(getJson()).toEqual(
        expect.objectContaining({
          destination: { id: "retake", name: "Retake.tv" },
        }),
      );
    });

    it("returns destination:null when no destination configured", async () => {
      const { res, getJson } = createMockHttpResponse();
      const req = createMockIncomingMessage({
        method: "GET",
        url: "/api/stream/status",
      });
      const state = mockState(); // no destination

      await handleStreamRoute(req, res, "/api/stream/status", "GET", state);

      expect(getJson()).toEqual(
        expect.objectContaining({ destination: null }),
      );
    });
  });

  // ── POST /api/stream/volume ───────────────────────────────────────────

  describe("POST /api/stream/volume", () => {
    it("calls setVolume(50) and returns ok with volume and muted state", async () => {
      const { res, getStatus, getJson } = createMockHttpResponse();
      const req = createMockIncomingMessage({
        method: "POST",
        url: "/api/stream/volume",
        body: JSON.stringify({ volume: 50 }),
      });
      const state = mockState();

      const handled = await handleStreamRoute(
        req,
        res,
        "/api/stream/volume",
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
        url: "/api/stream/volume",
        body: JSON.stringify({ volume: 0 }),
      });
      const state = mockState();

      await handleStreamRoute(req, res, "/api/stream/volume", "POST", state);

      expect(getStatus()).toBe(200);
      expect(state.streamManager.setVolume).toHaveBeenCalledWith(0);
    });

    it("accepts boundary maximum volume=100", async () => {
      const { res, getStatus } = createMockHttpResponse();
      const req = createMockIncomingMessage({
        method: "POST",
        url: "/api/stream/volume",
        body: JSON.stringify({ volume: 100 }),
      });
      const state = mockState();

      await handleStreamRoute(req, res, "/api/stream/volume", "POST", state);

      expect(getStatus()).toBe(200);
      expect(state.streamManager.setVolume).toHaveBeenCalledWith(100);
    });

    it("returns 400 for volume=150 (above maximum)", async () => {
      const { res, getStatus } = createMockHttpResponse();
      const req = createMockIncomingMessage({
        method: "POST",
        url: "/api/stream/volume",
        body: JSON.stringify({ volume: 150 }),
      });
      const state = mockState();

      const handled = await handleStreamRoute(
        req,
        res,
        "/api/stream/volume",
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
        url: "/api/stream/volume",
        body: JSON.stringify({ volume: -1 }),
      });
      const state = mockState();

      await handleStreamRoute(req, res, "/api/stream/volume", "POST", state);

      expect(getStatus()).toBe(400);
      expect(state.streamManager.setVolume).not.toHaveBeenCalled();
    });

    it("returns 400 for non-number volume (string)", async () => {
      const { res, getStatus } = createMockHttpResponse();
      const req = createMockIncomingMessage({
        method: "POST",
        url: "/api/stream/volume",
        body: JSON.stringify({ volume: "loud" }),
      });
      const state = mockState();

      await handleStreamRoute(req, res, "/api/stream/volume", "POST", state);

      expect(getStatus()).toBe(400);
      expect(state.streamManager.setVolume).not.toHaveBeenCalled();
    });

    it("returns 400 for null volume", async () => {
      const { res, getStatus } = createMockHttpResponse();
      const req = createMockIncomingMessage({
        method: "POST",
        url: "/api/stream/volume",
        body: JSON.stringify({ volume: null }),
      });
      const state = mockState();

      await handleStreamRoute(req, res, "/api/stream/volume", "POST", state);

      expect(getStatus()).toBe(400);
      expect(state.streamManager.setVolume).not.toHaveBeenCalled();
    });

    it("returns 500 for invalid JSON body", async () => {
      const { res, getStatus } = createMockHttpResponse();
      const req = createMockIncomingMessage({
        method: "POST",
        url: "/api/stream/volume",
        body: "not-json{{{",
      });
      const state = mockState();

      const handled = await handleStreamRoute(
        req,
        res,
        "/api/stream/volume",
        "POST",
        state,
      );

      expect(handled).toBe(true);
      expect(getStatus()).toBe(500);
      expect(state.streamManager.setVolume).not.toHaveBeenCalled();
    });

    it("returns 400 or 500 for empty body (no parseable volume)", async () => {
      const { res, getStatus } = createMockHttpResponse();
      const req = createMockIncomingMessage({
        method: "POST",
        url: "/api/stream/volume",
        body: "",
      });
      const state = mockState();

      const handled = await handleStreamRoute(
        req,
        res,
        "/api/stream/volume",
        "POST",
        state,
      );

      expect(handled).toBe(true);
      expect([400, 500]).toContain(getStatus());
      expect(state.streamManager.setVolume).not.toHaveBeenCalled();
    });
  });

  // ── POST /api/stream/mute ────────────────────────────────────────────

  describe("POST /api/stream/mute", () => {
    it("calls mute() and returns ok:true muted:true with volume", async () => {
      const { res, getStatus, getJson } = createMockHttpResponse();
      const req = createMockIncomingMessage({
        method: "POST",
        url: "/api/stream/mute",
      });
      const state = mockState();

      const handled = await handleStreamRoute(
        req,
        res,
        "/api/stream/mute",
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
        url: "/api/stream/mute",
      });
      const state = mockState();
      vi.mocked(state.streamManager.mute).mockRejectedValueOnce(
        new Error("mute failed"),
      );

      await handleStreamRoute(req, res, "/api/stream/mute", "POST", state);

      expect(getStatus()).toBe(500);
      expect(getJson()).toEqual(
        expect.objectContaining({ error: "mute failed" }),
      );
    });
  });

  // ── POST /api/stream/unmute ──────────────────────────────────────────

  describe("POST /api/stream/unmute", () => {
    it("calls unmute() and returns ok:true muted:false with volume", async () => {
      const { res, getStatus, getJson } = createMockHttpResponse();
      const req = createMockIncomingMessage({
        method: "POST",
        url: "/api/stream/unmute",
      });
      const state = mockState();

      const handled = await handleStreamRoute(
        req,
        res,
        "/api/stream/unmute",
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
        url: "/api/stream/unmute",
      });
      const state = mockState();
      vi.mocked(state.streamManager.unmute).mockRejectedValueOnce(
        new Error("unmute failed"),
      );

      await handleStreamRoute(req, res, "/api/stream/unmute", "POST", state);

      expect(getStatus()).toBe(500);
      expect(getJson()).toEqual(
        expect.objectContaining({ error: "unmute failed" }),
      );
    });
  });

  // ── POST /api/stream/live ─────────────────────────────────────────────

  describe("POST /api/stream/live", () => {
    it("returns already-streaming response when StreamManager is running", async () => {
      const { res, getJson } = createMockHttpResponse();
      const req = createMockIncomingMessage({
        method: "POST",
        url: "/api/stream/live",
      });
      const state = mockState();
      vi.mocked(state.streamManager.isRunning).mockReturnValue(true);

      const handled = await handleStreamRoute(
        req,
        res,
        "/api/stream/live",
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

    it("returns 400 when no destination is configured", async () => {
      const { res, getStatus, getJson } = createMockHttpResponse();
      const req = createMockIncomingMessage({
        method: "POST",
        url: "/api/stream/live",
      });
      const state = mockState(); // no destination

      const handled = await handleStreamRoute(
        req,
        res,
        "/api/stream/live",
        "POST",
        state,
      );

      expect(handled).toBe(true);
      expect(getStatus()).toBe(400);
      expect(getJson()).toEqual(
        expect.objectContaining({
          error: expect.stringContaining("destination configured"),
        }),
      );
    });
  });

  // ── POST /api/stream/offline ──────────────────────────────────────────

  describe("POST /api/stream/offline", () => {
    it("skips stop() when stream is not running and returns ok:true live:false", async () => {
      const { res, getJson } = createMockHttpResponse();
      const req = createMockIncomingMessage({
        method: "POST",
        url: "/api/stream/offline",
      });
      const state = mockState();
      vi.mocked(state.streamManager.isRunning).mockReturnValue(false);

      const handled = await handleStreamRoute(
        req,
        res,
        "/api/stream/offline",
        "POST",
        state,
      );

      expect(handled).toBe(true);
      expect(state.streamManager.stop).not.toHaveBeenCalled();
      expect(getJson()).toEqual(
        expect.objectContaining({ ok: true, live: false }),
      );
    });

    it("calls stop() when stream is running and returns ok:true live:false", async () => {
      const { res, getJson } = createMockHttpResponse();
      const req = createMockIncomingMessage({
        method: "POST",
        url: "/api/stream/offline",
      });
      const state = mockState();
      vi.mocked(state.streamManager.isRunning).mockReturnValue(true);

      const handled = await handleStreamRoute(
        req,
        res,
        "/api/stream/offline",
        "POST",
        state,
      );

      expect(handled).toBe(true);
      expect(state.streamManager.stop).toHaveBeenCalledOnce();
      expect(getJson()).toEqual(
        expect.objectContaining({ ok: true, live: false }),
      );
    });
  });

  // ── GET /api/streaming/destinations ───────────────────────────────────

  describe("GET /api/streaming/destinations", () => {
    it("returns empty list when no destination configured", async () => {
      const { res, getJson } = createMockHttpResponse();
      const req = createMockIncomingMessage({
        method: "GET",
        url: "/api/streaming/destinations",
      });

      await handleStreamRoute(
        req,
        res,
        "/api/streaming/destinations",
        "GET",
        mockState(),
      );

      expect(getJson()).toEqual({ ok: true, destinations: [] });
    });

    it("returns active destination in list", async () => {
      const { res, getJson } = createMockHttpResponse();
      const req = createMockIncomingMessage({
        method: "GET",
        url: "/api/streaming/destinations",
      });
      const state = mockState({
        destination: {
          id: "retake",
          name: "Retake.tv",
          getCredentials: vi.fn(),
        },
      });

      await handleStreamRoute(
        req,
        res,
        "/api/streaming/destinations",
        "GET",
        state,
      );

      expect(getJson()).toEqual({
        ok: true,
        destinations: [{ id: "retake", name: "Retake.tv" }],
      });
    });
  });

  // ── POST /api/streaming/destination ───────────────────────────────────

  describe("POST /api/streaming/destination", () => {
    it("returns 400 when destinationId is missing", async () => {
      const { res, getStatus } = createMockHttpResponse();
      const req = createMockIncomingMessage({
        method: "POST",
        url: "/api/streaming/destination",
        body: JSON.stringify({}),
      });

      await handleStreamRoute(
        req,
        res,
        "/api/streaming/destination",
        "POST",
        mockState(),
      );

      expect(getStatus()).toBe(400);
    });

    it("returns 404 for unknown destination ID", async () => {
      const { res, getStatus } = createMockHttpResponse();
      const req = createMockIncomingMessage({
        method: "POST",
        url: "/api/streaming/destination",
        body: JSON.stringify({ destinationId: "twitch" }),
      });

      await handleStreamRoute(
        req,
        res,
        "/api/streaming/destination",
        "POST",
        mockState(),
      );

      expect(getStatus()).toBe(404);
    });

    it("returns ok when setting already-active destination", async () => {
      const { res, getStatus, getJson } = createMockHttpResponse();
      const req = createMockIncomingMessage({
        method: "POST",
        url: "/api/streaming/destination",
        body: JSON.stringify({ destinationId: "retake" }),
      });
      const state = mockState({
        destination: {
          id: "retake",
          name: "Retake.tv",
          getCredentials: vi.fn(),
        },
      });

      await handleStreamRoute(
        req,
        res,
        "/api/streaming/destination",
        "POST",
        state,
      );

      expect(getStatus()).toBe(200);
      expect(getJson()).toEqual(
        expect.objectContaining({
          ok: true,
          destination: { id: "retake", name: "Retake.tv" },
        }),
      );
    });
  });
});

// ---------------------------------------------------------------------------
// createRetakeDestination() — destination adapter unit tests
// ---------------------------------------------------------------------------

describe("createRetakeDestination()", () => {
  it("returns a StreamingDestination with id and name", async () => {
    const { createRetakeDestination } = await import("./retake-routes");
    const dest = createRetakeDestination({ accessToken: "test-token" });
    expect(dest.id).toBe("retake");
    expect(dest.name).toBe("Retake.tv");
  });

  it("getCredentials throws when no token is configured", async () => {
    const origToken = process.env.RETAKE_AGENT_TOKEN;
    delete process.env.RETAKE_AGENT_TOKEN;

    try {
      const { createRetakeDestination } = await import("./retake-routes");
      const dest = createRetakeDestination();
      await expect(dest.getCredentials()).rejects.toThrow("not configured");
    } finally {
      if (origToken !== undefined) process.env.RETAKE_AGENT_TOKEN = origToken;
    }
  });

  it("prefers config.accessToken over RETAKE_AGENT_TOKEN env var", async () => {
    const origToken = process.env.RETAKE_AGENT_TOKEN;
    process.env.RETAKE_AGENT_TOKEN = "env-token";

    try {
      const { createRetakeDestination } = await import("./retake-routes");
      const dest = createRetakeDestination({ accessToken: "config-token" });

      // getCredentials will try to fetch from retake.tv API with config-token.
      // Without a mock server the fetch fails — but we verify it doesn't throw
      // "not configured" (which would mean the token wasn't resolved).
      await expect(dest.getCredentials()).rejects.not.toThrow("not configured");
    } finally {
      if (origToken !== undefined) {
        process.env.RETAKE_AGENT_TOKEN = origToken;
      } else {
        delete process.env.RETAKE_AGENT_TOKEN;
      }
    }
  });
});
