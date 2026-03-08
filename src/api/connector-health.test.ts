import type { AgentRuntime } from "@elizaos/core";
import { describe, expect, it, vi } from "vitest";
import { ConnectorHealthMonitor } from "./connector-health";

function makeRuntime(
  services: Record<string, unknown> = {},
  clients: Record<string, unknown> = {},
): AgentRuntime {
  return {
    getService: (name: string) => services[name] ?? null,
    clients,
  } as unknown as AgentRuntime;
}

describe("ConnectorHealthMonitor", () => {
  it("detects configured connectors from config", () => {
    const broadcastWs = vi.fn();
    const monitor = new ConnectorHealthMonitor({
      runtime: makeRuntime(),
      config: {
        connectors: {
          discord: { enabled: true },
          telegram: { enabled: true },
        },
      },
      broadcastWs,
    });

    monitor.check();
    const statuses = monitor.getConnectorStatuses();
    expect(Object.keys(statuses)).toContain("discord");
    expect(Object.keys(statuses)).toContain("telegram");
  });

  it('reports "ok" when plugin is loaded via getService', () => {
    const broadcastWs = vi.fn();
    const monitor = new ConnectorHealthMonitor({
      runtime: makeRuntime({ discord: { name: "discord" } }),
      config: { connectors: { discord: { enabled: true } } },
      broadcastWs,
    });

    monitor.check();
    expect(monitor.getConnectorStatuses().discord).toBe("ok");
  });

  it('reports "ok" when plugin is in runtime.clients', () => {
    const broadcastWs = vi.fn();
    const monitor = new ConnectorHealthMonitor({
      runtime: makeRuntime({}, { discord: { connected: true } }),
      config: { connectors: { discord: { enabled: true } } },
      broadcastWs,
    });

    monitor.check();
    expect(monitor.getConnectorStatuses().discord).toBe("ok");
  });

  it('reports "missing" when plugin is not loaded', () => {
    const broadcastWs = vi.fn();
    const monitor = new ConnectorHealthMonitor({
      runtime: makeRuntime(),
      config: { connectors: { discord: { enabled: true } } },
      broadcastWs,
    });

    monitor.check();
    expect(monitor.getConnectorStatuses().discord).toBe("missing");
  });

  it('fires system-warning WS event on transition to "missing"', () => {
    const broadcastWs = vi.fn();
    const monitor = new ConnectorHealthMonitor({
      runtime: makeRuntime(),
      config: { connectors: { discord: { enabled: true } } },
      broadcastWs,
    });

    monitor.check();
    expect(broadcastWs).toHaveBeenCalledWith({
      type: "system-warning",
      message: "Discord connector appears disconnected",
    });
  });

  it("does not fire warning repeatedly for same connector", () => {
    const broadcastWs = vi.fn();
    const monitor = new ConnectorHealthMonitor({
      runtime: makeRuntime(),
      config: { connectors: { discord: { enabled: true } } },
      broadcastWs,
    });

    monitor.check();
    monitor.check();
    monitor.check();

    // Should only fire once on the first transition
    expect(broadcastWs).toHaveBeenCalledTimes(1);
  });

  it('reports "unknown" for unrecognized connector types', () => {
    const broadcastWs = vi.fn();
    const monitor = new ConnectorHealthMonitor({
      runtime: makeRuntime(),
      config: { connectors: { customBot: { enabled: true } } },
      broadcastWs,
    });

    monitor.check();
    expect(monitor.getConnectorStatuses().customBot).toBe("unknown");
    // No warning for unknown connectors
    expect(broadcastWs).not.toHaveBeenCalled();
  });

  it("skips disabled connectors", () => {
    const broadcastWs = vi.fn();
    const monitor = new ConnectorHealthMonitor({
      runtime: makeRuntime(),
      config: {
        connectors: { discord: { enabled: false } },
      },
      broadcastWs,
    });

    monitor.check();
    expect(Object.keys(monitor.getConnectorStatuses())).toHaveLength(0);
  });

  it("fires warning again after recovery and re-loss", () => {
    const broadcastWs = vi.fn();
    let hasDiscord = false;

    const runtime = {
      getService: (name: string) =>
        name === "discord" && hasDiscord ? {} : null,
      clients: {},
    } as unknown as AgentRuntime;

    const monitor = new ConnectorHealthMonitor({
      runtime,
      config: { connectors: { discord: { enabled: true } } },
      broadcastWs,
    });

    // First check: missing (fires warning)
    monitor.check();
    expect(broadcastWs).toHaveBeenCalledTimes(1);

    // Recovery: ok
    hasDiscord = true;
    monitor.check();
    expect(monitor.getConnectorStatuses().discord).toBe("ok");

    // Re-loss: missing again (should fire warning again)
    hasDiscord = false;
    monitor.check();
    expect(broadcastWs).toHaveBeenCalledTimes(2);
  });
});
