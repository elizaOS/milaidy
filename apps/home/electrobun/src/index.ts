/**
 * Eliza Home Desktop App — Electrobun Main Entry
 *
 * Simplified desktop shell for the chat-only Eliza Home app.
 * Reuses native modules from apps/app/electrobun for agent lifecycle,
 * desktop management, permissions, and window effects.
 *
 * No WebGPU, no GPU windows, no VRM-related native modules.
 */

import fs from "node:fs";
import { createServer as createNetServer } from "node:net";
import path from "node:path";
import Electrobun, {
  ApplicationMenu,
  BrowserWindow,
  Updater,
  Utils,
} from "electrobun/bun";
import {
  pushApiBaseToRenderer,
  resolveDesktopRuntimeMode,
  resolveInitialApiBase,
} from "../../app/electrobun/src/api-base";
import { getAgentManager } from "../../app/electrobun/src/native/agent";
import { getDesktopManager } from "../../app/electrobun/src/native/desktop";
import {
  enableVibrancy,
  ensureShadow,
  setNativeDragRegion,
  setTrafficLightsPosition,
} from "../../app/electrobun/src/native/mac-window-effects";
import { getPermissionManager } from "../../app/electrobun/src/native/permissions";
import { readBuiltPreloadScript } from "../../app/electrobun/src/preload-validation";
import { registerRpcHandlers } from "../../app/electrobun/src/rpc-handlers";
import { PUSH_CHANNEL_TO_RPC_MESSAGE } from "../../app/electrobun/src/rpc-schema";

type SendToWebview = (message: string, payload?: unknown) => void;

// ============================================================================
// App Menu
// ============================================================================

function setupApplicationMenu(): void {
  const isMac = process.platform === "darwin";
  ApplicationMenu.setApplicationMenu([
    {
      label: "Eliza Home",
      submenu: [
        { role: "about" },
        { type: "separator" as const },
        { label: "Show Eliza Home", action: "show" },
        { label: "Check for Updates", action: "check-for-updates" },
        { label: "Restart Agent", action: "restart-agent" },
        { type: "separator" as const },
        ...(isMac
          ? [
              { role: "services" },
              { type: "separator" as const },
              { role: "hide" },
              { role: "hideOthers" },
              { role: "unhide" },
              { type: "separator" as const },
            ]
          : []),
        { role: "quit" },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" as const },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" as const },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" as const },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        ...(isMac
          ? [
              { role: "zoom" },
              { type: "separator" as const },
              { role: "front" },
            ]
          : []),
      ],
    },
  ]);
}

// ============================================================================
// macOS Native Window Effects
// ============================================================================

const MAC_TRAFFIC_LIGHTS_X = 14;
const MAC_TRAFFIC_LIGHTS_Y = 12;
const MAC_NATIVE_DRAG_REGION_X = 92;
const MAC_NATIVE_DRAG_REGION_HEIGHT = 40;

function applyMacOSWindowEffects(win: BrowserWindow): void {
  if (process.platform !== "darwin") return;

  const ptr = (win as { ptr?: unknown }).ptr;
  if (!ptr) {
    console.warn("[MacEffects] win.ptr unavailable — skipping native effects");
    return;
  }

  enableVibrancy(ptr as Parameters<typeof enableVibrancy>[0]);
  ensureShadow(ptr as Parameters<typeof ensureShadow>[0]);

  const alignButtons = () =>
    setTrafficLightsPosition(
      ptr as Parameters<typeof setTrafficLightsPosition>[0],
      MAC_TRAFFIC_LIGHTS_X,
      MAC_TRAFFIC_LIGHTS_Y,
    );
  const alignDragRegion = () =>
    setNativeDragRegion(
      ptr as Parameters<typeof setNativeDragRegion>[0],
      MAC_NATIVE_DRAG_REGION_X,
      MAC_NATIVE_DRAG_REGION_HEIGHT,
    );

  alignButtons();
  alignDragRegion();
  setTimeout(() => {
    alignButtons();
    alignDragRegion();
  }, 120);

  win.on("resize", () => {
    alignButtons();
    alignDragRegion();
  });
}

