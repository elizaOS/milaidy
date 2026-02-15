import { arch, platform } from "node:os";
import { describe, expect, it } from "vitest";
import {
  AppleContainerEngine,
  createEngine,
  DockerEngine,
  detectBestEngine,
  getAllEngineInfo,
  getPlatformSetupNotes,
} from "../sandbox-engine";

describe("SandboxEngine", () => {
  describe("DockerEngine", () => {
    const engine = new DockerEngine();

    it("should report correct engine type", () => {
      expect(engine.engineType).toBe("docker");
    });

    it("should return valid engine info", () => {
      const info = engine.getInfo();
      expect(info.type).toBe("docker");
      expect(info.platform).toBe(platform());
      expect(info.arch).toBe(arch());
      expect(typeof info.available).toBe("boolean");
      expect(typeof info.version).toBe("string");
    });

    it("should return empty list for nonexistent containers", () => {
      const containers = engine.listContainers("nonexistent-test-prefix-xyz");
      expect(containers).toEqual([]);
    });

    it("should return false for nonexistent image", () => {
      expect(engine.imageExists("nonexistent-image-xyz:test")).toBe(false);
    });

    it("should return false for nonexistent container running check", () => {
      expect(engine.isContainerRunning("nonexistent-id")).toBe(false);
    });

    it("should handle health check for nonexistent container", async () => {
      const healthy = await engine.healthCheck("nonexistent-id");
      expect(healthy).toBe(false);
    });
  });

  describe("AppleContainerEngine", () => {
    const engine = new AppleContainerEngine();

    it("should report correct engine type", () => {
      expect(engine.engineType).toBe("apple-container");
    });

    it("should only be available on macOS", () => {
      const info = engine.getInfo();
      if (platform() !== "darwin") {
        expect(info.available).toBe(false);
      }
      // On macOS, depends on whether `container` CLI is installed
      expect(typeof info.available).toBe("boolean");
    });

    it("should report Apple Silicon status", () => {
      const info = engine.getInfo();
      expect(info.details).toContain("Apple Silicon:");
    });
  });

  describe("detectBestEngine", () => {
    it("should return an engine", () => {
      const engine = detectBestEngine();
      expect(engine).toBeTruthy();
      expect(["docker", "apple-container"]).toContain(engine.engineType);
    });
  });

  describe("createEngine", () => {
    it("should create Docker engine when requested", () => {
      const engine = createEngine("docker");
      expect(engine.engineType).toBe("docker");
    });

    it("should create Apple Container engine when requested", () => {
      const engine = createEngine("apple-container");
      expect(engine.engineType).toBe("apple-container");
    });

    it("should auto-detect when auto is specified", () => {
      const engine = createEngine("auto");
      expect(["docker", "apple-container"]).toContain(engine.engineType);
    });
  });

  describe("getAllEngineInfo", () => {
    it("should return info for all engines", () => {
      const infos = getAllEngineInfo();
      expect(infos.length).toBeGreaterThanOrEqual(2);
      const types = infos.map((i) => i.type);
      expect(types).toContain("docker");
      expect(types).toContain("apple-container");
    });

    it("should include platform info for each engine", () => {
      const infos = getAllEngineInfo();
      for (const info of infos) {
        expect(info.platform).toBeTruthy();
        expect(info.arch).toBeTruthy();
        expect(typeof info.available).toBe("boolean");
      }
    });
  });

  describe("getPlatformSetupNotes", () => {
    it("should return non-empty notes for current platform", () => {
      const notes = getPlatformSetupNotes();
      expect(notes.length).toBeGreaterThan(0);
    });

    it("should contain platform-relevant information", () => {
      const notes = getPlatformSetupNotes();
      const os = platform();

      if (os === "darwin") {
        expect(notes.toLowerCase()).toContain("macos");
      } else if (os === "linux") {
        expect(notes.toLowerCase()).toContain("linux");
      } else if (os === "win32") {
        expect(notes.toLowerCase()).toContain("windows");
      }
    });
  });
});
