/**
 * Unit tests for the Electrobun TalkMode native module.
 *
 * Covers:
 * - TalkModeManager initial state, start / stop / getState
 * - isSpeaking state tracking
 * - speak — fetch-based ElevenLabs TTS, audio chunk streaming, error cases
 * - stopSpeaking — clears speaking flag
 * - updateConfig / getWhisperInfo / isWhisperAvailableCheck
 * - audioChunk (STT stub)
 * - dispose cleanup
 * - getTalkModeManager singleton
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — vi.fn() must be inside the factory to avoid hoisting issues.
// ---------------------------------------------------------------------------

vi.mock("../whisper", () => ({
  isWhisperAvailable: vi.fn(() => false),
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

vi.stubGlobal("fetch", vi.fn());

// Mock the rpc-schema so TalkModeConfig / TalkModeState resolve without
// the full Electrobun type graph.
vi.mock("../rpc-schema", () => ({
  // No-op; types only — no runtime values consumed by talkmode.ts
}));

import { getTalkModeManager, TalkModeManager } from "../talkmode";
// ---------------------------------------------------------------------------
// Module under test (after mocks)
// ---------------------------------------------------------------------------
import * as whisperMod from "../whisper";

const mockIsWhisperAvailable = whisperMod.isWhisperAvailable as ReturnType<
  typeof vi.fn
>;
const mockTranscribeBunSpawn = whisperMod.transcribeBunSpawn as ReturnType<
  typeof vi.fn
>;
const mockWriteWavFile = whisperMod.writeWavFile as ReturnType<typeof vi.fn>;
const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeChunkStream(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
}

function makeOkResponse(chunks: Uint8Array[] = []) {
  return { ok: true, status: 200, body: makeChunkStream(chunks) };
}

function makeErrorResponse(status = 500) {
  return { ok: false, status, body: null, statusText: "Error" };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("TalkModeManager", () => {
  let manager: TalkModeManager;
  let webviewMessages: Array<{ message: string; payload: unknown }>;
  const TALKMODE_AUDIO_BUFFER_THRESHOLD = 16000 * 1.25 * 4;
  const TALKMODE_MIN_FLUSH_BYTES = 16000 * 0.2 * 4;

  beforeEach(() => {
    manager = new TalkModeManager();
    webviewMessages = [];
    manager.setSendToWebview((message, payload) => {
      webviewMessages.push({ message, payload });
    });
    mockFetch.mockReset();
    mockIsWhisperAvailable.mockReturnValue(false);
    mockTranscribeBunSpawn.mockReset();
    mockWriteWavFile.mockReset();
  });

  afterEach(() => {
    manager.dispose();
  });

  // ── Initial state ─────────────────────────────────────────────────────────

  describe("initial state", () => {
    it("state is idle", async () => {
      expect((await manager.getState()).state).toBe("idle");
    });

    it("is not speaking", async () => {
      expect((await manager.isSpeaking()).speaking).toBe(false);
    });

    it("isEnabled returns true", async () => {
      expect((await manager.isEnabled()).enabled).toBe(true);
    });
  });

  // ── start ─────────────────────────────────────────────────────────────────

  describe("start", () => {
    it("transitions state to listening", async () => {
      await manager.start();
      expect((await manager.getState()).state).toBe("listening");
    });

    it("returns available: true", async () => {
      const result = await manager.start();
      expect(result.available).toBe(true);
    });

    it("emits talkmodeStateChanged to webview", async () => {
      await manager.start();
      const msg = webviewMessages.find(
        (m) => m.message === "talkmodeStateChanged",
      );
      expect(msg).toBeDefined();
      expect((msg?.payload as { state: string }).state).toBe("listening");
    });

    it("includes fallback reason when whisper is unavailable", async () => {
      mockIsWhisperAvailable.mockReturnValue(false);
      const result = await manager.start();
      expect(result.reason).toBeTruthy();
    });

    it("does not include reason when whisper is available", async () => {
      mockIsWhisperAvailable.mockReturnValue(true);
      const result = await manager.start();
      expect(result.reason).toBeUndefined();
    });
  });

  // ── stop ──────────────────────────────────────────────────────────────────

  describe("stop", () => {
    it("transitions state back to idle", async () => {
      await manager.start();
      await manager.stop();
      expect((await manager.getState()).state).toBe("idle");
    });

    it("clears the speaking flag", async () => {
      await manager.start();
      await manager.stop();
      expect((await manager.isSpeaking()).speaking).toBe(false);
    });

    it("emits idle state to webview", async () => {
      await manager.start();
      webviewMessages.length = 0;
      await manager.stop();

      const msg = webviewMessages.find(
        (m) => m.message === "talkmodeStateChanged",
      );
      expect(msg).toBeDefined();
      expect((msg?.payload as { state: string }).state).toBe("idle");
    });
  });

  // ── speak ─────────────────────────────────────────────────────────────────

  describe("speak", () => {
    const KEY = "test-api-key";

    beforeEach(async () => {
      await manager.start();
    });

    afterEach(() => {
      delete process.env.ELEVEN_LABS_API_KEY;
    });

    it("returns early without calling fetch when ELEVEN_LABS_API_KEY is not set", async () => {
      delete process.env.ELEVEN_LABS_API_KEY;
      await manager.speak({ text: "Hello" });
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("calls ElevenLabs API with correct xi-api-key header", async () => {
      process.env.ELEVEN_LABS_API_KEY = KEY;
      mockFetch.mockResolvedValue(makeOkResponse());

      await manager.speak({ text: "Hello" });

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toContain("elevenlabs.io");
      expect((init.headers as Record<string, string>)["xi-api-key"]).toBe(KEY);
    });

    it("uses voiceId from directive when provided", async () => {
      process.env.ELEVEN_LABS_API_KEY = KEY;
      mockFetch.mockResolvedValue(makeOkResponse());

      await manager.speak({ text: "Hi", directive: { voiceId: "my-voice" } });

      const [url] = mockFetch.mock.calls[0] as [string];
      expect(url).toContain("my-voice");
    });

    it("streams audio chunks to webview as base64", async () => {
      process.env.ELEVEN_LABS_API_KEY = KEY;
      const chunk = new Uint8Array([1, 2, 3, 4]);
      mockFetch.mockResolvedValue(makeOkResponse([chunk]));

      await manager.speak({ text: "Stream" });

      const chunkMessages = webviewMessages.filter(
        (m) => m.message === "talkmodeAudioChunkPush",
      );
      expect(chunkMessages.length).toBeGreaterThanOrEqual(1);
      expect(typeof (chunkMessages[0].payload as { data: string }).data).toBe(
        "string",
      );
    });

    it("emits talkmodeSpeakComplete after streaming", async () => {
      process.env.ELEVEN_LABS_API_KEY = KEY;
      mockFetch.mockResolvedValue(makeOkResponse([new Uint8Array([0])]));

      await manager.speak({ text: "Done" });

      expect(
        webviewMessages.find((m) => m.message === "talkmodeSpeakComplete"),
      ).toBeDefined();
    });

    it("transitions to speaking state during speak()", async () => {
      process.env.ELEVEN_LABS_API_KEY = KEY;
      let stateWhileSpeaking: string | undefined;

      mockFetch.mockImplementation(async () => {
        stateWhileSpeaking = (await manager.getState()).state;
        return makeOkResponse();
      });

      await manager.speak({ text: "State check" });
      expect(stateWhileSpeaking).toBe("speaking");
    });

    it("returns to idle after successful speak()", async () => {
      process.env.ELEVEN_LABS_API_KEY = KEY;
      mockFetch.mockResolvedValue(makeOkResponse());

      await manager.speak({ text: "After" });
      expect((await manager.getState()).state).toBe("idle");
    });

    it("transitions to error state on non-ok API response", async () => {
      process.env.ELEVEN_LABS_API_KEY = KEY;
      mockFetch.mockResolvedValue(makeErrorResponse(500));

      await manager.speak({ text: "Error" });
      expect((await manager.getState()).state).toBe("error");
    });

    it("transitions to error state when fetch throws", async () => {
      process.env.ELEVEN_LABS_API_KEY = KEY;
      mockFetch.mockRejectedValue(new Error("Network failure"));

      await manager.speak({ text: "Error" });
      expect((await manager.getState()).state).toBe("error");
    });

    it("clears speaking flag after completion", async () => {
      process.env.ELEVEN_LABS_API_KEY = KEY;
      mockFetch.mockResolvedValue(makeOkResponse());

      await manager.speak({ text: "Done" });
      expect((await manager.isSpeaking()).speaking).toBe(false);
    });
  });

  // ── stopSpeaking ──────────────────────────────────────────────────────────

  describe("stopSpeaking", () => {
    it("clears speaking flag and sets state to idle", async () => {
      await manager.stopSpeaking();
      expect((await manager.isSpeaking()).speaking).toBe(false);
      expect((await manager.getState()).state).toBe("idle");
    });

    it("is safe to call multiple times", async () => {
      await manager.stopSpeaking();
      await expect(manager.stopSpeaking()).resolves.toBeUndefined();
    });
  });

  // ── updateConfig / getWhisperInfo ─────────────────────────────────────────

  describe("updateConfig", () => {
    it("merges voiceId without error", async () => {
      await expect(
        manager.updateConfig({ voiceId: "new-voice" }),
      ).resolves.toBeUndefined();
    });

    it("updates modelSize visible in getWhisperInfo", async () => {
      await manager.updateConfig({ modelSize: "small" });
      const info = await manager.getWhisperInfo();
      expect(info.modelSize).toBe("small");
    });
  });

  describe("getWhisperInfo", () => {
    it("available: false when whisper is not available", async () => {
      mockIsWhisperAvailable.mockReturnValue(false);
      const m = new TalkModeManager();
      expect((await m.getWhisperInfo()).available).toBe(false);
      m.dispose();
    });

    it("available: true when whisper is available", async () => {
      mockIsWhisperAvailable.mockReturnValue(true);
      const m = new TalkModeManager();
      expect((await m.getWhisperInfo()).available).toBe(true);
      m.dispose();
    });

    it("includes modelSize field", async () => {
      expect(await manager.getWhisperInfo()).toHaveProperty("modelSize");
    });
  });

  // ── isWhisperAvailableCheck ───────────────────────────────────────────────

  describe("isWhisperAvailableCheck", () => {
    it("returns available: false when whisper unavailable", async () => {
      mockIsWhisperAvailable.mockReturnValue(false);
      expect((await manager.isWhisperAvailableCheck()).available).toBe(false);
    });

    it("returns available: true when whisper available", async () => {
      mockIsWhisperAvailable.mockReturnValue(true);
      expect((await manager.isWhisperAvailableCheck()).available).toBe(true);
    });
  });

  // ── audioChunk (STT stub) ─────────────────────────────────────────────────

  describe("audioChunk", () => {
    it("resolves without error", async () => {
      await expect(
        manager.audioChunk({ data: "dGVzdA==" }),
      ).resolves.toBeUndefined();
    });

    it("emits talkmode:transcript when whisper transcription succeeds", async () => {
      mockIsWhisperAvailable.mockReturnValue(true);
      mockTranscribeBunSpawn.mockResolvedValue({
        text: "hello world",
        segments: [{ text: "hello world", start: 0, end: 1 }],
      });
      await manager.start();

      await expect(
        manager.audioChunk({
          data: Buffer.alloc(TALKMODE_AUDIO_BUFFER_THRESHOLD).toString(
            "base64",
          ),
        }),
      ).resolves.toBeUndefined();

      expect(mockWriteWavFile).toHaveBeenCalledTimes(1);
      expect(webviewMessages).toContainEqual({
        message: "talkmode:transcript",
        payload: {
          text: "hello world",
          segments: [{ text: "hello world", start: 0, end: 1 }],
          isFinal: false,
        },
      });
    });

    it("emits talkmode:error when whisper transcription fails", async () => {
      mockIsWhisperAvailable.mockReturnValue(true);
      mockTranscribeBunSpawn.mockRejectedValue(new Error("whisper crashed"));
      await manager.start();

      await expect(
        manager.audioChunk({
          data: Buffer.alloc(TALKMODE_AUDIO_BUFFER_THRESHOLD).toString(
            "base64",
          ),
        }),
      ).resolves.toBeUndefined();

      expect(webviewMessages).toContainEqual({
        message: "talkmode:error",
        payload: {
          code: "transcription_failed",
          message: "whisper crashed",
          recoverable: true,
        },
      });
    });

    it("flushes a short final transcript when stop() is called", async () => {
      mockIsWhisperAvailable.mockReturnValue(true);
      mockTranscribeBunSpawn.mockResolvedValue({
        text: "final short phrase",
        segments: [{ text: "final short phrase", start: 0, end: 0.6 }],
      });
      await manager.start();

      await manager.audioChunk({
        data: Buffer.alloc(TALKMODE_MIN_FLUSH_BYTES).toString("base64"),
      });
      await manager.stop();

      expect(webviewMessages).toContainEqual({
        message: "talkmode:transcript",
        payload: {
          text: "final short phrase",
          segments: [{ text: "final short phrase", start: 0, end: 0.6 }],
          isFinal: true,
        },
      });
    });
  });

  // ── dispose ───────────────────────────────────────────────────────────────

  describe("dispose", () => {
    it("resets state to idle", async () => {
      manager.dispose();
      await expect(manager.getState()).resolves.toMatchObject({
        state: "idle",
      });
    });

    it("is safe to call multiple times", () => {
      manager.dispose();
      expect(() => manager.dispose()).not.toThrow();
    });
  });
});

// ── getTalkModeManager singleton ────────────────────────────────────────────

describe("getTalkModeManager", () => {
  it("returns the same instance on repeated calls", () => {
    const m1 = getTalkModeManager();
    const m2 = getTalkModeManager();
    expect(m1).toBe(m2);
  });
});
