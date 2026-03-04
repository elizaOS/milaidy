/**
 * Opinion Trade plugin types.
 *
 * Supplements SDK types with plugin-specific contracts.
 */

/** Plugin config extracted from environment variables. */
export interface OpinionPluginConfig {
  apiKey: string;
  privateKey?: string;
  multiSigAddress?: string;
  maxBetUsd: number;
  rpcUrl: string;
}

/** Simplified market for display. */
export interface OpinionMarketSummary {
  id: number;
  title: string;
  status: string;
  yesPrice: string;
  noPrice: string;
  yesTokenId: string;
  noTokenId: string;
  endDate: string;
}

/** Simplified position for display. */
export interface OpinionPositionSummary {
  marketId: number;
  marketTitle: string;
  side: "yes" | "no";
  shares: string;
  avgPrice: string;
  currentPrice: string;
  unrealizedPnl: string;
}

/** An open order returned by the CLOB API. */
export interface OpinionOrder {
  orderId?: string;
  marketId?: number;
  side?: string;
  price?: number | string;
  shares?: number | string;
  size?: number | string;
  status?: string;
}

/** A user position returned by the CLOB API. */
export interface OpinionPosition {
  marketId?: number;
  marketTitle?: string;
  side?: string;
  shares?: number | string;
  avgEntryPrice?: number | string;
  currentPrice?: number | string;
  avgPrice?: number | string;
  unrealizedPnl?: number | string;
  size?: number | string;
}

/** A child market within a parent market. */
export interface ChildMarket {
  outcomeName?: string;
  outcome?: string;
  groupItemTitle?: string;
  outcomePrices?: string;
  lastPrice?: number | string;
  tokenId?: string;
}

/** An entry in an order book (bid or ask). */
export interface OrderBookEntry {
  price?: string | number;
  size?: string | number;
}

/** A market from the list/detail API. */
export interface OpinionMarket {
  id?: number;
  title?: string;
  question?: string;
  childMarkets?: ChildMarket[];
  volume?: number;
  endTime?: string;
  endDate?: string;
}
