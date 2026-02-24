/**
 * Native Module Index for Electron
 *
 * Exports all native modules and provides a unified initialization function.
 */

import type { BrowserWindow } from "electron";

export * from "./agent";
export * from "./camera";
export * from "./canvas";
export * from "./desktop";
export * from "./gateway";
export * from "./location";
export * from "./permissions";
export * from "./screencapture";
export * from "./swabble";
export * from "./talkmode";
// Import all native modules
export * from "./whisper";

import { getAgentManager, registerAgentIPC } from "./agent";
import { getCameraManager, registerCameraIPC } from "./camera";
import { getCanvasManager, registerCanvasIPC } from "./canvas";
// Import registration functions
import { getDesktopManager, registerDesktopIPC } from "./desktop";
import { getGatewayDiscovery, registerGatewayIPC } from "./gateway";
import { getLocationManager, registerLocationIPC } from "./location";
import { getPermissionManager, registerPermissionsIPC } from "./permissions";
import {
  getScreenCaptureManager,
  registerScreenCaptureIPC,
} from "./screencapture";
import { getSwabbleManager, registerSwabbleIPC } from "./swabble";
import { getTalkModeManager, registerTalkModeIPC } from "./talkmode";

/**
 * Initialize all native modules with the main window
 */
export function initializeNativeModules(mainWindow: BrowserWindow): void {
  // Set main window on all managers
  getDesktopManager().setMainWindow(mainWindow);
  getGatewayDiscovery().setMainWindow(mainWindow);
  getTalkModeManager().setMainWindow(mainWindow);
  getSwabbleManager().setMainWindow(mainWindow);
  getScreenCaptureManager().setMainWindow(mainWindow);
  getLocationManager().setMainWindow(mainWindow);
  getCameraManager().setMainWindow(mainWindow);
  getCanvasManager().setMainWindow(mainWindow);
  getPermissionManager().setMainWindow(mainWindow);

  // Expose ScreenCaptureManager on globalThis so the API server (retake-routes)
  // can auto-start frame capture without cross-package imports.
  (globalThis as Record<string, unknown>).__miladyScreenCaptureManager =
    getScreenCaptureManager();
}

/**
 * Register all IPC handlers
 * Call this once during app initialization
 */
export function registerAllIPC(): void {
  registerDesktopIPC();
  registerGatewayIPC();
  registerTalkModeIPC();
  registerSwabbleIPC();
  registerScreenCaptureIPC();
  registerLocationIPC();
  registerCameraIPC();
  registerCanvasIPC();
  registerAgentIPC();
  registerPermissionsIPC();
}

/**
 * Clean up all native modules
 */
export function disposeNativeModules(): void {
  getAgentManager().dispose();
  getDesktopManager().dispose();
  getGatewayDiscovery().dispose();
  getTalkModeManager().dispose();
  getSwabbleManager().dispose();
  getScreenCaptureManager().dispose();
  getLocationManager().dispose();
  getCameraManager().dispose();
  getCanvasManager().dispose();
  getPermissionManager().dispose();
}
