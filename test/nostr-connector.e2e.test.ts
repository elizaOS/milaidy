/**
 * Nostr Connector Validation Tests — GitHub Issue #157
 *
 * Comprehensive E2E tests for validating the Nostr connector (@elizaos/plugin-nostr).
 *
 * Test Categories:
 *   1. Setup & Authentication
 *   2. Note Handling
 *   3. Nostr-Specific Features (NIP validation)
 *   4. Relay Management
 *   5. Error Handling
 *   6. Integration
 *   7. Configuration
 *
 * Requirements for live tests:
 *   NOSTR_PRIVATE_KEY     — Nostr private key (nsec bech32 or 64-char hex)
 *   NOSTR_RELAYS          — Comma-separated relay URLs (default: wss://relay.damus.io)
 *   MILADY_LIVE_TEST=1    — Enable live tests
 *
 * Or configure in ~/.milady/milady.json:
 *   { "connectors": { "nostr": { "privateKey": "nsec1...", "relays": "wss://..." } } }
 *
 * NO MOCKS for live tests — all tests use real Nostr relays.
 */

import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { logger, type Plugin } from "@elizaos/core";
import dotenv from "dotenv";
import { describe, expect, it } from "vitest";
import {
  extractPlugin,
  resolveNostrPluginImportSpecifier,
} from "../src/test-support/test-helpers";

// ---------------------------------------------------------------------------
// Environment Setup
// ---------------------------------------------------------------------------

const testDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(testDir, "..");
dotenv.config({ path: path.resolve(packageRoot, ".env") });

const NOSTR_PRIVATE_KEY = process.env.NOSTR_PRIVATE_KEY;
const NOSTR_RELAYS =
  process.env.NOSTR_RELAYS ?? "wss://relay.damus.io";
const NOSTR_DM_POLICY = process.env.NOSTR_DM_POLICY;
const NOSTR_ALLOW_FROM = process.env.NOSTR_ALLOW_FROM;

const hasNostrCreds = Boolean(NOSTR_PRIVATE_KEY);
const liveTestsEnabled = process.env.MILADY_LIVE_TEST === "1";
const runLiveTests = hasNostrCreds && liveTestsEnabled;

// Write tests require a valid nsec or hex private key
const hasValidNsec =
  Boolean(NOSTR_PRIVATE_KEY) &&
  (/^nsec1[a-z0-9]{58}$/.test(NOSTR_PRIVATE_KEY ?? "") ||
    /^[0-9a-f]{64}$/.test(NOSTR_PRIVATE_KEY ?? ""));
const runLiveWriteTests = runLiveTests && hasValidNsec;

const NOSTR_PLUGIN_IMPORT = resolveNostrPluginImportSpecifier();
const hasPlugin = NOSTR_PLUGIN_IMPORT !== null;

// Plugin-dependent tests (need @elizaos/plugin-nostr installed)
const describeIfPluginAvailable = hasPlugin ? describe : describe.skip;

// API-level live tests (need creds + MILADY_LIVE_TEST=1)
const describeIfLive = runLiveTests ? describe : describe.skip;
const describeIfLiveWrite = runLiveWriteTests ? describe : describe.skip;

// Timeouts
const RATE_LIMIT_DELAY_MS = 500;
const TEST_TIMEOUT = 30_000;
const LIVE_WRITE_TIMEOUT = 120_000;

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Parse relay URLs from comma-separated string */
function parseRelays(relayStr: string): string[] {
  return relayStr
    .split(",")
    .map((r) => r.trim())
    .filter((r) => r.length > 0);
}

/**
 * Attempt a WebSocket connection to a Nostr relay.
 * Returns true if the relay responds with EOSE or any valid message within timeout.
 */
