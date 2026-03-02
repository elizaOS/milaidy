# Opinion Trade Plugin Design

**Date:** 2026-03-01
**Status:** Approved

## Overview

Integrate [Opinion Trade](https://opinion.trade) — a prediction market exchange on BNB Chain — as a Milady plugin. Enables the agent to browse macro-economic prediction markets, place bets, manage positions, and monitor prices in real time.

## Architecture Decision

**Direct SDK integration** (vs API proxy layer). The plugin imports `@opinion-labs/opinion-clob-sdk` directly. Actions call SDK methods without an intermediate Express route layer, keeping Opinion logic isolated from the main server.

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Wallet | Independent keypair (`OPINION_PRIVATE_KEY` + `OPINION_MULTISIG_ADDRESS`) | Fund isolation from main EVM wallet |
| Trade permissions | Reuse existing `tradePermissionMode` | Consistent UX, no new config surface |
| Safety cap | $500/bet default (`OPINION_MAX_BET_USD`) | Prevent LLM misjudgment on large amounts |
| WebSocket scope | Position-related markets only | Reduce resource usage and noise |
| Plugin trigger | `OPINION_API_KEY` in `PROVIDER_PLUGIN_MAP` | Auto-load when API key is set |

## Environment Variables

```
OPINION_API_KEY=xxx                # Required — API key (apply via Google Form)
OPINION_PRIVATE_KEY=0x...          # Optional — signing private key (read-only without)
OPINION_MULTISIG_ADDRESS=0x...     # Optional — Gnosis Safe funding address
OPINION_MAX_BET_USD=500            # Optional — per-bet safety cap (default 500)
```

## File Structure

```
src/plugins/opinion/
├── index.ts                        # Plugin entry — register actions/providers/services
├── client.ts                       # OpinionClient — SDK wrapper + connection management
├── types.ts                        # Opinion-specific types (market, position, order)
├── actions/
│   ├── list-opinion-markets.ts     # LIST_OPINION_MARKETS
│   ├── get-opinion-market.ts       # GET_OPINION_MARKET (price + orderbook)
│   ├── place-opinion-bet.ts        # PLACE_OPINION_BET
│   ├── check-opinion-positions.ts  # CHECK_OPINION_POSITIONS
│   ├── cancel-opinion-order.ts     # CANCEL_OPINION_ORDER
│   └── redeem-opinion.ts           # REDEEM_OPINION
├── providers/
│   └── opinion-context.ts          # Inject position summary into LLM context
├── awareness/
│   └── opinion-contributor.ts      # Awareness contributor (summary + detail)
└── services/
    └── opinion-ws.ts               # WebSocket service — price monitoring
```

## Plugin Lifecycle

1. **init()** — read env vars, initialize OpinionClient
2. No private key → read-only mode (list/get only, no trading)
3. Has private key → full mode (`enableTrading()` called on first bet)
4. WebSocket service connects on `initialize()`, subscribes to position markets
5. Loaded via `PROVIDER_PLUGIN_MAP` when `OPINION_API_KEY` is set

## Actions

### LIST_OPINION_MARKETS
- **Triggers:** "什么预测市场？", "Opinion 上有什么？"
- **Logic:** SDK `getMarkets()` → formatted list
- **Output:** Market name + YES/NO price + expiry
- **Parameters:** `status` (activated/all), `page`

### GET_OPINION_MARKET
- **Triggers:** "CPI 市场怎么样？", "市场 813 价格？"
- **Logic:** `getMarket(id)` + `getOrderbook(tokenId)` + `getLatestPrice(tokenId)`
- **Output:** Market detail + current price + orderbook depth (best bid/ask)
- **Parameters:** `marketId` (required)

### PLACE_OPINION_BET
- **Triggers:** "买 10U 的 YES", "帮我下注 CPI 会涨"
- **Logic:**
  1. Check `tradePermissionMode` — `user-sign-only` returns unsigned data
  2. Check `amount ≤ OPINION_MAX_BET_USD` ($500)
  3. SDK `placeOrder()`
- **Output:** Order confirmation + fill details
- **Parameters:** `marketId`, `tokenId`, `side` (buy/sell), `amount`, `price` (optional, omit for market order)

### CHECK_OPINION_POSITIONS
- **Triggers:** "我的 Opinion 持仓", "预测市场赚了吗？"
- **Logic:** SDK `getMyPositions()` → format P&L
- **Output:** Per-position: market name + side + qty + current price + unrealized P&L
- **Parameters:** none

### CANCEL_OPINION_ORDER
- **Triggers:** "取消限价单", "撤掉 Opinion 挂单"
- **Logic:** SDK `cancelOrder(orderId)` or `cancelAllOrders()`
- **Output:** Cancellation confirmation
- **Parameters:** `orderId` (optional; lists pending orders if omitted)

### REDEEM_OPINION
- **Triggers:** "结算 Opinion 已完成市场", "领取预测市场收益"
- **Logic:** SDK `redeem(marketId)` — on-chain, requires BNB gas
- **Output:** Settlement confirmation + TX hash
- **Parameters:** `marketId`

## Provider: opinion-context

```
position: 45        # between wallet(30) and pluginHealth(50)
dynamic: true       # re-query every turn

Output (no positions):
  "Opinion: connected, no open positions"

Output (with positions):
  "Opinion: 2 positions — CPI >3.5%: YES 50@0.62 (+$5.2), Fed Cut: NO 30@0.45 (-$1.8)"
```

Concise — ~80 chars max. Only outputs detail when positions exist.

## Awareness Contributor: opinion

```
id: "opinion"
position: 35              # between wallet(30) and provider(40)
cacheTtl: 30_000           # 30s cache
invalidateOn: ["opinion-order-placed", "opinion-order-cancelled"]

summary: "Opinion: 2 positions, +$3.4 unrealized"
detail (brief): one line per position
detail (full): positions + pending orders + balance + history
```

## WebSocket Service

- **Connection:** `wss://ws.opinion.trade?apikey={API_KEY}`
- **Subscribe:** only markets where user has positions (`market.last.price`)
- **Behavior:**
  - Price change > 10% → send alert message via runtime
  - Order filled → invalidate awareness cache
  - Heartbeat: every 25s
  - Auto-reconnect with exponential backoff
- **User channels:** `trade.order.update`, `trade.record.new`

## Security

| Measure | Implementation |
|---------|---------------|
| Private key protection | `OPINION_PRIVATE_KEY` added to `BLOCKED_ENV_KEYS` |
| Bet cap | Default $500/bet, configurable via `OPINION_MAX_BET_USD` |
| Permission control | Reuse `tradePermissionMode` — `user-sign-only` returns unsigned data |
| Awareness sanitization | Contributor never outputs keys/API secrets, only position summaries |
| Error isolation | All SDK calls wrapped in try-catch, failures don't affect agent |

## System Integration Points

1. **eliza.ts** — add `OPINION_API_KEY` to `PROVIDER_PLUGIN_MAP`
2. **server.ts** — add `OPINION_PRIVATE_KEY`, `OPINION_API_KEY` to `BLOCKED_ENV_KEYS`
3. **awareness/contributors/index.ts** — add `opinionContributor` to `builtinContributors`
4. **Plugin resolution** — `@milady/plugin-opinion` resolved from `src/plugins/opinion/`

## Testing

- `opinion-client.test.ts` — mock SDK, test client wrapper logic
- `place-opinion-bet.test.ts` — test param validation, amount cap, permission checks
- `opinion-context.test.ts` — test provider output format
- `opinion-contributor.test.ts` — test awareness summary/detail

## Out of Scope (YAGNI)

- Market creation (API doesn't support it)
- Historical data analysis / charts
- Automated trading strategies (agent only executes user instructions)
- UI components (v1 is conversation-only)

## Opinion Trade API Reference

- **REST base:** `https://openapi.opinion.trade/openapi`
- **WebSocket:** `wss://ws.opinion.trade`
- **SDK (TS):** `@opinion-labs/opinion-clob-sdk` v0.5.2
- **Chain:** BNB Chain (chainId: 56)
- **Rate limit:** 15 req/s per API key
- **Min order:** $5
- **Price range:** 0.01–0.99 (max 4 decimals)
- **Fee:** 0–2% taker, 0% maker
- **Docs:** https://docs.opinion.trade/
