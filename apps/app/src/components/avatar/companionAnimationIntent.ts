import { MIXAMO_ANIMATION_BY_ID } from "./mixamoAnimationCatalog";

export type AvatarMoodTier =
  | "excited"
  | "calm"
  | "neutral"
  | "low"
  | "burnout";

interface AvatarStatsLike {
  mood?: number;
  hunger?: number;
  energy?: number;
  social?: number;
}

export interface CompanionAnimationSnapshotLike {
  moodTier?: AvatarMoodTier;
  stats?: AvatarStatsLike;
  state?: {
    stats?: AvatarStatsLike;
  };
}

export interface CompanionAnimationIntent {
  id: string;
  url: string;
  loop: boolean;
  durationSec: number;
  reason: string;
}

const DEFAULT_INTENT_ID = "breathing-idle";

function pickIntentIdAndReason(
  snapshot: CompanionAnimationSnapshotLike | null | undefined,
): { id: string; reason: string } {
  if (!snapshot) {
    return { id: DEFAULT_INTENT_ID, reason: "snapshot_missing" };
  }

  const stats = snapshot.state?.stats ?? snapshot.stats ?? {};
  const mood = typeof stats.mood === "number" ? stats.mood : 50;
  const hunger = typeof stats.hunger === "number" ? stats.hunger : 50;
  const energy = typeof stats.energy === "number" ? stats.energy : 50;
  const social = typeof stats.social === "number" ? stats.social : 50;
  const tier = snapshot.moodTier ?? "neutral";

  if (tier === "burnout" || energy < 18 || hunger < 12) {
    return { id: "fallen-idle", reason: "critical_core_stats" };
  }

  if (tier === "low" || energy < 30 || hunger < 25) {
    return { id: "kneeling-idle", reason: "low_energy_or_hunger" };
  }

  if (tier === "excited" && mood >= 82 && energy >= 55 && social >= 45 && hunger >= 35) {
    return { id: "happy-idle", reason: "high_positive_state" };
  }

  return { id: DEFAULT_INTENT_ID, reason: "baseline" };
}

export function resolveCompanionAnimationIntent(
  snapshot: CompanionAnimationSnapshotLike | null | undefined,
): CompanionAnimationIntent | null {
  const picked = pickIntentIdAndReason(snapshot);
  const selected =
    MIXAMO_ANIMATION_BY_ID.get(picked.id) ??
    MIXAMO_ANIMATION_BY_ID.get(DEFAULT_INTENT_ID);
  if (!selected) return null;

  return {
    id: selected.id,
    url: selected.url,
    loop: selected.loopByDefault,
    durationSec: selected.defaultDurationSec,
    reason: picked.reason,
  };
}

// ---------------------------------------------------------------------------
// Mood animation pools — accent animations to cycle during idle
// ---------------------------------------------------------------------------

export const MOOD_ANIMATION_POOLS: Record<AvatarMoodTier, { idleId: string; accents: string[] }> = {
  excited: {
    idleId: "happy-idle",
    accents: ["cheering", "joyful-jump", "hip-hop-dancing", "spin-in-place", "clapping", "happy"],
  },
  calm: {
    idleId: "breathing-idle",
    accents: ["look-around", "thankful", "agreeing", "acknowledging", "bashful"],
  },
  neutral: {
    idleId: "breathing-idle",
    accents: ["looking", "whatever-gesture", "thinking", "hard-head-nod", "bored"],
  },
  low: {
    idleId: "kneeling-idle",
    accents: ["shoulder-rubbing", "rejected", "bored", "yawn", "relieved-sigh"],
  },
  burnout: {
    idleId: "fallen-idle",
    accents: ["crying", "relieved-sigh"],
  },
};

// ---------------------------------------------------------------------------
// Random animation picker helper
// ---------------------------------------------------------------------------

export function pickRandomAnimationDef(
  ids: string[],
): { id: string; url: string; durationSec: number } | null {
  if (ids.length === 0) return null;
  const chosen = ids[Math.floor(Math.random() * ids.length)];
  const def = MIXAMO_ANIMATION_BY_ID.get(chosen);
  if (!def) return null;
  return { id: def.id, url: def.url, durationSec: def.defaultDurationSec };
}
