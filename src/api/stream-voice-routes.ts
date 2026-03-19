import type { IncomingMessage, ServerResponse } from "node:http";
import {
  readRequestBody,
  sendJson,
  sendJsonError,
} from "@elizaos/autonomous/api/http-helpers";
import {
  handleStreamVoiceRoute as handleAutonomousStreamVoiceRoute,
  onAgentMessage as onAutonomousAgentMessage,
} from "@elizaos/autonomous/api/stream-voice-routes";
import {
  getTtsProviderStatus,
  resolveTtsConfig,
  ttsStreamBridge,
} from "../services/tts-stream-bridge";
import { sanitizeSpeechText } from "../utils/spoken-text";
import { readStreamSettings, writeStreamSettings } from "./stream-persistence";
import type { StreamRouteState } from "./stream-route-state";

function getRouteTtsProviderStatus(config: unknown): {
  resolvedProvider: string | null;
  configuredProvider: string | null;
  hasApiKey: boolean;
} {
  return getTtsProviderStatus(config as never);
}

function resolveRouteTtsConfig(
  config: unknown,
): Record<string, unknown> | null {
  return resolveTtsConfig(config as never) as Record<string, unknown> | null;
}

const ttsBridgeAdapter = {
  isSpeaking(): boolean {
    return ttsStreamBridge.isSpeaking();
  },
  isAttached(): boolean {
    return ttsStreamBridge.isAttached();
  },
  async speak(text: string, config: Record<string, unknown>): Promise<boolean> {
    return ttsStreamBridge.speak(text, config as never);
  },
};

function readRouteStreamSettings(): {
  voice?: {
    enabled?: boolean;
    autoSpeak?: boolean;
    provider?: string;
  };
} {
  return readStreamSettings();
}

function writeRouteStreamSettings(settings: {
  voice?: {
    enabled?: boolean;
    autoSpeak?: boolean;
    provider?: string;
  };
}): void {
  writeStreamSettings(settings as never);
}

function sendVoiceJson(res: ServerResponse, body: unknown, status = 200): void {
  sendJson(res, body, status);
}

function sendVoiceError(
  res: ServerResponse,
  message: string,
  status: number,
): void {
  sendJsonError(res, message, status);
}

export async function handleStreamVoiceRoute(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  method: string,
  state: StreamRouteState,
): Promise<boolean> {
  if (method === "GET" && pathname === "/api/stream/voice") {
    try {
      const settings = readRouteStreamSettings();
      const ttsConf = state.config?.messages?.tts;
      const providerStatus = getRouteTtsProviderStatus(ttsConf);

      sendVoiceJson(res, {
        ok: true,
        enabled: settings.voice?.enabled === true,
        autoSpeak: settings.voice?.autoSpeak ?? true,
        provider: providerStatus.resolvedProvider,
        configuredProvider: providerStatus.configuredProvider,
        hasApiKey: providerStatus.hasApiKey,
        isSpeaking: ttsBridgeAdapter.isSpeaking(),
        isAttached: ttsBridgeAdapter.isAttached(),
      });
    } catch (err) {
      sendVoiceError(
        res,
        err instanceof Error ? err.message : "Failed to read voice config",
        500,
      );
    }
    return true;
  }

  if (method === "POST" && pathname === "/api/stream/voice") {
    try {
      const body = await readRequestBody(req, {
        maxBytes: 8192,
        returnNullOnTooLarge: true,
      });
      if (body === null) {
        sendVoiceError(res, "Request body too large", 413);
        return true;
      }

      const parsed = typeof body === "string" ? JSON.parse(body) : body;
      const current = readRouteStreamSettings();
      const voice: {
        enabled: boolean;
        autoSpeak: boolean;
        provider?: string;
      } = {
        enabled: current.voice?.enabled ?? false,
        autoSpeak: current.voice?.autoSpeak ?? true,
      };

      if (typeof parsed?.enabled === "boolean") {
        voice.enabled = parsed.enabled;
      }
      if (typeof parsed?.autoSpeak === "boolean") {
        voice.autoSpeak = parsed.autoSpeak;
      }
      if (typeof parsed?.provider === "string") {
        voice.provider = parsed.provider;
      }

      current.voice = voice;
      writeRouteStreamSettings(current);
      sendVoiceJson(res, { ok: true, voice });
    } catch (err) {
      sendVoiceError(
        res,
        err instanceof Error ? err.message : "Failed to save voice settings",
        500,
      );
    }
    return true;
  }

  return handleAutonomousStreamVoiceRoute({
    req,
    res,
    pathname,
    method,
    state,
    getTtsProviderStatus: getRouteTtsProviderStatus,
    resolveTtsConfig: resolveRouteTtsConfig,
    ttsStreamBridge: ttsBridgeAdapter,
    sanitizeSpeechText,
    readStreamSettings: readRouteStreamSettings,
    writeStreamSettings: writeRouteStreamSettings,
  });
}

export async function onAgentMessage(
  text: string,
  state: StreamRouteState,
): Promise<void> {
  return onAutonomousAgentMessage(text, state, {
    sanitizeSpeechText,
    readStreamSettings: readRouteStreamSettings,
    resolveTtsConfig: resolveRouteTtsConfig,
    ttsStreamBridge: ttsBridgeAdapter,
  });
}
