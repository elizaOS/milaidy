import {
  buildWalletRpcUpdateRequest,
  resolveInitialWalletRpcSelections,
} from "@elizaos/app-core/wallet-rpc";
import { describe, expect, it } from "vitest";

describe("ConfigPageView wallet RPC helpers", () => {
  it("derives the initial provider selections from saved wallet config", () => {
    expect(
      resolveInitialWalletRpcSelections({
        selectedRpcProviders: {
          evm: "infura",
          bsc: "nodereal",
          solana: "helius-birdeye",
        },
        legacyCustomChains: [],
        alchemyKeySet: false,
        infuraKeySet: true,
        ankrKeySet: false,
        nodeRealBscRpcSet: true,
        quickNodeBscRpcSet: false,
        heliusKeySet: false,
        birdeyeKeySet: true,
        evmChains: [],
        evmAddress: null,
        solanaAddress: null,
      }),
    ).toEqual({
      evm: "infura",
      bsc: "nodereal",
      solana: "helius-birdeye",
    });
  });

  it("clears stale providers when the selected RPC vendor changes", () => {
    expect(
      buildWalletRpcUpdateRequest({
        walletConfig: {
          selectedRpcProviders: {
            evm: "alchemy",
            bsc: "eliza-cloud",
            solana: "helius-birdeye",
          },
          legacyCustomChains: [],
          alchemyKeySet: true,
          infuraKeySet: false,
          ankrKeySet: false,
          nodeRealBscRpcSet: false,
          quickNodeBscRpcSet: false,
          heliusKeySet: true,
          birdeyeKeySet: true,
          evmChains: [],
          evmAddress: null,
          solanaAddress: null,
        },
        rpcFieldValues: {
          INFURA_API_KEY: "next-infura-key",
        },
        selectedProviders: {
          evm: "infura",
          bsc: "eliza-cloud",
          solana: "eliza-cloud",
        },
      }),
    ).toEqual({
      selections: {
        evm: "infura",
        bsc: "eliza-cloud",
        solana: "eliza-cloud",
      },
      credentials: {
        ALCHEMY_API_KEY: "",
        INFURA_API_KEY: "next-infura-key",
        HELIUS_API_KEY: "",
        BIRDEYE_API_KEY: "",
      },
    });
  });
});
