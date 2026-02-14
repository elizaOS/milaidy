/**
 * Bone-mapping tables for GLB → VRM conversion.
 *
 * Ported from HyperscapeAI/hyperscape
 * `packages/asset-forge/src/services/retargeting/BoneMappings.ts`
 */

// ── All 52 VRM 1.0 humanoid bone names ─────────────────────────────────────

export const _VRM_HUMANOID_BONES = [
  // Torso
  "hips", "spine", "chest", "upperChest", "neck", "head",
  // Left arm
  "leftShoulder", "leftUpperArm", "leftLowerArm", "leftHand",
  // Right arm
  "rightShoulder", "rightUpperArm", "rightLowerArm", "rightHand",
  // Left leg
  "leftUpperLeg", "leftLowerLeg", "leftFoot", "leftToes",
  // Right leg
  "rightUpperLeg", "rightLowerLeg", "rightFoot", "rightToes",
  // Left fingers
  "leftThumbMetacarpal", "leftThumbProximal", "leftThumbDistal",
  "leftIndexProximal", "leftIndexIntermediate", "leftIndexDistal",
  "leftMiddleProximal", "leftMiddleIntermediate", "leftMiddleDistal",
  "leftRingProximal", "leftRingIntermediate", "leftRingDistal",
  "leftLittleProximal", "leftLittleIntermediate", "leftLittleDistal",
  // Right fingers
  "rightThumbMetacarpal", "rightThumbProximal", "rightThumbDistal",
  "rightIndexProximal", "rightIndexIntermediate", "rightIndexDistal",
  "rightMiddleProximal", "rightMiddleIntermediate", "rightMiddleDistal",
  "rightRingProximal", "rightRingIntermediate", "rightRingDistal",
  "rightLittleProximal", "rightLittleIntermediate", "rightLittleDistal",
] as const;

export type VRMHumanBoneName = (typeof _VRM_HUMANOID_BONES)[number];

/** The 15 bones required for a valid VRM 1.0 skeleton. */
export const REQUIRED_VRM_BONES: VRMHumanBoneName[] = [
  "hips", "spine", "chest", "neck", "head",
  "leftUpperArm", "leftLowerArm", "leftHand",
  "rightUpperArm", "rightLowerArm", "rightHand",
  "leftUpperLeg", "leftLowerLeg",
  "rightUpperLeg", "rightLowerLeg",
];

// ── Meshy / generic → VRM bone map ─────────────────────────────────────────

/** Direct mapping from common Meshy bone names to VRM humanoid bone names. */
export const MESHY_TO_VRM_BONE_MAP: Record<string, VRMHumanBoneName> = {
  // Torso
  Hips: "hips",
  Spine: "spine",
  Spine01: "chest",
  Spine02: "upperChest",
  neck: "neck",
  Head: "head",
  // Left arm
  LeftShoulder: "leftShoulder",
  LeftArm: "leftUpperArm",
  LeftForeArm: "leftLowerArm",
  LeftHand: "leftHand",
  // Right arm
  RightShoulder: "rightShoulder",
  RightArm: "rightUpperArm",
  RightForeArm: "rightLowerArm",
  RightHand: "rightHand",
  // Left leg
  LeftUpLeg: "leftUpperLeg",
  LeftLeg: "leftLowerLeg",
  LeftFoot: "leftFoot",
  LeftToe: "leftToes",
  // Right leg
  RightUpLeg: "rightUpperLeg",
  RightLeg: "rightLowerLeg",
  RightFoot: "rightFoot",
  RightToe: "rightToes",
  // Left fingers
  LeftHandThumb1: "leftThumbMetacarpal",
  LeftHandThumb2: "leftThumbProximal",
  LeftHandThumb3: "leftThumbDistal",
  LeftHandIndex1: "leftIndexProximal",
  LeftHandIndex2: "leftIndexIntermediate",
  LeftHandIndex3: "leftIndexDistal",
  LeftHandMiddle1: "leftMiddleProximal",
  LeftHandMiddle2: "leftMiddleIntermediate",
  LeftHandMiddle3: "leftMiddleDistal",
  LeftHandRing1: "leftRingProximal",
  LeftHandRing2: "leftRingIntermediate",
  LeftHandRing3: "leftRingDistal",
  LeftHandPinky1: "leftLittleProximal",
  LeftHandPinky2: "leftLittleIntermediate",
  LeftHandPinky3: "leftLittleDistal",
  // Right fingers
  RightHandThumb1: "rightThumbMetacarpal",
  RightHandThumb2: "rightThumbProximal",
  RightHandThumb3: "rightThumbDistal",
  RightHandIndex1: "rightIndexProximal",
  RightHandIndex2: "rightIndexIntermediate",
  RightHandIndex3: "rightIndexDistal",
  RightHandMiddle1: "rightMiddleProximal",
  RightHandMiddle2: "rightMiddleIntermediate",
  RightHandMiddle3: "rightMiddleDistal",
  RightHandRing1: "rightRingProximal",
  RightHandRing2: "rightRingIntermediate",
  RightHandRing3: "rightRingDistal",
  RightHandPinky1: "rightLittleProximal",
  RightHandPinky2: "rightLittleIntermediate",
  RightHandPinky3: "rightLittleDistal",
};

