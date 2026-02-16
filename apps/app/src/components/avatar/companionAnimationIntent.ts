import type { CompanionStateSnapshot } from "../../api-client.js";
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
