/**
 * Retake.tv API routes: frame push, go-live, go-offline.
 *
 * Extracted from the main server handler for testability.
 * Loaded dynamically only when the retake connector is configured.
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
// State interface (subset of ServerState relevant to retake routes)
// ---------------------------------------------------------------------------

export interface RetakeRouteState {
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
  /** Server port — used for building the default capture URL. */
  port?: number;
  /** Config-driven values from connectors.retake (override env vars). */
  config?: {
    accessToken?: string;
    apiUrl?: string;
    captureUrl?: string;
  };
}

function json(res: ServerResponse, data: unknown, status = 200): void {
  sendJson(res, data, status);
}

function error(res: ServerResponse, message: string, status: number): void {
  sendJsonError(res, message, status);
}

// ---------------------------------------------------------------------------
// Shared pipeline: fetch RTMP creds → register session → headless capture → FFmpeg.
// Used by both the POST /api/retake/live handler and deferred auto-start.
// ---------------------------------------------------------------------------

/** Resolve a retake config value: config.connectors.retake > env var > default. */
function resolve(
  state: RetakeRouteState,
  configKey: "accessToken" | "apiUrl" | "captureUrl",
  envKey: string,
  fallback = "",
): string {
  return (state.config?.[configKey] ?? process.env[envKey] ?? fallback).trim();
}

/**
 * Detect the best capture mode for the current environment.
 *
 * Priority:
 * 1. RETAKE_STREAM_MODE env var (explicit override: "ui", "x11grab", "file", "avfoundation")
 * 2. Electron → "pipe" (capturePage → POST /api/retake/frame → FFmpeg stdin)
 * 3. Linux with DISPLAY or Xvfb → "x11grab" (Hyperscape approach)
 * 4. macOS → "avfoundation" (native screen capture)
 * 5. Fallback → "file" (Puppeteer CDP → temp JPEG → FFmpeg)
 */
/** @internal Exported for testing. */
export function detectCaptureMode(): StreamConfig["inputMode"] {
  const explicit = process.env.RETAKE_STREAM_MODE;
  if (explicit === "ui" || explicit === "pipe") return "pipe";
  if (explicit === "x11grab") return "x11grab";
  if (explicit === "avfoundation" || explicit === "screen")
    return "avfoundation";
  if (explicit === "file") return "file";

  // Electron → pipe mode
  if (process.versions.electron) return "pipe";

  // Linux with a display → x11grab (Xvfb or native X11)
  if (process.platform === "linux" && process.env.DISPLAY) return "x11grab";

  // macOS → avfoundation screen capture
  if (process.platform === "darwin") return "avfoundation";

  // Fallback → headless browser capture → file mode
  return "file";
}

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
      `[retake] Invalid display format: ${display} (expected :<number>)`,
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
      logger.info(`[retake] Xvfb already running on display ${display}`);
      return true;
    } catch {
      // Not running — start it
    }

    const [w, h] = resolution.split("x");
    if (!w || !h || !/^\d+$/.test(w) || !/^\d+$/.test(h)) {
      logger.warn(`[retake] Invalid resolution for Xvfb: ${resolution}`);
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
    logger.info(`[retake] Started Xvfb on display ${display} (${resolution})`);
    process.env.DISPLAY = display;
    return true;
  } catch (err) {
    logger.warn(`[retake] Failed to start Xvfb: ${err}`);
    return false;
  }
}

