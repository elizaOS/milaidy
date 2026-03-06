/**
 * Polymarket activity panel — shows the agent's prediction market
 * positions, recent trades, balances, and bet activity.
 *
 * Rendered in the chat sidebar (game-modal variant).
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
  question?: string;
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
  question?: string;
}

interface Position {
  market: string;
  asset_id: string;
  outcome: string;
  size: string;
  average_price: string;
  realized_pnl?: string;
  question?: string;
}

interface ActivityEntry {
  timestamp: number;
  data: { type: string; [key: string]: unknown };
}

interface PolymarketData {
  available: boolean;
  reason?: string;
  auth?: {
    walletAddress?: string;
    isFullyAuthenticated?: boolean;
    canTrade?: boolean;
  } | null;
  wallet?: { usdcBalance?: string; address?: string } | null;
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

function fmtUsd(val: string | undefined): string {
  if (!val) return "$0.00";
  const n = Number.parseFloat(val);
  return Number.isFinite(n) ? `$${n.toFixed(2)}` : "$0.00";
}

function fmtPrice(val: string | undefined): string {
  if (!val) return "—";
  const n = Number.parseFloat(val);
  return Number.isFinite(n) ? `${(n * 100).toFixed(1)}¢` : "—";
}

function fmtSize(val: string | undefined): string {
  if (!val) return "0";
  const n = Number.parseFloat(val);
  if (!Number.isFinite(n)) return "0";
  return n < 0.01 ? "<0.01" : n.toFixed(2);
}

function timeAgo(ts: string | number): string {
  const ms = typeof ts === "string" ? Date.parse(ts) : ts;
  if (!Number.isFinite(ms)) return "—";
  const d = Date.now() - ms;
  if (d < 60_000) return "now";
  if (d < 3_600_000) return `${Math.floor(d / 60_000)}m`;
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)}h`;
  return `${Math.floor(d / 86_400_000)}d`;
}

const POLL_MS = 15_000;

/* ── Component ─────────────────────────────────────────────────────── */

