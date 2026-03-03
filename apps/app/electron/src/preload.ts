/**
 * Electron Preload Script
 *
 * Exposes native functionality to the renderer process via contextBridge.
 * This is the secure bridge between Node.js and the web context.
 */

import { contextBridge, ipcRenderer } from "electron";
import type { IpcChannel } from "./native/ipc-channels";
import type { IpcValue } from "./native/ipc-types";

// Load Capacitor runtime (optional — don't let it crash the preload)
try {
  require("./rt/electron-rt");
} catch {
  // Capacitor runtime not available — non-fatal
}

type IpcListener = (...args: IpcValue[]) => void;
type ElectronIpcListener = Parameters<typeof ipcRenderer.on>[1];

const ipcListenerRegistry = new Map<
  string,
  WeakMap<IpcListener, ElectronIpcListener>
>();

function getWrappedListener(
  channel: IpcChannel,
  listener: IpcListener,
): ElectronIpcListener {
  let channelRegistry = ipcListenerRegistry.get(channel);
  if (!channelRegistry) {
    channelRegistry = new WeakMap<IpcListener, ElectronIpcListener>();
    ipcListenerRegistry.set(channel, channelRegistry);
  }

  const existing = channelRegistry.get(listener);
  if (existing) return existing;

  const wrapped: ElectronIpcListener = (_event, ...args) => {
    listener(...(args as IpcValue[]));
  };
  channelRegistry.set(listener, wrapped);
  return wrapped;
}

function clearWrappedListener(
  channel: IpcChannel,
  listener: IpcListener,
): void {
  const channelRegistry = ipcListenerRegistry.get(channel);
  if (!channelRegistry) return;
  channelRegistry.delete(listener);
}

/**
 * IPC Renderer wrapper with type safety
 */
const electronAPI = {
  ipcRenderer: {
    invoke: (channel: IpcChannel, ...args: IpcValue[]) =>
      ipcRenderer.invoke(channel, ...args) as Promise<IpcValue>,
    send: (channel: IpcChannel, ...args: IpcValue[]) =>
      ipcRenderer.send(channel, ...args),
    on: (channel: IpcChannel, listener: IpcListener) => {
      ipcRenderer.on(channel, getWrappedListener(channel, listener));
    },
    once: (channel: IpcChannel, listener: IpcListener) => {
      const wrapped: ElectronIpcListener = (_event, ...args) => {
        clearWrappedListener(channel, listener);
        listener(...(args as IpcValue[]));
      };
      let channelRegistry = ipcListenerRegistry.get(channel);
      if (!channelRegistry) {
        channelRegistry = new WeakMap<IpcListener, ElectronIpcListener>();
        ipcListenerRegistry.set(channel, channelRegistry);
      }
      channelRegistry.set(listener, wrapped);
      ipcRenderer.once(channel, wrapped);
    },
    removeListener: (channel: IpcChannel, listener: IpcListener) => {
      const wrapped = ipcListenerRegistry.get(channel)?.get(listener);
      if (!wrapped) return;
      ipcRenderer.removeListener(channel, wrapped);
      clearWrappedListener(channel, listener);
    },
    removeAllListeners: (channel: IpcChannel) => {
      ipcRenderer.removeAllListeners(channel);
      ipcListenerRegistry.delete(channel);
    },
  },

  /**
   * Desktop Capturer for screen capture (via IPC — desktopCapturer
   * was removed from preload/renderer in Electron 36+)
   */
  desktopCapturer: {
    getSources: async (_options: {
      types: string[];
      thumbnailSize?: { width: number; height: number };
    }) => {
      const result = await ipcRenderer.invoke(
        "screencapture:getSources" as IpcChannel,
      );
      return (result?.sources ?? []) as Array<{
        id: string;
        name: string;
        thumbnail: string;
        appIcon?: string;
      }>;
    },
  },

  /**
   * Platform information
   */
  platform: {
    isMac: process.platform === "darwin",
    isWindows: process.platform === "win32",
    isLinux: process.platform === "linux",
    arch: process.arch,
    version: process.getSystemVersion(),
  },
};

// Expose to renderer
contextBridge.exposeInMainWorld("electron", electronAPI);

// Type declarations for renderer
declare global {
  interface Window {
    electron: typeof electronAPI;
  }
}
