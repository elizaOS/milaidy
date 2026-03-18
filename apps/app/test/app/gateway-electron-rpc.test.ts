// @vitest-environment jsdom

import type { ElectrobunRendererRpc } from "@elizaos/app-core/bridge";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GatewayElectron } from "../../plugins/gateway/electron/src/index.ts";

type TestWindow = Window & {
  __ELIZA_ELECTROBUN_RPC__?: ElectrobunRendererRpc;
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
    delete (window as TestWindow).__ELIZA_ELECTROBUN_RPC__;
    vi.restoreAllMocks();
  });

  it("prefers direct Electrobun RPC for discovery and gateway events", async () => {
    const listeners = new Map<string, Set<(payload: unknown) => void>>();
    const gatewayStartDiscovery = vi.fn().mockResolvedValue({
      gateways: [],
      status: "Discovery started",
    });
    const gatewayStopDiscovery = vi.fn().mockResolvedValue(undefined);

    (window as TestWindow).__ELIZA_ELECTROBUN_RPC__ = {
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

  it("reports discovery as unavailable when direct Electrobun RPC is unavailable", async () => {
    const plugin = new GatewayElectron();
    const discoveryListener = vi.fn();
    await plugin.addListener("discovery", discoveryListener);

    await expect(plugin.startDiscovery()).resolves.toEqual({
      gateways: [],
      status: "Discovery not available on this platform",
    });

    await plugin.stopDiscovery();
    expect(discoveryListener).not.toHaveBeenCalled();
  });
});
