// @vitest-environment jsdom

import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { subscribeDesktopBridgeEventMock, useAppMock } = vi.hoisted(() => ({
  subscribeDesktopBridgeEventMock: vi.fn(),
  useAppMock: vi.fn(),
}));

vi.mock("@miladyai/app-core/bridge", () => ({
  subscribeDesktopBridgeEvent: subscribeDesktopBridgeEventMock,
  isElectrobunRuntime: () => true,
}));

vi.mock("@miladyai/app-core/state", () => ({
  useApp: useAppMock,
  CUSTOM_ONBOARDING_STEPS: [],
}));

import { DesktopSurfaceNavigationRuntime } from "../../../../packages/app-core/src/shell/DesktopSurfaceNavigationRuntime";

describe("DesktopSurfaceNavigationRuntime", () => {
  const setTab = vi.fn();
  const switchShellView = vi.fn();

  beforeEach(() => {
    setTab.mockReset();
    switchShellView.mockReset();
    subscribeDesktopBridgeEventMock.mockReset();
    useAppMock.mockReset();
    useAppMock.mockReturnValue({
      setTab,
      switchShellView,
    });
    subscribeDesktopBridgeEventMock.mockImplementation(({ listener }) => {
    (subscribeDesktopBridgeEventMock as any).listener = listener;
      return () => {};
    });
  });

  it("switches the main window to desktop shell for show-main surface requests", async () => {
    await act(async () => {
      TestRenderer.create(React.createElement(DesktopSurfaceNavigationRuntime));
    });

    const listener = (subscribeDesktopBridgeEventMock as any).listener as
      | ((payload: unknown) => void)
      | undefined;
    expect(listener).toBeTypeOf("function");

    listener?.({ itemId: "show-main:plugins" });

    expect(switchShellView).toHaveBeenCalledWith("desktop");
    expect(setTab).toHaveBeenCalledWith("plugins");
  });

  it("routes navigate actions to supported main-window tabs", async () => {
    await act(async () => {
      TestRenderer.create(React.createElement(DesktopSurfaceNavigationRuntime));
    });

    const listener = subscribeDesktopBridgeEventMock.listener as
      | ((payload: unknown) => void)
      | undefined;

    listener?.({ itemId: "navigate-plugins" });

    expect(switchShellView).toHaveBeenCalledWith("desktop");
    expect(setTab).toHaveBeenCalledWith("plugins");
  });

  it("ignores unrelated tray actions", async () => {
    await act(async () => {
      TestRenderer.create(React.createElement(DesktopSurfaceNavigationRuntime));
    });

    const listener = (subscribeDesktopBridgeEventMock as any).listener as
      | ((payload: unknown) => void)
      | undefined;
    listener?.({ itemId: "desktop-notify" });
    listener?.({ itemId: "show-main:cloud" });

    expect(switchShellView).not.toHaveBeenCalled();
    expect(setTab).not.toHaveBeenCalled();
  });
});
