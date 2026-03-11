/**
 * TradingPositionsWidget — Live open positions display for trading agents.
 *
 * Shows current holdings with entry price, current price, and unrealized PnL.
 */

import { useMemo } from "react";
import type { WidgetDefinition, WidgetRenderProps } from "../types";
import { registerWidget } from "../registry";

function TradingPositionsComponent({
  instance,
  events,
}: WidgetRenderProps) {
  const maxPositions = (instance.config.maxPositions as number) ?? 5;

  // Build positions from latest portfolio/position events
  const positions = useMemo(() => {
    const posMap = new Map<
      string,
      {
        symbol: string;
        side: string;
        size: number;
        entry: number;
        current: number;
        pnl: number;
      }
    >();

    for (const evt of events) {
      const p = evt.payload as Record<string, unknown>;

      // Support both individual position updates and portfolio snapshots
      const symbol =
        (typeof p.symbol === "string" && p.symbol) ||
        (typeof p.pair === "string" && p.pair) ||
        (typeof p.token === "string" && p.token) ||
        "";
      if (!symbol) continue;

      const side =
        (typeof p.side === "string" && p.side) ||
        (typeof p.direction === "string" && p.direction) ||
        "long";
      const size = typeof p.size === "number" ? p.size : typeof p.amount === "number" ? p.amount : 0;
      const entry = typeof p.entryPrice === "number" ? p.entryPrice : typeof p.avgPrice === "number" ? p.avgPrice : 0;
      const current = typeof p.currentPrice === "number" ? p.currentPrice : typeof p.markPrice === "number" ? p.markPrice : entry;
      const pnl = typeof p.unrealizedPnl === "number" ? p.unrealizedPnl : (current - entry) * size;

      posMap.set(symbol, { symbol, side, size, entry, current, pnl });
    }

    return Array.from(posMap.values()).slice(0, maxPositions);
  }, [events, maxPositions]);

  const accentColor = (instance.config.accentColor as string) || "#8b5cf6";

  return (
    <div
      className="w-full h-full rounded-lg overflow-hidden text-white"
      style={{
        background: "rgba(10, 12, 20, 0.85)",
        backdropFilter: "blur(12px)",
        border: `1px solid ${accentColor}33`,
      }}
    >
      <div
        className="flex items-center justify-between px-3 py-1.5"
        style={{ borderBottom: `1px solid ${accentColor}22` }}
      >
        <span
          className="text-[10px] uppercase tracking-widest font-bold"
          style={{ color: accentColor }}
        >
          Open Positions
        </span>
        <span className="text-[10px] font-mono text-gray-500">
          {positions.length}
        </span>
      </div>

      <div className="px-2 py-1.5 space-y-1 overflow-hidden">
        {positions.length === 0 ? (
          <div className="text-[10px] text-gray-600 text-center py-3">
            No open positions
          </div>
        ) : (
          positions.map((pos) => (
            <div
              key={pos.symbol}
              className="flex items-center gap-2 px-2 py-1.5 rounded"
              style={{ background: "rgba(255,255,255,0.03)" }}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span
                    className={`text-[9px] font-bold uppercase px-1 py-px rounded ${
                      pos.side.toLowerCase().includes("long") || pos.side.toLowerCase().includes("buy")
                        ? "bg-emerald-500/20 text-emerald-400"
                        : "bg-red-500/20 text-red-400"
                    }`}
                  >
                    {pos.side.slice(0, 5).toUpperCase()}
                  </span>
                  <span className="text-[11px] font-medium text-gray-200 truncate">
                    {pos.symbol}
                  </span>
                </div>
                {pos.entry > 0 && (
                  <div className="text-[9px] text-gray-500 mt-0.5 font-mono">
                    Entry: {pos.entry.toFixed(2)}
                    {pos.current > 0 && pos.current !== pos.entry && (
                      <span className="ml-2">
                        Now: {pos.current.toFixed(2)}
                      </span>
                    )}
                  </div>
                )}
              </div>
              <span
                className={`text-[11px] font-mono font-bold shrink-0 ${
                  pos.pnl >= 0 ? "text-emerald-400" : "text-red-400"
                }`}
              >
                {pos.pnl >= 0 ? "+" : ""}
                {pos.pnl.toFixed(2)}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

const definition: WidgetDefinition = {
  type: "trading-positions",
  name: "Open Positions",
  description: "Live open positions display for trading agents",
  subscribesTo: ["portfolio", "position", "trade"],
  defaultPosition: { x: 73, y: 55, width: 25, height: 40 },
  defaultZIndex: 17,
  configSchema: {
    accentColor: {
      type: "color",
      label: "Accent Color",
      default: "#8b5cf6",
    },
    maxPositions: {
      type: "number",
      label: "Max Positions",
      default: 5,
      min: 1,
      max: 15,
    },
  },
  defaultConfig: { accentColor: "#8b5cf6", maxPositions: 5 },
  render: TradingPositionsComponent,
};

registerWidget(definition);
export default definition;
