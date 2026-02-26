import { describe, expect, it } from "vitest";

/**
 * `VALID_PIP_LEVELS` lives inside `ElectronCapacitorApp.init()` in setup.ts
 * and cannot be imported. We replicate the allowlist and validation logic here
 * for unit testing.
 */

const VALID_PIP_LEVELS = new Set<string>([
  "normal",
  "floating",
  "torn-off-menu",
  "modal-panel",
  "main-menu",
  "status",
  "pop-up-menu",
  "screen-saver",
]);

function resolvePipLevel(raw: string): string {
  return VALID_PIP_LEVELS.has(raw) ? raw : "floating";
}

describe("VALID_PIP_LEVELS allowlist", () => {
  const validLevels = [
    "normal",
    "floating",
    "torn-off-menu",
    "modal-panel",
    "main-menu",
    "status",
    "pop-up-menu",
    "screen-saver",
  ];

  for (const level of validLevels) {
    it(`accepts valid level "${level}"`, () => {
      expect(resolvePipLevel(level)).toBe(level);
    });
  }

  const invalidLevels = [
    "invalid",
    "",
    "undefined",
    "screen-capture",
    "FLOATING",
    "Normal",
  ];

  for (const level of invalidLevels) {
    it(`falls back to "floating" for invalid level "${level}"`, () => {
      expect(resolvePipLevel(level)).toBe("floating");
    });
  }
});
