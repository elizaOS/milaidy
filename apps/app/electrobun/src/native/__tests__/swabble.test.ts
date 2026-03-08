/**
 * Unit tests for the Electrobun Swabble (wake-word) native module.
 *
 * Covers:
 * - SwabbleManager state transitions (start / stop / isListening)
 * - audioChunk fallback path when whisper binary is missing
 * - audioChunk accumulation and processBuffer trigger
 * - WakeWordGate integration via processBuffer (whisper mocked)
 * - updateConfig propagation
 * - dispose cleanup
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — vi.fn() must be defined INSIDE the factory to avoid hoisting issues.
// ---------------------------------------------------------------------------

vi.mock("../whisper", () => ({
  isWhisperBinaryAvailable: vi.fn(() => false),
  transcribeBunSpawn: vi.fn(),
  writeWavFile: vi.fn(),
}));

vi.mock("node:fs", () => ({
  default: { unlinkSync: vi.fn() },
  unlinkSync: vi.fn(),
}));

vi.mock("node:os", () => ({
  default: { tmpdir: vi.fn(() => "/tmp") },
  tmpdir: vi.fn(() => "/tmp"),
}));

vi.mock("node:path", async () => {
  const actual = await vi.importActual<typeof import("node:path")>("node:path");
  return { default: actual, ...actual };
});

import { SwabbleManager } from "../swabble";
// ---------------------------------------------------------------------------
// Module under test (and typed refs to mocked fns)
// ---------------------------------------------------------------------------
import * as whisperMod from "../whisper";

const mockIsWhisperBinaryAvailable =
  whisperMod.isWhisperBinaryAvailable as ReturnType<typeof vi.fn>;
const mockTranscribeBunSpawn = whisperMod.transcribeBunSpawn as ReturnType<
  typeof vi.fn
>;
const mockWriteWavFile = whisperMod.writeWavFile as ReturnType<typeof vi.fn>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// 3 s at 16kHz × 4 bytes/sample = 192 000 bytes
const CHUNK_BYTES = 16000 * 3 * 4;

function makeBase64Chunk(byteLength: number): string {
  return Buffer.alloc(byteLength).toString("base64");
}

function makeWhisperResult(
  text: string,
  segments = [{ text, start: 0, end: 1 }],
) {
  return { text, segments };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SwabbleManager", () => {
  let manager: SwabbleManager;
  let webviewMessages: Array<{ message: string; payload: unknown }>;

  beforeEach(() => {
    manager = new SwabbleManager();
    webviewMessages = [];
    manager.setSendToWebview((message, payload) => {
      webviewMessages.push({ message, payload });
    });
    mockIsWhisperBinaryAvailable.mockReset();
    mockTranscribeBunSpawn.mockReset();
    mockWriteWavFile.mockReset();
  });

  afterEach(() => {
    manager.dispose();
  });

  // ── Initial state ─────────────────────────────────────────────────────────

  describe("initial state", () => {
    it("is not listening by default", async () => {
      const { listening } = await manager.isListening();
      expect(listening).toBe(false);
    });

    it("has default triggers and config", async () => {
      const config = (await manager.getConfig()) as {
        triggers: string[];
        enabled: boolean;
      };
      expect(config.triggers).toContain("milady");
      expect(config.enabled).toBe(true);
    });
  });

  // ── start ─────────────────────────────────────────────────────────────────

  describe("start", () => {
    it("returns started: false when whisper binary is unavailable", async () => {
      mockIsWhisperBinaryAvailable.mockReturnValue(false);
      const result = await manager.start();
      expect(result.started).toBe(false);
      expect(result.error).toBeTruthy();
    });

    it("returns started: true and emits listening state when binary is available", async () => {
      mockIsWhisperBinaryAvailable.mockReturnValue(true);
      const result = await manager.start();
      expect(result.started).toBe(true);

      const stateMsg = webviewMessages.find(
        (m) => m.message === "swabble:stateChange",
      );
      expect(stateMsg).toBeDefined();
      expect((stateMsg?.payload as { state: string }).state).toBe("listening");
    });

    it("sets isListening to true after successful start", async () => {
      mockIsWhisperBinaryAvailable.mockReturnValue(true);
      await manager.start();
      const { listening } = await manager.isListening();
      expect(listening).toBe(true);
    });

    it("merges custom config on start", async () => {
      mockIsWhisperBinaryAvailable.mockReturnValue(true);
      await manager.start({ config: { triggers: ["computer"] } });
      const cfg = (await manager.getConfig()) as { triggers: string[] };
      expect(cfg.triggers).toContain("computer");
    });
  });

  // ── stop ──────────────────────────────────────────────────────────────────

  describe("stop", () => {
    it("sets isListening to false", async () => {
      mockIsWhisperBinaryAvailable.mockReturnValue(true);
      await manager.start();
      await manager.stop();
      const { listening } = await manager.isListening();
      expect(listening).toBe(false);
    });

    it("emits idle state on stop", async () => {
      mockIsWhisperBinaryAvailable.mockReturnValue(true);
      await manager.start();
      webviewMessages.length = 0;
      await manager.stop();

      const stateMsg = webviewMessages.find(
        (m) => m.message === "swabble:stateChange",
      );
      expect(stateMsg).toBeDefined();
      expect((stateMsg?.payload as { state: string }).state).toBe("idle");
    });
  });

  // ── audioChunk — fallback (no binary) ────────────────────────────────────

  describe("audioChunk fallback path", () => {
    it("pushes chunk back to renderer when binary is unavailable and listening", async () => {
      // Make start() succeed first, then swap mock to simulate binary disappearing
      mockIsWhisperBinaryAvailable.mockReturnValue(true);
      await manager.start();

      // Now runtime check returns false
      mockIsWhisperBinaryAvailable.mockReturnValue(false);

      const chunkB64 = makeBase64Chunk(128);
      await manager.audioChunk({ data: chunkB64 });

      const pushMsg = webviewMessages.find(
        (m) => m.message === "swabble:audioChunkPush",
      );
      expect(pushMsg).toBeDefined();
      expect((pushMsg?.payload as { data: string }).data).toBe(chunkB64);
    });

    it("does nothing when not listening", async () => {
      mockIsWhisperBinaryAvailable.mockReturnValue(false);
      const before = webviewMessages.length;
      await manager.audioChunk({ data: makeBase64Chunk(128) });
      expect(webviewMessages.length).toBe(before);
    });

    it("does nothing when config.enabled is false", async () => {
      mockIsWhisperBinaryAvailable.mockReturnValue(true);
      await manager.start();
      await manager.updateConfig({ enabled: false });

      const before = webviewMessages.length;
      await manager.audioChunk({ data: makeBase64Chunk(128) });
      expect(webviewMessages.length).toBe(before);
    });
  });

  // ── audioChunk — buffer accumulation ─────────────────────────────────────

  describe("audioChunk buffer accumulation", () => {
    beforeEach(() => {
      mockIsWhisperBinaryAvailable.mockReturnValue(true);
      mockTranscribeBunSpawn.mockResolvedValue(null);
    });

    it("does not call transcribeBunSpawn until 3 s of audio is buffered", async () => {
      await manager.start();

      const smallChunk = makeBase64Chunk(1024);
      await manager.audioChunk({ data: smallChunk });
      expect(mockTranscribeBunSpawn).not.toHaveBeenCalled();
    });

    it("calls transcribeBunSpawn when buffer reaches 3 s threshold", async () => {
      await manager.start();

      const bigChunk = makeBase64Chunk(CHUNK_BYTES);
      await manager.audioChunk({ data: bigChunk });

      expect(mockTranscribeBunSpawn).toHaveBeenCalledTimes(1);
    });

    it("writes a WAV file before transcribing", async () => {
      await manager.start();
      const bigChunk = makeBase64Chunk(CHUNK_BYTES);
      await manager.audioChunk({ data: bigChunk });

      expect(mockWriteWavFile).toHaveBeenCalledTimes(1);
      const [filePath] = mockWriteWavFile.mock.calls[0] as [string];
      expect(filePath).toMatch(/milady-swabble-\d+\.wav$/);
    });
  });

  // ── Wake word detection ───────────────────────────────────────────────────

  describe("wake word detection via processBuffer", () => {
    beforeEach(async () => {
      mockIsWhisperBinaryAvailable.mockReturnValue(true);
      await manager.start();
    });

    it("emits swabble:wakeWord when trigger + command detected with sufficient gap", async () => {
      // Tokens: "milady" (0–1 s), "what" (2–3 s) — gap 1 s > 0.45 s threshold
      mockTranscribeBunSpawn.mockResolvedValue({
        text: "milady what time is it",
        segments: [
          {
            text: "milady what time is it",
            start: 0,
            end: 3,
            tokens: [
              { text: "milady", start: 0, end: 1, probability: 1 },
              { text: "what", start: 2, end: 2.5, probability: 1 },
              { text: "time", start: 2.5, end: 2.8, probability: 1 },
              { text: "is", start: 2.8, end: 2.9, probability: 1 },
              { text: "it", start: 2.9, end: 3, probability: 1 },
            ],
          },
        ],
      });

      await manager.audioChunk({ data: makeBase64Chunk(CHUNK_BYTES) });

      const wakeMsg = webviewMessages.find(
        (m) => m.message === "swabble:wakeWord",
      );
      expect(wakeMsg).toBeDefined();
      const payload = wakeMsg?.payload as {
        wakeWord: string;
        command: string;
        transcript: string;
      };
      expect(payload.wakeWord).toBe("milady");
      expect(payload.command).toBe("what time is it");
      expect(payload.transcript).toBe("milady what time is it");
    });

    it("does not emit wakeWord when transcription returns null", async () => {
      mockTranscribeBunSpawn.mockResolvedValue(null);
      await manager.audioChunk({ data: makeBase64Chunk(CHUNK_BYTES) });

      expect(
        webviewMessages.find((m) => m.message === "swabble:wakeWord"),
      ).toBeUndefined();
    });

    it("does not emit wakeWord when no trigger in transcript", async () => {
      mockTranscribeBunSpawn.mockResolvedValue(
        makeWhisperResult("hello how are you doing today"),
      );
      await manager.audioChunk({ data: makeBase64Chunk(CHUNK_BYTES) });

      expect(
        webviewMessages.find((m) => m.message === "swabble:wakeWord"),
      ).toBeUndefined();
    });

    it("handles transcription errors gracefully without throwing", async () => {
      mockTranscribeBunSpawn.mockRejectedValue(new Error("whisper crashed"));
      await expect(
        manager.audioChunk({ data: makeBase64Chunk(CHUNK_BYTES) }),
      ).resolves.toBeUndefined();
    });
  });

  // ── updateConfig ──────────────────────────────────────────────────────────

  describe("updateConfig", () => {
    it("updates triggers", async () => {
      await manager.updateConfig({ triggers: ["computer", "hey computer"] });
      const cfg = (await manager.getConfig()) as { triggers: string[] };
      expect(cfg.triggers).toContain("computer");
    });

    it("updates enabled flag", async () => {
      await manager.updateConfig({ enabled: false });
      const cfg = (await manager.getConfig()) as { enabled: boolean };
      expect(cfg.enabled).toBe(false);
    });
  });

  // ── isWhisperAvailableCheck ───────────────────────────────────────────────

  describe("isWhisperAvailableCheck", () => {
    it("returns available: true when binary is present", async () => {
      mockIsWhisperBinaryAvailable.mockReturnValue(true);
      expect((await manager.isWhisperAvailableCheck()).available).toBe(true);
    });

    it("returns available: false when binary is missing", async () => {
      mockIsWhisperBinaryAvailable.mockReturnValue(false);
      expect((await manager.isWhisperAvailableCheck()).available).toBe(false);
    });
  });

  // ── dispose ───────────────────────────────────────────────────────────────

  describe("dispose", () => {
    it("sets listening to false", async () => {
      mockIsWhisperBinaryAvailable.mockReturnValue(true);
      await manager.start();
      manager.dispose();
      expect((await manager.isListening()).listening).toBe(false);
    });

    it("clears sendToWebview so further ops silently no-op", async () => {
      manager.dispose();
      await expect(
        manager.audioChunk({ data: makeBase64Chunk(128) }),
      ).resolves.toBeUndefined();
    });
  });
});
