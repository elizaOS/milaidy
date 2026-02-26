/**
 * System Permissions Registry
 *
 * Central registry of all system permissions with their metadata,
 * platform availability, and feature dependencies.
 */

import type { SystemPermissionDefinition, SystemPermissionId } from "./types";

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

export const PERMISSION_MAP = new Map<
  SystemPermissionId,
  SystemPermissionDefinition
>(SYSTEM_PERMISSIONS.map((p) => [p.id, p]));

export function getPermissionDefinition(
  id: SystemPermissionId,
): SystemPermissionDefinition | undefined {
  return PERMISSION_MAP.get(id);
}

export function getRequiredPermissions(
  featureId: string,
): SystemPermissionId[] {
  return SYSTEM_PERMISSIONS.filter((p) =>
    p.requiredForFeatures.includes(featureId),
  ).map((p) => p.id);
}

export function isPermissionApplicable(
  id: SystemPermissionId,
  platform: "darwin" | "win32" | "linux",
): boolean {
  const def = PERMISSION_MAP.get(id);
  return def ? def.platforms.includes(platform) : false;
}
