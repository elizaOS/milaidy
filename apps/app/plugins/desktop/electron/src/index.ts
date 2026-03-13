/**
 * Desktop Plugin for Electron
 *
 * This module provides native desktop features for the Electron platform including:
 * - System tray management
 * - Global keyboard shortcuts
 * - Auto-launch on system startup
 * - Window management
 * - Native notifications
 * - Power monitoring
 * - Clipboard operations
 * - Shell operations
 *
 * This file should be loaded in the Electron main process and
 * its API exposed to the renderer via the desktop RPC bridge.
 */

import type { PluginListenerHandle } from "@capacitor/core";
import {
  invokeDesktopBridgeRequest,
  subscribeDesktopBridgeEvent,
} from "@milady/app-core/bridge/electrobun-rpc";
import type {
  AutoLaunchOptions,
  DesktopPlugin,
  GlobalShortcut,
  GlobalShortcutEvent,
  NotificationEvent,
  NotificationOptions,
  PowerMonitorState,
  TrayClickEvent,
  TrayMenuClickEvent,
  TrayMenuItem,
  TrayOptions,
  WindowBounds,
  WindowOptions,
} from "../../src/definitions";

type DesktopEventPayloads = {
  trayClick: TrayClickEvent;
  trayDoubleClick: TrayClickEvent;
  trayRightClick: TrayClickEvent;
  trayMenuClick: TrayMenuClickEvent;
  shortcutPressed: GlobalShortcutEvent;
  notificationClick: NotificationEvent;
  notificationAction: NotificationEvent;
  notificationReply: NotificationEvent;
  windowFocus: undefined;
  windowBlur: undefined;
  windowMaximize: undefined;
  windowUnmaximize: undefined;
  windowMinimize: undefined;
  windowRestore: undefined;
  windowClose: undefined;
  powerSuspend: undefined;
  powerResume: undefined;
  powerOnAC: undefined;
  powerOnBattery: undefined;
};

type DesktopEventName = keyof DesktopEventPayloads;
type DesktopEventData = DesktopEventPayloads[DesktopEventName];
type EventCallback<T = DesktopEventData> = (event: T) => void;

interface ListenerEntry {
  eventName: DesktopEventName;
  callback: EventCallback;
}

type AlwaysOnTopLevel = Parameters<DesktopPlugin["setAlwaysOnTop"]>[0]["level"];
type DesktopPathName = Parameters<DesktopPlugin["getPath"]>[0]["name"];
type DesktopVersionResult =
  | {
      version: string;
      name: string;
      runtime: string;
    }
  | {
      version: string;
      name: string;
      electron: string;
      chrome: string;
      node: string;
    };

const DESKTOP_RPC_EVENTS: Partial<
  Record<DesktopEventName, { rpcMessage: string }>
> = {
  trayClick: {
    rpcMessage: "desktopTrayClick",
  },
  trayMenuClick: {
    rpcMessage: "desktopTrayMenuClick",
  },
  shortcutPressed: {
    rpcMessage: "desktopShortcutPressed",
  },
  windowFocus: {
    rpcMessage: "desktopWindowFocus",
  },
  windowBlur: {
    rpcMessage: "desktopWindowBlur",
  },
  windowMaximize: {
    rpcMessage: "desktopWindowMaximize",
  },
  windowUnmaximize: {
    rpcMessage: "desktopWindowUnmaximize",
  },
  windowClose: {
    rpcMessage: "desktopWindowClose",
  },
};

/**
 * Helper to throw when the desktop bridge is unavailable.
 * Desktop plugin features require Electrobun's native desktop runtime.
 */
function requireDesktopBridge(feature: string): never {
  throw new Error(
    `${feature} is not available: desktop RPC bridge not found. ` +
      "The Desktop plugin requires the native desktop runtime with configured RPC handlers.",
  );
}

/**
 * Desktop Plugin implementation for Electron
 * Uses the desktop RPC bridge to communicate with the native runtime.
 */
export class DesktopElectron implements DesktopPlugin {
  private listeners: ListenerEntry[] = [];
  private internalSubscriptions: Array<() => void> = [];

  constructor() {
    this.setupDesktopListeners();
  }

