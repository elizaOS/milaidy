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

import fs from "node:fs";
import path from "node:path";
import {
  type BrowserWindow,
  Electrobun,
  GlobalShortcut,
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
  temp: Utils.paths.temp,
  cache: Utils.paths.cache,
  logs: Utils.paths.logs,
  documents: Utils.paths.documents,
  downloads: Utils.paths.downloads,
  desktop: Utils.paths.desktop,
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
  private buildMenuTemplate(
    items: TrayMenuItem[],
  ): Array<Record<string, unknown>> {
    return items.map((item) => {
      if (item.type === "separator") {
        return { type: "separator" };
      }

      const menuItem: Record<string, unknown> = {
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
      this.send("desktopTrayClick", {
        x: 0,
        y: 0,
        button: "left",
        modifiers: { alt: false, shift: false, ctrl: false, meta: false },
      });
    });

    // Context menu item clicks come through the global event bus
    Electrobun.events.on("context-menu-clicked", (action: string) => {
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

  async setAutoLaunch(_options: {
    enabled: boolean;
    openAsHidden?: boolean;
  }): Promise<void> {
    // No equivalent in Electrobun — would require platform-specific
    // LaunchAgent (macOS), systemd (Linux), or registry (Windows).
    // Stub for now.
    console.warn(
      "[DesktopManager] setAutoLaunch is not yet supported in Electrobun",
    );
  }

  async getAutoLaunchStatus(): Promise<{
    enabled: boolean;
    openAsHidden: boolean;
  }> {
    // Stubbed — no equivalent in Electrobun
    return { enabled: false, openAsHidden: false };
  }

  // MARK: - Window Management

  async setWindowOptions(options: WindowOptions): Promise<void> {
    const win = this.getWindow();

    if (options.width !== undefined || options.height !== undefined) {
      const [currentW, currentH] = win.getSize();
      win.setSize(options.width ?? currentW, options.height ?? currentH);
    }

    if (options.x !== undefined || options.y !== undefined) {
      const [currentX, currentY] = win.getPosition();
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
    const [x, y] = win.getPosition();
    const [width, height] = win.getSize();
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
    this.getWindow().show();
  }

  async hideWindow(): Promise<void> {
    // No hide() in Electrobun — use minimize() as fallback
    this.getWindow().minimize();
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
    // No isVisible() in Electrobun — approximate: not minimized
    return { visible: !this.getWindow().isMinimized() };
  }

  async isWindowFocused(): Promise<{ focused: boolean }> {
    // No isFocused() in Electrobun — return true as best-effort stub
    // Window focus events are tracked via the "focus" event listener
    return { focused: true };
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
      this.send("desktopWindowFocus");
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

    this.mainWindow.on("move", () => {
      // Move events don't have a direct desktop push equivalent,
      // but we can use them to detect unmaximize/restore.
      if (this.mainWindow && !this.mainWindow.isMaximized()) {
        this.send("desktopWindowUnmaximize");
      }
    });

    // Note: Electrobun does not have blur/minimize/restore events.
    // desktopWindowBlur, desktopWindowMinimize, desktopWindowRestore
    // are not emitted. Consumers should handle their absence gracefully.
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
      version = Updater.localInfo.version();
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
