/**
 * RPC Handler Registration for Electrobun
 *
 * Maps each RPC request method from MiladyRPCSchema.bun.requests
 * to the corresponding native module method. This is the Bun-side
 * equivalent of Electron's ipcMain.handle() registration.
 *
 * Called once during app startup after the BrowserView is created.
 */

import { getAgentManager } from "./native/agent";
import { getCameraManager } from "./native/camera";
import { getCanvasManager } from "./native/canvas";
import { getDesktopManager } from "./native/desktop";
import { getGatewayDiscovery } from "./native/gateway";
import { getLocationManager } from "./native/location";
import { getPermissionManager } from "./native/permissions";
import { getScreenCaptureManager } from "./native/screencapture";
import { getSwabbleManager } from "./native/swabble";
import { getTalkModeManager } from "./native/talkmode";
import type { PipState } from "./rpc-schema";

// PiP state (simple in-memory store — no dedicated manager needed)
let pipState: PipState = { enabled: false };

/** Push current OS permission states to the agent REST API in-process. */
async function syncPermissionsToRestApi(): Promise<void> {
  const port = getAgentManager().getPort();
  if (!port) return;
  try {
    const permissions = await getPermissionManager().checkAllPermissions();
    await fetch(`http://localhost:${port}/api/permissions/state`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ permissions }),
    });
  } catch {
    // non-fatal — renderer will still get data via IPC response
  }
}

type SendToWebview = (message: string, payload?: unknown) => void;

/**
 * Structural type for the Electrobun RPC instance used in rpc-handlers.
 * The createRPC return value exposes setRequestHandler, but the base
 * RPCWithTransport interface does not include it.
 *
 * `any` is an explicit escape hatch here: the individual handlers are fully
 * typed at their call-sites via `Parameters<typeof manager.method>[0]`, so
 * type safety lives in the concrete handler definitions, not this wrapper.
 */
type ElectrobunRpcWithHandlers = {
  // biome-ignore lint/suspicious/noExplicitAny: Electrobun doesn't export a typed setRequestHandler interface; individual handlers are typed at call-sites
  setRequestHandler?: (handlers: Record<string, (params: any) => any>) => void;
};

/**
 * Register all RPC request handlers on the given rpc instance.
 *
 * Each handler receives typed params and must return the typed response
 * matching MiladyRPCSchema.bun.requests[method].
 */