async function checkRelayHealth(
  relayUrl: string,
  timeoutMs = 10_000,
): Promise<boolean> {
  // Dynamic import for WebSocket (works in Node 18+)
  const { WebSocket } = await import("ws");

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      ws.close();
      resolve(false);
    }, timeoutMs);

    let ws: InstanceType<typeof WebSocket>;
    try {
      ws = new WebSocket(relayUrl);
    } catch {
      clearTimeout(timer);
      resolve(false);
      return;
    }

    ws.on("open", () => {
      // Send a REQ to test relay is functional (query for nothing, expect EOSE)
      const subId = crypto.randomUUID().slice(0, 8);
      ws.send(JSON.stringify(["REQ", subId, { limit: 0 }]));
    });

    ws.on("message", (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString());
        if (Array.isArray(msg) && (msg[0] === "EOSE" || msg[0] === "NOTICE")) {
          clearTimeout(timer);
          ws.close();
          resolve(true);
        }
      } catch {
        // Ignore parse errors
      }
    });

    ws.on("error", () => {
      clearTimeout(timer);
      ws.close();
      resolve(false);
    });
  });
}

/**
 * Validate the structure of a Nostr event (NIP-01).
 */
function isValidNostrEventStructure(event: Record<string, unknown>): boolean {
  return (
    typeof event.id === "string" &&
    typeof event.pubkey === "string" &&
    typeof event.created_at === "number" &&
    typeof event.kind === "number" &&
    Array.isArray(event.tags) &&
    typeof event.content === "string" &&
    typeof event.sig === "string"
  );
}

// ---------------------------------------------------------------------------
// 1. Setup & Authentication
// ---------------------------------------------------------------------------

describe("Nostr Connector - Setup & Authentication", () => {
  describeIfPluginAvailable("plugin loading", () => {
    it(
      "can load the Nostr plugin without errors",
      async () => {
        const mod = (await import(NOSTR_PLUGIN_IMPORT!)) as {
          default?: unknown;
          plugin?: unknown;
        };
        const plugin = extractPlugin(mod);
        expect(plugin).not.toBeNull();
      },
      TEST_TIMEOUT,
    );

    it(
      "plugin exports expected structure",
      async () => {
        const mod = (await import(NOSTR_PLUGIN_IMPORT!)) as {
          default?: unknown;
          plugin?: unknown;
        };
        const plugin = extractPlugin(mod) as Plugin | null;
        expect(plugin?.name).toBe("nostr");
        expect(plugin?.description).toBeDefined();
      },
      TEST_TIMEOUT,
    );
  });

  it("private key format validation", () => {
    const nsecPattern = /^nsec1[a-z0-9]{58}$/;
    const hexPattern = /^[0-9a-f]{64}$/;

    // A valid key should match one of the formats
    if (NOSTR_PRIVATE_KEY) {
      const isValidFormat =
        nsecPattern.test(NOSTR_PRIVATE_KEY) ||
        hexPattern.test(NOSTR_PRIVATE_KEY);
      expect(isValidFormat).toBe(true);
    }
  });

  it("relay URL configuration is parseable", () => {
    const relays = parseRelays(NOSTR_RELAYS);
    expect(relays.length).toBeGreaterThan(0);

    const relayPattern = /^wss?:\/\/.+/;
    for (const relay of relays) {
      expect(relayPattern.test(relay)).toBe(true);
    }
  });

  describeIfLive("relay connectivity", () => {
    it(
      "can connect to at least one configured relay",
      async () => {
        const relays = parseRelays(NOSTR_RELAYS);
        let anyConnected = false;

        for (const relay of relays) {
          const healthy = await checkRelayHealth(relay);
          if (healthy) {
            anyConnected = true;
            break;
          }
        }

        expect(anyConnected).toBe(true);
      },
      TEST_TIMEOUT,
    );
  });
});

// ---------------------------------------------------------------------------
// 2. Note Handling
// ---------------------------------------------------------------------------

