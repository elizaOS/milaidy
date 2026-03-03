/**
 * Shared permission types and registry for Electron main-process code.
 *
 * This keeps Electron's TypeScript program self-contained under
 * apps/app/electron to avoid cross-root imports during compilation.
 */

export type SystemPermissionId =
  | "accessibility"
  | "screen-recording"
  | "microphone"
  | "camera"
  | "shell";

export type PermissionStatus =
  | "granted"
  | "denied"
  | "not-determined"
  | "restricted"
  | "not-applicable";

export type Platform = "darwin" | "win32" | "linux";

export interface SystemPermissionDefinition {
  id: SystemPermissionId;
  name: string;
  description: string;
  icon: string;
  platforms: Platform[];
  requiredForFeatures: string[];
}

export interface PermissionState {
  id: SystemPermissionId;
  status: PermissionStatus;
  lastChecked: number;
  canRequest: boolean;
}

export interface PermissionCheckResult {
  status: PermissionStatus;
  canRequest: boolean;
}

export interface AllPermissionsState {
  accessibility: PermissionState;
  "screen-recording": PermissionState;
  microphone: PermissionState;
  camera: PermissionState;
  shell: PermissionState;
}

export const SYSTEM_PERMISSIONS: SystemPermissionDefinition[] = [
  {
    id: "accessibility",
    name: "Accessibility",
    description:
      "Control mouse, keyboard, and interact with other applications",
    icon: "cursor",
    platforms: ["darwin"],
    requiredForFeatures: ["computeruse", "browser"],
  },
  {
    id: "screen-recording",
    name: "Screen Recording",
    description: "Capture screen content for screenshots and vision",
    icon: "monitor",
    platforms: ["darwin"],
    requiredForFeatures: ["computeruse", "vision"],
  },
  {
    id: "microphone",
    name: "Microphone",
    description: "Voice input for talk mode and speech recognition",
    icon: "mic",
    platforms: ["darwin", "win32", "linux"],
    requiredForFeatures: ["talkmode", "voice"],
  },
  {
    id: "camera",
    name: "Camera",
    description: "Video input for vision and video capture",
    icon: "camera",
    platforms: ["darwin", "win32", "linux"],
    requiredForFeatures: ["camera", "vision"],
  },
  {
    id: "shell",
    name: "Shell Access",
    description: "Execute terminal commands and scripts",
    icon: "terminal",
    platforms: ["darwin", "win32", "linux"],
    requiredForFeatures: ["shell"],
  },
];

const PERMISSION_MAP = new Map<SystemPermissionId, SystemPermissionDefinition>(
  SYSTEM_PERMISSIONS.map((permission) => [permission.id, permission]),
);

export function isPermissionApplicable(
  id: SystemPermissionId,
  platform: Platform,
): boolean {
  const definition = PERMISSION_MAP.get(id);
  return definition ? definition.platforms.includes(platform) : false;
}
