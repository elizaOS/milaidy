// @vitest-environment jsdom

import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  invokeDesktopBridgeRequestMock,
  useAppMock,
  openDesktopSettingsWindowMock,
  openDesktopSurfaceWindowMock,
  loadDesktopWorkspaceSnapshotMock,
  isElectrobunRuntimeMock,
} = vi.hoisted(() => ({
  invokeDesktopBridgeRequestMock: vi.fn(),
  useAppMock: vi.fn(),
  openDesktopSettingsWindowMock: vi.fn(),
  openDesktopSurfaceWindowMock: vi.fn(),
  loadDesktopWorkspaceSnapshotMock: vi.fn(),
  isElectrobunRuntimeMock: vi.fn(),
}));

vi.mock("../bridge", () => ({
  invokeDesktopBridgeRequest: invokeDesktopBridgeRequestMock,
  isElectrobunRuntime: isElectrobunRuntimeMock,
}));

vi.mock("../state", () => ({
  useApp: useAppMock,
}));

vi.mock("../utils/clipboard", () => ({
  copyTextToClipboard: vi.fn(),
}));

vi.mock("../utils/desktop-workspace", async () => {
  const actual = await vi.importActual("../utils/desktop-workspace");
  return {
    ...actual,
    loadDesktopWorkspaceSnapshot: loadDesktopWorkspaceSnapshotMock,
    openDesktopSettingsWindow: openDesktopSettingsWindowMock,
    openDesktopSurfaceWindow: openDesktopSurfaceWindowMock,
  };
});

vi.mock("@miladyai/ui", () => ({
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) =>
    React.createElement("button", { type: "button", ...props }, children),
}));

vi.mock("lucide-react", () => ({
  Monitor: () => React.createElement("span", null, "monitor"),
  RefreshCw: () => React.createElement("span", null, "refresh"),
}));

import { DesktopWorkspaceSection } from "./DesktopWorkspaceSection";

function findButtonByText(
  root: TestRenderer.ReactTestInstance,
  text: string,
): TestRenderer.ReactTestInstance {
  const match = root.findAll(
    (node) =>
      node.type === "button" &&
      node.children.some(
        (child) => typeof child === "string" && child.includes(text),
      ),
  )[0];
  if (!match) {
    throw new Error(`Button "${text}" not found`);
  }
  return match;
}

describe("DesktopWorkspaceSection", () => {
  beforeEach(() => {
    invokeDesktopBridgeRequestMock.mockReset();
    useAppMock.mockReset();
    openDesktopSettingsWindowMock.mockReset();
    openDesktopSurfaceWindowMock.mockReset();
    loadDesktopWorkspaceSnapshotMock.mockReset();
    isElectrobunRuntimeMock.mockReset();

    isElectrobunRuntimeMock.mockReturnValue(true);
    useAppMock.mockReturnValue({
      relaunchDesktop: vi.fn(),
      restartBackend: vi.fn(),
    });
    loadDesktopWorkspaceSnapshotMock.mockResolvedValue({
      supported: true,
      version: { version: "1.0.0", name: "Milady", runtime: "electrobun" },
      packaged: false,
      autoLaunch: { enabled: false, openAsHidden: false },
      window: {
        bounds: { x: 0, y: 0, width: 800, height: 600 },
        maximized: false,
        minimized: false,
        visible: true,
        focused: true,
      },
      power: null,
      primaryDisplay: null,
      displays: [],
      cursor: null,
      clipboard: { text: "hello", hasImage: false, formats: ["text/plain"] },
      paths: { downloads: "/tmp" },
    });
  });

  it("opens detached settings and detached surfaces", async () => {
    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        React.createElement(DesktopWorkspaceSection),
      );
    });
    if (!renderer) {
      throw new Error("Failed to render DesktopWorkspaceSection");
    }
    const root = renderer.root;

    await act(async () => {
      findButtonByText(root, "Open Desktop Settings Window").props.onClick();
    });
    await act(async () => {
      findButtonByText(root, "Release Center").props.onClick();
    });

    expect(openDesktopSettingsWindowMock).toHaveBeenCalledWith("desktop");
    expect(openDesktopSurfaceWindowMock).toHaveBeenCalledWith("release");
  });

  it("toggles auto-launch through the typed bridge", async () => {
    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        React.createElement(DesktopWorkspaceSection),
      );
    });
    if (!renderer) {
      throw new Error("Failed to render DesktopWorkspaceSection");
    }
    const root = renderer.root;

    await act(async () => {
      findButtonByText(root, "Enable Auto-launch").props.onClick();
    });

    expect(invokeDesktopBridgeRequestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        rpcMethod: "desktopSetAutoLaunch",
        params: { enabled: true, openAsHidden: false },
      }),
    );
  });
});
