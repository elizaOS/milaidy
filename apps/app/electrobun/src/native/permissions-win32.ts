/**
 * Windows Permission Checks
 *
 * Windows manages permissions via Settings app.
 * Camera/microphone permissions are per-app in Windows 10+.
 */

import type {
  PermissionCheckResult,
  SystemPermissionId,
} from "./permissions-shared";

export async function checkPermission(
  id: SystemPermissionId,
): Promise<PermissionCheckResult> {
  switch (id) {
    case "microphone":
    case "camera":
      // Windows manages these at runtime; assume granted for desktop apps
      return { status: "granted", canRequest: true };

    case "shell":
      return { status: "granted", canRequest: false };

    case "accessibility":
    case "screen-recording":
      return { status: "not-applicable", canRequest: false };

    default:
      return { status: "not-applicable", canRequest: false };
  }
}

export async function requestPermission(
  id: SystemPermissionId,
): Promise<PermissionCheckResult> {
  return checkPermission(id);
}

export async function openPrivacySettings(
  id: SystemPermissionId,
): Promise<void> {
  const settingsMap: Record<string, string> = {
    microphone: "ms-settings:privacy-microphone",
    camera: "ms-settings:privacy-webcam",
  };

  const uri = settingsMap[id];
  if (uri) {
    try {
      Bun.spawn(["cmd", "/c", "start", "", uri], {
        stdout: "ignore",
        stderr: "ignore",
      });
    } catch {
      // Settings unavailable
    }
  }
}
