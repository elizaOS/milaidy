"use strict";
/**
 * System Permissions Registry
 *
 * Central registry of all system permissions with their metadata,
 * platform availability, and feature dependencies.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PERMISSION_MAP = exports.SYSTEM_PERMISSIONS = void 0;
exports.getPermissionDefinition = getPermissionDefinition;
exports.getRequiredPermissions = getRequiredPermissions;
exports.isPermissionApplicable = isPermissionApplicable;
exports.SYSTEM_PERMISSIONS = [
    {
        id: "accessibility",
        name: "Accessibility",
        description: "Control mouse, keyboard, and interact with other applications",
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
exports.PERMISSION_MAP = new Map(exports.SYSTEM_PERMISSIONS.map((p) => [p.id, p]));
function getPermissionDefinition(id) {
    return exports.PERMISSION_MAP.get(id);
}
function getRequiredPermissions(featureId) {
    return exports.SYSTEM_PERMISSIONS.filter((p) => p.requiredForFeatures.includes(featureId)).map((p) => p.id);
}
function isPermissionApplicable(id, platform) {
    const def = exports.PERMISSION_MAP.get(id);
    return def ? def.platforms.includes(platform) : false;
}
