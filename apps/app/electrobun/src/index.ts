/**
 * Milady Desktop App — Electrobun Main Entry
 *
 * Creates the main BrowserWindow, wires up RPC handlers,
 * sets up system tray, application menu, and starts the agent.
 */

import path from "node:path";
import {
  BrowserWindow,
  Electrobun,
  Updater,
  setApplicationMenu,
} from "electrobun/bun";
import { registerRpcHandlers } from "./rpc-handlers";
import { initializeNativeModules, disposeNativeModules } from "./native/index";
import { getAgentManager } from "./native/agent";
import { getDesktopManager } from "./native/desktop";
import {
  resolveExternalApiBase,
  createApiBaseInjectionScript,
} from "./api-base";

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
  // Dispatches to the listener registry in the renderer via JS evaluation.
  const sendToWebview = (message: string, payload?: unknown): void => {
    const payloadJson = JSON.stringify(payload ?? null);
    const messageJson = JSON.stringify(message);
    const script = `
      if (window.__MILADY_RPC_LISTENERS__) {
        var listeners = window.__MILADY_RPC_LISTENERS__[${messageJson}];
        if (listeners) {
          var p = ${payloadJson};
          listeners.forEach(function(fn) { try { fn(p); } catch(e) { console.error(e); } });
        }
      }
    `;
    view.rpc?.requestProxy
      .evaluateJavascriptWithResponse({ script })
      .catch(() => {});
  };

  // Initialize native modules with window + sendToWebview
  initializeNativeModules(win, sendToWebview);

  // Register RPC handlers on the webview
  registerRpcHandlers(view as any);
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

  // If we have an external API base, inject it. Otherwise, the agent's
  // embedded server URL will be injected once the agent starts.
  if (resolution.base) {
    const script = createApiBaseInjectionScript(
      resolution.base,
      process.env.MILADY_API_TOKEN,
    );
    win.webview.rpc?.requestProxy
      .evaluateJavascriptWithResponse({ script })
      .catch(() => {
        // Window not ready
      });
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
    // inject the agent's local API base
    if (status.state === "running" && status.port) {
      const resolution = resolveExternalApiBase(
        process.env as Record<string, string | undefined>,
      );
      if (!resolution.base) {
        const localBase = `http://localhost:${status.port}`;
        const script = createApiBaseInjectionScript(localBase);
        win.webview.rpc?.requestProxy
          .evaluateJavascriptWithResponse({ script })
          .catch(() => {});
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
    const payload = JSON.stringify({ url });
    const script = `
      if (window.__MILADY_RPC_LISTENERS__) {
        var listeners = window.__MILADY_RPC_LISTENERS__["shareTargetReceived"];
        if (listeners) {
          listeners.forEach(function(fn) { try { fn(${payload}); } catch(e) {} });
        }
      }
    `;
    win.webview.rpc?.requestProxy
      .evaluateJavascriptWithResponse({ script })
      .catch(() => {});
  });
}

// ============================================================================
// Shutdown
// ============================================================================

function setupShutdown(): void {
  Electrobun.events.on("will-quit", () => {
    console.log("[Main] App quitting, disposing native modules...");
    disposeNativeModules();
  });
}

// ============================================================================
// Bootstrap
// ============================================================================

async function main(): Promise<void> {
  console.log("[Main] Starting Milady (Electrobun)...");

  // Set up app menu
  setupApplicationMenu();

  // Create main window
  const win = await createMainWindow();

  // Wire RPC handlers and native modules
  wireRpcAndModules(win);

  // Set up deep link handling
  setupDeepLinks(win);

  // Inject API base on dom-ready
  win.webview.on("dom-ready", () => {
    injectApiBase(win);
  });

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
  setupShutdown();

  console.log("[Main] Milady started successfully");
}

main().catch((err) => {
  console.error("[Main] Fatal error during startup:", err);
  process.exit(1);
});
