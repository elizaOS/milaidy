import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

// ---------------------------------------------------------------------------
// Mock node-llama-cpp before importing the manager
// ---------------------------------------------------------------------------

const mockGetEmbeddingFor = vi.fn().mockResolvedValue({
  vector: new Float32Array(768).fill(0.1),
});

const mockDisposeContext = vi.fn().mockResolvedValue(undefined);
const mockDisposeModel = vi.fn().mockResolvedValue(undefined);

const mockCreateEmbeddingContext = vi.fn().mockResolvedValue({
  getEmbeddingFor: mockGetEmbeddingFor,
  dispose: mockDisposeContext,
});

const mockLoadModel = vi.fn().mockResolvedValue({
  createEmbeddingContext: mockCreateEmbeddingContext,
  dispose: mockDisposeModel,
});

const mockGetLlama = vi.fn().mockResolvedValue({
  loadModel: mockLoadModel,
});

vi.mock("node-llama-cpp", () => ({
  getLlama: mockGetLlama,
  LlamaLogLevel: {
    error: "error",
    fatal: "fatal",
  },
}));

// Mock the model download (don't actually fetch from HuggingFace)
vi.mock("node:https", () => ({
  default: { get: vi.fn() },
  get: vi.fn(),
}));

// Isolate embedding metadata path for this test worker to avoid cross-file
// races when the full suite runs in parallel.
const TEST_EMBEDDING_META_ROOT = fs.mkdtempSync(
  path.join(os.tmpdir(), "milaidy-embedding-meta-"),
);
process.env.MILAIDY_EMBEDDING_META_PATH = path.join(
  TEST_EMBEDDING_META_ROOT,
  "embedding-meta.json",
);

// ---------------------------------------------------------------------------
// Import after mocks are in place
// ---------------------------------------------------------------------------

import {
  EMBEDDING_META_PATH,
  type EmbeddingManagerConfig,
  MilaidyEmbeddingManager,
  readEmbeddingMeta,
} from "./embedding-manager.js";
import { detectEmbeddingPreset } from "./embedding-presets.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a temp models dir with a fake model file to skip downloads. */
function makeTempModelsDir(modelName = detectEmbeddingPreset().model): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "milaidy-emb-test-"));
  fs.writeFileSync(path.join(dir, modelName), "fake-gguf-data");
  return dir;
}

function defaultConfig(
  overrides: Partial<EmbeddingManagerConfig> = {},
): EmbeddingManagerConfig {
  return {
    modelsDir: makeTempModelsDir(),
    idleTimeoutMs: 0, // disable idle timer for most tests
    ...overrides,
  };
}

const ORIGINAL_PLATFORM = process.platform;
const ORIGINAL_ARCH = process.arch;
const BYTES_PER_GB = 1024 ** 3;

