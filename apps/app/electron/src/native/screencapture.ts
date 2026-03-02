/**
 * Screen Capture Native Module for Electron
 *
 * Provides native screen capture (screenshots) and screen recording using
 * Electron's desktopCapturer + a hidden renderer for MediaRecorder.
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { IpcMainInvokeEvent } from "electron";
import {
  app,
  BrowserWindow,
  desktopCapturer,
  ipcMain,
  net,
  screen,
} from "electron";
import type { IpcValue } from "./ipc-types";

// ── Screenshot types ────────────────────────────────────────────────────────

export interface ScreenshotOptions {
  sourceId?: string;
  format?: "png" | "jpeg";
  quality?: number;
  fullPage?: boolean;
}

export interface ScreenshotResult {
  base64: string;
  format: "png" | "jpeg";
  width: number;
  height: number;
  path?: string;
}

export interface ScreenSource {
  id: string;
  name: string;
  type: "screen" | "window";
  thumbnail?: string;
  appIcon?: string;
}

// ── Recording types ─────────────────────────────────────────────────────────

export interface ScreenRecordingOptions {
  sourceId?: string;
  quality?: "low" | "medium" | "high" | "highest";
  fps?: number;
  bitrate?: number;
  enableSystemAudio?: boolean;
  enableMicrophone?: boolean;
  maxDuration?: number;
}

export interface ScreenRecordingState {
  isRecording: boolean;
  isPaused: boolean;
  duration: number;
  fileSize: number;
}

export interface ScreenRecordingResult {
  path: string;
  duration: number;
  width: number;
  height: number;
  fileSize: number;
  mimeType: string;
}

interface FrameCaptureOptions {
  fps?: number;
  quality?: number;
  apiBase?: string;
  endpoint?: string;
  gameUrl?: string;
}

const RECORDING_BITRATE: Record<string, number> = {
  low: 1_000_000,
  medium: 4_000_000,
  high: 8_000_000,
  highest: 16_000_000,
};

// ── Manager ─────────────────────────────────────────────────────────────────

/**
 * Screen Capture Manager
 */
