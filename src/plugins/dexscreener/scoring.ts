/**
 * DexScreener token scoring engine — 8-component weighted scoring (0-100).
 *
 * Our own implementation. Scores volume, transactions, liquidity, momentum,
 * buy/sell flow pressure, boost activity, recency, and profile status.
 *
 * @module plugins/dexscreener/scoring
 */

import type { DexPairSnapshot, RiskProfile, TokenScore } from "./types";

function clip(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}

function log1p(x: number): number {
  return Math.log1p(x);
}

export function pairAgeHours(pair: DexPairSnapshot): number | null {
  if (!pair.pairCreatedAtMs) return null;
  const ageMs = Date.now() - pair.pairCreatedAtMs;
  return Math.max(ageMs / 3_600_000, 0);
}

export function txnsH1(pair: DexPairSnapshot): number {
  return pair.buysH1 + pair.sellsH1;
}

export function scoreToken(
  pair: DexPairSnapshot,
  boostTotal = 0,
  boostCount = 0,
  hasProfile = false,
): TokenScore {
  const volumeH24 = Math.max(pair.volumeH24, 0);
  const txns = Math.max(txnsH1(pair), 0);
  const liquidityUsd = Math.max(pair.liquidityUsd, 0);
  const safeBoost = Math.max(boostTotal, 0);

  const volComp = clip(log1p(volumeH24) / log1p(7_500_000), 0, 1);
  const txnComp = clip(log1p(txns) / log1p(4_000), 0, 1);
  const liqComp = clip(log1p(liquidityUsd) / log1p(3_000_000), 0, 1);
  const momComp = clip((pair.priceChangeH1 + 20) / 70, 0, 1);

  let buyPressure = 0;
  if (txns > 0) {
    buyPressure = (pair.buysH1 - pair.sellsH1) / txns;
  }
  const flowComp = clip((buyPressure + 1) / 2, 0, 1);

  const boostComp = clip(log1p(safeBoost) / log1p(600), 0, 1);

  let recencyComp = 0.2;
  const age = pairAgeHours(pair);
  if (age !== null) {
    if (age <= 24) recencyComp = 1.0;
    else if (age <= 72) recencyComp = 0.65;
    else if (age <= 168) recencyComp = 0.35;
  }

  const profileComp = hasProfile ? 1.0 : 0.0;

  // Weighted sum to 100
  const total =
    volComp * 30 +
    txnComp * 20 +
    liqComp * 18 +
    momComp * 12 +
    flowComp * 8 +
    boostComp * 7 +
    recencyComp * 3 +
    profileComp * 2;

  const tags: string[] = [];
  if (pair.volumeH24 >= 1_000_000) tags.push("high-volume");
  if (txns >= 500) tags.push("transaction-spike");
  if (pair.priceChangeH1 >= 8) tags.push("momentum");
  if (buyPressure >= 0.35) tags.push("buy-pressure");
  if (age !== null && age < 48) tags.push("fresh-pair");
  if (boostTotal >= 100) tags.push("boosted");
  if (boostCount >= 3) tags.push("repeat-boosts");
  if (hasProfile) tags.push("listed-profile");

  return {
    total: Math.round(total * 100) / 100,
    components: {
      volume: Math.round(volComp * 30 * 1000) / 1000,
      transactions: Math.round(txnComp * 20 * 1000) / 1000,
      liquidity: Math.round(liqComp * 18 * 1000) / 1000,
      momentum: Math.round(momComp * 12 * 1000) / 1000,
      flow: Math.round(flowComp * 8 * 1000) / 1000,
      boost: Math.round(boostComp * 7 * 1000) / 1000,
      recency: Math.round(recencyComp * 3 * 1000) / 1000,
      profile: Math.round(profileComp * 2 * 1000) / 1000,
    },
    tags,
  };
}

export function computeRisk(pair: DexPairSnapshot): RiskProfile {
  let score = 100;
  const flags: string[] = [];

  const volLiq = pair.volumeH24 / Math.max(pair.liquidityUsd, 1);

  if (pair.liquidityUsd < 20_000) {
    score -= 18;
    flags.push("low-liquidity");
  }
  if (volLiq >= 80) {
    score -= 12;
    flags.push("high-turnover");
  }
  if (volLiq >= 140) {
    score -= 24;
    flags.push("thin-exit");
  }

  const mcap = pair.marketCap > 0 ? pair.marketCap : pair.fdv;
  if (mcap > 0) {
    const liqToCap = pair.liquidityUsd / mcap;
    if (liqToCap < 0.02) {
      score -= 15;
      flags.push("concentration-risk");
    }
  }

  const txns = txnsH1(pair);
  if (txns <= 2 && pair.volumeH24 >= 100_000) {
    score -= 20;
    flags.push("low-participant-flow");
  }

  if (pair.priceChangeH1 >= 140 && txns < 50) {
    score -= 12;
    flags.push("blowoff-risk");
  }

  if (pair.buysH1 >= 20 && pair.sellsH1 === 0) {
    score -= 18;
    flags.push("one-way-flow");
  }

  score = Math.max(0, Math.min(100, score));
  const penalty = Math.max(0, (65 - score) * 0.28);

  return { score, penalty, flags };
}
