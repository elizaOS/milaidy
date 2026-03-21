// @vitest-environment jsdom

import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { invokeDesktopBridgeRequestMock } = vi.hoisted(() => ({
  invokeDesktopBridgeRequestMock: vi.fn(),
}));

vi.mock("../bridge", () => ({
  invokeDesktopBridgeRequest: invokeDesktopBridgeRequestMock,
  isElectrobunRuntime: vi.fn(() => true),
}));

vi.mock("@miladyai/ui", () => ({
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) =>
    React.createElement("button", { type: "button", ...props }, children),
}));

import { DesktopGameWindowControls } from "./GameView";

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

describe("DesktopGameWindowControls", () => {
  beforeEach(() => {
    invokeDesktopBridgeRequestMock.mockReset();
    invokeDesktopBridgeRequestMock.mockImplementation(
      async ({ rpcMethod }: { rpcMethod: string }) => {
        if (rpcMethod === "canvasGetBounds") {
          return { x: 0, y: 0, width: 1280, height: 720 };
        }
        if (rpcMethod === "gpuWindowList") {
          return { windows: [] };
        }
        return undefined;
      },
    );
  });

  it("focuses the native game window", async () => {
    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        React.createElement(DesktopGameWindowControls, {
          gameWindowId: "game-window-1",
        }),
      );
    });
    if (!renderer) {
      throw new Error("Failed to render DesktopGameWindowControls");
    }
    const root = renderer.root;

    await act(async () => {
      findButtonByText(root, "Focus Window").props.onClick();
    });

    expect(invokeDesktopBridgeRequestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        rpcMethod: "canvasFocus",
        params: { id: "game-window-1" },
      }),
    );
  });
});
