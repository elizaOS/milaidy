// @vitest-environment jsdom
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockUseApp } = vi.hoisted(() => ({
  mockUseApp: vi.fn(),
}));
const { mockUseTabNavigation } = vi.hoisted(() => ({
  mockUseTabNavigation: vi.fn(),
}));

vi.mock("../../src/AppContext", () => ({
  useApp: () => mockUseApp(),
}));

vi.mock("../../src/hooks/useTabNavigation", () => ({
  useTabNavigation: () => mockUseTabNavigation(),
}));

import { Nav } from "../../src/components/Nav";

function textOf(node: TestRenderer.ReactTestInstance): string {
  return node.children
    .map((child) => (typeof child === "string" ? child : textOf(child)))
    .join("");
}

describe("Nav language switching", () => {
  beforeEach(() => {
    mockUseApp.mockReset();
    mockUseTabNavigation.mockReset();
  });

  it("renders english labels by default", async () => {
    mockUseApp.mockReturnValue({
      uiLanguage: "en",
    });
    mockUseTabNavigation.mockReturnValue({
      activeTab: "chat",
      navGroups: [
        { label: "Chat", tabs: ["chat"], icon: () => null },
        { label: "Wallets", tabs: ["wallets"], icon: () => null },
        { label: "Settings", tabs: ["settings"], icon: () => null },
      ],
      navigateToTab: vi.fn(),
      persistShellPanels: vi.fn(),
      quickActions: [],
      restoreShellPanels: vi.fn(() => ({
        mobileAutonomousOpen: false,
        mobileConversationsOpen: false,
        mobileNavOpen: false,
      })),
      runQuickAction: vi.fn(),
      streamEnabled: false,
      tabs: [],
    });

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(Nav));
    });

    const text = tree?.root
      .findAllByType("button")
      .map((node) => textOf(node))
      .join(" ");
    expect(text).toContain("Chat");
    expect(text).toContain("Wallets");
    expect(text).toContain("Settings");
  });

  it("renders chinese labels when uiLanguage is zh-CN", async () => {
    mockUseApp.mockReturnValue({
      uiLanguage: "zh-CN",
    });
    mockUseTabNavigation.mockReturnValue({
      activeTab: "chat",
      navGroups: [
        { label: "Chat", tabs: ["chat"], icon: () => null },
        { label: "Wallets", tabs: ["wallets"], icon: () => null },
        { label: "Settings", tabs: ["settings"], icon: () => null },
      ],
      navigateToTab: vi.fn(),
      persistShellPanels: vi.fn(),
      quickActions: [],
      restoreShellPanels: vi.fn(() => ({
        mobileAutonomousOpen: false,
        mobileConversationsOpen: false,
        mobileNavOpen: false,
      })),
      runQuickAction: vi.fn(),
      streamEnabled: false,
      tabs: [],
    });

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(Nav));
    });

    const text = tree?.root
      .findAllByType("button")
      .map((node) => textOf(node))
      .join(" ");
    expect(text).toContain("聊天");
    expect(text).toContain("钱包");
    expect(text).toContain("设置");
  });

  it("shows companion tab in native shell mode", async () => {
    mockUseApp.mockReturnValue({
      uiLanguage: "en",
    });
    mockUseTabNavigation.mockReturnValue({
      activeTab: "chat",
      navGroups: [
        { label: "Companion", tabs: ["companion"], icon: () => null },
        { label: "Chat", tabs: ["chat"], icon: () => null },
      ],
      navigateToTab: vi.fn(),
      persistShellPanels: vi.fn(),
      quickActions: [],
      restoreShellPanels: vi.fn(() => ({
        mobileAutonomousOpen: false,
        mobileConversationsOpen: false,
        mobileNavOpen: false,
      })),
      runQuickAction: vi.fn(),
      streamEnabled: false,
      tabs: [],
    });

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(Nav));
    });

    const text = tree?.root
      .findAllByType("button")
      .map((node) => textOf(node))
      .join(" ");
    expect(text).toContain("Companion");
    expect(text).toContain("Chat");
  });
});
