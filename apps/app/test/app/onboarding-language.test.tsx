import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockUseApp } = vi.hoisted(() => ({
  mockUseApp: vi.fn(),
}));

vi.mock("../../src/AppContext", () => ({
  useApp: () => mockUseApp(),
  THEMES: [{ id: "milady", label: "Milady", hint: "default" }],
  getVrmPreviewUrl: () => "/vrms/previews/milady-1.png",
  getVrmUrl: () => "/vrms/milady-1.vrm",
  getVrmBackgroundUrl: () => "/vrms/backgrounds/milady-1.png",
}));

vi.mock("../../src/components/AvatarSelector", () => ({
  AvatarSelector: () => null,
}));

vi.mock("../../src/components/PermissionsSection", () => ({
  PermissionsOnboardingSection: () => null,
}));

vi.mock("../../src/components/companion/VrmStage", () => ({
  VrmStage: () => null,
}));

vi.mock("@milady/app-core/api", () => ({
  client: {
    startAnthropicLogin: vi.fn(),
    exchangeAnthropicCode: vi.fn(),
    startOpenAILogin: vi.fn(),
    exchangeOpenAICode: vi.fn(),
  },
}));

import { OnboardingWizard } from "../../src/components/OnboardingWizard";

function createOnboardingContext(
  overrides?: Record<string, unknown>,
): Record<string, unknown> {
  return {
    t: (k: string) => k,
    onboardingStep: "identity",
    onboardingOptions: {
      names: ["Milady"],
      styles: [],
      cloudProviders: [],
      providers: [],
      models: { small: [], large: [] },
      openrouterModels: [],
      inventoryProviders: [],
      piModels: [],
      piDefaultModel: "",
    },
    onboardingName: "Milady",
    onboardingOwnerName: "anon",
    onboardingStyle: "default",
    onboardingTheme: "milady",
    onboardingRunMode: "",
    onboardingCloudProvider: "",
    onboardingSmallModel: "",
    onboardingLargeModel: "",
    onboardingProvider: "",
    onboardingApiKey: "",
    onboardingOpenRouterModel: "",
    onboardingPrimaryModel: "",
    onboardingTelegramToken: "",
    onboardingDiscordToken: "",
    onboardingTwilioAccountSid: "",
    onboardingTwilioAuthToken: "",
    onboardingTwilioPhoneNumber: "",
    onboardingBlooioApiKey: "",
    onboardingBlooioPhoneNumber: "",
    onboardingSubscriptionTab: "token",
    onboardingSelectedChains: new Set<string>(),
    onboardingRpcSelections: {},
    onboardingRpcKeys: {},
    onboardingAvatar: 1,
    customVrmUrl: "",
    onboardingRestarting: false,
    uiLanguage: "en",
    miladyCloudConnected: false,
    miladyCloudLoginBusy: false,
    miladyCloudLoginError: "",
    handleOnboardingNext: vi.fn(async () => {}),
    handleOnboardingBack: vi.fn(),
    setState: vi.fn(),
    setTheme: vi.fn(),
    handleCloudLogin: vi.fn(async () => {}),
    ...overrides,
  };
}

function collectText(node: TestRenderer.ReactTestInstance): string {
  return node.children
    .map((child) => (typeof child === "string" ? child : collectText(child)))
    .join(" ");
}

describe("Onboarding language mode", () => {
  beforeEach(() => {
    mockUseApp.mockReset();
  });

  it("shows english copy by default", async () => {
    mockUseApp.mockReturnValue(createOnboardingContext({ uiLanguage: "en" }));
    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(OnboardingWizard));
    });

    expect(collectText(tree?.root as TestRenderer.ReactTestInstance)).toContain(
      "Designation",
    );
  });

  it("shows chinese copy when uiLanguage is zh-CN", async () => {
    mockUseApp.mockReturnValue(
      createOnboardingContext({ uiLanguage: "zh-CN" }),
    );
    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(OnboardingWizard));
    });

    const text = collectText(tree?.root as TestRenderer.ReactTestInstance);
    expect(text).toContain("Designation");
    expect(text).toContain("My name is");
  });
});
