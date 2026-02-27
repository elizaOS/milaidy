/**
 * Tests for stream-voice-routes.ts
 *
 * Focused tests for the voice route guards that require mocking
 * the TTS bridge singleton (isSpeaking, isAttached).
 */

import { describe, expect, it, vi } from "vitest";
import {
  createMockHttpResponse,
  createMockIncomingMessage,
} from "../test-support/test-helpers";

// Mock the TTS bridge so we can control isSpeaking/isAttached
vi.mock("../services/tts-stream-bridge", () => ({
  ttsStreamBridge: {
    isSpeaking: vi.fn(() => false),
    isAttached: vi.fn(() => false),
    speak: vi.fn(async () => true),
  },
  resolveTtsConfig: vi.fn(() => ({
    provider: "elevenlabs",
    apiKey: "test-key",
    voiceId: "test-voice",
  })),
  getTtsProviderStatus: vi.fn(() => ({
    resolvedProvider: "elevenlabs",
    configuredProvider: "elevenlabs",
    hasApiKey: true,
  })),
}));

vi.mock("@elizaos/core", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { ttsStreamBridge } from "../services/tts-stream-bridge";
import type { StreamRouteState } from "./stream-routes";
import { handleStreamVoiceRoute } from "./stream-voice-routes";

function mockState(
  overrides: Partial<StreamRouteState> = {},
): StreamRouteState {
  return {
    streamManager: {
      isRunning: vi.fn(() => false),
      writeFrame: vi.fn(() => true),
      start: vi.fn(async () => {}),
      stop: vi.fn(async () => ({ uptime: 0 })),
      getHealth: vi.fn(() => ({
        running: true,
        ffmpegAlive: true,
        uptime: 300,
        frameCount: 1000,
        volume: 80,
        muted: false,
        audioSource: "silent",
        inputMode: "pipe",
      })),
      getVolume: vi.fn(() => 80),
      isMuted: vi.fn(() => false),
      setVolume: vi.fn(async () => {}),
      mute: vi.fn(async () => {}),
      unmute: vi.fn(async () => {}),
    },
    port: 2138,
    config: {
      messages: {
        tts: {
          provider: "elevenlabs",
          elevenlabs: { apiKey: "test-key" },
        },
      },
    },
    ...overrides,
  };
}

describe("handleStreamVoiceRoute — speak guards", () => {
  it("returns 429 when bridge is already speaking", async () => {
    // Mock bridge as attached AND speaking
    (ttsStreamBridge.isAttached as ReturnType<typeof vi.fn>).mockReturnValue(
      true,
    );
    (ttsStreamBridge.isSpeaking as ReturnType<typeof vi.fn>).mockReturnValue(
      true,
    );

    const { res, getStatus, getJson } = createMockHttpResponse();
    const req = createMockIncomingMessage({
      method: "POST",
      url: "/api/stream/voice/speak",
      body: { text: "Hello" },
      json: true,
    });
    const state = mockState();

    const handled = await handleStreamVoiceRoute(
      req,
      res,
      "/api/stream/voice/speak",
      "POST",
      state,
    );

    expect(handled).toBe(true);
    expect(getStatus()).toBe(429);
    expect(getJson()).toEqual(
      expect.objectContaining({
        error: expect.stringContaining("Already speaking"),
      }),
    );

    // Reset
    (ttsStreamBridge.isAttached as ReturnType<typeof vi.fn>).mockReturnValue(
      false,
    );
    (ttsStreamBridge.isSpeaking as ReturnType<typeof vi.fn>).mockReturnValue(
      false,
    );
  });

  it("calls speak when bridge is attached and not speaking", async () => {
    (ttsStreamBridge.isAttached as ReturnType<typeof vi.fn>).mockReturnValue(
      true,
    );
    (ttsStreamBridge.isSpeaking as ReturnType<typeof vi.fn>).mockReturnValue(
      false,
    );

    const { res, getStatus, getJson } = createMockHttpResponse();
    const req = createMockIncomingMessage({
      method: "POST",
      url: "/api/stream/voice/speak",
      body: { text: "Hello world" },
      json: true,
    });
    const state = mockState();

    const handled = await handleStreamVoiceRoute(
      req,
      res,
      "/api/stream/voice/speak",
      "POST",
      state,
    );

    expect(handled).toBe(true);
    expect(getStatus()).toBe(200);
    expect(getJson()).toEqual(
      expect.objectContaining({ ok: true, speaking: true }),
    );
    expect(ttsStreamBridge.speak).toHaveBeenCalledWith(
      "Hello world",
      expect.any(Object),
    );

    // Reset
    (ttsStreamBridge.isAttached as ReturnType<typeof vi.fn>).mockReturnValue(
      false,
    );
  });

  it("returns 400 for text exceeding 2000 characters", async () => {
    const { res, getStatus, getJson } = createMockHttpResponse();
    const req = createMockIncomingMessage({
      method: "POST",
      url: "/api/stream/voice/speak",
      body: { text: "a".repeat(2001) },
      json: true,
    });
    const state = mockState();

    await handleStreamVoiceRoute(
      req,
      res,
      "/api/stream/voice/speak",
      "POST",
      state,
    );

    expect(getStatus()).toBe(400);
    expect(getJson()).toEqual(
      expect.objectContaining({
        error: expect.stringContaining("maximum length"),
      }),
    );
  });

  it("returns false for unmatched voice routes", async () => {
    const { res } = createMockHttpResponse();
    const req = createMockIncomingMessage({
      method: "GET",
      url: "/api/stream/something-else",
    });
    const state = mockState();

    const handled = await handleStreamVoiceRoute(
      req,
      res,
      "/api/stream/something-else",
      "GET",
      state,
    );

    expect(handled).toBe(false);
  });
});