  private async invokeBridge<T>(
    feature: string,
    rpcMethod: string,
    params?: unknown,
  ): Promise<T> {
    const result = await invokeDesktopBridgeRequest<T>({
      rpcMethod,
      params,
    });
    if (result === null) {
      requireDesktopBridge(feature);
    }
    return result as T;
  }

  private setupDesktopListeners(): void {
    const events: DesktopEventName[] = [
      "trayClick",
      "trayDoubleClick",
      "trayRightClick",
      "trayMenuClick",
      "shortcutPressed",
      "notificationClick",
      "notificationAction",
      "notificationReply",
      "windowFocus",
      "windowBlur",
      "windowMaximize",
      "windowUnmaximize",
      "windowMinimize",
      "windowRestore",
      "windowClose",
      "powerSuspend",
      "powerResume",
      "powerOnAC",
      "powerOnBattery",
    ];

    for (const eventName of events) {
      const rpcEvent = DESKTOP_RPC_EVENTS[eventName];
      if (!rpcEvent) {
        continue;
      }

      const unsubscribe = subscribeDesktopBridgeEvent({
        rpcMessage: rpcEvent.rpcMessage,
        listener: (data) => {
          this.notifyListeners(
            eventName,
            data as DesktopEventPayloads[typeof eventName],
          );
        },
      });
      this.internalSubscriptions.push(unsubscribe);
    }
  }

  // System Tray
  async createTray(options: TrayOptions): Promise<void> {
    await this.invokeBridge("createTray", "desktopCreateTray", options);
  }

  async updateTray(options: Partial<TrayOptions>): Promise<void> {
    await this.invokeBridge("updateTray", "desktopUpdateTray", options);
  }

  async destroyTray(): Promise<void> {
    await this.invokeBridge("destroyTray", "desktopDestroyTray");
  }

  async setTrayMenu(options: { menu: TrayMenuItem[] }): Promise<void> {
    await this.invokeBridge("setTrayMenu", "desktopSetTrayMenu", options);
  }

  // Global Shortcuts
  async registerShortcut(
    options: GlobalShortcut,
  ): Promise<{ success: boolean }> {
    return await this.invokeBridge<{ success: boolean }>(
      "registerShortcut",
      "desktopRegisterShortcut",
      options,
    );
  }

  async unregisterShortcut(options: { id: string }): Promise<void> {
    await this.invokeBridge(
      "unregisterShortcut",
      "desktopUnregisterShortcut",
      options,
    );
  }

  async unregisterAllShortcuts(): Promise<void> {
    await this.invokeBridge(
      "unregisterAllShortcuts",
      "desktopUnregisterAllShortcuts",
    );
  }

  async isShortcutRegistered(options: {
    accelerator: string;
  }): Promise<{ registered: boolean }> {
    return await this.invokeBridge<{ registered: boolean }>(
      "isShortcutRegistered",
      "desktopIsShortcutRegistered",
      options,
    );
  }

  // Auto Launch
  async setAutoLaunch(options: AutoLaunchOptions): Promise<void> {
    await this.invokeBridge("setAutoLaunch", "desktopSetAutoLaunch", options);
  }

  async getAutoLaunchStatus(): Promise<{
    enabled: boolean;
    openAsHidden: boolean;
  }> {
    return await this.invokeBridge<{
      enabled: boolean;
      openAsHidden: boolean;
    }>("getAutoLaunchStatus", "desktopGetAutoLaunchStatus");
  }

  // Window Management
  async setWindowOptions(options: WindowOptions): Promise<void> {
    await this.invokeBridge(
      "setWindowOptions",
      "desktopSetWindowOptions",
      options,
    );
  }

  async getWindowBounds(): Promise<WindowBounds> {
    return await this.invokeBridge<WindowBounds>(
      "getWindowBounds",
      "desktopGetWindowBounds",
    );
  }

  async setWindowBounds(options: WindowBounds): Promise<void> {
    await this.invokeBridge(
      "setWindowBounds",
      "desktopSetWindowBounds",
      options,
    );
  }

  async minimizeWindow(): Promise<void> {
    await this.invokeBridge("minimizeWindow", "desktopMinimizeWindow");
  }

  async maximizeWindow(): Promise<void> {
    await this.invokeBridge("maximizeWindow", "desktopMaximizeWindow");
  }

  async unmaximizeWindow(): Promise<void> {
    await this.invokeBridge("unmaximizeWindow", "desktopUnmaximizeWindow");
  }

