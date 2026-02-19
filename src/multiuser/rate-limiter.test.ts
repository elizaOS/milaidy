import { describe, expect, it } from "vitest";
import { InMemoryRateLimiter } from "./rate-limiter.js";

describe("InMemoryRateLimiter", () => {
  it("allows up to the configured limit and then blocks", () => {
    const limiter = new InMemoryRateLimiter();
    const base = 1_700_000_000_000;

    const a = limiter.check("user:1", 2, 60_000, base);
    const b = limiter.check("user:1", 2, 60_000, base + 1);
    const c = limiter.check("user:1", 2, 60_000, base + 2);

    expect(a.allowed).toBe(true);
    expect(b.allowed).toBe(true);
    expect(c.allowed).toBe(false);
    expect(c.retryAfterSec).toBeGreaterThan(0);
  });

  it("resets after window elapses", () => {
    const limiter = new InMemoryRateLimiter();
    const base = 1_700_000_000_000;

    limiter.check("user:2", 1, 5_000, base);
    const blocked = limiter.check("user:2", 1, 5_000, base + 100);
    const allowedAgain = limiter.check("user:2", 1, 5_000, base + 5_100);

    expect(blocked.allowed).toBe(false);
    expect(allowedAgain.allowed).toBe(true);
  });
});
