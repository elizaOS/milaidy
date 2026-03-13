// @vitest-environment jsdom

import type { ElectrobunRendererRpc } from "@milady/app-core/bridge";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SwabbleWeb } from "../../plugins/swabble/src/web.ts";

type TestWindow = Window & {
  __MILADY_ELECTROBUN_RPC__?: ElectrobunRendererRpc;
};

interface ProcessorStub {
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  onaudioprocess: ((event: AudioProcessingEvent) => void) | null;
}

let originalAudioContext: typeof globalThis.AudioContext | undefined;
let processorStub: ProcessorStub;

function installAudioStubs(): void {
  const mockStream = {
    getTracks: () => [{ stop: vi.fn() }],
  } as unknown as MediaStream;

  if (!navigator.mediaDevices) {
    Object.defineProperty(navigator, "mediaDevices", {
      value: {},
      writable: true,
      configurable: true,
    });
  }

  Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
    value: vi.fn().mockResolvedValue(mockStream),
    writable: true,
    configurable: true,
  });
  Object.defineProperty(navigator.mediaDevices, "enumerateDevices", {
    value: vi.fn().mockResolvedValue([]),
    writable: true,
    configurable: true,
  });
  Object.defineProperty(navigator, "permissions", {
    value: {
      query: vi.fn().mockResolvedValue({ state: "granted" }),
    },
    writable: true,
    configurable: true,
  });

  processorStub = {
    connect: vi.fn(),
    disconnect: vi.fn(),
    onaudioprocess: null,
  };

  originalAudioContext = globalThis.AudioContext;

  class MockAudioContext {
    sampleRate = 48000;
    destination = {};
    createMediaStreamSource = vi.fn(() => ({
      connect: vi.fn(),
    }));
    createScriptProcessor = vi.fn(() => processorStub);
    createGain = vi.fn(() => ({
      gain: { value: 0 },
      connect: vi.fn(),
      disconnect: vi.fn(),
    }));
    createAnalyser = vi.fn(() => ({
      fftSize: 256,
      frequencyBinCount: 8,
      connect: vi.fn(),
      getByteFrequencyData: vi.fn((array: Uint8Array) => {
        array.fill(0);
      }),
    }));
    close = vi.fn(async () => {});
  }

  Object.defineProperty(globalThis, "AudioContext", {
    value: MockAudioContext,
    writable: true,
    configurable: true,
  });
}

