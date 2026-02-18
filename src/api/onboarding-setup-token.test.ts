/**
 * Tests for Anthropic setup token handling during onboarding.
 *
 * Bug: When a user selects "anthropic-subscription" during onboarding and
 * provides a setup token (sk-ant-oat01-...), the token was silently discarded
 * because getProviderOptions() returns envKey: null for subscription providers,
 * and the API-key gate `if (providerOpt?.envKey)` would skip them.
 *
 * Fix: applySubscriptionSetupToken() (src/api/onboarding-setup-token.ts)
 * explicitly checks for a setup token and saves it to process.env + config.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applySubscriptionSetupToken } from "./onboarding-setup-token";

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
    const result = applySubscriptionSetupToken(
      {
        provider: "anthropic-subscription",
        providerApiKey: "sk-ant-oat01-test-token-12345",
      },
      config,
    );

    expect(result.saved).toBe(true);
    expect(result.token).toBe("sk-ant-oat01-test-token-12345");
    expect(process.env.ANTHROPIC_API_KEY).toBe(
      "sk-ant-oat01-test-token-12345",
    );
    expect(config.env?.ANTHROPIC_API_KEY).toBe(
      "sk-ant-oat01-test-token-12345",
    );
  });

  it("trims whitespace from token", () => {
    const config: { env?: Record<string, string> } = {};
    const result = applySubscriptionSetupToken(
      {
        provider: "anthropic-subscription",
        providerApiKey: "  sk-ant-oat01-whitespace  ",
      },
      config,
    );

    expect(result.saved).toBe(true);
    expect(result.token).toBe("sk-ant-oat01-whitespace");
    expect(process.env.ANTHROPIC_API_KEY).toBe("sk-ant-oat01-whitespace");
  });

  it("does nothing for non-subscription providers", () => {
    const config: { env?: Record<string, string> } = {};
    const result = applySubscriptionSetupToken(
      {
        provider: "anthropic",
        providerApiKey: "sk-ant-api-key-regular",
      },
      config,
    );

    expect(result.saved).toBe(false);
    expect(process.env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(config.env).toBeUndefined();
  });

  it("does nothing for openai-subscription", () => {
    const config: { env?: Record<string, string> } = {};
    const result = applySubscriptionSetupToken(
      {
        provider: "openai-subscription",
        providerApiKey: "sk-something",
      },
      config,
    );

    expect(result.saved).toBe(false);
  });

  it("does nothing when providerApiKey is not a string", () => {
    const config: { env?: Record<string, string> } = {};
    const result = applySubscriptionSetupToken(
      {
        provider: "anthropic-subscription",
        providerApiKey: 12345,
      },
      config,
    );

    expect(result.saved).toBe(false);
  });

  it("does nothing when token does not start with sk-ant-", () => {
    const config: { env?: Record<string, string> } = {};
    const result = applySubscriptionSetupToken(
      {
        provider: "anthropic-subscription",
        providerApiKey: "not-a-valid-token",
      },
      config,
    );

    expect(result.saved).toBe(false);
    expect(process.env.ANTHROPIC_API_KEY).toBeUndefined();
  });

  it("does nothing when providerApiKey is missing", () => {
    const config: { env?: Record<string, string> } = {};
    const result = applySubscriptionSetupToken(
      { provider: "anthropic-subscription" },
      config,
    );

    expect(result.saved).toBe(false);
  });

  it("initializes config.env if it does not exist", () => {
    const config: { env?: Record<string, string> } = {};
    expect(config.env).toBeUndefined();

    applySubscriptionSetupToken(
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

    applySubscriptionSetupToken(
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
