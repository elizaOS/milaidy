import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  timestamp: number;
  source?: string;
};

interface ChatViewContextStub {
  agentStatus:
    | {
      agentName: string;
      state?: "starting" | "restarting" | "running" | "paused";
    }
    | null;
  chatInput: string;
  chatSending: boolean;
  chatFirstTokenReceived: boolean;
  conversationMessages: ChatMessage[];
  handleChatSend: (mode: "simple" | "power") => Promise<void>;
  handleChatStop: () => void;
  setState: (key: string, value: unknown) => void;
  droppedFiles: string[];
  shareIngestNotice: string;
  chatMode: "simple" | "power";
  chatAgentVoiceMuted: boolean;
  selectedVrmIndex: number;
  uiLanguage: "en" | "zh-CN";
}

const { mockClient, mockUseApp, mockUseVoiceChat } = vi.hoisted(() => ({
  mockClient: {
    getConfig: vi.fn(),
  },
  mockUseApp: vi.fn(),
  mockUseVoiceChat: vi.fn(),
}));

vi.mock("../../src/AppContext", () => ({
  useApp: () => mockUseApp(),
  getVrmPreviewUrl: () => null,
}));

vi.mock("../../src/hooks/useVoiceChat", () => ({
  useVoiceChat: () => mockUseVoiceChat(),
}));

vi.mock("../../src/components/MessageContent", () => ({
  MessageContent: ({ message }: { message: { text: string } }) =>
    React.createElement("span", null, message.text),
}));

vi.mock("../../src/api-client", () => ({
  client: mockClient,
}));

import { ChatView } from "../../src/components/ChatView";

function createContext(
  overrides?: Partial<ChatViewContextStub>,
): ChatViewContextStub {
  return {
    agentStatus: { agentName: "Milady", state: "running" },
    chatInput: "Hello",
    chatSending: false,
    chatFirstTokenReceived: false,
    conversationMessages: [],
    handleChatSend: vi.fn(async () => {}),
    handleChatStop: vi.fn(),
    setState: vi.fn(),
    droppedFiles: [],
    shareIngestNotice: "",
    chatMode: "simple",
    chatAgentVoiceMuted: false,
    selectedVrmIndex: 0,
    uiLanguage: "en",
    chatPendingImages: [],
    setChatPendingImages: vi.fn(),
    ...overrides,
  };
}

function textOf(node: TestRenderer.ReactTestInstance): string {
  return node.children
    .map((child) => (typeof child === "string" ? child : textOf(child)))
    .join("");
}

describe("ChatView game-modal variant", () => {
  beforeEach(() => {
    mockUseApp.mockReset();
    mockUseVoiceChat.mockReset();
    mockClient.getConfig.mockReset();

    mockUseVoiceChat.mockReturnValue({
      supported: true,
      isListening: false,
      interimTranscript: "",
      toggleListening: vi.fn(),
      isSpeaking: false,
      usingAudioAnalysis: false,
      queueAssistantSpeech: vi.fn(),
      stopSpeaking: vi.fn(),
    });
    mockClient.getConfig.mockResolvedValue({});
  });

  it("hides source tags in game-modal bubbles", async () => {
    mockUseApp.mockReturnValue(
      createContext({
        conversationMessages: [
          {
            id: "assistant-1",
            role: "assistant",
            text: "Acknowledged",
            timestamp: 1,
            source: "discord",
          },
        ],
      }),
    );

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        React.createElement(ChatView, { variant: "game-modal" }),
      );
    });

    const text = textOf(tree!.root).toLowerCase();
    expect(text).toContain("acknowledged");
    expect(text).not.toContain("via discord");
    expect(
      tree!.root.findAll(
        (node) =>
          typeof node.props.className === "string" &&
          node.props.className.includes("chat-game-bubble"),
      ).length,
    ).toBeGreaterThan(0);
  });

  it("keeps mic and send controls usable in game-modal", async () => {
    const handleChatSend = vi.fn(async () => {});
    mockUseApp.mockReturnValue(
      createContext({
        handleChatSend,
        conversationMessages: [
          {
            id: "user-1",
            role: "user",
            text: "test",
            timestamp: 1,
          },
        ],
      }),
    );

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        React.createElement(ChatView, { variant: "game-modal" }),
      );
    });

    const micButtons = tree!.root.findAll(
      (node) =>
        node.type === "button" &&
        typeof node.props.className === "string" &&
        node.props.className.includes("chat-game-mic-btn"),
    );
    expect(micButtons.length).toBe(1);

    const sendButtons = tree!.root.findAll(
      (node) => node.type === "button" && textOf(node).trim() === "Send",
    );
    expect(sendButtons.length).toBe(1);

    await act(async () => {
      sendButtons[0].props.onClick();
    });
    expect(handleChatSend).toHaveBeenCalledWith("simple");
  });

  it("disables composer controls while agent is starting", async () => {
    mockUseApp.mockReturnValue(
      createContext({
        agentStatus: { agentName: "Milady", state: "starting" },
      }),
    );

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        React.createElement(ChatView, { variant: "game-modal" }),
      );
    });

    const textarea = tree!.root.findByType("textarea");
    expect(textarea.props.disabled).toBe(true);
    expect(textarea.props.placeholder).toBe("Agent starting...");

    const sendButton = tree!.root.findAll(
      (node) => node.type === "button" && textOf(node).trim() === "Agent starting...",
    )[0];
    expect(sendButton).toBeTruthy();
    expect(sendButton.props.disabled).toBe(true);

    const micButton = tree!.root.findAll(
      (node) =>
        node.type === "button" &&
        typeof node.props.className === "string" &&
        node.props.className.includes("chat-game-mic-btn"),
    )[0];
    expect(micButton).toBeTruthy();
    expect(micButton.props.disabled).toBe(true);
  });
});
