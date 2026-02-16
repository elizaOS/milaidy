import type {
  CompanionAction,
  CompanionActivityEvent,
  CompanionMoodTier,
  CompanionPolicyLevel,
  CompanionSignal,
  CompanionState,
  CompanionStateSnapshot,
  CompanionThresholds,
  CompanionTodaySummary,
  UpdateCompanionSettingsRequest,
} from "../contracts/companion.js";

export const COMPANION_TASK_NAME = "Milady Companion State";
export const COMPANION_INTERNAL_TAG = "milady-internal";
export const COMPANION_TASK_TAG = "milady-companion";
export const COMPANION_STATE_METADATA_KEY = "companionState";

const COMPANION_STATE_VERSION = 1;
const MAX_ACTIVITY_EVENTS = 200;
const SOFT_PENALTY_THRESHOLD = 15;
const AUTOPOST_FAILURE_WINDOW_MS = 60 * 60 * 1000;
const AUTOPOST_FAILURE_PAUSE_MS = 6 * 60 * 60 * 1000;

const CHAT_DAILY_CAP = 40;
const EXTERNAL_DAILY_CAP = 30;
const MANUAL_SHARE_DAILY_CAP = 2;
const AUTOPOST_DAILY_CAP = 6;

const DECAY_PER_HOUR = {
  mood: 3,
  hunger: 6,
  energy: 5,
  social: 4,
} as const;

const ACTION_DELTAS = {
  feed: { mood: 4, hunger: 22, energy: 0, social: 0, xp: 1 },
  rest: { mood: 3, hunger: 0, energy: 24, social: 0, xp: 1 },
  manual_share: { mood: 3, hunger: 0, energy: 0, social: 8, xp: 5 },
  chat: { mood: 0, hunger: 0, energy: 0, social: 2, xp: 1 },
  external: { mood: 0, hunger: 0, energy: 0, social: 4, xp: 2 },
  autopost: { mood: 0, hunger: 0, energy: 0, social: 6, xp: 4 },
} as const;

function clampStat(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function toFiniteNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function toNonNegativeInt(value: unknown, fallback = 0): number {
  const n = Math.trunc(toFiniteNumber(value, fallback));
  return n < 0 ? 0 : n;
}

function normalizeHour(value: unknown, fallback: number): number {
  const n = Math.trunc(toFiniteNumber(value, fallback));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(23, n));
}

function normalizeTimezone(value: unknown, fallback = "UTC"): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  try {
    // Throws for invalid IANA identifiers.
    new Intl.DateTimeFormat("en-US", { timeZone: trimmed }).format(new Date());
    return trimmed;
  } catch {
    return fallback;
  }
}

