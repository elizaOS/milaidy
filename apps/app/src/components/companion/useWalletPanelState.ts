import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  BscTradeExecuteRequest,
  BscTradeExecuteResponse,
  BscTradePreflightResponse,
  BscTradeQuoteRequest,
  BscTradeQuoteResponse,
  BscTradeTxStatusResponse,
  BscTransferExecuteRequest,
  BscTransferExecuteResponse,
  WalletAddresses,
  WalletBalancesResponse,
  WalletNftsResponse,
  WalletTradingProfileResponse,
  WalletTradingProfileSourceFilter,
  WalletTradingProfileWindow,
} from "../../api-client";
import { useWalletPortfolio } from "./useWalletPortfolio";
import { useWalletSendState } from "./useWalletSendState";
import { useWalletSwapState } from "./useWalletSwapState";
import { useWalletTradeHistory } from "./useWalletTradeHistory";
import {
  BSC_GAS_READY_THRESHOLD,
  isBscChainName,
  type TranslatorFn,
} from "./walletUtils";

export type WalletPanelProps = {
  copyToClipboard: (text: string) => Promise<void>;
  setActionNotice: (
    text: string,
    tone?: "info" | "success" | "error",
    ttlMs?: number,
  ) => void;
  walletAddresses: WalletAddresses | null;
  walletBalances: WalletBalancesResponse | null;
  walletNfts: WalletNftsResponse | null;
  walletLoading: boolean;
  walletNftsLoading: boolean;
  walletError: string | null;
  loadBalances: () => Promise<void>;
  loadNfts: () => Promise<void>;
  getBscTradePreflight: (
    tokenAddress?: string,
  ) => Promise<BscTradePreflightResponse>;
  getBscTradeQuote: (
    request: BscTradeQuoteRequest,
  ) => Promise<BscTradeQuoteResponse>;
  getBscTradeTxStatus: (hash: string) => Promise<BscTradeTxStatusResponse>;
  loadWalletTradingProfile: (
    window?: WalletTradingProfileWindow,
    source?: WalletTradingProfileSourceFilter,
  ) => Promise<WalletTradingProfileResponse>;
  executeBscTrade: (
    request: BscTradeExecuteRequest,
  ) => Promise<BscTradeExecuteResponse>;
  executeBscTransfer: (
    request: BscTransferExecuteRequest,
  ) => Promise<BscTransferExecuteResponse>;
  t: TranslatorFn;
};

