/**
 * Unit tests for resolveTradePermissionMode and canUseLocalTradeExecution.
 *
 * These functions gate real-money trade execution and must be covered
 * to catch regressions in permission logic.
 */

import { describe, expect, it } from "vitest";
import type { MiladyConfig } from "../config/config";
import {
  canUseLocalTradeExecution,
  resolveTradePermissionMode,
} from "./server";

function makeConfig(tradePermissionMode: unknown): MiladyConfig {
  return {
    features: { tradePermissionMode },
  } as unknown as MiladyConfig;
}

// ── resolveTradePermissionMode ─────────────────────────────────────────────

describe("resolveTradePermissionMode", () => {
  it("returns user-sign-only when no features config is set", () => {
    expect(resolveTradePermissionMode({} as MiladyConfig)).toBe(
      "user-sign-only",
    );
  });

  it("returns user-sign-only for unknown mode strings", () => {
    expect(resolveTradePermissionMode(makeConfig("anything-else"))).toBe(
      "user-sign-only",
    );
  });

  it("returns user-sign-only when mode is undefined", () => {
    expect(resolveTradePermissionMode(makeConfig(undefined))).toBe(
      "user-sign-only",
    );
  });

  it("returns user-sign-only when explicitly set", () => {
    expect(resolveTradePermissionMode(makeConfig("user-sign-only"))).toBe(
      "user-sign-only",
    );
  });

  it("returns manual-local-key when explicitly set", () => {
    expect(resolveTradePermissionMode(makeConfig("manual-local-key"))).toBe(
      "manual-local-key",
    );
  });

  it("returns agent-auto when explicitly set", () => {
    expect(resolveTradePermissionMode(makeConfig("agent-auto"))).toBe(
      "agent-auto",
    );
  });
});

// ── canUseLocalTradeExecution ─────────────────────────────────────────────

describe("canUseLocalTradeExecution", () => {
  describe("user-sign-only mode", () => {
    it("disallows local execution for user requests", () => {
      expect(canUseLocalTradeExecution("user-sign-only", false)).toBe(false);
    });

    it("disallows local execution for agent requests", () => {
      expect(canUseLocalTradeExecution("user-sign-only", true)).toBe(false);
    });
  });

  describe("manual-local-key mode", () => {
    it("allows local execution for user requests", () => {
      expect(canUseLocalTradeExecution("manual-local-key", false)).toBe(true);
    });

    it("disallows local execution for agent requests (no autonomous trading)", () => {
      expect(canUseLocalTradeExecution("manual-local-key", true)).toBe(false);
    });
  });

  describe("agent-auto mode", () => {
    it("allows local execution for user requests", () => {
      expect(canUseLocalTradeExecution("agent-auto", false)).toBe(true);
    });

    it("allows local execution for agent requests", () => {
      expect(canUseLocalTradeExecution("agent-auto", true)).toBe(true);
    });
  });
});
