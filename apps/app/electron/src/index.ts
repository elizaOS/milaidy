import { File as NodeFile } from "node:buffer";
import path from "node:path";
import type { CapacitorElectronConfig } from "@capacitor-community/electron";
import {
  getCapacitorElectronConfig,
  setupElectronDeepLinking,
} from "@capacitor-community/electron";
import type { MenuItemConstructorOptions } from "electron";
import { app, MenuItem } from "electron";
import electronIsDev from "electron-is-dev";
import unhandled from "electron-unhandled";
import { autoUpdater } from "electron-updater";
import { createApiBaseInjector, resolveExternalApiBase } from "./api-base";
import {
  disposeNativeModules,
  getAgentManager,
  getScreenCaptureManager,
  initializeNativeModules,
  registerAllIPC,
} from "./native";
import {
  ElectronCapacitorApp,
  setupContentSecurityPolicy,
  setupReloadWatcher,
} from "./setup";

// Graceful handling of unhandled errors.
unhandled();

// Allow AudioContext.resume() from non-gesture contexts (WebSocket callbacks)
// so ElevenLabs TTS can play without requiring a click first.
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");

// Allow overriding Electron userData during automated E2E runs.
const userDataOverride = process.env.MILADY_ELECTRON_USER_DATA_DIR?.trim();
if (userDataOverride) {
  app.setPath("userData", userDataOverride);
}

// Electron 26 (Node 18) can miss global File, which breaks undici-based deps.
const globalWithFile = globalThis as unknown as { File?: typeof NodeFile };
if (
  typeof globalWithFile.File === "undefined" &&
  typeof NodeFile === "function"
) {
  globalWithFile.File = NodeFile;
}

// Define our menu templates (these are optional)
const trayMenuTemplate: (MenuItemConstructorOptions | MenuItem)[] = [
  new MenuItem({ label: "Quit App", role: "quit" }),
];
const appMenuBarMenuTemplate: (MenuItemConstructorOptions | MenuItem)[] = [
  { role: process.platform === "darwin" ? "appMenu" : "fileMenu" },
  { role: "editMenu" },
  { role: "viewMenu" },
];

interface ShareTargetPayload {
  source: string;
  title?: string;
  text?: string;
  url?: string;
  files?: Array<{ name: string; path?: string }>;
}

let pendingSharePayloads: ShareTargetPayload[] = [];

function parseShareUrl(rawUrl: string): ShareTargetPayload | null {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }

  if (parsed.protocol !== "milady:") return null;
  const sharePath = (parsed.pathname || parsed.host || "").replace(/^\/+/, "");
  if (sharePath !== "share") return null;

  const title = parsed.searchParams.get("title")?.trim() || undefined;
  const text = parsed.searchParams.get("text")?.trim() || undefined;
  const sharedUrl = parsed.searchParams.get("url")?.trim() || undefined;
  const files = parsed.searchParams
    .getAll("file")
    .map((filePath) => filePath.trim())
    .filter((filePath) => filePath.length > 0)
    .map((filePath) => ({
      name: path.basename(filePath),
      path: filePath,
    }));

  return {
    source: "electron-open-url",
    title,
    text,
    url: sharedUrl,
    files,
  };
}

function dispatchShareToRenderer(payload: ShareTargetPayload): void {
  const mainWindow = myCapacitorApp.getMainWindow();
  if (!mainWindow || mainWindow.isDestroyed()) {
    pendingSharePayloads.push(payload);
    return;
  }

  const eventName = JSON.stringify("milady:share-target");
  const detail = JSON.stringify(payload).replace(/</g, "\\u003c");
  mainWindow.webContents
    .executeJavaScript(
      `window.__MILADY_SHARE_QUEUE__ = Array.isArray(window.__MILADY_SHARE_QUEUE__) ? window.__MILADY_SHARE_QUEUE__ : [];` +
        `window.__MILADY_SHARE_QUEUE__.push(${detail});` +
        `document.dispatchEvent(new CustomEvent(${eventName}, { detail: ${detail} }));`,
    )
    .catch(() => {
      pendingSharePayloads.push(payload);
    });
}

function flushPendingSharePayloads(): void {
  if (pendingSharePayloads.length === 0) return;
  const toFlush = pendingSharePayloads;
  pendingSharePayloads = [];
  for (const payload of toFlush) {
    dispatchShareToRenderer(payload);
  }
}

function revealMainWindow(): void {
  const mainWindow = myCapacitorApp.getMainWindow();
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (!mainWindow.isVisible()) mainWindow.show();
  mainWindow.focus();
}

app.on("open-file", (event, filePath) => {
  event.preventDefault();
  dispatchShareToRenderer({
    source: "electron-open-file",
    files: [{ name: path.basename(filePath), path: filePath }],
  });
  revealMainWindow();
});

app.on("open-url", (event, url) => {
  const payload = parseShareUrl(url);
  if (!payload) return;
  event.preventDefault();
  dispatchShareToRenderer(payload);
  revealMainWindow();
});

