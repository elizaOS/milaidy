/**
 * Native Module Registry for Electrobun
 *
 * Initializes all native modules, wires up sendToWebview callbacks,
 * and provides centralized dispose for clean shutdown.
 */

import type { BrowserWindow } from "electrobun/bun";
import { getAgentManager } from "./agent";
import { getCameraManager } from "./camera";
import { getCanvasManager } from "./canvas";
import { getDesktopManager } from "./desktop";
import { getGatewayDiscovery } from "./gateway";
import { getLocationManager } from "./location";
import { getPermissionManager } from "./permissions";
import { getScreenCaptureManager } from "./screencapture";
import { getSwabbleManager } from "./swabble";
import { getTalkModeManager } from "./talkmode";

type SendToWebview = (message: string, payload?: unknown) => void;

/**
 * Initialize all native modules with the main window and sendToWebview callback.
 */
export function initializeNativeModules(
  mainWindow: BrowserWindow,
  sendToWebview: SendToWebview,
): void {
  const desktop = getDesktopManager();
  desktop.setMainWindow(mainWindow);
  desktop.setSendToWebview(sendToWebview);
  desktop.setOnBeforeQuit(disposeNativeModules);

  getAgentManager().setSendToWebview(sendToWebview);
  getCameraManager().setSendToWebview(sendToWebview);
  getCanvasManager().setSendToWebview(sendToWebview);
  getGatewayDiscovery().setSendToWebview(sendToWebview);
  getLocationManager().setSendToWebview(sendToWebview);
  getPermissionManager().setSendToWebview(sendToWebview);
  const screencapture = getScreenCaptureManager();
  screencapture.setSendToWebview(sendToWebview);
  screencapture.setMainWebview(mainWindow.webview);
  getSwabbleManager().setSendToWebview(sendToWebview);
  getTalkModeManager().setSendToWebview(sendToWebview);
}

/**
 * Dispose all native modules. Called on app quit.
 */
export function disposeNativeModules(): void {
  getAgentManager().dispose();
  getCameraManager().dispose();
  getCanvasManager().dispose();
  getDesktopManager().dispose();
  getGatewayDiscovery().dispose();
  getLocationManager().dispose();
  getPermissionManager().dispose();
  getScreenCaptureManager().dispose();
  getSwabbleManager().dispose();
  getTalkModeManager().dispose();
}
