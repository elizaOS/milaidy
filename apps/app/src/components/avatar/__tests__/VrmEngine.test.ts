/**
 * Smoke-level unit tests for VrmEngine.
 *
 * THREE.js and @pixiv/three-vrm cannot run in a headless Node/Bun environment,
 * so every external dependency is mocked. The tests verify the engine's public
 * API contracts — lifecycle, state transitions, emote dispatch, and animation
 * blending — without requiring a real WebGL context.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — must be declared before VrmEngine import
// ---------------------------------------------------------------------------

/** Minimal mock AnimationAction returned by AnimationMixer.clipAction */
function createMockAction() {
  return {
    reset: vi.fn().mockReturnThis(),
    play: vi.fn().mockReturnThis(),
    stop: vi.fn().mockReturnThis(),
    fadeIn: vi.fn().mockReturnThis(),
    fadeOut: vi.fn().mockReturnThis(),
    setLoop: vi.fn().mockReturnThis(),
    isRunning: vi.fn(() => true),
    clampWhenFinished: false,
    time: 0,
    getClip: vi.fn(() => ({ tracks: [{ name: "t1" }, { name: "t2" }] })),
  };
}

const mockAction = createMockAction();

const mockMixerInstance = {
  update: vi.fn(),
  clipAction: vi.fn(() => mockAction),
};

const mockRendererInstance = {
  setPixelRatio: vi.fn(),
  setClearColor: vi.fn(),
  setSize: vi.fn(),
  render: vi.fn(),
  dispose: vi.fn(),
  domElement: {} as HTMLCanvasElement,
  shadowMap: { enabled: false, type: 0 },
  toneMapping: 0,
  toneMappingExposure: 1.0,
  outputColorSpace: "",
};

const mockCameraInstance = {
  position: {
    set: vi.fn(),
    x: 0,
    y: 1.1,
    z: 2.8,
    copy: vi.fn(),
    clone: vi.fn(() => ({ x: 0, y: 1.1, z: 2.8 })),
  },
  rotation: { x: 0, y: 0 },
  aspect: 1,
  fov: 25,
  near: 0.01,
  far: 1000,
  lookAt: vi.fn(),
  updateProjectionMatrix: vi.fn(),
};

const mockSceneInstance = {
  add: vi.fn(),
  remove: vi.fn(),
};

