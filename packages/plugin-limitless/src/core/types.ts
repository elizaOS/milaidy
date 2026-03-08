export interface Token {
  address: string;
  decimals: number;
  symbol: string;
}

export interface MarketVenue {
  exchange: string;
  adapter: string;
}

export interface Market {
  id: number;
  address: string;
  title: string;
  prices: number[];
  tradeType: "amm" | "clob" | "group";
  marketType: "single" | "group";
  slug: string;
  venue: MarketVenue;
  positionIds: string[];
  collateralToken: Token;
  volume: string;
  volumeFormatted: string;
  liquidity: string;
  liquidityFormatted: string;
  expirationTimestamp: number;
  status: "FUNDED" | "CLOSED" | "RESOLVED";
}

export interface MarketDetail extends Market {
  description?: string;
  resolutionSource?: string;
}

export interface OrderbookLevel {
  price: string;
  size: string;
}

export interface Orderbook {
  bids: OrderbookLevel[];
  asks: OrderbookLevel[];
  midpoint?: number;
}

export interface Order {
  id: string;
  marketSlug: string;
  side: "YES" | "NO";
  price: number;
  size: number;
  filledSize: number;
  status: "OPEN" | "FILLED" | "CANCELLED" | "EXPIRED";
  timestamp: number;
}

export const EIP712_DOMAIN = {
  name: "Limitless CTF Exchange",
  version: "1",
  chainId: 8453,
} as const;

export const EIP712_TYPES = {
  Order: [
    { name: "salt", type: "uint256" },
    { name: "maker", type: "address" },
    { name: "signer", type: "address" },
    { name: "taker", type: "address" },
    { name: "tokenId", type: "uint256" },
    { name: "makerAmount", type: "uint256" },
    { name: "takerAmount", type: "uint256" },
    { name: "expiration", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "feeRateBps", type: "uint256" },
    { name: "side", type: "uint8" },
    { name: "signatureType", type: "uint8" },
  ],
} as const;

export interface SignedOrder {
  salt: number | string;
  maker: string;
  signer: string;
  taker: string;
  tokenId: string;
  makerAmount: string | number;
  takerAmount: string | number;
  expiration: string | number;
  nonce: number;
  feeRateBps: number;
  side: 0 | 1;
  signatureType: 0 | 1;
  signature: string;
}

export interface Trade {
  id: string;
  marketId: number;
  strategy: string;
  outcome: string;
  tradeAmount: string;
  tradeAmountUSD: string;
  timestamp: string;
}

export interface Position {
  market: {
    title: string;
    slug: string;
  };
  positions: {
    yes?: {
      marketValue: string;
      unrealizedPnl: string;
      fillPrice: string;
    };
    no?: {
      marketValue: string;
      unrealizedPnl: string;
      fillPrice: string;
    };
  };
}

export interface LimitlessConfig {
  privateKey: string;
  apiKey: string;
  dryRun: boolean;
  maxSingleTradeUsd: number;
  maxTotalExposureUsd: number;
  apiBaseUrl: string;
}