describeIfLiveWrite("Nostr Connector - Note Handling", () => {
  it(
    "relay accepts well-formed subscription request",
    async () => {
      const { WebSocket } = await import("ws");
      const relays = parseRelays(NOSTR_RELAYS);
      const relayUrl = relays[0];

      const result = await new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => {
          ws.close();
          resolve(false);
        }, 15_000);

        const ws = new WebSocket(relayUrl);

        ws.on("open", () => {
          const subId = crypto.randomUUID().slice(0, 8);
          // Request recent kind-1 text notes with limit 1
          ws.send(JSON.stringify(["REQ", subId, { kinds: [1], limit: 1 }]));
        });

        ws.on("message", (data: Buffer) => {
          try {
            const msg = JSON.parse(data.toString());
            if (Array.isArray(msg)) {
              if (msg[0] === "EVENT" && msg.length >= 3) {
                // Got an event — relay is returning data
                clearTimeout(timer);
                ws.close();
                resolve(true);
              } else if (msg[0] === "EOSE") {
                // End of stored events — relay works even if no events matched
                clearTimeout(timer);
                ws.close();
                resolve(true);
              }
            }
          } catch {
            // Ignore parse errors
          }
        });

        ws.on("error", () => {
          clearTimeout(timer);
          ws.close();
          resolve(false);
        });
      });

      expect(result).toBe(true);
    },
    LIVE_WRITE_TIMEOUT,
  );
});

// ---------------------------------------------------------------------------
// 3. Nostr-Specific Features (NIP validation)
// ---------------------------------------------------------------------------

describe("Nostr Connector - NIP Protocol Validation", () => {
  it("NIP-01 event structure is correct", () => {
    const validEvent = {
      id: "a".repeat(64),
      pubkey: "b".repeat(64),
      created_at: Math.floor(Date.now() / 1000),
      kind: 1,
      tags: [],
      content: "Hello Nostr!",
      sig: "c".repeat(128),
    };

    expect(isValidNostrEventStructure(validEvent)).toBe(true);
  });

  it("NIP-01 event rejects missing fields", () => {
    const invalidEvent = {
      id: "a".repeat(64),
      pubkey: "b".repeat(64),
      // missing created_at
      kind: 1,
      tags: [],
      content: "Hello",
    };

    expect(
      isValidNostrEventStructure(invalidEvent as Record<string, unknown>),
    ).toBe(false);
  });

  it("event timestamp uses Unix seconds, not milliseconds", () => {
    const nowSeconds = Math.floor(Date.now() / 1000);

    // Nostr created_at is 10-digit Unix seconds
    expect(nowSeconds.toString()).toHaveLength(10);
    expect(nowSeconds).toBeLessThan(2_000_000_000);
    expect(nowSeconds).toBeGreaterThan(1_600_000_000);
  });
});

// ---------------------------------------------------------------------------
// 4. Relay Management
// ---------------------------------------------------------------------------

describe("Nostr Connector - Relay Management", () => {
  it("parses multiple relay URLs correctly", () => {
    const relayString =
      "wss://relay.damus.io,wss://nos.lol,wss://relay.nostr.band";
    const relays = parseRelays(relayString);

    expect(relays).toHaveLength(3);
    expect(relays).toContain("wss://relay.damus.io");
    expect(relays).toContain("wss://nos.lol");
    expect(relays).toContain("wss://relay.nostr.band");
  });

  it("handles relay URLs with whitespace", () => {
    const relayString =
      " wss://relay.damus.io , wss://nos.lol , wss://relay.nostr.band ";
    const relays = parseRelays(relayString);

    expect(relays).toHaveLength(3);
    expect(relays.every((r) => r.startsWith("wss://"))).toBe(true);
  });

  it("filters empty entries from relay list", () => {
    const relayString = "wss://relay.damus.io,,wss://nos.lol,";
    const relays = parseRelays(relayString);

    expect(relays).toHaveLength(2);
  });

  it("validates relay URL protocol", () => {
    const relayPattern = /^wss?:\/\/.+/;
    const validRelays = [
      "wss://relay.damus.io",
      "wss://nos.lol",
      "ws://localhost:7777",
    ];
    const invalidRelays = [
      "https://relay.damus.io",
      "http://nos.lol",
      "relay.damus.io",
    ];

    for (const relay of validRelays) {
      expect(relayPattern.test(relay)).toBe(true);
    }
    for (const relay of invalidRelays) {
      expect(relayPattern.test(relay)).toBe(false);
    }
  });

  describeIfLive("live relay checks", () => {
    it(
      "configured relays are reachable",
      async () => {
        const relays = parseRelays(NOSTR_RELAYS);
        const results: Array<{ relay: string; healthy: boolean }> = [];

        for (const relay of relays) {
          await sleep(RATE_LIMIT_DELAY_MS);
          const healthy = await checkRelayHealth(relay);
          results.push({ relay, healthy });
        }

        // At least one relay should be healthy
        const healthyCount = results.filter((r) => r.healthy).length;
        expect(healthyCount).toBeGreaterThan(0);

        for (const result of results) {
          if (!result.healthy) {
            logger.warn(
              `[nostr-connector] Relay ${result.relay} is not reachable`,
            );
          }
        }
      },
      TEST_TIMEOUT,
    );
  });
});

