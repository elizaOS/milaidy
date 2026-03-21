// @vitest-environment jsdom

import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  invokeDesktopBridgeRequestMock,
  isElectrobunRuntimeMock,
  subscribeDesktopBridgeEventMock,
  useAppMock,
  openDesktopSurfaceWindowMock,
} = vi.hoisted(() => ({
  invokeDesktopBridgeRequestMock: vi.fn(),
  isElectrobunRuntimeMock: vi.fn(),
  subscribeDesktopBridgeEventMock: vi.fn(() => vi.fn()),
  useAppMock: vi.fn(),
  openDesktopSurfaceWindowMock: vi.fn(),
}));

vi.mock("../bridge", () => ({
  invokeDesktopBridgeRequest: invokeDesktopBridgeRequestMock,
  isElectrobunRuntime: isElectrobunRuntimeMock,
  subscribeDesktopBridgeEvent: subscribeDesktopBridgeEventMock,
}));

vi.mock("../state", () => ({
  useApp: useAppMock,
}));

vi.mock("../utils/desktop-workspace", () => ({
  openDesktopSurfaceWindow: openDesktopSurfaceWindowMock,
}));

vi.mock("@miladyai/ui", () => ({
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) =>
    React.createElement("button", { type: "button", ...props }, children),
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) =>
    React.createElement("input", props),
}));

import { ReleaseCenterView } from "./ReleaseCenterView";

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

describe("ReleaseCenterView", () => {
  beforeEach(() => {
    invokeDesktopBridgeRequestMock.mockReset();
    isElectrobunRuntimeMock.mockReset();
    subscribeDesktopBridgeEventMock.mockReset().mockReturnValue(vi.fn());
    useAppMock.mockReset();
    openDesktopSurfaceWindowMock.mockReset();

    isElectrobunRuntimeMock.mockReturnValue(true);
    useAppMock.mockReturnValue({
      loadUpdateStatus: vi.fn(() => Promise.resolve()),
      updateLoading: false,
      updateStatus: {
        currentVersion: "1.0.0",
        channel: "stable",
        installMethod: "npm",
        updateAvailable: false,
        latestVersion: null,
        channels: { stable: "1.0.0", canary: null, dev: null },
        distTags: { stable: "latest", canary: "canary", dev: "dev" },
        lastCheckAt: null,
        error: null,
      },
    });

    invokeDesktopBridgeRequestMock.mockImplementation(
      async ({ rpcMethod }: { rpcMethod: string }) => {
        switch (rpcMethod) {
          case "desktopGetUpdaterState":
            return {
              currentVersion: "1.0.0",
              updateAvailable: false,
              updateReady: false,
              latestVersion: null,
              baseUrl: "https://milady.ai/releases/",
              lastStatus: null,
            };
          case "desktopGetBuildInfo":
            return {
              platform: "darwin",
              arch: "arm64",
              defaultRenderer: "native",
              availableRenderers: ["native", "cef"],
              bunVersion: "1.2.3",
            };
          case "desktopGetDockIconVisibility":
            return { visible: true };
          case "desktopGetWebGpuBrowserStatus":
            return {
              available: false,
              reason: "Renderer WebGPU unavailable in test.",
              renderer: "native",
              chromeBetaPath: null,
              downloadUrl: null,
            };
          case "desktopGetSessionSnapshot":
            return {
              partition: "persist:default",
              persistent: true,
              cookieCount: 0,
              cookies: [],
            };
          case "desktopOpenReleaseNotesWindow":
            return {
              url: "https://milady.ai/releases/v2",
              windowId: 12,
              webviewId: 34,
            };
          default:
            return null;
        }
      },
    );
  });

  it("hydrates desktop release state and opens both release surfaces", async () => {
    let renderer: TestRenderer.ReactTestRenderer | undefined;

    await act(async () => {
      renderer = TestRenderer.create(React.createElement(ReleaseCenterView));
    });

    if (!renderer) {
      throw new Error("ReleaseCenterView did not render");
    }

    expect(invokeDesktopBridgeRequestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        rpcMethod: "desktopGetBuildInfo",
        ipcChannel: "desktop:getBuildInfo",
      }),
    );

    const root = renderer.root;
    const input = root.findByType("input");

    await act(async () => {
      input.props.onChange({
        target: { value: "https://milady.ai/releases/v2" },
      });
    });

    await act(async () => {
      findButtonByText(root, "Open Detached Release Center").props.onClick();
    });

    await act(async () => {
      findButtonByText(root, "Open BrowserView Window").props.onClick();
    });

    expect(openDesktopSurfaceWindowMock).toHaveBeenCalledWith("release");
    expect(invokeDesktopBridgeRequestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        rpcMethod: "desktopOpenReleaseNotesWindow",
        params: {
          url: "https://milady.ai/releases/v2",
          title: "Milady Release Notes",
        },
      }),
    );
  });
});
