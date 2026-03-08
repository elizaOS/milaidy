/**
 * TalkMode Native Module for Electrobun
 *
 * Provides text-to-speech via ElevenLabs API (fetch-based, works in Bun)
 * and speech-to-text via Whisper (if available) or Web Speech API fallback.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { TalkModeConfig, TalkModeState } from "../rpc-schema";
import {
  isWhisperAvailable,
  transcribeBunSpawn,
  writeWavFile,
} from "./whisper";

// 3 seconds of audio at 16kHz = 48000 Float32 samples = 192000 bytes
const TALKMODE_AUDIO_BUFFER_THRESHOLD = 16000 * 3 * 4;

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
  private _audioBuffer: Buffer[] = [];
  private _audioBufferSize = 0;
  private _processing = false;

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
    this._audioBuffer = [];
    this._audioBufferSize = 0;
  }

  async speak(options: {
    text: string;
    directive?: Record<string, unknown>;
  }): Promise<void> {
    const apiKey = process.env.ELEVEN_LABS_API_KEY?.trim();
    if (apiKey) {
      await this._speakElevenLabs(options, apiKey);
    } else {
      // Default: system TTS (no API key required, works on all platforms)
      await this._speakSystem(options.text);
    }
  }

  /**
   * System TTS via platform-native voice synthesis.
   * Used when ELEVEN_LABS_API_KEY is not configured.
   * Audio plays directly through system speakers — no streaming to renderer.
   */
  private async _speakSystem(text: string): Promise<void> {
    this.speaking = true;
    this.setState("speaking");
    try {
      let proc: ReturnType<typeof Bun.spawn>;
      if (process.platform === "darwin") {
        proc = Bun.spawn(["say", text], { stderr: "pipe" });
      } else if (process.platform === "linux") {
        proc = Bun.spawn(["espeak", text], { stderr: "pipe" });
      } else {
        // Windows: PowerShell speech synthesizer.
        // Pass text via env var to avoid command-injection — never interpolate
        // user-controlled strings into the -Command argument.
        proc = Bun.spawn(
          [
            "powershell",
            "-NoProfile",
            "-Command",
            "Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; $s.Speak($env:MILADY_TTS_TEXT)",
          ],
          {
            stderr: "pipe",
            env: { ...process.env, MILADY_TTS_TEXT: text },
          },
        );
      }
      await proc.exited;
      this.sendToWebview?.("talkmodeSpeakComplete");
    } catch (err) {
      console.error("[TalkMode] System TTS error:", err);
      this.setState("error");
    } finally {
      this.speaking = false;
      if (this.state !== "error") {
        this.setState("idle");
      }
    }
  }

  /**
   * ElevenLabs TTS — used when ELEVEN_LABS_API_KEY is set.
   * Streams audio chunks to the renderer via talkmodeAudioChunkPush.
   * Model defaults to eleven_v3. Override via directive.modelId if needed.
   */
  private async _speakElevenLabs(
    options: { text: string; directive?: Record<string, unknown> },
    apiKey: string,
  ): Promise<void> {
    this.speaking = true;
    this.setState("speaking");

    try {
      const voiceId =
        (options.directive?.voiceId as string) ??
        this.config.voiceId ??
        "21m00Tcm4TlvDq8ikWAM";

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
            model_id: (options.directive?.modelId as string) ?? "eleven_v3",
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

      if (resp.body) {
        const reader = resp.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const base64 = Buffer.from(value).toString("base64");
          this.sendToWebview?.("talkmodeAudioChunkPush", { data: base64 });
        }
      }

      this.sendToWebview?.("talkmodeSpeakComplete");
    } catch (err) {
      console.error("[TalkMode] ElevenLabs TTS error:", err);
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

  async audioChunk(options: { data: string }): Promise<void> {
    // Only process audio when actively listening or speaking (not idle/error)
    if (this.state !== "listening" && this.state !== "speaking") return;

    // Decode base64 Float32 PCM and accumulate
    const chunkBuffer = Buffer.from(options.data, "base64");
    this._audioBuffer.push(chunkBuffer);
    this._audioBufferSize += chunkBuffer.length;

    // Process when we have enough audio (~3 seconds)
    if (
      this._audioBufferSize >= TALKMODE_AUDIO_BUFFER_THRESHOLD &&
      !this._processing
    ) {
      await this._processBuffer();
    }
  }

  private async _processBuffer(): Promise<void> {
    if (this._processing || this._audioBuffer.length === 0) return;
    this._processing = true;

    // Grab current buffer and clear for next window
    const allBuffers = [...this._audioBuffer];
    const combined = Buffer.concat(allBuffers);
    this._audioBuffer = [];
    this._audioBufferSize = 0;

    try {
      // Safe Float32 conversion — avoids alignment issues from Buffer pool offsets.
      const numSamples = combined.byteLength >>> 2; // divide by 4
      const float32 = new Float32Array(numSamples);
      const dv = new DataView(
        combined.buffer,
        combined.byteOffset,
        combined.byteLength,
      );
      for (let i = 0; i < numSamples; i++) {
        float32[i] = dv.getFloat32(i * 4, true); // little-endian
      }

      // Write to temp WAV file
      const tmpPath = path.join(
        os.tmpdir(),
        `milady-talkmode-${Date.now()}.wav`,
      );
      writeWavFile(tmpPath, float32, 16000, 1);

      // Transcribe
      const result = await transcribeBunSpawn(tmpPath);

      // Clean up temp file
      try {
        fs.unlinkSync(tmpPath);
      } catch {}

      if (!result || !result.text.trim()) return;

      // Emit transcript to renderer
      this.sendToWebview?.("talkmode:transcript", {
        text: result.text,
        segments: result.segments.map((s) => ({
          text: s.text,
          start: s.start,
          end: s.end,
        })),
      });
    } catch (err) {
      console.error("[TalkMode] _processBuffer error:", err);
    } finally {
      this._processing = false;
    }
  }

  dispose(): void {
    this.speaking = false;
    this.state = "idle";
    this._audioBuffer = [];
    this._audioBufferSize = 0;
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
