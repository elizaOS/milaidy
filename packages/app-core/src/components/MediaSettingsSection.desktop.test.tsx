// @vitest-environment jsdom

import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { invokeDesktopBridgeRequestMock, isElectrobunRuntimeMock } = vi.hoisted(
  () => ({
    invokeDesktopBridgeRequestMock: vi.fn(),
    isElectrobunRuntimeMock: vi.fn(),
  }),
);

vi.mock("../bridge", () => ({
  invokeDesktopBridgeRequest: invokeDesktopBridgeRequestMock,
  isElectrobunRuntime: isElectrobunRuntimeMock,
}));

vi.mock("@miladyai/ui", () => ({
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) =>
    React.createElement("button", { type: "button", ...props }, children),
}));

import { DesktopMediaControlPanel } from "./MediaSettingsSection";

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

describe("DesktopMediaControlPanel", () => {
  beforeEach(() => {
    invokeDesktopBridgeRequestMock.mockReset();
    isElectrobunRuntimeMock.mockReset();
    isElectrobunRuntimeMock.mockReturnValue(true);
    invokeDesktopBridgeRequestMock.mockImplementation(
      async ({ rpcMethod }: { rpcMethod: string }) => {
        if (rpcMethod === "cameraGetDevices") {
          return {
            available: true,
            devices: [{ deviceId: "cam-1", label: "Front Camera" }],
          };
        }
        if (rpcMethod === "cameraCheckPermissions")
          return { status: "granted" };
        if (rpcMethod === "cameraGetRecordingState")
          return { recording: false, duration: 0 };
        if (rpcMethod === "screencaptureGetSources") {
          return {
            available: true,
            sources: [{ id: "screen-1", name: "Main Display" }],
          };
        }
        if (rpcMethod === "permissionsCheck") return { status: "granted" };
        if (rpcMethod === "screencaptureGetRecordingState") {
          return { recording: false, duration: 0, paused: false };
        }
        if (rpcMethod === "screencaptureTakeScreenshot") {
          return { available: true, data: "data:image/png;base64,abc" };
        }
        if (rpcMethod === "screencaptureSaveScreenshot") {
          return { available: true, path: "/tmp/capture.png" };
        }
        return undefined;
      },
    );
  });

  it("captures and saves a screenshot through the native bridge", async () => {
    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        React.createElement(DesktopMediaControlPanel),
      );
    });
    if (!renderer) {
      throw new Error("Failed to render DesktopMediaControlPanel");
    }
    const root = renderer.root;

    await act(async () => {
      findButtonByText(root, "Take Screenshot").props.onClick();
    });

    expect(invokeDesktopBridgeRequestMock).toHaveBeenCalledWith(
      expect.objectContaining({ rpcMethod: "screencaptureTakeScreenshot" }),
    );
    expect(invokeDesktopBridgeRequestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        rpcMethod: "screencaptureSaveScreenshot",
        params: expect.objectContaining({
          filename: "milady-desktop-screenshot.png",
        }),
      }),
    );
  });
});
