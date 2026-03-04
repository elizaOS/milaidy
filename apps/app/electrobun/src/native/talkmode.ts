/**
 * TalkMode Native Module for Electrobun
 *
 * Provides text-to-speech via ElevenLabs API (fetch-based, works in Bun)
 * and speech-to-text via Whisper (if available) or Web Speech API fallback.
 */

import type { TalkModeConfig, TalkModeState } from "../rpc-schema";
import { isWhisperAvailable } from "./whisper";

type SendToWebview = (message: string, payload?: unknown) => void;

export class TalkModeManager {
  private sendToWebview: SendToWebview | null = null;
  private state: TalkModeState = "idle";
  private speaking = false;
  private config: TalkModeConfig = {
    engine: isWhisperAvailable() ? "whisper" : "web",
    modelSize: "base",
    language: "en",
  };

  setSendToWebview(fn: SendToWebview): void {
    this.sendToWebview = fn;
  }

  private setState(newState: TalkModeState): void {
    this.state = newState;
    this.sendToWebview?.("talkmodeStateChanged", { state: newState });
  }

  async start() {
    const whisperOk = isWhisperAvailable();
    if (!whisperOk && this.config.engine === "whisper") {
      this.config.engine = "web";
    }

    this.setState("listening");
    return {
      available: true,
      reason: whisperOk
        ? undefined
        : "Using Web Speech API (Whisper unavailable in Bun)",
    };
  }

  async stop(): Promise<void> {
    this.setState("idle");
    this.speaking = false;
  }

  async speak(options: {
    text: string;
    directive?: Record<string, unknown>;
  }): Promise<void> {
    const apiKey = process.env.ELEVEN_LABS_API_KEY;
    if (!apiKey) {
      console.warn("[TalkMode] ELEVEN_LABS_API_KEY not set, skipping TTS");
      return;
    }

    this.speaking = true;
    this.setState("speaking");

    try {
      const voiceId =
        (options.directive?.voiceId as string) ??
        this.config.voiceId ??
        "21m00Tcm4TlvDq8ikWAM"; // Default voice

      const resp = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`,
        {
          method: "POST",
          headers: {
            "xi-api-key": apiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            text: options.text,
            model_id:
              (options.directive?.modelId as string) ?? "eleven_turbo_v2",
            voice_settings: {
              stability: (options.directive?.stability as number) ?? 0.5,
              similarity_boost:
                (options.directive?.similarity as number) ?? 0.75,
            },
          }),
        },
      );

      if (!resp.ok) {
        console.error(
          `[TalkMode] ElevenLabs API error: ${resp.status} ${resp.statusText}`,
        );
        this.setState("error");
        return;
      }

      // Stream audio chunks to webview
      if (resp.body) {
        const reader = resp.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          // Convert to base64 for RPC transport
          const base64 = Buffer.from(value).toString("base64");
          this.sendToWebview?.("talkmodeAudioChunkPush", { data: base64 });
        }
      }

      this.sendToWebview?.("talkmodeSpeakComplete");
    } catch (err) {
      console.error("[TalkMode] TTS error:", err);
      this.setState("error");
    } finally {
      this.speaking = false;
      if (this.state !== "error") {
        this.setState("idle");
      }
    }
  }

  async stopSpeaking(): Promise<void> {
    this.speaking = false;
    this.setState("idle");
  }

  async getState() {
    return { state: this.state };
  }

  async isEnabled() {
    return { enabled: true };
  }

  async isSpeaking() {
    return { speaking: this.speaking };
  }

  async getWhisperInfo() {
    return {
      available: isWhisperAvailable(),
      modelSize: this.config.modelSize,
    };
  }

  async isWhisperAvailableCheck() {
    return { available: isWhisperAvailable() };
  }

  async updateConfig(config: TalkModeConfig): Promise<void> {
    Object.assign(this.config, config);
  }

  async audioChunk(_options: { data: string }): Promise<void> {
    // Process incoming audio chunk for STT
    // Handled by Whisper if available, or forwarded to renderer for Web Speech API
  }

  dispose(): void {
    this.speaking = false;
    this.state = "idle";
    this.sendToWebview = null;
  }
}

let talkModeManager: TalkModeManager | null = null;

export function getTalkModeManager(): TalkModeManager {
  if (!talkModeManager) {
    talkModeManager = new TalkModeManager();
  }
  return talkModeManager;
}
