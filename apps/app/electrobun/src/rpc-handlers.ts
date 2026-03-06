/**
 * RPC Handler Registration for Electrobun
 *
 * Maps each RPC request method from MiladyRPCSchema.bun.requests
 * to the corresponding native module method. This is the Bun-side
 * equivalent of Electron's ipcMain.handle() registration.
 *
 * Called once during app startup after the BrowserView is created.
 */

import type { BrowserView } from "electrobun/bun";
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
import type { MiladyRPCSchema, PipState } from "./rpc-schema";

// PiP state (simple in-memory store — no dedicated manager needed)
let pipState: PipState = { enabled: false };

/**
 * Register all RPC request handlers on the given BrowserView.
 *
 * Each handler receives typed params and must return the typed response
 * matching MiladyRPCSchema.bun.requests[method].
 */
export function registerRpcHandlers(view: BrowserView<MiladyRPCSchema>): void {
  const rpc = view.rpc;
  if (!rpc) {
    console.error("[RPC] No RPC instance on BrowserView");
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

  // ---- Agent ----
  rpc.handleRequest.agentStart(async () => agent.start());
  rpc.handleRequest.agentStop(async () => {
    await agent.stop();
    return { ok: true };
  });
  rpc.handleRequest.agentRestart(async () => agent.restart());
  rpc.handleRequest.agentStatus(async () => agent.getStatus());

  // ---- Desktop: Tray ----
  rpc.handleRequest.desktopCreateTray(async (params) =>
    desktop.createTray(params),
  );
  rpc.handleRequest.desktopUpdateTray(async (params) =>
    desktop.updateTray(params),
  );
  rpc.handleRequest.desktopDestroyTray(async () => desktop.destroyTray());
  rpc.handleRequest.desktopSetTrayMenu(async (params) =>
    desktop.setTrayMenu(params),
  );

  // ---- Desktop: Shortcuts ----
  rpc.handleRequest.desktopRegisterShortcut(async (params) =>
    desktop.registerShortcut(params),
  );
  rpc.handleRequest.desktopUnregisterShortcut(async (params) =>
    desktop.unregisterShortcut(params),
  );
  rpc.handleRequest.desktopUnregisterAllShortcuts(async () =>
    desktop.unregisterAllShortcuts(),
  );
  rpc.handleRequest.desktopIsShortcutRegistered(async (params) =>
    desktop.isShortcutRegistered(params),
  );

  // ---- Desktop: Auto Launch ----
  rpc.handleRequest.desktopSetAutoLaunch(async (params) =>
    desktop.setAutoLaunch(params),
  );
  rpc.handleRequest.desktopGetAutoLaunchStatus(async () =>
    desktop.getAutoLaunchStatus(),
  );

  // ---- Desktop: Window ----
  rpc.handleRequest.desktopSetWindowOptions(async (params) =>
    desktop.setWindowOptions(params),
  );
  rpc.handleRequest.desktopGetWindowBounds(async () =>
    desktop.getWindowBounds(),
  );
  rpc.handleRequest.desktopSetWindowBounds(async (params) =>
    desktop.setWindowBounds(params),
  );
  rpc.handleRequest.desktopMinimizeWindow(async () => desktop.minimizeWindow());
  rpc.handleRequest.desktopMaximizeWindow(async () => desktop.maximizeWindow());
  rpc.handleRequest.desktopUnmaximizeWindow(async () =>
    desktop.unmaximizeWindow(),
  );
  rpc.handleRequest.desktopCloseWindow(async () => desktop.closeWindow());
  rpc.handleRequest.desktopShowWindow(async () => desktop.showWindow());
  rpc.handleRequest.desktopHideWindow(async () => desktop.hideWindow());
  rpc.handleRequest.desktopFocusWindow(async () => desktop.focusWindow());
  rpc.handleRequest.desktopIsWindowMaximized(async () =>
    desktop.isWindowMaximized(),
  );
  rpc.handleRequest.desktopIsWindowMinimized(async () =>
    desktop.isWindowMinimized(),
  );
  rpc.handleRequest.desktopIsWindowVisible(async () =>
    desktop.isWindowVisible(),
  );
  rpc.handleRequest.desktopIsWindowFocused(async () =>
    desktop.isWindowFocused(),
  );
  rpc.handleRequest.desktopSetAlwaysOnTop(async (params) =>
    desktop.setAlwaysOnTop(params),
  );
  rpc.handleRequest.desktopSetFullscreen(async (params) =>
    desktop.setFullscreen(params),
  );
  rpc.handleRequest.desktopSetOpacity(async (params) =>
    desktop.setOpacity(params),
  );

  // ---- Desktop: Notifications ----
  rpc.handleRequest.desktopShowNotification(async (params) =>
    desktop.showNotification(params),
  );
  rpc.handleRequest.desktopCloseNotification(async (params) =>
    desktop.closeNotification(params),
  );

  // ---- Desktop: Power ----
  rpc.handleRequest.desktopGetPowerState(async () => desktop.getPowerState());

  // ---- Desktop: App ----
  rpc.handleRequest.desktopQuit(async () => desktop.quit());
  rpc.handleRequest.desktopRelaunch(async () => desktop.relaunch());
  rpc.handleRequest.desktopGetVersion(async () => desktop.getVersion());
  rpc.handleRequest.desktopIsPackaged(async () => desktop.isPackaged());
  rpc.handleRequest.desktopGetPath(async (params) => desktop.getPath(params));
  rpc.handleRequest.desktopBeep(async () => desktop.beep());

  // ---- Desktop: Clipboard ----
  rpc.handleRequest.desktopWriteToClipboard(async (params) =>
    desktop.writeToClipboard(params),
  );
  rpc.handleRequest.desktopReadFromClipboard(async () =>
    desktop.readFromClipboard(),
  );
  rpc.handleRequest.desktopClearClipboard(async () => desktop.clearClipboard());

  // ---- Desktop: Shell ----
  rpc.handleRequest.desktopOpenExternal(async (params) =>
    desktop.openExternal(params),
  );
  rpc.handleRequest.desktopShowItemInFolder(async (params) =>
    desktop.showItemInFolder(params),
  );

  // ---- Gateway ----
  rpc.handleRequest.gatewayStartDiscovery(async (params) =>
    gateway.startDiscovery(params || undefined),
  );
  rpc.handleRequest.gatewayStopDiscovery(async () => gateway.stopDiscovery());
  rpc.handleRequest.gatewayIsDiscovering(async () => ({
    isDiscovering: gateway.isDiscoveryActive(),
  }));
  rpc.handleRequest.gatewayGetDiscoveredGateways(async () => ({
    gateways: gateway.getDiscoveredGateways(),
  }));

  // ---- Permissions ----
  rpc.handleRequest.permissionsCheck(async (params) =>
    permissions.checkPermission(params.id, params.forceRefresh),
  );
  rpc.handleRequest.permissionsCheckFeature(async (params) =>
    permissions.checkFeaturePermissions(params.featureId),
  );
  rpc.handleRequest.permissionsRequest(async (params) =>
    permissions.requestPermission(params.id),
  );
  rpc.handleRequest.permissionsGetAll(async (params) =>
    permissions.checkAllPermissions(params?.forceRefresh),
  );
  rpc.handleRequest.permissionsGetPlatform(async () => process.platform);
  rpc.handleRequest.permissionsIsShellEnabled(async () =>
    permissions.isShellEnabled(),
  );
  rpc.handleRequest.permissionsSetShellEnabled(async (params) => {
    permissions.setShellEnabled(params.enabled);
    return permissions.checkPermission("shell");
  });
  rpc.handleRequest.permissionsClearCache(async () => permissions.clearCache());
  rpc.handleRequest.permissionsOpenSettings(async (params) =>
    permissions.openSettings(params.id),
  );

  // ---- Location ----
  rpc.handleRequest.locationGetCurrentPosition(async () =>
    location.getCurrentPosition(),
  );
  rpc.handleRequest.locationWatchPosition(async (params) =>
    location.watchPosition(params),
  );
  rpc.handleRequest.locationClearWatch(async (params) =>
    location.clearWatch(params),
  );
  rpc.handleRequest.locationGetLastKnownLocation(async () =>
    location.getLastKnownLocation(),
  );

  // ---- Camera ----
  rpc.handleRequest.cameraGetDevices(async () => camera.getDevices());
  rpc.handleRequest.cameraStartPreview(async (params) =>
    camera.startPreview(params),
  );
  rpc.handleRequest.cameraStopPreview(async () => camera.stopPreview());
  rpc.handleRequest.cameraSwitchCamera(async (params) =>
    camera.switchCamera(params),
  );
  rpc.handleRequest.cameraCapturePhoto(async () => camera.capturePhoto());
  rpc.handleRequest.cameraStartRecording(async () => camera.startRecording());
  rpc.handleRequest.cameraStopRecording(async () => camera.stopRecording());
  rpc.handleRequest.cameraGetRecordingState(async () =>
    camera.getRecordingState(),
  );
  rpc.handleRequest.cameraCheckPermissions(async () =>
    camera.checkPermissions(),
  );
  rpc.handleRequest.cameraRequestPermissions(async () =>
    camera.requestPermissions(),
  );

  // ---- Canvas ----
  rpc.handleRequest.canvasCreateWindow(async (params) =>
    canvas.createWindow(params),
  );
  rpc.handleRequest.canvasDestroyWindow(async (params) =>
    canvas.destroyWindow(params),
  );
  rpc.handleRequest.canvasNavigate(async (params) => canvas.navigate(params));
  rpc.handleRequest.canvasEval(async (params) => canvas.eval(params));
  rpc.handleRequest.canvasSnapshot(async (params) => canvas.snapshot(params));
  rpc.handleRequest.canvasA2uiPush(async (params) => canvas.a2uiPush(params));
  rpc.handleRequest.canvasA2uiReset(async (params) => canvas.a2uiReset(params));
  rpc.handleRequest.canvasShow(async (params) => canvas.show(params));
  rpc.handleRequest.canvasHide(async (params) => canvas.hide(params));
  rpc.handleRequest.canvasResize(async (params) => canvas.resize(params));
  rpc.handleRequest.canvasFocus(async (params) => canvas.focus(params));
  rpc.handleRequest.canvasGetBounds(async (params) => canvas.getBounds(params));
  rpc.handleRequest.canvasSetBounds(async (params) => canvas.setBounds(params));
  rpc.handleRequest.canvasListWindows(async () => canvas.listWindows());

  // ---- Screencapture ----
  rpc.handleRequest.screencaptureGetSources(async () =>
    screencapture.getSources(),
  );
  rpc.handleRequest.screencaptureTakeScreenshot(async () =>
    screencapture.takeScreenshot(),
  );
  rpc.handleRequest.screencaptureCaptureWindow(async (params) =>
    screencapture.captureWindow(params),
  );
  rpc.handleRequest.screencaptureStartRecording(async () =>
    screencapture.startRecording(),
  );
  rpc.handleRequest.screencaptureStopRecording(async () =>
    screencapture.stopRecording(),
  );
  rpc.handleRequest.screencapturePauseRecording(async () =>
    screencapture.pauseRecording(),
  );
  rpc.handleRequest.screencaptureResumeRecording(async () =>
    screencapture.resumeRecording(),
  );
  rpc.handleRequest.screencaptureGetRecordingState(async () =>
    screencapture.getRecordingState(),
  );
  rpc.handleRequest.screencaptureStartFrameCapture(async (params) =>
    screencapture.startFrameCapture(params),
  );
  rpc.handleRequest.screencaptureStopFrameCapture(async () =>
    screencapture.stopFrameCapture(),
  );
  rpc.handleRequest.screencaptureIsFrameCaptureActive(async () =>
    screencapture.isFrameCaptureActive(),
  );
  rpc.handleRequest.screencaptureSaveScreenshot(async (params) =>
    screencapture.saveScreenshot(params),
  );
  rpc.handleRequest.screencaptureSwitchSource(async (params) =>
    screencapture.switchSource(params),
  );

  // ---- Swabble ----
  rpc.handleRequest.swabbleStart(async () => swabble.start());
  rpc.handleRequest.swabbleStop(async () => swabble.stop());
  rpc.handleRequest.swabbleIsListening(async () => swabble.isListening());
  rpc.handleRequest.swabbleGetConfig(async () => swabble.getConfig());
  rpc.handleRequest.swabbleUpdateConfig(async (params) =>
    swabble.updateConfig(params),
  );
  rpc.handleRequest.swabbleIsWhisperAvailable(async () =>
    swabble.isWhisperAvailableCheck(),
  );
  rpc.handleRequest.swabbleAudioChunk(async (params) =>
    swabble.audioChunk(params),
  );

  // ---- TalkMode ----
  rpc.handleRequest.talkmodeStart(async () => talkmode.start());
  rpc.handleRequest.talkmodeStop(async () => talkmode.stop());
  rpc.handleRequest.talkmodeSpeak(async (params) => talkmode.speak(params));
  rpc.handleRequest.talkmodeStopSpeaking(async () => talkmode.stopSpeaking());
  rpc.handleRequest.talkmodeGetState(async () => talkmode.getState());
  rpc.handleRequest.talkmodeIsEnabled(async () => talkmode.isEnabled());
  rpc.handleRequest.talkmodeIsSpeaking(async () => talkmode.isSpeaking());
  rpc.handleRequest.talkmodeGetWhisperInfo(async () =>
    talkmode.getWhisperInfo(),
  );
  rpc.handleRequest.talkmodeIsWhisperAvailable(async () =>
    talkmode.isWhisperAvailableCheck(),
  );
  rpc.handleRequest.talkmodeUpdateConfig(async (params) =>
    talkmode.updateConfig(params),
  );
  rpc.handleRequest.talkmodeAudioChunk(async (params) =>
    talkmode.audioChunk(params),
  );

  // ---- Context Menu ----
  // These forward text selections from the renderer context menu to the agent.
  // The renderer handles the actual context menu UI.
  rpc.handleRequest.contextMenuAskAgent(async (_params) => {
    // Forward to agent via the running API server
    // TODO: POST to /api/chat or similar endpoint
  });
  rpc.handleRequest.contextMenuCreateSkill(async (_params) => {
    // Forward to agent
  });
  rpc.handleRequest.contextMenuQuoteInChat(async (_params) => {
    // Forward to renderer as a message
  });
  rpc.handleRequest.contextMenuSaveAsCommand(async (_params) => {
    // Forward to agent
  });

  // ---- LIFO (PiP) ----
  rpc.handleRequest.lifoGetPipState(async () => pipState);
  rpc.handleRequest.lifoSetPip(async (params) => {
    pipState = params;
    if (params.enabled) {
      desktop.setAlwaysOnTop({ flag: true });
    } else {
      desktop.setAlwaysOnTop({ flag: false });
    }
  });

  console.log("[RPC] All handlers registered");
}
