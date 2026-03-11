/**
 * Electrobun Renderer Bridge
 *
 * Provides backward compatibility with the existing renderer code by
 * mapping `window.electron.ipcRenderer` calls to Electrobun RPC.
 *
 * This script runs in the webview context (injected as a preload).
 * It uses `Electroview.defineRPC()` + `new Electroview()` to connect to
 * the Bun main process via the Electrobun WebSocket RPC channel.
 *
 * The renderer code continues to use:
 *   window.electron.ipcRenderer.invoke("agent:start")
 *   window.electron.ipcRenderer.on("agent:status", callback)
 *
 * This bridge translates those calls to typed RPC requests/messages.
 */

import { Electroview } from "electrobun/view";
import {
  CHANNEL_TO_RPC_METHOD as CHANNEL_TO_RPC,
  PUSH_CHANNEL_TO_RPC_MESSAGE as PUSH_CHANNEL_TO_RPC,
  RPC_MESSAGE_TO_PUSH_CHANNEL as RPC_TO_PUSH_CHANNEL,
} from "../shared/channels";

// Channel maps imported from src/shared/channels.ts (aliased above).

// ============================================================================
// Listener Registry (for ipcRenderer.on / ipcRenderer.removeListener)
// ============================================================================

type IpcListener = (...args: unknown[]) => void;

// Listeners keyed by RPC message name (camelCase, e.g. "agentStatusUpdate")
const listenersByRpcMessage: Record<string, Set<IpcListener>> = {};
// Listeners keyed by Electron channel name (for removeListener lookup)
const listenersByChannel: Record<string, Set<IpcListener>> = {};

// ============================================================================
// Electrobun RPC Setup
// ============================================================================

// Electrobun's native layer sets these globals before preloads run.
// __electrobun must exist before Electroview.init() tries to write to it.
// If the built-in preload hasn't fired yet (rare edge case), stub it.
if (typeof window.__electrobun === "undefined") {
  (
    window as unknown as {
      __electrobun: {
        receiveMessageFromBun: (m: unknown) => void;
        receiveInternalMessageFromBun: (m: unknown) => void;
      };
    }
  ).__electrobun = {
    receiveMessageFromBun: (_m: unknown) => {},
    receiveInternalMessageFromBun: (_m: unknown) => {},
  };
}

// Use Electroview.defineRPC to create the webview-side RPC.
// We use `any` here because the schema types are defined in the Bun-side
// rpc-schema.ts and we can't import that in a browser bundle. The proxy
// is dynamically dispatched at runtime regardless.

// biome-ignore lint/suspicious/noExplicitAny: payload shape varies per message, typed at call sites
function dispatchMessage(messageName: string, payload: any): void {
  // apiBaseUpdate is handled separately for __MILADY_API_BASE__
  if (messageName === "apiBaseUpdate") {
    const p = payload as { base: string; token?: string };
    window.__MILADY_API_BASE__ = p.base;
    if (p.token) window.__MILADY_API_TOKEN__ = p.token;
  }

  // Dispatch to all registered ipcRenderer.on() listeners
  const listeners = listenersByRpcMessage[messageName];
  if (listeners) {
    for (const listener of Array.from(listeners)) {
      try {
        // Electron passes (event, ...args) — we use null for the event
        listener(null, payload);
      } catch (err) {
        console.error(
          `[ElectrobunBridge] Listener error for ${messageName}:`,
          err,
        );
      }
    }
  }
}

// biome-ignore lint/suspicious/noExplicitAny: schema types live on the Bun side and can't be imported in a browser bundle
const rpc = Electroview.defineRPC<any>({
  handlers: {
    requests: {},
    messages: {
      "*": ((messageName: unknown, payload: unknown) => {
        if (typeof messageName === "string") {
          dispatchMessage(messageName, payload);
        }
        // biome-ignore lint/suspicious/noExplicitAny: required for Electroview wildcard signature
      }) as any,
    },
  },
});

// Connect the RPC to Bun via Electroview (opens WebSocket to Bun's RPC server)
new Electroview({ rpc });

// ============================================================================
// window.electron Compatibility Layer
// ============================================================================

// The RPC `request` proxy is dynamically typed — we cast to `any` here
// since the full schema is only available on the Bun side at build time.
// biome-ignore lint/suspicious/noExplicitAny: request proxy is dynamically typed, schema only available on Bun side
const rpcRequest = (rpc as any).request as Record<
  string,
  (params: unknown) => Promise<unknown>