  async closeWindow(): Promise<void> {
    await this.invokeBridge("closeWindow", "desktopCloseWindow");
  }

  async showWindow(): Promise<void> {
    await this.invokeBridge("showWindow", "desktopShowWindow");
  }

  async hideWindow(): Promise<void> {
    await this.invokeBridge("hideWindow", "desktopHideWindow");
  }

  async focusWindow(): Promise<void> {
    await this.invokeBridge("focusWindow", "desktopFocusWindow");
  }

  async isWindowMaximized(): Promise<{ maximized: boolean }> {
    return await this.invokeBridge<{ maximized: boolean }>(
      "isWindowMaximized",
      "desktopIsWindowMaximized",
    );
  }

  async isWindowMinimized(): Promise<{ minimized: boolean }> {
    return await this.invokeBridge<{ minimized: boolean }>(
      "isWindowMinimized",
      "desktopIsWindowMinimized",
    );
  }

  async isWindowVisible(): Promise<{ visible: boolean }> {
    return await this.invokeBridge<{ visible: boolean }>(
      "isWindowVisible",
      "desktopIsWindowVisible",
    );
  }

  async isWindowFocused(): Promise<{ focused: boolean }> {
    return await this.invokeBridge<{ focused: boolean }>(
      "isWindowFocused",
      "desktopIsWindowFocused",
    );
  }

  async setAlwaysOnTop(options: {
    flag: boolean;
    level?: AlwaysOnTopLevel;
  }): Promise<void> {
    await this.invokeBridge("setAlwaysOnTop", "desktopSetAlwaysOnTop", options);
  }

  async setFullscreen(options: { flag: boolean }): Promise<void> {
    await this.invokeBridge("setFullscreen", "desktopSetFullscreen", options);
  }

  async setOpacity(options: { opacity: number }): Promise<void> {
    await this.invokeBridge("setOpacity", "desktopSetOpacity", options);
  }

  // Notifications
  async showNotification(
    options: NotificationOptions,
  ): Promise<{ id: string }> {
    return await this.invokeBridge<{ id: string }>(
      "showNotification",
      "desktopShowNotification",
      options,
    );
  }

  async closeNotification(options: { id: string }): Promise<void> {
    await this.invokeBridge(
      "closeNotification",
      "desktopCloseNotification",
      options,
    );
  }

  // Power Monitor
  async getPowerState(): Promise<PowerMonitorState> {
    return await this.invokeBridge<PowerMonitorState>(
      "getPowerState",
      "desktopGetPowerState",
    );
  }

  // App
  async quit(): Promise<void> {
    await this.invokeBridge("quit", "desktopQuit");
  }

  async relaunch(): Promise<void> {
    await this.invokeBridge("relaunch", "desktopRelaunch");
  }

  async getVersion(): Promise<{
    version: string;
    name: string;
    electron: string;
    chrome: string;
    node: string;
  }> {
    const version = await this.invokeBridge<DesktopVersionResult>(
      "getVersion",
      "desktopGetVersion",
    );
    if ("runtime" in version) {
      return {
        version: version.version,
        name: version.name,
        electron: version.runtime,
        chrome: "N/A",
        node: "N/A",
      };
    }
    return version;
  }

  async isPackaged(): Promise<{ packaged: boolean }> {
    return await this.invokeBridge<{ packaged: boolean }>(
      "isPackaged",
      "desktopIsPackaged",
    );
  }

  async getPath(options: { name: DesktopPathName }): Promise<{ path: string }> {
    return await this.invokeBridge<{ path: string }>(
      "getPath",
      "desktopGetPath",
      options,
    );
  }

  // Clipboard
  async writeToClipboard(options: {
    text?: string;
    html?: string;
    image?: string;
    rtf?: string;
  }): Promise<void> {
    await this.invokeBridge(
      "writeToClipboard",
      "desktopWriteToClipboard",
      options,
    );
  }

  async readFromClipboard(): Promise<{
    text?: string;
    html?: string;
    rtf?: string;
    hasImage: boolean;
  }> {
    return await this.invokeBridge<{
      text?: string;
      html?: string;
      rtf?: string;
      hasImage: boolean;
    }>("readFromClipboard", "desktopReadFromClipboard");
  }

