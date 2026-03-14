import { describe, expect, it } from "vitest";
import { computeStreamingDelta } from "../../packages/app-core/src/state/parsers";

function computeStreamingDeltaLegacy(
  existing: string,
  incoming: string,
): string {
  if (!incoming) return "";
  if (!existing) return incoming;
  if (incoming === existing) return "";
  if (incoming.startsWith(existing)) return incoming.slice(existing.length);
  if (existing.startsWith(incoming)) return "";
  if (incoming.length <= 3) return incoming;

  const maxOverlap = Math.min(existing.length, incoming.length);
  for (let overlap = maxOverlap; overlap > 0; overlap -= 1) {
    if (existing.endsWith(incoming.slice(0, overlap))) {
      const delta = incoming.slice(overlap);
      if (!delta && overlap === incoming.length) return "";
      return delta;
    }
  }
  return incoming;
}

const scenarios = [
  {
    name: "large no-overlap chunk",
    existing: "a".repeat(4096),
    incoming: "c".repeat(4096),
  },
  {
    name: "long partial overlap",
    existing: `prefix-${"x".repeat(4096)}world`,
    incoming: `world!${"y".repeat(512)}`,
  },
];

function measureMs(fn: () => void): number {
  const start = performance.now();
  fn();
  return performance.now() - start;
}

describe("computeStreamingDelta benchmark coverage", () => {
  it("matches the legacy implementation on large benchmark inputs", () => {
    for (const scenario of scenarios) {
      expect(computeStreamingDelta(scenario.existing, scenario.incoming)).toBe(
        computeStreamingDeltaLegacy(scenario.existing, scenario.incoming),
      );
    }
  });

  it("emits timing data for the optimized overlap scan", () => {
    const iterations = 2_000;
    const results = scenarios.map((scenario) => {
      for (let i = 0; i < 200; i += 1) {
        computeStreamingDeltaLegacy(scenario.existing, scenario.incoming);
        computeStreamingDelta(scenario.existing, scenario.incoming);
      }

      const legacyMs = measureMs(() => {
        for (let i = 0; i < iterations; i += 1) {
          computeStreamingDeltaLegacy(scenario.existing, scenario.incoming);
        }
      });

      const optimizedMs = measureMs(() => {
        for (let i = 0; i < iterations; i += 1) {
          computeStreamingDelta(scenario.existing, scenario.incoming);
        }
      });

      return {
        scenario: scenario.name,
        iterations,
        legacyMs: Number(legacyMs.toFixed(2)),
        optimizedMs: Number(optimizedMs.toFixed(2)),
        speedup: Number((legacyMs / optimizedMs).toFixed(2)),
      };
    });

    console.info("[benchmark] computeStreamingDelta", results);

    for (const result of results) {
      expect(result.legacyMs).toBeGreaterThan(0);
      expect(result.optimizedMs).toBeGreaterThan(0);
    }
  });
});
