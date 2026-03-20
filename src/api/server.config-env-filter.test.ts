/**
 * P2-01 regression test: GET /api/config must not return sensitive env vars
 * (private keys, auth tokens) in the response body.
 *
 * Also tests the exported helpers: SENSITIVE_ENV_RESPONSE_KEYS and
 * filterConfigEnvForResponse.
 *
 * See issue #1172 — UX Persona Audit.
 */

import { describe, expect, it } from "vitest";
import {
  SENSITIVE_ENV_RESPONSE_KEYS,
  filterConfigEnvForResponse,
} from "./server";

describe("SENSITIVE_ENV_RESPONSE_KEYS", () => {
  it("blocks EVM_PRIVATE_KEY", () => {
    expect(SENSITIVE_ENV_RESPONSE_KEYS.has("EVM_PRIVATE_KEY")).toBe(true);
  });

  it("blocks SOLANA_PRIVATE_KEY", () => {
    expect(SENSITIVE_ENV_RESPONSE_KEYS.has("SOLANA_PRIVATE_KEY")).toBe(true);
  });

  it("blocks ELIZA_API_TOKEN", () => {
    expect(SENSITIVE_ENV_RESPONSE_KEYS.has("ELIZA_API_TOKEN")).toBe(true);
  });

  it("blocks MILADY_API_TOKEN", () => {
    expect(SENSITIVE_ENV_RESPONSE_KEYS.has("MILADY_API_TOKEN")).toBe(true);
  });

  it("blocks ELIZA_WALLET_EXPORT_TOKEN", () => {
    expect(SENSITIVE_ENV_RESPONSE_KEYS.has("ELIZA_WALLET_EXPORT_TOKEN")).toBe(true);
  });

  it("blocks ELIZA_TERMINAL_RUN_TOKEN", () => {
    expect(SENSITIVE_ENV_RESPONSE_KEYS.has("ELIZA_TERMINAL_RUN_TOKEN")).toBe(true);
  });

  it("blocks HYPERSCAPE_AUTH_TOKEN", () => {
    expect(SENSITIVE_ENV_RESPONSE_KEYS.has("HYPERSCAPE_AUTH_TOKEN")).toBe(true);
  });

  it("blocks ELIZAOS_CLOUD_API_KEY", () => {
    expect(SENSITIVE_ENV_RESPONSE_KEYS.has("ELIZAOS_CLOUD_API_KEY")).toBe(true);
  });

  it("blocks GITHUB_TOKEN", () => {
    expect(SENSITIVE_ENV_RESPONSE_KEYS.has("GITHUB_TOKEN")).toBe(true);
  });

  it("blocks DATABASE_URL", () => {
    expect(SENSITIVE_ENV_RESPONSE_KEYS.has("DATABASE_URL")).toBe(true);
  });

  it("blocks POSTGRES_URL", () => {
    expect(SENSITIVE_ENV_RESPONSE_KEYS.has("POSTGRES_URL")).toBe(true);
  });

  it("does not block safe config keys", () => {
    expect(SENSITIVE_ENV_RESPONSE_KEYS.has("AGENT_NAME")).toBe(false);
    expect(SENSITIVE_ENV_RESPONSE_KEYS.has("MODEL_PROVIDER")).toBe(false);
  });

  it("has at least 11 entries (guard against accidental truncation)", () => {
    expect(SENSITIVE_ENV_RESPONSE_KEYS.size).toBeGreaterThanOrEqual(11);
  });
});