// ============================================================================
// Window State Persistence
// ============================================================================

interface WindowState {
  x: number;
  y: number;
  width: number;
  height: number;
}

const DEFAULT_WINDOW_STATE: WindowState = {
  x: 100,
  y: 100,
  width: 1200,
  height: 800,
};

function loadWindowState(statePath: string): WindowState {
  try {
    if (fs.existsSync(statePath)) {
      const data = JSON.parse(fs.readFileSync(statePath, "utf8"));
      if (typeof data.width === "number" && typeof data.height === "number") {
        return { ...DEFAULT_WINDOW_STATE, ...data };
      }
    }
  } catch {
    // Ignore parse/read errors
  }
  return DEFAULT_WINDOW_STATE;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleStateSave(statePath: string, win: BrowserWindow): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      const { x, y } = win.getPosition();
      const { width, height } = win.getSize();
      const dir = path.dirname(statePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        statePath,
        JSON.stringify({ x, y, width, height }),
        "utf8",
      );
    } catch {
      // Ignore save errors
    }
  }, 500);
}

// ============================================================================
// Main Window
// ============================================================================

let currentWindow: BrowserWindow | null = null;
let currentSendToWebview: SendToWebview | null = null;
let rendererUrlPromise: Promise<string> | null = null;
let backgroundWindowPromise: Promise<void> | null = null;
let isQuitting = false;

function sendToActiveRenderer(message: string, payload?: unknown): void {
  currentSendToWebview?.(message, payload);
}

// ============================================================================
// Renderer Static Server
// ============================================================================

async function startRendererServer(): Promise<string> {
  const rendererDir = path.resolve(import.meta.dir, "../renderer");
  if (!fs.existsSync(rendererDir)) {
    console.warn("[Renderer] renderer dir not found:", rendererDir);
    return "";
  }

  const getPort = (start: number): Promise<number> =>
    new Promise((resolve) => {
      const srv = createNetServer();
      srv.listen(start, "127.0.0.1", () => {
        const { port } = srv.address() as { port: number };
        srv.close(() => resolve(port));
      });
      srv.on("error", () => resolve(getPort(start + 1)));
    });

  const port = await getPort(5176);

  const mimeTypes: Record<string, string> = {
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript",
    ".mjs": "application/javascript",
    ".css": "text/css",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".json": "application/json",
    ".wasm": "application/wasm",
  };

  const initialApiBase = resolveInitialApiBase(
    process.env as Record<string, string | undefined>,
  );

  function injectApiBaseIntoHtml(html: string): string {
    if (!initialApiBase) return html;
    const script = `<script>window.__MILADY_API_BASE__=${JSON.stringify(initialApiBase)};</script>`;
    if (html.includes("</head>")) {
      return html.replace("</head>", `${script}</head>`);
    }
    if (html.includes("<body")) {
      return html.replace("<body", `${script}<body`);
    }
    return script + html;
  }

  Bun.serve({
    port,
    hostname: "127.0.0.1",
    fetch(req) {
      const urlPath =
        new URL(req.url).pathname.replace(/^\//, "") || "index.html";
      let filePath = path.join(rendererDir, urlPath);
      if (
        !filePath.startsWith(rendererDir + path.sep) &&
        filePath !== rendererDir
      ) {
        filePath = path.join(rendererDir, "index.html");
      }
      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        filePath = path.join(rendererDir, "index.html");
      }
      try {
        const content = fs.readFileSync(filePath);
        const ext = path.extname(filePath);
        if (ext === ".html" || filePath.endsWith("index.html")) {
          const html = injectApiBaseIntoHtml(content.toString("utf8"));
          return new Response(html, {
            headers: {
              "Content-Type": "text/html; charset=utf-8",
              "Access-Control-Allow-Origin": "*",
            },
          });
        }
        return new Response(content, {
          headers: {
            "Content-Type": mimeTypes[ext] ?? "application/octet-stream",
            "Access-Control-Allow-Origin": "*",
          },
        });
      } catch {
        return new Response("Not found", { status: 404 });
      }
    },
  });

  console.log(`[Renderer] Static server on http://127.0.0.1:${port}`);
  return `http://127.0.0.1:${port}`;
}

