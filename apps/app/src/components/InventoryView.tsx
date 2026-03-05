/**
 * Inventory view — BSC-first wallet balances, NFTs, and BSC trading.
 * Terminal-style layout inspired by GMGN / degen trading tools.
 *
 * This is a thin coordinator that delegates rendering to sub-components
 * inside the ./inventory/ directory.
 */

import { useCallback, useMemo, useState } from "react";
import { useApp } from "../AppContext";
import { createTranslator } from "../i18n";
import { BscTradePanel, type TrackedToken } from "./BscTradePanel";
import {
  BSC_GAS_THRESHOLD,
  loadTrackedBscTokens,
  loadTrackedTokens,
  removeTrackedBscToken,
  saveTrackedTokens,
} from "./inventory";
import { InventoryToolbar } from "./inventory/InventoryToolbar";
import { NftGrid } from "./inventory/NftGrid";
import { PortfolioHeader } from "./inventory/PortfolioHeader";
import { TokensTable } from "./inventory/TokensTable";
import { useInventoryData } from "./inventory/useInventoryData";

const BSC_GAS_READY_THRESHOLD = 0.005;

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
    cloudConnected,
    setTab,
    setState,
    setActionNotice,
    copyToClipboard,
    executeBscTrade,
    getBscTradePreflight,
    getBscTradeQuote,
    getBscTradeTxStatus,
    uiLanguage,
  } = useApp();
  const t = useMemo(() => createTranslator(uiLanguage), [uiLanguage]);

  // ── Tracked tokens state ──────────────────────────────────────────
  const [trackedTokens, setTrackedTokens] = useState<TrackedToken[]>(() =>
    loadTrackedTokens(),
  );
  const [trackedBscTokens, setTrackedBscTokens] =
    useState(loadTrackedBscTokens);

  // ── Setup detection ───────────────────────────────────────────────
  const cfg = walletConfig;
  const hasManagedBscRpc = Boolean(cfg?.managedBscRpcReady);
  const hasLegacyEvmProviders = Boolean(
    cfg?.alchemyKeySet || cfg?.ankrKeySet || cfg?.infuraKeySet,
  );
  const hasWalletIdentity = Boolean(
    cloudConnected ||
      walletAddresses?.evmAddress ||
      walletAddresses?.solanaAddress ||
      walletConfig?.evmAddress ||
      walletConfig?.solanaAddress,
  );
  const needsSetup =
    !hasWalletIdentity && !hasManagedBscRpc && !hasLegacyEvmProviders;

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
    visibleRows,
    totalUsd,
    visibleChainErrors,
    bscChainError,
    bscNativeBalance,
    bscChain,
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

  const bscNativeBalanceNum = Number.parseFloat(bscNativeBalance ?? "");
  const evmAddr = walletAddresses?.evmAddress ?? walletConfig?.evmAddress;
  const solAddr = walletAddresses?.solanaAddress ?? walletConfig?.solanaAddress;
  const walletReady = Boolean(evmAddr);
  const rpcReady = Boolean(walletReady && bscChain && !bscChain.error);
  const gasReady =
    Boolean(rpcReady) &&
    Number.isFinite(bscNativeBalanceNum) &&
    bscNativeBalanceNum >= BSC_GAS_READY_THRESHOLD;
  const tradeReady = bnbBalance >= BSC_GAS_THRESHOLD;

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

  return (
    <div
      className={`wallets-bsc ${inModal ? "p-6 h-full overflow-y-auto" : ""}`}
    >
      {walletError && (
        <div className="mt-3 px-3.5 py-2.5 border border-danger bg-[rgba(231,76,60,0.06)] text-xs text-danger">
          {walletError}
        </div>
      )}
      {needsSetup ? renderSetup() : renderContent()}
    </div>
  );

  /* ── Setup prompt ────────────────────────────────────────────────── */

  function renderSetup() {
    return (
      <div
        className={`wallets-bsc__setup mt-6 border p-6 text-center ${
          inModal
            ? "border-[var(--border)] bg-[rgba(255,255,255,0.04)] backdrop-blur-sm rounded-xl"
            : "border-border bg-card"
        }`}
      >
        <div className="text-sm font-bold mb-2">
          {t("wallet.setup.rpcNotConfigured")}
        </div>
        <p className="text-xs text-muted mb-4 leading-relaxed max-w-md mx-auto">
          To view balances and trade on BSC you need RPC provider keys. Connect
          to <strong>Eliza Cloud</strong> for managed RPC access, or configure{" "}
          <strong>NodeReal / QuickNode</strong> endpoints manually in{" "}
          <strong>Settings</strong>.
        </p>
        <button
          type="button"
          className={`px-4 py-1.5 border cursor-pointer text-xs font-mono ${
            inModal
              ? "border-[var(--accent)] bg-[var(--accent)] text-white rounded-md hover:opacity-90"
              : "border-accent bg-accent text-accent-fg hover:bg-accent-hover hover:border-accent-hover"
          }`}
          onClick={goToRpcSettings}
        >
          Configure RPC
        </button>
      </div>
    );
  }

  /* ── Main content ────────────────────────────────────────────────── */

  function renderContent() {
    if (walletLoading && !walletBalances) {
      return (
        <div className="text-center py-10 text-muted italic mt-6">
          {t("wallet.loadingBalances")}
        </div>
      );
    }

    if (!evmAddr && !solAddr) {
      return (
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
                ? "border-[var(--accent)] bg-[var(--accent)] text-white rounded-md hover:opacity-90"
                : "border-accent bg-accent text-accent-fg hover:bg-accent-hover hover:border-accent-hover"
            }`}
            onClick={() => setTab("settings")}
          >
            {t("common.settings")}
          </button>
        </div>
      );
    }

    return (
      <div className="space-y-2 mt-3">
        <PortfolioHeader
          t={t}
          totalUsd={totalUsd}
          bscNativeBalance={bscNativeBalance}
          evmAddr={evmAddr ?? null}
          walletReady={walletReady}
          rpcReady={rpcReady}
          gasReady={gasReady}
          bscChainError={bscChainError}
          hasManagedBscRpc={hasManagedBscRpc}
          copyToClipboard={copyToClipboard}
          setActionNotice={setActionNotice}
          loadBalances={loadBalances}
          goToRpcSettings={goToRpcSettings}
        />

        {chainFocus === "bsc" && !bscHasError && (
          <BscTradePanel
            tradeReady={tradeReady}
            bnbBalance={bnbBalance}
            trackedTokens={trackedTokens}
            onAddToken={handleAddToken}
            copyToClipboard={copyToClipboard}
            setActionNotice={setActionNotice}
            getBscTradePreflight={getBscTradePreflight}
            getBscTradeQuote={getBscTradeQuote}
            executeBscTrade={executeBscTrade}
            getBscTradeTxStatus={getBscTradeTxStatus}
          />
        )}

        <div>
          <InventoryToolbar
            t={t}
            inventoryView={inventoryView}
            inventorySort={inventorySort}
            inventoryChainFocus={inventoryChainFocus ?? "all"}
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
}
