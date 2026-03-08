/**
 * Swabble (Wake Word) Native Module for Electrobun
 *
 * Wake word detection using Whisper for audio processing.
 * If Whisper is unavailable in Bun runtime, returns graceful stubs.
 * Web Speech API in the renderer can serve as a fallback.
 */

import { isWhisperAvailable } from "./whisper";

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

  async audioChunk(_options: { data: string }): Promise<void> {
    // Process audio chunk through Whisper if available
    // For now, this is a no-op until Whisper integration is confirmed
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