async function resolveRendererUrl(): Promise<string> {
  let rendererUrl =
    process.env.ELIZA_HOME_RENDERER_URL ??
    process.env.VITE_DEV_SERVER_URL ??
    "";

  if (!rendererUrl) {
    rendererUrlPromise ??= startRendererServer();
    rendererUrl = await rendererUrlPromise;
  }

  if (!rendererUrl) {
    rendererUrl = `file://${path.resolve(import.meta.dir, "../renderer/index.html")}`;
    console.warn(
      "[Main] Falling back to file:// renderer URL — CORS issues possible",
    );
  }

  return rendererUrl;
}

async function createMainWindow(): Promise<BrowserWindow> {
  const rendererUrl = await resolveRendererUrl();

  const statePath = path.join(Utils.paths.userData, "window-state.json");
  const state = loadWindowState(statePath);

  const preload = readBuiltPreloadScript(import.meta.dir);

  const win = new BrowserWindow({
    title: "Eliza Home",
    url: rendererUrl,
    preload,
    frame: {
      width: state.width,
      height: state.height,
      x: state.x,
      y: state.y,
    },
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    transparent: process.platform === "darwin",
  });

  applyMacOSWindowEffects(win);

  win.on("resize", () => scheduleStateSave(statePath, win));
  win.on("move", () => scheduleStateSave(statePath, win));

  return win;
}

// ============================================================================
// RPC + Native Module Wiring (simplified — agent + desktop only)
// ============================================================================

type RpcSendProxy = Record<string, ((payload: unknown) => void) | undefined>;

type ElectrobunRpcInstance = {
  send?: RpcSendProxy;
  setRequestHandler?: (
    handlers: Record<string, (params: never) => unknown>,
  ) => void;
};

function wireRpcAndModules(
  win: BrowserWindow,
): (message: string, payload?: unknown) => void {
  const rpc = win.webview.rpc as unknown as ElectrobunRpcInstance | undefined;

  const sendToWebview = (message: string, payload?: unknown): void => {
    const rpcMessage = PUSH_CHANNEL_TO_RPC_MESSAGE[message] ?? message;
    if (rpc?.send) {
      const sender = rpc?.send?.[rpcMessage];
      if (sender) {
        sender(payload ?? null);
        return;
      }
    }
    console.warn(`[sendToWebview] No RPC method for message: ${message}`);
  };

  // Initialize only the essential native modules (agent + desktop + permissions)
  const desktop = getDesktopManager();
  desktop.setMainWindow(win);
  desktop.setSendToWebview(sendToWebview);
  getAgentManager().setSendToWebview(sendToWebview);
  getPermissionManager().setSendToWebview(sendToWebview);

  registerRpcHandlers(rpc, sendToWebview);

  return sendToWebview;
}

function attachMainWindow(win: BrowserWindow): BrowserWindow {
  const sendToWebview = wireRpcAndModules(win);
  currentWindow = win;
  currentSendToWebview = sendToWebview;

  win.webview.on("dom-ready", () => {
    injectApiBase(win);
  });

  win.webview.on("will-navigate", (event: unknown) => {
    const e = event as { url?: string; preventDefault?: () => void };
    const url = e.url ?? "";
    try {
      const parsed = new URL(url);
      const isAllowed =
        parsed.protocol === "file:" ||
        parsed.hostname === "localhost" ||
        parsed.hostname === "127.0.0.1" ||
        parsed.protocol === "views:";
      if (!isAllowed) {
        e.preventDefault?.();
        void import("electrobun/bun")
          .then(({ Utils }) => {
            try {
              Utils.openExternal(url);
            } catch {}
          })
          .catch(() => {});
      }
    } catch {
      e.preventDefault?.();
    }
  });

  win.on("close", () => {
    if (currentWindow?.id === win.id) {
      currentWindow = null;
      currentSendToWebview = null;
    }
    if (!isQuitting) {
      void ensureBackgroundWindow();
    }
  });

  return win;
}

