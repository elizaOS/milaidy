// @vitest-environment jsdom
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
    getOnboardingStatus: vi.fn(async () => ({ complete: false })),
    getOnboardingOptions: vi.fn(async () => ({
      names: ["Milady"],
      styles: [],
      providers: [],
      cloudProviders: [],
      models: { small: [], large: [] },
      inventoryProviders: [],
      sharedStyleRules: "",
    })),
    listConversations: vi.fn(async () => ({ conversations: [] })),
    getConversationMessages: vi.fn(async () => ({ messages: [] })),
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
    getPermissions: vi.fn(async () => ({
      accessibility: {
        id: "accessibility",
        status: "granted",
        lastChecked: Date.now(),
        canRequest: false,
      },
      "screen-recording": {
        id: "screen-recording",
        status: "granted",
        lastChecked: Date.now(),
        canRequest: false,
      },
      microphone: {
        id: "microphone",
        status: "granted",
        lastChecked: Date.now(),
        canRequest: false,
      },
      camera: {
        id: "camera",
        status: "granted",
        lastChecked: Date.now(),
        canRequest: false,
      },
      shell: {
        id: "shell",
        status: "granted",
        lastChecked: Date.now(),
        canRequest: false,
      },
    })),
    submitOnboarding: vi.fn(async () => ({ ok: true })),
    restartAgent: vi.fn(async () => ({
      state: "running",
      agentName: "Milady",
      model: undefined,
      startedAt: undefined,
      uptime: undefined,
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
  handleOnboardingNext: (options?: {
    allowPermissionBypass?: boolean;
  }) => Promise<void>;
  hasOnboardingOptions: () => boolean;
  getOnboardingStep: () => string;
};

function Probe(props: { onReady: (api: ProbeApi) => void }) {
  const { onReady } = props;
  const app = useApp();

  useEffect(() => {
    onReady({
      handleOnboardingNext: app.handleOnboardingNext,
      hasOnboardingOptions: () => Boolean(app.onboardingOptions),
      getOnboardingStep: () => app.onboardingStep,
    });
  }, [app, onReady]);

  return null;
}

function permissionState(
  status:
    | "granted"
    | "denied"
    | "not-determined"
    | "restricted"
    | "not-applicable",
  canRequest = false,
) {
  return { status, canRequest, lastChecked: Date.now() };
}

async function advanceToPermissions(getApi: () => ProbeApi) {
  for (let i = 0; i < 20; i += 1) {
    if (getApi().getOnboardingStep() === "permissions") return;
    await act(async () => {
      await getApi().handleOnboardingNext();
    });
  }
  throw new Error("Failed to reach permissions onboarding step");
}

async function waitForOnboardingOptions(getApi: () => ProbeApi) {
  for (let i = 0; i < 20; i += 1) {
    if (getApi().hasOnboardingOptions()) return;
    await act(async () => {
      await Promise.resolve();
    });
  }
  throw new Error("Onboarding options did not load");
}

describe("onboarding finish locking", () => {
  beforeEach(() => {
    Object.assign(window.location, { protocol: "file:", pathname: "/chat" });
    Object.assign(window, {
      setTimeout: globalThis.setTimeout,
      clearTimeout: globalThis.clearTimeout,
      setInterval: globalThis.setInterval,
      clearInterval: globalThis.clearInterval,
      alert: vi.fn(),
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
    mockClient.getOnboardingStatus.mockResolvedValue({ complete: false });
    mockClient.getOnboardingOptions.mockResolvedValue({
      names: ["Milady"],
      styles: [],
      providers: [],
      cloudProviders: [],
      models: { small: [], large: [] },
      inventoryProviders: [],
      sharedStyleRules: "",
    });
    mockClient.listConversations.mockResolvedValue({ conversations: [] });
    mockClient.getConversationMessages.mockResolvedValue({ messages: [] });
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
    mockClient.getPermissions.mockResolvedValue({
      accessibility: { id: "accessibility", ...permissionState("granted") },
      "screen-recording": {
        id: "screen-recording",
        ...permissionState("granted"),
      },
      microphone: { id: "microphone", ...permissionState("granted") },
      camera: { id: "camera", ...permissionState("granted") },
      shell: { id: "shell", ...permissionState("granted") },
    });
    mockClient.submitOnboarding.mockResolvedValue({ ok: true });
    mockClient.restartAgent.mockResolvedValue({
      state: "running",
      agentName: "Milady",
      model: undefined,
      startedAt: undefined,
      uptime: undefined,
    });
  });

  it("allows only one same-tick onboarding finish submit", async () => {
    const deferred = createDeferred<{ ok: true }>();
    mockClient.submitOnboarding.mockReturnValue(deferred.promise);

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
    const requireApi = () => {
      if (!api) throw new Error("onboarding probe API was not initialized");
      return api;
    };

    await waitForOnboardingOptions(requireApi);
    await advanceToPermissions(requireApi);

    await act(async () => {
      void api?.handleOnboardingNext();
      void api?.handleOnboardingNext();
    });

    expect(mockClient.submitOnboarding).toHaveBeenCalledTimes(1);

    await act(async () => {
      deferred.resolve({ ok: true });
      await deferred.promise;
    });

    await act(async () => {
      tree?.unmount();
    });
  });

  it("releases lock after failed onboarding finish so retry can run", async () => {
    mockClient.submitOnboarding
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
    const requireApi = () => {
      if (!api) throw new Error("onboarding probe API was not initialized");
      return api;
    };

    await waitForOnboardingOptions(requireApi);
    await advanceToPermissions(requireApi);

    await act(async () => {
      await api?.handleOnboardingNext();
    });
    await act(async () => {
      await api?.handleOnboardingNext();
    });

    expect(mockClient.submitOnboarding).toHaveBeenCalledTimes(2);

    await act(async () => {
      tree?.unmount();
    });
  });

  it("requires permissions check before finishing unless user explicitly skips", async () => {
    mockClient.getPermissions.mockResolvedValue({
      accessibility: { id: "accessibility", ...permissionState("granted") },
      "screen-recording": {
        id: "screen-recording",
        ...permissionState("denied", true),
      },
      microphone: { id: "microphone", ...permissionState("granted") },
      camera: { id: "camera", ...permissionState("granted") },
      shell: { id: "shell", ...permissionState("granted") },
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
    const requireApi = () => {
      if (!api) throw new Error("onboarding probe API was not initialized");
      return api;
    };

    await waitForOnboardingOptions(requireApi);
    await advanceToPermissions(requireApi);

    await act(async () => {
      await api?.handleOnboardingNext();
    });
    expect(mockClient.submitOnboarding).not.toHaveBeenCalled();

    await act(async () => {
      await api?.handleOnboardingNext({ allowPermissionBypass: true });
    });
    expect(mockClient.submitOnboarding).toHaveBeenCalledTimes(1);

    await act(async () => {
      tree?.unmount();
    });
  });
});
