// @vitest-environment jsdom
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

vi.mock("../../src/components/Header", () => ({
  Header: () => React.createElement("header", null, "Header"),
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

vi.mock("../../src/components/PairingView", () => ({
  PairingView: () => React.createElement("div", null, "PairingView"),
}));

vi.mock("../../src/components/OnboardingWizard", () => ({
  OnboardingWizard: () => React.createElement("div", null, "OnboardingWizard"),
}));

vi.mock("../../src/components/ChatView", () => ({
  ChatView: () => React.createElement("section", null, "ChatView Ready"),
}));

vi.mock("../../src/components/ConversationsSidebar", () => ({
  ConversationsSidebar: () =>
    React.createElement("aside", null, "ConversationsSidebar"),
}));

vi.mock("../../src/components/AutonomousPanel", () => ({
  AutonomousPanel: () => React.createElement("aside", null, "AutonomousPanel"),
}));

vi.mock("../../src/components/CustomActionsPanel", () => ({
  CustomActionsPanel: () =>
    React.createElement("aside", null, "CustomActionsPanel"),
}));

vi.mock("../../src/components/CustomActionEditor", () => ({
  CustomActionEditor: () =>
    React.createElement("aside", null, "CustomActionEditor"),
}));

vi.mock("../../src/components/AppsPageView", () => ({
  AppsPageView: () =>
    React.createElement("section", null, "AppsPageView Ready"),
}));

vi.mock("../../src/components/CharacterView", () => ({
  CharacterView: () =>
    React.createElement("section", null, "CharacterView Ready"),
}));

vi.mock("../../src/components/TriggersView", () => ({
  TriggersView: () =>
    React.createElement("section", null, "TriggersView Ready"),
}));

vi.mock("../../src/components/ConnectorsPageView", () => ({
  ConnectorsPageView: () =>
    React.createElement("section", null, "ConnectorsPageView Ready"),
}));

vi.mock("../../src/components/InventoryView", () => ({
  InventoryView: () =>
    React.createElement("section", null, "InventoryView Ready"),
}));

vi.mock("../../src/components/KnowledgeView", () => ({
  KnowledgeView: () =>
    React.createElement("section", null, "KnowledgeView Ready"),
}));

vi.mock("../../src/components/SettingsView", () => ({
  SettingsView: () =>
    React.createElement("section", null, "SettingsView Ready"),
}));

vi.mock("../../src/components/LoadingScreen", () => ({
  LoadingScreen: () => React.createElement("div", null, "LoadingScreen"),
}));

vi.mock("../../src/components/TerminalPanel", () => ({
  TerminalPanel: () => React.createElement("footer", null, "TerminalPanel"),
}));

vi.mock("../../src/components/PluginsPageView", () => ({
  PluginsPageView: () =>
    React.createElement("section", null, "PluginsPageView Ready"),
}));

vi.mock("../../src/components/SkillsView", () => ({
  SkillsView: () => React.createElement("section", null, "SkillsView Ready"),
}));

vi.mock("../../src/components/CustomActionsView", () => ({
  CustomActionsView: () =>
    React.createElement("section", null, "CustomActionsView Ready"),
}));

vi.mock("../../src/components/FineTuningView", () => ({
  FineTuningView: () =>
    React.createElement("section", null, "FineTuningView Ready"),
}));

vi.mock("../../src/components/TrajectoriesView", () => ({
  TrajectoriesView: () =>
    React.createElement("section", null, "TrajectoriesView Ready"),
}));

vi.mock("../../src/components/TrajectoryDetailView", () => ({
  TrajectoryDetailView: () =>
    React.createElement("section", null, "TrajectoryDetailView Ready"),
}));

vi.mock("../../src/components/RuntimeView", () => ({
  RuntimeView: () => React.createElement("section", null, "RuntimeView Ready"),
}));

vi.mock("../../src/components/DatabasePageView", () => ({
  DatabasePageView: () =>
    React.createElement("section", null, "DatabasePageView Ready"),
}));

vi.mock("../../src/components/LogsPageView", () => ({
  LogsPageView: () =>
    React.createElement("section", null, "LogsPageView Ready"),
}));

vi.mock("../../src/hooks/useContextMenu", () => ({
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

function getButtonByLabel(
  tree: TestRenderer.ReactTestRenderer,
  label: string,
): TestRenderer.ReactTestInstance {
  const buttons = tree.root.findAll(
    (node) =>
      node.type === "button" &&
      typeof node.props.onClick === "function" &&
      textOf(node).trim() === label,
  );
  expect(buttons.length).toBeGreaterThan(0);
  return buttons[0];
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
  expect(mains.length).toBeGreaterThan(0);
  return textOf(mains[0]);
}

function requireTree(
  tree: TestRenderer.ReactTestRenderer | null,
): TestRenderer.ReactTestRenderer {
  if (!tree) throw new Error("failed to render App");
  return tree;
}

async function clickAndRerender(
  tree: TestRenderer.ReactTestRenderer,
  label: string,
): Promise<void> {
  const button = getButtonByLabel(tree, label);
  await act(async () => {
    button.props.onClick();
  });
  await act(async () => {
    tree.update(React.createElement(App));
  });
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

  it("clicks every top-level nav page and renders non-empty valid content", async () => {
    const errorSpy = vi.spyOn(console, "error");
    const warnSpy = vi.spyOn(console, "warn");

    let tree: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(App));
    });
    const renderedTree = requireTree(tree);

    const expectedByPrimaryTab: Record<Tab, string> = {
      chat: "ChatView Ready",
      character: "CharacterView Ready",
      wallets: "InventoryView Ready",
      knowledge: "KnowledgeView Ready",
      connectors: "ConnectorsPageView Ready",
      triggers: "TriggersView Ready",
      apps: "AppsPageView Ready",
      settings: "SettingsView Ready",
      advanced: "PluginsPageView Ready",
      plugins: "PluginsPageView Ready",
      skills: "SkillsView Ready",
      actions: "CustomActionsView Ready",
      "fine-tuning": "FineTuningView Ready",
      trajectories: "TrajectoriesView Ready",
      runtime: "RuntimeView Ready",
      database: "DatabasePageView Ready",
      logs: "LogsPageView Ready",
      voice: "SettingsView Ready",
    };

    for (const group of TAB_GROUPS) {
      await clickAndRerender(renderedTree, group.label);
      const nextTab = group.tabs[0];
      const content = mainContent(renderedTree);
      expect(state.tab).toBe(nextTab);
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

  it("clicks every Advanced sub-page and renders non-empty valid content", async () => {
    const errorSpy = vi.spyOn(console, "error");
    const warnSpy = vi.spyOn(console, "warn");

    let tree: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(App));
    });
    const renderedTree = requireTree(tree);

    await clickAndRerender(renderedTree, "Advanced");
    expect(state.tab).toBe("advanced");

    const subPages: Array<{ label: string; tab: Tab; token: string }> = [
      { label: "Plugins", tab: "plugins", token: "PluginsPageView Ready" },
      { label: "Skills", tab: "skills", token: "SkillsView Ready" },
      { label: "Actions", tab: "actions", token: "CustomActionsView Ready" },
      { label: "Triggers", tab: "triggers", token: "TriggersView Ready" },
      {
        label: "Fine-Tuning",
        tab: "fine-tuning",
        token: "FineTuningView Ready",
      },
      {
        label: "Trajectories",
        tab: "trajectories",
        token: "TrajectoriesView Ready",
      },
      { label: "Runtime", tab: "runtime", token: "RuntimeView Ready" },
      { label: "Databases", tab: "database", token: "DatabasePageView Ready" },
      { label: "Logs", tab: "logs", token: "LogsPageView Ready" },
    ];

    for (const subPage of subPages) {
      await clickAndRerender(renderedTree, subPage.label);
      const content = mainContent(renderedTree);
      expect(state.tab).toBe(subPage.tab);
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
      { tab: "apps", token: "AppsPageView Ready" },
      { tab: "character", token: "CharacterView Ready" },
      { tab: "wallets", token: "InventoryView Ready" },
      { tab: "knowledge", token: "KnowledgeView Ready" },
      { tab: "connectors", token: "ConnectorsPageView Ready" },
      { tab: "triggers", token: "TriggersView Ready" },
      { tab: "plugins", token: "PluginsPageView Ready" },
      { tab: "skills", token: "SkillsView Ready" },
      { tab: "actions", token: "CustomActionsView Ready" },
      { tab: "advanced", token: "PluginsPageView Ready" },
      { tab: "fine-tuning", token: "FineTuningView Ready" },
      { tab: "trajectories", token: "TrajectoriesView Ready" },
      { tab: "voice", token: "SettingsView Ready" },
      { tab: "runtime", token: "RuntimeView Ready" },
      { tab: "database", token: "DatabasePageView Ready" },
      { tab: "settings", token: "SettingsView Ready" },
      { tab: "logs", token: "LogsPageView Ready" },
    ];

    let tree: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(App));
    });
    const renderedTree = requireTree(tree);

    for (const entry of expectedByTab) {
      state.tab = entry.tab;
      await act(async () => {
        renderedTree.update(React.createElement(App));
      });
      const content = mainContent(renderedTree);
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
      name: string;
      patch: Partial<HarnessState>;
      token: string;
    }> = [
      {
        name: "loading",
        patch: { onboardingLoading: true, onboardingComplete: false },
        token: "LoadingScreen",
      },
      {
        name: "pairing",
        patch: {
          onboardingLoading: false,
          onboardingComplete: true,
          authRequired: true,
        },
        token: "PairingView",
      },
      {
        name: "onboarding",
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
      const appText = textOf(tree?.root);
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
