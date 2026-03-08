/**
 * Screen Capture Native Module for Electrobun
 *
 * Frame capture strategy:
 *
 * 1. App-window capture (default, no gameUrl):
 *    Uses native CLI screenshot tools to capture real pixel data from the screen.
 *    - macOS: `screencapture -x -t jpg <tmpPath>` (no sound, no shadow)
 *    - Linux: `scrot --quality 70 <tmpPath>`, falling back to ImageMagick `import`
 *    - Windows: falls back to JS canvas approach (SIMPLE_CAPTURE_SCRIPT) since
 *      PowerShell screenshot capture is complex and Windows is not a primary target.
 *    The temp JPEG file is read, POSTed to the stream endpoint, then deleted.
 *
 * 2. Game URL capture (gameUrl provided):
 *    Creates a BrowserWindow for the game URL and captures its canvas/video
 *    content via JS. No offscreen `paint` event in Electrobun, so we poll.
 *
 * The captured JPEG frames are POSTed to the stream endpoint (e.g.
 * /api/stream/frame). The MJPEG monitor (GET /api/stream/screen) on the agent
 * server receives these frames for live view.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { BrowserWindow } from "electrobun/bun";

/**
 * Allow-list for game-capture URLs.
 * Only localhost, 127.0.0.1, and file:// origins are permitted.
 * External URLs are rejected to prevent a compromised renderer or malicious
 * IPC call from opening an invisible native window that loads arbitrary
 * external content with full desktop privileges.
 */
function isAllowedCaptureUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.hostname === "localhost" ||
      parsed.hostname === "127.0.0.1" ||
      parsed.protocol === "file:"
    );
  } catch {
    return false;
  }
}

/**
 * Structural type for accessing evaluateJavascriptWithResponse via requestProxy.
 * requestProxy is present at runtime on every createRPC result but is not
 * part of the base RPCWithTransport interface exported by electrobun.
 */
type WebviewEvalRpc = {
  requestProxy?: {
    evaluateJavascriptWithResponse?: (params: {
      script: string;
    }) => Promise<unknown>;
  };
};

/**
 * Minimal structural type for a webview — only the `rpc` property is used
 * by ScreenCaptureManager. Using a structural type (not Webview) allows
 * both real webviews and test mocks to satisfy this interface.
 */
type Webview = { rpc?: unknown };

type SendToWebview = (message: string, payload?: unknown) => void;

// JS injected into the webview to capture its visible content as a JPEG data URL.
// Uses html2canvas-style approach via native canvas.drawImage(document.body).
// Note: cross-origin iframes will be blank (canvas taint).
const _CAPTURE_SCRIPT = (_quality: number) => `
(function() {
  try {
    var canvas = document.createElement('canvas');
    var dpr = window.devicePixelRatio || 1;
    canvas.width = Math.min(window.innerWidth * dpr, 1920);
    canvas.height = Math.min(window.innerHeight * dpr, 1080);
    var ctx = canvas.getContext('2d');
    if (!ctx) return null;
    // Attempt to capture via foreignObject SVG technique
    var data = '<svg xmlns="http://www.w3.org/2000/svg" width="' + canvas.width + '" height="' + canvas.height + '">'
      + '<foreignObject width="100%" height="100%">'
      + '<div xmlns="http://www.w3.org/1999/xhtml" style="transform:scale(' + (1/dpr) + ');transform-origin:top left;width:' + (canvas.width*dpr) + 'px;height:' + (canvas.height*dpr) + 'px;">'
      + document.documentElement.outerHTML
      + '</div></foreignObject></svg>';
    var img = new Image();
    var blob = new Blob([data], {type: 'image/svg+xml;charset=utf-8'});
    var url = URL.createObjectURL(blob);
    // Sync path isn't possible — return a sentinel to use async path
    URL.revokeObjectURL(url);
    return null; // fallback to simpler approach
  } catch(e) {
    return null;
  }
})()
`;

