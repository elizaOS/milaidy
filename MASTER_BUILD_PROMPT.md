# MASTER BUILD PROMPT: Milady Trader Shell + Limitless Prediction Markets Plugin

> **What this is:** A comprehensive build specification for extending the milady/ElizaOS agent framework with a Trader UI shell and full Limitless Exchange prediction market integration. Send this entire prompt to Claude Code on your server to build out the complete system.

---

## ROLE & CONTEXT

You are a senior full-stack engineer building a production-grade prediction market trading interface and autonomous agent plugin for the milady framework (ElizaOS fork). The project has two integration layers:

1. **`@milady/plugin-limitless`** — An ElizaOS plugin that wraps the Limitless Exchange API for autonomous prediction market trading on Base chain (chain ID 8453)
2. **Trader Shell Mode** — A new React/Tailwind UI shell mode purpose-built for prediction market traders and agent developers

The codebase lives at `https://github.com/milady-ai/milady` (ElizaOS fork). The upstream ElizaOS framework is at `https://github.com/elizaOS/eliza`.

---

## DOCUMENTATION REFERENCES

Consult these docs for API contracts, patterns, and integration details:

| Technology | Documentation URL | Used For |
|---|---|---|
| Limitless Exchange API | https://docs.limitless.exchange | Market data, orders, orderbook, portfolio |
| Limitless API Reference | https://api.limitless.exchange/api-v1 | REST endpoint specs |
| ElizaOS Plugin Dev | https://docs.elizaos.ai/plugins/development | Action/Provider/Evaluator patterns |
| ElizaOS Plugin Starter | https://github.com/elizaOS/eliza-plugin-starter | Plugin boilerplate and lifecycle |
| Viem (Ethereum TS) | https://viem.sh/docs/introduction | Wallet clients, contract calls, signing |
| Viem on Base | https://docs.base.org/learn/onchain-app-development/frontend-setup/viem | Base chain viem config |
| Base Chain | https://docs.base.org | L2 chain details, RPC, contracts |
| EIP-712 Signing | https://eips.ethereum.org/EIPS/eip-712 | Typed structured data signing |
| Pyth Hermes Oracle | https://docs.pyth.network/price-feeds/core/api-reference | Real-time price feeds via SSE |
| CoinGecko API v3 | https://docs.coingecko.com | Spot price data for signal strategies |
| React | https://react.dev | UI components |
| Tailwind CSS | https://tailwindcss.com/docs/installation | Utility-first styling |
| Socket.IO Client | https://socket.io/docs/v4/client-api/ | WebSocket price/orderbook subscriptions |
| Polymarket CLOB (reference) | https://docs.polymarket.com/developers/CLOB/introduction | CLOB prediction market patterns |

---

## SYSTEM ARCHITECTURE

### Directory Structure

```
packages/plugin-limitless/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts              # Plugin entry + exports
│   ├── config.ts             # Runtime config loader
│   ├── core/
│   │   ├── types.ts          # All TypeScript interfaces + EIP712 constants
│   │   ├── markets.ts        # LimitlessClient (REST API)
│   │   ├── trading.ts        # TradingClient (order management)
│   │   ├── sign.ts           # OrderSigner (EIP712)
│   │   ├── portfolio.ts      # PortfolioClient (positions/trades)
│   │   └── wallet.ts         # Wallet resolution + creation
│   ├── providers/
│   │   └── markets-provider.ts  # Eliza context provider
│   └── actions/
│       ├── search-markets.ts    # LIMITLESS_SEARCH_MARKETS
│       ├── get-market-detail.ts # LIMITLESS_GET_MARKET
│       ├── get-portfolio.ts     # LIMITLESS_GET_PORTFOLIO
│       ├── place-order.ts       # LIMITLESS_PLACE_ORDER
│       ├── approve-market.ts    # LIMITLESS_APPROVE_MARKET
│       └── run-strategy.ts      # LIMITLESS_RUN_STRATEGY

apps/app/src/
├── AppContext.tsx             # UiShellMode type: "companion" | "native" | "trader"
├── App.tsx                    # Shell routing (trader → TraderShell)
└── components/
    ├── TraderShell.tsx        # Trader mode layout
    └── Header.tsx             # 3-way shell mode toggle
```

### Dependency Graph

