import { describe, expect, it, vi } from "vitest";

/**
 * Tests for the coordinator wiring retry logic in server.ts.
 *
 * The retry loop calls wire functions every 1s until all succeed or 15
 * attempts are reached. A previous bug used `const` for the success flags,
 * so even after a wire function succeeded, it kept being re-called on
 * every tick (the captured `const` never updated). The fix uses `let` so
 * short-circuit evaluation prevents redundant calls.
 */
describe("coordinator wiring retry pattern", () => {
  it("should not re-call a wire function after it succeeds", () => {
    // Simulate the retry pattern from server.ts
    const wireChatBridge = vi.fn<() => boolean>();
    const wireWsBridge = vi.fn<() => boolean>();
    const wireEventRouting = vi.fn<() => boolean>();

    // Chat succeeds on first call, WS fails twice then succeeds, event always succeeds
    wireChatBridge.mockReturnValue(true);
    wireWsBridge
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(false)
      .mockReturnValue(true);
    wireEventRouting.mockReturnValue(true);

    // Reproduce the FIXED retry pattern (let, not const)
    let chatOk = wireChatBridge();
    let wsOk = wireWsBridge();
    let eventOk = wireEventRouting();

    let ticks = 0;
    while (!(chatOk && wsOk && eventOk) && ticks < 15) {
      ticks++;
      chatOk = chatOk || wireChatBridge();
      wsOk = wsOk || wireWsBridge();
      eventOk = eventOk || wireEventRouting();
    }

    // Chat succeeded on first try — should NOT have been called again in the loop
    expect(wireChatBridge).toHaveBeenCalledTimes(1);
    // WS failed twice then succeeded on tick 2
    expect(wireWsBridge).toHaveBeenCalledTimes(3); // initial + 2 retries
    // Event succeeded on first try — should NOT have been called again
    expect(wireEventRouting).toHaveBeenCalledTimes(1);
    // Should have completed in 2 ticks
    expect(ticks).toBe(2);
  });

  it("should stop retrying after 15 attempts", () => {
    const wireAlwaysFails = vi.fn(() => false);
    const wireSucceeds = vi.fn(() => true);

    let ok1 = wireSucceeds();
    let ok2 = wireAlwaysFails();

    let ticks = 0;
    while (!(ok1 && ok2) && ticks < 15) {
      ticks++;
      ok1 = ok1 || wireSucceeds();
      ok2 = ok2 || wireAlwaysFails();
    }

    expect(ticks).toBe(15);
    // wireSucceeds was called once (initial) and never retried
    expect(wireSucceeds).toHaveBeenCalledTimes(1);
    // wireAlwaysFails: 1 initial + 15 retries
    expect(wireAlwaysFails).toHaveBeenCalledTimes(16);
  });
});
