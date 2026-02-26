/**
 * Dedicated boundary tests for CUA (Computer Use Agent) runtime integration
 * and security. Covers plugin mapping, feature flag paths, env-var auto-enable,
 * and auth boundary assertions — all without starting a runtime.
 *
 * Complements computeruse-integration.test.ts (plugin module exports/schema)
 * with runtime-focused mapping and security tests (MW-03).
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { MiladyConfig } from "../config/config";
import {
  AUTH_PROVIDER_PLUGINS,
  applyPluginAutoEnable,
} from "../config/plugin-auto-enable";
import { collectPluginNames } from "./eliza";

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

const CUA_ENV_KEYS = [
  "CUA_API_KEY",
  "CUA_HOST",
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
];

// ---------------------------------------------------------------------------
// Section 1: CUA plugin mapping via feature flags
// ---------------------------------------------------------------------------

describe("CUA plugin mapping — feature flags and config entries", () => {
  const snap = envSnapshot(CUA_ENV_KEYS);

  beforeEach(() => {
    snap.save();
    process.env.ANTHROPIC_API_KEY = "test";
  });
  afterEach(() => snap.restore());

  it("features.cua = true loads @elizaos/plugin-cua", () => {
    const config = { features: { cua: true } } as unknown as MiladyConfig;
    const names = collectPluginNames(config);
    expect(names.has("@elizaos/plugin-cua")).toBe(true);
  });

  it("features.cua = false does NOT load @elizaos/plugin-cua", () => {
    const config = { features: { cua: false } } as unknown as MiladyConfig;
    const names = collectPluginNames(config);
    expect(names.has("@elizaos/plugin-cua")).toBe(false);
  });

  it("features.cua = { enabled: true } loads @elizaos/plugin-cua", () => {
    const config = {
      features: { cua: { enabled: true } },
    } as unknown as MiladyConfig;
    const names = collectPluginNames(config);
    expect(names.has("@elizaos/plugin-cua")).toBe(true);
  });

  it("features.cua = { enabled: false } does NOT load @elizaos/plugin-cua", () => {
    const config = {
      features: { cua: { enabled: false } },
    } as unknown as MiladyConfig;
    const names = collectPluginNames(config);
    expect(names.has("@elizaos/plugin-cua")).toBe(false);
  });

  it("empty config does NOT load @elizaos/plugin-cua", () => {
    const names = collectPluginNames(EMPTY_CONFIG);
    expect(names.has("@elizaos/plugin-cua")).toBe(false);
  });

  it("CUA and computeruse are separate plugins with separate mappings", () => {
    const config = {
      features: { cua: true, computeruse: true },
    } as unknown as MiladyConfig;
    const names = collectPluginNames(config);
    expect(names.has("@elizaos/plugin-cua")).toBe(true);
    expect(names.has("@elizaos/plugin-computeruse")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Section 2: CUA auto-enable via env vars (AUTH_PROVIDER_PLUGINS)
// ---------------------------------------------------------------------------

describe("CUA auto-enable via environment variables", () => {
  const snap = envSnapshot(CUA_ENV_KEYS);

  beforeEach(() => {
    snap.save();
    process.env.ANTHROPIC_API_KEY = "test";
    delete process.env.CUA_API_KEY;
    delete process.env.CUA_HOST;
  });
  afterEach(() => snap.restore());

  it("CUA_API_KEY maps to @elizaos/plugin-cua in AUTH_PROVIDER_PLUGINS", () => {
    expect(AUTH_PROVIDER_PLUGINS.CUA_API_KEY).toBe("@elizaos/plugin-cua");
  });

  it("CUA_HOST maps to @elizaos/plugin-cua in AUTH_PROVIDER_PLUGINS", () => {
    expect(AUTH_PROVIDER_PLUGINS.CUA_HOST).toBe("@elizaos/plugin-cua");
  });

  it("CUA_API_KEY triggers auto-enable via applyPluginAutoEnable", () => {
    const config = { plugins: {} } as unknown as MiladyConfig;
    const result = applyPluginAutoEnable({
      config,
      env: { CUA_API_KEY: "test-cua-key" },
    });
    expect(result.changes.some((c) => c.includes("plugin-cua"))).toBe(true);
  });

  it("CUA_HOST triggers auto-enable via applyPluginAutoEnable", () => {
    const config = { plugins: {} } as unknown as MiladyConfig;
    const result = applyPluginAutoEnable({
      config,
      env: { CUA_HOST: "http://localhost:8000" },
    });
    expect(result.changes.some((c) => c.includes("plugin-cua"))).toBe(true);
  });

  it("neither CUA env var set does NOT auto-enable plugin", () => {
    const config = { plugins: {} } as unknown as MiladyConfig;
    const result = applyPluginAutoEnable({ config, env: {} });
    expect(result.changes.some((c) => c.includes("plugin-cua"))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Section 3: CUA in FEATURE_PLUGINS map
// ---------------------------------------------------------------------------

describe("CUA in auto-enable mapping", () => {
  it("applyPluginAutoEnable adds @elizaos/plugin-cua when CUA_API_KEY is set", () => {
    const config = { plugins: {} } as unknown as MiladyConfig;
    const result = applyPluginAutoEnable({
      config,
      env: { CUA_API_KEY: "test-key" },
    });
    expect(result.changes.some((c) => c.includes("plugin-cua"))).toBe(true);
  });

  it("applyPluginAutoEnable does NOT add CUA when no CUA env vars are set", () => {
    const config = { plugins: {} } as unknown as MiladyConfig;
    const result = applyPluginAutoEnable({ config, env: {} });
    expect(result.changes.some((c) => c.includes("plugin-cua"))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Section 4: Security — CUA auth boundary
// ---------------------------------------------------------------------------

describe("CUA security boundaries", () => {
  const snap = envSnapshot([...CUA_ENV_KEYS, "CUA_PRIVATE_KEY"]);

  beforeEach(() => {
    snap.save();
    process.env.ANTHROPIC_API_KEY = "test";
  });
  afterEach(() => snap.restore());

  it("CUA_API_KEY is NOT in the env forwarding denylist (intentionally allowed)", async () => {
    const { isEnvKeyAllowedForForwarding } = await import("./eliza");
    expect(isEnvKeyAllowedForForwarding("CUA_API_KEY")).toBe(true);
  });

  it("CUA_HOST is NOT in the env forwarding denylist (intentionally allowed)", async () => {
    const { isEnvKeyAllowedForForwarding } = await import("./eliza");
    expect(isEnvKeyAllowedForForwarding("CUA_HOST")).toBe(true);
  });

  it("CUA_PRIVATE_KEY is BLOCKED by the env forwarding denylist", async () => {
    const { isEnvKeyAllowedForForwarding } = await import("./eliza");
    expect(isEnvKeyAllowedForForwarding("CUA_PRIVATE_KEY")).toBe(false);
  });

  it("CUA plugin cannot be loaded via both feature and env without duplication", () => {
    process.env.CUA_API_KEY = "test-key";
    const config = {
      features: { cua: true },
    } as unknown as MiladyConfig;
    const names = collectPluginNames(config);
    const cuaEntries = [...names].filter((n) => n === "@elizaos/plugin-cua");
    expect(cuaEntries).toHaveLength(1);
  });
});
