/**
 * Linux Permission Detection
 *
 * Handles checking and requesting system permissions on Linux:
 * - Microphone (PulseAudio/PipeWire)
 * - Camera (/dev/video* devices)
 *
 * Linux permission models vary by:
 * - Desktop environment (GNOME, KDE, etc.)
 * - Display server (X11 vs Wayland)
 * - Sound system (PulseAudio vs PipeWire)
 *
 * Generally, desktop apps have full access if the user's session
 * has the appropriate group memberships (audio, video, etc.).
 * Wayland introduces portals for some permissions.
 */

import { exec } from "node:child_process";
import { access, constants } from "node:fs/promises";
import { promisify } from "node:util";
import { shell } from "electron";
import type {
  PermissionCheckResult,
  SystemPermissionId,
} from "./permissions-shared";

const execAsync = promisify(exec);

/**
 * Check if Microphone/audio input is available.
 *
 * On Linux, audio access depends on:
 * 1. User being in the 'audio' group
 * 2. PulseAudio or PipeWire running and accessible
 * 3. ALSA device availability
 */
export async function checkMicrophone(): Promise<PermissionCheckResult> {
  // Check if PulseAudio is running and accessible
  const { stdout: paInfo, stderr: paErr } = await execAsync(
    "pactl info 2>&1",
  ).catch(() => ({
    stdout: "",
    stderr: "failed",
  }));

  if (!paErr && paInfo.includes("Server Name:")) {
    // PulseAudio is running, check if we can list sources (input devices)
    const { stdout: sources } = await execAsync(
      "pactl list sources short 2>&1",
    ).catch(() => ({
      stdout: "",
    }));

    if (sources && sources.trim().length > 0) {
      return { status: "granted", canRequest: false };
    }
  }

  // Try PipeWire
  const { stdout: pwInfo } = await execAsync("pw-cli info 0 2>&1").catch(
    () => ({ stdout: "" }),
  );
  if (pwInfo?.includes("id:")) {
    return { status: "granted", canRequest: false };
  }

  // Check if ALSA devices exist
  const { stdout: alsaDevices } = await execAsync("arecord -l 2>&1").catch(
    () => ({ stdout: "" }),
  );
  if (alsaDevices?.includes("card")) {
    // Devices exist, likely accessible
    return { status: "granted", canRequest: false };
  }

  // Check user groups
  const { stdout: groups } = await execAsync("groups 2>&1").catch(() => ({
    stdout: "",
  }));
  if (groups.includes("audio")) {
    // User has audio group membership
    return { status: "granted", canRequest: false };
  }

  return { status: "denied", canRequest: false };
}

/**
 * Check if Camera/video input is available.
 *
 * On Linux, camera access depends on:
 * 1. User being in the 'video' group
 * 2. /dev/video* device availability
 * 3. Proper udev rules
 */
export async function checkCamera(): Promise<PermissionCheckResult> {
  // Check if video devices exist
  const { stdout: videoDevices } = await execAsync("ls /dev/video* 2>&1").catch(
    () => ({
      stdout: "",
    }),
  );

  if (!videoDevices || videoDevices.includes("No such file")) {
    // No video devices found
    return { status: "denied", canRequest: false };
  }

  // Try to access the first video device
  const devices = videoDevices.trim().split("\n").filter(Boolean);
  if (devices.length > 0) {
    const firstDevice = devices[0];
    const canRead = await access(firstDevice, constants.R_OK)
      .then(() => true)
      .catch(() => false);

    if (canRead) {
      return { status: "granted", canRequest: false };
    }
  }

  // Check user groups
  const { stdout: groups } = await execAsync("groups 2>&1").catch(() => ({
    stdout: "",
  }));
  if (groups.includes("video")) {
    return { status: "granted", canRequest: false };
  }

  return { status: "denied", canRequest: false };
}

/**
 * Check for screen recording/capture capability.
 *
 * On X11, screen capture is generally unrestricted.
 * On Wayland, it requires portal permission.
 */
export async function checkScreenRecording(): Promise<PermissionCheckResult> {
  // Check if we're on Wayland
  const waylandDisplay = process.env.WAYLAND_DISPLAY;
  const xdgSessionType = process.env.XDG_SESSION_TYPE;

  if (waylandDisplay || xdgSessionType === "wayland") {
    // On Wayland, screen capture requires portal permission
    // The portal will prompt when needed, so we consider it "not-determined"
    // until actually attempted
    return { status: "not-determined", canRequest: true };
  }

  // On X11, screen capture is unrestricted
  return { status: "not-applicable", canRequest: false };
}

/**
 * Open the appropriate settings application.
 *
 * This varies by desktop environment. We try common options.
 */
export async function openPrivacySettings(
  permission: SystemPermissionId,
): Promise<void> {
  // Try to detect desktop environment
  const desktopEnv = process.env.XDG_CURRENT_DESKTOP?.toLowerCase() || "";

  const commands: string[] = [];

  if (permission === "microphone" || permission === "camera") {
    // GNOME Settings
    if (desktopEnv.includes("gnome")) {
      commands.push("gnome-control-center privacy");
      commands.push("gnome-control-center sound"); // For microphone
    }

    // KDE Plasma
    if (desktopEnv.includes("kde") || desktopEnv.includes("plasma")) {
      commands.push("systemsettings5 kcm_pulseaudio");
    }

    // Generic - try pavucontrol for audio
    if (permission === "microphone") {
      commands.push("pavucontrol");
    }
  }

  // Try each command until one works
  for (const cmd of commands) {
    const result = await execAsync(`which ${cmd.split(" ")[0]} 2>&1`).catch(
      () => ({
        stdout: "",
      }),
    );
    if (result.stdout.trim()) {
      await execAsync(`${cmd} &`).catch(() => {});
      return;
    }
  }

  // Fallback: try to open a file manager or terminal
  await shell.openPath("/").catch(() => {});
}

/**
 * Check a specific permission by ID.
 */
export async function checkPermission(
  id: SystemPermissionId,
): Promise<PermissionCheckResult> {
  switch (id) {
    case "accessibility":
      // Linux doesn't have a unified accessibility permission system
      return { status: "not-applicable", canRequest: false };
    case "screen-recording":
      return checkScreenRecording();
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
 * On Linux, most permissions are managed through group membership
 * or desktop environment settings, not runtime prompts.
 */
export async function requestPermission(
  id: SystemPermissionId,
): Promise<PermissionCheckResult> {
  switch (id) {
    case "microphone":
    case "camera":
    case "screen-recording":
      // Open settings for the user to configure
      await openPrivacySettings(id);
      await new Promise((resolve) => setTimeout(resolve, 500));
      return checkPermission(id);
    case "accessibility":
      return { status: "not-applicable", canRequest: false };
    case "shell":
      return { status: "granted", canRequest: false };
    default:
      return { status: "not-applicable", canRequest: false };
  }
}
