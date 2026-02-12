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
    cloudLogin: vi.fn(async () => ({
      ok: false,
      browserUrl: "",
      sessionId: "",
    })),
    cloudLoginPoll: vi.fn(async () => ({ status: "pending" as const })),
    getCloudCredits: vi.fn(async () => ({ balance: 0, low: false, critical: false })),
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
  handleCloudLogin: () => Promise<void>;
};

function Probe(props: { onReady: (api: ProbeApi) => void }) {
  const { onReady } = props;
  const app = useApp();

  useEffect(() => {
    onReady({ handleCloudLogin: app.handleCloudLogin });
  }, [app, onReady]);

  return null;
}

describe("cloud login locking", () => {
  beforeEach(() => {
    Object.assign(window.location, { protocol: "file:", pathname: "/chat" });
    Object.assign(window, {
      setTimeout: globalThis.setTimeout,
      clearTimeout: globalThis.clearTimeout,
      setInterval: globalThis.setInterval,
      clearInterval: globalThis.clearInterval,
      open: vi.fn(() => null),
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
    mockClient.cloudLogin.mockResolvedValue({
      ok: false,
      browserUrl: "",
      sessionId: "",
    });
    mockClient.cloudLoginPoll.mockResolvedValue({ status: "pending" });
    mockClient.getCloudCredits.mockResolvedValue({ balance: 0, low: false, critical: false });
  });

  it("allows only one same-tick cloud login start", async () => {
    const deferred = createDeferred<{ ok: boolean; browserUrl: string; sessionId: string }>();
    mockClient.cloudLogin.mockReturnValue(deferred.promise);

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
      void api!.handleCloudLogin();
      void api!.handleCloudLogin();
    });

    expect(mockClient.cloudLogin).toHaveBeenCalledTimes(1);

    await act(async () => {
      deferred.resolve({ ok: false, browserUrl: "", sessionId: "" });
      await deferred.promise;
    });

    await act(async () => {
      tree!.unmount();
    });
  });

  it("releases lock after failed cloud login so retry can run", async () => {
    mockClient.cloudLogin
      .mockRejectedValueOnce(new Error("boom"))
      .mockRejectedValueOnce(new Error("boom-2"));

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
      await api!.handleCloudLogin();
    });
    await act(async () => {
      await api!.handleCloudLogin();
    });

    expect(mockClient.cloudLogin).toHaveBeenCalledTimes(2);

    await act(async () => {
      tree!.unmount();
    });
  });
});