async function startRetakeStream(
  state: RetakeRouteState,
): Promise<{ rtmpUrl: string; inputMode: string; audioSource: string }> {
  const retakeToken = resolve(state, "accessToken", "RETAKE_AGENT_TOKEN");
  if (!retakeToken) {
    throw new Error(
      "Retake access token not configured (set connectors.retake.accessToken or RETAKE_AGENT_TOKEN)",
    );
  }
  const retakeApiUrl = resolve(
    state,
    "apiUrl",
    "RETAKE_API_URL",
    "https://retake.tv/api/v1",
  );
  const authHeaders = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${retakeToken}`,
  };

  // 1. Fetch fresh RTMP credentials
  const rtmpRes = await fetch(`${retakeApiUrl}/agent/rtmp`, {
    method: "POST",
    headers: authHeaders,
  });
  if (!rtmpRes.ok) {
    throw new Error(`RTMP creds failed: ${rtmpRes.status}`);
  }
  const { url: rtmpUrl, key: rtmpKey } = (await rtmpRes.json()) as {
    url: string;
    key: string;
  };

  // 2. Register stream session on retake.tv
  const startRes = await fetch(`${retakeApiUrl}/agent/stream/start`, {
    method: "POST",
    headers: authHeaders,
  });
  if (!startRes.ok) {
    const text = await startRes.text();
    throw new Error(`retake.tv start failed: ${startRes.status} ${text}`);
  }

  // 3. Detect capture mode and start the appropriate pipeline
  const mode = detectCaptureMode();
  const audioSource = process.env.RETAKE_AUDIO_SOURCE || "silent";
  const audioDevice = process.env.RETAKE_AUDIO_DEVICE;
  const volume = parseInt(process.env.RETAKE_VOLUME || "80", 10);
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
      // Frames posted by Electron renderer via POST /api/retake/frame.
      logger.info("[retake] Capture mode: pipe (Electron UI)");
      await state.streamManager.start({
        ...baseConfig,
        inputMode: "pipe",
        framerate: 15,
      });

      // Auto-start Electron frame capture so the UI is streamed without
      // requiring a manual button click in the renderer.
      // The Electron native module exposes the singleton on globalThis.
      const scm = (
        globalThis as unknown as {
          __miladyScreenCaptureManager?: {
            isFrameCaptureActive(): boolean;
            startFrameCapture(opts: {
              fps?: number;
              quality?: number;
              endpoint?: string;
            }): Promise<void>;
          };
        }
      ).__miladyScreenCaptureManager;
      if (scm && !scm.isFrameCaptureActive()) {
        try {
          await scm.startFrameCapture({
            fps: 15,
            quality: 70,
            endpoint: "/api/retake/frame",
          });
          logger.info("[retake] Auto-started Electron frame capture");
        } catch (err) {
          logger.warn(`[retake] Failed to auto-start frame capture: ${err}`);
        }
      } else if (!scm) {
        logger.warn(
          "[retake] ScreenCaptureManager not available — frame capture must be started manually",
        );
      }
      break;
    }

    case "x11grab": {
      // Linux Xvfb mode (Hyperscape approach): capture virtual display.
      const display = process.env.RETAKE_DISPLAY || ":99";
      logger.info(`[retake] Capture mode: x11grab (display ${display})`);

      // Ensure Xvfb is running
      await ensureXvfb(display, resolution);

      // Launch a browser on the virtual display so there's something to capture
      const captureUrl =
        resolve(state, "captureUrl", "RETAKE_CAPTURE_URL") ||
        `http://127.0.0.1:${state.port ?? 2138}`;

      try {
        const { startBrowserCapture } = await import(
          "../services/browser-capture.js"
        );
        // Browser capture in x11grab mode just opens the browser on the display —
        // we don't need the frame file since FFmpeg captures the display directly.
        await startBrowserCapture({
          url: captureUrl,
          width: 1280,
          height: 720,
          quality: 70,
        });
      } catch (err) {
        logger.warn(`[retake] Browser launch on ${display} failed: ${err}`);
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
      const videoDevice = process.env.RETAKE_VIDEO_DEVICE || "3";
      logger.info(
        `[retake] Capture mode: avfoundation (device ${videoDevice})`,
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
      // Headless browser capture → temp JPEG file → FFmpeg file mode.
      const captureUrl =
        resolve(state, "captureUrl", "RETAKE_CAPTURE_URL") ||
        `http://127.0.0.1:${state.port ?? 2138}`;

      logger.info(
        `[retake] Capture mode: file (browser capture → ${captureUrl})`,
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
              // Frame file not yet ready — poll again
            }
          }, 200);
          setTimeout(() => {
            clearInterval(check);
            resolve(false);
          }, 10_000);
        });
      } catch (captureErr) {
        logger.warn(`[retake] Browser capture failed: ${captureErr}`);
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

  return { rtmpUrl, inputMode: mode || "file", audioSource };
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

/** Returns `true` if handled, `false` to fall through. */
export async function handleRetakeRoute(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  method: string,
  state: RetakeRouteState,
): Promise<boolean> {
  if (!pathname.startsWith("/api/retake/")) return false;

  // ── POST /api/retake/frame — pipe frames to StreamManager ─────────────
  if (method === "POST" && pathname === "/api/retake/frame") {
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
      "StreamManager not running — start stream via POST /api/retake/live",
      503,
    );
    return true;
  }

  // ── POST /api/retake/live — start retake.tv stream ────────────────────
  if (method === "POST" && pathname === "/api/retake/live") {
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
    const retakeToken = resolve(state, "accessToken", "RETAKE_AGENT_TOKEN");
    if (!retakeToken) {
      error(res, "Retake access token not configured", 400);
      return true;
    }
    try {
      const { rtmpUrl, inputMode, audioSource } =
        await startRetakeStream(state);
      json(res, { ok: true, live: true, rtmpUrl, inputMode, audioSource });
    } catch (err) {
      error(res, err instanceof Error ? err.message : "Failed to go live", 500);
    }
    return true;
  }

  // ── POST /api/retake/offline — stop stream + notify retake.tv ─────────
  if (method === "POST" && pathname === "/api/retake/offline") {
    try {
      // Stop browser capture
      try {
        const { stopBrowserCapture } = await import(
          "../services/browser-capture.js"
        );
        await stopBrowserCapture();
      } catch {
        // Browser capture may not have been started — ignore
      }
      // Stop StreamManager
      if (state.streamManager.isRunning()) {
        await state.streamManager.stop();
      }
      // Stop retake.tv session
      const retakeToken = resolve(state, "accessToken", "RETAKE_AGENT_TOKEN");
      const retakeApiUrl = resolve(
        state,
        "apiUrl",
        "RETAKE_API_URL",
        "https://retake.tv/api/v1",
      );
      if (retakeToken) {
        await fetch(`${retakeApiUrl}/agent/stream/stop`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${retakeToken}`,
          },
        }).catch(() => {});
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

  // ── GET /api/retake/status — local stream health ────────────────────
  if (method === "GET" && pathname === "/api/retake/status") {
    json(res, { ok: true, ...state.streamManager.getHealth() });
    return true;
  }

  // ── POST /api/retake/volume — set stream volume (0–100) ─────────────
  if (method === "POST" && pathname === "/api/retake/volume") {
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

  // ── POST /api/retake/mute — mute stream audio ──────────────────────
  if (method === "POST" && pathname === "/api/retake/mute") {
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

  // ── POST /api/retake/unmute — unmute stream audio ───────────────────
  if (method === "POST" && pathname === "/api/retake/unmute") {
    try {
      await state.streamManager.unmute();
      json(res, {
        ok: true,
        muted: false,
        volume: state.streamManager.getVolume(),
      });
    } catch (err) {
      error(res, err instanceof Error ? err.message : "Failed to unmute", 500);
    }
    return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
