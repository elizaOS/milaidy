export const MAX_IN_PROCESS_DELAY_MS = 60_000;

const DURATION_REGEX =
  /^(\d+)\s*(ms|milliseconds?|s|seconds?|m|min|minutes?|h|hours?|d|days?|w|weeks?)$/i;

const UNIT_MS: Record<string, number> = {
  ms: 1,
  millisecond: 1,
  milliseconds: 1,
  s: 1000,
  second: 1000,
  seconds: 1000,
  m: 60_000,
  min: 60_000,
  minute: 60_000,
  minutes: 60_000,
  h: 3_600_000,
  hour: 3_600_000,
  hours: 3_600_000,
  d: 86_400_000,
  day: 86_400_000,
  days: 86_400_000,
  w: 604_800_000,
  week: 604_800_000,
  weeks: 604_800_000,
};

/**
 * Parse a human-readable duration string into milliseconds.
 * Examples: "5m", "30 seconds", "2 hours", "1 day", "500ms"
 */
export function parseDuration(duration: string): number {
  const match = duration.trim().match(DURATION_REGEX);
  if (!match) return 0;
  const value = Number.parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  const multiplier = UNIT_MS[unit] ?? 0;
  return value * multiplier;
}
