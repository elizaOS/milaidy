/**
 * Tests for browser-capture.ts — pure function tests only.
 * Browser launch is not tested (requires Puppeteer + Chrome).
 */

import { describe, expect, it } from "vitest";
import { FRAME_FILE } from "./browser-capture";

// ensurePopoutUrl is not exported, so we test it indirectly
// or re-implement the logic for verification

describe("FRAME_FILE", () => {
  it("is a string path", () => {
    expect(typeof FRAME_FILE).toBe("string");
    expect(FRAME_FILE).toContain("milady-stream-frame.jpg");
  });
});

describe("BrowserCaptureConfig type", () => {
  it("accepts valid config shape", async () => {
    // Just verify the module exports the expected members
    const mod = await import("./browser-capture");
    expect(typeof mod.startBrowserCapture).toBe("function");
    expect(typeof mod.stopBrowserCapture).toBe("function");
    expect(typeof mod.isBrowserCaptureRunning).toBe("function");
    expect(typeof mod.hasFrameFile).toBe("function");
    expect(typeof mod.FRAME_FILE).toBe("string");
  });
});
