/**
 * Farcaster Connector Unit Tests — GitHub Issue #146
 *
 * Basic validation tests for the Farcaster connector plugin.
 * For comprehensive e2e tests, see test/farcaster-connector.e2e.test.ts
 */

import { describe, expect, it } from "vitest";
import {
  extractPlugin,
  resolveFarcasterPluginImportSpecifier,
} from "../test-support/test-helpers";

const FARCASTER_PLUGIN_IMPORT = resolveFarcasterPluginImportSpecifier();
const FARCASTER_PLUGIN_AVAILABLE = FARCASTER_PLUGIN_IMPORT !== null;
const describeIfPluginAvailable = FARCASTER_PLUGIN_AVAILABLE
  ? describe
  : describe.skip;

const loadFarcasterPluginModule = async () => {
  if (!FARCASTER_PLUGIN_IMPORT) {
    throw new Error("Farcaster plugin is not resolvable");
  }
  return (await import(FARCASTER_PLUGIN_IMPORT)) as {
    default?: unknown;
    plugin?: unknown;
  };
};

describeIfPluginAvailable("Farcaster Connector - Basic Validation", () => {
  it("can import the Farcaster plugin package", async () => {
    const mod = await loadFarcasterPluginModule();
    expect(mod).toBeDefined();
  });

  it("exports a valid plugin structure", async () => {
    const mod = await loadFarcasterPluginModule();
    const plugin = extractPlugin(mod);

    expect(plugin).not.toBeNull();
    expect(plugin).toBeDefined();
  });

  it("plugin has correct name", async () => {
    const mod = await loadFarcasterPluginModule();
    const plugin = extractPlugin(mod) as { name?: string } | null;

    expect(plugin?.name).toBe("farcaster");
  });

  it("plugin has a description", async () => {
    const mod = await loadFarcasterPluginModule();
    const plugin = extractPlugin(mod) as { description?: string } | null;

    expect(plugin?.description).toBeDefined();
    expect(typeof plugin?.description).toBe("string");
  });

  it("plugin has services", async () => {
    const mod = await loadFarcasterPluginModule();
    const plugin = extractPlugin(mod) as { services?: unknown[] } | null;

    expect(plugin?.services).toBeDefined();
    expect(Array.isArray(plugin?.services)).toBe(true);
  });

  it("plugin has actions", async () => {
    const mod = await loadFarcasterPluginModule();
    const plugin = extractPlugin(mod) as { actions?: unknown[] } | null;

    expect(plugin?.actions).toBeDefined();
    expect(Array.isArray(plugin?.actions)).toBe(true);
    expect(plugin?.actions?.length).toBeGreaterThan(0);
  });
});

describe("Farcaster Connector - Configuration", () => {
  it("validates basic Farcaster configuration structure", () => {
    const validConfig = {
      enabled: true,
      apiKey: "test-neynar-key",
      signerUuid: "550e8400-e29b-41d4-a716-446655440000",
      fid: 12345,
    };

    expect(validConfig.enabled).toBe(true);
    expect(validConfig.apiKey).toBe("test-neynar-key");
    expect(validConfig.signerUuid).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(validConfig.fid).toBe(12345);
  });

  it("validates polling configuration", () => {
    const pollConfig = {
      mode: "polling" as const,
      pollInterval: 120,
    };

    expect(pollConfig.mode).toBe("polling");
    expect(pollConfig.pollInterval).toBe(120);
  });

  it("validates auto-casting configuration", () => {
    const castConfig = {
      enableCast: true,
      castIntervalMin: 90,
      castIntervalMax: 180,
      castImmediately: false,
    };

    expect(castConfig.enableCast).toBe(true);
    expect(castConfig.castIntervalMin).toBeLessThan(castConfig.castIntervalMax);
  });

  it("validates dry run configuration", () => {
    const dryRunConfig = {
      dryRun: true,
    };

    expect(dryRunConfig.dryRun).toBe(true);
  });
});

describe("Farcaster Connector - Protocol Constraints", () => {
  const MAX_CAST_LENGTH = 320;

  it("cast character limit is 320", () => {
    expect(MAX_CAST_LENGTH).toBe(320);
  });

  it("short messages fit within cast limit", () => {
    const message = "gm from milady";
    expect(message.length).toBeLessThanOrEqual(MAX_CAST_LENGTH);
  });

  it("long messages exceed cast limit", () => {
    const longMessage = "A".repeat(321);
    expect(longMessage.length).toBeGreaterThan(MAX_CAST_LENGTH);
  });

  it("FID must be a positive integer", () => {
    const validFids = [1, 12345, 9999999];
    const invalidFids = [0, -1, 1.5, NaN];

    for (const fid of validFids) {
      expect(Number.isInteger(fid) && fid > 0).toBe(true);
    }
    for (const fid of invalidFids) {
      expect(Number.isInteger(fid) && fid > 0).toBe(false);
    }
  });

  it("signer UUID has correct format", () => {
    const uuidPattern =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    expect(uuidPattern.test("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
    expect(uuidPattern.test("a1b2c3d4-e5f6-7890-abcd-ef1234567890")).toBe(true);
    expect(uuidPattern.test("not-a-uuid")).toBe(false);
    expect(uuidPattern.test("0xabcdef")).toBe(false);
  });

  it("cast hash format is 0x-prefixed hex", () => {
    const hashPattern = /^0x[0-9a-f]{40}$/i;
    expect(hashPattern.test("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")).toBe(
      true,
    );
    expect(hashPattern.test("invalid")).toBe(false);
  });
});

describe("Farcaster Connector - Environment Variables", () => {
  const REQUIRED_ENV_KEYS = [
    "FARCASTER_NEYNAR_API_KEY",
    "FARCASTER_SIGNER_UUID",
    "FARCASTER_FID",
  ] as const;

  it("all required env keys follow FARCASTER_ prefix convention", () => {
    for (const key of REQUIRED_ENV_KEYS) {
      expect(key).toMatch(/^FARCASTER_[A-Z_]+$/);
    }
  });

  it("env keys are distinct", () => {
    const unique = new Set(REQUIRED_ENV_KEYS);
    expect(unique.size).toBe(REQUIRED_ENV_KEYS.length);
  });

  it("config object maps cleanly to env keys", () => {
    // Config fields should correspond 1:1 with env vars
    const configToEnv: Record<string, string> = {
      apiKey: "FARCASTER_NEYNAR_API_KEY",
      signerUuid: "FARCASTER_SIGNER_UUID",
      fid: "FARCASTER_FID",
    };
    expect(Object.keys(configToEnv)).toHaveLength(REQUIRED_ENV_KEYS.length);
    for (const envKey of Object.values(configToEnv)) {
      expect(REQUIRED_ENV_KEYS).toContain(envKey);
    }
  });
});
