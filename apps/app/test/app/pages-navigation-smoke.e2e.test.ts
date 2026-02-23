import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Tab } from "../../src/navigation";
import { TAB_GROUPS } from "../../src/navigation";

const { mockUseApp, noop } = vi.hoisted(() => ({
  mockUseApp: vi.fn(),
  noop: vi.fn(),
}));

vi.mock("../../src/AppContext", () => ({
  useApp: () => mockUseApp(),
}));

vi.mock("../../src/components/Header.js", () => ({
  Header: () => React.createElement("header", null, "Header"),
}));

vi.mock("../../src/components/Nav.js", () => ({
  Nav: () => React.createElement("nav", null, "Nav"),
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

vi.mock("../../src/components/PairingView.js", () => ({
  PairingView: () => React.createElement("div", null, "PairingView"),
}));

vi.mock("../../src/components/OnboardingWizard.js", () => ({
  OnboardingWizard: () => React.createElement("div", null, "OnboardingWizard"),
}));

vi.mock("../../src/components/ChatView.js", () => ({
  ChatView: () => React.createElement("section", null, "ChatView Ready"),
}));

vi.mock("../../src/components/ConversationsSidebar.js", () => ({
  ConversationsSidebar: () =>
    React.createElement("aside", null, "ConversationsSidebar"),
}));

vi.mock("../../src/components/AutonomousPanel.js", () => ({
  AutonomousPanel: () => React.createElement("aside", null, "AutonomousPanel"),
}));

vi.mock("../../src/components/CustomActionsPanel.js", () => ({
  CustomActionsPanel: () =>
    React.createElement("aside", null, "CustomActionsPanel"),
}));

vi.mock("../../src/components/CustomActionEditor.js", () => ({
  CustomActionEditor: () =>
    React.createElement("aside", null, "CustomActionEditor"),
}));

vi.mock("../../src/components/AppsPageView.js", () => ({
  AppsPageView: () => React.createElement("section", null, "AppsPageView Ready"),
}));

vi.mock("../../src/components/AdvancedPageView.js", () => ({
  AdvancedPageView: () =>
    React.createElement("section", null, "AdvancedPageView Ready"),
}));

vi.mock("../../src/components/CharacterView.js", () => ({
  CharacterView: () =>
    React.createElement("section", null, "CharacterView Ready"),
}));

vi.mock("../../src/components/ConnectorsPageView.js", () => ({
  ConnectorsPageView: () =>
    React.createElement("section", null, "ConnectorsPageView Ready"),
}));

vi.mock("../../src/components/InventoryView.js", () => ({
  InventoryView: () =>
    React.createElement("section", null, "InventoryView Ready"),
}));

vi.mock("../../src/components/KnowledgeView.js", () => ({
  KnowledgeView: () =>
    React.createElement("section", null, "KnowledgeView Ready"),
}));

vi.mock("../../src/components/CompanionView.js", () => ({
  CompanionView: () =>
    React.createElement("section", null, "CompanionView Ready"),
}));

vi.mock("../../src/components/ChatModalView.js", () => ({
  ChatModalView: () =>
    React.createElement("section", null, "ChatModalView Ready"),
}));

vi.mock("../../src/components/SettingsView.js", () => ({
  SettingsView: () => React.createElement("section", null, "SettingsView Ready"),
}));

vi.mock("../../src/components/PluginsView.js", () => ({
  PluginsView: () => React.createElement("section", null, "PluginsView Ready"),
}));

vi.mock("../../src/components/SkillsView.js", () => ({
  SkillsView: () => React.createElement("section", null, "SkillsView Ready"),
}));

vi.mock("../../src/components/LoadingScreen.js", () => ({
  LoadingScreen: () => React.createElement("div", null, "LoadingScreen"),
}));

vi.mock("../../src/components/TerminalPanel.js", () => ({
  TerminalPanel: () => React.createElement("footer", null, "TerminalPanel"),
}));

vi.mock("../../src/hooks/useContextMenu.js", () => ({
  useContextMenu: () => ({
    saveCommandModalOpen: false,
    saveCommandText: "",
    confirmSaveCommand: noop,
    closeSaveCommandModal: noop,
  }),
}));

import { App } from "../../src/App";

type HarnessState = {
  onboardingLoading: boolean;
  authRequired: boolean;
  onboardingComplete: boolean;
  tab: Tab;
  actionNotice: null;
  setTab: (tab: Tab) => void;
};

function textOf(node: TestRenderer.ReactTestInstance): string {
  return node.children
    .map((child) => (typeof child === "string" ? child : textOf(child)))
    .join("");
}

function expectValidContent(content: string): void {
  expect(content.trim().length).toBeGreaterThan(0);
  const invalidPatterns = [
    /\bundefined\b/i,
    /\bnull\b/i,
    /\bnan\b/i,
    /\btypeerror\b/i,
    /\breferenceerror\b/i,
    /\berror:\b/i,
  ];
  for (const pattern of invalidPatterns) {
    expect(pattern.test(content)).toBe(false);
  }
}

function mainContent(tree: TestRenderer.ReactTestRenderer): string {
  const mains = tree.root.findAll((node) => node.type === "main");
  if (mains.length > 0) {
    return textOf(mains[0]);
  }

  const companionDivs = tree.root.findAll(
    (node) =>
      node.type === "div" &&
      typeof node.props.className === "string" &&
      node.props.className.includes("relative w-full h-[100vh]"),
  );
  if (companionDivs.length > 0) {
    return textOf(companionDivs[0]);
  }

  throw new Error("Could not find main content container");
}

describe("pages navigation smoke (e2e)", () => {
  let state: HarnessState;

  beforeEach(() => {
    state = {
      onboardingLoading: false,
      authRequired: false,
      onboardingComplete: true,
      tab: "chat",
      actionNotice: null,
      setTab: (tab: Tab) => {
        state.tab = tab;
      },
    };
    mockUseApp.mockReset();
    mockUseApp.mockImplementation(() => state);
  });

  it("renders every top-level tab group with non-empty valid content", async () => {
    const errorSpy = vi.spyOn(console, "error");
    const warnSpy = vi.spyOn(console, "warn");

    const expectedByPrimaryTab: Record<Tab, string> = {
      chat: "ChatView Ready",
      companion: "CompanionView Ready",
      character: "CharacterView Ready",
      wallets: "InventoryView Ready",
      knowledge: "KnowledgeView Ready",
      connectors: "ConnectorsPageView Ready",
      triggers: "AdvancedPageView Ready",
      apps: "AppsPageView Ready",
      settings: "SettingsView Ready",
      advanced: "AdvancedPageView Ready",
      plugins: "PluginsView Ready",
      skills: "SkillsView Ready",
      actions: "AdvancedPageView Ready",
      "fine-tuning": "AdvancedPageView Ready",
      trajectories: "AdvancedPageView Ready",
      runtime: "AdvancedPageView Ready",
      database: "AdvancedPageView Ready",
      logs: "AdvancedPageView Ready",
      voice: "SettingsView Ready",
    };

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(App));
    });

    for (const group of TAB_GROUPS) {
      const nextTab = group.tabs[0];
      state.tab = nextTab;
      await act(async () => {
        tree!.update(React.createElement(App));
      });
      const content = mainContent(tree!);
      expect(content).toContain(expectedByPrimaryTab[nextTab]);
      expectValidContent(content);
    }

    const unexpectedErrors = errorSpy.mock.calls.filter((args) => {
      const msg = typeof args[0] === "string" ? args[0] : "";
      return (
        !msg.includes("react-test-renderer is deprecated") &&
        !msg.includes(
          "The current testing environment is not configured to support act(...)",
        )
      );
    });
    expect(unexpectedErrors.length).toBe(0);
    expect(warnSpy).not.toHaveBeenCalled();

    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it("renders every Advanced sub-tab with non-empty valid content", async () => {
    const errorSpy = vi.spyOn(console, "error");
    const warnSpy = vi.spyOn(console, "warn");

    const subPages: Array<{ tab: Tab; token: string }> = [
      { tab: "plugins", token: "PluginsView Ready" },
      { tab: "skills", token: "SkillsView Ready" },
      { tab: "actions", token: "AdvancedPageView Ready" },
      { tab: "triggers", token: "AdvancedPageView Ready" },
      { tab: "fine-tuning", token: "AdvancedPageView Ready" },
      { tab: "trajectories", token: "AdvancedPageView Ready" },
      { tab: "runtime", token: "AdvancedPageView Ready" },
      { tab: "database", token: "AdvancedPageView Ready" },
      { tab: "logs", token: "AdvancedPageView Ready" },
    ];

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(App));
    });

    for (const subPage of subPages) {
      state.tab = subPage.tab;
      await act(async () => {
        tree!.update(React.createElement(App));
      });
      const content = mainContent(tree!);
      expect(content).toContain(subPage.token);
      expectValidContent(content);
    }

    const unexpectedErrors = errorSpy.mock.calls.filter((args) => {
      const msg = typeof args[0] === "string" ? args[0] : "";
      return (
        !msg.includes("react-test-renderer is deprecated") &&
        !msg.includes(
          "The current testing environment is not configured to support act(...)",
        )
      );
    });
    expect(unexpectedErrors.length).toBe(0);
    expect(warnSpy).not.toHaveBeenCalled();

    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it("renders every tab value directly with non-empty valid content", async () => {
    const errorSpy = vi.spyOn(console, "error");
    const warnSpy = vi.spyOn(console, "warn");

    const expectedByTab: Array<{ tab: Tab; token: string }> = [
      { tab: "chat", token: "ChatView Ready" },
      { tab: "companion", token: "CompanionView Ready" },
      { tab: "apps", token: "AppsPageView Ready" },
      { tab: "character", token: "CharacterView Ready" },
      { tab: "wallets", token: "InventoryView Ready" },
      { tab: "knowledge", token: "KnowledgeView Ready" },
      { tab: "connectors", token: "ConnectorsPageView Ready" },
      { tab: "triggers", token: "AdvancedPageView Ready" },
      { tab: "plugins", token: "PluginsView Ready" },
      { tab: "skills", token: "SkillsView Ready" },
      { tab: "actions", token: "AdvancedPageView Ready" },
      { tab: "advanced", token: "AdvancedPageView Ready" },
      { tab: "fine-tuning", token: "AdvancedPageView Ready" },
      { tab: "trajectories", token: "AdvancedPageView Ready" },
      { tab: "voice", token: "SettingsView Ready" },
      { tab: "runtime", token: "AdvancedPageView Ready" },
      { tab: "database", token: "AdvancedPageView Ready" },
      { tab: "settings", token: "SettingsView Ready" },
      { tab: "logs", token: "AdvancedPageView Ready" },
    ];

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(App));
    });

    for (const entry of expectedByTab) {
      state.tab = entry.tab;
      await act(async () => {
        tree!.update(React.createElement(App));
      });
      const content = mainContent(tree!);
      expect(content).toContain(entry.token);
      expectValidContent(content);
    }

    const unexpectedErrors = errorSpy.mock.calls.filter((args) => {
      const msg = typeof args[0] === "string" ? args[0] : "";
      return (
        !msg.includes("react-test-renderer is deprecated") &&
        !msg.includes(
          "The current testing environment is not configured to support act(...)",
        )
      );
    });
    expect(unexpectedErrors.length).toBe(0);
    expect(warnSpy).not.toHaveBeenCalled();

    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it("renders loading, pairing, and onboarding gates with valid non-empty content", async () => {
    const errorSpy = vi.spyOn(console, "error");
    const warnSpy = vi.spyOn(console, "warn");

    const cases: Array<{
      patch: Partial<HarnessState>;
      token: string;
    }> = [
      {
        patch: { onboardingLoading: true, onboardingComplete: false },
        token: "LoadingScreen",
      },
      {
        patch: {
          onboardingLoading: false,
          onboardingComplete: true,
          authRequired: true,
        },
        token: "PairingView",
      },
      {
        patch: {
          onboardingLoading: false,
          authRequired: false,
          onboardingComplete: false,
        },
        token: "OnboardingWizard",
      },
    ];

    for (const entry of cases) {
      state = {
        onboardingLoading: false,
        authRequired: false,
        onboardingComplete: true,
        tab: "chat",
        actionNotice: null,
        setTab: (tab: Tab) => {
          state.tab = tab;
        },
      };
      Object.assign(state, entry.patch);
      mockUseApp.mockImplementation(() => state);

      let tree: TestRenderer.ReactTestRenderer;
      await act(async () => {
        tree = TestRenderer.create(React.createElement(App));
      });
      const appText = textOf(tree!.root);
      expect(appText).toContain(entry.token);
      expectValidContent(appText);
    }

    const unexpectedErrors = errorSpy.mock.calls.filter((args) => {
      const msg = typeof args[0] === "string" ? args[0] : "";
      return (
        !msg.includes("react-test-renderer is deprecated") &&
        !msg.includes(
          "The current testing environment is not configured to support act(...)",
        )
      );
    });
    expect(unexpectedErrors.length).toBe(0);
    expect(warnSpy).not.toHaveBeenCalled();

    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });
});
