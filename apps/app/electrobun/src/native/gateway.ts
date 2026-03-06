/**
 * Gateway Native Module for Electrobun
 *
 * Provides mDNS/Bonjour discovery for local gateway servers.
 * Direct port from Electron — bonjour-service works in Bun runtime.
 */

import { EventEmitter } from "node:events";
import type {
  DiscoveryOptions,
  DiscoveryResult,
  GatewayEndpoint,
} from "../rpc-schema";

type SendToWebview = (message: string, payload?: unknown) => void;

interface BonjourService {
  name: string;
  host: string;
  port: number;
  txt?: Record<string, string>;
  addresses?: string[];
}

interface BonjourBrowser {
  on(event: string, callback: (service: BonjourService) => void): void;
  stop(): void;
}

interface BonjourModule {
  find(options: { type: string }): BonjourBrowser;
}

type BonjourFactory = () => BonjourModule;
type BonjourModuleProvider = BonjourFactory | { default: BonjourFactory };

let bonjourModule: BonjourModuleProvider | null = null;

async function loadDiscoveryModule(): Promise<boolean> {
  const packages = ["bonjour-service", "bonjour", "mdns-js"];
  for (const pkg of packages) {
    try {
      bonjourModule = (await import(pkg)) as BonjourModuleProvider;
      console.log(`[Gateway] Loaded ${pkg} module`);
      return true;
    } catch {}
  }

  console.warn(
    "[Gateway] No mDNS/Bonjour module available. Install bonjour-service for local discovery.",
  );
  return false;
}

export class GatewayDiscovery extends EventEmitter {
  private discoveredGateways: Map<string, GatewayEndpoint> = new Map();
  private browser: BonjourBrowser | null = null;
  private isDiscovering = false;
  private moduleLoaded = false;
  private sendToWebview: SendToWebview | null = null;

  setSendToWebview(fn: SendToWebview): void {
    this.sendToWebview = fn;
  }

  async startDiscovery(options?: DiscoveryOptions): Promise<DiscoveryResult> {
    if (this.isDiscovering) {
      return {
        gateways: Array.from(this.discoveredGateways.values()),
        status: "Already discovering",
      };
    }

    if (!this.moduleLoaded) {
      this.moduleLoaded = await loadDiscoveryModule();
    }

    if (!bonjourModule) {
      return {
        gateways: [],
        status: "Discovery unavailable (no mDNS module)",
      };
    }

    const serviceType = options?.serviceType ?? "_milady._tcp";
    this.discoveredGateways.clear();
    this.isDiscovering = true;

    try {
      const factory =
        typeof bonjourModule === "function"
          ? bonjourModule
          : bonjourModule.default;
      if (!factory) {
        return { gateways: [], status: "Discovery module not initialized" };
      }

      const bonjour = factory();
      const type = serviceType.replace(/^_/, "").replace(/\._tcp$/, "");
      this.browser = bonjour.find({ type });

      this.browser.on("up", (service: BonjourService) => {
        this.handleServiceFound(service);
      });

      this.browser.on("down", (service: BonjourService) => {
        this.handleServiceLost(service);
      });

      if (options?.timeout) {
        setTimeout(() => this.stopDiscovery(), options.timeout);
      }

      return {
        gateways: Array.from(this.discoveredGateways.values()),
        status: "Discovery started",
      };
    } catch (error) {
      this.isDiscovering = false;
      return {
        gateways: [],
        status: error instanceof Error ? error.message : "Discovery failed",
      };
    }
  }

  private handleServiceFound(service: BonjourService): void {
    const txt = service.txt ?? {};
    const stableId =
      txt.id ?? `${service.name}-${service.host}:${service.port}`;
    const tlsEnabled =
      txt.protocol === "wss" || txt.tlsEnabled === "true" || txt.tls === "true";
    const gatewayPort = this.parseNumber(txt.gatewayPort) ?? service.port;
    const canvasPort = this.parseNumber(txt.canvasPort);

    const endpoint: GatewayEndpoint = {
      stableId,
      name: service.name,
      host: service.addresses?.[0] ?? service.host,
      port: service.port,
      lanHost: service.host,
      tailnetDns: txt.tailnetDns,
      gatewayPort,
      canvasPort,
      tlsEnabled,
      tlsFingerprintSha256: txt.tlsFingerprintSha256,
      isLocal: true,
    };

    const isUpdate = this.discoveredGateways.has(stableId);
    this.discoveredGateways.set(stableId, endpoint);
    this.emit(isUpdate ? "updated" : "discovered", endpoint);
    this.sendToWebview?.("gatewayDiscovery", {
      type: isUpdate ? "updated" : "found",
      gateway: endpoint,
    });
  }

  private handleServiceLost(service: BonjourService): void {
    for (const [id, gateway] of this.discoveredGateways) {
      if (
        (service.name && gateway.name === service.name) ||
        (service.host && gateway.host === service.host) ||
        (service.port && gateway.port === service.port)
      ) {
        this.discoveredGateways.delete(id);
        this.emit("lost", gateway);
        this.sendToWebview?.("gatewayDiscovery", {
          type: "lost",
          gateway,
        });
        break;
      }
    }
  }

  async stopDiscovery(): Promise<void> {
    if (!this.isDiscovering) return;
    this.browser?.stop();
    this.browser = null;
    this.isDiscovering = false;
  }

  getDiscoveredGateways(): GatewayEndpoint[] {
    return Array.from(this.discoveredGateways.values());
  }

  isDiscoveryActive(): boolean {
    return this.isDiscovering;
  }

  private parseNumber(value: string | undefined): number | undefined {
    if (!value) return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  dispose(): void {
    this.stopDiscovery();
    this.discoveredGateways.clear();
    this.removeAllListeners();
    this.sendToWebview = null;
  }
}

let gatewayDiscovery: GatewayDiscovery | null = null;

export function getGatewayDiscovery(): GatewayDiscovery {
  if (!gatewayDiscovery) {
    gatewayDiscovery = new GatewayDiscovery();
  }
  return gatewayDiscovery;
}
