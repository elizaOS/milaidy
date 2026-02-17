import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface ChatViewContextStub {
  agentStatus: { agentName: string } | null;
  chatInput: string;
  chatSending: boolean;
  chatFirstTokenReceived: boolean;
  conversationMessages: Array<{
    id: string;
    role: "user" | "assistant";
    text: string;
    timestamp: number;
    source?: string;
  }>;
  handleChatSend: (mode: "simple" | "power") => Promise<void>;
  handleChatStop: () => void;
  setState: (key: string, value: unknown) => void;
  droppedFiles: string[];
  shareIngestNotice: string;
  selectedVrmIndex: number;
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

vi.mock("../../src/components/ChatAvatar", () => ({
  ChatAvatar: () => null,
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
    agentStatus: { agentName: "Milady" },
    chatInput: "",
    chatSending: false,
    chatFirstTokenReceived: false,
    conversationMessages: [],
    handleChatSend: vi.fn(async () => {}),
    handleChatStop: vi.fn(),
    setState: vi.fn(),
    droppedFiles: [],
    shareIngestNotice: "",
    selectedVrmIndex: 0,
    ...overrides,
  };
}

function text(node: TestRenderer.ReactTestInstance): string {
  return node.children
    .map((child) => (typeof child === "string" ? child : ""))
    .join("")
    .trim();
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

describe("ChatView", () => {
  beforeEach(() => {
    mockUseApp.mockReset();
    mockUseVoiceChat.mockReset();
    mockClient.getConfig.mockReset();

    const queueAssistantSpeech = vi.fn();
    mockUseVoiceChat.mockReturnValue({
      supported: false,
      isListening: false,
      interimTranscript: "",
      toggleListening: vi.fn(),
      mouthOpen: 0,
      isSpeaking: false,
      usingAudioAnalysis: false,
      speak: vi.fn(),
      queueAssistantSpeech,
      stopSpeaking: vi.fn(),
    });
    mockClient.getConfig.mockResolvedValue({});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not render duplicate assistant headers before first token", async () => {
    mockUseApp.mockReturnValue(
      createContext({
        chatSending: true,
        chatFirstTokenReceived: false,
        conversationMessages: [
          { id: "u1", role: "user", text: "hello", timestamp: 1 },
          { id: "a-temp", role: "assistant", text: "", timestamp: 2 },
        ],
      }),
    );

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(ChatView));
    });
    await flush();

    const root = tree?.root;
    const headerCount = root.findAll(
      (node) => node.type === "div" && text(node) === "Milady",
    ).length;
    expect(headerCount).toBe(1);
  });

  it("keeps optimistic user text visible before the first assistant token", async () => {
    mockUseApp.mockReturnValue(
      createContext({
        chatSending: true,
        chatFirstTokenReceived: false,
        conversationMessages: [
          { id: "u1", role: "user", text: "stream me", timestamp: 1 },
          { id: "a-temp", role: "assistant", text: "", timestamp: 2 },
        ],
      }),
    );

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(ChatView));
    });
    await flush();

    const root = tree?.root;
    const userTextNodes = root.findAll(
      (node) => node.type === "span" && text(node) === "stream me",
    );
    expect(userTextNodes.length).toBe(1);
  });

  it("queues assistant speech as non-final while stream is active", async () => {
    const queueAssistantSpeech = vi.fn();
    mockUseVoiceChat.mockReturnValue({
      supported: false,
      isListening: false,
      interimTranscript: "",
      toggleListening: vi.fn(),
      mouthOpen: 0,
      isSpeaking: false,
      usingAudioAnalysis: false,
      speak: vi.fn(),
      queueAssistantSpeech,
      stopSpeaking: vi.fn(),
    });

    mockUseApp.mockReturnValue(
      createContext({
        chatSending: true,
        conversationMessages: [
          { id: "a1", role: "assistant", text: "Hello world.", timestamp: 1 },
        ],
      }),
    );

    await act(async () => {
      TestRenderer.create(React.createElement(ChatView));
    });
    await flush();

    expect(queueAssistantSpeech).toHaveBeenCalledWith(
      "a1",
      "Hello world.",
      false,
    );
  });

  it("queues assistant speech as final after stream completes", async () => {
    const queueAssistantSpeech = vi.fn();
    mockUseVoiceChat.mockReturnValue({
      supported: false,
      isListening: false,
      interimTranscript: "",
      toggleListening: vi.fn(),
      mouthOpen: 0,
      isSpeaking: false,
      usingAudioAnalysis: false,
      speak: vi.fn(),
      queueAssistantSpeech,
      stopSpeaking: vi.fn(),
    });

    mockUseApp.mockReturnValue(
      createContext({
        chatSending: false,
        conversationMessages: [
          { id: "a1", role: "assistant", text: "Hello world.", timestamp: 1 },
        ],
      }),
    );

    await act(async () => {
      TestRenderer.create(React.createElement(ChatView));
    });
    await flush();

    expect(queueAssistantSpeech).toHaveBeenCalledWith(
      "a1",
      "Hello world.",
      true,
    );
  });
});
