/**
 * Test setup — mocks browser APIs for Node.js vitest environment.
 *
 * All navigator sub-objects (mediaDevices, geolocation, permissions, clipboard)
 * are created here with vi.fn() stubs so tests can vi.spyOn() them freely.
 */
import { vi } from "vitest";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const originalConsoleError = console.error.bind(console);

function shouldIgnoreTestConsoleError(args: unknown[]): boolean {
  const first = args[0];
  return (
    typeof first === "string" &&
    (first.includes("react-test-renderer is deprecated") ||
      first.includes(
        "The current testing environment is not configured to support act(...)",
      ))
  );
}

console.error = (...args: unknown[]) => {
  if (shouldIgnoreTestConsoleError(args)) {
    return;
  }
  originalConsoleError(...args);
};

// ---------------------------------------------------------------------------
// Mock @capacitor/core
// ---------------------------------------------------------------------------

class MockWebPlugin {
  private _listeners = new Map<string, Set<(...args: unknown[]) => void>>();

  notifyListeners(eventName: string, data: unknown): void {
    for (const fn of this._listeners.get(eventName) ?? []) fn(data);
  }

  addListener(
    eventName: string,
    listenerFunc: (...args: unknown[]) => void,
  ): Promise<{ remove: () => Promise<void> }> {
    if (!this._listeners.has(eventName))
      this._listeners.set(eventName, new Set());
    this._listeners.get(eventName)?.add(listenerFunc);
    return Promise.resolve({
      remove: async () => {
        this._listeners.get(eventName)?.delete(listenerFunc);
      },
    });
  }

  removeAllListeners(): Promise<void> {
    this._listeners.clear();
    return Promise.resolve();
  }
}

vi.mock("@capacitor/core", () => ({
  WebPlugin: MockWebPlugin,
  registerPlugin: vi.fn(() => ({})),
  Capacitor: {
    getPlatform: vi.fn(() => "web"),
    isNativePlatform: vi.fn(() => false),
    isPluginAvailable: vi.fn(() => true),
  },
}));

// ---------------------------------------------------------------------------
// Navigator mocks — always applied, writable, and spyable
// ---------------------------------------------------------------------------

function ensureObj(
  parent: Record<string, unknown>,
  key: string,
  value: Record<string, unknown>,
): void {
  if (!parent[key]) {
    Object.defineProperty(parent, key, {
      value,
      writable: true,
      configurable: true,
    });
  }
}

const nav: Record<string, unknown> =
  typeof globalThis.navigator !== "undefined"
    ? (globalThis.navigator as unknown as Record<string, unknown>)
    : {};

if (typeof globalThis.navigator === "undefined") {
  Object.defineProperty(globalThis, "navigator", {
    value: nav,
    writable: true,
    configurable: true,
  });
}

ensureObj(nav, "mediaDevices", {
  getUserMedia: vi.fn(),
  enumerateDevices: vi.fn(),
  getDisplayMedia: vi.fn(),
});

ensureObj(nav, "geolocation", {
  getCurrentPosition: vi.fn(),
  watchPosition: vi.fn(),
  clearWatch: vi.fn(),
});

ensureObj(nav, "permissions", { query: vi.fn() });

ensureObj(nav, "clipboard", {
  writeText: vi.fn().mockResolvedValue(undefined),
  readText: vi.fn().mockResolvedValue(""),
  write: vi.fn().mockResolvedValue(undefined),
});

if (!nav.platform) nav.platform = "test";
if (!nav.userAgent) nav.userAgent = "test-agent";

// ---------------------------------------------------------------------------
// DOM mocks
// ---------------------------------------------------------------------------

if (typeof globalThis.document === "undefined") {
  Object.defineProperty(globalThis, "document", {
    value: {
      createElement: vi.fn(() => ({
        getContext: vi.fn(() => ({ drawImage: vi.fn() })),
        toDataURL: vi.fn(() => "data:image/jpeg;base64,dGVzdA=="),
        appendChild: vi.fn(),
        removeChild: vi.fn(),
        play: vi.fn(() => Promise.resolve()),
        style: {},
        width: 0,
        height: 0,
        videoWidth: 1920,
        videoHeight: 1080,
      })),
      hidden: false,
      hasFocus: vi.fn(() => true),
      documentElement: { requestFullscreen: vi.fn() },
      exitFullscreen: vi.fn(),
    },
    writable: true,
    configurable: true,
  });
}

// Simple in-memory storage mock
function createMockStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      store.delete(key);
    }),
    clear: vi.fn(() => {
      store.clear();
    }),
    get length() {
      return store.size;
    },
    key: vi.fn((index: number) => [...store.keys()][index] ?? null),
  } as Storage;
}

if (typeof globalThis.localStorage === "undefined") {
  Object.defineProperty(globalThis, "localStorage", {
    value: createMockStorage(),
    writable: true,
    configurable: true,
  });
}
if (typeof globalThis.sessionStorage === "undefined") {
  Object.defineProperty(globalThis, "sessionStorage", {
    value: createMockStorage(),
    writable: true,
    configurable: true,
  });
}

