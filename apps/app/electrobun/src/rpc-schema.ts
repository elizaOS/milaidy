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

export type {
  AgentStatus,
  AllPermissionsState,
  CameraDevice,
  CanvasWindowInfo,
  CanvasWindowOptions,
  ClipboardReadResult,
  ClipboardWriteOptions,
  DiscoveryOptions,
  DiscoveryResult,
  GatewayEndpoint,
  NotificationOptions,
  PermissionState,
  PermissionStatus,
  PipState,
  PowerState,
  ScreenSource,
  ShortcutOptions,
  SystemPermissionId,
  TalkModeConfig,
  TalkModeState,
  TrayClickEvent,
  TrayMenuItem,
  TrayOptions,
  VersionInfo,
  WindowBounds,
  WindowOptions,
} from "./shared/types";

import type {
  AgentStatus,
  AllPermissionsState,
  CameraDevice,
  CanvasWindowInfo,
  CanvasWindowOptions,
  ClipboardReadResult,
  ClipboardWriteOptions,
  DiscoveryOptions,
  DiscoveryResult,
  GatewayEndpoint,
  NotificationOptions,
  PermissionState,
  PermissionStatus,
  PipState,
  PowerState,
  ScreenSource,
  ShortcutOptions,
  SystemPermissionId,
  TalkModeConfig,
  TalkModeState,
  TrayClickEvent,
  TrayMenuItem,
  TrayOptions,
  VersionInfo,
  WindowBounds,
  WindowOptions,
} from "./shared/types";

export {
  CHANNEL_TO_RPC_METHOD,
  PUSH_CHANNEL_TO_RPC_MESSAGE,
  RPC_MESSAGE_TO_PUSH_CHANNEL,
} from "./shared/channels";

// ============================================================================
// RPC Schema
// ============================================================================

