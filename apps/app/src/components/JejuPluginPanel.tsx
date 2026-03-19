/**
 * Dashboard panel for Jeju / Bazaar — wallet address and balances when the plugin is enabled.
 */

import { Button } from "@milady/ui";
import { Copy, ExternalLink, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

type JejuStatusResponse = {
  ok: boolean;
  active?: boolean;
  message?: string;
  error?: string;
  pluginLoaded?: boolean;
  address?: string;
  rpcUrl?: string;
  chainId?: number;
  explorerBase?: string;
  eth?: string;
  weth?: string;
  usdc?: string;
  balanceError?: string;
};

export function JejuPluginPanel({
  enabled,
  isActive,
}: {
  enabled: boolean;
  isActive: boolean;
}) {
  const [data, setData] = useState<JejuStatusResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/jeju/status", { credentials: "include" });
      const j = (await r.json()) as JejuStatusResponse;
      setData(j);
    } catch {
      setData({ ok: false, error: "Failed to reach Milady API" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (enabled) void load();
  }, [enabled, load]);

  if (!enabled) return null;

  return (
    <div className="mt-4 rounded-xl border border-border/40 bg-card/30 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[12px] font-bold uppercase tracking-wider text-muted">
          Jeju network
        </h3>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 gap-1.5 text-[11px]"
          disabled={loading}
          onClick={() => void load()}
        >
          <RefreshCw
            className={`size-3.5 ${loading ? "animate-spin" : ""}`}
            aria-hidden
          />
          Refresh
        </Button>
      </div>

      {data && !data.active && data.message && (
        <p className="text-[12px] text-muted leading-relaxed">{data.message}</p>
      )}

      {data?.error && (
        <p className="text-[12px] text-amber-600 dark:text-amber-400">
          {data.error}
        </p>
      )}

      {data?.active && data.address && (
        <>
          <div className="space-y-1">
            <span className="text-[10px] font-semibold uppercase text-muted/80">
              Agent wallet
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <code className="text-[11px] break-all rounded bg-black/20 px-2 py-1 font-mono">
                {data.address}
              </code>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2"
                title="Copy address"
                onClick={() => void navigator.clipboard.writeText(data.address)}
              >
                <Copy className="size-3.5" />
              </Button>
            </div>
            <p className="text-[11px] text-muted">
              Fund this address on your Jeju localnet (e.g.{" "}
              <code className="text-[10px]">jeju fund</code>).
            </p>
          </div>

          {!isActive && data.pluginLoaded === false && (
            <p className="text-[11px] text-amber-600 dark:text-amber-400">
              Restart Milady so the agent runtime loads Jeju actions
              (JEJU_STATUS, JEJU_SWAP).
            </p>
          )}

          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg bg-black/15 px-2 py-2">
              <div className="text-[9px] uppercase text-muted">ETH</div>
              <div className="text-[12px] font-mono font-semibold truncate">
                {data.balanceError ? "—" : (data.eth ?? "—")}
              </div>
            </div>
            <div className="rounded-lg bg-black/15 px-2 py-2">
              <div className="text-[9px] uppercase text-muted">WETH</div>
              <div className="text-[12px] font-mono font-semibold truncate">
                {data.balanceError ? "—" : (data.weth ?? "—")}
              </div>
            </div>
            <div className="rounded-lg bg-black/15 px-2 py-2">
              <div className="text-[9px] uppercase text-muted">USDC</div>
              <div className="text-[12px] font-mono font-semibold truncate">
                {data.balanceError ? "—" : (data.usdc ?? "—")}
              </div>
            </div>
          </div>

          {data.balanceError && (
            <p className="text-[11px] text-muted">
              RPC: {data.rpcUrl} — {data.balanceError}
            </p>
          )}

          <div className="flex flex-wrap gap-2 text-[10px] text-muted">
            <span>Chain {data.chainId}</span>
            {data.explorerBase && data.address && (
              <a
                href={`${data.explorerBase}/address/${data.address}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-accent hover:underline"
              >
                Explorer <ExternalLink className="size-3" />
              </a>
            )}
          </div>
        </>
      )}
    </div>
  );
}
