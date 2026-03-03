/**
 * Milady Capacitor App Entry Point
 *
 * This file initializes the Capacitor runtime, sets up platform-specific
 * features, and mounts the React application.
 */

import "./styles.css";

import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { Keyboard } from "@capacitor/keyboard";
import { StatusBar, Style } from "@capacitor/status-bar";
// Import the agent plugin
import { Agent } from "@milady/capacitor-agent";
import { Desktop } from "@milady/capacitor-desktop";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { AppProvider } from "./AppContext";
// Import Capacitor bridge utilities
import { initializeCapacitorBridge } from "./bridge/capacitor-bridge";
import { initializeStorageBridge } from "./bridge/storage-bridge";

/**
 * Platform detection utilities
 */
const platform = Capacitor.getPlatform();
const isNative = Capacitor.isNativePlatform();
const isIOS = platform === "ios";
const isAndroid = platform === "android";
const isElectron = platform === "electron";
const isWeb = platform === "web";

interface ShareTargetFile {
  name: string;
  path?: string;
}

interface ShareTargetPayload {
  source?: string;
  title?: string;
  text?: string;
  url?: string;
  files?: ShareTargetFile[];
}

declare global {
  interface Window {
    __MILADY_SHARE_QUEUE__?: ShareTargetPayload[];
  }
}

function dispatchShareTarget(payload: ShareTargetPayload): void {
  if (!window.__MILADY_SHARE_QUEUE__) {
    window.__MILADY_SHARE_QUEUE__ = [];
  }
  window.__MILADY_SHARE_QUEUE__.push(payload);
  document.dispatchEvent(
    new CustomEvent("milady:share-target", {
      detail: payload,
    }),
  );
}

/**
 * Initialize the agent plugin.
 *
 * Used for web/mobile plugin fallback status checks.
 */
async function initializeAgent(): Promise<void> {
  try {
    const status = await Agent.getStatus();
    console.log(
      `[Milady] Agent status: ${status.state}`,
      status.agentName ?? "",
    );

    // Dispatch event so the UI knows the agent is available
    document.dispatchEvent(
      new CustomEvent("milady:agent-ready", { detail: status }),
    );
  } catch (err) {
    console.warn(
      "[Milady] Agent not available:",
      err instanceof Error ? err.message : err,
    );
  }
}

/**
 * Initialize platform-specific features
 */
async function initializePlatform(): Promise<void> {
  // Initialize storage bridge (replaces localStorage with Preferences on native)
  await initializeStorageBridge();

  // Initialize the Capacitor bridge for native plugin access
  initializeCapacitorBridge();

  if (isIOS || isAndroid) {
    // Configure status bar for mobile platforms (not available on Electron)
    await initializeStatusBar();

    // Configure keyboard behavior
    await initializeKeyboard();

    // Handle app lifecycle events
    initializeAppLifecycle();
  }

  if (isElectron) {
    // Electron-specific initialization
    await initializeElectron();
  } else {
    // On Electron the main process owns runtime startup; avoid an extra early
    // plugin status probe that can race backend boot and spam fetch errors.
    await initializeAgent();
  }
}

/**
 * Configure the native status bar
 */
async function initializeStatusBar(): Promise<void> {
  // Set dark style for dark theme
  await StatusBar.setStyle({ style: Style.Dark });

  if (isAndroid) {
    // Make status bar overlay content on Android
    await StatusBar.setOverlaysWebView({ overlay: true });
    await StatusBar.setBackgroundColor({ color: "#0a0a0a" });
  }
}

/**
 * Configure keyboard behavior on native platforms
 */
async function initializeKeyboard(): Promise<void> {
  if (isIOS) {
    // Disable auto-scroll on iOS when keyboard appears
    await Keyboard.setScroll({ isDisabled: true });

    // Set keyboard accessory bar visibility
    await Keyboard.setAccessoryBarVisible({ isVisible: true });
  }

  // Listen for keyboard events
  Keyboard.addListener("keyboardWillShow", (info) => {
    document.body.style.setProperty(
      "--keyboard-height",
      `${info.keyboardHeight}px`,
    );
    document.body.classList.add("keyboard-open");
  });

  Keyboard.addListener("keyboardWillHide", () => {
    document.body.style.setProperty("--keyboard-height", "0px");
    document.body.classList.remove("keyboard-open");
  });
}