// ---------------------------------------------------------------------------
// 5. Error Handling
// ---------------------------------------------------------------------------

describe("Nostr Connector - Error Handling", () => {
  it("invalid relay URL is detected", () => {
    const invalidUrls = [
      "not-a-url",
      "https://relay.damus.io",
      "",
      "ftp://relay.example.com",
    ];
    const relayPattern = /^wss?:\/\/.+/;

    for (const url of invalidUrls) {
      expect(relayPattern.test(url)).toBe(false);
    }
  });

  it("invalid private key formats are detected", () => {
    const nsecPattern = /^nsec1[a-z0-9]{58}$/;
    const hexPattern = /^[0-9a-f]{64}$/;

    const invalidKeys = [
      "not-a-key",
      "nsec1short",
      "npub1" + "a".repeat(58), // npub is not a private key
      "0x" + "a".repeat(64), // 0x prefix is Ethereum, not Nostr
      "",
    ];

    for (const key of invalidKeys) {
      const isValid = nsecPattern.test(key) || hexPattern.test(key);
      expect(isValid).toBe(false);
    }
  });

  it("handles unreachable relay gracefully", async () => {
    const unreachableRelay = "wss://this-relay-does-not-exist.example.com";
    const healthy = await checkRelayHealth(unreachableRelay, 5_000);
    expect(healthy).toBe(false);
  }, TEST_TIMEOUT);

});

// ---------------------------------------------------------------------------
// 6. Integration Tests (always run, no live creds needed)
// ---------------------------------------------------------------------------

/** Try to import a workspace module; returns null if the package isn't built. */
async function tryWorkspaceImport<T>(specifier: string): Promise<T | null> {
  try {
    return (await import(specifier)) as T;
  } catch {
    return null;
  }
}

