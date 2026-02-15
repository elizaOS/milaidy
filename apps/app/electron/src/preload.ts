/**
 * Electron Preload Script
 *
 * Exposes native functionality to the renderer process via contextBridge.
 * This is the secure bridge between Node.js and the web context.
 */

import { contextBridge, ipcRenderer, desktopCapturer } from "electron";

// Load Capacitor runtime
require("./rt/electron-rt");

type IpcPrimitive = string | number | boolean | null | undefined;
type IpcObject = { [key: string]: IpcValue };
type IpcValue = IpcPrimitive | IpcObject | IpcValue[] | ArrayBuffer | Float32Array | Uint8Array;
type IpcListener = (...args: IpcValue[]) => void;
type ElectronIpcListener = Parameters<typeof ipcRenderer.on>[1];

const ipcListenerRegistry = new Map<string, WeakMap<IpcListener, ElectronIpcListener>>();

function getWrappedListener(channel: string, listener: IpcListener): ElectronIpcListener {
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

function clearWrappedListener(channel: string, listener: IpcListener): void {
  const channelRegistry = ipcListenerRegistry.get(channel);
  if (!channelRegistry) return;
  channelRegistry.delete(listener);
}

/**
 * IPC Renderer wrapper with type safety
 */
const electronAPI = {
  ipcRenderer: {
    invoke: (channel: string, ...args: IpcValue[]) => ipcRenderer.invoke(channel, ...args) as Promise<IpcValue>,
    send: (channel: string, ...args: IpcValue[]) => ipcRenderer.send(channel, ...args),
    on: (channel: string, listener: IpcListener) => {
      ipcRenderer.on(channel, getWrappedListener(channel, listener));
    },
    once: (channel: string, listener: IpcListener) => {
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
    removeListener: (channel: string, listener: IpcListener) => {
      const wrapped = ipcListenerRegistry.get(channel)?.get(listener);
      if (!wrapped) return;
      ipcRenderer.removeListener(channel, wrapped);
      clearWrappedListener(channel, listener);
    },
    removeAllListeners: (channel: string) => {
      ipcRenderer.removeAllListeners(channel);
      ipcListenerRegistry.delete(channel);
    },
  },

  /**
   * Desktop Capturer for screen capture
   */
  desktopCapturer: {
    getSources: async (options: { types: string[]; thumbnailSize?: { width: number; height: number } }) => {
      const sources = await desktopCapturer.getSources(options as Electron.SourcesOptions);
      return sources.map((source) => ({
        id: source.id,
        name: source.name,
        thumbnail: source.thumbnail.toDataURL(),
        appIcon: source.appIcon?.toDataURL(),
      }));
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
