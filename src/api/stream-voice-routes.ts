import type { IncomingMessage, ServerResponse } from "node:http";
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

export async function handleStreamVoiceRoute(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  method: string,
  state: StreamRouteState,
): Promise<boolean> {
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
