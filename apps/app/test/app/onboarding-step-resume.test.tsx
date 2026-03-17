// @vitest-environment jsdom

import React, { useEffect } from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const ONBOARDING_STEP_STORAGE_KEY = "milady:onboarding:step";

const { mockClient } = vi.hoisted(() => ({
  mockClient: {
    hasToken: vi.fn(() => false),
    setToken: vi.fn(),
    getAuthStatus: vi.fn(async () => ({
      required: false,
      pairingEnabled: false,
      expiresAt: null,
    })),
    getOnboardingStatus: vi.fn(async () => ({ complete: false })),
    getOnboardingOptions: vi.fn(async () => ({
      names: ["Milady"],
      styles: [
        {
          catchphrase: "chaotic",
          hint: "chaotic good",
          bio: ["bio"],
          system: "You are {{name}}",
          style: { all: ["all"], chat: ["chat"], post: ["post"] },
          adjectives: ["curious"],
          postExamples: ["example"],
          messageExamples: [[{ name: "Milady", content: { text: "hello" } }]],
        },
      ],
      providers: [],
      cloudProviders: [],
      models: { small: [], large: [] },
      sharedStyleRules: "",
    })),
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
      agentName: "Milady",
      model: undefined,
      startedAt: undefined,
      uptime: undefined,
    })),
    restartAgent: vi.fn(async () => ({
      state: "running",
      agentName: "Milady",
      model: undefined,
      startedAt: undefined,
      uptime: undefined,
    })),
    getWalletAddresses: vi.fn(async () => null),
    getConfig: vi.fn(async () => ({})),
    submitOnboarding: vi.fn(async () => undefined),
    getCloudStatus: vi.fn(async () => ({ enabled: false, connected: false })),
    getCodingAgentStatus: vi.fn(async () => null),
    getWorkbenchOverview: vi.fn(async () => ({
      tasks: [],
      triggers: [],
      todos: [],
    })),
  },
}));

vi.mock("@miladyai/app-core/api", () => ({
  client: mockClient,
  SkillScanReportSummary: {},
}));

import type { OnboardingStep } from "@miladyai/app-core/state";
import { AppProvider, useApp } from "@miladyai/app-core/state";

type ProbeApi = {
  getSnapshot: () => {
    onboardingLoading: boolean;
    onboardingStep: OnboardingStep;
    onboardingRunMode: "local" | "cloud" | "";
    onboardingCloudProvider: string;
  };
  next: (options?: { allowPermissionBypass?: boolean }) => Promise<void>;
};

function Probe({ onReady }: { onReady: (api: ProbeApi) => void }) {
  const app = useApp();

  useEffect(() => {
    onReady({
      getSnapshot: () => ({
        onboardingLoading: app.onboardingLoading,
        onboardingStep: app.onboardingStep,
        onboardingRunMode: app.onboardingRunMode,
        onboardingCloudProvider: app.onboardingCloudProvider,
      }),
      next: (options) => app.handleOnboardingNext(options),
    });
  }, [app, onReady]);

  return null;
}

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
  });
  await act(async () => {
    await Promise.resolve();
  });
  await act(async () => {
    await Promise.resolve();
  });
}

