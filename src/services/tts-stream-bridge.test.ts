/**
 * Tests for services/tts-stream-bridge.ts
 *
 * Covers:
 *   - resolveTtsConfig()       — provider selection + API key fallback chain
 *   - getTtsProviderStatus()   — status summary for frontend display
 *   - TtsStreamBridge class    — attach/detach/isSpeaking/speak lifecycle
 *   - decodeMp3ToPcm()         — FFmpeg subprocess decode (mocked)
 *   - Provider generation      — ElevenLabs/OpenAI/Edge (mocked fetch)
 *
 * External dependencies (fetch, child_process, node-edge-tts) are mocked.
 */

import { EventEmitter } from "node:events";
import { Writable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock child_process (used by decodeMp3ToPcm and Edge TTS)
vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
}));

// Suppress logger noise
vi.mock("@elizaos/core", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { spawn } from "node:child_process";
import type { TtsConfig } from "../config/types.messages";
import {
  getTtsProviderStatus,
  type ResolvedTtsConfig,
  resolveTtsConfig,
  ttsStreamBridge,
} from "./tts-stream-bridge";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a mock Writable stream that captures written data. */
function createMockWritable(): Writable & { chunks: Buffer[] } {
  const chunks: Buffer[] = [];
  const writable = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      callback();
    },
  });
  (writable as Writable & { chunks: Buffer[] }).chunks = chunks;
  return writable as Writable & { chunks: Buffer[] };
}

