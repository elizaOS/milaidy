import React from "react";
import type { ReactTestInstance } from "react-test-renderer";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pathForTab, tabFromPath } from "../../src/navigation";

const { mockUseApp } = vi.hoisted(() => ({
  mockUseApp: vi.fn(),
}));

vi.mock("../../src/AppContext", () => ({
  useApp: () => mockUseApp(),
}));

vi.mock("../../src/components/Header", () => ({
  Header: () => React.createElement("div", null, "Header"),
}));
vi.mock("../../src/components/Nav", () => ({
  Nav: ({ mobileLeft }: { mobileLeft?: React.ReactNode }) =>
    React.createElement("div", null, "Nav", mobileLeft),
}));
vi.mock("../../src/components/CommandPalette", () => ({
  CommandPalette: () => React.createElement("div", null, "CommandPalette"),
}));
vi.mock("../../src/components/EmotePicker", () => ({
  EmotePicker: () => React.createElement("div", null, "EmotePicker"),
}));
vi.mock("../../src/components/PairingView", () => ({
  PairingView: () => React.createElement("div", null, "PairingView"),
}));
vi.mock("../../src/components/OnboardingWizard", () => ({
  OnboardingWizard: () => React.createElement("div", null, "OnboardingWizard"),
}));
vi.mock("../../src/components/ChatView", () => ({
  ChatView: () => React.createElement("div", null, "ChatView"),
}));
vi.mock("../../src/components/ConversationsSidebar", () => ({
  ConversationsSidebar: () =>
    React.createElement("div", null, "ConversationsSidebar"),
}));
vi.mock("../../src/components/AutonomousPanel", () => ({
  AutonomousPanel: () => React.createElement("div", null, "AutonomousPanel"),
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
vi.mock("../../src/components/SettingsView", () => ({
  SettingsView: () => React.createElement("div", null, "SettingsView"),
}));
vi.mock("../../src/components/LoadingScreen", () => ({
  LoadingScreen: () => React.createElement("div", null, "LoadingScreen"),
}));

import { App } from "../../src/App";

const ORIGINAL_INNER_WIDTH = window.innerWidth;

function setViewportWidth(width: number): void {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: width,
  });
}

function buttonText(node: ReactTestInstance): string {
  return node.children
    .filter((child): child is string => typeof child === "string")
    .join("")
    .trim();
}

describe("app startup routing (e2e)", () => {
  beforeEach(() => {
    setViewportWidth(1280);
    mockUseApp.mockReset();
    mockUseApp.mockReturnValue({
      onboardingLoading: false,
      authRequired: false,
      onboardingComplete: true,
      tab: "chat",
      actionNotice: null,
    });
  });

  afterEach(() => {
    setViewportWidth(ORIGINAL_INNER_WIDTH);
  });

  it("renders chat screen when startup state is ready", async () => {
    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(App));
    });

    const renderedText = tree?.root
      .findAllByType("div")
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

    const renderedText = tree?.root
      .findAllByType("div")
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

  it("uses mobile chat drawers on narrow viewports", async () => {
    setViewportWidth(390);

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(App));
    });

    const root = tree?.root;
    const buttons = root.findAllByType("button");
    const chatDrawerButton = buttons.find((node) =>
      buttonText(node).includes("Chats"),
    );
    const statusDrawerButton = buttons.find((node) =>
      buttonText(node).includes("Status"),
    );
    expect(chatDrawerButton).toBeDefined();
    expect(statusDrawerButton).toBeDefined();

    let renderedText = root
      .findAllByType("div")
      .map((node) => node.children.join(""))
      .join("\n");
    expect(renderedText).not.toContain("ConversationsSidebar");
    expect(renderedText).not.toContain("AutonomousPanel");

    await act(async () => {
      chatDrawerButton?.props.onClick();
    });

    renderedText = root
      .findAllByType("div")
      .map((node) => node.children.join(""))
      .join("\n");
    expect(renderedText).toContain("ConversationsSidebar");

    await act(async () => {
      statusDrawerButton?.props.onClick();
    });

    renderedText = root
      .findAllByType("div")
      .map((node) => node.children.join(""))
      .join("\n");
    expect(renderedText).toContain("AutonomousPanel");
  });
});
