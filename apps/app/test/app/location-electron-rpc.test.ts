// @vitest-environment jsdom

import type {
  ElectrobunRendererRpc,
  ElectronIpcRenderer,
} from "@milady/app-core/bridge";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocationElectron } from "../../plugins/location/electron/src/index";

type TestWindow = Window & {
  __MILADY_ELECTROBUN_RPC__?: ElectrobunRendererRpc;
  electron?: { ipcRenderer?: ElectronIpcRenderer };
};

describe("LocationElectron direct Electrobun RPC bridge", () => {
  afterEach(() => {
    delete (window as TestWindow).__MILADY_ELECTROBUN_RPC__;
    delete (window as TestWindow).electron;
    vi.restoreAllMocks();
  });

  it("prefers direct Electrobun RPC for current position and normalizes the payload", async () => {
    const rpcRequest = vi.fn().mockResolvedValue({
      latitude: 40.7128,
      longitude: -74.006,
      accuracy: 25,
      timestamp: 123456789,
    });
    const ipcInvoke = vi.fn();

    (window as TestWindow).__MILADY_ELECTROBUN_RPC__ = {
      request: {
        locationGetCurrentPosition: rpcRequest,
      },
      onMessage: vi.fn(),
      offMessage: vi.fn(),
    };
    (window as TestWindow).electron = { ipcRenderer: { invoke: ipcInvoke } };

    const plugin = new LocationElectron();
    await expect(
      plugin.getCurrentPosition({ accuracy: "high" }),
    ).resolves.toEqual({
      coords: {
        latitude: 40.7128,
        longitude: -74.006,
        accuracy: 25,
        timestamp: 123456789,
      },
      cached: false,
    });

    expect(rpcRequest).toHaveBeenCalledWith({ accuracy: "high" });
    expect(ipcInvoke).not.toHaveBeenCalled();
  });

  it("subscribes and unsubscribes native location watch events through direct Electrobun RPC", async () => {
    const listeners = new Map<string, Set<(payload: unknown) => void>>();
    const locationWatchPosition = vi
      .fn()
      .mockResolvedValue({ watchId: "native-watch-1" });
    const locationClearWatch = vi.fn().mockResolvedValue(undefined);

    (window as TestWindow).__MILADY_ELECTROBUN_RPC__ = {
      request: {
        locationWatchPosition,
        locationClearWatch,
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

    const plugin = new LocationElectron();
    const changeListener = vi.fn();
    await plugin.addListener("locationChange", changeListener);

    await expect(plugin.watchPosition({ timeout: 5000 })).resolves.toEqual({
      watchId: "native-watch-1",
    });

    listeners.get("locationUpdate")?.forEach((listener) => {
      listener({
        latitude: 51.5074,
        longitude: -0.1278,
        accuracy: 12,
        timestamp: 987654321,
      });
    });

    expect(changeListener).toHaveBeenCalledWith({
      coords: {
        latitude: 51.5074,
        longitude: -0.1278,
        accuracy: 12,
        timestamp: 987654321,
      },
      cached: false,
    });

    await plugin.clearWatch({ watchId: "native-watch-1" });
    expect(locationClearWatch).toHaveBeenCalledWith({
      watchId: "native-watch-1",
    });
    expect(listeners.get("locationUpdate")?.size ?? 0).toBe(0);
  });

  it("handles wrapped IPC fallback watch payloads for native location updates", async () => {
    const ipcListeners = new Map<
      string,
      Set<(event: unknown, payload: unknown) => void>
    >();
    const invoke = vi.fn(async (channel: string) => {
      if (channel === "location:watchPosition") {
        return { watchId: "ipc-watch-1" };
      }

      if (channel === "location:clearWatch") {
        return undefined;
      }

      throw new Error(`Unexpected channel: ${channel}`);
    });

    (window as TestWindow).electron = {
      ipcRenderer: {
        invoke,
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

    const plugin = new LocationElectron();
    const changeListener = vi.fn();
    await plugin.addListener("locationChange", changeListener);

    await expect(plugin.watchPosition()).resolves.toEqual({
      watchId: "ipc-watch-1",
    });

    ipcListeners.get("location:update")?.forEach((listener) => {
      listener(
        { sender: "test" },
        {
          watchId: "ipc-watch-1",
          location: {
            coords: {
              latitude: 37.7749,
              longitude: -122.4194,
              accuracy: 18,
              timestamp: 24681012,
            },
            cached: false,
          },
        },
      );
    });

    expect(changeListener).toHaveBeenCalledWith({
      coords: {
        latitude: 37.7749,
        longitude: -122.4194,
        accuracy: 18,
        timestamp: 24681012,
      },
      cached: false,
    });

    await plugin.clearWatch({ watchId: "ipc-watch-1" });
    expect(invoke).toHaveBeenCalledWith("location:clearWatch", {
      watchId: "ipc-watch-1",
    });
    expect(ipcListeners.get("location:update")?.size ?? 0).toBe(0);
  });
});
