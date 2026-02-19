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
  chatPendingImages: Array<{ data: string; mimeType: string; name: string }>;
  setChatPendingImages: (
    updater:
      | Array<{ data: string; mimeType: string; name: string }>
      | ((
          prev: Array<{ data: string; mimeType: string; name: string }>,
        ) => Array<{ data: string; mimeType: string; name: string }>),
  ) => void;
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
    chatPendingImages: [],
    setChatPendingImages: vi.fn(),
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

  it("keeps message text inset from the scrollbar gutter", async () => {
    mockUseApp.mockReturnValue(
      createContext({
        conversationMessages: [
          { id: "u1", role: "user", text: "hello", timestamp: 1 },
        ],
      }),
    );

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(ChatView));
    });
    await flush();

    const scroller = tree.root.findByProps({
      "data-testid": "chat-messages-scroll",
    });
    expect(String(scroller.props.className)).toContain("pr-3");
    expect(scroller.props.style?.scrollbarGutter).toBe("stable both-edges");
  });

  it("auto-scrolls again when conversation messages update", async () => {
    const scrollTo = vi.fn();
    const scrollerMock = { scrollHeight: 240, scrollTo };
    const textareaMock = {
      style: { height: "", overflowY: "" },
      scrollHeight: 38,
      focus: vi.fn(),
    };
    const fileInputMock = { click: vi.fn() };

    let currentContext = createContext({
      conversationMessages: [
        { id: "u1", role: "user", text: "hello", timestamp: 1 },
      ],
    });
    mockUseApp.mockImplementation(() => currentContext);

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(ChatView), {
        createNodeMock: (element) => {
          const node = element as {
            type: unknown;
            props: Record<string, unknown>;
          };
          if (
            node.type === "div" &&
            node.props["data-testid"] === "chat-messages-scroll"
          ) {
            return scrollerMock;
          }
          if (node.type === "textarea") {
            return textareaMock;
          }
          if (node.type === "input" && node.props.type === "file") {
            return fileInputMock;
          }
          return {};
        },
      });
    });
    await flush();

    const callsAfterMount = scrollTo.mock.calls.length;
    expect(callsAfterMount).toBeGreaterThan(0);

    currentContext = createContext({
      conversationMessages: [
        { id: "u1", role: "user", text: "hello", timestamp: 1 },
        { id: "a1", role: "assistant", text: "Hi there!", timestamp: 2 },
      ],
    });

    await act(async () => {
      tree.update(React.createElement(ChatView));
    });
    await flush();

    expect(scrollTo.mock.calls.length).toBeGreaterThan(callsAfterMount);
  });

  it("auto-scrolls when content changes but length and trailing text stay the same", async () => {
    const scrollTo = vi.fn();
    const scrollerMock = { scrollHeight: 240, scrollTo };
    const textareaMock = {
      style: { height: "", overflowY: "" },
      scrollHeight: 38,
      focus: vi.fn(),
    };
    const fileInputMock = { click: vi.fn() };

    let currentContext = createContext({
      conversationMessages: [
        { id: "u1", role: "user", text: "first draft", timestamp: 1 },
        { id: "a1", role: "assistant", text: "same tail", timestamp: 2 },
      ],
    });
    mockUseApp.mockImplementation(() => currentContext);

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(ChatView), {
        createNodeMock: (element) => {
          const node = element as {
            type: unknown;
            props: Record<string, unknown>;
          };
          if (
            node.type === "div" &&
            node.props["data-testid"] === "chat-messages-scroll"
          ) {
            return scrollerMock;
          }
          if (node.type === "textarea") {
            return textareaMock;
          }
          if (node.type === "input" && node.props.type === "file") {
            return fileInputMock;
          }
          return {};
        },
      });
    });
    await flush();

    const callsAfterMount = scrollTo.mock.calls.length;
    expect(callsAfterMount).toBeGreaterThan(0);

    currentContext = createContext({
      conversationMessages: [
        { id: "u2", role: "user", text: "updated body", timestamp: 101 },
        { id: "a2", role: "assistant", text: "same tail", timestamp: 102 },
      ],
    });

    await act(async () => {
      tree.update(React.createElement(ChatView));
    });
    await flush();

    expect(scrollTo.mock.calls.length).toBeGreaterThan(callsAfterMount);
  });

  it("renders aria labels for chat composer controls", async () => {
    mockUseVoiceChat.mockReturnValue({
      supported: true,
      isListening: false,
      interimTranscript: "",
      toggleListening: vi.fn(),
      mouthOpen: 0,
      isSpeaking: false,
      usingAudioAnalysis: false,
      speak: vi.fn(),
      queueAssistantSpeech: vi.fn(),
      stopSpeaking: vi.fn(),
    });

    mockUseApp.mockReturnValue(createContext());

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(ChatView));
    });
    await flush();

    const textarea = tree?.root.find((node) => node.type === "textarea");
    expect(textarea.props["aria-label"]).toBe("Chat message");

    const attachButton = tree?.root.find(
      (node) =>
        node.type === "button" && node.props["aria-label"] === "Attach image",
    );
    expect(attachButton.props["aria-label"]).toBe("Attach image");

    const micButton = tree?.root.find(
      (node) =>
        node.type === "button" &&
        node.props["aria-label"] === "Start voice input",
    );
    expect(micButton.props["aria-pressed"]).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// addImageFiles — functional updater (stale closure fix)
// ---------------------------------------------------------------------------

describe("addImageFiles functional updater", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("calls setChatPendingImages with a functional updater, not a static array", async () => {
    // Synchronous FileReader mock — calls onload immediately so we don't need
    // to wait for real async I/O inside the test.
    class MockFileReader {
      onload: (() => void) | null = null;
      result: string | ArrayBuffer | null = null;

      readAsDataURL() {
        this.result = "data:image/png;base64,abc123";
        this.onload?.();
      }
    }
    vi.stubGlobal("FileReader", MockFileReader as unknown as typeof FileReader);

    const setChatPendingImages = vi.fn();
    mockUseApp.mockReturnValue(
      createContext({ chatPendingImages: [], setChatPendingImages }),
    );

    let tree: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(ChatView));
    });
    await flush();

    // Find the hidden <input type="file"> and fire onChange with a fake File
    if (!tree) {
      throw new Error("ChatView test renderer did not initialize");
    }
    const fileInput = tree.root.find(
      (node) => node.type === "input" && node.props.accept === "image/*",
    );

    const fakeFile = new Proxy(
      { type: "image/png", name: "test.png" },
      {
        get(target, prop) {
          return (target as Record<string | symbol, unknown>)[prop as string];
        },
      },
    ) as unknown as File;

    await act(async () => {
      fileInput.props.onChange({
        target: { files: [fakeFile], value: "" },
      });
    });
    await flush();

    // The fix: setChatPendingImages must be called with a function (functional
    // updater), not a static array. This ensures rapid consecutive drops
    // accumulate all images instead of overwriting with stale state.
    expect(setChatPendingImages).toHaveBeenCalled();
    const callArg = setChatPendingImages.mock.calls[0]?.[0];
    expect(typeof callArg).toBe("function");

    // Verify the updater correctly appends to the existing array
    const prev = [
      { data: "existing", mimeType: "image/jpeg", name: "prev.jpg" },
    ];
    const next = callArg(prev);
    expect(next).toHaveLength(2);
    expect(next[0]).toEqual(prev[0]);
    expect(next[1]).toMatchObject({ mimeType: "image/png", name: "test.png" });
  });
});
