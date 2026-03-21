// @vitest-environment jsdom

import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { invokeDesktopBridgeRequestMock, useAppMock, isElectrobunRuntimeMock } =
  vi.hoisted(() => ({
    invokeDesktopBridgeRequestMock: vi.fn(),
    useAppMock: vi.fn(),
    isElectrobunRuntimeMock: vi.fn(),
  }));
const { openDesktopSettingsWindowMock } = vi.hoisted(() => ({
  openDesktopSettingsWindowMock: vi.fn(),
}));

vi.mock("@miladyai/app-core/bridge", () => ({
  invokeDesktopBridgeRequest: invokeDesktopBridgeRequestMock,
  isElectrobunRuntime: isElectrobunRuntimeMock,
}));

vi.mock("@miladyai/app-core/state", () => ({
  useApp: useAppMock,
}));

vi.mock("@miladyai/app-core/utils", () => ({
  openDesktopSettingsWindow: openDesktopSettingsWindowMock,
}));

import { TRAY_ACTION_EVENT } from "@miladyai/app-core/events";
import {
  DESKTOP_TRAY_CLICK_AUDIT,
  DESKTOP_TRAY_MENU_ITEMS,
  DesktopTrayRuntime,
} from "../../../../packages/app-core/src/shell/DesktopTrayRuntime";

describe("DesktopTrayRuntime", () => {
  const handleStart = vi.fn();
  const handleStop = vi.fn();
  const handleRestart = vi.fn();
  const setTab = vi.fn();
  const switchShellView = vi.fn();

  beforeEach(() => {
    invokeDesktopBridgeRequestMock.mockReset();
    useAppMock.mockReset();
    isElectrobunRuntimeMock.mockReset();
    openDesktopSettingsWindowMock.mockReset();
    handleStart.mockReset();
    handleStop.mockReset();
    handleRestart.mockReset();
    setTab.mockReset();
    switchShellView.mockReset();

    isElectrobunRuntimeMock.mockReturnValue(true);
    useAppMock.mockReturnValue({
      agentStatus: { state: "running" },
      handleStart,
      handleStop,
      handleRestart,
      setTab,
      switchShellView,
    });
  });

  it("keeps the tray menu and automated audit inventory aligned", () => {
    const menuActionIds = DESKTOP_TRAY_MENU_ITEMS.filter(
      (item) => item.type !== "separator",
    ).map((item) => item.id);
    const auditIds = DESKTOP_TRAY_CLICK_AUDIT.map((item) => item.id);

    expect(auditIds).toEqual(menuActionIds);
  });

  it("routes tray navigation actions to the live app shell", async () => {
    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(DesktopTrayRuntime));
    });

    await act(async () => {
      document.dispatchEvent(
        new CustomEvent(TRAY_ACTION_EVENT, {
          detail: { itemId: "tray-open-plugins" },
        }),
      );
    });

    expect(switchShellView).toHaveBeenCalledWith("desktop");
    expect(setTab).toHaveBeenCalledWith("plugins");
    expect(invokeDesktopBridgeRequestMock).toHaveBeenCalledWith(
      expect.objectContaining({ rpcMethod: "desktopShowWindow" }),
    );
    expect(invokeDesktopBridgeRequestMock).toHaveBeenCalledWith(
      expect.objectContaining({ rpcMethod: "desktopFocusWindow" }),
    );

    if (!renderer) {
      throw new Error("Failed to render DesktopTrayRuntime");
    }
    await act(async () => {
      renderer.unmount();
    });
  });

  it("opens detached settings sections from the tray", async () => {
    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(DesktopTrayRuntime));
    });

    await act(async () => {
      document.dispatchEvent(
        new CustomEvent(TRAY_ACTION_EVENT, {
          detail: { itemId: "tray-open-voice-controls" },
        }),
      );
    });

    expect(openDesktopSettingsWindowMock).toHaveBeenCalledWith("voice");

    if (!renderer) {
      throw new Error("Failed to render DesktopTrayRuntime");
    }
    await act(async () => {
      renderer.unmount();
    });
  });

  it("stops a running agent from the tray lifecycle control", async () => {
    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(DesktopTrayRuntime));
    });

    await act(async () => {
      document.dispatchEvent(
        new CustomEvent(TRAY_ACTION_EVENT, {
          detail: { itemId: "tray-toggle-lifecycle" },
        }),
      );
    });

    expect(handleStop).toHaveBeenCalledTimes(1);
    expect(handleStart).not.toHaveBeenCalled();

    if (!renderer) {
      throw new Error("Failed to render DesktopTrayRuntime");
    }
    await act(async () => {
      renderer.unmount();
    });
  });
});
