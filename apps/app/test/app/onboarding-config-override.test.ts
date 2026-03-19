import { describe, expect, it } from "vitest";
import { ELIZA_TOOLS_OAUTH_PROVIDER } from "../../src/onboarding-auth";
import { buildOnboardingConnectionConfig } from "../../src/onboarding-config";

describe("Milady onboarding config override", () => {
  it("keeps Eliza tools OAuth separate from cloud inference selection", () => {
    const connection = buildOnboardingConnectionConfig({
      onboardingRunMode: "local",
      onboardingCloudProvider: "",
      onboardingProvider: ELIZA_TOOLS_OAUTH_PROVIDER,
      onboardingApiKey: "",
      onboardingPrimaryModel: "",
      onboardingOpenRouterModel: "",
      onboardingRemoteConnected: false,
      onboardingRemoteApiBase: "",
      onboardingRemoteToken: "",
      onboardingSmallModel: "",
      onboardingLargeModel: "",
    }) as { kind: string; service?: string } | null;

    expect(connection).toEqual({
      kind: "eliza-tools-oauth",
      service: "elizacloud",
    });
  });
});