export function PolymarketActivityPanel() {
  const [data, setData] = useState<PolymarketData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const poll = useCallback(async () => {
    try {
      const res = await fetch(resolveApiUrl("/api/polymarket/activity"));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData((await res.json()) as PolymarketData);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "fetch failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void poll();
    intervalRef.current = setInterval(() => void poll(), POLL_MS);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [poll]);

  const off = !loading && (!data?.available || (error && !data));
  const balance = data?.accountState?.balances?.collateral?.balance;
  const trades = data?.accountState?.recentTrades ?? [];
  const orders = data?.accountState?.activeOrders ?? [];
  const positions = data?.accountState?.positions ?? [];
  const activities = data?.activity?.recentHistory ?? [];
  const wallet = data?.accountState?.walletAddress ?? data?.auth?.walletAddress;
  const canTrade = data?.auth?.canTrade ?? false;

  const pill = (on: boolean, label: string) => (
    <span
      className={`chat-game-sidebar-cap-pill ${on ? "is-on" : "is-off"}`}
      style={{ fontSize: 8, marginLeft: 4 }}
    >
      {label}
    </span>
  );

  return (
    <div className="chat-game-sidebar-footer" style={{ borderTop: "1px solid rgba(255,255,255,0.1)" }}>
      {/* Section label */}
      <div className="chat-game-sidebar-footer-label" style={{ display: "flex", alignItems: "center", gap: 4 }}>
        Polymarket
        {loading && pill(false, "...")}
        {!loading && off && pill(false, "offline")}
        {!loading && !off && canTrade && pill(true, "live")}
        {!loading && !off && !canTrade && pill(false, "read-only")}
      </div>

      {/* Offline message */}
      {off && (
        <div style={{ fontSize: 10, color: "rgba(219,227,246,0.5)", marginTop: 4 }}>
          {data?.reason === "service_not_registered"
            ? "Set POLYMARKET_PRIVATE_KEY to enable"
            : data?.reason === "runtime_not_ready"
              ? "Runtime starting..."
              : error ?? "Service unavailable"}
        </div>
      )}

      {/* Balance + wallet */}
      {!off && balance !== undefined && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
          <span style={{ fontSize: 10, color: "rgba(219,227,246,0.6)" }}>USDC</span>
          <span className="chat-game-sidebar-footer-value" style={{ fontSize: 11 }}>
            {fmtUsd(balance)}
          </span>
        </div>
      )}
      {!off && wallet && (
        <div className="chat-game-sidebar-footer-model" style={{ fontSize: 9, marginTop: 2 }}>
          {wallet.slice(0, 6)}...{wallet.slice(-4)}
        </div>
      )}

      {/* Positions */}
      {positions.length > 0 && (
        <div style={{ marginTop: 6 }}>
          <div className="chat-game-sidebar-footer-label">
            Positions ({positions.length})
          </div>
          {positions.slice(0, 4).map((p, i) => (
            <div
              key={`${p.asset_id}-${i}`}
              style={{
                fontSize: 10,
                padding: "3px 0",
                borderBottom: "1px solid rgba(255,255,255,0.04)",
                color: "rgba(219,227,246,0.74)",
              }}
            >
              <div style={{ lineHeight: 1.3, marginBottom: 2 }}>
                {p.question || p.outcome || p.market?.slice(0, 30) || p.asset_id?.slice(0, 12)}
              </div>
              <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: 9, color: "rgba(219,227,246,0.5)" }}>
                {fmtSize(p.size)} shares @ avg {fmtPrice(p.average_price)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Active orders */}
      {orders.length > 0 && (
        <div style={{ marginTop: 6 }}>
          <div className="chat-game-sidebar-footer-label">
            Orders ({orders.length})
          </div>
          {orders.slice(0, 3).map((o) => (
            <div
              key={o.id}
              style={{
                fontSize: 10,
                padding: "3px 0",
                borderBottom: "1px solid rgba(255,255,255,0.04)",
                color: "rgba(219,227,246,0.74)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 4, lineHeight: 1.3, marginBottom: 2 }}>
                <span style={{
                  fontSize: 8, fontWeight: 700, padding: "1px 3px", borderRadius: 2, flexShrink: 0,
                  background: o.side === "BUY" ? "rgba(16,185,129,0.2)" : "rgba(239,68,68,0.2)",
                  color: o.side === "BUY" ? "#34d399" : "#f87171",
                }}>
                  {o.side}
                </span>
                <span>{o.question || o.outcome || o.market?.slice(0, 30)}</span>
              </div>
              <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: 9, color: "rgba(219,227,246,0.5)" }}>
                {fmtSize(o.size)} @ {fmtPrice(o.price)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Recent trades */}
      {trades.length > 0 && (
        <div style={{ marginTop: 6 }}>
          <div className="chat-game-sidebar-footer-label">
            Recent Trades ({trades.length})
          </div>
          {trades.slice(0, 5).map((t) => (
            <div
              key={t.id}
              style={{
                fontSize: 10,
                padding: "3px 0",
                borderBottom: "1px solid rgba(255,255,255,0.04)",
                color: "rgba(219,227,246,0.74)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 4, lineHeight: 1.3, marginBottom: 2 }}>
                <span style={{
                  fontSize: 8, fontWeight: 700, padding: "1px 3px", borderRadius: 2, flexShrink: 0,
                  background: t.side === "BUY" ? "rgba(16,185,129,0.2)" : "rgba(239,68,68,0.2)",
                  color: t.side === "BUY" ? "#34d399" : "#f87171",
                }}>
                  {t.side}
                </span>
                <span>{t.question || t.outcome || t.market?.slice(0, 30)}</span>
              </div>
              <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: 9, color: "rgba(219,227,246,0.5)", display: "flex", justifyContent: "space-between" }}>
                <span>{fmtSize(t.size)} @ {fmtPrice(t.price)}</span>
                <span>{timeAgo(t.match_time)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Activity fallback */}
      {activities.length > 0 && trades.length === 0 && orders.length === 0 && (
        <div style={{ marginTop: 6 }}>
          <div className="chat-game-sidebar-footer-label">Activity</div>
          {activities.slice(0, 3).map((a, i) => (
            <div
              key={`${a.timestamp}-${i}`}
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 10,
                padding: "2px 0",
                color: "rgba(219,227,246,0.6)",
              }}
            >
              <span>{a.data.type}</span>
              <span>{timeAgo(a.timestamp)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!off && trades.length === 0 && orders.length === 0 && positions.length === 0 && activities.length === 0 && (
        <div style={{ fontSize: 10, color: "rgba(219,227,246,0.4)", marginTop: 4 }}>
          No bets yet
        </div>
      )}
    </div>
  );
}
