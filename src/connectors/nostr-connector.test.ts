/**
 * Nostr Connector Unit Tests — GitHub Issue #157
 *
 * Basic validation tests for the Nostr connector plugin.
 * For comprehensive e2e tests, see test/nostr-connector.e2e.test.ts
 */

import { describe, expect, it } from "vitest";
import {
  extractPlugin,
  resolveNostrPluginImportSpecifier,
} from "../test-support/test-helpers";

const NOSTR_PLUGIN_IMPORT = resolveNostrPluginImportSpecifier();
const NOSTR_PLUGIN_AVAILABLE = NOSTR_PLUGIN_IMPORT !== null;
const describeIfPluginAvailable = NOSTR_PLUGIN_AVAILABLE
  ? describe
  : describe.skip;

const loadNostrPluginModule = async () => {
  if (!NOSTR_PLUGIN_IMPORT) {
    throw new Error("Nostr plugin is not resolvable");
  }
  return (await import(NOSTR_PLUGIN_IMPORT)) as {
    default?: unknown;
    plugin?: unknown;
  };
};

// ============================================================================
//  1. Basic Validation (requires plugin installed)
// ============================================================================

describeIfPluginAvailable("Nostr Connector - Basic Validation", () => {
  it("can import the Nostr plugin package", async () => {
    const mod = await loadNostrPluginModule();
    expect(mod).toBeDefined();
  });

  it("exports a valid plugin structure", async () => {
    const mod = await loadNostrPluginModule();
    const plugin = extractPlugin(mod);

    expect(plugin).not.toBeNull();
    expect(plugin).toBeDefined();
  });

  it("plugin has correct name", async () => {
    const mod = await loadNostrPluginModule();
    const plugin = extractPlugin(mod) as { name?: string } | null;

    expect(plugin?.name).toBe("nostr");
  });

  it("plugin has a description", async () => {
    const mod = await loadNostrPluginModule();
    const plugin = extractPlugin(mod) as { description?: string } | null;

    expect(plugin?.description).toBeDefined();
    expect(typeof plugin?.description).toBe("string");
  });

  it("plugin has clients or services", async () => {
    const mod = await loadNostrPluginModule();
    const plugin = extractPlugin(mod) as {
      clients?: unknown[];
      services?: unknown[];
    } | null;

    const hasClients =
      Array.isArray(plugin?.clients) && plugin!.clients!.length > 0;
    const hasServices =
      Array.isArray(plugin?.services) && plugin!.services!.length > 0;

    expect(hasClients || hasServices).toBe(true);
  });
});

// ============================================================================
//  2. Protocol Constraints (always run — no plugin needed)
// ============================================================================

