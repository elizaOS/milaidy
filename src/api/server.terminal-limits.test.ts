import { afterEach, describe, expect, it } from "vitest";
import { resolveTerminalRunLimits } from "./terminal-run-limits";

describe("resolveTerminalRunLimits", () => {
  const prevMaxConcurrent = process.env.MILADY_TERMINAL_MAX_CONCURRENT;
  const prevMaxDuration = process.env.MILADY_TERMINAL_MAX_DURATION_MS;
  const prevLegacyMaxConcurrent = process.env.MILAIDY_TERMINAL_MAX_CONCURRENT;
  const prevLegacyMaxDuration = process.env.MILAIDY_TERMINAL_MAX_DURATION_MS;

  afterEach(() => {
    if (prevMaxConcurrent === undefined)
      delete process.env.MILADY_TERMINAL_MAX_CONCURRENT;
    else process.env.MILADY_TERMINAL_MAX_CONCURRENT = prevMaxConcurrent;

    if (prevMaxDuration === undefined)
      delete process.env.MILADY_TERMINAL_MAX_DURATION_MS;
    else process.env.MILADY_TERMINAL_MAX_DURATION_MS = prevMaxDuration;

    if (prevLegacyMaxConcurrent === undefined)
      delete process.env.MILAIDY_TERMINAL_MAX_CONCURRENT;
    else process.env.MILAIDY_TERMINAL_MAX_CONCURRENT = prevLegacyMaxConcurrent;

    if (prevLegacyMaxDuration === undefined)
      delete process.env.MILAIDY_TERMINAL_MAX_DURATION_MS;
    else process.env.MILAIDY_TERMINAL_MAX_DURATION_MS = prevLegacyMaxDuration;
  });

  it("uses secure defaults when env vars are unset", () => {
    delete process.env.MILADY_TERMINAL_MAX_CONCURRENT;
    delete process.env.MILADY_TERMINAL_MAX_DURATION_MS;
    delete process.env.MILAIDY_TERMINAL_MAX_CONCURRENT;
    delete process.env.MILAIDY_TERMINAL_MAX_DURATION_MS;

    expect(resolveTerminalRunLimits()).toEqual({
      maxConcurrent: 2,
      maxDurationMs: 5 * 60 * 1000,
    });
  });

  it("clamps canonical MILADY env values into safe bounds", () => {
    process.env.MILADY_TERMINAL_MAX_CONCURRENT = "999";
    process.env.MILADY_TERMINAL_MAX_DURATION_MS = "100";
    delete process.env.MILAIDY_TERMINAL_MAX_CONCURRENT;
    delete process.env.MILAIDY_TERMINAL_MAX_DURATION_MS;

    expect(resolveTerminalRunLimits()).toEqual({
      maxConcurrent: 16,
      maxDurationMs: 1000,
    });
  });

  it("supports legacy MILAIDY env vars as fallback", () => {
    delete process.env.MILADY_TERMINAL_MAX_CONCURRENT;
    delete process.env.MILADY_TERMINAL_MAX_DURATION_MS;
    process.env.MILAIDY_TERMINAL_MAX_CONCURRENT = "999";
    process.env.MILAIDY_TERMINAL_MAX_DURATION_MS = "100";

    expect(resolveTerminalRunLimits()).toEqual({
      maxConcurrent: 16,
      maxDurationMs: 1000,
    });
  });

  it("prefers canonical MILADY vars when both are set", () => {
    process.env.MILADY_TERMINAL_MAX_CONCURRENT = "4";
    process.env.MILADY_TERMINAL_MAX_DURATION_MS = "2000";
    process.env.MILAIDY_TERMINAL_MAX_CONCURRENT = "12";
    process.env.MILAIDY_TERMINAL_MAX_DURATION_MS = "45000";

    expect(resolveTerminalRunLimits()).toEqual({
      maxConcurrent: 4,
      maxDurationMs: 2000,
    });
  });
});