function mockHardware(
  platform: NodeJS.Platform,
  arch: string,
  ramGB: number,
): void {
  Object.defineProperty(process, "platform", { value: platform });
  Object.defineProperty(process, "arch", { value: arch });
  vi.spyOn(os, "totalmem").mockReturnValue(ramGB * BYTES_PER_GB);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("MilaidyEmbeddingManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: false });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    Object.defineProperty(process, "platform", { value: ORIGINAL_PLATFORM });
    Object.defineProperty(process, "arch", { value: ORIGINAL_ARCH });
  });

  afterAll(() => {
    delete process.env.MILAIDY_EMBEDDING_META_PATH;
    try {
      fs.rmSync(TEST_EMBEDDING_META_ROOT, { recursive: true, force: true });
    } catch {
      // best-effort cleanup
    }
  });

  // 1. Config defaults
  it("should use detected preset defaults when config is not provided", () => {
    const detected = detectEmbeddingPreset();
    const mgr = new MilaidyEmbeddingManager(defaultConfig());
    const stats = mgr.getStats();

    expect(stats.model).toBe(detected.model);
    expect(stats.dimensions).toBe(detected.dimensions);
    expect(stats.gpuLayers).toBe(detected.gpuLayers);
    expect(stats.isLoaded).toBe(false);
    expect(stats.lastUsedAt).toBeNull();
  });

  // 2. Constructor defaults reflect detected hardware tier
  it("should use hardware detection fallback defaults in constructor", () => {
    mockHardware("darwin", "arm64", 128);

    const detected = detectEmbeddingPreset();
    const mgr = new MilaidyEmbeddingManager({
      modelsDir: makeTempModelsDir(detected.model),
    });

    expect(mgr.getStats()).toMatchObject({
      model: detected.model,
      dimensions: detected.dimensions,
      gpuLayers: detected.gpuLayers,
    });
  });

  // 3. macOS GPU detection
  it("should default gpuLayers to 'auto' on Apple Silicon macOS", () => {
    mockHardware("darwin", "arm64", 16);

    const mgr = new MilaidyEmbeddingManager({
      modelsDir: makeTempModelsDir(),
    });

    expect(mgr.getStats().gpuLayers).toBe("auto");
  });

  // 4. Non-macOS default
  it("should default gpuLayers to 0 on non-darwin platforms", () => {
    mockHardware("linux", "arm64", 128);

    const mgr = new MilaidyEmbeddingManager({
      modelsDir: makeTempModelsDir(),
    });

    expect(mgr.getStats().gpuLayers).toBe(0);
  });

  // 4. Idle timeout fires dispose after inactivity
  it("should call dispose after idle timeout", async () => {
    const mgr = new MilaidyEmbeddingManager(
      defaultConfig({ idleTimeoutMs: 5 * 60 * 1000 }), // 5 min
    );

    // Trigger initialization
    await mgr.generateEmbedding("hello");
    expect(mgr.isLoaded()).toBe(true);

    // Advance past idle timeout — the idle check runs on setInterval, and
    // the unload is async, so we advance timers then flush microtasks.
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 60_001);

    // Model should be unloaded
    expect(mockDisposeContext).toHaveBeenCalled();
    expect(mockDisposeModel).toHaveBeenCalled();
    expect(mgr.isLoaded()).toBe(false);
  });

  it("initializes node-llama-cpp with error-only logging", async () => {
    const mgr = new MilaidyEmbeddingManager(defaultConfig());
    await mgr.generateEmbedding("hello");

    expect(mockGetLlama).toHaveBeenCalledTimes(1);
    const options = mockGetLlama.mock.calls[0]?.[0] as
      | { logLevel?: string; logger?: unknown }
      | undefined;
    expect(options?.logLevel).toBe("error");
    expect(typeof options?.logger).toBe("function");
  });

  // 5. lastUsedAt updates on generateEmbedding, preventing premature unload
  it("should update lastUsedAt on each generateEmbedding call", async () => {
    const mgr = new MilaidyEmbeddingManager(
      defaultConfig({ idleTimeoutMs: 10 * 60 * 1000 }), // 10 min
    );

    await mgr.generateEmbedding("first call");
    const stats1 = mgr.getStats();
    expect(stats1.lastUsedAt).not.toBeNull();
    const firstLastUsedAt = stats1.lastUsedAt ?? 0;

    // Advance 5 minutes (not past timeout)
    vi.advanceTimersByTime(5 * 60 * 1000);

    // Use again — resets the idle clock
    await mgr.generateEmbedding("second call");
    const stats2 = mgr.getStats();
    const secondLastUsedAt = stats2.lastUsedAt;
    expect(secondLastUsedAt).not.toBeNull();
    if (secondLastUsedAt == null) {
      throw new Error("Expected lastUsedAt values to be populated");
    }
    expect(secondLastUsedAt).toBeGreaterThan(firstLastUsedAt);

    // Model should still be loaded
    expect(mgr.isLoaded()).toBe(true);
  });

  // 6. Re-initialization after idle unload
  it("should re-initialize transparently after idle unload", async () => {
    const mgr = new MilaidyEmbeddingManager(
      defaultConfig({ idleTimeoutMs: 1 * 60 * 1000 }), // 1 min
    );

    await mgr.generateEmbedding("initial");
    expect(mgr.isLoaded()).toBe(true);
    expect(mockLoadModel).toHaveBeenCalledTimes(1);

    // Trigger idle unload (async timer callback needs microtask flush)
    await vi.advanceTimersByTimeAsync(1 * 60 * 1000 + 60_001);
    expect(mgr.isLoaded()).toBe(false);

    // Next call should re-init
    vi.clearAllMocks();
    await mgr.generateEmbedding("after idle");
    expect(mockLoadModel).toHaveBeenCalledTimes(1);
    expect(mgr.isLoaded()).toBe(true);
  });

  // 7. Explicit dispose clears timer and releases model
  it("should clean up on explicit dispose", async () => {
    const mgr = new MilaidyEmbeddingManager(
      defaultConfig({ idleTimeoutMs: 30 * 60 * 1000 }),
    );

    await mgr.generateEmbedding("test");
    expect(mgr.isLoaded()).toBe(true);

    await mgr.dispose();
    expect(mockDisposeContext).toHaveBeenCalled();
    expect(mockDisposeModel).toHaveBeenCalled();
    expect(mgr.isLoaded()).toBe(false);

    // Should throw after dispose
    await expect(mgr.generateEmbedding("post-dispose")).rejects.toThrow(
      "disposed",
    );
  });

  // 8. Stats reporting
  it("should report correct stats", async () => {
    const cfg = defaultConfig({
      model: "custom-model.gguf",
      dimensions: 512,
      gpuLayers: 42,
    });
    // Create model file for custom name
    if (!cfg.modelsDir) {
      throw new Error("modelsDir should always be set by defaultConfig");
    }
    fs.writeFileSync(
      path.join(cfg.modelsDir, "custom-model.gguf"),
      "fake-data",
    );

    const mgr = new MilaidyEmbeddingManager(cfg);
    const before = mgr.getStats();
    expect(before).toEqual({
      lastUsedAt: null,
      isLoaded: false,
      model: "custom-model.gguf",
      gpuLayers: 42,
      dimensions: 512,
    });

    await mgr.generateEmbedding("test");
    const after = mgr.getStats();
    expect(after.isLoaded).toBe(true);
    expect(after.lastUsedAt).toBeTypeOf("number");
    expect(after.model).toBe("custom-model.gguf");
    expect(after.gpuLayers).toBe(42);
    expect(after.dimensions).toBe(512);

    await mgr.dispose();
  });

  // 9. Dimension mismatch logging
  describe("dimension migration", () => {
    const metaDir = path.dirname(EMBEDDING_META_PATH);

    beforeEach(() => {
      // Ensure clean state
      try {
        fs.rmSync(EMBEDDING_META_PATH);
      } catch {
        // ok if doesn't exist
      }
    });

    afterEach(() => {
      try {
        fs.rmSync(EMBEDDING_META_PATH);
      } catch {
        // ok
      }
    });

    it("should update stored metadata when dimensions change", async () => {
      // Write metadata with old dimensions
      fs.mkdirSync(metaDir, { recursive: true });
      fs.writeFileSync(
        EMBEDDING_META_PATH,
        JSON.stringify({
          model: "bge-small-en-v1.5.Q4_K_M.gguf",
          dimensions: 384,
          lastChanged: "2025-01-01T00:00:00Z",
        }),
      );

      // Create manager with new dimensions (768)
      const mgr = new MilaidyEmbeddingManager(
        defaultConfig({ dimensions: 768 }),
      );
      await mgr.generateEmbedding("trigger init");

      // Metadata should be updated
      const meta = readEmbeddingMeta();
      expect(meta).not.toBeNull();
      if (!meta) {
        throw new Error("Expected embedding metadata to exist");
      }
      expect(meta.dimensions).toBe(768);

      await mgr.dispose();
    });

    it("should not warn when dimensions match stored value", async () => {
      // Write metadata with current dimensions
      fs.mkdirSync(metaDir, { recursive: true });
      fs.writeFileSync(
        EMBEDDING_META_PATH,
        JSON.stringify({
          model: "nomic-embed-text-v1.5.Q5_K_M.gguf",
          dimensions: 768,
          lastChanged: "2025-01-01T00:00:00Z",
        }),
      );

      const mgr = new MilaidyEmbeddingManager(
        defaultConfig({ dimensions: 768 }),
      );
      await mgr.generateEmbedding("trigger init");

      await mgr.dispose();
    });
  });
});
