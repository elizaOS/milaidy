/**
 * Desktop Native Module for Electrobun
 *
 * Ports the Electron DesktopManager to use Electrobun APIs:
 * - System tray management (Tray)
 * - Global keyboard shortcuts (GlobalShortcut)
 * - Window management (BrowserWindow)
 * - Native notifications (Utils.showNotification)
 * - Clipboard operations (Utils.clipboard*)
 * - Shell operations (Utils.openExternal, Utils.showItemInFolder)
 * - App lifecycle (Utils.quit)
 * - Path resolution (Utils.paths)
 *
 * Key differences from Electron version:
 * - No ipcMain — methods are called directly from rpc-handlers.ts
 * - Uses sendToWebview callback instead of mainWindow.webContents.send()
 * - No powerMonitor — returns stubs
 * - No nativeImage — tray icons use file paths directly
 * - No setOpacity on BrowserWindow — no-op
 * - No hide() on BrowserWindow — uses minimize() as fallback
 * - No app.setLoginItemSettings — stubbed
 * - No shell.beep — no-op
 */

import * as fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Electrobun, {
  type BrowserWindow,
  GlobalShortcut,
  type MenuItemConfig,
  Tray,
  Updater,
  Utils,
} from "electrobun/bun";
import type {
  ClipboardReadResult,
  ClipboardWriteOptions,
  NotificationOptions,
  PowerState,
  ShortcutOptions,
  TrayMenuItem,
  TrayOptions,
  VersionInfo,
  WindowBounds,
  WindowOptions,
} from "../rpc-schema";
import {
  isAppActive,
  isKeyWindow,
  makeKeyAndOrderFront,
  orderOut,
} from "./mac-window-effects";

// ============================================================================
// Types
// ============================================================================

type SendToWebview = (message: string, payload?: unknown) => void;

interface SetAlwaysOnTopOptions {
  flag: boolean;
  level?: string;
}

interface SetFullscreenOptions {
  flag: boolean;
}

interface SetOpacityOptions {
  opacity: number;
}

interface OpenExternalOptions {
  url: string;
}

interface ShowItemInFolderOptions {
  path: string;
}

// ============================================================================
// Path name mapping: Electron path names → Utils.paths equivalents
// ============================================================================

const PATH_NAME_MAP: Record<string, string | (() => string)> = {
  home: Utils.paths.home,
  appData: Utils.paths.appData,
  userData: Utils.paths.userData,
  userCache: Utils.paths.userCache,
  userLogs: Utils.paths.userLogs,
  temp: Utils.paths.temp,
  cache: Utils.paths.cache,
  logs: Utils.paths.logs,
  config: Utils.paths.config,
  documents: Utils.paths.documents,
  downloads: Utils.paths.downloads,
  desktop: Utils.paths.desktop,
  pictures: Utils.paths.pictures,
  music: Utils.paths.music,
  videos: Utils.paths.videos,
};

// ============================================================================
// DesktopManager
// ============================================================================

/**
 * Desktop Manager — handles all native desktop features for Electrobun.
 *
 * Unlike the Electron version, this does NOT register IPC handlers.
 * Methods are called directly from rpc-handlers.ts. Push events to the
 * webview are sent via the sendToWebview callback.
 */
export class DesktopManager {
  private mainWindow: BrowserWindow | null = null;
  private tray: Tray | null = null;
  private shortcuts: Map<string, ShortcutOptions> = new Map();
  private notificationCounter = 0;
  private sendToWebview: SendToWebview | null = null;
  private _windowFocused = true;
  private _windowHidden = false;
  private _focusPoller: ReturnType<typeof setInterval> | null = null;
  private _appActive = false;

  // Track menu items for context-menu-clicked matching
  private trayMenuItems: Map<string, TrayMenuItem> = new Map();

  // MARK: - Configuration

