import { describe, expect, it } from "vitest";
import {
  applyPublicRpcDefaults,
  PUBLIC_BASE_RPC_PRIMARY,
  PUBLIC_BSC_RPC_PRIMARY,
  PUBLIC_ETHEREUM_RPC_PRIMARY,
  PUBLIC_SOLANA_RPC_PRIMARY,
} from "./public-rpc";

describe("applyPublicRpcDefaults", () => {
  it("fills only unset RPC endpoints and returns what changed", () => {
    const env = {
      BSC_RPC_URL: "",
      ETHEREUM_RPC_URL: "https://custom.ethereum.invalid",
      BASE_RPC_URL: undefined,
      SOLANA_RPC_URL: "   ",
    };

    const applied = applyPublicRpcDefaults(env);

    expect(applied).toEqual([
      { key: "BSC_RPC_URL", url: PUBLIC_BSC_RPC_PRIMARY },
      { key: "BASE_RPC_URL", url: PUBLIC_BASE_RPC_PRIMARY },
      { key: "SOLANA_RPC_URL", url: PUBLIC_SOLANA_RPC_PRIMARY },
    ]);

    expect(env).toMatchObject({
      BSC_RPC_URL: PUBLIC_BSC_RPC_PRIMARY,
      ETHEREUM_RPC_URL: "https://custom.ethereum.invalid",
      BASE_RPC_URL: PUBLIC_BASE_RPC_PRIMARY,
      SOLANA_RPC_URL: PUBLIC_SOLANA_RPC_PRIMARY,
    });
  });

  it("does nothing when all RPC endpoints are already configured", () => {
    const env = {
      BSC_RPC_URL: "https://custom.bsc.invalid",
      ETHEREUM_RPC_URL: "https://custom.ethereum.invalid",
      BASE_RPC_URL: "https://custom.base.invalid",
      SOLANA_RPC_URL: "https://custom.solana.invalid",
    };

    const applied = applyPublicRpcDefaults(env);

    expect(applied).toEqual([]);
    expect(env).toEqual({
      BSC_RPC_URL: "https://custom.bsc.invalid",
      ETHEREUM_RPC_URL: "https://custom.ethereum.invalid",
      BASE_RPC_URL: "https://custom.base.invalid",
      SOLANA_RPC_URL: "https://custom.solana.invalid",
    });
  });

  it("applies the ethereum public default when that slot is empty", () => {
    const env = {
      BSC_RPC_URL: "https://custom.bsc.invalid",
      ETHEREUM_RPC_URL: "",
      BASE_RPC_URL: "https://custom.base.invalid",
      SOLANA_RPC_URL: "https://custom.solana.invalid",
    };

    const applied = applyPublicRpcDefaults(env);

    expect(applied).toEqual([
      { key: "ETHEREUM_RPC_URL", url: PUBLIC_ETHEREUM_RPC_PRIMARY },
    ]);
    expect(env.ETHEREUM_RPC_URL).toBe(PUBLIC_ETHEREUM_RPC_PRIMARY);
  });
});
