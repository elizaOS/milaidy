/**
 * TradingPnlWidget — Live PnL (profit & loss) ticker for trading agents.
 *
 * Subscribes to "trade" and "portfolio" event streams. Shows:
 *   - Total PnL with color coding (green/red)
 *   - Recent trade history with direction arrows
 *   - Win rate percentage
 */

import { useMemo } from "react";
import type { WidgetDefinition, WidgetRenderProps } from "../types";
import { registerWidget } from "../registry";

function TradingPnlWidgetComponent({
  instance,
  events,
}: WidgetRenderProps) {
  const maxItems = (instance.config.maxItems as number) ?? 6;
  const showWinRate = (instance.config.showWinRate as boolean) ?? true;

  const trades = useMemo(() => {
    const items: Array<{
      id: string;
      pair: string;
      side: string;
      pnl: number;
      ts: number;
    }> = [];

    for (const evt of events) {
      const p = evt.payload as Record<string, unknown>;
      const pair =
        (typeof p.symbol === "string" && p.symbol) ||
        (typeof p.pair === "string" && p.pair) ||
        (typeof p.token === "string" && p.token) ||
        "???";
      const side =
        (typeof p.side === "string" && p.side) ||
        (typeof p.direction === "string" && p.direction) ||
        (typeof p.action === "string" && p.action) ||
        "";
      const pnl =
        typeof p.pnl === "number"
          ? p.pnl
          : typeof p.profit === "number"
            ? p.profit
            : typeof p.realizedPnl === "number"
              ? (p.realizedPnl as number)
              : 0;

      items.push({ id: evt.eventId, pair, side, pnl, ts: evt.ts });
    }

    return items.slice(-maxItems).reverse();
  }, [events, maxItems]);

  const totalPnl = useMemo(
    () => trades.reduce((sum, t) => sum + t.pnl, 0),
    [trades],
  );

  const winRate = useMemo(() => {
    if (trades.length === 0) return 0;
    const wins = trades.filter((t) => t.pnl > 0).length;
    return Math.round((wins / trades.length) * 100);
  }, [trades]);

  const accentColor = (instance.config.accentColor as string) || "#6366f1";

  return (
    <div
      className="w-full h-full rounded-lg overflow-hidden text-white"
      style={{
        background: "rgba(10, 12, 20, 0.85)",
        backdropFilter: "blur(12px)",
        border: `1px solid ${accentColor}33`,
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-1.5"
        style={{ borderBottom: `1px solid ${accentColor}22` }}
      >
        <span className="text-[10px] uppercase tracking-widest font-bold" style={{ color: accentColor }}>
          Trading PnL
        </span>
        {showWinRate && trades.length > 0 && (
          <span className="text-[10px] font-mono text-gray-400">
            WR: {winRate}%
          </span>
        )}
      </div>

      {/* Total PnL */}
      <div className="px-3 py-2 flex items-center gap-2">
        <span className="text-[10px] text-gray-500 uppercase">Total</span>
        <span
          className={`text-lg font-bold font-mono ${
            totalPnl >= 0 ? "text-emerald-400" : "text-red-400"
          }`}
        >
          {totalPnl >= 0 ? "+" : ""}
          {totalPnl.toFixed(2)}
        </span>
      </div>

      {/* Trade list */}
      <div className="px-2 pb-2 space-y-0.5 overflow-hidden">
        {trades.length === 0 ? (
          <div className="text-[10px] text-gray-600 text-center py-2">
            No trades yet
          </div>
        ) : (
          trades.map((t) => (
            <div
              key={t.id}
              className="flex items-center gap-2 px-1.5 py-0.5 rounded text-[10px]"
              style={{ background: "rgba(255,255,255,0.03)" }}
            >
              <span
                className={`font-bold ${
                  t.side.toLowerCase().includes("buy") || t.side.toLowerCase().includes("long")
                    ? "text-emerald-400"
                    : "text-red-400"
                }`}
              >
                {t.side.toLowerCase().includes("buy") || t.side.toLowerCase().includes("long")
                  ? "\u25B2"
                  : "\u25BC"}
              </span>
              <span className="text-gray-300 font-medium flex-1 truncate">
                {t.pair}
              </span>
              <span
                className={`font-mono ${t.pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}
              >
                {t.pnl >= 0 ? "+" : ""}
                {t.pnl.toFixed(2)}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

const definition: WidgetDefinition = {
  type: "trading-pnl",
  name: "Trading PnL",
  description: "Live profit & loss ticker for trading agents",
  subscribesTo: ["trade", "portfolio", "action"],
  defaultPosition: { x: 2, y: 55, width: 25, height: 40 },
  defaultZIndex: 18,
  configSchema: {
    accentColor: {
      type: "color",
      label: "Accent Color",
      default: "#6366f1",
    },
    maxItems: {
      type: "number",
      label: "Max Trades Shown",
      default: 6,
      min: 2,
      max: 20,
    },
    showWinRate: {
      type: "boolean",
      label: "Show Win Rate",
      default: true,
    },
  },
  defaultConfig: { accentColor: "#6366f1", maxItems: 6, showWinRate: true },
  render: TradingPnlWidgetComponent,
};

registerWidget(definition);
export default definition;
