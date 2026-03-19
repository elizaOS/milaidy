import { EMOTE_CATALOG } from "../../../src/emotes/catalog";

const CHARACTER_SELECTION_EMOTE_IDS = [
  "wave",
  "salute",
  "acknowledging",
  "standing-greeting",
  "thankful",
  "agreeing",
] as const;

const CHARACTER_SELECTION_EMOTE_BY_ID = new Map(
  EMOTE_CATALOG.map((emote) => [emote.id, emote]),
);

export const CHARACTER_SELECTION_EMOTE_DELAY_MS = 800;

export interface CharacterSelectionTarget {
  id?: string;
  avatarIndex: number;
}

export interface CharacterSelectionEmotePayload {
  emoteId: string;
  path: string;
  duration: number;
  loop: boolean;
  showOverlay: false;
}

function hashCharacterSelectionSeed(seed: string): number {
  let hash = 0;
  for (const char of seed) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return hash;
}

export function resolveCharacterSelectionEmote(
  target: CharacterSelectionTarget,
): CharacterSelectionEmotePayload | null {
  const seed = target.id?.trim() || `avatar-${target.avatarIndex}`;
  const index =
    hashCharacterSelectionSeed(seed) % CHARACTER_SELECTION_EMOTE_IDS.length;
  const emoteId = CHARACTER_SELECTION_EMOTE_IDS[index];
  const emote = CHARACTER_SELECTION_EMOTE_BY_ID.get(emoteId);

  if (!emote) return null;

  return {
    emoteId: emote.id,
    path: emote.path,
    duration: emote.duration,
    loop: emote.loop,
    showOverlay: false,
  };
}
