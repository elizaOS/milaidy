import { describe, expect, it } from "vitest";
import {
  applyCompanionDecay,
  applyCompanionSignal,
  buildCompanionSnapshot,
  canAttemptAutopost,
  createInitialCompanionState,
  dedupeAutopostText,
  isExternalSocialSource,
  normalizeCompanionState,
  recordAutopostResult,
  reviewAutopostCandidate,
  runCompanionAction,
  updateCompanionSettings,
} from "./companion-engine.js";

describe("companion-engine", () => {
  it("creates expected default state", () => {
    const state = createInitialCompanionState(1_700_000_000_000, "Asia/Taipei");
    expect(state.stats).toEqual({
      mood: 72,
      hunger: 78,
      energy: 74,
      social: 58,
    });
    expect(state.level).toBe(1);
    expect(state.xp).toBe(0);
    expect(state.autopost.maxPostsPerDay).toBe(6);
    expect(state.daily.timezone).toBe("Asia/Taipei");
  });

  it("applies offline decay including threshold-based mood penalty", () => {
    const base = createInitialCompanionState(1_000);
    const state = {
      ...base,
      stats: {
        mood: 72,
        hunger: 29,
        energy: 24,
        social: 19,
      },
      lastAppliedAtMs: 0,
    };

    const decayed = applyCompanionDecay(state, 60 * 60 * 1000);
    expect(Math.round(decayed.stats.hunger)).toBe(23);
    expect(Math.round(decayed.stats.energy)).toBe(19);
    expect(Math.round(decayed.stats.social)).toBe(15);
    // base mood decay 3 + penalties 2 + 2 + 1 = 8
    expect(Math.round(decayed.stats.mood)).toBe(64);
  });

  it("enforces feed cooldown and manual_share daily cap", () => {
    // Use a fixed noon timestamp to avoid accidental day rollover during +8h checks.
    const now = Date.UTC(2026, 1, 16, 12, 0, 0);
    let state = createInitialCompanionState(now);

    const feed = runCompanionAction(state, "feed", now);
    expect(feed.ok).toBe(true);
    state = feed.state;

    const feedAgain = runCompanionAction(state, "feed", now + 5 * 60 * 1000);
    expect(feedAgain.ok).toBe(false);

    const share1 = runCompanionAction(state, "manual_share", now);
    expect(share1.ok).toBe(true);
    state = share1.state;

    const share2 = runCompanionAction(
      state,
      "manual_share",
      now + 4 * 60 * 60 * 1000 + 1_000,
    );
    expect(share2.ok).toBe(true);
    state = share2.state;

    const share3 = runCompanionAction(
      state,
      "manual_share",
      now + 8 * 60 * 60 * 1000 + 2_000,
    );
    expect(share3.ok).toBe(false);
    expect(share3.error).toContain("Daily manual share cap reached");
  });

  it("caps daily chat/external/autopost rewards", () => {
    let state = createInitialCompanionState(1_700_000_000_000);

    for (let i = 0; i < 60; i++) {
      state = applyCompanionSignal(state, "chat", 1_700_000_000_000 + i);
    }
    expect(state.daily.chatCount).toBe(40);

    for (let i = 0; i < 50; i++) {
      state = applyCompanionSignal(
        state,
        "external-source",
        1_700_000_001_000 + i,
      );
    }
    expect(state.daily.externalCount).toBe(30);

    for (let i = 0; i < 12; i++) {
      state = applyCompanionSignal(
        state,
        "autopost-success",
        1_700_000_002_000 + i,
      );
    }
    expect(state.daily.autoPostCount).toBe(6);
  });

  it("applies soft-penalty multipliers and blocks autopost eligibility", () => {
    const now = 1_700_000_000_000;
    const base = createInitialCompanionState(now);
    const low = {
      ...base,
      stats: {
        ...base.stats,
        mood: 10,
      },
      autopost: {
        ...base.autopost,
        nextAttemptAtMs: now - 1_000,
      },
    };

    const share = runCompanionAction(low, "manual_share", now);
    expect(share.ok).toBe(true);
    if (!share.ok) return;
    expect(share.state.xp).toBe(4); // 5 * 0.8 rounded
    expect(share.state.stats.social).toBeCloseTo(58 + 8 * 0.7, 6);

    const gate = canAttemptAutopost(share.state, now + 10_000);
    expect(gate.ok).toBe(false);
    expect(gate.reason).toContain("soft_penalty_active");
  });

  it("levels up with xp carry-over", () => {
    const now = 1_700_000_000_000;
    const base = createInitialCompanionState(now);
    const seeded = {
      ...base,
      level: 1,
      xp: 99,
    };

    const next = applyCompanionSignal(seeded, "external-source", now + 1_000);
    expect(next.level).toBe(2);
    expect(next.xp).toBe(1);
  });

  it("resets daily bucket using configured timezone", () => {
    const now = Date.UTC(2026, 1, 16, 2, 0, 0); // 2026-02-16 02:00:00 UTC
    const before = now - 26 * 60 * 60 * 1000;
    const base = createInitialCompanionState(before, "Asia/Tokyo");
    const seeded = {
      ...base,
      streakDays: 2,
      daily: {
        ...base.daily,
        chatCount: 5,
        externalCount: 3,
        manualShareCount: 1,
        autoPostCount: 1,
      },
    };

    const after = applyCompanionDecay(seeded, now);
    expect(after.daily.chatCount).toBe(0);
    expect(after.daily.externalCount).toBe(0);
    expect(after.daily.manualShareCount).toBe(0);
    expect(after.daily.autoPostCount).toBe(0);
    expect(after.daily.dayKey).not.toBe(seeded.daily.dayKey);
    expect(after.streakDays).toBe(3);
  });

  it("supports settings updates and snapshot generation", () => {
    const now = 1_700_000_000_000;
    const base = createInitialCompanionState(now, "UTC");
    const updated = updateCompanionSettings(
      base,
      {
        timezone: "America/Los_Angeles",
        autopostEnabled: false,
        autopostDryRun: false,
        quietHours: { start: 2, end: 9 },
        policyLevel: "strict",
      },
      now,
    );

    expect(updated.daily.timezone).toBe("America/Los_Angeles");
    expect(updated.autopost.enabled).toBe(false);
    expect(updated.autopost.dryRun).toBe(false);
    expect(updated.autopost.policyLevel).toBe("strict");
    expect(updated.autopost.quietHoursStart).toBe(2);
    expect(updated.autopost.quietHoursEnd).toBe(9);

    const snapshot = buildCompanionSnapshot(updated, now + 5000);
    expect(snapshot.state.level).toBeGreaterThanOrEqual(1);
    expect(snapshot.today.chatCap).toBe(40);
  });

  it("reviews and deduplicates autopost text", () => {
    const reviewed = reviewAutopostCandidate(
      "THIS IS A VERY LONG LOUD POST!!!!!!!!!!!!",
      "balanced",
    );
    expect(["allow", "rewrite", "block"]).toContain(reviewed.decision);

    const blocked = reviewAutopostCandidate(
      "I want to kill this feature",
      "balanced",
    );
    expect(blocked.decision).toBe("block");

    const state = createInitialCompanionState(1_700_000_000_000);
    const success = recordAutopostResult(state, 1_700_000_000_100, {
      ok: true,
      postedText: "daily status update",
    });
    expect(dedupeAutopostText(success, "daily status update")).toBe(true);
    expect(dedupeAutopostText(success, "another post")).toBe(false);
  });

  it("pauses autopost after three failures within one hour", () => {
    const t0 = 1_700_000_000_000;
    let state = createInitialCompanionState(t0);

    state = recordAutopostResult(state, t0 + 1_000, {
      ok: false,
      reason: "network",
      error: "timeout",
    });
    state = recordAutopostResult(state, t0 + 2_000, {
      ok: false,
      reason: "network",
      error: "timeout",
    });
    state = recordAutopostResult(state, t0 + 3_000, {
      ok: false,
      reason: "rate_limit",
      error: "429",
    });

    expect(state.autopost.failureCountInWindow).toBe(3);
    expect(state.autopost.pauseUntilMs).not.toBeNull();
    expect(
      (state.autopost.pauseUntilMs ?? 0) - (t0 + 3_000),
    ).toBeGreaterThanOrEqual(6 * 60 * 60 * 1000);
  });

  it("classifies external social sources and normalizes persisted states", () => {
    expect(isExternalSocialSource("client_chat")).toBe(false);
    expect(isExternalSocialSource("autonomy")).toBe(false);
    expect(isExternalSocialSource("compat_openai")).toBe(false);
    expect(isExternalSocialSource("telegram")).toBe(true);

    const normalized = normalizeCompanionState(
      {
        stats: { mood: 500, hunger: -20, energy: 42, social: 35 },
        autopost: { maxPostsPerDay: 999 },
      },
      1_700_000_000_000,
      "UTC",
    );

    expect(normalized.stats.mood).toBe(100);
    expect(normalized.stats.hunger).toBe(0);
    expect(normalized.autopost.maxPostsPerDay).toBe(6);
  });
});
