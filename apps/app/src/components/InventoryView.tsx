/**
 * Inventory view — unified wallet balances, NFTs, and scoped BSC trading.
 *
 * This is a thin coordinator that delegates rendering to sub-components
 * inside the ./inventory/ directory.
 */

import { useApp } from "@milady/app-core/state";
import { useCallback, useState } from "react";
import { TradePanel } from "./BscTradePanel";
import { CHAIN_CONFIGS, resolveChainKey } from "./chainConfig";
import {
  BSC_GAS_THRESHOLD,
  loadTrackedBscTokens,
  loadTrackedTokens,
  removeTrackedBscToken,
  saveTrackedTokens,
  type TrackedToken,
} from "./inventory";
import { InventoryToolbar } from "./inventory/InventoryToolbar";
import { NftGrid } from "./inventory/NftGrid";
import { PortfolioHeader } from "./inventory/PortfolioHeader";
import { TokensTable } from "./inventory/TokensTable";
import { useInventoryData } from "./inventory/useInventoryData";

/* ── Component ─────────────────────────────────────────────────────── */

export function InventoryView({ inModal }: { inModal?: boolean } = {}) {
  const {
    walletConfig,
    walletAddresses,
    walletBalances,
    walletNfts,
    walletLoading,
    walletNftsLoading,
    inventoryView,
    inventorySort,
    inventoryChainFocus,
    walletError,
    loadBalances,
    loadNfts,
    elizaCloudConnected,
    setTab,
    setState,
    setActionNotice,
    executeBscTrade,
    getBscTradePreflight,
    getBscTradeQuote,
    getBscTradeTxStatus,
    t,
  } = useApp();

  // ── Tracked tokens state ──────────────────────────────────────────
  const [trackedTokens, setTrackedTokens] = useState<TrackedToken[]>(() =>
    loadTrackedTokens(),
  );
  const [trackedBscTokens, setTrackedBscTokens] =
    useState(loadTrackedBscTokens);

  // ── RPC + wallet readiness ───────────────────────────────────────
  const cfg = walletConfig;
  const hasManagedBscRpc = Boolean(cfg?.managedBscRpcReady);
  const cloudManagedAccess = Boolean(
    cfg?.cloudManagedAccess || elizaCloudConnected,
  );

  const goToRpcSettings = useCallback(() => {
    setTab("settings");
    setTimeout(() => {
      document
        .getElementById("wallet-rpc")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 150);
  }, [setTab]);

  // ── Derived data (hook) ───────────────────────────────────────────
  const {
    chainFocus,
    bnbBalance,
    bscHasError,
    allNfts,
    focusedChainError,
    focusedChainName,
    focusedNativeBalance,
    focusedNativeSymbol,
    visibleRows,
    totalUsd,
    visibleChainErrors,
  } = useInventoryData({
    walletBalances,
    walletAddresses,
    walletConfig,
    walletNfts,
    inventorySort,
    inventoryChainFocus,
    trackedBscTokens,
    trackedTokens,
  });

  const evmAddr = walletAddresses?.evmAddress ?? walletConfig?.evmAddress;
  const solAddr = walletAddresses?.solanaAddress ?? walletConfig?.solanaAddress;
  const loadedEvmChainKeys = new Set(
    (walletBalances?.evm?.chains ?? [])
      .filter((chain) => !chain.error)
      .map((chain) => resolveChainKey(chain.chain))
      .filter((chainKey): chainKey is string => Boolean(chainKey)),
  );
  const evmChainErrors = new Map(
    (walletBalances?.evm?.chains ?? [])
      .map((chain) => [resolveChainKey(chain.chain), chain.error] as const)
      .filter((entry): entry is [string, string | null] => Boolean(entry[0])),
  );
  const ethereumReady = Boolean(
    evmAddr &&
      !evmChainErrors.get("ethereum") &&
      (loadedEvmChainKeys.has("ethereum") ||
        cfg?.ethereumBalanceReady ||
        cfg?.alchemyKeySet ||
        cloudManagedAccess),
  );
  const baseReady = Boolean(
    evmAddr &&
      !evmChainErrors.get("base") &&
      (loadedEvmChainKeys.has("base") ||
        cfg?.baseBalanceReady ||
        cfg?.alchemyKeySet ||
        cloudManagedAccess),
  );
  const bscReady = Boolean(
    evmAddr &&
      !evmChainErrors.get("bsc") &&
      (loadedEvmChainKeys.has("bsc") ||
        cfg?.bscBalanceReady ||
        cfg?.ankrKeySet ||
        hasManagedBscRpc),
  );
  const avaxReady = Boolean(
    evmAddr &&
      !evmChainErrors.get("avax") &&
      (loadedEvmChainKeys.has("avax") ||
        cfg?.avalancheBalanceReady ||
        cfg?.alchemyKeySet ||
        cloudManagedAccess),
  );
  const solanaReady = Boolean(
    solAddr &&
      (Boolean(walletBalances?.solana) ||
        cfg?.solanaBalanceReady ||
        cfg?.heliusKeySet ||
        cloudManagedAccess),
  );
  const tradeReady = bnbBalance >= BSC_GAS_THRESHOLD;
  const addresses = [
    evmAddr ? { label: "EVM", address: evmAddr } : null,
    solAddr ? { label: "Solana", address: solAddr } : null,
  ].filter((item): item is { label: string; address: string } => Boolean(item));

  const focusedChainLabel =
    focusedChainName ??
    (chainFocus !== "all"
      ? (CHAIN_CONFIGS[chainFocus as keyof typeof CHAIN_CONFIGS]?.name ??
        chainFocus)
      : null);
  const inlineError =
    chainFocus !== "all" && focusedChainError
      ? {
          message: `${focusedChainLabel ?? "Chain"}: ${focusedChainError}`,
          retryTitle: `Retry fetching ${focusedChainLabel ?? "chain"} balances`,
        }
      : null;

  const headerWarning =
    chainFocus === "bsc" && evmAddr && !bscReady
      ? {
          title: t("wallet.setup.rpcNotConfigured"),
          body: t("portfolioheader.ConnectViaElizaCl"),
          actionLabel: t("wallet.setup.configureRpc"),
        }
      : chainFocus === "solana" && solAddr && !solanaReady
        ? {
            title: "Solana RPC is not configured.",
            body: "Connect via Eliza Cloud or configure HELIUS_API_KEY / SOLANA_RPC_URL in Settings to load Solana balances.",
            actionLabel: t("wallet.setup.configureRpc"),
          }
        : chainFocus !== "all" &&
            chainFocus !== "bsc" &&
            chainFocus !== "solana" &&
            evmAddr &&
            !(chainFocus === "ethereum"
              ? ethereumReady
              : chainFocus === "base"
                ? baseReady
                : chainFocus === "avax"
                  ? avaxReady
                  : false)
          ? {
              title: `${focusedChainLabel ?? "Chain"} access is not configured.`,
              body: `Connect via Eliza Cloud or configure ${focusedChainLabel ?? "this chain"} RPC access in Settings to load balances.`,
              actionLabel: t("wallet.setup.configureRpc"),
            }
          : null;

  // ── Tracked token handlers ────────────────────────────────────────
  const handleAddToken = useCallback(
    (token: TrackedToken) => {
      const updated = [...trackedTokens, token];
      setTrackedTokens(updated);
      saveTrackedTokens(updated);
    },
    [trackedTokens],
  );

  const handleUntrackToken = useCallback(
    (address: string) => {
      const updated = trackedTokens.filter(
        (tk) => tk.address.toLowerCase() !== address.toLowerCase(),
      );
      setTrackedTokens(updated);
      saveTrackedTokens(updated);
      setTrackedBscTokens((prev) => removeTrackedBscToken(address, prev));
      setActionNotice(t("wallet.tokenRemovedManual"), "info", 2200);
    },
    [trackedTokens, setActionNotice, t],
  );

  // ════════════════════════════════════════════════════════════════════
  // Render
  // ════════════════════════════════════════════════════════════════════

  // ── Standalone states (no two-panel layout) ─────────────────────
  if (walletLoading && !walletBalances) {
    return (
      <div className={inModal ? "p-6 h-full overflow-y-auto" : ""}>
        <div className="text-center py-10 text-muted italic mt-6">
          {t("wallet.loadingBalances")}
        </div>
      </div>
    );
  }

  if (!evmAddr && !solAddr) {
    return (
      <div className={inModal ? "p-6 h-full overflow-y-auto" : ""}>
        <div
          className={`mt-4 border px-4 py-6 text-center ${
            inModal
              ? "border-[var(--border)] bg-[rgba(255,255,255,0.04)] backdrop-blur-sm rounded-xl"
              : "border-border bg-card"
          }`}
        >
          <div className="text-sm font-bold mb-1">
            {t("wallet.noOnchainWallet")}
          </div>
          <p className="text-xs text-muted mb-3">
            {t("wallet.noOnchainWalletHint")}
          </p>
          <button
            type="button"
            className={`px-4 py-1.5 border cursor-pointer text-xs font-mono ${
              inModal
                ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-foreground,#1a1f26)] rounded-md hover:opacity-90"
                : "border-accent bg-accent text-accent-fg hover:bg-accent-hover hover:border-accent-hover"
            }`}
            onClick={() => setTab("settings")}
          >
            {t("nav.settings")}
          </button>
        </div>
      </div>
    );
  }

  // ── Two-panel layout ───────────────────────────────────────────
  return (
    <div
      className={`two-panel-layout w-full ${inModal ? "p-6 h-full overflow-y-auto" : ""}`}
    >
      <PortfolioHeader
        totalUsd={totalUsd}
        nativeBalance={chainFocus === "all" ? null : focusedNativeBalance}
        nativeSymbol={chainFocus === "all" ? null : focusedNativeSymbol}
        addresses={addresses}
        chainFocus={chainFocus}
        onChainChange={(chain) => setState("inventoryChainFocus", chain)}
        inlineError={inlineError}
        warning={headerWarning}
        loadBalances={loadBalances}
        goToRpcSettings={goToRpcSettings}
      />

      <div className="two-panel-right">
        {walletError && (
          <div className="mt-3 px-3.5 py-2.5 border border-danger bg-[rgba(231,76,60,0.06)] text-xs text-danger">
            {walletError}
          </div>
        )}

        {chainFocus === "bsc" && evmAddr && !bscHasError && (
          <TradePanel
            tradeReady={tradeReady}
            bnbBalance={bnbBalance}
            onAddToken={handleAddToken}
            getBscTradePreflight={getBscTradePreflight}
            getBscTradeQuote={getBscTradeQuote}
            executeBscTrade={executeBscTrade}
            getBscTradeTxStatus={getBscTradeTxStatus}
          />
        )}

        <InventoryToolbar
          t={t}
          inventoryView={inventoryView}
          inventorySort={inventorySort}
          walletBalances={walletBalances}
          walletNfts={walletNfts}
          setState={setState}
          loadBalances={loadBalances}
          loadNfts={loadNfts}
        />

        {inventoryView === "tokens" ? (
          <TokensTable
            t={t}
            walletLoading={walletLoading}
            walletBalances={walletBalances}
            visibleRows={visibleRows}
            visibleChainErrors={visibleChainErrors}
            inventoryChainFocus={inventoryChainFocus ?? "all"}
            handleUntrackToken={handleUntrackToken}
          />
        ) : (
          <NftGrid
            t={t}
            walletNftsLoading={walletNftsLoading}
            walletNfts={walletNfts}
            allNfts={allNfts}
          />
        )}
      </div>
    </div>
  );
}
