import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockUseApp } = vi.hoisted(() => ({
  mockUseApp: vi.fn(),
}));

vi.mock("../../src/AppContext", () => ({
  useApp: () => mockUseApp(),
}));

import { ConversationsSidebar } from "../../src/components/ConversationsSidebar";

type ConversationStub = {
  id: string;
  title: string;
  updatedAt: string;
};

function createContext(overrides: Record<string, unknown> = {}) {
  return {
    conversations: [
      {
        id: "conv-1",
        title: "First conversation",
        updatedAt: "2026-02-19T00:00:00.000Z",
      } satisfies ConversationStub,
    ],
    activeConversationId: "conv-1",
    unreadConversations: new Set<string>(),
    handleNewConversation: vi.fn(),
    handleSelectConversation: vi.fn(async () => {}),
    handleDeleteConversation: vi.fn(async () => {}),
    handleRenameConversation: vi.fn(async () => {}),
    ...overrides,
  };
}

function findButtonByText(
  tree: TestRenderer.ReactTestRenderer,
  label: string,
): TestRenderer.ReactTestInstance {
  return tree.root.find(
    (node) =>
      node.type === "button" &&
      node.children.some(
        (child) => typeof child === "string" && child === label,
      ),
  );
}

describe("ConversationsSidebar", () => {
  beforeEach(() => {
    mockUseApp.mockReset();
  });

  it("requires explicit confirmation before deleting", async () => {
    const handleDeleteConversation = vi.fn(async () => {});
    mockUseApp.mockReturnValue(createContext({ handleDeleteConversation }));

    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(ConversationsSidebar));
    });

    const deleteTrigger = tree.root.findByProps({
      "data-testid": "conv-delete",
    });
    await act(async () => {
      deleteTrigger.props.onClick({ stopPropagation: () => {} });
    });

    expect(handleDeleteConversation).not.toHaveBeenCalled();
    expect(findButtonByText(tree, "Yes")).toBeDefined();
    expect(findButtonByText(tree, "No")).toBeDefined();
  });

  it("deletes only after clicking Yes", async () => {
    const handleDeleteConversation = vi.fn(async () => {});
    mockUseApp.mockReturnValue(createContext({ handleDeleteConversation }));

    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(ConversationsSidebar));
    });

    const deleteTrigger = tree.root.findByProps({
      "data-testid": "conv-delete",
    });
    await act(async () => {
      deleteTrigger.props.onClick({ stopPropagation: () => {} });
    });

    const yesButton = findButtonByText(tree, "Yes");
    await act(async () => {
      yesButton.props.onClick();
      await Promise.resolve();
    });

    expect(handleDeleteConversation).toHaveBeenCalledTimes(1);
    expect(handleDeleteConversation).toHaveBeenCalledWith("conv-1");
  });
});
