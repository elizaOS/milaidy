/**
 * Headless browser capture — opens a game URL in headless Chrome and
 * saves screenshots to a temp file. FFmpeg reads the temp file using
 * -loop 1 to continuously re-read the latest frame.
 *
 * This approach avoids the pipe bottleneck — FFmpeg reads at its own
 * pace while the browser updates the file independently.
 */

import { existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import puppeteer from "puppeteer-core";

const CHROME_PATH =
  process.platform === "darwin"
    ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    : process.platform === "win32"
      ? "C:\\Program Files\\Google Chrome\\Application\\chrome.exe"
      : "/usr/bin/google-chrome-stable";

let activeBrowser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null;
let stopSignal = false;

/** Path to the temp frame file that FFmpeg reads */
export const FRAME_FILE = join(tmpdir(), "milady-stream-frame.jpg");

export interface BrowserCaptureConfig {
  url: string;
  width?: number;
  height?: number;
  fps?: number;
  quality?: number;
}

interface ScreencastFrameEvent {
  data: string;
  sessionId: number;
}

export async function startBrowserCapture(config: BrowserCaptureConfig) {
  if (activeBrowser) {
    console.log("[browser-capture] Already running");
    return;
  }

  const { url, width = 1280, height = 720, quality = 70 } = config;

  stopSignal = false;
  console.log(`[browser-capture] Launching headless Chrome → ${url}`);

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: [
      `--window-size=${width},${height}`,
      "--no-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--disable-extensions",
      "--mute-audio",
    ],
  });

  activeBrowser = browser;

  const page = await browser.newPage();
  await page.setViewport({ width, height });
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });

  console.log(`[browser-capture] Page loaded, writing frames to ${FRAME_FILE}`);

  // Use CDP screencast for efficient frame delivery
  const cdp = await page.createCDPSession();
  let frameCount = 0;

  cdp.on("Page.screencastFrame", async (params: ScreencastFrameEvent) => {
    if (stopSignal) return;
    try {
      const buf = Buffer.from(params.data, "base64");
      if (buf.length > 0) {
        writeFileSync(FRAME_FILE, buf);
        frameCount++;
        if (frameCount % 100 === 0) {
          console.log(`[browser-capture] ${frameCount} frames written`);
        }
      }
      await cdp.send("Page.screencastFrameAck", {
        sessionId: params.sessionId,
      });
    } catch {
      // Ignore
    }
  });

  // Capture every frame from Chrome's compositor (~60fps internally,
  // limited by everyNthFrame to ~15-30fps actual delivery)
  await cdp.send("Page.startScreencast", {
    format: "jpeg",
    quality,
    maxWidth: width,
    maxHeight: height,
    everyNthFrame: 2, // ~30fps from 60fps compositor
  });

  console.log(
    `[browser-capture] CDP screencast active, saving to ${FRAME_FILE}`,
  );
}

export async function stopBrowserCapture() {
  stopSignal = true;
  if (activeBrowser) {
    try {
      await activeBrowser.close();
    } catch {}
    activeBrowser = null;
  }
  console.log("[browser-capture] Stopped");
}

export function isBrowserCaptureRunning(): boolean {
  return activeBrowser !== null;
}

export function hasFrameFile(): boolean {
  return existsSync(FRAME_FILE);
}
