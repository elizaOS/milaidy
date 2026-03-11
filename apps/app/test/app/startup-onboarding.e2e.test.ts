// @vitest-environment jsdom
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

type OnboardingStep =
  | "welcome"
  | "language"
  | "setupMode"
  | "runMode"
  | "dockerSetup"
  | "cloudProvider"
  | "modelSelection"
  | "cloudLogin"
  | "llmProvider"
  | "inventorySetup"
  | "connectors"
  | "permissions";

type AppHarnessState = {
  onboardingLoading: boolean;
  authRequired: boolean;
  onboardingComplete: boolean;
  tab: string;
  actionNotice: null;
  onboardingStep: OnboardingStep;
  onboardingOptions: {
    names: string[];
    styles: Array<{
      catchphrase: string;
      hint: string;
      bio: string[];
      system: string;
      style: { all: string[]; chat: string[]; post: string[] };
      adjectives: string[];
      topics: string[];
      postExamples: string[];
      messageExamples: Array<
        Array<{ name: string; content: { text: string } }>
      >;
    }>;
    providers: Array<{
      id: string;
      name: string;
      envKey: string | null;
      pluginName: string;
      keyPrefix: string | null;
      description: string;
    }>;
    cloudProviders: Array<{ id: string; name: string; description: string }>;
    models: {
      small: Array<{
        id: string;
        name: string;
        provider: string;
        description: string;
      }>;
      large: Array<{
        id: string;
        name: string;
        provider: string;
        description: string;
      }>;
    };
    inventoryProviders: Array<{
      id: string;
      name: string;
      description: string;
      rpcProviders: Array<{
        id: string;
        name: string;
        description: string;
        envKey: string | null;
        requiresKey: boolean;
      }>;
    }>;
    sharedStyleRules: string;
  } | null;
  onboardingName: string;
  onboardingStyle: string;
  onboardingTheme: string;
  onboardingSetupMode: "quick" | "advanced" | "";
  onboardingRunMode: "local-rawdog" | "local-sandbox" | "cloud" | "";
  onboardingCloudProvider: string;
  onboardingSmallModel: string;
  onboardingLargeModel: string;
  onboardingProvider: string;
  onboardingApiKey: string;
  onboardingOpenRouterModel: string;
  onboardingPrimaryModel: string;
  onboardingTelegramToken: string;
  onboardingDiscordToken: string;
  onboardingTwilioAccountSid: string;
  onboardingTwilioAuthToken: string;
  onboardingTwilioPhoneNumber: string;
  onboardingBlooioApiKey: string;
  onboardingBlooioPhoneNumber: string;
  onboardingSubscriptionTab: "token" | "oauth";
  onboardingSelectedChains: Set<string>;
  onboardingRpcSelections: Record<string, string>;
  onboardingRpcKeys: Record<string, string>;
  onboardingAvatar: number;
  onboardingRestarting: boolean;
  miladyCloudConnected: boolean;
  miladyCloudLoginBusy: boolean;
  miladyCloudLoginError: string;
  miladyCloudUserId: string;
  uiShellMode: string;
  [key: string]: unknown;
};

const { mockUseApp } = vi.hoisted(() => ({
  mockUseApp: vi.fn(),
}));
const { mockUseLifoAutoPopout } = vi.hoisted(() => ({
  mockUseLifoAutoPopout: vi.fn(),
}));

vi.mock("../../src/AppContext", async () => {
  const actual = await vi.importActual("../../src/AppContext");
  return {
    ...actual,
    useApp: () => mockUseApp(),
  };
});

