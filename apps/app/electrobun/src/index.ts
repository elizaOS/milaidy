/**
 * Milady Desktop App — Electrobun Main Entry
 *
 * Creates the main BrowserWindow, wires up RPC handlers,
 * sets up system tray, application menu, and starts the agent.
 */

import fs from "node:fs";
import { createServer as createNetServer } from "node:net";
import path from "node:path";
import Electrobun, {
  ApplicationMenu,
  BrowserWindow,
  Updater,
  Utils,
  WGPU,
  webgpu,
} from "electrobun/bun";
import { pushApiBaseToRenderer, resolveExternalApiBase } from "./api-base";
import { getAgentManager } from "./native/agent";
import { getDesktopManager } from "./native/desktop";
import { disposeNativeModules, initializeNativeModules } from "./native/index";
import {
  enableVibrancy,
  ensureShadow,
  setNativeDragRegion,
  setTrafficLightsPosition,
} from "./native/mac-window-effects";
import { getPermissionManager } from "./native/permissions";
import { registerRpcHandlers } from "./rpc-handlers";
import { PUSH_CHANNEL_TO_RPC_MESSAGE } from "./rpc-schema";

type SendToWebview = (message: string, payload?: unknown) => void;

// ============================================================================
// App Menu
// ============================================================================

function setupApplicationMenu(): void {
  const isMac = process.platform === "darwin";
  ApplicationMenu.setApplicationMenu([
    {
      label: "Milady",
      submenu: [
        { role: "about" },
        { type: "separator" as const },
        { label: "Show Milady", action: "show" },
        { label: "Check for Updates", action: "check-for-updates" },
        { label: "Restart Agent", action: "restart-agent" },
        { type: "separator" as const },
        // services, hide, hideOthers, unhide are macOS-only menu roles
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
        // zoom and front are macOS-only Window menu roles
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
// macOS Native Window Effects (vibrancy, shadow, traffic lights, drag region)
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

  console.log("[MacEffects] Native macOS window effects applied");
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
    // Ignore parse/read errors — return default
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

/**
 * Serve the renderer dist over HTTP so WKWebView can load it without
 * file:// CORS restrictions (crossorigin ES modules break over file://).
 * Returns the base URL e.g. "http://localhost:5174".
 */
async function startRendererServer(): Promise<string> {
  const rendererDir = path.resolve(import.meta.dir, "../renderer");
  if (!fs.existsSync(rendererDir)) {
    console.warn("[Renderer] renderer dir not found:", rendererDir);
    return "";
  }

  // Find a free port starting at 5174 (5173 reserved for Vite dev)
  const getPort = (start: number): Promise<number> =>
    new Promise((resolve) => {
      const srv = createNetServer();
      srv.listen(start, "127.0.0.1", () => {
        const { port } = srv.address() as { port: number };
        srv.close(() => resolve(port));
      });
      srv.on("error", () => resolve(getPort(start + 1)));
    });

  const port = await getPort(5174);

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
    ".glb": "model/gltf-binary",
    ".gltf": "model/gltf+json",
  };

  // Determine the expected agent API base URL so we can inject it into the
  // HTML before the renderer JS runs. This prevents a 404 fatal-error loop
  // where the renderer fetches /api/auth/status relative to the static server.
  // If the agent falls back to a dynamic port, apiBaseUpdate messages will
  // update window.__MILADY_API_BASE__ and the client will pick it up lazily.
  const agentPort = Number(process.env.MILADY_PORT) || 2138;
  // Use 127.0.0.1 explicitly: on Windows 11, "localhost" resolves to ::1 (IPv6)
  // by default, but the agent server binds to 127.0.0.1 (IPv4), causing ECONNREFUSED.
  const agentApiBase = `http://127.0.0.1:${agentPort}`;

  // Inject the API base into index.html so it's available before React mounts.
  function injectApiBaseIntoHtml(html: string): string {
    const script = `<script>window.__MILADY_API_BASE__=${JSON.stringify(agentApiBase)};</script>`;
    // Inject before </head> if present, otherwise before <body>
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
      // Path traversal guard: ensure resolved path stays within rendererDir
      if (
        !filePath.startsWith(rendererDir + path.sep) &&
        filePath !== rendererDir
      ) {
        filePath = path.join(rendererDir, "index.html");
      }
      // SPA fallback — serve index.html for unknown paths
      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        filePath = path.join(rendererDir, "index.html");
      }
      try {
        const content = fs.readFileSync(filePath);
        const ext = path.extname(filePath);
        // Inject API base into HTML responses
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
  // Resolve the renderer URL — prefer env override (dev HMR), then built-in static server
  let rendererUrl =
    process.env.MILADY_RENDERER_URL ?? process.env.VITE_DEV_SERVER_URL ?? "";

  if (!rendererUrl) {
    rendererUrlPromise ??= startRendererServer();
    rendererUrl = await rendererUrlPromise;
  }

  if (!rendererUrl) {
    // Last resort: file:// (may have CORS issues with crossorigin module scripts)
    rendererUrl = `file://${path.resolve(import.meta.dir, "../renderer/index.html")}`;
    console.warn(
      "[Main] Falling back to file:// renderer URL — CORS issues possible",
    );
  }

  return rendererUrl;
}

async function createMainWindow(): Promise<BrowserWindow> {
  const rendererUrl = await resolveRendererUrl();

  // Load persisted window state
  const statePath = path.join(Utils.paths.userData, "window-state.json");
  const state = loadWindowState(statePath);

  // Read the pre-built webview bridge preload (built by `bun run build:preload`).
  // The preload runs in the webview context after Electrobun's built-in preload,
  // setting up window.electron as a compatibility shim over the Electrobun RPC.
  const preloadPath = path.join(import.meta.dir, "preload.js");
  const preload = fs.existsSync(preloadPath)
    ? fs.readFileSync(preloadPath, "utf8")
    : null;

  if (!preload) {
    console.warn(
      "[Main] preload.js not found — run `bun run build:preload` first. window.electron will be unavailable.",
    );
  }

  const win = new BrowserWindow({
    title: "Milady",
    url: rendererUrl,
    preload,
    frame: {
      width: state.width,
      height: state.height,
      x: state.x,
      y: state.y,
    },
    // Prevent the window from being crushed below a usable companion size.
    // @ts-expect-error — minWidth/minHeight are valid Electrobun options not yet typed
    minWidth: 800,
    minHeight: 600,
    // hiddenInset hides the title bar and insets traffic lights — macOS only.
    // On Windows/Linux use the default title bar so the window remains draggable.
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    // Transparent background for vibrancy — macOS only.
    // On Windows/Linux a solid background prevents rendering artifacts.
    transparent: process.platform === "darwin",
  });

  // Apply native macOS vibrancy, shadow, and traffic light positioning
  applyMacOSWindowEffects(win);

  // Persist window state on resize and move
  win.on("resize", () => scheduleStateSave(statePath, win));
  win.on("move", () => scheduleStateSave(statePath, win));

  return win;
}

function attachMainWindow(win: BrowserWindow): BrowserWindow {
  const sendToWebview = wireRpcAndModules(win);
  currentWindow = win;
  currentSendToWebview = sendToWebview;

  win.webview.on("dom-ready", () => {
    injectApiBase(win);
    if (process.env.NODE_ENV === "development") {
      win.webview.openDevTools();
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
  if (isQuitting || currentWindow || backgroundWindowPromise) {
    return;
  }

  backgroundWindowPromise = (async () => {
    const replacementWindow = attachMainWindow(await createMainWindow());
    try {
      replacementWindow.minimize();
      console.log("[Main] Recreated minimized window after close");
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
// RPC + Native Module Wiring
// ============================================================================

// Type alias for the untyped rpc send proxy (used at runtime for push messages)
type RpcSendProxy = Record<string, ((payload: unknown) => void) | undefined>;

/**
 * Structural type for the Electrobun RPC instance.
 * The actual runtime object returned by createRPC exposes `send` and
 * `setRequestHandler`, but the base RPCWithTransport interface only has
 * `setTransport`. We use a structural type to avoid casts.
 *
 * `(params: never) => unknown` for handler values: any typed handler
 * `(p: T) => R` satisfies this via TypeScript's function contravariance
 * (`never extends T` is always true).
 */
type ElectrobunRpcInstance = {
  send?: RpcSendProxy;
  setRequestHandler?: (
    handlers: Record<string, (params: never) => unknown>,
  ) => void;
};

function wireRpcAndModules(
  win: BrowserWindow,
): (message: string, payload?: unknown) => void {
  // Access the rpc instance from the webview (set during window creation)
  const rpc = win.webview.rpc as unknown as ElectrobunRpcInstance | undefined;

  // Create the sendToWebview callback that native modules use to push events.
  // Uses typed RPC push messages instead of JS evaluation.
  const sendToWebview = (message: string, payload?: unknown): void => {
    // Resolve via map (Electron-style colon format) or use message directly
    // as the RPC method name (Electrobun camelCase format).
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

  // Initialize native modules with window + sendToWebview
  initializeNativeModules(win, sendToWebview);

  // Register RPC handlers
  registerRpcHandlers(rpc, sendToWebview);

  return sendToWebview;
}

// ============================================================================
// API Base Injection
// ============================================================================

function injectApiBase(win: BrowserWindow): void {
  const resolution = resolveExternalApiBase(
    process.env as Record<string, string | undefined>,
  );

  if (resolution.invalidSources.length > 0) {
    console.warn(
      `[Main] Invalid API base env vars: ${resolution.invalidSources.join(", ")}`,
    );
  }

  // If we have an external API base, push it to the renderer.
  if (resolution.base) {
    pushApiBaseToRenderer(win, resolution.base, process.env.MILADY_API_TOKEN);
    return;
  }

  // Otherwise fall back to the agent's local server URL.
  const agent = getAgentManager();
  const port = agent.getPort();
  if (port) {
    pushApiBaseToRenderer(win, `http://127.0.0.1:${port}`);
  }
}

// ============================================================================
// Agent Startup
// ============================================================================

/**
 * Push real OS permission states into the agent REST API so the renderer's
 * PermissionsSection shows correct statuses and capability toggles unlock.
 */
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
  const agent = getAgentManager();

  try {
    const status = await agent.start();

    // If agent started and no external API base is configured,
    // push the agent's local API base to the renderer.
    if (status.state === "running" && status.port) {
      const resolution = resolveExternalApiBase(
        process.env as Record<string, string | undefined>,
      );
      if (!resolution.base) {
        pushApiBaseToRenderer(win, `http://127.0.0.1:${status.port}`);
      }
      // Sync real OS permission states to the REST API so the renderer
      // can display them and capability toggles can unlock.
      // Pass startup=true so the backend skips scheduling a restart for
      // capabilities that are being auto-enabled for the first time.
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
          title: "Milady Up To Date",
          body: "You already have the latest release installed.",
        });
      }
    } catch (err) {
      console.warn("[Updater] Update check failed:", err);
      if (notifyOnNoUpdate) {
        Utils.showNotification({
          title: "Update Check Failed",
          body: "Milady could not reach the update server.",
        });
      }
    }
  };

  try {
    // Subscribe to update status changes so we can notify the renderer
    // at the right lifecycle points.
    Updater.onStatusChange((entry: { status: string; message?: string }) => {
      if (entry.status === "update-available") {
        // checkForUpdate found a new version — notify renderer
        const info = Updater.updateInfo();
        sendToActiveRenderer("desktopUpdateAvailable", {
          version: info.version,
        });
      } else if (entry.status === "download-complete") {
        // downloadUpdate finished — update is ready to apply
        const info = Updater.updateInfo();
        sendToActiveRenderer("desktopUpdateReady", { version: info.version });
        Utils.showNotification({
          title: "Milady Update Ready",
          body: `Version ${info.version} is ready. Restart to apply.`,
        });
      }
    });

    const triggerManualUpdateCheck = () => {
      void runUpdateCheck(true);
    };

    Electrobun.events.on(
      "application-menu-clicked",
      (e: { data?: { action?: string } }) => {
        if (e?.data?.action === "check-for-updates") {
          triggerManualUpdateCheck();
        }
      },
    );

    Electrobun.events.on("context-menu-clicked", (action: string) => {
      if (action === "check-for-updates") {
        triggerManualUpdateCheck();
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
  // Electrobun handles urlSchemes from config automatically.
  // Listen for open-url events to route deep links to the renderer.
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
    disposeNativeModules();
  });
}

// ============================================================================
// Bootstrap
// ============================================================================

function initializeBundledWebGPU(): void {
  if (!WGPU.native.available) {
    console.log(
      "[WebGPU] Native Dawn runtime not bundled for this run; renderer-side WebGPU remains available through the webview/browser path.",
    );
    return;
  }

  webgpu.install();
  console.log(`[WebGPU] Native Dawn runtime ready at ${WGPU.native.path}`);
}

async function main(): Promise<void> {
  console.log("[Main] Starting Milady (Electrobun)...");
  const normalizedModuleDir = import.meta.dir.replaceAll("\\", "/");
  // Structured startup environment block — visible in CI logs and milady-startup.log
  console.log(
    `[Env] platform=${process.platform} arch=${process.arch} bun=${Bun.version} ` +
      `execPath=${process.execPath} cwd=${process.cwd()} moduleDir=${import.meta.dir} ` +
      `packaged=${!normalizedModuleDir.includes("/src/")} argv=${process.argv.slice(1).join(" ")}`,
  );
  initializeBundledWebGPU();
  const cleanupFns: Array<() => void> = [];

  cleanupFns.push(
    getAgentManager().onStatusChange((status) => {
      if (currentWindow && status.port) {
        injectApiBase(currentWindow);
      }
    }),
  );

  // Create window first — on Windows (CEF) the UI message loop must be
  // running before any synchronous FFI calls like setApplicationMenu().
  // Calling setupApplicationMenu() before createMainWindow() deadlocks.
  const mainWin = attachMainWindow(await createMainWindow());

  // Set up app menu after the window (and its message loop) exists.
  setupApplicationMenu();

  // If launched with --hidden (e.g. auto-launch with openAsHidden), minimize immediately.
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

  // Set up deep link handling
  setupDeepLinks();

  // Set up system tray with default icon
  const desktop = getDesktopManager();
  try {
    await desktop.createTray({
      icon: path.join(import.meta.dir, "../assets/appIcon.png"),
      tooltip: "Milady",
      title: "Milady",
      menu: [
        { id: "show", label: "Show Milady", type: "normal" },
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

  // Start agent in background
  if (currentWindow) {
    void startAgent(currentWindow);
  }

  // Check for updates
  void setupUpdater();

  // Set up clean shutdown
  setupShutdown(cleanupFns);

  console.log("[Main] Milady started successfully");
}

main().catch((err) => {
  console.error("[Main] Fatal error during startup:", err);
  process.exit(1);
});
