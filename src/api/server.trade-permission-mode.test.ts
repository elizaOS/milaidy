import { afterEach, describe, expect, it } from "vitest";
import type { MiladyConfig } from "../config/config.js";
import {
  canUseLocalTradeExecution,
  resolveTradePermissionMode,
} from "./server.js";

const envKeys = ["MILADY_TRADE_PERMISSION_MODE"] as const;
const envSnapshot = new Map<string, string | undefined>(
  envKeys.map((key) => [key, process.env[key]]),
);

function resetEnv(): void {
  for (const key of envKeys) {
    const value = envSnapshot.get(key);
    if (typeof value === "string") {
      process.env[key] = value;
    } else {
      delete process.env[key];
    }
  }
}

describe("trade permission mode resolution", () => {
  afterEach(() => {
    resetEnv();
  });

  it("defaults to user-sign-only when unset", () => {
    delete process.env.MILADY_TRADE_PERMISSION_MODE;
    expect(resolveTradePermissionMode()).toBe("user-sign-only");
  });

  it("honors process env override", () => {
    process.env.MILADY_TRADE_PERMISSION_MODE = "manual-local-key";
    expect(resolveTradePermissionMode()).toBe("manual-local-key");
  });

  it("uses config env mode when process env is absent", () => {
    delete process.env.MILADY_TRADE_PERMISSION_MODE;
    const config = {
      env: {
        MILADY_TRADE_PERMISSION_MODE: "agent-auto",
      },
    } as MiladyConfig;
    expect(resolveTradePermissionMode(config)).toBe("agent-auto");
  });

  it("uses config features fallback when env mode is absent", () => {
    delete process.env.MILADY_TRADE_PERMISSION_MODE;
    const config = {
      features: {
        tradeExecution: {
          enabled: true,
          mode: "manual-local-key",
        },
      },
    } as MiladyConfig;
    expect(resolveTradePermissionMode(config)).toBe("manual-local-key");
  });

  it("falls back to user-sign-only when mode is invalid", () => {
    process.env.MILADY_TRADE_PERMISSION_MODE = "invalid-mode";
    expect(resolveTradePermissionMode()).toBe("user-sign-only");
  });
});

describe("trade permission mode execution gate", () => {
  it("blocks local execution for everyone in user-sign-only mode", () => {
    expect(canUseLocalTradeExecution("user-sign-only", false)).toBe(false);
    expect(canUseLocalTradeExecution("user-sign-only", true)).toBe(false);
  });

  it("allows user local execution but blocks agent in manual-local-key mode", () => {
    expect(canUseLocalTradeExecution("manual-local-key", false)).toBe(true);
    expect(canUseLocalTradeExecution("manual-local-key", true)).toBe(false);
  });

  it("allows both user and agent in agent-auto mode", () => {
    expect(canUseLocalTradeExecution("agent-auto", false)).toBe(true);
    expect(canUseLocalTradeExecution("agent-auto", true)).toBe(true);
  });
});
