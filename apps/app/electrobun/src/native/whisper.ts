/**
 * Whisper Native Module for Electrobun
 *
 * Attempts to load whisper-node for offline speech-to-text.
 * Falls back gracefully if native bindings don't work in Bun runtime.
 */

export interface WhisperResult {
  text: string;
  segments: WhisperSegment[];
  language?: string;
  duration?: number;
}

export interface WhisperSegment {
  text: string;
  start: number;
  end: number;
  tokens?: WhisperToken[];
}

export interface WhisperToken {
  text: string;
  start: number;
  end: number;
  probability: number;
}

let whisperAvailable = false;
let whisperModule: Record<string, unknown> | null = null;

async function tryLoadWhisper(): Promise<boolean> {
  const packages = [
    "whisper-node",
    "@nicksellen/whisper-node",
    "whisper.cpp",
    "@nicksellen/whispercpp",
  ];

  for (const pkg of packages) {
    try {
      whisperModule = await import(pkg);
      console.log(`[Whisper] Loaded ${pkg}`);
      whisperAvailable = true;
      return true;
    } catch {}
  }

  console.warn(
    "[Whisper] No whisper module available in Bun runtime. " +
      "STT will fall back to Web Speech API in renderer.",
  );
  return false;
}

// Attempt load on module init
tryLoadWhisper();

export function isWhisperAvailable(): boolean {
  return whisperAvailable;
}

export function getWhisperModule(): Record<string, unknown> | null {
  return whisperModule;
}

export async function transcribe(
  _audioPath: string,
  _options?: Record<string, unknown>,
): Promise<WhisperResult | null> {
  if (!whisperAvailable || !whisperModule) {
    return null;
  }

  try {
    const whisper =
      (whisperModule as { default?: unknown }).default ?? whisperModule;
    if (typeof (whisper as { whisper?: unknown }).whisper === "function") {
      const result = await (
        whisper as { whisper: (...args: unknown[]) => Promise<unknown> }
      ).whisper(_audioPath, _options);
      return result as WhisperResult;
    }
    return null;
  } catch (err) {
    console.error("[Whisper] Transcription failed:", err);
    return null;
  }
}
