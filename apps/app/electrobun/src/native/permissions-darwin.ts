/**
 * macOS Permission Checks via osascript/TCC
 *
 * Uses AppleScript and system_profiler to check TCC permission status.
 */

import { dlopen, FFIType } from "bun:ffi";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import type {
  PermissionCheckResult,
  SystemPermissionId,
} from "./permissions-shared";

// Load AXIsProcessTrustedWithOptions from the native dylib so it runs in the
// app's process context — required for macOS to register Milady in the
// Accessibility list in System Preferences.
let _nativeLib: {
  requestAccessibilityPermission: () => boolean;
  checkAccessibilityPermission: () => boolean;
  requestScreenRecordingPermission: () => boolean;
  checkScreenRecordingPermission: () => boolean;
  checkMicrophonePermission: () => number;
  checkCameraPermission: () => number;
  requestCameraPermission: () => void;
  requestMicrophonePermission: () => void;
} | null = null;

function getNativeLib() {
  if (_nativeLib) return _nativeLib;
  try {
    const dylibPath = path.join(
      import.meta.dir,
      "../libMacWindowEffects.dylib",
    );
    const { symbols } = dlopen(dylibPath, {
      requestAccessibilityPermission: { args: [], returns: FFIType.bool },
      checkAccessibilityPermission: { args: [], returns: FFIType.bool },
      requestScreenRecordingPermission: { args: [], returns: FFIType.bool },
      checkScreenRecordingPermission: { args: [], returns: FFIType.bool },
      checkMicrophonePermission: { args: [], returns: FFIType.i32 },
      checkCameraPermission: { args: [], returns: FFIType.i32 },
      requestCameraPermission: { args: [], returns: FFIType.void },
      requestMicrophonePermission: { args: [], returns: FFIType.void },
    });
    _nativeLib = symbols as typeof _nativeLib;
    return _nativeLib;
  } catch (err) {
    console.warn("[Permissions] Failed to load native dylib:", err);
    return null;
  }
}

const APP_BUNDLE_ID = "com.miladyai.milady";

async function runCommand(cmd: string): Promise<string> {
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

type PermissionStatus = "granted" | "denied" | "not-determined";

function checkMicrophonePermission(): PermissionStatus {
  // Use AVFoundation via native dylib — no TCC.db query needed.
  // Returns: 0=not-determined, 1=denied, 2=granted, 3=restricted
  const lib = getNativeLib();
  if (!lib) return "not-determined";
  const val = lib.checkMicrophonePermission();
  if (val === 2) return "granted";
  if (val === 1 || val === 3) return "denied";
  return "not-determined";
}

async function checkScreenRecordingPermission(): Promise<PermissionStatus> {
  // Query the user TCC database for screen capture permission.
  // Service name: kTCCServiceScreenCapture
  // auth_value: 0 = denied, 2 = granted, absent = not-determined
  // This is more reliable than the screencapture file-size heuristic which
  // breaks on macOS 15+ (watermark images inflate denied-capture file sizes).
  try {
    const tccDb = path.join(
      os.homedir(),
      "Library/Application Support/com.apple.TCC/TCC.db",
    );
    if (!existsSync(tccDb)) return "not-determined";

    const proc = Bun.spawn(
      [
        "sqlite3",
        tccDb,
        `SELECT auth_value FROM access WHERE service='kTCCServiceScreenCapture' AND client='${APP_BUNDLE_ID}'`,
      ],
      { stdout: "pipe", stderr: "pipe" },
    );
    const [stdout] = await Promise.all([
      new Response(proc.stdout).text(),
      proc.exited,
    ]);
    const val = stdout.trim();
    if (val === "2") return "granted";
    if (val === "0") return "denied";
    return "not-determined";
  } catch {
    return "not-determined";
  }
}

export async function checkPermission(
  id: SystemPermissionId,
): Promise<PermissionCheckResult> {
  switch (id) {
    case "accessibility": {
      const lib = getNativeLib();
      const granted = lib
        ? lib.checkAccessibilityPermission()
        : (() => {
            // Fallback: osascript heuristic
            // biome-ignore lint/suspicious/noAsyncPromiseExecutor: sync fallback
            return false;
          })();
      return {
        status: granted ? "granted" : "not-determined",
        canRequest: true,
      };
    }

    case "screen-recording": {
      const lib = getNativeLib();
      if (lib) {
        const granted = lib.checkScreenRecordingPermission();
        return {
          status: granted ? "granted" : "not-determined",
          canRequest: true,
        };
      }
      const status = await checkScreenRecordingPermission();
      return { status, canRequest: true };
    }

    case "microphone": {
      const status = checkMicrophonePermission();
      return { status, canRequest: true };
    }

    case "camera": {
      const lib = getNativeLib();
      const val = lib?.checkCameraPermission() ?? 0;
      const status: PermissionStatus =
        val === 2
          ? "granted"
          : val === 1 || val === 3
            ? "denied"
            : "not-determined";
      return { status, canRequest: true };
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
  switch (id) {
    case "accessibility": {
      // AXIsProcessTrustedWithOptions({prompt:true}) shows the macOS auth dialog
      // AND registers the app in System Preferences → Accessibility.
      const lib = getNativeLib();
      if (lib) {
        const trusted = lib.requestAccessibilityPermission();
        if (!trusted) {
          // Dialog was shown; open System Preferences so user can toggle it
          await openPrivacySettings(id);
        }
        return {
          status: trusted ? "granted" : "not-determined",
          canRequest: true,
        };
      }
      // Fallback: open Settings directly
      await openPrivacySettings(id);
      return checkPermission(id);
    }
    case "screen-recording": {
      const lib = getNativeLib();
      if (lib) {
        const granted = lib.requestScreenRecordingPermission();
        if (!granted) await openPrivacySettings(id);
        return {
          status: granted ? "granted" : "not-determined",
          canRequest: true,
        };
      }
      await openPrivacySettings(id);
      return checkPermission(id);
    }
    case "camera": {
      const lib = getNativeLib();
      lib?.requestCameraPermission();
      await openPrivacySettings(id);
      return checkPermission(id);
    }
    case "microphone": {
      const lib = getNativeLib();
      lib?.requestMicrophonePermission();
      await openPrivacySettings(id);
      return checkPermission(id);
    }

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
    const proc = Bun.spawn(["open", url], { stdout: "pipe", stderr: "pipe" });
    await proc.exited;
  }
}
