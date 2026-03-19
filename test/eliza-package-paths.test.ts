import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  getAppCoreConnectionStepEntry,
  getAppCoreOnboardingConfigEntry,
} from "./eliza-package-paths";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

describe("eliza package paths", () => {
  it("resolves the app-core connection step entry", () => {
    const entry = getAppCoreConnectionStepEntry(repoRoot);

    expect(entry).toBeDefined();
    expect(existsSync(entry as string)).toBe(true);
  });

  it("resolves the app-core onboarding config entry", () => {
    const entry = getAppCoreOnboardingConfigEntry(repoRoot);

    expect(entry).toBeDefined();
    expect(existsSync(entry as string)).toBe(true);
  });
});
