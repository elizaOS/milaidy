// @vitest-environment jsdom

import { pathForTab, tabFromPath } from "@milady/app-core/navigation";
import React from "react";
import type { ReactTestInstance } from "react-test-renderer";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { companionOverlayTabs, mockUseApp } = vi.hoisted(() => ({
  companionOverlayTabs: new Set([
    "companion",
    "skills",
    "character",
    "character-select",
    "settings",
    "plugins",
    "advanced",
    "actions",
    "triggers",
    "fine-tuning",
    "trajectories",
    "runtime",
    "database",
    "logs",
    "security",
    "apps",
    "connectors",
    "knowledge",
    "lifo",
    "stream",
    "wallets",
  ]),
  mockUseApp: vi.fn(),
}));

vi.mock("../../src/AppContext", () => ({
  useApp: () => mockUseApp(),
  getVrmUrl: vi.fn(),
  getVrmPreviewUrl: vi.fn(),
  getVrmTitle: vi.fn(),
}));

vi.mock("../../src/components/Header", () => ({
  Header: ({ mobileLeft }: { mobileLeft?: React.ReactNode }) =>
    React.createElement("div", null, "Header", mobileLeft),
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
vi.mock("../../src/components/LifoSandboxView", () => ({
  LifoSandboxView: () => React.createElement("div", null, "LifoSandboxView"),
}));
vi.mock("../../src/components/SettingsView", () => ({
  SettingsView: () => React.createElement("div", null, "SettingsView"),
}));
vi.mock("../../src/components/avatar/AvatarLoader", () => ({
  AvatarLoader: () => React.createElement("div", null, "AvatarLoader"),
}));
vi.mock("../../src/components/StreamView", () => ({
  StreamView: () => React.createElement("div", null, "StreamView"),
}));
vi.mock("../../src/components/CompanionView", () => ({
  CompanionView: () => React.createElement("div", null, "CompanionView"),
}));
vi.mock("../../src/components/CompanionShell", () => ({
  COMPANION_OVERLAY_TABS: companionOverlayTabs,
  CompanionShell: ({ tab }: { tab: string }) =>
    React.createElement("main", null, `CompanionShell:${tab}`),
}));

import { App } from "../../src/App";

const ORIGINAL_INNER_WIDTH = window.innerWidth;

function setViewportWidth(width: number): void {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: width,
  });
}

function textOf(node: ReactTestInstance): string {
  return node.children
    .map((child) => (typeof child === "string" ? child : textOf(child)))
    .join("");
}

describe("app startup routing (e2e)", () => {
  beforeEach(() => {
    setViewportWidth(1280);
    mockUseApp.mockReset();
    mockUseApp.mockReturnValue({
      t: (k: string) => k,
      onboardingLoading: false,
      authRequired: false,
      onboardingComplete: true,
      tab: "chat",
      actionNotice: null,
      setActionNotice: vi.fn(),
      uiShellMode: "native",
      agentStatus: { state: "running", agentName: "Milady" },
      unreadConversations: new Set(),
      activeGameViewerUrl: null,
      gameOverlayEnabled: false,
      startupPhase: "ready",
      startupError: null,
      retryStartup: vi.fn(),
    });
  });

  afterEach(() => {
    setViewportWidth(ORIGINAL_INNER_WIDTH);
    window.history.pushState({}, "", "/");
  });

  it("renders chat screen when startup state is ready", async () => {
    let tree = undefined as unknown as TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(App));
    });

    const renderedText = tree ? textOf(tree.root) : "";

    expect(renderedText).toContain("CompanionShell:companion");
    expect(renderedText).not.toContain("AvatarLoader");
    expect(renderedText).not.toContain("OnboardingWizard");
    expect(renderedText).not.toContain("PairingView");
  });

  it("renders wallets screen when wallets tab is active", async () => {
    mockUseApp.mockReturnValue({
      t: (k: string) => k,
      onboardingLoading: false,
      authRequired: false,
      onboardingComplete: true,
      tab: "wallets",
      actionNotice: null,
      setActionNotice: vi.fn(),
      uiShellMode: "native",
      agentStatus: { state: "running", agentName: "Milady" },
      unreadConversations: new Set(),
      activeGameViewerUrl: null,
      gameOverlayEnabled: false,
      startupPhase: "ready",
      startupError: null,
      retryStartup: vi.fn(),
    });

    let tree = undefined as unknown as TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(App));
    });

    const renderedText = tree ? textOf(tree.root) : "";

    expect(renderedText).toContain("CompanionShell:wallets");
    expect(renderedText).not.toContain("CompanionShell:companion");
  });

  it("keeps legacy inventory path mapped to wallets", () => {
    expect(pathForTab("wallets")).toBe("/wallets");
    expect(tabFromPath("/wallets")).toBe("wallets");
    expect(tabFromPath("/inventory")).toBe("wallets");
  });

  it("renders the companion shell on narrow viewports", async () => {
    setViewportWidth(390);

    let tree = undefined as unknown as TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(App));
    });

    const renderedText = tree ? textOf(tree.root) : "";
    expect(renderedText).toContain("CompanionShell:companion");
    expect(renderedText).not.toContain("AvatarLoader");
  });
});
