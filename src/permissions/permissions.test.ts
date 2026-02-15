/**
 * Unit tests for the Permissions module.
 *
 * Covers:
 * - Permission type definitions
 * - Permission registry
 * - Platform applicability
 * - Feature-to-permission mappings
 */
import { describe, expect, it } from "vitest";
import {
  getPermissionDefinition,
  getRequiredPermissions,
  isPermissionApplicable,
  PERMISSION_MAP,
  SYSTEM_PERMISSIONS,
} from "./registry.js";
import type {
  PermissionState,
  PermissionStatus,
  SystemPermissionDefinition,
  SystemPermissionId,
} from "./types.js";

// ---------------------------------------------------------------------------
// Permission Registry Tests
// ---------------------------------------------------------------------------

describe("Permission Registry", () => {
  describe("SYSTEM_PERMISSIONS", () => {
    it("contains exactly 5 permissions", () => {
      expect(SYSTEM_PERMISSIONS).toHaveLength(5);
    });

    it("has all required permission IDs", () => {
      const ids = SYSTEM_PERMISSIONS.map((p) => p.id);
      expect(ids).toContain("accessibility");
      expect(ids).toContain("screen-recording");
      expect(ids).toContain("microphone");
      expect(ids).toContain("camera");
      expect(ids).toContain("shell");
    });

    it("each permission has required properties", () => {
      for (const perm of SYSTEM_PERMISSIONS) {
        expect(perm).toHaveProperty("id");
        expect(perm).toHaveProperty("name");
        expect(perm).toHaveProperty("description");
        expect(perm).toHaveProperty("icon");
        expect(perm).toHaveProperty("platforms");
        expect(perm).toHaveProperty("requiredForFeatures");

        expect(typeof perm.id).toBe("string");
        expect(typeof perm.name).toBe("string");
        expect(typeof perm.description).toBe("string");
        expect(typeof perm.icon).toBe("string");
        expect(Array.isArray(perm.platforms)).toBe(true);
        expect(Array.isArray(perm.requiredForFeatures)).toBe(true);
      }
    });

    it("all platforms are valid", () => {
      const validPlatforms = ["darwin", "win32", "linux"];
      for (const perm of SYSTEM_PERMISSIONS) {
        for (const platform of perm.platforms) {
          expect(validPlatforms).toContain(platform);
        }
      }
    });
  });

  describe("PERMISSION_MAP", () => {
    it("is a Map with 5 entries", () => {
      expect(PERMISSION_MAP).toBeInstanceOf(Map);
      expect(PERMISSION_MAP.size).toBe(5);
    });

    it("maps permission IDs to definitions", () => {
      const accessibilityDef = PERMISSION_MAP.get("accessibility");
      expect(accessibilityDef).toBeDefined();
      expect(accessibilityDef?.id).toBe("accessibility");
      expect(accessibilityDef?.name).toBe("Accessibility");
    });
  });

  describe("getPermissionDefinition", () => {
    it("returns definition for valid permission ID", () => {
      const def = getPermissionDefinition("microphone");
      expect(def).toBeDefined();
      expect(def?.id).toBe("microphone");
      expect(def?.name).toBe("Microphone");
    });

    it("returns undefined for invalid permission ID", () => {
      const def = getPermissionDefinition("invalid" as SystemPermissionId);
      expect(def).toBeUndefined();
    });

    it("returns correct definition for each permission", () => {
      const ids: SystemPermissionId[] = [
        "accessibility",
        "screen-recording",
        "microphone",
        "camera",
        "shell",
      ];

      for (const id of ids) {
        const def = getPermissionDefinition(id);
        expect(def).toBeDefined();
        expect(def?.id).toBe(id);
      }
    });
  });

  describe("getRequiredPermissions", () => {
    it("returns permissions required for computeruse feature", () => {
      const perms = getRequiredPermissions("computeruse");
      expect(perms).toContain("accessibility");
      expect(perms).toContain("screen-recording");
    });

    it("returns permissions required for browser feature", () => {
      const perms = getRequiredPermissions("browser");
      expect(perms).toContain("accessibility");
    });

    it("returns permissions required for talkmode feature", () => {
      const perms = getRequiredPermissions("talkmode");
      expect(perms).toContain("microphone");
    });

    it("returns permissions required for voice feature", () => {
      const perms = getRequiredPermissions("voice");
      expect(perms).toContain("microphone");
    });

    it("returns permissions required for vision feature", () => {
      const perms = getRequiredPermissions("vision");
      expect(perms).toContain("screen-recording");
      expect(perms).toContain("camera");
    });

    it("returns permissions required for camera feature", () => {
      const perms = getRequiredPermissions("camera");
      expect(perms).toContain("camera");
    });

    it("returns permissions required for shell feature", () => {
      const perms = getRequiredPermissions("shell");
      expect(perms).toContain("shell");
    });

    it("returns empty array for unknown feature", () => {
      const perms = getRequiredPermissions("unknown-feature");
      expect(perms).toHaveLength(0);
    });
  });

  describe("isPermissionApplicable", () => {
    // Accessibility is macOS only
    it("accessibility is applicable on darwin", () => {
      expect(isPermissionApplicable("accessibility", "darwin")).toBe(true);
    });

    it("accessibility is not applicable on win32", () => {
      expect(isPermissionApplicable("accessibility", "win32")).toBe(false);
    });

    it("accessibility is not applicable on linux", () => {
      expect(isPermissionApplicable("accessibility", "linux")).toBe(false);
    });

    // Screen recording is macOS only
    it("screen-recording is applicable on darwin", () => {
      expect(isPermissionApplicable("screen-recording", "darwin")).toBe(true);
    });

    it("screen-recording is not applicable on win32", () => {
      expect(isPermissionApplicable("screen-recording", "win32")).toBe(false);
    });

    it("screen-recording is not applicable on linux", () => {
      expect(isPermissionApplicable("screen-recording", "linux")).toBe(false);
    });

    // Microphone is cross-platform
    it("microphone is applicable on darwin", () => {
      expect(isPermissionApplicable("microphone", "darwin")).toBe(true);
    });

    it("microphone is applicable on win32", () => {
      expect(isPermissionApplicable("microphone", "win32")).toBe(true);
    });

    it("microphone is applicable on linux", () => {
      expect(isPermissionApplicable("microphone", "linux")).toBe(true);
    });

    // Camera is cross-platform
    it("camera is applicable on darwin", () => {
      expect(isPermissionApplicable("camera", "darwin")).toBe(true);
    });

    it("camera is applicable on win32", () => {
      expect(isPermissionApplicable("camera", "win32")).toBe(true);
    });

    it("camera is applicable on linux", () => {
      expect(isPermissionApplicable("camera", "linux")).toBe(true);
    });

    // Shell is cross-platform
    it("shell is applicable on darwin", () => {
      expect(isPermissionApplicable("shell", "darwin")).toBe(true);
    });

    it("shell is applicable on win32", () => {
      expect(isPermissionApplicable("shell", "win32")).toBe(true);
    });

    it("shell is applicable on linux", () => {
      expect(isPermissionApplicable("shell", "linux")).toBe(true);
    });

    // Invalid permission
    it("returns false for invalid permission ID", () => {
      expect(
        isPermissionApplicable("invalid" as SystemPermissionId, "darwin"),
      ).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// Permission Definitions Tests
// ---------------------------------------------------------------------------

describe("Permission Definitions", () => {
  describe("Accessibility permission", () => {
    const perm = getPermissionDefinition("accessibility");

    it("has correct metadata", () => {
      expect(perm?.name).toBe("Accessibility");
      expect(perm?.icon).toBe("cursor");
    });

    it("is required for computeruse and browser", () => {
      expect(perm?.requiredForFeatures).toContain("computeruse");
      expect(perm?.requiredForFeatures).toContain("browser");
    });

    it("is macOS only", () => {
      expect(perm?.platforms).toEqual(["darwin"]);
    });
  });

  describe("Screen Recording permission", () => {
    const perm = getPermissionDefinition("screen-recording");

    it("has correct metadata", () => {
      expect(perm?.name).toBe("Screen Recording");
      expect(perm?.icon).toBe("monitor");
    });

    it("is required for computeruse and vision", () => {
      expect(perm?.requiredForFeatures).toContain("computeruse");
      expect(perm?.requiredForFeatures).toContain("vision");
    });

    it("is macOS only", () => {
      expect(perm?.platforms).toEqual(["darwin"]);
    });
  });

  describe("Microphone permission", () => {
    const perm = getPermissionDefinition("microphone");

    it("has correct metadata", () => {
      expect(perm?.name).toBe("Microphone");
      expect(perm?.icon).toBe("mic");
    });

    it("is required for talkmode and voice", () => {
      expect(perm?.requiredForFeatures).toContain("talkmode");
      expect(perm?.requiredForFeatures).toContain("voice");
    });

    it("is cross-platform", () => {
      expect(perm?.platforms).toContain("darwin");
      expect(perm?.platforms).toContain("win32");
      expect(perm?.platforms).toContain("linux");
    });
  });

  describe("Camera permission", () => {
    const perm = getPermissionDefinition("camera");

    it("has correct metadata", () => {
      expect(perm?.name).toBe("Camera");
      expect(perm?.icon).toBe("camera");
    });

    it("is required for camera and vision", () => {
      expect(perm?.requiredForFeatures).toContain("camera");
      expect(perm?.requiredForFeatures).toContain("vision");
    });

    it("is cross-platform", () => {
      expect(perm?.platforms).toContain("darwin");
      expect(perm?.platforms).toContain("win32");
      expect(perm?.platforms).toContain("linux");
    });
  });

  describe("Shell permission", () => {
    const perm = getPermissionDefinition("shell");

    it("has correct metadata", () => {
      expect(perm?.name).toBe("Shell Access");
      expect(perm?.icon).toBe("terminal");
    });

    it("is required for shell feature", () => {
      expect(perm?.requiredForFeatures).toContain("shell");
    });

    it("is cross-platform", () => {
      expect(perm?.platforms).toContain("darwin");
      expect(perm?.platforms).toContain("win32");
      expect(perm?.platforms).toContain("linux");
    });
  });
});

// ---------------------------------------------------------------------------
// Type Safety Tests
// ---------------------------------------------------------------------------

describe("Type Safety", () => {
  it("SystemPermissionId accepts valid values", () => {
    const ids: SystemPermissionId[] = [
      "accessibility",
      "screen-recording",
      "microphone",
      "camera",
      "shell",
    ];
    expect(ids).toHaveLength(5);
  });

  it("PermissionStatus accepts valid values", () => {
    const statuses: PermissionStatus[] = [
      "granted",
      "denied",
      "not-determined",
      "restricted",
      "not-applicable",
    ];
    expect(statuses).toHaveLength(5);
  });

  it("PermissionState has correct shape", () => {
    const state: PermissionState = {
      id: "microphone",
      status: "granted",
      lastChecked: Date.now(),
      canRequest: false,
    };

    expect(state.id).toBe("microphone");
    expect(state.status).toBe("granted");
    expect(typeof state.lastChecked).toBe("number");
    expect(typeof state.canRequest).toBe("boolean");
  });

  it("SystemPermissionDefinition has correct shape", () => {
    const def: SystemPermissionDefinition = {
      id: "microphone",
      name: "Microphone",
      description: "Voice input",
      icon: "mic",
      platforms: ["darwin", "win32", "linux"],
      requiredForFeatures: ["talkmode"],
    };

    expect(def.id).toBe("microphone");
    expect(def.platforms).toHaveLength(3);
    expect(def.requiredForFeatures).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Feature Mapping Coverage Tests
// ---------------------------------------------------------------------------

describe("Feature Mapping Coverage", () => {
  it("all features have at least one required permission", () => {
    const features = [
      "computeruse",
      "browser",
      "talkmode",
      "voice",
      "vision",
      "camera",
      "shell",
    ];

    for (const feature of features) {
      const perms = getRequiredPermissions(feature);
      expect(perms.length).toBeGreaterThan(0);
    }
  });

  it("computeruse requires both accessibility and screen-recording", () => {
    const perms = getRequiredPermissions("computeruse");
    expect(perms).toHaveLength(2);
    expect(perms).toContain("accessibility");
    expect(perms).toContain("screen-recording");
  });

  it("vision requires screen-recording and camera", () => {
    const perms = getRequiredPermissions("vision");
    expect(perms).toContain("screen-recording");
    expect(perms).toContain("camera");
  });
});
