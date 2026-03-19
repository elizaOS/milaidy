/**
 * Milady Capacitor App Entry Point
 *
 * This file initializes the Capacitor runtime, sets up platform-specific
 * features, and mounts the React application.
 */

import "@elizaos/app-core/styles/styles.css";
import "./brand-gold.css";
import "./onboarding-overrides.css";
import "./native-plugin-entrypoints";

import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { Keyboard } from "@capacitor/keyboard";
import { StatusBar, Style } from "@capacitor/status-bar";
import { App } from "@elizaos/app-core";
import { client } from "@elizaos/app-core/api";
// Import Capacitor bridge utilities
import {
  initializeCapacitorBridge,
  initializeStorageBridge,
  isElectrobunRuntime,
} from "@elizaos/app-core/bridge";
import type { BrandingConfig } from "@elizaos/app-core/config";
import {
  AGENT_READY_EVENT,
  APP_PAUSE_EVENT,
  APP_RESUME_EVENT,
  COMMAND_PALETTE_EVENT,
  CONNECT_EVENT,
  dispatchElizaEvent as dispatchMiladyEvent,
  SHARE_TARGET_EVENT,
  TRAY_ACTION_EVENT,
} from "@elizaos/app-core/events";
import { applyLaunchConnectionFromUrl } from "@elizaos/app-core/platform";
import { AppProvider } from "@elizaos/app-core/state";
// Import the agent plugin
import { Agent } from "@miladyai/capacitor-agent";
import { Desktop } from "@miladyai/capacitor-desktop";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { installLocalProviderCloudPreferencePatch } from "./cloud-preference-patch";
import { CharacterEditor } from "./components/CharacterEditor";
import { DesktopOnboardingRuntime } from "./DesktopOnboardingRuntime";
import { DesktopSurfaceNavigationRuntime } from "./DesktopSurfaceNavigationRuntime";
import { DetachedShellRoot } from "./DetachedShellRoot";
import { installDesktopPermissionsClientPatch } from "./desktop-permissions-client";
import {
  applyForceFreshOnboardingReset,
  installForceFreshOnboardingClientPatch,
} from "./onboarding-reset";
import {
  isDetachedWindowShell,
  resolveWindowShellRoute,
  shouldInstallMainWindowOnboardingPatches,
  syncDetachedShellLocation,
} from "./window-shell";

const MILADY_BRANDING: Partial<BrandingConfig> = {
  appName: "Milady",
  orgName: "milady-ai",
  repoName: "milady",
  docsUrl: "https://docs.milady.ai",
  appUrl: "https://app.milady.ai",
  bugReportUrl:
    "https://github.com/milady-ai/milady/issues/new?template=bug_report.yml",
  hashtag: "#MiladyAgent",
  fileExtension: ".milady-agent",
  packageScope: "miladyai",
  // Cloud-only in production; local dev mode allows running a local backend.
  cloudOnly: !import.meta.env.DEV,
};

/**
 * Platform detection utilities
 */
const platform = Capacitor.getPlatform();
const isNative = Capacitor.isNativePlatform();
const isIOS = platform === "ios";
const isAndroid = platform === "android";

function isDesktopPlatform(): boolean {
  return isElectrobunRuntime();
}

function isWebPlatform(): boolean {
  return platform === "web" && !isElectrobunRuntime();
}

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
    __MILADY_CHARACTER_EDITOR__?: typeof CharacterEditor;
    __MILADY_API_BASE__?: string;
  }
}

const windowShellRoute = resolveWindowShellRoute();

// Dev escape hatch: ?reset forces a truly fresh onboarding session by clearing
// persisted state and temporarily suppressing stale backend resume config.
if (shouldInstallMainWindowOnboardingPatches(windowShellRoute)) {
  applyForceFreshOnboardingReset();
  installForceFreshOnboardingClientPatch(client);
}
installLocalProviderCloudPreferencePatch(client);
installDesktopPermissionsClientPatch(client);

// Register custom character editor for app-core's ViewRouter to pick up
window.__MILADY_CHARACTER_EDITOR__ = CharacterEditor;

// Point Eliza Cloud API to the correct base URL.
(window as Record<string, unknown>).__ELIZA_CLOUD_API_BASE__ =
  import.meta.env.VITE_CLOUD_BASE ?? "https://www.elizacloud.ai";

// Inject onboarding style presets so the frontend-only onboarding flow
// can populate character data without an API call.
import { STYLE_PRESETS } from "../../../src/onboarding-presets";

(window as Record<string, unknown>).__APP_ONBOARDING_STYLES__ = STYLE_PRESETS;

// Override the VRM asset roster with Milady characters so avatar URLs
// resolve to milady-*.vrm.gz instead of the upstream eliza-*.vrm.gz.
window.__APP_VRM_ASSETS__ = [
  { title: "Chen", slug: "milady-1" },
  { title: "Jin", slug: "milady-2" },
  { title: "Kei", slug: "milady-3" },
  { title: "Momo", slug: "milady-4" },
  { title: "Rin", slug: "milady-5" },
  { title: "Ryu", slug: "milady-6" },
  { title: "Satoshi", slug: "milady-7" },
  { title: "Yuki", slug: "milady-8" },
];

