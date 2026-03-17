import { describe, expect, it } from "vitest";

import {
  getStoredOnboardingProviderId,
  getSubscriptionProviderFamily,
  normalizeOnboardingProviderId,
  normalizeSubscriptionProviderSelectionId,
  ONBOARDING_PROVIDER_CATALOG,
  sortOnboardingProviders,
} from "./onboarding";

describe("onboarding provider catalog", () => {
  it("round-trips subscription stored ids to UI ids", () => {
    expect(
      normalizeSubscriptionProviderSelectionId("anthropic-subscription"),
    ).toBe("anthropic-subscription");
    expect(normalizeSubscriptionProviderSelectionId("openai-codex")).toBe(
      "openai-subscription",
    );
    expect(getStoredOnboardingProviderId("anthropic-subscription")).toBe(
      "anthropic-subscription",
    );
    expect(getStoredOnboardingProviderId("openai-subscription")).toBe(
      "openai-codex",
    );
  });

  it("keeps subscription and api-key families distinct", () => {
    expect(getSubscriptionProviderFamily("anthropic-subscription")).toBe(
      "anthropic",
    );
    expect(getStoredOnboardingProviderId("anthropic")).toBe("anthropic");
    expect(getStoredOnboardingProviderId("anthropic-subscription")).not.toBe(
      getStoredOnboardingProviderId("anthropic"),
    );
  });

  it("normalizes provider aliases deterministically", () => {
    expect(normalizeOnboardingProviderId("openai-codex")).toBe(
      "openai-subscription",
    );
    expect(normalizeOnboardingProviderId("google")).toBe("gemini");
    expect(normalizeOnboardingProviderId("xai")).toBe("grok");
    expect(normalizeOnboardingProviderId("z.ai")).toBe("zai");
  });

  it("sorts recommended providers ahead of the rest", () => {
    const sorted = sortOnboardingProviders(ONBOARDING_PROVIDER_CATALOG);
    expect(sorted.slice(0, 3).map((provider) => provider.id)).toEqual([
      "elizacloud",
      "anthropic-subscription",
      "openai-subscription",
    ]);
  });
});
