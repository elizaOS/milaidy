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
import { readRequestBodyBuffer, sendJson, sendJsonError } from "./http-helpers";

// ---------------------------------------------------------------------------
// State interface (subset of ServerState relevant to retake routes)
// ---------------------------------------------------------------------------

export interface RetakeRouteState {
  streamManager: {
    isRunning(): boolean;
    writeFrame(buf: Buffer): boolean;
    start(config: StreamConfig): Promise<void>;
    stop(): Promise<{ uptime: number }>;
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

async function startRetakeStream(
  state: RetakeRouteState,
): Promise<{ rtmpUrl: string }> {
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

  // 3. Start headless browser capture (writes frames to temp file)
  const captureUrl =
    resolve(state, "captureUrl", "RETAKE_CAPTURE_URL") ||
    `http://127.0.0.1:${state.port ?? 2138}`;

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
          if (fs.existsSync(FRAME_FILE) && fs.statSync(FRAME_FILE).size > 0) {
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

  // 4. Start FFmpeg → RTMP
  await state.streamManager.start({
    rtmpUrl,
    rtmpKey,
    inputMode: "file",
    frameFile: FRAME_FILE,
    resolution: "1280x720",
    framerate: 30,
    bitrate: "1500k",
  });

  return { rtmpUrl };
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
      json(res, { ok: true, live: true, message: "Already streaming" });
      return true;
    }
    const retakeToken = resolve(state, "accessToken", "RETAKE_AGENT_TOKEN");
    if (!retakeToken) {
      error(res, "Retake access token not configured", 400);
      return true;
    }
    try {
      const { rtmpUrl } = await startRetakeStream(state);
      json(res, { ok: true, live: true, rtmpUrl });
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

  return false;
}

// ---------------------------------------------------------------------------
// Auto-start (best-effort, non-blocking) — called from server startup
// ---------------------------------------------------------------------------

export function initRetakeAutoStart(state: RetakeRouteState): void {
  void (async () => {
    const retakeToken = resolve(state, "accessToken", "RETAKE_AGENT_TOKEN");
    if (!retakeToken) return;

    // Brief delay to let connectors finish init
    await new Promise((r) => setTimeout(r, 1_000));

    if (state.streamManager.isRunning()) {
      logger.info(
        "[milady-api] Retake stream already running, skipping auto-start",
      );
      return;
    }

    logger.info("[milady-api] Auto-starting retake.tv stream...");
    try {
      await startRetakeStream(state);
      logger.info("[milady-api] Retake.tv stream auto-started successfully");
    } catch (err) {
      logger.warn(
        `[milady-api] Retake stream auto-start failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  })();
}
