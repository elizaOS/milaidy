/**
 * Milady Desktop App — Electrobun Main Entry
 *
 * Creates the main BrowserWindow, wires up RPC handlers,
 * sets up system tray, application menu, and starts the agent.
 */

import fs from "node:fs";
import { createServer as createNetServer } from "node:net";
import os from "node:os";
import path from "node:path";
import Electrobun, {
  ApplicationMenu,
  BrowserWindow,
  Updater,
  Utils,
  WGPU,
  webgpu,
} from "electrobun/bun";
import {
  pushApiBaseToRenderer,
  resolveDesktopRuntimeMode,
  resolveInitialApiBase,
} from "./api-base";
import {
  buildApplicationMenu,
  EMPTY_HEARTBEAT_MENU_SNAPSHOT,
  type HeartbeatMenuSnapshot,
} from "./application-menu";
import { showBackgroundNoticeOnce } from "./background-notice";
import {
  type CloudAuthWindowLike,
  CloudAuthWindowManager,
  readNavigationEventUrl,
} from "./cloud-auth-window";
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
import { checkWebGpuSupport } from "./native/webgpu-browser-support";
import { readBuiltPreloadScript } from "./preload-validation";
import { registerRpcHandlers } from "./rpc-handlers";
import { PUSH_CHANNEL_TO_RPC_MESSAGE } from "./rpc-schema";
import {
  isDetachedSurface,
  type ManagedWindowLike,
  SurfaceWindowManager,
} from "./surface-windows";

type SendToWebview = (message: string, payload?: unknown) => void;

type HeartbeatMenuTriggerSummary = {
  enabled: boolean;
  nextRunAtMs?: number;
  lastRunAtIso?: string;
};

type HeartbeatMenuHealthResponse = {
  activeTriggers?: number;
  totalExecutions?: number;
  totalFailures?: number;
  lastExecutionAt?: number;
};

const HEARTBEAT_MENU_REFRESH_MS = 30_000;
const CONFIG_EXPORT_FILE_NAME = "milady-config.json";
let heartbeatMenuSnapshot: HeartbeatMenuSnapshot =
  EMPTY_HEARTBEAT_MENU_SNAPSHOT;
let heartbeatMenuRefreshTimer: ReturnType<typeof setInterval> | null = null;

// ============================================================================
// App Menu
// ============================================================================

function setupApplicationMenu(): void {
  const isMac = process.platform === "darwin";
  const menu = buildApplicationMenu({
    isMac,
    heartbeatSnapshot: heartbeatMenuSnapshot,
    detachedWindows: surfaceWindowManager?.listWindows() ?? [],
  });
  ApplicationMenu.setApplicationMenu(
    menu as unknown as Parameters<typeof ApplicationMenu.setApplicationMenu>[0],
  );
}

function summarizeDesktopActionError(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : fallback;
  const trimmed = message.trim();
  if (!trimmed) return fallback;
  return trimmed.length > 80 ? `${trimmed.slice(0, 77)}...` : trimmed;
}

function summarizeHeartbeatMenuError(error: unknown): string {
  return summarizeDesktopActionError(error, "Heartbeat status unavailable");
}

function buildApiRequestHeaders(contentType?: string): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (contentType) {
    headers["Content-Type"] = contentType;
  }
  const apiToken = process.env.MILADY_API_TOKEN?.trim();
  if (apiToken) {
    headers.Authorization = `Bearer ${apiToken}`;
  }
  return headers;
}

function resolveHeartbeatMenuApiBase(): string | null {
  const port = getAgentManager().getStatus().port;
  if (typeof port === "number" && port > 0) {
    return `http://127.0.0.1:${port}`;
  }
  return resolveInitialApiBase(process.env);
}