vi.mock("three", () => {
  const LoopRepeat = 2201;
  const LoopOnce = 2200;

  // Use class syntax for everything that gets `new`-ed
  class MockWebGLRenderer {
    setPixelRatio = mockRendererInstance.setPixelRatio;
    setClearColor = mockRendererInstance.setClearColor;
    setSize = mockRendererInstance.setSize;
    render = mockRendererInstance.render;
    dispose = mockRendererInstance.dispose;
    domElement = mockRendererInstance.domElement;
    shadowMap = mockRendererInstance.shadowMap;
    toneMapping = mockRendererInstance.toneMapping;
    toneMappingExposure = mockRendererInstance.toneMappingExposure;
    outputColorSpace = mockRendererInstance.outputColorSpace;
  }

  class MockScene {
    add = mockSceneInstance.add;
    remove = mockSceneInstance.remove;
  }

  class MockPerspectiveCamera {
    position = mockCameraInstance.position;
    rotation = mockCameraInstance.rotation;
    aspect = mockCameraInstance.aspect;
    fov = mockCameraInstance.fov;
    near = mockCameraInstance.near;
    far = mockCameraInstance.far;
    lookAt = mockCameraInstance.lookAt;
    updateProjectionMatrix = mockCameraInstance.updateProjectionMatrix;
  }

  class MockClock {
    getDelta = vi.fn(() => 0.016);
  }

  class MockAnimationMixer {
    update = mockMixerInstance.update;
    clipAction = mockMixerInstance.clipAction;
  }

  class MockDirectionalLight {
    position = {
      set: vi.fn().mockReturnValue({ normalize: vi.fn() }),
    };
    castShadow = false;
    shadow = {
      mapSize: { setScalar: vi.fn() },
      camera: { near: 0, far: 0, left: 0, right: 0, top: 0, bottom: 0 },
    };
  }

  class MockAmbientLight {}

  class MockVector3 {
    x = 0;
    y = 0;
    z = 0;
    set = vi.fn().mockReturnThis();
    copy = vi.fn().mockReturnThis();
    sub = vi.fn().mockReturnThis();
    subVectors = vi.fn().mockReturnThis();
    normalize = vi.fn().mockReturnThis();
    dot = vi.fn(() => 1);
    getWorldPosition = vi.fn().mockReturnThis();
    getWorldDirection = vi.fn().mockReturnThis();
    lengthSq = vi.fn(() => 1);
    length = vi.fn(() => 1);
    multiplyScalar = vi.fn().mockReturnThis();
  }

  class MockBox3 {
    setFromObject = vi.fn().mockReturnThis();
    getCenter = vi.fn(() => new MockVector3());
    getSize = vi.fn(() => {
      const v = new MockVector3();
      v.x = 0.4;
      v.y = 1.6;
      v.z = 0.3;
      return v;
    });
  }

  return {
    WebGLRenderer: MockWebGLRenderer,
    Scene: MockScene,
    PerspectiveCamera: MockPerspectiveCamera,
    Clock: MockClock,
    AnimationMixer: MockAnimationMixer,
    DirectionalLight: MockDirectionalLight,
    AmbientLight: MockAmbientLight,
    Vector3: MockVector3,
    Box3: MockBox3,
    LoopRepeat,
    LoopOnce,
    PCFSoftShadowMap: 2,
    NoToneMapping: 0,
    SRGBColorSpace: "srgb",
    Mesh: class MockMesh {
      geometry = { dispose: vi.fn() };
      material = { opacity: 1, map: { dispose: vi.fn() }, dispose: vi.fn() };
      position = { set: vi.fn(), y: 0 };
      rotation = { x: 0, y: 0, z: 0 };
      receiveShadow = false;
    },
    PlaneGeometry: class MockPlaneGeometry {},
    MeshBasicMaterial: class MockMeshBasicMaterial {
      opacity = 1;
      dispose = vi.fn();
    },
    CanvasTexture: class MockCanvasTexture {
      dispose = vi.fn();
    },
    AnimationClip: Object.assign(
      class MockAnimationClip {
        tracks: unknown[] = [];
        name = "";
      },
      { findByName: vi.fn(() => null) },
    ),
    MathUtils: { degToRad: vi.fn((deg: number) => (deg * Math.PI) / 180) },
  };
});

vi.mock("@pixiv/three-vrm", () => ({
  VRMLoaderPlugin: class MockVRMLoaderPlugin {},
  VRMUtils: {
    deepDispose: vi.fn(),
    removeUnnecessaryVertices: vi.fn(),
    combineSkeletons: vi.fn(),
  },
}));

vi.mock("three/addons/loaders/GLTFLoader.js", () => ({
  GLTFLoader: class MockGLTFLoader {
    register = vi.fn();
    loadAsync = vi.fn();
  },
}));

vi.mock("three/examples/jsm/controls/OrbitControls.js", () => ({
  OrbitControls: class MockOrbitControls {
    enablePan = true;
    enableRotate = true;
    enableZoom = true;
    enableDamping = false;
    dampingFactor = 0.05;
    zoomSpeed = 1;
    minDistance = 0;
    maxDistance = Infinity;
    minPolarAngle = 0;
    maxPolarAngle = Math.PI;
    target = { set: vi.fn(), copy: vi.fn(), x: 0, y: 0, z: 0 };
    update = vi.fn();
    dispose = vi.fn();
    addEventListener = vi.fn();
    removeEventListener = vi.fn();
    enabled = true;
  },
}));

vi.mock("three/examples/jsm/loaders/FBXLoader.js", () => ({
  FBXLoader: class MockFBXLoader {
    loadAsync = vi.fn();
  },
}));

vi.mock("../../../asset-url", () => ({
  resolveAppAssetUrl: vi.fn((p: string) => `/mock/${p}`),
}));

// Stub DOM APIs that VrmEngine relies on
const rafIds = { current: 0 };
vi.stubGlobal(
  "requestAnimationFrame",
  vi.fn(() => {
    return ++rafIds.current;
  }),
);
vi.stubGlobal("cancelAnimationFrame", vi.fn());

// VrmEngine.setup() accesses window.devicePixelRatio
vi.stubGlobal("window", {
  devicePixelRatio: 1,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
});

