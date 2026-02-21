/**
 * macOS Permission Detection
 *
 * Handles checking and requesting system permissions on macOS:
 * - Accessibility (System Events control)
 * - Screen Recording (screen capture)
 * - Microphone (audio input)
 * - Camera (video input)
 *
 * macOS uses the TCC (Transparency, Consent, and Control) framework
 * for managing privacy permissions. Some permissions can be requested
 * programmatically, while others require the user to manually enable
 * them in System Preferences.
 */

import { desktopCapturer, shell, systemPreferences } from "electron";
import type {
  PermissionCheckResult,
  SystemPermissionId,
} from "./permissions-shared";

function mapMacMediaStatus(
  status: ReturnType<typeof systemPreferences.getMediaAccessStatus>,
): PermissionCheckResult {
  switch (status) {
    case "granted":
      return { status: "granted", canRequest: false };
    case "denied":
      return { status: "denied", canRequest: false };
    case "restricted":
      return { status: "restricted", canRequest: false };
    case "not-determined":
      return { status: "not-determined", canRequest: true };
    default:
      return { status: "not-determined", canRequest: true };
  }
}

/**
 * Check if Accessibility permission is granted.
 *
 * Uses macOS AX trust APIs exposed by Electron.
 */
export async function checkAccessibility(): Promise<PermissionCheckResult> {
  const trusted = systemPreferences.isTrustedAccessibilityClient(false);
  if (trusted) {
    return { status: "granted", canRequest: false };
  }
  return { status: "denied", canRequest: true };
}

/**
 * Check if Screen Recording permission is granted.
 *
 * Uses macOS media access status for screen capture.
 */
export async function checkScreenRecording(): Promise<PermissionCheckResult> {
  const status = systemPreferences.getMediaAccessStatus("screen");
  return mapMacMediaStatus(status);
}

/**
 * Check if Microphone permission is granted.
 *
 * Uses Electron's systemPreferences API which wraps the native
 * AVCaptureDevice authorization status.
 */
export async function checkMicrophone(): Promise<PermissionCheckResult> {
  const status = systemPreferences.getMediaAccessStatus("microphone");
  return mapMacMediaStatus(status);
}

/**
 * Check if Camera permission is granted.
 *
 * Uses Electron's systemPreferences API which wraps the native
 * AVCaptureDevice authorization status.
 */
export async function checkCamera(): Promise<PermissionCheckResult> {
  const status = systemPreferences.getMediaAccessStatus("camera");
  return mapMacMediaStatus(status);
}

/**
 * Request Microphone permission.
 *
 * This will trigger the native macOS permission dialog.
 * Returns the new permission status after the request.
 */
export async function requestMicrophone(): Promise<PermissionCheckResult> {
  const granted = await systemPreferences.askForMediaAccess("microphone");
  return {
    status: granted ? "granted" : "denied",
    canRequest: false,
  };
}

/**
 * Request Camera permission.
 *
 * This will trigger the native macOS permission dialog.
 * Returns the new permission status after the request.
 */
export async function requestCamera(): Promise<PermissionCheckResult> {
  const granted = await systemPreferences.askForMediaAccess("camera");
  return {
    status: granted ? "granted" : "denied",
    canRequest: false,
  };
}

/**
 * Request Accessibility permission.
 *
 * This prompts macOS to show the Accessibility trust dialog and registers
 * the app in the System Settings list if needed.
 */
export async function requestAccessibility(): Promise<PermissionCheckResult> {
  const granted = systemPreferences.isTrustedAccessibilityClient(true);
  if (granted) {
    return { status: "granted", canRequest: false };
  }

  await openPrivacySettings("accessibility");
  return { status: "denied", canRequest: true };
}

/**
 * Request Screen Recording permission.
 *
 * macOS has no direct API for this permission, but attempting a screen source
 * query can trigger the first-time OS prompt. If still not granted, we open
 * the relevant System Settings pane.
 */
export async function requestScreenRecording(): Promise<PermissionCheckResult> {
  try {
    await desktopCapturer.getSources({
      types: ["screen"],
      thumbnailSize: { width: 2, height: 2 },
      fetchWindowIcons: false,
    });
  } catch {
    // Ignore capture probe failures; we'll rely on status check + settings pane.
  }

  // Give TCC a brief moment to update after prompt interaction.
  await new Promise((resolve) => setTimeout(resolve, 200));

  const status = await checkScreenRecording();
  if (status.status !== "granted") {
    await openPrivacySettings("screen-recording");
  }

  return status;
}

/**
 * Open System Preferences to the appropriate Privacy & Security pane.
 *
 * macOS uses URL schemes to open specific preference panes.
 */
export async function openPrivacySettings(
  permission: SystemPermissionId,
): Promise<void> {
  const paneUrls: Record<string, string> = {
    accessibility:
      "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility",
    "screen-recording":
      "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture",
    microphone:
      "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone",
    camera:
      "x-apple.systempreferences:com.apple.preference.security?Privacy_Camera",
    shell:
      "x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles",
  };

  const url = paneUrls[permission];
  if (url) {
    await shell.openExternal(url);
  }
}

/**
 * Check a specific permission by ID.
 */
export async function checkPermission(
  id: SystemPermissionId,
): Promise<PermissionCheckResult> {
  switch (id) {
    case "accessibility":
      return checkAccessibility();
    case "screen-recording":
      return checkScreenRecording();
    case "microphone":
      return checkMicrophone();
    case "camera":
      return checkCamera();
    case "shell":
      // Shell access is always available on macOS (user has terminal access)
      return { status: "granted", canRequest: false };
    default:
      return { status: "not-applicable", canRequest: false };
  }
}

/**
 * Request a specific permission by ID.
 */
export async function requestPermission(
  id: SystemPermissionId,
): Promise<PermissionCheckResult> {
  switch (id) {
    case "microphone":
      return requestMicrophone();
    case "camera":
      return requestCamera();
    case "accessibility":
      return requestAccessibility();
    case "screen-recording":
      return requestScreenRecording();
    case "shell":
      return { status: "granted", canRequest: false };
    default:
      return { status: "not-applicable", canRequest: false };
  }
}
