import type { VRM } from "@pixiv/three-vrm";
import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MIXAMO_IDLE_CANDIDATE_URLS } from "./mixamoAnimationCatalog";

/**
 * Context needed by the animation loader to check whether the owning engine
 * is still alive / relevant for the load request.
 */
export type AnimationLoaderContext = {
  /** Returns `true` if the loading sequence was aborted (engine disposed). */
  isAborted: () => boolean;
  /** Returns `true` if `vrm` is still the active model in the engine. */
  isCurrentVrm: (vrm: VRM) => boolean;
};

/**
 * Load and return an idle {@link THREE.AnimationClip} for the given VRM.
 *
 * Tries the GLB idle first, then falls back through a series of FBX sources.
 * Returns `null` only when the load was aborted (engine disposed / VRM replaced).
 * Throws when no usable idle clip can be found.
 */
export async function loadIdleClip(
  vrm: VRM,
  idleGlbUrl: string,
  idleBreathingFbxUrl: string,
  idleFallbackFbxUrl: string,
  ctx: AnimationLoaderContext,
): Promise<THREE.AnimationClip | null> {
  let clip: THREE.AnimationClip | null = null;

  try {
    const { retargetMixamoGltfToVrm } = await import(
      "./retargetMixamoGltfToVrm"
    );
    if (ctx.isAborted() || !ctx.isCurrentVrm(vrm)) return null;

    const gltfLoader = new GLTFLoader();
    const gltf = await gltfLoader.loadAsync(idleGlbUrl);
    if (ctx.isAborted() || !ctx.isCurrentVrm(vrm)) return null;

    gltf.scene.updateMatrixWorld(true);
    vrm.scene.updateMatrixWorld(true);
    clip = retargetMixamoGltfToVrm(
      { scene: gltf.scene, animations: gltf.animations },
      vrm,
    );
  } catch {
    // LFS pointers or missing glb assets are common in forks; fall back to FBX.
  }

  if (!clip) {
    const { retargetMixamoFbxToVrm } = await import("./retargetMixamoFbxToVrm");
    if (ctx.isAborted() || !ctx.isCurrentVrm(vrm)) return null;

    const fbxLoader = new FBXLoader();
    const fallbackUrls = Array.from(
      new Set([
        idleBreathingFbxUrl,
        idleFallbackFbxUrl,
        ...MIXAMO_IDLE_CANDIDATE_URLS,
      ]),
    );
    for (const url of fallbackUrls) {
      try {
        const fbx = await fbxLoader.loadAsync(url);
        if (ctx.isAborted() || !ctx.isCurrentVrm(vrm)) return null;

        fbx.updateMatrixWorld(true);
        vrm.scene.updateMatrixWorld(true);
        const sourceClip =
          THREE.AnimationClip.findByName(fbx.animations, "mixamo.com") ??
          fbx.animations[0];
        if (!sourceClip) continue;
        clip = retargetMixamoFbxToVrm(fbx, sourceClip, vrm);
        if (clip) break;
      } catch {
        // Try the next fallback animation source.
      }
    }
  }

  if (!clip) {
    throw new Error(
      "No usable idle animation (idle.glb/BreathingIdle.fbx/Idle.fbx/mixamo idle fallback)",
    );
  }

  if (ctx.isAborted() || !ctx.isCurrentVrm(vrm)) return null;
  return clip;
}

/**
 * Load a single emote animation clip (FBX or GLB/glTF) and retarget it to
 * the supplied VRM. Returns `null` when the load was aborted or the file
 * format could not be processed.
 */
export async function loadEmoteClip(
  path: string,
  vrm: VRM,
  ctx: AnimationLoaderContext,
): Promise<THREE.AnimationClip | null> {
  const isFbx = path.toLowerCase().endsWith(".fbx");

  try {
    if (isFbx) {
      const { retargetMixamoFbxToVrm } = await import(
        "./retargetMixamoFbxToVrm"
      );
      if (!ctx.isCurrentVrm(vrm)) return null;

      const loader = new FBXLoader();
      const fbx = await loader.loadAsync(path);
      if (!ctx.isCurrentVrm(vrm)) return null;

      fbx.updateMatrixWorld(true);
      vrm.scene.updateMatrixWorld(true);
      const sourceClip =
        THREE.AnimationClip.findByName(fbx.animations, "mixamo.com") ??
        fbx.animations[0];
      if (!sourceClip) return null;
      return retargetMixamoFbxToVrm(fbx, sourceClip, vrm);
    }

    const { retargetMixamoGltfToVrm } = await import(
      "./retargetMixamoGltfToVrm"
    );
    if (!ctx.isCurrentVrm(vrm)) return null;

    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(path);
    if (!ctx.isCurrentVrm(vrm)) return null;

    gltf.scene.updateMatrixWorld(true);
    vrm.scene.updateMatrixWorld(true);
    return retargetMixamoGltfToVrm(
      { scene: gltf.scene, animations: gltf.animations },
      vrm,
    );
  } catch (err) {
    console.error(`[VrmEngine] Failed to load emote: ${path}`, err);
    return null;
  }
}
