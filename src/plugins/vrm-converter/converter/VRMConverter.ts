/**
 * GLB → VRM 1.0 converter.
 *
 * Ported from HyperscapeAI/hyperscape
 * `packages/asset-forge/src/services/retargeting/VRMConverter.ts`
 *
 * Adapted for Node.js:
 *  - Uses `node-three-gltf` for GLTFLoader / GLTFExporter
 *  - Writes temp file if in-memory loading isn't supported
 *  - Can persist output to ~/.milaidy/avatars/
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as THREE from "three";
import {
  MESHY_TO_VRM_BONE_MAP,
  REQUIRED_VRM_BONES,
  findMeshyBoneName,
  type VRMHumanBoneName,
} from "./BoneMappings.js";
import type { VRMConversionOptions, VRMConversionResult } from "./types.js";

// ── GLB magic bytes ────────────────────────────────────────────────────────
const GLB_MAGIC = 0x46546c67; // "glTF"

// ── Helpers ────────────────────────────────────────────────────────────────

/** Load a GLB buffer into a THREE.js scene using node-three-gltf. */
async function loadGlb(
  buffer: ArrayBuffer,
): Promise<{ scene: THREE.Scene; json: Record<string, unknown> }> {
  // node-three-gltf provides a Node.js-compatible GLTFLoader.
  // It may or may not support .parse(buffer) directly, so we use the
  // temp-file fallback strategy as documented in the plan.
  const { GLTFLoader } = await import("node-three-gltf");
  const loader = new GLTFLoader();

  // Try in-memory parsing first.
  try {
    type GltfResult = { scene: THREE.Scene; parser?: { json?: Record<string, unknown> } };
    const gltf: GltfResult = await new Promise((resolve, reject) => {
      loader.parse(
        buffer,
        "",
        (result: GltfResult) => resolve(result),
        (err: unknown) => reject(err),
      );
    });
    return { scene: gltf.scene, json: gltf.parser?.json ?? {} };
  } catch {
    // Fallback: write temp file, load from disk, clean up.
    const tmp = path.join(os.tmpdir(), `vrm-convert-${Date.now()}.glb`);
    fs.writeFileSync(tmp, Buffer.from(buffer));
    try {
      const gltf: GltfResult = await new Promise((resolve, reject) => {
        loader.load(
          tmp,
          (result: GltfResult) => resolve(result),
          undefined, // onProgress
          (err: unknown) => reject(err),
        );
      });
      return { scene: gltf.scene, json: gltf.parser?.json ?? {} };
    } finally {
      try {
        fs.unlinkSync(tmp);
      } catch {
        /* ignore cleanup errors */
      }
    }
  }
}

/** Export a THREE.Scene to GLB binary via node-three-gltf GLTFExporter. */
async function exportGlb(scene: THREE.Scene): Promise<ArrayBuffer> {
  const { GLTFExporter } = await import("node-three-gltf");
  const exporter = new GLTFExporter();

  // Force TRS mode on all objects (avoids matrix-only export).
  scene.traverse((obj: THREE.Object3D) => {
    obj.matrixAutoUpdate = true;
    obj.updateMatrix();
  });

  return new Promise<ArrayBuffer>((resolve, reject) => {
    exporter.parse(
      scene,
      (result: unknown) => {
        if (result instanceof ArrayBuffer) {
          resolve(result);
        } else {
          // JSON result — shouldn't happen with binary:true but handle it.
          const jsonStr = JSON.stringify(result);
          const enc = new TextEncoder();
          resolve(enc.encode(jsonStr).buffer as ArrayBuffer);
        }
      },
      (err: unknown) => reject(err),
      { binary: true },
    );
  });
}

// ── VRMConverter class ─────────────────────────────────────────────────────

export class VRMConverter {
  private scene!: THREE.Scene;
  private bones: THREE.Bone[] = [];
  private skinnedMesh: THREE.SkinnedMesh | null = null;
  private warnings: string[] = [];
  private boneMappings = new Map<string, string>();

