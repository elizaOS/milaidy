/** @vitest-environment jsdom */
import React, { useEffect } from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockClient } = vi.hoisted(() => ({
  mockClient: {
    hasToken: vi.fn(() => false),
    getAuthStatus: vi.fn(async () => ({
      required: false,
      pairingEnabled: false,
      expiresAt: null,
    })),
    getOnboardingStatus: vi.fn(async () => ({ complete: true })),
    listConversations: vi.fn(async () => ({
      conversations: [
        {
          id: "conv-1",
          title: "Chat",
          roomId: "room-1",
          createdAt: "2026-02-01T00:00:00.000Z",
          updatedAt: "2026-02-01T00:00:00.000Z",
        },
      ],
    })),
    createConversation: vi.fn(async () => ({
      conversation: {
        id: "conv-created",
        title: "Chat",
        roomId: "room-created",
        createdAt: "2026-02-01T00:00:00.000Z",
        updatedAt: "2026-02-01T00:00:00.000Z",
      },
    })),
    getConversationMessages: vi.fn(async () => ({
      messages: [
        {
          id: "msg-1",
          role: "assistant",
          text: "hello",
          timestamp: Date.now(),
        },
      ],
    })),
    sendConversationMessage: vi.fn(async () => ({
      text: "ok",
      agentName: "Milady",
    })),
    sendConversationMessageStream: vi.fn(async () => ({
      text: "ok",
      agentName: "Milady",
    })),
    sendWsMessage: vi.fn(),
    connectWs: vi.fn(),
    disconnectWs: vi.fn(),
    onWsEvent: vi.fn(() => () => {}),
    getAgentEvents: vi.fn(async () => ({ events: [], latestEventId: null })),
    getStatus: vi.fn(async () => ({
      state: "running",
      agentName: "Milady",
      model: undefined,
      startedAt: undefined,
      uptime: undefined,
    })),
    getWalletAddresses: vi.fn(async () => null),
    getConfig: vi.fn(async () => ({})),
    getCloudStatus: vi.fn(async () => ({ enabled: false, connected: false })),
    getWorkbenchOverview: vi.fn(async () => ({
      tasks: [],
      triggers: [],
      todos: [],
    })),
  },
}));

vi.mock("../../src/api-client", () => ({
  client: mockClient,
  SkillScanReportSummary: {},
}));

import { AppProvider, useApp } from "../../src/AppContext";

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

type ProbeApi = {
  setChatInput: (text: string) => void;
  handleSelectConversation: (id: string) => Promise<void>;
  handleChatSend: () => Promise<void>;
  snapshot: () => {
    chatSending: boolean;
    chatFirstTokenReceived: boolean;
    conversationMessages: Array<{
      id: string;
      role: "user" | "assistant";
      text: string;
      timestamp: number;
      source?: string;
    }>;
  };
};

function Probe(props: { onReady: (api: ProbeApi) => void }) {
  const { onReady } = props;
  const app = useApp();

  useEffect(() => {
    onReady({
      setChatInput: (text: string) => app.setState("chatInput", text),
      handleSelectConversation: app.handleSelectConversation,
      handleChatSend: () => app.handleChatSend("simple"),
      snapshot: () => ({
        chatSending: app.chatSending,
        chatFirstTokenReceived: app.chatFirstTokenReceived,
        conversationMessages: app.conversationMessages.map((message) => ({
          id: message.id,
          role: message.role,
          text: message.text,
          timestamp: message.timestamp,
          source: message.source,
        })),
      }),
    });
  }, [app, onReady]);

  return null;
}