async function fetchHeartbeatMenuSnapshot(
  apiBase: string,
): Promise<HeartbeatMenuSnapshot> {
  const headers = buildApiRequestHeaders();

  const [triggersResponse, healthResponse] = await Promise.all([
    fetch(`${apiBase}/api/triggers`, { headers }),
    fetch(`${apiBase}/api/triggers/health`, { headers }),
  ]);

  if (!triggersResponse.ok) {
    throw new Error(`Trigger list failed (${triggersResponse.status})`);
  }
  if (!healthResponse.ok) {
    throw new Error(`Trigger health failed (${healthResponse.status})`);
  }

  const triggersPayload = (await triggersResponse.json()) as {
    triggers?: HeartbeatMenuTriggerSummary[];
  };
  const healthPayload =
    (await healthResponse.json()) as HeartbeatMenuHealthResponse;

  const triggers = Array.isArray(triggersPayload.triggers)
    ? triggersPayload.triggers
    : [];
  const enabledTriggers = triggers.filter((trigger) => trigger.enabled);

  const nextRunCandidates = enabledTriggers
    .map((trigger) =>
      typeof trigger.nextRunAtMs === "number" ? trigger.nextRunAtMs : null,
    )
    .filter((value): value is number => typeof value === "number");

  const lastRunCandidates = triggers
    .map((trigger) => {
      if (!trigger.lastRunAtIso) return null;
      const parsed = Date.parse(trigger.lastRunAtIso);
      return Number.isNaN(parsed) ? null : parsed;
    })
    .filter((value): value is number => typeof value === "number");

  return {
    loading: false,
    error: null,
    totalHeartbeats: triggers.length,
    activeHeartbeats:
      typeof healthPayload.activeTriggers === "number"
        ? healthPayload.activeTriggers
        : enabledTriggers.length,
    totalExecutions:
      typeof healthPayload.totalExecutions === "number"
        ? healthPayload.totalExecutions
        : 0,
    totalFailures:
      typeof healthPayload.totalFailures === "number"
        ? healthPayload.totalFailures
        : 0,
    lastRunAtMs:
      typeof healthPayload.lastExecutionAt === "number"
        ? healthPayload.lastExecutionAt
        : lastRunCandidates.length > 0
          ? Math.max(...lastRunCandidates)
          : null,
    nextRunAtMs:
      nextRunCandidates.length > 0 ? Math.min(...nextRunCandidates) : null,
  };
}

async function refreshHeartbeatMenuSnapshot(): Promise<void> {
  const apiBase = resolveHeartbeatMenuApiBase();
  if (!apiBase) {
    heartbeatMenuSnapshot = {
      ...heartbeatMenuSnapshot,
      loading: false,
      error: "Agent unavailable",
    };
    setupApplicationMenu();
    return;
  }

  try {
    heartbeatMenuSnapshot = await fetchHeartbeatMenuSnapshot(apiBase);
  } catch (error) {
    heartbeatMenuSnapshot = {
      ...heartbeatMenuSnapshot,
      loading: false,
      error: summarizeHeartbeatMenuError(error),
    };
  }

  setupApplicationMenu();
}

