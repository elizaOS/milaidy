import { afterEach, describe, expect, it } from "vitest";
import type { MilaidyConfig } from "../config/config.js";
import { isPurePrivyWalletMode, resolveWalletMode } from "./server.js";

const envKeys = [
  "MILAIDY_WALLET_MODE",
  "PRIVY_APP_ID",
  "PRIVY_APP_SECRET",
  "BABYLON_PRIVY_APP_ID",
  "BABYLON_PRIVY_APP_SECRET",
] as const;

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

describe("wallet mode resolution", () => {
  afterEach(() => {
    resetEnv();
  });

  it("defaults to hybrid when no Privy credentials are configured", () => {
    delete process.env.MILAIDY_WALLET_MODE;
    delete process.env.PRIVY_APP_ID;
    delete process.env.PRIVY_APP_SECRET;
    delete process.env.BABYLON_PRIVY_APP_ID;
    delete process.env.BABYLON_PRIVY_APP_SECRET;

    expect(resolveWalletMode()).toBe("hybrid");
    expect(isPurePrivyWalletMode()).toBe(false);
  });

  it("defaults to privy when Privy credentials are configured", () => {
    delete process.env.MILAIDY_WALLET_MODE;
    process.env.PRIVY_APP_ID = "app-id";
    process.env.PRIVY_APP_SECRET = "app-secret";

    expect(resolveWalletMode()).toBe("privy");
    expect(isPurePrivyWalletMode()).toBe(true);
  });

  it("honors explicit hybrid mode override", () => {
    process.env.MILAIDY_WALLET_MODE = "hybrid";
    process.env.PRIVY_APP_ID = "app-id";
    process.env.PRIVY_APP_SECRET = "app-secret";

    expect(resolveWalletMode()).toBe("hybrid");
    expect(isPurePrivyWalletMode()).toBe(false);
  });

  it("honors explicit privy mode even without credentials", () => {
    process.env.MILAIDY_WALLET_MODE = "privy";
    delete process.env.PRIVY_APP_ID;
    delete process.env.PRIVY_APP_SECRET;

    expect(resolveWalletMode()).toBe("privy");
    expect(isPurePrivyWalletMode()).toBe(true);
  });

  it("uses config env mode when process env override is absent", () => {
    delete process.env.MILAIDY_WALLET_MODE;
    const config = {
      env: { MILAIDY_WALLET_MODE: "privy" },
    } as MilaidyConfig;
    expect(resolveWalletMode(config)).toBe("privy");
  });
});
