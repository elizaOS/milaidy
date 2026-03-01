/**
 * Tests for the memory monitoring infrastructure.
 * Tests the standalone startMemoryLeakDetector function which doesn't require React.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the Performance API memory interface
const mockMemory = {
  usedJSHeapSize: 50 * 1024 * 1024, // 50 MB
  totalJSHeapSize: 100 * 1024 * 1024, // 100 MB
  jsHeapSizeLimit: 2048 * 1024 * 1024, // 2 GB
};

// Store original performance object
const originalPerformance = globalThis.performance;

describe("startMemoryLeakDetector", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "performance", {
      value: {
        ...originalPerformance,
        memory: { ...mockMemory },
      },
      writable: true,
      configurable: true,
    });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(globalThis, "performance", {
      value: originalPerformance,
      writable: true,
      configurable: true,
    });
  });

  it("returns a cleanup function", async () => {
    const { startMemoryLeakDetector } = await import(
      "../../src/hooks/useMemoryMonitor"
    );

    const stop = startMemoryLeakDetector();
    expect(typeof stop).toBe("function");
    stop();
  });

  it("calls onLeak callback when leak is detected", async () => {
    const { startMemoryLeakDetector } = await import(
      "../../src/hooks/useMemoryMonitor"
    );

    const onLeak = vi.fn();
    let currentHeap = 50 * 1024 * 1024;

    const stop = startMemoryLeakDetector({
      intervalMs: 1000,
      thresholdMbPerMin: 1.0,
      onLeak,
    });

    // Simulate rapid memory growth
    for (let i = 0; i < 10; i++) {
      currentHeap += 100 * 1024 * 1024; // 100 MB per second = massive leak
      (performance as { memory: typeof mockMemory }).memory.usedJSHeapSize =
        currentHeap;
      vi.advanceTimersByTime(1000);
    }

    expect(onLeak).toHaveBeenCalled();
    stop();
  });

  it("stops monitoring when cleanup is called", async () => {
    const { startMemoryLeakDetector } = await import(
      "../../src/hooks/useMemoryMonitor"
    );

    const onLeak = vi.fn();
    let currentHeap = 50 * 1024 * 1024;

    const stop = startMemoryLeakDetector({
      intervalMs: 1000,
      thresholdMbPerMin: 1.0,
      onLeak,
    });

    // Stop immediately
    stop();

    // Simulate rapid memory growth after stop
    for (let i = 0; i < 10; i++) {
      currentHeap += 100 * 1024 * 1024;
      (performance as { memory: typeof mockMemory }).memory.usedJSHeapSize =
        currentHeap;
      vi.advanceTimersByTime(1000);
    }

    // onLeak should not have been called since we stopped
    expect(onLeak).not.toHaveBeenCalled();
  });

  it("respects custom threshold - high threshold prevents detection", async () => {
    const { startMemoryLeakDetector } = await import(
      "../../src/hooks/useMemoryMonitor"
    );

    const onLeak = vi.fn();
    let currentHeap = 50 * 1024 * 1024;

    // Set very high threshold
    const stop = startMemoryLeakDetector({
      intervalMs: 1000,
      thresholdMbPerMin: 100000.0, // Impossibly high threshold
      onLeak,
    });

    // Simulate rapid memory growth
    for (let i = 0; i < 10; i++) {
      currentHeap += 100 * 1024 * 1024;
      (performance as { memory: typeof mockMemory }).memory.usedJSHeapSize =
        currentHeap;
      vi.advanceTimersByTime(1000);
    }

    // Should not trigger because threshold is too high
    expect(onLeak).not.toHaveBeenCalled();
    stop();
  });

  it("handles missing memory API gracefully", async () => {
    // Remove memory property entirely
    Object.defineProperty(globalThis, "performance", {
      value: { ...originalPerformance },
      writable: true,
      configurable: true,
    });

    const { startMemoryLeakDetector } = await import(
      "../../src/hooks/useMemoryMonitor"
    );

    const onLeak = vi.fn();
    const stop = startMemoryLeakDetector({
      intervalMs: 1000,
      onLeak,
    });

    // Advance time - should not crash
    vi.advanceTimersByTime(10000);

    // onLeak should not be called since memory API isn't available
    expect(onLeak).not.toHaveBeenCalled();

    stop();
  });

  it("reports correct memory values in onLeak callback", async () => {
    const { startMemoryLeakDetector } = await import(
      "../../src/hooks/useMemoryMonitor"
    );

    let capturedInfo: { mbPerMinute: number; currentMb: number } | null = null;
    let currentHeap = 50 * 1024 * 1024;

    const stop = startMemoryLeakDetector({
      intervalMs: 1000,
      thresholdMbPerMin: 1.0,
      onLeak: (info) => {
        capturedInfo = info;
      },
    });

    // Simulate rapid memory growth
    for (let i = 0; i < 10; i++) {
      currentHeap += 100 * 1024 * 1024;
      (performance as { memory: typeof mockMemory }).memory.usedJSHeapSize =
        currentHeap;
      vi.advanceTimersByTime(1000);
    }

    expect(capturedInfo).not.toBeNull();
    expect(capturedInfo!.mbPerMinute).toBeGreaterThan(0);
    expect(capturedInfo!.currentMb).toBeGreaterThan(50); // Should be greater than initial
    stop();
  });

  it("requires minimum samples before detecting leak", async () => {
    const { startMemoryLeakDetector } = await import(
      "../../src/hooks/useMemoryMonitor"
    );

    const onLeak = vi.fn();
    let currentHeap = 50 * 1024 * 1024;

    const stop = startMemoryLeakDetector({
      intervalMs: 1000,
      thresholdMbPerMin: 1.0,
      onLeak,
    });

    // Only advance 3 times (less than the minimum 6 samples needed)
    for (let i = 0; i < 3; i++) {
      currentHeap += 100 * 1024 * 1024;
      (performance as { memory: typeof mockMemory }).memory.usedJSHeapSize =
        currentHeap;
      vi.advanceTimersByTime(1000);
    }

    // Should not trigger yet - not enough samples
    expect(onLeak).not.toHaveBeenCalled();

    // Continue to get enough samples
    for (let i = 0; i < 5; i++) {
      currentHeap += 100 * 1024 * 1024;
      (performance as { memory: typeof mockMemory }).memory.usedJSHeapSize =
        currentHeap;
      vi.advanceTimersByTime(1000);
    }

    // Now should have triggered
    expect(onLeak).toHaveBeenCalled();
    stop();
  });
});

describe("memory leak detection edge cases", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "performance", {
      value: {
        ...originalPerformance,
        memory: { ...mockMemory },
      },
      writable: true,
      configurable: true,
    });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(globalThis, "performance", {
      value: originalPerformance,
      writable: true,
      configurable: true,
    });
  });

  it("handles stable memory (no growth)", async () => {
    const { startMemoryLeakDetector } = await import(
      "../../src/hooks/useMemoryMonitor"
    );

    const onLeak = vi.fn();
    // Memory stays constant
    (performance as { memory: typeof mockMemory }).memory.usedJSHeapSize =
      50 * 1024 * 1024;

    const stop = startMemoryLeakDetector({
      intervalMs: 1000,
      thresholdMbPerMin: 1.0,
      onLeak,
    });

    // Advance time without changing memory
    for (let i = 0; i < 20; i++) {
      vi.advanceTimersByTime(1000);
    }

    // Should not detect leak with stable memory
    expect(onLeak).not.toHaveBeenCalled();
    stop();
  });

  it("handles decreasing memory (GC occurring)", async () => {
    const { startMemoryLeakDetector } = await import(
      "../../src/hooks/useMemoryMonitor"
    );

    const onLeak = vi.fn();
    let currentHeap = 500 * 1024 * 1024; // Start high

    const stop = startMemoryLeakDetector({
      intervalMs: 1000,
      thresholdMbPerMin: 1.0,
      onLeak,
    });

    // Simulate memory decreasing (GC running)
    for (let i = 0; i < 10; i++) {
      currentHeap -= 20 * 1024 * 1024; // Memory decreases
      (performance as { memory: typeof mockMemory }).memory.usedJSHeapSize =
        currentHeap;
      vi.advanceTimersByTime(1000);
    }

    // Should not detect leak when memory is decreasing
    expect(onLeak).not.toHaveBeenCalled();
    stop();
  });

  it("multiple detectors can run independently", async () => {
    const { startMemoryLeakDetector } = await import(
      "../../src/hooks/useMemoryMonitor"
    );

    const onLeak1 = vi.fn();
    const onLeak2 = vi.fn();
    let currentHeap = 50 * 1024 * 1024;

    const stop1 = startMemoryLeakDetector({
      intervalMs: 1000,
      thresholdMbPerMin: 1.0,
      onLeak: onLeak1,
    });

    const stop2 = startMemoryLeakDetector({
      intervalMs: 1000,
      thresholdMbPerMin: 1.0,
      onLeak: onLeak2,
    });

    // Simulate memory growth
    for (let i = 0; i < 10; i++) {
      currentHeap += 100 * 1024 * 1024;
      (performance as { memory: typeof mockMemory }).memory.usedJSHeapSize =
        currentHeap;
      vi.advanceTimersByTime(1000);
    }

    // Both should have detected the leak
    expect(onLeak1).toHaveBeenCalled();
    expect(onLeak2).toHaveBeenCalled();

    stop1();
    stop2();
  });
});
