# Opinion Trade Plugin Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an Opinion Trade prediction market plugin that lets the Milady agent browse markets, place bets, manage positions, and monitor prices via WebSocket.

**Architecture:** Direct SDK integration — plugin imports `@opinion-labs/opinion-clob-sdk` and calls SDK methods from actions. Independent keypair (`OPINION_PRIVATE_KEY` + `OPINION_MULTISIG_ADDRESS`), reuse existing `tradePermissionMode`, $500 default bet cap.

**Tech Stack:** TypeScript, `@opinion-labs/opinion-clob-sdk` v0.5.2, BNB Chain (chainId 56), vitest for tests.

**Design doc:** `docs/plans/2026-03-01-opinion-trade-plugin-design.md`

---

### Task 1: Extend AwarenessInvalidationEvent type

**Files:**
- Modify: `src/contracts/awareness.ts:20-26`

**Step 1: Add new events to the union type**

In `src/contracts/awareness.ts`, add `"opinion-updated"` to `AwarenessInvalidationEvent`:

```typescript
export type AwarenessInvalidationEvent =
  | "permission-changed"
  | "plugin-changed"
  | "wallet-updated"
  | "provider-changed"
  | "config-changed"
  | "runtime-restarted"
  | "opinion-updated";
```

**Step 2: Run existing tests to verify nothing breaks**

Run: `bunx vitest run src/awareness/`
Expected: All existing awareness tests pass.

**Step 3: Commit**

```bash
git add src/contracts/awareness.ts
git commit -m "feat(awareness): add opinion-updated invalidation event"
```

---

### Task 2: Install SDK and create types

**Files:**
- Create: `src/plugins/opinion/types.ts`

**Step 1: Install the SDK**

Run: `pnpm add @opinion-labs/opinion-clob-sdk`

Verify: `pnpm ls @opinion-labs/opinion-clob-sdk` shows the package installed.

If the SDK fails to install (unpublished or incompatible), fall back to raw REST API calls using `fetch`. In that case, define all API response types in `types.ts` and skip SDK imports throughout the plan — replace SDK calls with fetch calls to `https://openapi.opinion.trade/openapi/*`.

**Step 2: Create types.ts**

```typescript
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
```

**Step 3: Commit**

```bash
git add src/plugins/opinion/types.ts pnpm-lock.yaml package.json
git commit -m "feat(opinion): add SDK dependency and plugin types"
```

---

### Task 3: Create OpinionClient wrapper

**Files:**
- Create: `src/plugins/opinion/client.ts`
- Create: `src/plugins/opinion/__tests__/client.test.ts`

**Step 1: Write the failing test**

```typescript
import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock the SDK module before importing client
vi.mock("@opinion-labs/opinion-clob-sdk", () => ({
  Client: vi.fn().mockImplementation(() => ({
    getMarkets: vi.fn().mockResolvedValue({ result: { list: [] } }),
    getMarket: vi.fn().mockResolvedValue({ result: {} }),
    getOrderbook: vi.fn().mockResolvedValue({ result: { bids: [], asks: [] } }),
    getLatestPrice: vi.fn().mockResolvedValue({ result: { price: "0.55" } }),
    getMyPositions: vi.fn().mockResolvedValue({ result: [] }),
    getMyOrders: vi.fn().mockResolvedValue({ result: { list: [] } }),
    placeOrder: vi.fn().mockResolvedValue({ result: { orderId: "123" } }),
    cancelOrder: vi.fn().mockResolvedValue({ result: {} }),
    cancelAllOrders: vi.fn().mockResolvedValue({ result: {} }),
    enableTrading: vi.fn().mockResolvedValue({}),
    redeem: vi.fn().mockResolvedValue(["0xhash", {}, {}]),
  })),
  CHAIN_ID_BNB_MAINNET: 56,
  DEFAULT_API_HOST: "https://openapi.opinion.trade/openapi",
  OrderSide: { BUY: 0, SELL: 1 },
  OrderType: { LIMIT_ORDER: 0, MARKET_ORDER: 1 },
}));

import { OpinionClient } from "../client.js";

describe("OpinionClient", () => {
  let client: OpinionClient;

  beforeEach(() => {
    client = new OpinionClient();
  });

  it("isReady returns false before initialization", () => {
    expect(client.isReady).toBe(false);
  });

  it("canTrade returns false before initialization", () => {
    expect(client.canTrade).toBe(false);
  });

  it("initializes in read-only mode without private key", async () => {
    await client.initialize({
      apiKey: "test-key",
      maxBetUsd: 500,
      rpcUrl: "https://bsc-dataseed.binance.org",
    });
    expect(client.isReady).toBe(true);
    expect(client.canTrade).toBe(false);
  });

  it("initializes in full mode with private key and multi-sig", async () => {
    await client.initialize({
      apiKey: "test-key",
      privateKey: "0x" + "a".repeat(64),
      multiSigAddress: "0x" + "b".repeat(40),
      maxBetUsd: 500,
      rpcUrl: "https://bsc-dataseed.binance.org",
    });
    expect(client.isReady).toBe(true);
    expect(client.canTrade).toBe(true);
  });

  it("getMarkets returns market list", async () => {
    await client.initialize({
      apiKey: "test-key",
      maxBetUsd: 500,
      rpcUrl: "https://bsc-dataseed.binance.org",
    });
    const result = await client.getMarkets();
    expect(result).toBeDefined();
  });

  it("placeBet throws when not in trading mode", async () => {
    await client.initialize({
      apiKey: "test-key",
      maxBetUsd: 500,
      rpcUrl: "https://bsc-dataseed.binance.org",
    });
    await expect(
      client.placeBet({
        marketId: 1,
        tokenId: "abc",
        side: "buy",
        amount: "10",
      }),
    ).rejects.toThrow("Trading not enabled");
  });

  it("placeBet rejects amount exceeding max bet", async () => {
    await client.initialize({
      apiKey: "test-key",
      privateKey: "0x" + "a".repeat(64),
      multiSigAddress: "0x" + "b".repeat(40),
      maxBetUsd: 50,
      rpcUrl: "https://bsc-dataseed.binance.org",
    });
    await expect(
      client.placeBet({
        marketId: 1,
        tokenId: "abc",
        side: "buy",
        amount: "100",
      }),
    ).rejects.toThrow(/exceeds.*50/i);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bunx vitest run src/plugins/opinion/__tests__/client.test.ts`
Expected: FAIL — module `../client.js` not found.

**Step 3: Write the implementation**

