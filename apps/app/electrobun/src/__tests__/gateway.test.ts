import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GatewayDiscovery } from "../native/gateway";

// Mock bonjour-service to avoid actually loading the native module
vi.mock("bonjour-service", () => {
  return {
    default: undefined,
  };
});

// Helper: access private methods for unit testing.
// biome-ignore lint/suspicious/noExplicitAny: accessing private methods for unit testing
type PrivateGateway = GatewayDiscovery & Record<string, any>;

interface BonjourServiceLike {
  name: string;
  host: string;
  port: number;
  addresses?: string[];
  txt?: Record<string, string>;
}

function callHandleServiceFound(
  d: GatewayDiscovery,
  service: BonjourServiceLike,
): void {
  (d as unknown as PrivateGateway).handleServiceFound(service);
}

function callHandleServiceLost(
  d: GatewayDiscovery,
  service: BonjourServiceLike,
): void {
  (d as unknown as PrivateGateway).handleServiceLost(service);
}

describe("GatewayDiscovery", () => {
  let discovery: GatewayDiscovery;

  beforeEach(() => {
    discovery = new GatewayDiscovery();
  });

  afterEach(() => {
    discovery.dispose();
  });

  describe("initial state", () => {
    it("has no discovered gateways", () => {
      expect(discovery.getDiscoveredGateways()).toEqual([]);
    });

    it("is not discovering", () => {
      expect(discovery.isDiscoveryActive()).toBe(false);
    });
  });

  describe("handleServiceFound (via exposed event handling)", () => {
    it("parses basic service info into a GatewayEndpoint", () => {
      callHandleServiceFound(discovery, {
        name: "milady-gateway",
        host: "192.168.1.100",
        port: 8080,
        addresses: ["192.168.1.100"],
        txt: {},
      });

      const gateways = discovery.getDiscoveredGateways();
      expect(gateways).toHaveLength(1);

      const gw = gateways[0];
      expect(gw.name).toBe("milady-gateway");
      expect(gw.host).toBe("192.168.1.100");
      expect(gw.port).toBe(8080);
      expect(gw.isLocal).toBe(true);
      expect(gw.tlsEnabled).toBe(false);
    });

    it("uses txt.id as stableId when present", () => {
      callHandleServiceFound(discovery, {
        name: "test-gw",
        host: "10.0.0.1",
        port: 3000,
        txt: { id: "custom-stable-id" },
      });

      const gw = discovery.getDiscoveredGateways()[0];
      expect(gw.stableId).toBe("custom-stable-id");
    });

    it("generates stableId from name-host:port when txt.id is absent", () => {
      callHandleServiceFound(discovery, {
        name: "my-gateway",
        host: "10.0.0.1",
        port: 3000,
        txt: {},
      });

      const gw = discovery.getDiscoveredGateways()[0];
      expect(gw.stableId).toBe("my-gateway-10.0.0.1:3000");
    });

    it("detects TLS from txt.protocol = wss", () => {
      callHandleServiceFound(discovery, {
        name: "secure-gw",
        host: "10.0.0.1",
        port: 443,
        txt: { protocol: "wss" },
      });

      expect(discovery.getDiscoveredGateways()[0].tlsEnabled).toBe(true);
    });

    it("detects TLS from txt.tlsEnabled = true", () => {
      callHandleServiceFound(discovery, {
        name: "secure-gw",
        host: "10.0.0.1",
        port: 443,
        txt: { tlsEnabled: "true" },
      });

      expect(discovery.getDiscoveredGateways()[0].tlsEnabled).toBe(true);
    });

    it("detects TLS from txt.tls = true", () => {
      callHandleServiceFound(discovery, {
        name: "secure-gw",
        host: "10.0.0.1",
        port: 443,
        txt: { tls: "true" },
      });

      expect(discovery.getDiscoveredGateways()[0].tlsEnabled).toBe(true);
    });

    it("parses gatewayPort and canvasPort from txt", () => {
      callHandleServiceFound(discovery, {
        name: "gw",
        host: "10.0.0.1",
        port: 8080,
        txt: {
          gatewayPort: "9090",
          canvasPort: "9091",
        },
      });

      const gw = discovery.getDiscoveredGateways()[0];
      expect(gw.gatewayPort).toBe(9090);
      expect(gw.canvasPort).toBe(9091);
    });

    it("falls back to service.port for gatewayPort when txt.gatewayPort is absent", () => {
      callHandleServiceFound(discovery, {
        name: "gw",
        host: "10.0.0.1",
        port: 8080,
        txt: {},
      });

      const gw = discovery.getDiscoveredGateways()[0];
      expect(gw.gatewayPort).toBe(8080);
    });

    it("ignores non-numeric port values", () => {
      callHandleServiceFound(discovery, {
        name: "gw",
        host: "10.0.0.1",
        port: 8080,
        txt: {
          gatewayPort: "not-a-number",
          canvasPort: "NaN",
        },
      });

      const gw = discovery.getDiscoveredGateways()[0];
      // gatewayPort should fall back to service.port when txt is invalid
      expect(gw.gatewayPort).toBe(8080);
      expect(gw.canvasPort).toBeUndefined();
    });

    it("prefers addresses[0] over host", () => {
      callHandleServiceFound(discovery, {
        name: "gw",
        host: "hostname.local",
        port: 8080,
        addresses: ["192.168.1.50", "10.0.0.1"],
        txt: {},
      });

      const gw = discovery.getDiscoveredGateways()[0];
      expect(gw.host).toBe("192.168.1.50");
      expect(gw.lanHost).toBe("hostname.local");
    });

    it("falls back to host when addresses is empty or undefined", () => {
      callHandleServiceFound(discovery, {
        name: "gw",
        host: "fallback-host",
        port: 8080,
        addresses: [],
        txt: {},
      });

      expect(discovery.getDiscoveredGateways()[0].host).toBe("fallback-host");
    });

    it("stores tailnetDns and tlsFingerprintSha256 from txt", () => {
      callHandleServiceFound(discovery, {
        name: "gw",
        host: "10.0.0.1",
        port: 8080,
        txt: {
          tailnetDns: "my-node.ts.net",
          tlsFingerprintSha256: "abc123",
        },
      });

      const gw = discovery.getDiscoveredGateways()[0];
      expect(gw.tailnetDns).toBe("my-node.ts.net");
      expect(gw.tlsFingerprintSha256).toBe("abc123");
    });

    it("emits updated event when same stableId is found again", () => {
      const events: string[] = [];
      discovery.on("discovered", () => events.push("discovered"));
      discovery.on("updated", () => events.push("updated"));

      callHandleServiceFound(discovery, {
        name: "gw",
        host: "10.0.0.1",
        port: 8080,
        txt: { id: "same-id" },
      });

      callHandleServiceFound(discovery, {
        name: "gw",
        host: "10.0.0.2",
        port: 8080,
        txt: { id: "same-id" },
      });

      expect(events).toEqual(["discovered", "updated"]);
      expect(discovery.getDiscoveredGateways()).toHaveLength(1);
      // Updated host
      expect(discovery.getDiscoveredGateways()[0].host).toBe("10.0.0.2");
    });

    it("sends webview message on discovery", () => {
      const messages: Array<{ message: string; payload: unknown }> = [];
      discovery.setSendToWebview((message, payload) => {
        messages.push({ message, payload });
      });

      callHandleServiceFound(discovery, {
        name: "gw",
        host: "10.0.0.1",
        port: 8080,
        txt: {},
      });

      expect(messages).toHaveLength(1);
      expect(messages[0].message).toBe("gatewayDiscovery");
      const payload = messages[0].payload as { type: string };
      expect(payload.type).toBe("found");
    });
  });

  describe("handleServiceLost", () => {
    it("removes a gateway by matching name", () => {
      callHandleServiceFound(discovery, {
        name: "gw-to-remove",
        host: "10.0.0.1",
        port: 8080,
        txt: {},
      });

      expect(discovery.getDiscoveredGateways()).toHaveLength(1);

      callHandleServiceLost(discovery, {
        name: "gw-to-remove",
        host: "",
        port: 0,
      });

      expect(discovery.getDiscoveredGateways()).toHaveLength(0);
    });

    it("emits lost event", () => {
      const lostEvents: unknown[] = [];
      discovery.on("lost", (gw) => lostEvents.push(gw));

      callHandleServiceFound(discovery, {
        name: "gw",
        host: "10.0.0.1",
        port: 8080,
        txt: {},
      });

      callHandleServiceLost(discovery, {
        name: "gw",
        host: "10.0.0.1",
        port: 8080,
      });

      expect(lostEvents).toHaveLength(1);
    });
  });

  describe("startDiscovery", () => {
    it("returns non-success status when no mDNS module is functional", async () => {
      const result = await discovery.startDiscovery();
      // The mock returns { default: undefined }, so the factory check fails
      // with "Discovery module not initialized" or "unavailable" depending on
      // the mock. Either way, no gateways should be returned.
      expect(result.gateways).toEqual([]);
      expect(result.status).not.toBe("Discovery started");
    });
  });

  describe("stopDiscovery", () => {
    it("is a no-op when not discovering", async () => {
      await expect(discovery.stopDiscovery()).resolves.toBeUndefined();
      expect(discovery.isDiscoveryActive()).toBe(false);
    });
  });

  describe("dispose", () => {
    it("clears all gateways and listeners", () => {
      callHandleServiceFound(discovery, {
        name: "gw",
        host: "10.0.0.1",
        port: 8080,
        txt: {},
      });

      expect(discovery.getDiscoveredGateways()).toHaveLength(1);

      discovery.dispose();

      expect(discovery.getDiscoveredGateways()).toEqual([]);
    });
  });
});
