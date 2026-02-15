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

import { exec } from "child_process";
import { promisify } from "util";
import { systemPreferences, desktopCapturer, shell } from "electron";
import type { PermissionCheckResult, SystemPermissionId } from "./permissions-shared.js";

const execAsync = promisify(exec);

/**
 * Check if Accessibility permission is granted.
 *
 * Accessibility permission is required for:
 * - Controlling mouse and keyboard
 * - Interacting with other applications
 * - Computer Use functionality
 *
 * This cannot be requested programmatically - user must enable it
 * in System Preferences > Privacy & Security > Accessibility.
 */
export async function checkAccessibility(): Promise<PermissionCheckResult> {
  // Try to interact with System Events - this will fail if not granted
  const script = `
    tell application "System Events"
      return (exists process 1)
    end tell
  `;

  const { stdout, stderr } = await execAsync(`osascript -e '${script}'`, {
    timeout: 5000,
  }).catch((err) => ({ stdout: "", stderr: err.message || "failed" }));

  if (stderr && (stderr.includes("not allowed") || stderr.includes("assistive"))) {
    return { status: "denied", canRequest: false };
  }

  if (stdout.trim() === "true") {
    return { status: "granted", canRequest: false };
  }

  // If we got here without error but no clear result, check another way
  // Try a simple mouse position query
  const posScript = `
    tell application "System Events"
      return position of (first process whose frontmost is true)
    end tell
  `;

  const posResult = await execAsync(`osascript -e '${posScript}'`, {
    timeout: 5000,
  }).catch(() => null);

  if (posResult && !posResult.stderr) {
    return { status: "granted", canRequest: false };
  }

  return { status: "denied", canRequest: false };
}

/**
 * Check if Screen Recording permission is granted.
 *
 * Screen Recording permission is required for:
 * - Taking screenshots
 * - Screen capture for vision
 * - Computer Use functionality
 *
 * This cannot be requested programmatically - user must enable it
 * in System Preferences > Privacy & Security > Screen Recording.
 *
 * We detect this by attempting to get screen sources and checking
 * if we receive actual thumbnail data or just blank frames.
 */
export async function checkScreenRecording(): Promise<PermissionCheckResult> {
  const sources = await desktopCapturer.getSources({
    types: ["screen"],
    thumbnailSize: { width: 100, height: 100 },
  });

  if (sources.length === 0) {
    return { status: "denied", canRequest: false };
  }

  // Check if we got actual content or just a blank/placeholder image
  // When screen recording is denied, thumbnails are typically blank
  const firstSource = sources[0];
  if (firstSource.thumbnail) {
    const size = firstSource.thumbnail.getSize();
    if (size.width > 0 && size.height > 0) {
      // Get the raw bitmap to check if it's not just blank
      const bitmap = firstSource.thumbnail.toBitmap();
      // Check if there's any non-zero pixel data (not completely blank)
      let hasContent = false;
      for (let i = 0; i < Math.min(bitmap.length, 1000); i += 4) {
        // Check RGB values (skip alpha)
        if (bitmap[i] !== 0 || bitmap[i + 1] !== 0 || bitmap[i + 2] !== 0) {
          hasContent = true;
          break;
        }
      }
      if (hasContent) {
        return { status: "granted", canRequest: false };
      }
    }
  }

  // On newer macOS, we can also check via the media access status
  // though this is less reliable for screen recording specifically
  return { status: "not-determined", canRequest: false };
}

/**
 * Check if Microphone permission is granted.
 *
 * Uses Electron's systemPreferences API which wraps the native
 * AVCaptureDevice authorization status.
 */
export async function checkMicrophone(): Promise<PermissionCheckResult> {
  const status = systemPreferences.getMediaAccessStatus("microphone");

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
 * Check if Camera permission is granted.
 *
 * Uses Electron's systemPreferences API which wraps the native
 * AVCaptureDevice authorization status.
 */
export async function checkCamera(): Promise<PermissionCheckResult> {
  const status = systemPreferences.getMediaAccessStatus("camera");

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
 * Open System Preferences to the appropriate Privacy & Security pane.
 *
 * macOS uses URL schemes to open specific preference panes.
 */
export async function openPrivacySettings(permission: SystemPermissionId): Promise<void> {
  const paneUrls: Record<string, string> = {
    accessibility:
      "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility",
    "screen-recording":
      "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture",
    microphone: "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone",
    camera: "x-apple.systempreferences:com.apple.preference.security?Privacy_Camera",
    shell: "x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles",
  };

  const url = paneUrls[permission];
  if (url) {
    await shell.openExternal(url);
  }
}

/**
 * Check a specific permission by ID.
 */
export async function checkPermission(id: SystemPermissionId): Promise<PermissionCheckResult> {
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
 * Only microphone and camera can be requested programmatically.
 * For other permissions, this opens the settings pane.
 */
export async function requestPermission(id: SystemPermissionId): Promise<PermissionCheckResult> {
  switch (id) {
    case "microphone":
      return requestMicrophone();
    case "camera":
      return requestCamera();
    case "accessibility":
    case "screen-recording":
      // Cannot request programmatically, open settings instead
      await openPrivacySettings(id);
      // Re-check after a short delay to see if user granted
      await new Promise((resolve) => setTimeout(resolve, 500));
      return checkPermission(id);
    case "shell":
      return { status: "granted", canRequest: false };
    default:
      return { status: "not-applicable", canRequest: false };
  }
}
