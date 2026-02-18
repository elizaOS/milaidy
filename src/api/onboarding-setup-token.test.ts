/**
 * Tests for Anthropic setup token handling during onboarding.
 *
 * Bug: When a user selects "anthropic-subscription" during onboarding and
 * provides a setup token (sk-ant-oat01-...), the token was silently discarded
 * because getProviderOptions() returns envKey: null for subscription providers,
 * and the API-key gate `if (providerOpt?.envKey)` would skip them.
 *
 * Fix: The subscription-provider block in server.ts (inside the onboarding
 * handler, guarded by `runMode === "local"`) now explicitly checks for a
 * setup token and saves it to process.env + config.env. This mirrors the
 * POST /api/subscription/anthropic/setup-token endpoint in
 * subscription-routes.ts.
 *
 * These tests validate the conditional logic inline in the onboarding handler
 * (server.ts ~line 4858). The function below reproduces the exact branching
 * so unit tests can cover edge cases without spinning up an HTTP server.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * Reproduces the inline setup-token logic from the onboarding handler in
 * server.ts. Kept in sync manually — any change to the server.ts block
 * must be reflected here.
 */
function applySetupToken(
  body: { provider?: string; providerApiKey?: unknown },
  config: { env?: Record<string, string> },
): boolean {
  if (
    body.provider === "anthropic-subscription" &&
    typeof body.providerApiKey === "string" &&
    body.providerApiKey.trim().startsWith("sk-ant-")
  ) {
    const token = body.providerApiKey.trim();
    if (!config.env) config.env = {};
    config.env.ANTHROPIC_API_KEY = token;
    process.env.ANTHROPIC_API_KEY = token;
    return true;
  }
  return false;
}

describe("Anthropic setup token during onboarding", () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.ANTHROPIC_API_KEY = originalEnv;
    } else {
      delete process.env.ANTHROPIC_API_KEY;
    }
  });

  it("saves a valid setup token to env and config", () => {
    const config: { env?: Record<string, string> } = {};
    const saved = applySetupToken(
      {
        provider: "anthropic-subscription",
        providerApiKey: "sk-ant-oat01-test-token-12345",
      },
      config,
    );

    expect(saved).toBe(true);
    expect(process.env.ANTHROPIC_API_KEY).toBe("sk-ant-oat01-test-token-12345");
    expect(config.env?.ANTHROPIC_API_KEY).toBe("sk-ant-oat01-test-token-12345");
  });

  it("trims whitespace from token", () => {
    const config: { env?: Record<string, string> } = {};
    const saved = applySetupToken(
      {
        provider: "anthropic-subscription",
        providerApiKey: "  sk-ant-oat01-whitespace  ",
      },
      config,
    );

    expect(saved).toBe(true);
    expect(process.env.ANTHROPIC_API_KEY).toBe("sk-ant-oat01-whitespace");
  });

  it("does nothing for non-subscription providers", () => {
    const config: { env?: Record<string, string> } = {};
    const saved = applySetupToken(
      { provider: "anthropic", providerApiKey: "sk-ant-api-key-regular" },
      config,
    );

    expect(saved).toBe(false);
    expect(process.env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(config.env).toBeUndefined();
  });

  it("does nothing for openai-subscription", () => {
    const config: { env?: Record<string, string> } = {};
    const saved = applySetupToken(
      { provider: "openai-subscription", providerApiKey: "sk-something" },
      config,
    );

    expect(saved).toBe(false);
  });

  it("does nothing when providerApiKey is not a string", () => {
    const config: { env?: Record<string, string> } = {};
    const saved = applySetupToken(
      { provider: "anthropic-subscription", providerApiKey: 12345 },
      config,
    );

    expect(saved).toBe(false);
  });

  it("does nothing when token does not start with sk-ant-", () => {
    const config: { env?: Record<string, string> } = {};
    const saved = applySetupToken(
      {
        provider: "anthropic-subscription",
        providerApiKey: "not-a-valid-token",
      },
      config,
    );

    expect(saved).toBe(false);
    expect(process.env.ANTHROPIC_API_KEY).toBeUndefined();
  });

  it("does nothing when providerApiKey is missing", () => {
    const config: { env?: Record<string, string> } = {};
    const saved = applySetupToken(
      { provider: "anthropic-subscription" },
      config,
    );

    expect(saved).toBe(false);
  });

  it("initializes config.env if it does not exist", () => {
    const config: { env?: Record<string, string> } = {};
    expect(config.env).toBeUndefined();

    applySetupToken(
      {
        provider: "anthropic-subscription",
        providerApiKey: "sk-ant-oat01-init-env",
      },
      config,
    );

    expect(config.env).toBeDefined();
    expect(config.env?.ANTHROPIC_API_KEY).toBe("sk-ant-oat01-init-env");
  });

  it("preserves existing config.env entries", () => {
    const config: { env?: Record<string, string> } = {
      env: { EXISTING_KEY: "existing-value" },
    };

    applySetupToken(
      {
        provider: "anthropic-subscription",
        providerApiKey: "sk-ant-oat01-preserve-test",
      },
      config,
    );

    expect(config.env?.EXISTING_KEY).toBe("existing-value");
    expect(config.env?.ANTHROPIC_API_KEY).toBe("sk-ant-oat01-preserve-test");
  });
});