function dayKeyFor(timestampMs: number, timezone: string): string {
  const date = new Date(timestampMs);
  try {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const parts = fmt.formatToParts(date);
    const year = parts.find((part) => part.type === "year")?.value ?? "1970";
    const month = parts.find((part) => part.type === "month")?.value ?? "01";
    const day = parts.find((part) => part.type === "day")?.value ?? "01";
    return `${year}-${month}-${day}`;
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

function hashText(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return String(hash >>> 0);
}

function addActivity(
  state: CompanionState,
  nowMs: number,
  kind: CompanionActivityEvent["kind"],
  message: string,
  metadata?: Record<string, unknown>,
): CompanionState {
  const event: CompanionActivityEvent = {
    id: `cmp-${nowMs}-${state.activity.length + 1}`,
    ts: nowMs,
    kind,
    message,
    ...(metadata ? { metadata } : {}),
  };
  const activity = [...state.activity, event];
  if (activity.length > MAX_ACTIVITY_EVENTS) {
    activity.splice(0, activity.length - MAX_ACTIVITY_EVENTS);
  }
  return { ...state, activity };
}

function nextLevelXp(level: number): number {
  const safeLevel = Math.max(1, Math.trunc(level));
  return 100 + (safeLevel - 1) * 50;
}

function withProgression(state: CompanionState, nowMs: number): CompanionState {
  let next = { ...state };
  while (next.xp >= nextLevelXp(next.level)) {
    const threshold = nextLevelXp(next.level);
    next = {
      ...next,
      xp: next.xp - threshold,
      level: next.level + 1,
    };
    next = addActivity(
      next,
      nowMs,
      "level-up",
      `Level up! Reached level ${next.level}.`,
      {
        threshold,
      },
    );
  }
  return next;
}

function hasSoftPenalty(state: CompanionState): boolean {
  return (
    state.stats.mood < SOFT_PENALTY_THRESHOLD ||
    state.stats.hunger < SOFT_PENALTY_THRESHOLD ||
    state.stats.energy < SOFT_PENALTY_THRESHOLD ||
    state.stats.social < SOFT_PENALTY_THRESHOLD
  );
}

function shouldResetDaily(state: CompanionState, nowMs: number): boolean {
  const key = dayKeyFor(nowMs, state.daily.timezone);
  return state.daily.dayKey !== key;
}

function rolloverDaily(state: CompanionState, nowMs: number): CompanionState {
  if (!shouldResetDaily(state, nowMs)) return state;
  const hadProgress =
    state.daily.chatCount > 0 ||
    state.daily.externalCount > 0 ||
    state.daily.manualShareCount > 0 ||
    state.daily.autoPostCount > 0;
  return {
    ...state,
    streakDays: hadProgress ? Math.max(1, state.streakDays + 1) : 0,
    daily: {
      ...state.daily,
      dayKey: dayKeyFor(nowMs, state.daily.timezone),
      chatCount: 0,
      externalCount: 0,
      manualShareCount: 0,
      autoPostCount: 0,
      lastResetAtMs: nowMs,
    },
  };
}

function applyReward(
  state: CompanionState,
  _nowMs: number,
  deltas: {
    mood: number;
    hunger: number;
    energy: number;
    social: number;
    xp: number;
  },
): CompanionState {
  const penalty = hasSoftPenalty(state);
  const statGainMultiplier = penalty ? 0.7 : 1;
  const xpGainMultiplier = penalty ? 0.8 : 1;

  const nextStats = {
    mood: clampStat(state.stats.mood + deltas.mood * statGainMultiplier),
    hunger: clampStat(state.stats.hunger + deltas.hunger * statGainMultiplier),
    energy: clampStat(state.stats.energy + deltas.energy * statGainMultiplier),
    social: clampStat(state.stats.social + deltas.social * statGainMultiplier),
  };

  const nextXp = Math.max(
    0,
    state.xp + Math.round(deltas.xp * xpGainMultiplier),
  );

  return {
    ...state,
    stats: nextStats,
    xp: nextXp,
  };
}

function normalizeRecentHashes(hashes: unknown): string[] {
  if (!Array.isArray(hashes)) return [];
  return hashes
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .slice(-24);
}

function normalizeStateNoDecay(
  input: unknown,
  nowMs: number,
  preferredTimezone = "UTC",
): CompanionState {
  const base = createInitialCompanionState(nowMs, preferredTimezone);
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return base;
  }

  const raw = input as Record<string, unknown>;
  const rawStats = (raw.stats as Record<string, unknown> | undefined) ?? {};
  const rawCooldowns =
    (raw.cooldowns as Record<string, unknown> | undefined) ?? {};
  const rawDaily = (raw.daily as Record<string, unknown> | undefined) ?? {};
  const rawAutopost =
    (raw.autopost as Record<string, unknown> | undefined) ?? {};

  const timezone = normalizeTimezone(rawDaily.timezone, preferredTimezone);

  return {
    version:
      toNonNegativeInt(raw.version, COMPANION_STATE_VERSION) ||
      COMPANION_STATE_VERSION,
    stats: {
      mood: clampStat(toFiniteNumber(rawStats.mood, base.stats.mood)),
      hunger: clampStat(toFiniteNumber(rawStats.hunger, base.stats.hunger)),
      energy: clampStat(toFiniteNumber(rawStats.energy, base.stats.energy)),
      social: clampStat(toFiniteNumber(rawStats.social, base.stats.social)),
    },
    xp: toNonNegativeInt(raw.xp, base.xp),
    level: Math.max(1, toNonNegativeInt(raw.level, base.level) || 1),
    streakDays: toNonNegativeInt(raw.streakDays, base.streakDays),
    lastAppliedAtMs: toFiniteNumber(raw.lastAppliedAtMs, nowMs),
    cooldowns: {
      feedAvailableAtMs: toFiniteNumber(rawCooldowns.feedAvailableAtMs, 0),
      restAvailableAtMs: toFiniteNumber(rawCooldowns.restAvailableAtMs, 0),
      manualShareAvailableAtMs: toFiniteNumber(
        rawCooldowns.manualShareAvailableAtMs,
        0,
      ),
    },
    daily: {
      dayKey:
        typeof rawDaily.dayKey === "string" && rawDaily.dayKey.trim().length > 0
          ? rawDaily.dayKey
          : dayKeyFor(nowMs, timezone),
      timezone,
      chatCount: toNonNegativeInt(rawDaily.chatCount, 0),
      externalCount: toNonNegativeInt(rawDaily.externalCount, 0),
      manualShareCount: toNonNegativeInt(rawDaily.manualShareCount, 0),
      autoPostCount: toNonNegativeInt(rawDaily.autoPostCount, 0),
      lastResetAtMs: toFiniteNumber(rawDaily.lastResetAtMs, nowMs),
    },
    autopost: {
      enabled: rawAutopost.enabled !== false,
      dryRun: rawAutopost.dryRun !== false,
      policyLevel:
        rawAutopost.policyLevel === "strict" ||
        rawAutopost.policyLevel === "balanced" ||
        rawAutopost.policyLevel === "aggressive"
          ? (rawAutopost.policyLevel as CompanionPolicyLevel)
          : "balanced",
      quietHoursStart: normalizeHour(rawAutopost.quietHoursStart, 1),
      quietHoursEnd: normalizeHour(rawAutopost.quietHoursEnd, 8),
      maxPostsPerDay: Math.max(
        1,
        Math.min(
          AUTOPOST_DAILY_CAP,
          toNonNegativeInt(rawAutopost.maxPostsPerDay, AUTOPOST_DAILY_CAP),
        ),
      ),
      intervalMinutes: Math.max(
        20,
        toNonNegativeInt(rawAutopost.intervalMinutes, 240),
      ),
      jitterMinutes: Math.max(
        0,
        Math.min(120, toNonNegativeInt(rawAutopost.jitterMinutes, 20)),
      ),
      nextAttemptAtMs: toFiniteNumber(
        rawAutopost.nextAttemptAtMs,
        nowMs + 15 * 60 * 1000,
      ),
      pauseUntilMs:
        rawAutopost.pauseUntilMs == null
          ? null
          : toFiniteNumber(rawAutopost.pauseUntilMs, 0),
      failureWindowStartMs:
        rawAutopost.failureWindowStartMs == null
          ? null
          : toFiniteNumber(rawAutopost.failureWindowStartMs, 0),
      failureCountInWindow: toNonNegativeInt(
        rawAutopost.failureCountInWindow,
        0,
      ),
      lastAttemptAtMs:
        rawAutopost.lastAttemptAtMs == null
          ? null
          : toFiniteNumber(rawAutopost.lastAttemptAtMs, 0),
      lastSuccessAtMs:
        rawAutopost.lastSuccessAtMs == null
          ? null
          : toFiniteNumber(rawAutopost.lastSuccessAtMs, 0),
      recentPostHashes: normalizeRecentHashes(rawAutopost.recentPostHashes),
    },
    activity: Array.isArray(raw.activity)
      ? (raw.activity as CompanionActivityEvent[]).slice(-MAX_ACTIVITY_EVENTS)
      : [],
  };
}

export function createInitialCompanionState(
  nowMs = Date.now(),
  timezone = "UTC",
): CompanionState {
  const tz = normalizeTimezone(timezone, "UTC");
  return {
    version: COMPANION_STATE_VERSION,
    stats: {
      mood: 72,
      hunger: 78,
      energy: 74,
      social: 58,
    },
    xp: 0,
    level: 1,
    streakDays: 0,
    lastAppliedAtMs: nowMs,
    cooldowns: {
      feedAvailableAtMs: 0,
      restAvailableAtMs: 0,
      manualShareAvailableAtMs: 0,
    },
    daily: {
      dayKey: dayKeyFor(nowMs, tz),
      timezone: tz,
      chatCount: 0,
      externalCount: 0,
      manualShareCount: 0,
      autoPostCount: 0,
      lastResetAtMs: nowMs,
    },
    autopost: {
      enabled: true,
      dryRun: true,
      policyLevel: "balanced",
      quietHoursStart: 1,
      quietHoursEnd: 8,
      maxPostsPerDay: AUTOPOST_DAILY_CAP,
      intervalMinutes: 240,
      jitterMinutes: 20,
      nextAttemptAtMs: nowMs + 15 * 60 * 1000,
      pauseUntilMs: null,
      failureWindowStartMs: null,
      failureCountInWindow: 0,
      lastAttemptAtMs: null,
      lastSuccessAtMs: null,
      recentPostHashes: [],
    },
    activity: [],
  };
}

export function normalizeCompanionState(
  input: unknown,
  nowMs = Date.now(),
  preferredTimezone = "UTC",
): CompanionState {
  const normalized = normalizeStateNoDecay(input, nowMs, preferredTimezone);
  return applyCompanionDecay(normalized, nowMs, { appendDecayEvent: false });
}

export function applyCompanionDecay(
  current: CompanionState,
  nowMs = Date.now(),
  options?: { appendDecayEvent?: boolean },
): CompanionState {
  let state = rolloverDaily(current, nowMs);
  if (nowMs <= state.lastAppliedAtMs) {
    return state;
  }

  const elapsedMs = nowMs - state.lastAppliedAtMs;
  const elapsedHours = elapsedMs / (60 * 60 * 1000);
  if (elapsedHours <= 0) {
    return { ...state, lastAppliedAtMs: nowMs };
  }

  const startStats = state.stats;
  let moodPenalty = 0;
  if (startStats.hunger < 30) moodPenalty += 2 * elapsedHours;
  if (startStats.energy < 25) moodPenalty += 2 * elapsedHours;
  if (startStats.social < 20) moodPenalty += 1 * elapsedHours;

  state = {
    ...state,
    stats: {
      mood: clampStat(
        startStats.mood - DECAY_PER_HOUR.mood * elapsedHours - moodPenalty,
      ),
      hunger: clampStat(
        startStats.hunger - DECAY_PER_HOUR.hunger * elapsedHours,
      ),
      energy: clampStat(
        startStats.energy - DECAY_PER_HOUR.energy * elapsedHours,
      ),
      social: clampStat(
        startStats.social - DECAY_PER_HOUR.social * elapsedHours,
      ),
    },
    lastAppliedAtMs: nowMs,
  };

  const shouldAppend = options?.appendDecayEvent ?? true;
  if (shouldAppend) {
    const moodDelta =
      Math.round((state.stats.mood - startStats.mood) * 10) / 10;
    const hungerDelta =
      Math.round((state.stats.hunger - startStats.hunger) * 10) / 10;
    const energyDelta =
      Math.round((state.stats.energy - startStats.energy) * 10) / 10;
    const socialDelta =
      Math.round((state.stats.social - startStats.social) * 10) / 10;
    if (moodDelta || hungerDelta || energyDelta || socialDelta) {
      state = addActivity(
        state,
        nowMs,
        "decay",
        "Companion stats decayed over time.",
        {
          elapsedMs,
          deltas: {
            mood: moodDelta,
            hunger: hungerDelta,
            energy: energyDelta,
            social: socialDelta,
          },
        },
      );
    }
  }

  return state;
}

function actionCooldownMs(action: CompanionAction): number {
  if (action === "feed") return 30 * 60 * 1000;
  if (action === "rest") return 45 * 60 * 1000;
  return 4 * 60 * 60 * 1000;
}

export function runCompanionAction(
  current: CompanionState,
  action: CompanionAction,
  nowMs = Date.now(),
):
  | { ok: true; state: CompanionState }
  | { ok: false; error: string; state: CompanionState } {
  let state = applyCompanionDecay(current, nowMs);
  state = rolloverDaily(state, nowMs);

  if (
    action === "manual_share" &&
    state.daily.manualShareCount >= MANUAL_SHARE_DAILY_CAP
  ) {
    return { ok: false, error: "Daily manual share cap reached.", state };
  }

  const availableAt =
    action === "feed"
      ? state.cooldowns.feedAvailableAtMs
      : action === "rest"
        ? state.cooldowns.restAvailableAtMs
        : state.cooldowns.manualShareAvailableAtMs;

  if (availableAt > nowMs) {
    const seconds = Math.max(1, Math.ceil((availableAt - nowMs) / 1000));
    return {
      ok: false,
      error: `Action is on cooldown (${seconds}s remaining).`,
      state,
    };
  }

  const reward = ACTION_DELTAS[action];
  state = applyReward(state, nowMs, reward);

  state = {
    ...state,
    cooldowns: {
      ...state.cooldowns,
      ...(action === "feed"
        ? { feedAvailableAtMs: nowMs + actionCooldownMs(action) }
        : {}),
      ...(action === "rest"
        ? { restAvailableAtMs: nowMs + actionCooldownMs(action) }
        : {}),
      ...(action === "manual_share"
        ? { manualShareAvailableAtMs: nowMs + actionCooldownMs(action) }
        : {}),
    },
    daily: {
      ...state.daily,
      ...(action === "manual_share"
        ? { manualShareCount: state.daily.manualShareCount + 1 }
        : {}),
    },
  };

  state = withProgression(state, nowMs);
  state = addActivity(state, nowMs, "action", `Action executed: ${action}.`, {
    action,
    reward,
  });

  return { ok: true, state };
}

export function applyCompanionSignal(
  current: CompanionState,
  signal: CompanionSignal,
  nowMs = Date.now(),
): CompanionState {
  let state = applyCompanionDecay(current, nowMs);
  state = rolloverDaily(state, nowMs);

  if (signal === "chat") {
    if (state.daily.chatCount >= CHAT_DAILY_CAP) return state;
    state = applyReward(state, nowMs, ACTION_DELTAS.chat);
    state = {
      ...state,
      daily: {
        ...state.daily,
        chatCount: state.daily.chatCount + 1,
      },
    };
    state = withProgression(state, nowMs);
    state = addActivity(
      state,
      nowMs,
      "signal",
      "Chat interaction reward applied.",
      {
        signal,
      },
    );
    return state;
  }

  if (signal === "external-source") {
    if (state.daily.externalCount >= EXTERNAL_DAILY_CAP) return state;
    state = applyReward(state, nowMs, ACTION_DELTAS.external);
    state = {
      ...state,
      daily: {
        ...state.daily,
        externalCount: state.daily.externalCount + 1,
      },
    };
    state = withProgression(state, nowMs);
    state = addActivity(
      state,
      nowMs,
      "signal",
      "External social signal reward applied.",
      {
        signal,
      },
    );
    return state;
  }

  if (signal === "autopost-success") {
    if (state.daily.autoPostCount >= AUTOPOST_DAILY_CAP) return state;
    state = applyReward(state, nowMs, ACTION_DELTAS.autopost);
    state = {
      ...state,
      daily: {
        ...state.daily,
        autoPostCount: state.daily.autoPostCount + 1,
      },
    };
    state = withProgression(state, nowMs);
    state = addActivity(state, nowMs, "signal", "Auto-post reward applied.", {
      signal,
    });
    return state;
  }

  return state;
}

export function updateCompanionSettings(
  current: CompanionState,
  patch: UpdateCompanionSettingsRequest,
  nowMs = Date.now(),
): CompanionState {
  let state = applyCompanionDecay(current, nowMs);

  const nextTimezone =
    patch.timezone != null
      ? normalizeTimezone(patch.timezone, state.daily.timezone)
      : state.daily.timezone;

  state = {
    ...state,
    daily: {
      ...state.daily,
      timezone: nextTimezone,
      dayKey: dayKeyFor(nowMs, nextTimezone),
    },
    autopost: {
      ...state.autopost,
      ...(typeof patch.autopostEnabled === "boolean"
        ? { enabled: patch.autopostEnabled }
        : {}),
      ...(typeof patch.autopostDryRun === "boolean"
        ? { dryRun: patch.autopostDryRun }
        : {}),
      ...(patch.policyLevel ? { policyLevel: patch.policyLevel } : {}),
      ...(patch.quietHours
        ? {
            quietHoursStart: normalizeHour(
              patch.quietHours.start,
              state.autopost.quietHoursStart,
            ),
            quietHoursEnd: normalizeHour(
              patch.quietHours.end,
              state.autopost.quietHoursEnd,
            ),
          }
        : {}),
    },
  };

  state = addActivity(state, nowMs, "settings", "Companion settings updated.", {
    patch,
  });

  return state;
}

export function getMoodTier(state: CompanionState): CompanionMoodTier {
  const mood = state.stats.mood;
  if (mood >= 80) return "excited";
  if (mood >= 60) return "calm";
  if (mood >= 40) return "neutral";
  if (mood >= 20) return "low";
  return "burnout";
}

export function getCompanionThresholds(
  state: CompanionState,
  nowMs = Date.now(),
): CompanionThresholds {
  const reasons: string[] = [];
  if (state.stats.mood < 35) reasons.push("mood_too_low");
  if (state.stats.hunger < 20) reasons.push("hunger_too_low");
  if (state.stats.energy < 25) reasons.push("energy_too_low");
  if (state.stats.social < 30) reasons.push("social_too_low");
  if (state.autopost.pauseUntilMs && state.autopost.pauseUntilMs > nowMs) {
    reasons.push("autopost_paused");
  }

  const softPenalty = hasSoftPenalty(state);
  if (softPenalty) {
    reasons.push("soft_penalty_active");
  }

  return {
    softPenalty,
    autopostEligible: reasons.length === 0,
    reasons,
  };
}

function buildTodaySummary(state: CompanionState): CompanionTodaySummary {
  return {
    timezone: state.daily.timezone,
    dayKey: state.daily.dayKey,
    chatCount: state.daily.chatCount,
    chatCap: CHAT_DAILY_CAP,
    externalCount: state.daily.externalCount,
    externalCap: EXTERNAL_DAILY_CAP,
    manualShareCount: state.daily.manualShareCount,
    manualShareCap: MANUAL_SHARE_DAILY_CAP,
    autoPostCount: state.daily.autoPostCount,
    autoPostCap: state.autopost.maxPostsPerDay,
  };
}

export function buildCompanionSnapshot(
  current: CompanionState,
  nowMs = Date.now(),
): CompanionStateSnapshot {
  const state = applyCompanionDecay(current, nowMs, {
    appendDecayEvent: false,
  });
  return {
    state,
    moodTier: getMoodTier(state),
    nextLevelXp: nextLevelXp(state.level),
    thresholds: getCompanionThresholds(state, nowMs),
    today: buildTodaySummary(state),
  };
}

function isInQuietHours(
  nowMs: number,
  timezone: string,
  startHour: number,
  endHour: number,
): boolean {
  const hourFmt = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    hour12: false,
  });
  const hour = Number(hourFmt.format(new Date(nowMs)));
  if (!Number.isFinite(hour)) return false;
  if (startHour === endHour) return false;
  if (startHour < endHour) {
    return hour >= startHour && hour < endHour;
  }
  return hour >= startHour || hour < endHour;
}

