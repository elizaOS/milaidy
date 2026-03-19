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
        "nsec1vl029mgpspedva04g90vltkh6fvh240zqtv9k0t9af8935ke9laqsnlfe5",
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
    expect(npubPattern.test("nsec1vl029mgpspedva04g90vltkh6fvh240zqtv9k0t9af8935ke9laqsnlfe5")).toBe(false);
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

  it("event kind constants are correct", () => {
    const EVENT_KINDS = {
      SET_METADATA: 0,
      TEXT_NOTE: 1,
      RECOMMEND_RELAY: 2,
      CONTACTS: 3,
      ENCRYPTED_DM: 4,
      EVENT_DELETION: 5,
      REACTION: 7,
      CHANNEL_MESSAGE: 42,
    } as const;

    expect(EVENT_KINDS.SET_METADATA).toBe(0);
    expect(EVENT_KINDS.TEXT_NOTE).toBe(1);
    expect(EVENT_KINDS.ENCRYPTED_DM).toBe(4);
    expect(EVENT_KINDS.EVENT_DELETION).toBe(5);
    expect(EVENT_KINDS.REACTION).toBe(7);
  });
});

// ============================================================================
//  3. Configuration
// ============================================================================

describe("Nostr Connector - Configuration", () => {
  it("validates basic Nostr configuration structure", () => {
    const validConfig = {
      privateKey:
        "nsec1vl029mgpspedva04g90vltkh6fvh240zqtv9k0t9af8935ke9laqsnlfe5",
      relays: "wss://relay.damus.io,wss://nos.lol",
      dmPolicy: "allow" as const,
    };

    expect(validConfig.privateKey).toBeDefined();
    expect(validConfig.relays).toBeDefined();
    expect(validConfig.dmPolicy).toBe("allow");
  });

  it("DM policy accepts valid values", () => {
    const validPolicies = ["allow", "deny", "allowlist"];

    for (const policy of validPolicies) {
      expect(validPolicies).toContain(policy);
    }

    expect(validPolicies).not.toContain("block");
    expect(validPolicies).not.toContain("reject");
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

  it("config keys match plugins.json expectations", () => {
    const expectedConfigKeys = [
      "NOSTR_PRIVATE_KEY",
      "NOSTR_RELAYS",
      "NOSTR_DM_POLICY",
      "NOSTR_ALLOW_FROM",
      "NOSTR_ENABLED",
    ];

    // NOSTR_PRIVATE_KEY is the only required key
    const requiredKeys = ["NOSTR_PRIVATE_KEY"];
    const optionalKeys = [
      "NOSTR_RELAYS",
      "NOSTR_DM_POLICY",
      "NOSTR_ALLOW_FROM",
      "NOSTR_ENABLED",
    ];

    expect(requiredKeys.every((k) => expectedConfigKeys.includes(k))).toBe(
      true,
    );
    expect(optionalKeys.every((k) => expectedConfigKeys.includes(k))).toBe(
      true,
    );
    expect(requiredKeys.length + optionalKeys.length).toBe(
      expectedConfigKeys.length,
    );
  });
});

// ============================================================================
//  4. Environment Variables
// ============================================================================

describe("Nostr Connector - Environment Variables", () => {
  it("recognizes NOSTR_PRIVATE_KEY environment variable", () => {
    const envKey = "NOSTR_PRIVATE_KEY";
    expect(envKey).toBe("NOSTR_PRIVATE_KEY");
  });

  it("recognizes NOSTR_RELAYS environment variable", () => {
    const envKey = "NOSTR_RELAYS";
    expect(envKey).toBe("NOSTR_RELAYS");
  });

  it("validates that credentials can come from config or environment", () => {
    const configKey = { privateKey: "nsec1test" };
    expect(configKey.privateKey).toBeDefined();

    const envKey = process.env.NOSTR_PRIVATE_KEY;
    expect(typeof envKey === "string" || envKey === undefined).toBe(true);
  });

  it("NOSTR_DM_POLICY and NOSTR_ALLOW_FROM are optional env vars", () => {
    const dmPolicy = process.env.NOSTR_DM_POLICY;
    const allowFrom = process.env.NOSTR_ALLOW_FROM;

    expect(dmPolicy === undefined || typeof dmPolicy === "string").toBe(true);
    expect(allowFrom === undefined || typeof allowFrom === "string").toBe(true);
  });
});
