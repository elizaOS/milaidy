/**
 * Polymarket activity panel — shows the agent's prediction market
 * positions, recent trades, balances, and bet activity.
 *
 * Polls GET /api/polymarket/activity every 15s.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { resolveApiUrl } from "../asset-url";

/* ── Types ─────────────────────────────────────────────────────────── */

interface Trade {
  id: string;
  market: string;
  asset_id: string;
  side: "BUY" | "SELL";
  size: string;
  price: string;
  status: string;
  match_time: string;
  outcome: string;
  transaction_hash?: string;
}

interface Order {
  id: string;
  market: string;
  asset_id: string;
  side: string;
  size: string;
  price: string;
  status: string;
  outcome?: string;
}

interface Position {
  market: string;
  asset_id: string;
  outcome: string;
  size: string;
  avgPrice: string;
  currentValue?: string;
}

interface ActivityEntry {
  timestamp: number;
  data: {
    type: string;
    [key: string]: unknown;
  };
}

interface PolymarketData {
  available: boolean;
  reason?: string;
  auth?: {
    walletAddress?: string;
    isFullyAuthenticated?: boolean;
    canTrade?: boolean;
  } | null;
  wallet?: {
    usdcBalance?: string;
    address?: string;
  } | null;
  accountState?: {
    walletAddress?: string;
    balances?: {
      collateral?: { balance: string; allowance: string } | null;
    };
    activeOrders: Order[];
    recentTrades: Trade[];
    positions: Position[];
    lastUpdatedAt?: number;
  } | null;
  activity?: {
    recentHistory: ActivityEntry[];
    lastUpdatedAt?: number;
  } | null;
}

/* ── Helpers ────────────────────────────────────────────────────────── */

function formatUsd(val: string | undefined): string {
  if (!val) return "$0.00";
  const n = Number.parseFloat(val);
  if (!Number.isFinite(n)) return "$0.00";
  return `$${n.toFixed(2)}`;
}

function formatPrice(val: string | undefined): string {
  if (!val) return "—";
  const n = Number.parseFloat(val);
  if (!Number.isFinite(n)) return "—";
  return `${(n * 100).toFixed(1)}¢`;
}

function formatSize(val: string | undefined): string {
  if (!val) return "0";
  const n = Number.parseFloat(val);
  if (!Number.isFinite(n)) return "0";
  if (n < 0.01) return "<0.01";
  return n.toFixed(2);
}

