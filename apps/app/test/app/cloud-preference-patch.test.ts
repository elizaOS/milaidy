import { describe, expect, it, vi } from "vitest";
import {
  installLocalProviderCloudPreferencePatch,
  normalizeConfigForLocalProviderPreference,
  shouldMaskInactiveCloudStatus,
  shouldPreferLocalProviderConfig,
} from "../../src/cloud-preference-patch";

describe("cloud preference patch", () => {
  it("normalizes inactive cloud config when a Claude subscription is already configured", () => {
    const normalized = normalizeConfigForLocalProviderPreference({
      cloud: {
        enabled: false,
        apiKey: "eliza-stale-key",
        provider: "elizacloud",
        inferenceMode: "cloud",
        services: { inference: true },
      },
      agents: {
        defaults: {
          subscriptionProvider: "anthropic-subscription",
          model: { primary: "anthropic" },
        },
      },
      models: {
        small: "moonshotai/kimi-k2-turbo",
        large: "moonshotai/kimi-k2-0905",
      },
    }) as Record<string, unknown>;

    expect(
      shouldPreferLocalProviderConfig({
        cloud: {
          enabled: false,
          apiKey: "eliza-stale-key",
          provider: "elizacloud",
          inferenceMode: "cloud",
        },
        agents: {
          defaults: {
            subscriptionProvider: "anthropic-subscription",
          },
        },
      }),
    ).toBe(true);
    expect(normalized.cloud).toEqual({
      enabled: false,
      inferenceMode: "byok",
      services: { inference: false },
    });
    expect(normalized.models).toBeUndefined();
    expect(
      (
        normalized.agents as {
          defaults?: { subscriptionProvider?: string };
        }
      )?.defaults?.subscriptionProvider?.toString(),
    ).toBe("anthropic-subscription");
  });

  it("does not normalize active cloud inference config", () => {
    const config = {
      cloud: {
        enabled: true,
        apiKey: "eliza-live-key",
        provider: "elizacloud",
        inferenceMode: "cloud",
        services: { inference: true },
      },
      agents: {
        defaults: {
          subscriptionProvider: "anthropic-subscription",
        },
      },
    };

    expect(shouldPreferLocalProviderConfig(config)).toBe(false);
    expect(normalizeConfigForLocalProviderPreference(config)).toEqual(config);
  });

  it("masks api-key-only cloud status when local Claude is the active provider", () => {
    const config = {
      cloud: {
        enabled: false,
        apiKey: "eliza-stale-key",
        inferenceMode: "byok",
      },
      agents: {
        defaults: {
          subscriptionProvider: "anthropic-subscription",
        },
      },
    };

    expect(
      shouldMaskInactiveCloudStatus({
        config,
        status: {
          enabled: false,
          connected: true,
          hasApiKey: true,
        },
      }),
    ).toBe(true);
    expect(
      shouldMaskInactiveCloudStatus({
        config,
        status: {
          enabled: false,
          connected: true,
          hasApiKey: true,
          userId: "user-1",
        },
      }),
    ).toBe(false);
  });

  it("patches client getters so onboarding and cloud badges ignore stale cloud state", async () => {
    const originalGetConfig = vi.fn(async () => ({
      cloud: {
        enabled: false,
        apiKey: "eliza-stale-key",
        provider: "elizacloud",
        inferenceMode: "byok",
      },
      agents: {
        defaults: {
          subscriptionProvider: "anthropic-subscription",
          model: { primary: "anthropic" },
        },
      },
    }));
    const originalGetCloudStatus = vi.fn(async () => ({
      enabled: false,
      connected: true,
      hasApiKey: true,
    }));
    const originalGetCloudCredits = vi.fn(async () => ({
      connected: true,
      balance: 0.17,
    }));

    const mockClient = {
      getConfig: originalGetConfig,
      getCloudStatus: originalGetCloudStatus,
      getCloudCredits: originalGetCloudCredits,
    };

    const restore = installLocalProviderCloudPreferencePatch(mockClient);

    try {
      await expect(mockClient.getConfig()).resolves.toEqual({
        cloud: {
          enabled: false,
          inferenceMode: "byok",
        },
        agents: {
          defaults: {
            subscriptionProvider: "anthropic-subscription",
            model: { primary: "anthropic" },
          },
        },
      });
      await expect(mockClient.getCloudStatus()).resolves.toEqual({
        enabled: false,
        connected: false,
        hasApiKey: false,
        reason: "inactive_local_provider",
      });
      await expect(mockClient.getCloudCredits()).resolves.toEqual({
        balance: null,
        connected: false,
      });
      expect(originalGetCloudCredits).toHaveBeenCalledTimes(0);
    } finally {
      restore();
    }
  });
});
