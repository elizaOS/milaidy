import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  BscTradeTxStatusResponse,
  WalletTradingProfileResponse,
  WalletTradingProfileSourceFilter,
  WalletTradingProfileWindow,
} from "../../api-client";
import {
  getRecentTradeGroupKey,
  getWalletTxStatusLabel,
  loadRecentTrades,
  MAX_WALLET_RECENT_TRADES,
  mapWalletTradeError,
  persistRecentTrades,
  type TranslatorFn,
  type WalletRecentFilter,
  type WalletRecentTrade,
} from "./walletUtils";

export type UseWalletTradeHistoryArgs = {
  walletPanelOpen: boolean;
  getBscTradeTxStatus: (hash: string) => Promise<BscTradeTxStatusResponse>;
  loadWalletTradingProfile: (
    window?: WalletTradingProfileWindow,
    source?: WalletTradingProfileSourceFilter,
  ) => Promise<WalletTradingProfileResponse>;
  setActionNotice: (
    text: string,
    tone?: "info" | "success" | "error",
    ttlMs?: number,
  ) => void;
  t: TranslatorFn;
};

export function useWalletTradeHistory(args: UseWalletTradeHistoryArgs) {
  const {
    walletPanelOpen,
    getBscTradeTxStatus,
    loadWalletTradingProfile,
    setActionNotice,
    t,
  } = args;

  // ---- Recent trades state ----

  const [walletRecentTrades, setWalletRecentTrades] = useState<
    WalletRecentTrade[]
  >(() => loadRecentTrades());
  const [walletRecentFilter, setWalletRecentFilter] =
    useState<WalletRecentFilter>("all");
  const [walletRecentExpanded, setWalletRecentExpanded] = useState(false);
  const [walletRecentBusyHashes, setWalletRecentBusyHashes] = useState<
    Record<string, boolean>
  >({});

  // ---- Callbacks ----

  const addRecentTrade = useCallback((trade: WalletRecentTrade) => {
    setWalletRecentTrades((prev) => {
      const next = [
        trade,
        ...prev.filter((entry) => entry.hash !== trade.hash),
      ].slice(0, MAX_WALLET_RECENT_TRADES);
      persistRecentTrades(next);
      return next;
    });
  }, []);

  const refreshRecentTradeStatus = useCallback(
    async (hash: string, silent = false) => {
      if (!hash) return;
      setWalletRecentBusyHashes((prev) => ({ ...prev, [hash]: true }));
      try {
        const status = await getBscTradeTxStatus(hash);
        setWalletRecentTrades((prev) => {
          let changed = false;
          const next = prev.map((entry) => {
            if (entry.hash !== hash) return entry;
            const nextReason = status.reason ?? null;
            const nextExplorer = status.explorerUrl || entry.explorerUrl;
            const unchanged =
              entry.status === status.status &&
              entry.confirmations === status.confirmations &&
              entry.nonce === status.nonce &&
              entry.reason === nextReason &&
              entry.explorerUrl === nextExplorer;
            if (unchanged) return entry;
            changed = true;
            return {
              ...entry,
              status: status.status,
              confirmations: status.confirmations,
              nonce: status.nonce,
              reason: nextReason,
              explorerUrl: nextExplorer,
            };
          });
          if (!changed) return prev;
          persistRecentTrades(next);
          return next;
        });
        if (!silent && status.status !== "pending") {
          setActionNotice(
            getWalletTxStatusLabel(status.status, t),
            status.status === "success" ? "success" : "info",
            2200,
          );
        }
      } catch (err) {
        if (!silent) {
          setActionNotice(
            mapWalletTradeError(err, t, "wallet.txStatusFetchFailed"),
            "error",
            3000,
          );
        }
      } finally {
        setWalletRecentBusyHashes((prev) => {
          const next = { ...prev };
          delete next[hash];
          return next;
        });
      }
    },
    [getBscTradeTxStatus, setActionNotice, t],
  );

  // ---- Derived values ----

  const pendingRecentHashes = useMemo(
    () =>
      walletRecentTrades
        .filter((entry) => entry.status === "pending")
        .map((entry) => entry.hash),
    [walletRecentTrades],
  );

  const walletRecentFilterOptions = useMemo(
    () => [
      { key: "all" as const, label: t("wallet.recentFilterAll") },
      {
        key: "pending" as const,
        label: getWalletTxStatusLabel("pending", t),
      },
      {
        key: "success" as const,
        label: getWalletTxStatusLabel("success", t),
      },
      {
        key: "reverted" as const,
        label: getWalletTxStatusLabel("reverted", t),
      },
      {
        key: "not_found" as const,
        label: getWalletTxStatusLabel("not_found", t),
      },
    ],
    [t],
  );

  const filteredWalletRecentTrades = useMemo(() => {
    if (walletRecentFilter === "all") return walletRecentTrades;
    return walletRecentTrades.filter(
      (entry) => entry.status === walletRecentFilter,
    );
  }, [walletRecentFilter, walletRecentTrades]);

  const visibleWalletRecentTrades = useMemo(
    () => filteredWalletRecentTrades.slice(0, 8),
    [filteredWalletRecentTrades],
  );

  const groupedWalletRecentTrades = useMemo(() => {
    const grouped: Record<
      "today" | "yesterday" | "earlier",
      WalletRecentTrade[]
    > = {
      today: [],
      yesterday: [],
      earlier: [],
    };
    for (const entry of visibleWalletRecentTrades) {
      grouped[getRecentTradeGroupKey(entry.createdAt)].push(entry);
    }
    return [
      {
        key: "today",
        label: t("wallet.recentGroup.today"),
        entries: grouped.today,
      },
      {
        key: "yesterday",
        label: t("wallet.recentGroup.yesterday"),
        entries: grouped.yesterday,
      },
      {
        key: "earlier",
        label: t("wallet.recentGroup.earlier"),
        entries: grouped.earlier,
      },
    ].filter((group) => group.entries.length > 0);
  }, [t, visibleWalletRecentTrades]);

  // ---- Ledger sync effect ----

  const [ledgerSynced, setLedgerSynced] = useState(false);
  useEffect(() => {
    if (!walletPanelOpen || ledgerSynced) return;
    let cancelled = false;
    void (async () => {
      try {
        const profile = await loadWalletTradingProfile("all", "all");
        if (cancelled || !profile?.recentSwaps?.length) return;
        setWalletRecentTrades((prev) => {
          const existingHashes = new Set(prev.map((e) => e.hash));
          const newEntries: WalletRecentTrade[] = [];
          for (const swap of profile.recentSwaps) {
            if (existingHashes.has(swap.hash)) continue;
            newEntries.push({
              hash: swap.hash,
              side: swap.side,
              tokenAddress: swap.tokenAddress,
              amount: swap.inputAmount,
              inputSymbol: swap.inputSymbol,
              outputSymbol: swap.outputSymbol,
              createdAt: new Date(swap.createdAt).getTime() || Date.now(),
              status: swap.status,
              confirmations: swap.confirmations,
              nonce: null,
              reason: swap.reason ?? null,
              explorerUrl: swap.explorerUrl,
            });
          }
          if (newEntries.length === 0) return prev;
          const merged = [...newEntries, ...prev]
            .sort((a, b) => b.createdAt - a.createdAt)
            .slice(0, MAX_WALLET_RECENT_TRADES);
          persistRecentTrades(merged);
          return merged;
        });
      } catch {
        // Best effort -- don't block wallet UX.
      } finally {
        if (!cancelled) setLedgerSynced(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [walletPanelOpen, ledgerSynced, loadWalletTradingProfile]);

  return {
    walletRecentTrades,
    walletRecentFilter,
    setWalletRecentFilter,
    walletRecentExpanded,
    setWalletRecentExpanded,
    walletRecentBusyHashes,
    walletRecentFilterOptions,
    visibleWalletRecentTrades,
    groupedWalletRecentTrades,
    pendingRecentHashes,
    addRecentTrade,
    refreshRecentTradeStatus,
  };
}