if (typeof globalThis.window === "undefined") {
  Object.defineProperty(globalThis, "window", {
    value: {
      close: vi.fn(),
      focus: vi.fn(),
      open: vi.fn(),
      location: { reload: vi.fn() },
      screenX: 0,
      screenY: 0,
      outerWidth: 1920,
      outerHeight: 1080,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      localStorage: globalThis.localStorage,
      sessionStorage: globalThis.sessionStorage,
      navigator: globalThis.navigator,
    },
    writable: true,
    configurable: true,
  });
} else {
  const win = globalThis.window as unknown as Record<string, unknown>;
  if (!win.sessionStorage) {
    Object.defineProperty(win, "sessionStorage", {
      value: createMockStorage(),
      writable: true,
      configurable: true,
    });
  }
  if (!win.localStorage) {
    Object.defineProperty(win, "localStorage", {
      value: createMockStorage(),
      writable: true,
      configurable: true,
    });
  }
  if (!win.navigator) {
    Object.defineProperty(win, "navigator", {
      value: globalThis.navigator,
      writable: true,
      configurable: true,
    });
  }
}

if (typeof globalThis.WebSocket === "undefined") {
  class MockWebSocket {
    static readonly OPEN = 1;
    static readonly CLOSED = 3;
    readonly OPEN = 1;
    readonly CLOSED = 3;
    url: string;
    readyState = MockWebSocket.OPEN;
    private handlers = new Map<string, ((...a: unknown[]) => void)[]>();

    constructor(url: string) {
      this.url = url;
      setTimeout(() => this.emit("open", {}), 0);
    }
    addEventListener(e: string, h: (...a: unknown[]) => void) {
      let eventHandlers = this.handlers.get(e);
      if (!eventHandlers) {
        eventHandlers = [];
        this.handlers.set(e, eventHandlers);
      }
      eventHandlers.push(h);
    }
    removeEventListener(e: string, h: (...a: unknown[]) => void) {
      const hs = this.handlers.get(e);
      if (hs) {
        const i = hs.indexOf(h);
        if (i >= 0) hs.splice(i, 1);
      }
    }
    private emit(e: string, d: unknown) {
      for (const h of this.handlers.get(e) ?? []) h(d);
    }
    send = vi.fn();
    close = vi.fn(() => {
      this.readyState = MockWebSocket.CLOSED;
    });
  }
  Object.defineProperty(globalThis, "WebSocket", {
    value: MockWebSocket,
    writable: true,
    configurable: true,
  });
}

if (typeof globalThis.Notification === "undefined") {
  Object.defineProperty(globalThis, "Notification", {
    value: class {
      static permission = "granted";
      static requestPermission = vi.fn(() => Promise.resolve("granted"));
      onclick: (() => void) | null = null;
    },
    writable: true,
    configurable: true,
  });
}

if (typeof globalThis.AudioContext === "undefined") {
  Object.defineProperty(globalThis, "AudioContext", {
    value: class {
      currentTime = 0;
      state = "running";
      destination = {};
      createOscillator = vi.fn(() => ({
        connect: vi.fn(() => ({ connect: vi.fn() })),
        frequency: { value: 0 },
        type: "sine",
        start: vi.fn(),
        stop: vi.fn(),
      }));
      createGain = vi.fn(() => ({
        connect: vi.fn(() => ({ connect: vi.fn() })),
        gain: {
          setValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn(),
        },
      }));
      createAnalyser = vi.fn(() => ({
        fftSize: 2048,
        smoothingTimeConstant: 0.8,
        connect: vi.fn(),
        getFloatTimeDomainData: vi.fn((arr: Float32Array) => {
          arr.fill(0);
        }),
      }));
      createBufferSource = vi.fn(() => ({
        buffer: null,
        connect: vi.fn(),
        disconnect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
        onended: null as (() => void) | null,
      }));
      decodeAudioData = vi.fn(async () => ({
        duration: 1,
        length: 44100,
        sampleRate: 44100,
      }));
      resume = vi.fn(async () => {});
      close = vi.fn(async () => {});
    },
    writable: true,
    configurable: true,
  });
}

// ---------------------------------------------------------------------------
// SpeechSynthesis mocks (for voice chat testing)
// ---------------------------------------------------------------------------

if (typeof globalThis.SpeechSynthesisUtterance === "undefined") {
  Object.defineProperty(globalThis, "SpeechSynthesisUtterance", {
    value: class {
      text = "";
      rate = 1;
      pitch = 1;
      lang = "";
      onstart: (() => void) | null = null;
      onend: (() => void) | null = null;
      onerror: ((e: { error: string }) => void) | null = null;
      constructor(text?: string) {
        this.text = text ?? "";
      }
    },
    writable: true,
    configurable: true,
  });
}

// Note: SpeechSynthesis instance is NOT mocked globally to avoid breaking
// TalkModeWeb tests that expect synthesis to be unavailable. Tests needing
// SpeechSynthesis should create their own mock instances locally.
