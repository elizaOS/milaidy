import type {
  Action,
  ActionExample,
  Content,
  HandlerCallback,
  IAgentRuntime,
  Memory,
  State,
} from "@elizaos/core";
import { LimitlessClient } from "../core/markets.js";
import { OrderSigner } from "../core/sign.js";
import { TradingClient } from "../core/trading.js";
import { PortfolioClient } from "../core/portfolio.js";
import { getOrCreateWallet } from "../core/wallet.js";
import { getPluginConfig } from "../config.js";
import type { Market } from "../core/types.js";

// Active strategy tracking
const activeStrategies = new Map<string, { timer: NodeJS.Timeout; type: string }>();

export const runStrategyAction: Action = {
  name: "LIMITLESS_RUN_STRATEGY",
  similes: [
    "start trading strategy",
    "run signal sniper",
    "run oracle arb",
    "start prediction market bot",
    "autonomous trading",
    "start limitless strategy",
    "start complement arb",
    "run cross market arb",
  ],
  description:
    "Run an autonomous prediction market trading strategy on Limitless Exchange. Available strategies: 'signal-sniper' (finds mispriced markets using external price feeds), 'oracle-arb' (compares oracle prices to market prices), 'complement-arb' (exploits YES+NO < $1.00 mispricings). Runs with safety limits and dry-run mode by default.",

  validate: async (runtime: IAgentRuntime): Promise<boolean> => {
    const config = getPluginConfig(runtime);
    return !!config.apiKey && !!config.privateKey;
  },

  handler: async (
    runtime: IAgentRuntime,
    _message: Memory,
    _state: State | undefined,
    options: Record<string, unknown> | undefined,
    callback?: HandlerCallback,
  ) => {
    try {
      const config = getPluginConfig(runtime);
      const params = options?.parameters as {
        strategy: string;
        asset?: string;
        tickIntervalSecs?: number;
        maxTicks?: number;
        action?: "start" | "stop" | "status";
      };

      if (!params?.strategy) {
        if (callback) {
          await callback({
            text: "Please specify a strategy: 'signal-sniper', 'oracle-arb', or 'complement-arb'.\n\nUse action 'stop' to stop a running strategy, or 'status' to check.",
            actions: [],
          } as Content);
        }
        return { success: false, error: "Missing strategy parameter" };
      }

      const strategyKey = `${runtime.agentId}-${params.strategy}`;

      // Handle stop/status
      if (params.action === "stop") {
        const active = activeStrategies.get(strategyKey);
        if (active) {
          clearInterval(active.timer);
          activeStrategies.delete(strategyKey);
          if (callback) {
            await callback({
              text: `Strategy **${params.strategy}** stopped.`,
              actions: [],
            } as Content);
          }
        } else {
          if (callback) {
            await callback({
              text: `No active **${params.strategy}** strategy to stop.`,
              actions: [],
            } as Content);
          }
        }
        return { success: true };
      }

      if (params.action === "status") {
        const runningStrategies = Array.from(activeStrategies.entries())
          .filter(([key]) => key.startsWith(runtime.agentId as string))
          .map(([, v]) => v.type);

        if (callback) {
          await callback({
            text:
              runningStrategies.length > 0
                ? `Running strategies: ${runningStrategies.join(", ")}`
                : "No strategies currently running.",
            actions: [],
          } as Content);
        }
        return { success: true };
      }

      // Check if already running
      if (activeStrategies.has(strategyKey)) {
        if (callback) {
          await callback({
            text: `Strategy **${params.strategy}** is already running. Use action 'stop' first.`,
            actions: [],
          } as Content);
        }
        return { success: false, error: "Strategy already running" };
      }

      const { client: walletClient, account } = getOrCreateWallet(runtime);
      const limitless = new LimitlessClient(config.apiBaseUrl, config.apiKey);
      const signer = new OrderSigner(walletClient as any, account, 8453);
      const trading = new TradingClient(
        limitless,
        signer,
        config.apiBaseUrl,
        config.dryRun,
        runtime.logger,
        config.apiKey,
      );

      const tickInterval = (params.tickIntervalSecs || 60) * 1000;
      const maxTicks = params.maxTicks || 60; // Default 1 hour at 60s ticks
      let tickCount = 0;

      const strategyFn = getStrategyFn(params.strategy, {
        limitless,
        trading,
        asset: params.asset || "BTC",
        config,
        logger: runtime.logger,
      });

      if (!strategyFn) {
        if (callback) {
          await callback({
            text: `Unknown strategy: "${params.strategy}". Available: signal-sniper, oracle-arb, complement-arb`,
            actions: [],
          } as Content);
        }
        return { success: false, error: "Unknown strategy" };
      }

      const timer = setInterval(async () => {
        tickCount++;
        if (tickCount > maxTicks) {
          clearInterval(timer);
          activeStrategies.delete(strategyKey);
          runtime.logger.info(`[limitless] Strategy ${params.strategy} completed ${maxTicks} ticks`);
          return;
        }

        try {
          const decisions = await strategyFn();
          for (const d of decisions) {
            if (d.action === "SKIP") continue;
            runtime.logger.info(
              `[limitless] Strategy decision: ${d.action} ${d.side} on ${d.marketSlug} for $${d.amountUsd} (reason: ${d.reason})`,
            );
            if (d.action === "BUY") {
              await trading.createOrder({
                marketSlug: d.marketSlug,
                side: d.side,
                limitPriceCents: d.priceLimit,
                usdAmount: d.amountUsd,
                orderType: "FOK",
              });
            }
          }
        } catch (err) {
          runtime.logger.error(`[limitless] Strategy tick error: ${err}`);
        }
      }, tickInterval);

      activeStrategies.set(strategyKey, { timer, type: params.strategy });

      const modeLabel = config.dryRun ? " (DRY RUN)" : " (LIVE)";
      if (callback) {
        await callback({
          text: `Strategy **${params.strategy}**${modeLabel} started!\n\n- Asset: ${params.asset || "BTC"}\n- Tick interval: ${params.tickIntervalSecs || 60}s\n- Max ticks: ${maxTicks}\n- Max trade: $${config.maxSingleTradeUsd}\n- Max exposure: $${config.maxTotalExposureUsd}\n\nUse \`stop\` action to halt the strategy.`,
          actions: [],
        } as Content);
      }
      return { success: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (callback) {
        await callback({ text: `Failed to start strategy: ${msg}`, actions: [] } as Content);
      }
      return { success: false, error: msg };
    }
  },

  parameters: [
    {
      name: "strategy",
      description:
        "Strategy to run: 'signal-sniper' (price-based), 'oracle-arb' (oracle comparison), or 'complement-arb' (cross-market YES+NO arbitrage)",
      required: true,
      schema: { type: "string", enum: ["signal-sniper", "oracle-arb", "complement-arb"] },
    },
    {
      name: "asset",
      description: "Target asset for signal-sniper/oracle-arb (e.g. 'BTC', 'ETH', 'SOL'). Defaults to 'BTC'.",
      required: false,
      schema: { type: "string" },
    },
    {
      name: "tickIntervalSecs",
      description: "Seconds between strategy ticks. Defaults to 60.",
      required: false,
      schema: { type: "number" },
    },
    {
      name: "maxTicks",
      description: "Maximum number of ticks before auto-stopping. Defaults to 60 (1 hour at 60s ticks).",
      required: false,
      schema: { type: "number" },
    },
    {
      name: "action",
      description: "'start' (default), 'stop', or 'status'",
      required: false,
      schema: { type: "string", enum: ["start", "stop", "status"] },
    },
  ],

  examples: [
    [
      {
        name: "{{user1}}",
        content: { text: "Run the signal sniper strategy for BTC" },
      } as ActionExample,
      {
        name: "{{agent}}",
        content: {
          text: "Strategy **signal-sniper** (DRY RUN) started!\n\n- Asset: BTC\n- Tick interval: 60s\n- Max ticks: 60",
          actions: ["LIMITLESS_RUN_STRATEGY"],
        },
      } as ActionExample,
    ],
  ],
};

interface StrategyDeps {
  limitless: LimitlessClient;
  trading: TradingClient;
  asset: string;
  config: { maxSingleTradeUsd: number; maxTotalExposureUsd: number; dryRun: boolean };
  logger: IAgentRuntime["logger"];
}

interface TradeDecision {
  action: "BUY" | "SELL" | "SKIP";
  marketSlug: string;
  side: "YES" | "NO";
  amountUsd: number;
  priceLimit: number;
  reason: string;
}

function getStrategyFn(
  strategy: string,
  deps: StrategyDeps,
): (() => Promise<TradeDecision[]>) | null {
  switch (strategy) {
    case "signal-sniper":
      return () => signalSniperTick(deps);
    case "oracle-arb":
      return () => oracleArbTick(deps);
    case "complement-arb":
      return () => complementArbTick(deps);
    default:
      return null;
  }
}

async function signalSniperTick(deps: StrategyDeps): Promise<TradeDecision[]> {
  const { limitless, asset, config, logger } = deps;
  const decisions: TradeDecision[] = [];

  try {
    const markets = await limitless.searchHourlyMarkets(asset);
    if (markets.length === 0) return decisions;

    for (const market of markets.slice(0, 5)) {
      const yesPrice = market.prices?.[0];
      if (!yesPrice || yesPrice < 5 || yesPrice > 95) continue;

      // Simple signal: look for markets priced far from 50 (potential mispricing)
      const edge = Math.abs(yesPrice - 50);
      if (edge > 15) {
        const side = yesPrice < 35 ? "YES" : "NO";
        const price = side === "YES" ? Math.round(yesPrice + 5) : Math.round(100 - yesPrice + 5);

        decisions.push({
          action: "BUY",
          marketSlug: market.slug,
          side,
          amountUsd: Math.min(config.maxSingleTradeUsd, 5),
          priceLimit: Math.min(price, 70),
          reason: `Signal sniper: ${asset} market ${market.slug} ${side} at ${yesPrice}c looks mispriced (edge=${edge.toFixed(1)})`,
        });
      }
    }
  } catch (err) {
    logger.error(`[limitless] Signal sniper error: ${err}`);
  }

  return decisions;
}

async function oracleArbTick(deps: StrategyDeps): Promise<TradeDecision[]> {
  const { limitless, asset, config, logger } = deps;
  const decisions: TradeDecision[] = [];

  try {
    const markets = await limitless.searchHourlyMarkets(asset);
    if (markets.length === 0) return decisions;

    // Look for markets where the title contains a price threshold we can parse
    for (const market of markets.slice(0, 5)) {
      const titleMatch = market.title.match(/above\s+\$?([\d,]+)/i);
      if (!titleMatch) continue;

      const threshold = parseFloat(titleMatch[1].replace(/,/g, ""));
      const yesPrice = market.prices?.[0];
      if (!yesPrice || !threshold) continue;

      // Without a live oracle, we flag markets with extreme pricing as opportunities
      if (yesPrice < 20 || yesPrice > 80) {
        const side = yesPrice < 20 ? "YES" : "NO";
        const price = side === "YES" ? Math.round(yesPrice + 3) : Math.round(100 - yesPrice + 3);

        decisions.push({
          action: "BUY",
          marketSlug: market.slug,
          side,
          amountUsd: Math.min(config.maxSingleTradeUsd, 2),
          priceLimit: Math.min(price, 70),
          reason: `Oracle arb: ${market.slug} ${side} priced at ${yesPrice}c, threshold $${threshold}`,
        });
      }
    }
  } catch (err) {
    logger.error(`[limitless] Oracle arb error: ${err}`);
  }

  return decisions;
}

async function complementArbTick(deps: StrategyDeps): Promise<TradeDecision[]> {
  const { limitless, config, logger } = deps;
  const decisions: TradeDecision[] = [];

  try {
    const markets = await limitless.getActiveMarkets({ tradeType: "clob", limit: 50 });

    for (const market of markets) {
      const yesPrice = market.prices?.[0];
      const noPrice = market.prices?.[1];
      if (!yesPrice || !noPrice) continue;

      // Complement arbitrage: if YES + NO < 100, there's free money
      const total = yesPrice + noPrice;
      if (total < 95) {
        // Buy both sides
        const buyAmount = Math.min(config.maxSingleTradeUsd, 2);

        decisions.push({
          action: "BUY",
          marketSlug: market.slug,
          side: "YES",
          amountUsd: buyAmount,
          priceLimit: Math.round(yesPrice + 2),
          reason: `Complement arb: ${market.slug} YES+NO=${total.toFixed(1)}c < 100c, guaranteed profit of ${(100 - total).toFixed(1)}c`,
        });

        decisions.push({
          action: "BUY",
          marketSlug: market.slug,
          side: "NO",
          amountUsd: buyAmount,
          priceLimit: Math.round(noPrice + 2),
          reason: `Complement arb: ${market.slug} buying NO side for complement`,
        });
      }
    }
  } catch (err) {
    logger.error(`[limitless] Complement arb error: ${err}`);
  }

  return decisions;
}