function timeAgo(ts: string | number): string {
  const ms = typeof ts === "string" ? Date.parse(ts) : ts;
  if (!Number.isFinite(ms)) return "—";
  const diff = Date.now() - ms;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function truncateHash(hash?: string): string {
  if (!hash) return "";
  return `${hash.slice(0, 6)}...${hash.slice(-4)}`;
}

const POLL_INTERVAL = 15_000;

/* ── Component ─────────────────────────────────────────────────────── */

export function PolymarketActivityPanel() {
  const [data, setData] = useState<PolymarketData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchActivity = useCallback(async () => {
    try {
      const url = resolveApiUrl("/api/polymarket/activity");
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as PolymarketData;
      setData(json);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "fetch failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchActivity();
    intervalRef.current = setInterval(() => void fetchActivity(), POLL_INTERVAL);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchActivity]);

  const isUnavailable = !loading && (!data?.available || (error && !data));
  const balance = data?.accountState?.balances?.collateral?.balance;
  const trades = data?.accountState?.recentTrades ?? [];
  const orders = data?.accountState?.activeOrders ?? [];
  const positions = data?.accountState?.positions ?? [];
  const activities = data?.activity?.recentHistory ?? [];
  const walletAddr = data?.accountState?.walletAddress ?? data?.auth?.walletAddress;
  const canTrade = data?.auth?.canTrade ?? false;
  const lastUpdated = data?.accountState?.lastUpdatedAt;

  const badgeCls =
    "inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded";

  return (
    <div className="mt-4 p-4 border border-[var(--border)] bg-[var(--card)]">
      {/* Header */}
      <button
        type="button"
        className="w-full flex items-center justify-between text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm">Polymarket Activity</span>
          {loading && (
            <span className="text-[10px] text-[var(--muted)]">loading...</span>
          )}
          {!loading && isUnavailable && (
            <span
              className={`${badgeCls} bg-zinc-500/20 text-zinc-400`}
            >
              offline
            </span>
          )}
          {!loading && !isUnavailable && canTrade && (
            <span
              className={`${badgeCls} bg-emerald-500/20 text-emerald-400`}
            >
              live
            </span>
          )}
          {!loading && !isUnavailable && !canTrade && (
            <span
              className={`${badgeCls} bg-yellow-500/20 text-yellow-400`}
            >
              read-only
            </span>
          )}
        </div>
        <span className="text-[var(--muted)] text-xs">
          {expanded ? "▾" : "▸"}
        </span>
      </button>

      {expanded && (
        <div className="mt-3 space-y-3">
          {/* Unavailable state */}
          {isUnavailable && (
            <div className="text-xs text-[var(--muted)] text-center py-2">
              {data?.reason === "service_not_registered"
                ? "Polymarket plugin not active. Configure POLYMARKET_PRIVATE_KEY to enable."
                : data?.reason === "runtime_not_ready"
                  ? "Agent runtime starting up..."
                  : error
                    ? `Connection error: ${error}`
                    : "Polymarket service unavailable."}
            </div>
          )}

          {/* Balance row */}
          {!isUnavailable && balance !== undefined && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-[var(--muted)]">USDC Balance</span>
              <span className="font-mono font-semibold">
                {formatUsd(balance)}
              </span>
            </div>
          )}

          {!isUnavailable && walletAddr && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-[var(--muted)]">Wallet</span>
              <span className="font-mono text-[11px] text-[var(--muted)]">
                {walletAddr.slice(0, 6)}...{walletAddr.slice(-4)}
              </span>
            </div>
          )}

          {/* Active Orders */}
          {orders.length > 0 && (
            <div>
              <div className="text-[11px] font-semibold text-[var(--muted)] uppercase tracking-wide mb-1">
                Active Orders ({orders.length})
              </div>
              <div className="space-y-1">
                {orders.slice(0, 5).map((o) => (
                  <div
                    key={o.id}
                    className="flex items-center justify-between text-xs py-1 px-2 bg-[rgba(255,255,255,0.03)] rounded"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`${badgeCls} ${o.side === "BUY" ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"}`}
                      >
                        {o.side}
                      </span>
                      <span className="truncate max-w-[180px]">
                        {o.outcome || o.market?.slice(0, 20) || o.asset_id?.slice(0, 12)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 font-mono">
                      <span>{formatSize(o.size)} @ {formatPrice(o.price)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Positions */}
          {positions.length > 0 && (
            <div>
              <div className="text-[11px] font-semibold text-[var(--muted)] uppercase tracking-wide mb-1">
                Positions ({positions.length})
              </div>
              <div className="space-y-1">
                {positions.slice(0, 8).map((p, i) => (
                  <div
                    key={`${p.asset_id}-${i}`}
                    className="flex items-center justify-between text-xs py-1 px-2 bg-[rgba(255,255,255,0.03)] rounded"
                  >
                    <span className="truncate max-w-[200px]">
                      {p.outcome || p.market?.slice(0, 20) || p.asset_id?.slice(0, 12)}
                    </span>
                    <div className="flex items-center gap-2 font-mono text-[11px]">
                      <span>{formatSize(p.size)} shares</span>
                      <span className="text-[var(--muted)]">
                        avg {formatPrice(p.avgPrice)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent Trades */}
          {trades.length > 0 && (
            <div>
              <div className="text-[11px] font-semibold text-[var(--muted)] uppercase tracking-wide mb-1">
                Recent Trades ({trades.length})
              </div>
              <div className="space-y-1">
                {trades.slice(0, 10).map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center justify-between text-xs py-1 px-2 bg-[rgba(255,255,255,0.03)] rounded"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`${badgeCls} ${t.side === "BUY" ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"}`}
                      >
                        {t.side}
                      </span>
                      <span className="truncate max-w-[160px]">
                        {t.outcome || t.market?.slice(0, 20) || t.asset_id?.slice(0, 12)}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 font-mono text-[11px]">
                      <span>
                        {formatSize(t.size)} @ {formatPrice(t.price)}
                      </span>
                      <span className="text-[var(--muted)]">
                        {timeAgo(t.match_time)}
                      </span>
                      {t.transaction_hash && (
                        <a
                          href={`https://polygonscan.com/tx/${t.transaction_hash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[var(--accent)] hover:underline"
                        >
                          {truncateHash(t.transaction_hash)}
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Activity Log */}
          {activities.length > 0 && trades.length === 0 && orders.length === 0 && (
            <div>
              <div className="text-[11px] font-semibold text-[var(--muted)] uppercase tracking-wide mb-1">
                Activity Log
              </div>
              <div className="space-y-1">
                {activities.slice(0, 5).map((a, i) => (
                  <div
                    key={`${a.timestamp}-${i}`}
                    className="flex items-center justify-between text-xs py-1 px-2 bg-[rgba(255,255,255,0.03)] rounded"
                  >
                    <span>{a.data.type}</span>
                    <span className="text-[var(--muted)]">
                      {timeAgo(a.timestamp)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Empty state — service is up but no data yet */}
          {!isUnavailable &&
            trades.length === 0 &&
            orders.length === 0 &&
            positions.length === 0 &&
            activities.length === 0 && (
              <div className="text-xs text-[var(--muted)] text-center py-2">
                No betting activity yet. Ask the agent to place a bet!
              </div>
            )}

          {/* Footer */}
          {lastUpdated && (
            <div className="text-[10px] text-[var(--muted)] text-right">
              updated {timeAgo(lastUpdated)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