export class ScreenCaptureManager {
  private mainWindow: BrowserWindow | null = null;
  private recordingWindow: BrowserWindow | null = null;
  private recordingStartTime = 0;
  private _recordingState: ScreenRecordingState = {
    isRecording: false,
    isPaused: false,
    duration: 0,
    fileSize: 0,
  };
  private _frameCaptureTimer: ReturnType<typeof setInterval> | null = null;
  private _frameCaptureActive = false;
  private _frameCaptureSkipping = false;
  private _frameCaptureWindow: BrowserWindow | null = null;
  private _captureTarget: BrowserWindow | null = null;
  private _frameCaptureOptions: FrameCaptureOptions | null = null;

  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }

  /**
   * Switch the frame capture target to a different window (e.g. pop-out).
   * Pass null to revert to the main window.
   * If frame capture is active, it restarts with the new target.
   */
  setCaptureTarget(window: BrowserWindow | null): void {
    this._captureTarget = window;
    console.log(
      `[ScreenCapture] Capture target switched to ${window ? "popout window" : "main window"}`,
    );
    // If frame capture is active (timer-based, not offscreen/gameUrl), restart it
    if (
      this._frameCaptureActive &&
      this._frameCaptureTimer &&
      this._frameCaptureOptions
    ) {
      const opts = this._frameCaptureOptions;
      this.stopFrameCapture();
      void this.startFrameCapture(opts);
    }
  }

  // ── Sources ─────────────────────────────────────────────────────────────

  /**
   * Get available screen/window sources
   */
  async getSources(): Promise<{ sources: ScreenSource[] }> {
    const sources = await desktopCapturer.getSources({
      types: ["screen", "window"],
      thumbnailSize: { width: 320, height: 180 },
      fetchWindowIcons: true,
    });

    return {
      sources: sources.map((source) => ({
        id: source.id,
        name: source.name,
        type: source.id.startsWith("screen:")
          ? ("screen" as const)
          : ("window" as const),
        thumbnail: source.thumbnail.toDataURL(),
        appIcon: source.appIcon?.toDataURL(),
      })),
    };
  }

  // ── Screenshot ──────────────────────────────────────────────────────────

  /**
   * Take a screenshot of a specific source
   */
  async takeScreenshot(options?: ScreenshotOptions): Promise<ScreenshotResult> {
    const sources = await desktopCapturer.getSources({
      types: ["screen"],
      thumbnailSize: screen.getPrimaryDisplay().workAreaSize,
    });

    let source = sources[0]; // Default to primary screen

    if (options?.sourceId) {
      const found = sources.find((s) => s.id === options.sourceId);
      if (found) source = found;
    }

    if (!source) {
      throw new Error("No screen source available");
    }

    const thumbnail = source.thumbnail;
    const format = options?.format || "png";

    let dataUrl: string;
    if (format === "jpeg") {
      dataUrl = thumbnail.toJPEG(options?.quality || 90).toString("base64");
    } else {
      dataUrl = thumbnail.toPNG().toString("base64");
    }

    const size = thumbnail.getSize();

    return {
      base64: dataUrl,
      format,
      width: size.width,
      height: size.height,
    };
  }

  /**
   * Capture the main window
   */
  async captureWindow(): Promise<ScreenshotResult> {
    if (!this.mainWindow) {
      throw new Error("Main window not available");
    }

    const image = await this.mainWindow.webContents.capturePage();
    const size = image.getSize();

    return {
      base64: image.toPNG().toString("base64"),
      format: "png",
      width: size.width,
      height: size.height,
    };
  }

  /**
   * Save screenshot to file
   */
  async saveScreenshot(
    screenshot: ScreenshotResult,
    filename?: string,
  ): Promise<{ path: string }> {
    const dir = app.getPath("pictures");
    const name =
      filename?.trim() || `screenshot-${Date.now()}.${screenshot.format}`;
    const baseName = path.basename(name);
    const safeName = baseName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const filePath = path.join(dir, safeName);
    const resolvedDir = path.resolve(dir);
    const resolvedFile = path.resolve(filePath);
    if (!resolvedFile.startsWith(`${resolvedDir}${path.sep}`)) {
      throw new Error("Invalid screenshot path");
    }

    const buffer = Buffer.from(screenshot.base64, "base64");
    await writeFile(filePath, buffer);

    return { path: filePath };
  }

  // ── Recording renderer ─────────────────────────────────────────────────

  /**
   * Create (or reuse) the hidden renderer used for MediaRecorder-based
   * screen recording.  getUserMedia + MediaRecorder require a renderer context.
   */
  private async ensureRecordingRenderer(): Promise<BrowserWindow> {
    if (this.recordingWindow && !this.recordingWindow.isDestroyed()) {
      return this.recordingWindow;
    }

    this.recordingWindow = new BrowserWindow({
      show: false,
      width: 1,
      height: 1,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    // Auto-approve media permission requests for the hidden recording window
    this.recordingWindow.webContents.session.setPermissionRequestHandler(
      (_wc, permission, callback) => {
        callback(permission === "media");
      },
    );

    const html = `<!DOCTYPE html><html><head><title>ScreenRecorder</title></head><body></body></html>`;
    await this.recordingWindow.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(html)}`,
    );

    return this.recordingWindow;
  }

  // ── Recording ───────────────────────────────────────────────────────────

  /**
   * Start screen recording.
   *
   * Uses desktopCapturer to identify the source, then spins up a MediaRecorder
   * inside a hidden renderer (since the MediaRecorder API is renderer-only).
   */
  async startRecording(options?: ScreenRecordingOptions): Promise<void> {
    if (this._recordingState.isRecording) {
      throw new Error("Recording already in progress");
    }

    // Resolve source ID – default to primary screen
    let sourceId = options?.sourceId;
    if (!sourceId) {
      const sources = await desktopCapturer.getSources({ types: ["screen"] });
      if (sources.length === 0) throw new Error("No screen sources available");
      sourceId = sources[0].id;
    }

    const renderer = await this.ensureRecordingRenderer();
    const bitrate =
      options?.bitrate ?? RECORDING_BITRATE[options?.quality ?? "medium"];
    const fps = options?.fps ?? 30;
    const enableAudio = options?.enableSystemAudio ?? false;

    const cfg = JSON.stringify({ sourceId, bitrate, fps, enableAudio });

    await renderer.webContents.executeJavaScript(`
      (async () => {
        const o = ${cfg};

        // Build constraints using Chromium's desktopCapturer integration
        const constraints = {
          audio: o.enableAudio ? { mandatory: { chromeMediaSource: 'desktop' } } : false,
          video: {
            mandatory: {
              chromeMediaSource: 'desktop',
              chromeMediaSourceId: o.sourceId,
              maxFrameRate: o.fps,
            },
          },
        };

        window._scrStream = await navigator.mediaDevices.getUserMedia(constraints);
        window._scrChunks = [];
        window._scrStart = Date.now();
        window._scrIsRec = true;
        window._scrIsPaused = false;

        const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
          ? 'video/webm;codecs=vp9' : 'video/webm';

        window._scrMR = new MediaRecorder(window._scrStream, {
          mimeType: mime,
          videoBitsPerSecond: o.bitrate,
        });

        window._scrMR.ondataavailable = e => {
          if (e.data.size > 0) window._scrChunks.push(e.data);
        };

        window._scrMR.start(1000);
      })()
    `);

    this.recordingStartTime = Date.now();
    this._recordingState = {
      isRecording: true,
      isPaused: false,
      duration: 0,
      fileSize: 0,
    };
    this.emitRecordingState();

    // Auto-stop when maxDuration is reached
    if (options?.maxDuration) {
      const dur = options.maxDuration;
      renderer.webContents
        .executeJavaScript(`
        window._scrMaxDurTimeout = setTimeout(() => {
          if (window._scrMR && window._scrMR.state === 'recording') {
            window._scrMR.stop();
            window._scrIsRec = false;
          }
        }, ${dur * 1000});
      `)
        .catch(() => {});
    }
  }

  /**
   * Stop recording, save to file, and return the result.
   */
  async stopRecording(): Promise<ScreenRecordingResult> {
    if (!this._recordingState.isRecording) {
      throw new Error("No recording in progress");
    }
    if (!this.recordingWindow || this.recordingWindow.isDestroyed()) {
      throw new Error("Recording renderer lost");
    }

    const tempDir = path.join(app.getPath("temp"), "milady-screencapture");
    await mkdir(tempDir, { recursive: true });
    const filePath = path.join(tempDir, `screenrec-${Date.now()}.webm`);

    const result = await this.recordingWindow.webContents.executeJavaScript(`
      new Promise((resolve, reject) => {
        if (!window._scrMR) { reject(new Error('No active recorder')); return; }
        if (window._scrMaxDurTimeout) { clearTimeout(window._scrMaxDurTimeout); window._scrMaxDurTimeout = null; }

        const finish = () => {
          const blob = new Blob(window._scrChunks, { type: window._scrMR.mimeType });
          const reader = new FileReader();
          reader.onloadend = () => {
            const b64 = reader.result.split(',')[1];
            const dur = (Date.now() - window._scrStart) / 1000;
            const vt = window._scrStream ? window._scrStream.getVideoTracks()[0] : null;
            const settings = vt ? vt.getSettings() : {};
            resolve({
              base64: b64,
              duration: dur,
              width: settings.width || 0,
              height: settings.height || 0,
              fileSize: blob.size,
              mimeType: window._scrMR.mimeType,
            });

            // Cleanup renderer state
            if (window._scrStream) { window._scrStream.getTracks().forEach(t => t.stop()); window._scrStream = null; }
            window._scrChunks = []; window._scrMR = null;
            window._scrIsRec = false; window._scrIsPaused = false;
          };
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(blob);
        };

        if (window._scrMR.state === 'inactive') {
          // Already stopped (e.g. maxDuration hit)
          finish();
        } else {
          window._scrMR.onstop = finish;
          window._scrMR.stop();
        }
      })
    `);

    const buffer = Buffer.from(result.base64 as string, "base64");
    await writeFile(filePath, buffer);

    this._recordingState = {
      isRecording: false,
      isPaused: false,
      duration: 0,
      fileSize: 0,
    };
    this.emitRecordingState();

    return {
      path: filePath,
      duration: result.duration as number,
      width: result.width as number,
      height: result.height as number,
      fileSize: result.fileSize as number,
      mimeType: result.mimeType as string,
    };
  }

  /**
   * Pause the current recording.
   */
  async pauseRecording(): Promise<void> {
    if (!this._recordingState.isRecording || this._recordingState.isPaused)
      return;
    if (!this.recordingWindow || this.recordingWindow.isDestroyed()) return;

    await this.recordingWindow.webContents.executeJavaScript(`
      (() => {
        if (window._scrMR && window._scrMR.state === 'recording') {
          window._scrMR.pause();
          window._scrIsPaused = true;
        }
      })()
    `);

    this._recordingState.isPaused = true;
    this.emitRecordingState();
  }

  /**
   * Resume a paused recording.
   */
  async resumeRecording(): Promise<void> {
    if (!this._recordingState.isRecording || !this._recordingState.isPaused)
      return;
    if (!this.recordingWindow || this.recordingWindow.isDestroyed()) return;

    await this.recordingWindow.webContents.executeJavaScript(`
      (() => {
        if (window._scrMR && window._scrMR.state === 'paused') {
          window._scrMR.resume();
          window._scrIsPaused = false;
        }
      })()
    `);

    this._recordingState.isPaused = false;
    this.emitRecordingState();
  }

  /**
   * Get the current recording state.
   */
  async getRecordingState(): Promise<ScreenRecordingState> {
    if (!this._recordingState.isRecording) {
      return { isRecording: false, isPaused: false, duration: 0, fileSize: 0 };
    }

    if (this.recordingWindow && !this.recordingWindow.isDestroyed()) {
      const live: { fileSize: number } =
        await this.recordingWindow.webContents.executeJavaScript(`
        (() => ({
          fileSize: (window._scrChunks || []).reduce((s, c) => s + c.size, 0),
        }))()
      `);
      this._recordingState.duration =
        (Date.now() - this.recordingStartTime) / 1000;
      this._recordingState.fileSize = live.fileSize;
    }

    return { ...this._recordingState };
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  private emitRecordingState(): void {
    this.sendToRenderer("screencapture:recordingState", {
      isRecording: this._recordingState.isRecording,
      isPaused: this._recordingState.isPaused,
      duration: this._recordingState.duration,
      fileSize: this._recordingState.fileSize,
    });
  }

  private sendToRenderer(channel: string, data?: IpcValue): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data);
    }
  }

  /**
   * Start capturing frames and POSTing them as JPEG to the stream endpoint.
   *
   * If `gameUrl` is provided, opens a dedicated offscreen BrowserWindow that
   * loads only the game — no app chrome, sidebar, or tabs. Uses the `paint`
   * event (correct API for offscreen rendering on macOS) instead of capturePage.
   * Falls back to capturing the main window if no gameUrl.
   */
  async startFrameCapture(options?: FrameCaptureOptions): Promise<void> {
    if (this._frameCaptureActive) return;
    this._frameCaptureOptions = options ? { ...options } : {};

    const fps = options?.fps ?? 10;
    const quality = options?.quality ?? 70;
    const apiBase = options?.apiBase ?? "http://localhost:2138";
    const endpointPath = options?.endpoint ?? "/api/stream/frame";
    const endpoint = `${apiBase}${endpointPath}`;
    const interval = Math.round(1000 / fps);

    this._frameCaptureActive = true;
    this._frameCaptureSkipping = false;

    if (options?.gameUrl) {
      // Offscreen window: use the `paint` event for reliable frame capture
      console.log(
        `[ScreenCapture] Creating offscreen game window for ${options.gameUrl}`,
      );
      this._frameCaptureWindow = new BrowserWindow({
        width: 1280,
        height: 720,
        show: false,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          offscreen: true,
        },
      });

      this._frameCaptureWindow.webContents.setFrameRate(fps);

      // Use the `paint` event — the correct API for offscreen rendering.
      // capturePage() doesn't work on offscreen windows on macOS.
      let framesSent = 0;
      this._frameCaptureWindow.webContents.on(
        "paint",
        (_event, _dirty, image) => {
          if (!this._frameCaptureActive) return;
          if (this._frameCaptureSkipping) return;
          this._frameCaptureSkipping = true;

          try {
            const jpeg = image.toJPEG(quality);
            if (jpeg.length > 100) {
              // Skip tiny/blank frames
              const req = net.request({ method: "POST", url: endpoint });
              req.setHeader("Content-Type", "image/jpeg");
              req.on("error", () => {}); // Ignore network errors
              req.end(jpeg);
              framesSent++;
              if (framesSent % 100 === 0) {
                console.log(
                  `[ScreenCapture] Sent ${framesSent} frames (paint event)`,
                );
              }
            }
          } catch {
            // Skip frame on error
          } finally {
            this._frameCaptureSkipping = false;
          }
        },
      );

      await this._frameCaptureWindow.loadURL(options.gameUrl);
      console.log(
        `[ScreenCapture] Offscreen game window loaded, paint events active at ${fps}fps`,
      );
    } else {
      // Main window: use capturePage() with timer
      const captureTarget =
        this._captureTarget && !this._captureTarget.isDestroyed()
          ? this._captureTarget
          : this.mainWindow;
      if (!captureTarget) throw new Error("Main window not available");

      console.log(
        `[ScreenCapture] Starting frame capture at ${fps}fps → ${endpoint}`,
      );

      this._frameCaptureTimer = setInterval(async () => {
        if (this._frameCaptureSkipping) return;
        if (!this._frameCaptureActive || captureTarget.isDestroyed()) {
          this.stopFrameCapture();
          return;
        }

        this._frameCaptureSkipping = true;
        try {
          const image = await captureTarget.webContents.capturePage();
          const jpeg = image.toJPEG(quality);

          const req = net.request({ method: "POST", url: endpoint });
          req.setHeader("Content-Type", "image/jpeg");
          req.on("error", () => {});
          req.end(jpeg);
        } catch {
          // Skip frame on error
        } finally {
          this._frameCaptureSkipping = false;
        }
      }, interval);
    }
  }

  stopFrameCapture(): void {
    if (this._frameCaptureTimer) {
      clearInterval(this._frameCaptureTimer);
      this._frameCaptureTimer = null;
    }
    if (this._frameCaptureWindow && !this._frameCaptureWindow.isDestroyed()) {
      this._frameCaptureWindow.close();
      this._frameCaptureWindow = null;
    }
    this._frameCaptureActive = false;
    this._frameCaptureSkipping = false;
    this._frameCaptureOptions = null;
    console.log("[ScreenCapture] Frame capture stopped");
  }

  isFrameCaptureActive(): boolean {
    return this._frameCaptureActive;
  }

  /**
   * Clean up all resources
   */
  dispose(): void {
    this.stopFrameCapture();
    if (this.recordingWindow && !this.recordingWindow.isDestroyed()) {
      this.recordingWindow.webContents
        .executeJavaScript(`
          if (window._scrStream) window._scrStream.getTracks().forEach(t => t.stop());
          if (window._scrMR && window._scrMR.state !== 'inactive') window._scrMR.stop();
        `)
        .catch(() => {});
      this.recordingWindow.close();
      this.recordingWindow = null;
    }
    this._recordingState = {
      isRecording: false,
      isPaused: false,
      duration: 0,
      fileSize: 0,
    };
  }
}

// ── Singleton ───────────────────────────────────────────────────────────────

let screenCaptureManager: ScreenCaptureManager | null = null;

export function getScreenCaptureManager(): ScreenCaptureManager {
  if (!screenCaptureManager) {
    screenCaptureManager = new ScreenCaptureManager();
  }
  return screenCaptureManager;
}

// ── IPC registration ────────────────────────────────────────────────────────

/**
 * Register Screen Capture IPC handlers (screenshot + recording)
 */
export function registerScreenCaptureIPC(): void {
  const m = getScreenCaptureManager();

  // Existing screenshot handlers
  ipcMain.handle("screencapture:getSources", async () => m.getSources());
  ipcMain.handle(
    "screencapture:takeScreenshot",
    async (_e: IpcMainInvokeEvent, options?: ScreenshotOptions) =>
      m.takeScreenshot(options),
  );
  ipcMain.handle("screencapture:captureWindow", async () => m.captureWindow());
  ipcMain.handle(
    "screencapture:saveScreenshot",
    async (
      _e: IpcMainInvokeEvent,
      screenshot: ScreenshotResult,
      filename?: string,
    ) => m.saveScreenshot(screenshot, filename),
  );

  // Recording handlers
  ipcMain.handle(
    "screencapture:startRecording",
    async (_e: IpcMainInvokeEvent, options?: ScreenRecordingOptions) =>
      m.startRecording(options),
  );
  ipcMain.handle("screencapture:stopRecording", async () => m.stopRecording());
  ipcMain.handle("screencapture:pauseRecording", async () =>
    m.pauseRecording(),
  );
  ipcMain.handle("screencapture:resumeRecording", async () =>
    m.resumeRecording(),
  );
  ipcMain.handle("screencapture:getRecordingState", async () =>
    m.getRecordingState(),
  );

  ipcMain.handle(
    "screencapture:startFrameCapture",
    async (
      _e: IpcMainInvokeEvent,
      options?: {
        fps?: number;
        quality?: number;
        apiBase?: string;
        endpoint?: string;
        gameUrl?: string;
      },
    ) => m.startFrameCapture(options),
  );
  ipcMain.handle("screencapture:stopFrameCapture", async () =>
    m.stopFrameCapture(),
  );
  ipcMain.handle("screencapture:isFrameCaptureActive", async () =>
    m.isFrameCaptureActive(),
  );
}