```
Plugin: index.ts → config.ts → core/* → actions/* + providers/*
  Core chain: wallet.ts → sign.ts → trading.ts → markets.ts
  All depend on: types.ts (interfaces + EIP712 constants)
  External: @elizaos/core, viem, cross-fetch

Frontend: App.tsx → AppContext.tsx → TraderShell.tsx + Header.tsx
  TraderShell uses: ChatView, InventoryView, PluginsView, SkillsView,
                    KnowledgeView, AdvancedPageView, SettingsView
```

---

## WHAT EXISTS (CURRENT STATE)

The following files are already scaffolded with basic implementations. Your job is to **enhance, harden, and complete** them.

### Core Types (`src/core/types.ts`)

```typescript
// Key interfaces already defined:
export interface Market {
  id: number; address: string; title: string; prices: number[];
  tradeType: "amm" | "clob" | "group"; marketType: "single" | "group";
  slug: string; venue: MarketVenue; positionIds: string[];
  collateralToken: Token; volume: string; expirationTimestamp: number;
  status: "FUNDED" | "CLOSED" | "RESOLVED";
}

export interface MarketVenue { exchange: string; adapter: string; }

export const EIP712_DOMAIN = {
  name: "Limitless CTF Exchange", version: "1", chainId: 8453,
} as const;

export const EIP712_TYPES = {
  Order: [
    { name: "salt", type: "uint256" }, { name: "maker", type: "address" },
    { name: "signer", type: "address" }, { name: "taker", type: "address" },
    { name: "tokenId", type: "uint256" }, { name: "makerAmount", type: "uint256" },
    { name: "takerAmount", type: "uint256" }, { name: "expiration", type: "uint256" },
    { name: "nonce", type: "uint256" }, { name: "feeRateBps", type: "uint256" },
    { name: "side", type: "uint8" }, { name: "signatureType", type: "uint8" },
  ],
} as const;

export interface LimitlessConfig {
  privateKey: string; apiKey: string; dryRun: boolean;
  maxSingleTradeUsd: number; maxTotalExposureUsd: number; apiBaseUrl: string;
}
```

### Contract Addresses (Base Chain)

```
USDC:     0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
CTF:      0xC9c98965297Bc527861c898329Ee280632B76e18
Exchange: Dynamic per-market (from market.venue.exchange)
Adapter:  Dynamic per-market (from market.venue.adapter)
```

### Wallet Resolution Priority

```typescript
// Checks in order: LIMITLESS_PRIVATE_KEY → PRIVATE_KEY → EVM_PRIVATE_KEY
// This allows reuse of Eliza Cloud managed wallets
export function resolvePrivateKey(runtime?: IAgentRuntime): string | null {
  for (const key of ["LIMITLESS_PRIVATE_KEY", "PRIVATE_KEY", "EVM_PRIVATE_KEY"]) {
    const value = runtime?.getSetting?.(key) || process.env[key] || "";
    if (value) return value;
  }
  return null;
}
```

### Config Loader Pattern

```typescript
export function getPluginConfig(runtime: IAgentRuntime): LimitlessConfig {
  const getSetting = (key: string): string =>
    (runtime.getSetting?.(key) as string) || process.env[key] || "";
  return {
    privateKey: getSetting("LIMITLESS_PRIVATE_KEY") || getSetting("PRIVATE_KEY") || getSetting("EVM_PRIVATE_KEY"),
    apiKey: getSetting("LIMITLESS_API_KEY"),
    dryRun: (getSetting("LIMITLESS_DRY_RUN") || getSetting("DRY_RUN") || "true") === "true",
    maxSingleTradeUsd: parseFloat(getSetting("LIMITLESS_MAX_SINGLE_TRADE_USD") || "10"),
    maxTotalExposureUsd: parseFloat(getSetting("LIMITLESS_MAX_TOTAL_EXPOSURE_USD") || "50"),
    apiBaseUrl: getSetting("LIMITLESS_API_URL") || "https://api.limitless.exchange",
  };
}
```

### UI Shell Mode System

The app has three shell modes controlled by `UiShellMode` type in `AppContext.tsx`:

- **`"companion"`** (default) — 3D VRM character with overlay panels
- **`"native"`** — Traditional tabbed layout with Header + Nav + ViewRouter
- **`"trader"`** — Dark, focused layout with collapsible sidebar (what we built)

