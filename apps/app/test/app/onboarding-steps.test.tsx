/**
 * Tests for the new 6-step linear onboarding step components:
 * WakeUpStep, IdentityStep, ConnectionStep, ActivateStep
 *
 * Validates rendering, user interaction, and navigation callbacks.
 */
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Hoisted mock ──────────────────────────────────────────────────────
const { mockUseApp } = vi.hoisted(() => ({
  mockUseApp: vi.fn(),
}));

vi.mock("../../src/AppContext", () => ({
  useApp: () => mockUseApp(),
}));

vi.mock("@milady/app-core/api", () => ({
  client: {
    importAgent: vi.fn(),
    startAnthropicLogin: vi.fn(),
    exchangeAnthropicCode: vi.fn(),
    startOpenAILogin: vi.fn(),
    exchangeOpenAICode: vi.fn(),
  },
}));

vi.mock("../../src/provider-logos", () => ({
  getProviderLogo: () => "/logos/placeholder.png",
}));

import { ActivateStep } from "../../src/components/onboarding/ActivateStep";
import { ConnectionStep } from "../../src/components/onboarding/ConnectionStep";
import { IdentityStep } from "../../src/components/onboarding/IdentityStep";
import { WakeUpStep } from "../../src/components/onboarding/WakeUpStep";

// ── Helpers ───────────────────────────────────────────────────────────

function baseContext(overrides?: Record<string, unknown>) {
  return {
    t: (k: string) => k,
    onboardingStep: "wakeUp",
    onboardingOptions: {
      names: ["Eliza", "Nova"],
      styles: [{ catchphrase: "default" }],
      cloudProviders: [],
      providers: [
        { id: "openai", name: "OpenAI", description: "GPT API" },
        { id: "anthropic", name: "Anthropic", description: "Claude API" },
      ],
      models: { small: [], large: [] },
      openrouterModels: [],
      inventoryProviders: [],
      piAiModels: [],
      piAiDefaultModel: "",
    },
    onboardingName: "Eliza",
    onboardingOwnerName: "anon",
    onboardingStyle: "default",
    onboardingRunMode: "",
    onboardingCloudProvider: "",
    onboardingSmallModel: "",
    onboardingLargeModel: "",
    onboardingProvider: "",
    onboardingApiKey: "",
    onboardingOpenRouterModel: "",
    onboardingPrimaryModel: "",
    onboardingSubscriptionTab: "token" as const,
    onboardingMiladyCloudTab: "login" as const,
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
    handleCloudLogin: vi.fn(async () => {}),
    setState: vi.fn(),
    ...overrides,
  };
}

function collectText(node: TestRenderer.ReactTestInstance): string {
  return node.children
    .map((child) => (typeof child === "string" ? child : collectText(child)))
    .join(" ");
}

function findButtons(
  root: TestRenderer.ReactTestInstance,
): TestRenderer.ReactTestInstance[] {
  return root.findAllByType("button");
}

// ===================================================================
//  WakeUpStep
// ===================================================================

describe("WakeUpStep", () => {
  beforeEach(() => mockUseApp.mockReset());

  it("renders initialization screen with Activate button", async () => {
    mockUseApp.mockReturnValue(baseContext());
    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(WakeUpStep));
    });

    const text = collectText(tree?.root as TestRenderer.ReactTestInstance);
    expect(text).toContain("Initialization");
    expect(text).toContain("elizaOS");
    expect(text).toContain("Activate");
  });

  it("calls handleOnboardingNext when Activate is clicked", async () => {
    const next = vi.fn(async () => {});
    mockUseApp.mockReturnValue(baseContext({ handleOnboardingNext: next }));
    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(WakeUpStep));
    });

    const buttons = findButtons(tree?.root as TestRenderer.ReactTestInstance);
    const activateBtn = buttons.find((b) => collectText(b) === "Activate");
    expect(activateBtn).toBeDefined();
    await act(async () => {
      activateBtn?.props.onClick();
    });
    expect(next).toHaveBeenCalled();
  });

  it("shows Restore from Backup option", async () => {
    mockUseApp.mockReturnValue(baseContext());
    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(WakeUpStep));
    });

    const text = collectText(tree?.root as TestRenderer.ReactTestInstance);
    expect(text).toContain("Restore from Backup");
  });

  it("switches to import view when Restore from Backup is clicked", async () => {
    mockUseApp.mockReturnValue(baseContext());
    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(WakeUpStep));
    });

    const buttons = findButtons(tree?.root as TestRenderer.ReactTestInstance);
    const restoreBtn = buttons.find(
      (b) => collectText(b) === "Restore from Backup",
    );
    expect(restoreBtn).toBeDefined();
    await act(async () => {
      restoreBtn?.props.onClick();
    });

    const text = collectText(tree?.root as TestRenderer.ReactTestInstance);
    expect(text).toContain("Import Agent");
    expect(text).toContain("Cancel");
    expect(text).toContain("Restore");
  });
});

