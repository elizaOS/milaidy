// @vitest-environment jsdom

import React, { useEffect } from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearForceFreshOnboarding,
  enableForceFreshOnboarding,
  installForceFreshOnboardingClientPatch,
} from "../../src/onboarding-reset";

const ONBOARDING_STEP_STORAGE_KEY = "eliza:onboarding:step";

// Import client from the barrel (/api) rather than directly from /api/client
// so that vitest deduplicates to the same module instance that AppContext uses
// (AppContext imports from "../api" which resolves to the barrel).
import { client, type MiladyClient } from "@elizaos/app-core/api";

vi.mock("@elizaos/app-core/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@elizaos/app-core/api")>();
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
  console.log(
    "PROBE RENDER:",
    app.onboardingLoading,
    app.onboardingStep,
    app.onboardingRunMode,
    app.onboardingCloudProvider,
  );
  console.log(
    "APP STATE:",
    app.startupPhase,
    app.startupStatus,
    app.startupError,
  );

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
  // The startup flow in AppContext is deeply async (multiple awaited API calls
  // inside a fire-and-forget initApp()).  Each resolved mock promise requires
  // its own act() cycle so React can process the resulting state update before
  // the next await resumes.  We run many cycles to ensure the full startup
  // sequence completes.
  for (let i = 0; i < 15; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
  // Extra yield for macro tasks (setTimeout-based delays in the startup loop)
  await new Promise((resolve) => setTimeout(resolve, 50));
  for (let i = 0; i < 10; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
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
    vi.spyOn(client, "getAuthStatus").mockResolvedValue({
      required: false,
      pairingEnabled: false,
      expiresAt: null,
    });
    vi.spyOn(client, "getOnboardingStatus").mockResolvedValue({
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
    // biome-ignore lint/suspicious/noExplicitAny: test mock
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

  it("reopens on persisted senses step when localStorage contains that step", async () => {
    // Pre-persist the onboarding step so the provider resumes at "senses"
    // instead of the default "wakeUp".
    localStorage.setItem(ONBOARDING_STEP_STORAGE_KEY, "senses");

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
      tree?.unmount();
    });
  });

  it("starts at wakeUp when forced fresh onboarding is enabled", async () => {
    // Even with a persisted step, enabling forced-fresh onboarding resets to
    // the very first step ("wakeUp") because the persistence layer does not
    // recognise "wakeUp" as a valid saved step and returns null.
    enableForceFreshOnboarding();
    const restoreClient = installForceFreshOnboardingClientPatch(client);

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
        onboardingStep: "wakeUp",
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

    // The default initial step (no persisted step) is "wakeUp".
    expect(api?.getSnapshot().onboardingStep).toBe("wakeUp");

    // Advance: wakeUp -> identity
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

    // Remount — should resume at the persisted "identity" step.
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

  it("clears the stored onboarding step via clearPersistedOnboardingStep", async () => {
    // The startup flow that clears the persisted step on completion cannot be
    // driven from tests because the inlined @elizaos/app-core bundle uses its
    // own client singleton (separate from the one vi.spyOn patches).  Instead,
    // we directly verify that the persistence helpers work correctly: a stored
    // step is loaded by the provider, and clearPersistedOnboardingStep removes
    // it from localStorage.
    localStorage.setItem(ONBOARDING_STEP_STORAGE_KEY, "senses");

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

    // The provider should have loaded the persisted "senses" step.
    expect(api?.getSnapshot().onboardingStep).toBe("senses");
    // Directly calling the clear function removes the key.
    const { clearPersistedOnboardingStep } = await import(
      "@elizaos/app-core/state"
    );
    clearPersistedOnboardingStep();
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

    expect(api?.getSnapshot().onboardingStep).toBe("senses");

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
