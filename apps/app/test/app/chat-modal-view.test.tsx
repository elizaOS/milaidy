import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockUseApp } = vi.hoisted(() => ({
  mockUseApp: vi.fn(),
}));

const {
  mockGetAgentAutomationMode,
  mockSetAgentAutomationMode,
  mockGetTradePermissionMode,
  mockSetTradePermissionMode,
} = vi.hoisted(() => ({
  mockGetAgentAutomationMode: vi.fn(),
  mockSetAgentAutomationMode: vi.fn(),
  mockGetTradePermissionMode: vi.fn(),
  mockSetTradePermissionMode: vi.fn(),
}));

vi.mock("../../src/AppContext", () => ({
  useApp: () => mockUseApp(),
}));

vi.mock("../../src/components/ChatView.js", () => ({
  ChatView: () => React.createElement("section", null, "ChatView Ready"),
}));

vi.mock("../../src/components/ConversationsSidebar.js", () => ({
  ConversationsSidebar: () =>
    React.createElement("aside", null, "ConversationsSidebar Ready"),
}));

vi.mock("../../src/api-client.js", () => ({
  client: {
    getAgentAutomationMode: mockGetAgentAutomationMode,
    setAgentAutomationMode: mockSetAgentAutomationMode,
    getTradePermissionMode: mockGetTradePermissionMode,
    setTradePermissionMode: mockSetTradePermissionMode,
  },
}));

import { ChatModalView } from "../../src/components/ChatModalView";

function createContext() {
  return {
    conversations: [
      {
        id: "conv-1",
        title: "General",
        roomId: "room-1",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
    activeConversationId: "conv-1",
    handleNewConversation: vi.fn(async () => {}),
    handleChatClear: vi.fn(async () => {}),
    setActionNotice: vi.fn(),
    setTab: vi.fn(),
    uiLanguage: "en",
  };
}

function textOf(node: TestRenderer.ReactTestInstance): string {
  return node.children
    .map((child) => (typeof child === "string" ? child : textOf(child)))
    .join("");
}

describe("ChatModalView", () => {
  beforeEach(() => {
    mockUseApp.mockReset();
    mockGetAgentAutomationMode.mockReset();
    mockSetAgentAutomationMode.mockReset();
    mockGetTradePermissionMode.mockReset();
    mockSetTradePermissionMode.mockReset();
    mockGetAgentAutomationMode.mockResolvedValue({
      mode: "connectors-only",
      options: ["connectors-only", "full"],
    });
    mockSetAgentAutomationMode.mockImplementation(async (mode) => ({
      mode,
      options: ["connectors-only", "full"],
    }));
    mockGetTradePermissionMode.mockResolvedValue({
      mode: "user-sign-only",
      options: ["user-sign-only", "manual-local-key", "agent-auto"],
    });
    mockSetTradePermissionMode.mockImplementation(async (mode) => ({
      mode,
      options: ["user-sign-only", "manual-local-key", "agent-auto"],
    }));
    mockUseApp.mockReturnValue(createContext());
  });

  it("renders full overlay layout by default", async () => {
    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(ChatModalView));
    });

    const overlays = tree!.root.findAll(
      (node) => node.props["data-chat-game-overlay"] === true,
    );
    expect(overlays.length).toBe(1);

    const shells = tree!.root.findAll(
      (node) => node.props["data-chat-game-shell"] === true,
    );
    expect(shells.length).toBe(1);

    const content = textOf(tree!.root);
    expect(content).toContain("ChatView Ready");
    expect(content).toContain("ConversationsSidebar Ready");
  });

  it("renders companion dock layout and calls onRequestClose", async () => {
    const onRequestClose = vi.fn();
    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        React.createElement(ChatModalView, {
          variant: "companion-dock",
          onRequestClose,
        }),
      );
    });

    const docks = tree!.root.findAll(
      (node) => node.props["data-chat-game-dock"] === true,
    );
    expect(docks.length).toBe(1);

    const overlays = tree!.root.findAll(
      (node) => node.props["data-chat-game-overlay"] === true,
    );
    expect(overlays.length).toBe(0);

    const backButton = tree!.root.findAll(
      (node) =>
        node.type === "button" &&
        typeof node.props.className === "string" &&
        node.props.className.includes("chat-game-back-btn"),
    )[0];

    await act(async () => {
      backButton.props.onClick();
    });
    expect(onRequestClose).toHaveBeenCalledTimes(1);
  });

  it("changes automation and trade mode directly from MORE menu", async () => {
    const ctx = createContext();
    mockUseApp.mockReturnValue(ctx);

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(ChatModalView));
    });

    const moreButton = tree!.root.findAll(
      (node) =>
        node.type === "button" &&
        typeof node.props.className === "string" &&
        node.props.className.includes("chat-game-more-btn"),
    )[0];

    await act(async () => {
      moreButton.props.onClick();
    });

    await act(async () => {
      await Promise.resolve();
    });

    const automationFull = tree!.root.find(
      (node) => node.props["data-testid"] === "chat-game-automation-full",
    );
    await act(async () => {
      automationFull.props.onClick();
      await Promise.resolve();
    });
    expect(mockSetAgentAutomationMode).toHaveBeenCalledWith("full");
    expect(ctx.setTab).not.toHaveBeenCalledWith("settings");

    const tradeAgent = tree!.root.find(
      (node) => node.props["data-testid"] === "chat-game-trade-agent",
    );
    await act(async () => {
      tradeAgent.props.onClick();
      await Promise.resolve();
    });
    expect(mockSetTradePermissionMode).toHaveBeenCalledWith("agent-auto");
    expect(ctx.setTab).not.toHaveBeenCalledWith("settings");
  });
});
