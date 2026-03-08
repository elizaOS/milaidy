// @vitest-environment jsdom
import { StrictMode } from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/asset-url", () => ({
  resolveAppAssetUrl: (path: string) => path,
}));

vi.mock("../../src/components/avatar/VrmEngine", () => {
  class MockVrmEngine {
    static instances: MockVrmEngine[] = [];

    loadVrmFromUrl = vi.fn(async () => {});
    getState = vi.fn(() => ({
      vrmLoaded: true,
      vrmName: "milady-1.vrm",
      idlePlaying: false,
      idleTime: 0,
      idleTracks: 0,
    }));
    setInteractionEnabled = vi.fn();
    setForceFaceCameraFlip = vi.fn();
    setCameraProfile = vi.fn();
    setInteractionMode = vi.fn();
    resize = vi.fn();
    dispose = vi.fn();
    isInitialized = vi.fn(() => false);

    private readyPromise: Promise<void>;
    private resolveReadyPromise: () => void = () => {};

    constructor() {
      this.readyPromise = new Promise<void>((resolve) => {
        this.resolveReadyPromise = resolve;
      });
      MockVrmEngine.instances.push(this);
    }

    setup = vi.fn(() => {});

    whenReady = vi.fn(() => this.readyPromise);

    resolveReady(): void {
      this.resolveReadyPromise();
    }
  }

  (
    globalThis as {
      __miladyVrmViewerMock?: { instances: MockVrmEngine[] };
    }
  ).__miladyVrmViewerMock = { instances: MockVrmEngine.instances };

  return {
    VrmEngine: MockVrmEngine,
  };
});

import { VrmViewer } from "../../src/components/avatar/VrmViewer";

type MockVrmEngineInstance = {
  loadVrmFromUrl: ReturnType<typeof vi.fn>;
  resolveReady: () => void;
};

function getMockInstances(): MockVrmEngineInstance[] {
  const store = (
    globalThis as {
      __miladyVrmViewerMock?: { instances: MockVrmEngineInstance[] };
    }
  ).__miladyVrmViewerMock;

  if (!store) {
    throw new Error("Expected VRM viewer mock store to be initialized.");
  }

  return store.instances;
}

describe("VrmViewer", () => {
  beforeEach(() => {
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver = undefined;
    (
      globalThis as {
        window?: {
          addEventListener: ReturnType<typeof vi.fn>;
          removeEventListener: ReturnType<typeof vi.fn>;
        };
      }
    ).window = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    (
      globalThis as { requestAnimationFrame?: typeof requestAnimationFrame }
    ).requestAnimationFrame = ((cb: FrameRequestCallback) =>
      setTimeout(() => cb(0), 0)) as unknown as typeof requestAnimationFrame;
    (
      globalThis as { cancelAnimationFrame?: typeof cancelAnimationFrame }
    ).cancelAnimationFrame = ((id: number) =>
      clearTimeout(id)) as unknown as typeof cancelAnimationFrame;
    getMockInstances().length = 0;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("loads the same VRM path after StrictMode abort/remount", async () => {
    let renderer: TestRenderer.ReactTestRenderer | null = null;

    await act(async () => {
      renderer = TestRenderer.create(
        <StrictMode>
          <VrmViewer vrmPath="/vrms/milady-1.vrm" mouthOpen={0} />
        </StrictMode>,
        {
          createNodeMock: (element) => {
            if (element.type === "canvas") {
              return {
                getBoundingClientRect: () => ({
                  width: 640,
                  height: 480,
                  top: 0,
                  left: 0,
                  bottom: 480,
                  right: 640,
                  x: 0,
                  y: 0,
                  toJSON: () => ({}),
                }),
              };
            }
            return null;
          },
        },
      );
    });

    const instances = getMockInstances();

    expect(instances.length).toBeGreaterThanOrEqual(2);

    await act(async () => {
      for (const instance of instances) {
        instance.resolveReady();
      }
      await Promise.resolve();
      await Promise.resolve();
    });

    const totalLoadCalls = instances.reduce(
      (count, instance) => count + instance.loadVrmFromUrl.mock.calls.length,
      0,
    );
    expect(totalLoadCalls).toBe(1);
    expect(instances.at(-1)?.loadVrmFromUrl).toHaveBeenCalledWith(
      "/vrms/milady-1.vrm",
      "milady-1.vrm",
    );

    await act(async () => {
      renderer?.unmount();
    });
  });
});