/** Save and restore env vars. */
function withEnv(
  vars: Record<string, string | undefined>,
  fn: () => void,
): void {
  const saved: Record<string, string | undefined> = {};
  for (const key of Object.keys(vars)) {
    saved[key] = process.env[key];
    if (vars[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = vars[key];
    }
  }
  try {
    fn();
  } finally {
    for (const key of Object.keys(saved)) {
      if (saved[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = saved[key];
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Reset between tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  (spawn as unknown as ReturnType<typeof vi.fn>).mockReset();
  vi.restoreAllMocks();
});

afterEach(() => {
  ttsStreamBridge.detach();
});

// ===========================================================================
// 1. resolveTtsConfig() — provider selection and API key fallback chain
// ===========================================================================

describe("resolveTtsConfig()", () => {
  it("returns null when ttsConfig is undefined", () => {
    expect(resolveTtsConfig(undefined)).toBeNull();
  });

  it("selects ElevenLabs when configured with API key", () => {
    const config: TtsConfig = {
      provider: "elevenlabs",
      elevenlabs: { apiKey: "el-key-123", voiceId: "voice1" },
    };
    const result = resolveTtsConfig(config);

    expect(result).not.toBeNull();
    expect(result?.provider).toBe("elevenlabs");
    expect(result?.elevenlabs?.apiKey).toBe("el-key-123");
    expect(result?.elevenlabs?.voiceId).toBe("voice1");
  });

  it("selects OpenAI when configured with API key", () => {
    const config: TtsConfig = {
      provider: "openai",
      openai: { apiKey: "oai-key", model: "tts-1-hd", voice: "nova" },
    };
    const result = resolveTtsConfig(config);

    expect(result).not.toBeNull();
    expect(result?.provider).toBe("openai");
    expect(result?.openai?.apiKey).toBe("oai-key");
    expect(result?.openai?.model).toBe("tts-1-hd");
    expect(result?.openai?.voice).toBe("nova");
  });

  it("selects Edge TTS (no API key required)", () => {
    const config: TtsConfig = {
      provider: "edge",
      edge: { voice: "en-GB-SoniaNeural" },
    };
    const result = resolveTtsConfig(config);

    expect(result).not.toBeNull();
    expect(result?.provider).toBe("edge");
    expect(result?.edge?.voice).toBe("en-GB-SoniaNeural");
  });

  it("falls back to ElevenLabs env var when config key is empty", () => {
    withEnv({ ELEVENLABS_API_KEY: "env-el-key" }, () => {
      const config: TtsConfig = {
        provider: "elevenlabs",
        elevenlabs: { apiKey: "" },
      };
      const result = resolveTtsConfig(config);

      expect(result?.provider).toBe("elevenlabs");
      expect(result?.elevenlabs?.apiKey).toBe("env-el-key");
    });
  });

  it("falls back to OpenAI env var when config key is missing", () => {
    withEnv(
      { ELEVENLABS_API_KEY: undefined, OPENAI_API_KEY: "env-oai" },
      () => {
        const config: TtsConfig = {
          provider: "elevenlabs",
          // No elevenlabs key — will fall through to openai
        };
        const result = resolveTtsConfig(config);

        expect(result?.provider).toBe("openai");
        expect(result?.openai?.apiKey).toBe("env-oai");
      },
    );
  });

  it("falls back to Edge when no API keys are available", () => {
    withEnv(
      { ELEVENLABS_API_KEY: undefined, OPENAI_API_KEY: undefined },
      () => {
        const config: TtsConfig = {
          provider: "elevenlabs",
          // No keys configured anywhere
        };
        const result = resolveTtsConfig(config);

        expect(result?.provider).toBe("edge");
      },
    );
  });

  it("skips redacted secret values (****)", () => {
    withEnv({ ELEVENLABS_API_KEY: undefined }, () => {
      const config: TtsConfig = {
        provider: "elevenlabs",
        elevenlabs: { apiKey: "****" },
      };
      const result = resolveTtsConfig(config);

      // Should skip ElevenLabs, fall through to edge (no other keys)
      expect(result?.provider).not.toBe("elevenlabs");
    });
  });

  it("skips REDACTED string values", () => {
    withEnv({ ELEVENLABS_API_KEY: "REDACTED" }, () => {
      const config: TtsConfig = {
        provider: "elevenlabs",
      };
      const result = resolveTtsConfig(config);

      expect(result?.provider).not.toBe("elevenlabs");
    });
  });

  it("uses default voice ID when elevenlabs.voiceId is not set", () => {
    const config: TtsConfig = {
      provider: "elevenlabs",
      elevenlabs: { apiKey: "key" },
    };
    const result = resolveTtsConfig(config);

    expect(result?.elevenlabs?.voiceId).toBe("EXAVITQu4vr4xnSDxMaL");
  });

  it("uses default model when elevenlabs.modelId is not set", () => {
    const config: TtsConfig = {
      provider: "elevenlabs",
      elevenlabs: { apiKey: "key" },
    };
    const result = resolveTtsConfig(config);

    expect(result?.elevenlabs?.modelId).toBe("eleven_flash_v2_5");
  });

  it("uses default OpenAI model and voice when not set", () => {
    const config: TtsConfig = {
      provider: "openai",
      openai: { apiKey: "key" },
    };
    const result = resolveTtsConfig(config);

    expect(result?.openai?.model).toBe("tts-1");
    expect(result?.openai?.voice).toBe("alloy");
  });

  it("uses default Edge voice when not set", () => {
    const config: TtsConfig = { provider: "edge" };
    const result = resolveTtsConfig(config);

    expect(result?.edge?.voice).toBe("en-US-AriaNeural");
  });

  it("preserves voiceSettings from ElevenLabs config", () => {
    const config: TtsConfig = {
      provider: "elevenlabs",
      elevenlabs: {
        apiKey: "key",
        voiceSettings: { stability: 0.5, similarityBoost: 0.8 },
      },
    };
    const result = resolveTtsConfig(config);

    expect(result?.elevenlabs?.voiceSettings).toEqual({
      stability: 0.5,
      similarityBoost: 0.8,
    });
  });
});

// ===========================================================================
// 2. getTtsProviderStatus() — summary for frontend
// ===========================================================================

describe("getTtsProviderStatus()", () => {
  it("returns null fields when ttsConfig is undefined", () => {
    const status = getTtsProviderStatus(undefined);

    expect(status.configuredProvider).toBeNull();
    expect(status.resolvedProvider).toBeNull();
    expect(status.hasApiKey).toBe(false);
  });

  it("reports configured provider and resolved provider", () => {
    const config: TtsConfig = {
      provider: "elevenlabs",
      elevenlabs: { apiKey: "key" },
    };
    const status = getTtsProviderStatus(config);

    expect(status.configuredProvider).toBe("elevenlabs");
    expect(status.resolvedProvider).toBe("elevenlabs");
    expect(status.hasApiKey).toBe(true);
  });

  it("reports hasApiKey=false for Edge provider", () => {
    const config: TtsConfig = { provider: "edge" };
    const status = getTtsProviderStatus(config);

    expect(status.resolvedProvider).toBe("edge");
    expect(status.hasApiKey).toBe(false);
  });

  it("reports hasApiKey=true for OpenAI provider", () => {
    const config: TtsConfig = {
      provider: "openai",
      openai: { apiKey: "oai-key" },
    };
    const status = getTtsProviderStatus(config);

    expect(status.resolvedProvider).toBe("openai");
    expect(status.hasApiKey).toBe(true);
  });
});

// ===========================================================================
// 3. TtsStreamBridge — lifecycle (attach / detach / isSpeaking)
// ===========================================================================

describe("TtsStreamBridge lifecycle", () => {
  it("isAttached() returns false before attach()", () => {
    expect(ttsStreamBridge.isAttached()).toBe(false);
  });

  it("isAttached() returns true after attach()", () => {
    const writable = createMockWritable();
    ttsStreamBridge.attach(writable);

    expect(ttsStreamBridge.isAttached()).toBe(true);
  });

  it("isAttached() returns false after detach()", () => {
    const writable = createMockWritable();
    ttsStreamBridge.attach(writable);
    ttsStreamBridge.detach();

    expect(ttsStreamBridge.isAttached()).toBe(false);
  });

  it("isSpeaking() returns false when idle", () => {
    expect(ttsStreamBridge.isSpeaking()).toBe(false);
  });

  it("detach() clears speaking state", () => {
    const writable = createMockWritable();
    ttsStreamBridge.attach(writable);
    // Manually set speaking state would require queueing PCM — just verify detach clears
    ttsStreamBridge.detach();

    expect(ttsStreamBridge.isSpeaking()).toBe(false);
  });

  it("attach() replaces a previous stream (detaches old first)", () => {
    const writable1 = createMockWritable();
    const writable2 = createMockWritable();

    ttsStreamBridge.attach(writable1);
    ttsStreamBridge.attach(writable2);

    expect(ttsStreamBridge.isAttached()).toBe(true);
  });

  it("writes silence chunks to the attached stream during tick", async () => {
    const writable = createMockWritable();
    ttsStreamBridge.attach(writable);

    // Wait for a few ticks (50ms each)
    await new Promise((r) => setTimeout(r, 120));

    // Should have received silence chunks (all zeros)
    expect(writable.chunks.length).toBeGreaterThan(0);
    const firstChunk = writable.chunks[0];
    expect(firstChunk.length).toBe(2400); // CHUNK_BYTES = 24000 * 2 * 1 * 50/1000
    expect(firstChunk.every((b) => b === 0)).toBe(true);
  });
});

// ===========================================================================
// 4. TtsStreamBridge.speak() — generation and queueing
// ===========================================================================

describe("TtsStreamBridge.speak()", () => {
  it("returns false when not attached", async () => {
    const config: ResolvedTtsConfig = {
      provider: "elevenlabs",
      elevenlabs: { apiKey: "key", voiceId: "v", modelId: "m" },
    };

    const result = await ttsStreamBridge.speak("hello", config);

    expect(result).toBe(false);
  });

  it("returns false for empty text", async () => {
    const writable = createMockWritable();
    ttsStreamBridge.attach(writable);

    const config: ResolvedTtsConfig = {
      provider: "elevenlabs",
      elevenlabs: { apiKey: "key", voiceId: "v", modelId: "m" },
    };

    const result = await ttsStreamBridge.speak("  ", config);

    expect(result).toBe(false);
  });

  it("generates ElevenLabs TTS and queues PCM audio", async () => {
    const writable = createMockWritable();
    ttsStreamBridge.attach(writable);

    // Mock fetch for ElevenLabs
    const fakeMp3 = Buffer.alloc(100, 0xff);
    const fakePcm = Buffer.alloc(4800, 0x42); // 2 chunks worth

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () => Promise.resolve(fakeMp3.buffer),
      }),
    );

    // Mock FFmpeg decode subprocess
    const mockStdout = new EventEmitter();
    const mockStdin = { write: vi.fn(), end: vi.fn() };
    const mockProc = Object.assign(new EventEmitter(), {
      stdout: mockStdout,
      stdin: mockStdin,
    });
    (spawn as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      mockProc,
    );

    const speakPromise = ttsStreamBridge.speak("Hello world", {
      provider: "elevenlabs",
      elevenlabs: { apiKey: "test-key", voiceId: "v1", modelId: "m1" },
    });

    // Simulate FFmpeg decode completing
    await new Promise((r) => setTimeout(r, 10));
    mockStdout.emit("data", fakePcm);
    mockProc.emit("close", 0);

    const result = await speakPromise;

    expect(result).toBe(true);
    expect(ttsStreamBridge.isSpeaking()).toBe(true);

    // Verify fetch was called with correct ElevenLabs URL
    const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(fetchCall[0]).toContain("api.elevenlabs.io/v1/text-to-speech/v1");
    expect(fetchCall[1].headers["xi-api-key"]).toBe("test-key");

    vi.unstubAllGlobals();
  });

  it("generates OpenAI TTS and queues PCM audio", async () => {
    const writable = createMockWritable();
    ttsStreamBridge.attach(writable);

    const fakeMp3 = Buffer.alloc(100, 0xff);
    const fakePcm = Buffer.alloc(2400, 0x42);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () => Promise.resolve(fakeMp3.buffer),
      }),
    );

    const mockStdout = new EventEmitter();
    const mockStdin = { write: vi.fn(), end: vi.fn() };
    const mockProc = Object.assign(new EventEmitter(), {
      stdout: mockStdout,
      stdin: mockStdin,
    });
    (spawn as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      mockProc,
    );

    const speakPromise = ttsStreamBridge.speak("Hello", {
      provider: "openai",
      openai: { apiKey: "oai-key", model: "tts-1", voice: "alloy" },
    });

    await new Promise((r) => setTimeout(r, 10));
    mockStdout.emit("data", fakePcm);
    mockProc.emit("close", 0);

    const result = await speakPromise;

    expect(result).toBe(true);

    // Verify fetch was called with correct OpenAI URL
    const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(fetchCall[0]).toBe("https://api.openai.com/v1/audio/speech");
    expect(fetchCall[1].headers.Authorization).toBe("Bearer oai-key");

    vi.unstubAllGlobals();
  });

  it("returns false when TTS API returns non-ok response", async () => {
    const writable = createMockWritable();
    ttsStreamBridge.attach(writable);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: () => Promise.resolve("Unauthorized"),
      }),
    );

    const result = await ttsStreamBridge.speak("Hello", {
      provider: "elevenlabs",
      elevenlabs: { apiKey: "bad-key", voiceId: "v1", modelId: "m1" },
    });

    expect(result).toBe(false);

    vi.unstubAllGlobals();
  });

  it("returns false when FFmpeg decode fails", async () => {
    const writable = createMockWritable();
    ttsStreamBridge.attach(writable);

    const fakeMp3 = Buffer.alloc(100, 0xff);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () => Promise.resolve(fakeMp3.buffer),
      }),
    );

    const mockStdout = new EventEmitter();
    const mockStdin = { write: vi.fn(), end: vi.fn() };
    const mockProc = Object.assign(new EventEmitter(), {
      stdout: mockStdout,
      stdin: mockStdin,
    });
    (spawn as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      mockProc,
    );

    const speakPromise = ttsStreamBridge.speak("Hello", {
      provider: "elevenlabs",
      elevenlabs: { apiKey: "key", voiceId: "v1", modelId: "m1" },
    });

    await new Promise((r) => setTimeout(r, 10));
    mockProc.emit("close", 1); // Non-zero exit = decode failure

    const result = await speakPromise;
    expect(result).toBe(false);

    vi.unstubAllGlobals();
  });

  it("returns false when fetch throws a network error", async () => {
    const writable = createMockWritable();
    ttsStreamBridge.attach(writable);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValueOnce(new Error("Network unreachable")),
    );

    const result = await ttsStreamBridge.speak("Hello", {
      provider: "elevenlabs",
      elevenlabs: { apiKey: "key", voiceId: "v1", modelId: "m1" },
    });

    expect(result).toBe(false);

    vi.unstubAllGlobals();
  });

  it("returns false for unknown provider", async () => {
    const writable = createMockWritable();
    ttsStreamBridge.attach(writable);

    const result = await ttsStreamBridge.speak("Hello", {
      provider: "unknown" as "elevenlabs",
    });

    expect(result).toBe(false);
  });
});