// Simpler capture: screenshot the body background + visible text (very limited).
// Used as last resort when no other method works.
const SIMPLE_CAPTURE_SCRIPT = (quality: number) => `
(function captureView() {
  try {
    var canvas = document.createElement('canvas');
    var w = Math.min(window.innerWidth, 1280);
    var h = Math.min(window.innerHeight, 720);
    canvas.width = w;
    canvas.height = h;
    var ctx = canvas.getContext('2d');
    if (!ctx) return null;
    // Fill with background color
    ctx.fillStyle = getComputedStyle(document.body).backgroundColor || '#000';
    ctx.fillRect(0, 0, w, h);
    return canvas.toDataURL('image/jpeg', ${quality / 100});
  } catch(e) {
    return null;
  }
})()
`;

export class ScreenCaptureManager {
  private frameCaptureActive = false;
  private frameCaptureTimer: ReturnType<typeof setInterval> | null = null;
  private frameCaptureWindow: BrowserWindow | null = null;
  /** Reference to the main webview for app-window capture. */
  private mainWebview: Webview | null = null;

  /** Optional override target webview (e.g. a popout window's webview). */
  private captureTargetWebview: Webview | null = null;

  setSendToWebview(_fn: SendToWebview): void {
    // Screen capture posts directly to the HTTP endpoint; no webview push needed.
  }

  setMainWebview(webview: Webview | null): void {
    this.mainWebview = webview;
  }

  /**
   * Override the capture target webview. Pass null to revert to mainWebview.
   * Used when a StreamView is popped out to a separate window.
   */
  setCaptureTarget(webview: Webview | null): void {
    this.captureTargetWebview = webview;
  }

  /**
   * Returns the active webview for frame capture: the override target if set,
   * otherwise the main webview.
   */
  private getActiveWebview(): Webview | null {
    return this.captureTargetWebview ?? this.mainWebview;
  }

  async getSources() {
    return {
      sources: [{ id: "screen:0", name: "Entire Screen", thumbnail: "" }],
      available: true,
    };
  }

  async takeScreenshot() {
    return { available: false, reason: "Use startFrameCapture for streaming" };
  }

  async captureWindow(_options?: { windowId?: string }) {
    return { available: false, reason: "Use startFrameCapture for streaming" };
  }

  async startRecording() {
    return {
      available: false,
      reason: "Screen recording requires platform-specific integration",
    };
  }

  async stopRecording() {
    return { available: false };
  }

  async pauseRecording() {
    return { available: false };
  }

  async resumeRecording() {
    return { available: false };
  }

  async getRecordingState() {
    return { recording: false, duration: 0, paused: false };
  }

  /**
   * Start frame capture and POST JPEGs to the stream endpoint.
   *
   * Two modes (mirrors Electron):
   *  - gameUrl provided: captures a dedicated BrowserWindow loading that URL
   *  - no gameUrl: captures the main webview via JS canvas screenshot
   */
  async startFrameCapture(options?: {
    fps?: number;
    quality?: number;
    apiBase?: string;
    endpoint?: string;
    gameUrl?: string;
  }): Promise<{ available: boolean; reason?: string }> {
    if (this.frameCaptureActive) return { available: true };

    const fps = options?.fps ?? 10;
    const quality = options?.quality ?? 70;
    const apiBase = options?.apiBase ?? "http://127.0.0.1:2138";
    const endpointPath = options?.endpoint ?? "/api/stream/frame";
    const endpoint = `${apiBase}${endpointPath}`;
    const interval = Math.round(1000 / fps);

    this.frameCaptureActive = true;

    if (options?.gameUrl) {
      return this.startGameCapture(
        options.gameUrl,
        fps,
        quality,
        endpoint,
        interval,
      );
    }

    return this.startWebviewCapture(fps, quality, endpoint, interval);
  }