export function registerRpcHandlers(
  rpc: ElectrobunRpcWithHandlers | null | undefined,
  sendToWebview: SendToWebview,
): void {
  if (!rpc) {
    console.error("[RPC] No RPC instance provided");
    return;
  }

  const agent = getAgentManager();
  const camera = getCameraManager();
  const canvas = getCanvasManager();
  const desktop = getDesktopManager();
  const gateway = getGatewayDiscovery();
  const location = getLocationManager();
  const permissions = getPermissionManager();
  const screencapture = getScreenCaptureManager();
  const swabble = getSwabbleManager();
  const talkmode = getTalkModeManager();

  rpc?.setRequestHandler?.({
    // ---- Agent ----
    agentStart: async () => agent.start(),
    agentStop: async () => {
      await agent.stop();
      return { ok: true };
    },
    agentRestart: async () => agent.restart(),
    agentStatus: async () => agent.getStatus(),

    // ---- Desktop: Tray ----
    desktopCreateTray: async (
      params: Parameters<typeof desktop.createTray>[0],
    ) => desktop.createTray(params),
    desktopUpdateTray: async (
      params: Parameters<typeof desktop.updateTray>[0],
    ) => desktop.updateTray(params),
    desktopDestroyTray: async () => desktop.destroyTray(),
    desktopSetTrayMenu: async (
      params: Parameters<typeof desktop.setTrayMenu>[0],
    ) => desktop.setTrayMenu(params),

    // ---- Desktop: Shortcuts ----
    desktopRegisterShortcut: async (
      params: Parameters<typeof desktop.registerShortcut>[0],
    ) => desktop.registerShortcut(params),
    desktopUnregisterShortcut: async (
      params: Parameters<typeof desktop.unregisterShortcut>[0],
    ) => desktop.unregisterShortcut(params),
    desktopUnregisterAllShortcuts: async () => desktop.unregisterAllShortcuts(),
    desktopIsShortcutRegistered: async (
      params: Parameters<typeof desktop.isShortcutRegistered>[0],
    ) => desktop.isShortcutRegistered(params),

    // ---- Desktop: Auto Launch ----
    desktopSetAutoLaunch: async (
      params: Parameters<typeof desktop.setAutoLaunch>[0],
    ) => desktop.setAutoLaunch(params),
    desktopGetAutoLaunchStatus: async () => desktop.getAutoLaunchStatus(),

    // ---- Desktop: Window ----
    desktopSetWindowOptions: async (
      params: Parameters<typeof desktop.setWindowOptions>[0],
    ) => desktop.setWindowOptions(params),
    desktopGetWindowBounds: async () => desktop.getWindowBounds(),
    desktopSetWindowBounds: async (
      params: Parameters<typeof desktop.setWindowBounds>[0],
    ) => desktop.setWindowBounds(params),
    desktopMinimizeWindow: async () => desktop.minimizeWindow(),
    desktopMaximizeWindow: async () => desktop.maximizeWindow(),
    desktopUnmaximizeWindow: async () => desktop.unmaximizeWindow(),
    desktopCloseWindow: async () => desktop.closeWindow(),
    desktopShowWindow: async () => desktop.showWindow(),
    desktopHideWindow: async () => desktop.hideWindow(),
    desktopFocusWindow: async () => desktop.focusWindow(),
    desktopIsWindowMaximized: async () => desktop.isWindowMaximized(),
    desktopIsWindowMinimized: async () => desktop.isWindowMinimized(),
    desktopIsWindowVisible: async () => desktop.isWindowVisible(),
    desktopIsWindowFocused: async () => desktop.isWindowFocused(),
    desktopSetAlwaysOnTop: async (
      params: Parameters<typeof desktop.setAlwaysOnTop>[0],
    ) => desktop.setAlwaysOnTop(params),
    desktopSetFullscreen: async (
      params: Parameters<typeof desktop.setFullscreen>[0],
    ) => desktop.setFullscreen(params),
    desktopSetOpacity: async (
      params: Parameters<typeof desktop.setOpacity>[0],
    ) => desktop.setOpacity(params),

    // ---- Desktop: Notifications ----
    desktopShowNotification: async (
      params: Parameters<typeof desktop.showNotification>[0],
    ) => desktop.showNotification(params),
    desktopCloseNotification: async (
      params: Parameters<typeof desktop.closeNotification>[0],
    ) => desktop.closeNotification(params),

    // ---- Desktop: Power ----
    desktopGetPowerState: async () => desktop.getPowerState(),

    // ---- Desktop: App ----
    desktopQuit: async () => desktop.quit(),
    desktopRelaunch: async () => desktop.relaunch(),
    desktopGetVersion: async () => desktop.getVersion(),
    desktopIsPackaged: async () => desktop.isPackaged(),
    desktopGetPath: async (params: Parameters<typeof desktop.getPath>[0]) =>
      desktop.getPath(params),
    desktopBeep: async () => desktop.beep(),

    // ---- Desktop: Clipboard ----
    desktopWriteToClipboard: async (
      params: Parameters<typeof desktop.writeToClipboard>[0],
    ) => desktop.writeToClipboard(params),
    desktopReadFromClipboard: async () => desktop.readFromClipboard(),
    desktopClearClipboard: async () => desktop.clearClipboard(),

    // ---- Desktop: Shell ----
    desktopOpenExternal: async (
      params: Parameters<typeof desktop.openExternal>[0],
    ) => desktop.openExternal(params),
    desktopShowItemInFolder: async (
      params: Parameters<typeof desktop.showItemInFolder>[0],
    ) => desktop.showItemInFolder(params),

    // ---- Gateway ----
    gatewayStartDiscovery: async (
      params: Parameters<typeof gateway.startDiscovery>[0] | undefined,
    ) => gateway.startDiscovery(params || undefined),
    gatewayStopDiscovery: async () => gateway.stopDiscovery(),
    gatewayIsDiscovering: async () => ({
      isDiscovering: gateway.isDiscoveryActive(),
    }),
    gatewayGetDiscoveredGateways: async () => ({
      gateways: gateway.getDiscoveredGateways(),
    }),

    // ---- Permissions ----
    permissionsCheck: async (params: {
      id: Parameters<typeof permissions.checkPermission>[0];
      forceRefresh?: boolean;
    }) => permissions.checkPermission(params.id, params.forceRefresh),
    permissionsCheckFeature: async (params: {
      featureId: Parameters<typeof permissions.checkFeaturePermissions>[0];
    }) => permissions.checkFeaturePermissions(params.featureId),
    permissionsRequest: async (params: {
      id: Parameters<typeof permissions.requestPermission>[0];
    }) => {
      const result = await permissions.requestPermission(params.id);
      syncPermissionsToRestApi();
      return result;
    },
    permissionsGetAll: async (
      params: { forceRefresh?: boolean } | undefined,
    ) => {
      const result = await permissions.checkAllPermissions(
        params?.forceRefresh,
      );
      syncPermissionsToRestApi();
      return result;
    },
    permissionsGetPlatform: async () => process.platform,
    permissionsIsShellEnabled: async () => permissions.isShellEnabled(),
    permissionsSetShellEnabled: async (params: { enabled: boolean }) => {
      permissions.setShellEnabled(params.enabled);
      return permissions.checkPermission("shell");
    },
    permissionsClearCache: async () => permissions.clearCache(),
    permissionsOpenSettings: async (params: {
      id: Parameters<typeof permissions.openSettings>[0];
    }) => permissions.openSettings(params.id),

    // ---- Location ----
    locationGetCurrentPosition: async () => location.getCurrentPosition(),
    locationWatchPosition: async (
      params: Parameters<typeof location.watchPosition>[0],
    ) => location.watchPosition(params),
    locationClearWatch: async (
      params: Parameters<typeof location.clearWatch>[0],
    ) => location.clearWatch(params),
    locationGetLastKnownLocation: async () => location.getLastKnownLocation(),

    // ---- Camera ----
    cameraGetDevices: async () => camera.getDevices(),
    cameraStartPreview: async (
      params: Parameters<typeof camera.startPreview>[0],
    ) => camera.startPreview(params),
    cameraStopPreview: async () => camera.stopPreview(),
    cameraSwitchCamera: async (
      params: Parameters<typeof camera.switchCamera>[0],
    ) => camera.switchCamera(params),
    cameraCapturePhoto: async () => camera.capturePhoto(),
    cameraStartRecording: async () => camera.startRecording(),
    cameraStopRecording: async () => camera.stopRecording(),
    cameraGetRecordingState: async () => camera.getRecordingState(),
    cameraCheckPermissions: async () => camera.checkPermissions(),
    cameraRequestPermissions: async () => camera.requestPermissions(),

    // ---- Canvas ----
    canvasCreateWindow: async (
      params: Parameters<typeof canvas.createWindow>[0],
    ) => canvas.createWindow(params),
    canvasDestroyWindow: async (
      params: Parameters<typeof canvas.destroyWindow>[0],
    ) => canvas.destroyWindow(params),
    canvasNavigate: async (params: Parameters<typeof canvas.navigate>[0]) =>
      canvas.navigate(params),
    canvasEval: async (params: Parameters<typeof canvas.eval>[0]) =>
      canvas.eval(params),
    canvasSnapshot: async (params: Parameters<typeof canvas.snapshot>[0]) =>
      canvas.snapshot(params),
    canvasA2uiPush: async (params: Parameters<typeof canvas.a2uiPush>[0]) =>
      canvas.a2uiPush(params),
    canvasA2uiReset: async (params: Parameters<typeof canvas.a2uiReset>[0]) =>
      canvas.a2uiReset(params),
    canvasShow: async (params: Parameters<typeof canvas.show>[0]) =>
      canvas.show(params),
    canvasHide: async (params: Parameters<typeof canvas.hide>[0]) =>
      canvas.hide(params),
    canvasResize: async (params: Parameters<typeof canvas.resize>[0]) =>
      canvas.resize(params),
    canvasFocus: async (params: Parameters<typeof canvas.focus>[0]) =>
      canvas.focus(params),
    canvasGetBounds: async (params: Parameters<typeof canvas.getBounds>[0]) =>
      canvas.getBounds(params),
    canvasSetBounds: async (params: Parameters<typeof canvas.setBounds>[0]) =>
      canvas.setBounds(params),
    canvasListWindows: async () => canvas.listWindows(),

    // ---- Screencapture ----
    screencaptureGetSources: async () => screencapture.getSources(),
    screencaptureTakeScreenshot: async () => screencapture.takeScreenshot(),
    screencaptureCaptureWindow: async (
      params: Parameters<typeof screencapture.captureWindow>[0],
    ) => screencapture.captureWindow(params),
    screencaptureStartRecording: async () => screencapture.startRecording(),
    screencaptureStopRecording: async () => screencapture.stopRecording(),
    screencapturePauseRecording: async () => screencapture.pauseRecording(),
    screencaptureResumeRecording: async () => screencapture.resumeRecording(),
    screencaptureGetRecordingState: async () =>
      screencapture.getRecordingState(),
    screencaptureStartFrameCapture: async (
      params: Parameters<typeof screencapture.startFrameCapture>[0],
    ) => screencapture.startFrameCapture(params),
    screencaptureStopFrameCapture: async () => screencapture.stopFrameCapture(),
    screencaptureIsFrameCaptureActive: async () =>
      screencapture.isFrameCaptureActive(),
    screencaptureSaveScreenshot: async (
      params: Parameters<typeof screencapture.saveScreenshot>[0],
    ) => screencapture.saveScreenshot(params),
    screencaptureSwitchSource: async (
      params: Parameters<typeof screencapture.switchSource>[0],
    ) => screencapture.switchSource(params),
    screencaptureSetCaptureTarget: async (_params: unknown) => {
      // Revert to main webview. Popout windows call setCaptureTarget(win.webview)
      // directly on the Bun side when they open.
      screencapture.setCaptureTarget(null);
      return { available: true };
    },

    // ---- Swabble ----
    swabbleStart: async (params: Parameters<typeof swabble.start>[0]) =>
      swabble.start(params),
    swabbleStop: async () => swabble.stop(),
    swabbleIsListening: async () => swabble.isListening(),
    swabbleGetConfig: async () => swabble.getConfig(),
    swabbleUpdateConfig: async (
      params: Parameters<typeof swabble.updateConfig>[0],
    ) => swabble.updateConfig(params),
    swabbleIsWhisperAvailable: async () => swabble.isWhisperAvailableCheck(),
    swabbleAudioChunk: async (
      params: Parameters<typeof swabble.audioChunk>[0],
    ) => swabble.audioChunk(params),

    // ---- TalkMode ----
    talkmodeStart: async () => talkmode.start(),
    talkmodeStop: async () => talkmode.stop(),
    talkmodeSpeak: async (params: Parameters<typeof talkmode.speak>[0]) =>
      talkmode.speak(params),
    talkmodeStopSpeaking: async () => talkmode.stopSpeaking(),
    talkmodeGetState: async () => talkmode.getState(),
    talkmodeIsEnabled: async () => talkmode.isEnabled(),
    talkmodeIsSpeaking: async () => talkmode.isSpeaking(),
    talkmodeGetWhisperInfo: async () => talkmode.getWhisperInfo(),
    talkmodeIsWhisperAvailable: async () => talkmode.isWhisperAvailableCheck(),
    talkmodeUpdateConfig: async (
      params: Parameters<typeof talkmode.updateConfig>[0],
    ) => talkmode.updateConfig(params),
    talkmodeAudioChunk: async (
      params: Parameters<typeof talkmode.audioChunk>[0],
    ) => talkmode.audioChunk(params),

    // ---- Context Menu ----
    // These forward text selections from the renderer context menu to the agent.
    contextMenuAskAgent: async (params: { text: string }) => {
      sendToWebview("contextMenu:askAgent", { text: params.text });
    },
    contextMenuCreateSkill: async (params: { text: string }) => {
      sendToWebview("contextMenu:createSkill", { text: params.text });
    },
    contextMenuQuoteInChat: async (params: { text: string }) => {
      sendToWebview("contextMenu:quoteInChat", { text: params.text });
    },
    contextMenuSaveAsCommand: async (params: { text: string }) => {
      sendToWebview("contextMenu:saveAsCommand", { text: params.text });
    },

    // ---- LIFO (PiP) ----
    lifoGetPipState: async () => pipState,
    lifoSetPip: async (params: PipState) => {
      pipState = params;
      if (params.enabled) {
        desktop.setAlwaysOnTop({ flag: true });
      } else {
        desktop.setAlwaysOnTop({ flag: false });
      }
    },
  });

  console.log("[RPC] All handlers registered");
}
