/**
 * Chrome Extension API mock for unit tests.
 * Provides an in-memory implementation of the subset used by background.js / options.js.
 */
import { vi } from "vitest";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ChromeStorageArea {
  _data: Map<string, unknown>;
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
}

interface ChromeEvent {
  _listeners: Array<(...args: unknown[]) => void>;
  addListener: ReturnType<typeof vi.fn>;
  removeListener: ReturnType<typeof vi.fn>;
}

export interface ChromeMock {
  storage: { local: ChromeStorageArea };
  action: {
    setBadgeText: ReturnType<typeof vi.fn>;
    setBadgeBackgroundColor: ReturnType<typeof vi.fn>;
    setBadgeTextColor: ReturnType<typeof vi.fn>;
    setTitle: ReturnType<typeof vi.fn>;
    onClicked: ChromeEvent;
  };
  debugger: {
    attach: ReturnType<typeof vi.fn>;
    detach: ReturnType<typeof vi.fn>;
    sendCommand: ReturnType<typeof vi.fn>;
    onEvent: ChromeEvent;
    onDetach: ChromeEvent;
  };
  tabs: {
    query: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  windows: {
    update: ReturnType<typeof vi.fn>;
  };
  runtime: {
    openOptionsPage: ReturnType<typeof vi.fn>;
    onInstalled: ChromeEvent;
  };
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function makeEvent(): ChromeEvent {
  const listeners: Array<(...args: unknown[]) => void> = [];
  return {
    _listeners: listeners,
    addListener: vi.fn((fn: (...args: unknown[]) => void) => {
      listeners.push(fn);
    }),
    removeListener: vi.fn((fn: (...args: unknown[]) => void) => {
      const idx = listeners.indexOf(fn);
      if (idx >= 0) listeners.splice(idx, 1);
    }),
  };
}

/* ------------------------------------------------------------------ */
/*  Factory                                                            */
/* ------------------------------------------------------------------ */

export function createChromeMock(): ChromeMock {
  const storageData = new Map<string, unknown>();

  return {
    storage: {
      local: {
        _data: storageData,
        get: vi.fn(async (keys: string[]) => {
          const result: Record<string, unknown> = {};
          for (const k of keys) {
            if (storageData.has(k)) result[k] = storageData.get(k);
          }
          return result;
        }),
        set: vi.fn(async (obj: Record<string, unknown>) => {
          for (const [k, v] of Object.entries(obj)) storageData.set(k, v);
        }),
      },
    },
    action: {
      setBadgeText: vi.fn(async () => {}),
      setBadgeBackgroundColor: vi.fn(async () => {}),
      setBadgeTextColor: vi.fn(async () => {}),
      setTitle: vi.fn(async () => {}),
      onClicked: makeEvent(),
    },
    debugger: {
      attach: vi.fn(async () => {}),
      detach: vi.fn(async () => {}),
      sendCommand: vi.fn(async () => ({})),
      onEvent: makeEvent(),
      onDetach: makeEvent(),
    },
    tabs: {
      query: vi.fn(async () => []),
      create: vi.fn(async (opts: { url?: string }) => ({
        id: 999,
        url: opts?.url ?? "about:blank",
      })),
      remove: vi.fn(async () => {}),
      get: vi.fn(async (tabId: number) => ({ id: tabId, windowId: 1 })),
      update: vi.fn(async () => {}),
    },
    windows: {
      update: vi.fn(async () => {}),
    },
    runtime: {
      openOptionsPage: vi.fn(async () => {}),
      onInstalled: makeEvent(),
    },
  };
}

/* ------------------------------------------------------------------ */
/*  Install / Reset                                                    */
/* ------------------------------------------------------------------ */

let _current: ChromeMock | null = null;

export function installChromeMock(): ChromeMock {
  const mock = createChromeMock();
  _current = mock;
  (globalThis as Record<string, unknown>).chrome = mock;
  return mock;
}

export function resetChromeMock(): ChromeMock {
  return installChromeMock();
}

export function currentChromeMock(): ChromeMock {
  if (!_current) throw new Error("chrome mock not installed");
  return _current;
}
