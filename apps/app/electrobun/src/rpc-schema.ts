/**
 * Milady RPC Schema for Electrobun
 *
 * Defines the typed RPC contract between the Bun main process and
 * the webview renderer. Replaces the stringly-typed Electron IPC channels
 * with compile-time safe typed RPC.
 *
 * Schema structure (from Electrobun's perspective):
 * - bun.requests: Handlers the Bun side implements (webview calls these)
 * - bun.messages: Messages the Bun side receives (webview sends these)
 * - webview.requests: Handlers the webview implements (Bun calls these)
 * - webview.messages: Messages the webview receives (Bun sends these)
 */

import type { RPCSchema } from "electrobun/bun";

// ============================================================================
// Shared Types
// ============================================================================

// -- Agent --
export interface AgentStatus {
  state: "not_started" | "starting" | "running" | "stopped" | "error";
  agentName: string | null;
  port: number | null;
  startedAt: number | null;
  error: string | null;
}

// -- Desktop --
export interface TrayMenuItem {
  id: string;
  label?: string;
  type?: "normal" | "separator" | "checkbox" | "radio";
  checked?: boolean;
  enabled?: boolean;
  visible?: boolean;
  icon?: string;
  accelerator?: string;
  submenu?: TrayMenuItem[];
}

export interface TrayOptions {
  icon: string;
  tooltip?: string;
  title?: string;
  menu?: TrayMenuItem[];
}

export interface ShortcutOptions {
  id: string;
  accelerator: string;
  enabled?: boolean;
}

export interface NotificationOptions {
  title: string;
  body?: string;
  icon?: string;
  silent?: boolean;
  urgency?: "normal" | "critical" | "low";
}

export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WindowOptions {
  width?: number;
  height?: number;
  x?: number;
  y?: number;
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
  resizable?: boolean;
  alwaysOnTop?: boolean;
  fullscreen?: boolean;
  opacity?: number;
  title?: string;
}

export interface ClipboardWriteOptions {
  text?: string;
  html?: string;
  image?: string;
  rtf?: string;
}

export interface ClipboardReadResult {
  text?: string;
  html?: string;
  rtf?: string;
  hasImage: boolean;
}

export interface VersionInfo {
  version: string;
  name: string;
  runtime: string;
}

export interface PowerState {
  onBattery: boolean;
  idleState: "active" | "idle" | "locked" | "unknown";
  idleTime: number;
}

export interface TrayClickEvent {
  x: number;
  y: number;
  button: string;
  modifiers: { alt: boolean; shift: boolean; ctrl: boolean; meta: boolean };
}

// -- Gateway --
export interface GatewayEndpoint {
  stableId: string;
  name: string;
  host: string;
  port: number;
  lanHost?: string;
  tailnetDns?: string;
  gatewayPort?: number;
  canvasPort?: number;
  tlsEnabled: boolean;
  tlsFingerprintSha256?: string;
  isLocal: boolean;
}

export interface DiscoveryOptions {
  serviceType?: string;
  timeout?: number;
}

export interface DiscoveryResult {
  gateways: GatewayEndpoint[];
  status: string;
}

// -- Permissions --
export type SystemPermissionId =
  | "accessibility"
  | "screen-recording"
  | "microphone"
  | "camera"
  | "shell";

export type PermissionStatus =
  | "granted"
  | "denied"
  | "not-determined"
  | "restricted"
  | "not-applicable";

export interface PermissionState {
  id: SystemPermissionId;
  status: PermissionStatus;
  lastChecked: number;
  canRequest: boolean;
}

export interface AllPermissionsState {
  [key: string]: PermissionState;
}

// -- Canvas --
export interface CanvasWindowOptions {
  url?: string;
  width?: number;
  height?: number;
  x?: number;
  y?: number;
  title?: string;
  transparent?: boolean;
}

export interface CanvasWindowInfo {
  id: string;
  url: string;
  bounds: WindowBounds;
  title: string;
}

// -- Camera --
export interface CameraDevice {
  deviceId: string;
  label: string;
  kind: string;
}

// -- Screencapture --
export interface ScreenSource {
  id: string;
  name: string;
  thumbnail: string;
  appIcon?: string;
}

// -- TalkMode --
export type TalkModeState =
  | "idle"
  | "listening"
  | "processing"
  | "speaking"
  | "error";

export interface TalkModeConfig {
  engine?: "whisper" | "web";
  modelSize?: string;
  language?: string;
  voiceId?: string;
}

// -- LIFO (PiP) --
export interface PipState {
  enabled: boolean;
  windowId?: string;
}

// ============================================================================
// RPC Schema
// ============================================================================