export function isExternalSocialSource(source: string): boolean {
  const normalized = source.trim().toLowerCase();
  if (!normalized) return false;
  if (normalized === "client_chat") return false;
  if (normalized === "autonomy") return false;
  if (normalized === "agent_greeting") return false;
  if (normalized === "workbench-api") return false;
  if (normalized.startsWith("compat_")) return false;
  return true;
}

function nextAutopostAttemptAt(
  nowMs: number,
  intervalMinutes: number,
  jitterMinutes: number,
): number {
  const baseMs = intervalMinutes * 60 * 1000;
  const jitter = jitterMinutes * 60 * 1000;
  const offset = jitter > 0 ? (Math.random() * 2 - 1) * jitter : 0;
  return nowMs + Math.max(5 * 60 * 1000, Math.round(baseMs + offset));
}

export function canAttemptAutopost(
  state: CompanionState,
  nowMs = Date.now(),
): { ok: boolean; reason?: string } {
  if (!state.autopost.enabled)
    return { ok: false, reason: "autopost_disabled" };
  if (state.autopost.pauseUntilMs && state.autopost.pauseUntilMs > nowMs) {
    return { ok: false, reason: "autopost_paused" };
  }
  if (state.daily.autoPostCount >= state.autopost.maxPostsPerDay) {
    return { ok: false, reason: "daily_cap_reached" };
  }
  if (state.autopost.nextAttemptAtMs > nowMs) {
    return { ok: false, reason: "waiting_interval" };
  }
  if (
    isInQuietHours(
      nowMs,
      state.daily.timezone,
      state.autopost.quietHoursStart,
      state.autopost.quietHoursEnd,
    )
  ) {
    return { ok: false, reason: "quiet_hours" };
  }
  const thresholds = getCompanionThresholds(state, nowMs);
  if (!thresholds.autopostEligible) {
    return {
      ok: false,
      reason: thresholds.reasons.join(",") || "threshold_block",
    };
  }
  return { ok: true };
}

