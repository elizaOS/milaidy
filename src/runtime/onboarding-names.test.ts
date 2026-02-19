import { describe, expect, it } from "vitest";
import { AGENT_NAME_POOL, pickRandomNames } from "./onboarding-names";

describe("AGENT_NAME_POOL", () => {
  it("is a non-empty array of strings", () => {
    expect(Array.isArray(AGENT_NAME_POOL)).toBe(true);
    expect(AGENT_NAME_POOL.length).toBeGreaterThan(0);
    for (const name of AGENT_NAME_POOL) {
      expect(typeof name).toBe("string");
    }
  });
});

describe("pickRandomNames", () => {
  it("returns empty array for count=0", () => {
    expect(pickRandomNames(0)).toEqual([]);
  });

  it("returns exactly 5 names for count=5", () => {
    expect(pickRandomNames(5)).toHaveLength(5);
  });

  it("returns all unique names for count=5", () => {
    const names = pickRandomNames(5);
    expect(new Set(names).size).toBe(names.length);
  });

  it("clamps to pool length when count exceeds pool size", () => {
    const names = pickRandomNames(999);
    expect(names).toHaveLength(AGENT_NAME_POOL.length);
  });

  it("all returned names are from the pool", () => {
    const poolSet = new Set(AGENT_NAME_POOL);
    const names = pickRandomNames(10);
    for (const name of names) {
      expect(poolSet.has(name)).toBe(true);
    }
  });

  it("pickRandomNames(AGENT_NAME_POOL.length) returns all names", () => {
    const names = pickRandomNames(AGENT_NAME_POOL.length);
    expect(names).toHaveLength(AGENT_NAME_POOL.length);
    expect(new Set(names)).toEqual(new Set(AGENT_NAME_POOL));
  });
});