// ── Variation tables for fuzzy matching ─────────────────────────────────────

/**
 * For each canonical Meshy bone name, a list of alternative names seen in
 * Meshy exports, Mixamo rigs, Blender Rigify, Bip01 rigs, etc.
 */
export const MESHY_VARIATIONS: Record<string, string[]> = {
  // Torso
  Hips: ["Hips", "hips", "Hip", "hip", "pelvis", "Pelvis", "mixamorig:Hips", "DEF-hips", "Bip01 Pelvis"],
  Spine: ["Spine", "spine", "spine.001", "mixamorig:Spine", "DEF-spine", "Bip01 Spine"],
  Spine01: ["Spine01", "Spine1", "spine1", "spine.002", "chest", "Chest", "mixamorig:Spine1", "DEF-spine.001", "Bip01 Spine1"],
  Spine02: ["Spine02", "Spine2", "spine2", "spine.003", "upperChest", "UpperChest", "upper_chest", "mixamorig:Spine2", "DEF-spine.002", "Bip01 Spine2"],
  neck: ["neck", "Neck", "neck.001", "mixamorig:Neck", "DEF-neck", "Bip01 Neck"],
  Head: ["Head", "head", "head.001", "mixamorig:Head", "DEF-head", "Bip01 Head"],
  // Left arm
  LeftShoulder: ["LeftShoulder", "leftShoulder", "shoulder.L", "Left_Shoulder", "mixamorig:LeftShoulder", "DEF-shoulder.L", "Bip01 L Clavicle"],
  LeftArm: ["LeftArm", "leftArm", "upper_arm.L", "Left_Arm", "Left_Upper_Arm", "mixamorig:LeftArm", "DEF-upper_arm.L", "Bip01 L UpperArm"],
  LeftForeArm: ["LeftForeArm", "leftForeArm", "forearm.L", "Left_ForeArm", "Left_Lower_Arm", "mixamorig:LeftForeArm", "DEF-forearm.L", "Bip01 L Forearm"],
  LeftHand: ["LeftHand", "leftHand", "hand.L", "Left_Hand", "mixamorig:LeftHand", "DEF-hand.L", "Bip01 L Hand"],
  // Right arm
  RightShoulder: ["RightShoulder", "rightShoulder", "shoulder.R", "Right_Shoulder", "mixamorig:RightShoulder", "DEF-shoulder.R", "Bip01 R Clavicle"],
  RightArm: ["RightArm", "rightArm", "upper_arm.R", "Right_Arm", "Right_Upper_Arm", "mixamorig:RightArm", "DEF-upper_arm.R", "Bip01 R UpperArm"],
  RightForeArm: ["RightForeArm", "rightForeArm", "forearm.R", "Right_ForeArm", "Right_Lower_Arm", "mixamorig:RightForeArm", "DEF-forearm.R", "Bip01 R Forearm"],
  RightHand: ["RightHand", "rightHand", "hand.R", "Right_Hand", "mixamorig:RightHand", "DEF-hand.R", "Bip01 R Hand"],
  // Left leg
  LeftUpLeg: ["LeftUpLeg", "leftUpLeg", "thigh.L", "Left_UpLeg", "Left_Upper_Leg", "mixamorig:LeftUpLeg", "DEF-thigh.L", "Bip01 L Thigh"],
  LeftLeg: ["LeftLeg", "leftLeg", "shin.L", "Left_Leg", "Left_Lower_Leg", "mixamorig:LeftLeg", "DEF-shin.L", "Bip01 L Calf"],
  LeftFoot: ["LeftFoot", "leftFoot", "foot.L", "Left_Foot", "mixamorig:LeftFoot", "DEF-foot.L", "Bip01 L Foot"],
  LeftToe: ["LeftToe", "leftToe", "toe.L", "Left_Toe", "LeftToeBase", "mixamorig:LeftToeBase", "DEF-toe.L", "Bip01 L Toe0"],
  // Right leg
  RightUpLeg: ["RightUpLeg", "rightUpLeg", "thigh.R", "Right_UpLeg", "Right_Upper_Leg", "mixamorig:RightUpLeg", "DEF-thigh.R", "Bip01 R Thigh"],
  RightLeg: ["RightLeg", "rightLeg", "shin.R", "Right_Leg", "Right_Lower_Leg", "mixamorig:RightLeg", "DEF-shin.R", "Bip01 R Calf"],
  RightFoot: ["RightFoot", "rightFoot", "foot.R", "Right_Foot", "mixamorig:RightFoot", "DEF-foot.R", "Bip01 R Foot"],
  RightToe: ["RightToe", "rightToe", "toe.R", "Right_Toe", "RightToeBase", "mixamorig:RightToeBase", "DEF-toe.R", "Bip01 R Toe0"],
  // Left fingers
  LeftHandThumb1: ["LeftHandThumb1", "thumb.01.L", "Left_Thumb_1", "mixamorig:LeftHandThumb1"],
  LeftHandThumb2: ["LeftHandThumb2", "thumb.02.L", "Left_Thumb_2", "mixamorig:LeftHandThumb2"],
  LeftHandThumb3: ["LeftHandThumb3", "thumb.03.L", "Left_Thumb_3", "mixamorig:LeftHandThumb3"],
  LeftHandIndex1: ["LeftHandIndex1", "f_index.01.L", "Left_Index_1", "mixamorig:LeftHandIndex1"],
  LeftHandIndex2: ["LeftHandIndex2", "f_index.02.L", "Left_Index_2", "mixamorig:LeftHandIndex2"],
  LeftHandIndex3: ["LeftHandIndex3", "f_index.03.L", "Left_Index_3", "mixamorig:LeftHandIndex3"],
  LeftHandMiddle1: ["LeftHandMiddle1", "f_middle.01.L", "Left_Middle_1", "mixamorig:LeftHandMiddle1"],
  LeftHandMiddle2: ["LeftHandMiddle2", "f_middle.02.L", "Left_Middle_2", "mixamorig:LeftHandMiddle2"],
  LeftHandMiddle3: ["LeftHandMiddle3", "f_middle.03.L", "Left_Middle_3", "mixamorig:LeftHandMiddle3"],
  LeftHandRing1: ["LeftHandRing1", "f_ring.01.L", "Left_Ring_1", "mixamorig:LeftHandRing1"],
  LeftHandRing2: ["LeftHandRing2", "f_ring.02.L", "Left_Ring_2", "mixamorig:LeftHandRing2"],
  LeftHandRing3: ["LeftHandRing3", "f_ring.03.L", "Left_Ring_3", "mixamorig:LeftHandRing3"],
  LeftHandPinky1: ["LeftHandPinky1", "f_pinky.01.L", "Left_Pinky_1", "mixamorig:LeftHandPinky1"],
  LeftHandPinky2: ["LeftHandPinky2", "f_pinky.02.L", "Left_Pinky_2", "mixamorig:LeftHandPinky2"],
  LeftHandPinky3: ["LeftHandPinky3", "f_pinky.03.L", "Left_Pinky_3", "mixamorig:LeftHandPinky3"],
  // Right fingers
  RightHandThumb1: ["RightHandThumb1", "thumb.01.R", "Right_Thumb_1", "mixamorig:RightHandThumb1"],
  RightHandThumb2: ["RightHandThumb2", "thumb.02.R", "Right_Thumb_2", "mixamorig:RightHandThumb2"],
  RightHandThumb3: ["RightHandThumb3", "thumb.03.R", "Right_Thumb_3", "mixamorig:RightHandThumb3"],
  RightHandIndex1: ["RightHandIndex1", "f_index.01.R", "Right_Index_1", "mixamorig:RightHandIndex1"],
  RightHandIndex2: ["RightHandIndex2", "f_index.02.R", "Right_Index_2", "mixamorig:RightHandIndex2"],
  RightHandIndex3: ["RightHandIndex3", "f_index.03.R", "Right_Index_3", "mixamorig:RightHandIndex3"],
  RightHandMiddle1: ["RightHandMiddle1", "f_middle.01.R", "Right_Middle_1", "mixamorig:RightHandMiddle1"],
  RightHandMiddle2: ["RightHandMiddle2", "f_middle.02.R", "Right_Middle_2", "mixamorig:RightHandMiddle2"],
  RightHandMiddle3: ["RightHandMiddle3", "f_middle.03.R", "Right_Middle_3", "mixamorig:RightHandMiddle3"],
  RightHandRing1: ["RightHandRing1", "f_ring.01.R", "Right_Ring_1", "mixamorig:RightHandRing1"],
  RightHandRing2: ["RightHandRing2", "f_ring.02.R", "Right_Ring_2", "mixamorig:RightHandRing2"],
  RightHandRing3: ["RightHandRing3", "f_ring.03.R", "Right_Ring_3", "mixamorig:RightHandRing3"],
  RightHandPinky1: ["RightHandPinky1", "f_pinky.01.R", "Right_Pinky_1", "mixamorig:RightHandPinky1"],
  RightHandPinky2: ["RightHandPinky2", "f_pinky.02.R", "Right_Pinky_2", "mixamorig:RightHandPinky2"],
  RightHandPinky3: ["RightHandPinky3", "f_pinky.03.R", "Right_Pinky_3", "mixamorig:RightHandPinky3"],
};

/**
 * Find the canonical Meshy bone name for a given bone name by searching
 * through all variation tables.  Returns `null` if no match is found.
 */
export function findMeshyBoneName(name: string): string | null {
  for (const [canonical, variations] of Object.entries(MESHY_VARIATIONS)) {
    if (variations.includes(name)) {
      return canonical;
    }
  }
  return null;
}
