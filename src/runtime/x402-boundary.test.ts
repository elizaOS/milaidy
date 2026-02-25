/**
 * Dedicated boundary tests for x402 (payment protocol) security and runtime
 * integration. Covers env-forwarding denylist, config-to-env propagation,
 * plugin mapping, and character secrets — all without starting a runtime.
 *
 * @see https://github.com/milady-ai/milaidy/issues/590
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { MiladyConfig } from "../config/config";
import { AUTH_PROVIDER_PLUGINS } from "../config/plugin-auto-enable";
import {
  applyX402ConfigToEnv,
  buildCharacterFromConfig,
  collectPluginNames,
  isEnvKeyAllowedForForwarding,
} from "./eliza";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function envSnapshot(keys: string[]): {
  save: () => void;
  restore: () => void;
} {
  const saved = new Map<string, string | undefined>();
  return {
    save() {
      for (const k of keys) saved.set(k, process.env[k]);
    },
    restore() {
      for (const [k, v] of saved) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    },
  };
}

const EMPTY_CONFIG: MiladyConfig = {} as MiladyConfig;

// ---------------------------------------------------------------------------
// Section 1: Env forwarding denylist (security)
// ---------------------------------------------------------------------------

describe("isEnvKeyAllowedForForwarding – x402 boundaries", () => {
  it("blocks X402_SELLER_PRIVATE_KEY (pattern match, not exact)", () => {
    expect(isEnvKeyAllowedForForwarding("X402_SELLER_PRIVATE_KEY")).toBe(false);
  });

  it("blocks lowercase private_key variants", () => {
    expect(isEnvKeyAllowedForForwarding("x402_private_key")).toBe(false);
  });

  it("blocks PRIVATE_KEY embedded anywhere in key name", () => {
    expect(isEnvKeyAllowedForForwarding("MY_PRIVATE_KEY_BACKUP")).toBe(false);
  });

  it("allows non-secret x402 operational vars", () => {
    const allowed = [
      "X402_ENABLED",
      "X402_NETWORK",
      "X402_PAY_TO",
      "X402_FACILITATOR_URL",
      "X402_MAX_PAYMENT_USD",
      "X402_MAX_TOTAL_USD",
      "X402_DB_PATH",
    ];
    for (const key of allowed) {
      expect(isEnvKeyAllowedForForwarding(key)).toBe(true);
    }
  });

  it("blocks EVM_PRIVATE_KEY even in x402 context", () => {
    expect(isEnvKeyAllowedForForwarding("EVM_PRIVATE_KEY")).toBe(false);
  });

  it("blocks SOLANA_PRIVATE_KEY even in x402 context", () => {
    expect(isEnvKeyAllowedForForwarding("SOLANA_PRIVATE_KEY")).toBe(false);
  });

  it("blocks EVM_ prefix vars (wallet keys)", () => {
    expect(isEnvKeyAllowedForForwarding("EVM_MNEMONIC_PHRASE")).toBe(false);
  });

  it("blocks SOLANA_ prefix vars (wallet keys)", () => {
    expect(isEnvKeyAllowedForForwarding("SOLANA_SECRET_SEED")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Section 2: Config type boundary – applyX402ConfigToEnv
// ---------------------------------------------------------------------------

describe("applyX402ConfigToEnv – propagation boundaries", () => {
  const ENV_KEYS = [
    "X402_ENABLED",
    "X402_API_KEY",
    "X402_BASE_URL",
    "X402_NETWORK",
    "X402_PAY_TO",
    "X402_FACILITATOR_URL",
    "X402_MAX_PAYMENT_USD",
    "X402_MAX_TOTAL_USD",
    "X402_DB_PATH",
    "X402_PRIVATE_KEY",
  ];

  const snap = envSnapshot(ENV_KEYS);

  beforeEach(() => snap.save());
  afterEach(() => snap.restore());

  it("propagates only ENABLED, API_KEY, BASE_URL from full config", () => {
    // Clear all x402 env vars
    for (const k of ENV_KEYS) delete process.env[k];

    const config = {
      x402: {
        enabled: true,
        apiKey: "test-key-123",
        baseUrl: "https://x402.example.com",
        privateKey: "0xDEADBEEF",
        network: "base-sepolia",
        payTo: "0x1234",
        facilitatorUrl: "https://facilitator.example.com",
        maxPaymentUsd: 10,
        maxTotalUsd: 100,
        dbPath: "/tmp/x402.db",
      },
    } as unknown as MiladyConfig;

    applyX402ConfigToEnv(config);

    // These 3 should be set
    expect(process.env.X402_ENABLED).toBe("true");
    expect(process.env.X402_API_KEY).toBe("test-key-123");
    expect(process.env.X402_BASE_URL).toBe("https://x402.example.com");

    // These should NOT be propagated
    expect(process.env.X402_NETWORK).toBeUndefined();
    expect(process.env.X402_PAY_TO).toBeUndefined();
    expect(process.env.X402_FACILITATOR_URL).toBeUndefined();
    expect(process.env.X402_MAX_PAYMENT_USD).toBeUndefined();
    expect(process.env.X402_MAX_TOTAL_USD).toBeUndefined();
    expect(process.env.X402_DB_PATH).toBeUndefined();
    expect(process.env.X402_PRIVATE_KEY).toBeUndefined();
  });

  it("never leaks privateKey to any process.env entry", () => {
    for (const k of ENV_KEYS) delete process.env[k];

    const marker = `SUPER_SECRET_MARKER_${Date.now()}`;
    const config = {
      x402: {
        enabled: true,
        privateKey: marker,
        apiKey: "safe-key",
        baseUrl: "https://safe.example.com",
      },
    } as unknown as MiladyConfig;

    applyX402ConfigToEnv(config);

    // Scan ALL env vars for the marker
    for (const [_key, value] of Object.entries(process.env)) {
      expect(value).not.toBe(marker);
    }
  });

  it("does nothing when x402.enabled is false", () => {
    for (const k of ENV_KEYS) delete process.env[k];

    const config = {
      x402: { enabled: false, apiKey: "should-not-appear" },
    } as unknown as MiladyConfig;

    applyX402ConfigToEnv(config);

    expect(process.env.X402_ENABLED).toBeUndefined();
    expect(process.env.X402_API_KEY).toBeUndefined();
  });

  it("does nothing when x402 section is absent", () => {
    for (const k of ENV_KEYS) delete process.env[k];

    applyX402ConfigToEnv(EMPTY_CONFIG);

    expect(process.env.X402_ENABLED).toBeUndefined();
  });

  it("does not set API_KEY when apiKey is empty string", () => {
    for (const k of ENV_KEYS) delete process.env[k];

    const config = {
      x402: { enabled: true, apiKey: "", baseUrl: "" },
    } as unknown as MiladyConfig;

    applyX402ConfigToEnv(config);

    expect(process.env.X402_ENABLED).toBe("true");
    expect(process.env.X402_API_KEY).toBeUndefined();
    expect(process.env.X402_BASE_URL).toBeUndefined();
  });

  it("does not overwrite pre-existing env vars", () => {
    process.env.X402_ENABLED = "already-set";
    process.env.X402_API_KEY = "original-key";

    const config = {
      x402: { enabled: true, apiKey: "new-key" },
    } as unknown as MiladyConfig;

    applyX402ConfigToEnv(config);

    expect(process.env.X402_ENABLED).toBe("already-set");
    expect(process.env.X402_API_KEY).toBe("original-key");
  });
});

// ---------------------------------------------------------------------------
// Section 3: Runtime plugin mapping
// ---------------------------------------------------------------------------

describe("x402 plugin mapping", () => {
  const snap = envSnapshot([
    "ANTHROPIC_API_KEY",
    "OPENAI_API_KEY",
    "X402_ENABLED",
  ]);

  beforeEach(() => {
    snap.save();
    // Provide a model provider so collectPluginNames doesn't complain
    process.env.ANTHROPIC_API_KEY = "test";
  });
  afterEach(() => snap.restore());

  it("collectPluginNames includes @elizaos/plugin-x402 when config.x402.enabled", () => {
    const config = { x402: { enabled: true } } as unknown as MiladyConfig;
    const names = collectPluginNames(config);
    expect(names.has("@elizaos/plugin-x402")).toBe(true);
  });

  it("collectPluginNames excludes @elizaos/plugin-x402 when x402 not enabled", () => {
    const names = collectPluginNames(EMPTY_CONFIG);
    expect(names.has("@elizaos/plugin-x402")).toBe(false);
  });

  it("x402 is NOT in AUTH_PROVIDER_PLUGINS values", () => {
    const authPluginValues = Object.values(AUTH_PROVIDER_PLUGINS);
    expect(authPluginValues).not.toContain("@elizaos/plugin-x402");
  });

  it("both config path and features path produce exactly one entry", () => {
    const config = {
      x402: { enabled: true },
      features: { x402: true },
    } as unknown as MiladyConfig;

    const names = collectPluginNames(config);
    const x402Entries = [...names].filter((n) => n === "@elizaos/plugin-x402");
    expect(x402Entries).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Section 4: Character secrets propagation
// ---------------------------------------------------------------------------

describe("buildCharacterFromConfig – x402 secrets", () => {
  const X402_SECRET_KEYS = [
    "X402_PRIVATE_KEY",
    "X402_NETWORK",
    "X402_PAY_TO",
    "X402_FACILITATOR_URL",
    "X402_MAX_PAYMENT_USD",
    "X402_MAX_TOTAL_USD",
    "X402_ENABLED",
    "X402_DB_PATH",
  ];

  const ALL_SECRET_ENV_KEYS = [
    ...X402_SECRET_KEYS,
    "ANTHROPIC_API_KEY",
    "OPENAI_API_KEY",
  ];

  const snap = envSnapshot(ALL_SECRET_ENV_KEYS);

  beforeEach(() => {
    snap.save();
    // Clear all x402 env vars
    for (const k of ALL_SECRET_ENV_KEYS) delete process.env[k];
  });
  afterEach(() => snap.restore());

  it("includes all 8 X402_* keys in character secrets when set", () => {
    for (const key of X402_SECRET_KEYS) {
      process.env[key] = `test-value-${key}`;
    }

    const character = buildCharacterFromConfig(EMPTY_CONFIG);

    for (const key of X402_SECRET_KEYS) {
      expect(character.secrets).toHaveProperty(key, `test-value-${key}`);
    }
  });

  it("omits x402 secrets when env vars are not set", () => {
    const character = buildCharacterFromConfig(EMPTY_CONFIG);

    for (const key of X402_SECRET_KEYS) {
      expect(character.secrets).not.toHaveProperty(key);
    }
  });

  it("omits x402 secrets when env vars are whitespace-only", () => {
    for (const key of X402_SECRET_KEYS) {
      process.env[key] = "   ";
    }

    const character = buildCharacterFromConfig(EMPTY_CONFIG);

    for (const key of X402_SECRET_KEYS) {
      expect(character.secrets).not.toHaveProperty(key);
    }
  });
});
