/**
 * DexScreener Integration — Type definitions.
 *
 * Our own DexScreener types built for Milady's runtime.
 *
 * @module plugins/dexscreener/types
 */

// ---------- API / Data Types ----------

export interface DexPairSnapshot {
  chainId: string;
  dexId: string;
  pairAddress: string;
  pairUrl: string;
  baseAddress: string;
  baseSymbol: string;
  baseName: string;
  quoteSymbol: string;
  priceUsd: number;
  volumeH24: number;
  volumeH6: number;
  volumeH1: number;
  volumeM5: number;
  buysH1: number;
  sellsH1: number;
  buysH24: number;
  sellsH24: number;
  priceChangeH1: number;
  priceChangeH24: number;
  liquidityUsd: number;
  marketCap: number;
  fdv: number;
  pairCreatedAtMs: number | null;
  raw: Record<string, unknown>;
}

export interface TokenScore {
  total: number;
  components: {
    volume: number;
    transactions: number;
    liquidity: number;
    momentum: number;
    flow: number;
    boost: number;
    recency: number;
    profile: number;
  };
  tags: string[];
}

export interface RiskProfile {
  score: number;
  penalty: number;
  flags: string[];
}

export interface TokenCandidate {
  pair: DexPairSnapshot;
  score: number;
  boostTotal: number;
  boostCount: number;
  hasProfile: boolean;
  discovery: string;
  tags: string[];
  risk: RiskProfile;
}

// ---------- Scan Configuration ----------

export interface ScanFilters {
  chains: string[];
  limit: number;
  minLiquidityUsd: number;
  minVolumeH24Usd: number;
  minTxnsH1: number;
  minPriceChangeH1: number;
}

export const DEFAULT_SCAN_FILTERS: ScanFilters = {
  chains: ["solana", "base", "ethereum", "bsc"],
  limit: 20,
  minLiquidityUsd: 20_000,
  minVolumeH24Usd: 40_000,
  minTxnsH1: 30,
  minPriceChangeH1: -5.0,
};

// ---------- Alert Configuration ----------

export type AlertChannel = "hook" | "webhook" | "log";

export interface AlertRule {
  id: string;
  name: string;
  enabled: boolean;
  /** Minimum score (0-100) to trigger this alert. */
  minScore: number;
  /** Minimum seconds between alerts to avoid spam. */
  cooldownSeconds: number;
  /** Which chains to watch. Empty = all configured chains. */
  chains: string[];
  /** Alert delivery channels. */
  channels: AlertChannel[];
  /** Optional webhook URL for "webhook" channel. */
  webhookUrl?: string;
  /** Tags that must be present (any match) to trigger. Empty = no tag filter. */
  requiredTags: string[];
  /** Risk flags that block the alert. */
  blockedRiskFlags: string[];
  /** When true, alert fires as a Milady hook event (the key feature). */
  autoHook: boolean;
  /** Hook event action name (defaults to "dexscreener:alert"). */
  hookAction?: string;
  /** Last time an alert was sent for this rule (ISO string). */
  lastAlertAt?: string;
}

export const DEFAULT_ALERT_RULE: Omit<AlertRule, "id" | "name"> = {
  enabled: true,
  minScore: 75,
  cooldownSeconds: 900,
  chains: [],
  channels: ["hook", "log"],
  requiredTags: [],
  blockedRiskFlags: [],
  autoHook: true,
  hookAction: "dexscreener:alert",
};

// ---------- Alert Event (passed to hooks) ----------

export interface DexAlertEvent {
  ruleId: string;
  ruleName: string;
  timestamp: string;
  candidates: Array<{
    chainId: string;
    token: string;
    tokenName: string;
    score: number;
    priceChangeH1: number;
    volumeH24: number;
    liquidityUsd: number;
    pairUrl: string;
    tags: string[];
    riskFlags: string[];
  }>;
  topCandidate: {
    chainId: string;
    token: string;
    score: number;
    pairUrl: string;
  } | null;
}

// ---------- Plugin Config ----------

export interface DexScreenerPluginConfig {
  /** Polling interval in seconds for the scanner service. */
  scanIntervalSeconds?: number;
  /** Default scan filters. */
  filters?: Partial<ScanFilters>;
  /** Alert rules. */
  alertRules?: AlertRule[];
  /** API cache TTL in seconds. */
  cacheTtlSeconds?: number;
  /** Whether to register alerts as hooks automatically. */
  autoHookEnabled?: boolean;
}
