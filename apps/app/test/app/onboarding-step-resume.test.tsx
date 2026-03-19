// @vitest-environment jsdom

import React, { useEffect } from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { installLocalProviderCloudPreferencePatch } from "../../src/cloud-preference-patch";
import {
  clearForceFreshOnboarding,
  enableForceFreshOnboarding,
  installForceFreshOnboardingClientPatch,
} from "../../src/onboarding-reset";

const ONBOARDING_STEP_STORAGE_KEY = "eliza:onboarding:step";

import { client, type MiladyClient } from "@elizaos/app-core/api/client";

// We use vi.spyOn against the real client singleton instead of a module mock,
// because AppContext imports client via a relative path that vi.mock might not intercept.
vi.mock("@elizaos/app-core/api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@elizaos/app-core/api/client")>();
  return {
    ...actual,
    SkillScanReportSummary: {},
  };
});

import type { OnboardingStep } from "@elizaos/app-core/state";
import { AppProvider, useApp } from "@elizaos/app-core/state";

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
  console.log("PROBE RENDER:", app.onboardingLoading, app.onboardingStep, app.onboardingRunMode, app.onboardingCloudProvider);
  console.log("APP STATE:", app.startupPhase, app.startupStatus, app.startupError);

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
  // Extra yield for macro tasks
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("AppProvider onboarding step resume", () => {
  let getAuthStatusSpy: any;
  let getOnboardingStatusSpy: any;

  beforeEach(() => {
    Object.assign(window, {
      clearInterval: globalThis.clearInterval,
      clearTimeout: globalThis.clearTimeout,
      setInterval: globalThis.setInterval,
      setTimeout: globalThis.setTimeout,
    });
    Object.assign(document.documentElement, { setAttribute: vi.fn() });
    localStorage.clear();
    (window as unknown as Record<string, unknown>).__MILADY_API_BASE__ =
      "https://api.elizacloud.ai";
    sessionStorage.setItem("eliza:api_base", "https://api.elizacloud.ai");

    // Reset all spies on the client
    for (const key of Object.keys(client) as Array<keyof MiladyClient>) {
      const fn = client[key];
      if (typeof fn === "function" && "mockRestore" in fn) {
        (fn as { mockRestore: () => void }).mockRestore();
      }
    }

    vi.spyOn(client, "hasToken").mockReturnValue(false);
    vi.spyOn(client, "setToken").mockImplementation(() => {});
    getAuthStatusSpy = vi.spyOn(client, "getAuthStatus").mockResolvedValue({
      required: false,
      pairingEnabled: false,
      expiresAt: null,
    });
    getOnboardingStatusSpy = vi.spyOn(client, "getOnboardingStatus").mockResolvedValue({
      complete: false,
    });
    vi.spyOn(client, "getOnboardingOptions").mockResolvedValue({
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
          messageExamples: [[{ user: "Milady", content: { text: "hello" } }]],
        },
      ],
      providers: [],
      inventoryProviders: [],
      cloudProviders: [],
      models: { small: [], large: [] },
      sharedStyleRules: "",
    });
    vi.spyOn(client, "listConversations").mockResolvedValue({
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
    vi.spyOn(client, "getConversationMessages").mockResolvedValue({
      messages: [
        {
          id: "msg-1",
          role: "assistant",
          text: "hello",
          timestamp: Date.now(),
        },
      ],
    });
    vi.spyOn(client, "sendWsMessage").mockImplementation(() => {});
    vi.spyOn(client, "connectWs").mockImplementation(() => {});
    vi.spyOn(client, "disconnectWs").mockImplementation(() => {});
    vi.spyOn(client, "onWsEvent").mockReturnValue(() => {});
    vi.spyOn(client, "getAgentEvents").mockResolvedValue({
      events: [],
      latestEventId: null,
      totalBuffered: 0,
      replayed: false,
    });
    vi.spyOn(client, "getStatus").mockResolvedValue({
      state: "running",
      agentName: "Milady",
      model: undefined,
      startedAt: undefined,
      uptime: undefined,
    });
    vi.spyOn(client, "restartAgent").mockResolvedValue({
      state: "running",
      agentName: "Milady",
      model: undefined,
      startedAt: undefined,
      uptime: undefined,
    });
    vi.spyOn(client, "getWalletAddresses").mockResolvedValue(null as any);
    vi.spyOn(client, "getConfig").mockResolvedValue({});
    vi.spyOn(client, "submitOnboarding").mockResolvedValue(undefined);
    vi.spyOn(client, "getCloudStatus").mockResolvedValue({
      enabled: false,
      connected: false,
    });
    vi.spyOn(client, "getCodingAgentStatus").mockResolvedValue(null);
    vi.spyOn(client, "getWorkbenchOverview").mockResolvedValue({
      tasks: [],
      triggers: [],
      todos: [],
    });
    clearForceFreshOnboarding();
  });

  it("reopens on senses when partial onboarding connection config already exists", async () => {
    const getConfigSpy = vi.spyOn(client, "getConfig").mockResolvedValue({
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
    console.log("TEST FINISH, SPY CALLS:", getAuthStatusSpy.mock.calls.length, getOnboardingStatusSpy.mock.calls.length, getConfigSpy.mock.calls.length);
    expect(api!.getSnapshot()).toEqual({
      onboardingLoading: false,
      onboardingStep: "senses",
      onboardingRunMode: "cloud",
      onboardingCloudProvider: "elizacloud",
    });

    await act(async () => {
      tree?.unmount();
    });
  });

  it("prefers the saved Claude subscription over stale cloud api key resume state", async () => {
    mockClient.getConfig.mockResolvedValue({
      cloud: {
        enabled: false,
        apiKey: "eliza-stale-key",
        inferenceMode: "byok",
      },
      agents: {
        defaults: {
          subscriptionProvider: "anthropic-subscription",
          model: { primary: "anthropic" },
        },
      },
      models: {
        small: "moonshotai/kimi-k2-turbo",
        large: "moonshotai/kimi-k2-0905",
      },
    });
    mockClient.getCloudStatus.mockResolvedValue({
      enabled: false,
      connected: true,
      hasApiKey: true,
    });

    const restoreCloudPreferencePatch =
      installLocalProviderCloudPreferencePatch(mockClient);

    let api: ProbeApi | null = null;
    let tree: TestRenderer.ReactTestRenderer | null = null;

    try {
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
        onboardingRunMode: "local",
        onboardingCloudProvider: "",
      });
    } finally {
      restoreCloudPreferencePatch();
      await act(async () => {
        tree?.unmount();
      });
    }
  });

  it("keeps account-only Eliza auth on the connection step without forcing cloud mode", async () => {
    localStorage.setItem(ONBOARDING_STEP_STORAGE_KEY, "connection");
    mockClient.getConfig.mockResolvedValue({
      cloud: {
        enabled: false,
        apiKey: "eliza-account-key",
        provider: "elizacloud",
        inferenceMode: "byok",
      },
    });
    mockClient.getCloudStatus.mockResolvedValue({
      enabled: false,
      connected: true,
      hasApiKey: true,
    });

    const restoreCloudPreferencePatch =
      installLocalProviderCloudPreferencePatch(mockClient);

    let api: ProbeApi | null = null;
    let tree: TestRenderer.ReactTestRenderer | null = null;

    try {
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
        onboardingStep: "connection",
        onboardingRunMode: "",
        onboardingCloudProvider: "",
      });
    } finally {
      restoreCloudPreferencePatch();
      await act(async () => {
        tree?.unmount();
      });
    }
  });

  it("starts at identity when forced fresh onboarding is enabled", async () => {
    mockClient.getConfig.mockResolvedValue({
      cloud: { enabled: true, apiKey: "sk-test" },
    });
    mockClient.getOnboardingStatus.mockResolvedValue({ complete: true });

    enableForceFreshOnboarding();
    const restoreClient = installForceFreshOnboardingClientPatch(mockClient);

    let api: ProbeApi | null = null;
    let tree: TestRenderer.ReactTestRenderer | null = null;

    try {
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
    } finally {
      restoreClient();
      clearForceFreshOnboarding();
      await act(async () => {
        tree?.unmount();
      });
    }
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

    expect(api!.getSnapshot().onboardingStep).toBe("identity");

    await act(async () => {
      await api?.next();
    });

    expect(localStorage.getItem(ONBOARDING_STEP_STORAGE_KEY)).toBe(
      "connection",
    );
    expect(api!.getSnapshot().onboardingStep).toBe("connection");

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

    expect(api!.getSnapshot()).toEqual({
      onboardingLoading: false,
      onboardingStep: "connection",
      onboardingRunMode: "",
      onboardingCloudProvider: "",
    });

    await act(async () => {
      tree?.unmount();
    });
  });

  it("clears the stored onboarding step once onboarding is complete", async () => {
    localStorage.setItem(ONBOARDING_STEP_STORAGE_KEY, "senses");
    vi.spyOn(client, "getOnboardingStatus").mockResolvedValue({ complete: true });

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

  // TODO: upstream app-core startup flow no longer calls submitOnboarding
  // synchronously during the senses→finish transition in test env. The
  // connection ref isn't populated in time because the backend poll loop
  // doesn't complete within flushEffects(). Re-enable once the upstream
  // test utilities support awaiting the full startup lifecycle.
  it.skip("submits the resumed onboarding connection from senses without forcing reconnection", async () => {
    vi.spyOn(client, "getConfig").mockResolvedValue({
      cloud: {
        enabled: true,
        apiKey: "[REDACTED]",
      },
      models: {
        small: "openai/gpt-5-mini",
        large: "anthropic/claude-sonnet-4.5",
      },
    });
    vi.spyOn(client, "restartAgent").mockResolvedValue({
      state: "running",
      agentName: "Milady",
      model: undefined,
      startedAt: undefined,
      uptime: undefined,
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
    // Extra flush cycles so the startup effect completes and sets the
    // onboardingResumeConnectionRef before we advance the step.
    await flushEffects();
    await flushEffects();

    expect(api!.getSnapshot().onboardingStep).toBe("senses");

    await act(async () => {
      await api?.next({ allowPermissionBypass: true });
    });
    await flushEffects();
    await flushEffects();

    expect(client.submitOnboarding).toHaveBeenCalledWith(
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
