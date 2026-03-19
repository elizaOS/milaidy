// @vitest-environment jsdom

import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { ELIZA_TOOLS_OAUTH_PROVIDER } from "../../src/onboarding-auth";

const { useAppMock } = vi.hoisted(() => ({
  useAppMock: vi.fn(),
}));

const { getCloudStatusMock } = vi.hoisted(() => ({
  getCloudStatusMock: vi.fn(async () => ({
    enabled: false,
    connected: false,
    hasApiKey: false,
  })),
}));

vi.mock("@elizaos/app-core/state", () => ({
  useApp: useAppMock,
}));

vi.mock("@elizaos/app-core/api", () => ({
  client: {
    getCloudStatus: getCloudStatusMock,
  },
}));

vi.mock("@milady/upstream-app-core-connection-step", () => ({
  ConnectionStep: () =>
    React.createElement("div", null, "Upstream Connection Step"),
}));

import { ConnectionStep } from "../../src/components/ConnectionStep";

function createAppState(overrides: Record<string, unknown> = {}) {
  const app: Record<string, unknown> = {
    elizaCloudConnected: false,
    elizaCloudLoginBusy: false,
    elizaCloudLoginError: "",
    handleCloudLogin: vi.fn(),
    handleOnboardingBack: vi.fn(),
    handleOnboardingNext: vi.fn(async () => undefined),
    onboardingProvider: "",
    onboardingRemoteConnected: false,
    onboardingRunMode: "local",
    setState: vi.fn((key: string, value: unknown) => {
      app[key] = value;
    }),
    t: (key: string) =>
      (
        ({
          "onboarding.back": "Back",
          "onboarding.confirm": "Confirm",
          "onboarding.connectAccount": "Connect account",
          "onboarding.connected": "Connected",
          "onboarding.connecting": "Connecting...",
          "onboarding.neuralLinkTitle": "Neural Link",
        }) as Record<string, string>
      )[key] ?? key,
    ...overrides,
  };

  return app;
}

describe("ConnectionStep override", () => {
  it("shows the Eliza account connect flow before provider selection in local onboarding", async () => {
    const app = createAppState();
    useAppMock.mockReturnValue(app);

    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(ConnectionStep));
    });
    const text = JSON.stringify(tree.toJSON());

    expect(text).toContain("Connect your Eliza account");
    expect(text).toContain("Choose a model provider");
    expect(text).not.toContain("Upstream Connection Step");

    await act(async () => {
      tree.unmount();
    });
  });

  it("falls back to the upstream provider picker when requested", async () => {
    const app = createAppState();
    useAppMock.mockReturnValue(app);

    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(ConnectionStep));
    });
    const chooseProviderButton = tree.root
      .findAllByType("button")
      .find((button) => button.props.children === "Choose a model provider");

    expect(chooseProviderButton).toBeDefined();

    await act(async () => {
      chooseProviderButton?.props.onClick();
    });

    expect(JSON.stringify(tree.toJSON())).toContain("Upstream Connection Step");

    await act(async () => {
      tree.unmount();
    });
  });

  it("continues with an account-only Eliza connection without forcing provider setup", async () => {
    const app = createAppState({
      elizaCloudConnected: true,
    });
    useAppMock.mockReturnValue(app);

    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(ConnectionStep));
    });
    const confirmButton = tree.root
      .findAllByType("button")
      .find((button) => button.props.children === "Confirm");

    expect(confirmButton).toBeDefined();

    await act(async () => {
      confirmButton?.props.onClick();
      await Promise.resolve();
    });

    expect(app.setState).toHaveBeenCalledWith(
      "onboardingProvider",
      ELIZA_TOOLS_OAUTH_PROVIDER,
    );
    expect(app.setState).toHaveBeenCalledWith("onboardingApiKey", "");
    expect(app.handleOnboardingNext).toHaveBeenCalledTimes(1);

    await act(async () => {
      tree.unmount();
    });
  });

  it("uses persisted cloud auth status so onboarding does not ask to reconnect after restart", async () => {
    getCloudStatusMock.mockResolvedValueOnce({
      enabled: false,
      connected: false,
      hasApiKey: true,
    });

    const app = createAppState({
      elizaCloudConnected: false,
    });
    useAppMock.mockReturnValue(app);

    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(ConnectionStep));
      await Promise.resolve();
    });

    const confirmButton = tree.root
      .findAllByType("button")
      .find((button) => button.props.children === "Confirm");

    expect(confirmButton).toBeDefined();
    expect(confirmButton?.props.disabled).toBe(false);

    await act(async () => {
      tree.unmount();
    });
  });
});