export type MiladyRPCSchema = {
  bun: RPCSchema<{
    requests: {
      // ---- Agent ----
      agentStart: { params: void; response: AgentStatus };
      agentStop: { params: void; response: { ok: boolean } };
      agentRestart: { params: void; response: AgentStatus };
      agentStatus: { params: void; response: AgentStatus };

      // ---- Desktop: Tray ----
      desktopCreateTray: { params: TrayOptions; response: void };
      desktopUpdateTray: { params: Partial<TrayOptions>; response: void };
      desktopDestroyTray: { params: void; response: void };
      desktopSetTrayMenu: {
        params: { menu: TrayMenuItem[] };
        response: void;
      };

      // ---- Desktop: Shortcuts ----
      desktopRegisterShortcut: {
        params: ShortcutOptions;
        response: { success: boolean };
      };
      desktopUnregisterShortcut: { params: { id: string }; response: void };
      desktopUnregisterAllShortcuts: { params: void; response: void };
      desktopIsShortcutRegistered: {
        params: { accelerator: string };
        response: { registered: boolean };
      };

      // ---- Desktop: Auto Launch ----
      desktopSetAutoLaunch: {
        params: { enabled: boolean; openAsHidden?: boolean };
        response: void;
      };
      desktopGetAutoLaunchStatus: {
        params: void;
        response: { enabled: boolean; openAsHidden: boolean };
      };

      // ---- Desktop: Window ----
      desktopSetWindowOptions: { params: WindowOptions; response: void };
      desktopGetWindowBounds: { params: void; response: WindowBounds };
      desktopSetWindowBounds: { params: WindowBounds; response: void };
      desktopMinimizeWindow: { params: void; response: void };
      desktopMaximizeWindow: { params: void; response: void };
      desktopUnmaximizeWindow: { params: void; response: void };
      desktopCloseWindow: { params: void; response: void };
      desktopShowWindow: { params: void; response: void };
      desktopHideWindow: { params: void; response: void };
      desktopFocusWindow: { params: void; response: void };
      desktopIsWindowMaximized: {
        params: void;
        response: { maximized: boolean };
      };
      desktopIsWindowMinimized: {
        params: void;
        response: { minimized: boolean };
      };
      desktopIsWindowVisible: { params: void; response: { visible: boolean } };
      desktopIsWindowFocused: { params: void; response: { focused: boolean } };
      desktopSetAlwaysOnTop: {
        params: { flag: boolean; level?: string };
        response: void;
      };
      desktopSetFullscreen: { params: { flag: boolean }; response: void };
      desktopSetOpacity: { params: { opacity: number }; response: void };

      // ---- Desktop: Notifications ----
      desktopShowNotification: {
        params: NotificationOptions;
        response: { id: string };
      };
      desktopCloseNotification: { params: { id: string }; response: void };

      // ---- Desktop: Power ----
      desktopGetPowerState: { params: void; response: PowerState };

      // ---- Desktop: App ----
      desktopQuit: { params: void; response: void };
      desktopRelaunch: { params: void; response: void };
      desktopGetVersion: { params: void; response: VersionInfo };
      desktopIsPackaged: { params: void; response: { packaged: boolean } };
      desktopGetPath: {
        params: { name: string };
        response: { path: string };
      };
      desktopBeep: { params: void; response: void };

      // ---- Desktop: Clipboard ----
      desktopWriteToClipboard: {
        params: ClipboardWriteOptions;
        response: void;
      };
      desktopReadFromClipboard: {
        params: void;
        response: ClipboardReadResult;
      };
      desktopClearClipboard: { params: void; response: void };

      // ---- Desktop: Shell ----
      desktopOpenExternal: { params: { url: string }; response: void };
      desktopShowItemInFolder: { params: { path: string }; response: void };

      // ---- Gateway ----
      gatewayStartDiscovery: {
        params: DiscoveryOptions | void;
        response: DiscoveryResult;
      };
      gatewayStopDiscovery: { params: void; response: void };
      gatewayIsDiscovering: {
        params: void;
        response: { isDiscovering: boolean };
      };
      gatewayGetDiscoveredGateways: {
        params: void;
        response: { gateways: GatewayEndpoint[] };
      };

      // ---- Permissions ----
      permissionsCheck: {
        params: { id: SystemPermissionId; forceRefresh?: boolean };
        response: PermissionState;
      };
      permissionsCheckFeature: {
        params: { featureId: string };
        response: { granted: boolean; missing: SystemPermissionId[] };
      };
      permissionsRequest: {
        params: { id: SystemPermissionId };
        response: PermissionState;
      };
      permissionsGetAll: {
        params: { forceRefresh?: boolean };
        response: AllPermissionsState;
      };
      permissionsGetPlatform: { params: void; response: string };
      permissionsIsShellEnabled: { params: void; response: boolean };
      permissionsSetShellEnabled: {
        params: { enabled: boolean };
        response: PermissionState;
      };
      permissionsClearCache: { params: void; response: void };
      permissionsOpenSettings: {
        params: { id: SystemPermissionId };
        response: void;
      };

      // ---- Location ----
      locationGetCurrentPosition: {
        params: void;
        response: {
          latitude: number;
          longitude: number;
          accuracy: number;
          timestamp: number;
        } | null;
      };
      locationWatchPosition: {
        params: { interval?: number };
        response: { watchId: string };
      };
      locationClearWatch: { params: { watchId: string }; response: void };
      locationGetLastKnownLocation: {
        params: void;
        response: {
          latitude: number;
          longitude: number;
          accuracy: number;
          timestamp: number;
        } | null;
      };

      // ---- Camera (graceful stubs) ----
      cameraGetDevices: {
        params: void;
        response: { devices: CameraDevice[]; available: boolean };
      };
      cameraStartPreview: {
        params: { deviceId?: string };
        response: { available: boolean; reason?: string };
      };
      cameraStopPreview: { params: void; response: void };
      cameraSwitchCamera: {
        params: { deviceId: string };
        response: { available: boolean };
      };
      cameraCapturePhoto: {
        params: void;
        response: { available: boolean; data?: string };
      };
      cameraStartRecording: {
        params: void;
        response: { available: boolean };
      };
      cameraStopRecording: {
        params: void;
        response: { available: boolean; path?: string };
      };
      cameraGetRecordingState: {
        params: void;
        response: { recording: boolean; duration: number };
      };
      cameraCheckPermissions: {
        params: void;
        response: { status: string };
      };
      cameraRequestPermissions: {
        params: void;
        response: { status: string };
      };

      // ---- Canvas ----
      canvasCreateWindow: {
        params: CanvasWindowOptions;
        response: { id: string };
      };
      canvasDestroyWindow: { params: { id: string }; response: void };
      canvasNavigate: {
        params: { id: string; url: string };
        response: void;
      };
      canvasEval: {
        params: { id: string; script: string };
        response: unknown;
      };
      canvasSnapshot: {
        params: { id: string; format?: string; quality?: number };
        response: { data: string } | null;
      };
      canvasA2uiPush: {
        params: { id: string; payload: unknown };
        response: void;
      };
      canvasA2uiReset: { params: { id: string }; response: void };
      canvasShow: { params: { id: string }; response: void };
      canvasHide: { params: { id: string }; response: void };
      canvasResize: {
        params: { id: string; width: number; height: number };
        response: void;
      };
      canvasFocus: { params: { id: string }; response: void };
      canvasGetBounds: {
        params: { id: string };
        response: WindowBounds;
      };
      canvasSetBounds: {
        params: { id: string } & WindowBounds;
        response: void;
      };
      canvasListWindows: {
        params: void;
        response: { windows: CanvasWindowInfo[] };
      };

      // ---- Screencapture (graceful stubs) ----
      screencaptureGetSources: {
        params: void;
        response: { sources: ScreenSource[]; available: boolean };
      };
      screencaptureTakeScreenshot: {
        params: void;
        response: { available: boolean; data?: string };
      };
      screencaptureCaptureWindow: {
        params: { windowId?: string };
        response: { available: boolean; data?: string };
      };
      screencaptureStartRecording: {
        params: void;
        response: { available: boolean; reason?: string };
      };
      screencaptureStopRecording: {
        params: void;
        response: { available: boolean; path?: string };
      };
      screencapturePauseRecording: {
        params: void;
        response: { available: boolean };
      };
      screencaptureResumeRecording: {
        params: void;
        response: { available: boolean };
      };
      screencaptureGetRecordingState: {
        params: void;
        response: { recording: boolean; duration: number; paused: boolean };
      };
      screencaptureStartFrameCapture: {
        params: {
          fps?: number;
          quality?: number;
          apiBase?: string;
          endpoint?: string;
          gameUrl?: string;
        };
        response: { available: boolean; reason?: string };
      };
      screencaptureStopFrameCapture: {
        params: void;
        response: { available: boolean };
      };
      screencaptureIsFrameCaptureActive: {
        params: void;
        response: { active: boolean };
      };
      screencaptureSaveScreenshot: {
        params: { data: string; filename?: string };
        response: { available: boolean; path?: string };
      };
      screencaptureSwitchSource: {
        params: { sourceId: string };
        response: { available: boolean };
      };

      // ---- Swabble (wake word) ----
      swabbleStart: {
        params: void;
        response: { available: boolean; reason?: string };
      };
      swabbleStop: { params: void; response: void };
      swabbleIsListening: { params: void; response: { listening: boolean } };
      swabbleGetConfig: { params: void; response: Record<string, unknown> };
      swabbleUpdateConfig: {
        params: Record<string, unknown>;
        response: void;
      };
      swabbleIsWhisperAvailable: {
        params: void;
        response: { available: boolean };
      };
      swabbleAudioChunk: { params: { data: string }; response: void };

      // ---- TalkMode ----
      talkmodeStart: {
        params: void;
        response: { available: boolean; reason?: string };
      };
      talkmodeStop: { params: void; response: void };
      talkmodeSpeak: {
        params: { text: string; directive?: Record<string, unknown> };
        response: void;
      };
      talkmodeStopSpeaking: { params: void; response: void };
      talkmodeGetState: { params: void; response: { state: TalkModeState } };
      talkmodeIsEnabled: { params: void; response: { enabled: boolean } };
      talkmodeIsSpeaking: { params: void; response: { speaking: boolean } };
      talkmodeGetWhisperInfo: {
        params: void;
        response: { available: boolean; modelSize?: string };
      };
      talkmodeIsWhisperAvailable: {
        params: void;
        response: { available: boolean };
      };
      talkmodeUpdateConfig: { params: TalkModeConfig; response: void };
      talkmodeAudioChunk: { params: { data: string }; response: void };

      // ---- Context Menu ----
      contextMenuAskAgent: {
        params: { text: string };
        response: void;
      };
      contextMenuCreateSkill: {
        params: { text: string };
        response: void;
      };
      contextMenuQuoteInChat: {
        params: { text: string };
        response: void;
      };
      contextMenuSaveAsCommand: {
        params: { text: string };
        response: void;
      };

      // ---- LIFO (PiP) ----
      lifoGetPipState: { params: void; response: PipState };
      lifoSetPip: { params: PipState; response: void };
    };
    messages: {
      // Messages the webview sends TO bun (rare - most communication
      // is request/response). Audio chunks for streaming could go here.
    };
  }>;
  webview: RPCSchema<{
    requests: {
      // Built-in: evaluateJavascriptWithResponse is added by Electroview
    };
    messages: {
      // Push events FROM bun TO webview

      // Agent
      agentStatusUpdate: AgentStatus;

      // Gateway
      gatewayDiscovery: {
        type: "found" | "updated" | "lost";
        gateway: GatewayEndpoint;
      };

      // Permissions
      permissionsChanged: { id: string };

      // Desktop: Tray events
      desktopTrayMenuClick: { itemId: string; checked?: boolean };
      desktopTrayClick: TrayClickEvent;
      desktopTrayDoubleClick: TrayClickEvent;
      desktopTrayRightClick: TrayClickEvent;

      // Desktop: Shortcut events
      desktopShortcutPressed: { id: string; accelerator: string };

      // Desktop: Window events
      desktopWindowFocus: void;
      desktopWindowBlur: void;
      desktopWindowMaximize: void;
      desktopWindowUnmaximize: void;
      desktopWindowMinimize: void;
      desktopWindowRestore: void;
      desktopWindowClose: void;

      // Desktop: Notification events
      desktopNotificationClick: { id: string };
      desktopNotificationAction: { id: string; action?: string };
      desktopNotificationReply: { id: string; reply: string };

      // Desktop: Power events
      desktopPowerSuspend: void;
      desktopPowerResume: void;
      desktopPowerOnAC: void;
      desktopPowerOnBattery: void;

      // Canvas: Window events
      canvasWindowEvent: {
        windowId: string;
        event: string;
        data?: unknown;
      };

      // TalkMode: Audio/state push events
      talkmodeAudioChunkPush: { data: string };
      talkmodeStateChanged: { state: TalkModeState };
      talkmodeSpeakComplete: void;

      // Swabble: Wake word detection
      swabbleWakeWord: {
        trigger: string;
        command: string;
        transcript: string;
      };
      swabbleStateChanged: { listening: boolean };

      // API Base injection
      apiBaseUpdate: { base: string; token?: string };

      // Share target
      shareTargetReceived: { url: string; text?: string };
    };
  }>;
};

// ============================================================================
// Channel ↔ RPC Method Mapping
// ============================================================================

/**
 * Maps Electron-style colon-separated IPC channel names to camelCase RPC
 * method names. Used by the renderer bridge for backward compatibility.
 */
export const CHANNEL_TO_RPC_METHOD: Record<string, string> = {
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
 * Maps Electron-style push event channel names to RPC message names.
 * Used by the renderer bridge to subscribe to push events.
 */
export const PUSH_CHANNEL_TO_RPC_MESSAGE: Record<string, string> = {
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

/**
 * Reverse mapping: RPC message name → Electron push channel name.
 */
export const RPC_MESSAGE_TO_PUSH_CHANNEL: Record<string, string> =
  Object.fromEntries(
    Object.entries(PUSH_CHANNEL_TO_RPC_MESSAGE).map(([k, v]) => [v, k]),
  );