export type MiladyRPCSchema = {
  bun: RPCSchema<{
    requests: {
      // ---- Agent ----
      agentStart: { params: undefined; response: AgentStatus };
      agentStop: { params: undefined; response: { ok: boolean } };
      agentRestart: { params: undefined; response: AgentStatus };
      agentStatus: { params: undefined; response: AgentStatus };

      // ---- Desktop: Tray ----
      desktopCreateTray: { params: TrayOptions; response: undefined };
      desktopUpdateTray: { params: Partial<TrayOptions>; response: undefined };
      desktopDestroyTray: { params: undefined; response: undefined };
      desktopSetTrayMenu: {
        params: { menu: TrayMenuItem[] };
        response: undefined;
      };

      // ---- Desktop: Shortcuts ----
      desktopRegisterShortcut: {
        params: ShortcutOptions;
        response: { success: boolean };
      };
      desktopUnregisterShortcut: {
        params: { id: string };
        response: undefined;
      };
      desktopUnregisterAllShortcuts: { params: undefined; response: undefined };
      desktopIsShortcutRegistered: {
        params: { accelerator: string };
        response: { registered: boolean };
      };

      // ---- Desktop: Auto Launch ----
      desktopSetAutoLaunch: {
        params: { enabled: boolean; openAsHidden?: boolean };
        response: undefined;
      };
      desktopGetAutoLaunchStatus: {
        params: undefined;
        response: { enabled: boolean; openAsHidden: boolean };
      };

      // ---- Desktop: Window ----
      desktopSetWindowOptions: { params: WindowOptions; response: undefined };
      desktopGetWindowBounds: { params: undefined; response: WindowBounds };
      desktopSetWindowBounds: { params: WindowBounds; response: undefined };
      desktopMinimizeWindow: { params: undefined; response: undefined };
      desktopMaximizeWindow: { params: undefined; response: undefined };
      desktopUnmaximizeWindow: { params: undefined; response: undefined };
      desktopCloseWindow: { params: undefined; response: undefined };
      desktopShowWindow: { params: undefined; response: undefined };
      desktopHideWindow: { params: undefined; response: undefined };
      desktopFocusWindow: { params: undefined; response: undefined };
      desktopIsWindowMaximized: {
        params: undefined;
        response: { maximized: boolean };
      };
      desktopIsWindowMinimized: {
        params: undefined;
        response: { minimized: boolean };
      };
      desktopIsWindowVisible: {
        params: undefined;
        response: { visible: boolean };
      };
      desktopIsWindowFocused: {
        params: undefined;
        response: { focused: boolean };
      };
      desktopSetAlwaysOnTop: {
        params: { flag: boolean; level?: string };
        response: undefined;
      };
      desktopSetFullscreen: { params: { flag: boolean }; response: undefined };
      desktopSetOpacity: { params: { opacity: number }; response: undefined };

      // ---- Desktop: Notifications ----
      desktopShowNotification: {
        params: NotificationOptions;
        response: { id: string };
      };
      desktopCloseNotification: { params: { id: string }; response: undefined };

      // ---- Desktop: Power ----
      desktopGetPowerState: { params: undefined; response: PowerState };

      // ---- Desktop: App ----
      desktopQuit: { params: undefined; response: undefined };
      desktopRelaunch: { params: undefined; response: undefined };
      desktopGetVersion: { params: undefined; response: VersionInfo };
      desktopIsPackaged: { params: undefined; response: { packaged: boolean } };
      desktopGetPath: {
        params: { name: string };
        response: { path: string };
      };
      desktopBeep: { params: undefined; response: undefined };

      // ---- Desktop: Clipboard ----
      desktopWriteToClipboard: {
        params: ClipboardWriteOptions;
        response: undefined;
      };
      desktopReadFromClipboard: {
        params: undefined;
        response: ClipboardReadResult;
      };
      desktopClearClipboard: { params: undefined; response: undefined };

      // ---- Desktop: Shell ----
      desktopOpenExternal: { params: { url: string }; response: undefined };
      desktopShowItemInFolder: {
        params: { path: string };
        response: undefined;
      };

      // ---- Gateway ----
      gatewayStartDiscovery: {
        params: DiscoveryOptions | undefined;
        response: DiscoveryResult;
      };
      gatewayStopDiscovery: { params: undefined; response: undefined };
      gatewayIsDiscovering: {
        params: undefined;
        response: { isDiscovering: boolean };
      };
      gatewayGetDiscoveredGateways: {
        params: undefined;
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
      permissionsGetPlatform: { params: undefined; response: string };
      permissionsIsShellEnabled: { params: undefined; response: boolean };
      permissionsSetShellEnabled: {
        params: { enabled: boolean };
        response: PermissionState;
      };
      permissionsClearCache: { params: undefined; response: undefined };
      permissionsOpenSettings: {
        params: { id: SystemPermissionId };
        response: undefined;
      };

      // ---- Location ----
      locationGetCurrentPosition: {
        params: undefined;
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
      locationClearWatch: { params: { watchId: string }; response: undefined };
      locationGetLastKnownLocation: {
        params: undefined;
        response: {
          latitude: number;
          longitude: number;
          accuracy: number;
          timestamp: number;
        } | null;
      };

      // ---- Camera (graceful stubs) ----
      cameraGetDevices: {
        params: undefined;
        response: { devices: CameraDevice[]; available: boolean };
      };
      cameraStartPreview: {
        params: { deviceId?: string };
        response: { available: boolean; reason?: string };
      };
      cameraStopPreview: { params: undefined; response: undefined };
      cameraSwitchCamera: {
        params: { deviceId: string };
        response: { available: boolean };
      };
      cameraCapturePhoto: {
        params: undefined;
        response: { available: boolean; data?: string };
      };
      cameraStartRecording: {
        params: undefined;
        response: { available: boolean };
      };
      cameraStopRecording: {
        params: undefined;
        response: { available: boolean; path?: string };
      };
      cameraGetRecordingState: {
        params: undefined;
        response: { recording: boolean; duration: number };
      };
      cameraCheckPermissions: {
        params: undefined;
        response: { status: string };
      };
      cameraRequestPermissions: {
        params: undefined;
        response: { status: string };
      };

      // ---- Canvas ----
      canvasCreateWindow: {
        params: CanvasWindowOptions;
        response: { id: string };
      };
      canvasDestroyWindow: { params: { id: string }; response: undefined };
      canvasNavigate: {
        params: { id: string; url: string };
        response: undefined;
      };
      /**
       * PRIVILEGED: Executes arbitrary JavaScript in a canvas BrowserWindow.
       * This is intentionally unrestricted for agent computer-use capabilities.
       * Security relies on canvas windows being isolated from user-facing content.
       * Any XSS in the main webview could invoke this on canvas windows.
       */
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
        response: undefined;
      };
      canvasA2uiReset: { params: { id: string }; response: undefined };
      canvasShow: { params: { id: string }; response: undefined };
      canvasHide: { params: { id: string }; response: undefined };
      canvasResize: {
        params: { id: string; width: number; height: number };
        response: undefined;
      };
      canvasFocus: { params: { id: string }; response: undefined };
      canvasGetBounds: {
        params: { id: string };
        response: WindowBounds;
      };
      canvasSetBounds: {
        params: { id: string } & WindowBounds;
        response: undefined;
      };
      canvasListWindows: {
        params: undefined;
        response: { windows: CanvasWindowInfo[] };
      };

      // ---- Screencapture (graceful stubs) ----
      screencaptureGetSources: {
        params: undefined;
        response: { sources: ScreenSource[]; available: boolean };
      };
      screencaptureTakeScreenshot: {
        params: undefined;
        response: { available: boolean; data?: string };
      };
      screencaptureCaptureWindow: {
        params: { windowId?: string };
        response: { available: boolean; data?: string };
      };
      screencaptureStartRecording: {
        params: undefined;
        response: { available: boolean; reason?: string };
      };
      screencaptureStopRecording: {
        params: undefined;
        response: { available: boolean; path?: string };
      };
      screencapturePauseRecording: {
        params: undefined;
        response: { available: boolean };
      };
      screencaptureResumeRecording: {
        params: undefined;
        response: { available: boolean };
      };
      screencaptureGetRecordingState: {
        params: undefined;
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
        params: undefined;
        response: { available: boolean };
      };
      screencaptureIsFrameCaptureActive: {
        params: undefined;
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
      screencaptureSetCaptureTarget: {
        params: { webviewId?: string };
        response: { available: boolean };
      };

      // ---- Swabble (wake word) ----
      swabbleStart: {
        params: {
          config?: {
            triggers?: string[];
            minPostTriggerGap?: number;
            minCommandLength?: number;
            modelSize?: "tiny" | "base" | "small" | "medium" | "large";
            enabled?: boolean;
          };
        };
        response: { started: boolean; error?: string };
      };
      swabbleStop: { params: undefined; response: undefined };
      swabbleIsListening: {
        params: undefined;
        response: { listening: boolean };
      };
      swabbleGetConfig: {
        params: undefined;
        response: Record<string, unknown>;
      };
      swabbleUpdateConfig: {
        params: Record<string, unknown>;
        response: undefined;
      };
      swabbleIsWhisperAvailable: {
        params: undefined;
        response: { available: boolean };
      };
      swabbleAudioChunk: { params: { data: string }; response: undefined };

      // ---- TalkMode ----
      talkmodeStart: {
        params: undefined;
        response: { available: boolean; reason?: string };
      };
      talkmodeStop: { params: undefined; response: undefined };
      talkmodeSpeak: {
        params: { text: string; directive?: Record<string, unknown> };
        response: undefined;
      };
      talkmodeStopSpeaking: { params: undefined; response: undefined };
      talkmodeGetState: {
        params: undefined;
        response: { state: TalkModeState };
      };
      talkmodeIsEnabled: { params: undefined; response: { enabled: boolean } };
      talkmodeIsSpeaking: {
        params: undefined;
        response: { speaking: boolean };
      };
      talkmodeGetWhisperInfo: {
        params: undefined;
        response: { available: boolean; modelSize?: string };
      };
      talkmodeIsWhisperAvailable: {
        params: undefined;
        response: { available: boolean };
      };
      talkmodeUpdateConfig: { params: TalkModeConfig; response: undefined };
      talkmodeAudioChunk: { params: { data: string }; response: undefined };

      // ---- Context Menu ----
      contextMenuAskAgent: {
        params: { text: string };
        response: undefined;
      };
      contextMenuCreateSkill: {
        params: { text: string };
        response: undefined;
      };
      contextMenuQuoteInChat: {
        params: { text: string };
        response: undefined;
      };
      contextMenuSaveAsCommand: {
        params: { text: string };
        response: undefined;
      };

      // ---- LIFO (PiP) ----
      lifoGetPipState: { params: undefined; response: PipState };
      lifoSetPip: { params: PipState; response: undefined };
    };
    // biome-ignore lint/complexity/noBannedTypes: empty message schema placeholder for future audio streaming
    messages: {
      // Messages the webview sends TO bun (rare - most communication
      // is request/response). Audio chunks for streaming could go here.
    };
  }>;
  webview: RPCSchema<{
    // biome-ignore lint/complexity/noBannedTypes: empty request schema — built-in methods added by Electroview
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
      desktopWindowFocus: undefined;
      desktopWindowBlur: undefined;
      desktopWindowMaximize: undefined;
      desktopWindowUnmaximize: undefined;
      desktopWindowMinimize: undefined;
      desktopWindowRestore: undefined;
      desktopWindowClose: undefined;

      // Desktop: Notification events
      desktopNotificationClick: { id: string };
      desktopNotificationAction: { id: string; action?: string };
      desktopNotificationReply: { id: string; reply: string };

      // Desktop: Power events
      desktopPowerSuspend: undefined;
      desktopPowerResume: undefined;
      desktopPowerOnAC: undefined;
      desktopPowerOnBattery: undefined;

      // Canvas: Window events
      canvasWindowEvent: {
        windowId: string;
        event: string;
        data?: unknown;
      };

      // TalkMode: Audio/state push events
      talkmodeAudioChunkPush: { data: string };
      talkmodeStateChanged: { state: TalkModeState };
      talkmodeSpeakComplete: undefined;
      talkmodeTranscript: {
        text: string;
        segments: Array<{ text: string; start: number; end: number }>;
      };

      // Swabble: Wake word detection
      swabbleWakeWord: {
        trigger: string;
        command: string;
        transcript: string;
      };
      swabbleStateChanged: { listening: boolean };
      // Swabble: audio chunk fallback (whisper.cpp binary missing)
      swabbleAudioChunkPush: { data: string };

      // Context menu push events (Bun pushes to renderer after processing)
      contextMenuAskAgent: { text: string };
      contextMenuCreateSkill: { text: string };
      contextMenuQuoteInChat: { text: string };
      contextMenuSaveAsCommand: { text: string };

      // API Base injection
      apiBaseUpdate: { base: string; token?: string };

      // Share target
      shareTargetReceived: { url: string; text?: string };

      // Location push events
      locationUpdate: {
        latitude: number;
        longitude: number;
        accuracy: number;
        timestamp: number;
      };

      // Desktop: Update events
      desktopUpdateAvailable: { version: string; releaseNotes?: string };
      desktopUpdateReady: { version: string };
    };
  }>;
};

// Channel maps (CHANNEL_TO_RPC_METHOD, PUSH_CHANNEL_TO_RPC_MESSAGE,
// RPC_MESSAGE_TO_PUSH_CHANNEL) are defined in src/shared/channels.ts
// and re-exported at the top of this file.