// ===========================================================================
// 5. decodeMp3ToPcm — FFmpeg subprocess args
// ===========================================================================

describe("decodeMp3ToPcm via speak()", () => {
  it("spawns FFmpeg with correct decode args (s16le, 24kHz, mono)", async () => {
    const writable = createMockWritable();
    ttsStreamBridge.attach(writable);

    const fakeMp3 = Buffer.alloc(50, 0xaa);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () => Promise.resolve(fakeMp3.buffer),
      }),
    );

    const mockStdout = new EventEmitter();
    const mockStdin = { write: vi.fn(), end: vi.fn() };
    const mockProc = Object.assign(new EventEmitter(), {
      stdout: mockStdout,
      stdin: mockStdin,
    });
    (spawn as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      mockProc,
    );

    const speakPromise = ttsStreamBridge.speak("Test", {
      provider: "elevenlabs",
      elevenlabs: { apiKey: "key", voiceId: "v", modelId: "m" },
    });

    await new Promise((r) => setTimeout(r, 10));
    mockStdout.emit("data", Buffer.alloc(2400));
    mockProc.emit("close", 0);
    await speakPromise;

    // Verify FFmpeg was spawned with correct decode args
    const spawnCalls = (spawn as unknown as ReturnType<typeof vi.fn>).mock
      .calls;
    expect(spawnCalls.length).toBe(1);
    const [cmd, args] = spawnCalls[0];
    expect(cmd).toBe("ffmpeg");
    expect(args).toContain("-f");
    expect(args).toContain("s16le");
    expect(args).toContain("-ar");
    expect(args).toContain("24000");
    expect(args).toContain("-ac");
    expect(args).toContain("1");
    expect(args).toContain("pipe:0");
    expect(args).toContain("pipe:1");

    vi.unstubAllGlobals();
  });
});
