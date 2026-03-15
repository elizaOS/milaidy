/**
 * Electrobun Renderer Bridge
 *
 * Exposes the direct Milady Electrobun RPC surface in the webview context.
 *
 * This script runs in the webview context (injected as a preload).
 * It uses `Electroview.defineRPC()` + `new Electroview()` to connect to
 * the Bun main process via the Electrobun WebSocket RPC channel.
 *
 * `window.__MILADY_ELECTROBUN_RPC__` is the only public desktop bridge exposed
 * to renderer code. The internal legacy channel mapping remains here only to
 * adapt the existing native event names onto that direct RPC surface.
 */

import { Electroview } from "electrobun/view";

// ============================================================================
// Channel → RPC Method Mapping
// ============================================================================

/**
 * Maps Electron-style colon-separated IPC channel names to camelCase RPC
 * method names. Duplicated from rpc-schema.ts since we can't import
 * server-side code in the renderer context.
 */
const CHANNEL_TO_RPC: Record<string, string> = {
  // Agent
  "agent:start": "agentStart",
  "agent:stop": "agentStop",
  "agent:restart": "agentRestart",
  "agent:status": "agentStatus",

  // Desktop: Tray
  "desktop:createTray": "desktopCreateTray",
  "desktop:updateTray": "desktopUpdateTray",
  "desktop:destroyTray": "desktopDestroyTray",
  "desktop:setTrayMenu": "desktopSetTrayMenu",

  // Desktop: Shortcuts
  "desktop:registerShortcut": "desktopRegisterShortcut",
  "desktop:unregisterShortcut": "desktopUnregisterShortcut",
  "desktop:unregisterAllShortcuts": "desktopUnregisterAllShortcuts",
  "desktop:isShortcutRegistered": "desktopIsShortcutRegistered",

  // Desktop: Auto Launch
  "desktop:setAutoLaunch": "desktopSetAutoLaunch",
  "desktop:getAutoLaunchStatus": "desktopGetAutoLaunchStatus",

  // Desktop: Window
  "desktop:setWindowOptions": "desktopSetWindowOptions",
  "desktop:getWindowBounds": "desktopGetWindowBounds",
  "desktop:setWindowBounds": "desktopSetWindowBounds",
  "desktop:minimizeWindow": "desktopMinimizeWindow",
  "desktop:unminimizeWindow": "desktopUnminimizeWindow",
  "desktop:maximizeWindow": "desktopMaximizeWindow",
  "desktop:unmaximizeWindow": "desktopUnmaximizeWindow",
  "desktop:closeWindow": "desktopCloseWindow",
  "desktop:showWindow": "desktopShowWindow",
  "desktop:hideWindow": "desktopHideWindow",
  "desktop:focusWindow": "desktopFocusWindow",
  "desktop:isWindowMaximized": "desktopIsWindowMaximized",
  "desktop:isWindowMinimized": "desktopIsWindowMinimized",
  "desktop:isWindowVisible": "desktopIsWindowVisible",
  "desktop:isWindowFocused": "desktopIsWindowFocused",
  "desktop:setAlwaysOnTop": "desktopSetAlwaysOnTop",
  "desktop:setFullscreen": "desktopSetFullscreen",
  "desktop:setOpacity": "desktopSetOpacity",

  // Desktop: Notifications
  "desktop:showNotification": "desktopShowNotification",
  "desktop:closeNotification": "desktopCloseNotification",

  // Desktop: Power
  "desktop:getPowerState": "desktopGetPowerState",

  // Desktop: App
  "desktop:quit": "desktopQuit",
  "desktop:relaunch": "desktopRelaunch",
  "desktop:getVersion": "desktopGetVersion",
  "desktop:isPackaged": "desktopIsPackaged",
  "desktop:getPath": "desktopGetPath",
  "desktop:beep": "desktopBeep",

  // Desktop: Screen
  "desktop:getPrimaryDisplay": "desktopGetPrimaryDisplay",
  "desktop:getAllDisplays": "desktopGetAllDisplays",
  "desktop:getCursorPosition": "desktopGetCursorPosition",

  // Desktop: Message Box
  "desktop:showMessageBox": "desktopShowMessageBox",

  // Desktop: Clipboard
  "desktop:writeToClipboard": "desktopWriteToClipboard",
  "desktop:readFromClipboard": "desktopReadFromClipboard",
  "desktop:clearClipboard": "desktopClearClipboard",
  "desktop:clipboardAvailableFormats": "desktopClipboardAvailableFormats",

  // Desktop: Shell
  "desktop:openExternal": "desktopOpenExternal",
  "desktop:showItemInFolder": "desktopShowItemInFolder",
  "desktop:openPath": "desktopOpenPath",

  // Desktop: File Dialogs
  "desktop:showOpenDialog": "desktopShowOpenDialog",
  "desktop:showSaveDialog": "desktopShowSaveDialog",

  // Gateway
  "gateway:startDiscovery": "gatewayStartDiscovery",
  "gateway:stopDiscovery": "gatewayStopDiscovery",
  "gateway:isDiscovering": "gatewayIsDiscovering",
  "gateway:getDiscoveredGateways": "gatewayGetDiscoveredGateways",

  // Permissions
  "permissions:check": "permissionsCheck",
  "permissions:checkFeature": "permissionsCheckFeature",
  "permissions:request": "permissionsRequest",
  "permissions:getAll": "permissionsGetAll",
  "permissions:getPlatform": "permissionsGetPlatform",
  "permissions:isShellEnabled": "permissionsIsShellEnabled",
  "permissions:setShellEnabled": "permissionsSetShellEnabled",
  "permissions:clearCache": "permissionsClearCache",
  "permissions:openSettings": "permissionsOpenSettings",

  // Location
  "location:getCurrentPosition": "locationGetCurrentPosition",
  "location:watchPosition": "locationWatchPosition",
  "location:clearWatch": "locationClearWatch",
  "location:getLastKnownLocation": "locationGetLastKnownLocation",

  // Camera
  "camera:getDevices": "cameraGetDevices",
  "camera:startPreview": "cameraStartPreview",
  "camera:stopPreview": "cameraStopPreview",
  "camera:switchCamera": "cameraSwitchCamera",
  "camera:capturePhoto": "cameraCapturePhoto",
  "camera:startRecording": "cameraStartRecording",
  "camera:stopRecording": "cameraStopRecording",
  "camera:getRecordingState": "cameraGetRecordingState",
  "camera:checkPermissions": "cameraCheckPermissions",
  "camera:requestPermissions": "cameraRequestPermissions",

  // Canvas
  "canvas:createWindow": "canvasCreateWindow",
  "canvas:destroyWindow": "canvasDestroyWindow",
  "canvas:navigate": "canvasNavigate",
  "canvas:eval": "canvasEval",
  "canvas:snapshot": "canvasSnapshot",
  "canvas:a2uiPush": "canvasA2uiPush",
  "canvas:a2uiReset": "canvasA2uiReset",
  "canvas:show": "canvasShow",
  "canvas:hide": "canvasHide",
  "canvas:resize": "canvasResize",
  "canvas:focus": "canvasFocus",
  "canvas:getBounds": "canvasGetBounds",
  "canvas:setBounds": "canvasSetBounds",
  "canvas:listWindows": "canvasListWindows",

  // Game
  "game:openWindow": "gameOpenWindow",

  // Screencapture
  "screencapture:getSources": "screencaptureGetSources",
  "screencapture:takeScreenshot": "screencaptureTakeScreenshot",
  "screencapture:captureWindow": "screencaptureCaptureWindow",
  "screencapture:startRecording": "screencaptureStartRecording",
  "screencapture:stopRecording": "screencaptureStopRecording",
  "screencapture:pauseRecording": "screencapturePauseRecording",
  "screencapture:resumeRecording": "screencaptureResumeRecording",
  "screencapture:getRecordingState": "screencaptureGetRecordingState",
  "screencapture:startFrameCapture": "screencaptureStartFrameCapture",
  "screencapture:stopFrameCapture": "screencaptureStopFrameCapture",
  "screencapture:isFrameCaptureActive": "screencaptureIsFrameCaptureActive",
  "screencapture:saveScreenshot": "screencaptureSaveScreenshot",
  "screencapture:switchSource": "screencaptureSwitchSource",
  "screencapture:setCaptureTarget": "screencaptureSetCaptureTarget",

  // Swabble
  "swabble:start": "swabbleStart",
  "swabble:stop": "swabbleStop",
  "swabble:isListening": "swabbleIsListening",
  "swabble:getConfig": "swabbleGetConfig",
  "swabble:updateConfig": "swabbleUpdateConfig",
  "swabble:isWhisperAvailable": "swabbleIsWhisperAvailable",
  "swabble:audioChunk": "swabbleAudioChunk",

  // TalkMode
  "talkmode:start": "talkmodeStart",
  "talkmode:stop": "talkmodeStop",
  "talkmode:speak": "talkmodeSpeak",
  "talkmode:stopSpeaking": "talkmodeStopSpeaking",
  "talkmode:getState": "talkmodeGetState",
  "talkmode:isEnabled": "talkmodeIsEnabled",
  "talkmode:isSpeaking": "talkmodeIsSpeaking",
  "talkmode:getWhisperInfo": "talkmodeGetWhisperInfo",
  "talkmode:isWhisperAvailable": "talkmodeIsWhisperAvailable",
  "talkmode:updateConfig": "talkmodeUpdateConfig",
  "talkmode:audioChunk": "talkmodeAudioChunk",

  // Context Menu
  "contextMenu:askAgent": "contextMenuAskAgent",
  "contextMenu:createSkill": "contextMenuCreateSkill",
  "contextMenu:quoteInChat": "contextMenuQuoteInChat",
  "contextMenu:saveAsCommand": "contextMenuSaveAsCommand",
  apiBaseUpdate: "apiBaseUpdate",
  shareTargetReceived: "shareTargetReceived",

  // GPU Window
  "gpuWindow:create": "gpuWindowCreate",
  "gpuWindow:destroy": "gpuWindowDestroy",
  "gpuWindow:show": "gpuWindowShow",
  "gpuWindow:hide": "gpuWindowHide",
  "gpuWindow:setBounds": "gpuWindowSetBounds",
  "gpuWindow:getInfo": "gpuWindowGetInfo",
  "gpuWindow:list": "gpuWindowList",

  // GPU View
  "gpuView:create": "gpuViewCreate",
  "gpuView:destroy": "gpuViewDestroy",
  "gpuView:setFrame": "gpuViewSetFrame",
  "gpuView:setTransparent": "gpuViewSetTransparent",
  "gpuView:setHidden": "gpuViewSetHidden",
  "gpuView:getNativeHandle": "gpuViewGetNativeHandle",
  "gpuView:list": "gpuViewList",
};