```typescript
/**
 * OpinionClient — wraps @opinion-labs/opinion-clob-sdk.
 *
 * Handles initialization, read-only vs full trading modes,
 * and bet safety cap enforcement.
 */
import type { OpinionPluginConfig } from "./types.js";

let SdkClient: any;
let SdkOrderSide: any;
let SdkOrderType: any;
let SDK_CHAIN_ID: number;
let SDK_HOST: string;

async function loadSdk() {
  const sdk = await import("@opinion-labs/opinion-clob-sdk");
  SdkClient = sdk.Client;
  SdkOrderSide = sdk.OrderSide;
  SdkOrderType = sdk.OrderType;
  SDK_CHAIN_ID = sdk.CHAIN_ID_BNB_MAINNET;
  SDK_HOST = sdk.DEFAULT_API_HOST;
}

export class OpinionClient {
  private client: any = null;
  private readOnly = true;
  private maxBetUsd = 500;
  private tradingEnabled = false;

  get isReady(): boolean {
    return this.client !== null;
  }

  get canTrade(): boolean {
    return this.isReady && !this.readOnly;
  }

  async initialize(config: Omit<OpinionPluginConfig, "apiKey"> & { apiKey: string }) {
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

    this.client = new SdkClient(opts);
  }

  // ── Market data (read-only) ──────────────────────────────

  async getMarkets(page = 1, limit = 10) {
    this.ensureReady();
    return this.client.getMarkets({ page, limit, status: "activated" });
  }

  async getMarket(marketId: number) {
    this.ensureReady();
    return this.client.getMarket(marketId);
  }

  async getCategoricalMarket(marketId: number) {
    this.ensureReady();
    return this.client.getCategoricalMarket(marketId);
  }

  async getOrderbook(tokenId: string) {
    this.ensureReady();
    return this.client.getOrderbook(tokenId);
  }

  async getLatestPrice(tokenId: string) {
    this.ensureReady();
    return this.client.getLatestPrice(tokenId);
  }

  // ── User data ────────────────────────────────────────────

  async getPositions() {
    this.ensureReady();
    return this.client.getMyPositions();
  }

  async getOrders(status?: string) {
    this.ensureReady();
    return this.client.getMyOrders({ status });
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
      await this.client.enableTrading();
      this.tradingEnabled = true;
    }

    const isMarketOrder = !params.price;
    return this.client.placeOrder({
      marketId: params.marketId,
      tokenId: params.tokenId,
      side: params.side === "buy" ? SdkOrderSide.BUY : SdkOrderSide.SELL,
      orderType: isMarketOrder ? SdkOrderType.MARKET_ORDER : SdkOrderType.LIMIT_ORDER,
      price: params.price || "0",
      makerAmountInQuoteToken: params.amount,
    });
  }

  async cancelOrder(orderId: string) {
    this.ensureCanTrade();
    return this.client.cancelOrder(orderId);
  }

  async cancelAllOrders() {
    this.ensureCanTrade();
    return this.client.cancelAllOrders();
  }

  async redeem(marketId: number) {
    this.ensureCanTrade();
    return this.client.redeem(marketId);
  }

  // ── Internal ─────────────────────────────────────────────

  private ensureReady() {
    if (!this.isReady) throw new Error("OpinionClient not initialized");
  }

  private ensureCanTrade() {
    this.ensureReady();
    if (!this.canTrade) throw new Error("Trading not enabled — set OPINION_PRIVATE_KEY and OPINION_MULTISIG_ADDRESS");
  }
}

/** Singleton instance used by the plugin. */
export const opinionClient = new OpinionClient();
```

**Step 4: Run test to verify it passes**

Run: `bunx vitest run src/plugins/opinion/__tests__/client.test.ts`
Expected: All 6 tests PASS.

**Step 5: Commit**

```bash
git add src/plugins/opinion/client.ts src/plugins/opinion/__tests__/client.test.ts
git commit -m "feat(opinion): add OpinionClient SDK wrapper with tests"
```

---

### Task 4: Create LIST_OPINION_MARKETS action

**Files:**
- Create: `src/plugins/opinion/actions/list-opinion-markets.ts`
- Create: `src/plugins/opinion/__tests__/list-opinion-markets.test.ts`

**Step 1: Write the failing test**

```typescript
import { describe, expect, it, vi, beforeEach } from "vitest";
import { listOpinionMarketsAction } from "../actions/list-opinion-markets.js";

// Mock the client
vi.mock("../client.js", () => ({
  opinionClient: {
    isReady: true,
    getMarkets: vi.fn().mockResolvedValue({
      result: {
        list: [
          {
            id: 813,
            title: "Will CPI exceed 3.5%?",
            status: 2,
            childMarkets: [
              { tokenId: "tok-yes", outcomeName: "Yes", lastPrice: "0.62" },
              { tokenId: "tok-no", outcomeName: "No", lastPrice: "0.38" },
            ],
            endTime: "2026-04-01T00:00:00Z",
          },
        ],
        total: 1,
      },
    }),
  },
}));

describe("LIST_OPINION_MARKETS", () => {
  it("has correct name and similes", () => {
    expect(listOpinionMarketsAction.name).toBe("LIST_OPINION_MARKETS");
    expect(listOpinionMarketsAction.similes).toContain("OPINION_MARKETS");
  });

  it("handler returns formatted market list", async () => {
    const result = await listOpinionMarketsAction.handler(
      {} as any, {} as any, {} as any,
      { parameters: {} } as any,
    );
    expect(result.success).toBe(true);
    expect(result.text).toContain("CPI");
    expect(result.text).toContain("0.62");
  });

  it("validate returns true when client is ready", async () => {
    const valid = await listOpinionMarketsAction.validate!({} as any, {} as any);
    expect(valid).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bunx vitest run src/plugins/opinion/__tests__/list-opinion-markets.test.ts`
Expected: FAIL — module not found.

**Step 3: Write the implementation**

```typescript
/**
 * LIST_OPINION_MARKETS — lists active prediction markets on Opinion.trade.
 */
import type { Action, HandlerOptions } from "@elizaos/core";
import { opinionClient } from "../client.js";

export const listOpinionMarketsAction: Action = {
  name: "LIST_OPINION_MARKETS",

  similes: [
    "OPINION_MARKETS",
    "PREDICTION_MARKETS",
    "SHOW_MARKETS",
    "BROWSE_PREDICTIONS",
  ],

  description:
    "List active prediction markets on Opinion.trade. Use when user asks " +
    "about available prediction markets, macro bets, or economic events to trade.",

  validate: async () => opinionClient.isReady,

  handler: async (_runtime, _message, _state, options) => {
    try {
      const params = (options as HandlerOptions | undefined)?.parameters;
      const page = typeof params?.page === "number" ? params.page : 1;

      const response = await opinionClient.getMarkets(page);
      const markets = response?.result?.list;

      if (!markets?.length) {
        return { text: "No active prediction markets found.", success: true };
      }

      const lines = markets.map((m: any) => {
        const yes = m.childMarkets?.find((c: any) =>
          c.outcomeName?.toLowerCase() === "yes",
        );
        const no = m.childMarkets?.find((c: any) =>
          c.outcomeName?.toLowerCase() === "no",
        );
        const yesPrice = yes?.lastPrice ?? "—";
        const noPrice = no?.lastPrice ?? "—";
        const end = m.endTime
          ? new Date(m.endTime).toLocaleDateString()
          : "TBD";
        return `#${m.id} ${m.title}\n  YES: ${yesPrice} | NO: ${noPrice} | Ends: ${end}`;
      });

      const total = response.result.total ?? markets.length;
      const header = `Prediction Markets (page ${page}, ${total} total):\n`;
      return { text: header + lines.join("\n\n"), success: true };
    } catch (err) {
      return {
        text: `Failed to list markets: ${err instanceof Error ? err.message : String(err)}`,
        success: false,
      };
    }
  },

  parameters: [
    {
      name: "page",
      description: "Page number (default 1)",
      required: false,
      schema: { type: "number" as const },
    },
  ],
};
```

**Step 4: Run test to verify it passes**

Run: `bunx vitest run src/plugins/opinion/__tests__/list-opinion-markets.test.ts`
Expected: All 3 tests PASS.

**Step 5: Commit**

```bash
git add src/plugins/opinion/actions/list-opinion-markets.ts src/plugins/opinion/__tests__/list-opinion-markets.test.ts
git commit -m "feat(opinion): add LIST_OPINION_MARKETS action"
```

---

### Task 5: Create GET_OPINION_MARKET action

**Files:**
- Create: `src/plugins/opinion/actions/get-opinion-market.ts`
- Create: `src/plugins/opinion/__tests__/get-opinion-market.test.ts`

**Step 1: Write the failing test**

```typescript
import { describe, expect, it, vi } from "vitest";
import { getOpinionMarketAction } from "../actions/get-opinion-market.js";

