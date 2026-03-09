/**
 * dev-ui.test.ts
 *
 * Unit tests + regression tests for the on-chain preference resolution logic
 * used by scripts/dev-ui.mjs.
 *
 * These tests run in-process (no servers started, no ports killed) by testing
 * the pure functions exported from scripts/lib/dev-ui-onchain.mjs.
 */

import { describe, expect, it, vi } from "vitest";

import {
  coerceBoolean,
  resolveOnchainPreference,
} from "./lib/dev-ui-onchain.mjs";

// ---------------------------------------------------------------------------
// coerceBoolean
// ---------------------------------------------------------------------------

describe("coerceBoolean", () => {
  it("returns true for truthy string values", () => {
    expect(coerceBoolean("1")).toBe(true);
    expect(coerceBoolean("true")).toBe(true);
    expect(coerceBoolean("yes")).toBe(true);
    expect(coerceBoolean("on")).toBe(true);
    expect(coerceBoolean("TRUE")).toBe(true);
    expect(coerceBoolean("  Yes  ")).toBe(true);
  });

  it("returns false for falsy string values", () => {
    expect(coerceBoolean("0")).toBe(false);
    expect(coerceBoolean("false")).toBe(false);
    expect(coerceBoolean("no")).toBe(false);
    expect(coerceBoolean("off")).toBe(false);
    expect(coerceBoolean("FALSE")).toBe(false);
    expect(coerceBoolean("  No  ")).toBe(false);
  });

  it("returns null for unrecognised strings", () => {
    expect(coerceBoolean("maybe")).toBeNull();
    expect(coerceBoolean("")).toBeNull();
    expect(coerceBoolean("2")).toBeNull();
  });

  it("returns null for undefined and null (absent env vars)", () => {
    expect(coerceBoolean(undefined)).toBeNull();
    expect(coerceBoolean(null)).toBeNull();
  });

  it("passes booleans through unchanged", () => {
    expect(coerceBoolean(true)).toBe(true);
    expect(coerceBoolean(false)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// REGRESSION: the old `!== false` default
// ---------------------------------------------------------------------------

describe("REGRESSION: onchain default was incorrectly true before fix", () => {
  it("coerceBoolean(undefined) !== false was true — the old bug", () => {
    // This is the condition that existed before the fix. It evaluates to true
    // when MILADY_DEV_ONCHAIN is not set, causing anvil to be required.
    const oldCondition = coerceBoolean(undefined) !== false;
    expect(oldCondition).toBe(true); // documents the bug was real
  });

  it("coerceBoolean(undefined) === true is false — the fix", () => {
    // The corrected condition: only enable on-chain when explicitly requested.
    const newCondition = coerceBoolean(undefined) === true;
    expect(newCondition).toBe(false); // this is what we ship
  });

  it("coerceBoolean(undefined) === true is false for all absent-env scenarios", () => {
    for (const absent of [undefined, null, ""]) {
      // Empty string won't appear as an env var in practice, but belt-and-
      // suspenders: an empty MILADY_DEV_ONCHAIN should not enable on-chain.
      const enabled = coerceBoolean(absent as string) === true;
      expect(enabled).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// resolveOnchainPreference — helpers
// ---------------------------------------------------------------------------

function makePrompt(answers: boolean[]) {
  const queue = [...answers];
  return vi.fn(async () => {
    const next = queue.shift();
    if (next === undefined)
      throw new Error("promptFn called more times than expected");
    return next;
  });
}

const whichFoundAnvil = vi.fn(() => "/usr/local/bin/anvil");
const whichMissingAnvil = vi.fn(() => null);
const installSuccess = vi.fn(async () => true);
const installFailure = vi.fn(async () => false);

// ---------------------------------------------------------------------------
// resolveOnchainPreference — env var path (CI-safe, no prompts)
// ---------------------------------------------------------------------------

describe("resolveOnchainPreference — explicit env var", () => {
  it("MILADY_DEV_ONCHAIN=1 enables on-chain, no prompts", async () => {
    const promptFn = vi.fn();
    const result = await resolveOnchainPreference({
      env: { MILADY_DEV_ONCHAIN: "1" },
      isTTY: false,
      whichFn: whichMissingAnvil,
      promptFn,
    });
    expect(result.onchainEnabled).toBe(true);
    expect(result.anchorRequested).toBe(false);
    expect(promptFn).not.toHaveBeenCalled();
  });

  it("MILADY_DEV_ONCHAIN=0 disables on-chain, no prompts", async () => {
    const promptFn = vi.fn();
    const result = await resolveOnchainPreference({
      env: { MILADY_DEV_ONCHAIN: "0" },
      isTTY: true,
      whichFn: whichFoundAnvil,
      promptFn,
    });
    expect(result.onchainEnabled).toBe(false);
    expect(result.anchorRequested).toBe(false);
    expect(promptFn).not.toHaveBeenCalled();
  });

  it("MILADY_DEV_ONCHAIN=1 + MILADY_DEV_ANCHOR=1 enables both", async () => {
    const result = await resolveOnchainPreference({
      env: { MILADY_DEV_ONCHAIN: "1", MILADY_DEV_ANCHOR: "1" },
      isTTY: false,
      whichFn: whichMissingAnvil,
      promptFn: vi.fn(),
    });
    expect(result.onchainEnabled).toBe(true);
    expect(result.anchorRequested).toBe(true);
  });

  it("accepts all recognised truthy spellings", async () => {
    for (const val of ["1", "true", "yes", "on", "TRUE", "Yes"]) {
      const result = await resolveOnchainPreference({
        env: { MILADY_DEV_ONCHAIN: val },
        isTTY: false,
        whichFn: whichMissingAnvil,
        promptFn: vi.fn(),
      });
      expect(result.onchainEnabled).toBe(true);
    }
  });

  it("accepts all recognised falsy spellings", async () => {
    for (const val of ["0", "false", "no", "off", "FALSE"]) {
      const result = await resolveOnchainPreference({
        env: { MILADY_DEV_ONCHAIN: val },
        isTTY: true,
        whichFn: whichFoundAnvil,
        promptFn: vi.fn(),
      });
      expect(result.onchainEnabled).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// resolveOnchainPreference — non-TTY / CI mode (no prompts)
// ---------------------------------------------------------------------------

describe("resolveOnchainPreference — non-TTY defaults", () => {
  it("defaults to disabled when no env var and not a TTY", async () => {
    const result = await resolveOnchainPreference({
      env: {},
      isTTY: false,
      whichFn: whichFoundAnvil,
      promptFn: vi.fn(),
    });
    expect(result.onchainEnabled).toBe(false);
    expect(result.anchorRequested).toBe(false);
  });

  it("defaults to disabled when no env var and no promptFn", async () => {
    const result = await resolveOnchainPreference({
      env: {},
      isTTY: true,
      whichFn: whichFoundAnvil,
      promptFn: undefined,
    });
    expect(result.onchainEnabled).toBe(false);
    expect(result.anchorRequested).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// resolveOnchainPreference — interactive TTY path
// ---------------------------------------------------------------------------

describe("resolveOnchainPreference — interactive (TTY)", () => {
  it("user says no → disabled, no further prompts", async () => {
    // answer[0] = "Enable on-chain?" → false
    const promptFn = makePrompt([false]);
    const result = await resolveOnchainPreference({
      env: {},
      isTTY: true,
      whichFn: whichFoundAnvil,
      promptFn,
    });
    expect(result.onchainEnabled).toBe(false);
    expect(promptFn).toHaveBeenCalledTimes(1);
  });

  it("user says yes + anvil present → enabled, asks about anchor", async () => {
    // answer[0] = "Enable on-chain?" → true
    // answer[1] = "Also start Anchor?" → false
    const promptFn = makePrompt([true, false]);
    const result = await resolveOnchainPreference({
      env: {},
      isTTY: true,
      whichFn: whichFoundAnvil,
      promptFn,
    });
    expect(result.onchainEnabled).toBe(true);
    expect(result.anchorRequested).toBe(false);
    expect(promptFn).toHaveBeenCalledTimes(2);
  });

  it("user says yes + anvil present + wants anchor → both enabled", async () => {
    // answer[0] = "Enable on-chain?" → true
    // answer[1] = "Also start Anchor?" → true
    const promptFn = makePrompt([true, true]);
    const result = await resolveOnchainPreference({
      env: {},
      isTTY: true,
      whichFn: whichFoundAnvil,
      promptFn,
    });
    expect(result.onchainEnabled).toBe(true);
    expect(result.anchorRequested).toBe(true);
    expect(promptFn).toHaveBeenCalledTimes(2);
  });

  it("user says yes + anvil missing + declines install → disabled", async () => {
    // answer[0] = "Enable on-chain?" → true
    // answer[1] = "Install Foundry?" → false
    const promptFn = makePrompt([true, false]);
    const result = await resolveOnchainPreference({
      env: {},
      isTTY: true,
      whichFn: whichMissingAnvil,
      promptFn,
      installFn: installSuccess,
    });
    expect(result.onchainEnabled).toBe(false);
    expect(installSuccess).not.toHaveBeenCalled();
    expect(promptFn).toHaveBeenCalledTimes(2);
  });

  it("user says yes + anvil missing + accepts install + install succeeds → enabled", async () => {
    // answer[0] = "Enable on-chain?" → true
    // answer[1] = "Install Foundry?" → true
    // answer[2] = "Also start Anchor?" → false
    const promptFn = makePrompt([true, true, false]);

    // installFn succeeds and then anvil is found
    let installed = false;
    const whichFn = vi.fn(() => (installed ? "/usr/local/bin/anvil" : null));
    const installFn = vi.fn(async () => {
      installed = true;
      return true;
    });

    const result = await resolveOnchainPreference({
      env: {},
      isTTY: true,
      whichFn,
      promptFn,
      installFn,
    });
    expect(result.onchainEnabled).toBe(true);
    expect(result.anchorRequested).toBe(false);
    expect(installFn).toHaveBeenCalledTimes(1);
    expect(promptFn).toHaveBeenCalledTimes(3);
  });

  it("user says yes + anvil missing + accepts install + install fails → disabled", async () => {
    // answer[0] = "Enable on-chain?" → true
    // answer[1] = "Install Foundry?" → true
    const promptFn = makePrompt([true, true]);
    const result = await resolveOnchainPreference({
      env: {},
      isTTY: true,
      whichFn: whichMissingAnvil,
      promptFn,
      installFn: installFailure,
    });
    expect(result.onchainEnabled).toBe(false);
    expect(result.anchorRequested).toBe(false);
    expect(installFailure).toHaveBeenCalledTimes(1);
    // No anchor prompt because we never became enabled
    expect(promptFn).toHaveBeenCalledTimes(2);
  });

  it("user says yes + anvil missing + no installFn provided → disabled", async () => {
    // answer[0] = "Enable on-chain?" → true
    // answer[1] = "Install Foundry?" → true  (user says yes, but no installFn)
    const promptFn = makePrompt([true, true]);
    const result = await resolveOnchainPreference({
      env: {},
      isTTY: true,
      whichFn: whichMissingAnvil,
      promptFn,
      installFn: undefined,
    });
    expect(result.onchainEnabled).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// resolveOnchainPreference — env var beats TTY prompts
// ---------------------------------------------------------------------------

describe("resolveOnchainPreference — env var takes precedence over TTY", () => {
  it("env var=1 + TTY: prompts are never called", async () => {
    const promptFn = vi.fn();
    await resolveOnchainPreference({
      env: { MILADY_DEV_ONCHAIN: "1" },
      isTTY: true,
      whichFn: whichMissingAnvil,
      promptFn,
    });
    expect(promptFn).not.toHaveBeenCalled();
  });

  it("env var=0 + TTY: prompts are never called", async () => {
    const promptFn = vi.fn();
    await resolveOnchainPreference({
      env: { MILADY_DEV_ONCHAIN: "0" },
      isTTY: true,
      whichFn: whichFoundAnvil,
      promptFn,
    });
    expect(promptFn).not.toHaveBeenCalled();
  });
});
