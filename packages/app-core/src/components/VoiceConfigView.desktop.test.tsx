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
  Input: ({ ...props }: React.InputHTMLAttributes<HTMLInputElement>) =>
    React.createElement("input", props),
}));

import { DesktopTalkModePanel } from "./VoiceConfigView";

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

describe("DesktopTalkModePanel", () => {
  beforeEach(() => {
    invokeDesktopBridgeRequestMock.mockReset();
    isElectrobunRuntimeMock.mockReset();
    isElectrobunRuntimeMock.mockReturnValue(true);
    invokeDesktopBridgeRequestMock.mockImplementation(
      async ({ rpcMethod }: { rpcMethod: string }) => {
        if (rpcMethod === "talkmodeGetState") return { state: "idle" };
        if (rpcMethod === "talkmodeIsEnabled") return { enabled: false };
        if (rpcMethod === "talkmodeIsSpeaking") return { speaking: false };
        if (rpcMethod === "talkmodeGetWhisperInfo")
          return { available: true, modelSize: "base" };
        if (rpcMethod === "talkmodeStart") return { available: true };
        return undefined;
      },
    );
  });

  it("starts talk mode and sends a speech request", async () => {
    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(DesktopTalkModePanel));
    });
    if (!renderer) {
      throw new Error("Failed to render DesktopTalkModePanel");
    }
    const root = renderer.root;

    await act(async () => {
      findButtonByText(root, "Start Talk Mode").props.onClick();
    });
    await act(async () => {
      findButtonByText(root, "Speak Test Phrase").props.onClick();
    });

    expect(invokeDesktopBridgeRequestMock).toHaveBeenCalledWith(
      expect.objectContaining({ rpcMethod: "talkmodeStart" }),
    );
    expect(invokeDesktopBridgeRequestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        rpcMethod: "talkmodeSpeak",
        params: { text: "Hello from Milady desktop talk mode." },
      }),
    );
  });
});