describe("filterConfigEnvForResponse", () => {
  it("strips EVM_PRIVATE_KEY from env block", () => {
    const config = {
      agentName: "TestAgent",
      env: {
        EVM_PRIVATE_KEY: "0xdeadbeef",
        AGENT_NAME: "TestAgent",
      },
    };
    const filtered = filterConfigEnvForResponse(config);
    expect((filtered.env as Record<string, unknown>).EVM_PRIVATE_KEY).toBeUndefined();
    expect((filtered.env as Record<string, unknown>).AGENT_NAME).toBe("TestAgent");
  });

  it("strips SOLANA_PRIVATE_KEY from env block", () => {
    const config = {
      env: {
        SOLANA_PRIVATE_KEY: "5abc1234...",
        LOG_LEVEL: "debug",
      },
    };
    const filtered = filterConfigEnvForResponse(config);
    expect((filtered.env as Record<string, unknown>).SOLANA_PRIVATE_KEY).toBeUndefined();
    expect((filtered.env as Record<string, unknown>).LOG_LEVEL).toBe("debug");
  });

  it("strips all auth tokens from env block", () => {
    const config = {
      env: {
        ELIZA_API_TOKEN: "secret-token",
        ELIZA_WALLET_EXPORT_TOKEN: "export-token",
        ELIZA_TERMINAL_RUN_TOKEN: "terminal-token",
        HYPERSCAPE_AUTH_TOKEN: "hyperscape",
        ELIZAOS_CLOUD_API_KEY: "cloud-key",
        GITHUB_TOKEN: "ghp_abc",
        SAFE_KEY: "safe-value",
      },
    };
    const filtered = filterConfigEnvForResponse(config);
    const env = filtered.env as Record<string, unknown>;
    expect(env.ELIZA_API_TOKEN).toBeUndefined();
    expect(env.ELIZA_WALLET_EXPORT_TOKEN).toBeUndefined();
    expect(env.ELIZA_TERMINAL_RUN_TOKEN).toBeUndefined();
    expect(env.HYPERSCAPE_AUTH_TOKEN).toBeUndefined();
    expect(env.ELIZAOS_CLOUD_API_KEY).toBeUndefined();
    expect(env.GITHUB_TOKEN).toBeUndefined();
    expect(env.SAFE_KEY).toBe("safe-value");
  });

  it("strips database connection strings", () => {
    const config = {
      env: {
        DATABASE_URL: "postgresql://user:pass@host/db",
        POSTGRES_URL: "postgresql://user:pass@host/db",
        PORT: "5432",
      },
    };
    const filtered = filterConfigEnvForResponse(config);
    const env = filtered.env as Record<string, unknown>;
    expect(env.DATABASE_URL).toBeUndefined();
    expect(env.POSTGRES_URL).toBeUndefined();
    expect(env.PORT).toBe("5432");
  });

  it("does not mutate the original config object", () => {
    const original = {
      env: { EVM_PRIVATE_KEY: "0xsecret", SAFE: "ok" },
    };
    const snapshot = JSON.stringify(original);
    filterConfigEnvForResponse(original);
    expect(JSON.stringify(original)).toBe(snapshot);
  });

  it("preserves non-env top-level fields unchanged", () => {
    const config = {
      agentName: "Milady",
      plugins: { entries: {} },
      env: { EVM_PRIVATE_KEY: "secret" },
    };
    const filtered = filterConfigEnvForResponse(config);
    expect(filtered.agentName).toBe("Milady");
    expect(filtered.plugins).toEqual({ entries: {} });
  });

  it("returns config unchanged when env block is absent", () => {
    const config = { agentName: "Milady" };
    const filtered = filterConfigEnvForResponse(config);
    expect(filtered).toEqual(config);
  });

  it("returns config unchanged when env is not an object", () => {
    const config = { env: "not-an-object" };
    const filtered = filterConfigEnvForResponse(config);
    expect(filtered).toEqual(config);
  });

  it("handles case-insensitive key matching", () => {
    // Keys are stored uppercase; lookup normalises the incoming key with toUpperCase()
    const config = {
      env: {
        evm_private_key: "0xlower",
        Evm_Private_Key: "0xmixed",
        EVM_PRIVATE_KEY: "0xupper",
        safe_key: "ok",
      },
    };
    const filtered = filterConfigEnvForResponse(config);
    const env = filtered.env as Record<string, unknown>;
    expect(env.evm_private_key).toBeUndefined();
    expect(env.Evm_Private_Key).toBeUndefined();
    expect(env.EVM_PRIVATE_KEY).toBeUndefined();
    expect(env.safe_key).toBe("ok");
  });
});