// ===================================================================
//  IdentityStep
// ===================================================================

describe("IdentityStep", () => {
  beforeEach(() => mockUseApp.mockReset());

  it("renders designation section with name", async () => {
    mockUseApp.mockReturnValue(baseContext({ onboardingName: "Nova" }));
    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(IdentityStep));
    });

    const text = collectText(tree?.root as TestRenderer.ReactTestInstance);
    expect(text).toContain("Designation");
    expect(text).toContain("My name is");
  });

  it("has Back and Confirm buttons", async () => {
    mockUseApp.mockReturnValue(baseContext());
    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(IdentityStep));
    });

    const text = collectText(tree?.root as TestRenderer.ReactTestInstance);
    expect(text).toContain("Back");
    expect(text).toContain("Confirm");
  });

  it("calls handleOnboardingBack when Back is clicked", async () => {
    const back = vi.fn();
    mockUseApp.mockReturnValue(baseContext({ handleOnboardingBack: back }));
    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(IdentityStep));
    });

    const buttons = findButtons(tree?.root as TestRenderer.ReactTestInstance);
    const backBtn = buttons.find((b) => collectText(b).includes("Back"));
    expect(backBtn).toBeDefined();
    await act(async () => {
      backBtn?.props.onClick();
    });
    expect(back).toHaveBeenCalled();
  });

  it("has a New name reroll button", async () => {
    mockUseApp.mockReturnValue(baseContext());
    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(IdentityStep));
    });

    const buttons = findButtons(tree?.root as TestRenderer.ReactTestInstance);
    const rerollBtn = buttons.find((b) => collectText(b).includes("New name"));
    expect(rerollBtn).toBeDefined();
  });
});

// ===================================================================
//  ConnectionStep
// ===================================================================

describe("ConnectionStep", () => {
  beforeEach(() => mockUseApp.mockReset());

  it("renders provider selection grid when no provider selected", async () => {
    mockUseApp.mockReturnValue(baseContext({ onboardingProvider: "" }));
    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(ConnectionStep));
    });

    const text = collectText(tree?.root as TestRenderer.ReactTestInstance);
    expect(text).toContain("Neural Link");
    expect(text).toContain("Choose your AI provider");
    expect(text).toContain("Back");
  });

  it("calls handleOnboardingBack from provider grid", async () => {
    const back = vi.fn();
    mockUseApp.mockReturnValue(
      baseContext({ onboardingProvider: "", handleOnboardingBack: back }),
    );
    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(ConnectionStep));
    });

    const buttons = findButtons(tree?.root as TestRenderer.ReactTestInstance);
    const backBtn = buttons.find((b) => collectText(b).includes("Back"));
    expect(backBtn).toBeDefined();
    await act(async () => {
      backBtn?.props.onClick();
    });
    expect(back).toHaveBeenCalled();
  });

  it("renders provider config when a provider is selected", async () => {
    mockUseApp.mockReturnValue(baseContext({ onboardingProvider: "openai" }));
    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(ConnectionStep));
    });

    const text = collectText(tree?.root as TestRenderer.ReactTestInstance);
    // Should show provider name and change button
    expect(text).toContain("OpenAI");
    expect(text).toContain("Change");
  });
});

// ===================================================================
//  ActivateStep
// ===================================================================

describe("ActivateStep", () => {
  beforeEach(() => mockUseApp.mockReset());

  it("renders ready screen with agent name", async () => {
    mockUseApp.mockReturnValue(baseContext({ onboardingName: "Nova" }));
    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(ActivateStep));
    });

    const text = collectText(tree?.root as TestRenderer.ReactTestInstance);
    expect(text).toContain("Ready");
    expect(text).toContain("Nova");
    expect(text).toContain("is ready");
    expect(text).toContain("Enter");
  });

  it("calls handleOnboardingNext when Enter is clicked", async () => {
    const next = vi.fn(async () => {});
    mockUseApp.mockReturnValue(
      baseContext({ onboardingName: "Nova", handleOnboardingNext: next }),
    );
    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(ActivateStep));
    });

    const buttons = findButtons(tree?.root as TestRenderer.ReactTestInstance);
    const enterBtn = buttons.find((b) => collectText(b) === "Enter");
    expect(enterBtn).toBeDefined();
    await act(async () => {
      enterBtn?.props.onClick();
    });
    expect(next).toHaveBeenCalled();
  });

  it("shows fallback name when onboardingName is empty", async () => {
    mockUseApp.mockReturnValue(baseContext({ onboardingName: "" }));
    let tree: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(ActivateStep));
    });

    const text = collectText(tree?.root as TestRenderer.ReactTestInstance);
    expect(text).toContain("Your companion");
    expect(text).toContain("is ready");
  });
});