export function useWalletPanelState(props: WalletPanelProps) {
  const {
    copyToClipboard,
    setActionNotice,
    walletAddresses,
    walletBalances,
    walletNfts,
    walletLoading,
    walletNftsLoading,
    walletError,
    loadBalances,
    loadNfts,
    getBscTradePreflight,
    getBscTradeQuote,
    getBscTradeTxStatus,
    loadWalletTradingProfile,
    executeBscTrade,
    executeBscTransfer,
    t,
  } = props;

  // ---- Derived addresses ----

  const evmShort = walletAddresses?.evmAddress
    ? `${walletAddresses.evmAddress.slice(0, 4)}...${walletAddresses.evmAddress.slice(-4)}`
    : null;
  const solShort = walletAddresses?.solanaAddress
    ? `${walletAddresses.solanaAddress.slice(0, 4)}...${walletAddresses.solanaAddress.slice(-4)}`
    : null;
  const evmAddress = walletAddresses?.evmAddress ?? null;
  const solAddress = walletAddresses?.solanaAddress ?? null;

  // ---- Panel UI state ----

  const [walletPanelOpen, setWalletPanelOpen] = useState(false);
  const [walletActionMode, setWalletActionMode] = useState<
    "send" | "swap" | "receive"
  >("receive");
  const [walletPortfolioTab, setWalletPortfolioTab] = useState<
    "tokens" | "collectibles"
  >("tokens");
  const [walletPortfolioChain, setWalletPortfolioChain] = useState<
    "all" | "bsc" | "evm" | "solana"
  >("all");
  const [walletSelectedTokenKey, setWalletSelectedTokenKey] = useState<
    string | null
  >(null);
  const [walletTokenDetailsOpen, setWalletTokenDetailsOpen] = useState(false);

  const walletPanelRef = useRef<HTMLDivElement | null>(null);
  const recentTxRefreshAtRef = useRef<Record<string, number>>({});

  // ---- BSC chain derived values ----

  const bscChain = useMemo(() => {
    return (
      (walletBalances?.evm?.chains ?? []).find((chain) =>
        isBscChainName(chain.chain),
      ) ?? null
    );
  }, [walletBalances]);
  const bscChainError = bscChain?.error ?? null;
  const bscNativeBalance = bscChain?.nativeBalance ?? null;
  const bscNativeBalanceNum = Number.parseFloat(bscNativeBalance ?? "");
  const walletReady = Boolean(evmAddress);
  const rpcReady = Boolean(walletReady && bscChain && !bscChain.error);
  const gasReady =
    Boolean(rpcReady) &&
    Number.isFinite(bscNativeBalanceNum) &&
    bscNativeBalanceNum >= BSC_GAS_READY_THRESHOLD;

  // ---- Portfolio sub-hook ----

  const portfolio = useWalletPortfolio({
    walletBalances,
    walletNfts,
    walletPortfolioChain,
    walletSelectedTokenKey,
    walletPanelOpen,
    walletReady,
    t,
  });

  // ---- Trade history sub-hook ----

  const tradeHistory = useWalletTradeHistory({
    walletPanelOpen,
    getBscTradeTxStatus,
    loadWalletTradingProfile,
    setActionNotice,
    t,
  });

  // ---- Swap sub-hook ----

  const swap = useWalletSwapState({
    bscChain,
    bscNativeBalanceNum,
    addRecentTrade: tradeHistory.addRecentTrade,
    refreshRecentTradeStatus: tradeHistory.refreshRecentTradeStatus,
    recentTxRefreshAtRef,
    loadBalances,
    getBscTradePreflight,
    getBscTradeQuote,
    executeBscTrade,
    setActionNotice,
    t,
  });

  // ---- Send sub-hook ----

  const send = useWalletSendState({
    evmAddress,
    bscChain,
    loadBalances,
    executeBscTransfer,
    setActionNotice,
    t,
  });

  const walletRefreshBusy =
    walletLoading ||
    (walletPortfolioTab === "collectibles" && walletNftsLoading);

  // ---- Cross-cutting callbacks ----

  const handleCopyUserSignPayload = useCallback(
    async (payload: string) => {
      await copyToClipboard(payload);
      setActionNotice(t("wallet.payloadCopied"), "success", 2400);
    },
    [copyToClipboard, setActionNotice, t],
  );

  const handleCopySelectedTokenAddress = useCallback(async () => {
    if (!portfolio.selectedWalletToken?.assetAddress) {
      setActionNotice(t("wallet.tokenAddressUnavailable"), "info", 2200);
      return;
    }
    await copyToClipboard(portfolio.selectedWalletToken.assetAddress);
    setActionNotice(t("wallet.addressCopied"), "success", 2200);
  }, [copyToClipboard, portfolio.selectedWalletToken, setActionNotice, t]);

  const handleCopyRecentTxHash = useCallback(
    async (hash: string) => {
      await copyToClipboard(hash);
      setActionNotice(t("wallet.txHashCopied"), "success", 2200);
    },
    [copyToClipboard, setActionNotice, t],
  );

  const handleSelectedTokenSwap = useCallback(() => {
    if (!portfolio.selectedWalletToken) return;
    if (portfolio.selectedWalletToken.chainKey !== "bsc") {
      setActionNotice(t("wallet.tokenOpenWalletForSwap"), "info", 2600);
      return;
    }
    setWalletActionMode("swap");
    if (
      !portfolio.selectedWalletToken.isNative &&
      portfolio.selectedWalletToken.assetAddress
    ) {
      swap.setSwapTokenAddress(portfolio.selectedWalletToken.assetAddress);
      swap.setSwapSide("sell");
      return;
    }
    swap.setSwapSide("buy");
    setActionNotice(t("wallet.pasteContractToBuy"), "info", 2600);
  }, [portfolio.selectedWalletToken, setActionNotice, swap, t]);

  const handleSelectedTokenSend = useCallback(() => {
    if (!portfolio.selectedWalletToken) return;
    setWalletActionMode("send");
    if (
      portfolio.selectedWalletToken.symbol === "BNB" ||
      portfolio.selectedWalletToken.symbol === "USDT" ||
      portfolio.selectedWalletToken.symbol === "USDC"
    ) {
      send.setSendAsset(portfolio.selectedWalletToken.symbol);
    } else {
      setActionNotice(t("wallet.tokenUnsupportedSendAsset"), "info", 2600);
    }
  }, [portfolio.selectedWalletToken, setActionNotice, send, t]);

  // ---- Effects ----

  useEffect(() => {
    swap.resetSwapFlow();
  }, [swap.resetSwapFlow]);

  useEffect(() => {
    send.resetSendFlow();
  }, [send.resetSendFlow]);

  useEffect(() => {
    if (!walletPanelOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!walletPanelRef.current?.contains(event.target as Node)) {
        setWalletPanelOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setWalletPanelOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [walletPanelOpen]);

  useEffect(() => {
    if (!walletPanelOpen) return;
    if (walletLoading || walletBalances) return;
    void loadBalances();
  }, [walletPanelOpen, walletLoading, walletBalances, loadBalances]);

  useEffect(() => {
    if (!walletPanelOpen) return;
    if (walletPortfolioTab !== "collectibles") return;
    if (walletNftsLoading || walletNfts) return;
    void loadNfts();
  }, [
    walletPanelOpen,
    walletPortfolioTab,
    walletNftsLoading,
    walletNfts,
    loadNfts,
  ]);

  useEffect(() => {
    if (walletPortfolioChain === "all") return;
    const stillAvailable = portfolio.walletChainOptions.some(
      (option) => option.value === walletPortfolioChain,
    );
    if (!stillAvailable) {
      setWalletPortfolioChain("all");
    }
  }, [portfolio.walletChainOptions, walletPortfolioChain]);

  useEffect(() => {
    if (portfolio.visibleWalletTokenRows.length === 0) {
      if (walletSelectedTokenKey !== null) setWalletSelectedTokenKey(null);
      return;
    }
    if (!walletSelectedTokenKey) {
      setWalletSelectedTokenKey(portfolio.visibleWalletTokenRows[0].key);
      return;
    }
    const stillVisible = portfolio.visibleWalletTokenRows.some(
      (row) => row.key === walletSelectedTokenKey,
    );
    if (!stillVisible) {
      setWalletSelectedTokenKey(portfolio.visibleWalletTokenRows[0].key);
    }
  }, [portfolio.visibleWalletTokenRows, walletSelectedTokenKey]);

  useEffect(() => {
    if (walletActionMode !== "receive" || walletPortfolioTab !== "tokens") {
      setWalletTokenDetailsOpen(false);
    }
  }, [walletActionMode, walletPortfolioTab]);

  useEffect(() => {
    if (walletActionMode !== "send") {
      send.resetSendFlow();
    }
  }, [walletActionMode, send.resetSendFlow]);

  useEffect(() => {
    if (!walletPanelOpen) {
      setWalletTokenDetailsOpen(false);
    }
  }, [walletPanelOpen]);

  useEffect(() => {
    if (!walletPanelOpen || walletActionMode !== "receive") return;
    if (!tradeHistory.walletRecentExpanded) return;
    if (tradeHistory.pendingRecentHashes.length === 0) return;
    const now = Date.now();
    const due = tradeHistory.pendingRecentHashes
      .slice(0, 4)
      .filter(
        (hash) => now - (recentTxRefreshAtRef.current[hash] ?? 0) > 15000,
      );
    if (due.length === 0) return;
    for (const hash of due) {
      recentTxRefreshAtRef.current[hash] = now;
      void tradeHistory.refreshRecentTradeStatus(hash, true);
    }
  }, [
    walletPanelOpen,
    walletActionMode,
    tradeHistory.walletRecentExpanded,
    tradeHistory.pendingRecentHashes,
    tradeHistory.refreshRecentTradeStatus,
  ]);

  return {
    // Addresses
    evmShort,
    solShort,
    evmAddress,
    solAddress,

    // Panel state
    walletPanelOpen,
    setWalletPanelOpen,
    walletPanelRef,
    walletActionMode,
    setWalletActionMode,

    // Portfolio state
    walletPortfolioTab,
    setWalletPortfolioTab,
    walletPortfolioChain,
    setWalletPortfolioChain,
    walletSelectedTokenKey,
    setWalletSelectedTokenKey,
    walletTokenDetailsOpen,
    setWalletTokenDetailsOpen,

    // Computed portfolio values
    walletTokenRows: portfolio.walletTokenRows,
    walletTotalUsd: portfolio.walletTotalUsd,
    walletCollectibleRows: portfolio.walletCollectibleRows,
    filteredWalletTokenRows: portfolio.filteredWalletTokenRows,
    filteredWalletCollectibleRows: portfolio.filteredWalletCollectibleRows,
    visibleWalletTokenRows: portfolio.visibleWalletTokenRows,
    selectedWalletToken: portfolio.selectedWalletToken,
    selectedWalletTokenShare: portfolio.selectedWalletTokenShare,
    selectedWalletTokenExplorerUrl: portfolio.selectedWalletTokenExplorerUrl,
    walletChainOptions: portfolio.walletChainOptions,
    walletRefreshBusy,

    // Send state (from sub-hook)
    sendTo: send.sendTo,
    setSendTo: send.setSendTo,
    sendAmount: send.sendAmount,
    setSendAmount: send.setSendAmount,
    sendAsset: send.sendAsset,
    setSendAsset: send.setSendAsset,
    sendExecuteBusy: send.sendExecuteBusy,
    sendLastTxHash: send.sendLastTxHash,
    sendUserSignTx: send.sendUserSignTx,
    sendReady: send.sendReady,

    // Swap state (from sub-hook)
    swapSide: swap.swapSide,
    setSwapSide: swap.setSwapSide,
    swapTokenAddress: swap.swapTokenAddress,
    setSwapTokenAddress: swap.setSwapTokenAddress,
    swapAmount: swap.swapAmount,
    setSwapAmount: swap.setSwapAmount,
    swapSlippage: swap.swapSlippage,
    setSwapSlippage: swap.setSwapSlippage,
    swapQuote: swap.swapQuote,
    swapBusy: swap.swapBusy,
    swapExecuteBusy: swap.swapExecuteBusy,
    swapLastTxHash: swap.swapLastTxHash,
    swapUserSignTx: swap.swapUserSignTx,
    swapUserSignApprovalTx: swap.swapUserSignApprovalTx,
    swapInputSymbol: swap.swapInputSymbol,
    swapCanUsePresets: swap.swapCanUsePresets,
    swapTokenValid: swap.swapTokenValid,
    swapAmountValid: swap.swapAmountValid,
    swapPresetButtons: swap.swapPresetButtons,
    swapFlowStep: swap.swapFlowStep,
    swapRouteLabel: swap.swapRouteLabel,
    swapNeedsUserSign: swap.swapNeedsUserSign,
    formatSwapAmount: swap.formatSwapAmount,
    swapAvailableAmountNum: swap.swapAvailableAmountNum,

    // Recent trades
    walletRecentFilter: tradeHistory.walletRecentFilter,
    setWalletRecentFilter: tradeHistory.setWalletRecentFilter,
    walletRecentExpanded: tradeHistory.walletRecentExpanded,
    setWalletRecentExpanded: tradeHistory.setWalletRecentExpanded,
    walletRecentBusyHashes: tradeHistory.walletRecentBusyHashes,
    walletRecentFilterOptions: tradeHistory.walletRecentFilterOptions,
    visibleWalletRecentTrades: tradeHistory.visibleWalletRecentTrades,
    groupedWalletRecentTrades: tradeHistory.groupedWalletRecentTrades,

    // BSC state
    bscChainError,
    walletReady,
    rpcReady,
    gasReady,

    // Callbacks
    handleSwapQuote: swap.handleSwapQuote,
    handleSwapExecute: swap.handleSwapExecute,
    handleSwapPreset: swap.handleSwapPreset,
    handleCopyUserSignPayload,
    handleSendExecute: send.handleSendExecute,
    handleCopySelectedTokenAddress,
    handleCopyRecentTxHash,
    handleSelectedTokenSwap,
    handleSelectedTokenSend,
    refreshRecentTradeStatus: tradeHistory.refreshRecentTradeStatus,

    // From props (pass-through for sub-components)
    walletLoading,
    walletNftsLoading,
    walletError,
    loadBalances,
    loadNfts,
    copyToClipboard,
    setActionNotice,
    t,
  };
}

export type WalletPanelState = ReturnType<typeof useWalletPanelState>;