function startHeartbeatMenuRefresh(): void {
  if (heartbeatMenuRefreshTimer) return;
  void refreshHeartbeatMenuSnapshot();
  heartbeatMenuRefreshTimer = setInterval(() => {
    void refreshHeartbeatMenuSnapshot();
  }, HEARTBEAT_MENU_REFRESH_MS);
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
let surfaceWindowManager: SurfaceWindowManager | null = null;
let cloudAuthWindowManager: CloudAuthWindowManager | null = null;
let rendererUrlPromise: Promise<string> | null = null;
let backgroundWindowPromise: Promise<void> | null = null;
let isQuitting = false;
let lastFocusedWindow: ManagedWindowLike | null = null;

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
    ".gz": "application/octet-stream",
    ".wasm": "application/wasm",
    ".glb": "model/gltf-binary",
    ".gltf": "model/gltf+json",
  };

  // Determine the expected agent API base URL so we can inject it into the
  // HTML before the renderer JS runs. This prevents a 404 fatal-error loop
  // where the renderer fetches /api/auth/status relative to the static server.
  // If the agent falls back to a dynamic port, apiBaseUpdate messages will
  // update window.__MILADY_API_BASE__ and the client will pick it up lazily.
  const initialApiBase = resolveInitialApiBase(
    process.env as Record<string, string | undefined>,
  );

  // Inject the API base into index.html so it's available before React mounts.
  function injectApiBaseIntoHtml(html: string): string {
    if (!initialApiBase) {
      return html;
    }
    const script = `<script>window.__MILADY_API_BASE__=${JSON.stringify(initialApiBase)};</script>`;
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

      let isGzipped = false;
      let requestedExt = path.extname(filePath);

      // Check for pre-compressed .gz file if the uncompressed file doesn't exist
      if (!fs.existsSync(filePath) && fs.existsSync(`${filePath}.gz`)) {
        filePath = `${filePath}.gz`;
        isGzipped = true;
      }

      // SPA fallback — serve index.html for unknown paths
      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        filePath = path.join(rendererDir, "index.html");
        requestedExt = ".html";
        isGzipped = false;
      }

      try {
        const content = fs.readFileSync(filePath);
        // Inject API base into HTML responses
        if (requestedExt === ".html" || filePath.endsWith("index.html")) {
          const html = injectApiBaseIntoHtml(content.toString("utf8"));
          return new Response(html, {
            headers: {
              "Content-Type": "text/html; charset=utf-8",
              "Access-Control-Allow-Origin": "*",
            },
          });
        }

        const headers: Record<string, string> = {
          "Content-Type": mimeTypes[requestedExt] ?? "application/octet-stream",
          "Access-Control-Allow-Origin": "*",
        };

        if (isGzipped) {
          headers["Content-Encoding"] = "gzip";
        }

        return new Response(content, { headers });
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
  // setting up Milady's direct Electrobun RPC bridge on the window.
  const preload = readBuiltPreloadScript(import.meta.dir);

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
  trackFocusedWindow(win);

  win.webview.on("dom-ready", () => {
    injectApiBase(win);
  });

  // Prevent the main webview from navigating to external URLs.
  // The renderer is always served from localhost — any other navigation
  // (e.g. from a compromised plugin) should open in the default browser.
  win.webview.on("will-navigate", (event: unknown) => {
    const e = event as {
      url?: string;
      data?: { detail?: string };
      preventDefault?: () => void;
    };
    const url = readNavigationEventUrl(e);
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
            } catch {
              // Ignore external open failures during navigation blocking.
            }
          })
          .catch(() => {});
      }
    } catch {
      // Unparseable URL — block it.
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
  if (isQuitting || currentWindow || backgroundWindowPromise) {
    return;
  }

  backgroundWindowPromise = (async () => {
    const replacementWindow = attachMainWindow(await createMainWindow());
    try {
      replacementWindow.minimize();
      console.log("[Main] Recreated minimized window after close");
      showBackgroundRunNoticeOnce();
    } catch (err) {
      console.warn("[Main] Failed to minimize background window:", err);
    }
    injectApiBase(replacementWindow);
  })().finally(() => {
    backgroundWindowPromise = null;
  });

  await backgroundWindowPromise;
}

function showBackgroundRunNoticeOnce(): void {
  try {
    showBackgroundNoticeOnce({
      fileSystem: fs,
      userDataDir: Utils.paths.userData,
      showNotification: (options) => {
        Utils.showNotification(options);
      },
    });
  } catch (error) {
    console.warn("[Main] Failed to persist background notice marker:", error);
  }
}

// ============================================================================
// Settings Window
// ============================================================================

async function createSettingsWindow(tabHint?: string): Promise<void> {
  if (!surfaceWindowManager) return;
  await surfaceWindowManager.openSettingsWindow(tabHint);
}

function showMainSurface(surface: string): void {
  void getDesktopManager().showWindow();
  sendToActiveRenderer("desktopTrayMenuClick", {
    itemId: `show-main:${surface}`,
  });
}

function resolveDefaultDialogPath(): string {
  const downloadsPath = path.join(os.homedir(), "Downloads");
  return fs.existsSync(downloadsPath) ? downloadsPath : os.homedir();
}

async function exportConfigFromMenu(): Promise<void> {
  const apiBase = resolveHeartbeatMenuApiBase();
  if (!apiBase) {
    Utils.showNotification({
      title: "Config Export Failed",
      body: "Agent unavailable",
    });
    return;
  }

  try {
    const response = await fetch(`${apiBase}/api/config`, {
      headers: buildApiRequestHeaders(),
    });
    if (!response.ok) {
      throw new Error(`Config fetch failed (${response.status})`);
    }

    const config = await response.json();
    const dialog = await getDesktopManager().showSaveDialog({
      defaultPath: resolveDefaultDialogPath(),
      allowedFileTypes: "json",
    });
    if (dialog.canceled || dialog.filePaths.length === 0) {
      return;
    }

    const outputPath = path.join(dialog.filePaths[0], CONFIG_EXPORT_FILE_NAME);
    fs.writeFileSync(
      outputPath,
      `${JSON.stringify(config, null, 2)}\n`,
      "utf8",
    );

    Utils.showNotification({
      title: "Config Exported",
      body: `Saved to ${outputPath}`,
    });
  } catch (error) {
    Utils.showNotification({
      title: "Config Export Failed",
      body: summarizeDesktopActionError(error, "Config export failed"),
    });
  }
}

