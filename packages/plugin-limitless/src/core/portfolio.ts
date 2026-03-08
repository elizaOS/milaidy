import fetch from "cross-fetch";
import type { Trade, Position } from "./types.js";

function buildHeaders(apiKey?: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    ...(apiKey ? { "X-API-Key": apiKey } : {}),
  };
}

export class PortfolioClient {
  private headers: Record<string, string>;

  constructor(
    private baseUrl: string = "https://api.limitless.exchange",
    apiKey?: string,
  ) {
    this.headers = buildHeaders(apiKey);
  }

  async getTrades(): Promise<Trade[]> {
    const url = `${this.baseUrl}/portfolio/trades`;
    const res = await fetch(url, { headers: this.headers });
    if (!res.ok) throw new Error(`Failed to fetch trades: ${res.status}`);
    return await res.json();
  }

  async getPositions(): Promise<Position[]> {
    const url = `${this.baseUrl}/portfolio/positions`;
    const res = await fetch(url, { headers: this.headers });
    if (!res.ok) throw new Error(`Failed to fetch positions: ${res.status}`);
    return await res.json();
  }

  async getHistory(page: number = 1, limit: number = 10): Promise<any> {
    const url = `${this.baseUrl}/portfolio/history?page=${page}&limit=${limit}`;
    const res = await fetch(url, { headers: this.headers });
    if (!res.ok) throw new Error(`Failed to fetch history: ${res.status}`);
    return await res.json();
  }

  async getPnlChart(period: "1d" | "1w" | "1m" | "all" = "1d"): Promise<any> {
    const url = `${this.baseUrl}/portfolio/pnl-chart?period=${period}`;
    const res = await fetch(url, { headers: this.headers });
    if (!res.ok) throw new Error(`Failed to fetch PnL chart: ${res.status}`);
    return await res.json();
  }

  async verifyFill(
    marketSlug: string,
    side: "YES" | "NO",
  ): Promise<{ filled: boolean; balance: bigint }> {
    const url = `${this.baseUrl}/portfolio/positions`;
    const res = await fetch(url, { headers: this.headers });
    if (!res.ok) throw new Error(`Failed to fetch positions: ${res.status}`);
    const raw = await res.json();

    const positions: any[] = Array.isArray(raw)
      ? raw
      : [...(raw.clob ?? []), ...(raw.amm ?? []), ...(raw.group ?? [])];

    const match = positions.find(
      (p: any) => p.market?.slug === marketSlug || p.marketSlug === marketSlug,
    );

    if (!match) {
      return { filled: false, balance: 0n };
    }

    const sideData =
      side === "YES"
        ? (match.positions?.yes ?? match.yes ?? match.yesPosition)
        : (match.positions?.no ?? match.no ?? match.noPosition);

    if (!sideData) {
      return { filled: false, balance: 0n };
    }

    const rawBalance: string | number | bigint =
      sideData.tokensBalance ?? sideData.balance ?? sideData.size ?? "0";
    const balance = BigInt(Math.round(Number(rawBalance)));

    return { filled: balance > 0n, balance };
  }
}