>;

const electronAPI = {
  ipcRenderer: {
    /**
     * invoke() — maps to rpc.request[method](params)
     */
    invoke: async (channel: string, ...args: unknown[]): Promise<unknown> => {
      const rpcMethod = CHANNEL_TO_RPC[channel];
      if (!rpcMethod) {
        console.warn(
          `[ElectrobunBridge] Unknown IPC channel for invoke: ${channel}`,
        );
        return null;
      }

      // Electron invoke passes args as separate params.
      // Our RPC expects a single params object (or void).
      const params =
        args.length === 0 ? undefined : args.length === 1 ? args[0] : args;

      try {
        return await rpcRequest[rpcMethod](params);
      } catch (err) {
        console.error(
          `[ElectrobunBridge] RPC error for ${channel} → ${rpcMethod}:`,
          err,
        );
        throw err;
      }
    },

    /**
     * send() — fire-and-forget, same as invoke but discards result
     */
    send: (channel: string, ...args: unknown[]): void => {
      electronAPI.ipcRenderer.invoke(channel, ...args).catch(() => {});
    },

    /**
     * on() — subscribe to push events from the Bun side
     */
    on: (channel: string, listener: IpcListener): void => {
      const rpcMessage = PUSH_CHANNEL_TO_RPC[channel];
      if (rpcMessage) {
        if (!listenersByRpcMessage[rpcMessage]) {
          listenersByRpcMessage[rpcMessage] = new Set();
        }
        listenersByRpcMessage[rpcMessage].add(listener);
      }

      // Also store by channel name for removeListener
      if (!listenersByChannel[channel]) {
        listenersByChannel[channel] = new Set();
      }
      listenersByChannel[channel].add(listener);
    },

    /**
     * once() — subscribe to a single push event
     */
    once: (channel: string, listener: IpcListener): void => {
      const wrappedListener: IpcListener = (...args) => {
        electronAPI.ipcRenderer.removeListener(channel, wrappedListener);
        listener(...args);
      };
      electronAPI.ipcRenderer.on(channel, wrappedListener);
    },

    /**
     * removeListener() — unsubscribe from push events
     */
    removeListener: (channel: string, listener: IpcListener): void => {
      const rpcMessage = PUSH_CHANNEL_TO_RPC[channel];
      if (rpcMessage) {
        listenersByRpcMessage[rpcMessage]?.delete(listener);
      }
      listenersByChannel[channel]?.delete(listener);
    },

    /**
     * removeAllListeners() — unsubscribe all listeners for a channel
     */
    removeAllListeners: (channel: string): void => {
      const rpcMessage = PUSH_CHANNEL_TO_RPC[channel];
      if (rpcMessage) {
        delete listenersByRpcMessage[rpcMessage];
      }
      delete listenersByChannel[channel];
    },
  },

  /**
   * Desktop Capturer — proxies to screencapture:getSources RPC
   */
  desktopCapturer: {
    getSources: async (_options: {
      types: string[];
      thumbnailSize?: { width: number; height: number };
    }) => {
      const result = await electronAPI.ipcRenderer.invoke(
        "screencapture:getSources",
      );
      return (result as { sources?: unknown[] })?.sources ?? [];
    },
  },

  /**
   * Platform information — detected from user agent and environment
   */
  platform: {
    isMac: /Mac/.test(navigator.userAgent),
    isWindows: /Win/.test(navigator.userAgent),
    isLinux: /Linux/.test(navigator.userAgent),
    arch: /arm|aarch64/i.test(navigator.userAgent) ? "arm64" : "x64",
    version: "",
  },
};

// Initialize platform version asynchronously
electronAPI.ipcRenderer
  .invoke("desktop:getVersion")
  .then((info) => {
    if (info && typeof info === "object" && "version" in info) {
      electronAPI.platform.version = (info as { version: string }).version;
    }
  })
  .catch(() => {});

// ============================================================================
// Expose to Window
// ============================================================================

// Augment the Window interface for bridge globals
declare global {
  interface Window {
    __MILADY_API_BASE__: string;
    __MILADY_API_TOKEN__: string;
    electron: typeof electronAPI;
  }
}

// Expose as window.electron for backward compatibility
window.electron = electronAPI;
