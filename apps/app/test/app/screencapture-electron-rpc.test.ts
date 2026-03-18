// @vitest-environment jsdom

import type { ElectrobunRendererRpc } from "@elizaos/app-core/bridge";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ScreenCaptureElectron } from "../../plugins/screencapture/electron/src/index.ts";
import { ScreenCaptureWeb } from "../../plugins/screencapture/src/web";

type TestWindow = Window & {
  __ELIZA_ELECTROBUN_RPC__?: ElectrobunRendererRpc;
};

const SAMPLE_DATA_URL = "data:image/png;base64,ZmFrZQ==";
const SAMPLE_WIDTH = 1280;
const SAMPLE_HEIGHT = 720;

class MockImage {
  width = SAMPLE_WIDTH;
  height = SAMPLE_HEIGHT;
  naturalWidth = SAMPLE_WIDTH;
  naturalHeight = SAMPLE_HEIGHT;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;

  set src(_value: string) {
    queueMicrotask(() => {
      this.onload?.();
    });
  }
}

describe("ScreenCaptureElectron desktop bridge", () => {
  const originalImage = globalThis.Image;

  beforeEach(() => {
    Object.defineProperty(globalThis, "Image", {
      configurable: true,
      writable: true,
      value: MockImage,
    });
    Object.defineProperty(window, "Image", {
      configurable: true,
      writable: true,
      value: MockImage,
    });
  });

  afterEach(() => {
    delete (window as TestWindow).__ELIZA_ELECTROBUN_RPC__;
    Object.defineProperty(globalThis, "Image", {
      configurable: true,
      writable: true,
      value: originalImage,
    });
    Object.defineProperty(window, "Image", {
      configurable: true,
      writable: true,
      value: originalImage,
    });
    vi.restoreAllMocks();
  });

  it("prefers direct Electrobun RPC for screenshots", async () => {
    const screencaptureTakeScreenshot = vi.fn().mockResolvedValue({
      available: true,
      data: SAMPLE_DATA_URL,
    });
    (window as TestWindow).__ELIZA_ELECTROBUN_RPC__ = {
      request: {
        screencaptureTakeScreenshot,
      },
      onMessage: vi.fn(),
      offMessage: vi.fn(),
    };

    const plugin = new ScreenCaptureElectron();
    await expect(plugin.captureScreenshot()).resolves.toEqual({
      base64: "ZmFrZQ==",
      format: "png",
      width: SAMPLE_WIDTH,
      height: SAMPLE_HEIGHT,
      timestamp: expect.any(Number),
    });

    expect(screencaptureTakeScreenshot).toHaveBeenCalledWith(undefined);
  });

  it("falls back to the web implementation when direct Electrobun RPC is unavailable", async () => {
    const fallbackResult = {
      base64: "fallback-rpcless",
      format: "png",
      width: 400,
      height: 240,
      timestamp: 5678,
    };
    const fallbackCapture = vi
      .spyOn(ScreenCaptureWeb.prototype, "captureScreenshot")
      .mockResolvedValue(fallbackResult);

    const plugin = new ScreenCaptureElectron();
    await expect(plugin.captureScreenshot()).resolves.toEqual(fallbackResult);
    expect(fallbackCapture).toHaveBeenCalledWith(undefined);
  });

  it("falls back to the web implementation when native screenshot capture is unavailable", async () => {
    const fallbackResult = {
      base64: "fallback",
      format: "png",
      width: 320,
      height: 200,
      timestamp: 1234,
    };
    const fallbackCapture = vi
      .spyOn(ScreenCaptureWeb.prototype, "captureScreenshot")
      .mockResolvedValue(fallbackResult);

    (window as TestWindow).__ELIZA_ELECTROBUN_RPC__ = {
      request: {
        screencaptureTakeScreenshot: vi.fn().mockResolvedValue({
          available: false,
        }),
      },
      onMessage: vi.fn(),
      offMessage: vi.fn(),
    };

    const plugin = new ScreenCaptureElectron();
    await expect(plugin.captureScreenshot()).resolves.toEqual(fallbackResult);
    expect(fallbackCapture).toHaveBeenCalledWith(undefined);
  });
});