async function importConfigFromMenu(): Promise<void> {
  const apiBase = resolveHeartbeatMenuApiBase();
  if (!apiBase) {
    Utils.showNotification({
      title: "Config Import Failed",
      body: "Agent unavailable",
    });
    return;
  }

  try {
    const dialog = await getDesktopManager().showOpenDialog({
      defaultPath: resolveDefaultDialogPath(),
      allowedFileTypes: "json",
      canChooseFiles: true,
      canChooseDirectory: false,
      allowsMultipleSelection: false,
    });
    if (dialog.canceled || dialog.filePaths.length === 0) {
      return;
    }

    const inputPath = dialog.filePaths[0];
    const rawConfig = fs.readFileSync(inputPath, "utf8");
    const parsedConfig = JSON.parse(rawConfig) as unknown;
    if (
      typeof parsedConfig !== "object" ||
      parsedConfig === null ||
      Array.isArray(parsedConfig)
    ) {
      throw new Error("Config file must contain a JSON object");
    }

    const response = await fetch(`${apiBase}/api/config`, {
      method: "PUT",
      headers: buildApiRequestHeaders("application/json"),
      body: JSON.stringify(parsedConfig),
    });
    if (!response.ok) {
      throw new Error(`Config import failed (${response.status})`);
    }

    Utils.showNotification({
      title: "Config Imported",
      body: `Loaded ${path.basename(inputPath)}`,
    });
  } catch (error) {
    Utils.showNotification({
      title: "Config Import Failed",
      body: summarizeDesktopActionError(error, "Config import failed"),
    });
  }
}

function trackFocusedWindow(window: ManagedWindowLike): void {
  lastFocusedWindow = window;
  window.on("focus", () => {
    lastFocusedWindow = window;
  });
}

