import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tests for getPowerStateCLI Linux sysfs path parsing.
 *
 * The Linux branch of getPowerStateCLI reads AC adapter status from sysfs:
 *   /sys/class/power_supply/{AC,AC0,ACAD}/online
 *
 * These tests mock fs.existsSync and fs.readFileSync to verify the parsing
 * logic without requiring actual sysfs files or a Linux system.
 */

// ---------------------------------------------------------------------------
// Replicate the Linux sysfs parsing logic from desktop.ts getPowerStateCLI
// ---------------------------------------------------------------------------

interface PowerState {
  onBattery: boolean;
  idleState: "active" | "idle" | "locked" | "unknown";
  idleTime: number;
}

/**
 * Extracted Linux power state detection logic from getPowerStateCLI.
 * Uses dependency-injected fs functions for testability.
 */
function parseLinuxPowerState(fsImpl: {
  existsSync: (p: string) => boolean;
  readFileSync: (p: string, encoding: string) => string;
}): PowerState {
  const state: PowerState = {
    onBattery: false,
    idleState: "unknown",
    idleTime: 0,
  };

  try {
    const supplyBase = "/sys/class/power_supply";
    for (const name of ["AC", "AC0", "ACAD"]) {
      const onlinePath = path.join(supplyBase, name, "online");
      if (fsImpl.existsSync(onlinePath)) {
        state.onBattery =
          fsImpl.readFileSync(onlinePath, "utf8").trim() !== "1";
        break;
      }
    }
  } catch {
    // Ignored, same as source
  }

  return state;
}

// ===========================================================================
// Linux sysfs AC adapter detection
// ===========================================================================

describe("getPowerStateCLI Linux sysfs parsing", () => {
  it("detects AC power when AC/online reads '1'", () => {
    const mockFs = {
      existsSync: vi.fn((p: string) =>
        p === "/sys/class/power_supply/AC/online",
      ),
      readFileSync: vi.fn(() => "1\n"),
    };

    const state = parseLinuxPowerState(mockFs);

    expect(state.onBattery).toBe(false);
    expect(mockFs.existsSync).toHaveBeenCalledWith(
      "/sys/class/power_supply/AC/online",
    );
    expect(mockFs.readFileSync).toHaveBeenCalledWith(
      "/sys/class/power_supply/AC/online",
      "utf8",
    );
  });

  it("detects battery power when AC/online reads '0'", () => {
    const mockFs = {
      existsSync: vi.fn((p: string) =>
        p === "/sys/class/power_supply/AC/online",
      ),
      readFileSync: vi.fn(() => "0\n"),
    };

    const state = parseLinuxPowerState(mockFs);

    expect(state.onBattery).toBe(true);
  });

  it("falls back to AC0 when AC does not exist", () => {
    const mockFs = {
      existsSync: vi.fn((p: string) =>
        p === "/sys/class/power_supply/AC0/online",
      ),
      readFileSync: vi.fn(() => "1\n"),
    };

    const state = parseLinuxPowerState(mockFs);

    expect(state.onBattery).toBe(false);
    expect(mockFs.readFileSync).toHaveBeenCalledWith(
      "/sys/class/power_supply/AC0/online",
      "utf8",
    );
  });

  it("falls back to ACAD when AC and AC0 do not exist", () => {
    const mockFs = {
      existsSync: vi.fn((p: string) =>
        p === "/sys/class/power_supply/ACAD/online",
      ),
      readFileSync: vi.fn(() => "0\n"),
    };

    const state = parseLinuxPowerState(mockFs);

    expect(state.onBattery).toBe(true);
    expect(mockFs.readFileSync).toHaveBeenCalledWith(
      "/sys/class/power_supply/ACAD/online",
      "utf8",
    );
  });

  it("returns default state when no AC adapter sysfs path exists", () => {
    const mockFs = {
      existsSync: vi.fn(() => false),
      readFileSync: vi.fn(() => ""),
    };

    const state = parseLinuxPowerState(mockFs);

    expect(state.onBattery).toBe(false); // default
    expect(state.idleState).toBe("unknown");
    expect(state.idleTime).toBe(0);
    expect(mockFs.readFileSync).not.toHaveBeenCalled();
  });

  it("stops checking after first matching path (AC)", () => {
    const callOrder: string[] = [];
    const mockFs = {
      existsSync: vi.fn((p: string) => {
        callOrder.push(`exists:${p}`);
        return p === "/sys/class/power_supply/AC/online";
      }),
      readFileSync: vi.fn((p: string) => {
        callOrder.push(`read:${p}`);
        return "1\n";
      }),
    };

    parseLinuxPowerState(mockFs);

    // Should only check AC, not AC0 or ACAD
    expect(callOrder).toEqual([
      "exists:/sys/class/power_supply/AC/online",
      "read:/sys/class/power_supply/AC/online",
    ]);
  });

  it("handles whitespace in sysfs value", () => {
    const mockFs = {
      existsSync: vi.fn((p: string) =>
        p === "/sys/class/power_supply/AC/online",
      ),
      readFileSync: vi.fn(() => "  1  \n"),
    };

    const state = parseLinuxPowerState(mockFs);

    expect(state.onBattery).toBe(false);
  });

  it("treats unexpected values as not-AC (on battery)", () => {
    const mockFs = {
      existsSync: vi.fn((p: string) =>
        p === "/sys/class/power_supply/AC/online",
      ),
      readFileSync: vi.fn(() => "unknown\n"),
    };

    const state = parseLinuxPowerState(mockFs);

    // "unknown" !== "1", so onBattery = true
    expect(state.onBattery).toBe(true);
  });

  it("handles fs errors gracefully", () => {
    const mockFs = {
      existsSync: vi.fn(() => {
        throw new Error("Permission denied");
      }),
      readFileSync: vi.fn(() => ""),
    };

    const state = parseLinuxPowerState(mockFs);

    // Should return defaults on error
    expect(state.onBattery).toBe(false);
    expect(state.idleState).toBe("unknown");
  });
});
