// @vitest-environment jsdom
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

type ConversationStub = {
  id: string;
  title: string;
  roomId: string;
  createdAt: string;
  updatedAt: string;
};

type SidebarContextStub = {
  conversations: ConversationStub[];
  activeConversationId: string | null;
  unreadConversations: Set<string>;
  handleNewConversation: () => Promise<void>;
  handleSelectConversation: (id: string) => Promise<void>;
  handleDeleteConversation: (id: string) => Promise<void>;
  handleRenameConversation: (id: string, title: string) => Promise<void>;
  uiLanguage: "en" | "zh-CN";
};

const { mockUseApp } = vi.hoisted(() => ({
  mockUseApp: vi.fn(),
}));

vi.mock("../../src/AppContext", () => ({
  useApp: () => mockUseApp(),
  getVrmPreviewUrl: (index: number) => `mock-vrm-${index}.png`,
  VRM_COUNT: 8,
}));

vi.mock("../../src/api-client", () => ({
  client: {
    getAgentSelfStatus: vi.fn(async () => null),
    onWsEvent: vi.fn(() => () => {}),
  },
}));

import { client } from "../../src/api-client";
import { ConversationsSidebar } from "../../src/components/ConversationsSidebar";

function createContext(
  overrides?: Partial<SidebarContextStub>,
): SidebarContextStub {
  const now = Date.now();
  return {
    conversations: [
      {
        id: "conv-1",
        title: "First room",
        roomId: "room-1",
        createdAt: new Date(now - 30_000).toISOString(),
        updatedAt: new Date(now - 30_000).toISOString(),
      },
      {
        id: "conv-2",
        title: "Newest room",
        roomId: "room-2",
        createdAt: new Date(now - 10_000).toISOString(),
        updatedAt: new Date(now - 10_000).toISOString(),
      },
    ],
    activeConversationId: "conv-2",
    unreadConversations: new Set(["conv-1"]),
    handleNewConversation: vi.fn(async () => {}),
    handleSelectConversation: vi.fn(async () => {}),
    handleDeleteConversation: vi.fn(async () => {}),
    handleRenameConversation: vi.fn(async () => {}),
    uiLanguage: "en",
    ...overrides,
  };
}

function textOf(node: TestRenderer.ReactTestInstance): string {
  return node.children
    .map((child) => (typeof child === "string" ? child : textOf(child)))
    .join("");
}

describe("ConversationsSidebar game-modal variant", () => {
  beforeEach(() => {
    mockUseApp.mockReset();
    vi.clearAllMocks();
  });

  it("renders game-modal list and keeps new/select/delete actions working", async () => {
    const handleNewConversation = vi.fn(async () => {});
    const handleSelectConversation = vi.fn(async () => {});
    const handleDeleteConversation = vi.fn(async () => {});

    mockUseApp.mockReturnValue(
      createContext({
        handleNewConversation,
        handleSelectConversation,
        handleDeleteConversation,
      }),
    );

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        React.createElement(ConversationsSidebar, { variant: "game-modal" }),
      );
    });

    const roots = tree?.root.findAll(
      (node) =>
        node.props["data-testid"] === "conversations-sidebar" &&
        node.props["data-variant"] === "game-modal",
    );
    expect(roots.length).toBe(1);

    const avatarImages = tree?.root.findAll(
      (node) =>
        node.type === "img" &&
        typeof node.props.src === "string" &&
        node.props.src.startsWith("mock-vrm-"),
    );
    expect(avatarImages.length).toBeGreaterThan(0);

    const newChatButtons = tree?.root.findAll(
      (node) => node.type === "button" && textOf(node).trim() === "+ New Chat",
    );
    expect(newChatButtons.length).toBe(1);
    await act(async () => {
      newChatButtons[0].props.onClick();
    });
    expect(handleNewConversation).toHaveBeenCalledTimes(1);

    const convItems = tree?.root.findAll(
      (node) => node.props["data-testid"] === "conv-item",
    );
    expect(convItems.length).toBe(2);
    const selectBtn = convItems[1].findAll(
      (node) =>
        node.type === "button" &&
        typeof node.props.className === "string" &&
        node.props.className.includes("chat-game-conv-select-btn"),
    )[0];
    await act(async () => {
      selectBtn.props.onClick();
    });
    expect(handleSelectConversation).toHaveBeenCalledWith("conv-1");

    const deleteButtons = tree?.root.findAll(
      (node) => node.props["data-testid"] === "conv-delete",
    );
    expect(deleteButtons.length).toBe(2);
    await act(async () => {
      deleteButtons[0].props.onClick({ stopPropagation: () => {} });
    });
    expect(handleDeleteConversation).toHaveBeenCalledWith("conv-2");
  });

  it("supports inline rename in game-modal variant", async () => {
    const handleRenameConversation = vi.fn(async () => {});
    mockUseApp.mockReturnValue(
      createContext({
        handleRenameConversation,
      }),
    );

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        React.createElement(ConversationsSidebar, { variant: "game-modal" }),
      );
    });

    const renameButtons = tree?.root.findAll(
      (node) =>
        node.type === "button" && node.props.title === "Rename conversation",
    );
    expect(renameButtons.length).toBeGreaterThan(0);

    await act(async () => {
      renameButtons[0].props.onClick({ stopPropagation: () => {} });
    });

    const input = tree?.root.findAll((node) => node.type === "input")[0];
    expect(input).toBeTruthy();

    await act(async () => {
      input.props.onChange({ target: { value: "Renamed room" } });
    });
    await act(async () => {
      input.props.onKeyDown({
        key: "Enter",
        preventDefault: () => {},
      });
    });

    expect(handleRenameConversation).toHaveBeenCalledWith(
      "conv-2",
      "Renamed room",
    );
  });

  it("refreshes self status on websocket status events", async () => {
    mockUseApp.mockReturnValue(createContext());
    const mockedClient = vi.mocked(client);
    const getAgentSelfStatus = vi.mocked(mockedClient.getAgentSelfStatus);
    const onWsEvent = vi.mocked(mockedClient.onWsEvent);
    const wsHandlers: Record<string, (() => void) | undefined> = {};
    onWsEvent.mockImplementation((type, handler) => {
      wsHandlers[type] = () => handler({});
      return () => {};
    });

    await act(async () => {
      TestRenderer.create(
        React.createElement(ConversationsSidebar, { variant: "game-modal" }),
      );
    });

    expect(getAgentSelfStatus).toHaveBeenCalledTimes(1);
    expect(wsHandlers.status).toBeTypeOf("function");

    await act(async () => {
      wsHandlers.status?.();
    });

    expect(getAgentSelfStatus).toHaveBeenCalledTimes(2);
  });
});