  /**
   * Set the main BrowserWindow reference and wire up window events.
   */
  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
    this.setupWindowEvents();
  }

  /**
   * Set the callback used to push messages to the webview renderer.
   */
  setSendToWebview(fn: SendToWebview): void {
    this.sendToWebview = fn;
  }

  private getWindow(): BrowserWindow {
    if (!this.mainWindow) {
      throw new Error("Main window not available");
    }
    return this.mainWindow;
  }

  private send(message: string, payload?: unknown): void {
    if (this.sendToWebview) {
      this.sendToWebview(message, payload);
    }
  }

  // MARK: - System Tray

  async createTray(options: TrayOptions): Promise<void> {
    if (this.tray) {
      this.tray.remove();
      this.tray = null;
    }

    const iconPath = this.resolveIconPath(options.icon);

    this.tray = new Tray({
      title: options.tooltip ?? options.title ?? "",
      image: iconPath,
    });

    if (options.title && process.platform === "darwin") {
      this.tray.setTitle(options.title);
    }

    if (options.menu) {
      this.setTrayMenu({ menu: options.menu });
    }

    this.setupTrayEvents();
  }

  async updateTray(options: Partial<TrayOptions>): Promise<void> {
    if (!this.tray) return;

    if (options.icon) {
      const iconPath = this.resolveIconPath(options.icon);
      this.tray.setImage(iconPath);
    }

    if (options.title !== undefined && process.platform === "darwin") {
      this.tray.setTitle(options.title);
    }

    if (options.menu) {
      this.setTrayMenu({ menu: options.menu });
    }
  }

  async destroyTray(): Promise<void> {
    if (this.tray) {
      this.tray.remove();
      this.tray = null;
    }
    this.trayMenuItems.clear();
  }

  setTrayMenu(options: { menu: TrayMenuItem[] }): void {
    if (!this.tray) return;

    // Store menu items for action matching
    this.trayMenuItems.clear();
    this.indexMenuItems(options.menu);

    const template = this.buildMenuTemplate(options.menu);
    this.tray.setMenu(template);
  }

  /**
   * Recursively index menu items by id for context-menu-clicked matching.
   */
  private indexMenuItems(items: TrayMenuItem[]): void {
    for (const item of items) {
      if (item.id) {
        this.trayMenuItems.set(item.id, item);
      }
      if (item.submenu) {
        this.indexMenuItems(item.submenu);
      }
    }
  }

  /**
   * Convert TrayMenuItem[] to Electrobun's menu format.
   * Electrobun uses { type, label, action, submenu? }.
   */
  private buildMenuTemplate(items: TrayMenuItem[]): MenuItemConfig[] {
    return items.map((item): MenuItemConfig => {
      if (item.type === "separator") {
        return { type: "separator" };
      }

      const menuItem: MenuItemConfig & { type: "normal" } = {
        type: "normal",
        label: item.label ?? "",
        // Use the item id as the action identifier for matching clicks
        action: item.id,
      };

      if (item.enabled === false) {
        menuItem.enabled = false;
      }

      if (item.submenu) {
        menuItem.submenu = this.buildMenuTemplate(item.submenu);
      }

      return menuItem;
    });
  }

  private setupTrayEvents(): void {
    if (!this.tray) return;

    // Electrobun tray click is simpler — no bounds/modifiers
    this.tray.on("tray-clicked", () => {
      void this.showWindow().catch((err: unknown) => {
        console.warn("[Desktop] Failed to show window from tray click:", err);
      });
      this.send("desktopTrayClick", {
        x: 0,
        y: 0,
        button: "left",
        modifiers: { alt: false, shift: false, ctrl: false, meta: false },
      });
    });

    // Context menu item clicks come through the global event bus.
    // This single handler covers both native actions (show/quit) and
    // renderer notifications, eliminating the need for a duplicate handler
    // in index.ts.
    const triggerAgentRestart = () => {
      // Lazy import to avoid circular dependency (agent → desktop → agent).
      import("./agent").then(({ getAgentManager }) => {
        getAgentManager()
          .restart()
          .catch((err: unknown) => {
            console.error("[Desktop] Agent restart failed:", err);
          });
      });
    };

    Electrobun.events.on(
      "application-menu-clicked",
      (e: { data: { action: string } }) => {
        if (e?.data?.action === "show") {
          void this.showWindow().catch((err: unknown) => {
            console.warn(
              "[Desktop] Failed to show window from application menu:",
              err,
            );
          });
        } else if (e?.data?.action === "restart-agent") {
          triggerAgentRestart();
        }
      },
    );

    Electrobun.events.on("context-menu-clicked", (action: string) => {
      // Native actions
      if (action === "show") {
        void this.showWindow().catch((err: unknown) => {
          console.warn("[Desktop] Failed to show window from tray menu:", err);
        });
      } else if (action === "restart-agent") {
        triggerAgentRestart();
      } else if (action === "quit") {
        Utils.quit();
      }

      // Renderer notification for all items
      const menuItem = this.trayMenuItems.get(action);
      if (menuItem) {
        this.send("desktopTrayMenuClick", {
          itemId: menuItem.id,
          checked:
            menuItem.type === "checkbox" ? !menuItem.checked : menuItem.checked,
        });
      }
    });
  }

  // MARK: - Global Shortcuts

  async registerShortcut(
    options: ShortcutOptions,
  ): Promise<{ success: boolean }> {
    // Unregister existing shortcut with same id
    if (this.shortcuts.has(options.id)) {
      const existing = this.shortcuts.get(options.id);
      if (existing) {
        GlobalShortcut.unregister(existing.accelerator);
      }
    }

    try {
      GlobalShortcut.register(options.accelerator, () => {
        this.send("desktopShortcutPressed", {
          id: options.id,
          accelerator: options.accelerator,
        });
      });
      this.shortcuts.set(options.id, options);
      return { success: true };
    } catch {
      return { success: false };
    }
  }

  async unregisterShortcut(options: { id: string }): Promise<void> {
    const shortcut = this.shortcuts.get(options.id);
    if (shortcut) {
      GlobalShortcut.unregister(shortcut.accelerator);
      this.shortcuts.delete(options.id);
    }
  }

  async unregisterAllShortcuts(): Promise<void> {
    GlobalShortcut.unregisterAll();
    this.shortcuts.clear();
  }

  async isShortcutRegistered(options: {
    accelerator: string;
  }): Promise<{ registered: boolean }> {
    return { registered: GlobalShortcut.isRegistered(options.accelerator) };
  }

  // MARK: - Auto Launch

  async setAutoLaunch(options: {
    enabled: boolean;
    openAsHidden?: boolean;
  }): Promise<void> {
    const appPath = process.execPath;

    const openAsHidden = options.openAsHidden ?? false;

    if (process.platform === "darwin") {
      await this.setAutoLaunchMac(options.enabled, appPath, openAsHidden);
    } else if (process.platform === "linux") {
      this.setAutoLaunchLinux(options.enabled, appPath, openAsHidden);
    } else if (process.platform === "win32") {
      await this.setAutoLaunchWin(options.enabled, appPath, openAsHidden);
    } else {
      console.warn(
        `[DesktopManager] setAutoLaunch: unsupported platform ${process.platform}`,
      );
    }
  }

  async getAutoLaunchStatus(): Promise<{
    enabled: boolean;
    openAsHidden: boolean;
  }> {
    if (process.platform === "darwin") {
      const plistPath = this.getMacLaunchAgentPath();
      if (!fs.existsSync(plistPath))
        return { enabled: false, openAsHidden: false };
      const content = fs.readFileSync(plistPath, "utf8");
      return { enabled: true, openAsHidden: content.includes("--hidden") };
    }

    if (process.platform === "linux") {
      const desktopPath = this.getLinuxAutostartPath();
      if (!fs.existsSync(desktopPath))
        return { enabled: false, openAsHidden: false };
      const content = fs.readFileSync(desktopPath, "utf8");
      return { enabled: true, openAsHidden: content.includes("--hidden") };
    }

    if (process.platform === "win32") {
      const { enabled, openAsHidden } = await this.getAutoLaunchStatusWin();
      return { enabled, openAsHidden };
    }

    return { enabled: false, openAsHidden: false };
  }

  // MARK: - Auto-launch helpers (macOS)

  private getMacLaunchAgentPath(): string {
    return path.join(
      os.homedir(),
      "Library",
      "LaunchAgents",
      "com.miladyai.milady.plist",
    );
  }

  private async setAutoLaunchMac(
    enabled: boolean,
    appPath: string,
    openAsHidden = false,
  ): Promise<void> {
    const plistPath = this.getMacLaunchAgentPath();

    if (enabled) {
      const hiddenArg = openAsHidden ? "\n    <string>--hidden</string>" : "";
      const plistContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.miladyai.milady</string>
  <key>ProgramArguments</key>
  <array>
    <string>${appPath}</string>${hiddenArg}
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <false/>
</dict>
</plist>
`;
      const dir = path.dirname(plistPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(plistPath, plistContent, "utf8");

      const proc = Bun.spawn(["launchctl", "load", plistPath], {
        stdout: "pipe",
        stderr: "pipe",
      });
      await proc.exited;
    } else {
      if (fs.existsSync(plistPath)) {
        const proc = Bun.spawn(["launchctl", "unload", plistPath], {
          stdout: "pipe",
          stderr: "pipe",
        });
        await proc.exited;
        fs.unlinkSync(plistPath);
      }
    }
  }

  // MARK: - Auto-launch helpers (Linux)

  private getLinuxAutostartPath(): string {
    return path.join(os.homedir(), ".config", "autostart", "milady.desktop");
  }

  private setAutoLaunchLinux(
    enabled: boolean,
    appPath: string,
    openAsHidden = false,
  ): void {
    const desktopPath = this.getLinuxAutostartPath();

    if (enabled) {
      const execLine = openAsHidden ? `${appPath} --hidden` : appPath;
      const desktopContent = `[Desktop Entry]
Type=Application
Name=Milady
Exec=${execLine}
X-GNOME-Autostart-enabled=true
`;
      const dir = path.dirname(desktopPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(desktopPath, desktopContent, "utf8");
    } else {
      if (fs.existsSync(desktopPath)) {
        fs.unlinkSync(desktopPath);
      }
    }
  }

  // MARK: - Auto-launch helpers (Windows)

  private readonly WIN_REG_KEY =
    "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run";

  private async setAutoLaunchWin(
    enabled: boolean,
    appPath: string,
    openAsHidden = false,
  ): Promise<void> {
    if (enabled) {
      const launchValue = openAsHidden ? `${appPath} --hidden` : appPath;
      const proc = Bun.spawn(
        [
          "reg",
          "add",
          this.WIN_REG_KEY,
          "/v",
          "Milady",
          "/t",
          "REG_SZ",
          "/d",
          launchValue,
          "/f",
        ],
        { stdout: "pipe", stderr: "pipe" },
      );
      await proc.exited;
    } else {
      const proc = Bun.spawn(
        ["reg", "delete", this.WIN_REG_KEY, "/v", "Milady", "/f"],
        { stdout: "pipe", stderr: "pipe" },
      );
      await proc.exited;
    }
  }

  private async getAutoLaunchStatusWin(): Promise<{
    enabled: boolean;
    openAsHidden: boolean;
  }> {
    try {
      const proc = Bun.spawn(
        ["reg", "query", this.WIN_REG_KEY, "/v", "Milady"],
        { stdout: "pipe", stderr: "pipe" },
      );
      const [stdout] = await Promise.all([
        new Response(proc.stdout).text(),
        proc.exited,
      ]);
      if (!stdout.includes("Milady"))
        return { enabled: false, openAsHidden: false };
      return { enabled: true, openAsHidden: stdout.includes("--hidden") };
    } catch {
      return { enabled: false, openAsHidden: false };
    }
  }

  // MARK: - Window Management

  async setWindowOptions(options: WindowOptions): Promise<void> {
    const win = this.getWindow();

    if (options.width !== undefined || options.height !== undefined) {
      const { width: currentW, height: currentH } = win.getSize();
      win.setSize(options.width ?? currentW, options.height ?? currentH);
    }

    if (options.x !== undefined || options.y !== undefined) {
      const { x: currentX, y: currentY } = win.getPosition();
      win.setPosition(options.x ?? currentX, options.y ?? currentY);
    }

    // minWidth/minHeight/maxWidth/maxHeight — not directly supported
    // in Electrobun BrowserWindow. Skip silently.

    if (options.alwaysOnTop !== undefined) {
      win.setAlwaysOnTop(options.alwaysOnTop);
    }

    if (options.fullscreen !== undefined) {
      win.setFullScreen(options.fullscreen);
    }

    // opacity — no setOpacity in Electrobun (no-op)
    if (options.opacity !== undefined) {
      // No-op: Electrobun BrowserWindow does not support setOpacity
    }

    if (options.title !== undefined) {
      win.setTitle(options.title);
    }

    // resizable — not directly settable post-creation in Electrobun.
    // Skip silently.
  }

  async getWindowBounds(): Promise<WindowBounds> {
    const win = this.getWindow();
    const { x, y } = win.getPosition();
    const { width, height } = win.getSize();
    return { x, y, width, height };
  }

  async setWindowBounds(options: WindowBounds): Promise<void> {
    const win = this.getWindow();
    win.setPosition(options.x, options.y);
    win.setSize(options.width, options.height);
  }

  async minimizeWindow(): Promise<void> {
    this.getWindow().minimize();
  }

  async maximizeWindow(): Promise<void> {
    this.getWindow().maximize();
  }

  async unmaximizeWindow(): Promise<void> {
    this.getWindow().unmaximize();
  }

  async closeWindow(): Promise<void> {
    this.getWindow().close();
  }

  async showWindow(): Promise<void> {
    const win = this.mainWindow;
    if (!win) return;
    const ptr = (win as { ptr?: unknown }).ptr;
    if (ptr && process.platform === "darwin") {
      makeKeyAndOrderFront(ptr as Parameters<typeof makeKeyAndOrderFront>[0]);
    } else {
      win.show();
      win.focus();
    }
    this._windowHidden = false;
  }

  async hideWindow(): Promise<void> {
    const win = this.mainWindow;
    if (!win) return;
    const ptr = (win as { ptr?: unknown }).ptr;
    if (ptr && process.platform === "darwin") {
      // orderOut removes the window from screen AND Cmd+Tab / Mission Control
      orderOut(ptr as Parameters<typeof orderOut>[0]);
    } else {
      // Non-macOS fallback: minimize
      win.minimize();
    }
    this._windowHidden = true;
  }

  async focusWindow(): Promise<void> {
    this.getWindow().focus();
  }

  async isWindowMaximized(): Promise<{ maximized: boolean }> {
    return { maximized: this.getWindow().isMaximized() };
  }

  async isWindowMinimized(): Promise<{ minimized: boolean }> {
    return { minimized: this.getWindow().isMinimized() };
  }

  async isWindowVisible(): Promise<{ visible: boolean }> {
    if (this._windowHidden) return { visible: false };
    const win = this.getWindow();
    return { visible: !win.isMinimized() };
  }

  async isWindowFocused(): Promise<{ focused: boolean }> {
    return { focused: this._windowFocused };
  }

  async setAlwaysOnTop(options: SetAlwaysOnTopOptions): Promise<void> {
    // Electrobun setAlwaysOnTop takes a boolean — ignore level
    this.getWindow().setAlwaysOnTop(options.flag);
  }

  async setFullscreen(options: SetFullscreenOptions): Promise<void> {
    this.getWindow().setFullScreen(options.flag);
  }

  async setOpacity(_options: SetOpacityOptions): Promise<void> {
    // No-op: Electrobun BrowserWindow does not support setOpacity
  }

  private setupWindowEvents(): void {
    if (!this.mainWindow) return;

    this.mainWindow.on("focus", () => {
      this._windowFocused = true;
      this.send("desktopWindowFocus");
    });

    // Blur via native event (Electrobun may not surface this, but try it for free)
    this.mainWindow.on("blur", () => {
      this._windowFocused = false;
      this.send("desktopWindowBlur");
    });

    this.mainWindow.on("close", () => {
      this.send("desktopWindowClose");
    });

    this.mainWindow.on("resize", () => {
      // Electrobun fires resize but doesn't distinguish maximize/unmaximize.
      // We detect state changes to emit the right event.
      if (this.mainWindow?.isMaximized()) {
        this.send("desktopWindowMaximize");
      }
    });

    let wasMaximized = false;
    this.mainWindow.on("move", () => {
      // Only emit desktopWindowUnmaximize when transitioning FROM maximized
      // to not-maximized, not on every move during a normal window drag.
      const isMaximized = this.mainWindow?.isMaximized() ?? false;
      if (wasMaximized && !isMaximized) {
        this.send("desktopWindowUnmaximize");
      }
      wasMaximized = isMaximized;
    });

    // Blur fallback: poll [NSWindow isKeyWindow] at 2Hz on macOS.
    // Electrobun does not guarantee blur events, so this gives bounded
    // ≤500ms latency for focus-loss detection.
    if (process.platform === "darwin") {
      this._startFocusPoller();
    }
  }

  private _startFocusPoller(): void {
    if (this._focusPoller) return;
    this._focusPoller = setInterval(() => {
      const win = this.mainWindow;
      if (!win) return;

      // Electrobun does not expose an application activation callback.
      // When the app becomes foreground again with only a minimized window
      // (for example via Dock click), restore it automatically.
      const appActive = isAppActive();
      if (!this._appActive && appActive && win.isMinimized()) {
        void this.showWindow();
      }
      this._appActive = appActive;

      const ptr = (win as { ptr?: unknown }).ptr;
      if (!ptr) return;
      const focused = isKeyWindow(ptr as Parameters<typeof isKeyWindow>[0]);
      if (focused !== this._windowFocused) {
        this._windowFocused = focused;
        if (!focused) {
          this.send("desktopWindowBlur");
        }
      }
    }, 500);
  }

  // MARK: - Notifications

  async showNotification(
    options: NotificationOptions,
  ): Promise<{ id: string }> {
    const id = `notification_${++this.notificationCounter}`;

    // Electrobun Utils.showNotification — fire-and-forget, no event callbacks
    Utils.showNotification({
      title: options.title,
      body: options.body,
      subtitle: undefined,
      silent: options.silent,
    });

    return { id };
  }

  async closeNotification(_options: { id: string }): Promise<void> {
    // Electrobun does not support programmatic notification dismissal.
    // No-op.
  }

  // MARK: - Power Monitor

  async getPowerState(): Promise<PowerState> {
    // No powerMonitor equivalent in Electrobun — return stub
    return {
      onBattery: false,
      idleState: "unknown",
      idleTime: 0,
    };
  }

  // MARK: - App

  async quit(): Promise<void> {
    Utils.quit();
  }

  async relaunch(): Promise<void> {
    // Electrobun does not have a built-in relaunch.
    // Quit and let the OS or process manager restart.
    console.warn(
      "[DesktopManager] relaunch is not natively supported — calling quit()",
    );
    Utils.quit();
  }

  async getVersion(): Promise<VersionInfo> {
    let version = "0.0.0";
    try {
      version = await Updater.localInfo.version();
    } catch {
      // Updater may not be available in dev
    }

    return {
      version,
      name: "Milady",
      runtime: `electrobun/${Bun.version}`,
    };
  }

  async isPackaged(): Promise<{ packaged: boolean }> {
    // In Electrobun, check if running from a built bundle
    // DEV mode typically has specific env flags
    return {
      packaged:
        process.env.NODE_ENV === "production" || !process.env.ELECTROBUN_DEV,
    };
  }

  async getPath(options: { name: string }): Promise<{ path: string }> {
    const mapped = PATH_NAME_MAP[options.name];
    if (typeof mapped === "function") {
      return { path: mapped() };
    }
    if (typeof mapped === "string") {
      return { path: mapped };
    }

    // Fallback: try to return a sensible default under userData
    console.warn(
      `[DesktopManager] Unknown path name "${options.name}", falling back to userData`,
    );
    return { path: Utils.paths.userData };
  }

  // MARK: - Clipboard

  async writeToClipboard(options: ClipboardWriteOptions): Promise<void> {
    if (options.text) {
      Utils.clipboardWriteText(options.text);
    } else if (options.image) {
      // Electrobun clipboardWriteImage expects image data
      // @ts-expect-error — image is base64 string; clipboardWriteImage accepts Uint8Array at runtime
      Utils.clipboardWriteImage(options.image);
    }
    // html/rtf not supported by Electrobun clipboard — drop silently
  }

  async readFromClipboard(): Promise<ClipboardReadResult> {
    const text = Utils.clipboardReadText();
    let hasImage = false;
    try {
      const imgData = Utils.clipboardReadImage();
      hasImage = !!imgData && imgData.length > 0;
    } catch {
      // clipboardReadImage may throw if no image data
    }

    return {
      text: text || undefined,
      // html/rtf not supported by Electrobun clipboard
      hasImage,
    };
  }

  async clearClipboard(): Promise<void> {
    Utils.clipboardClear();
  }

  // MARK: - Shell

  /**
   * Open an external URL in the default browser.
   * SECURITY: restricted to http/https to prevent opening arbitrary protocols.
   */
  async openExternal(options: OpenExternalOptions): Promise<void> {
    const url = typeof options.url === "string" ? options.url.trim() : "";
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new Error(
          `Blocked openExternal for non-http(s) URL: ${parsed.protocol}`,
        );
      }
    } catch (err) {
      if (err instanceof TypeError) {
        throw new Error(`Invalid URL passed to openExternal: ${url}`);
      }
      throw err;
    }
    Utils.openExternal(url);
  }

  /**
   * Reveal a file in the OS file manager.
   * SECURITY: requires an absolute path.
   */
  async showItemInFolder(options: ShowItemInFolderOptions): Promise<void> {
    const p = typeof options.path === "string" ? options.path.trim() : "";
    if (!p || !path.isAbsolute(p)) {
      throw new Error("showItemInFolder requires an absolute path");
    }
    Utils.showItemInFolder(p);
  }

  async beep(): Promise<void> {
    // No shell.beep() equivalent in Electrobun — no-op
  }

  // MARK: - Helpers

  /**
   * Resolve an icon path, trying absolute, then relative to known asset dirs.
   */
  private resolveIconPath(iconPath: string): string {
    if (path.isAbsolute(iconPath)) {
      return iconPath;
    }

    // Try relative to the electrobun assets directory
    const assetsPath = path.join(import.meta.dir, "../../assets", iconPath);
    if (fs.existsSync(assetsPath)) {
      return assetsPath;
    }

    // Try relative to cwd
    const cwdPath = path.join(process.cwd(), iconPath);
    if (fs.existsSync(cwdPath)) {
      return cwdPath;
    }

    // Return as-is and let Electrobun handle it
    return iconPath;
  }

  /**
   * Clean up all resources.
   */
  dispose(): void {
    if (this._focusPoller) {
      clearInterval(this._focusPoller);
      this._focusPoller = null;
    }
    this.unregisterAllShortcuts();
    this.destroyTray();
    this.trayMenuItems.clear();
    this.sendToWebview = null;
  }
}

// ============================================================================
// Singleton
// ============================================================================

let desktopManager: DesktopManager | null = null;

export function getDesktopManager(): DesktopManager {
  if (!desktopManager) {
    desktopManager = new DesktopManager();
  }
  return desktopManager;
}
