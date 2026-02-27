/**
 * Stream voice routes — TTS voice configuration and manual speak trigger.
 *
 * Extracted from stream-routes.ts to keep route files focused and under 500 LOC.
 * Handles:
 *   - GET  /api/stream/voice        — voice config status
 *   - POST /api/stream/voice        — save voice settings
 *   - POST /api/stream/voice/speak  — manually trigger TTS
 *   - onAgentMessage()              — auto-trigger TTS on assistant messages
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { logger } from "@elizaos/core";
import {
  getTtsProviderStatus,
  resolveTtsConfig,
  ttsStreamBridge,
} from "../services/tts-stream-bridge";
import { readRequestBody, sendJson, sendJsonError } from "./http-helpers";
import {
  readStreamSettings,
  type StreamVoiceSettings,
  writeStreamSettings,
} from "./stream-persistence";
import type { StreamRouteState } from "./stream-routes";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum character length for a single /speak request. */
const SPEAK_TEXT_MAX_CHARS = 2000;

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
// Route handler
// ---------------------------------------------------------------------------

/** Returns `true` if handled, `false` to fall through. */
export async function handleStreamVoiceRoute(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  method: string,
  state: StreamRouteState,
): Promise<boolean> {
  // ── GET /api/stream/voice — voice config status ───────────────────────
  if (method === "GET" && pathname === "/api/stream/voice") {
    try {
      const settings = readStreamSettings();
      const ttsConf = state.config?.messages?.tts;
      const providerStatus = getTtsProviderStatus(ttsConf);
      json(res, {
        ok: true,
        enabled: settings.voice?.enabled === true,
        autoSpeak: settings.voice?.autoSpeak !== false,
        provider: providerStatus.resolvedProvider,
        configuredProvider: providerStatus.configuredProvider,
        hasApiKey: providerStatus.hasApiKey,
        isSpeaking: ttsStreamBridge.isSpeaking(),
        isAttached: ttsStreamBridge.isAttached(),
      });
    } catch (err) {
      error(
        res,
        err instanceof Error ? err.message : "Failed to read voice config",
        500,
      );
    }
    return true;
  }

  // ── POST /api/stream/voice — save voice settings ──────────────────────
  if (method === "POST" && pathname === "/api/stream/voice") {
    try {
      const body = await readRequestBody(req);
      const parsed = typeof body === "string" ? JSON.parse(body) : body;
      const current = readStreamSettings();
      const voice: StreamVoiceSettings = {
        enabled: current.voice?.enabled ?? false,
        autoSpeak: current.voice?.autoSpeak ?? true,
      };
      if (typeof parsed?.enabled === "boolean") voice.enabled = parsed.enabled;
      if (typeof parsed?.autoSpeak === "boolean")
        voice.autoSpeak = parsed.autoSpeak;
      if (typeof parsed?.provider === "string")
        voice.provider = parsed.provider;
      current.voice = voice;
      writeStreamSettings(current);
      json(res, { ok: true, voice });
    } catch (err) {
      error(
        res,
        err instanceof Error ? err.message : "Failed to save voice settings",
        500,
      );
    }
    return true;
  }

  // ── POST /api/stream/voice/speak — manually trigger TTS ───────────────
  if (method === "POST" && pathname === "/api/stream/voice/speak") {
    try {
      const body = await readRequestBody(req);
      const parsed = typeof body === "string" ? JSON.parse(body) : body;
      const text = typeof parsed?.text === "string" ? parsed.text.trim() : "";
      if (!text) {
        error(res, "text is required", 400);
        return true;
      }

      if (text.length > SPEAK_TEXT_MAX_CHARS) {
        error(
          res,
          `text exceeds maximum length of ${SPEAK_TEXT_MAX_CHARS} characters`,
          400,
        );
        return true;
      }

      const ttsConf = state.config?.messages?.tts;
      const resolved = resolveTtsConfig(ttsConf);
      if (!resolved) {
        error(
          res,
          "No TTS provider available. Configure API keys in Secrets.",
          400,
        );
        return true;
      }

      if (!ttsStreamBridge.isAttached()) {
        error(
          res,
          "TTS bridge not attached — start stream with voice enabled first",
          400,
        );
        return true;
      }

      if (ttsStreamBridge.isSpeaking()) {
        error(res, "Already speaking — wait for current speech to finish", 429);
        return true;
      }

      const speaking = await ttsStreamBridge.speak(text, resolved);
      json(res, { ok: true, speaking });
    } catch (err) {
      error(res, err instanceof Error ? err.message : "TTS speak failed", 500);
    }
    return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Auto-trigger TTS on agent messages
// ---------------------------------------------------------------------------

/**
 * Called from the event pipeline when an assistant message arrives.
 * If voice is enabled and the stream is running, triggers TTS automatically.
 */
export async function onAgentMessage(
  text: string,
  state: StreamRouteState,
): Promise<void> {
  if (!text.trim()) return;
  if (!state.streamManager.isRunning()) return;
  if (!ttsStreamBridge.isAttached()) return;

  const settings = readStreamSettings();
  if (!settings.voice?.enabled) return;
  if (settings.voice.autoSpeak === false) return;

  const ttsConf = state.config?.messages?.tts;
  const resolved = resolveTtsConfig(ttsConf);
  if (!resolved) return;

  try {
    await ttsStreamBridge.speak(text.trim(), resolved);
  } catch (err) {
    logger.warn(
      `[stream-voice] Auto-TTS failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