  /**
   * Convert a GLB ArrayBuffer into a VRM 1.0 ArrayBuffer.
   *
   * Pipeline: loadGlb → extractSkeleton → normalizeScale → mapBonesToVRM
   *           → two-pass export (JSON then inject VRMC_vrm → binary GLB)
   */
  static async convert(
    glbBuffer: ArrayBuffer,
    options: VRMConversionOptions = {},
  ): Promise<VRMConversionResult> {
    const converter = new VRMConverter();
    return converter.run(glbBuffer, options);
  }

  private async run(
    glbBuffer: ArrayBuffer,
    options: VRMConversionOptions,
  ): Promise<VRMConversionResult> {
    this.warnings = [];
    this.bones = [];
    this.skinnedMesh = null;
    this.boneMappings.clear();

    // 1. Load the GLB into a THREE.Scene
    const { scene } = await loadGlb(glbBuffer);
    this.scene = scene;

    // 2. Extract skeleton
    this.extractSkeleton();

    // 3. Normalize scale (target: ~1.6m height)
    this.normalizeScale();

    // 4. Map bones to VRM humanoid standard (by name — indices resolved later
    //    from the exported glTF JSON to avoid scene-traversal-order mismatch).
    const vrmBoneNameMap = this.mapBonesToVRM();

    // 5. Ensure hips has local translation
    this.ensureHipsTranslation(vrmBoneNameMap);

    // 6. Two-pass export:  scene → binary GLB → parse JSON → inject VRMC_vrm
    //    → reassemble binary.  Node indices are resolved from the exported
    //    glTF JSON so they match the exporter's ordering exactly.
    const vrm = await this.exportVRM(vrmBoneNameMap, options);

    // 7. Optionally save to disk
    let savedPath: string | undefined;
    if (options.save) {
      savedPath = await this.saveToDisk(vrm, options);
    }

    return {
      vrm,
      warnings: this.warnings,
      mappedBones: vrmBoneNameMap.size,
      savedPath,
    };
  }

  // ── Skeleton extraction ──────────────────────────────────────────────

  private extractSkeleton(): void {
    const bones: THREE.Bone[] = [];
    let skinnedMesh: THREE.SkinnedMesh | null = null;

    this.scene.traverse((obj: THREE.Object3D) => {
      if ((obj as THREE.Bone).isBone) {
        bones.push(obj as THREE.Bone);
      }
      if (
        (obj as THREE.SkinnedMesh).isSkinnedMesh &&
        !skinnedMesh
      ) {
        skinnedMesh = obj as THREE.SkinnedMesh;
      }
    });

    if (bones.length === 0) {
      throw new Error("No bones found in GLB — cannot create VRM skeleton");
    }

    this.bones = bones;
    this.skinnedMesh = skinnedMesh;

    if (!skinnedMesh) {
      this.warnings.push(
        "No SkinnedMesh found — VRM will have skeleton but no skinned geometry",
      );
    }
  }

  // ── Scale normalisation ──────────────────────────────────────────────

  private normalizeScale(): void {
    // Compute bounding box of the full scene.
    const box = new THREE.Box3().setFromObject(this.scene);
    const size = new THREE.Vector3();
    box.getSize(size);

    const height = size.y;
    if (height <= 0) return;

    const TARGET_HEIGHT = 1.6; // metres
    const scaleFactor = TARGET_HEIGHT / height;

    // If scaling is roughly 1:1, skip.
    if (Math.abs(scaleFactor - 1) < 0.05) return;

    // Find the armature (direct child of scene that parents bones).
    const armature = this.findArmature();
    if (armature) {
      // Bake the scale into bone positions rather than setting armature scale,
      // because VRM expects the skeleton in un-scaled space.
      armature.scale.multiplyScalar(scaleFactor);
      armature.updateMatrixWorld(true);

      // Re-bake: apply armature transform to children, then reset armature.
      this.bakeArmatureScale(armature);
    } else {
      // Fallback: scale the whole scene.
      this.scene.scale.multiplyScalar(scaleFactor);
      this.scene.updateMatrixWorld(true);
    }
  }

