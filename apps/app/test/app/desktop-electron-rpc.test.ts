// @vitest-environment jsdom

import type {
  ElectrobunRendererRpc,
  ElectronIpcRenderer,
} from "@milady/app-core/bridge";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DesktopElectron } from "../../plugins/desktop/electron/src/index.ts";

type TestWindow = Window & {
  __MILADY_ELECTROBUN_RPC__?: ElectrobunRendererRpc;
  electron?: { ipcRenderer?: ElectronIpcRenderer };
};

describe("DesktopElectron desktop bridge", () => {
  afterEach(() => {
    delete (window as TestWindow).__MILADY_ELECTROBUN_RPC__;
    delete (window as TestWindow).electron;
    vi.restoreAllMocks();
  });

  it("prefers direct Electrobun RPC for desktop requests", async () => {
    const desktopGetVersion = vi.fn().mockResolvedValue({
      version: "1.2.3",
      name: "Milady",
      runtime: "electrobun",
    });
    const ipcInvoke = vi.fn();

    (window as TestWindow).__MILADY_ELECTROBUN_RPC__ = {
      request: {
        desktopGetVersion,
      },
      onMessage: vi.fn(),
      offMessage: vi.fn(),
    };
    (window as TestWindow).electron = { ipcRenderer: { invoke: ipcInvoke } };

    const plugin = new DesktopElectron();
    await expect(plugin.getVersion()).resolves.toEqual({
      version: "1.2.3",
      name: "Milady",
      electron: "electrobun",
      chrome: "N/A",
      node: "N/A",
    });

    expect(desktopGetVersion).toHaveBeenCalledWith(undefined);
    expect(ipcInvoke).not.toHaveBeenCalled();
  });

  it("subscribes window events through direct Electrobun RPC when available", async () => {
    const listeners = new Map<string, Set<(payload: unknown) => void>>();

    (window as TestWindow).__MILADY_ELECTROBUN_RPC__ = {
      request: {},
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

    const plugin = new DesktopElectron();
    const focusListener = vi.fn();
    await plugin.addListener("windowFocus", focusListener);

    listeners.get("desktopWindowFocus")?.forEach((listener) => {
      listener(undefined);
    });

    expect(focusListener).toHaveBeenCalledWith(undefined);
  });

  it("uses IPC invoke fallback for desktop requests when direct Electrobun RPC is unavailable", async () => {
    const invoke = vi.fn().mockResolvedValue(undefined);

    (window as TestWindow).electron = {
      ipcRenderer: {
        invoke,
      },
    };

    const plugin = new DesktopElectron();
    await expect(plugin.beep()).resolves.toBeUndefined();

    expect(invoke).toHaveBeenCalledWith("desktop:beep", undefined);
  });

  it("keeps IPC-only fallback events wired for unsupported desktop push messages", async () => {
    const ipcListeners = new Map<
      string,
      Set<(event: unknown, payload: unknown) => void>
    >();

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

    const plugin = new DesktopElectron();
    const suspendListener = vi.fn();
    await plugin.addListener("powerSuspend", suspendListener);

    ipcListeners.get("desktop:powerSuspend")?.forEach((listener) => {
      listener({ sender: "test" }, undefined);
    });

    expect(suspendListener).toHaveBeenCalledWith(undefined);
  });
});
