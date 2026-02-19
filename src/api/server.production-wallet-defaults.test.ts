import { afterEach, describe, expect, it } from "vitest";
import type { MiladyConfig } from "../config/config.js";
import { applyProductionWalletDefaults } from "./server.js";

const envKeys = [
  "MILADY_WALLET_MODE",
  "MILADY_TRADE_PERMISSION_MODE",
  "MILADY_BSC_EXECUTION_ENABLED",
  "EVM_PRIVATE_KEY",
  "SOLANA_PRIVATE_KEY",
] as const;

const envSnapshot = new Map<string, string | undefined>(
  envKeys.map((key) => [key, process.env[key]]),
);

function resetEnv(): void {
  for (const key of envKeys) {
    const value = envSnapshot.get(key);
    if (typeof value === "string") process.env[key] = value;
    else delete process.env[key];
  }
}

describe("applyProductionWalletDefaults", () => {
  afterEach(() => {
    resetEnv();
  });

  it("enforces pure privy + user-sign-only and clears local wallet keys", () => {
    process.env.EVM_PRIVATE_KEY = "0xabc";
    process.env.SOLANA_PRIVATE_KEY = "sol-secret";
    const config = {
      env: {
        EVM_PRIVATE_KEY: "0xabc",
        SOLANA_PRIVATE_KEY: "sol-secret",
        vars: {
          EVM_PRIVATE_KEY: "0xabc",
          SOLANA_PRIVATE_KEY: "sol-secret",
        },
      },
    } as unknown as MiladyConfig;

    const applied = applyProductionWalletDefaults(config);

    expect(applied.profile).toBe("pure-privy-safe");
    expect(applied.walletMode).toBe("privy");
    expect(applied.tradePermissionMode).toBe("user-sign-only");
    expect(applied.bscExecutionEnabled).toBe(false);
    expect(applied.clearedSecrets).toEqual(
      expect.arrayContaining(["EVM_PRIVATE_KEY", "SOLANA_PRIVATE_KEY"]),
    );

    expect(process.env.MILADY_WALLET_MODE).toBe("privy");
    expect(process.env.MILADY_TRADE_PERMISSION_MODE).toBe("user-sign-only");
    expect(process.env.MILADY_BSC_EXECUTION_ENABLED).toBe("false");
    expect(process.env.EVM_PRIVATE_KEY).toBeUndefined();
    expect(process.env.SOLANA_PRIVATE_KEY).toBeUndefined();

    const envConfig = config.env as Record<string, unknown>;
    expect(envConfig.MILADY_WALLET_MODE).toBe("privy");
    expect(envConfig.MILADY_TRADE_PERMISSION_MODE).toBe("user-sign-only");
    expect(envConfig.MILADY_BSC_EXECUTION_ENABLED).toBe("false");
    expect(envConfig.EVM_PRIVATE_KEY).toBeUndefined();
    expect(envConfig.SOLANA_PRIVATE_KEY).toBeUndefined();

    const vars = envConfig.vars as Record<string, unknown>;
    expect(vars.EVM_PRIVATE_KEY).toBeUndefined();
    expect(vars.SOLANA_PRIVATE_KEY).toBeUndefined();
  });

  it("creates config env when missing", () => {
    const config = {} as MiladyConfig;
    const applied = applyProductionWalletDefaults(config);
    expect(applied.walletMode).toBe("privy");
    expect(config.env).toBeDefined();
  });
});
