import { describe, expect, it } from "vitest";
import { computeRisk, scoreToken, pairAgeHours, txnsH1 } from "./scoring";
import type { DexPairSnapshot } from "./types";

function makePair(overrides: Partial<DexPairSnapshot> = {}): DexPairSnapshot {
  return {
    chainId: "solana",
    dexId: "raydium",
    pairAddress: "abc123",
    pairUrl: "https://dexscreener.com/solana/abc123",
    baseAddress: "token123",
    baseSymbol: "TEST",
    baseName: "TestToken",
    quoteSymbol: "SOL",
    priceUsd: 0.001,
    volumeH24: 500_000,
    volumeH6: 100_000,
    volumeH1: 30_000,
    volumeM5: 5_000,
    buysH1: 200,
    sellsH1: 150,
    buysH24: 3000,
    sellsH24: 2500,
    priceChangeH1: 5.0,
    priceChangeH24: 12.0,
    liquidityUsd: 100_000,
    marketCap: 1_000_000,
    fdv: 2_000_000,
    pairCreatedAtMs: Date.now() - 12 * 3_600_000, // 12 hours ago
    raw: {},
    ...overrides,
  };
}

describe("scoreToken", () => {
  it("produces a score between 0 and 100", () => {
    const pair = makePair();
    const result = scoreToken(pair, 50, 2, true);
    expect(result.total).toBeGreaterThanOrEqual(0);
    expect(result.total).toBeLessThanOrEqual(100);
  });

  it("scores higher for high-volume tokens", () => {
    const lowVol = scoreToken(makePair({ volumeH24: 10_000 }));
    const highVol = scoreToken(makePair({ volumeH24: 5_000_000 }));
    expect(highVol.total).toBeGreaterThan(lowVol.total);
  });

  it("assigns tags based on metrics", () => {
    const pair = makePair({
      volumeH24: 2_000_000,
      buysH1: 600,
      sellsH1: 100,
      priceChangeH1: 15,
    });
    const result = scoreToken(pair, 200, 5, true);
    expect(result.tags).toContain("high-volume");
    expect(result.tags).toContain("transaction-spike");
    expect(result.tags).toContain("momentum");
    expect(result.tags).toContain("buy-pressure");
    expect(result.tags).toContain("boosted");
    expect(result.tags).toContain("repeat-boosts");
    expect(result.tags).toContain("listed-profile");
  });

  it("gives fresh pairs a recency bonus", () => {
    const fresh = scoreToken(
      makePair({ pairCreatedAtMs: Date.now() - 6 * 3_600_000 }),
    );
    const old = scoreToken(
      makePair({ pairCreatedAtMs: Date.now() - 200 * 24 * 3_600_000 }),
    );
    expect(fresh.total).toBeGreaterThan(old.total);
    expect(fresh.tags).toContain("fresh-pair");
  });

  it("has 8 score components", () => {
    const result = scoreToken(makePair());
    const keys = Object.keys(result.components);
    expect(keys).toHaveLength(8);
    expect(keys).toEqual(
      expect.arrayContaining([
        "volume",
        "transactions",
        "liquidity",
        "momentum",
        "flow",
        "boost",
        "recency",
        "profile",
      ]),
    );
  });
});

describe("computeRisk", () => {
  it("returns full score for healthy pair", () => {
    const risk = computeRisk(
      makePair({
        liquidityUsd: 500_000,
        volumeH24: 200_000,
        buysH1: 100,
        sellsH1: 80,
        priceChangeH1: 5,
      }),
    );
    expect(risk.score).toBe(100);
    expect(risk.penalty).toBe(0);
    expect(risk.flags).toHaveLength(0);
  });

  it("flags low liquidity", () => {
    const risk = computeRisk(makePair({ liquidityUsd: 5_000 }));
    expect(risk.flags).toContain("low-liquidity");
    expect(risk.score).toBeLessThan(100);
  });

  it("flags one-way flow", () => {
    const risk = computeRisk(
      makePair({ buysH1: 50, sellsH1: 0 }),
    );
    expect(risk.flags).toContain("one-way-flow");
  });

  it("flags thin-exit for extreme turnover", () => {
    const risk = computeRisk(
      makePair({ volumeH24: 15_000_000, liquidityUsd: 100_000 }),
    );
    expect(risk.flags).toContain("thin-exit");
  });
});

describe("pairAgeHours", () => {
  it("returns null when no creation time", () => {
    expect(pairAgeHours(makePair({ pairCreatedAtMs: null }))).toBeNull();
  });

  it("returns age in hours", () => {
    const pair = makePair({
      pairCreatedAtMs: Date.now() - 48 * 3_600_000,
    });
    const age = pairAgeHours(pair);
    expect(age).not.toBeNull();
    expect(age!).toBeCloseTo(48, 0);
  });
});

describe("txnsH1", () => {
  it("sums buys and sells", () => {
    expect(txnsH1(makePair({ buysH1: 100, sellsH1: 50 }))).toBe(150);
  });
});