describe("AppProvider onboarding step resume", () => {
  beforeEach(() => {
    Object.assign(window, {
      clearInterval: globalThis.clearInterval,
      clearTimeout: globalThis.clearTimeout,
      setInterval: globalThis.setInterval,
      setTimeout: globalThis.setTimeout,
    });
    Object.assign(document.documentElement, { setAttribute: vi.fn() });
    localStorage.clear();

    for (const fn of Object.values(mockClient)) {
      if (typeof fn === "function" && "mockReset" in fn) {
        (fn as { mockReset: () => void }).mockReset();
      }
    }

    mockClient.hasToken.mockReturnValue(false);
    mockClient.setToken.mockImplementation(() => {});
    mockClient.getAuthStatus.mockResolvedValue({
      required: false,
      pairingEnabled: false,
      expiresAt: null,
    });
    mockClient.getOnboardingStatus.mockResolvedValue({ complete: false });
    mockClient.getOnboardingOptions.mockResolvedValue({
      names: ["Milady"],
      styles: [
        {
          catchphrase: "chaotic",
          hint: "chaotic good",
          bio: ["bio"],
          system: "You are {{name}}",
          style: { all: ["all"], chat: ["chat"], post: ["post"] },
          adjectives: ["curious"],
          postExamples: ["example"],
          messageExamples: [[{ name: "Milady", content: { text: "hello" } }]],
        },
      ],
      providers: [],
      cloudProviders: [],
      models: { small: [], large: [] },
      sharedStyleRules: "",
    });
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
    mockClient.restartAgent.mockResolvedValue({
      state: "running",
      agentName: "Milady",
      model: undefined,
      startedAt: undefined,
      uptime: undefined,
    });
    mockClient.getWalletAddresses.mockResolvedValue(null);
    mockClient.getConfig.mockResolvedValue({});
    mockClient.submitOnboarding.mockResolvedValue(undefined);
    mockClient.getCloudStatus.mockResolvedValue({
      enabled: false,
      connected: false,
    });
    mockClient.getCodingAgentStatus.mockResolvedValue(null);
    mockClient.getWorkbenchOverview.mockResolvedValue({
      tasks: [],
      triggers: [],
      todos: [],
    });
  });

  it("reopens on senses when partial onboarding connection config already exists", async () => {
    mockClient.getConfig.mockResolvedValue({
      cloud: { enabled: true, apiKey: "sk-test" },
    });

    let api: ProbeApi | null = null;
    let tree: TestRenderer.ReactTestRenderer | null = null;

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
    await flushEffects();

    expect(api?.getSnapshot()).toEqual({
      onboardingLoading: false,
      onboardingStep: "senses",
      onboardingRunMode: "cloud",
      onboardingCloudProvider: "elizacloud",
    });

    await act(async () => {
      tree?.unmount();
    });
  });

  it("persists the current onboarding step across quit and reopen", async () => {
    let api: ProbeApi | null = null;
    let tree: TestRenderer.ReactTestRenderer | null = null;

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
    await flushEffects();

    expect(api?.getSnapshot().onboardingStep).toBe("wakeUp");

    await act(async () => {
      await api?.next();
    });

    expect(localStorage.getItem(ONBOARDING_STEP_STORAGE_KEY)).toBe("identity");
    expect(api?.getSnapshot().onboardingStep).toBe("identity");

    await act(async () => {
      tree?.unmount();
    });

    api = null;
    tree = null;

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
    await flushEffects();

    expect(api?.getSnapshot()).toEqual({
      onboardingLoading: false,
      onboardingStep: "identity",
      onboardingRunMode: "",
      onboardingCloudProvider: "",
    });

    await act(async () => {
      tree?.unmount();
    });
  });

  it("clears the stored onboarding step once onboarding is complete", async () => {
    localStorage.setItem(ONBOARDING_STEP_STORAGE_KEY, "senses");
    mockClient.getOnboardingStatus.mockResolvedValue({ complete: true });

    let tree: TestRenderer.ReactTestRenderer | null = null;

    await act(async () => {
      tree = TestRenderer.create(React.createElement(AppProvider, null));
    });
    await flushEffects();

    expect(localStorage.getItem(ONBOARDING_STEP_STORAGE_KEY)).toBeNull();

    await act(async () => {
      tree?.unmount();
    });
  });

  it("submits the resumed onboarding connection from senses without forcing reconnection", async () => {
    mockClient.getConfig.mockResolvedValue({
      cloud: {
        enabled: true,
        apiKey: "[REDACTED]",
      },
      models: {
        small: "openai/gpt-5-mini",
        large: "anthropic/claude-sonnet-4.5",
      },
    });

    let api: ProbeApi | null = null;
    let tree: TestRenderer.ReactTestRenderer | null = null;

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
    await flushEffects();

    expect(api?.getSnapshot().onboardingStep).toBe("senses");

    await act(async () => {
      await api?.next({ allowPermissionBypass: true });
    });
    await flushEffects();

    expect(mockClient.submitOnboarding).toHaveBeenCalledWith(
      expect.objectContaining({
        connection: {
          kind: "cloud-managed",
          cloudProvider: "elizacloud",
          apiKey: undefined,
          smallModel: "openai/gpt-5-mini",
          largeModel: "anthropic/claude-sonnet-4.5",
        },
      }),
    );

    await act(async () => {
      tree?.unmount();
    });
  });
});
