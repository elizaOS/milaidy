/**
 * DexScreener API client — our own implementation with rate limiting and caching.
 *
 * Uses the free, public DexScreener API. No keys required.
 *
 * @module plugins/dexscreener/client
 */

import type { DexPairSnapshot } from "./types";

const API_BASE = "https://api.dexscreener.com";
const DEFAULT_CACHE_TTL_MS = 10_000;
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_RETRIES = 3;
const RETRY_BACKOFF_MS = 500;

// Rate limits: slow bucket = 60 rpm, fast bucket = 300 rpm
const RATE_LIMITS_RPM: Record<string, number> = { slow: 60, fast: 300 };

const SAFE_PATH_RE = /^[a-zA-Z0-9_\-]+$/;

function validatePathSegment(value: string, name: string): string {
  if (!value || !SAFE_PATH_RE.test(value)) {
    throw new Error(
      `Invalid ${name}: must be alphanumeric/dash/underscore (got "${value}")`,
    );
  }
  return value;
}

// ---------- Sliding Window Rate Limiter ----------

class SlidingWindowLimiter {
  private readonly windowMs: number;
  private readonly maxCalls: number;
  private readonly calls: number[] = [];
  private pendingResolve: Array<() => void> = [];

  constructor(rpm: number) {
    this.windowMs = 60_000;
    this.maxCalls = rpm;
  }

  async acquire(): Promise<void> {
    const now = Date.now();
    // Evict expired entries
    while (this.calls.length > 0 && now - this.calls[0] >= this.windowMs) {
      this.calls.shift();
    }
    if (this.calls.length < this.maxCalls) {
      this.calls.push(now);
      return;
    }
    // Wait until a slot opens
    const waitFor = this.windowMs - (now - this.calls[0]) + 50;
    await new Promise<void>((resolve) => setTimeout(resolve, waitFor));
    return this.acquire();
  }
}

// ---------- Cache ----------

interface CacheEntry<T> {
  expiresAt: number;
  data: T;
}

// ---------- Client ----------

export class DexScreenerClient {
  private readonly cacheTtlMs: number;
  private readonly cache = new Map<string, CacheEntry<unknown>>();
  private readonly limiters: Record<string, SlidingWindowLimiter>;

  constructor(cacheTtlSeconds = DEFAULT_CACHE_TTL_MS / 1000) {
    this.cacheTtlMs = cacheTtlSeconds * 1000;
    this.limiters = {
      slow: new SlidingWindowLimiter(RATE_LIMITS_RPM.slow),
      fast: new SlidingWindowLimiter(RATE_LIMITS_RPM.fast),
    };
  }

