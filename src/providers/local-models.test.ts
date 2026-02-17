/**
 * Local Models Manager Tests
 */

import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getLocalModelStatuses,
  LOCAL_MODEL_REGISTRY,
  LocalModelManager,
  type ModelType,
} from "./local-models";

// ============================================================================
// UNIT TESTS
// ============================================================================

describe("LocalModelManager", () => {
  let manager: LocalModelManager;
  let testCacheDir: string;

  beforeEach(() => {
    // Use a unique temp directory for each test
    testCacheDir = join(tmpdir(), `milady-test-${Date.now()}`);
    mkdirSync(testCacheDir, { recursive: true });
    manager = new LocalModelManager({ cacheDir: testCacheDir });
  });

  afterEach(() => {
    // Cleanup test directory
    if (existsSync(testCacheDir)) {
      rmSync(testCacheDir, { recursive: true, force: true });
    }
  });

  describe("Model Path Generation", () => {
    it("should generate valid paths for model IDs", () => {
      const path = manager.getModelPath(
        "Salesforce/blip-image-captioning-base",
      );
      expect(path).toContain(testCacheDir);
      expect(path).toContain("Salesforce_blip-image-captioning-base");
    });

    it("should sanitize special characters in model IDs", () => {
      const path = manager.getModelPath("org/model:variant");
      // The sanitized model name part should not contain : or /
      const modelName = path.split("/").pop();
      expect(modelName).not.toContain(":");
      expect(modelName).toBe("org_model_variant");
    });
  });

  describe("Model Download Status", () => {
    it("should report model as not downloaded initially", () => {
      expect(
        manager.isModelDownloaded("Salesforce/blip-image-captioning-base"),
      ).toBe(false);
    });

    it("should report model as downloaded after manifest update", () => {
      // Simulate a downloaded model by creating the manifest entry
      const modelPath = manager.getModelPath("test/model");
      mkdirSync(modelPath, { recursive: true });
      writeFileSync(join(modelPath, "config.json"), "{}");

      // Access private manifest to simulate download
      const manifest = {
        "test/model": {
          downloadedAt: new Date().toISOString(),
          path: modelPath,
        },
      };
      writeFileSync(
        join(testCacheDir, "manifest.json"),
        JSON.stringify(manifest),
      );

      // Create new manager to reload manifest
      const newManager = new LocalModelManager({ cacheDir: testCacheDir });
      expect(newManager.isModelDownloaded("test/model")).toBe(true);
    });
  });

  describe("Model Statuses", () => {
    it("should list all registered vision models", () => {
      const statuses = manager.getModelStatuses("vision");
      expect(statuses.length).toBeGreaterThan(0);
      expect(statuses.every((s) => s.type === "vision")).toBe(true);
    });

    it("should list all registered LLM models", () => {
      const statuses = manager.getModelStatuses("llm");
      expect(statuses.length).toBeGreaterThan(0);
      expect(statuses.every((s) => s.type === "llm")).toBe(true);
    });

    it("should list all registered TTS models", () => {
      const statuses = manager.getModelStatuses("tts");
      expect(statuses.length).toBeGreaterThan(0);
      expect(statuses.every((s) => s.type === "tts")).toBe(true);
    });

    it("should list all registered STT models", () => {
      const statuses = manager.getModelStatuses("stt");
      expect(statuses.length).toBeGreaterThan(0);
      expect(statuses.every((s) => s.type === "stt")).toBe(true);
    });

    it("should list all registered embedding models", () => {
      const statuses = manager.getModelStatuses("embedding");
      expect(statuses.length).toBeGreaterThan(0);
      expect(statuses.every((s) => s.type === "embedding")).toBe(true);
    });

    it("should include model metadata in status", () => {
      const statuses = manager.getModelStatuses("vision");
      const status = statuses[0];
      expect(status.modelId).toBeDefined();
      expect(status.name).toBeDefined();
      expect(status.type).toBe("vision");
      expect(typeof status.downloaded).toBe("boolean");
      expect(typeof status.sizeInMb).toBe("number");
    });
  });

  describe("Recommended Models", () => {
    it("should return recommended model for each type", () => {
      const types: ModelType[] = ["vision", "llm", "tts", "stt", "embedding"];
      for (const type of types) {
        const recommended = manager.getRecommendedModel(type);
        expect(recommended).toBeDefined();
        expect(recommended?.type).toBe(type);
      }
    });

    it("should return the first registered model as recommended", () => {
      const recommended = manager.getRecommendedModel("vision");
      expect(recommended?.modelId).toBe(LOCAL_MODEL_REGISTRY.vision[0].modelId);
    });
  });
});

// ============================================================================
// MODEL REGISTRY TESTS
// ============================================================================