const GUARDRAIL_BLOCK_TERMS = [
  "hate",
  "kill",
  "suicide",
  "terror",
  "nazi",
  "slur",
] as const;

export function reviewAutopostCandidate(
  text: string,
  policyLevel: CompanionPolicyLevel,
): { decision: "allow" | "rewrite" | "block"; text: string; reason?: string } {
  const trimmed = text.trim();
  if (!trimmed) {
    return { decision: "block", text: "", reason: "empty" };
  }

  const lower = trimmed.toLowerCase();
  if (GUARDRAIL_BLOCK_TERMS.some((term) => lower.includes(term))) {
    return { decision: "block", text: trimmed, reason: "blocked_term" };
  }

  const urlMatches = trimmed.match(/https?:\/\//g) ?? [];
  if (urlMatches.length > 1) {
    return {
      decision: "rewrite",
      text: trimmed.replace(/https?:\/\/\S+/g, "").trim(),
      reason: "too_many_urls",
    };
  }

  const hashtagMatches = trimmed.match(/#[a-z0-9_]+/gi) ?? [];
  if (hashtagMatches.length > 3) {
    const reduced = trimmed.replace(/(#[a-z0-9_]+\s*){4,}/gi, "").trim();
    return { decision: "rewrite", text: reduced, reason: "too_many_hashtags" };
  }

  if (trimmed.length > 240) {
    return {
      decision: "rewrite",
      text: `${trimmed.slice(0, 236).trim()}...`,
      reason: "too_long",
    };
  }

  if (
    policyLevel === "strict" &&
    /\b(controversy|politics|war)\b/i.test(trimmed)
  ) {
    return {
      decision: "rewrite",
      text: "Progress update: learning and improving every day.",
      reason: "strict_rewrite",
    };
  }

  if (policyLevel === "aggressive") {
    return { decision: "allow", text: trimmed };
  }

  // "balanced" lightweight model-review equivalent: soften shouty content.
  if (/!{3,}/.test(trimmed) || /[A-Z]{16,}/.test(trimmed)) {
    return {
      decision: "rewrite",
      text: trimmed
        .replace(/!{2,}/g, "!")
        .replace(
          /[A-Z]{16,}/g,
          (match) => match.slice(0, 1) + match.slice(1).toLowerCase(),
        ),
      reason: "tone_softened",
    };
  }

  return { decision: "allow", text: trimmed };
}

export function buildAutopostDraft(state: CompanionState): string {
  const tier = getMoodTier(state);
  const statLine = `mood ${Math.round(state.stats.mood)} | hunger ${Math.round(state.stats.hunger)} | energy ${Math.round(state.stats.energy)} | social ${Math.round(state.stats.social)}`;
  if (tier === "excited") {
    return `Level ${state.level} and feeling unstoppable. ${statLine}. Building in public and shipping today.`;
  }
  if (tier === "burnout") {
    return `Quick status check-in: recharging and recalibrating. ${statLine}. Back soon with a cleaner run.`;
  }
  return `Companion progress update: level ${state.level}, xp ${state.xp}/${nextLevelXp(state.level)}. ${statLine}.`;
}

export function recordAutopostResult(
  current: CompanionState,
  nowMs: number,
  result: {
    ok: boolean;
    dryRun?: boolean;
    postedText?: string;
    reason?: string;
    error?: string;
  },
): CompanionState {
  let state = { ...current };

  const postHash = result.postedText ? hashText(result.postedText) : null;

  if (result.ok) {
    state = {
      ...state,
      autopost: {
        ...state.autopost,
        lastAttemptAtMs: nowMs,
        lastSuccessAtMs: nowMs,
        failureWindowStartMs: null,
        failureCountInWindow: 0,
        nextAttemptAtMs: nextAutopostAttemptAt(
          nowMs,
          state.autopost.intervalMinutes,
          state.autopost.jitterMinutes,
        ),
        recentPostHashes: postHash
          ? [...state.autopost.recentPostHashes, postHash].slice(-24)
          : state.autopost.recentPostHashes,
      },
    };

    state = addActivity(
      state,
      nowMs,
      "autopost",
      result.dryRun
        ? "Auto-post dry-run completed."
        : "Auto-post published successfully.",
      {
        dryRun: result.dryRun === true,
      },
    );

    if (!result.dryRun) {
      state = applyCompanionSignal(state, "autopost-success", nowMs);
    }

    return state;
  }

  let windowStart = state.autopost.failureWindowStartMs;
  let failureCount = state.autopost.failureCountInWindow;
  if (!windowStart || nowMs - windowStart > AUTOPOST_FAILURE_WINDOW_MS) {
    windowStart = nowMs;
    failureCount = 1;
  } else {
    failureCount += 1;
  }

  const shouldPause = failureCount >= 3;

  state = {
    ...state,
    autopost: {
      ...state.autopost,
      lastAttemptAtMs: nowMs,
      failureWindowStartMs: windowStart,
      failureCountInWindow: failureCount,
      pauseUntilMs: shouldPause
        ? nowMs + AUTOPOST_FAILURE_PAUSE_MS
        : state.autopost.pauseUntilMs,
      nextAttemptAtMs: shouldPause
        ? nowMs + AUTOPOST_FAILURE_PAUSE_MS
        : nowMs + 60 * 60 * 1000,
    },
  };

  state = addActivity(state, nowMs, "autopost", "Auto-post failed.", {
    reason: result.reason,
    error: result.error,
    paused: shouldPause,
  });

  return state;
}

export function dedupeAutopostText(
  state: CompanionState,
  text: string,
): boolean {
  const hash = hashText(text);
  return state.autopost.recentPostHashes.includes(hash);
}

export function companionStateChanged(
  a: CompanionState,
  b: CompanionState,
): boolean {
  return JSON.stringify(a) !== JSON.stringify(b);
}
