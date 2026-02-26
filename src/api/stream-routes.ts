/**
 * Generic streaming infrastructure routes.
 *
 * Extracted from retake-routes.ts so any streaming destination (Retake.tv,
 * custom RTMP, etc.) can reuse the same pipeline: capture mode detection,
 * Xvfb management, browser capture, FFmpeg, frame routing, volume/mute.
 *
 * Platform-specific credential fetching lives in destination adapters
 * (e.g. retake-routes.ts exports `createRetakeDestination`).
 */

import fs from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { logger } from "@elizaos/core";
import type { StreamConfig } from "../services/stream-manager";
import {
  readRequestBody,
  readRequestBodyBuffer,
  sendJson,
  sendJsonError,
} from "./http-helpers";

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

/**
 * A streaming destination provides RTMP credentials and optional lifecycle
 * hooks. Implement this interface to add support for a new streaming platform.
 */
export interface StreamingDestination {
  id: string;
  name: string;
  getCredentials(): Promise<{ rtmpUrl: string; rtmpKey: string }>;
  onStreamStart?(): Promise<void>;
  onStreamStop?(): Promise<void>;
}

/**
 * Subset of server state relevant to stream routes.
 */
export interface StreamRouteState {
  streamManager: {
    isRunning(): boolean;
    writeFrame(buf: Buffer): boolean;
    start(config: StreamConfig): Promise<void>;
    stop(): Promise<{ uptime: number }>;
    getHealth(): {
      running: boolean;
      ffmpegAlive: boolean;
      uptime: number;
      frameCount: number;
      volume: number;
      muted: boolean;
      audioSource: string;
      inputMode: string | null;
    };
    getVolume(): number;
    isMuted(): boolean;
    setVolume(level: number): Promise<void>;
    mute(): Promise<void>;
    unmute(): Promise<void>;
  };
  /** Server port -- used for building the default capture URL. */
  port?: number;
  /** Explicit capture URL override. */
  captureUrl?: string;
  /** Optional screen capture manager (injected by Electron host). */
  screenCapture?: {
    isFrameCaptureActive(): boolean;
    startFrameCapture(opts: {
      fps?: number;
      quality?: number;
      endpoint?: string;
    }): Promise<void>;
  };
  /** Active streaming destination (Retake, custom RTMP, etc.). */
  destination?: StreamingDestination;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function json(res: ServerResponse, data: unknown, status = 200): void {
  sendJson(res, data, status);
}

function error(res: ServerResponse, message: string, status: number): void {
  sendJsonError(res, message, status);
}

// ---------------------------------------------------------------------------
// Capture mode detection
// ---------------------------------------------------------------------------

/**
 * Detect the best capture mode for the current environment.
 *
 * Priority:
 * 1. STREAM_MODE / RETAKE_STREAM_MODE env var (explicit override)
 * 2. Electron -> "pipe" (capturePage -> POST /api/stream/frame -> FFmpeg stdin)
 * 3. Linux with DISPLAY or Xvfb -> "x11grab" (Hyperscape approach)
 * 4. macOS -> "avfoundation" (native screen capture)
 * 5. Fallback -> "file" (Puppeteer CDP -> temp JPEG -> FFmpeg)
 */
/** @internal Exported for testing. */
export function detectCaptureMode(): StreamConfig["inputMode"] {
  const explicit =
    process.env.STREAM_MODE ?? process.env.RETAKE_STREAM_MODE;
  if (explicit === "ui" || explicit === "pipe") return "pipe";
  if (explicit === "x11grab") return "x11grab";
  if (explicit === "avfoundation" || explicit === "screen")
    return "avfoundation";
  if (explicit === "file") return "file";

  // Electron -> pipe mode
  if (process.versions.electron) return "pipe";

  // Linux with a display -> x11grab (Xvfb or native X11)
  if (process.platform === "linux" && process.env.DISPLAY) return "x11grab";

  // macOS -> avfoundation screen capture
  if (process.platform === "darwin") return "avfoundation";

  // Fallback -> headless browser capture -> file mode
  return "file";
}

// ---------------------------------------------------------------------------
// Xvfb management
// ---------------------------------------------------------------------------

/**
 * Try to start Xvfb on the specified display if not already running (Linux only).
 * Returns true if display is available, false otherwise.
 */
/** @internal Exported for testing. */
export async function ensureXvfb(
  display: string,
  resolution: string,
): Promise<boolean> {
  if (process.platform !== "linux") return false;

  // Validate display format to prevent command injection (must be :<digits>)
  if (!/^:\d+$/.test(display)) {
    logger.warn(
      `[stream] Invalid display format: ${display} (expected :<number>)`,
    );
    return false;
  }

  // Check if the display is already active
  if (process.env.DISPLAY === display) return true;

  try {
    const { execSync } = await import("node:child_process");
    // Check if Xvfb is already running on this display
    try {
      execSync(`xdpyinfo -display ${display}`, {
        stdio: "ignore",
        timeout: 3000,
      });
      logger.info(`[stream] Xvfb already running on display ${display}`);
      return true;
    } catch {
      // Not running -- start it
    }

    const [w, h] = resolution.split("x");
    if (!w || !h || !/^\d+$/.test(w) || !/^\d+$/.test(h)) {
      logger.warn(`[stream] Invalid resolution for Xvfb: ${resolution}`);
      return false;
    }
    const { spawn: spawnProc } = await import("node:child_process");
    const xvfb = spawnProc(
      "Xvfb",
      [display, "-screen", "0", `${w}x${h}x24`, "-ac"],
      {
        stdio: "ignore",
        detached: true,
      },
    );
    xvfb.unref();

    // Wait for Xvfb to be ready
    await new Promise((r) => setTimeout(r, 1000));
    logger.info(`[stream] Started Xvfb on display ${display} (${resolution})`);
    process.env.DISPLAY = display;
    return true;
  } catch (err) {
    logger.warn(`[stream] Failed to start Xvfb: ${err}`);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Streaming pipeline (destination-driven)
// ---------------------------------------------------------------------------

/**
 * Start the full streaming pipeline using the configured destination for
 * RTMP credentials. Handles capture mode detection, Xvfb, browser capture,
 * and FFmpeg configuration.
 */
async function startStreamPipeline(
  state: StreamRouteState,
  rtmpUrl: string,
  rtmpKey: string,
): Promise<{ inputMode: string; audioSource: string }> {
  const mode = detectCaptureMode();
  const audioSource =
    process.env.STREAM_AUDIO_SOURCE ??
    process.env.RETAKE_AUDIO_SOURCE ??
    "silent";
  const audioDevice =
    process.env.STREAM_AUDIO_DEVICE ?? process.env.RETAKE_AUDIO_DEVICE;
  const volume = parseInt(
    process.env.STREAM_VOLUME ?? process.env.RETAKE_VOLUME ?? "80",
    10,
  );
  const resolution = "1280x720";

  const baseConfig: StreamConfig = {
    rtmpUrl,
    rtmpKey,
    resolution,
    bitrate: "1500k",
    audioSource,
    audioDevice,
    volume,
  };

  switch (mode) {
    case "pipe": {
      // Electron UI mode: FFmpeg reads frames from stdin via writeFrame().
      logger.info("[stream] Capture mode: pipe (Electron UI)");
      await state.streamManager.start({
        ...baseConfig,
        inputMode: "pipe",
        framerate: 15,
      });

      // Auto-start Electron frame capture so the UI is streamed without
      // requiring a manual button click in the renderer.
      if (state.screenCapture && !state.screenCapture.isFrameCaptureActive()) {
        try {
          await state.screenCapture.startFrameCapture({
            fps: 15,
            quality: 70,
            endpoint: "/api/stream/frame",
          });
          logger.info("[stream] Auto-started Electron frame capture");
        } catch (err) {
          logger.warn(`[stream] Failed to auto-start frame capture: ${err}`);
        }
      } else if (!state.screenCapture) {
        logger.warn(
          "[stream] ScreenCaptureManager not available -- frame capture must be started manually",
        );
      }
      break;
    }

    case "x11grab": {
      // Linux Xvfb mode (Hyperscape approach): capture virtual display.
      const display =
        process.env.STREAM_DISPLAY ?? process.env.RETAKE_DISPLAY ?? ":99";
      logger.info(`[stream] Capture mode: x11grab (display ${display})`);

      // Ensure Xvfb is running
      await ensureXvfb(display, resolution);

      // Launch a browser on the virtual display so there's something to capture
      const captureUrl =
        state.captureUrl ??
        process.env.STREAM_CAPTURE_URL ??
        process.env.RETAKE_CAPTURE_URL ??
        `http://127.0.0.1:${state.port ?? 2138}`;

      try {
        const { startBrowserCapture } = await import(
          "../services/browser-capture.js"
        );
        // Browser capture in x11grab mode just opens the browser on the display --
        // we don't need the frame file since FFmpeg captures the display directly.
        await startBrowserCapture({
          url: captureUrl,
          width: 1280,
          height: 720,
          quality: 70,
        });
      } catch (err) {
        logger.warn(`[stream] Browser launch on ${display} failed: ${err}`);
      }

      await state.streamManager.start({
        ...baseConfig,
        inputMode: "x11grab",
        display,
        framerate: 30,
      });
      break;
    }

    case "avfoundation": {
      // macOS native screen capture.
      const videoDevice =
        process.env.STREAM_VIDEO_DEVICE ??
        process.env.RETAKE_VIDEO_DEVICE ??
        "3";
      logger.info(
        `[stream] Capture mode: avfoundation (device ${videoDevice})`,
      );
      await state.streamManager.start({
        ...baseConfig,
        inputMode: "avfoundation",
        videoDevice,
        framerate: 30,
      });
      break;
    }

    default: {
      // Headless browser capture -> temp JPEG file -> FFmpeg file mode.
      const captureUrl =
        state.captureUrl ??
        process.env.STREAM_CAPTURE_URL ??
        process.env.RETAKE_CAPTURE_URL ??
        `http://127.0.0.1:${state.port ?? 2138}`;

      logger.info(
        `[stream] Capture mode: file (browser capture -> ${captureUrl})`,
      );

      const { startBrowserCapture, FRAME_FILE } = await import(
        "../services/browser-capture.js"
      );
      try {
        await startBrowserCapture({
          url: captureUrl,
          width: 1280,
          height: 720,
          quality: 70,
        });
        // Wait for first frame file to be written
        await new Promise((resolve) => {
          const check = setInterval(() => {
            try {
              if (
                fs.existsSync(FRAME_FILE) &&
                fs.statSync(FRAME_FILE).size > 0
              ) {
                clearInterval(check);
                resolve(true);
              }
            } catch {
              // Frame file not yet ready -- poll again
            }
          }, 200);
          setTimeout(() => {
            clearInterval(check);
            resolve(false);
          }, 10_000);
        });
      } catch (captureErr) {
        logger.warn(`[stream] Browser capture failed: ${captureErr}`);
      }

      await state.streamManager.start({
        ...baseConfig,
        inputMode: "file",
        frameFile: FRAME_FILE,
        framerate: 30,
      });
      break;
    }
  }

  return { inputMode: mode || "file", audioSource };
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

/** Returns `true` if handled, `false` to fall through. */
export async function handleStreamRoute(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  method: string,
  state: StreamRouteState,
): Promise<boolean> {
  // ── POST /api/stream/frame -- pipe frames to StreamManager ───────────
  if (method === "POST" && pathname === "/api/stream/frame") {
    if (state.streamManager.isRunning()) {
      try {
        const buf = await readRequestBodyBuffer(req, {
          maxBytes: 2 * 1024 * 1024,
        });
        if (!buf || buf.length === 0) {
          error(res, "Empty frame", 400);
          return true;
        }
        state.streamManager.writeFrame(buf);
        res.writeHead(200);
        res.end();
      } catch {
        error(res, "Frame write failed", 500);
      }
      return true;
    }
    error(
      res,
      "StreamManager not running -- start stream via POST /api/stream/live",
      503,
    );
    return true;
  }

  // ── POST /api/stream/live -- start stream via destination ────────────
  if (method === "POST" && pathname === "/api/stream/live") {
    if (state.streamManager.isRunning()) {
      const health = state.streamManager.getHealth();
      json(res, {
        ok: true,
        live: true,
        message: "Already streaming",
        ...health,
      });
      return true;
    }

    if (!state.destination) {
      error(res, "No streaming destination configured", 400);
      return true;
    }

    try {
      const { rtmpUrl, rtmpKey } = await state.destination.getCredentials();
      const { inputMode, audioSource } = await startStreamPipeline(
        state,
        rtmpUrl,
        rtmpKey,
      );
      await state.destination.onStreamStart?.();
      json(res, {
        ok: true,
        live: true,
        rtmpUrl,
        inputMode,
        audioSource,
        destination: state.destination.id,
      });
    } catch (err) {
      error(
        res,
        err instanceof Error ? err.message : "Failed to go live",
        500,
      );
    }
    return true;
  }

  // ── POST /api/stream/offline -- stop stream + notify destination ─────
  if (method === "POST" && pathname === "/api/stream/offline") {
    try {
      // Stop browser capture
      try {
        const { stopBrowserCapture } = await import(
          "../services/browser-capture.js"
        );
        await stopBrowserCapture();
      } catch {
        // Browser capture may not have been started -- ignore
      }
      // Stop StreamManager
      if (state.streamManager.isRunning()) {
        await state.streamManager.stop();
      }
      // Notify destination
      try {
        await state.destination?.onStreamStop?.();
      } catch {
        // Destination notification failure is non-fatal
      }
      json(res, { ok: true, live: false });
    } catch (err) {
      error(
        res,
        err instanceof Error ? err.message : "Failed to go offline",
        500,
      );
    }
    return true;
  }

  // ── POST /api/stream/start -- backward-compat explicit RTMP start ────
  if (method === "POST" && pathname === "/api/stream/start") {
    try {
      const bodyStr = await readRequestBody(req);
      const body =
        typeof bodyStr === "string" ? JSON.parse(bodyStr) : bodyStr;
      const rtmpUrl = body?.rtmpUrl as string | undefined;
      const rtmpKey = body?.rtmpKey as string | undefined;

      if (!rtmpUrl || !rtmpKey) {
        error(res, "rtmpUrl and rtmpKey are required", 400);
        return true;
      }

      if (!/^rtmps?:\/\//i.test(rtmpUrl)) {
        error(res, "rtmpUrl must use rtmp:// or rtmps:// scheme", 400);
        return true;
      }

      await state.streamManager.start({
        rtmpUrl,
        rtmpKey,
        inputMode:
          (body?.inputMode as "testsrc" | "avfoundation") || "testsrc",
        resolution: (body?.resolution as string) || "1280x720",
        bitrate: (body?.bitrate as string) || "2500k",
        framerate: (body?.framerate as number) || 30,
      });

      json(res, { ok: true, message: "Stream started" });
    } catch (err) {
      error(
        res,
        err instanceof Error ? err.message : "Stream start failed",
        500,
      );
    }
    return true;
  }

  // ── POST /api/stream/stop -- backward-compat explicit stop ───────────
  if (method === "POST" && pathname === "/api/stream/stop") {
    try {
      const result = await state.streamManager.stop();
      json(res, { ok: true, ...result });
    } catch (err) {
      error(
        res,
        err instanceof Error ? err.message : "Stream stop failed",
        500,
      );
    }
    return true;
  }

  // ── GET /api/stream/status -- local stream health ────────────────────
  if (method === "GET" && pathname === "/api/stream/status") {
    const health = state.streamManager.getHealth();
    const dest = state.destination
      ? { id: state.destination.id, name: state.destination.name }
      : null;
    json(res, { ok: true, ...health, destination: dest });
    return true;
  }

  // ── POST /api/stream/volume -- set stream volume (0-100) ─────────────
  if (method === "POST" && pathname === "/api/stream/volume") {
    try {
      const body = await readRequestBody(req);
      const parsed = typeof body === "string" ? JSON.parse(body) : body;
      const level = parsed?.volume;
      if (typeof level !== "number" || level < 0 || level > 100) {
        error(res, "volume must be a number between 0 and 100", 400);
        return true;
      }
      await state.streamManager.setVolume(level);
      json(res, {
        ok: true,
        volume: state.streamManager.getVolume(),
        muted: state.streamManager.isMuted(),
      });
    } catch (err) {
      error(
        res,
        err instanceof Error ? err.message : "Failed to set volume",
        500,
      );
    }
    return true;
  }

  // ── POST /api/stream/mute -- mute stream audio ──────────────────────
  if (method === "POST" && pathname === "/api/stream/mute") {
    try {
      await state.streamManager.mute();
      json(res, {
        ok: true,
        muted: true,
        volume: state.streamManager.getVolume(),
      });
    } catch (err) {
      error(res, err instanceof Error ? err.message : "Failed to mute", 500);
    }
    return true;
  }

  // ── POST /api/stream/unmute -- unmute stream audio ───────────────────
  if (method === "POST" && pathname === "/api/stream/unmute") {
    try {
      await state.streamManager.unmute();
      json(res, {
        ok: true,
        muted: false,
        volume: state.streamManager.getVolume(),
      });
    } catch (err) {
      error(
        res,
        err instanceof Error ? err.message : "Failed to unmute",
        500,
      );
    }
    return true;
  }

  // ── GET /api/streaming/destinations -- list configured destination ───
  if (method === "GET" && pathname === "/api/streaming/destinations") {
    const destinations = state.destination
      ? [{ id: state.destination.id, name: state.destination.name }]
      : [];
    json(res, { ok: true, destinations });
    return true;
  }

  // ── POST /api/streaming/destination -- set active destination ────────
  if (method === "POST" && pathname === "/api/streaming/destination") {
    // Placeholder for multi-destination future. Currently a no-op that
    // validates the request shape but doesn't change state.
    try {
      const body = await readRequestBody(req);
      const parsed = typeof body === "string" ? JSON.parse(body) : body;
      const destinationId = parsed?.destinationId as string | undefined;
      if (!destinationId) {
        error(res, "destinationId is required", 400);
        return true;
      }
      if (state.destination && state.destination.id === destinationId) {
        json(res, {
          ok: true,
          destination: { id: state.destination.id, name: state.destination.name },
        });
      } else {
        error(res, `Unknown destination: ${destinationId}`, 404);
      }
    } catch (err) {
      error(
        res,
        err instanceof Error ? err.message : "Failed to set destination",
        500,
      );
    }
    return true;
  }

  return false;
}
