/**
 * Whisper Native Module for Electrobun
 *
 * Attempts to load speech-to-text modules compatible with Bun runtime.
 * Tries packages in order of Bun compatibility:
 *
 * Tier 1 — N-API native modules (prebuild binaries, best performance):
 *   sherpa-onnx, smart-whisper, whisper-node-addon
 *
 * Tier 2 — ONNX/Transformers.js (pure JS via onnxruntime-node):
 *   @huggingface/transformers
 *
 * Tier 3 — Legacy packages (CLI wrappers, less likely to work):
 *   whisper-node, @nicksellen/whisper-node, whisper.cpp
 *
 * Falls back gracefully if no module works — renderer uses Web Speech API.
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
let whisperModuleName: string | null = null;

async function tryLoadWhisper(): Promise<boolean> {
  // Tier 1: N-API native modules (best for Bun runtime)
  const nativePackages = ["sherpa-onnx", "smart-whisper", "whisper-node-addon"];

  for (const pkg of nativePackages) {
    try {
      whisperModule = await import(pkg);
      whisperModuleName = pkg;
      console.log(`[Whisper] Loaded native module: ${pkg}`);
      whisperAvailable = true;
      return true;
    } catch {}
  }

  // Tier 2: Transformers.js (ONNX runtime, confirmed Bun support)
  try {
    const tf = await import("@huggingface/transformers");
    whisperModule = tf as unknown as Record<string, unknown>;
    whisperModuleName = "@huggingface/transformers";
    console.log("[Whisper] Loaded @huggingface/transformers");
    whisperAvailable = true;
    return true;
  } catch {
    // Not installed
  }

  // Tier 3: Legacy packages (CLI wrappers — less reliable in Bun)
  const legacyPackages = [
    "whisper-node",
    "@nicksellen/whisper-node",
    "whisper.cpp",
    "@nicksellen/whispercpp",
  ];

  for (const pkg of legacyPackages) {
    try {
      whisperModule = await import(pkg);
      whisperModuleName = pkg;
      console.log(`[Whisper] Loaded legacy module: ${pkg}`);
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

export function getWhisperModuleName(): string | null {
  return whisperModuleName;
}

export async function transcribe(
  audioPath: string,
  options?: Record<string, unknown>,
): Promise<WhisperResult | null> {
  if (!whisperAvailable || !whisperModule) {
    return null;
  }

  try {
    // Transformers.js pipeline API
    if (whisperModuleName === "@huggingface/transformers") {
      const { pipeline } = whisperModule as {
        pipeline: (
          task: string,
          model: string,
          opts?: Record<string, unknown>,
        ) => Promise<(input: string) => Promise<{ text: string }>>;
      };
      const transcriber = await pipeline(
        "automatic-speech-recognition",
        (options?.model as string) ?? "onnx-community/whisper-tiny.en",
        { dtype: "q8" },
      );
      const result = await transcriber(audioPath);
      return { text: result.text, segments: [] };
    }

    // whisper-node style API (default export with .whisper() method)
    const whisper =
      (whisperModule as { default?: unknown }).default ?? whisperModule;
    if (typeof (whisper as { whisper?: unknown }).whisper === "function") {
      const result = await (
        whisper as {
          whisper: (path: string, opts?: unknown) => Promise<unknown>;
        }
      ).whisper(audioPath, options);
      return result as WhisperResult;
    }

    return null;
  } catch (err) {
    console.error("[Whisper] Transcription failed:", err);
    return null;
  }
}