vi.mock("../../src/components/Header", () => ({
  Header: () => React.createElement("div", null, "Header"),
}));
vi.mock("../../src/components/Nav", () => ({
  Nav: () => React.createElement("div", null, "Nav"),
}));
vi.mock("../../src/components/CommandPalette", () => ({
  CommandPalette: () => React.createElement("div", null, "CommandPalette"),
}));
vi.mock("../../src/components/EmotePicker", () => ({
  EmotePicker: () => React.createElement("div", null, "EmotePicker"),
}));
vi.mock("../../src/components/SaveCommandModal", () => ({
  SaveCommandModal: () => React.createElement("div", null, "SaveCommandModal"),
}));
vi.mock("../../src/components/ConversationsSidebar", () => ({
  ConversationsSidebar: () =>
    React.createElement("div", null, "ConversationsSidebar"),
}));
vi.mock("../../src/components/AutonomousPanel", () => ({
  AutonomousPanel: () => React.createElement("div", null, "AutonomousPanel"),
}));
vi.mock("../../src/components/CustomActionsPanel", () => ({
  CustomActionsPanel: () =>
    React.createElement("div", null, "CustomActionsPanel"),
}));
vi.mock("../../src/components/CustomActionEditor", () => ({
  CustomActionEditor: () =>
    React.createElement("div", null, "CustomActionEditor"),
}));
vi.mock("../../src/components/AppsPageView", () => ({
  AppsPageView: () => React.createElement("div", null, "AppsPageView"),
}));
vi.mock("../../src/components/AdvancedPageView", () => ({
  AdvancedPageView: () => React.createElement("div", null, "AdvancedPageView"),
}));
vi.mock("../../src/components/CharacterView", () => ({
  CharacterView: () => React.createElement("div", null, "CharacterView"),
}));
vi.mock("../../src/components/TriggersView", () => ({
  TriggersView: () => React.createElement("div", null, "TriggersView"),
}));
vi.mock("../../src/components/ConnectorsPageView", () => ({
  ConnectorsPageView: () =>
    React.createElement("div", null, "ConnectorsPageView"),
}));
vi.mock("../../src/components/InventoryView", () => ({
  InventoryView: () => React.createElement("div", null, "InventoryView"),
}));
vi.mock("../../src/components/KnowledgeView", () => ({
  KnowledgeView: () => React.createElement("div", null, "KnowledgeView"),
}));
vi.mock("../../src/components/LifoSandboxView", () => ({
  LifoSandboxView: () => React.createElement("div", null, "LifoSandboxView"),
}));
vi.mock("../../src/components/SettingsView", () => ({
  SettingsView: () => React.createElement("div", null, "SettingsView"),
}));
vi.mock("../../src/components/PairingView", () => ({
  PairingView: () => React.createElement("div", null, "PairingView"),
}));
vi.mock("../../src/components/ChatView", () => ({
  ChatView: () => React.createElement("div", null, "ChatView"),
}));
vi.mock("../../src/components/LoadingScreen", () => ({
  LoadingScreen: () => React.createElement("div", null, "LoadingScreen"),
}));
vi.mock("../../src/components/CompanionView", () => ({
  CompanionView: () => React.createElement("div", null, "CompanionView"),
}));
vi.mock("../../src/components/ChatModalView.js", () => ({
  ChatModalView: () => React.createElement("div", null, "ChatModalView"),
}));
vi.mock("../../src/hooks/useLifoAutoPopout", () => ({
  useLifoAutoPopout: (options: unknown) => mockUseLifoAutoPopout(options),
}));
vi.mock("../../src/components/TerminalPanel", () => ({
  TerminalPanel: () => React.createElement("div", null, "TerminalPanel"),
}));
vi.mock("../../src/components/AvatarSelector", () => ({
  AvatarSelector: () => React.createElement("div", null, "AvatarSelector"),
}));
vi.mock("../../src/components/PermissionsSection", () => ({
  PermissionsOnboardingSection: ({
    onContinue,
  }: {
    onContinue: (options?: { allowPermissionBypass?: boolean }) => void;
  }) =>
    React.createElement(
      "button",
      { onClick: () => onContinue(), type: "button" },
      "permissions-continue",
    ),
}));

import { App } from "../../src/App";

function onboardingOptions() {
  return {
    names: ["Milady"],
    styles: [
      {
        catchphrase: "chaotic",
        hint: "chaotic good",
        bio: ["bio"],
        system: "You are {{name}}",
        style: { all: [], chat: [], post: [] },
        adjectives: [],
        topics: [],
        postExamples: [],
        messageExamples: [[{ name: "User", content: { text: "hello" } }]],
      },
    ],
    providers: [
      {
        id: "ollama",
        name: "Ollama",
        envKey: null,
        pluginName: "@elizaos/plugin-ollama",
        keyPrefix: null,
        description: "Use local Ollama",
      },
    ],
    cloudProviders: [
      { id: "openrouter", name: "OpenRouter", description: "Cloud provider" },
    ],
    models: {
      small: [
        {
          id: "small-model",
          name: "Small",
          provider: "openrouter",
          description: "small",
        },
      ],
      large: [
        {
          id: "large-model",
          name: "Large",
          provider: "openrouter",
          description: "large",
        },
      ],
    },
    inventoryProviders: [
      {
        id: "evm",
        name: "EVM",
        description: "EVM chains",
        rpcProviders: [
          {
            id: "elizacloud",
            name: "Eliza Cloud",
            description: "Managed RPC",
            envKey: null,
            requiresKey: false,
          },
        ],
      },
    ],
    sharedStyleRules: "",
  };
}

