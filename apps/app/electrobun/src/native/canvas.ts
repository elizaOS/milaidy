/**
 * Canvas Native Module for Electrobun
 *
 * Creates auxiliary BrowserWindow instances for web navigation,
 * script execution, and popout windows (A2UI, embeds, etc.).
 *
 * Uses Electrobun's BrowserWindow + BrowserView for each canvas window.
 */

import { BrowserWindow } from "electrobun/bun";
import type {
  CanvasWindowInfo,
  CanvasWindowOptions,
  WindowBounds,
} from "../rpc-schema";

type SendToWebview = (message: string, payload?: unknown) => void;

interface CanvasWindow {
  id: string;
  window: BrowserWindow;
  url: string;
  title: string;
}

let canvasCounter = 0;

export class CanvasManager {
  private sendToWebview: SendToWebview | null = null;
  private windows: Map<string, CanvasWindow> = new Map();

  setSendToWebview(fn: SendToWebview): void {
    this.sendToWebview = fn;
  }

  async createWindow(options: CanvasWindowOptions): Promise<{ id: string }> {
    const id = `canvas_${++canvasCounter}`;

    const win = new BrowserWindow({
      title: options.title ?? "Milady Canvas",
      url: options.url ?? null,
      frame: {
        x: options.x ?? 100,
        y: options.y ?? 100,
        width: options.width ?? 800,
        height: options.height ?? 600,
      },
      transparent: options.transparent ?? false,
    });

    const canvas: CanvasWindow = {
      id,
      window: win,
      url: options.url ?? "",
      title: options.title ?? "Milady Canvas",
    };

    this.windows.set(id, canvas);

    win.on("close", () => {
      this.windows.delete(id);
      this.sendToWebview?.("canvasWindowEvent", {
        windowId: id,
        event: "closed",
      });
    });

    win.on("focus", () => {
      this.sendToWebview?.("canvasWindowEvent", {
        windowId: id,
        event: "focus",
      });
    });

    return { id };
  }

  async destroyWindow(options: { id: string }): Promise<void> {
    const canvas = this.windows.get(options.id);
    if (canvas) {
      canvas.window.close();
      this.windows.delete(options.id);
    }
  }

  async navigate(options: { id: string; url: string }): Promise<void> {
    const canvas = this.windows.get(options.id);
    if (canvas) {
      canvas.window.webview.loadURL(options.url);
      canvas.url = options.url;
    }
  }

  /**
   * PRIVILEGED: Executes arbitrary JavaScript in a canvas BrowserWindow
   * via evaluateJavascriptWithResponse. This is intentionally unrestricted
   * for agent computer-use capabilities. Security relies on:
   *   1. Canvas windows being isolated from user-facing content
   *   2. URL allowlist check below (localhost/file/blank only)
   * Any XSS in the main webview could invoke this on canvas windows.
   */
  async eval(options: { id: string; script: string }): Promise<unknown> {
    const canvas = this.windows.get(options.id);
    if (!canvas) return null;

    // Security: only allow eval on local/internal canvas URLs
    const currentUrl = canvas.window.webview?.url ?? "";
    const isInternal =
      currentUrl.startsWith("http://localhost") ||
      currentUrl.startsWith("https://localhost") ||
      currentUrl.startsWith("file://") ||
      currentUrl === "" ||
      currentUrl === "about:blank";
    if (!isInternal) {
      throw new Error(
        `canvas:eval blocked — canvas ${options.id} has external URL: ${currentUrl}`,
      );
    }

    try {
      return await canvas.window.webview.rpc?.requestProxy.evaluateJavascriptWithResponse(
        { script: options.script },
      );
    } catch (err) {
      console.error(`[Canvas] eval error in ${options.id}:`, err);
      return null;
    }
  }

  async snapshot(_options: {
    id: string;
    format?: string;
    quality?: number;
  }): Promise<{ data: string } | null> {
    // Electrobun doesn't have a direct capturePage equivalent.
    // Would need to use evaluateJavascriptWithResponse to capture via canvas element.
    return null;
  }

  async a2uiPush(options: { id: string; payload: unknown }): Promise<void> {
    const canvas = this.windows.get(options.id);
    if (!canvas) return;

    const script = `
      if (window.miladyA2UI && typeof window.miladyA2UI.push === 'function') {
        window.miladyA2UI.push(${JSON.stringify(options.payload)});
      }
    `;
    try {
      await canvas.window.webview.rpc?.requestProxy.evaluateJavascriptWithResponse(
        { script },
      );
    } catch {
      // Window may have been destroyed
    }
  }

  async a2uiReset(options: { id: string }): Promise<void> {
    const canvas = this.windows.get(options.id);
    if (!canvas) return;

    const script = `
      if (window.miladyA2UI && typeof window.miladyA2UI.reset === 'function') {
        window.miladyA2UI.reset();
      }
    `;
    try {
      await canvas.window.webview.rpc?.requestProxy.evaluateJavascriptWithResponse(
        { script },
      );
    } catch {
      // Window may have been destroyed
    }
  }

  async show(options: { id: string }): Promise<void> {
    this.windows.get(options.id)?.window.show();
  }

  async hide(options: { id: string }): Promise<void> {
    // Electrobun doesn't have hide() — use minimize as fallback
    this.windows.get(options.id)?.window.minimize();
  }

  async resize(options: {
    id: string;
    width: number;
    height: number;
  }): Promise<void> {
    this.windows.get(options.id)?.window.setSize(options.width, options.height);
  }

  async focus(options: { id: string }): Promise<void> {
    this.windows.get(options.id)?.window.focus();
  }

  async getBounds(options: { id: string }): Promise<WindowBounds> {
    const win = this.windows.get(options.id)?.window;
    if (!win) return { x: 0, y: 0, width: 0, height: 0 };
    const pos = win.getPosition();
    const size = win.getSize();
    return { x: pos.x, y: pos.y, width: size.width, height: size.height };
  }

  async setBounds(options: { id: string } & WindowBounds): Promise<void> {
    const win = this.windows.get(options.id)?.window;
    if (!win) return;
    win.setPosition(options.x, options.y);
    win.setSize(options.width, options.height);
  }

  async listWindows(): Promise<{ windows: CanvasWindowInfo[] }> {
    const result: CanvasWindowInfo[] = [];
    for (const [id, canvas] of this.windows) {
      const pos = canvas.window.getPosition();
      const size = canvas.window.getSize();
      result.push({
        id,
        url: canvas.url,
        bounds: { x: pos.x, y: pos.y, width: size.width, height: size.height },
        title: canvas.title,
      });
    }
    return { windows: result };
  }

  dispose(): void {
    for (const canvas of this.windows.values()) {
      try {
        canvas.window.close();
      } catch {
        // Already destroyed
      }
    }
    this.windows.clear();
    this.sendToWebview = null;
  }
}

let canvasManager: CanvasManager | null = null;

export function getCanvasManager(): CanvasManager {
  if (!canvasManager) {
    canvasManager = new CanvasManager();
  }
  return canvasManager;
}
