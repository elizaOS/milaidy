import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type WirableState,
  type WireCoordinatorOpts,
  wireCoordinatorBridgesWhenReady,
} from "./coordinator-wiring";

function makeMockState(
  overrides?: Partial<WirableState> & {
    getServiceLoadPromise?: (name: string) => Promise<void>;
  },
): WirableState {
  const broadcastWs = vi.fn();
  const runtime = {
    getServiceLoadPromise:
      overrides?.getServiceLoadPromise ?? (() => new Promise<void>(() => {})),
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
    const state = makeMockState({
      getServiceLoadPromise: () => Promise.resolve(),
    });
    const opts = makeOpts();

    const result = await wireCoordinatorBridgesWhenReady(state, opts);

    expect(result).toEqual({ chat: true, ws: true, eventRouting: true });
    expect(opts.wireChatBridge).toHaveBeenCalledTimes(1);
    expect(opts.wireWsBridge).toHaveBeenCalledTimes(1);
    expect(opts.wireEventRouting).toHaveBeenCalledTimes(1);
    // No system-warning broadcast
    expect(state.broadcastWs).not.toHaveBeenCalled();
  });

  it("should wait for service load promise then retry successfully", async () => {
    let resolveService!: () => void;
    const servicePromise = new Promise<void>((r) => {
      resolveService = r;
    });
    const state = makeMockState({
      getServiceLoadPromise: () => servicePromise,
    });

    // Chat fails initially, succeeds after service loads
    const wireChatBridge = vi
      .fn<() => boolean>()
      .mockReturnValueOnce(false)
      .mockReturnValue(true);
    const wireWsBridge = vi.fn(() => true);
    const wireEventRouting = vi.fn(() => true);
    const opts = makeOpts({ wireChatBridge, wireWsBridge, wireEventRouting });

    const promise = wireCoordinatorBridgesWhenReady(state, opts);

    // Service loads
    resolveService();
    const result = await promise;

    expect(result.chat).toBe(true);
    expect(result.ws).toBe(true);
    expect(result.eventRouting).toBe(true);
    // Chat was called twice: initial + one retry after service load
    expect(wireChatBridge).toHaveBeenCalledTimes(2);
    // WS/event succeeded initially and should not be retried
    expect(wireWsBridge).toHaveBeenCalledTimes(1);
    expect(wireEventRouting).toHaveBeenCalledTimes(1);
  });

  it("should broadcast system-warning on timeout", async () => {
    // Service never resolves
    const state = makeMockState({
      getServiceLoadPromise: () => new Promise<void>(() => {}),
    });
    const wireChatBridge = vi.fn(() => false);
    const opts = makeOpts({ wireChatBridge });

    const promise = wireCoordinatorBridgesWhenReady(state, opts);

    // Advance past the 60s timeout
    await vi.advanceTimersByTimeAsync(61_000);
    const result = await promise;

    expect(result.chat).toBe(false);
    expect(state.broadcastWs).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "system-warning",
        message: expect.stringContaining("service load timed out"),
      }),
    );
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

    // Bridges fail because runtime is null
    expect(result.chat).toBe(false);
    // System-warning broadcast about missing runtime
    expect(broadcastWs).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "system-warning",
        message: expect.stringContaining("no runtime or getServiceLoadPromise"),
      }),
    );
    expect(warnFn).toHaveBeenCalled();
  });

  it("should not re-call a bridge that already succeeded during retries", async () => {
    let resolveService!: () => void;
    const servicePromise = new Promise<void>((r) => {
      resolveService = r;
    });
    const state = makeMockState({
      getServiceLoadPromise: () => servicePromise,
    });

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
    resolveService();
    const result = await promise;

    expect(result).toEqual({ chat: true, ws: true, eventRouting: true });
    // Chat succeeded on first try — should NOT be retried
    expect(wireChatBridge).toHaveBeenCalledTimes(1);
    // WS/event: initial + 1 retry
    expect(wireWsBridge).toHaveBeenCalledTimes(2);
    expect(wireEventRouting).toHaveBeenCalledTimes(2);
  });

  it("should exhaust retries and warn when wiring always fails after service load", async () => {
    const state = makeMockState({
      getServiceLoadPromise: () => Promise.resolve(),
    });

    // All bridges always fail
    const wireChatBridge = vi.fn(() => false);
    const wireWsBridge = vi.fn(() => false);
    const wireEventRouting = vi.fn(() => false);
    const opts = makeOpts({ wireChatBridge, wireWsBridge, wireEventRouting });

    const promise = wireCoordinatorBridgesWhenReady(state, opts);
    // Advance timers to cover all retry delays (5 retries * 500ms)
    await vi.advanceTimersByTimeAsync(3_000);
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
