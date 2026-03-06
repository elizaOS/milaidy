import { type VRM, VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { resolveAppAssetUrl } from "../../asset-url";
import {
  type AnimationLoaderContext,
  loadEmoteClip,
  loadIdleClip,
} from "./VrmAnimationLoader";
import { VrmBlinkController } from "./VrmBlinkController";
import {
  type CameraAnimationConfig,
  type CameraProfile,
  type InteractionMode,
  VrmCameraManager,
} from "./VrmCameraManager";
import { VrmFootShadow } from "./VrmFootShadow";

export type { CameraAnimationConfig, CameraProfile, InteractionMode };

export type VrmEngineState = {
  vrmLoaded: boolean;
  vrmName: string | null;
  idlePlaying: boolean;
  idleTime: number;
  idleTracks: number;
};

type UpdateCallback = () => void;

const DEFAULT_CAMERA_ANIMATION: CameraAnimationConfig = {
  enabled: false,
  swayAmplitude: 0.06,
  bobAmplitude: 0.03,
  rotationAmplitude: 0.01,
  speed: 0.8,
};

/**
 * Create the best available renderer for the current platform.
 * Tries WebGPU first (better performance on macOS WKWebView and modern CEF).
 * Falls back to WebGL if WebGPU is unavailable or fails to initialize.
 * THREE.WebGPURenderer is async-init and requires await renderer.init().
 */
async function createRenderer(
  canvas: HTMLCanvasElement,
): Promise<THREE.WebGLRenderer> {
  // Check WebGPU availability
  if (typeof navigator !== "undefined" && navigator.gpu) {
    try {
      const WebGPURenderer = (
        THREE as unknown as { WebGPURenderer?: typeof THREE.WebGLRenderer }
      ).WebGPURenderer;
      if (WebGPURenderer) {
        const r = new WebGPURenderer({ canvas, alpha: true, antialias: true });
        // WebGPURenderer requires async init
        if (
          typeof (r as unknown as { init?: () => Promise<void> }).init ===
          "function"
        ) {
          await (r as unknown as { init: () => Promise<void> }).init();
        }
        console.log("[VrmEngine] Using WebGPURenderer");
        return r as unknown as THREE.WebGLRenderer;
      }
    } catch (err) {
      console.warn(
        "[VrmEngine] WebGPURenderer failed, falling back to WebGL:",
        err,
      );
    }
  }
  const r = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  console.log("[VrmEngine] Using WebGLRenderer");
  return r;
}

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
  private forceFaceCameraFlip = false;
  private cameraAnimation: CameraAnimationConfig = {
    ...DEFAULT_CAMERA_ANIMATION,
  };
  private baseCameraPosition = new THREE.Vector3();
  private elapsedTime = 0;
  private speaking = false;
  private speakingStartTime = 0;
  private readonly blinkController = new VrmBlinkController();
  private readonly footShadow = new VrmFootShadow();
  private readonly cameraManager = new VrmCameraManager();
  private emoteAction: THREE.AnimationAction | null = null;
  private emoteTimeout: ReturnType<typeof setTimeout> | null = null;
  private emoteClipCache = new Map<string, THREE.AnimationClip>();
  private emoteRequestId = 0;
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
    if (this.initialized) this.dispose();
    this.onUpdate = onUpdate;
    this.loadingAborted = false;
    // Async renderer creation: tries WebGPU, falls back to WebGL.
    // setup() remains synchronous for callers; the loop starts after init resolves.
    void (async () => {
      const renderer = await createRenderer(canvas);
      // Guard: if dispose() was called while we were awaiting, abort.
      if (this.loadingAborted) {
        renderer.dispose();
        return;
      }
      renderer.setPixelRatio(window.devicePixelRatio);
      renderer.setClearColor(0x000000, 0);
      // WebGL-only properties — WebGPURenderer does not support these.
      // THREE.WebGPURenderer is not yet a subclass of WebGLRenderer in Three.js r160+.
      if (renderer instanceof THREE.WebGLRenderer) {
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.toneMapping = THREE.NoToneMapping;
        renderer.toneMappingExposure = 1.0;
        renderer.outputColorSpace = THREE.SRGBColorSpace;
      }
      this.renderer = renderer;
      const scene = new THREE.Scene();
      this.scene = scene;
      const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
      camera.position.set(0, 1.2, 5.0);
      this.camera = camera;
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = false;
      controls.target.copy(this.lookAtTarget);
      controls.addEventListener("start", this.handleControlStart);
      controls.addEventListener("end", this.handleControlEnd);
      this.cameraManager.applyInteractionMode(controls, this.interactionMode);
      controls.update();
      this.controls = controls;
      this.setInteractionEnabled(this.interactionEnabled);
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
      this.footShadow.create(scene);
      this.resize(canvas.clientWidth, canvas.clientHeight);
      this.initialized = true;
      this.loop();
    })();
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
    if (this.scene) {
      this.footShadow.dispose(this.scene);
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
      this.cameraManager.applyInteractionMode(this.controls, mode);
      this.controls.update();
    }
  }
  setCameraProfile(profile: CameraProfile): void {
    this.cameraProfile = profile;
    if (profile === "companion") {
      this.cameraAnimation = { ...this.cameraAnimation, enabled: false };
    }
    if (this.vrm && this.camera) {
      this.cameraManager.centerAndFrame(
        this.vrm,
        this.camera,
        this.controls,
        this.cameraProfile,
        this.lookAtTarget,
        this.baseCameraPosition,
        (c) => this.cameraManager.applyInteractionMode(c, this.interactionMode),
      );
    } else if (this.camera && this.controls) {
      this.cameraManager.applyCameraProfileToCamera(
        this.camera,
        this.controls,
        this.cameraProfile,
      );
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

  async playEmote(
    path: string,
    duration: number,
    loop: boolean,
  ): Promise<void> {
    const vrm = this.vrm;
    const mixer = this.mixer;
    if (!vrm || !mixer) return;
    this.stopEmote();
    this.emoteRequestId++;
    const requestId = this.emoteRequestId;
    const clip = await this.loadEmoteClipCached(path, vrm);
    if (!clip || this.vrm !== vrm || this.mixer !== mixer) return;
    if (this.emoteRequestId !== requestId) return;
    const action = mixer.clipAction(clip);
    action.reset();
    action.setLoop(
      loop ? THREE.LoopRepeat : THREE.LoopOnce,
      loop ? Infinity : 1,
    );
    action.clampWhenFinished = !loop;
    const fadeDuration = 0.3;
    if (this.idleAction) {
      this.idleAction.fadeOut(fadeDuration);
    }
    action.fadeIn(fadeDuration);
    action.play();
    this.emoteAction = action;
    if (!loop) {
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
    const gltf = await loader.loadAsync(url);
    if (
      this.loadingAborted ||
      !this.scene ||
      requestId !== this.vrmLoadRequestId
    ) {
      const staleVrm = gltf.userData.vrm as VRM | undefined;
      if (staleVrm) VRMUtils.deepDispose(staleVrm.scene);
      return;
    }
    const vrm = gltf.userData.vrm as VRM | undefined;
    if (!vrm) throw new Error("Loaded asset is not a VRM");
    VRMUtils.removeUnnecessaryVertices(vrm.scene);
    if (this.camera) {
      this.cameraManager.centerAndFrame(
        vrm,
        this.camera,
        this.controls,
        this.cameraProfile,
        this.lookAtTarget,
        this.baseCameraPosition,
        (c) => this.cameraManager.applyInteractionMode(c, this.interactionMode),
      );
    }
    try {
      VRMUtils.rotateVRM0(vrm);
    } catch {
      /* optional in some versions */
    }
    const isOfficialMilady = /\/vrms\/milady-official-\d+\.vrm(?:\?|$)/i.test(
      url,
    );
    if (isOfficialMilady) {
      vrm.scene.rotateY(Math.PI * 2);
      vrm.scene.updateMatrixWorld(true);
    } else if (this.forceFaceCameraFlip) {
      vrm.scene.updateMatrixWorld(true);
    } else {
      this.cameraManager.ensureFacingCamera(vrm, this.camera);
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
    this.blinkController.reset();

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
  private get animationLoaderContext(): AnimationLoaderContext {
    return {
      isAborted: () => this.loadingAborted,
      isCurrentVrm: (vrm: VRM) => this.vrm === vrm,
    };
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
      const blinkValue = this.blinkController.update(rawDelta);
      this.vrm.expressionManager?.setValue("blink", blinkValue);
      this.vrm.update(stableDelta);
      this.footShadow.update(this.vrm);
    }
    const manualCameraActive = this.interactionEnabled;
    if (
      !manualCameraActive &&
      this.cameraAnimation.enabled &&
      this.baseCameraPosition.length() > 0
    ) {
      this.cameraManager.applyCameraSway(
        camera,
        this.baseCameraPosition,
        this.cameraAnimation,
        this.elapsedTime,
      );
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
  private async loadAndPlayIdle(vrm: VRM): Promise<void> {
    if (this.loadingAborted) return;
    const clip = await loadIdleClip(
      vrm,
      this.idleGlbUrl,
      this.animationLoaderContext,
    );
    if (!clip) return;
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
  private async loadEmoteClipCached(
    path: string,
    vrm: VRM,
  ): Promise<THREE.AnimationClip | null> {
    const cached = this.emoteClipCache.get(path);
    if (cached) return cached;
    const clip = await loadEmoteClip(path, vrm, this.animationLoaderContext);
    if (clip) {
      this.emoteClipCache.set(path, clip);
    }
    return clip;
  }
  private applyMouthToVrm(vrm: VRM): void {
    const manager = vrm.expressionManager;
    if (!manager) return;
    let target: number;
    if (this.speaking) {
      const elapsed = this.elapsedTime - this.speakingStartTime;
      const base = Math.sin(elapsed * 12) * 0.3 + 0.4;
      const detail = Math.sin(elapsed * 18.7) * 0.15;
      const slow = Math.sin(elapsed * 4.2) * 0.1;
      target = Math.max(0, Math.min(1, base + detail + slow));
    } else {
      target = this.mouthValue;
    }
    const next = Math.max(0, Math.min(1, target));
    const alpha = next > this.mouthSmoothed ? 0.3 : 0.2;
    this.mouthSmoothed = this.mouthSmoothed * (1 - alpha) + next * alpha;
    manager.setValue("aa", this.mouthSmoothed);
  }
}