for (const arg of process.argv) {
  const payload = parseShareUrl(arg);
  if (payload) pendingSharePayloads.push(payload);
}

// Get Config options from capacitor.config
const capacitorFileConfig: CapacitorElectronConfig =
  getCapacitorElectronConfig();

// Initialize our app. You can pass menu templates into the app here.
// const myCapacitorApp = new ElectronCapacitorApp(capacitorFileConfig);
const myCapacitorApp = new ElectronCapacitorApp(
  capacitorFileConfig,
  trayMenuTemplate,
  appMenuBarMenuTemplate,
);

// If deeplinking is enabled then we will set it up here.
if (capacitorFileConfig.electron?.deepLinkingEnabled) {
  setupElectronDeepLinking(myCapacitorApp, {
    customProtocol:
      capacitorFileConfig.electron.deepLinkingCustomProtocol ??
      "mycapacitorapp",
  });
}

// If we are in Dev mode, use the file watcher components.
if (electronIsDev) {
  setupReloadWatcher(myCapacitorApp);
}

// Run Application
(async () => {
  // Wait for electron app to be ready.
  await app.whenReady();
  // Security - Set Content-Security-Policy based on whether or not we are in dev mode.
  setupContentSecurityPolicy(myCapacitorApp.getCustomURLScheme());
  // Initialize our app, build windows, and load content.
  await myCapacitorApp.init();
  const mainWindow = myCapacitorApp.getMainWindow();
  initializeNativeModules(mainWindow);
  // Expose ScreenCaptureManager to the embedded server so stream-routes can
  // auto-start frame capture when going live (server reads globalThis.__miladyScreenCapture).
  (globalThis as Record<string, unknown>).__miladyScreenCapture =
    getScreenCaptureManager();
  registerAllIPC();

  // Start the embedded agent runtime and pass the API port to the renderer.
  // The UI's api-client reads window.__MILADY_API_BASE__ to know where to connect.
  const externalApiBaseResolution = resolveExternalApiBase(process.env);
  const externalApiBase = externalApiBaseResolution.base;
  if (externalApiBaseResolution.invalidSources.length > 0) {
    console.warn(
      `[Milady] Ignoring invalid API base URL from ${externalApiBaseResolution.invalidSources.join(", ")}`,
    );
  }
  const skipEmbeddedAgent =
    process.env.MILADY_ELECTRON_SKIP_EMBEDDED_AGENT === "1" ||
    Boolean(externalApiBase);
  const agentManager = getAgentManager();
  agentManager.setMainWindow(mainWindow);
  const apiBaseInjector = createApiBaseInjector(
    {
      isDestroyed: () => mainWindow.isDestroyed(),
      executeJavaScript: (script) =>
        mainWindow.webContents.executeJavaScript(script),
    },
    {
      getApiToken: () => process.env.MILADY_API_TOKEN,
      onInjected: flushPendingSharePayloads,
    },
  );
  const injectApiBase = (base: string | null): void => {
    void apiBaseInjector.inject(base);
  };
  const injectApiEndpoint = (port: number | null): void => {
    if (!port) return;
    injectApiBase(`http://localhost:${port}`);
  };

  // Always inject on renderer reload/navigation once we know the port.
  mainWindow.webContents.on("did-finish-load", () => {
    if (externalApiBase) {
      injectApiBase(externalApiBase);
    } else {
      injectApiEndpoint(agentManager.getPort());
    }
    flushPendingSharePayloads();
  });

  if (externalApiBase) {
    const source = externalApiBaseResolution.source ?? "unknown";
    console.info(
      `[Milady] Using external API base for renderer (${source}): ${externalApiBase}`,
    );
    injectApiBase(externalApiBase);
  } else if (!skipEmbeddedAgent) {
    // Start in background and inject API base as soon as the port is available,
    // without waiting for the full runtime/plugin initialization path.
    const startPromise = agentManager.start();
    void (async () => {
      const startedAt = Date.now();
      const timeoutMs = 30_000;
      while (Date.now() - startedAt < timeoutMs) {
        const port = agentManager.getPort();
        if (port) {
          injectApiEndpoint(port);
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    })();

    startPromise.catch((err) => {
      console.error("[Milady] Agent startup failed:", err);
    });
  } else {
    console.info("[Milady] Embedded agent startup disabled by configuration");
  }

  // Check for updates if we are in a packaged app.
  if (process.env.MILADY_ELECTRON_DISABLE_AUTO_UPDATER !== "1") {
    autoUpdater.checkForUpdatesAndNotify().catch((err: Error) => {
      console.warn("[Milady] Update check failed (non-fatal):", err.message);
    });
  }
})();

// Handle when all of our windows are close (platforms have their own expectations).
app.on("window-all-closed", () => {
  // On OS X it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// When the dock icon is clicked.
app.on("activate", async () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (myCapacitorApp.getMainWindow().isDestroyed()) {
    await myCapacitorApp.init();
  }
});

app.on("before-quit", () => {
  disposeNativeModules();
});

// Place all ipc or other electron api calls and custom functionality under this line