  private findArmature(): THREE.Object3D | null {
    for (const child of this.scene.children) {
      if (child.name.toLowerCase().includes("armature")) return child;
      // Also check if the child has bones as descendants.
      let hasBone = false;
      child.traverse((obj: THREE.Object3D) => {
        if ((obj as THREE.Bone).isBone) hasBone = true;
      });
      if (hasBone) return child;
    }
    return null;
  }

  private bakeArmatureScale(armature: THREE.Object3D): void {
    const scale = armature.scale.clone();
    armature.updateMatrixWorld(true);

    armature.traverse((obj: THREE.Object3D) => {
      if (obj === armature) return;
      if ((obj as THREE.Bone).isBone) {
        obj.position.multiply(scale);
      }
    });

    armature.scale.set(1, 1, 1);
    armature.updateMatrixWorld(true);

    // Recompute inverse bind matrices if we have a skeleton.
    if (this.skinnedMesh?.skeleton) {
      this.skinnedMesh.skeleton.calculateInverses();
    }
  }

  // ── Bone mapping ─────────────────────────────────────────────────────

  /**
   * Map each skeleton bone to a VRM humanoid bone.
   *
   * Returns a Map of **VRM bone name → original bone name** (strings only).
   * Node indices are resolved later from the exported glTF JSON so that we
   * use the exporter's node ordering — not the scene-traversal order which
   * can differ.
   */
  private mapBonesToVRM(): Map<VRMHumanBoneName, string> {
    const result = new Map<VRMHumanBoneName, string>();

    for (const bone of this.bones) {
      const meshyName = this.resolveCanonicalName(bone.name);
      if (!meshyName) continue;

      const vrmBone = MESHY_TO_VRM_BONE_MAP[meshyName];
      if (!vrmBone) continue;

      // Store the bone's actual name (as it appears in the scene / glTF).
      result.set(vrmBone, bone.name);
    }

    // Check for required bones.
    const missing = REQUIRED_VRM_BONES.filter((b) => !result.has(b));
    if (missing.length > 0) {
      this.warnings.push(
        `Missing required VRM bones: ${missing.join(", ")}`,
      );
    }

    return result;
  }

  /** Resolve a bone name to its canonical Meshy name using variation tables. */
  private resolveCanonicalName(name: string): string | null {
    // 1. Direct hit.
    if (MESHY_TO_VRM_BONE_MAP[name]) return name;
    // 2. Variation lookup.
    return findMeshyBoneName(name);
  }

  // ── Hips translation ─────────────────────────────────────────────────

  private ensureHipsTranslation(
    vrmBoneNameMap: Map<VRMHumanBoneName, string>,
  ): void {
    const hipsBoneName = vrmBoneNameMap.get("hips");
    if (!hipsBoneName) return;

    const hipsBone = this.bones.find((b) => b.name === hipsBoneName);
    if (!hipsBone) return;

    // Ensure hips has a non-zero Y translation (needed for animations).
    if (hipsBone.position.lengthSq() < 0.0001) {
      // Set a reasonable default hip height.
      hipsBone.position.set(0, 0.9, 0);
      this.warnings.push(
        "Hips bone had no local translation — set default Y=0.9m",
      );
    }
  }

  // ── VRM export ───────────────────────────────────────────────────────

