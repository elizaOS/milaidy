import { parseClampedInteger } from "../utils/number-parsing";

const TERMINAL_RUN_MAX_CONCURRENT_DEFAULT = 2;
const TERMINAL_RUN_MAX_CONCURRENT_CAP = 16;
const TERMINAL_RUN_MAX_DURATION_MS_DEFAULT = 5 * 60 * 1000;
const TERMINAL_RUN_MAX_DURATION_MS_CAP = 60 * 60 * 1000;

export function resolveTerminalRunLimits(): {
  maxConcurrent: number;
  maxDurationMs: number;
} {
  const maxConcurrent = parseClampedInteger(
    process.env.MILAIDY_TERMINAL_MAX_CONCURRENT,
    {
      fallback: TERMINAL_RUN_MAX_CONCURRENT_DEFAULT,
      min: 1,
      max: TERMINAL_RUN_MAX_CONCURRENT_CAP,
    },
  );

  const maxDurationMs = parseClampedInteger(
    process.env.MILAIDY_TERMINAL_MAX_DURATION_MS,
    {
      fallback: TERMINAL_RUN_MAX_DURATION_MS_DEFAULT,
      min: 1_000,
      max: TERMINAL_RUN_MAX_DURATION_MS_CAP,
    },
  );

  return { maxConcurrent, maxDurationMs };
}
