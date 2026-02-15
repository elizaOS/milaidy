/**
 * Windows Permission Detection
 *
 * Handles checking and requesting system permissions on Windows:
 * - Microphone (audio input)
 * - Camera (video input)
 *
 * Windows 10/11 has privacy settings that can be checked via the Registry
 * or WinRT APIs. Accessibility permissions are not required on Windows
 * as applications have full input control by default.
 *
 * Screen recording also doesn't require explicit permission on Windows.
 */

import { exec } from "child_process";
import { promisify } from "util";
import { shell } from "electron";
import type { PermissionCheckResult, SystemPermissionId } from "./permissions-shared.js";

const execAsync = promisify(exec);

/**
 * Check if Microphone permission is granted via Windows Privacy Settings.
 *
 * Windows stores privacy settings in the Registry under:
 * HKCU\Software\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\microphone
 *
 * Values:
 * - "Allow" = granted
 * - "Deny" = denied
 * - Not present = not determined (will prompt on first use)
 */
export async function checkMicrophone(): Promise<PermissionCheckResult> {
  const regPath =
    "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\microphone";

  const { stdout, stderr } = await execAsync(
    `reg query "${regPath}" /v Value 2>nul`,
  ).catch(() => ({ stdout: "", stderr: "not found" }));

  if (stderr && stderr.includes("not found")) {
    // Key doesn't exist - system will prompt when needed
    return { status: "not-determined", canRequest: true };
  }

  if (stdout.includes("Allow")) {
    return { status: "granted", canRequest: false };
  }

  if (stdout.includes("Deny")) {
    return { status: "denied", canRequest: false };
  }

  // Check global microphone access setting
  const globalRegPath =
    "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\microphone";
  const { stdout: globalStdout } = await execAsync(
    `reg query "${globalRegPath}" /v Value 2>nul`,
  ).catch(() => ({ stdout: "" }));

  if (globalStdout.includes("Deny")) {
    // Microphone access is disabled system-wide
    return { status: "restricted", canRequest: false };
  }

  return { status: "not-determined", canRequest: true };
}

/**
 * Check if Camera permission is granted via Windows Privacy Settings.
 *
 * Similar to microphone, stored in Registry under:
 * HKCU\Software\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\webcam
 */
export async function checkCamera(): Promise<PermissionCheckResult> {
  const regPath =
    "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\webcam";

  const { stdout, stderr } = await execAsync(
    `reg query "${regPath}" /v Value 2>nul`,
  ).catch(() => ({ stdout: "", stderr: "not found" }));

  if (stderr && stderr.includes("not found")) {
    return { status: "not-determined", canRequest: true };
  }

  if (stdout.includes("Allow")) {
    return { status: "granted", canRequest: false };
  }

  if (stdout.includes("Deny")) {
    return { status: "denied", canRequest: false };
  }

  // Check global camera access setting
  const globalRegPath =
    "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\webcam";
  const { stdout: globalStdout } = await execAsync(
    `reg query "${globalRegPath}" /v Value 2>nul`,
  ).catch(() => ({ stdout: "" }));

  if (globalStdout.includes("Deny")) {
    return { status: "restricted", canRequest: false };
  }

  return { status: "not-determined", canRequest: true };
}

/**
 * Open Windows Settings to the appropriate Privacy page.
 *
 * Windows uses ms-settings: URIs to open specific settings pages.
 */
export async function openPrivacySettings(permission: SystemPermissionId): Promise<void> {
  const settingsUrls: Record<string, string> = {
    microphone: "ms-settings:privacy-microphone",
    camera: "ms-settings:privacy-webcam",
    accessibility: "ms-settings:easeofaccess",
    "screen-recording": "ms-settings:privacy-broadcastglobalsettings",
    shell: "ms-settings:developers",
  };

  const url = settingsUrls[permission];
  if (url) {
    await shell.openExternal(url);
  }
}

/**
 * Check a specific permission by ID.
 *
 * On Windows, accessibility and screen-recording are always available
 * as the OS doesn't restrict these capabilities for desktop apps.
 */
export async function checkPermission(id: SystemPermissionId): Promise<PermissionCheckResult> {
  switch (id) {
    case "accessibility":
      // Windows doesn't require accessibility permission
      return { status: "not-applicable", canRequest: false };
    case "screen-recording":
      // Windows doesn't require screen recording permission for desktop apps
      return { status: "not-applicable", canRequest: false };
    case "microphone":
      return checkMicrophone();
    case "camera":
      return checkCamera();
    case "shell":
      // Shell access is always available
      return { status: "granted", canRequest: false };
    default:
      return { status: "not-applicable", canRequest: false };
  }
}

/**
 * Request a specific permission by ID.
 *
 * On Windows, permissions are typically granted through system prompts
 * that appear when the app first tries to use the resource, or through
 * the Settings app.
 */
export async function requestPermission(id: SystemPermissionId): Promise<PermissionCheckResult> {
  switch (id) {
    case "microphone":
    case "camera":
      // Windows will prompt automatically when we try to access the device
      // For now, open settings so user can pre-approve
      await openPrivacySettings(id);
      await new Promise((resolve) => setTimeout(resolve, 500));
      return checkPermission(id);
    case "accessibility":
    case "screen-recording":
      return { status: "not-applicable", canRequest: false };
    case "shell":
      return { status: "granted", canRequest: false };
    default:
      return { status: "not-applicable", canRequest: false };
  }
}
