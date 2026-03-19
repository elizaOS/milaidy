// @vitest-environment jsdom

import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { invokeDesktopBridgeRequestMock, isElectrobunRuntimeMock, useAppMock } =
  vi.hoisted(() => ({
    invokeDesktopBridgeRequestMock: vi.fn(),
    isElectrobunRuntimeMock: vi.fn(),
    useAppMock: vi.fn(),
  }));

vi.mock("@elizaos/app-core/bridge", () => ({
  invokeDesktopBridgeRequest: invokeDesktopBridgeRequestMock,
  isElectrobunRuntime: isElectrobunRuntimeMock,
}));

vi.mock("@elizaos/app-core/state", () => ({
  useApp: useAppMock,
}));

import { DesktopOnboardingRuntime } from "../../src/DesktopOnboardingRuntime";

describe("DesktopOnboardingRuntime", () => {
  beforeEach(() => {
    invokeDesktopBridgeRequestMock.mockReset();
    isElectrobunRuntimeMock.mockReset();
    useAppMock.mockReset();
    invokeDesktopBridgeRequestMock.mockResolvedValue({ shown: true });
    isElectrobunRuntimeMock.mockReturnValue(true);
    useAppMock.mockReturnValue({
      onboardingLoading: false,
      onboardingStep: "senses",
    });
  });

  it("shows the one-time background notice when onboarding reaches system access", async () => {
    let tree: TestRenderer.ReactTestRenderer | null = null;

    await act(async () => {
      tree = TestRenderer.create(React.createElement(DesktopOnboardingRuntime));
    });

    expect(invokeDesktopBridgeRequestMock).toHaveBeenCalledWith({
      rpcMethod: "desktopShowBackgroundNotice",
      ipcChannel: "desktop:showBackgroundNotice",
    });

    await act(async () => {
      tree?.unmount();
    });
  });

  it("does not request the notice outside desktop system-access onboarding", async () => {
    useAppMock.mockReturnValue({
      onboardingLoading: false,
      onboardingStep: "identity",
    });

    await act(async () => {
      TestRenderer.create(React.createElement(DesktopOnboardingRuntime));
    });

    expect(invokeDesktopBridgeRequestMock).not.toHaveBeenCalled();

    isElectrobunRuntimeMock.mockReturnValue(false);
    useAppMock.mockReturnValue({
      onboardingLoading: false,
      onboardingStep: "senses",
    });

    await act(async () => {
      TestRenderer.create(React.createElement(DesktopOnboardingRuntime));
    });

    expect(invokeDesktopBridgeRequestMock).not.toHaveBeenCalled();
  });
});