/**
 * Handle app lifecycle events (pause, resume, back button)
 */
function initializeAppLifecycle(): void {
  // Handle app state changes
  CapacitorApp.addListener("appStateChange", ({ isActive }) => {
    if (isActive) {
      // App came to foreground - refresh data if needed
      document.dispatchEvent(new CustomEvent("milady:app-resume"));
    } else {
      // App went to background
      document.dispatchEvent(new CustomEvent("milady:app-pause"));
    }
  });

  // Handle Android back button
  CapacitorApp.addListener("backButton", ({ canGoBack }) => {
    if (canGoBack) {
      window.history.back();
    }
  });

  // Handle deep links
  CapacitorApp.addListener("appUrlOpen", ({ url }) => {
    handleDeepLink(url);
  });

  // Check if app was opened via deep link
  CapacitorApp.getLaunchUrl().then((result) => {
    if (result?.url) {
      handleDeepLink(result.url);
    }
  });
}

/**
 * Handle deep links (milady:// URLs)
 */
function handleDeepLink(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return;
  }

  // Handle different deep link paths
  if (parsed.protocol === "milady:") {
    const path = (parsed.pathname || parsed.host || "").replace(/^\/+/, "");

    switch (path) {
      case "chat":
        // Navigate to chat view
        window.location.hash = "#chat";
        break;
      case "settings":
        // Navigate to settings
        window.location.hash = "#settings";
        break;
      case "connect": {
        // Handle gateway connection URL
        const gatewayUrl = parsed.searchParams.get("url");
        if (gatewayUrl) {
          // Security: only allow https/http URLs to prevent SSRF
          try {
            const validatedUrl = new URL(gatewayUrl);
            if (
              validatedUrl.protocol !== "https:" &&
              validatedUrl.protocol !== "http:"
            ) {
              console.error(
                "[Milady] Invalid gateway URL protocol:",
                validatedUrl.protocol,
              );
              break;
            }
            document.dispatchEvent(
              new CustomEvent("milady:connect", {
                detail: { gatewayUrl: validatedUrl.href },
              }),
            );
          } catch {
            console.error("[Milady] Invalid gateway URL format");
          }
        }
        break;
      }
      case "share": {
        const title = parsed.searchParams.get("title")?.trim() || undefined;
        const text = parsed.searchParams.get("text")?.trim() || undefined;
        const sharedUrl = parsed.searchParams.get("url")?.trim() || undefined;
        const files = parsed.searchParams
          .getAll("file")
          .map((filePath) => filePath.trim())
          .filter((filePath) => filePath.length > 0)
          .map((filePath) => {
            const slash = Math.max(
              filePath.lastIndexOf("/"),
              filePath.lastIndexOf("\\"),
            );
            const name = slash >= 0 ? filePath.slice(slash + 1) : filePath;
            return { name, path: filePath };
          });

        dispatchShareTarget({
          source: "deep-link",
          title,
          text,
          url: sharedUrl,
          files,
        });
        break;
      }
      default:
        console.log(`[Milady] Unknown deep link path: ${path}`);
    }
  }
}

/**
 * Initialize Electron-specific features
 */
