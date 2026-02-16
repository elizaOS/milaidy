import { describe, expect, it } from "vitest";
import type { CompanionStateSnapshot } from "../../src/api-client";
import { resolveCompanionAnimationIntent } from "../../src/components/avatar/companionAnimationIntent";

function createSnapshot(
  overrides?: Partial<CompanionStateSnapshot>,
): CompanionStateSnapshot {
  const base: CompanionStateSnapshot = {
    moodTier: "calm",
    nextLevelXp: 100,
    thresholds: {
      softPenalty: false,
      autopostEligible: true,
      reasons: [],
    },
    today: {
      timezone: "UTC",
      dayKey: "2026-02-16",
      chatCount: 0,
      chatCap: 40,
      externalCount: 0,
      externalCap: 30,
      manualShareCount: 0,
      manualShareCap: 2,
      autoPostCount: 0,
      autoPostCap: 6,
    },
    state: {
      version: 1,
      stats: {
        mood: 70,
        hunger: 70,
        energy: 70,
        social: 70,
      },
      xp: 0,
      level: 1,
      streakDays: 0,
      lastAppliedAtMs: Date.now(),
      cooldowns: {
        feedAvailableAtMs: 0,
        restAvailableAtMs: 0,
        manualShareAvailableAtMs: 0,
      },
      daily: {
        dayKey: "2026-02-16",
        timezone: "UTC",
        chatCount: 0,
        externalCount: 0,
        manualShareCount: 0,
        autoPostCount: 0,
        lastResetAtMs: Date.now(),
      },
      autopost: {
        enabled: true,
        dryRun: true,
        policyLevel: "balanced",
        quietHoursStart: 1,
        quietHoursEnd: 8,
        maxPostsPerDay: 6,
        intervalMinutes: 240,
        jitterMinutes: 20,
        nextAttemptAtMs: Date.now(),
        pauseUntilMs: null,
        failureWindowStartMs: null,
        failureCountInWindow: 0,
        lastAttemptAtMs: null,
        lastSuccessAtMs: null,
        recentPostHashes: [],
      },
      activity: [],
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
        } as CompanionStateSnapshot["state"],
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
        } as CompanionStateSnapshot["state"],
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
        } as CompanionStateSnapshot["state"],
      }),
    );
    expect(intent?.id).toBe("happy-idle");
  });
});
