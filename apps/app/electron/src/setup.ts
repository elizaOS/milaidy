import { existsSync } from "node:fs";
import { join } from "node:path";
import type { CapacitorElectronConfig } from "@capacitor-community/electron";
import {
  CapacitorSplashScreen,
  CapElectronEventEmitter,
  setupCapacitorElectronPlugins,
} from "@capacitor-community/electron";
import chokidar from "chokidar";
import type { MenuItemConstructorOptions } from "electron";
import {
  app,
  BrowserWindow,
  clipboard,
  ipcMain,
  Menu,
  MenuItem,
  nativeImage,
  session,
  shell,
  Tray,
} from "electron";
import electronIsDev from "electron-is-dev";
import electronServe from "electron-serve";
import windowStateKeeper from "electron-window-state";
import {
  buildMissingWebAssetsMessage,
  resolveWebAssetDirectory,
} from "./web-assets";

// Define components for a watcher to detect when the webapp is changed so we can reload in Dev mode.
const reloadWatcher = {
  debouncer: null,
  ready: false,
  watcher: null,
};
export function setupReloadWatcher(
  electronCapacitorApp: ElectronCapacitorApp,
): void {
  const watchDir = electronCapacitorApp.getWebAssetDirectory();
  reloadWatcher.watcher = chokidar
    .watch(watchDir, {
      ignored: /[/\\]\./,
      persistent: true,
    })
    .on("ready", () => {
      reloadWatcher.ready = true;
    })
    .on("all", (_event, _path) => {
      if (reloadWatcher.ready) {
        clearTimeout(reloadWatcher.debouncer);
        reloadWatcher.debouncer = setTimeout(async () => {
          electronCapacitorApp.getMainWindow().webContents.reload();
          reloadWatcher.ready = false;
          clearTimeout(reloadWatcher.debouncer);
          reloadWatcher.debouncer = null;
          reloadWatcher.watcher = null;
          setupReloadWatcher(electronCapacitorApp);
        }, 1500);
      }
    });
}

// Define our class to manage our app.
export class ElectronCapacitorApp {
  private MainWindow: BrowserWindow | null = null;
  private SplashScreen: CapacitorSplashScreen | null = null;
  private TrayIcon: Tray | null = null;
  private CapacitorFileConfig: CapacitorElectronConfig;
  private TrayMenuTemplate: (MenuItem | MenuItemConstructorOptions)[] = [
    new MenuItem({ label: "Quit App", role: "quit" }),
  ];
  private AppMenuBarMenuTemplate: (MenuItem | MenuItemConstructorOptions)[] = [
    { role: process.platform === "darwin" ? "appMenu" : "fileMenu" },
    { role: "viewMenu" },
  ];
  private mainWindowState;
  private loadWebApp: (window: BrowserWindow) => Promise<void>;
  private customScheme: string;
  private webAssetDirectory: string;

  constructor(
    capacitorFileConfig: CapacitorElectronConfig,
    trayMenuTemplate?: (MenuItemConstructorOptions | MenuItem)[],
    appMenuBarMenuTemplate?: (MenuItemConstructorOptions | MenuItem)[],
  ) {
    this.CapacitorFileConfig = capacitorFileConfig;

    this.customScheme =
      this.CapacitorFileConfig.electron?.customUrlScheme ??
      "capacitor-electron";

    const webAssets = resolveWebAssetDirectory({
      appPath: app.getAppPath(),
      cwd: process.cwd(),
      webDir: this.CapacitorFileConfig.webDir,
      preferBuildOutput: electronIsDev,
    });
    this.webAssetDirectory = webAssets.directory;

    if (trayMenuTemplate) {
      this.TrayMenuTemplate = trayMenuTemplate;
    }

    if (appMenuBarMenuTemplate) {
      this.AppMenuBarMenuTemplate = appMenuBarMenuTemplate;
    }

    if (webAssets.usedFallback) {
      if (webAssets.primaryHasIndexHtml && electronIsDev) {
        console.info(
          `[Milady] Dev mode: using web assets at ${this.webAssetDirectory} instead of synced ${join(app.getAppPath(), "app")}`,
        );
      } else {
        console.warn(
          `[Milady] Using fallback web assets at ${this.webAssetDirectory} because ${join(app.getAppPath(), "app")} is missing index.html`,
        );
      }
    }

    if (!webAssets.hasIndexHtml) {
      console.error(buildMissingWebAssetsMessage(webAssets));
    }

    // Setup our web app loader, this lets us load apps like react, vue, and angular without changing their build chains.
    this.loadWebApp = electronServe({
      directory: this.webAssetDirectory,
      scheme: this.customScheme,
    });
  }

