/**
 * Tests for the startup update notifier.
 *
 * Validates the guard conditions (CI, TTY, config, dedup) and that
 * the notifier actually calls checkForUpdate and writes output.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildMockUpdateCheckResult,
  waitMs,
} from "../test-support/test-helpers";

// Mock dependencies before importing the module under test
vi.mock("../config/config", () => ({
  loadMiladyConfig: vi.fn(() => ({})),
}));

vi.mock("./update-checker", () => ({
  checkForUpdate: vi.fn(),
  resolveChannel: vi.fn(() => "stable"),
}));

function mockTerminalTheme() {
  return {
    theme: {
      accent: (s: string) => `[accent:${s}]`,
      muted: (s: string) => `[muted:${s}]`,
      success: (s: string) => `[success:${s}]`,
      command: (s: string) => `[command:${s}]`,
    },
  };
}

vi.mock("../terminal/theme", mockTerminalTheme);

// ============================================================================
// Helpers
// ============================================================================

/**
 * We need to re-import the module for each test because it has module-level
 * state (`let notified = false`). Vitest's module cache must be cleared.
 */
async function importFreshNotifier() {
  // Reset the module registry to get a fresh `notified` flag
  vi.resetModules();

  // Re-mock after reset
  vi.doMock("../config/config", () => ({
    loadMiladyConfig: vi.fn(() => ({})),
  }));
  vi.doMock("./update-checker", () => ({
    checkForUpdate: vi.fn(),
    resolveChannel: vi.fn(() => "stable"),
  }));
  vi.doMock("../terminal/theme", mockTerminalTheme);

  const mod = await import("./update-notifier");
  const config = await import("../config/config");
  const checker = await import("./update-checker");
  return {
    scheduleUpdateNotification: mod.scheduleUpdateNotification,
    config,
    checker,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe("scheduleUpdateNotification", () => {
  const originalCI = process.env.CI;
  let stderrSpy: ReturnType<typeof vi.spyOn>;
  const WAIT_FOR_CHECK_MS = 50;
  const WAIT_FOR_GUARD_MS = 10;
  const readStderr = () =>
    stderrSpy.mock.calls.map((c) => String(c[0])).join("");

  beforeEach(() => {
    delete process.env.CI;
    stderrSpy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    // Pretend stderr is a TTY
    Object.defineProperty(process.stderr, "isTTY", {
      value: true,
      configurable: true,
    });
  });

  afterEach(() => {
    stderrSpy.mockRestore();
    if (originalCI !== undefined) {
      process.env.CI = originalCI;
    } else {
      delete process.env.CI;
    }
  });

  it("does not check in CI environments", async () => {
    process.env.CI = "true";
    const { scheduleUpdateNotification, checker } = await importFreshNotifier();

    scheduleUpdateNotification();

    // Allow any microtasks to settle
    await waitMs(WAIT_FOR_GUARD_MS);

    expect(checker.checkForUpdate).not.toHaveBeenCalled();
  });

  it("does not check when stderr is not a TTY", async () => {
    Object.defineProperty(process.stderr, "isTTY", {
      value: false,
      configurable: true,
    });

    const { scheduleUpdateNotification, checker } = await importFreshNotifier();

    scheduleUpdateNotification();
    await waitMs(WAIT_FOR_GUARD_MS);

    expect(checker.checkForUpdate).not.toHaveBeenCalled();
  });

  it("does not check when checkOnStart is false", async () => {
    const { scheduleUpdateNotification, config, checker } =
      await importFreshNotifier();
    vi.mocked(config.loadMiladyConfig).mockReturnValue({
      update: { checkOnStart: false },
    });

    scheduleUpdateNotification();
    await waitMs(WAIT_FOR_GUARD_MS);

    expect(checker.checkForUpdate).not.toHaveBeenCalled();
  });

  it("calls checkForUpdate when conditions are met", async () => {
    const { scheduleUpdateNotification, checker } = await importFreshNotifier();
    vi.mocked(checker.checkForUpdate).mockResolvedValue(
      buildMockUpdateCheckResult(),
    );

    scheduleUpdateNotification();
    await waitMs(WAIT_FOR_CHECK_MS);

    expect(checker.checkForUpdate).toHaveBeenCalledOnce();
  });

  it("writes update notice to stderr when update is available", async () => {
    const { scheduleUpdateNotification, checker } = await importFreshNotifier();
    vi.mocked(checker.checkForUpdate).mockResolvedValue(
      buildMockUpdateCheckResult({
        updateAvailable: true,
        latestVersion: "2.1.0",
      }),
    );

    scheduleUpdateNotification();
    await waitMs(WAIT_FOR_CHECK_MS);

    const output = readStderr();
    expect(output).toContain("Update available");
    expect(output).toContain("2.0.0");
    expect(output).toContain("2.1.0");
    expect(output).toContain("milady update");
  });

  it("does not write notice when no update is available", async () => {
    const { scheduleUpdateNotification, checker } = await importFreshNotifier();
    vi.mocked(checker.checkForUpdate).mockResolvedValue(
      buildMockUpdateCheckResult({}),
    );

    scheduleUpdateNotification();
    await waitMs(WAIT_FOR_CHECK_MS);

    // stderr should NOT have any update notice
    const output = readStderr();
    expect(output).not.toContain("Update available");
  });

  it("only fires once per process (dedup)", async () => {
    const { scheduleUpdateNotification, checker } = await importFreshNotifier();
    vi.mocked(checker.checkForUpdate).mockResolvedValue(
      buildMockUpdateCheckResult({}),
    );

    scheduleUpdateNotification();
    scheduleUpdateNotification(); // second call
    scheduleUpdateNotification(); // third call
    await waitMs(WAIT_FOR_CHECK_MS);

    // checkForUpdate should only be called ONCE despite 3 calls
    expect(checker.checkForUpdate).toHaveBeenCalledOnce();
  });

  it("includes channel suffix for non-stable channels", async () => {
    const { scheduleUpdateNotification, checker } = await importFreshNotifier();
    vi.mocked(checker.checkForUpdate).mockResolvedValue(
      buildMockUpdateCheckResult({
        updateAvailable: true,
        latestVersion: "2.1.0-beta.1",
        channel: "beta",
        distTag: "beta",
      }),
    );
    vi.mocked(checker.resolveChannel).mockReturnValue("beta");

    scheduleUpdateNotification();
    await waitMs(WAIT_FOR_CHECK_MS);

    const output = readStderr();
    expect(output).toContain("beta");
  });

  it("silently ignores checkForUpdate rejection", async () => {
    const { scheduleUpdateNotification, checker } = await importFreshNotifier();
    vi.mocked(checker.checkForUpdate).mockRejectedValue(
      new Error("something broke"),
    );

    // Should not throw
    scheduleUpdateNotification();
    await waitMs(WAIT_FOR_CHECK_MS);

    // No output, no crash
    const output = readStderr();
    expect(output).not.toContain("Update available");
  });

  it("does not write notice when latestVersion is null", async () => {
    const { scheduleUpdateNotification, checker } = await importFreshNotifier();
    vi.mocked(checker.checkForUpdate).mockResolvedValue(
      buildMockUpdateCheckResult({
        updateAvailable: true,
        latestVersion: null, // guard path
      }),
    );

    scheduleUpdateNotification();
    await waitMs(WAIT_FOR_CHECK_MS);

    const output = readStderr();
    expect(output).not.toContain("Update available");
  });

  it("ignores corrupt config and still checks for updates", async () => {
    const { scheduleUpdateNotification, config, checker } =
      await importFreshNotifier();
    vi.mocked(config.loadMiladyConfig).mockImplementation(() => {
      throw new Error("corrupt");
    });
    vi.mocked(checker.checkForUpdate).mockResolvedValue(
      buildMockUpdateCheckResult({}),
    );

    scheduleUpdateNotification();
    await waitMs(WAIT_FOR_CHECK_MS);

    expect(checker.checkForUpdate).toHaveBeenCalledOnce();
  });

  it("does not include channel suffix for stable channel", async () => {
    const { scheduleUpdateNotification, checker } = await importFreshNotifier();
    vi.mocked(checker.checkForUpdate).mockResolvedValue(
      buildMockUpdateCheckResult({ updateAvailable: true }),
    );
    vi.mocked(checker.resolveChannel).mockReturnValue("stable");

    scheduleUpdateNotification();
    await waitMs(WAIT_FOR_CHECK_MS);

    const output = readStderr();
    expect(output).toContain("Update available");
    // Should NOT have "(stable)" suffix — only non-stable channels show the suffix
    expect(output).not.toContain("(stable)");
    expect(output).not.toContain("stable");
  });
});
