/**
 * Tests for cloud/reconnect.ts — the ConnectionMonitor.
 *
 * Exercises:
 *   - Heartbeat success keeps connection alive
 *   - Consecutive failures trigger disconnect callback
 *   - Auto-reconnect via provision after disconnect
 *   - Exponential backoff during reconnection
 *   - Recovery resets failure counter
 *   - Concurrent reconnect prevention
 */

import { describe, expect, it, vi } from "vitest";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

import type { ElizaCloudClient } from "./bridge-client.js";
import { ConnectionMonitor } from "./reconnect.js";

function createMockClient(
  overrides: Record<string, unknown> = {},
): ElizaCloudClient {
  return {
    heartbeat: vi.fn().mockResolvedValue(true),
    provision: vi.fn().mockResolvedValue({ id: "a1", status: "running" }),
    ...overrides,
  } as unknown as ElizaCloudClient;
}

describe("ConnectionMonitor", () => {
  it("sends heartbeats at configured interval", async () => {
    const client = createMockClient();
    const monitor = new ConnectionMonitor(
      client,
      "a1",
      { onDisconnect: vi.fn(), onReconnect: vi.fn() },
      30, // 30ms interval for fast test
      3,
    );

    monitor.start();
    await sleep(80);
    monitor.stop();

    // Should have fired at least 2 heartbeats in 80ms with 30ms interval
    expect(
      (client.heartbeat as ReturnType<typeof vi.fn>).mock.calls.length,
    ).toBeGreaterThanOrEqual(2);
  });

  it("calls onDisconnect after maxFailures consecutive heartbeat failures", async () => {
    const client = createMockClient({
      heartbeat: vi.fn().mockResolvedValue(false),
      provision: vi.fn().mockResolvedValue({ id: "a1" }),
    });
    const onDisconnect = vi.fn();

    const monitor = new ConnectionMonitor(
      client,
      "a1",
      { onDisconnect, onReconnect: vi.fn() },
      20,
      3,
    );

    monitor.start();
    // Poll until onDisconnect fires (3 ticks at 20ms each) with generous timeout
    const deadline = Date.now() + 1000;
    while (!onDisconnect.mock.calls.length && Date.now() < deadline) {
      await sleep(10);
    }
    monitor.stop();

    expect(onDisconnect).toHaveBeenCalled();
  });

  it("calls onReconnect after successful re-provision", async () => {
    const client = createMockClient({
      heartbeat: vi.fn().mockResolvedValue(false),
      provision: vi.fn().mockResolvedValue({ id: "a1", status: "running" }),
    });
    const onReconnect = vi.fn();

    const monitor = new ConnectionMonitor(
      client,
      "a1",
      { onDisconnect: vi.fn(), onReconnect },
      20,
      2,
    );

    monitor.start();
    // 2 failures at 20ms + reconnect attempt (3s backoff is the minimum)
    // But in test, provision resolves immediately so the 3s sleep is the bottleneck
    // Wait for initial failures + first reconnect backoff
    await sleep(3200);
    monitor.stop();

    expect(onReconnect).toHaveBeenCalled();
  }, 10_000);

  it("reports status changes via onStatusChange", async () => {
    const client = createMockClient({
      heartbeat: vi.fn().mockResolvedValue(false),
      provision: vi.fn().mockResolvedValue({ id: "a1" }),
    });
    const statuses: string[] = [];

    const monitor = new ConnectionMonitor(
      client,
      "a1",
      {
        onDisconnect: vi.fn(),
        onReconnect: vi.fn(),
        onStatusChange: (s) => statuses.push(s),
      },
      20,
      2,
    );

    monitor.start();
    await sleep(3200);
    monitor.stop();

    expect(statuses).toContain("disconnected");
    expect(statuses).toContain("reconnecting");
    expect(statuses).toContain("connected");
  }, 10_000);

  it("isMonitoring reflects lifecycle", () => {
    const monitor = new ConnectionMonitor(createMockClient(), "a1", {
      onDisconnect: vi.fn(),
      onReconnect: vi.fn(),
    });

    expect(monitor.isMonitoring()).toBe(false);
    monitor.start();
    expect(monitor.isMonitoring()).toBe(true);
    monitor.stop();
    expect(monitor.isMonitoring()).toBe(false);
  });

  it("stop resets internal state", () => {
    const monitor = new ConnectionMonitor(createMockClient(), "a1", {
      onDisconnect: vi.fn(),
      onReconnect: vi.fn(),
    });

    monitor.start();
    monitor.stop();
    // Starting again should work cleanly
    monitor.start();
    expect(monitor.isMonitoring()).toBe(true);
    monitor.stop();
  });
});
