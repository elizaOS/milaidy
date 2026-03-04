import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the SDK module before importing client
vi.mock("@opinion-labs/opinion-clob-sdk", () => {
  class MockClient {
    getMarkets = vi.fn().mockResolvedValue({ result: { list: [] } });
    getMarket = vi.fn().mockResolvedValue({ result: {} });
    getCategoricalMarket = vi.fn().mockResolvedValue({ result: {} });
    getOrderbook = vi
      .fn()
      .mockResolvedValue({ result: { bids: [], asks: [] } });
    getLatestPrice = vi.fn().mockResolvedValue({ result: { price: "0.55" } });
    getMyPositions = vi.fn().mockResolvedValue({ result: [] });
    getMyOrders = vi.fn().mockResolvedValue({ result: { list: [] } });
    placeOrder = vi.fn().mockResolvedValue({ result: { orderId: "123" } });
    cancelOrder = vi.fn().mockResolvedValue({ result: {} });
    cancelAllOrders = vi.fn().mockResolvedValue({ result: {} });
    enableTrading = vi.fn().mockResolvedValue({});
    redeem = vi.fn().mockResolvedValue(["0xhash", {}, {}]);
  }
  return {
    Client: MockClient,
    CHAIN_ID_BNB_MAINNET: 56,
    DEFAULT_API_HOST: "https://openapi.opinion.trade/openapi",
    OrderSide: { BUY: 0, SELL: 1 },
    OrderType: { LIMIT_ORDER: 0, MARKET_ORDER: 1 },
  };
});

import { OpinionClient } from "../client.js";

describe("OpinionClient", () => {
  let client: OpinionClient;

  beforeEach(() => {
    client = new OpinionClient();
  });

  it("isReady returns false before initialization", () => {
    expect(client.isReady).toBe(false);
  });

  it("canTrade returns false before initialization", () => {
    expect(client.canTrade).toBe(false);
  });

  it("initializes in read-only mode without private key", async () => {
    await client.initialize({
      apiKey: "test-key",
      maxBetUsd: 500,
      rpcUrl: "https://bsc-dataseed.binance.org",
    });
    expect(client.isReady).toBe(true);
    expect(client.canTrade).toBe(false);
  });

  it("initializes in full mode with private key and multi-sig", async () => {
    await client.initialize({
      apiKey: "test-key",
      privateKey: `0x${"a".repeat(64)}`,
      multiSigAddress: `0x${"b".repeat(40)}`,
      maxBetUsd: 500,
      rpcUrl: "https://bsc-dataseed.binance.org",
    });
    expect(client.isReady).toBe(true);
    expect(client.canTrade).toBe(true);
  });

  it("getMarkets returns market list", async () => {
    await client.initialize({
      apiKey: "test-key",
      maxBetUsd: 500,
      rpcUrl: "https://bsc-dataseed.binance.org",
    });
    const result = await client.getMarkets();
    expect(result).toBeDefined();
  });

  it("placeBet throws when not in trading mode", async () => {
    await client.initialize({
      apiKey: "test-key",
      maxBetUsd: 500,
      rpcUrl: "https://bsc-dataseed.binance.org",
    });
    await expect(
      client.placeBet({
        marketId: 1,
        tokenId: "abc",
        side: "buy",
        amount: "10",
      }),
    ).rejects.toThrow("Trading not enabled");
  });

  it("placeBet rejects amount exceeding max bet", async () => {
    await client.initialize({
      apiKey: "test-key",
      privateKey: `0x${"a".repeat(64)}`,
      multiSigAddress: `0x${"b".repeat(40)}`,
      maxBetUsd: 50,
      rpcUrl: "https://bsc-dataseed.binance.org",
    });
    await expect(
      client.placeBet({
        marketId: 1,
        tokenId: "abc",
        side: "buy",
        amount: "100",
      }),
    ).rejects.toThrow(/exceeds.*50/i);
  });
});
