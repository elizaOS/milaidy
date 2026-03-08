/**
 * Milady Desktop App — Electrobun Main Entry
 *
 * Creates the main BrowserWindow, wires up RPC handlers,
 * sets up system tray, application menu, and starts the agent.
 */

import path from "node:path";
import {
  type BrowserView,
  BrowserWindow,
  Electrobun,
  setApplicationMenu,
  Updater,
} from "electrobun/bun";
import { pushApiBaseToRenderer, resolveExternalApiBase } from "./api-base";
import { getAgentManager } from "./native/agent";
import { getDesktopManager } from "./native/desktop";
import { disposeNativeModules, initializeNativeModules } from "./native/index";
import { registerRpcHandlers } from "./rpc-handlers";
import {
  type MiladyRPCSchema,
  PUSH_CHANNEL_TO_RPC_MESSAGE,
} from "./rpc-schema";

// ============================================================================
// App Menu
// ============================================================================

function setupApplicationMenu(): void {
  setApplicationMenu([
    {
      label: "Milady",
      submenu: [
        { role: "about" },
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
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
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
        { type: "separator" },
        { role: "front" },
      ],
    },
  ]);
}

// ============================================================================
// Main Window
// ============================================================================

async function createMainWindow(): Promise<BrowserWindow> {
  // Resolve the renderer URL
  const rendererUrl =
    process.env.MILADY_RENDERER_URL ??
    process.env.VITE_DEV_SERVER_URL ??
    `file://${path.resolve(import.meta.dir, "../renderer/index.html")}`;

  const win = new BrowserWindow({
    title: "Milady",
    url: rendererUrl,
    frame: {
      width: 1200,
      height: 800,
      x: undefined, // Let the OS place it
      y: undefined,
    },
  });

  return win;
}

// ============================================================================
// RPC + Native Module Wiring
// ============================================================================

function wireRpcAndModules(win: BrowserWindow): void {
  const view = win.webview;

  // Create the sendToWebview callback that native modules use to push events.
  // Uses typed RPC push messages instead of JS evaluation.
  const sendToWebview = (message: string, payload?: unknown): void => {
    const rpcMessage = PUSH_CHANNEL_TO_RPC_MESSAGE[message];
    if (rpcMessage && view.rpc?.sendMessage) {
      const sender = (
        view.rpc.sendMessage as Record<
          string,
          ((p: unknown) => void) | undefined
        >
      )[rpcMessage];
      if (sender) {
        sender(payload ?? null);
        return;
      }
    }
    // If no RPC mapping exists, log a warning instead of falling back to eval
    console.warn(`[sendToWebview] No RPC mapping for message: ${message}`);
  };

  // Initialize native modules with window + sendToWebview
  initializeNativeModules(win, sendToWebview);

  // Register RPC handlers on the webview
  registerRpcHandlers(view as unknown as BrowserView<MiladyRPCSchema>);
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
    pushApiBaseToRenderer(win, `http://localhost:${port}`);
  }
}

// ============================================================================
// Agent Startup
// ============================================================================

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
        pushApiBaseToRenderer(win, `http://localhost:${status.port}`);
      }
    }
  } catch (err) {
    console.error("[Main] Agent start failed:", err);
  }
}

// ============================================================================
// Auto-Updater
// ============================================================================

function setupUpdater(): void {
  try {
    Updater.checkForUpdate();
  } catch {
    // Updater may not be available in dev mode
  }
}

// ============================================================================
// Deep Link Handling
// ============================================================================

function setupDeepLinks(win: BrowserWindow): void {
  // Electrobun handles urlSchemes from config automatically.
  // Listen for open-url events to route deep links to the renderer.
  Electrobun.events.on("open-url", (url: string) => {
    if (win.webview.rpc?.sendMessage?.shareTargetReceived) {
      win.webview.rpc.sendMessage.shareTargetReceived({ url });
    }
  });
}

// ============================================================================
// Shutdown
// ============================================================================

function setupShutdown(apiBaseInterval: ReturnType<typeof setInterval>): void {
  Electrobun.events.on("will-quit", () => {
    console.log("[Main] App quitting, disposing native modules...");
    clearInterval(apiBaseInterval);
    disposeNativeModules();
  });
}

// ============================================================================
// Bootstrap
// ============================================================================

async function main(): Promise<void> {
  console.log("[Main] Starting Milady (Electrobun)...");

  // Create main window first — on Windows, CEF's event loop is not running
  // until the first native window is created. Calling setApplicationMenu()
  // before that point causes the native FFI call to deadlock waiting for the
  // UI thread. Always create the window before touching any menu APIs.
  const win = await createMainWindow();

  // Set up app menu (must be after createMainWindow on Windows)
  // Guard macOS-only roles so Windows doesn't receive unknown role strings.
  if (process.platform !== "win32") {
    setupApplicationMenu();
  }

  // Wire RPC handlers and native modules
  wireRpcAndModules(win);

  // Set up deep link handling
  setupDeepLinks(win);

  // Inject API base on dom-ready and re-inject periodically so reloads
  // always receive the current value (the push message is idempotent).
  win.webview.on("dom-ready", () => {
    injectApiBase(win);
  });

  const apiBaseInterval = setInterval(() => {
    injectApiBase(win);
  }, 5_000);

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
        { id: "quit", label: "Quit", type: "normal" },
      ],
    });
  } catch (err) {
    console.warn("[Main] Tray creation failed:", err);
  }

  // Handle tray menu clicks via Electrobun's global event bus
  Electrobun.events.on("context-menu-clicked", (action: string) => {
    if (action === "show") {
      win.show();
      win.focus();
    } else if (action === "quit") {
      disposeNativeModules();
      process.exit(0);
    }
  });

  // Start agent in background
  startAgent(win);

  // Check for updates
  setupUpdater();

  // Set up clean shutdown
  setupShutdown(apiBaseInterval);

  console.log("[Main] Milady started successfully");
}

main().catch((err) => {
  console.error("[Main] Fatal error during startup:", err);
  process.exit(1);
});