  /**
   * Two-pass export:
   * 1. Export scene as binary GLB to get geometry + JSON.
   * 2. Parse the GLB, extract the JSON chunk.
   * 3. Build a nodeNameToIndex map from the **exported** JSON nodes so that
   *    bone indices match the exporter's ordering (not scene-traversal).
   * 4. Inject VRMC_vrm extension with correct node indices.
   * 5. Reassemble as binary GLB.
   */
  private async exportVRM(
    vrmBoneNameMap: Map<VRMHumanBoneName, string>,
    options: VRMConversionOptions,
  ): Promise<ArrayBuffer> {
    // Export as GLB binary.
    const glbBuffer = await exportGlb(this.scene);

    // Parse the GLB binary to extract JSON chunk and BIN chunk.
    const { jsonChunk, binChunk } = this.parseGlb(glbBuffer);

    // Parse the exported JSON.
    const gltfJson = JSON.parse(jsonChunk);

    // Build a name→index map from the exported nodes array.  This is the
    // authoritative ordering that @pixiv/three-vrm will use when loading.
    const nodeNameToIndex = new Map<string, number>();
    if (Array.isArray(gltfJson.nodes)) {
      for (let i = 0; i < gltfJson.nodes.length; i++) {
        const name = gltfJson.nodes[i]?.name;
        if (typeof name === "string") {
          nodeNameToIndex.set(name, i);
        }
      }
    }

    // Resolve VRM bone names → exported node indices.
    const humanBones: Record<string, { node: number }> = {};
    for (const [vrmBone, originalBoneName] of vrmBoneNameMap) {
      const idx = nodeNameToIndex.get(originalBoneName);
      if (idx !== undefined) {
        humanBones[vrmBone] = { node: idx };
      } else {
        this.warnings.push(
          `Bone "${originalBoneName}" (${vrmBone}) not found in exported glTF nodes`,
        );
      }
    }

    // Inject VRMC_vrm extension.
    if (!gltfJson.extensions) gltfJson.extensions = {};
    gltfJson.extensions.VRMC_vrm = {
      specVersion: "1.0",
      humanoid: { humanBones },
      meta: {
        metaVersion: "1",
        name: options.avatarName || "Converted Avatar",
        version: options.version || "1.0",
        authors: [options.author || "Milaidy VRM Converter"],
        licenseUrl: "https://vrm.dev/licenses/1.0/",
        avatarPermission: "everyone",
        commercialUsage: "personalNonProfit",
        allowExcessivelyViolentUsage: false,
        allowExcessivelySexualUsage: false,
        allowPoliticalOrReligiousUsage: false,
        allowAntisocialOrHateUsage: false,
        creditNotation: "required",
        allowRedistribution: false,
        modification: "prohibited",
      },
    };

    // Add to extensionsUsed.
    if (!gltfJson.extensionsUsed) gltfJson.extensionsUsed = [];
    if (!gltfJson.extensionsUsed.includes("VRMC_vrm")) {
      gltfJson.extensionsUsed.push("VRMC_vrm");
    }

    // Ensure nodes use TRS instead of matrix (VRM requires TRS).
    if (gltfJson.nodes) {
      for (const node of gltfJson.nodes) {
        if (node.matrix && !node.translation) {
          const mat = new THREE.Matrix4();
          mat.fromArray(node.matrix);
          const pos = new THREE.Vector3();
          const quat = new THREE.Quaternion();
          const scl = new THREE.Vector3();
          mat.decompose(pos, quat, scl);
          node.translation = [pos.x, pos.y, pos.z];
          node.rotation = [quat.x, quat.y, quat.z, quat.w];
          node.scale = [scl.x, scl.y, scl.z];
          delete node.matrix;
        }
      }
    }

    // Reassemble GLB binary.
    return this.assembleGlb(JSON.stringify(gltfJson), binChunk);
  }

