import { describe, expect, it } from "vitest";
import {
  type CompanionAnimationSnapshotLike,
  resolveCompanionAnimationIntent,
} from "../../src/components/avatar/companionAnimationIntent";

function createSnapshot(
  overrides?: Partial<CompanionAnimationSnapshotLike>,
): CompanionAnimationSnapshotLike {
  const base: CompanionAnimationSnapshotLike = {
    moodTier: "calm",
    state: {
      stats: {
        mood: 70,
        hunger: 70,
        energy: 70,
        social: 70,
      },
    },
  };

  return {
    ...base,
    ...overrides,
    state: {
      ...base.state,
      ...(overrides?.state ?? {}),
      stats: {
        ...base.state.stats,
        ...(overrides?.state?.stats ?? {}),
      },
    },
  };
}

describe("resolveCompanionAnimationIntent", () => {
  it("falls back to breathing idle when snapshot is missing", () => {
    const intent = resolveCompanionAnimationIntent(null);
    expect(intent?.id).toBe("breathing-idle");
  });

  it("selects fallen idle for critical stats", () => {
    const intent = resolveCompanionAnimationIntent(
      createSnapshot({
        moodTier: "burnout",
        state: {
          stats: {
            mood: 10,
            hunger: 8,
            energy: 12,
            social: 30,
          },
        },
      }),
    );
    expect(intent?.id).toBe("fallen-idle");
  });

  it("selects kneeling idle for low energy/hunger states", () => {
    const intent = resolveCompanionAnimationIntent(
      createSnapshot({
        moodTier: "low",
        state: {
          stats: {
            mood: 28,
            hunger: 24,
            energy: 29,
            social: 45,
          },
        },
      }),
    );
    expect(intent?.id).toBe("kneeling-idle");
  });

  it("selects happy idle for high positive state", () => {
    const intent = resolveCompanionAnimationIntent(
      createSnapshot({
        moodTier: "excited",
        state: {
          stats: {
            mood: 88,
            hunger: 52,
            energy: 76,
            social: 68,
          },
        },
      }),
    );
    expect(intent?.id).toBe("happy-idle");
  });
});