function createHarnessState(): AppHarnessState {
  return {
    onboardingLoading: false,
    authRequired: false,
    onboardingComplete: false,
    tab: "chat",
    actionNotice: null,
    onboardingStep: "welcome",
    onboardingOptions: onboardingOptions(),
    onboardingName: "",
    onboardingStyle: "",
    onboardingTheme: "milady",
    onboardingSetupMode: "quick",
    onboardingRunMode: "",
    onboardingCloudProvider: "",
    onboardingSmallModel: "small-model",
    onboardingLargeModel: "large-model",
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
    onboardingSelectedChains: new Set(["evm"]),
    onboardingRpcSelections: {},
    onboardingRpcKeys: {},
    onboardingAvatar: 1,
    onboardingRestarting: false,
    miladyCloudConnected: false,
    miladyCloudLoginBusy: false,
    miladyCloudLoginError: "",
    miladyCloudUserId: "",
    uiShellMode: "native",
  };
}

function textOf(node: TestRenderer.ReactTestInstance): string {
  return node.children
    .map((child) => (typeof child === "string" ? child : textOf(child)))
    .join("");
}

function hasText(
  node: TestRenderer.ReactTestInstance,
  target: string,
): boolean {
  return textOf(node).includes(target);
}

function clickButton(
  tree: TestRenderer.ReactTestRenderer,
  labelFragment: string,
): void {
  const button = tree.root.findAll(
    (node) => node.type === "button" && hasText(node, labelFragment),
  )[0];
  if (!button) {
    throw new Error(`Button containing "${labelFragment}" not found`);
  }
  button.props.onClick();
}

async function rerender(tree: TestRenderer.ReactTestRenderer): Promise<void> {
  await act(async () => {
    tree.update(React.createElement(App));
  });
}

describe("app startup onboarding flow (e2e)", () => {
  let state: AppHarnessState;

  beforeEach(() => {
    state = createHarnessState();

    const handleOnboardingNext = async () => {
      switch (state.onboardingStep) {
        case "welcome":
          state.onboardingStep = "language";
          break;
        case "language":
          state.onboardingStep = "setupMode";
          break;
        case "setupMode":
          state.onboardingStep =
            state.onboardingSetupMode === "advanced"
              ? "runMode"
              : "llmProvider";
          break;
        case "runMode":
          state.onboardingStep = "llmProvider";
          break;
        case "llmProvider":
          state.onboardingStep = "permissions";
          break;
        case "permissions":
          state.onboardingComplete = true;
          state.tab = "chat";
          break;
        default:
          break;
      }
    };

    const handleOnboardingBack = () => {
      switch (state.onboardingStep) {
        case "language":
          state.onboardingStep = "welcome";
          break;
        case "setupMode":
          state.onboardingStep = "language";
          break;
        case "runMode":
        case "llmProvider":
          state.onboardingStep = "setupMode";
          break;
        case "permissions":
          state.onboardingStep = "llmProvider";
          break;
        default:
          break;
      }
    };

    mockUseApp.mockReset();
    mockUseLifoAutoPopout.mockReset();
    mockUseApp.mockImplementation(() => ({
      t: (k: string) => k,
      ...state,
      setState: (key: string, value: unknown) => {
        state[key] = value;
      },
      setTheme: (theme: string) => {
        state.onboardingTheme = theme;
      },
      handleOnboardingNext,
      handleOnboardingBack,
      handleCloudLogin: async () => {
        state.miladyCloudConnected = true;
        state.miladyCloudUserId = "test-user";
      },
    }));
  });

  it("progresses through onboarding and lands in chat", async () => {
    let tree = undefined as unknown as TestRenderer.ReactTestRenderer;

    await act(async () => {
      tree = TestRenderer.create(React.createElement(App));
    });

    for (let i = 0; i < 20 && !state.onboardingComplete; i += 1) {
      if (state.onboardingStep === "setupMode") {
        state.onboardingSetupMode = "quick";
        await rerender(tree);
      }

      if (state.onboardingStep === "llmProvider") {
        state.onboardingProvider = "ollama";
        // Mock api key requirement bypassing logic or ensure valid state
        state.onboardingApiKey = "test-key";
        await rerender(tree);
      }

      if (state.onboardingStep === "permissions") {
        clickButton(tree, "permissions-continue");
      } else {
        clickButton(tree, "next");
      }
      await rerender(tree);
    }

    expect(state.onboardingComplete).toBe(true);

    const renderedText = tree.root
      .findAllByType("div")
      .map((node: { children: (string | object)[] }) => node.children.join(""))
      .join("\n");

    expect(renderedText).toContain("ChatView");
    expect(renderedText).toContain("Header");
  });
});
