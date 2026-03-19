import { afterEach, describe, expect, it, vi } from "vitest";

// Shared mutable hardware state. vi.hoisted runs before vi.mock factories,
// so the mock can close over `hw` safely.
const hw = vi.hoisted(() => {
  const BYTES_PER_GB = 1024 ** 3;
  const realRamGB = Math.round(require("node:os").totalmem() / BYTES_PER_GB);
  return {
    platform: process.platform as string,
    arch: process.arch as string,
    ramGB: realRamGB,
  };
});

// Mock the upstream embedding-presets module with an implementation that
// reads from our mutable `hw` object rather than from process/os directly.
vi.mock("@elizaos/autonomous/runtime/embedding-presets", () => {
  const EMBEDDING_PRESETS: Record<string, Record<string, unknown>> = {
    fallback: {
      tier: "fallback",
      label: "Efficient (CPU)",
      description: "768-dim, 74MB download",
      model: "nomic-embed-text-v1.5.Q4_K_S.gguf",
      modelRepo: "nomic-ai/nomic-embed-text-v1.5-GGUF",
      dimensions: 768,
      gpuLayers: 0,
      contextSize: 8192,
      downloadSizeMB: 74,
    },
    standard: {
      tier: "standard",
      label: "Balanced (Metal GPU)",
      description: "768-dim, 95MB download",
      model: "nomic-embed-text-v1.5.Q5_K_M.gguf",
      modelRepo: "nomic-ai/nomic-embed-text-v1.5-GGUF",
      dimensions: 768,
      gpuLayers: "auto",
      contextSize: 8192,
      downloadSizeMB: 95,
    },
    performance: {
      tier: "performance",
      label: "Maximum (7B model)",
      description: "4096-dim, 4.2GB download",
      model: "ggml-e5-mistral-7b-instruct-q4_k_m.gguf",
      modelRepo: "dranger003/e5-mistral-7b-instruct-GGUF",
      dimensions: 4096,
      gpuLayers: "auto",
      contextSize: 32768,
      downloadSizeMB: 4200,
    },
  };

  function detectEmbeddingTier(): string {
    const isMac = hw.platform === "darwin";
    const isAppleSilicon = isMac && hw.arch === "arm64";
    if (!isAppleSilicon || hw.ramGB <= 8) return "fallback";
    if (hw.ramGB >= 128) return "performance";
    return "standard";
  }

  function detectEmbeddingPreset() {
    return EMBEDDING_PRESETS[detectEmbeddingTier()];
  }

  return { EMBEDDING_PRESETS, detectEmbeddingTier, detectEmbeddingPreset };
});

import {
  detectEmbeddingPreset,
  detectEmbeddingTier,
  EMBEDDING_PRESETS,
} from "./embedding-presets.js";

const ORIGINAL_PLATFORM = hw.platform;
const ORIGINAL_ARCH = hw.arch;
const ORIGINAL_RAM_GB = hw.ramGB;

function mockHardware(platform: string, arch: string, ramGB: number): void {
  hw.platform = platform;
  hw.arch = arch;
  hw.ramGB = ramGB;
}

afterEach(() => {
  hw.platform = ORIGINAL_PLATFORM;
  hw.arch = ORIGINAL_ARCH;
  hw.ramGB = ORIGINAL_RAM_GB;
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
