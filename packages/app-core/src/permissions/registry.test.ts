import { describe, expect, it } from "vitest";
import {
  getPermissionDefinition,
  getRequiredPermissions,
  isPermissionApplicable,
  PERMISSION_MAP,
  SYSTEM_PERMISSIONS,
} from "./registry.js";

describe("permissions registry", () => {
  it("exposes a one-to-one map of permission definitions by id", () => {
    expect(PERMISSION_MAP.size).toBe(SYSTEM_PERMISSIONS.length);

    const ids = SYSTEM_PERMISSIONS.map((permission) => permission.id);
    expect(new Set(ids).size).toBe(ids.length);

    for (const permission of SYSTEM_PERMISSIONS) {
      expect(PERMISSION_MAP.get(permission.id)).toEqual(permission);
    }
  });

  it("returns known permission definitions by id", () => {
    const accessibility = getPermissionDefinition("accessibility");
    expect(accessibility?.name).toBe("Accessibility");
    expect(accessibility?.platforms).toEqual(["darwin"]);

    const shell = getPermissionDefinition("shell");
    expect(shell?.requiredForFeatures).toContain("shell");
  });

  it("returns the required permissions for feature ids", () => {
    expect(getRequiredPermissions("browser")).toEqual(["accessibility"]);
    expect(getRequiredPermissions("vision")).toEqual([
      "screen-recording",
      "camera",
    ]);
    expect(getRequiredPermissions("nonexistent-feature")).toEqual([]);
  });

  it("checks whether permissions are applicable to each platform", () => {
    expect(isPermissionApplicable("accessibility", "darwin")).toBe(true);
    expect(isPermissionApplicable("accessibility", "win32")).toBe(false);
    expect(isPermissionApplicable("accessibility", "linux")).toBe(false);

    expect(isPermissionApplicable("camera", "darwin")).toBe(true);
    expect(isPermissionApplicable("camera", "win32")).toBe(true);
    expect(isPermissionApplicable("camera", "linux")).toBe(true);
  });

  it("returns undefined/false for unknown ids", () => {
    const unknownId = "unknown-permission";
    expect(getPermissionDefinition(unknownId as never)).toBeUndefined();
    expect(isPermissionApplicable(unknownId as never, "darwin")).toBe(false);
  });
});
