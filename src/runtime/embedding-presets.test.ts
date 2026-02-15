import os from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { detectEmbeddingPreset } from "./embedding-presets.js";

const ORIGINAL_PLATFORM = process.platform;
const ORIGINAL_ARCH = process.arch;

function mockHardware(platform: NodeJS.Platform, arch: string): void {
  Object.defineProperty(process, "platform", { value: platform });
  Object.defineProperty(process, "arch", { value: arch });
}

afterEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(process, "platform", { value: ORIGINAL_PLATFORM });
  Object.defineProperty(process, "arch", { value: ORIGINAL_ARCH });
});

describe("detectEmbeddingPreset", () => {
  it("returns the Standard (Nomic) preset", () => {
    const preset = detectEmbeddingPreset();
    expect(preset.label).toBe("Standard (Nomic)");
    expect(preset.model).toBe("nomic-embed-text-v1.5.Q5_K_M.gguf");
    expect(preset.dimensions).toBe(768);
    expect(preset.downloadSizeMB).toBe(95);
  });

  it("sets gpuLayers to 0 (CPU) even on Apple Silicon", () => {
    mockHardware("darwin", "arm64");
    const preset = detectEmbeddingPreset();
    expect(preset.gpuLayers).toBe(0);
  });

  it("sets gpuLayers to 0 (CPU) on Intel Mac", () => {
    mockHardware("darwin", "x64");
    const preset = detectEmbeddingPreset();
    expect(preset.gpuLayers).toBe(0);
  });

  it("sets gpuLayers to 0 (CPU) on Linux", () => {
    mockHardware("linux", "x64");
    const preset = detectEmbeddingPreset();
    expect(preset.gpuLayers).toBe(0);
  });
});
