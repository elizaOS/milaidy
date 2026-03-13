// @vitest-environment jsdom

import type {
  ElectrobunRendererRpc,
  ElectronIpcRenderer,
} from "@milady/app-core/bridge";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TalkModeElectron } from "../../plugins/talkmode/electron/src/index.ts";

type TestWindow = Window & {
  __MILADY_ELECTROBUN_RPC__?: ElectrobunRendererRpc;
  electron?: {
    ipcRenderer?: ElectronIpcRenderer & {
      send?: (channel: string, payload?: unknown) => void;
      on?: (
        channel: string,
        listener: (event: unknown, payload: unknown) => void,
      ) => void;
      removeListener?: (
        channel: string,
        listener: (event: unknown, payload: unknown) => void,
      ) => void;
    };
  };
};

type TalkModeElectronPrivate = TalkModeElectron & {
  invokeBridge: (
    rpcMethod: string,
    ipcChannel: string,
    params?: unknown,
  ) => Promise<unknown>;
  setupNativeListeners: () => void;
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
    close = vi.fn(async () => {});
  }

  Object.defineProperty(globalThis, "AudioContext", {
    value: MockAudioContext,
    writable: true,
    configurable: true,
  });
}

describe("TalkModeElectron direct Electrobun RPC bridge", () => {
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

  it("prefers direct Electrobun RPC for talkmode control and syncs the native config shape", async () => {
    const directListeners = new Map<string, Set<(payload: unknown) => void>>();
    const talkmodeAudioChunk = vi.fn().mockResolvedValue(undefined);
    const ipcInvoke = vi.fn();

    (window as TestWindow).__MILADY_ELECTROBUN_RPC__ = {
      request: {
        talkmodeAudioChunk,
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
    (window as TestWindow).electron = {
      ipcRenderer: {
        invoke: ipcInvoke,
      },
    };

    const plugin = new TalkModeElectron();
    const invokeBridge = vi.fn(async (rpcMethod: string) => {
      switch (rpcMethod) {
        case "talkmodeUpdateConfig":
          return undefined;
        case "talkmodeStart":
          return { available: true };
        case "talkmodeIsWhisperAvailable":
          return { available: true };
        case "talkmodeIsEnabled":
          return { enabled: true };
        case "talkmodeGetState":
          return { state: "processing" };
        case "talkmodeIsSpeaking":
          return { speaking: true };
        case "talkmodeStop":
          return undefined;
        default:
          throw new Error(`Unexpected bridge request: ${rpcMethod}`);
      }
    });
    (plugin as TalkModeElectronPrivate).invokeBridge = invokeBridge;

    const stateListener = vi.fn();
    const transcriptListener = vi.fn();
    await plugin.addListener("stateChange", stateListener);
    await plugin.addListener("transcript", transcriptListener);

    await expect(
      plugin.start({
        config: {
          stt: {
            engine: "whisper",
            modelSize: "base",
            language: "en",
            sampleRate: 16000,
          },
          tts: { voiceId: "voice-1", apiKey: "renderer-only" },
          silenceWindowMs: 500,
        },
      }),
    ).resolves.toEqual({ started: true });

    expect(invokeBridge).toHaveBeenNthCalledWith(
      1,
      "talkmodeUpdateConfig",
      "talkmode:updateConfig",
      {
        engine: "whisper",
        modelSize: "base",
        language: "en",
        voiceId: "voice-1",
      },
    );
    expect(invokeBridge).toHaveBeenNthCalledWith(
      2,
      "talkmodeStart",
      "talkmode:start",
    );
    expect(invokeBridge).toHaveBeenNthCalledWith(
      3,
      "talkmodeIsWhisperAvailable",
      "talkmode:isWhisperAvailable",
    );
    expect(ipcInvoke).not.toHaveBeenCalled();

    directListeners.get("talkmodeStateChanged")?.forEach((listener) => {
      listener({ state: "processing" });
    });
    expect(stateListener).toHaveBeenLastCalledWith({
      state: "processing",
      previousState: "listening",
      statusText: "Processing",
      usingSystemTts: false,
    });

    directListeners.get("talkmodeTranscript")?.forEach((listener) => {
      listener({ text: "hello world", isFinal: false });
    });
    expect(transcriptListener).toHaveBeenCalledWith({
      transcript: "hello world",
      isFinal: false,
    });

    await expect(plugin.isEnabled()).resolves.toEqual({ enabled: true });
    await expect(plugin.getState()).resolves.toEqual({
      state: "processing",
      statusText: "Processing",
    });
    await expect(plugin.isSpeaking()).resolves.toEqual({ speaking: true });
    await expect(plugin.checkPermissions()).resolves.toEqual({
      microphone: "granted",
      speechRecognition: "granted",
    });

    await plugin.updateConfig({
      config: {
        stt: { modelSize: "small" },
        tts: { voiceId: "voice-2" },
        silenceWindowMs: 1000,
      },
    });
    expect(invokeBridge).toHaveBeenCalledWith(
      "talkmodeUpdateConfig",
      "talkmode:updateConfig",
      {
        modelSize: "small",
        voiceId: "voice-2",
      },
    );

    processorStub.onaudioprocess?.({
      inputBuffer: {
        getChannelData: () =>
          new Float32Array([0.25, -0.5, 0.25, -0.5, 0.25, -0.5]),
      },
    } as AudioProcessingEvent);
    expect(talkmodeAudioChunk).toHaveBeenCalledTimes(1);
    expect(talkmodeAudioChunk).toHaveBeenCalledWith({
      data: expect.any(String),
    });

    await plugin.stop();
    expect(invokeBridge).toHaveBeenCalledWith("talkmodeStop", "talkmode:stop");
    expect(directListeners.get("talkmodeStateChanged")?.size ?? 0).toBe(0);
    expect(directListeners.get("talkmodeTranscript")?.size ?? 0).toBe(0);
  });

  it("uses direct talkmode error push messages when Electrobun exposes them", async () => {
    const directListeners = new Map<string, Set<(payload: unknown) => void>>();
    const ipcListeners = new Map<
      string,
      Set<(event: unknown, payload: unknown) => void>
    >();

    (window as TestWindow).__MILADY_ELECTROBUN_RPC__ = {
      request: {},
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

    const plugin = new TalkModeElectron();
    const invokeBridge = vi.fn(async (rpcMethod: string) => {
      switch (rpcMethod) {
        default:
          return null;
      }
    });
    (plugin as TalkModeElectronPrivate).invokeBridge = invokeBridge;

    const errorListener = vi.fn();
    await plugin.addListener("error", errorListener);

    (plugin as TalkModeElectronPrivate).setupNativeListeners();

    directListeners.get("talkmodeError")?.forEach((listener) => {
      listener({ code: "native_error", message: "boom", recoverable: true });
    });
    expect(errorListener).toHaveBeenCalledWith({
      code: "native_error",
      message: "boom",
      recoverable: true,
    });
    expect(directListeners.get("talkmodeError")?.size ?? 0).toBe(1);
    expect(ipcListeners.get("talkmode:error")?.size ?? 0).toBe(0);
  });
});
