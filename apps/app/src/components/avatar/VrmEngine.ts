import { type VRM, VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { resolveAppAssetUrl } from "../../asset-url";
import { MIXAMO_IDLE_CANDIDATE_URLS } from "./mixamoAnimationCatalog";

export type VrmEngineState = {
  vrmLoaded: boolean;
  vrmName: string | null;
  idlePlaying: boolean;
  idleTime: number;
  idleTracks: number;
};

type UpdateCallback = () => void;

export type CameraAnimationConfig = {
  enabled: boolean;
  swayAmplitude: number;
  bobAmplitude: number;
  rotationAmplitude: number;
  speed: number;
};

export type CameraProfile = "chat" | "companion";
export type InteractionMode = "free" | "orbitZoom";

const DEFAULT_CAMERA_ANIMATION: CameraAnimationConfig = {
  enabled: false,
  swayAmplitude: 0.06,
  bobAmplitude: 0.03,
  rotationAmplitude: 0.01,
  speed: 0.8,
};

/** Blink animation phase */
type BlinkPhase = "idle" | "closing" | "closed" | "opening";

export class VrmEngine {
  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private clock = new THREE.Clock();
  private vrm: VRM | null = null;
  private mixer: THREE.AnimationMixer | null = null;
  private idleAction: THREE.AnimationAction | null = null;
  private animationFrameId: number | null = null;
  private onUpdate: UpdateCallback | null = null;
  private initialized = false;
  private loadingAborted = false;
  private vrmLoadRequestId = 0;

  private mouthValue = 0;
  private mouthSmoothed = 0;
  private vrmName: string | null = null;
  private lookAtTarget = new THREE.Vector3(0, 0.5, 0);
  private readonly idleGlbUrl = resolveAppAssetUrl("animations/idle.glb");
  private readonly idleBreathingFbxUrl = resolveAppAssetUrl(
    "animations/BreathingIdle.fbx",
  );
  private readonly idleFallbackFbxUrl = resolveAppAssetUrl(
    "animations/Idle.fbx",
  );
  private forceFaceCameraFlip = false;

  private cameraAnimation: CameraAnimationConfig = {
    ...DEFAULT_CAMERA_ANIMATION,
  };
  private baseCameraPosition = new THREE.Vector3();
  private elapsedTime = 0;

  // ── Speaking-driven mouth animation ──────────────────────────────
  private speaking = false;
  private speakingStartTime = 0;

  // ── Eye blink animation ──────────────────────────────────────────
  private blinkPhase: BlinkPhase = "idle";
  private blinkTimer = 0;
  private blinkPhaseTimer = 0;
  private blinkValue = 0;
  private nextBlinkDelay = 2 + Math.random() * 3;

  /** Duration (seconds) for eyelids to close */
  private static readonly BLINK_CLOSE_DURATION = 0.06;
  /** Duration (seconds) eyelids stay fully closed */
  private static readonly BLINK_HOLD_DURATION = 0.04;
  /** Duration (seconds) for eyelids to re-open */
  private static readonly BLINK_OPEN_DURATION = 0.12;
  /** Minimum seconds between blinks */
  private static readonly BLINK_MIN_INTERVAL = 1.8;
  /** Maximum seconds between blinks */
  private static readonly BLINK_MAX_INTERVAL = 5.5;
  /** Probability of a quick double-blink */
  private static readonly DOUBLE_BLINK_CHANCE = 0.15;

  // ── Emote playback state ────────────────────────────────────────────────
  private emoteAction: THREE.AnimationAction | null = null;
  private emoteTimeout: ReturnType<typeof setTimeout> | null = null;
  private emoteClipCache = new Map<string, THREE.AnimationClip>();
  private emoteRequestId = 0;
  private footShadow: THREE.Mesh | null = null;
  private controls: OrbitControls | null = null;
  private interactionEnabled = false;
  private interactionMode: InteractionMode = "free";
  private cameraProfile: CameraProfile = "chat";

  private handleControlStart = (): void => {
    if (!this.interactionEnabled) return;
  };

  private handleControlEnd = (): void => {
    if (!this.interactionEnabled) return;
    if (this.camera) {
      this.baseCameraPosition.copy(this.camera.position);
    }
    if (this.controls) {
      this.lookAtTarget.copy(this.controls.target);
    }
  };

  setup(canvas: HTMLCanvasElement, onUpdate: UpdateCallback): void {
    if (this.initialized && this.renderer?.domElement === canvas) {
      this.onUpdate = onUpdate;
      return;
    }

    if (this.initialized) {
      this.dispose();
    }

    this.onUpdate = onUpdate;
    this.loadingAborted = false;

    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
    });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setClearColor(0x000000, 0);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer = renderer;

    const scene = new THREE.Scene();
    this.scene = scene;

    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
    camera.position.set(0, 1.2, 5.0);
    this.camera = camera;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = true;
    controls.enableRotate = true;
    controls.enableZoom = true;
    controls.enableDamping = false;
    controls.screenSpacePanning = true;
    controls.rotateSpeed = 0.75;
    controls.zoomSpeed = 0.9;
    controls.target.copy(this.lookAtTarget);
    controls.addEventListener("start", this.handleControlStart);
    controls.addEventListener("end", this.handleControlEnd);
    this.applyInteractionMode(controls);
    controls.update();
    this.controls = controls;
    this.setInteractionEnabled(this.interactionEnabled);

    // Match Girlfie chat lighting setup.
    const ambient = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambient);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
    keyLight.position.set(1, 1, 1).normalize();
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.setScalar(1024);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xffffff, 0.4);
    fillLight.position.set(-1, 0.5, -1).normalize();
    scene.add(fillLight);

    this.createFootShadow();

    this.resize(canvas.clientWidth, canvas.clientHeight);
    this.initialized = true;
    this.loop();
  }

  isInitialized(): boolean {
    return this.initialized && this.renderer !== null;
  }

  dispose(): void {
    this.loadingAborted = true;
    this.initialized = false;

    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    if (this.scene && this.vrm) {
      this.scene.remove(this.vrm.scene);
      VRMUtils.deepDispose(this.vrm.scene);
    }
    if (this.scene && this.footShadow) {
      this.scene.remove(this.footShadow);
      this.footShadow.geometry.dispose();
      const material = this.footShadow.material;
      if (Array.isArray(material)) {
        for (const mat of material) {
          const meshMat = mat as THREE.MeshBasicMaterial;
          meshMat.map?.dispose();
          meshMat.dispose();
        }
      } else {
        const meshMat = material as THREE.MeshBasicMaterial;
        meshMat.map?.dispose();
        meshMat.dispose();
      }
      this.footShadow = null;
    }
    if (this.controls) {
      this.controls.removeEventListener("start", this.handleControlStart);
      this.controls.removeEventListener("end", this.handleControlEnd);
      this.controls.dispose();
      this.controls = null;
    }
    this.vrm = null;
    this.vrmName = null;
    this.mixer = null;
    this.idleAction = null;
    if (this.emoteTimeout !== null) {
      clearTimeout(this.emoteTimeout);
      this.emoteTimeout = null;
    }
    this.emoteAction = null;
    this.emoteClipCache.clear();
    this.renderer?.dispose();
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.onUpdate = null;
  }

  setInteractionEnabled(enabled: boolean): void {
    this.interactionEnabled = enabled;
    if (this.controls) {
      this.controls.enabled = enabled;
    }
  }

  setInteractionMode(mode: InteractionMode): void {
    this.interactionMode = mode;
    if (this.controls) {
      this.applyInteractionMode(this.controls);
      this.controls.update();
    }
  }

  setCameraProfile(profile: CameraProfile): void {
    this.cameraProfile = profile;
    if (profile === "companion") {
      this.cameraAnimation = {
        ...this.cameraAnimation,
        enabled: false,
      };
    }

    if (this.vrm) {
      this.centerAndFrame(this.vrm);
    } else if (this.camera && this.controls) {
      this.applyCameraProfileToCamera(this.camera, this.controls);
    }
  }

  resize(width: number, height: number): void {
    if (!this.renderer || !this.camera) return;
    if (width <= 0 || height <= 0) return;
    const aspect = width / height;
    if (!Number.isFinite(aspect) || aspect <= 0) return;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  getState(): VrmEngineState {
    const idlePlaying = this.idleAction?.isRunning() ?? false;
    return {
      vrmLoaded: this.vrm !== null,
      vrmName: this.vrmName,
      idlePlaying,
      idleTime: this.idleAction?.time ?? 0,
      idleTracks: this.idleAction?.getClip()?.tracks.length ?? 0,
    };
  }

  setMouthOpen(value: number): void {
    this.mouthValue = Math.max(0, Math.min(1, value));
  }

  /**
   * Drive mouth animation from speaking state.
   * When `speaking` is true the engine generates natural jaw movement
   * internally (layered sine waves), bypassing the manual `mouthValue`.
   */
  setSpeaking(speaking: boolean): void {
    if (speaking && !this.speaking) {
      this.speakingStartTime = this.elapsedTime;
    }
    this.speaking = speaking;
  }

  setCameraAnimation(config: Partial<CameraAnimationConfig>): void {
    this.cameraAnimation = { ...this.cameraAnimation, ...config };
  }

  setForceFaceCameraFlip(enabled: boolean): void {
    this.forceFaceCameraFlip = enabled;
  }

  /**
   * Play an emote animation. Crossfades from idle into the emote, and for
   * non-looping emotes automatically fades back to idle after `duration`
   * seconds. For looping emotes, call {@link stopEmote} to return to idle.
   */
  async playEmote(
    path: string,
    duration: number,
    loop: boolean,
  ): Promise<void> {
    const vrm = this.vrm;
    const mixer = this.mixer;
    if (!vrm || !mixer) return;

    // Stop any currently-playing emote first.
    this.stopEmote();

    // Track this request so stale async loads are discarded.
    this.emoteRequestId++;
    const requestId = this.emoteRequestId;

    const clip = await this.loadEmoteClip(path, vrm);
    if (!clip || this.vrm !== vrm || this.mixer !== mixer) return;
    if (this.emoteRequestId !== requestId) return; // superseded by newer call

    const action = mixer.clipAction(clip);
    action.reset();
    action.setLoop(
      loop ? THREE.LoopRepeat : THREE.LoopOnce,
      loop ? Infinity : 1,
    );
    action.clampWhenFinished = !loop;

    // Crossfade: idle out → emote in
    const fadeDuration = 0.3;
    if (this.idleAction) {
      this.idleAction.fadeOut(fadeDuration);
    }
    action.fadeIn(fadeDuration);
    action.play();
    this.emoteAction = action;

    if (!loop) {
      // After the emote finishes, fade back to idle.
      const safeDuration =
        Number.isFinite(duration) && duration > 0 ? duration : 3;
      const returnDelay = Math.max(0.5, safeDuration) * 1000;
      this.emoteTimeout = setTimeout(() => {
        if (this.emoteRequestId === requestId) {
          this.stopEmote();
        }
      }, returnDelay);
    }
  }

  /** Stop the current emote and crossfade back to idle. */
  stopEmote(): void {
    if (this.emoteTimeout !== null) {
      clearTimeout(this.emoteTimeout);
      this.emoteTimeout = null;
    }

    const fadeDuration = 0.3;
    if (this.emoteAction) {
      this.emoteAction.fadeOut(fadeDuration);
      this.emoteAction = null;
    }
    if (this.idleAction) {
      this.idleAction.reset();
      this.idleAction.fadeIn(fadeDuration);
      this.idleAction.play();
    }
  }

  async loadVrmFromUrl(url: string, name?: string): Promise<void> {
    if (!this.scene) throw new Error("VrmEngine not initialized");
    if (!this.camera) throw new Error("VrmEngine not initialized");
    if (this.loadingAborted) return;
    const requestId = ++this.vrmLoadRequestId;

    if (this.vrm) {
      this.scene.remove(this.vrm.scene);
      VRMUtils.deepDispose(this.vrm.scene);
      this.vrm = null;
      this.vrmName = null;
      this.mixer = null;
      this.idleAction = null;
      this.stopEmote();
      this.emoteClipCache.clear();
    }

    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));

    // Known VRM loader warnings about expression presets don't affect
    // functionality — load without suppressing console.warn globally.
    const gltf = await loader.loadAsync(url);

    if (
      this.loadingAborted ||
      !this.scene ||
      requestId !== this.vrmLoadRequestId
    ) {
      const staleVrm = gltf.userData.vrm as VRM | undefined;
      if (staleVrm) {
        VRMUtils.deepDispose(staleVrm.scene);
      }
      return;
    }

    const vrm = gltf.userData.vrm as VRM | undefined;
    if (!vrm) {
      throw new Error("Loaded asset is not a VRM");
    }

    VRMUtils.removeUnnecessaryVertices(vrm.scene);

    // Align with Girlfie behavior: keep original skeleton layout for
    // spring-bone-heavy hair/outfit rigs to reduce unnatural deformation.

    this.centerAndFrame(vrm);

    try {
      VRMUtils.rotateVRM0(vrm);
    } catch {
      // rotateVRM0 is optional across three-vrm versions.
    }

    const isOfficialMilady = /\/vrms\/milady-official-\d+\.vrm(?:\?|$)/i.test(
      url,
    );
    if (isOfficialMilady) {
      // Official avatars need one extra 180-degree turn versus current runtime alignment.
      vrm.scene.rotateY(Math.PI * 2);
      vrm.scene.updateMatrixWorld(true);
    } else if (this.forceFaceCameraFlip) {
      // Skip orientation heuristics for models where the eye-bone cross product
      // gives wrong results (e.g. Shaw). rotateVRM0 already correctly oriented
      // these models — no additional rotation needed.
      vrm.scene.updateMatrixWorld(true);
    } else {
      this.ensureFacingCamera(vrm);
    }

    if (
      this.loadingAborted ||
      !this.scene ||
      requestId !== this.vrmLoadRequestId
    ) {
      VRMUtils.deepDispose(vrm.scene);
      return;
    }

    vrm.scene.visible = false;
    vrm.scene.traverse((obj) => {
      obj.frustumCulled = false;
    });
    this.scene.add(vrm.scene);
    this.vrm = vrm;
    this.vrmName = name ?? null;
    vrm.springBoneManager?.reset?.();
    this.resetBlink();

    try {
      await this.loadAndPlayIdle(vrm);
      if (!this.loadingAborted && this.vrm === vrm) {
        vrm.scene.visible = true;
      }
    } catch {
      if (!this.loadingAborted && this.vrm === vrm) {
        vrm.scene.visible = true;
      }
    }
  }

  private loop(): void {
    this.animationFrameId = requestAnimationFrame(() => this.loop());
    const renderer = this.renderer;
    const scene = this.scene;
    const camera = this.camera;
    if (!renderer || !scene || !camera) return;

    const rawDelta = this.clock.getDelta();
    const stableDelta = Math.min(rawDelta, 1 / 30);
    this.elapsedTime += rawDelta;
    this.mixer?.update(rawDelta);
    if (this.vrm) {
      this.applyMouthToVrm(this.vrm);
      this.updateBlink(rawDelta);
      // Keep spring bones stable after tab/background pauses.
      this.vrm.update(stableDelta);
      this.updateFootShadow();
    }

    // When interaction is enabled, keep OrbitControls in full control so
    // drag-rotate remains truly 360 and does not get partially overridden.
    const manualCameraActive = this.interactionEnabled;

    if (
      !manualCameraActive &&
      this.cameraAnimation.enabled &&
      this.baseCameraPosition.length() > 0
    ) {
      const t = this.elapsedTime * this.cameraAnimation.speed;

      const swayX =
        Math.sin(t * 0.5) * 0.6 +
        Math.sin(t * 0.8 + 1.2) * 0.25 +
        Math.sin(t * 1.3 + 2.5) * 0.15;

      const bobY =
        Math.sin(t * 0.7 + 0.5) * 0.5 +
        Math.sin(t * 1.1 + 1.8) * 0.3 +
        Math.sin(t * 0.3) * 0.2;

      const swayZ =
        Math.sin(t * 0.4 + 1.0) * 0.4 + Math.sin(t * 0.9 + 2.0) * 0.3;

      camera.position.x =
        this.baseCameraPosition.x + swayX * this.cameraAnimation.swayAmplitude;
      camera.position.y =
        this.baseCameraPosition.y + bobY * this.cameraAnimation.bobAmplitude;
      camera.position.z =
        this.baseCameraPosition.z +
        swayZ * this.cameraAnimation.swayAmplitude * 0.5;

      const rotX =
        Math.sin(t * 0.6 + 0.3) * this.cameraAnimation.rotationAmplitude * 0.5;
      const rotY = Math.sin(t * 0.4) * this.cameraAnimation.rotationAmplitude;

      camera.rotation.x = rotX;
      camera.rotation.y = rotY;
    }

    if (this.controls) {
      if (manualCameraActive) {
        this.controls.update();
        this.lookAtTarget.copy(this.controls.target);
      } else {
        this.controls.target.copy(this.lookAtTarget);
      }
    }

    if (!manualCameraActive) {
      camera.lookAt(this.lookAtTarget);
    }

    renderer.render(scene, camera);
    this.onUpdate?.();
  }

  private centerAndFrame(vrm: VRM): void {
    const camera = this.camera;
    const controls = this.controls;
    if (!camera) return;

    if (this.cameraProfile === "companion") {
      // Companion stage profile: preserve hero presence while keeping full-body framing.
      vrm.scene.scale.set(1.78, 1.78, 1.78);
      vrm.scene.position.set(0, -0.84, 0);
      this.lookAtTarget.set(0, 0.64, 0);
    } else {
      // Girlfie framing profile: fixed full-body scale/offset and camera.
      vrm.scene.scale.set(1.45, 1.45, 1.45);
      vrm.scene.position.set(0, -0.8, 0);
      this.lookAtTarget.set(0, 0.5, 0);
    }
    vrm.scene.updateMatrixWorld(true);
    camera.near = 0.1;
    camera.far = 20.0;
    this.applyCameraProfileToCamera(camera, controls);
    this.adjustCompanionCameraForAvatarBounds(vrm, camera, controls);
    camera.updateProjectionMatrix();
    this.baseCameraPosition.copy(camera.position);

    if (controls) {
      controls.target.copy(this.lookAtTarget);
      this.applyInteractionMode(controls);
      controls.update();
    }
  }

  private adjustCompanionCameraForAvatarBounds(
    vrm: VRM,
    camera: THREE.PerspectiveCamera,
    controls: OrbitControls | null,
  ): void {
    if (this.cameraProfile !== "companion") return;

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

    // Keep full-body framing for tall avatars by adapting camera distance.
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
    const distance = Math.min(fitDistance, 7.4);

    const lookAtLift = Math.min(size.y * 0.03, 0.12);
    const cameraLift = Math.min(size.y * 0.08, 0.26);
    this.lookAtTarget.set(center.x, center.y + lookAtLift, center.z);
    camera.position.set(
      center.x,
      this.lookAtTarget.y + cameraLift,
      center.z + distance,
    );

    if (controls) {
      controls.minDistance = Math.max(2.8, distance * 0.72);
      controls.maxDistance = Math.max(7.2, distance * 1.75);
    }
  }

  private createFootShadow(): void {
    if (!this.scene) return;

    if (this.footShadow) {
      this.scene.remove(this.footShadow);
      this.footShadow.geometry.dispose();
      const material = this.footShadow.material as THREE.MeshBasicMaterial;
      material.map?.dispose();
      material.dispose();
      this.footShadow = null;
    }

    const shadowCanvas = document.createElement("canvas");
    shadowCanvas.width = 128;
    shadowCanvas.height = 128;

    const context = shadowCanvas.getContext("2d");
    if (!context) return;

    const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, "rgba(0, 0, 0, 0.4)");
    gradient.addColorStop(0.5, "rgba(0, 0, 0, 0.2)");
    gradient.addColorStop(1, "rgba(0, 0, 0, 0)");

    context.fillStyle = gradient;
    context.fillRect(0, 0, 128, 128);

    const shadowTexture = new THREE.CanvasTexture(shadowCanvas);
    const shadowGeometry = new THREE.PlaneGeometry(2.2, 2.2);
    const shadowMaterial = new THREE.MeshBasicMaterial({
      map: shadowTexture,
      transparent: true,
      alphaTest: 0.001,
      depthWrite: false,
    });

    const shadow = new THREE.Mesh(shadowGeometry, shadowMaterial);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set(0, -0.82, 0);
    this.scene.add(shadow);
    this.footShadow = shadow;
  }

  private updateFootShadow(): void {
    if (!this.footShadow || !this.vrm) return;
    this.footShadow.position.x = this.vrm.scene.position.x || 0;
    this.footShadow.position.y = -0.82;
    this.footShadow.position.z = this.vrm.scene.position.z || 0;
  }

  private async loadAndPlayIdle(vrm: VRM): Promise<void> {
    if (this.loadingAborted) return;

    let clip: THREE.AnimationClip | null = null;

    try {
      const { retargetMixamoGltfToVrm } = await import(
        "./retargetMixamoGltfToVrm"
      );
      if (this.loadingAborted || this.vrm !== vrm) return;

      const gltfLoader = new GLTFLoader();
      const gltf = await gltfLoader.loadAsync(this.idleGlbUrl);
      if (this.loadingAborted || this.vrm !== vrm) return;

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
      const { retargetMixamoFbxToVrm } = await import(
        "./retargetMixamoFbxToVrm"
      );
      if (this.loadingAborted || this.vrm !== vrm) return;

      const fbxLoader = new FBXLoader();
      const fallbackUrls = Array.from(
        new Set([
          this.idleBreathingFbxUrl,
          this.idleFallbackFbxUrl,
          ...MIXAMO_IDLE_CANDIDATE_URLS,
        ]),
      );
      for (const url of fallbackUrls) {
        try {
          const fbx = await fbxLoader.loadAsync(url);
          if (this.loadingAborted || this.vrm !== vrm) return;

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
    if (this.loadingAborted || this.vrm !== vrm) return;

    const mixer = new THREE.AnimationMixer(vrm.scene);
    this.mixer = mixer;

    const action = mixer.clipAction(clip);
    action.reset();
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.fadeIn(0.25);
    action.play();
    action.timeScale = 1.0;
    this.idleAction = action;
  }

  private async loadEmoteClip(
    path: string,
    vrm: VRM,
  ): Promise<THREE.AnimationClip | null> {
    // Return from cache if already loaded for this VRM.
    const cached = this.emoteClipCache.get(path);
    if (cached) return cached;

    const isFbx = path.toLowerCase().endsWith(".fbx");

    try {
      if (isFbx) {
        const { retargetMixamoFbxToVrm } = await import(
          "./retargetMixamoFbxToVrm"
        );
        if (this.vrm !== vrm) return null;

        const loader = new FBXLoader();
        const fbx = await loader.loadAsync(path);
        if (this.vrm !== vrm) return null;

        fbx.updateMatrixWorld(true);
        vrm.scene.updateMatrixWorld(true);
        const sourceClip =
          THREE.AnimationClip.findByName(fbx.animations, "mixamo.com") ??
          fbx.animations[0];
        if (!sourceClip) return null;
        const clip = retargetMixamoFbxToVrm(fbx, sourceClip, vrm);
        this.emoteClipCache.set(path, clip);
        return clip;
      } else {
        const { retargetMixamoGltfToVrm } = await import(
          "./retargetMixamoGltfToVrm"
        );
        if (this.vrm !== vrm) return null;

        const loader = new GLTFLoader();
        const gltf = await loader.loadAsync(path);
        if (this.vrm !== vrm) return null;

        gltf.scene.updateMatrixWorld(true);
        vrm.scene.updateMatrixWorld(true);
        const clip = retargetMixamoGltfToVrm(
          { scene: gltf.scene, animations: gltf.animations },
          vrm,
        );
        this.emoteClipCache.set(path, clip);
        return clip;
      }
    } catch (err) {
      console.error(`[VrmEngine] Failed to load emote: ${path}`, err);
      return null;
    }
  }

  /**
   * Apply mouth expression to the VRM.
   *
   * When the engine is in "speaking" mode it generates layered sine-wave
   * jaw movement internally. Otherwise it falls back to the externally
   * supplied `mouthValue` (from `setMouthOpen()`).
   */
  private applyMouthToVrm(vrm: VRM): void {
    const manager = vrm.expressionManager;
    if (!manager) return;

    let target: number;

    if (this.speaking) {
      // Internal speech animation — layered sine waves (~6-8 Hz)
      const elapsed = this.elapsedTime - this.speakingStartTime;
      const base = Math.sin(elapsed * 12) * 0.3 + 0.4;
      const detail = Math.sin(elapsed * 18.7) * 0.15;
      const slow = Math.sin(elapsed * 4.2) * 0.1;
      target = Math.max(0, Math.min(1, base + detail + slow));
    } else {
      target = this.mouthValue;
    }

    const next = Math.max(0, Math.min(1, target));
    // Smooth close faster than open for a more natural feel
    const alpha = next > this.mouthSmoothed ? 0.3 : 0.2;
    this.mouthSmoothed = this.mouthSmoothed * (1 - alpha) + next * alpha;
    manager.setValue("aa", this.mouthSmoothed);
  }

  // ── Eye blink ──────────────────────────────────────────────────────

  /**
   * Advance the blink state machine and apply the "blink" expression.
   *
   * State flow: idle → closing → closed → opening → idle
   * Random interval between blinks with occasional double-blinks.
   */
  private updateBlink(delta: number): void {
    const vrm = this.vrm;
    if (!vrm?.expressionManager) return;

    switch (this.blinkPhase) {
      case "idle":
        this.blinkTimer += delta;
        if (this.blinkTimer >= this.nextBlinkDelay) {
          this.blinkPhase = "closing";
          this.blinkPhaseTimer = 0;
        }
        break;

      case "closing": {
        this.blinkPhaseTimer += delta;
        const t = Math.min(
          1,
          this.blinkPhaseTimer / VrmEngine.BLINK_CLOSE_DURATION,
        );
        // Ease-in (accelerate) — eyelids speed up as they close
        this.blinkValue = t * t;
        if (t >= 1) {
          this.blinkPhase = "closed";
          this.blinkPhaseTimer = 0;
          this.blinkValue = 1;
        }
        break;
      }

      case "closed":
        this.blinkPhaseTimer += delta;
        if (this.blinkPhaseTimer >= VrmEngine.BLINK_HOLD_DURATION) {
          this.blinkPhase = "opening";
          this.blinkPhaseTimer = 0;
        }
        break;

      case "opening": {
        this.blinkPhaseTimer += delta;
        const t = Math.min(
          1,
          this.blinkPhaseTimer / VrmEngine.BLINK_OPEN_DURATION,
        );
        // Ease-out (decelerate) — eyelids slow down as they finish opening
        const eased = 1 - (1 - t) * (1 - t);
        this.blinkValue = 1 - eased;
        if (t >= 1) {
          this.blinkPhase = "idle";
          this.blinkPhaseTimer = 0;
          this.blinkValue = 0;
          this.blinkTimer = 0;
          this.scheduleNextBlink();
        }
        break;
      }
    }

    vrm.expressionManager.setValue("blink", this.blinkValue);
  }

  /** Pick the delay (seconds) until the next blink. */
  private scheduleNextBlink(): void {
    const range = VrmEngine.BLINK_MAX_INTERVAL - VrmEngine.BLINK_MIN_INTERVAL;
    this.nextBlinkDelay = VrmEngine.BLINK_MIN_INTERVAL + Math.random() * range;

    // Occasional quick double-blink
    if (Math.random() < VrmEngine.DOUBLE_BLINK_CHANCE) {
      this.nextBlinkDelay = 0.12 + Math.random() * 0.08;
    }
  }

  /** Reset blink state (called when a new VRM is loaded). */
  private resetBlink(): void {
    this.blinkPhase = "idle";
    this.blinkTimer = 0;
    this.blinkPhaseTimer = 0;
    this.blinkValue = 0;
    this.nextBlinkDelay = 1.5 + Math.random() * 2;
  }

  private ensureFacingCamera(vrm: VRM): void {
    const camera = this.camera;
    if (!camera) return;

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
        // Up × Right best matches this VRM rig orientation in our current scene setup.
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

  private applyInteractionMode(controls: OrbitControls): void {
    if (this.interactionMode === "orbitZoom") {
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

  private applyCameraProfileToCamera(
    camera: THREE.PerspectiveCamera,
    controls: OrbitControls | null,
  ): void {
    if (this.cameraProfile === "companion") {
      camera.position.set(0, 1.34, 4.62);
      camera.fov = 28;
      if (controls) {
        controls.minDistance = 2.5;
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
}