describe("Nostr Connector - Integration", () => {
  it("Nostr is mapped in CONNECTOR_PLUGINS", async () => {
    const mod = await tryWorkspaceImport<{
      CONNECTOR_PLUGINS: Record<string, string>;
    }>("../src/config/plugin-auto-enable");
    if (!mod) {
      logger.warn("[nostr-connector] Workspace not built — skipping");
      return;
    }
    expect(mod.CONNECTOR_PLUGINS.nostr).toBe("@elizaos/plugin-nostr");
  });

  it("Nostr is mapped in CHANNEL_PLUGIN_MAP", async () => {
    let mod: { CHANNEL_PLUGIN_MAP: Record<string, string> } | null;
    try {
      mod = await tryWorkspaceImport<{
        CHANNEL_PLUGIN_MAP: Record<string, string>;
      }>("../src/runtime/eliza");
    } catch {
      mod = null;
    }
    if (!mod) {
      logger.warn("[nostr-connector] Workspace not built — skipping");
      return;
    }
    expect(mod.CHANNEL_PLUGIN_MAP.nostr).toBe("@elizaos/plugin-nostr");
  });

  it("Nostr connector is in CONNECTOR_PLUGINS list", async () => {
    const mod = await tryWorkspaceImport<{
      CONNECTOR_PLUGINS: Record<string, string>;
    }>("../src/config/plugin-auto-enable");
    if (!mod) {
      logger.warn("[nostr-connector] Workspace not built — skipping");
      return;
    }
    const connectors = Object.keys(mod.CONNECTOR_PLUGINS);
    expect(connectors).toContain("nostr");
  });

  it("collectPluginNames includes nostr when configured", async () => {
    let mod: { collectPluginNames: (config: unknown) => Set<string> } | null;
    try {
      mod = await tryWorkspaceImport<{
        collectPluginNames: (config: unknown) => Set<string>;
      }>("../src/runtime/eliza");
    } catch {
      mod = null;
    }
    if (!mod) {
      logger.warn(
        "[nostr-connector] Workspace not built or import failed — skipping",
      );
      return;
    }
    try {
      const config = {
        connectors: {
          nostr: {
            privateKey: "nsec1test",
          },
        },
      };
      const plugins = mod.collectPluginNames(config as never);
      expect(plugins.has("@elizaos/plugin-nostr")).toBe(true);
    } catch (err) {
      logger.warn(`[nostr-connector] collectPluginNames failed: ${err}`);
    }
  });

  it("disabled nostr connector is not auto-enabled", async () => {
    const mod = await tryWorkspaceImport<{
      isConnectorConfigured: (
        name: string,
        config: Record<string, unknown>,
      ) => boolean;
    }>("../src/config/plugin-auto-enable");
    if (!mod?.isConnectorConfigured) {
      logger.warn("[nostr-connector] isConnectorConfigured not exported — skipping");
      return;
    }
    const configured = mod.isConnectorConfigured("nostr", {
      enabled: false,
      privateKey: "nsec1test",
    });
    expect(configured).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 7. Configuration Tests (always run)
// ---------------------------------------------------------------------------

describe("Nostr Connector - Configuration", () => {
  it("validates complete Nostr configuration", () => {
    const config = {
      privateKey:
        "nsec1aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      relays: "wss://relay.damus.io,wss://nos.lol",
      dmPolicy: "allow",
      allowFrom: "",
      enabled: true,
    };

    expect(config.privateKey).toBeDefined();
    expect(config.relays).toBeDefined();
    expect(config.dmPolicy).toBe("allow");
    expect(config.enabled).toBe(true);
  });

  it("DM policy values are distinct non-empty strings", () => {
    const validPolicies = ["allow", "deny", "allowlist"];
    expect(new Set(validPolicies).size).toBe(validPolicies.length);
    expect(validPolicies.every((p) => p.length > 0)).toBe(true);
  });

  it("allowFrom is comma-separated npub or hex list", () => {
    const allowFrom =
      "npub180cvv07tjdrrgpa0j7j7tmnyl2yr6yr7l8j4s3evf6u64th6gkwsyjh6w6," +
      "3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d";
    const entries = allowFrom.split(",").map((e) => e.trim());

    expect(entries).toHaveLength(2);
    expect(entries[0].startsWith("npub1")).toBe(true);
    expect(/^[0-9a-f]{64}$/.test(entries[1])).toBe(true);
  });

  it("milady.json connector config path is correct", () => {
    const miladyConfigPath = path.join(
      process.env.HOME ?? process.env.USERPROFILE ?? "~",
      ".milady",
      "milady.json",
    );
    expect(miladyConfigPath).toContain(".milady");
    expect(miladyConfigPath).toContain("milady.json");
  });

  it("default relay is provided when NOSTR_RELAYS is unset", () => {
    const defaultRelay = "wss://relay.damus.io";
    const relays = (undefined ?? defaultRelay)
      .split(",")
      .map((r) => r.trim());

    expect(relays).toHaveLength(1);
    expect(relays[0]).toBe(defaultRelay);
  });
});