  /**
   * App-window capture: uses native CLI tools to capture real screen pixels.
   *
   * macOS: `screencapture -x -t jpg <tmpPath>`
   * Linux: `scrot --quality 70 <tmpPath>` (falls back to ImageMagick `import`)
   * Windows: falls back to SIMPLE_CAPTURE_SCRIPT (JS canvas approach)
   */
  private startWebviewCapture(
    _fps: number,
    quality: number,
    endpoint: string,
    interval: number,
  ): { available: boolean; reason?: string } {
    const platform = process.platform;

    let skipping = false;
    this.frameCaptureTimer = setInterval(async () => {
      if (!this.frameCaptureActive || skipping) return;
      skipping = true;

      // Windows fallback: JS canvas (solid-color, but acceptable for non-primary platform)
      if (platform === "win32") {
        try {
          const evalRpc = this.getActiveWebview()?.rpc as unknown as
            | WebviewEvalRpc
            | undefined;
          const dataUrl =
            await evalRpc?.requestProxy?.evaluateJavascriptWithResponse?.({
              script: SIMPLE_CAPTURE_SCRIPT(quality),
            });

          if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:")) {
            return;
          }

          const base64 = dataUrl.replace(/^data:[^;]+;base64,/, "");
          const body = Buffer.from(base64, "base64");
          fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "image/jpeg" },
            body,
          }).catch(() => {});
        } catch {
          // Skip frame on error
        } finally {
          skipping = false;
        }
        return;
      }

      // macOS / Linux: CLI screenshot → temp file → POST → delete
      const tmpPath = `${os.tmpdir()}/milady-frame-${Date.now()}.jpg`;
      try {
        let proc: ReturnType<typeof Bun.spawn>;

        if (platform === "darwin") {
          // -x = no shutter sound, no shadow  -t jpg = JPEG output
          proc = Bun.spawn(["screencapture", "-x", "-t", "jpg", tmpPath], {
            stdout: "ignore",
            stderr: "ignore",
          });
        } else {
          // Linux: try scrot first
          try {
            proc = Bun.spawn(["scrot", "--quality", String(quality), tmpPath], {
              stdout: "ignore",
              stderr: "ignore",
            });
            await proc.exited;

            if (!fs.existsSync(tmpPath)) {
              // scrot not available or failed — try ImageMagick import
              proc = Bun.spawn(["import", "-window", "root", tmpPath], {
                stdout: "ignore",
                stderr: "ignore",
              });
            }
          } catch {
            proc = Bun.spawn(["import", "-window", "root", tmpPath], {
              stdout: "ignore",
              stderr: "ignore",
            });
          }
        }

        await proc.exited;

        // macOS screencapture may append .jpg if no extension was in the path
        const actualPath = fs.existsSync(tmpPath)
          ? tmpPath
          : fs.existsSync(`${tmpPath}.jpg`)
            ? `${tmpPath}.jpg`
            : null;

        if (!actualPath) {
          return;
        }

        const body = fs.readFileSync(actualPath);

        fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "image/jpeg" },
          body,
        }).catch(() => {});
      } catch {
        // Skip frame on error
      } finally {
        // Clean up temp file (handle both possible paths from screencapture)
        for (const p of [tmpPath, `${tmpPath}.jpg`]) {
          try {
            if (fs.existsSync(p)) fs.unlinkSync(p);
          } catch {
            // Ignore cleanup errors
          }
        }
        skipping = false;
      }
    }, interval);

    return { available: true };
  }

  /**
   * Game URL capture: creates a BrowserWindow for the game URL and captures
   * its canvas/video content via JS. Equivalent to Electron's offscreen
   * paint-event approach (but polling, since Electrobun has no paint event).
   */
  private async startGameCapture(
    gameUrl: string,
    _fps: number,
    quality: number,
    endpoint: string,
    interval: number,
  ): Promise<{ available: boolean; reason?: string }> {
    if (!isAllowedCaptureUrl(gameUrl)) {
      return {
        available: false,
        reason: `gameUrl blocked: only localhost, 127.0.0.1, and file:// are permitted`,
      };
    }

    try {
      const win = new BrowserWindow({
        title: "Milady Game Capture",
        url: gameUrl,
        frame: {
          x: -9999,
          y: -9999,
          width: 1280,
          height: 720,
        },
      });

      this.frameCaptureWindow = win;

      // Capture script: grabs the first <canvas> or <video> element as JPEG
      const captureGameScript = `
        (function() {
          try {
            var el = document.querySelector('canvas') || document.querySelector('video');
            if (!el) return null;
            var c = document.createElement('canvas');
            c.width = ${1280};
            c.height = ${720};
            var ctx = c.getContext('2d');
            if (!ctx) return null;
            ctx.drawImage(el, 0, 0, c.width, c.height);
            return c.toDataURL('image/jpeg', ${quality / 100});
          } catch(e) { return null; }
        })()
      `;

      let skipping = false;
      this.frameCaptureTimer = setInterval(async () => {
        if (!this.frameCaptureActive || skipping) return;
        if (!this.frameCaptureWindow) {
          this.stopFrameCapture();
          return;
        }
        skipping = true;
        try {
          const captureRpc = this.frameCaptureWindow.webview
            .rpc as unknown as WebviewEvalRpc;
          const dataUrl =
            await captureRpc?.requestProxy?.evaluateJavascriptWithResponse?.({
              script: captureGameScript,
            });

          if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:"))
            return;

          const base64 = dataUrl.replace(/^data:[^;]+;base64,/, "");
          const body = Buffer.from(base64, "base64");
          fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "image/jpeg" },
            body,
          }).catch(() => {});
        } catch {
          // Skip frame
        } finally {
          skipping = false;
        }
      }, interval);

      win.on("close", () => {
        this.frameCaptureActive = false;
        this.frameCaptureWindow = null;
        if (this.frameCaptureTimer) {
          clearInterval(this.frameCaptureTimer);
          this.frameCaptureTimer = null;
        }
      });

      return { available: true };
    } catch (err) {
      this.frameCaptureActive = false;
      return {
        available: false,
        reason: `Failed to create game capture window: ${String(err)}`,
      };
    }
  }

  async stopFrameCapture(): Promise<{ available: boolean }> {
    this.frameCaptureActive = false;

    if (this.frameCaptureTimer) {
      clearInterval(this.frameCaptureTimer);
      this.frameCaptureTimer = null;
    }

    if (this.frameCaptureWindow) {
      try {
        this.frameCaptureWindow.close();
      } catch {}
      this.frameCaptureWindow = null;
    }

    return { available: true };
  }

  async isFrameCaptureActive() {
    return { active: this.frameCaptureActive };
  }

  async saveScreenshot(options: {
    data: string;
    filename?: string;
  }): Promise<{ available: boolean; path?: string }> {
    const picturesDir = path.join(os.homedir(), "Pictures");
    try {
      if (!fs.existsSync(picturesDir)) {
        fs.mkdirSync(picturesDir, { recursive: true });
      }
      const safeFilename = path.basename(options.filename ?? "");
      const ext = path.extname(safeFilename).toLowerCase();
      const allowedExts = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp"];
      const finalFilename = allowedExts.includes(ext)
        ? safeFilename
        : `screenshot-${Date.now()}.jpg`;
      const filePath = path.join(picturesDir, finalFilename);
      const base64 = options.data.replace(/^data:[^;]+;base64,/, "");
      fs.writeFileSync(filePath, Buffer.from(base64, "base64"));
      return { available: true, path: filePath };
    } catch {
      return { available: false };
    }
  }

  async switchSource(_options: { sourceId: string }) {
    return { available: false };
  }

  dispose(): void {
    this.stopFrameCapture();
    this.mainWebview = null;
    this.captureTargetWebview = null;
  }
}

let screenCaptureManager: ScreenCaptureManager | null = null;

export function getScreenCaptureManager(): ScreenCaptureManager {
  if (!screenCaptureManager) {
    screenCaptureManager = new ScreenCaptureManager();
  }
  return screenCaptureManager;
}