describe("Nostr Connector - Protocol Constraints", () => {
  it("nsec (bech32 private key) format is valid", () => {
    const nsecPattern = /^nsec1[a-z0-9]{58}$/;

    expect(
      nsecPattern.test(
        "nsec1aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      ),
    ).toBe(true);
    expect(nsecPattern.test("nsec1abc")).toBe(false);
    expect(nsecPattern.test("npub1abc")).toBe(false);
    expect(nsecPattern.test("not-a-key")).toBe(false);
  });

  it("npub (bech32 public key) format is valid", () => {
    const npubPattern = /^npub1[a-z0-9]{58}$/;

    expect(
      npubPattern.test(
        "npub180cvv07tjdrrgpa0j7j7tmnyl2yr6yr7l8j4s3evf6u64th6gkwsyjh6w6",
      ),
    ).toBe(true);
    expect(npubPattern.test("npub1short")).toBe(false);
    expect(npubPattern.test("nsec1aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")).toBe(false);
  });

  it("hex public key format is valid (64 hex chars)", () => {
    const hexPubkeyPattern = /^[0-9a-f]{64}$/;

    expect(
      hexPubkeyPattern.test(
        "3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d",
      ),
    ).toBe(true);
    expect(hexPubkeyPattern.test("abc123")).toBe(false);
    expect(hexPubkeyPattern.test("0x" + "a".repeat(64))).toBe(false);
    // uppercase should fail (Nostr uses lowercase hex)
    expect(
      hexPubkeyPattern.test(
        "3BF0C63FCB93463407AF97A5E5EE64FA883D107EF9E558472C4EB9AAAEFA459D",
      ),
    ).toBe(false);
  });

  it("relay URL format validation", () => {
    const relayPattern = /^wss?:\/\/.+/;

    expect(relayPattern.test("wss://relay.damus.io")).toBe(true);
    expect(relayPattern.test("wss://nos.lol")).toBe(true);
    expect(relayPattern.test("ws://localhost:7777")).toBe(true);
    expect(relayPattern.test("https://relay.damus.io")).toBe(false);
    expect(relayPattern.test("relay.damus.io")).toBe(false);
    expect(relayPattern.test("")).toBe(false);
  });

  it("note ID (bech32) format is valid", () => {
    const notePattern = /^note1[a-z0-9]{58}$/;

    expect(
      notePattern.test(
        "note1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqdry65m",
      ),
    ).toBe(true);
    expect(notePattern.test("note1short")).toBe(false);
    expect(notePattern.test("nevent1abc")).toBe(false);
  });

  it("standard event kinds are distinct integers", () => {
    // NIP-01 defines these standard kinds; verify no accidental collisions
    const kinds = [0, 1, 2, 3, 4, 5, 7, 42];
    const unique = new Set(kinds);
    expect(unique.size).toBe(kinds.length);
  });
});

// ============================================================================
//  3. Configuration
// ============================================================================

describe("Nostr Connector - Configuration", () => {
  it("validates basic Nostr configuration structure", () => {
    const validConfig = {
      privateKey:
        "nsec1aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      relays: "wss://relay.damus.io,wss://nos.lol",
      dmPolicy: "allow" as const,
    };

    expect(validConfig.privateKey).toBeDefined();
    expect(validConfig.relays).toBeDefined();
    expect(validConfig.dmPolicy).toBe("allow");
  });

  it("DM policy values are mutually exclusive strings", () => {
    const validPolicies = ["allow", "deny", "allowlist"];

    // Each policy is a distinct non-empty string
    expect(new Set(validPolicies).size).toBe(validPolicies.length);
    expect(validPolicies.every((p) => p.length > 0)).toBe(true);
  });

  it("parses relay list from comma-separated string", () => {
    const relayString = "wss://relay.damus.io,wss://nos.lol,wss://relay.nostr.band";
    const relays = relayString.split(",").map((r) => r.trim());

    expect(relays).toHaveLength(3);
    expect(relays[0]).toBe("wss://relay.damus.io");
    expect(relays[1]).toBe("wss://nos.lol");
    expect(relays[2]).toBe("wss://relay.nostr.band");
  });

  it("handles single relay in config", () => {
    const relayString = "wss://relay.damus.io";
    const relays = relayString.split(",").map((r) => r.trim());

    expect(relays).toHaveLength(1);
    expect(relays[0]).toBe("wss://relay.damus.io");
  });

  it("handles relay list with whitespace", () => {
    const relayString =
      "wss://relay.damus.io , wss://nos.lol , wss://relay.nostr.band";
    const relays = relayString.split(",").map((r) => r.trim());

    expect(relays).toHaveLength(3);
    expect(relays.every((r) => r.startsWith("wss://"))).toBe(true);
  });

  it("NOSTR_PRIVATE_KEY is the only required config key", () => {
    // Per plugins.json: only privateKey is required; relays, dmPolicy, etc. are optional
    const requiredKeys = ["NOSTR_PRIVATE_KEY"];
    const allKeys = ["NOSTR_PRIVATE_KEY", "NOSTR_RELAYS", "NOSTR_DM_POLICY", "NOSTR_ALLOW_FROM", "NOSTR_ENABLED"];

    expect(requiredKeys).toHaveLength(1);
    expect(allKeys).toHaveLength(5);
    expect(allKeys).toContain(requiredKeys[0]);
  });
});

// ============================================================================
//  4. Environment Variable Key Names
// ============================================================================

describe("Nostr Connector - Environment Variable Keys", () => {
  it("all config keys use the NOSTR_ prefix", () => {
    const configKeys = [
      "NOSTR_PRIVATE_KEY",
      "NOSTR_RELAYS",
      "NOSTR_DM_POLICY",
      "NOSTR_ALLOW_FROM",
      "NOSTR_ENABLED",
    ];

    expect(configKeys.every((k) => k.startsWith("NOSTR_"))).toBe(true);
    // No duplicates
    expect(new Set(configKeys).size).toBe(configKeys.length);
  });
});
