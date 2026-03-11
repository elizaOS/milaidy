/** Canonical list of all valid scene IDs for the streaming overlay system. */
export const ALL_SCENE_IDS = ["idle", "chatting", "terminal", "gaming", "starting-soon", "be-right-back", "ending"] as const;
export type SceneId = (typeof ALL_SCENE_IDS)[number];
export const BROADCAST_SCENE_IDS = ["starting-soon", "be-right-back", "ending"] as const;
export function isBroadcastScene(id: string): boolean {
  return (BROADCAST_SCENE_IDS as readonly string[]).includes(id);
}
