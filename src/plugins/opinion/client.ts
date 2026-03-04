/**
 * OpinionClient — wraps @opinion-labs/opinion-clob-sdk.
 *
 * Handles initialization, read-only vs full trading modes,
 * and bet safety cap enforcement.
 */
import type {
  MarketResult,
  MarketsResult,
  OpinionPluginConfig,
  OpinionPosition,
  OrderbookResult,
  OrdersResult,
  PlaceOrderResult,
  SdkResponse,
} from "./types.js";

/** Local interfaces for the dynamically-loaded SDK to avoid `any`. */
interface SdkClientInstance {
  getMarkets(
    opts: Record<string, unknown>,
  ): Promise<SdkResponse<MarketsResult>>;
  getMarket(id: number): Promise<SdkResponse<MarketResult>>;
  getCategoricalMarket(id: number): Promise<SdkResponse<MarketResult>>;
  getOrderbook(tokenId: string): Promise<SdkResponse<OrderbookResult>>;
  getLatestPrice(tokenId: string): Promise<SdkResponse<{ price: string }>>;
  getMyPositions(): Promise<SdkResponse<OpinionPosition[]>>;
  getMyOrders(
    opts: Record<string, unknown>,
  ): Promise<SdkResponse<OrdersResult>>;
  placeOrder(
    opts: Record<string, unknown>,
  ): Promise<SdkResponse<PlaceOrderResult>>;
  cancelOrder(id: string): Promise<SdkResponse>;
  cancelAllOrders(): Promise<SdkResponse>;
  enableTrading(): Promise<SdkResponse>;
  redeem(id: number): Promise<unknown[]>;
}

interface SdkOrderSideEnum {
  BUY: number;
  SELL: number;
}

interface SdkOrderTypeEnum {
  MARKET_ORDER: number;
  LIMIT_ORDER: number;
}

let SdkClient:
  | (new (
      opts: Record<string, unknown>,
    ) => SdkClientInstance)
  | undefined;
let SdkOrderSide: SdkOrderSideEnum | undefined;
let SdkOrderType: SdkOrderTypeEnum | undefined;
let SDK_CHAIN_ID: number;
let SDK_HOST: string;

async function loadSdk() {
  try {
    const sdk = await import("@opinion-labs/opinion-clob-sdk");
    SdkClient = sdk.Client as unknown as
      | (new (
          opts: Record<string, unknown>,
        ) => SdkClientInstance)
      | undefined;
    SdkOrderSide = sdk.OrderSide;
    SdkOrderType = sdk.OrderType;
    SDK_CHAIN_ID = sdk.CHAIN_ID_BNB_MAINNET;
    SDK_HOST = sdk.DEFAULT_API_HOST;
  } catch {
    throw new Error(
      "Failed to load @opinion-labs/opinion-clob-sdk — run pnpm install",
    );
  }
}

export class OpinionClient {
  private client: SdkClientInstance | null = null;
  private readOnly = true;
  private maxBetUsd = 500;
  private tradingEnabled = false;

  get isReady(): boolean {
    return this.client !== null;
  }

  get canTrade(): boolean {
    return this.isReady && !this.readOnly;
  }

  async initialize(
    config: Omit<OpinionPluginConfig, "apiKey"> & { apiKey: string },
  ) {
    await loadSdk();

    this.maxBetUsd = config.maxBetUsd;

    const hasKeys = Boolean(config.privateKey && config.multiSigAddress);
    this.readOnly = !hasKeys;

    const opts: Record<string, unknown> = {
      host: SDK_HOST,
      apiKey: config.apiKey,
      chainId: SDK_CHAIN_ID,
      rpcUrl: config.rpcUrl,
    };
    if (hasKeys) {
      opts.privateKey = config.privateKey;
      opts.multiSigAddress = config.multiSigAddress;
    }

    // SdkClient is guaranteed defined after loadSdk() succeeds (it throws on failure)
    if (!SdkClient) throw new Error("SDK not loaded");
    this.client = new SdkClient(opts);
  }

  // ── Market data (read-only) ──────────────────────────────

  async getMarkets(page = 1, limit = 10) {
    this.ensureReady();
    return this.client?.getMarkets({ page, limit, status: "activated" });
  }

  async getMarket(marketId: number) {
    this.ensureReady();
    return this.client?.getMarket(marketId);
  }

  async getCategoricalMarket(marketId: number) {
    this.ensureReady();
    return this.client?.getCategoricalMarket(marketId);
  }

  async getOrderbook(tokenId: string) {
    this.ensureReady();
    return this.client?.getOrderbook(tokenId);
  }

  async getLatestPrice(tokenId: string) {
    this.ensureReady();
    return this.client?.getLatestPrice(tokenId);
  }

  // ── User data ────────────────────────────────────────────

  async getPositions() {
    this.ensureReady();
    return this.client?.getMyPositions();
  }

  async getOrders(status?: string) {
    this.ensureReady();
    return this.client?.getMyOrders({ status });
  }

  // ── Trading ──────────────────────────────────────────────

  async placeBet(params: {
    marketId: number;
    tokenId: string;
    side: "buy" | "sell";
    amount: string;
    price?: string;
  }) {
    this.ensureCanTrade();

    const amount = Number(params.amount);
    if (amount > this.maxBetUsd) {
      throw new Error(
        `Bet amount $${params.amount} exceeds safety cap of $${this.maxBetUsd}`,
      );
    }

    if (!this.tradingEnabled) {
      await this.client?.enableTrading();
      this.tradingEnabled = true;
    }

    const isMarketOrder = !params.price;
    return this.client?.placeOrder({
      marketId: params.marketId,
      tokenId: params.tokenId,
      side: params.side === "buy" ? SdkOrderSide?.BUY : SdkOrderSide?.SELL,
      orderType: isMarketOrder
        ? SdkOrderType?.MARKET_ORDER
        : SdkOrderType?.LIMIT_ORDER,
      price: params.price || "0",
      makerAmountInQuoteToken: params.amount,
    });
  }

  async cancelOrder(orderId: string) {
    this.ensureCanTrade();
    return this.client?.cancelOrder(orderId);
  }

  async cancelAllOrders() {
    this.ensureCanTrade();
    return this.client?.cancelAllOrders();
  }

  async redeem(marketId: number) {
    this.ensureCanTrade();
    return this.client?.redeem(marketId);
  }

  // ── Internal ─────────────────────────────────────────────

  private ensureReady() {
    if (!this.isReady) throw new Error("OpinionClient not initialized");
  }

  private ensureCanTrade() {
    this.ensureReady();
    if (!this.canTrade)
      throw new Error(
        "Trading not enabled — set OPINION_PRIVATE_KEY and OPINION_MULTISIG_ADDRESS",
      );
  }
}

/** Singleton instance used by the plugin. */
export const opinionClient = new OpinionClient();
