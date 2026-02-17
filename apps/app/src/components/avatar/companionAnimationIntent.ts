import type { CompanionAction, CompanionMoodTier, CompanionStateSnapshot } from "../../api-client.js";
import { MIXAMO_ANIMATION_BY_ID } from "./mixamoAnimationCatalog";

export interface CompanionAnimationIntent {
  id: string;
  url: string;
  loop: boolean;
  durationSec: number;
  reason: string;
}

const DEFAULT_INTENT_ID = "breathing-idle";

function pickIntentIdAndReason(
  snapshot: CompanionStateSnapshot | null | undefined,
): { id: string; reason: string } {
  if (!snapshot) {
    return { id: DEFAULT_INTENT_ID, reason: "snapshot_missing" };
  }

  const { mood, hunger, energy, social } = snapshot.state.stats;
  const tier = snapshot.moodTier;

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
  snapshot: CompanionStateSnapshot | null | undefined,
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

export const MOOD_ANIMATION_POOLS: Record<CompanionMoodTier, { idleId: string; accents: string[] }> = {
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
// Action → animation mapping for quick-action feedback
// ---------------------------------------------------------------------------

export const ACTION_ANIMATION_MAP: Record<CompanionAction, string[]> = {
  feed: ["happy", "cheering"],
  rest: ["yawn"],
  manual_share: ["blow-a-kiss", "thankful"],
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