function dispatchShareTarget(payload: ShareTargetPayload): void {
  if (!window.__MILADY_SHARE_QUEUE__) {
    window.__MILADY_SHARE_QUEUE__ = [];
  }
  window.__MILADY_SHARE_QUEUE__.push(payload);
  dispatchMiladyEvent(SHARE_TARGET_EVENT, payload);
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
    dispatchMiladyEvent(AGENT_READY_EVENT, status);
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
    // Configure status bar for mobile platforms (not available on desktop)
    await initializeStatusBar();

    // Configure keyboard behavior
    await initializeKeyboard();

    // Handle app lifecycle events
    initializeAppLifecycle();
  }

  if (isDesktopPlatform()) {
    // Electrobun-specific initialization
    await initializeDesktopShell();
  } else {
    // On desktop the main process owns runtime startup; avoid an extra early
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
    // Keep the accessory bar visible; shell mode now owns WebView scroll lock.
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
      dispatchMiladyEvent(APP_RESUME_EVENT);
    } else {
      // App went to background
      dispatchMiladyEvent(APP_PAUSE_EVENT);
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
            dispatchMiladyEvent(CONNECT_EVENT, {
              gatewayUrl: validatedUrl.href,
            });
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
 * Initialize desktop shell-specific features
 */
async function initializeDesktopShell(): Promise<void> {
  document.body.classList.add("desktop");

  try {
    const version = await Desktop.getVersion();
    const desktopNativeReady =
      typeof version.runtime === "string" &&
      version.runtime !== "N/A" &&
      version.runtime !== "unknown";
    if (!desktopNativeReady) {
      return;
    }

    // Global command palette shortcut
    await Desktop.registerShortcut({
      id: "command-palette",
      accelerator: "CommandOrControl+K",
    });

    await Desktop.addListener("shortcutPressed", (event: { id: string }) => {
      if (event.id === "command-palette") {
        dispatchMiladyEvent(COMMAND_PALETTE_EVENT);
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
        dispatchMiladyEvent(TRAY_ACTION_EVENT, event);
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
      <AppProvider branding={MILADY_BRANDING}>
        {isDetachedWindowShell(windowShellRoute) ? (
          <DetachedShellRoot route={windowShellRoute} />
        ) : (
          <>
            <DesktopOnboardingRuntime />
            <DesktopSurfaceNavigationRuntime />
            <App />
          </>
        )}
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
 * client can connect without the desktop main-process injection.
 */
function injectPopoutApiBase(): void {
  const params = new URLSearchParams(
    window.location.search || window.location.hash.split("?")[1] || "",
  );
  const apiBase = params.get("apiBase");
  if (apiBase) {
    // Allow secure remote backends and private-network development hosts.
    try {
      const parsed = new URL(apiBase);
      const host = parsed.hostname;
      const allowPrivateHttp =
        /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host) ||
        /^192\.168\.\d{1,3}\.\d{1,3}$/.test(host) ||
        /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(host) ||
        /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d{1,3}\.\d{1,3}$/.test(
          host,
        ) ||
        host.endsWith(".local") ||
        host.endsWith(".internal") ||
        host.endsWith(".ts.net");
      if (
        host === "localhost" ||
        host === "127.0.0.1" ||
        host === "::1" ||
        host === window.location.hostname ||
        parsed.protocol === "https:" ||
        (parsed.protocol === "http:" && allowPrivateHttp)
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

function injectDetachedShellApiBase(): void {
  const apiBase = new URLSearchParams(window.location.search).get("apiBase");
  if (apiBase) {
    window.__MILADY_API_BASE__ = apiBase;
  }
}

function applyStoredDetachedShellTheme(): void {
  try {
    const stored = localStorage.getItem("milady:ui-theme");
    const theme = stored === "light" ? "light" : "dark";
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.setAttribute("data-theme", theme);
  } catch {
    document.documentElement.classList.add("dark");
    document.documentElement.setAttribute("data-theme", "dark");
  }
}

/**
 * Main initialization
 */
async function main(): Promise<void> {
  // Set up platform-specific styles first
  setupPlatformStyles();

  try {
    await applyLaunchConnectionFromUrl();
  } catch (err) {
    console.error(
      "[Milady] Failed to apply managed cloud launch session:",
      err instanceof Error ? err.message : err,
    );
  }

  if (isPopoutWindow()) {
    // Popout mode — skip platform init (agent lifecycle, Capacitor bridges,
    // shortcuts, tray). Just inject the API base and mount the React app.
    injectPopoutApiBase();
    mountReactApp();
    return;
  }

  if (isDetachedWindowShell(windowShellRoute)) {
    injectDetachedShellApiBase();
    applyStoredDetachedShellTheme();
    syncDetachedShellLocation(windowShellRoute);
    await initializeStorageBridge();
    initializeCapacitorBridge();
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
export {
  isAndroid,
  isDesktopPlatform as isDesktop,
  isIOS,
  isNative,
  isWebPlatform as isWeb,
  platform,
};
