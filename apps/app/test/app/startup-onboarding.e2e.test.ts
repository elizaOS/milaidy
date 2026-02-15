import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

type OnboardingStep =
  | "welcome"
  | "name"
  | "avatar"
  | "style"
  | "theme"
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
      messageExamples: Array<Array<{ name: string; content: { text: string } }>>;
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
      small: Array<{ id: string; name: string; provider: string; description: string }>;
      large: Array<{ id: string; name: string; provider: string; description: string }>;
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
  cloudConnected: boolean;
  cloudLoginBusy: boolean;
  cloudLoginError: string;
  cloudUserId: string;
  [key: string]: unknown;
};

const { mockUseApp } = vi.hoisted(() => ({
  mockUseApp: vi.fn(),
}));

vi.mock("../../src/AppContext", async () => {
  const actual = await vi.importActual("../../src/AppContext");
  return {
    ...actual,
    useApp: () => mockUseApp(),
  };
});

vi.mock("../../src/components/Header.js", () => ({
  Header: () => React.createElement("div", null, "Header"),
}));
vi.mock("../../src/components/Nav.js", () => ({
  Nav: () => React.createElement("div", null, "Nav"),
}));
vi.mock("../../src/components/CommandPalette.js", () => ({
  CommandPalette: () => React.createElement("div", null, "CommandPalette"),
}));
vi.mock("../../src/components/EmotePicker.js", () => ({
  EmotePicker: () => React.createElement("div", null, "EmotePicker"),
}));
vi.mock("../../src/components/SaveCommandModal.js", () => ({
  SaveCommandModal: () => React.createElement("div", null, "SaveCommandModal"),
}));
vi.mock("../../src/components/ConversationsSidebar.js", () => ({
  ConversationsSidebar: () => React.createElement("div", null, "ConversationsSidebar"),
}));
vi.mock("../../src/components/AutonomousPanel.js", () => ({
  AutonomousPanel: () => React.createElement("div", null, "AutonomousPanel"),
}));
vi.mock("../../src/components/CustomActionsPanel.js", () => ({
  CustomActionsPanel: () => React.createElement("div", null, "CustomActionsPanel"),
}));
vi.mock("../../src/components/CustomActionEditor.js", () => ({
  CustomActionEditor: () => React.createElement("div", null, "CustomActionEditor"),
}));
vi.mock("../../src/components/AppsPageView.js", () => ({
  AppsPageView: () => React.createElement("div", null, "AppsPageView"),
}));
vi.mock("../../src/components/AdvancedPageView.js", () => ({
  AdvancedPageView: () => React.createElement("div", null, "AdvancedPageView"),
}));
vi.mock("../../src/components/CharacterView.js", () => ({
  CharacterView: () => React.createElement("div", null, "CharacterView"),
}));
vi.mock("../../src/components/TriggersView.js", () => ({
  TriggersView: () => React.createElement("div", null, "TriggersView"),
}));
vi.mock("../../src/components/ConnectorsPageView.js", () => ({
  ConnectorsPageView: () => React.createElement("div", null, "ConnectorsPageView"),
}));
vi.mock("../../src/components/InventoryView.js", () => ({
  InventoryView: () => React.createElement("div", null, "InventoryView"),
}));
vi.mock("../../src/components/KnowledgeView.js", () => ({
  KnowledgeView: () => React.createElement("div", null, "KnowledgeView"),
}));
vi.mock("../../src/components/SettingsView.js", () => ({
  SettingsView: () => React.createElement("div", null, "SettingsView"),
}));
vi.mock("../../src/components/PairingView.js", () => ({
  PairingView: () => React.createElement("div", null, "PairingView"),
}));
vi.mock("../../src/components/ChatView.js", () => ({
  ChatView: () => React.createElement("div", null, "ChatView"),
}));
vi.mock("../../src/components/LoadingScreen.js", () => ({
  LoadingScreen: () => React.createElement("div", null, "LoadingScreen"),
}));
vi.mock("../../src/components/TerminalPanel.js", () => ({
  TerminalPanel: () => React.createElement("div", null, "TerminalPanel"),
}));
vi.mock("../../src/components/AvatarSelector.js", () => ({
  AvatarSelector: () => React.createElement("div", null, "AvatarSelector"),
}));
vi.mock("../../src/components/PermissionsSection.js", () => ({
  PermissionsOnboardingSection: () => React.createElement("div", null, "PermissionsOnboardingSection"),
}));