  // Helper function to load in the app.
  // Note: This method receives `thisRef` from CapacitorSplashScreen.init callback pattern.
  // The splash screen calls this as `loadMainWindow(thisRef)` where thisRef is passed back to us.
  private async loadMainWindow(thisRef: ElectronCapacitorApp): Promise<void> {
    if (!thisRef.MainWindow || thisRef.MainWindow.isDestroyed()) return;

    const fallbackIndexPath = join(thisRef.webAssetDirectory, "index.html");
    const customSchemeUrl = `${thisRef.customScheme}://-`;

    // On packaged builds, prefer direct file loading for startup stability.
    // We still keep custom-scheme support as a fallback.
    if (!electronIsDev && existsSync(fallbackIndexPath)) {
      try {
        if (!thisRef.MainWindow || thisRef.MainWindow.isDestroyed()) return;
        await thisRef.MainWindow.loadFile(fallbackIndexPath);
        console.info(
          `[Milady] Loaded packaged web assets from ${fallbackIndexPath}`,
        );
        return;
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        console.error(`[Milady] Packaged file:// load failed (${reason})`);
      }
    }

    try {
      if (!thisRef.MainWindow || thisRef.MainWindow.isDestroyed()) return;
      // Use electron-serve's loader so custom-scheme startup matches its
      // registered protocol behavior in packaged and dev environments.
      await thisRef.loadWebApp(thisRef.MainWindow);
      return;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.error(
        `[Milady] Failed to load web app via ${customSchemeUrl} (${reason})`,
      );
    }

    if (existsSync(fallbackIndexPath)) {
      try {
        if (!thisRef.MainWindow || thisRef.MainWindow.isDestroyed()) return;
        await thisRef.MainWindow.loadFile(fallbackIndexPath);
        console.info(
          `[Milady] Loaded fallback web assets from ${fallbackIndexPath}`,
        );
        return;
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        console.error(`[Milady] Fallback file:// load failed (${reason})`);
      }
    }

    // Final fallback: render a diagnostic page instead of crashing with an unhandled rejection.
    const diagnostics = buildMissingWebAssetsMessage({
      directory: thisRef.webAssetDirectory,
      searched: [thisRef.webAssetDirectory],
      usedFallback: false,
      hasIndexHtml: false,
      primaryHasIndexHtml: false,
    });
    const html = `<html><body style="font-family: sans-serif; margin: 24px;"><h2>Milady Desktop Failed to Load UI Assets</h2><pre style="white-space: pre-wrap;">${diagnostics}</pre></body></html>`;
    try {
      if (!thisRef.MainWindow || thisRef.MainWindow.isDestroyed()) return;
      await thisRef.MainWindow.loadURL(
        `data:text/html;charset=utf-8,${encodeURIComponent(html)}`,
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.error(`[Milady] Failed to render diagnostics page (${reason})`);
    }
  }

  // Capacitor splash invokes load callbacks without awaiting them.
  // Keep startup errors contained so they never surface as unhandled rejections.
  private async safeLoadMainWindow(
    thisRef: ElectronCapacitorApp,
  ): Promise<void> {
    try {
      await this.loadMainWindow(thisRef);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.error(`[Milady] Unexpected startup load error (${reason})`);
    }
  }

  // Expose the mainWindow ref for use outside of the class.
  getMainWindow(): BrowserWindow {
    return this.MainWindow;
  }

  getCustomURLScheme(): string {
    return this.customScheme;
  }

  getWebAssetDirectory(): string {
    return this.webAssetDirectory;
  }

  async init(): Promise<void> {
    const icon = nativeImage.createFromPath(
      join(
        app.getAppPath(),
        "assets",
        process.platform === "win32" ? "appIcon.ico" : "appIcon.png",
      ),
    );
    this.mainWindowState = windowStateKeeper({
      defaultWidth: 1000,
      defaultHeight: 800,
    });
    // Resolve preload path across current and legacy Electron outDirs.
    const preloadCandidates = [
      join(app.getAppPath(), "out", "src", "preload.js"),
      join(app.getAppPath(), "build", "src", "preload.js"),
      join(__dirname, "preload.js"),
    ];
    const preloadPath =
      preloadCandidates.find((candidate) => existsSync(candidate)) ??
      preloadCandidates[0];
    this.MainWindow = new BrowserWindow({
      icon,
      show: false,
      title: "Milady",
      backgroundColor: "#0a0a0a",
      x: this.mainWindowState.x,
      y: this.mainWindowState.y,
      width: this.mainWindowState.width,
      height: this.mainWindowState.height,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        // Use preload to inject the electron variant overrides for capacitor plugins.
        preload: preloadPath,
      },
    });
    this.mainWindowState.manage(this.MainWindow);

    if (this.CapacitorFileConfig.electron?.backgroundColor) {
      this.MainWindow.setBackgroundColor(
        this.CapacitorFileConfig.electron.backgroundColor,
      );
    }

    // If we close the main window with the splashscreen enabled we need to destory the ref.
    this.MainWindow.on("closed", () => {
      if (
        this.SplashScreen?.getSplashWindow() &&
        !this.SplashScreen.getSplashWindow().isDestroyed()
      ) {
        this.SplashScreen.getSplashWindow().close();
      }
    });

    // When the tray icon is enabled, setup the options.
    if (this.CapacitorFileConfig.electron?.trayIconAndMenuEnabled) {
      this.TrayIcon = new Tray(icon);
      this.TrayIcon.on("double-click", () => {
        if (this.MainWindow) {
          if (this.MainWindow.isVisible()) {
            this.MainWindow.hide();
          } else {
            this.MainWindow.show();
            this.MainWindow.focus();
          }
        }
      });
      this.TrayIcon.on("click", () => {
        if (this.MainWindow) {
          if (this.MainWindow.isVisible()) {
            this.MainWindow.hide();
          } else {
            this.MainWindow.show();
            this.MainWindow.focus();
          }
        }
      });
      this.TrayIcon.setToolTip(app.getName());
      this.TrayIcon.setContextMenu(
        Menu.buildFromTemplate(this.TrayMenuTemplate),
      );
    }

    // Setup the main manu bar at the top of our window.
    Menu.setApplicationMenu(
      Menu.buildFromTemplate(this.AppMenuBarMenuTemplate),
    );

    // If the splashscreen is enabled, show it first while the main window loads then switch it out for the main window, or just load the main window from the start.
    if (this.CapacitorFileConfig.electron?.splashScreenEnabled) {
      this.SplashScreen = new CapacitorSplashScreen({
        imageFilePath: join(
          app.getAppPath(),
          "assets",
          this.CapacitorFileConfig.electron?.splashScreenImageName ??
            "splash.png",
        ),
        windowWidth: 400,
        windowHeight: 400,
      });
      this.SplashScreen.init((thisRef) => {
        void this.safeLoadMainWindow(thisRef as ElectronCapacitorApp);
      }, this);
    } else {
      void this.safeLoadMainWindow(this);
    }

    // Security
    const isAllowedUrl = (raw: string): boolean => {
      try {
        const url = new URL(raw);
        if (url.protocol === `${this.customScheme}:`) return true;
        if (
          electronIsDev &&
          (url.protocol === "http:" || url.protocol === "https:")
        ) {
          return url.hostname === "localhost" || url.hostname === "127.0.0.1";
        }
        return false;
      } catch {
        return false;
      }
    };

    const openExternal = (raw: string): void => {
      try {
        const url = new URL(raw);
        if (url.protocol === "http:" || url.protocol === "https:") {
          void shell.openExternal(raw);
        }
      } catch {
        // ignore
      }
    };

    const isLifoPopoutFlag = (value: string | null): boolean => {
      if (value == null) return false;
      const normalized = value.trim().toLowerCase();
      return (
        normalized === "" ||
        normalized === "1" ||
        normalized === "true" ||
        normalized === "lifo"
      );
    };

    const getPopoutValueFromHash = (hash: string): string | null => {
      if (!hash) return null;
      const normalized = hash.startsWith("#") ? hash.slice(1) : hash;
      const queryIndex = normalized.indexOf("?");
      if (queryIndex < 0) return null;
      return new URLSearchParams(normalized.slice(queryIndex + 1)).get(
        "popout",
      );
    };

    const isLifoPopoutUrl = (raw: string): boolean => {
      try {
        const parsed = new URL(raw);
        const searchValue = new URLSearchParams(parsed.search).get("popout");
        const hashValue = getPopoutValueFromHash(parsed.hash);
        if (!isLifoPopoutFlag(searchValue ?? hashValue)) return false;

        const hashPath = (
          parsed.hash.startsWith("#") ? parsed.hash.slice(1) : parsed.hash
        )
          .split("?")[0]
          .toLowerCase();
        const pathname = parsed.pathname.toLowerCase();
        return pathname.endsWith("/lifo") || hashPath.endsWith("/lifo");
      } catch {
        return false;
      }
    };

    ipcMain.removeHandler("lifo:setPip");
    ipcMain.removeHandler("lifo:getPipState");

    ipcMain.handle(
      "lifo:setPip",
      (event, options?: { flag?: boolean; level?: string }) => {
        const senderWindow = BrowserWindow.fromWebContents(event.sender);
        if (!senderWindow || senderWindow.isDestroyed()) {
          return { enabled: false };
        }

        const enabled = options?.flag === true;
        const level = options?.level ?? "floating";
        senderWindow.setAlwaysOnTop(
          enabled,
          level as Parameters<BrowserWindow["setAlwaysOnTop"]>[1],
        );
        senderWindow.setVisibleOnAllWorkspaces(enabled, {
          visibleOnFullScreen: enabled,
        });
        return { enabled };
      },
    );

    ipcMain.handle("lifo:getPipState", (event) => {
      const senderWindow = BrowserWindow.fromWebContents(event.sender);
      if (!senderWindow || senderWindow.isDestroyed()) {
        return { enabled: false };
      }
      return { enabled: senderWindow.isAlwaysOnTop() };
    });

    this.MainWindow.webContents.setWindowOpenHandler((details) => {
      if (!isAllowedUrl(details.url)) {
        openExternal(details.url);
        return { action: "deny" };
      }
      return { action: "allow" };
    });

    // When the Lifo popout window is created, switch frame capture so
    // retake.tv streams that dedicated surface.
    this.MainWindow.webContents.on(
      "did-create-window",
      (childWindow, { url }) => {
        if (!isLifoPopoutUrl(url)) return;

        console.log("[Setup] Lifo popout created — configuring capture target");

        // Switch stream capture to the popout window
        const scm = (
          globalThis as unknown as {
            __miladyScreenCaptureManager?: {
              setCaptureTarget(w: BrowserWindow | null): void;
            };
          }
        ).__miladyScreenCaptureManager;

        if (scm) {
          scm.setCaptureTarget(childWindow);

          childWindow.on("closed", () => {
            console.log(
              "[Setup] Lifo popout closed — reverting capture to main window",
            );
            scm.setCaptureTarget(null);
          });
        }
      },
    );

    this.MainWindow.webContents.on("will-navigate", (event, newURL) => {
      if (!isAllowedUrl(newURL)) {
        event.preventDefault();
        openExternal(newURL);
      }
    });

    // Link electron plugins into the system.
    setupCapacitorElectronPlugins();

    // Track whether the window has been shown to avoid double-show.
    let windowShown = false;
    const showWindow = () => {
      if (windowShown || this.MainWindow.isDestroyed()) return;
      windowShown = true;
      if (this.CapacitorFileConfig.electron?.splashScreenEnabled) {
        this.SplashScreen?.getSplashWindow()?.hide();
      }
      if (!this.CapacitorFileConfig.electron?.hideMainWindowOnLaunch) {
        this.MainWindow.show();
        this.MainWindow.focus();
      }
    };

    // Primary: show window as soon as Electron considers it ready to paint.
    this.MainWindow.once("ready-to-show", () => {
      showWindow();
    });

    // When the web app is loaded we open devtools in dev mode.
    this.MainWindow.webContents.on("dom-ready", () => {
      showWindow();
      setTimeout(() => {
        const devtoolsDisabled =
          process.env.MILADY_ELECTRON_DISABLE_DEVTOOLS === "1";
        if (
          electronIsDev &&
          !devtoolsDisabled &&
          !this.MainWindow.isDestroyed()
        ) {
          this.MainWindow.webContents.openDevTools();
        }
        CapElectronEventEmitter.emit(
          "CAPELECTRON_DeeplinkListenerInitialized",
          "",
        );
      }, 400);
    });

    // Forward renderer console messages to stdout for debugging
    this.MainWindow.webContents.on(
      "console-message",
      (_event, level, message, _line, _sourceId) => {
        if (
          message.includes("[LiveKit]") ||
          message.includes("[App]") ||
          message.includes("[GameView]") ||
          message.includes("[WHIP]") ||
          level >= 2
        ) {
          const prefix = level >= 2 ? "[renderer:ERROR]" : "[renderer]";
          console.log(`${prefix} ${message}`);
        }
      },
    );

    // ── Context menu ──────────────────────────────────────────────────
    this.MainWindow.webContents.on("context-menu", (_event, params) => {
      const menuItems: MenuItemConstructorOptions[] = [];

      // Text selection actions
      if (params.selectionText) {
        const text = params.selectionText.trim();
        menuItems.push(
          { role: "copy" },
          { type: "separator" },
          {
            label: "Save as /Command",
            click: () =>
              this.MainWindow.webContents.send("contextMenu:saveAsCommand", {
                text,
              }),
          },
          {
            label: "Ask Agent About This",
            click: () =>
              this.MainWindow.webContents.send("contextMenu:askAgent", {
                text,
              }),
          },
          {
            label: "Create Skill from This",
            click: () =>
              this.MainWindow.webContents.send("contextMenu:createSkill", {
                text,
              }),
          },
          {
            label: "Quote in Chat",
            click: () =>
              this.MainWindow.webContents.send("contextMenu:quoteInChat", {
                text,
              }),
          },
        );
      }

      // Link actions
      if (params.linkURL) {
        if (menuItems.length > 0) menuItems.push({ type: "separator" });
        menuItems.push(
          {
            label: "Open Link in Browser",
            click: () => openExternal(params.linkURL),
          },
          {
            label: "Copy Link Address",
            click: () => clipboard.writeText(params.linkURL),
          },
        );
      }

      // Image actions
      if (params.hasImageContents) {
        if (menuItems.length > 0) menuItems.push({ type: "separator" });
        menuItems.push(
          {
            label: "Copy Image",
            click: () =>
              this.MainWindow.webContents.copyImageAt(params.x, params.y),
          },
          {
            label: "Save Image As...",
            click: () => this.MainWindow.webContents.downloadURL(params.srcURL),
          },
        );
      }

      // Editable field actions
      if (params.isEditable) {
        if (menuItems.length > 0) menuItems.push({ type: "separator" });
        menuItems.push(
          { role: "undo" },
          { role: "redo" },
          { type: "separator" },
          { role: "cut" },
          { role: "copy" },
          { role: "paste" },
          { type: "separator" },
          { role: "selectAll" },
        );
      }

      // Always-present items
      if (menuItems.length > 0) menuItems.push({ type: "separator" });
      menuItems.push({ role: "reload" });
      if (electronIsDev) {
        menuItems.push({
          label: "Inspect Element",
          click: () =>
            this.MainWindow.webContents.inspectElement(params.x, params.y),
        });
      }

      Menu.buildFromTemplate(menuItems).popup();
    });

    // Handle content load failures — still show the window so it isn't invisible.
    this.MainWindow.webContents.on(
      "did-fail-load",
      (_event, errorCode, errorDescription) => {
        console.error(
          `[Milady] Content failed to load (${errorCode}): ${errorDescription}`,
        );
        showWindow();
      },
    );

    // Failsafe: if nothing else shows the window within 5 seconds, force show it.
    setTimeout(() => {
      showWindow();
    }, 5000);
  }
}

