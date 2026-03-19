import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { ElizaConfig } from "../config/config";
import {
  applyWalletRpcConfigUpdate,
  getInventoryProviderOptions,
  resolveWalletRpcReadiness,
} from "./wallet-rpc";

const ENV_KEYS = [
  "ALCHEMY_API_KEY",
  "INFURA_API_KEY",
  "ANKR_API_KEY",
  "NODEREAL_BSC_RPC_URL",
  "QUICKNODE_BSC_RPC_URL",
  "HELIUS_API_KEY",
  "BIRDEYE_API_KEY",
  "ETHEREUM_RPC_URL",
  "BASE_RPC_URL",
  "AVALANCHE_RPC_URL",
  "BSC_RPC_URL",
  "SOLANA_RPC_URL",
  "ELIZAOS_CLOUD_API_KEY",
  "ELIZAOS_CLOUD_BASE_URL",
  "EVM_PRIVATE_KEY",
  "SOLANA_PRIVATE_KEY",
] as const;

const ORIGINAL_ENV = Object.fromEntries(
  ENV_KEYS.map((key) => [key, process.env[key]]),
) as Record<(typeof ENV_KEYS)[number], string | undefined>;

beforeEach(() => {
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = ORIGINAL_ENV[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

describe("wallet RPC helpers", () => {
  test("exposes canonical onboarding inventory providers including BSC", () => {
    expect(getInventoryProviderOptions()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "bsc",
          rpcProviders: expect.arrayContaining([
            expect.objectContaining({ id: "eliza-cloud" }),
            expect.objectContaining({ id: "alchemy" }),
            expect.objectContaining({ id: "ankr" }),
            expect.objectContaining({ id: "nodereal" }),
            expect.objectContaining({ id: "quicknode" }),
          ]),
        }),
        expect.objectContaining({
          id: "solana",
          rpcProviders: expect.arrayContaining([
            expect.objectContaining({ id: "helius-birdeye" }),
          ]),
        }),
      ]),
    );
  });

  test("normalizes legacy persisted aliases and treats cloud RPC as available without cloud.enabled", () => {
    const readiness = resolveWalletRpcReadiness({
      env: {},
      cloud: {
        apiKey: "cloud-key",
        enabled: false,
        services: { rpc: true },
      },
      wallet: {
        rpcProviders: {
          evm: "elizacloud",
          bsc: "alchemy",
          solana: "helius",
        },
      },
    } as ElizaConfig);

    expect(readiness.selectedRpcProviders).toEqual({
      evm: "eliza-cloud",
      bsc: "alchemy",
      solana: "helius-birdeye",
    });
    expect(readiness.cloudManagedAccess).toBe(true);
  });

  test("prefers canonical providers over legacy raw RPC URLs during migration", () => {
    process.env.ALCHEMY_API_KEY = "alchemy";
    process.env.NODEREAL_BSC_RPC_URL = "https://nodereal.example";
    process.env.HELIUS_API_KEY = "helius";
    process.env.ETHEREUM_RPC_URL = "https://legacy-eth.example";
    process.env.BSC_RPC_URL = "https://legacy-bsc.example";
    process.env.SOLANA_RPC_URL = "https://legacy-solana.example";

    const readiness = resolveWalletRpcReadiness({ env: {} } as ElizaConfig);

    expect(readiness.selectedRpcProviders).toEqual({
      evm: "alchemy",
      bsc: "nodereal",
      solana: "helius-birdeye",
    });
    expect(readiness.legacyCustomChains).toEqual([]);
  });

  test("detects legacy custom chain carryover when no canonical provider is configured", () => {
    process.env.ETHEREUM_RPC_URL = "https://legacy-eth.example";
    process.env.BASE_RPC_URL = "https://legacy-base.example";
    process.env.BSC_RPC_URL = "https://legacy-bsc.example";
    process.env.SOLANA_RPC_URL = "https://legacy-solana.example";

    const readiness = resolveWalletRpcReadiness({ env: {} } as ElizaConfig);

    expect(readiness.selectedRpcProviders).toEqual({
      evm: "eliza-cloud",
      bsc: "eliza-cloud",
      solana: "eliza-cloud",
    });
    expect(readiness.legacyCustomChains).toEqual(["evm", "bsc", "solana"]);
  });

  test("persists canonical selections, clears stale keys, and derives SOLANA_RPC_URL", () => {
    process.env.ALCHEMY_API_KEY = "old-alchemy";
    process.env.NODEREAL_BSC_RPC_URL = "https://old-nodereal.example";
    process.env.BSC_RPC_URL = "https://legacy-bsc.example";

    const config = {
      env: {
        ALCHEMY_API_KEY: "old-alchemy",
        NODEREAL_BSC_RPC_URL: "https://old-nodereal.example",
        BSC_RPC_URL: "https://legacy-bsc.example",
      },
    } as ElizaConfig;

    applyWalletRpcConfigUpdate(config, {
      selections: {
        evm: "infura",
        bsc: "eliza-cloud",
        solana: "helius-birdeye",
      },
      credentials: {
        INFURA_API_KEY: "next-infura",
        HELIUS_API_KEY: "next-helius",
        BIRDEYE_API_KEY: "next-birdeye",
      },
    });

    expect(config.wallet?.rpcProviders).toEqual({
      evm: "infura",
      bsc: "eliza-cloud",
      solana: "helius-birdeye",
    });
    expect(process.env.ALCHEMY_API_KEY).toBeUndefined();
    expect(process.env.NODEREAL_BSC_RPC_URL).toBeUndefined();
    expect(process.env.BSC_RPC_URL).toBeUndefined();
    expect(process.env.INFURA_API_KEY).toBe("next-infura");
    expect(process.env.HELIUS_API_KEY).toBe("next-helius");
    expect(process.env.BIRDEYE_API_KEY).toBe("next-birdeye");
    expect(process.env.SOLANA_RPC_URL).toBe(
      "https://mainnet.helius-rpc.com/?api-key=next-helius",
    );
  });
});