function toggleFocusedWindowDevTools(): void {
  const targetWindow = lastFocusedWindow ?? currentWindow;
  const webview = targetWindow?.webview as
    | {
        toggleDevTools?: () => void;
        openDevTools?: () => void;
      }
    | undefined;

  if (typeof webview?.toggleDevTools === "function") {
    webview.toggleDevTools();
    return;
  }

  if (typeof webview?.openDevTools === "function") {
    webview.openDevTools();
    return;
  }

  Utils.showNotification({
    title: "Developer Tools Unavailable",
    body: "The focused window does not expose Electrobun devtools controls.",
  });
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
  const rpc = win.webview.rpc as ElectrobunRpcInstance | undefined;

  // Create the sendToWebview callback that native modules use to push events.
  // Uses typed RPC push messages instead of JS evaluation.
  const sendToWebview = (message: string, payload?: unknown): void => {
    // Resolve via map (legacy colon-separated format) or use message directly
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

/**
 * Wire RPC handlers on a secondary window (e.g. settings) without calling
 * initializeNativeModules — avoids overwriting the main window reference on
 * DesktopManager and other singletons.
 */
function wireSettingsRpc(win: BrowserWindow): void {
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
    console.warn(
      `[sendToWebview:settings] No RPC method for message: ${message}`,
    );
  };

  // Register request handlers on the settings window's RPC — reuses the same
  // handler registry but does not touch native module singletons.
  registerRpcHandlers(rpc, sendToWebview);
}

// ============================================================================
// API Base Injection
// ============================================================================

function injectApiBase(win: BrowserWindow): void {
  const runtimeResolution = resolveDesktopRuntimeMode(
    process.env as Record<string, string | undefined>,
  );

  if (runtimeResolution.externalApi.invalidSources.length > 0) {
    console.warn(
      `[Main] Invalid API base env vars: ${runtimeResolution.externalApi.invalidSources.join(", ")}`,
    );
  }

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

async function _startAgent(win: BrowserWindow): Promise<void> {
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
        const action = e?.data?.action;
        if (action === "check-for-updates") {
          triggerManualUpdateCheck();
        } else if (action === "export-config") {
          void exportConfigFromMenu();
        } else if (action === "import-config") {
          void importConfigFromMenu();
        } else if (action === "toggle-devtools") {
          toggleFocusedWindowDevTools();
        } else if (action === "refresh-heartbeats") {
          void refreshHeartbeatMenuSnapshot();
        } else if (action === "relaunch") {
          void getDesktopManager().relaunch();
        } else if (action === "open-settings") {
          void createSettingsWindow();
        } else if (action?.startsWith("open-settings-")) {
          void createSettingsWindow(action);
        } else if (action?.startsWith("new-window:")) {
          const surface = action.slice("new-window:".length);
          if (surfaceWindowManager && isDetachedSurface(surface)) {
            void surfaceWindowManager.openSurfaceWindow(surface);
          }
        } else if (action?.startsWith("focus-window:")) {
          const windowId = action.slice("focus-window:".length);
          surfaceWindowManager?.focusWindow(windowId);
        } else if (action?.startsWith("show-main:")) {
          const surface = action.slice("show-main:".length);
          showMainSurface(surface);
        } else if (action === "restart-agent") {
          getAgentManager()
            .restart()
            .catch((err: unknown) => {
              console.error("[Main] Agent restart failed:", err);
            });
        } else if (action === "show") {
          void getDesktopManager().showWindow();
        } else if (action?.startsWith("navigate-")) {
          // Show main window + push tab change to renderer
          void getDesktopManager().showWindow();
          sendToActiveRenderer("desktopTrayMenuClick", { itemId: action });
        }
      },
    );

    Electrobun.events.on("context-menu-clicked", (action: string) => {
      if (action === "check-for-updates") {
        triggerManualUpdateCheck();
      } else if (action === "refresh-heartbeats") {
        void refreshHeartbeatMenuSnapshot();
      } else if (action === "relaunch") {
        void getDesktopManager().relaunch();
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

/**
 * Check WebGPU availability in the webview browser and push status to renderer.
 * On macOS 26+ with native renderer, WebGPU is available via WKWebView.
 * On Linux/Windows with CEF, upstream Electrobun support is needed.
 */
function checkWebGpuBrowserSupport(): void {
  const status = checkWebGpuSupport();
  if (status.available) {
    console.log(`[WebGPU Browser] ${status.reason}`);
  } else {
    console.warn(`[WebGPU Browser] ${status.reason}`);
    if (status.chromeBetaPath) {
      console.log(
        `[WebGPU Browser] Chrome Beta found at: ${status.chromeBetaPath}`,
      );
    } else if (status.downloadUrl) {
      console.log(
        `[WebGPU Browser] Download Chrome Beta: ${status.downloadUrl}`,
      );
    }
  }

  // Push status to renderer after a short delay to allow window creation.
  setTimeout(() => {
    sendToActiveRenderer("webgpu:browserStatus", status);
  }, 2000);
}

async function main(): Promise<void> {
  console.log("[Main] Starting Milady (Electrobun)...");
  const normalizedModuleDir = import.meta.dir.replaceAll("\\", "/");
  const runtimeResolution = resolveDesktopRuntimeMode(
    process.env as Record<string, string | undefined>,
  );
  // Structured startup environment block — visible in CI logs and milady-startup.log
  console.log(
    `[Env] platform=${process.platform} arch=${process.arch} bun=${Bun.version} ` +
      `execPath=${process.execPath} cwd=${process.cwd()} moduleDir=${import.meta.dir} ` +
      `packaged=${!normalizedModuleDir.includes("/src/")} argv=${process.argv.slice(1).join(" ")}`,
  );
  console.log(
    `[Env] desktopRuntimeMode=${runtimeResolution.mode} externalApi=${runtimeResolution.externalApi.base ?? "none"}`,
  );
  initializeBundledWebGPU();
  checkWebGpuBrowserSupport();
  const cleanupFns: Array<() => void> = [];

  cleanupFns.push(
    getAgentManager().onStatusChange((status) => {
      if (currentWindow && status.port) {
        injectApiBase(currentWindow);
      }
      void refreshHeartbeatMenuSnapshot();
    }),
  );

  // Create window first — on Windows (CEF) the UI message loop must be
  // running before any synchronous FFI calls like setApplicationMenu().
  // Calling setupApplicationMenu() before createMainWindow() deadlocks.
  const mainWin = attachMainWindow(await createMainWindow());

  surfaceWindowManager = new SurfaceWindowManager({
    createWindow: (options) =>
      new BrowserWindow(options) as unknown as ManagedWindowLike,
    resolveRendererUrl,
    readPreload: () => readBuiltPreloadScript(import.meta.dir),
    wireRpc: (window) => wireSettingsRpc(window as unknown as BrowserWindow),
    injectApiBase: (window) =>
      injectApiBase(window as unknown as BrowserWindow),
    onWindowFocused: (window) => {
      lastFocusedWindow = window;
    },
    onRegistryChanged: () => setupApplicationMenu(),
  });
  cloudAuthWindowManager = new CloudAuthWindowManager({
    createWindow: (options) =>
      new BrowserWindow(options) as unknown as CloudAuthWindowLike,
    onWindowFocused: (window) => {
      lastFocusedWindow = window as unknown as ManagedWindowLike;
    },
  });

  // Set up app menu after the window (and its message loop) exists.
  setupApplicationMenu();
  startHeartbeatMenuRefresh();
  cleanupFns.push(() => {
    if (heartbeatMenuRefreshTimer) {
      clearInterval(heartbeatMenuRefreshTimer);
      heartbeatMenuRefreshTimer = null;
    }
  });

  // Wire settings window callback so menus and RPC can open it.
  getDesktopManager().setOpenSettingsCallback(() => {
    void createSettingsWindow();
  });
  getDesktopManager().setOpenExternalHandler((url) => {
    return cloudAuthWindowManager?.open(url) ?? false;
  });

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
        { id: "navigate-triggers", label: "Open Heartbeats", type: "normal" },
        {
          id: "refresh-heartbeats",
          label: "Refresh Heartbeats",
          type: "normal",
        },
        { id: "sep1b", type: "separator" },
        { id: "check-for-updates", label: "Check for Updates", type: "normal" },
        { id: "sep2", type: "separator" },
        { id: "restart-agent", label: "Restart Agent", type: "normal" },
        { id: "relaunch", label: "Relaunch Milady", type: "normal" },
        { id: "sep3", type: "separator" },
        { id: "quit", label: "Quit", type: "normal" },
      ],
    });
  } catch (err) {
    console.warn("[Main] Tray creation failed:", err);
  }

  // Agent startup is now deferred until after onboarding completes.
  // The renderer triggers agent start via the `agentStart` RPC handler
  // when the user selects local mode and finishes onboarding.
  // For sandbox/remote modes, no embedded agent is needed — the renderer
  // connects directly to the cloud or remote API base.
  //
  // However, if an external API base is configured via env vars (e.g.
  // MILADY_DESKTOP_API_BASE), inject it immediately so the renderer can
  // connect without onboarding a local agent.
  if (currentWindow) {
    const rt = resolveDesktopRuntimeMode(
      process.env as Record<string, string | undefined>,
    );
    if (rt.mode === "external" && rt.externalApi.base) {
      pushApiBaseToRenderer(
        currentWindow,
        rt.externalApi.base,
        process.env.MILADY_API_TOKEN,
      );
    }
  }

  // Check for updates
  void setupUpdater();

  // Set up clean shutdown
  setupShutdown(cleanupFns);

  console.log("[Main] Milady started successfully");
}

main().catch((err) => {
  const msg = `[Main] Fatal error during startup: ${err?.stack ?? err}`;
  console.error(msg);
  // Write to startup log so it's visible even without a console
  try {
    const logDir =
      process.platform === "win32"
        ? path.join(process.env.APPDATA ?? "", "Milady")
        : path.join(os.homedir(), ".config", "Milady");
    fs.mkdirSync(logDir, { recursive: true });
    fs.appendFileSync(
      path.join(logDir, "milady-startup.log"),
      `[${new Date().toISOString()}] ${msg}\n`,
    );
  } catch {}
  process.exit(1);
});