Shell routing in `App.tsx`:
```typescript
if (shellMode === "trader") return <TraderShell tab={effectiveTab} />;
if (shellMode === "companion") return <CompanionShell tab={effectiveTab} />;
// else: native shell
```

Header toggle cycles: companion (gold) → native (green) → trader (cyan) → companion

---

## WHAT NEEDS TO BE BUILT / ENHANCED

### 1. TRADER SHELL ENHANCEMENTS (Priority: High)

The current `TraderShell.tsx` is a working scaffold. Enhance it with:

**a) Market Dashboard Panel** — A dedicated view showing:
- Active positions with real-time P&L
- Recent trades with fill status
- Market watchlist (user-pinned markets)
- Strategy status indicators (running/paused/stopped)
- Quick-trade form (market slug, side, amount — one-click order)

**b) Real-time Data Integration:**
- Connect to Limitless WebSocket (`wss://ws.limitless.exchange`) for live price updates
- Use Socket.IO client pattern (see reference: `src/core/limitless/websocket.ts` in agents-starter)
- Show live orderbook depth for selected market
- Animate price changes (green flash up, red flash down)

**c) Portfolio Sidebar:**
- Current wallet balance (USDC on Base)
- Active positions with market value
- Unrealized P&L with color coding
- Claimable positions (resolved markets)

**d) Strategy Control Panel:**
- Start/stop/pause strategies from UI
- Real-time tick counter and decision log
- Confidence threshold slider
- Bet size controls
- DRY RUN toggle (prominently displayed)

**e) Responsive Design:**
- Mobile: Stack sidebar as bottom nav, collapse panels
- Tablet: Two-column layout
- Desktop: Full three-column layout
- Use Tailwind breakpoints: `sm:`, `md:`, `lg:`, `xl:`

### 2. PLUGIN HARDENING (Priority: High)

**a) Error Recovery:**
- Add retry logic with exponential backoff for API calls in `markets.ts` and `trading.ts`
- Handle 429 rate limits gracefully (back off, then retry)
- Add circuit breaker pattern for repeated failures
- Validate API responses against expected schemas

**b) Position Tracking:**
- Implement persistent position tracking (currently strategies don't track across restarts)
- Use runtime memory or file-based persistence
- Track: entry price, current price, P&L, fill status

**c) Risk Management:**
- Enforce `maxTotalExposureUsd` across all active positions (not just single trades)
- Track cumulative exposure in `TradingClient`
- Add portfolio-level stop-loss: auto-pause strategies if total P&L drops below threshold
- Add max daily trade count limiter

**d) Order Verification:**
- After submitting FOK orders, verify fill via `PortfolioClient.verifyFill()`
- Log fill/miss ratio for strategy performance tracking
- Handle partial fills gracefully

**e) WebSocket Integration for Plugin:**
- Add `LimitlessWebSocket` class to core (reference: agents-starter `websocket.ts`)
- Use for real-time price monitoring in strategies instead of polling
- Subscribe to orderbook updates for active markets

### 3. ADDITIONAL STRATEGIES (Priority: Medium)

**a) Conviction Sniper Strategy:**
- Uses Pyth Hermes SSE feeds for sub-second oracle prices
- Compares oracle price to market strike price
- Fair value: `confidence = min(0.95, 0.50 + |percentDiff| * 40)`
- Golden window logic: faster scanning near market expiry
- Ladder orders for high-confidence trades (>= 90%)

Reference Hermes endpoint:
```
GET https://hermes.pyth.network/v2/updates/price/stream?ids[]=<feed_id>&parsed=true
Content-Type: text/event-stream
```

Price feed IDs (from Pyth):
```typescript
const PRICE_FEED_IDS: Record<string, string> = {
  BTC: "0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43",
  ETH: "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace",
  SOL: "0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d",
};
```

**b) Sentiment Scanner Strategy:**
- Integrate with CoinGecko trending endpoint
- Cross-reference trending assets with open Limitless markets
- Score markets by social momentum + price divergence

### 4. FRONTEND-PLUGIN BRIDGE (Priority: High)

Connect the TraderShell UI to the plugin-limitless backend:

