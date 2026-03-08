/**
 * Dexplorer hot-token scanner — discovers, scores, and ranks tokens.
 *
 * Collects seed tokens from boost/profile/takeover/search endpoints,
 * fetches pair data, scores and enriches candidates with risk analysis.
 *
 * @module plugins/dexplorer/scanner
 */

import { DexplorerClient } from "./client";
import { computeRisk, scoreToken } from "./scoring";
import type {
  DexPairSnapshot,
  ScanFilters,
  TokenCandidate,
  DEFAULT_SCAN_FILTERS,
} from "./types";

interface SeedToken {
  chainId: string;
  tokenAddress: string;
  boostTotal: number;
  boostCount: number;
  hasProfile: boolean;
  discovery: string;
}

function toFloat(v: unknown, d = 0): number {
  if (v == null) return d;
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

function toInt(v: unknown, d = 0): number {
  if (v == null) return d;
  const n = Number(v);
  return Number.isFinite(n) ? Math.floor(n) : d;
}

export class DexScanner {
  private readonly client: DexplorerClient;

  constructor(client: DexplorerClient) {
    this.client = client;
  }

  private async collectSeeds(
    chains: string[],
  ): Promise<Map<string, SeedToken>> {
    const chainSet = new Set(chains);
    const seeds = new Map<string, SeedToken>();

    const upsert = (
      chainId: string,
      tokenAddress: string,
      opts: Partial<
        Pick<SeedToken, "boostTotal" | "boostCount" | "hasProfile" | "discovery">
      >,
    ) => {
      if (!chainSet.has(chainId) || !tokenAddress) return;
      const key = `${chainId}:${tokenAddress}`;
      const existing = seeds.get(key);
      if (!existing) {
        seeds.set(key, {
          chainId,
          tokenAddress,
          boostTotal: opts.boostTotal ?? 0,
          boostCount: opts.boostCount ?? 0,
          hasProfile: opts.hasProfile ?? false,
          discovery: opts.discovery ?? "seed",
        });
        return;
      }
      existing.boostTotal += opts.boostTotal ?? 0;
      existing.boostCount += opts.boostCount ?? 0;
      existing.hasProfile = existing.hasProfile || (opts.hasProfile ?? false);
      if (existing.discovery === "seed" && opts.discovery) {
        existing.discovery = opts.discovery;
      }
    };

    // Fetch all seed sources in parallel
    const [boostsTop, boostsLatest, profiles, takeovers] =
      await Promise.allSettled([
        this.client.getTokenBoostsTop(),
        this.client.getTokenBoostsLatest(),
        this.client.getTokenProfilesLatest(),
        this.client.getCommunityTakeoversLatest(),
      ]);

    const extract = (
      result: PromiseSettledResult<Record<string, unknown>[]>,
    ): Record<string, unknown>[] =>
      result.status === "fulfilled" ? result.value : [];

    for (const row of extract(boostsTop)) {
      upsert(String(row.chainId ?? ""), String(row.tokenAddress ?? ""), {
        boostTotal: toFloat(row.totalAmount),
        boostCount: 1,
        discovery: "top-boosts",
      });
    }

    for (const row of extract(boostsLatest)) {
      upsert(String(row.chainId ?? ""), String(row.tokenAddress ?? ""), {
        boostTotal: toFloat(row.totalAmount),
        boostCount: 1,
        discovery: "latest-boosts",
      });
    }

    for (const row of extract(profiles)) {
      upsert(String(row.chainId ?? ""), String(row.tokenAddress ?? ""), {
        hasProfile: true,
        discovery: "profiles",
      });
    }

    for (const row of extract(takeovers)) {
      upsert(String(row.chainId ?? ""), String(row.tokenAddress ?? ""), {
        boostTotal: 45,
        boostCount: 1,
        hasProfile: true,
        discovery: "community",
      });
    }

    // Search-based discovery for broader chain coverage
    const queries = [
      "pepe", "meme", "pump", "moon", "degen",
      "ai", "agent", "cat", "dog", "frog",
    ];
    const searchResults = await Promise.allSettled(
      queries.map((q) => this.client.searchPairs(q)),
    );

    const nowMs = Date.now();
    for (const result of searchResults) {
      if (result.status !== "fulfilled") continue;
      for (const row of result.value) {
        const chainId = String(row.chainId ?? "");
        if (!chainSet.has(chainId)) continue;
        const base = (row.baseToken as Record<string, unknown>) ?? {};
        const token = String(base.address ?? "");
        if (!token) continue;

        const h1Txns = (
          ((row.txns as Record<string, unknown>) ?? {}).h1 as Record<
            string,
            unknown
          >
        ) ?? {};
        const buysH1 = toInt(h1Txns.buys);
        const sellsH1 = toInt(h1Txns.sells);
        const txnsH1 = buysH1 + sellsH1;
        const volumeH24 = toFloat(
          ((row.volume as Record<string, unknown>) ?? {}).h24,
        );
        const liquidityUsd = toFloat(
          ((row.liquidity as Record<string, unknown>) ?? {}).usd,
        );
        const pairCreatedAt = toInt(row.pairCreatedAt);

        let freshnessBonus = 0;
        if (pairCreatedAt > 0) {
          const ageH = Math.max((nowMs - pairCreatedAt) / 3_600_000, 0);
          freshnessBonus = Math.max(0, (168 - ageH) / 168) * 60;
        }

        const searchWeight =
          Math.min(volumeH24 / 100_000, 25) +
          Math.min(liquidityUsd / 50_000, 15) +
          Math.min(txnsH1 / 25, 20) +
          freshnessBonus;

        upsert(chainId, token, {
          boostTotal: searchWeight,
          boostCount: 1,
          discovery: "search",
        });
      }
    }

    return seeds;
  }

  private pairRank(pair: DexPairSnapshot): number {
    return (
      pair.liquidityUsd * 0.45 +
      pair.volumeH24 * 0.45 +
      (pair.buysH1 + pair.sellsH1) * 150 +
      pair.priceChangeH1 * 1500
    );
  }

  private bestPairsFromRows(
    rows: Record<string, unknown>[],
  ): Map<string, DexPairSnapshot> {
    const best = new Map<string, DexPairSnapshot>();
    for (const row of rows) {
      const pair = DexplorerClient.parsePairSnapshot(row);
      const key = `${pair.chainId}:${pair.baseAddress}`;
      const existing = best.get(key);
      if (!existing || this.pairRank(pair) > this.pairRank(existing)) {
        best.set(key, pair);
      }
    }
    return best;
  }

  private passesFilters(pair: DexPairSnapshot, filters: ScanFilters): boolean {
    if (pair.liquidityUsd < filters.minLiquidityUsd) return false;
    if (pair.volumeH24 < filters.minVolumeH24Usd) return false;
    if (pair.buysH1 + pair.sellsH1 < filters.minTxnsH1) return false;
    if (pair.priceChangeH1 < filters.minPriceChangeH1) return false;
    return true;
  }

  async scan(filters: ScanFilters): Promise<TokenCandidate[]> {
    const seeds = await this.collectSeeds(filters.chains);
    const target = Math.min(Math.max(filters.limit * 4, 12), 72);

    // Sort seeds by boost value, take top targets
    const sorted = [...seeds.values()].sort(
      (a, b) =>
        b.boostTotal - a.boostTotal ||
        b.boostCount - a.boostCount ||
        Number(b.hasProfile) - Number(a.hasProfile),
    );
    const selected = sorted.slice(0, target);

    // Batch-fetch pair data by chain
    const byChain = new Map<string, string[]>();
    for (const seed of selected) {
      const arr = byChain.get(seed.chainId) ?? [];
      arr.push(seed.tokenAddress);
      byChain.set(seed.chainId, arr);
    }

    const allRows: Record<string, unknown>[] = [];
    const fetches = [...byChain.entries()].map(async ([chainId, addrs]) => {
      try {
        const rows = await this.client.getPairsForTokens(chainId, addrs);
        allRows.push(...rows);
      } catch {
        // Skip failed chains
      }
    });
    await Promise.all(fetches);

    const prefetch = this.bestPairsFromRows(allRows);

    // Score and build candidates
    const candidates: TokenCandidate[] = [];
    for (const seed of selected) {
      const key = `${seed.chainId}:${seed.tokenAddress}`;
      const pair = prefetch.get(key);
      if (!pair) continue;
      if (!this.passesFilters(pair, filters)) continue;

      const tokenScore = scoreToken(
        pair,
        seed.boostTotal,
        seed.boostCount,
        seed.hasProfile,
      );
      const risk = computeRisk(pair);

      // Apply risk penalty
      const adjustedScore = Math.max(0, tokenScore.total - risk.penalty);

      candidates.push({
        pair,
        score: Math.round(adjustedScore * 100) / 100,
        boostTotal: seed.boostTotal,
        boostCount: seed.boostCount,
        hasProfile: seed.hasProfile,
        discovery: seed.discovery,
        tags: tokenScore.tags,
        risk,
      });
    }

    // De-duplicate per token
    const dedup = new Map<string, TokenCandidate>();
    for (const c of candidates) {
      const key = `${c.pair.chainId}:${c.pair.baseAddress}`;
      const existing = dedup.get(key);
      if (!existing || c.score > existing.score) {
        dedup.set(key, c);
      }
    }

    // Sort by score descending
    return [...dedup.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, filters.limit);
  }

  async searchTokens(
    query: string,
    limit = 20,
  ): Promise<DexPairSnapshot[]> {
    const rows = await this.client.searchPairs(query);
    return rows
      .slice(0, limit)
      .map((r) => DexplorerClient.parsePairSnapshot(r));
  }

  async inspectToken(
    chainId: string,
    tokenAddress: string,
  ): Promise<DexPairSnapshot[]> {
    const rows = await this.client.getTokenPairs(chainId, tokenAddress);
    return rows
      .map((r) => DexplorerClient.parsePairSnapshot(r))
      .sort(
        (a, b) =>
          b.liquidityUsd - a.liquidityUsd ||
          b.volumeH24 - a.volumeH24,
      );
  }
}
