/**
 * macOS Permission Checks via osascript/TCC
 *
 * Uses AppleScript and system_profiler to check TCC permission status.
 */

import type {
  PermissionCheckResult,
  SystemPermissionId,
} from "./permissions-shared";

/**
 * Run an osascript command and return stdout.
 *
 * SAFETY: All commands passed to runOsascript are hardcoded strings defined
 * in checkPermission() — no user input is interpolated. The sh -c form is
 * needed because osascript's quoting requirements make array-form impractical
 * for inline AppleScript with shell redirects (2>&1).
 */
async function runOsascript(cmd: string): Promise<string> {
  try {
    const proc = Bun.spawn(["sh", "-c", cmd], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const output = await new Response(proc.stdout).text();
    await proc.exited;
    return output.trim();
  } catch {
    return "";
  }
}

export async function checkPermission(
  id: SystemPermissionId,
): Promise<PermissionCheckResult> {
  switch (id) {
    case "accessibility": {
      const result = await runOsascript(
        "osascript -e 'tell application \"System Events\" to return name of first process' 2>&1",
      );
      const granted = !result.includes("error") && result.length > 0;
      return { status: granted ? "granted" : "denied", canRequest: true };
    }

    case "screen-recording": {
      // Check if screen recording permission is granted via CGWindowListCopyWindowInfo
      const result = await runOsascript(
        "osascript -e 'tell application \"System Events\" to return (count of (every window of every process))' 2>&1",
      );
      const granted = !result.includes("error");
      return { status: granted ? "granted" : "denied", canRequest: true };
    }

    case "microphone": {
      const result = await runOsascript(
        'osascript -e \'tell application "System Events" to return "ok"\' 2>&1',
      );
      // Microphone permission is managed by the WebView at runtime
      return {
        status: result ? "granted" : "not-determined",
        canRequest: true,
      };
    }

    case "camera": {
      // Camera permission is managed by the WebView at runtime via getUserMedia
      return { status: "not-determined", canRequest: true };
    }

    case "shell": {
      return { status: "granted", canRequest: false };
    }

    default:
      return { status: "not-applicable", canRequest: false };
  }
}

export async function requestPermission(
  id: SystemPermissionId,
): Promise<PermissionCheckResult> {
  // On macOS, requesting permissions typically triggers system dialogs
  // We can open System Preferences to the right pane
  switch (id) {
    case "accessibility":
    case "screen-recording":
    case "microphone":
    case "camera":
      await openPrivacySettings(id);
      // Re-check after user interaction
      return checkPermission(id);

    case "shell":
      return { status: "granted", canRequest: false };

    default:
      return { status: "not-applicable", canRequest: false };
  }
}

export async function openPrivacySettings(
  id: SystemPermissionId,
): Promise<void> {
  const paneMap: Record<string, string> = {
    accessibility:
      "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility",
    "screen-recording":
      "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture",
    microphone:
      "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone",
    camera:
      "x-apple.systempreferences:com.apple.preference.security?Privacy_Camera",
  };

  const url = paneMap[id];
  if (url) {
    // SAFE: array-form Bun.spawn — URL comes from hardcoded paneMap, not user input
    try {
      const proc = Bun.spawn(["open", url], {
        stdout: "ignore",
        stderr: "ignore",
      });
      await proc.exited;
    } catch {
      // Settings pane unavailable
    }
  }
}