  private cacheGet<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() >= entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return entry.data as T;
  }

  private cacheSet<T>(key: string, data: T): void {
    this.cache.set(key, { expiresAt: Date.now() + this.cacheTtlMs, data });
  }

  private async fetchJson<T>(path: string, bucket: string): Promise<T> {
    const cached = this.cacheGet<T>(path);
    if (cached !== null) return cached;

    const limiter = this.limiters[bucket];
    let attempt = 0;

    while (true) {
      await limiter.acquire();

      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        REQUEST_TIMEOUT_MS,
      );

      try {
        const response = await fetch(`${API_BASE}${path}`, {
          headers: { Accept: "application/json" },
          signal: controller.signal,
        });

        if (
          [429, 500, 502, 503, 504].includes(response.status) &&
          attempt < MAX_RETRIES
        ) {
          attempt++;
          const backoff =
            RETRY_BACKOFF_MS * 2 ** (attempt - 1) +
            Math.random() * 200;
          await new Promise((r) => setTimeout(r, backoff));
          continue;
        }

        if (!response.ok) {
          throw new Error(
            `DexScreener API error: ${response.status} ${response.statusText} for ${path}`,
          );
        }

        const data = (await response.json()) as T;
        this.cacheSet(path, data);
        return data;
      } finally {
        clearTimeout(timeout);
      }
    }
  }

  // ---------- Public API Methods ----------

  async getTokenBoostsTop(): Promise<Record<string, unknown>[]> {
    return this.fetchJson<Record<string, unknown>[]>(
      "/token-boosts/top/v1",
      "slow",
    );
  }

  async getTokenBoostsLatest(): Promise<Record<string, unknown>[]> {
    return this.fetchJson<Record<string, unknown>[]>(
      "/token-boosts/latest/v1",
      "slow",
    );
  }

  async getTokenProfilesLatest(): Promise<Record<string, unknown>[]> {
    return this.fetchJson<Record<string, unknown>[]>(
      "/token-profiles/latest/v1",
      "slow",
    );
  }

  async getCommunityTakeoversLatest(): Promise<Record<string, unknown>[]> {
    return this.fetchJson<Record<string, unknown>[]>(
      "/community-takeovers/latest/v1",
      "slow",
    );
  }

  async searchPairs(query: string): Promise<Record<string, unknown>[]> {
    const encoded = encodeURIComponent(query);
    const data = await this.fetchJson<Record<string, unknown>>(
      `/latest/dex/search?q=${encoded}`,
      "fast",
    );
    return (data.pairs as Record<string, unknown>[]) ?? [];
  }

  async getTokenPairs(
    chainId: string,
    tokenAddress: string,
  ): Promise<Record<string, unknown>[]> {
    validatePathSegment(chainId, "chainId");
    validatePathSegment(tokenAddress, "tokenAddress");
    return this.fetchJson<Record<string, unknown>[]>(
      `/token-pairs/v1/${chainId}/${tokenAddress}`,
      "fast",
    );
  }

  async getPairsForTokens(
    chainId: string,
    tokenAddresses: string[],
  ): Promise<Record<string, unknown>[]> {
    validatePathSegment(chainId, "chainId");
    const unique = [
      ...new Set(tokenAddresses.map((a) => a.trim()).filter(Boolean)),
    ];
    for (const addr of unique) validatePathSegment(addr, "tokenAddress");

    // API allows up to 30 token addresses per request
    const chunks: string[][] = [];
    for (let i = 0; i < unique.length; i += 30) {
      chunks.push(unique.slice(i, i + 30));
    }

    const merged: Record<string, unknown>[] = [];
    for (const chunk of chunks) {
      try {
        const rows = await this.fetchJson<Record<string, unknown>[]>(
          `/tokens/v1/${chainId}/${chunk.join(",")}`,
          "fast",
        );
        if (Array.isArray(rows)) merged.push(...rows);
      } catch {
        // Skip failed chunks
      }
    }
    return merged;
  }

  // ---------- Parse Helpers ----------

  static parsePairSnapshot(raw: Record<string, unknown>): DexPairSnapshot {
    const base = (raw.baseToken as Record<string, unknown>) ?? {};
    const quote = (raw.quoteToken as Record<string, unknown>) ?? {};
    const txns = (raw.txns as Record<string, unknown>) ?? {};
    const h1Txns = (txns.h1 as Record<string, unknown>) ?? {};
    const h24Txns = (txns.h24 as Record<string, unknown>) ?? {};
    const volume = (raw.volume as Record<string, unknown>) ?? {};
    const pChange = (raw.priceChange as Record<string, unknown>) ?? {};
    const liquidity = (raw.liquidity as Record<string, unknown>) ?? {};

    return {
      chainId: String(raw.chainId ?? ""),
      dexId: String(raw.dexId ?? ""),
      pairAddress: String(raw.pairAddress ?? ""),
      pairUrl: String(raw.url ?? ""),
      baseAddress: String(base.address ?? ""),
      baseSymbol: String(base.symbol ?? ""),
      baseName: String(base.name ?? ""),
      quoteSymbol: String(quote.symbol ?? ""),
      priceUsd: toFloat(raw.priceUsd),
      volumeH24: toFloat(volume.h24),
      volumeH6: toFloat(volume.h6),
      volumeH1: toFloat(volume.h1),
      volumeM5: toFloat(volume.m5),
      buysH1: toInt(h1Txns.buys),
      sellsH1: toInt(h1Txns.sells),
      buysH24: toInt(h24Txns.buys),
      sellsH24: toInt(h24Txns.sells),
      priceChangeH1: toFloat(pChange.h1),
      priceChangeH24: toFloat(pChange.h24),
      liquidityUsd: toFloat(liquidity.usd),
      marketCap: toFloat(raw.marketCap),
      fdv: toFloat(raw.fdv),
      pairCreatedAtMs: raw.pairCreatedAt != null ? toInt(raw.pairCreatedAt) || null : null,
      raw,
    };
  }
}

// ---------- Utilities ----------

function toFloat(value: unknown, fallback = 0): number {
  if (value == null) return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toInt(value: unknown, fallback = 0): number {
  if (value == null) return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? Math.floor(n) : fallback;
}
