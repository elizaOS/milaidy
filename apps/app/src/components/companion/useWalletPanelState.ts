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
import { useWalletSendState } from "./useWalletSendState";
import { useWalletSwapState } from "./useWalletSwapState";
import {
  BSC_GAS_READY_THRESHOLD,
  BSC_NATIVE_LOGO_URL,
  fetchBscTokenMetadata,
  getRecentTradeGroupKey,
  getTokenExplorerUrl,
  getWalletTxStatusLabel,
  isBscChainName,
  loadRecentTrades,
  MAX_WALLET_RECENT_TRADES,
  MILADY_BSC_TOKEN_ADDRESS,
  mapWalletTradeError,
  persistRecentTrades,
  resolvePortfolioChainKey,
  SOL_NATIVE_LOGO_URL,
  type TokenMetadata,
  type TranslatorFn,
  type WalletCollectibleRow,
  type WalletPortfolioChainFilter,
  type WalletRecentFilter,
  type WalletRecentTrade,
  type WalletTokenRow,
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
  const [walletPortfolioChain, setWalletPortfolioChain] =
    useState<WalletPortfolioChainFilter>("all");
  const [walletSelectedTokenKey, setWalletSelectedTokenKey] = useState<
    string | null
  >(null);
  const [walletTokenDetailsOpen, setWalletTokenDetailsOpen] = useState(false);
  const [miladyTokenMeta, setMiladyTokenMeta] = useState<TokenMetadata>({
    symbol: "MILADY",
    name: "Milady",
    logoUrl: null,
  });
  const [miladyTokenMetaLoaded, setMiladyTokenMetaLoaded] = useState(false);

  const walletPanelRef = useRef<HTMLDivElement | null>(null);
  const recentTxRefreshAtRef = useRef<Record<string, number>>({});

  // ---- Portfolio computed values ----

  const walletTokenRows = useMemo(() => {
    const rows: WalletTokenRow[] = [];
    for (const chain of walletBalances?.evm?.chains ?? []) {
      const nativeValue = Number.parseFloat(chain.nativeValueUsd) || 0;
      rows.push({
        key: `evm-native-${chain.chain}-${chain.nativeSymbol || "native"}`,
        symbol: chain.nativeSymbol || "NATIVE",
        name: chain.nativeSymbol || chain.chain,
        chain: chain.chain,
        chainKey: resolvePortfolioChainKey(chain.chain),
        assetAddress: null,
        isNative: true,
        valueUsd: nativeValue,
        balance: chain.nativeBalance,
        logoUrl: isBscChainName(chain.chain) ? BSC_NATIVE_LOGO_URL : null,
      });
      for (const token of chain.tokens ?? []) {
        rows.push({
          key: `evm-token-${chain.chain}-${token.contractAddress}`,
          symbol: token.symbol || "TOKEN",
          name: token.name || token.symbol || "Token",
          chain: chain.chain,
          chainKey: resolvePortfolioChainKey(chain.chain),
          assetAddress: token.contractAddress || null,
          isNative: false,
          valueUsd: Number.parseFloat(token.valueUsd) || 0,
          balance: token.balance,
          logoUrl: token.logoUrl || null,
        });
      }
    }

    if (walletBalances?.solana) {
      rows.push({
        key: "solana-native",
        symbol: "SOL",
        name: "Solana",
        chain: "Solana",
        chainKey: "solana",
        assetAddress: null,
        isNative: true,
        valueUsd: Number.parseFloat(walletBalances.solana.solValueUsd) || 0,
        balance: walletBalances.solana.solBalance,
        logoUrl: SOL_NATIVE_LOGO_URL,
      });
      for (const token of walletBalances.solana.tokens ?? []) {
        rows.push({
          key: `solana-token-${token.mint}`,
          symbol: token.symbol || "TOKEN",
          name: token.name || token.symbol || "Token",
          chain: "Solana",
          chainKey: "solana",
          assetAddress: token.mint || null,
          isNative: false,
          valueUsd: Number.parseFloat(token.valueUsd) || 0,
          balance: token.balance,
          logoUrl: token.logoUrl || null,
        });
      }
    }

    const positiveValueRows = rows
      .filter((row) => Number.isFinite(row.valueUsd) && row.valueUsd > 0)
      .sort((a, b) => b.valueUsd - a.valueUsd);

    const bscNativeFromRaw = rows.find(
      (row) => row.chainKey === "bsc" && row.isNative,
    );
    if (
      !positiveValueRows.some((row) => row.chainKey === "bsc" && row.isNative)
    ) {
      positiveValueRows.push(
        bscNativeFromRaw ?? {
          key: "fallback-bsc-native",
          symbol: "BNB",
          name: "BNB",
          chain: "BSC",
          chainKey: "bsc",
          assetAddress: null,
          isNative: true,
          valueUsd: 0,
          balance: "0",
          logoUrl: BSC_NATIVE_LOGO_URL,
        },
      );
    }

    const miladyAddr = MILADY_BSC_TOKEN_ADDRESS.toLowerCase();
    const miladyFromRaw = rows.find(
      (row) => row.assetAddress?.trim().toLowerCase() === miladyAddr,
    );
    if (
      !positiveValueRows.some(
        (row) => row.assetAddress?.trim().toLowerCase() === miladyAddr,
      )
    ) {
      positiveValueRows.push(
        miladyFromRaw ?? {
          key: `fallback-bsc-${miladyAddr}`,
          symbol: miladyTokenMeta.symbol,
          name: miladyTokenMeta.name,
          chain: "BSC",
          chainKey: "bsc",
          assetAddress: MILADY_BSC_TOKEN_ADDRESS,
          isNative: false,
          valueUsd: 0,
          balance: "0",
          logoUrl: miladyTokenMeta.logoUrl,
        },
      );
    }

    return positiveValueRows.sort((a, b) => b.valueUsd - a.valueUsd);
  }, [miladyTokenMeta, walletBalances]);

  const walletTotalUsd = useMemo(() => {
    return walletTokenRows.reduce((sum, row) => sum + row.valueUsd, 0);
  }, [walletTokenRows]);

  const walletCollectibleRows = useMemo(() => {
    const rows: WalletCollectibleRow[] = [];
    for (const chainGroup of walletNfts?.evm ?? []) {
      for (const nft of chainGroup.nfts ?? []) {
        rows.push({
          key: `evm-nft-${chainGroup.chain}-${nft.contractAddress}-${nft.tokenId}`,
          chain: chainGroup.chain,
          chainKey: resolvePortfolioChainKey(chainGroup.chain),
          name: nft.name || `#${nft.tokenId}`,
          collectionName: nft.collectionName || "EVM NFT",
          imageUrl: nft.imageUrl || null,
        });
      }
    }
    for (const nft of walletNfts?.solana?.nfts ?? []) {
      rows.push({
        key: `solana-nft-${nft.mint}`,
        chain: "Solana",
        chainKey: "solana",
        name: nft.name || "Solana NFT",
        collectionName: nft.collectionName || "Solana NFT",
        imageUrl: nft.imageUrl || null,
      });
    }
    return rows;
  }, [walletNfts]);

  const filteredWalletTokenRows = useMemo(() => {
    if (walletPortfolioChain === "all") return walletTokenRows;
    return walletTokenRows.filter(
      (row) => row.chainKey === walletPortfolioChain,
    );
  }, [walletPortfolioChain, walletTokenRows]);

  const filteredWalletCollectibleRows = useMemo(() => {
    if (walletPortfolioChain === "all") return walletCollectibleRows;
    return walletCollectibleRows.filter(
      (row) => row.chainKey === walletPortfolioChain,
    );
  }, [walletPortfolioChain, walletCollectibleRows]);

  const visibleWalletTokenRows = useMemo(
    () => filteredWalletTokenRows.slice(0, 14),
    [filteredWalletTokenRows],
  );

  const selectedWalletToken = useMemo(() => {
    if (visibleWalletTokenRows.length === 0) return null;
    if (!walletSelectedTokenKey) return visibleWalletTokenRows[0];
    return (
      visibleWalletTokenRows.find(
        (row) => row.key === walletSelectedTokenKey,
      ) ?? visibleWalletTokenRows[0]
    );
  }, [visibleWalletTokenRows, walletSelectedTokenKey]);

  const selectedWalletTokenShare = useMemo(() => {
    if (!selectedWalletToken || walletTotalUsd <= 0) return 0;
    return Math.max(
      0,
      Math.min(100, (selectedWalletToken.valueUsd / walletTotalUsd) * 100),
    );
  }, [selectedWalletToken, walletTotalUsd]);

  const selectedWalletTokenExplorerUrl = useMemo(
    () =>
      selectedWalletToken ? getTokenExplorerUrl(selectedWalletToken) : null,
    [selectedWalletToken],
  );

  const walletChainOptions = useMemo(() => {
    const hasBsc = [...walletTokenRows, ...walletCollectibleRows].some(
      (row) => row.chainKey === "bsc",
    );
    const hasEvm = [...walletTokenRows, ...walletCollectibleRows].some(
      (row) => row.chainKey === "evm",
    );
    const hasSolana = [...walletTokenRows, ...walletCollectibleRows].some(
      (row) => row.chainKey === "solana",
    );
    const options: Array<{
      value: WalletPortfolioChainFilter;
      label: string;
    }> = [{ value: "all", label: t("wallet.all") }];
    if (hasBsc) options.push({ value: "bsc", label: "BSC" });
    if (hasEvm) options.push({ value: "evm", label: "EVM" });
    if (hasSolana) options.push({ value: "solana", label: "SOL" });
    return options;
  }, [t, walletCollectibleRows, walletTokenRows]);

  const walletRefreshBusy =
    walletLoading ||
    (walletPortfolioTab === "collectibles" && walletNftsLoading);

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

  // ---- Recent trades ----

  const [walletRecentTrades, setWalletRecentTrades] = useState<
    WalletRecentTrade[]
  >(() => loadRecentTrades());
  const [walletRecentFilter, setWalletRecentFilter] =
    useState<WalletRecentFilter>("all");
  const [walletRecentExpanded, setWalletRecentExpanded] = useState(false);
  const [walletRecentBusyHashes, setWalletRecentBusyHashes] = useState<
    Record<string, boolean>
  >({});

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

  // ---- Swap sub-hook ----

  const swap = useWalletSwapState({
    bscChain,
    bscNativeBalanceNum,
    addRecentTrade,
    refreshRecentTradeStatus,
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

  // ---- Cross-cutting callbacks ----

  const handleCopyUserSignPayload = useCallback(
    async (payload: string) => {
      await copyToClipboard(payload);
      setActionNotice(t("wallet.payloadCopied"), "success", 2400);
    },
    [copyToClipboard, setActionNotice, t],
  );

  const handleCopySelectedTokenAddress = useCallback(async () => {
    if (!selectedWalletToken?.assetAddress) {
      setActionNotice(t("wallet.tokenAddressUnavailable"), "info", 2200);
      return;
    }
    await copyToClipboard(selectedWalletToken.assetAddress);
    setActionNotice(t("wallet.addressCopied"), "success", 2200);
  }, [copyToClipboard, selectedWalletToken, setActionNotice, t]);

  const handleCopyRecentTxHash = useCallback(
    async (hash: string) => {
      await copyToClipboard(hash);
      setActionNotice(t("wallet.txHashCopied"), "success", 2200);
    },
    [copyToClipboard, setActionNotice, t],
  );

  const handleSelectedTokenSwap = useCallback(() => {
    if (!selectedWalletToken) return;
    if (selectedWalletToken.chainKey !== "bsc") {
      setActionNotice(t("wallet.tokenOpenWalletForSwap"), "info", 2600);
      return;
    }
    setWalletActionMode("swap");
    if (!selectedWalletToken.isNative && selectedWalletToken.assetAddress) {
      swap.setSwapTokenAddress(selectedWalletToken.assetAddress);
      swap.setSwapSide("sell");
      return;
    }
    swap.setSwapSide("buy");
    setActionNotice(t("wallet.pasteContractToBuy"), "info", 2600);
  }, [selectedWalletToken, setActionNotice, swap, t]);

  const handleSelectedTokenSend = useCallback(() => {
    if (!selectedWalletToken) return;
    setWalletActionMode("send");
    if (
      selectedWalletToken.symbol === "BNB" ||
      selectedWalletToken.symbol === "USDT" ||
      selectedWalletToken.symbol === "USDC"
    ) {
      send.setSendAsset(selectedWalletToken.symbol);
    } else {
      setActionNotice(t("wallet.tokenUnsupportedSendAsset"), "info", 2600);
    }
  }, [selectedWalletToken, setActionNotice, send, t]);

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
    if (!walletPanelOpen || !walletReady) return;
    if (miladyTokenMetaLoaded) return;
    let cancelled = false;
    void (async () => {
      const metadata = await fetchBscTokenMetadata(MILADY_BSC_TOKEN_ADDRESS);
      if (cancelled) return;
      if (metadata) setMiladyTokenMeta(metadata);
      setMiladyTokenMetaLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [miladyTokenMetaLoaded, walletPanelOpen, walletReady]);

  // Seed recent trades from backend ledger (agent-executed trades not in localStorage).
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

  useEffect(() => {
    if (walletPortfolioChain === "all") return;
    const stillAvailable = walletChainOptions.some(
      (option) => option.value === walletPortfolioChain,
    );
    if (!stillAvailable) {
      setWalletPortfolioChain("all");
    }
  }, [walletChainOptions, walletPortfolioChain]);

  useEffect(() => {
    if (visibleWalletTokenRows.length === 0) {
      if (walletSelectedTokenKey !== null) setWalletSelectedTokenKey(null);
      return;
    }
    if (!walletSelectedTokenKey) {
      setWalletSelectedTokenKey(visibleWalletTokenRows[0].key);
      return;
    }
    const stillVisible = visibleWalletTokenRows.some(
      (row) => row.key === walletSelectedTokenKey,
    );
    if (!stillVisible) {
      setWalletSelectedTokenKey(visibleWalletTokenRows[0].key);
    }
  }, [visibleWalletTokenRows, walletSelectedTokenKey]);

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
    if (!walletRecentExpanded) return;
    if (pendingRecentHashes.length === 0) return;
    const now = Date.now();
    const due = pendingRecentHashes
      .slice(0, 4)
      .filter(
        (hash) => now - (recentTxRefreshAtRef.current[hash] ?? 0) > 15000,
      );
    if (due.length === 0) return;
    for (const hash of due) {
      recentTxRefreshAtRef.current[hash] = now;
      void refreshRecentTradeStatus(hash, true);
    }
  }, [
    walletPanelOpen,
    walletActionMode,
    walletRecentExpanded,
    pendingRecentHashes,
    refreshRecentTradeStatus,
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
    walletTokenRows,
    walletTotalUsd,
    walletCollectibleRows,
    filteredWalletTokenRows,
    filteredWalletCollectibleRows,
    visibleWalletTokenRows,
    selectedWalletToken,
    selectedWalletTokenShare,
    selectedWalletTokenExplorerUrl,
    walletChainOptions,
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
    walletRecentFilter,
    setWalletRecentFilter,
    walletRecentExpanded,
    setWalletRecentExpanded,
    walletRecentBusyHashes,
    walletRecentFilterOptions,
    visibleWalletRecentTrades,
    groupedWalletRecentTrades,

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
    refreshRecentTradeStatus,

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