describe("SwabbleWeb desktop bridge", () => {
  beforeEach(() => {
    installAudioStubs();
  });

  afterEach(() => {
    delete (window as TestWindow).__MILADY_ELECTROBUN_RPC__;
    vi.restoreAllMocks();

    if (originalAudioContext) {
      Object.defineProperty(globalThis, "AudioContext", {
        value: originalAudioContext,
        writable: true,
        configurable: true,
      });
    }
  });

  it("prefers direct Electrobun RPC for the live SwabbleWeb desktop path", async () => {
    const directListeners = new Map<string, Set<(payload: unknown) => void>>();
    const swabbleStart = vi.fn().mockResolvedValue({ started: true });
    const swabbleStop = vi.fn().mockResolvedValue(undefined);
    const swabbleUpdateConfig = vi.fn().mockResolvedValue(undefined);
    const swabbleIsWhisperAvailable = vi
      .fn()
      .mockResolvedValue({ available: true });
    const swabbleAudioChunk = vi.fn().mockResolvedValue(undefined);
    (window as TestWindow).__MILADY_ELECTROBUN_RPC__ = {
      request: {
        swabbleStart,
        swabbleStop,
        swabbleUpdateConfig,
        swabbleIsWhisperAvailable,
        swabbleAudioChunk,
      },
      onMessage: vi.fn(
        (messageName: string, listener: (payload: unknown) => void) => {
          const entry = directListeners.get(messageName) ?? new Set();
          entry.add(listener);
          directListeners.set(messageName, entry);
        },
      ),
      offMessage: vi.fn(
        (messageName: string, listener: (payload: unknown) => void) => {
          directListeners.get(messageName)?.delete(listener);
        },
      ),
    };

    const sw = new SwabbleWeb();
    const wakeListener = vi.fn();
    const stateListener = vi.fn();
    await sw.addListener("wakeWord", wakeListener);
    await sw.addListener("stateChange", stateListener);

    await expect(
      sw.start({
        config: { triggers: ["milady"], sampleRate: 16000 },
      }),
    ).resolves.toEqual({ started: true });

    expect(swabbleStart).toHaveBeenCalledWith({
      config: { triggers: ["milady"], sampleRate: 16000 },
    });

    directListeners.get("swabbleStateChanged")?.forEach((listener) => {
      listener({ listening: true });
    });
    expect(stateListener).toHaveBeenCalledWith({ state: "listening" });

    directListeners.get("swabbleWakeWord")?.forEach((listener) => {
      listener({
        wakeWord: "milady",
        command: "open settings",
        transcript: "milady open settings",
        postGap: 0.8,
      });
    });
    expect(wakeListener).toHaveBeenCalledWith({
      wakeWord: "milady",
      command: "open settings",
      transcript: "milady open settings",
      postGap: 0.8,
    });

    await sw.updateConfig({ config: { minCommandLength: 2 } });
    expect(swabbleUpdateConfig).toHaveBeenCalledWith({
      minCommandLength: 2,
    });

    await expect(sw.checkPermissions()).resolves.toEqual({
      microphone: "granted",
      speechRecognition: "granted",
    });

    processorStub.onaudioprocess?.({
      inputBuffer: {
        getChannelData: () =>
          new Float32Array([0.25, -0.5, 0.25, -0.5, 0.25, -0.5]),
      },
    } as AudioProcessingEvent);
    expect(swabbleAudioChunk).toHaveBeenCalledTimes(1);
    expect(swabbleAudioChunk).toHaveBeenCalledWith({
      data: expect.any(String),
    });

    await sw.stop();
    expect(swabbleStop).toHaveBeenCalledWith(undefined);
    expect(directListeners.get("swabbleStateChanged")?.size ?? 0).toBe(0);
    expect(directListeners.get("swabbleWakeWord")?.size ?? 0).toBe(0);
  });

  it("uses direct swabble transcript and error push messages and keeps audio levels local", async () => {
    const directListeners = new Map<string, Set<(payload: unknown) => void>>();
    (window as TestWindow).__MILADY_ELECTROBUN_RPC__ = {
      request: {
        swabbleStart: vi.fn().mockResolvedValue({ started: true }),
        swabbleStop: vi.fn().mockResolvedValue(undefined),
        swabbleIsWhisperAvailable: vi
          .fn()
          .mockResolvedValue({ available: false }),
      },
      onMessage: vi.fn(
        (messageName: string, listener: (payload: unknown) => void) => {
          const entry = directListeners.get(messageName) ?? new Set();
          entry.add(listener);
          directListeners.set(messageName, entry);
        },
      ),
      offMessage: vi.fn(
        (messageName: string, listener: (payload: unknown) => void) => {
          directListeners.get(messageName)?.delete(listener);
        },
      ),
    };

    const sw = new SwabbleWeb();
    const transcriptListener = vi.fn();
    const errorListener = vi.fn();
    const audioLevelListener = vi.fn();
    await sw.addListener("transcript", transcriptListener);
    await sw.addListener("error", errorListener);
    await sw.addListener("audioLevel", audioLevelListener);

    await expect(
      sw.start({
        config: { triggers: ["milady"], sampleRate: 16000 },
      }),
    ).resolves.toEqual({ started: true });

    directListeners.get("swabbleTranscript")?.forEach((listener) => {
      listener({
        transcript: "hello world",
        segments: [],
        isFinal: true,
      });
    });
    expect(transcriptListener).toHaveBeenCalledWith({
      transcript: "hello world",
      segments: [],
      isFinal: true,
    });

    directListeners.get("swabbleError")?.forEach((listener) => {
      listener({
        code: "native_error",
        message: "boom",
        recoverable: true,
      });
    });
    expect(errorListener).toHaveBeenCalledWith({
      code: "native_error",
      message: "boom",
      recoverable: true,
    });

    processorStub.onaudioprocess?.({
      inputBuffer: {
        getChannelData: () =>
          new Float32Array([0.25, -0.5, 0.25, -0.5, 0.25, -0.5]),
      },
    } as AudioProcessingEvent);
    expect(audioLevelListener).toHaveBeenCalledWith({
      level: expect.any(Number),
      peak: 0.5,
    });

    await sw.stop();
    expect(directListeners.get("swabbleTranscript")?.size ?? 0).toBe(0);
    expect(directListeners.get("swabbleError")?.size ?? 0).toBe(0);
  });
});
