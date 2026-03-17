// @vitest-environment jsdom
import * as AppState from "@miladyai/app-core/state";
import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

import { ChatView } from "./ChatView";

vi.mock("@miladyai/app-core/api", () => ({
  client: {
    getConfig: vi.fn(async () => ({})),
  },
}));

vi.mock("@miladyai/app-core/chat", () => ({
  isRoutineCodingAgentMessage: vi.fn(() => false),
}));

vi.mock("@miladyai/app-core/events", () => ({
  VOICE_CONFIG_UPDATED_EVENT: "voice-config-updated",
}));

vi.mock("@miladyai/app-core/hooks", () => ({
  useChatAvatarVoiceBridge: vi.fn(),
  useTimeout: () => ({
    setTimeout: (fn: () => void) => fn(),
  }),
  useVoiceChat: () => ({
    isListening: false,
    isSupported: false,
    error: null,
    startListening: vi.fn(),
    stopListening: vi.fn(),
    speakText: vi.fn(),
    stopSpeaking: vi.fn(),
    mouthOpen: 0,
    isSpeaking: false,
    usingAudioAnalysis: false,
  }),
}));

vi.mock("@miladyai/app-core/state", () => ({
  getVrmPreviewUrl: vi.fn(() => "/avatar.png"),
  useApp: vi.fn(),
}));

vi.mock("./AgentActivityBox", () => ({
  AgentActivityBox: () => null,
}));

vi.mock("./ChatComposer", () => ({
  ChatComposer: () => null,
}));

vi.mock("./ChatMessage", () => ({
  ChatEmptyState: ({ agentName }: { agentName: string }) =>
    React.createElement("div", {
      "data-testid": "chat-empty-state",
      "data-agent-name": agentName,
    }),
  ChatMessage: ({ message }: { message: { text: string } }) =>
    React.createElement("div", {
      "data-testid": "chat-message",
      "data-text": message.text,
    }),
  TypingIndicator: ({ agentName }: { agentName: string }) =>
    React.createElement("div", {
      "data-testid": "typing-indicator",
      "data-agent-name": agentName,
    }),
}));

vi.mock("./MessageContent", () => ({
  MessageContent: ({ message }: { message: { text: string } }) =>
    React.createElement("span", null, message.text),
}));

function renderWithAppState(
  overrides: Partial<ReturnType<typeof AppState.useApp>> = {},
): ReactTestRenderer {
  const appState = {
    agentStatus: { state: "running", agentName: "Milady" },
    activeConversationId: "conv-1",
    chatInput: "",
    chatSending: false,
    chatFirstTokenReceived: false,
    companionMessageCutoffTs: 0,
    conversationMessages: [],
    handleChatSend: vi.fn(async () => {}),
    handleChatStop: vi.fn(),
    handleChatEdit: vi.fn(async () => true),
    elizaCloudConnected: false,
    setState: vi.fn(),
    droppedFiles: [],
    shareIngestNotice: "",
    chatAgentVoiceMuted: false,
    selectedVrmIndex: 1,
    chatPendingImages: [],
    setChatPendingImages: vi.fn(),
    uiLanguage: "en",
    ptySessions: [],
    t: (key: string) => key,
    ...overrides,
  };

  vi.spyOn(AppState, "useApp").mockReturnValue(
    appState as ReturnType<typeof AppState.useApp>,
  );

  let renderer: ReactTestRenderer | null = null;
  act(() => {
    renderer = create(<ChatView variant="game-modal" />);
  });

  if (!renderer) {
    throw new Error("Failed to render ChatView");
  }

  return renderer;
}

describe("ChatView", () => {
  it("does not render a fake typing indicator for an empty companion dock", () => {
    const renderer = renderWithAppState();

    expect(
      renderer.root.findAllByProps({ "data-testid": "typing-indicator" }),
    ).toHaveLength(0);
    expect(
      renderer.root.findAllByProps({ "data-testid": "chat-empty-state" }),
    ).toHaveLength(0);
  });

  it("keeps the standard empty state for the default chat view", () => {
    const appState = {
      agentStatus: { state: "running", agentName: "Milady" },
      activeConversationId: "conv-1",
      chatInput: "",
      chatSending: false,
      chatFirstTokenReceived: false,
      companionMessageCutoffTs: 0,
      conversationMessages: [],
      handleChatSend: vi.fn(async () => {}),
      handleChatStop: vi.fn(),
      handleChatEdit: vi.fn(async () => true),
      elizaCloudConnected: false,
      setState: vi.fn(),
      droppedFiles: [],
      shareIngestNotice: "",
      chatAgentVoiceMuted: false,
      selectedVrmIndex: 1,
      chatPendingImages: [],
      setChatPendingImages: vi.fn(),
      uiLanguage: "en",
      ptySessions: [],
      t: (key: string) => key,
    };

    vi.spyOn(AppState, "useApp").mockReturnValue(
      appState as ReturnType<typeof AppState.useApp>,
    );

    let renderer: ReactTestRenderer | null = null;
    act(() => {
      renderer = create(<ChatView />);
    });

    if (!renderer) {
      throw new Error("Failed to render ChatView");
    }

    expect(
      renderer.root.findAllByProps({ "data-testid": "chat-empty-state" }),
    ).toHaveLength(1);
  });
});