  /** Parse a GLB binary into its JSON string and BIN buffer. */
  private parseGlb(
    buffer: ArrayBuffer,
  ): { jsonChunk: string; binChunk: ArrayBuffer } {
    const view = new DataView(buffer);
    // Header: magic(4) + version(4) + length(4)
    const magic = view.getUint32(0, true);
    if (magic !== GLB_MAGIC) {
      throw new Error("Invalid GLB: bad magic bytes");
    }
    // First chunk: JSON
    const chunk0Length = view.getUint32(12, true);
    const chunk0Type = view.getUint32(16, true);
    if (chunk0Type !== 0x4e4f534a) {
      // "JSON"
      throw new Error("Invalid GLB: first chunk is not JSON");
    }
    const jsonBytes = new Uint8Array(buffer, 20, chunk0Length);
    const jsonChunk = new TextDecoder().decode(jsonBytes);

    // Second chunk: BIN (optional)
    const binOffset = 20 + chunk0Length;
    let binChunk: ArrayBuffer;
    if (binOffset + 8 <= buffer.byteLength) {
      const chunk1Length = view.getUint32(binOffset, true);
      binChunk = buffer.slice(binOffset + 8, binOffset + 8 + chunk1Length);
    } else {
      binChunk = new ArrayBuffer(0);
    }

    return { jsonChunk, binChunk };
  }

  /** Assemble a GLB binary from JSON string and BIN buffer. */
  private assembleGlb(
    jsonString: string,
    binData: ArrayBuffer,
  ): ArrayBuffer {
    const encoder = new TextEncoder();
    const jsonBytes = encoder.encode(jsonString);

    // Pad JSON to 4-byte alignment with spaces.
    const jsonPadding = (4 - (jsonBytes.length % 4)) % 4;
    const jsonLength = jsonBytes.length + jsonPadding;

    // Pad BIN to 4-byte alignment with zeros.
    const binPadding = (4 - (binData.byteLength % 4)) % 4;
    const binLength = binData.byteLength + binPadding;

    const hasBin = binData.byteLength > 0;
    const totalLength =
      12 + // GLB header
      8 +
      jsonLength + // JSON chunk header + data
      (hasBin ? 8 + binLength : 0); // BIN chunk header + data (if present)

    const result = new ArrayBuffer(totalLength);
    const view = new DataView(result);
    const bytes = new Uint8Array(result);

    // GLB header
    view.setUint32(0, GLB_MAGIC, true);
    view.setUint32(4, 2, true); // version
    view.setUint32(8, totalLength, true);

    // JSON chunk header
    view.setUint32(12, jsonLength, true);
    view.setUint32(16, 0x4e4f534a, true); // "JSON"
    bytes.set(jsonBytes, 20);
    // Pad with spaces (0x20)
    for (let i = 0; i < jsonPadding; i++) {
      bytes[20 + jsonBytes.length + i] = 0x20;
    }

    // BIN chunk
    if (hasBin) {
      const binStart = 20 + jsonLength;
      view.setUint32(binStart, binLength, true);
      view.setUint32(binStart + 4, 0x004e4942, true); // "BIN\0"
      bytes.set(new Uint8Array(binData), binStart + 8);
      // Pad with zeros (already zero-initialized)
    }

    return result;
  }

  // ── Disk persistence ─────────────────────────────────────────────────

  private async saveToDisk(
    vrm: ArrayBuffer,
    options: VRMConversionOptions,
  ): Promise<string> {
    // Dynamically import paths to avoid hard coupling.
    const { resolveStateDir } = await import("../../../config/paths.js");
    const avatarsDir = path.join(resolveStateDir(), "avatars");
    fs.mkdirSync(avatarsDir, { recursive: true });

    const safeName = (options.avatarName || "converted")
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .slice(0, 64);
    const fileName = `${safeName}-${Date.now()}.vrm`;
    const filePath = path.join(avatarsDir, fileName);

    fs.writeFileSync(filePath, Buffer.from(vrm));
    return filePath;
  }
}

/** Convenience wrapper for one-shot conversion. */
export async function convertGlbToVrm(
  glbBuffer: ArrayBuffer,
  options?: VRMConversionOptions,
): Promise<VRMConversionResult> {
  return VRMConverter.convert(glbBuffer, options);
}
