// @vitest-environment jsdom

import type {
  ElectrobunRendererRpc,
  ElectronIpcRenderer,
} from "@milady/app-core/bridge";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GatewayElectron } from "../../plugins/gateway/electron/src/index.ts";

type TestWindow = Window & {
  __MILADY_ELECTROBUN_RPC__?: ElectrobunRendererRpc;
  electron?: { ipcRenderer?: ElectronIpcRenderer };
};

const sampleGateway = {
  stableId: "gw-1",
  name: "Local Gateway",
  host: "127.0.0.1",
  port: 7777,
  tlsEnabled: false,
  isLocal: true,
};

describe("GatewayElectron desktop bridge", () => {
  afterEach(() => {
    delete (window as TestWindow).__MILADY_ELECTROBUN_RPC__;
    delete (window as TestWindow).electron;
    vi.restoreAllMocks();
  });

  it("prefers direct Electrobun RPC for discovery and gateway events", async () => {
    const listeners = new Map<string, Set<(payload: unknown) => void>>();
    const gatewayStartDiscovery = vi.fn().mockResolvedValue({
      gateways: [],
      status: "Discovery started",
    });
    const gatewayStopDiscovery = vi.fn().mockResolvedValue(undefined);

    (window as TestWindow).__MILADY_ELECTROBUN_RPC__ = {
      request: {
        gatewayStartDiscovery,
        gatewayStopDiscovery,
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

    const plugin = new GatewayElectron();
    const discoveryListener = vi.fn();
    await plugin.addListener("discovery", discoveryListener);

    await expect(plugin.startDiscovery({ timeout: 5000 })).resolves.toEqual({
      gateways: [],
      status: "Discovery started",
    });

    listeners.get("gatewayDiscovery")?.forEach((listener) => {
      listener({
        type: "found",
        gateway: sampleGateway,
      });
    });

    expect(discoveryListener).toHaveBeenCalledWith({
      type: "found",
      gateway: sampleGateway,
    });
    await expect(plugin.getDiscoveredGateways()).resolves.toEqual({
      gateways: [sampleGateway],
      status: "Discovering",
    });

    await plugin.stopDiscovery();
    expect(gatewayStopDiscovery).toHaveBeenCalled();
    expect(listeners.get("gatewayDiscovery")?.size ?? 0).toBe(0);
  });

  it("handles IPC fallback discovery events when direct Electrobun RPC is unavailable", async () => {
    const ipcListeners = new Map<
      string,
      Set<(event: unknown, payload: unknown) => void>
    >();
    const invoke = vi.fn(async (channel: string) => {
      if (channel === "gateway:startDiscovery") {
        return { gateways: [], status: "Discovery started" };
      }

      if (channel === "gateway:stopDiscovery") {
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

    const plugin = new GatewayElectron();
    const discoveryListener = vi.fn();
    await plugin.addListener("discovery", discoveryListener);

    await expect(plugin.startDiscovery()).resolves.toEqual({
      gateways: [],
      status: "Discovery started",
    });

    ipcListeners.get("gateway:discovery")?.forEach((listener) => {
      listener(
        { sender: "test" },
        {
          type: "found",
          gateway: sampleGateway,
        },
      );
    });

    expect(discoveryListener).toHaveBeenCalledWith({
      type: "found",
      gateway: sampleGateway,
    });

    await plugin.stopDiscovery();
    expect(invoke).toHaveBeenCalledWith("gateway:stopDiscovery", undefined);
    expect(ipcListeners.get("gateway:discovery")?.size ?? 0).toBe(0);
  });
});
