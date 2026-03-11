import type { VRM } from "@pixiv/three-vrm";
import * as THREE from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export type CameraProfile = "chat" | "companion" | "companion_close";
export type InteractionMode = "free" | "orbitZoom";

export type CameraAnimationConfig = {
  enabled: boolean;
  swayAmplitude: number;
  bobAmplitude: number;
  rotationAmplitude: number;
  speed: number;
};

/**
 * Handles VRM avatar framing, camera profile application, companion-mode
 * bounds-based camera fitting, camera sway animation, interaction modes,
 * and VRM face-orientation correction.
 */
export class VrmCameraManager {
  /**
   * Position and scale the VRM for the active camera profile, then place the
   * camera accordingly. Updates `lookAtTarget` and `baseCameraPosition` in place.
   */
  centerAndFrame(
    vrm: VRM,
    camera: THREE.PerspectiveCamera,
    controls: OrbitControls | null,
    cameraProfile: CameraProfile,
    lookAtTarget: THREE.Vector3,
    baseCameraPosition: THREE.Vector3,
    applyInteractionMode: (controls: OrbitControls) => void,
  ): void {
    if (cameraProfile === "companion" || cameraProfile === "companion_close") {
      vrm.scene.scale.set(1.78, 1.78, 1.78);
      vrm.scene.position.set(0, -0.84, 0);
      lookAtTarget.set(0, 0.64, 0);
    } else {
      vrm.scene.scale.set(1.45, 1.45, 1.45);
      vrm.scene.position.set(0, -0.8, 0);
      lookAtTarget.set(0, 0.5, 0);
    }
    vrm.scene.updateMatrixWorld(true);
    camera.near = 0.1;
    camera.far = 20.0;
    this.applyCameraProfileToCamera(camera, controls, cameraProfile);
    this.adjustCompanionCameraForAvatarBounds(
      vrm,
      camera,
      controls,
      cameraProfile,
      lookAtTarget,
    );
    camera.updateProjectionMatrix();
    baseCameraPosition.copy(camera.position);

    if (controls) {
      controls.target.copy(lookAtTarget);
      applyInteractionMode(controls);
      controls.update();
    }
  }

  /**
   * For the companion profile, adapt camera distance so the full avatar
   * body stays in frame regardless of model dimensions.
   */
  adjustCompanionCameraForAvatarBounds(
    vrm: VRM,
    camera: THREE.PerspectiveCamera,
    controls: OrbitControls | null,
    cameraProfile: CameraProfile,
    lookAtTarget: THREE.Vector3,
  ): void {
    if (cameraProfile !== "companion" && cameraProfile !== "companion_close")
      return;

    const bounds = new THREE.Box3().setFromObject(vrm.scene);
    if (bounds.isEmpty()) return;

    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    bounds.getSize(size);
    bounds.getCenter(center);

    if (
      !Number.isFinite(size.x) ||
      !Number.isFinite(size.y) ||
      !Number.isFinite(size.z)
    ) {
      return;
    }

    const verticalPadding = 1.2;
    const horizontalPadding = 1.16;
    const halfHeight = Math.max((size.y * verticalPadding) / 2, 0.65);
    const halfWidth = Math.max((size.x * horizontalPadding) / 2, 0.45);

    const verticalFov = THREE.MathUtils.degToRad(camera.fov);
    const horizontalFov =
      2 * Math.atan(Math.max(1e-4, Math.tan(verticalFov / 2) * camera.aspect));

    const distanceByHeight =
      halfHeight / Math.max(1e-4, Math.tan(verticalFov / 2));
    const distanceByWidth =
      halfWidth / Math.max(1e-4, Math.tan(horizontalFov / 2));
    const fitDistance = Math.max(distanceByHeight, distanceByWidth, 4.62);
    let distance = Math.min(fitDistance, 7.4);

    let lookAtLift = Math.min(size.y * 0.03, 0.12);
    let cameraLift = Math.min(size.y * 0.08, 0.26);

    if (cameraProfile === "companion_close") {
      distance = distance * 0.35; // Closer camera
      lookAtLift = size.y * 0.28; // Look at neck/upper chest height
      cameraLift = 0; // Point straight on, no downward angle
    }

    lookAtTarget.set(center.x, center.y + lookAtLift, center.z);
    camera.position.set(
      center.x,
      lookAtTarget.y + cameraLift,
      center.z + distance,
    );

    if (controls) {
      controls.minDistance = Math.max(1.0, distance * 0.72);
      controls.maxDistance = Math.max(7.2, distance * 1.75);
    }
  }

