import { beforeEach, describe, expect, it, vi } from "vitest";

import type { MiladyConfig } from "../config/types.milady";

const { applySubscriptionCredentials, deleteCredentials } = vi.hoisted(() => ({
  applySubscriptionCredentials: vi.fn(async () => undefined),
  deleteCredentials: vi.fn(),
}));

vi.mock("../auth/index", () => ({
  applySubscriptionCredentials,
  deleteCredentials,
}));

import {
  applyOnboardingConnectionConfig,
  applySubscriptionProviderConfig,
  clearSubscriptionProviderConfig,
  createProviderSwitchConnection,
  mergeOnboardingConnectionWithExisting,
  resolveExistingOnboardingConnection,
} from "./provider-switch-config";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function emptyConfig(): Partial<MiladyConfig> {
  return {};
}

function configWithDefaults(
  defaults: NonNullable<NonNullable<MiladyConfig["agents"]>["defaults"]> = {},
): Partial<MiladyConfig> {
  return { agents: { defaults } };
}

beforeEach(() => {
  applySubscriptionCredentials.mockClear();
  deleteCredentials.mockClear();
});

// ============================================================================
//  applySubscriptionProviderConfig
// ============================================================================

describe("applySubscriptionProviderConfig", () => {
  it("sets subscriptionProvider and model.primary for openai-codex", () => {
    const config = emptyConfig();
    applySubscriptionProviderConfig(config, "openai-codex");

    expect(config.agents?.defaults?.subscriptionProvider).toBe("openai-codex");
    expect(config.agents?.defaults?.model?.primary).toBe("openai");
  });

  it("sets subscriptionProvider and model.primary for anthropic-subscription", () => {
    const config = emptyConfig();
    applySubscriptionProviderConfig(config, "anthropic-subscription");

    expect(config.agents?.defaults?.subscriptionProvider).toBe(
      "anthropic-subscription",
    );
    expect(config.agents?.defaults?.model?.primary).toBe("anthropic");
  });

  it("normalizes openai-subscription to openai-codex", () => {
    const config = emptyConfig();
    applySubscriptionProviderConfig(config, "openai-subscription");

    expect(config.agents?.defaults?.subscriptionProvider).toBe("openai-codex");
    expect(config.agents?.defaults?.model?.primary).toBe("openai");
  });

  it("initializes agents.defaults when absent", () => {
    const config = emptyConfig();
    applySubscriptionProviderConfig(config, "anthropic-subscription");

    expect(config.agents).toBeDefined();
    expect(config.agents?.defaults).toBeDefined();
  });

  it("preserves existing agents config fields", () => {
    const config: Partial<MiladyConfig> = {
      agents: {
        defaults: { workspace: "/some/path" },
      },
    };
    applySubscriptionProviderConfig(config, "openai-codex");

    expect(config.agents?.defaults?.workspace).toBe("/some/path");
    expect(config.agents?.defaults?.subscriptionProvider).toBe("openai-codex");
  });

  it("does nothing for unrecognized provider", () => {
    const config = emptyConfig();
    applySubscriptionProviderConfig(config, "unknown-provider");

    expect(config.agents?.defaults?.subscriptionProvider).toBeUndefined();
    expect(config.agents?.defaults?.model).toBeUndefined();
  });

  it("overwrites previous subscription when switching providers", () => {
    const config = configWithDefaults({
      subscriptionProvider: "anthropic-subscription",
      model: { primary: "anthropic" },
    });

    applySubscriptionProviderConfig(config, "openai-codex");

    expect(config.agents?.defaults?.subscriptionProvider).toBe("openai-codex");
    expect(config.agents?.defaults?.model?.primary).toBe("openai");
  });

  it("preserves existing model.fallbacks when switching providers", () => {
    const config = configWithDefaults({
      subscriptionProvider: "anthropic-subscription",
      model: {
        primary: "anthropic",
        fallbacks: ["openai", "groq"],
      },
    });

    applySubscriptionProviderConfig(config, "openai-codex");

    expect(config.agents?.defaults?.model?.primary).toBe("openai");
    expect(config.agents?.defaults?.model?.fallbacks).toEqual([
      "openai",
      "groq",
    ]);
  });
});

// ============================================================================
//  clearSubscriptionProviderConfig
// ============================================================================

