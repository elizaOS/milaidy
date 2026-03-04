/**
 * Electrobun Renderer Bridge
 *
 * Provides backward compatibility with the existing renderer code by
 * mapping `window.electron.ipcRenderer` calls to Electrobun RPC.
 *
 * This script runs in the webview context (injected as a preload).
 * It uses Electroview.defineRPC() to get the typed RPC proxy, then
 * exposes a `window.electron` API matching the Electron preload contract.
 *
 * The renderer code continues to use:
 *   window.electron.ipcRenderer.invoke("agent:start")
 *   window.electron.ipcRenderer.on("agent:status", callback)
 *
 * This bridge translates those calls to typed RPC requests/messages.
 */

// Augment the Window interface for bridge globals
declare global {
  interface Window {
    __MILADY_RPC_LISTENERS__: Record<string, IpcListener[] | undefined>;
    __MILADY_API_BASE__: string;
    __MILADY_API_TOKEN__: string;
    __ELECTROBUN__: boolean;
    __MILADY_RUNTIME__: string;
    electron: typeof electronAPI;
    electroview?: {
      rpc?: {
        request?: Record<string, (params: unknown) => Promise<unknown>>;
        handleMessage?: {
          apiBaseUpdate?: (
            handler: (payload: { base: string; token?: string }) => void,
          ) => void;
        };
      };
    };
  }
}

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

  // Desktop: Clipboard
  "desktop:writeToClipboard": "desktopWriteToClipboard",
  "desktop:readFromClipboard": "desktopReadFromClipboard",
  "desktop:clearClipboard": "desktopClearClipboard",

  // Desktop: Shell
  "desktop:openExternal": "desktopOpenExternal",
  "desktop:showItemInFolder": "desktopShowItemInFolder",

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
  // canvasEval RPC handler is registered in rpc-handlers.ts → canvas.eval()
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

  // LIFO
  "lifo:getPipState": "lifoGetPipState",
  "lifo:setPip": "lifoSetPip",
};

/**
 * Maps Electron push event channels to RPC message names.
 */
const PUSH_CHANNEL_TO_RPC: Record<string, string> = {
  "agent:status": "agentStatusUpdate",
  "gateway:discovery": "gatewayDiscovery",
  "permissions:changed": "permissionsChanged",
  "desktop:trayMenuClick": "desktopTrayMenuClick",
  "desktop:trayClick": "desktopTrayClick",
  "desktop:trayDoubleClick": "desktopTrayDoubleClick",
  "desktop:trayRightClick": "desktopTrayRightClick",
  "desktop:shortcutPressed": "desktopShortcutPressed",
  "desktop:windowFocus": "desktopWindowFocus",
  "desktop:windowBlur": "desktopWindowBlur",
  "desktop:windowMaximize": "desktopWindowMaximize",
  "desktop:windowUnmaximize": "desktopWindowUnmaximize",
  "desktop:windowMinimize": "desktopWindowMinimize",
  "desktop:windowRestore": "desktopWindowRestore",
  "desktop:windowClose": "desktopWindowClose",
  "desktop:notificationClick": "desktopNotificationClick",
  "desktop:notificationAction": "desktopNotificationAction",
  "desktop:notificationReply": "desktopNotificationReply",
  "desktop:powerSuspend": "desktopPowerSuspend",
  "desktop:powerResume": "desktopPowerResume",
  "desktop:powerOnAC": "desktopPowerOnAC",
  "desktop:powerOnBattery": "desktopPowerOnBattery",
  "canvas:windowEvent": "canvasWindowEvent",
  "talkmode:audioChunkPush": "talkmodeAudioChunkPush",
  "talkmode:stateChanged": "talkmodeStateChanged",
  "talkmode:speakComplete": "talkmodeSpeakComplete",
  "swabble:wakeWord": "swabbleWakeWord",
  "swabble:stateChanged": "swabbleStateChanged",
};

// Reverse mapping: RPC message name → Electron push channel
const RPC_TO_PUSH_CHANNEL: Record<string, string> = {};
for (const [channel, rpcName] of Object.entries(PUSH_CHANNEL_TO_RPC)) {
  RPC_TO_PUSH_CHANNEL[rpcName] = channel;
}

// ============================================================================
// Listener Registry
// ============================================================================

type IpcListener = (...args: unknown[]) => void;

/**
 * Global listener registry that the Bun side dispatches to via
 * evaluateJavascriptWithResponse injecting calls to
 * window.__MILADY_RPC_LISTENERS__[messageName].
 */
const listenersByRpcMessage: Record<string, Set<IpcListener>> = {};
const listenersByChannel: Record<string, Set<IpcListener>> = {};

// Expose the registry globally so the Bun side can dispatch to it
window.__MILADY_RPC_LISTENERS__ = new Proxy(
  {},
  {
    get(_target, prop: string) {
      const listeners = listenersByRpcMessage[prop];
      if (!listeners || listeners.size === 0) return undefined;
      return Array.from(listeners);
    },
  },
);

// ============================================================================
// RPC Proxy (Electroview)
// ============================================================================

/**
 * Get the Electroview RPC proxy for making requests to the Bun side.
 * In Electrobun, the webview context has access to `electroview` global.
 */
function getRpcProxy(): Record<
  string,
  (params: unknown) => Promise<unknown>
> | null {
  const ev = window.electroview;
  if (!ev?.rpc?.request) return null;
  return ev.rpc.request;
}

// ============================================================================
// window.electron Compatibility Layer
// ============================================================================

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

      const proxy = getRpcProxy();
      if (!proxy) {
        console.warn(
          "[ElectrobunBridge] RPC proxy not available (electroview not ready)",
        );
        return null;
      }

      // Electron invoke passes args as separate params.
      // Our RPC expects a single params object (or void).
      // Most channels pass a single object arg or no args.
      const params =
        args.length === 0 ? undefined : args.length === 1 ? args[0] : args;

      try {
        return await proxy[rpcMethod](params);
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
   * Desktop Capturer — returns empty sources (graceful degradation)
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
// API Base Push Channel Handler
// ============================================================================

/**
 * Listen for apiBaseUpdate push messages from the Bun side.
 * Replaces eval-based injection of window.__MILADY_API_BASE__ with
 * a typed RPC message (CSP-safe).
 */
function setupApiBasePushHandler(): void {
  const ev = window.electroview;
  if (ev?.rpc?.handleMessage?.apiBaseUpdate) {
    ev.rpc.handleMessage.apiBaseUpdate(
      (payload: { base: string; token?: string }) => {
        window.__MILADY_API_BASE__ = payload.base;
        if (payload.token) {
          window.__MILADY_API_TOKEN__ = payload.token;
        }
      },
    );
  }
}

try {
  setupApiBasePushHandler();
} catch {
  // Electroview may not be ready yet; retry once after a short delay
  setTimeout(() => {
    try {
      setupApiBasePushHandler();
    } catch (retryErr) {
      console.warn(
        "[electrobun-bridge] Failed to set up API base push handler after retry:",
        retryErr,
      );
    }
  }, 100);
}

// ============================================================================
// Expose to Window
// ============================================================================

// Expose as window.electron for backward compatibility
window.electron = electronAPI;

// Also expose detection flag
window.__ELECTROBUN__ = true;
window.__MILADY_RUNTIME__ = "electrobun";

export {};
