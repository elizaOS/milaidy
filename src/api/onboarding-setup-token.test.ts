/**
 * Tests for Anthropic setup token handling during onboarding.
 *
 * The onboarding flow now routes through applyOnboardingConnectionConfig(),
 * so these tests validate the normalized helper rather than a copied inline
 * branch from server.ts.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { applyOnboardingConnectionConfig } from "./provider-switch-config";

async function applySetupToken(
  body: { provider?: string; providerApiKey?: unknown },
  config: { env?: Record<string, string> },
): Promise<boolean> {
  if (body.provider !== "anthropic-subscription") {
    return false;
  }
  try {
    await applyOnboardingConnectionConfig(config, {
      kind: "local-provider",
      provider: "anthropic-subscription",
      apiKey:
        typeof body.providerApiKey === "string"
          ? body.providerApiKey
          : undefined,
    });
    return typeof config.env?.ANTHROPIC_API_KEY === "string";
  } catch {
    return false;
  }
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

  it("saves a valid setup token to env and config", async () => {
    const config: { env?: Record<string, string> } = {};
    const saved = await applySetupToken(
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

  it("trims whitespace from token", async () => {
    const config: { env?: Record<string, string> } = {};
    const saved = await applySetupToken(
      {
        provider: "anthropic-subscription",
        providerApiKey: "  sk-ant-oat01-whitespace  ",
      },
      config,
    );

    expect(saved).toBe(true);
    expect(process.env.ANTHROPIC_API_KEY).toBe("sk-ant-oat01-whitespace");
  });

  it("does nothing for non-subscription providers", async () => {
    const config: { env?: Record<string, string> } = {};
    const saved = await applySetupToken(
      { provider: "anthropic", providerApiKey: "sk-ant-api-key-regular" },
      config,
    );

    expect(saved).toBe(false);
    expect(process.env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(config.env).toBeUndefined();
  });

  it("does nothing for openai-subscription", async () => {
    const config: { env?: Record<string, string> } = {};
    const saved = await applySetupToken(
      { provider: "openai-subscription", providerApiKey: "sk-something" },
      config,
    );

    expect(saved).toBe(false);
  });

  it("does nothing when providerApiKey is not a string", async () => {
    const config: { env?: Record<string, string> } = {};
    const saved = await applySetupToken(
      { provider: "anthropic-subscription", providerApiKey: 12345 },
      config,
    );

    expect(saved).toBe(false);
  });

  it("does nothing when token does not start with sk-ant-", async () => {
    const config: { env?: Record<string, string> } = {};
    const saved = await applySetupToken(
      {
        provider: "anthropic-subscription",
        providerApiKey: "not-a-valid-token",
      },
      config,
    );

    expect(saved).toBe(false);
    expect(process.env.ANTHROPIC_API_KEY).toBeUndefined();
  });

  it("does nothing when providerApiKey is missing", async () => {
    const config: { env?: Record<string, string> } = {};
    const saved = await applySetupToken(
      { provider: "anthropic-subscription" },
      config,
    );

    expect(saved).toBe(false);
  });

  it("initializes config.env if it does not exist", async () => {
    const config: { env?: Record<string, string> } = {};
    expect(config.env).toBeUndefined();

    await applySetupToken(
      {
        provider: "anthropic-subscription",
        providerApiKey: "sk-ant-oat01-init-env",
      },
      config,
    );

    expect(config.env).toBeDefined();
    expect(config.env?.ANTHROPIC_API_KEY).toBe("sk-ant-oat01-init-env");
  });

  it("preserves existing config.env entries", async () => {
    const config: { env?: Record<string, string> } = {
      env: { EXISTING_KEY: "existing-value" },
    };

    await applySetupToken(
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