describe("chat send locking", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/chat");
    Object.assign(window, {
      setTimeout: globalThis.setTimeout,
      clearTimeout: globalThis.clearTimeout,
      setInterval: globalThis.setInterval,
      clearInterval: globalThis.clearInterval,
    });
    Object.assign(document.documentElement, { setAttribute: vi.fn() });

    for (const fn of Object.values(mockClient)) {
      if (typeof fn === "function" && "mockReset" in fn) {
        (fn as { mockReset: () => void }).mockReset();
      }
    }

    mockClient.hasToken.mockReturnValue(false);
    mockClient.getAuthStatus.mockResolvedValue({
      required: false,
      pairingEnabled: false,
      expiresAt: null,
    });
    mockClient.getOnboardingStatus.mockResolvedValue({ complete: true });
    mockClient.listConversations.mockResolvedValue({
      conversations: [
        {
          id: "conv-1",
          title: "Chat",
          roomId: "room-1",
          createdAt: "2026-02-01T00:00:00.000Z",
          updatedAt: "2026-02-01T00:00:00.000Z",
        },
      ],
    });
    mockClient.createConversation.mockResolvedValue({
      conversation: {
        id: "conv-created",
        title: "Chat",
        roomId: "room-created",
        createdAt: "2026-02-01T00:00:00.000Z",
        updatedAt: "2026-02-01T00:00:00.000Z",
      },
    });
    mockClient.getConversationMessages.mockResolvedValue({
      messages: [
        {
          id: "msg-1",
          role: "assistant",
          text: "hello",
          timestamp: Date.now(),
        },
      ],
    });
    mockClient.sendConversationMessage.mockResolvedValue({
      text: "ok",
      agentName: "Milady",
    });
    mockClient.sendConversationMessageStream.mockResolvedValue({
      text: "ok",
      agentName: "Milady",
    });
    mockClient.sendWsMessage.mockImplementation(() => {});
    mockClient.connectWs.mockImplementation(() => {});
    mockClient.disconnectWs.mockImplementation(() => {});
    mockClient.onWsEvent.mockReturnValue(() => {});
    mockClient.getAgentEvents.mockResolvedValue({
      events: [],
      latestEventId: null,
    });
    mockClient.getStatus.mockResolvedValue({
      state: "running",
      agentName: "Milady",
      model: undefined,
      startedAt: undefined,
      uptime: undefined,
    });
    mockClient.getWalletAddresses.mockResolvedValue(null);
    mockClient.getConfig.mockResolvedValue({});
    mockClient.getCloudStatus.mockResolvedValue({
      enabled: false,
      connected: false,
    });
    mockClient.getWorkbenchOverview.mockResolvedValue({
      tasks: [],
      triggers: [],
      todos: [],
    });
  });

  it("allows only one same-tick chat send request", async () => {
    const deferred = createDeferred<{ text: string; agentName: string }>();
    mockClient.sendConversationMessageStream.mockReturnValue(deferred.promise);

    let api: ProbeApi | null = null;
    let tree: TestRenderer.ReactTestRenderer;

    await act(async () => {
      tree = TestRenderer.create(
        React.createElement(
          AppProvider,
          null,
          React.createElement(Probe, {
            onReady: (nextApi) => {
              api = nextApi;
            },
          }),
        ),
      );
    });

    expect(api).not.toBeNull();

    await act(async () => {
      await api?.handleSelectConversation("conv-1");
      api?.setChatInput("hello");
    });

    await act(async () => {
      void api?.handleChatSend();
      void api?.handleChatSend();
    });

    expect(mockClient.sendConversationMessageStream).toHaveBeenCalledTimes(1);

    await act(async () => {
      deferred.resolve({ text: "ok", agentName: "Milady" });
      await deferred.promise;
    });

    await act(async () => {
      tree?.unmount();
    });
  });

  it("releases lock when active-conversation sync throws before stream send", async () => {
    let api: ProbeApi | null = null;
    let tree: TestRenderer.ReactTestRenderer;

    await act(async () => {
      tree = TestRenderer.create(
        React.createElement(
          AppProvider,
          null,
          React.createElement(Probe, {
            onReady: (nextApi) => {
              api = nextApi;
            },
          }),
        ),
      );
    });

    expect(api).not.toBeNull();

    await act(async () => {
      await api?.handleSelectConversation("conv-1");
      api?.setChatInput("hello");
    });

    mockClient.sendWsMessage.mockImplementationOnce(() => {
      throw new Error("ws boom");
    });

    await act(async () => {
      await expect(api?.handleChatSend()).rejects.toThrow("ws boom");
    });

    await act(async () => {
      api?.setChatInput("hello again");
      await api?.handleChatSend();
    });

    expect(mockClient.sendConversationMessageStream).toHaveBeenCalledTimes(1);

    await act(async () => {
      tree?.unmount();
    });
  });

  it("keeps optimistic user message and updates assistant text as stream chunks arrive", async () => {
    const deferred = createDeferred<{ text: string; agentName: string }>();
    mockClient.sendConversationMessageStream.mockImplementation(
      async (
        _conversationId: string,
        _text: string,
        onToken: (token: string) => void,
      ) => {
        onToken("Hello");
        return deferred.promise;
      },
    );

    let api: ProbeApi | null = null;
    let tree: TestRenderer.ReactTestRenderer;

    await act(async () => {
      tree = TestRenderer.create(
        React.createElement(
          AppProvider,
          null,
          React.createElement(Probe, {
            onReady: (nextApi) => {
              api = nextApi;
            },
          }),
        ),
      );
    });

    expect(api).not.toBeNull();

    await act(async () => {
      await api?.handleSelectConversation("conv-1");
      api?.setChatInput("stream me");
    });

    let sendPromise: Promise<void> | null = null;
    await act(async () => {
      sendPromise = api?.handleChatSend();
      await Promise.resolve();
    });

    await vi.waitFor(() => {
      const snapshot = api?.snapshot();
      const optimisticUser = snapshot.conversationMessages.find(
        (message) => message.role === "user" && message.text === "stream me",
      );
      const streamedAssistant = snapshot.conversationMessages.find(
        (message) =>
          message.role === "assistant" && message.id.startsWith("temp-resp-"),
      );

      expect(optimisticUser).toBeDefined();
      expect(streamedAssistant?.text).toBe("Hello");
      expect(snapshot.chatSending).toBe(true);
      expect(snapshot.chatFirstTokenReceived).toBe(true);
    });

    await act(async () => {
      deferred.resolve({ text: "Hello world", agentName: "Milady" });
      await sendPromise;
    });

    const finalSnapshot = api?.snapshot();
    const finalAssistant = [...finalSnapshot.conversationMessages]
      .reverse()
      .find((message) => message.role === "assistant");

    expect(finalAssistant?.text).toBe("Hello world");
    expect(finalSnapshot.chatSending).toBe(false);
    expect(finalSnapshot.chatFirstTokenReceived).toBe(false);

    await act(async () => {
      tree?.unmount();
    });
  });

  it("de-duplicates cumulative stream token updates", async () => {
    mockClient.sendConversationMessageStream.mockImplementation(
      async (
        _conversationId: string,
        _text: string,
        onToken: (token: string) => void,
      ) => {
        onToken("Hello ");
        onToken("Hello world");
        return { text: "Hello world", agentName: "Milady" };
      },
    );

    let api: ProbeApi | null = null;
    let tree: TestRenderer.ReactTestRenderer;

    await act(async () => {
      tree = TestRenderer.create(
        React.createElement(
          AppProvider,
          null,
          React.createElement(Probe, {
            onReady: (nextApi) => {
              api = nextApi;
            },
          }),
        ),
      );
    });

    expect(api).not.toBeNull();

    await act(async () => {
      await api?.handleSelectConversation("conv-1");
      api?.setChatInput("stream me");
    });

    await act(async () => {
      await api?.handleChatSend();
    });

    const finalSnapshot = api?.snapshot();
    const finalAssistant = [...finalSnapshot.conversationMessages]
      .reverse()
      .find((message) => message.role === "assistant");

    expect(finalAssistant?.text).toBe("Hello world");
    expect(finalSnapshot.chatSending).toBe(false);
    expect(finalSnapshot.chatFirstTokenReceived).toBe(false);

    await act(async () => {
      tree?.unmount();
    });
  });

  it("preserves repeated characters in incremental token streams", async () => {
    const deferred = createDeferred<{ text: string; agentName: string }>();
    mockClient.sendConversationMessageStream.mockImplementation(
      async (
        _conversationId: string,
        _text: string,
        onToken: (token: string) => void,
      ) => {
        for (const token of [
          "H",
          "e",
          "l",
          "l",
          "o",
          " ",
          "w",
          "o",
          "r",
          "l",
          "d",
        ]) {
          onToken(token);
        }
        return deferred.promise;
      },
    );

    let api: ProbeApi | null = null;
    let tree: TestRenderer.ReactTestRenderer;

    await act(async () => {
      tree = TestRenderer.create(
        React.createElement(
          AppProvider,
          null,
          React.createElement(Probe, {
            onReady: (nextApi) => {
              api = nextApi;
            },
          }),
        ),
      );
    });

    expect(api).not.toBeNull();

    await act(async () => {
      await api?.handleSelectConversation("conv-1");
      api?.setChatInput("stream me");
    });

    let sendPromise: Promise<void> | null = null;
    await act(async () => {
      sendPromise = api?.handleChatSend();
      await Promise.resolve();
    });

    await vi.waitFor(() => {
      const snapshot = api?.snapshot();
      const streamedAssistant = snapshot.conversationMessages.find(
        (message) =>
          message.role === "assistant" && message.id.startsWith("temp-resp-"),
      );
      expect(streamedAssistant?.text).toBe("Hello world");
      expect(snapshot.chatSending).toBe(true);
    });

    await act(async () => {
      deferred.resolve({ text: "Hello world", agentName: "Milady" });
      await sendPromise;
    });

    await act(async () => {
      tree?.unmount();
    });
  });

  it("does not block stream completion on conversation list refresh", async () => {
    const refreshDeferred = createDeferred<{
      conversations: Array<{
        id: string;
        title: string;
        roomId: string;
        createdAt: string;
        updatedAt: string;
      }>;
    }>();

    mockClient.listConversations
      .mockResolvedValueOnce({
        conversations: [
          {
            id: "conv-1",
            title: "Chat",
            roomId: "room-1",
            createdAt: "2026-02-01T00:00:00.000Z",
            updatedAt: "2026-02-01T00:00:00.000Z",
          },
        ],
      })
      .mockImplementationOnce(async () => refreshDeferred.promise);

    mockClient.sendConversationMessageStream.mockResolvedValue({
      text: "done",
      agentName: "Milady",
    });

    let api: ProbeApi | null = null;
    let tree: TestRenderer.ReactTestRenderer;

    await act(async () => {
      tree = TestRenderer.create(
        React.createElement(
          AppProvider,
          null,
          React.createElement(Probe, {
            onReady: (nextApi) => {
              api = nextApi;
            },
          }),
        ),
      );
    });

    expect(api).not.toBeNull();

    await act(async () => {
      await api?.handleSelectConversation("conv-1");
      api?.setChatInput("quick response");
    });

    let resolved = false;
    await act(async () => {
      const promise = api?.handleChatSend() ?? Promise.resolve();
      promise.then(() => {
        resolved = true;
      });
      await Promise.resolve();
    });

    await vi.waitFor(() => {
      expect(resolved).toBe(true);
      expect(api?.snapshot().chatSending).toBe(false);
    });

    await act(async () => {
      refreshDeferred.resolve({
        conversations: [
          {
            id: "conv-1",
            title: "Chat",
            roomId: "room-1",
            createdAt: "2026-02-01T00:00:00.000Z",
            updatedAt: "2026-02-01T00:00:00.000Z",
          },
        ],
      });
      await Promise.resolve();
    });

    await act(async () => {
      tree?.unmount();
    });
  });
});
