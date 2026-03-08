import fetch from "cross-fetch";
import type { Market, MarketDetail, Orderbook } from "./types.js";

function buildHeaders(apiKey?: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    ...(apiKey ? { "X-API-Key": apiKey } : {}),
  };
}

export class LimitlessClient {
  private venueCache: Map<string, Market["venue"]> = new Map();
  private headers: Record<string, string>;

  constructor(
    private baseUrl: string = "https://api.limitless.exchange",
    apiKey?: string,
  ) {
    this.headers = buildHeaders(apiKey);
  }

  async getActiveMarkets(
    options: {
      category?: number;
      tradeType?: "amm" | "clob" | "group";
      limit?: number;
      offset?: number;
    } = {},
  ): Promise<Market[]> {
    const params = new URLSearchParams();
    if (options.category) params.append("category", options.category.toString());
    if (options.tradeType) params.append("tradeType", options.tradeType);
    if (options.limit) params.append("limit", options.limit.toString());
    if (options.offset) params.append("offset", options.offset.toString());

    const url = `${this.baseUrl}/markets/active?${params.toString()}`;
    const res = await fetch(url, { headers: this.headers });

    if (!res.ok) {
      throw new Error(`Failed to fetch markets: ${res.status} ${res.statusText}`);
    }

    const data = await res.json();
    const markets = data.data || [];

    markets.forEach((m: Market) => {
      if (m.slug && m.venue) {
        this.venueCache.set(m.slug, m.venue);
      }
    });

    return markets.map((m: any) => ({
      ...m,
      positionIds: m.tokens ? [m.tokens.yes, m.tokens.no] : m.positionIds,
    }));
  }

  async searchMarkets(
    query: string,
    options: { limit?: number; page?: number } = {},
  ): Promise<Market[]> {
    const params = new URLSearchParams();
    params.append("query", query);
    if (options.limit) params.append("limit", options.limit.toString());
    if (options.page) params.append("page", options.page.toString());

    const url = `${this.baseUrl}/markets/search?${params.toString()}`;
    const res = await fetch(url, { headers: this.headers });

    if (!res.ok) {
      throw new Error(`Failed to search markets: ${res.status} ${res.statusText}`);
    }

    const data = await res.json();
    const markets = Array.isArray(data) ? data : (data.markets || data.data || []);

    markets.forEach((m: Market) => {
      if (m.slug && m.venue) {
        this.venueCache.set(m.slug, m.venue);
      }
    });

    return markets;
  }

  async searchHourlyMarkets(asset: string): Promise<Market[]> {
    const query = `${asset.toUpperCase()} above`;
    const results = await this.searchMarkets(query, { limit: 50 });

    const nowMs = Date.now();
    const sixtyMinMs = 60 * 60 * 1000;

    return results.filter((m: any) => {
      if (m.automationType && m.automationType !== "lumy") return false;
      if (!m.expirationTimestamp) return false;
      const msUntilExpiry = m.expirationTimestamp - nowMs;
      return msUntilExpiry > 0 && msUntilExpiry <= sixtyMinMs;
    });
  }

  async getMarket(slug: string): Promise<MarketDetail> {
    const url = `${this.baseUrl}/markets/${slug}`;
    const res = await fetch(url, { headers: this.headers });

    if (!res.ok) {
      throw new Error(`Failed to fetch market ${slug}: ${res.status} ${res.statusText}`);
    }

    const market = (await res.json()) as MarketDetail;

    if (market.venue) {
      this.venueCache.set(slug, market.venue);
    }

    if ((market as any).tokens && !market.positionIds) {
      market.positionIds = [(market as any).tokens.yes, (market as any).tokens.no];
    }

    return market;
  }

  async getOrderbook(slug: string): Promise<Orderbook> {
    const url = `${this.baseUrl}/markets/${slug}/orderbook`;
    const res = await fetch(url, { headers: this.headers });

    if (!res.ok) {
      throw new Error(`Failed to fetch orderbook for ${slug}`);
    }

    return (await res.json()) as Orderbook;
  }

  async getSlugs(): Promise<string[]> {
    const url = `${this.baseUrl}/markets/active/slugs`;
    const res = await fetch(url, { headers: this.headers });
    if (!res.ok) throw new Error(`Failed to fetch slugs: ${res.status}`);
    return await res.json();
  }

  async getVenue(slug: string): Promise<Market["venue"]> {
    if (this.venueCache.has(slug)) {
      return this.venueCache.get(slug)!;
    }
    const market = await this.getMarket(slug);
    return market.venue;
  }
}
