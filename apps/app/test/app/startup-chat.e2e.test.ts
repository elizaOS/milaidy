import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { pathForTab, tabFromPath } from "../../src/navigation";

const { mockUseApp } = vi.hoisted(() => ({
  mockUseApp: vi.fn(),
}));

vi.mock("../../src/AppContext", () => ({
  useApp: () => mockUseApp(),
}));

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
vi.mock("../../src/components/PairingView.js", () => ({
  PairingView: () => React.createElement("div", null, "PairingView"),
}));
vi.mock("../../src/components/OnboardingWizard.js", () => ({
  OnboardingWizard: () => React.createElement("div", null, "OnboardingWizard"),
}));
vi.mock("../../src/components/ChatView.js", () => ({
  ChatView: () => React.createElement("div", null, "ChatView"),
}));
vi.mock("../../src/components/ConversationsSidebar.js", () => ({
  ConversationsSidebar: () => React.createElement("div", null, "ConversationsSidebar"),
}));
vi.mock("../../src/components/AutonomousPanel.js", () => ({
  AutonomousPanel: () => React.createElement("div", null, "AutonomousPanel"),
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
vi.mock("../../src/components/LoadingScreen.js", () => ({
  LoadingScreen: () => React.createElement("div", null, "LoadingScreen"),
}));

import { App } from "../../src/App";

describe("app startup routing (e2e)", () => {
  beforeEach(() => {
    mockUseApp.mockReset();
    mockUseApp.mockReturnValue({
      onboardingLoading: false,
      authRequired: false,
      onboardingComplete: true,
      tab: "chat",
      actionNotice: null,
    });
  });

  it("renders chat screen when startup state is ready", async () => {
    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(App));
    });

    const renderedText = tree!.root.findAllByType("div")
      .map((node) => node.children.join(""))
      .join("\n");

    expect(renderedText).toContain("ChatView");
    expect(renderedText).not.toContain("LoadingScreen");
    expect(renderedText).not.toContain("OnboardingWizard");
    expect(renderedText).not.toContain("PairingView");
  });

  it("renders wallets screen when wallets tab is active", async () => {
    mockUseApp.mockReturnValue({
      onboardingLoading: false,
      authRequired: false,
      onboardingComplete: true,
      tab: "wallets",
      actionNotice: null,
    });

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(App));
    });

    const renderedText = tree!.root.findAllByType("div")
      .map((node) => node.children.join(""))
      .join("\n");

    expect(renderedText).toContain("InventoryView");
    expect(renderedText).not.toContain("ChatView");
  });

  it("keeps legacy inventory path mapped to wallets", () => {
    expect(pathForTab("wallets")).toBe("/wallets");
    expect(tabFromPath("/wallets")).toBe("wallets");
    expect(tabFromPath("/inventory")).toBe("wallets");
  });
});
