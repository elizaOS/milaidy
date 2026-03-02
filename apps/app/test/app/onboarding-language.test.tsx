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
}));

vi.mock("../../src/components/AvatarSelector", () => ({
  AvatarSelector: () => null,
}));

vi.mock("../../src/components/PermissionsSection", () => ({
  PermissionsOnboardingSection: () => null,
}));

vi.mock("../../src/api-client", () => ({
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
    onboardingStep: "runMode",
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
    onboardingSetupMode: "advanced",
    uiLanguage: "en",
    cloudConnected: false,
    cloudLoginBusy: false,
    cloudLoginError: "",
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
    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(OnboardingWizard));
    });

    expect(collectText(tree?.root)).toContain("where should i live?");
  });

  it("shows chinese copy when uiLanguage is zh-CN", async () => {
    mockUseApp.mockReturnValue(
      createOnboardingContext({ uiLanguage: "zh-CN" }),
    );
    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(OnboardingWizard));
    });

    const text = collectText(tree?.root);
    expect(text).toContain("我应该运行在哪里？");
    expect(text).toContain("选择你希望我如何运行");
  });
});
