import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type WirableState,
  type WireCoordinatorOpts,
  wireCoordinatorBridgesWhenReady,
} from "./coordinator-wiring";

function makeMockState(
  overrides?: Partial<WirableState> & {
    getService?: (name: string) => unknown;
  },
): WirableState {
  const broadcastWs = vi.fn();
  const runtime = {
    getService: overrides?.getService ?? (() => null),
  };
  return {
    runtime: (overrides?.runtime === null
      ? null
      : runtime) as WirableState["runtime"],
    broadcastWs: overrides?.broadcastWs ?? broadcastWs,
  };
}

function makeOpts(
  overrides?: Partial<WireCoordinatorOpts>,
): WireCoordinatorOpts {
  return {
    wireChatBridge: overrides?.wireChatBridge ?? vi.fn(() => true),
    wireWsBridge: overrides?.wireWsBridge ?? vi.fn(() => true),
    wireEventRouting: overrides?.wireEventRouting ?? vi.fn(() => true),
    context: overrides?.context ?? "test",
    logger: overrides?.logger ?? { warn: vi.fn(), debug: vi.fn() },
  };
}

describe("wireCoordinatorBridgesWhenReady", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("should wire all bridges immediately when all succeed on first try", async () => {
    const state = makeMockState();
    const opts = makeOpts();

    const result = await wireCoordinatorBridgesWhenReady(state, opts);

    expect(result).toEqual({ chat: true, ws: true, eventRouting: true });
    expect(opts.wireChatBridge).toHaveBeenCalledTimes(1);
    expect(opts.wireWsBridge).toHaveBeenCalledTimes(1);
    expect(opts.wireEventRouting).toHaveBeenCalledTimes(1);
    // No system-warning broadcast
    expect(state.broadcastWs).not.toHaveBeenCalled();
  });

  it("should poll for service then retry successfully", async () => {
    // Service appears after a few polls
    const getService = vi
      .fn<(name: string) => unknown>()
      .mockReturnValueOnce(null)
      .mockReturnValueOnce(null)
      .mockReturnValue({ serviceType: "SWARM_COORDINATOR" });
    const state = makeMockState({ getService });

    // Chat fails initially, succeeds after service loads
    const wireChatBridge = vi
      .fn<() => boolean>()
      .mockReturnValueOnce(false)
      .mockReturnValue(true);
    const wireWsBridge = vi.fn(() => true);
    const wireEventRouting = vi.fn(() => true);
    const opts = makeOpts({ wireChatBridge, wireWsBridge, wireEventRouting });

    const promise = wireCoordinatorBridgesWhenReady(state, opts);

    // Advance past poll intervals (3 polls * 2s = 6s)
    await vi.advanceTimersByTimeAsync(6_000);
    const result = await promise;

    expect(result.chat).toBe(true);
    expect(result.ws).toBe(true);
    expect(result.eventRouting).toBe(true);
    // Chat was called twice: initial + one retry after service found
    expect(wireChatBridge).toHaveBeenCalledTimes(2);
  });

  it("should not broadcast warning when service never appears (not configured)", async () => {
    // Service never loads — getService always returns null
    const state = makeMockState({ getService: () => null });
    const wireChatBridge = vi.fn(() => false);
    const opts = makeOpts({ wireChatBridge });

    const promise = wireCoordinatorBridgesWhenReady(state, opts);

    // Advance past the 90s poll timeout
    await vi.advanceTimersByTimeAsync(92_000);
    const result = await promise;

    expect(result.chat).toBe(false);
    // No system-warning broadcast — silent timeout is expected when plugin not loaded
    expect(state.broadcastWs).not.toHaveBeenCalled();
  });

  it("should handle null runtime gracefully", async () => {
    const broadcastWs = vi.fn();
    const state: WirableState = {
      runtime: null,
      broadcastWs,
    };
    const wireChatBridge = vi.fn(() => false);
    const warnFn = vi.fn();
    const opts = makeOpts({
      wireChatBridge,
      logger: { warn: warnFn, debug: vi.fn() },
    });

    const result = await wireCoordinatorBridgesWhenReady(state, opts);

    expect(result.chat).toBe(false);
    // No broadcast — just a log
    expect(broadcastWs).not.toHaveBeenCalled();
    expect(warnFn).toHaveBeenCalledWith(expect.stringContaining("no runtime"));
  });

  it("should not re-call a bridge that already succeeded during retries", async () => {
    // Service appears immediately on first poll
    const getService = vi.fn(() => ({ serviceType: "SWARM_COORDINATOR" }));
    const state = makeMockState({ getService });

    // Chat succeeds immediately, ws/event fail initially
    const wireChatBridge = vi.fn(() => true);
    const wireWsBridge = vi
      .fn<() => boolean>()
      .mockReturnValueOnce(false)
      .mockReturnValue(true);
    const wireEventRouting = vi
      .fn<() => boolean>()
      .mockReturnValueOnce(false)
      .mockReturnValue(true);
    const opts = makeOpts({ wireChatBridge, wireWsBridge, wireEventRouting });

    const promise = wireCoordinatorBridgesWhenReady(state, opts);
    // Advance past poll interval
    await vi.advanceTimersByTimeAsync(3_000);
    const result = await promise;

    expect(result).toEqual({ chat: true, ws: true, eventRouting: true });
    // Chat succeeded on first try — should NOT be retried
    expect(wireChatBridge).toHaveBeenCalledTimes(1);
    // WS/event: initial + 1 retry
    expect(wireWsBridge).toHaveBeenCalledTimes(2);
    expect(wireEventRouting).toHaveBeenCalledTimes(2);
  });

  it("should exhaust retries and warn when wiring always fails after service load", async () => {
    // Service appears immediately
    const getService = vi.fn(() => ({ serviceType: "SWARM_COORDINATOR" }));
    const state = makeMockState({ getService });

    // All bridges always fail
    const wireChatBridge = vi.fn(() => false);
    const wireWsBridge = vi.fn(() => false);
    const wireEventRouting = vi.fn(() => false);
    const opts = makeOpts({ wireChatBridge, wireWsBridge, wireEventRouting });

    const promise = wireCoordinatorBridgesWhenReady(state, opts);
    // Advance timers: poll interval (2s) + retry delays (5 * 500ms)
    await vi.advanceTimersByTimeAsync(5_000);
    const result = await promise;

    expect(result).toEqual({ chat: false, ws: false, eventRouting: false });
    // initial (1) + 5 retries = 6
    expect(wireChatBridge).toHaveBeenCalledTimes(6);
    expect(state.broadcastWs).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "system-warning",
        message: expect.stringContaining("retries exhausted"),
      }),
    );
  });
});
