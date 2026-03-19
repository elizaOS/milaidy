import { describe, expect, it } from "vitest";
import {
  CHARACTER_SELECTION_EMOTE_DELAY_MS,
  resolveCharacterSelectionEmote,
} from "../../src/character-selection-emotes";

describe("character selection emotes", () => {
  it("returns a deterministic friendly emote for a selected character", () => {
    const first = resolveCharacterSelectionEmote({
      id: "greeting-seed",
      avatarIndex: 3,
    });
    const second = resolveCharacterSelectionEmote({
      id: "greeting-seed",
      avatarIndex: 3,
    });

    expect(first).toEqual(second);
    expect(first?.showOverlay).toBe(false);
    expect(first?.path).toMatch(/^\/animations\/(emotes|mixamo)\//);
    expect(first?.path).toMatch(/\.(glb|fbx)\.gz$/);
    expect(first?.emoteId).not.toBe("wave");
  });

  it("falls back to avatar index when a character id is unavailable", () => {
    const emote = resolveCharacterSelectionEmote({
      avatarIndex: 6,
    });

    expect(emote).not.toBeNull();
    expect(emote?.duration).toBeGreaterThan(0);
  });

  it("uses the shared scene-swap delay", () => {
    expect(CHARACTER_SELECTION_EMOTE_DELAY_MS).toBe(800);
  });
});