**a) Create API bridge hooks:**
```typescript
// hooks/useLimitlessMarkets.ts
export function useLimitlessMarkets() {
  // Fetch markets via REST, cache with SWR/React Query pattern
  // Return: { markets, loading, error, refresh }
}

// hooks/useLimitlessPortfolio.ts
export function useLimitlessPortfolio() {
  // Fetch positions and trades
  // Return: { positions, trades, pnl, refresh }
}

// hooks/useLimitlessStrategy.ts
export function useLimitlessStrategy() {
  // Start/stop/status via Eliza runtime action invocation
  // Return: { running, strategy, start, stop, status }
}
```

**b) WebSocket price feed hook:**
```typescript
// hooks/useLimitlessPrices.ts
export function useLimitlessPrices(slugs: string[]) {
  // Connect to wss://ws.limitless.exchange via Socket.IO
  // Subscribe to price updates for given slugs
  // Return: { prices: Map<slug, number[]>, connected }
}
```

### 5. TESTING (Priority: Medium)

**a) Plugin unit tests:**
- Test `resolvePrivateKey()` with various env combinations
- Test `getPluginConfig()` with runtime mock
- Test EIP712 signing produces valid signatures
- Test `TradingClient` rate limiter (Semaphore)
- Test strategy decision logic (signal-sniper, complement-arb)

**b) UI component tests:**
- Test TraderShell renders all sidebar items
- Test shell mode toggle cycles correctly (companion → native → trader)
- Test sidebar collapse/expand
- Test tab routing within trader shell

### 6. ENVIRONMENT & DEPLOYMENT

Required environment variables:
```bash
# Required for trading
LIMITLESS_API_KEY=lmts_...
EVM_PRIVATE_KEY=0x...         # Or LIMITLESS_PRIVATE_KEY or PRIVATE_KEY

# Safety (defaults shown)
LIMITLESS_DRY_RUN=true        # ALWAYS start with dry run
LIMITLESS_MAX_SINGLE_TRADE_USD=10
LIMITLESS_MAX_TOTAL_EXPOSURE_USD=50

# Optional
LIMITLESS_API_URL=https://api.limitless.exchange
COINGECKO_API_KEY=CG-...
LOG_LEVEL=info
```

---

## IMPLEMENTATION PRIORITIES

Execute in this order:

1. **Read all existing files first** — understand what's built before changing anything
2. **Harden the plugin core** — error recovery, retry logic, position tracking
3. **Build the frontend-plugin bridge** — React hooks that call the plugin
4. **Enhance TraderShell UI** — Market dashboard, portfolio panel, strategy controls
5. **Add WebSocket real-time data** — Live prices in both plugin strategies and UI
6. **Add conviction-sniper strategy** — Pyth Hermes integration
7. **Write tests** — Plugin unit tests, then UI component tests
8. **Final integration testing** — End-to-end with DRY_RUN=true

---

## CRITICAL CONSTRAINTS

1. **NEVER disable dry run by default** — `DRY_RUN=true` must be the default. Only real money when explicitly opted in.
2. **Reuse existing wallets** — Always check `EVM_PRIVATE_KEY` (Eliza Cloud) before creating new wallets.
3. **No hardcoded secrets** — All keys via `runtime.getSetting()` or `process.env`.
4. **Base chain only** — Chain ID 8453, USDC as collateral.
5. **ElizaOS plugin patterns** — Actions must have `validate()`, `handler()`, `parameters[]`, `examples[]`.
6. **Don't over-engineer** — Ship working code. Avoid premature abstractions.
7. **Existing code style** — TypeScript, Tailwind classes, pino logger in plugin, React hooks in frontend.
8. **EIP712 domain is immutable** — `{ name: "Limitless CTF Exchange", version: "1", chainId: 8453 }`.
9. **Position IDs** — YES = `positionIds[0]`, NO = `positionIds[1]`.
10. **FOK orders** — `makerAmount = usdAmount * 1e6`, `takerAmount = 1n`. GTC orders use tick alignment.

---

## SUCCESS CRITERIA

The build is complete when:

- [ ] TraderShell shows live market data from Limitless API
- [ ] Portfolio panel displays current positions with P&L
- [ ] Strategy controls can start/stop strategies from the UI
- [ ] WebSocket feed shows real-time price updates
- [ ] All 6 plugin actions work in dry-run mode
- [ ] Shell mode toggle cycles all 3 modes correctly
- [ ] Mobile responsive layout works on phones
- [ ] Unit tests pass for plugin core
- [ ] No TypeScript errors
- [ ] No hardcoded API keys or private keys
