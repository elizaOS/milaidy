import { describe, expect, it } from "vitest";

import type { MiladyConfig } from "../config/types.milady";
import {
  applySubscriptionProviderConfig,
  clearSubscriptionProviderConfig,
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
