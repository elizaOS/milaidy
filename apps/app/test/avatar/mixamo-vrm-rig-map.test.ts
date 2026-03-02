/**
 * Tests for mixamoVRMRigMap — Mixamo to VRM bone name mapping.
 */
import { describe, it, expect } from "vitest";
import { mixamoVRMRigMap } from "../../src/components/avatar/mixamoVRMRigMap";

describe("mixamoVRMRigMap", () => {
  it("contains all essential bone mappings", () => {
    // Core spine chain
    expect(mixamoVRMRigMap.mixamorigHips).toBe("hips");
    expect(mixamoVRMRigMap.mixamorigSpine).toBe("spine");
    expect(mixamoVRMRigMap.mixamorigSpine1).toBe("chest");
    expect(mixamoVRMRigMap.mixamorigSpine2).toBe("upperChest");
    expect(mixamoVRMRigMap.mixamorigNeck).toBe("neck");
    expect(mixamoVRMRigMap.mixamorigHead).toBe("head");
  });

  it("maps left arm bones correctly", () => {
    expect(mixamoVRMRigMap.mixamorigLeftShoulder).toBe("leftShoulder");
    expect(mixamoVRMRigMap.mixamorigLeftArm).toBe("leftUpperArm");
    expect(mixamoVRMRigMap.mixamorigLeftForeArm).toBe("leftLowerArm");
    expect(mixamoVRMRigMap.mixamorigLeftHand).toBe("leftHand");
  });

  it("maps right arm bones correctly", () => {
    expect(mixamoVRMRigMap.mixamorigRightShoulder).toBe("rightShoulder");
    expect(mixamoVRMRigMap.mixamorigRightArm).toBe("rightUpperArm");
    expect(mixamoVRMRigMap.mixamorigRightForeArm).toBe("rightLowerArm");
    expect(mixamoVRMRigMap.mixamorigRightHand).toBe("rightHand");
  });

  it("maps left leg bones correctly", () => {
    expect(mixamoVRMRigMap.mixamorigLeftUpLeg).toBe("leftUpperLeg");
    expect(mixamoVRMRigMap.mixamorigLeftLeg).toBe("leftLowerLeg");
    expect(mixamoVRMRigMap.mixamorigLeftFoot).toBe("leftFoot");
    expect(mixamoVRMRigMap.mixamorigLeftToeBase).toBe("leftToes");
  });

  it("maps right leg bones correctly", () => {
    expect(mixamoVRMRigMap.mixamorigRightUpLeg).toBe("rightUpperLeg");
    expect(mixamoVRMRigMap.mixamorigRightLeg).toBe("rightLowerLeg");
    expect(mixamoVRMRigMap.mixamorigRightFoot).toBe("rightFoot");
    expect(mixamoVRMRigMap.mixamorigRightToeBase).toBe("rightToes");
  });

  it("has symmetric arm mappings (left/right)", () => {
    const leftArm = ["mixamorigLeftShoulder", "mixamorigLeftArm", "mixamorigLeftForeArm", "mixamorigLeftHand"];
    const rightArm = ["mixamorigRightShoulder", "mixamorigRightArm", "mixamorigRightForeArm", "mixamorigRightHand"];

    for (let i = 0; i < leftArm.length; i++) {
      const leftBone = mixamoVRMRigMap[leftArm[i]!];
      const rightBone = mixamoVRMRigMap[rightArm[i]!];
      expect(leftBone).toBeDefined();
      expect(rightBone).toBeDefined();
      // Left bone name should have "left", right should have "right"
      expect(leftBone!.toLowerCase()).toContain("left");
      expect(rightBone!.toLowerCase()).toContain("right");
    }
  });

  it("has symmetric leg mappings (left/right)", () => {
    const leftLeg = ["mixamorigLeftUpLeg", "mixamorigLeftLeg", "mixamorigLeftFoot", "mixamorigLeftToeBase"];
    const rightLeg = ["mixamorigRightUpLeg", "mixamorigRightLeg", "mixamorigRightFoot", "mixamorigRightToeBase"];

    for (let i = 0; i < leftLeg.length; i++) {
      const leftBone = mixamoVRMRigMap[leftLeg[i]!];
      const rightBone = mixamoVRMRigMap[rightLeg[i]!];
      expect(leftBone).toBeDefined();
      expect(rightBone).toBeDefined();
      expect(leftBone!.toLowerCase()).toContain("left");
      expect(rightBone!.toLowerCase()).toContain("right");
    }
  });

  it("maps all standard bones (at least 22 entries)", () => {
    const keys = Object.keys(mixamoVRMRigMap);
    // 6 spine/head + 4*2 arms + 4*2 legs = 22
    expect(keys.length).toBeGreaterThanOrEqual(22);
  });

  it("all values are valid VRM bone names (lowercase camelCase)", () => {
    for (const [key, value] of Object.entries(mixamoVRMRigMap)) {
      expect(value).toBeTruthy();
      // VRM bone names are camelCase (start lowercase)
      expect(value[0]).toBe(value[0]!.toLowerCase());
      // Keys should start with "mixamorig"
      expect(key.startsWith("mixamorig")).toBe(true);
    }
  });
});