// VrmEngine.createFootShadow accesses document.createElement
const mockCanvas2d = {
  createRadialGradient: vi.fn(() => ({
    addColorStop: vi.fn(),
  })),
  fillStyle: "",
  fillRect: vi.fn(),
  fill: vi.fn(),
  beginPath: vi.fn(),
  arc: vi.fn(),
};
vi.stubGlobal("document", {
  createElement: vi.fn(() => ({
    width: 0,
    height: 0,
    getContext: vi.fn(() => mockCanvas2d),
  })),
});

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------
import { VrmEngine } from "../VrmEngine";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockCanvas(): HTMLCanvasElement {
  return {
    clientWidth: 800,
    clientHeight: 600,
    getBoundingClientRect: () => ({
      width: 800,
      height: 600,
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      bottom: 600,
      right: 800,
      toJSON: () => ({}),
    }),
  } as unknown as HTMLCanvasElement;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("VrmEngine", () => {
  let engine: VrmEngine;

  beforeEach(() => {
    vi.clearAllMocks();
    engine = new VrmEngine();
  });

  afterEach(() => {
    engine.dispose();
  });

  // ── 1. Setup / dispose lifecycle ─────────────────────────────────
  describe("setup / dispose lifecycle", () => {
    it("creates an engine without throwing", () => {
      expect(engine).toBeInstanceOf(VrmEngine);
    });

    it("is not initialized before setup()", () => {
      expect(engine.isInitialized()).toBe(false);
    });

    it("is initialized after setup()", () => {
      const canvas = createMockCanvas();
      engine.setup(canvas, vi.fn());
      expect(engine.isInitialized()).toBe(true);
    });

    it("dispose() does not throw on an un-initialized engine", () => {
      expect(() => engine.dispose()).not.toThrow();
    });

    it("dispose() cleans up after setup()", () => {
      const canvas = createMockCanvas();
      engine.setup(canvas, vi.fn());
      expect(engine.isInitialized()).toBe(true);

      engine.dispose();
      expect(engine.isInitialized()).toBe(false);
    });

    it("can be setup() again after dispose()", () => {
      const canvas = createMockCanvas();
      engine.setup(canvas, vi.fn());
      engine.dispose();
      expect(engine.isInitialized()).toBe(false);

      engine.setup(canvas, vi.fn());
      expect(engine.isInitialized()).toBe(true);
    });

    it("re-setup with the same canvas reuses the engine (no dispose)", () => {
      const canvas = createMockCanvas();
      // Assign domElement so the "same canvas" check passes
      mockRendererInstance.domElement = canvas;

      const cb1 = vi.fn();
      const cb2 = vi.fn();
      engine.setup(canvas, cb1);
      engine.setup(canvas, cb2);
      expect(engine.isInitialized()).toBe(true);
      // dispose should not have been called between the two setups
      expect(mockRendererInstance.dispose).not.toHaveBeenCalled();
    });
  });

  // ── 2. playEmote doesn't throw ───────────────────────────────────
  describe("playEmote", () => {
    it("returns immediately when VRM is not loaded (no mixer)", async () => {
      const canvas = createMockCanvas();
      engine.setup(canvas, vi.fn());
      // No VRM loaded — playEmote should resolve silently
      await expect(
        engine.playEmote("/mock/emote.glb", 2, false),
      ).resolves.toBeUndefined();
    });

    it("stopEmote() does not throw when no emote is playing", () => {
      const canvas = createMockCanvas();
      engine.setup(canvas, vi.fn());
      expect(() => engine.stopEmote()).not.toThrow();
    });
  });

  // ── 3. State transitions ─────────────────────────────────────────
  describe("state transitions", () => {
    it("initial state has no VRM loaded", () => {
      const state = engine.getState();
      expect(state.vrmLoaded).toBe(false);
      expect(state.vrmName).toBeNull();
      expect(state.idlePlaying).toBe(false);
      expect(state.idleTime).toBe(0);
      expect(state.idleTracks).toBe(0);
    });

    it("state after setup still has no VRM loaded", () => {
      const canvas = createMockCanvas();
      engine.setup(canvas, vi.fn());
      const state = engine.getState();
      expect(state.vrmLoaded).toBe(false);
      expect(state.vrmName).toBeNull();
    });

    it("state after dispose resets to initial", () => {
      const canvas = createMockCanvas();
      engine.setup(canvas, vi.fn());
      engine.dispose();
      const state = engine.getState();
      expect(state.vrmLoaded).toBe(false);
      expect(state.vrmName).toBeNull();
      expect(state.idlePlaying).toBe(false);
    });

    it("getState() returns the VrmEngineState shape", () => {
      const state = engine.getState();
      const keys = Object.keys(state).sort();
      expect(keys).toEqual(
        [
          "idlePlaying",
          "idleTime",
          "idleTracks",
          "vrmLoaded",
          "vrmName",
        ].sort(),
      );
    });
  });

  // ── 4. Public setters ────────────────────────────────────────────
  describe("public setters", () => {
    it("setMouthOpen clamps values to [0, 1]", () => {
      expect(() => engine.setMouthOpen(0)).not.toThrow();
      expect(() => engine.setMouthOpen(1)).not.toThrow();
      expect(() => engine.setMouthOpen(-0.5)).not.toThrow();
      expect(() => engine.setMouthOpen(2.0)).not.toThrow();
    });

    it("setSpeaking toggles without throwing", () => {
      expect(() => engine.setSpeaking(true)).not.toThrow();
      expect(() => engine.setSpeaking(false)).not.toThrow();
    });

    it("setCameraAnimation merges partial config", () => {
      expect(() => engine.setCameraAnimation({ enabled: false })).not.toThrow();
      expect(() =>
        engine.setCameraAnimation({ swayAmplitude: 0.1, speed: 1.5 }),
      ).not.toThrow();
    });

    it("setForceFaceCameraFlip toggles without throwing", () => {
      expect(() => engine.setForceFaceCameraFlip(true)).not.toThrow();
      expect(() => engine.setForceFaceCameraFlip(false)).not.toThrow();
    });

    it("resize() handles zero or negative dimensions gracefully", () => {
      const canvas = createMockCanvas();
      engine.setup(canvas, vi.fn());
      expect(() => engine.resize(0, 0)).not.toThrow();
      expect(() => engine.resize(-1, 600)).not.toThrow();
      expect(() => engine.resize(800, -1)).not.toThrow();
      expect(() => engine.resize(1024, 768)).not.toThrow();
    });

    it("resize() is a no-op before setup()", () => {
      expect(() => engine.resize(800, 600)).not.toThrow();
    });
  });

  // ── 5. Animation blending basics ─────────────────────────────────
  describe("animation blending", () => {
    it("stopEmote calls fadeOut on any active emote action", () => {
      const engineAny = engine as unknown as {
        emoteAction: ReturnType<typeof createMockAction> | null;
        idleAction: ReturnType<typeof createMockAction> | null;
        emoteTimeout: ReturnType<typeof setTimeout> | null;
      };

      const fakeEmoteAction = createMockAction();
      const fakeIdleAction = createMockAction();
      engineAny.emoteAction = fakeEmoteAction;
      engineAny.idleAction = fakeIdleAction;

      engine.stopEmote();

      expect(fakeEmoteAction.fadeOut).toHaveBeenCalledWith(0.3);
      expect(fakeIdleAction.reset).toHaveBeenCalled();
      expect(fakeIdleAction.fadeIn).toHaveBeenCalledWith(0.3);
      expect(fakeIdleAction.play).toHaveBeenCalled();
      expect(engineAny.emoteAction).toBeNull();
    });

    it("stopEmote clears pending emote timeout", () => {
      const engineAny = engine as unknown as {
        emoteTimeout: ReturnType<typeof setTimeout> | null;
      };
      engineAny.emoteTimeout = setTimeout(() => {}, 10_000);

      engine.stopEmote();

      expect(engineAny.emoteTimeout).toBeNull();
    });

    it("emote clip cache starts empty and is cleared on dispose", () => {
      const engineAny = engine as unknown as {
        emoteClipCache: Map<string, unknown>;
      };
      expect(engineAny.emoteClipCache.size).toBe(0);

      engineAny.emoteClipCache.set("test.glb", {});
      expect(engineAny.emoteClipCache.size).toBe(1);

      engine.dispose();
      expect(engineAny.emoteClipCache.size).toBe(0);
    });

    it("emoteRequestId is not incremented when no VRM is loaded", async () => {
      const engineAny = engine as unknown as {
        emoteRequestId: number;
      };
      const initial = engineAny.emoteRequestId;

      // playEmote bails early (no VRM loaded) before incrementing the id
      await engine.playEmote("/mock/emote.glb", 2, false);
      expect(engineAny.emoteRequestId).toBe(initial);
    });
  });

  // ── 6. loadVrmFromUrl guards ─────────────────────────────────────
  describe("loadVrmFromUrl guards", () => {
    it("throws when engine is not initialized", async () => {
      await expect(
        engine.loadVrmFromUrl("http://example.com/model.vrm"),
      ).rejects.toThrow("VrmEngine not initialized");
    });
  });
});
