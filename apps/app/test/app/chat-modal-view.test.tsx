import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockUseApp } = vi.hoisted(() => ({
  mockUseApp: vi.fn(),
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
});
