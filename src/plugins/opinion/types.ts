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