describe("clearSubscriptionProviderConfig", () => {
  it("removes subscriptionProvider from defaults", () => {
    const config = configWithDefaults({
      subscriptionProvider: "anthropic-subscription",
      model: { primary: "anthropic" },
    });

    clearSubscriptionProviderConfig(config);

    expect(config.agents?.defaults?.subscriptionProvider).toBeUndefined();
  });

  it("preserves other defaults fields", () => {
    const config = configWithDefaults({
      subscriptionProvider: "openai-codex",
      workspace: "/some/path",
      model: { primary: "openai" },
    });

    clearSubscriptionProviderConfig(config);

    expect(config.agents?.defaults?.workspace).toBe("/some/path");
    expect(config.agents?.defaults?.model?.primary).toBe("openai");
  });

  it("handles empty config without errors", () => {
    const config = emptyConfig();
    expect(() => clearSubscriptionProviderConfig(config)).not.toThrow();
  });

  it("is idempotent", () => {
    const config = configWithDefaults({
      subscriptionProvider: "openai-codex",
    });

    clearSubscriptionProviderConfig(config);
    clearSubscriptionProviderConfig(config);

    expect(config.agents?.defaults?.subscriptionProvider).toBeUndefined();
  });
});

describe("applyOnboardingConnectionConfig", () => {
  it("applies a Claude subscription connection and keeps the selection distinct", async () => {
    const config = emptyConfig();

    await applyOnboardingConnectionConfig(config, {
      kind: "local-provider",
      provider: "anthropic-subscription",
    });

    expect(config.agents?.defaults?.subscriptionProvider).toBe(
      "anthropic-subscription",
    );
    expect(config.agents?.defaults?.model?.primary).toBe("anthropic");
    expect(applySubscriptionCredentials).toHaveBeenCalledWith(config);
    expect(deleteCredentials).toHaveBeenCalledWith("openai-codex");
  });

  it("applies the same config mutation for onboarding and provider-switch paths", async () => {
    const onboardingConfig = configWithDefaults({
      subscriptionProvider: "openai-codex",
      model: { primary: "openai" },
    });
    const providerSwitchConfig = configWithDefaults({
      subscriptionProvider: "openai-codex",
      model: { primary: "openai" },
    });
    const providerSwitchConnection = createProviderSwitchConnection({
      provider: "anthropic-subscription",
    });
    if (!providerSwitchConnection) {
      throw new Error("provider switch connection should be created");
    }

    await applyOnboardingConnectionConfig(onboardingConfig, {
      kind: "local-provider",
      provider: "anthropic-subscription",
    });
    await applyOnboardingConnectionConfig(
      providerSwitchConfig,
      providerSwitchConnection,
    );

    expect(providerSwitchConfig).toEqual(onboardingConfig);
  });

  it("applies openrouter model overrides through the normalized path", async () => {
    const config = emptyConfig();

    await applyOnboardingConnectionConfig(config, {
      kind: "local-provider",
      provider: "openrouter",
      apiKey: "sk-or-test",
      primaryModel: "openai/gpt-5-mini",
    });

    expect(config.agents?.defaults?.model?.primary).toBe("openai/gpt-5-mini");
    expect((config.env as Record<string, string>)?.OPENROUTER_API_KEY).toBe(
      "sk-or-test",
    );
  });
});

describe("resolveExistingOnboardingConnection", () => {
  it("reconstructs a saved eliza cloud onboarding connection", () => {
    expect(
      resolveExistingOnboardingConnection({
        cloud: {
          enabled: true,
          inferenceMode: "cloud",
          apiKey: "sk-cloud-test",
        },
        models: {
          small: "openai/gpt-5-mini",
          large: "anthropic/claude-sonnet-4.5",
        },
      }),
    ).toEqual({
      kind: "cloud-managed",
      cloudProvider: "elizacloud",
      apiKey: "sk-cloud-test",
      smallModel: "openai/gpt-5-mini",
      largeModel: "anthropic/claude-sonnet-4.5",
    });
  });
});

describe("mergeOnboardingConnectionWithExisting", () => {
  it("preserves a saved local provider secret when the resumed submit omits it", () => {
    expect(
      mergeOnboardingConnectionWithExisting(
        {
          kind: "local-provider",
          provider: "openrouter",
          primaryModel: "openai/gpt-5-mini",
        },
        {
          kind: "local-provider",
          provider: "openrouter",
          apiKey: "sk-or-saved",
          primaryModel: "openai/gpt-5-mini",
        },
      ),
    ).toEqual({
      kind: "local-provider",
      provider: "openrouter",
      apiKey: "sk-or-saved",
      primaryModel: "openai/gpt-5-mini",
    });
  });

  it("preserves a saved cloud api key when the resumed submit sends a redacted placeholder", () => {
    expect(
      mergeOnboardingConnectionWithExisting(
        {
          kind: "cloud-managed",
          cloudProvider: "elizacloud",
          apiKey: "[REDACTED]",
        },
        {
          kind: "cloud-managed",
          cloudProvider: "elizacloud",
          apiKey: "sk-cloud-saved",
          smallModel: "openai/gpt-5-mini",
          largeModel: "anthropic/claude-sonnet-4.5",
        },
      ),
    ).toEqual({
      kind: "cloud-managed",
      cloudProvider: "elizacloud",
      apiKey: "sk-cloud-saved",
      smallModel: "openai/gpt-5-mini",
      largeModel: "anthropic/claude-sonnet-4.5",
    });
  });
});