/**
 * Maps Electron push event channels to RPC message names.
 * These are messages that flow Bun → webview.
 */
const PUSH_CHANNEL_TO_RPC: Record<string, string> = {
  "agent:status": "agentStatusUpdate",
  "gateway:discovery": "gatewayDiscovery",
  "permissions:changed": "permissionsChanged",
  "desktop:trayMenuClick": "desktopTrayMenuClick",
  "desktop:trayClick": "desktopTrayClick",
  "desktop:shortcutPressed": "desktopShortcutPressed",
  "desktop:windowFocus": "desktopWindowFocus",
  "desktop:windowBlur": "desktopWindowBlur",
  "desktop:windowMaximize": "desktopWindowMaximize",
  "desktop:windowUnmaximize": "desktopWindowUnmaximize",
  "desktop:windowClose": "desktopWindowClose",
  "canvas:windowEvent": "canvasWindowEvent",
  "talkmode:audioChunkPush": "talkmodeAudioChunkPush",
  "talkmode:stateChanged": "talkmodeStateChanged",
  "talkmode:speakComplete": "talkmodeSpeakComplete",
  "talkmode:transcript": "talkmodeTranscript",
  "talkmode:error": "talkmodeError",
  "swabble:wakeWord": "swabbleWakeWord",
  "swabble:stateChange": "swabbleStateChanged",
  "swabble:transcript": "swabbleTranscript",
  "swabble:error": "swabbleError",
  "swabble:audioChunkPush": "swabbleAudioChunkPush",
  "contextMenu:askAgent": "contextMenuAskAgent",
  "contextMenu:createSkill": "contextMenuCreateSkill",
  "contextMenu:quoteInChat": "contextMenuQuoteInChat",
  "contextMenu:saveAsCommand": "contextMenuSaveAsCommand",
  apiBaseUpdate: "apiBaseUpdate",
  shareTargetReceived: "shareTargetReceived",
  "location:update": "locationUpdate",
  "desktop:updateAvailable": "desktopUpdateAvailable",
  "desktop:updateReady": "desktopUpdateReady",

  // GPU Window push events
  "gpuWindow:closed": "gpuWindowClosed",

  // WebGPU browser support
  "webgpu:browserStatus": "webGpuBrowserStatus",
};

