// @vitest-environment jsdom
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useRetakeCapture } from "../../src/hooks/useRetakeCapture";

function HookHost({
  iframeRef,
  active,
  fps,
}: {
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  active: boolean;
  fps?: number;
}) {
  useRetakeCapture(iframeRef, active, fps);
  return null;
}

describe("useRetakeCapture", () => {
  const mockInvoke = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    // The hook now uses window.electron?.ipcRenderer.invoke
    Object.defineProperty(window, "electron", {
      value: { ipcRenderer: { invoke: mockInvoke } },
      writable: true,
      configurable: true,
    });
    mockInvoke.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // @ts-expect-error cleanup electron stub
    delete window.electron;
  });

  it("does not start capture when active is false", () => {
    const iframeRef = {
      current: null,
    } as React.RefObject<HTMLIFrameElement | null>;

    act(() => {
      TestRenderer.create(
        React.createElement(HookHost, { iframeRef, active: false }),
      );
    });

    expect(mockInvoke).not.toHaveBeenCalledWith(
      "screencapture:startFrameCapture",
      expect.anything(),
    );
  });

  it("cleans up capture on unmount", () => {
    const iframeRef = {
      current: null,
    } as React.RefObject<HTMLIFrameElement | null>;

    let renderer: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        React.createElement(HookHost, { iframeRef, active: true }),
      );
    });

    expect(mockInvoke).toHaveBeenCalledWith(
      "screencapture:startFrameCapture",
      expect.objectContaining({ fps: expect.any(Number) }),
    );

    act(() => {
      renderer.unmount();
    });

    expect(mockInvoke).toHaveBeenCalledWith("screencapture:stopFrameCapture");
  });
});
