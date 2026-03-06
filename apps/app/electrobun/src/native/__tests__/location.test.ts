/**
 * Unit tests for the Electrobun Location native module.
 *
 * Covers:
 * - getCurrentPosition — IP-based geolocation with service fallback
 * - getLastKnownLocation — cached after successful getCurrentPosition
 * - watchPosition — returns a watchId, increments counter
 * - clearWatch — stops interval timer, no-op for unknown id
 * - sendToWebview notifications during watchPosition polling
 * - dispose — clears all active watch timers
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mock fetch before importing LocationManager
// ---------------------------------------------------------------------------
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// ---------------------------------------------------------------------------
// Module under test
// ---------------------------------------------------------------------------
import { getLocationManager, LocationManager } from "../location";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeOkResponse(data: Record<string, unknown>) {
  return {
    ok: true,
    json: () => Promise.resolve(data),
  };
}

function makeFailResponse() {
  return { ok: false, json: () => Promise.resolve({}) };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("LocationManager", () => {
  let manager: LocationManager;
  let webviewMessages: Array<{ message: string; payload: unknown }>;

  beforeEach(() => {
    vi.useFakeTimers();
    manager = new LocationManager();
    webviewMessages = [];
    manager.setSendToWebview((message, payload) => {
      webviewMessages.push({ message, payload });
    });
    mockFetch.mockReset();
  });

  afterEach(() => {
    manager.dispose();
    vi.useRealTimers();
  });

  // ── getCurrentPosition ────────────────────────────────────────────────────

  describe("getCurrentPosition", () => {
    it("returns coordinates from ip-api.com (lat/lon fields)", async () => {
      mockFetch.mockResolvedValueOnce(
        makeOkResponse({ lat: 48.8566, lon: 2.3522 }),
      );

      const pos = await manager.getCurrentPosition();
      expect(pos).not.toBeNull();
      expect(pos!.latitude).toBe(48.8566);
      expect(pos!.longitude).toBe(2.3522);
      expect(pos!.accuracy).toBe(5000);
      expect(typeof pos!.timestamp).toBe("number");
    });

    it("returns coordinates from ipapi.co (latitude/longitude fields)", async () => {
      // First service returns no coords, second has latitude/longitude
      mockFetch
        .mockResolvedValueOnce(makeFailResponse()) // ip-api.com fails
        .mockResolvedValueOnce(
          makeOkResponse({ latitude: 51.5074, longitude: -0.1278 }),
        );

      const pos = await manager.getCurrentPosition();
      expect(pos!.latitude).toBe(51.5074);
      expect(pos!.longitude).toBe(-0.1278);
    });

    it("falls back to the next service when first throws", async () => {
      mockFetch
        .mockRejectedValueOnce(new Error("Network error"))
        .mockResolvedValueOnce(makeOkResponse({ lat: 40.7128, lon: -74.006 }));

      const pos = await manager.getCurrentPosition();
      expect(pos!.latitude).toBe(40.7128);
    });

    it("returns null when all services fail", async () => {
      mockFetch
        .mockRejectedValueOnce(new Error("fail1"))
        .mockRejectedValueOnce(new Error("fail2"));

      const pos = await manager.getCurrentPosition();
      expect(pos).toBeNull();
    });

    it("skips non-ok responses and tries next service", async () => {
      mockFetch
        .mockResolvedValueOnce(makeFailResponse())
        .mockResolvedValueOnce(makeOkResponse({ lat: 35.6762, lon: 139.6503 }));

      const pos = await manager.getCurrentPosition();
      expect(pos!.latitude).toBe(35.6762);
    });

    it("skips responses with non-numeric coordinates", async () => {
      mockFetch
        .mockResolvedValueOnce(makeOkResponse({ lat: "bad", lon: null }))
        .mockResolvedValueOnce(
          makeOkResponse({ lat: 37.7749, lon: -122.4194 }),
        );

      const pos = await manager.getCurrentPosition();
      expect(pos!.latitude).toBe(37.7749);
    });

    it("returns null when json() throws", async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.reject(new Error("bad json")),
        })
        .mockRejectedValueOnce(new Error("fail2"));

      const pos = await manager.getCurrentPosition();
      expect(pos).toBeNull();
    });
  });

  // ── getLastKnownLocation ──────────────────────────────────────────────────

  describe("getLastKnownLocation", () => {
    it("returns null before any getCurrentPosition call", async () => {
      const last = await manager.getLastKnownLocation();
      expect(last).toBeNull();
    });

    it("returns the cached result after a successful getCurrentPosition", async () => {
      mockFetch.mockResolvedValueOnce(
        makeOkResponse({ lat: 48.8566, lon: 2.3522 }),
      );

      await manager.getCurrentPosition();
      const last = await manager.getLastKnownLocation();
      expect(last).not.toBeNull();
      expect(last!.latitude).toBe(48.8566);
    });

    it("returns null when getCurrentPosition fails", async () => {
      mockFetch
        .mockRejectedValueOnce(new Error("fail"))
        .mockRejectedValueOnce(new Error("fail"));

      await manager.getCurrentPosition();
      const last = await manager.getLastKnownLocation();
      expect(last).toBeNull();
    });

    it("always reflects the most recent successful position", async () => {
      mockFetch.mockResolvedValue(makeOkResponse({ lat: 1, lon: 2 }));
      await manager.getCurrentPosition();

      mockFetch.mockResolvedValue(makeOkResponse({ lat: 3, lon: 4 }));
      await manager.getCurrentPosition();

      const last = await manager.getLastKnownLocation();
      expect(last!.latitude).toBe(3);
      expect(last!.longitude).toBe(4);
    });
  });

  // ── watchPosition ─────────────────────────────────────────────────────────

  describe("watchPosition", () => {
    it("returns a string watchId matching the expected pattern", async () => {
      const { watchId } = await manager.watchPosition();
      expect(watchId).toMatch(/^watch_\d+$/);
    });

    it("increments watchId for each new watch", async () => {
      const { watchId: id1 } = await manager.watchPosition();
      const { watchId: id2 } = await manager.watchPosition();
      const n1 = Number(id1.replace("watch_", ""));
      const n2 = Number(id2.replace("watch_", ""));
      expect(n2).toBe(n1 + 1);
    });

    it("polls at the specified interval and sends locationUpdate", async () => {
      mockFetch.mockResolvedValue(makeOkResponse({ lat: 1, lon: 2 }));

      await manager.watchPosition({ interval: 5000 });

      // Advance past one tick
      await vi.advanceTimersByTimeAsync(5100);

      const updates = webviewMessages.filter(
        (m) => m.message === "locationUpdate",
      );
      expect(updates.length).toBeGreaterThanOrEqual(1);
    });

    it("supports multiple independent watches", async () => {
      const { watchId: id1 } = await manager.watchPosition();
      const { watchId: id2 } = await manager.watchPosition();
      expect(id1).not.toBe(id2);
    });
  });

  // ── clearWatch ────────────────────────────────────────────────────────────

  describe("clearWatch", () => {
    it("removes the watch and stops polling", async () => {
      mockFetch.mockResolvedValue(makeOkResponse({ lat: 1, lon: 2 }));

      const { watchId } = await manager.watchPosition({ interval: 1000 });
      await manager.clearWatch({ watchId });

      const before = webviewMessages.length;
      await vi.advanceTimersByTimeAsync(3000);
      // No new messages after clearWatch
      expect(webviewMessages.length).toBe(before);
    });

    it("is a no-op for unknown watchId", async () => {
      await expect(
        manager.clearWatch({ watchId: "watch_nonexistent" }),
      ).resolves.toBeUndefined();
    });

    it("only clears the specified watch, leaving others active", async () => {
      mockFetch.mockResolvedValue(makeOkResponse({ lat: 1, lon: 2 }));

      const { watchId: id1 } = await manager.watchPosition({ interval: 1000 });
      const { watchId: id2 } = await manager.watchPosition({ interval: 1000 });

      await manager.clearWatch({ watchId: id1 });
      webviewMessages.length = 0;

      // id1 cleared, id2 still active
      await vi.advanceTimersByTimeAsync(1500);
      const updates = webviewMessages.filter(
        (m) => m.message === "locationUpdate",
      );
      expect(updates.length).toBeGreaterThanOrEqual(1);

      await manager.clearWatch({ watchId: id2 });
    });
  });

  // ── dispose ───────────────────────────────────────────────────────────────

  describe("dispose", () => {
    it("stops all active watch timers", async () => {
      mockFetch.mockResolvedValue(makeOkResponse({ lat: 1, lon: 2 }));

      await manager.watchPosition({ interval: 1000 });
      await manager.watchPosition({ interval: 1000 });

      manager.dispose();

      const msgsBefore = webviewMessages.length;
      await vi.advanceTimersByTimeAsync(3000);
      expect(webviewMessages.length).toBe(msgsBefore);
    });

    it("does not throw when called with no active watches", () => {
      expect(() => manager.dispose()).not.toThrow();
    });

    it("clears sendToWebview reference", async () => {
      manager.dispose();
      // After dispose, setSendToWebview is null — no messages should arrive
      mockFetch.mockResolvedValue(makeOkResponse({ lat: 1, lon: 2 }));
      // Re-create a watch after dispose to verify no crash
      const { watchId } = await manager.watchPosition({ interval: 500 });
      await vi.advanceTimersByTimeAsync(600);
      // Messages array is empty (sendToWebview is null)
      expect(webviewMessages).toHaveLength(0);
      await manager.clearWatch({ watchId });
    });
  });
});

// ── getLocationManager singleton ────────────────────────────────────────────

describe("getLocationManager", () => {
  it("returns the same instance on repeated calls", () => {
    const m1 = getLocationManager();
    const m2 = getLocationManager();
    expect(m1).toBe(m2);
  });
});
