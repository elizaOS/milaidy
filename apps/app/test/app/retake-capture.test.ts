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
  let setIntervalSpy: ReturnType<typeof vi.spyOn>;
  let clearIntervalSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    setIntervalSpy = vi.spyOn(globalThis, "setInterval");
    clearIntervalSpy = vi.spyOn(globalThis, "clearInterval");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("does not create an interval when active is false", () => {
    const iframeRef = {
      current: null,
    } as React.RefObject<HTMLIFrameElement | null>;

    act(() => {
      TestRenderer.create(
        React.createElement(HookHost, { iframeRef, active: false }),
      );
    });

    expect(setIntervalSpy).not.toHaveBeenCalled();
  });

  it("cleans up interval on unmount", () => {
    const iframeRef = {
      current: null,
    } as React.RefObject<HTMLIFrameElement | null>;

    let renderer: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        React.createElement(HookHost, { iframeRef, active: true }),
      );
    });

    expect(setIntervalSpy).toHaveBeenCalledTimes(1);

    act(() => {
      renderer.unmount();
    });

    expect(clearIntervalSpy).toHaveBeenCalledTimes(1);
  });
});
