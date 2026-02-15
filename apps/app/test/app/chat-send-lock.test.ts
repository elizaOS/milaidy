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
      agentName: "Milaidy",
    })),
    sendConversationMessageStream: vi.fn(async () => ({
      text: "ok",
      agentName: "Milaidy",
    })),
    sendWsMessage: vi.fn(),
    connectWs: vi.fn(),
    disconnectWs: vi.fn(),
    onWsEvent: vi.fn(() => () => {}),
    getAgentEvents: vi.fn(async () => ({ events: [], latestEventId: null })),
    getStatus: vi.fn(async () => ({
      state: "running",
      agentName: "Milaidy",
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
};

function Probe(props: { onReady: (api: ProbeApi) => void }) {
  const { onReady } = props;
  const app = useApp();

  useEffect(() => {
    onReady({
      setChatInput: (text: string) => app.setState("chatInput", text),
      handleSelectConversation: app.handleSelectConversation,
      handleChatSend: () => app.handleChatSend("simple"),
    });
  }, [app, onReady]);

  return null;
}

describe("chat send locking", () => {
  beforeEach(() => {
    Object.assign(window.location, { protocol: "file:", pathname: "/chat" });
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
      agentName: "Milaidy",
    });
    mockClient.sendConversationMessageStream.mockResolvedValue({
      text: "ok",
      agentName: "Milaidy",
    });
    mockClient.sendWsMessage.mockImplementation(() => {});
    mockClient.connectWs.mockImplementation(() => {});
    mockClient.disconnectWs.mockImplementation(() => {});
    mockClient.onWsEvent.mockReturnValue(() => {});
    mockClient.getAgentEvents.mockResolvedValue({ events: [], latestEventId: null });
    mockClient.getStatus.mockResolvedValue({
      state: "running",
      agentName: "Milaidy",
      model: undefined,
      startedAt: undefined,
      uptime: undefined,
    });
    mockClient.getWalletAddresses.mockResolvedValue(null);
    mockClient.getConfig.mockResolvedValue({});
    mockClient.getCloudStatus.mockResolvedValue({ enabled: false, connected: false });
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
      await api!.handleSelectConversation("conv-1");
      api!.setChatInput("hello");
    });

    await act(async () => {
      void api!.handleChatSend();
      void api!.handleChatSend();
    });

    expect(mockClient.sendConversationMessageStream).toHaveBeenCalledTimes(1);

    await act(async () => {
      deferred.resolve({ text: "ok", agentName: "Milaidy" });
      await deferred.promise;
    });

    await act(async () => {
      tree!.unmount();
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
      await api!.handleSelectConversation("conv-1");
      api!.setChatInput("hello");
    });

    mockClient.sendWsMessage.mockImplementationOnce(() => {
      throw new Error("ws boom");
    });

    await act(async () => {
      await expect(api!.handleChatSend()).rejects.toThrow("ws boom");
    });

    await act(async () => {
      api!.setChatInput("hello again");
      await api!.handleChatSend();
    });

    expect(mockClient.sendConversationMessageStream).toHaveBeenCalledTimes(1);

    await act(async () => {
      tree!.unmount();
    });
  });
});
