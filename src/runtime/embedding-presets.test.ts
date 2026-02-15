import os from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  detectEmbeddingPreset,
  detectEmbeddingTier,
  EMBEDDING_PRESETS,
} from "./embedding-presets.js";

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

afterEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(process, "platform", { value: ORIGINAL_PLATFORM });
  Object.defineProperty(process, "arch", { value: ORIGINAL_ARCH });
});

describe("detectEmbeddingTier", () => {
  it("returns performance on Apple Silicon with 128GB RAM", () => {
    mockHardware("darwin", "arm64", 128);

    expect(detectEmbeddingTier()).toBe("performance");
  });

  it("returns standard on Apple Silicon with 16GB RAM", () => {
    mockHardware("darwin", "arm64", 16);

    expect(detectEmbeddingTier()).toBe("standard");
  });

  it("returns fallback on Apple Silicon with 8GB RAM", () => {
    mockHardware("darwin", "arm64", 8);

    expect(detectEmbeddingTier()).toBe("fallback");
  });

  it("returns fallback on Intel Mac", () => {
    mockHardware("darwin", "x64", 64);

    expect(detectEmbeddingTier()).toBe("fallback");
  });

  it("returns fallback on Linux even with high RAM", () => {
    mockHardware("linux", "arm64", 128);

    expect(detectEmbeddingTier()).toBe("fallback");
  });

  it("detectEmbeddingPreset returns the detected tier preset", () => {
    mockHardware("darwin", "arm64", 128);

    const preset = detectEmbeddingPreset();
    expect(preset.tier).toBe("performance");
    expect(preset).toEqual(EMBEDDING_PRESETS.performance);
  });
});

describe("EMBEDDING_PRESETS", () => {
  it("defines required fields for every preset", () => {
    for (const preset of Object.values(EMBEDDING_PRESETS)) {
      expect(preset.model).toBeTruthy();
      expect(preset.modelRepo).toBeTruthy();
      expect(preset.dimensions).toBeGreaterThan(0);
      expect(["auto", 0]).toContain(preset.gpuLayers);
      expect(preset.contextSize).toBeGreaterThan(0);
      expect(preset.downloadSizeMB).toBeGreaterThan(0);
    }
  });

  it("uses 4096 dimensions for the performance preset", () => {
    expect(EMBEDDING_PRESETS.performance.dimensions).toBe(4096);
    expect(EMBEDDING_PRESETS.performance.model).toBe(
      "ggml-e5-mistral-7b-instruct-q4_k_m.gguf",
    );
    expect(EMBEDDING_PRESETS.performance.model).toMatch(/^ggml-/);
  });

  it("keeps fallback and standard presets at 768 dimensions", () => {
    expect(EMBEDDING_PRESETS.fallback.dimensions).toBe(768);
    expect(EMBEDDING_PRESETS.standard.dimensions).toBe(768);
  });
});
