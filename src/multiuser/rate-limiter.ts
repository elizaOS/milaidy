/**
 * Multi-user rate limiter scaffolding.
 *
 * Current default is in-memory (single-process). For production multi-instance
 * deployments, swap this with a shared backend (Redis/etc) via the same
 * interface.
 */

export interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
  retryAfterSec: number;
}

export interface RateLimiterInfo {
  mode: "memory" | "upstash";
  distributed: boolean;
  failClosed: boolean;
}

type MaybePromise<T> = T | Promise<T>;

export interface RateLimiter {
  check(
    key: string,
    maxRequests: number,
    windowMs: number,
    nowMs?: number,
  ): MaybePromise<RateLimitDecision>;
  cleanup(nowMs?: number): void;
  info(): RateLimiterInfo;
}

type Bucket = {
  count: number;
  resetAt: number;
};

export class InMemoryRateLimiter implements RateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  check(
    key: string,
    maxRequests: number,
    windowMs: number,
    nowMs = Date.now(),
  ): RateLimitDecision {
    const safeMax = Math.max(1, maxRequests);
    const safeWindow = Math.max(1_000, windowMs);

    const bucket = this.buckets.get(key);
    if (!bucket || nowMs > bucket.resetAt) {
      this.buckets.set(key, {
        count: 1,
        resetAt: nowMs + safeWindow,
      });
      return {
        allowed: true,
        remaining: safeMax - 1,
        retryAfterSec: Math.ceil(safeWindow / 1000),
      };
    }

    if (bucket.count >= safeMax) {
      return {
        allowed: false,
        remaining: 0,
        retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - nowMs) / 1000)),
      };
    }

    bucket.count += 1;
    return {
      allowed: true,
      remaining: Math.max(0, safeMax - bucket.count),
      retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - nowMs) / 1000)),
    };
  }

  cleanup(nowMs = Date.now()): void {
    for (const [key, bucket] of this.buckets) {
      if (nowMs > bucket.resetAt) this.buckets.delete(key);
    }
  }

  info(): RateLimiterInfo {
    return {
      mode: "memory",
      distributed: false,
      failClosed: false,
    };
  }
}

interface UpstashConfig {
  baseUrl: string;
  token: string;
  keyPrefix: string;
}

async function upstashPipeline(
  cfg: UpstashConfig,
  commands: Array<Array<string | number>>,
): Promise<Array<{ result?: unknown; error?: string }>> {
  const resp = await fetch(`${cfg.baseUrl}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(commands),
  });

  if (!resp.ok) {
    throw new Error(`Upstash request failed (${resp.status})`);
  }

  const json = (await resp.json()) as Array<{
    result?: unknown;
    error?: string;
  }>;
  if (!Array.isArray(json)) {
    throw new Error("Invalid Upstash response");
  }
  return json;
}

/**
 * Optional distributed limiter via Upstash Redis REST.
 * Fails open to in-memory fallback to avoid taking down the app.
 */
export class UpstashRateLimiter implements RateLimiter {
  private readonly cfg: UpstashConfig;
  private readonly fallback = new InMemoryRateLimiter();
  private readonly failClosed: boolean;

  constructor(cfg: UpstashConfig, failClosed: boolean) {
    this.cfg = cfg;
    this.failClosed = failClosed;
  }

  async check(
    key: string,
    maxRequests: number,
    windowMs: number,
    nowMs = Date.now(),
  ): Promise<RateLimitDecision> {
    const safeMax = Math.max(1, maxRequests);
    const safeWindow = Math.max(1_000, windowMs);
    const redisKey = `${this.cfg.keyPrefix}:${safeWindow}:${safeMax}:${key}`;

    try {
      const [incrRes, pttlRes] = await upstashPipeline(this.cfg, [
        ["INCR", redisKey],
        ["PTTL", redisKey],
      ]);

      if (incrRes?.error) throw new Error(incrRes.error);
      if (pttlRes?.error) throw new Error(pttlRes.error);

      const count = Number(incrRes?.result ?? 0);
      let pttl = Number(pttlRes?.result ?? -1);

      if (!Number.isFinite(count) || count <= 0) {
        throw new Error("Invalid increment result");
      }

      if (!Number.isFinite(pttl) || pttl < 0) {
        await upstashPipeline(this.cfg, [["PEXPIRE", redisKey, safeWindow]]);
        pttl = safeWindow;
      }

      if (count > safeMax) {
        return {
          allowed: false,
          remaining: 0,
          retryAfterSec: Math.max(1, Math.ceil(pttl / 1000)),
        };
      }

      return {
        allowed: true,
        remaining: Math.max(0, safeMax - count),
        retryAfterSec: Math.max(1, Math.ceil(pttl / 1000)),
      };
    } catch {
      if (this.failClosed) {
        throw new Error("Distributed rate limiter backend unavailable");
      }
      // Degrade to local process limiter if distributed backend is unavailable.
      return this.fallback.check(key, safeMax, safeWindow, nowMs);
    }
  }

  cleanup(nowMs = Date.now()): void {
    this.fallback.cleanup(nowMs);
  }

  info(): RateLimiterInfo {
    return {
      mode: "upstash",
      distributed: true,
      failClosed: this.failClosed,
    };
  }
}

/**
 * Factory point for future shared backend wiring.
 *
 * Keeps default runtime behavior unchanged while giving one switch-over point
 * when Redis-backed limits are introduced.
 */
export function createRateLimiter(): RateLimiter {
  const isProductionRuntime =
    process.env.MILAIDY_ENV === "production" ||
    process.env.NODE_ENV === "production";
  const strictProd =
    isProductionRuntime && process.env.MILAIDY_RATE_LIMIT_STRICT_PROD !== "0";
  const requireDistributed =
    process.env.MILAIDY_RATE_LIMIT_REQUIRE_DISTRIBUTED === "1" || strictProd;
  const failClosed =
    process.env.MILAIDY_RATE_LIMIT_FAIL_CLOSED === "1" || strictProd;

  const baseUrl =
    process.env.MILAIDY_REDIS_REST_URL?.trim() ??
    process.env.UPSTASH_REDIS_REST_URL?.trim() ??
    "";
  const token =
    process.env.MILAIDY_REDIS_REST_TOKEN?.trim() ??
    process.env.UPSTASH_REDIS_REST_TOKEN?.trim() ??
    "";

  if (!baseUrl || !token) {
    if (requireDistributed) {
      throw new Error(
        "Distributed rate limiter is required: set MILAIDY_REDIS_REST_URL and MILAIDY_REDIS_REST_TOKEN (or Upstash equivalents).",
      );
    }
    return new InMemoryRateLimiter();
  }

  const keyPrefix =
    process.env.MILAIDY_RATE_LIMIT_KEY_PREFIX?.trim() || "milaidy:rl";

  return new UpstashRateLimiter({ baseUrl, token, keyPrefix }, failClosed);
}