import { App } from "../../src/App";

function onboardingOptions() {
  return {
    names: ["Milaidy"],
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
    cloudProviders: [{ id: "openrouter", name: "OpenRouter", description: "Cloud provider" }],
    models: {
      small: [{ id: "small-model", name: "Small", provider: "openrouter", description: "small" }],
      large: [{ id: "large-model", name: "Large", provider: "openrouter", description: "large" }],
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
    cloudConnected: false,
    cloudLoginBusy: false,
    cloudLoginError: "",
    cloudUserId: "",
  };
}

function textOf(node: TestRenderer.ReactTestInstance): string {
  return node.children
    .map((child) => (typeof child === "string" ? child : textOf(child)))
    .join("");
}

function hasText(node: TestRenderer.ReactTestInstance, target: string): boolean {
  return textOf(node).includes(target);
}

function clickButton(tree: TestRenderer.ReactTestRenderer, labelFragment: string): void {
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
          state.onboardingStep = "name";
          break;
        case "name":
          state.onboardingStep = "avatar";
          break;
        case "avatar":
          state.onboardingStep = "style";
          break;
        case "style":
          state.onboardingStep = "theme";
          break;
        case "theme":
          state.onboardingStep = "runMode";
          break;
        case "runMode":
          state.onboardingStep = state.onboardingRunMode === "local-sandbox" ? "dockerSetup" : "llmProvider";
          break;
        case "dockerSetup":
          state.onboardingStep = "llmProvider";
          break;
        case "llmProvider":
          state.onboardingStep = "inventorySetup";
          break;
        case "inventorySetup":
          state.onboardingStep = "connectors";
          break;
        case "connectors":
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
        case "name":
          state.onboardingStep = "welcome";
          break;
        case "avatar":
          state.onboardingStep = "name";
          break;
        case "style":
          state.onboardingStep = "avatar";
          break;
        case "theme":
          state.onboardingStep = "style";
          break;
        case "runMode":
          state.onboardingStep = "theme";
          break;
        case "llmProvider":
          state.onboardingStep = "runMode";
          break;
        case "inventorySetup":
          state.onboardingStep = "llmProvider";
          break;
        case "connectors":
          state.onboardingStep = "inventorySetup";
          break;
        case "permissions":
          state.onboardingStep = "connectors";
          break;
        default:
          break;
      }
    };

    mockUseApp.mockReset();
    mockUseApp.mockImplementation(() => ({
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
        state.cloudConnected = true;
        state.cloudUserId = "test-user";
      },
    }));
  });

  it("progresses through onboarding and lands in chat", async () => {
    let tree: TestRenderer.ReactTestRenderer;

    await act(async () => {
      tree = TestRenderer.create(React.createElement(App));
    });

    for (let i = 0; i < 20 && !state.onboardingComplete; i += 1) {
      if (state.onboardingStep === "name") {
        const nameInput = tree!.root.findAll(
          (node) => node.type === "input" && node.props.placeholder === "enter custom name...",
        )[0];
        expect(nameInput).toBeDefined();
        await act(async () => {
          nameInput.props.onChange({ target: { value: "Onboarding Smoke" } });
        });
        await rerender(tree!);
      }

      if (state.onboardingStep === "style" && !state.onboardingStyle) {
        clickButton(tree!, "chaotic");
        await rerender(tree!);
      }

      if (state.onboardingStep === "runMode") {
        state.onboardingRunMode = "local-rawdog";
        await rerender(tree!);
      }

      if (state.onboardingStep === "llmProvider") {
        state.onboardingProvider = "ollama";
        await rerender(tree!);
      }

      clickButton(tree!, "next");
      await rerender(tree!);
    }

    expect(state.onboardingComplete).toBe(true);

    const renderedText = tree!.root.findAllByType("div")
      .map((node) => node.children.join(""))
      .join("\n");

    expect(renderedText).toContain("ChatView");
    expect(renderedText).toContain("Header");
    expect(renderedText).toContain("Nav");
  });
});