describe("LOCAL_MODEL_REGISTRY", () => {
  it("should have entries for all model types", () => {
    expect(LOCAL_MODEL_REGISTRY.vision).toBeDefined();
    expect(LOCAL_MODEL_REGISTRY.llm).toBeDefined();
    expect(LOCAL_MODEL_REGISTRY.tts).toBeDefined();
    expect(LOCAL_MODEL_REGISTRY.stt).toBeDefined();
    expect(LOCAL_MODEL_REGISTRY.embedding).toBeDefined();
  });

  it("should have valid model configs", () => {
    for (const [type, models] of Object.entries(LOCAL_MODEL_REGISTRY)) {
      expect(models.length).toBeGreaterThan(0);
      for (const model of models) {
        expect(model.type).toBe(type);
        expect(model.modelId).toBeDefined();
        expect(model.name).toBeDefined();
        expect(typeof model.sizeInMb).toBe("number");
        expect(model.sizeInMb).toBeGreaterThan(0);
      }
    }
  });

  it("should have Ollama models marked with ollamaModel field", () => {
    const ollamaModels = LOCAL_MODEL_REGISTRY.llm.filter((m) => m.ollamaModel);
    expect(ollamaModels.length).toBeGreaterThan(0);
    for (const model of ollamaModels) {
      expect(model.modelId.startsWith("ollama/")).toBe(true);
    }
  });

  it("should have ONNX-compatible models marked", () => {
    const onnxModels = Object.values(LOCAL_MODEL_REGISTRY)
      .flat()
      .filter((m) => m.useOnnx);
    expect(onnxModels.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// GLOBAL INSTANCE TESTS
// ============================================================================

describe("Global LocalModelManager Instance", () => {
  it("should return statuses via global function", () => {
    const statuses = getLocalModelStatuses();
    expect(Array.isArray(statuses)).toBe(true);
    expect(statuses.length).toBeGreaterThan(0);
  });

  it("should filter statuses by type via global function", () => {
    const visionStatuses = getLocalModelStatuses("vision");
    expect(visionStatuses.every((s) => s.type === "vision")).toBe(true);
  });
});

// ============================================================================
// INTEGRATION TESTS (require network)
// ============================================================================

describe.skip("LocalModelManager Integration (requires network)", () => {
  let manager: LocalModelManager;
  let testCacheDir: string;

  beforeEach(() => {
    testCacheDir = join(tmpdir(), `milady-integration-${Date.now()}`);
    mkdirSync(testCacheDir, { recursive: true });
    manager = new LocalModelManager({ cacheDir: testCacheDir });
  });

  afterEach(() => {
    if (existsSync(testCacheDir)) {
      rmSync(testCacheDir, { recursive: true, force: true });
    }
  });

  it("should download a small model from HuggingFace", async () => {
    // Use a very small model for testing
    const modelId = "sentence-transformers/all-MiniLM-L6-v2";

    let _progressCalled = false;
    const path = await manager.downloadModel(modelId, (progress) => {
      _progressCalled = true;
      expect(progress.percent).toBeGreaterThanOrEqual(0);
      expect(progress.percent).toBeLessThanOrEqual(100);
    });

    expect(path).toBeDefined();
    expect(existsSync(path)).toBe(true);
    expect(manager.isModelDownloaded(modelId)).toBe(true);
  }, 120000);

  it("should check Ollama status", async () => {
    const isRunning = await manager.isOllamaRunning();
    // Just verify it doesn't throw and returns a boolean
    expect(typeof isRunning).toBe("boolean");
  });

  it("should list Ollama models if running", async () => {
    const isRunning = await manager.isOllamaRunning();
    if (isRunning) {
      const models = await manager.listOllamaModels();
      expect(Array.isArray(models)).toBe(true);
    }
  });
});

// ============================================================================
// ERROR HANDLING TESTS
// ============================================================================

describe("LocalModelManager Error Handling", () => {
  let manager: LocalModelManager;

  beforeEach(() => {
    manager = new LocalModelManager({
      cacheDir: join(tmpdir(), `milady-error-test-${Date.now()}`),
    });
  });

  it("should handle non-existent model gracefully", async () => {
    // Mock fetch to simulate 404
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      statusText: "Not Found",
    });

    await expect(manager.downloadModel("nonexistent/model")).rejects.toThrow(
      "Failed to fetch model info",
    );

    global.fetch = originalFetch;
  });

  it("should handle unreachable Ollama server", async () => {
    const manager = new LocalModelManager({
      ollamaUrl: "http://localhost:99999", // Invalid port
    });

    const isRunning = await manager.isOllamaRunning();
    expect(isRunning).toBe(false);
  });

  it("should return empty list when Ollama is not running", async () => {
    const manager = new LocalModelManager({
      ollamaUrl: "http://localhost:99999",
    });

    const models = await manager.listOllamaModels();
    expect(models).toEqual([]);
  });
});