  async clearClipboard(): Promise<void> {
    await this.invokeBridge("clearClipboard", "desktopClearClipboard");
  }

  // Shell
  async openExternal(options: { url: string }): Promise<void> {
    await this.invokeBridge("openExternal", "desktopOpenExternal", options);
  }

  async showItemInFolder(options: { path: string }): Promise<void> {
    await this.invokeBridge(
      "showItemInFolder",
      "desktopShowItemInFolder",
      options,
    );
  }

  async beep(): Promise<void> {
    await this.invokeBridge("beep", "desktopBeep");
  }

  // Events
  async addListener(
    eventName: "trayClick",
    listenerFunc: (event: TrayClickEvent) => void,
  ): Promise<PluginListenerHandle>;
  async addListener(
    eventName: "trayDoubleClick",
    listenerFunc: (event: TrayClickEvent) => void,
  ): Promise<PluginListenerHandle>;
  async addListener(
    eventName: "trayRightClick",
    listenerFunc: (event: TrayClickEvent) => void,
  ): Promise<PluginListenerHandle>;
  async addListener(
    eventName: "trayMenuClick",
    listenerFunc: (event: TrayMenuClickEvent) => void,
  ): Promise<PluginListenerHandle>;
  async addListener(
    eventName: "shortcutPressed",
    listenerFunc: (event: GlobalShortcutEvent) => void,
  ): Promise<PluginListenerHandle>;
  async addListener(
    eventName: "notificationClick",
    listenerFunc: (event: NotificationEvent) => void,
  ): Promise<PluginListenerHandle>;
  async addListener(
    eventName: "notificationAction",
    listenerFunc: (event: NotificationEvent) => void,
  ): Promise<PluginListenerHandle>;
  async addListener(
    eventName: "notificationReply",
    listenerFunc: (event: NotificationEvent) => void,
  ): Promise<PluginListenerHandle>;
  async addListener(
    eventName: "windowFocus",
    listenerFunc: () => void,
  ): Promise<PluginListenerHandle>;
  async addListener(
    eventName: "windowBlur",
    listenerFunc: () => void,
  ): Promise<PluginListenerHandle>;
  async addListener(
    eventName: "windowMaximize",
    listenerFunc: () => void,
  ): Promise<PluginListenerHandle>;
  async addListener(
    eventName: "windowUnmaximize",
    listenerFunc: () => void,
  ): Promise<PluginListenerHandle>;
  async addListener(
    eventName: "windowMinimize",
    listenerFunc: () => void,
  ): Promise<PluginListenerHandle>;
  async addListener(
    eventName: "windowRestore",
    listenerFunc: () => void,
  ): Promise<PluginListenerHandle>;
  async addListener(
    eventName: "windowClose",
    listenerFunc: () => void,
  ): Promise<PluginListenerHandle>;
  async addListener(
    eventName: "powerSuspend",
    listenerFunc: () => void,
  ): Promise<PluginListenerHandle>;
  async addListener(
    eventName: "powerResume",
    listenerFunc: () => void,
  ): Promise<PluginListenerHandle>;
  async addListener(
    eventName: "powerOnAC",
    listenerFunc: () => void,
  ): Promise<PluginListenerHandle>;
  async addListener(
    eventName: "powerOnBattery",
    listenerFunc: () => void,
  ): Promise<PluginListenerHandle>;
  async addListener(
    eventName: DesktopEventName,
    listenerFunc: EventCallback<DesktopEventData>,
  ): Promise<PluginListenerHandle> {
    const entry: ListenerEntry = { eventName, callback: listenerFunc };
    this.listeners.push(entry);

    return {
      remove: async () => {
        const idx = this.listeners.indexOf(entry);
        if (idx >= 0) {
          this.listeners.splice(idx, 1);
        }
      },
    };
  }

  async removeAllListeners(): Promise<void> {
    this.listeners = [];
  }

  private notifyListeners<T extends DesktopEventName>(
    eventName: T,
    data?: DesktopEventPayloads[T],
  ): void {
    for (const listener of this.listeners) {
      if (listener.eventName === eventName) {
        (listener.callback as EventCallback<DesktopEventPayloads[T]>)(
          data as DesktopEventPayloads[T],
        );
      }
    }
  }
}

// Export the plugin instance
export const Desktop = new DesktopElectron();
