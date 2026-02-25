import { type VRM, VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { resolveAppAssetUrl } from "../../asset-url";

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

const DEFAULT_CAMERA_ANIMATION: CameraAnimationConfig = {
  enabled: true,
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

  private mouthValue = 0;
  private mouthSmoothed = 0;
  private vrmName: string | null = null;
  private lookAtTarget = new THREE.Vector3(0, 1, 0);
  private readonly idleGlbUrl = resolveAppAssetUrl("animations/idle.glb");
  private forceFaceCameraFlip = true;

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
    this.renderer = renderer;

    const scene = new THREE.Scene();
    this.scene = scene;

    const camera = new THREE.PerspectiveCamera(25, 1, 0.01, 1000);
    camera.position.set(0, 1.1, 2.8);
    this.camera = camera;

    const keyLight = new THREE.DirectionalLight(0xffffff, 0.9);
    keyLight.position.set(1.5, 2.0, 1.5);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xffffff, 0.35);
    fillLight.position.set(-1.8, 1.0, 1.0);
    scene.add(fillLight);

    const ambient = new THREE.AmbientLight(0xffffff, 0.55);
    scene.add(ambient);

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
    glbPath: string,
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

    const clip = await this.loadEmoteClip(glbPath, vrm);
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

    const originalWarn = console.warn;
    type ConsoleArg =
      | string
      | number
      | boolean
      | bigint
      | symbol
      | null
      | undefined
      | object;
    console.warn = (...args: ConsoleArg[]) => {
      const msg = args.map((a) => String(a)).join(" ");
      if (msg.includes("VRMExpressionLoaderPlugin: An expression preset"))
        return;
      originalWarn(...args);
    };

    let gltf: Awaited<ReturnType<typeof loader.loadAsync>>;
    try {
      gltf = await loader.loadAsync(url);
    } finally {
      console.warn = originalWarn;
    }

    if (this.loadingAborted || !this.scene) return;

    const vrm = gltf.userData.vrm as VRM | undefined;
    if (!vrm) {
      throw new Error("Loaded asset is not a VRM");
    }

    if (vrm.humanoid) {
      vrm.humanoid.autoUpdateHumanBones = true;
    }

    VRMUtils.removeUnnecessaryVertices(vrm.scene);
    VRMUtils.combineSkeletons(vrm.scene);

    this.centerAndFrame(vrm);
    if (this.forceFaceCameraFlip) {
      vrm.scene.rotateY(Math.PI);
      vrm.scene.updateMatrixWorld(true);
    } else {
      this.ensureFacingCamera(vrm);
    }

    if (this.loadingAborted || !this.scene) return;

    vrm.scene.visible = false;
    this.scene.add(vrm.scene);
    this.vrm = vrm;
    this.vrmName = name ?? null;
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

    const delta = this.clock.getDelta();
    this.elapsedTime += delta;
    this.mixer?.update(delta);
    if (this.vrm) {
      this.applyMouthToVrm(this.vrm);
      this.updateBlink(delta);
      this.vrm.update(delta);
    }

    if (this.cameraAnimation.enabled && this.baseCameraPosition.length() > 0) {
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

    camera.lookAt(this.lookAtTarget);
    renderer.render(scene, camera);
    this.onUpdate?.();
  }

  private centerAndFrame(vrm: VRM): void {
    const camera = this.camera;
    if (!camera) return;

    const box = new THREE.Box3().setFromObject(vrm.scene);
    const center = box.getCenter(new THREE.Vector3());
    vrm.scene.position.sub(center);

    const box2 = new THREE.Box3().setFromObject(vrm.scene);
    const size2 = box2.getSize(new THREE.Vector3());

    const height = Math.max(0.001, size2.y);
    const width = Math.max(0.001, size2.x);
    const depth = Math.max(0.001, size2.z);

    // Normalize all models to a standard reference height (~1.0 unit) so
    // oversized realistic characters and tiny chibi characters appear the
    // same size in the chat viewport.
    const STANDARD_HEIGHT = 1.0;
    const scaleFactor = STANDARD_HEIGHT / height;
    vrm.scene.scale.multiplyScalar(scaleFactor);
    vrm.scene.updateMatrixWorld(true);

    // Re-center after scaling
    const box3 = new THREE.Box3().setFromObject(vrm.scene);
    const center3 = box3.getCenter(new THREE.Vector3());
    vrm.scene.position.sub(center3);

    const scaledHeight = STANDARD_HEIGHT;
    const scaledWidth = width * scaleFactor;
    const scaledDepth = depth * scaleFactor;

    // Frame on upper body: look at shoulder height, zoom in to crop below waist.
    // Offset camera left so the model renders on the right side of the canvas.
    const upperBodyHeight = Math.max(
      scaledWidth,
      scaledHeight * 0.55,
      scaledDepth,
    );
    const shoulderHeight = scaledHeight * 0.42;

    const fovRad = (camera.fov * Math.PI) / 180;
    const distance = (upperBodyHeight * 0.5) / Math.tan(fovRad * 0.5);

    this.lookAtTarget.set(0, shoulderHeight, 0);

    camera.near = Math.max(0.01, distance / 100);
    camera.far = Math.max(100, distance * 100);
    camera.updateProjectionMatrix();

    camera.position.set(0, shoulderHeight, distance);
    this.baseCameraPosition.copy(camera.position);
  }

  private async loadAndPlayIdle(vrm: VRM): Promise<void> {
    if (this.loadingAborted) return;

    const { retargetMixamoGltfToVrm } = await import(
      "./retargetMixamoGltfToVrm.ts"
    );

    if (this.loadingAborted || this.vrm !== vrm) return;

    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(this.idleGlbUrl);

    if (this.loadingAborted || this.vrm !== vrm) return;

    gltf.scene.updateMatrixWorld(true);
    vrm.scene.updateMatrixWorld(true);
    const clip = retargetMixamoGltfToVrm(
      { scene: gltf.scene, animations: gltf.animations },
      vrm,
    );

    if (this.loadingAborted || this.vrm !== vrm) return;

    const mixer = new THREE.AnimationMixer(vrm.scene);
    this.mixer = mixer;

    const action = mixer.clipAction(clip);
    action.reset();
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.fadeIn(0.25);
    action.play();
    this.idleAction = action;
  }

  private async loadEmoteClip(
    glbPath: string,
    vrm: VRM,
  ): Promise<THREE.AnimationClip | null> {
    // Return from cache if already loaded for this VRM.
    const cached = this.emoteClipCache.get(glbPath);
    if (cached) return cached;

    try {
      const { retargetMixamoGltfToVrm } = await import(
        "./retargetMixamoGltfToVrm"
      );
      if (this.vrm !== vrm) return null;

      const loader = new GLTFLoader();
      const gltf = await loader.loadAsync(glbPath);
      if (this.vrm !== vrm) return null;

      gltf.scene.updateMatrixWorld(true);
      vrm.scene.updateMatrixWorld(true);
      const clip = retargetMixamoGltfToVrm(
        { scene: gltf.scene, animations: gltf.animations },
        vrm,
      );

      this.emoteClipCache.set(glbPath, clip);
      return clip;
    } catch (err) {
      console.error(`[VrmEngine] Failed to load emote: ${glbPath}`, err);
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

    const probe = vrm.humanoid?.getNormalizedBoneNode("hips") ?? vrm.scene;
    vrm.scene.updateMatrixWorld(true);

    const forward = new THREE.Vector3();
    probe.getWorldDirection(forward);

    const vrmPos = new THREE.Vector3();
    vrm.scene.getWorldPosition(vrmPos);

    const toCamera = new THREE.Vector3().subVectors(camera.position, vrmPos);

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