async function initializeElectron(): Promise<void> {
  document.body.classList.add("electron");

  try {
    const version = await Desktop.getVersion();
    const desktopNativeReady =
      typeof version.electron === "string" &&
      version.electron !== "N/A" &&
      version.electron !== "unknown";
    if (!desktopNativeReady) {
      return;
    }

    // Global command palette shortcut
    await Desktop.registerShortcut({
      id: "command-palette",
      accelerator: "CommandOrControl+K",
    });

    // Emote picker shortcut
    await Desktop.registerShortcut({
      id: "emote-picker",
      accelerator: "CommandOrControl+E",
    });

    await Desktop.addListener("shortcutPressed", (event: { id: string }) => {
      if (event.id === "command-palette") {
        document.dispatchEvent(new CustomEvent("milady:command-palette"));
      }
      if (event.id === "emote-picker") {
        document.dispatchEvent(new CustomEvent("milady:emote-picker"));
      }
    });

    // Tray actions routed to the renderer as app-level events.
    await Desktop.setTrayMenu({
      menu: [
        { id: "tray-open-chat", label: "Open Chat" },
        { id: "tray-open-workbench", label: "Open Workbench" },
        { id: "tray-toggle-pause", label: "Pause/Resume Agent" },
        { id: "tray-restart", label: "Restart Agent" },
        { id: "tray-notify", label: "Send Test Notification" },
        { id: "tray-sep-1", type: "separator" },
        { id: "tray-show-window", label: "Show Window" },
        { id: "tray-hide-window", label: "Hide Window" },
      ],
    });

    await Desktop.addListener(
      "trayMenuClick",
      (event: { itemId: string; checked?: boolean }) => {
        document.dispatchEvent(
          new CustomEvent("milady:tray-action", {
            detail: event,
          }),
        );
      },
    );
  } catch {}
}

/**
 * Set up CSS custom properties for platform-specific styling
 */
function setupPlatformStyles(): void {
  const root = document.documentElement;

  // Set platform class on body for CSS targeting
  document.body.classList.add(`platform-${platform}`);

  if (isNative) {
    document.body.classList.add("native");
  }

  // Set safe area insets as CSS variables (fallback values)
  root.style.setProperty("--safe-area-top", "env(safe-area-inset-top, 0px)");
  root.style.setProperty(
    "--safe-area-bottom",
    "env(safe-area-inset-bottom, 0px)",
  );
  root.style.setProperty("--safe-area-left", "env(safe-area-inset-left, 0px)");
  root.style.setProperty(
    "--safe-area-right",
    "env(safe-area-inset-right, 0px)",
  );

  // Initialize keyboard height variable
  root.style.setProperty("--keyboard-height", "0px");
}

/**
 * Mount the React application into the DOM
 */
function mountReactApp(): void {
  const rootEl = document.getElementById("root");
  if (!rootEl) throw new Error("Root element #root not found");

  createRoot(rootEl).render(
    <StrictMode>
      <AppProvider>
        <App />
      </AppProvider>
    </StrictMode>,
  );
}

/** Detect popout mode from URL params. */
function isPopoutWindow(): boolean {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(
    window.location.search || window.location.hash.split("?")[1] || "",
  );
  return params.has("popout");
}

/**
 * In popout mode, inject the API base from the URL query string so the
 * client can connect without the Electron main-process injection.
 */
function injectPopoutApiBase(): void {
  const params = new URLSearchParams(
    window.location.search || window.location.hash.split("?")[1] || "",
  );
  const apiBase = params.get("apiBase");
  if (apiBase) {
    // Validate apiBase is same-origin or localhost to prevent redirection attacks
    try {
      const parsed = new URL(apiBase);
      const host = parsed.hostname;
      if (
        host === "localhost" ||
        host === "127.0.0.1" ||
        host === window.location.hostname
      ) {
        window.__MILADY_API_BASE__ = apiBase;
      } else {
        console.warn("[Milady] Rejected non-local apiBase:", host);
      }
    } catch {
      // Relative URL — only allow paths starting with "/" but not "//" (protocol-relative)
      if (apiBase.startsWith("/") && !apiBase.startsWith("//")) {
        window.__MILADY_API_BASE__ = apiBase;
      } else {
        console.warn("[Milady] Rejected invalid relative apiBase:", apiBase);
      }
    }
  }
}

/**
 * Main initialization
 */
async function main(): Promise<void> {
  // Set up platform-specific styles first
  setupPlatformStyles();

  if (isPopoutWindow()) {
    // Popout mode — skip platform init (agent lifecycle, Capacitor bridges,
    // shortcuts, tray). Just inject the API base and mount the React app.
    injectPopoutApiBase();
    mountReactApp();
    return;
  }

  // Mount the React app
  mountReactApp();

  // Initialize platform features (Capacitor bridges, native plugins, etc.)
  await initializePlatform();
}

// Run initialization when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", main);
} else {
  main();
}

// Export platform utilities for use by other modules
export { platform, isNative, isIOS, isAndroid, isElectron, isWeb };