vi.mock("../client.js", () => ({
  opinionClient: {
    isReady: true,
    getMarket: vi.fn().mockResolvedValue({
      result: {
        id: 813,
        title: "Will CPI exceed 3.5%?",
        status: 2,
        childMarkets: [
          { tokenId: "tok-yes", outcomeName: "Yes", lastPrice: "0.62" },
          { tokenId: "tok-no", outcomeName: "No", lastPrice: "0.38" },
        ],
        endTime: "2026-04-01T00:00:00Z",
      },
    }),
    getOrderbook: vi.fn().mockResolvedValue({
      result: {
        bids: [{ price: "0.60", size: "100" }],
        asks: [{ price: "0.63", size: "50" }],
      },
    }),
  },
}));

describe("GET_OPINION_MARKET", () => {
  it("has correct name", () => {
    expect(getOpinionMarketAction.name).toBe("GET_OPINION_MARKET");
  });

  it("returns market detail with orderbook", async () => {
    const result = await getOpinionMarketAction.handler(
      {} as any, {} as any, {} as any,
      { parameters: { marketId: 813 } } as any,
    );
    expect(result.success).toBe(true);
    expect(result.text).toContain("CPI");
    expect(result.text).toContain("0.60"); // best bid
  });

  it("rejects missing marketId", async () => {
    const result = await getOpinionMarketAction.handler(
      {} as any, {} as any, {} as any,
      { parameters: {} } as any,
    );
    expect(result.success).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bunx vitest run src/plugins/opinion/__tests__/get-opinion-market.test.ts`
Expected: FAIL — module not found.

**Step 3: Write the implementation**

```typescript
/**
 * GET_OPINION_MARKET — get detail and orderbook for a specific market.
 */
import type { Action, HandlerOptions } from "@elizaos/core";
import { opinionClient } from "../client.js";

export const getOpinionMarketAction: Action = {
  name: "GET_OPINION_MARKET",

  similes: [
    "OPINION_MARKET_DETAIL",
    "CHECK_PREDICTION",
    "MARKET_PRICE",
    "PREDICTION_PRICE",
  ],

  description:
    "Get details and orderbook depth for a specific Opinion.trade prediction market. " +
    "Use when user asks about a specific market's price, odds, or trading depth.",

  validate: async () => opinionClient.isReady,

  handler: async (_runtime, _message, _state, options) => {
    try {
      const params = (options as HandlerOptions | undefined)?.parameters;
      const marketId = typeof params?.marketId === "number"
        ? params.marketId
        : typeof params?.marketId === "string"
          ? Number(params.marketId)
          : undefined;

      if (!marketId || Number.isNaN(marketId)) {
        return { text: "I need a market ID to look up.", success: false };
      }

      const marketRes = await opinionClient.getMarket(marketId);
      const market = marketRes?.result;

      if (!market) {
        return { text: `Market #${marketId} not found.`, success: false };
      }

      const yesChild = market.childMarkets?.find(
        (c: any) => c.outcomeName?.toLowerCase() === "yes",
      );
      const noChild = market.childMarkets?.find(
        (c: any) => c.outcomeName?.toLowerCase() === "no",
      );

      // Fetch orderbook for YES token
      let orderbookText = "";
      if (yesChild?.tokenId) {
        try {
          const ob = await opinionClient.getOrderbook(yesChild.tokenId);
          const bids = ob?.result?.bids?.slice(0, 3) ?? [];
          const asks = ob?.result?.asks?.slice(0, 3) ?? [];
          const bestBid = bids[0]?.price ?? "—";
          const bestAsk = asks[0]?.price ?? "—";
          const bidDepth = bids.reduce(
            (sum: number, b: any) => sum + Number(b.size || 0), 0,
          );
          const askDepth = asks.reduce(
            (sum: number, a: any) => sum + Number(a.size || 0), 0,
          );
          orderbookText =
            `\nOrderbook (YES): Best Bid ${bestBid} (${bidDepth} shares) | ` +
            `Best Ask ${bestAsk} (${askDepth} shares)`;
        } catch {
          orderbookText = "\nOrderbook: unavailable";
        }
      }

      const end = market.endTime
        ? new Date(market.endTime).toLocaleDateString()
        : "TBD";

      const text =
        `Market #${market.id}: ${market.title}\n` +
        `YES: ${yesChild?.lastPrice ?? "—"} (token: ${yesChild?.tokenId ?? "—"})\n` +
        `NO: ${noChild?.lastPrice ?? "—"} (token: ${noChild?.tokenId ?? "—"})\n` +
        `Ends: ${end}` +
        orderbookText;

      return {
        text,
        success: true,
        data: { market, yesTokenId: yesChild?.tokenId, noTokenId: noChild?.tokenId },
      };
    } catch (err) {
      return {
        text: `Failed to get market: ${err instanceof Error ? err.message : String(err)}`,
        success: false,
      };
    }
  },

  parameters: [
    {
      name: "marketId",
      description: "The Opinion market ID to look up",
      required: true,
      schema: { type: "number" as const },
    },
  ],
};
```

**Step 4: Run test to verify it passes**

Run: `bunx vitest run src/plugins/opinion/__tests__/get-opinion-market.test.ts`
Expected: All 3 tests PASS.

**Step 5: Commit**

```bash
git add src/plugins/opinion/actions/get-opinion-market.ts src/plugins/opinion/__tests__/get-opinion-market.test.ts
git commit -m "feat(opinion): add GET_OPINION_MARKET action"
```

---

### Task 6: Create PLACE_OPINION_BET action

**Files:**
- Create: `src/plugins/opinion/actions/place-opinion-bet.ts`
- Create: `src/plugins/opinion/__tests__/place-opinion-bet.test.ts`

**Step 1: Write the failing test**

```typescript
import { describe, expect, it, vi } from "vitest";
import { placeOpinionBetAction } from "../actions/place-opinion-bet.js";

const mockPlaceBet = vi.fn().mockResolvedValue({
  result: { orderId: "order-123" },
});

vi.mock("../client.js", () => ({
  opinionClient: {
    isReady: true,
    canTrade: true,
    placeBet: mockPlaceBet,
  },
}));

// Mock the trade permission check
vi.mock("../../../config/config.js", () => ({
  loadMiladyConfig: vi.fn().mockReturnValue({}),
}));

vi.mock("../../../api/server.js", () => ({
  resolveTradePermissionMode: vi.fn().mockReturnValue("agent-auto"),
  canUseLocalTradeExecution: vi.fn().mockReturnValue(true),
}));

describe("PLACE_OPINION_BET", () => {
  it("has correct name", () => {
    expect(placeOpinionBetAction.name).toBe("PLACE_OPINION_BET");
  });

  it("rejects missing side", async () => {
    const result = await placeOpinionBetAction.handler(
      {} as any, {} as any, {} as any,
      { parameters: { marketId: 1, tokenId: "abc", amount: "10" } } as any,
    );
    expect(result.success).toBe(false);
  });

  it("rejects invalid amount", async () => {
    const result = await placeOpinionBetAction.handler(
      {} as any, {} as any, {} as any,
      {
        parameters: {
          marketId: 1, tokenId: "abc", side: "buy", amount: "-5",
        },
      } as any,
    );
    expect(result.success).toBe(false);
  });

  it("places bet successfully in agent-auto mode", async () => {
    const result = await placeOpinionBetAction.handler(
      {} as any, {} as any, {} as any,
      {
        parameters: {
          marketId: 813, tokenId: "tok-yes", side: "buy",
          amount: "10", price: "0.55",
        },
      } as any,
    );
    expect(result.success).toBe(true);
    expect(result.text).toContain("order-123");
    expect(mockPlaceBet).toHaveBeenCalledWith({
      marketId: 813,
      tokenId: "tok-yes",
      side: "buy",
      amount: "10",
      price: "0.55",
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bunx vitest run src/plugins/opinion/__tests__/place-opinion-bet.test.ts`
Expected: FAIL — module not found.

**Step 3: Write the implementation**

```typescript
/**
 * PLACE_OPINION_BET — places a prediction market bet on Opinion.trade.
 *
 * Respects tradePermissionMode:
 *   - "user-sign-only": returns bet details without executing
 *   - "manual-local-key": executes if local key available
 *   - "agent-auto": executes automatically
 */
import type { Action, HandlerOptions } from "@elizaos/core";
import { opinionClient } from "../client.js";
import { loadMiladyConfig } from "../../../config/config.js";
import {
  resolveTradePermissionMode,
  canUseLocalTradeExecution,
} from "../../../api/server.js";

export const placeOpinionBetAction: Action = {
  name: "PLACE_OPINION_BET",

  similes: [
    "BET_OPINION",
    "PREDICT",
    "BUY_YES",
    "BUY_NO",
    "OPINION_BUY",
    "OPINION_SELL",
    "PLACE_PREDICTION",
  ],

  description:
    "Place a prediction bet on Opinion.trade markets. Use when user wants to " +
    "bet on economic outcomes (CPI, Fed rates, NFP). Requires marketId, tokenId, " +
    "side (buy/sell), and amount in USDT. Respects trade permission mode.",

  validate: async () => opinionClient.isReady && opinionClient.canTrade,

  handler: async (_runtime, _message, _state, options) => {
    try {
      const params = (options as HandlerOptions | undefined)?.parameters;

      // ── Validate side ─────────────────────────────────
      const side =
        typeof params?.side === "string"
          ? params.side.trim().toLowerCase()
          : undefined;
      if (side !== "buy" && side !== "sell") {
        return { text: 'I need a valid side ("buy" or "sell").', success: false };
      }

      // ── Validate marketId ─────────────────────────────
      const marketId =
        typeof params?.marketId === "number"
          ? params.marketId
          : typeof params?.marketId === "string"
            ? Number(params.marketId)
            : undefined;
      if (!marketId || Number.isNaN(marketId)) {
        return { text: "I need a valid market ID.", success: false };
      }

      // ── Validate tokenId ─────────────────────────────
      const tokenId =
        typeof params?.tokenId === "string" ? params.tokenId.trim() : undefined;
      if (!tokenId) {
        return { text: "I need a token ID (YES or NO outcome token).", success: false };
      }

      // ── Validate amount ───────────────────────────────
      const amountRaw =
        typeof params?.amount === "string"
          ? params.amount.trim()
          : typeof params?.amount === "number"
            ? String(params.amount)
            : undefined;
      if (!amountRaw || Number.isNaN(Number(amountRaw)) || Number(amountRaw) <= 0) {
        return { text: "I need a positive USDT amount.", success: false };
      }

      // ── Check trade permission ────────────────────────
      const config = loadMiladyConfig();
      const tradeMode = resolveTradePermissionMode(config);
      const canExecute = canUseLocalTradeExecution(tradeMode, true);

      if (!canExecute) {
        return {
          text:
            `Bet prepared: ${side.toUpperCase()} $${amountRaw} on market #${marketId}.\n` +
            `Current trade mode is "${tradeMode}" — manual confirmation required.\n` +
            `Token: ${tokenId}`,
          success: true,
          data: { marketId, tokenId, side, amount: amountRaw, requiresConfirmation: true },
        };
      }

      // ── Optional price ────────────────────────────────
      const price =
        typeof params?.price === "string" && params.price.trim()
          ? params.price.trim()
          : typeof params?.price === "number"
            ? String(params.price)
            : undefined;

      // ── Place bet ─────────────────────────────────────
      const result = await opinionClient.placeBet({
        marketId,
        tokenId,
        side: side as "buy" | "sell",
        amount: amountRaw,
        price,
      });

      const orderId = result?.result?.orderId ?? "unknown";
      const orderType = price ? `limit @ ${price}` : "market";

      return {
        text:
          `Bet placed! ${side.toUpperCase()} $${amountRaw} on market #${marketId} (${orderType}).\n` +
          `Order ID: ${orderId}`,
        success: true,
        data: { orderId, marketId, tokenId, side, amount: amountRaw },
      };
    } catch (err) {
      return {
        text: `Bet failed: ${err instanceof Error ? err.message : String(err)}`,
        success: false,
      };
    }
  },

  parameters: [
    {
      name: "marketId",
      description: "Opinion market ID",
      required: true,
      schema: { type: "number" as const },
    },
    {
      name: "tokenId",
      description: "Token ID for YES or NO outcome",
      required: true,
      schema: { type: "string" as const },
    },
    {
      name: "side",
      description: '"buy" or "sell"',
      required: true,
      schema: { type: "string" as const },
    },
    {
      name: "amount",
      description: 'USDT amount to bet (e.g. "10")',
      required: true,
      schema: { type: "string" as const },
    },
    {
      name: "price",
      description: "Limit price 0.01-0.99 (omit for market order)",
      required: false,
      schema: { type: "string" as const },
    },
  ],
};
```

**Step 4: Run test to verify it passes**

Run: `bunx vitest run src/plugins/opinion/__tests__/place-opinion-bet.test.ts`
Expected: All 4 tests PASS.

**Step 5: Commit**

```bash
git add src/plugins/opinion/actions/place-opinion-bet.ts src/plugins/opinion/__tests__/place-opinion-bet.test.ts
git commit -m "feat(opinion): add PLACE_OPINION_BET action with permission checks"
```

---

### Task 7: Create CHECK_OPINION_POSITIONS, CANCEL_OPINION_ORDER, REDEEM_OPINION actions

**Files:**
- Create: `src/plugins/opinion/actions/check-opinion-positions.ts`
- Create: `src/plugins/opinion/actions/cancel-opinion-order.ts`
- Create: `src/plugins/opinion/actions/redeem-opinion.ts`
- Create: `src/plugins/opinion/__tests__/remaining-actions.test.ts`

**Step 1: Write the failing test**

```typescript
import { describe, expect, it, vi } from "vitest";

vi.mock("../client.js", () => ({
  opinionClient: {
    isReady: true,
    canTrade: true,
    getPositions: vi.fn().mockResolvedValue({
      result: [
        {
          marketId: 813,
          marketTitle: "CPI > 3.5%",
          side: "yes",
          shares: "50",
          avgEntryPrice: "0.55",
          currentPrice: "0.62",
        },
      ],
    }),
    getOrders: vi.fn().mockResolvedValue({
      result: { list: [{ orderId: "o1", status: "open" }] },
    }),
    cancelOrder: vi.fn().mockResolvedValue({ result: {} }),
    redeem: vi.fn().mockResolvedValue(["0xhash123", {}, {}]),
  },
}));

import { checkOpinionPositionsAction } from "../actions/check-opinion-positions.js";
import { cancelOpinionOrderAction } from "../actions/cancel-opinion-order.js";
import { redeemOpinionAction } from "../actions/redeem-opinion.js";

describe("CHECK_OPINION_POSITIONS", () => {
  it("returns formatted positions", async () => {
    const result = await checkOpinionPositionsAction.handler(
      {} as any, {} as any, {} as any, {} as any,
    );
    expect(result.success).toBe(true);
    expect(result.text).toContain("CPI");
  });
});

describe("CANCEL_OPINION_ORDER", () => {
  it("cancels by orderId", async () => {
    const result = await cancelOpinionOrderAction.handler(
      {} as any, {} as any, {} as any,
      { parameters: { orderId: "o1" } } as any,
    );
    expect(result.success).toBe(true);
  });
});

describe("REDEEM_OPINION", () => {
  it("redeems resolved market", async () => {
    const result = await redeemOpinionAction.handler(
      {} as any, {} as any, {} as any,
      { parameters: { marketId: 813 } } as any,
    );
    expect(result.success).toBe(true);
    expect(result.text).toContain("0xhash123");
  });

  it("rejects missing marketId", async () => {
    const result = await redeemOpinionAction.handler(
      {} as any, {} as any, {} as any,
      { parameters: {} } as any,
    );
    expect(result.success).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bunx vitest run src/plugins/opinion/__tests__/remaining-actions.test.ts`
Expected: FAIL — modules not found.

**Step 3: Write check-opinion-positions.ts**

```typescript
/**
 * CHECK_OPINION_POSITIONS — shows user's Opinion.trade positions with P&L.
 */
import type { Action } from "@elizaos/core";
import { opinionClient } from "../client.js";

export const checkOpinionPositionsAction: Action = {
  name: "CHECK_OPINION_POSITIONS",

  similes: [
    "OPINION_POSITIONS",
    "PREDICTION_PORTFOLIO",
    "MY_PREDICTIONS",
    "OPINION_HOLDINGS",
  ],

  description:
    "Check current positions on Opinion.trade prediction markets. " +
    "Shows each position's market, side, shares, average price, current price, and P&L.",

  validate: async () => opinionClient.isReady,

  handler: async () => {
    try {
      const response = await opinionClient.getPositions();
      const positions = response?.result;

      if (!positions?.length) {
        return { text: "No open positions on Opinion.trade.", success: true };
      }

      const lines = positions.map((p: any) => {
        const pnl = (
          (Number(p.currentPrice || 0) - Number(p.avgEntryPrice || 0)) *
          Number(p.shares || 0)
        ).toFixed(2);
        const sign = Number(pnl) >= 0 ? "+" : "";
        return (
          `${p.marketTitle ?? `Market #${p.marketId}`}\n` +
          `  ${(p.side ?? "").toUpperCase()} ${p.shares} shares @ avg ${p.avgEntryPrice} → now ${p.currentPrice} (${sign}$${pnl})`
        );
      });

      return { text: `Opinion Positions:\n\n${lines.join("\n\n")}`, success: true };
    } catch (err) {
      return {
        text: `Failed to check positions: ${err instanceof Error ? err.message : String(err)}`,
        success: false,
      };
    }
  },

  parameters: [],
};
```

**Step 4: Write cancel-opinion-order.ts**

```typescript
/**
 * CANCEL_OPINION_ORDER — cancels an open order on Opinion.trade.
 */
import type { Action, HandlerOptions } from "@elizaos/core";
import { opinionClient } from "../client.js";

export const cancelOpinionOrderAction: Action = {
  name: "CANCEL_OPINION_ORDER",

  similes: [
    "CANCEL_PREDICTION",
    "CANCEL_BET",
    "REMOVE_ORDER",
    "OPINION_CANCEL",
  ],

  description:
    "Cancel an open order on Opinion.trade. Provide orderId to cancel a specific " +
    "order, or omit to list open orders.",

  validate: async () => opinionClient.isReady && opinionClient.canTrade,

  handler: async (_runtime, _message, _state, options) => {
    try {
      const params = (options as HandlerOptions | undefined)?.parameters;
      const orderId =
        typeof params?.orderId === "string" ? params.orderId.trim() : undefined;

      if (!orderId) {
        // List open orders instead
        const orders = await opinionClient.getOrders("open");
        const list = orders?.result?.list;
        if (!list?.length) {
          return { text: "No open orders to cancel.", success: true };
        }
        const lines = list.map(
          (o: any) => `  ${o.orderId}: ${o.side} ${o.shares}@${o.price}`,
        );
        return {
          text: `Open orders:\n${lines.join("\n")}\n\nProvide an orderId to cancel.`,
          success: true,
        };
      }

      await opinionClient.cancelOrder(orderId);
      return { text: `Order ${orderId} cancelled.`, success: true };
    } catch (err) {
      return {
        text: `Cancel failed: ${err instanceof Error ? err.message : String(err)}`,
        success: false,
      };
    }
  },

  parameters: [
    {
      name: "orderId",
      description: "Order ID to cancel (omit to list open orders)",
      required: false,
      schema: { type: "string" as const },
    },
  ],
};
```

**Step 5: Write redeem-opinion.ts**

```typescript
/**
 * REDEEM_OPINION — claims winnings from a resolved Opinion.trade market.
 */
import type { Action, HandlerOptions } from "@elizaos/core";
import { opinionClient } from "../client.js";

export const redeemOpinionAction: Action = {
  name: "REDEEM_OPINION",

  similes: [
    "CLAIM_PREDICTION",
    "SETTLE_OPINION",
    "CLAIM_WINNINGS",
    "OPINION_REDEEM",
  ],

  description:
    "Claim winnings from a resolved prediction market on Opinion.trade. " +
    "Requires the marketId of a resolved market. This is an on-chain operation that needs BNB gas.",

  validate: async () => opinionClient.isReady && opinionClient.canTrade,

  handler: async (_runtime, _message, _state, options) => {
    try {
      const params = (options as HandlerOptions | undefined)?.parameters;
      const marketId =
        typeof params?.marketId === "number"
          ? params.marketId
          : typeof params?.marketId === "string"
            ? Number(params.marketId)
            : undefined;

      if (!marketId || Number.isNaN(marketId)) {
        return { text: "I need a market ID to redeem.", success: false };
      }

      const [txHash] = await opinionClient.redeem(marketId);
      return {
        text: `Redeemed market #${marketId}!\nTX: ${txHash}`,
        success: true,
        data: { marketId, txHash },
      };
    } catch (err) {
      return {
        text: `Redeem failed: ${err instanceof Error ? err.message : String(err)}`,
        success: false,
      };
    }
  },

  parameters: [
    {
      name: "marketId",
      description: "The resolved market ID to redeem winnings from",
      required: true,
      schema: { type: "number" as const },
    },
  ],
};
```

**Step 6: Run test to verify it passes**

Run: `bunx vitest run src/plugins/opinion/__tests__/remaining-actions.test.ts`
Expected: All 4 tests PASS.

**Step 7: Commit**

```bash
git add src/plugins/opinion/actions/check-opinion-positions.ts src/plugins/opinion/actions/cancel-opinion-order.ts src/plugins/opinion/actions/redeem-opinion.ts src/plugins/opinion/__tests__/remaining-actions.test.ts
git commit -m "feat(opinion): add position check, cancel order, and redeem actions"
```

---

### Task 8: Create opinion-context provider

**Files:**
- Create: `src/plugins/opinion/providers/opinion-context.ts`
- Create: `src/plugins/opinion/__tests__/opinion-context.test.ts`

**Step 1: Write the failing test**

```typescript
import { describe, expect, it, vi } from "vitest";

const mockGetPositions = vi.fn();

vi.mock("../client.js", () => ({
  opinionClient: {
    isReady: true,
    getPositions: mockGetPositions,
  },
}));

import { opinionContextProvider } from "../providers/opinion-context.js";

describe("opinionContextProvider", () => {
  it("returns empty text when no positions", async () => {
    mockGetPositions.mockResolvedValue({ result: [] });
    const result = await opinionContextProvider.get({} as any, {} as any, {} as any);
    expect(result.text).toBe("Opinion: connected, no open positions");
  });

  it("returns position summary when positions exist", async () => {
    mockGetPositions.mockResolvedValue({
      result: [
        {
          marketTitle: "CPI > 3.5%",
          side: "yes",
          shares: "50",
          avgEntryPrice: "0.55",
          currentPrice: "0.62",
        },
      ],
    });
    const result = await opinionContextProvider.get({} as any, {} as any, {} as any);
    expect(result.text).toContain("CPI");
    expect(result.text).toContain("Opinion:");
  });

  it("returns empty text when client not ready", async () => {
    const { opinionClient } = await import("../client.js");
    Object.defineProperty(opinionClient, "isReady", { value: false });
    const result = await opinionContextProvider.get({} as any, {} as any, {} as any);
    expect(result.text).toBe("");
    Object.defineProperty(opinionClient, "isReady", { value: true });
  });

  it("has position between wallet and pluginHealth", () => {
    expect(opinionContextProvider.position).toBeGreaterThan(30);
    expect(opinionContextProvider.position).toBeLessThan(50);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bunx vitest run src/plugins/opinion/__tests__/opinion-context.test.ts`
Expected: FAIL — module not found.

**Step 3: Write the implementation**

```typescript
/**
 * Opinion context provider — injects position summary into every LLM turn.
 *
 * Position 45 — between wallet(30) and pluginHealth(50).
 */
import type { Provider, ProviderResult } from "@elizaos/core";
import { opinionClient } from "../client.js";

export const opinionContextProvider: Provider = {
  name: "opinionContext",
  description: "Injects active Opinion.trade prediction market positions into agent context",
  position: 45,
  dynamic: true,

  async get(): Promise<ProviderResult> {
    if (!opinionClient.isReady) return { text: "" };

    try {
      const response = await opinionClient.getPositions();
      const positions = response?.result;

      if (!positions?.length) {
        return { text: "Opinion: connected, no open positions" };
      }

      const summaries = positions.slice(0, 3).map((p: any) => {
        const pnl = (
          (Number(p.currentPrice || 0) - Number(p.avgEntryPrice || 0)) *
          Number(p.shares || 0)
        ).toFixed(2);
        const sign = Number(pnl) >= 0 ? "+" : "";
        return `${p.marketTitle}: ${(p.side ?? "").toUpperCase()} ${p.shares}@${p.avgEntryPrice} (${sign}$${pnl})`;
      });

      const extra = positions.length > 3 ? ` +${positions.length - 3} more` : "";
      return { text: `Opinion: ${summaries.join("; ")}${extra}` };
    } catch {
      return { text: "" };
    }
  },
};
```

**Step 4: Run test to verify it passes**

Run: `bunx vitest run src/plugins/opinion/__tests__/opinion-context.test.ts`
Expected: All 4 tests PASS.

**Step 5: Commit**

```bash
git add src/plugins/opinion/providers/opinion-context.ts src/plugins/opinion/__tests__/opinion-context.test.ts
git commit -m "feat(opinion): add context provider for LLM position injection"
```

---

### Task 9: Create opinion awareness contributor

**Files:**
- Create: `src/plugins/opinion/awareness/opinion-contributor.ts`
- Create: `src/plugins/opinion/__tests__/opinion-contributor.test.ts`
- Modify: `src/awareness/contributors/index.ts`

**Step 1: Write the failing test**

```typescript
import { describe, expect, it, vi } from "vitest";
import { SUMMARY_CHAR_LIMIT } from "../../../contracts/awareness.js";

const mockGetPositions = vi.fn();

vi.mock("../client.js", () => ({
  opinionClient: {
    isReady: true,
    getPositions: mockGetPositions,
  },
}));

import { opinionContributor } from "../awareness/opinion-contributor.js";

describe("opinionContributor", () => {
  it("has correct id and position", () => {
    expect(opinionContributor.id).toBe("opinion");
    expect(opinionContributor.position).toBe(35);
  });

  it("is marked trusted", () => {
    expect(opinionContributor.trusted).toBe(true);
  });

  it("summary stays within char limit", async () => {
    mockGetPositions.mockResolvedValue({
      result: [
        { marketTitle: "CPI", side: "yes", shares: "50", currentPrice: "0.62", avgEntryPrice: "0.55" },
        { marketTitle: "Fed Rate", side: "no", shares: "30", currentPrice: "0.40", avgEntryPrice: "0.45" },
      ],
    });
    const summary = await opinionContributor.summary({} as any);
    expect(summary.length).toBeLessThanOrEqual(SUMMARY_CHAR_LIMIT);
  });

  it("summary returns not connected when client not ready", async () => {
    const { opinionClient } = await import("../client.js");
    Object.defineProperty(opinionClient, "isReady", { value: false });
    const summary = await opinionContributor.summary({} as any);
    expect(summary).toBe("Opinion: not connected");
    Object.defineProperty(opinionClient, "isReady", { value: true });
  });

  it("has invalidateOn events", () => {
    expect(opinionContributor.invalidateOn).toContain("opinion-updated");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bunx vitest run src/plugins/opinion/__tests__/opinion-contributor.test.ts`
Expected: FAIL — module not found.

**Step 3: Write the contributor**

```typescript
/**
 * Opinion awareness contributor — reports prediction market positions.
 *
 * Position 35 — between wallet(30) and provider(40).
 * Never exposes API keys or private keys.
 */
import type { IAgentRuntime } from "@elizaos/core";
import type { AwarenessContributor } from "../../../contracts/awareness.js";
import { SUMMARY_CHAR_LIMIT } from "../../../contracts/awareness.js";
import { opinionClient } from "../client.js";

export const opinionContributor: AwarenessContributor = {
  id: "opinion",
  position: 35,
  cacheTtl: 30_000,
  invalidateOn: ["opinion-updated", "config-changed"],
  trusted: true,

  async summary(_runtime: IAgentRuntime): Promise<string> {
    if (!opinionClient.isReady) return "Opinion: not connected";

    try {
      const response = await opinionClient.getPositions();
      const positions = response?.result;

      if (!positions?.length) return "Opinion: no positions";

      const totalPnl = positions.reduce((sum: number, p: any) => {
        return sum + (Number(p.currentPrice || 0) - Number(p.avgEntryPrice || 0)) * Number(p.shares || 0);
      }, 0);
      const sign = totalPnl >= 0 ? "+" : "";
      const summary = `Opinion: ${positions.length} positions, ${sign}$${totalPnl.toFixed(2)} unrealized`;

      return summary.length <= SUMMARY_CHAR_LIMIT
        ? summary
        : summary.slice(0, SUMMARY_CHAR_LIMIT - 1) + "\u2026";
    } catch {
      return "Opinion: unavailable";
    }
  },

  async detail(_runtime: IAgentRuntime, level: "brief" | "full"): Promise<string> {
    if (!opinionClient.isReady) return "## Opinion\nNot connected.";

    try {
      const response = await opinionClient.getPositions();
      const positions = response?.result ?? [];
      const lines = ["## Opinion Trade"];

      if (!positions.length) {
        lines.push("No open positions.");
        return lines.join("\n");
      }

      for (const p of positions) {
        const pnl = (
          (Number(p.currentPrice || 0) - Number(p.avgEntryPrice || 0)) *
          Number(p.shares || 0)
        ).toFixed(2);
        const sign = Number(pnl) >= 0 ? "+" : "";
        lines.push(
          `- ${p.marketTitle}: ${(p.side ?? "").toUpperCase()} ${p.shares} @ ${p.avgEntryPrice} → ${p.currentPrice} (${sign}$${pnl})`,
        );
      }

      if (level === "full") {
        lines.push(`\nTotal positions: ${positions.length}`);
        lines.push(`Trading mode: ${opinionClient.canTrade ? "enabled" : "read-only"}`);
      }

      return lines.join("\n");
    } catch {
      return "## Opinion\nUnavailable.";
    }
  },
};
```

**Step 4: Run test to verify it passes**

Run: `bunx vitest run src/plugins/opinion/__tests__/opinion-contributor.test.ts`
Expected: All 5 tests PASS.

**Step 5: Register in awareness contributors index**

In `src/awareness/contributors/index.ts`, add the import and contributor:

```typescript
import { opinionContributor } from "../../plugins/opinion/awareness/opinion-contributor";

export const builtinContributors: AwarenessContributor[] = [
  runtimeContributor,
  permissionsContributor,
  walletContributor,
  opinionContributor,   // position 35
  providerContributor,
  pluginHealthContributor,
  connectorsContributor,
  cloudContributor,
  featuresContributor,
];
```

**Step 6: Update existing awareness tests**

In `src/awareness/contributors/contributors.test.ts`, update the expected count and order:

- Change `expect(builtinContributors).toHaveLength(8)` to `toHaveLength(9)`
- Add `"opinion"` to the expected order array after `"wallet"` and before `"provider"`

**Step 7: Run all awareness tests**

Run: `bunx vitest run src/awareness/`
Expected: All tests PASS.

**Step 8: Commit**

```bash
git add src/plugins/opinion/awareness/opinion-contributor.ts src/plugins/opinion/__tests__/opinion-contributor.test.ts src/awareness/contributors/index.ts src/awareness/contributors/contributors.test.ts
git commit -m "feat(opinion): add awareness contributor with position summary"
```

---

### Task 10: Create WebSocket service

**Files:**
- Create: `src/plugins/opinion/services/opinion-ws.ts`
- Create: `src/plugins/opinion/__tests__/opinion-ws.test.ts`

**Step 1: Write the failing test**

```typescript
import { describe, expect, it, vi } from "vitest";
import { OpinionWsService } from "../services/opinion-ws.js";

describe("OpinionWsService", () => {
  it("has correct serviceType", () => {
    expect(OpinionWsService.serviceType).toBe("opinion-ws");
  });

  it("does not connect without API key", async () => {
    const original = process.env.OPINION_API_KEY;
    delete process.env.OPINION_API_KEY;
    const service = new OpinionWsService();
    await service.initialize({} as any);
    expect(service.isConnected).toBe(false);
    if (original) process.env.OPINION_API_KEY = original;
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bunx vitest run src/plugins/opinion/__tests__/opinion-ws.test.ts`
Expected: FAIL — module not found.

**Step 3: Write the implementation**

```typescript
/**
 * Opinion WebSocket service — monitors prices for position-held markets.
 *
 * Connects to wss://ws.opinion.trade, subscribes to market.last.price
 * for markets where user has positions. Sends heartbeat every 25s.
 * Auto-reconnects with exponential backoff on disconnect.
 */
import type { IAgentRuntime } from "@elizaos/core";
import { opinionClient } from "../client.js";

const WS_URL = "wss://ws.opinion.trade";
const HEARTBEAT_INTERVAL_MS = 25_000;
const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 60_000;
const PRICE_ALERT_THRESHOLD = 0.10; // 10% change

export class OpinionWsService {
  static serviceType = "opinion-ws";

  private ws: WebSocket | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private runtime: IAgentRuntime | null = null;
  private subscribedMarkets = new Set<number>();
  private lastPrices = new Map<string, number>();
  private _connected = false;

  get isConnected(): boolean {
    return this._connected;
  }

  async initialize(runtime: IAgentRuntime) {
    this.runtime = runtime;
    const apiKey = process.env.OPINION_API_KEY;
    if (!apiKey) {
      runtime.logger?.warn?.("Opinion WS: no API key, skipping WebSocket");
      return;
    }

    this.connect(apiKey);
  }

  private connect(apiKey: string) {
    try {
      this.ws = new WebSocket(`${WS_URL}?apikey=${apiKey}`);

      this.ws.onopen = () => {
        this._connected = true;
        this.reconnectAttempts = 0;
        this.runtime?.logger?.info?.("Opinion WS: connected");
        this.startHeartbeat();
        this.subscribeToPositionMarkets();
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(String(event.data));
          this.handleMessage(data);
        } catch { /* ignore parse errors */ }
      };

      this.ws.onclose = () => {
        this._connected = false;
        this.stopHeartbeat();
        this.scheduleReconnect(apiKey);
      };

      this.ws.onerror = () => {
        this._connected = false;
      };
    } catch (err) {
      this.runtime?.logger?.warn?.(
        `Opinion WS: connection failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ action: "HEARTBEAT" }));
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private scheduleReconnect(apiKey: string) {
    const delay = Math.min(
      RECONNECT_BASE_MS * 2 ** this.reconnectAttempts,
      RECONNECT_MAX_MS,
    );
    this.reconnectAttempts++;
    this.runtime?.logger?.info?.(
      `Opinion WS: reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`,
    );
    this.reconnectTimer = setTimeout(() => this.connect(apiKey), delay);
  }

  private async subscribeToPositionMarkets() {
    if (!opinionClient.isReady || !this.ws) return;

    try {
      const response = await opinionClient.getPositions();
      const positions = response?.result ?? [];
      const marketIds = new Set(
        positions.map((p: any) => Number(p.marketId)).filter(Boolean),
      );

      for (const marketId of marketIds) {
        if (!this.subscribedMarkets.has(marketId)) {
          this.ws.send(
            JSON.stringify({
              action: "SUBSCRIBE",
              channel: "market.last.price",
              marketId,
            }),
          );
          this.subscribedMarkets.add(marketId);
        }
      }
    } catch {
      this.runtime?.logger?.warn?.("Opinion WS: failed to subscribe to position markets");
    }
  }

  private handleMessage(data: any) {
    if (data.channel === "market.last.price" && data.data) {
      const tokenId = String(data.data.tokenId ?? "");
      const newPrice = Number(data.data.price ?? 0);
      const oldPrice = this.lastPrices.get(tokenId);

      if (oldPrice !== undefined && oldPrice > 0) {
        const change = Math.abs(newPrice - oldPrice) / oldPrice;
        if (change >= PRICE_ALERT_THRESHOLD) {
          const direction = newPrice > oldPrice ? "up" : "down";
          const pct = (change * 100).toFixed(1);
          this.runtime?.logger?.warn?.(
            `Opinion price alert: market ${data.data.marketId} moved ${direction} ${pct}%`,
          );
        }
      }

      this.lastPrices.set(tokenId, newPrice);
    }
  }

  async cleanup() {
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this._connected = false;
  }
}
```

**Step 4: Run test to verify it passes**

Run: `bunx vitest run src/plugins/opinion/__tests__/opinion-ws.test.ts`
Expected: All 2 tests PASS.

**Step 5: Commit**

```bash
git add src/plugins/opinion/services/opinion-ws.ts src/plugins/opinion/__tests__/opinion-ws.test.ts
git commit -m "feat(opinion): add WebSocket service for position price monitoring"
```

---

### Task 11: Create plugin entry and system integration

**Files:**
- Create: `src/plugins/opinion/index.ts`
- Modify: `src/runtime/eliza.ts:351-366` (add to `PROVIDER_PLUGIN_MAP`)
- Modify: `src/api/server.ts:943-958` (add to `BLOCKED_ENV_KEYS`)

**Step 1: Create plugin entry**

```typescript
/**
 * Opinion Trade plugin — prediction market trading on Opinion.trade (BNB Chain).
 *
 * Enabled by setting OPINION_API_KEY. Supports read-only mode (no private key)
 * or full trading mode (with OPINION_PRIVATE_KEY + OPINION_MULTISIG_ADDRESS).
 *
 * @see docs/plans/2026-03-01-opinion-trade-plugin-design.md
 */
import type { Plugin } from "@elizaos/core";
import { opinionClient } from "./client.js";
import { listOpinionMarketsAction } from "./actions/list-opinion-markets.js";
import { getOpinionMarketAction } from "./actions/get-opinion-market.js";
import { placeOpinionBetAction } from "./actions/place-opinion-bet.js";
import { checkOpinionPositionsAction } from "./actions/check-opinion-positions.js";
import { cancelOpinionOrderAction } from "./actions/cancel-opinion-order.js";
import { redeemOpinionAction } from "./actions/redeem-opinion.js";
import { opinionContextProvider } from "./providers/opinion-context.js";
import { OpinionWsService } from "./services/opinion-ws.js";

export const opinionPlugin: Plugin = {
  name: "opinion-trade",
  description: "Prediction market trading on Opinion.trade (BNB Chain)",

  init: async (_config, runtime) => {
    const apiKey = process.env.OPINION_API_KEY;
    if (!apiKey) {
      runtime.logger?.warn?.("Opinion plugin: OPINION_API_KEY not set, skipping init");
      return;
    }

    const privateKey = process.env.OPINION_PRIVATE_KEY;
    const multiSigAddress = process.env.OPINION_MULTISIG_ADDRESS;
    const maxBetUsd = Number(process.env.OPINION_MAX_BET_USD) || 500;
    const rpcUrl =
      process.env.BSC_RPC_URL ||
      process.env.NODEREAL_BSC_RPC_URL ||
      "https://bsc-dataseed.binance.org";

    try {
      await opinionClient.initialize({
        apiKey,
        privateKey,
        multiSigAddress,
        maxBetUsd,
        rpcUrl,
      });
      runtime.logger?.info?.(
        `Opinion plugin initialized (${opinionClient.canTrade ? "trading" : "read-only"} mode)`,
      );
    } catch (err) {
      runtime.logger?.error?.(
        `Opinion plugin init failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  },

  actions: [
    listOpinionMarketsAction,
    getOpinionMarketAction,
    placeOpinionBetAction,
    checkOpinionPositionsAction,
    cancelOpinionOrderAction,
    redeemOpinionAction,
  ],

  providers: [opinionContextProvider],

  services: [OpinionWsService as any],
};

export default opinionPlugin;
```

**Step 2: Add to PROVIDER_PLUGIN_MAP in eliza.ts**

In `src/runtime/eliza.ts`, at line ~365 (before the closing `}`), add:

```typescript
  OPINION_API_KEY: "@milady/plugin-opinion",
```

**Step 3: Add to BLOCKED_ENV_KEYS in server.ts**

In `src/api/server.ts`, inside the `BLOCKED_ENV_KEYS` set (before closing `])`), add:

```typescript
  "OPINION_PRIVATE_KEY",
  "OPINION_API_KEY",
```

**Step 4: Run all opinion tests**

Run: `bunx vitest run src/plugins/opinion/`
Expected: All opinion tests PASS.

**Step 5: Commit**

```bash
git add src/plugins/opinion/index.ts src/runtime/eliza.ts src/api/server.ts
git commit -m "feat(opinion): plugin entry point and system integration

Register opinion-trade plugin in PROVIDER_PLUGIN_MAP (triggered by OPINION_API_KEY).
Block OPINION_PRIVATE_KEY and OPINION_API_KEY from env mutation API."
```

---

### Task 12: Run full test suite and verify

**Files:** none (verification only)

**Step 1: Run full awareness tests**

Run: `bunx vitest run src/awareness/`
Expected: All PASS (including updated contributor count).

**Step 2: Run all opinion plugin tests**

Run: `bunx vitest run src/plugins/opinion/`
Expected: All PASS.

**Step 3: Run full project tests**

Run: `bun test`
Expected: No regressions.

**Step 4: Commit any remaining fixes**

If any tests fail, fix and commit. Otherwise, no commit needed.
