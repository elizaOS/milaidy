// @vitest-environment jsdom

import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { subscribeDesktopBridgeEventMock, useAppMock } = vi.hoisted(() => ({
  subscribeDesktopBridgeEventMock: vi.fn(),
  useAppMock: vi.fn(),
}));

vi.mock("@elizaos/app-core/bridge", () => ({
  subscribeDesktopBridgeEvent: subscribeDesktopBridgeEventMock,
}));

vi.mock("@elizaos/app-core/state", () => ({
  useApp: useAppMock,
}));

import { DesktopSurfaceNavigationRuntime } from "../../src/DesktopSurfaceNavigationRuntime";

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
      subscribeDesktopBridgeEventMock.listener = listener;
      return () => {};
    });
  });

  it("switches the main window to desktop shell for show-main surface requests", async () => {
    await act(async () => {
      TestRenderer.create(React.createElement(DesktopSurfaceNavigationRuntime));
    });

    const listener = subscribeDesktopBridgeEventMock.listener as
      | ((payload: unknown) => void)
      | undefined;
    expect(listener).toBeTypeOf("function");

    listener?.({ itemId: "show-main:plugins" });

    expect(switchShellView).toHaveBeenCalledWith("desktop");
    expect(setTab).toHaveBeenCalledWith("plugins");
  });

  it("ignores unrelated tray actions", async () => {
    await act(async () => {
      TestRenderer.create(React.createElement(DesktopSurfaceNavigationRuntime));
    });

    const listener = subscribeDesktopBridgeEventMock.listener as
      | ((payload: unknown) => void)
      | undefined;
    listener?.({ itemId: "navigate-plugins" });
    listener?.({ itemId: "show-main:cloud" });

    expect(switchShellView).not.toHaveBeenCalled();
    expect(setTab).not.toHaveBeenCalled();
  });
});
