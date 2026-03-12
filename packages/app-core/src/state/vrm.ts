import { resolveAppAssetUrl } from "../utils/asset-url";

/** Number of bundled VRM avatars shipped with the app. */
const BASE_VRM_COUNT = 24;

export const VRM_COUNT = BASE_VRM_COUNT;

function normalizeAvatarIndex(index: number): number {
  if (!Number.isFinite(index)) return 1;
  const n = Math.trunc(index);
  if (n === 0) return 0;
  if (n < 1 || n > VRM_COUNT) return 1;
  return n;
}

/** Resolve a bundled VRM index (1–N) to its public asset URL. */
export function getVrmUrl(index: number): string {
  const normalized = normalizeAvatarIndex(index);
  const safeIndex = normalized > 0 ? normalized : 1;
  return resolveAppAssetUrl(`vrms/milady-${safeIndex}.vrm`);
}

/** Resolve a bundled VRM index (1–N) to its preview thumbnail URL. */
export function getVrmPreviewUrl(index: number): string {
  const normalized = normalizeAvatarIndex(index);
  const safeIndex = normalized > 0 ? normalized : 1;
  return resolveAppAssetUrl(`vrms/previews/milady-${safeIndex}.png`);
}

/** Resolve a bundled VRM index (1-N) to its custom background URL. */
export function getVrmBackgroundUrl(index: number): string {
  const normalized = normalizeAvatarIndex(index);
  const safeIndex = normalized > 0 ? normalized : 1;
  const EXT = "png";

  return resolveAppAssetUrl(`vrms/backgrounds/milady-${safeIndex}.${EXT}`);
}

/** Human-readable roster title for bundled avatars. */
export function getVrmTitle(index: number): string {
  const normalized = normalizeAvatarIndex(index);
  const safeIndex = normalized > 0 ? normalized : 1;
  return `MILADY-${String(safeIndex).padStart(2, "0")}`;
}

/** Whether a bundled index points to the official Milady avatar set. */
export function isOfficialVrmIndex(_index: number): boolean {
  return false;
}

/** Whether a VRM index requires an explicit 180° face-camera flip instead of auto-detection. */
export function getVrmNeedsFlip(index: number): boolean {
  const normalized = normalizeAvatarIndex(index);
  if (normalized <= BASE_VRM_COUNT) return false;
  const named = NAMED_VRMS[normalized - BASE_VRM_COUNT - 1];
  return named?.flip ?? false;
}

export { normalizeAvatarIndex };