async function ensureBackgroundWindow(): Promise<void> {
  if (isQuitting || currentWindow || backgroundWindowPromise) return;

  backgroundWindowPromise = (async () => {
    const replacementWindow = attachMainWindow(await createMainWindow());
    try {
      replacementWindow.minimize();
    } catch (err) {
      console.warn("[Main] Failed to minimize background window:", err);
    }
    injectApiBase(replacementWindow);
  })().finally(() => {
    backgroundWindowPromise = null;
  });

  await backgroundWindowPromise;
}

// ============================================================================
// API Base Injection
// ============================================================================

function injectApiBase(win: BrowserWindow): void {
  const runtimeResolution = resolveDesktopRuntimeMode(
    process.env as Record<string, string | undefined>,
  );

  if (
    runtimeResolution.mode === "external" &&
    runtimeResolution.externalApi.base
  ) {
    pushApiBaseToRenderer(
      win,
      runtimeResolution.externalApi.base,
      process.env.MILADY_API_TOKEN,
    );
    return;
  }

  const agent = getAgentManager();
  const port = agent.getPort() ?? (Number(process.env.MILADY_PORT) || 2138);
  pushApiBaseToRenderer(win, `http://127.0.0.1:${port}`);
}

// ============================================================================
// Agent Startup
// ============================================================================

async function syncPermissionsToRestApi(
  port: number,
  startup = false,
): Promise<void> {
  try {
    const permissions = await getPermissionManager().checkAllPermissions();
    await fetch(`http://127.0.0.1:${port}/api/permissions/state`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ permissions, startup }),
    });
  } catch (err) {
    console.warn("[Main] Permission sync failed:", err);
  }
}

async function startAgent(win: BrowserWindow): Promise<void> {
  const runtimeResolution = resolveDesktopRuntimeMode(
    process.env as Record<string, string | undefined>,
  );

  if (runtimeResolution.mode !== "local") {
    console.log(
      `[Main] Skipping embedded agent startup (${runtimeResolution.mode} mode)`,
    );
    injectApiBase(win);
    return;
  }

  const agent = getAgentManager();

  try {
    const status = await agent.start();
    if (status.state === "running" && status.port) {
      pushApiBaseToRenderer(win, `http://127.0.0.1:${status.port}`);
      syncPermissionsToRestApi(status.port, true);
    }
  } catch (err) {
    console.error("[Main] Agent start failed:", err);
  }
}

// ============================================================================
// Auto-Updater
// ============================================================================

async function setupUpdater(): Promise<void> {
  const runUpdateCheck = async (notifyOnNoUpdate = false): Promise<void> => {
    try {
      const updateResult = await Updater.checkForUpdate();
      if (updateResult?.updateAvailable) {
        Updater.downloadUpdate().catch((err: unknown) => {
          console.warn("[Updater] Download failed:", err);
        });
        return;
      }
      if (notifyOnNoUpdate) {
        Utils.showNotification({
          title: "Eliza Home Up To Date",
          body: "You already have the latest release installed.",
        });
      }
    } catch (err) {
      console.warn("[Updater] Update check failed:", err);
      if (notifyOnNoUpdate) {
        Utils.showNotification({
          title: "Update Check Failed",
          body: "Eliza Home could not reach the update server.",
        });
      }
    }
  };

  try {
    Updater.onStatusChange((entry: { status: string; message?: string }) => {
      if (entry.status === "update-available") {
        const info = Updater.updateInfo();
        sendToActiveRenderer("desktopUpdateAvailable", {
          version: info.version,
        });
      } else if (entry.status === "download-complete") {
        const info = Updater.updateInfo();
        sendToActiveRenderer("desktopUpdateReady", { version: info.version });
        Utils.showNotification({
          title: "Eliza Home Update Ready",
          body: `Version ${info.version} is ready. Restart to apply.`,
        });
      }
    });

    Electrobun.events.on(
      "application-menu-clicked",
      (e: { data?: { action?: string } }) => {
        if (e?.data?.action === "check-for-updates") {
          void runUpdateCheck(true);
        }
      },
    );

    Electrobun.events.on("context-menu-clicked", (action: string) => {
      if (action === "check-for-updates") {
        void runUpdateCheck(true);
      }
    });

    await runUpdateCheck(false);
  } catch (err) {
    console.warn("[Updater] Update check failed:", err);
  }
}

