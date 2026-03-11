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
  agentStatus: {
    agentName: string;
    state?: "starting" | "restarting" | "running" | "paused";
  } | null;
  chatInput: string;
  chatSending: boolean;
  chatFirstTokenReceived: boolean;
  conversationMessages: ChatMessage[];
  handleChatSend: (channelType?: string) => Promise<void>;
  handleChatStop: () => void;
  setState: (key: string, value: unknown) => void;
  droppedFiles: string[];
  shareIngestNotice: string;
  chatMode: "simple" | "power";
  chatAgentVoiceMuted: boolean;
  selectedVrmIndex: number;
  uiLanguage: "en" | "zh-CN";
  t: (k: string) => string;
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

vi.mock("@milady/app-core/api", () => ({
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
    t: (k: string) => k,
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
            timestamp: Date.now(),
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

    const text = textOf(tree?.root).toLowerCase();
    expect(text).toContain("acknowledged");
    expect(text).not.toContain("via discord");
  });

  it("keeps mic and send controls usable in game-modal", async () => {
    const handleChatSend = vi.fn(async () => {});
    mockUseApp.mockReturnValue(
      createContext({
        handleChatSend,
        chatInput: "test",
        conversationMessages: [
          {
            id: "user-1",
            role: "user",
            text: "test",
            timestamp: Date.now(),
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

    // Find mic button by aria-label
    const micButton = tree?.root.findByProps({
      "aria-label": "chat.voiceInput",
    });
    expect(micButton).toBeTruthy();

    // Find send button - in game-modal it's the one with the Send icon and no text,
    // but it has handleChatSend in onClick.
    const buttons = tree?.root.findAllByType("button" as React.ElementType);
    const sendButton = buttons.find((b) =>
      b.props.onClick?.toString().includes("handleChatSend"),
    );
    expect(sendButton).toBeTruthy();

    await act(async () => {
      sendButton?.props.onClick();
    });
    expect(handleChatSend).toHaveBeenCalled();
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

    const textarea = tree?.root.findByType("textarea");
    expect(textarea.props.disabled).toBe(true);
    expect(textarea.props.placeholder).toBe("chat.agentStarting");

    // Mic button should also be disabled and have the correct aria-label
    const micButton = tree?.root.findByProps({
      "aria-label": "chat.agentStarting",
    });
    expect(micButton.props.disabled).toBe(true);
  });
});
