// @vitest-environment jsdom

import type {
  ElectrobunRendererRpc,
  ElectronIpcRenderer,
} from "@milady/app-core/bridge";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SwabbleElectron } from "../../plugins/swabble/electron/src/index";

type TestWindow = Window & {
  __MILADY_ELECTROBUN_RPC__?: ElectrobunRendererRpc;
  electron?: {
    ipcRenderer?: ElectronIpcRenderer & {
      send?: (channel: string, payload?: unknown) => void;
    };
  };
};

interface ProcessorStub {
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  onaudioprocess: ((event: AudioProcessingEvent) => void) | null;
}

let originalAudioContext: typeof globalThis.AudioContext | undefined;
let processorStub: ProcessorStub;

function installAudioCaptureStubs(): void {
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

describe("SwabbleElectron direct Electrobun RPC bridge", () => {
  beforeEach(() => {
    installAudioCaptureStubs();
  });

  afterEach(() => {
    delete (window as TestWindow).__MILADY_ELECTROBUN_RPC__;
    delete (window as TestWindow).electron;
    vi.restoreAllMocks();

    if (originalAudioContext) {
      Object.defineProperty(globalThis, "AudioContext", {
        value: originalAudioContext,
        writable: true,
        configurable: true,
      });
    }
  });

  it("prefers direct Electrobun RPC for native swabble requests and normalizes native payloads", async () => {
    const listeners = new Map<string, Set<(payload: unknown) => void>>();
    const swabbleStart = vi.fn().mockResolvedValue({ started: true });
    const swabbleStop = vi.fn().mockResolvedValue(undefined);
    const swabbleIsListening = vi.fn().mockResolvedValue({ listening: true });
    const swabbleGetConfig = vi.fn().mockResolvedValue({
      triggers: ["milady"],
      minCommandLength: 2,
    });
    const swabbleUpdateConfig = vi.fn().mockResolvedValue(undefined);
    const swabbleIsWhisperAvailable = vi
      .fn()
      .mockResolvedValue({ available: true });
    const swabbleAudioChunk = vi.fn().mockResolvedValue(undefined);
    const ipcInvoke = vi.fn();

    (window as TestWindow).__MILADY_ELECTROBUN_RPC__ = {
      request: {
        swabbleStart,
        swabbleStop,
        swabbleIsListening,
        swabbleGetConfig,
        swabbleUpdateConfig,
        swabbleIsWhisperAvailable,
        swabbleAudioChunk,
      },
      onMessage: vi.fn(
        (messageName: string, listener: (payload: unknown) => void) => {
          const entry = listeners.get(messageName) ?? new Set();
          entry.add(listener);
          listeners.set(messageName, entry);
        },
      ),
      offMessage: vi.fn(
        (messageName: string, listener: (payload: unknown) => void) => {
          listeners.get(messageName)?.delete(listener);
        },
      ),
    };
    (window as TestWindow).electron = {
      ipcRenderer: {
        invoke: ipcInvoke,
      },
    };

    const plugin = new SwabbleElectron();
    const wakeListener = vi.fn();
    const stateListener = vi.fn();
    await plugin.addListener("wakeWord", wakeListener);
    await plugin.addListener("stateChange", stateListener);

    await expect(
      plugin.start({
        config: { triggers: ["milady"], sampleRate: 16000 },
      }),
    ).resolves.toEqual({ started: true });

    expect(swabbleStart).toHaveBeenCalledWith({
      config: { triggers: ["milady"], sampleRate: 16000 },
    });
    expect(ipcInvoke).not.toHaveBeenCalled();

    listeners.get("swabbleWakeWord")?.forEach((listener) => {
      listener({
        trigger: "milady",
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
      confidence: undefined,
    });

    listeners.get("swabbleStateChanged")?.forEach((listener) => {
      listener({ listening: true });
    });
    expect(stateListener).toHaveBeenCalledWith({ state: "listening" });

    await expect(plugin.isListening()).resolves.toEqual({ listening: true });
    await expect(plugin.getConfig()).resolves.toEqual({
      config: { triggers: ["milady"], minCommandLength: 2 },
    });

    await plugin.updateConfig({ config: { minCommandLength: 3 } });
    expect(swabbleUpdateConfig).toHaveBeenCalledWith({
      minCommandLength: 3,
    });

    await expect(plugin.checkPermissions()).resolves.toEqual({
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

    await plugin.stop();
    expect(swabbleStop).toHaveBeenCalledWith(undefined);
    expect(listeners.get("swabbleWakeWord")?.size ?? 0).toBe(0);
    expect(listeners.get("swabbleStateChanged")?.size ?? 0).toBe(0);
  });

  it("keeps transcript and error events on IPC fallback when Electrobun exposes no direct push message", async () => {
    const rpcListeners = new Map<string, Set<(payload: unknown) => void>>();
    const ipcListeners = new Map<
      string,
      Set<(event: unknown, payload: unknown) => void>
    >();
    const swabbleStop = vi.fn().mockResolvedValue(undefined);

    (window as TestWindow).__MILADY_ELECTROBUN_RPC__ = {
      request: {
        swabbleStart: vi.fn().mockResolvedValue({ started: true }),
        swabbleStop,
        swabbleAudioChunk: vi.fn().mockResolvedValue(undefined),
      },
      onMessage: vi.fn(
        (messageName: string, listener: (payload: unknown) => void) => {
          const entry = rpcListeners.get(messageName) ?? new Set();
          entry.add(listener);
          rpcListeners.set(messageName, entry);
        },
      ),
      offMessage: vi.fn(
        (messageName: string, listener: (payload: unknown) => void) => {
          rpcListeners.get(messageName)?.delete(listener);
        },
      ),
    };
    (window as TestWindow).electron = {
      ipcRenderer: {
        invoke: vi.fn(),
        on: vi.fn(
          (
            channel: string,
            listener: (event: unknown, payload: unknown) => void,
          ) => {
            const entry = ipcListeners.get(channel) ?? new Set();
            entry.add(listener);
            ipcListeners.set(channel, entry);
          },
        ),
        removeListener: vi.fn(
          (
            channel: string,
            listener: (event: unknown, payload: unknown) => void,
          ) => {
            ipcListeners.get(channel)?.delete(listener);
          },
        ),
      },
    };

    const plugin = new SwabbleElectron();
    const transcriptListener = vi.fn();
    const errorListener = vi.fn();
    await plugin.addListener("transcript", transcriptListener);
    await plugin.addListener("error", errorListener);

    await plugin.start({
      config: { triggers: ["milady"], sampleRate: 16000 },
    });

    ipcListeners.get("swabble:transcript")?.forEach((listener) => {
      listener(
        { sender: "test" },
        {
          transcript: "milady open settings",
          segments: [],
          isFinal: true,
          confidence: 0.99,
        },
      );
    });
    expect(transcriptListener).toHaveBeenCalledWith({
      transcript: "milady open settings",
      segments: [],
      isFinal: true,
      confidence: 0.99,
    });

    ipcListeners.get("swabble:error")?.forEach((listener) => {
      listener(
        { sender: "test" },
        {
          code: "native-error",
          message: "microphone busy",
          recoverable: true,
        },
      );
    });
    expect(errorListener).toHaveBeenCalledWith({
      code: "native-error",
      message: "microphone busy",
      recoverable: true,
    });

    await plugin.stop();
    expect(swabbleStop).toHaveBeenCalledWith(undefined);
    expect(ipcListeners.get("swabble:transcript")?.size ?? 0).toBe(0);
    expect(ipcListeners.get("swabble:error")?.size ?? 0).toBe(0);
  });
});
