/**
 * Unit tests for the Electrobun Camera native module.
 *
 * In the Electrobun architecture, actual camera capture (getUserMedia,
 * MediaRecorder) is handled entirely inside the renderer WebView. The Bun-side
 * CameraManager is therefore a thin façade whose methods return availability
 * stubs or delegate to the renderer.
 *
 * These tests verify:
 * - Each public method resolves with the expected shape
 * - getDevices always returns an empty array (renderer enumerates devices)
 * - Recording state returns a sane initial value
 * - Permissions methods return "prompt" by default
 * - dispose / setSendToWebview lifecycle
 * - getCameraManager returns a singleton
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CameraManager, getCameraManager } from "../camera";

describe("CameraManager", () => {
  let manager: CameraManager;

  beforeEach(() => {
    manager = new CameraManager();
  });

  afterEach(() => {
    manager.dispose();
  });

  // ── getDevices ──────────────────────────────────────────────────────────

  describe("getDevices", () => {
    it("returns an empty devices array (renderer enumerates)", async () => {
      const result = await manager.getDevices();
      expect(result).toHaveProperty("devices");
      expect(Array.isArray(result.devices)).toBe(true);
      expect(result.devices).toHaveLength(0);
    });

    it("indicates the capability is available", async () => {
      const result = await manager.getDevices();
      expect(result.available).toBe(true);
    });
  });

  // ── startPreview ────────────────────────────────────────────────────────

  describe("startPreview", () => {
    it("returns available: true without options", async () => {
      const result = await manager.startPreview();
      expect(result.available).toBe(true);
    });

    it("returns available: true with a deviceId option", async () => {
      const result = await manager.startPreview({ deviceId: "device-123" });
      expect(result.available).toBe(true);
    });
  });

  // ── stopPreview ─────────────────────────────────────────────────────────

  describe("stopPreview", () => {
    it("resolves without error", async () => {
      await expect(manager.stopPreview()).resolves.toBeUndefined();
    });
  });

  // ── switchCamera ────────────────────────────────────────────────────────

  describe("switchCamera", () => {
    it("returns available: true", async () => {
      const result = await manager.switchCamera({ deviceId: "cam-front" });
      expect(result.available).toBe(true);
    });
  });

  // ── capturePhoto ────────────────────────────────────────────────────────

  describe("capturePhoto", () => {
    it("returns available: true", async () => {
      const result = await manager.capturePhoto();
      expect(result.available).toBe(true);
    });
  });

  // ── startRecording ──────────────────────────────────────────────────────

  describe("startRecording", () => {
    it("returns available: true", async () => {
      const result = await manager.startRecording();
      expect(result.available).toBe(true);
    });
  });

  // ── stopRecording ───────────────────────────────────────────────────────

  describe("stopRecording", () => {
    it("returns available: true", async () => {
      const result = await manager.stopRecording();
      expect(result.available).toBe(true);
    });
  });

  // ── getRecordingState ───────────────────────────────────────────────────

  describe("getRecordingState", () => {
    it("reports not recording by default", async () => {
      const state = await manager.getRecordingState();
      expect(state.recording).toBe(false);
    });

    it("reports zero duration when not recording", async () => {
      const state = await manager.getRecordingState();
      expect(state.duration).toBe(0);
    });
  });

  // ── checkPermissions ────────────────────────────────────────────────────

  describe("checkPermissions", () => {
    it("returns prompt status by default", async () => {
      const perms = await manager.checkPermissions();
      expect(perms.status).toBe("prompt");
    });
  });

  // ── requestPermissions ──────────────────────────────────────────────────

  describe("requestPermissions", () => {
    it("returns prompt status (renderer handles actual permission grant)", async () => {
      const perms = await manager.requestPermissions();
      expect(perms.status).toBe("prompt");
    });
  });

  // ── setSendToWebview / dispose ──────────────────────────────────────────

  describe("setSendToWebview and dispose", () => {
    it("accepts a sendToWebview callback without error", () => {
      const fn = vi.fn();
      expect(() => manager.setSendToWebview(fn)).not.toThrow();
    });

    it("dispose clears the callback without throwing", () => {
      const fn = vi.fn();
      manager.setSendToWebview(fn);
      expect(() => manager.dispose()).not.toThrow();
    });

    it("is safe to call dispose twice", () => {
      manager.dispose();
      expect(() => manager.dispose()).not.toThrow();
    });
  });
});

// ── getCameraManager singleton ──────────────────────────────────────────────

describe("getCameraManager", () => {
  it("returns the same instance on repeated calls", () => {
    const m1 = getCameraManager();
    const m2 = getCameraManager();
    expect(m1).toBe(m2);
  });

  it("returned instance responds to getDevices", async () => {
    const m = getCameraManager();
    const result = await m.getDevices();
    expect(result).toHaveProperty("devices");
  });
});