  /**
   * Apply preset camera position, FOV and orbit constraints for the given
   * camera profile.
   */
  applyCameraProfileToCamera(
    camera: THREE.PerspectiveCamera,
    controls: OrbitControls | null,
    cameraProfile: CameraProfile,
  ): void {
    if (cameraProfile === "companion" || cameraProfile === "companion_close") {
      camera.position.set(0, 1.34, 4.62);
      camera.fov = cameraProfile === "companion_close" ? 22 : 28;
      if (controls) {
        controls.minDistance = 1.0;
        controls.maxDistance = 7.0;
        controls.minPolarAngle = Math.PI * 0.16;
        controls.maxPolarAngle = Math.PI * 0.86;
        controls.minAzimuthAngle = -Infinity;
        controls.maxAzimuthAngle = Infinity;
      }
      return;
    }

    camera.position.set(0, 1.12, 5.8);
    camera.fov = 34;
    if (controls) {
      controls.minDistance = 2.6;
      controls.maxDistance = 10.2;
      controls.minPolarAngle = Math.PI * 0.06;
      controls.maxPolarAngle = Math.PI * 0.94;
      controls.minAzimuthAngle = -Infinity;
      controls.maxAzimuthAngle = Infinity;
    }
  }

  /**
   * Apply camera sway animation when not in manual interaction mode.
   * Applies layered sine-wave offsets to position and rotation.
   */
  applyCameraSway(
    camera: THREE.PerspectiveCamera,
    baseCameraPosition: THREE.Vector3,
    cameraAnimation: CameraAnimationConfig,
    elapsedTime: number,
  ): void {
    const t = elapsedTime * cameraAnimation.speed;

    const swayX =
      Math.sin(t * 0.5) * 0.6 +
      Math.sin(t * 0.8 + 1.2) * 0.25 +
      Math.sin(t * 1.3 + 2.5) * 0.15;

    const bobY =
      Math.sin(t * 0.7 + 0.5) * 0.5 +
      Math.sin(t * 1.1 + 1.8) * 0.3 +
      Math.sin(t * 0.3) * 0.2;

    const swayZ = Math.sin(t * 0.4 + 1.0) * 0.4 + Math.sin(t * 0.9 + 2.0) * 0.3;

    camera.position.x =
      baseCameraPosition.x + swayX * cameraAnimation.swayAmplitude;
    camera.position.y =
      baseCameraPosition.y + bobY * cameraAnimation.bobAmplitude;
    camera.position.z =
      baseCameraPosition.z + swayZ * cameraAnimation.swayAmplitude * 0.5;

    const rotX =
      Math.sin(t * 0.6 + 0.3) * cameraAnimation.rotationAmplitude * 0.5;
    const rotY = Math.sin(t * 0.4) * cameraAnimation.rotationAmplitude;

    camera.rotation.x = rotX;
    camera.rotation.y = rotY;
  }

  /** Configure OrbitControls for the given interaction mode. */
  applyInteractionMode(
    controls: OrbitControls,
    interactionMode: InteractionMode,
  ): void {
    if (interactionMode === "orbitZoom") {
      controls.enablePan = false;
      controls.enableRotate = true;
      controls.enableZoom = true;
      controls.screenSpacePanning = false;
      controls.rotateSpeed = 1.15;
      controls.zoomSpeed = 0.85;
      return;
    }

    controls.enablePan = true;
    controls.enableRotate = true;
    controls.enableZoom = true;
    controls.screenSpacePanning = true;
    controls.rotateSpeed = 0.75;
    controls.zoomSpeed = 0.9;
  }

  /**
   * Detect whether the VRM is facing away from the camera using eye-bone
   * heuristics, and rotate it 180 degrees if needed.
   */
  ensureFacingCamera(vrm: VRM, camera: THREE.PerspectiveCamera): void {
    vrm.scene.updateMatrixWorld(true);

    const forward = new THREE.Vector3();
    const leftEye = vrm.humanoid?.getNormalizedBoneNode("leftEye");
    const rightEye = vrm.humanoid?.getNormalizedBoneNode("rightEye");

    if (leftEye && rightEye) {
      const left = new THREE.Vector3();
      const right = new THREE.Vector3();
      leftEye.getWorldPosition(left);
      rightEye.getWorldPosition(right);

      const eyeRight = right.sub(left);
      if (eyeRight.lengthSq() > 1e-6) {
        // Up x Right best matches this VRM rig orientation in our current scene setup.
        forward
          .copy(new THREE.Vector3(0, 1, 0))
          .cross(eyeRight)
          .normalize();
      }
    }

    if (forward.lengthSq() < 1e-6) {
      // Fallback when eye bones are unavailable.
      vrm.scene.getWorldDirection(forward);
    }

    const anchor =
      vrm.humanoid?.getNormalizedBoneNode("head") ??
      vrm.humanoid?.getNormalizedBoneNode("hips") ??
      vrm.scene;
    const anchorPos = new THREE.Vector3();
    anchor.getWorldPosition(anchorPos);
    const toCamera = new THREE.Vector3().subVectors(camera.position, anchorPos);

    forward.y = 0;
    toCamera.y = 0;
    if (forward.lengthSq() < 1e-6 || toCamera.lengthSq() < 1e-6) return;

    forward.normalize();
    toCamera.normalize();

    if (forward.dot(toCamera) < 0) {
      vrm.scene.rotateY(Math.PI);
      vrm.scene.updateMatrixWorld(true);
    }
  }
}
