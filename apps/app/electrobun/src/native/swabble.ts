/**
 * Swabble (Wake Word) Native Module for Electrobun
 *
 * Wake word detection using Whisper for audio processing.
 * If Whisper is unavailable in Bun runtime, returns graceful stubs.
 * Web Speech API in the renderer can serve as a fallback.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { isWhisperAvailable, transcribe } from "./whisper";

type SendToWebview = (message: string, payload?: unknown) => void;

interface SwabbleConfig {
  triggers: string[];
  minPostTriggerGap: number;
  minCommandLength: number;
  enabled: boolean;
}

export class SwabbleManager {
  private sendToWebview: SendToWebview | null = null;
  private listening = false;
  private processing = false;
  private config: SwabbleConfig = {
    triggers: ["hey milady", "milady"],
    minPostTriggerGap: 0.45,
    minCommandLength: 2,
    enabled: true,
  };

  setSendToWebview(fn: SendToWebview): void {
    this.sendToWebview = fn;
  }

  async start() {
    if (!isWhisperAvailable()) {
      return {
        available: false,
        reason:
          "Whisper is not available in Bun runtime. Use Web Speech API fallback.",
      };
    }

    this.listening = true;
    this.sendToWebview?.("swabbleStateChanged", { listening: true });
    return { available: true };
  }

  async stop(): Promise<void> {
    this.listening = false;
    this.sendToWebview?.("swabbleStateChanged", { listening: false });
  }

  async isListening() {
    return { listening: this.listening };
  }

  async getConfig() {
    return this.config as Record<string, unknown>;
  }

  async updateConfig(updates: Record<string, unknown>): Promise<void> {
    Object.assign(this.config, updates);
  }

  async isWhisperAvailableCheck() {
    return { available: isWhisperAvailable() };
  }

  async audioChunk(options: { data: string }): Promise<void> {
    if (!this.listening || !isWhisperAvailable() || this.processing) return;

    this.processing = true;
    try {
      // Write base64 audio to temp file for transcription
      const tmpFile = path.join(
        os.tmpdir(),
        `milady-swabble-${Date.now()}.wav`,
      );
      const audioBuffer = Buffer.from(options.data, "base64");
      fs.writeFileSync(tmpFile, audioBuffer);

      const result = await transcribe(tmpFile);
      // Clean up temp file
      try {
        fs.unlinkSync(tmpFile);
      } catch {}

      if (!result?.text) return;

      // Check for wake word triggers
      const text = result.text.toLowerCase().trim();
      for (const trigger of this.config.triggers) {
        if (text.includes(trigger.toLowerCase())) {
          // Extract command after the trigger
          const idx = text.indexOf(trigger.toLowerCase());
          const command = text.slice(idx + trigger.length).trim();

          this.sendToWebview?.("swabbleWakeWord", {
            trigger,
            command:
              command.length >= this.config.minCommandLength
                ? command
                : undefined,
            transcript: result.text,
          });
          break;
        }
      }
    } catch (err) {
      console.error("[Swabble] Audio chunk processing failed:", err);
    } finally {
      this.processing = false;
    }
  }

  dispose(): void {
    this.listening = false;
    this.sendToWebview = null;
  }
}

let swabbleManager: SwabbleManager | null = null;

export function getSwabbleManager(): SwabbleManager {
  if (!swabbleManager) {
    swabbleManager = new SwabbleManager();
  }
  return swabbleManager;
}