// Reverse mapping: RPC message name → Electron push channel
const RPC_TO_PUSH_CHANNEL: Record<string, string> = {};
for (const [channel, rpcName] of Object.entries(PUSH_CHANNEL_TO_RPC)) {
  RPC_TO_PUSH_CHANNEL[rpcName] = channel;
}

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

type RpcMessageListener = (payload: unknown) => void;

const rpcListenerWrappers: Record<
  string,
  Map<RpcMessageListener, IpcListener>
> = {};

const miladyElectrobunRpc = {
  request: rpcRequest,
  onMessage: (messageName: string, listener: RpcMessageListener): void => {
    const channel = RPC_TO_PUSH_CHANNEL[messageName];
    if (!channel) {
      console.warn(
        `[ElectrobunBridge] Unknown RPC message for onMessage: ${messageName}`,
      );
      return;
    }

    if (!rpcListenerWrappers[messageName]) {
      rpcListenerWrappers[messageName] = new Map();
    }
    if (rpcListenerWrappers[messageName].has(listener)) {
      return;
    }

    const wrappedListener: IpcListener = (_event, payload) => {
      listener(payload);
    };
    rpcListenerWrappers[messageName].set(listener, wrappedListener);
    electronAPI.ipcRenderer.on(channel, wrappedListener);
  },
  offMessage: (messageName: string, listener: RpcMessageListener): void => {
    const channel = RPC_TO_PUSH_CHANNEL[messageName];
    const wrappedListener = rpcListenerWrappers[messageName]?.get(listener);
    if (!channel || !wrappedListener) {
      return;
    }

    electronAPI.ipcRenderer.removeListener(channel, wrappedListener);
    rpcListenerWrappers[messageName]?.delete(listener);
    if (rpcListenerWrappers[messageName]?.size === 0) {
      delete rpcListenerWrappers[messageName];
    }
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
    __MILADY_ELECTROBUN_RPC__: typeof miladyElectrobunRpc;
  }
}

window.__MILADY_ELECTROBUN_RPC__ = miladyElectrobunRpc;
