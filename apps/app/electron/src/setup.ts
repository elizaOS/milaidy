import type { CapacitorElectronConfig } from '@capacitor-community/electron';
import {
  CapElectronEventEmitter,
  CapacitorSplashScreen,
  setupCapacitorElectronPlugins,
} from '@capacitor-community/electron';
import chokidar from 'chokidar';
import type { MenuItemConstructorOptions } from 'electron';
import { app, BrowserWindow, clipboard, Menu, MenuItem, nativeImage, Tray, session, shell } from 'electron';
import electronIsDev from 'electron-is-dev';
import electronServe from 'electron-serve';
import windowStateKeeper from 'electron-window-state';
import { existsSync } from 'node:fs';
import { join } from 'path';
import { buildMissingWebAssetsMessage, resolveWebAssetDirectory } from './web-assets';

// Define components for a watcher to detect when the webapp is changed so we can reload in Dev mode.
const reloadWatcher = {
  debouncer: null,
  ready: false,
  watcher: null,
};
export function setupReloadWatcher(electronCapacitorApp: ElectronCapacitorApp): void {
  const watchDir = electronCapacitorApp.getWebAssetDirectory();
  reloadWatcher.watcher = chokidar
    .watch(watchDir, {
      ignored: /[/\\]\./,
      persistent: true,
    })
    .on('ready', () => {
      reloadWatcher.ready = true;
    })
    .on('all', (_event, _path) => {
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
    new MenuItem({ label: 'Quit App', role: 'quit' }),
  ];
  private AppMenuBarMenuTemplate: (MenuItem | MenuItemConstructorOptions)[] = [
    { role: process.platform === 'darwin' ? 'appMenu' : 'fileMenu' },
    { role: 'viewMenu' },
  ];
  private mainWindowState;
  private loadWebApp;
  private customScheme: string;
  private webAssetDirectory: string;

  constructor(
    capacitorFileConfig: CapacitorElectronConfig,
    trayMenuTemplate?: (MenuItemConstructorOptions | MenuItem)[],
    appMenuBarMenuTemplate?: (MenuItemConstructorOptions | MenuItem)[]
  ) {
    this.CapacitorFileConfig = capacitorFileConfig;

    this.customScheme = this.CapacitorFileConfig.electron?.customUrlScheme ?? 'capacitor-electron';

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
          `[Milaidy] Dev mode: using web assets at ${this.webAssetDirectory} instead of synced ${join(app.getAppPath(), 'app')}`
        );
      } else {
        console.warn(
          `[Milaidy] Using fallback web assets at ${this.webAssetDirectory} because ${join(app.getAppPath(), 'app')} is missing index.html`
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

    try {
      await thisRef.loadWebApp(thisRef.MainWindow);
      return;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.error(`[Milaidy] Failed to load web app via ${thisRef.customScheme}:// (${reason})`);
    }

    // Fallback: attempt direct file:// load when the custom protocol fails.
    const fallbackIndexPath = join(thisRef.webAssetDirectory, 'index.html');
    if (existsSync(fallbackIndexPath)) {
      try {
        await thisRef.MainWindow.loadFile(fallbackIndexPath);
        console.info(`[Milaidy] Loaded fallback web assets from ${fallbackIndexPath}`);
        return;
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        console.error(`[Milaidy] Fallback file:// load failed (${reason})`);
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
    const html = `<html><body style="font-family: sans-serif; margin: 24px;"><h2>Milaidy Desktop Failed to Load UI Assets</h2><pre style="white-space: pre-wrap;">${diagnostics}</pre></body></html>`;
    await thisRef.MainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
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
      join(app.getAppPath(), 'assets', process.platform === 'win32' ? 'appIcon.ico' : 'appIcon.png')
    );
    this.mainWindowState = windowStateKeeper({
      defaultWidth: 1000,
      defaultHeight: 800,
    });
    // Setup preload script path and construct our main window.
    const preloadPath = join(app.getAppPath(), 'build', 'src', 'preload.js');
    this.MainWindow = new BrowserWindow({
      icon,
      show: false,
      title: 'Milaidy',
      backgroundColor: '#0a0a0a',
      x: this.mainWindowState.x,
      y: this.mainWindowState.y,
      width: this.mainWindowState.width,
      height: this.mainWindowState.height,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: true,
        // Use preload to inject the electron variant overrides for capacitor plugins.
        preload: preloadPath,
      },
    });
    this.mainWindowState.manage(this.MainWindow);

    if (this.CapacitorFileConfig.electron?.backgroundColor) {
      this.MainWindow.setBackgroundColor(this.CapacitorFileConfig.electron.backgroundColor);
    }

    // If we close the main window with the splashscreen enabled we need to destory the ref.
    this.MainWindow.on('closed', () => {
      if (this.SplashScreen?.getSplashWindow() && !this.SplashScreen.getSplashWindow().isDestroyed()) {
        this.SplashScreen.getSplashWindow().close();
      }
    });

    // When the tray icon is enabled, setup the options.
    if (this.CapacitorFileConfig.electron?.trayIconAndMenuEnabled) {
      this.TrayIcon = new Tray(icon);
      this.TrayIcon.on('double-click', () => {
        if (this.MainWindow) {
          if (this.MainWindow.isVisible()) {
            this.MainWindow.hide();
          } else {
            this.MainWindow.show();
            this.MainWindow.focus();
          }
        }
      });
      this.TrayIcon.on('click', () => {
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
      this.TrayIcon.setContextMenu(Menu.buildFromTemplate(this.TrayMenuTemplate));
    }

    // Setup the main manu bar at the top of our window.
    Menu.setApplicationMenu(Menu.buildFromTemplate(this.AppMenuBarMenuTemplate));

    // If the splashscreen is enabled, show it first while the main window loads then switch it out for the main window, or just load the main window from the start.
    if (this.CapacitorFileConfig.electron?.splashScreenEnabled) {
      this.SplashScreen = new CapacitorSplashScreen({
        imageFilePath: join(
          app.getAppPath(),
          'assets',
          this.CapacitorFileConfig.electron?.splashScreenImageName ?? 'splash.png'
        ),
        windowWidth: 400,
        windowHeight: 400,
      });
      this.SplashScreen.init(this.loadMainWindow, this);
    } else {
      void this.loadMainWindow(this);
    }

    // Security
    const isAllowedUrl = (raw: string): boolean => {
      try {
        const url = new URL(raw);
        if (url.protocol === `${this.customScheme}:`) return true;
        if (electronIsDev && (url.protocol === "http:" || url.protocol === "https:")) {
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

    this.MainWindow.webContents.setWindowOpenHandler((details) => {
      if (!isAllowedUrl(details.url)) {
        openExternal(details.url);
        return { action: 'deny' };
      }
      return { action: 'allow' };
    });
    this.MainWindow.webContents.on('will-navigate', (event, newURL) => {
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
    this.MainWindow.once('ready-to-show', () => {
      showWindow();
    });

    // When the web app is loaded we open devtools in dev mode.
    this.MainWindow.webContents.on('dom-ready', () => {
      showWindow();
      setTimeout(() => {
        const devtoolsDisabled = process.env.MILAIDY_ELECTRON_DISABLE_DEVTOOLS === '1';
        if (electronIsDev && !devtoolsDisabled && !this.MainWindow.isDestroyed()) {
          this.MainWindow.webContents.openDevTools();
        }
        CapElectronEventEmitter.emit('CAPELECTRON_DeeplinkListenerInitialized', '');
      }, 400);
    });

    // ── Context menu ──────────────────────────────────────────────────
    this.MainWindow.webContents.on('context-menu', (_event, params) => {
      const menuItems: MenuItemConstructorOptions[] = [];

      // Text selection actions
      if (params.selectionText) {
        const text = params.selectionText.trim();
        menuItems.push(
          { role: 'copy' },
          { type: 'separator' },
          {
            label: 'Save as /Command',
            click: () => this.MainWindow.webContents.send('contextMenu:saveAsCommand', { text }),
          },
          {
            label: 'Ask Agent About This',
            click: () => this.MainWindow.webContents.send('contextMenu:askAgent', { text }),
          },
          {
            label: 'Create Skill from This',
            click: () => this.MainWindow.webContents.send('contextMenu:createSkill', { text }),
          },
          {
            label: 'Quote in Chat',
            click: () => this.MainWindow.webContents.send('contextMenu:quoteInChat', { text }),
          },
        );
      }

      // Link actions
      if (params.linkURL) {
        if (menuItems.length > 0) menuItems.push({ type: 'separator' });
        menuItems.push(
          {
            label: 'Open Link in Browser',
            click: () => shell.openExternal(params.linkURL),
          },
          {
            label: 'Copy Link Address',
            click: () => clipboard.writeText(params.linkURL),
          },
        );
      }

      // Image actions
      if (params.hasImageContents) {
        if (menuItems.length > 0) menuItems.push({ type: 'separator' });
        menuItems.push(
          {
            label: 'Copy Image',
            click: () => this.MainWindow.webContents.copyImageAt(params.x, params.y),
          },
          {
            label: 'Save Image As...',
            click: () => this.MainWindow.webContents.downloadURL(params.srcURL),
          },
        );
      }

      // Editable field actions
      if (params.isEditable) {
        if (menuItems.length > 0) menuItems.push({ type: 'separator' });
        menuItems.push(
          { role: 'undo' },
          { role: 'redo' },
          { type: 'separator' },
          { role: 'cut' },
          { role: 'copy' },
          { role: 'paste' },
          { type: 'separator' },
          { role: 'selectAll' },
        );
      }

      // Always-present items
      if (menuItems.length > 0) menuItems.push({ type: 'separator' });
      menuItems.push({ role: 'reload' });
      if (electronIsDev) {
        menuItems.push({
          label: 'Inspect Element',
          click: () => this.MainWindow.webContents.inspectElement(params.x, params.y),
        });
      }

      Menu.buildFromTemplate(menuItems).popup();
    });

    // Handle content load failures — still show the window so it isn't invisible.
    this.MainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
      console.error(`[Milaidy] Content failed to load (${errorCode}): ${errorDescription}`);
      showWindow();
    });

    // Failsafe: if nothing else shows the window within 5 seconds, force show it.
    setTimeout(() => {
      showWindow();
    }, 5000);
  }
}

// Set a CSP up for our application based on the custom scheme.
// Allows connections to the embedded API server on localhost and WebSocket.
// frame-src allows embedding game clients from localhost and known game domains.
export function setupContentSecurityPolicy(customScheme: string): void {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const base = [
      `default-src 'self' ${customScheme}://* https://*`,
      `script-src 'self' ${customScheme}://* 'unsafe-inline'${electronIsDev ? " devtools://*" : ""}`,
      `style-src 'self' ${customScheme}://* 'unsafe-inline'`,
      `connect-src 'self' ${customScheme}://* blob: http://localhost:* ws://localhost:* wss://localhost:* http://127.0.0.1:* ws://127.0.0.1:* wss://127.0.0.1:* https://* wss://*`,
      `img-src 'self' ${customScheme}://* data: blob: https://*`,
      `media-src 'self' ${customScheme}://* blob: https://*`,
      `font-src 'self' ${customScheme}://* data:`,
      `frame-src 'self' http://localhost:* https://*`,
    ].join('; ');

    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [base],
      },
    });
  });
}