// Set a CSP up for our application based on the custom scheme.
// Allows connections to the embedded API server on localhost and WebSocket.
// frame-src allows embedding game clients from localhost and known game domains.
// Note: Embedded apps (like Hyperscape) may need WebAssembly, eval, external scripts/fonts,
// so the policy is intentionally permissive to support third-party game clients.
export function setupContentSecurityPolicy(customScheme: string): void {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    // For sub-frame requests (iframes), strip frame-ancestors so embedded
    // apps like Privy auth can load inside our GameView iframe.
    // Also strip COOP/COEP headers that break popup-based auth flows
    // (e.g. Base Smart Wallet SDK requires COOP to NOT be 'same-origin').
    // This is safe because Electron windows are native containers and
    // aren't vulnerable to clickjacking via frame-ancestors.
    if (details.resourceType === "subFrame") {
      const headers = { ...details.responseHeaders };
      for (const key of Object.keys(headers)) {
        const lk = key.toLowerCase();
        if (
          lk === "content-security-policy" ||
          lk === "content-security-policy-report-only"
        ) {
          const values = headers[key];
          if (Array.isArray(values)) {
            headers[key] = values.map((v) =>
              v.replace(/frame-ancestors\s+[^;]+(;|$)/gi, ""),
            );
          }
        }
        // Strip COOP/COEP from subframes — these headers prevent embedded
        // apps from opening popups for auth flows (Privy, Base Wallet SDK).
        if (
          lk === "cross-origin-opener-policy" ||
          lk === "cross-origin-embedder-policy"
        ) {
          delete headers[key];
        }
      }
      callback({ responseHeaders: headers });
      return;
    }

    const base = [
      `default-src 'self' ${customScheme}://* https://* http://localhost:* http://127.0.0.1:*`,
      // Allow scripts from localhost game servers, plus eval/wasm for WebAssembly
      `script-src 'self' ${customScheme}://* 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' http://localhost:* http://127.0.0.1:* https://*${electronIsDev ? " devtools://*" : ""}`,
      // Allow stylesheets from external sources
      `style-src 'self' ${customScheme}://* 'unsafe-inline' https://fonts.googleapis.com https://*`,
      // data: URLs needed for WebAssembly loading
      `connect-src 'self' ${customScheme}://* blob: data: http://localhost:* ws://localhost:* wss://localhost:* http://127.0.0.1:* ws://127.0.0.1:* wss://127.0.0.1:* https://* wss://*`,
      `img-src 'self' ${customScheme}://* data: blob: http://localhost:* http://127.0.0.1:* https://*`,
      `media-src 'self' ${customScheme}://* blob: http://localhost:* http://127.0.0.1:* https://*`,
      // Allow fonts from external sources
      `font-src 'self' ${customScheme}://* data: https://fonts.gstatic.com https://*`,
      `frame-src 'self' http://localhost:* http://127.0.0.1:* https://*`,
      // Allow web workers
      `worker-src 'self' blob:`,
    ].join("; ");

    // For main-frame responses, use 'same-origin-allow-popups' instead of
    // 'same-origin' for COOP. This allows embedded apps to open popup
    // windows for auth flows (Privy, Base Smart Wallet SDK) while still
    // maintaining cross-origin isolation for the main window.
    const responseHeaders = {
      ...details.responseHeaders,
      "Content-Security-Policy": [base],
      "Cross-Origin-Opener-Policy": ["same-origin-allow-popups"],
    };

    callback({ responseHeaders });
  });
}