// ============================================================================
// Deep Link Handling
// ============================================================================

function setupDeepLinks(): void {
  Electrobun.events.on("open-url", (url: string) => {
    sendToActiveRenderer("shareTargetReceived", { url });
  });
}

// ============================================================================
// Shutdown
// ============================================================================

function setupShutdown(cleanupFns: Array<() => void>): void {
  Electrobun.events.on("before-quit", () => {
    isQuitting = true;
    console.log("[Main] App quitting, disposing native modules...");
    for (const cleanupFn of cleanupFns) {
      cleanupFn();
    }
    getAgentManager().dispose();
    getDesktopManager().dispose();
    getPermissionManager().dispose();
  });
}

// ============================================================================
// Bootstrap
// ============================================================================

async function main(): Promise<void> {
  console.log("[Main] Starting Eliza Home (Electrobun)...");
  const normalizedModuleDir = import.meta.dir.replaceAll("\\", "/");
  const runtimeResolution = resolveDesktopRuntimeMode(
    process.env as Record<string, string | undefined>,
  );
  console.log(
    `[Env] platform=${process.platform} arch=${process.arch} bun=${Bun.version} ` +
      `execPath=${process.execPath} cwd=${process.cwd()} moduleDir=${import.meta.dir} ` +
      `packaged=${!normalizedModuleDir.includes("/src/")} argv=${process.argv.slice(1).join(" ")}`,
  );
  console.log(
    `[Env] desktopRuntimeMode=${runtimeResolution.mode} externalApi=${runtimeResolution.externalApi.base ?? "none"}`,
  );

  const cleanupFns: Array<() => void> = [];

  cleanupFns.push(
    getAgentManager().onStatusChange((status) => {
      if (currentWindow && status.port) {
        injectApiBase(currentWindow);
      }
    }),
  );

  const mainWin = attachMainWindow(await createMainWindow());
  setupApplicationMenu();

  if (process.argv.includes("--hidden")) {
    try {
      mainWin.minimize();
    } catch (err) {
      console.warn(
        "[Main] Failed to minimize window on --hidden startup:",
        err,
      );
    }
  }

  setupDeepLinks();

  const desktop = getDesktopManager();
  try {
    await desktop.createTray({
      icon: path.join(import.meta.dir, "../assets/appIcon.png"),
      tooltip: "Eliza Home",
      title: "Eliza Home",
      menu: [
        { id: "show", label: "Show Eliza Home", type: "normal" },
        { id: "sep1", type: "separator" },
        { id: "check-for-updates", label: "Check for Updates", type: "normal" },
        { id: "sep2", type: "separator" },
        { id: "restart-agent", label: "Restart Agent", type: "normal" },
        { id: "sep3", type: "separator" },
        { id: "quit", label: "Quit", type: "normal" },
      ],
    });
  } catch (err) {
    console.warn("[Main] Tray creation failed:", err);
  }

  if (currentWindow) {
    void startAgent(currentWindow);
  }

  void setupUpdater();
  setupShutdown(cleanupFns);

  console.log("[Main] Eliza Home started successfully");
}

main().catch((err) => {
  console.error("[Main] Fatal error during startup:", err);
  process.exit(1);
});
