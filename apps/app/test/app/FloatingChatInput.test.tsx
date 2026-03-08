// @vitest-environment jsdom
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface FloatingChatContextStub {
  chatInput: string;
  chatSending: boolean;
  handleChatSend: (channel?: string) => Promise<void>;
  setState: (key: string, value: unknown) => void;
  setTab: (tab: string) => void;
}

const { mockUseApp, mockUseVoiceChat, mockFlushSync } = vi.hoisted(() => ({
  mockUseApp: vi.fn(),
  mockUseVoiceChat: vi.fn(),
  mockFlushSync: vi.fn((fn: () => void) => fn()),
}));

vi.mock("../../src/AppContext", () => ({
  useApp: () => mockUseApp(),
}));

vi.mock("../../src/hooks/useVoiceChat", () => ({
  useVoiceChat: (options: unknown) => mockUseVoiceChat(options),
}));

vi.mock("react-dom", () => ({
  flushSync: (fn: () => void) => mockFlushSync(fn),
}));

import { FloatingChatInput } from "../../src/components/FloatingChatInput";

function createContext(
  overrides?: Partial<FloatingChatContextStub>,
): FloatingChatContextStub {
  return {
    chatInput: "",
    chatSending: false,
    handleChatSend: vi.fn(async () => {}),
    setState: vi.fn(),
    setTab: vi.fn(),
    ...overrides,
  };
}

function findButton(
  tree: TestRenderer.ReactTestRenderer,
  label: string,
): TestRenderer.ReactTestInstance {
  return tree.root.find(
    (node) => node.type === "button" && node.props["aria-label"] === label,
  );
}

describe("FloatingChatInput", () => {
  beforeEach(() => {
    mockUseApp.mockReset();
    mockUseVoiceChat.mockReset();
    mockFlushSync.mockClear();

    mockUseVoiceChat.mockReturnValue({
      supported: true,
      isListening: false,
      interimTranscript: "",
      toggleListening: vi.fn(),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("switches to chat and sends immediately from the send button", async () => {
    const ctx = createContext({ chatInput: "hello" });
    mockUseApp.mockReturnValue(ctx);

    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(FloatingChatInput));
    });

    const sendButton = findButton(tree, "Send");
    await act(async () => {
      await sendButton.props.onClick();
    });

    expect(ctx.setTab).toHaveBeenCalledWith("chat");
    expect(ctx.handleChatSend).toHaveBeenCalledWith("DM");
    expect(ctx.setTab.mock.invocationCallOrder[0]).toBeLessThan(
      ctx.handleChatSend.mock.invocationCallOrder[0],
    );
  });

  it("submits on Enter without shift", async () => {
    const ctx = createContext({ chatInput: "hello" });
    mockUseApp.mockReturnValue(ctx);

    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(FloatingChatInput));
    });

    const textarea = tree.root.findByType("textarea");
    const preventDefault = vi.fn();
    await act(async () => {
      await textarea.props.onKeyDown({
        key: "Enter",
        shiftKey: false,
        preventDefault,
      });
    });

    expect(preventDefault).toHaveBeenCalled();
    expect(ctx.setTab).toHaveBeenCalledWith("chat");
    expect(ctx.handleChatSend).toHaveBeenCalledWith("DM");
  });

  it("flushes transcript state before sending voice input", async () => {
    const ctx = createContext();
    mockUseApp.mockReturnValue(ctx);

    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(FloatingChatInput));
    });

    void tree;
    const options = mockUseVoiceChat.mock.calls[0]?.[0] as {
      onTranscript: (text: string) => void;
    };

    await act(async () => {
      options.onTranscript("spoken words");
    });

    expect(mockFlushSync).toHaveBeenCalledTimes(1);
    expect(ctx.setState).toHaveBeenCalledWith("chatInput", "spoken words");
    expect(ctx.setTab).toHaveBeenCalledWith("chat");
    expect(ctx.handleChatSend).toHaveBeenCalledWith("DM");
  });

  it("disables send when there is no input", async () => {
    const ctx = createContext({ chatInput: "   " });
    mockUseApp.mockReturnValue(ctx);

    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(FloatingChatInput));
    });

    const sendButton = findButton(tree, "Send");
    expect(sendButton.props.disabled).toBe(true);
  });
});
