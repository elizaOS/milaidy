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
import {
  BSC_GAS_READY_THRESHOLD,
  BSC_NATIVE_LOGO_URL,
  BSC_SWAP_GAS_RESERVE,
  BSC_USDC_TOKEN_ADDRESS,
  BSC_USDT_TOKEN_ADDRESS,
  fetchBscTokenMetadata,
  formatRouteAddress,
  getRecentTradeGroupKey,
  getTokenExplorerUrl,
  getWalletTxStatusLabel,
  HEX_ADDRESS_RE,
  isBscChainName,
  loadRecentTrades,
  MAX_WALLET_RECENT_TRADES,
  MILADY_BSC_TOKEN_ADDRESS,
  mapWalletTradeError,
  persistRecentTrades,
  resolvePortfolioChainKey,
  SOL_NATIVE_LOGO_URL,
  shortHash,
  type TokenMetadata,
  type TranslatorFn,
  type WalletCollectibleRow,
  type WalletPortfolioChainFilter,
  type WalletRecentFilter,
  type WalletRecentTrade,
  type WalletTokenRow,
} from "./walletUtils";

type WalletPanelProps = {
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

export function CompanionWalletPanel({
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
}: WalletPanelProps) {
  const evmShort = walletAddresses?.evmAddress
    ? `${walletAddresses.evmAddress.slice(0, 4)}...${walletAddresses.evmAddress.slice(-4)}`
    : null;
  const solShort = walletAddresses?.solanaAddress
    ? `${walletAddresses.solanaAddress.slice(0, 4)}...${walletAddresses.solanaAddress.slice(-4)}`
    : null;
  const evmAddress = walletAddresses?.evmAddress ?? null;
  const solAddress = walletAddresses?.solanaAddress ?? null;

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
  const [sendTo, setSendTo] = useState("");
  const [sendAmount, setSendAmount] = useState("");
  const [sendAsset, setSendAsset] = useState("BNB");
  const [sendExecuteBusy, setSendExecuteBusy] = useState(false);
  const [sendLastTxHash, setSendLastTxHash] = useState<string | null>(null);
  const [sendUserSignTx, setSendUserSignTx] = useState<string | null>(null);
  const [swapSide, setSwapSide] = useState<"buy" | "sell">("buy");
  const [swapTokenAddress, setSwapTokenAddress] = useState("");
  const [swapAmount, setSwapAmount] = useState("0.01");
  const [swapSlippage, setSwapSlippage] = useState("1.0");
  const [swapQuote, setSwapQuote] = useState<BscTradeQuoteResponse | null>(
    null,
  );
  const [swapBusy, setSwapBusy] = useState(false);
  const [swapExecuteBusy, setSwapExecuteBusy] = useState(false);
  const [swapLastTxHash, setSwapLastTxHash] = useState<string | null>(null);
  const [swapUserSignTx, setSwapUserSignTx] = useState<string | null>(null);
  const [swapUserSignApprovalTx, setSwapUserSignApprovalTx] = useState<
    string | null
  >(null);
  const [miladyTokenMeta, setMiladyTokenMeta] = useState<TokenMetadata>({
    symbol: "MILADY",
    name: "Milady",
    logoUrl: null,
  });
  const [miladyTokenMetaLoaded, setMiladyTokenMetaLoaded] = useState(false);
  const [walletRecentTrades, setWalletRecentTrades] = useState<
    WalletRecentTrade[]
  >(() => loadRecentTrades());
  const [walletRecentFilter, setWalletRecentFilter] =
    useState<WalletRecentFilter>("all");
  const [walletRecentExpanded, setWalletRecentExpanded] = useState(false);
  const [walletRecentBusyHashes, setWalletRecentBusyHashes] = useState<
    Record<string, boolean>
  >({});

  const walletPanelRef = useRef<HTMLDivElement | null>(null);
  const recentTxRefreshAtRef = useRef<Record<string, number>>({});

  // ---- Computed values ----

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

  // ---- Recent trades ----

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

  const swapSlippageBps = useMemo(() => {
    const parsed = Number.parseFloat(swapSlippage);
    if (!Number.isFinite(parsed) || parsed <= 0) return 100;
    return Math.min(5000, Math.round(parsed * 100));
  }, [swapSlippage]);

  const sendToValid = HEX_ADDRESS_RE.test(sendTo.trim());
  const sendAmountNum = Number.parseFloat(sendAmount);
  const sendAmountValid = Number.isFinite(sendAmountNum) && sendAmountNum > 0;
  const sendReady = Boolean(evmAddress && sendToValid && sendAmountValid);
  const sendAssetTokenAddress = useMemo(() => {
    const normalizedAsset = sendAsset.trim().toUpperCase();
    if (normalizedAsset === "BNB") return null;
    const fromWallet = (bscChain?.tokens ?? []).find(
      (token) => token.symbol.trim().toUpperCase() === normalizedAsset,
    );
    if (
      fromWallet?.contractAddress &&
      HEX_ADDRESS_RE.test(fromWallet.contractAddress.trim())
    ) {
      return fromWallet.contractAddress.trim();
    }
    if (normalizedAsset === "USDT") return BSC_USDT_TOKEN_ADDRESS;
    if (normalizedAsset === "USDC") return BSC_USDC_TOKEN_ADDRESS;
    return null;
  }, [bscChain, sendAsset]);
  const normalizedSwapTokenAddress = swapTokenAddress.trim().toLowerCase();

  const selectedBscToken = useMemo(() => {
    if (!HEX_ADDRESS_RE.test(swapTokenAddress.trim())) return null;
    return (
      (bscChain?.tokens ?? []).find(
        (token) =>
          token.contractAddress.trim().toLowerCase() ===
          normalizedSwapTokenAddress,
      ) ?? null
    );
  }, [bscChain, normalizedSwapTokenAddress, swapTokenAddress]);

  const selectedBscTokenBalanceNum = Number.parseFloat(
    selectedBscToken?.balance ?? "",
  );
  const swapInputSymbol =
    swapSide === "buy"
      ? (bscChain?.nativeSymbol ?? "BNB")
      : selectedBscToken?.symbol || "TOKEN";
  const swapAvailableAmountNum =
    swapSide === "buy"
      ? Number.isFinite(bscNativeBalanceNum)
        ? Math.max(0, bscNativeBalanceNum - BSC_SWAP_GAS_RESERVE)
        : Number.NaN
      : selectedBscTokenBalanceNum;
  const swapCanUsePresets =
    Number.isFinite(swapAvailableAmountNum) && swapAvailableAmountNum > 0;
  const swapTokenValid = HEX_ADDRESS_RE.test(swapTokenAddress.trim());
  const swapAmountNum = Number.parseFloat(swapAmount);
  const swapAmountValid = Number.isFinite(swapAmountNum) && swapAmountNum > 0;

  const formatSwapAmount = useCallback((value: number): string => {
    if (!Number.isFinite(value) || value <= 0) return "0";
    const normalized = value >= 1 ? value.toFixed(4) : value.toFixed(6);
    return normalized.replace(/\.?0+$/, "");
  }, []);

  const swapPresetButtons = useMemo(() => {
    if (!swapCanUsePresets) {
      return [
        { label: "25%", ratio: 0.25, value: "0", active: false },
        { label: "50%", ratio: 0.5, value: "0", active: false },
        { label: "75%", ratio: 0.75, value: "0", active: false },
        { label: "MAX", ratio: 1, value: "0", active: false },
      ];
    }

    return [
      { label: "25%", ratio: 0.25 },
      { label: "50%", ratio: 0.5 },
      { label: "75%", ratio: 0.75 },
      { label: "MAX", ratio: 1 },
    ].map((preset) => {
      const raw =
        preset.ratio >= 1
          ? swapAvailableAmountNum
          : swapAvailableAmountNum * preset.ratio;
      const value = formatSwapAmount(raw);
      return {
        ...preset,
        value,
        active: swapAmount.trim() === value,
      };
    });
  }, [formatSwapAmount, swapAmount, swapAvailableAmountNum, swapCanUsePresets]);

  const handleSwapPreset = useCallback(
    (ratio: number) => {
      if (!swapCanUsePresets) return;
      const next =
        ratio >= 1 ? swapAvailableAmountNum : swapAvailableAmountNum * ratio;
      setSwapAmount(formatSwapAmount(next));
    },
    [formatSwapAmount, swapAvailableAmountNum, swapCanUsePresets],
  );

  const swapFlowStep = useMemo(() => {
    if (swapLastTxHash) return 4;
    if (swapExecuteBusy || swapUserSignTx || swapUserSignApprovalTx) return 3;
    if (swapQuote || swapBusy) return 2;
    return 1;
  }, [
    swapBusy,
    swapExecuteBusy,
    swapLastTxHash,
    swapQuote,
    swapUserSignApprovalTx,
    swapUserSignTx,
  ]);

  const swapRouteLabel = useMemo(() => {
    if (!swapQuote || swapQuote.route.length === 0) return null;
    return swapQuote.route.map(formatRouteAddress).join(" -> ");
  }, [swapQuote]);

  const swapNeedsUserSign = Boolean(swapUserSignTx || swapUserSignApprovalTx);

  // ---- Action callbacks ----

  const handleSwapQuote = useCallback(async () => {
    const token = swapTokenAddress.trim();
    if (!HEX_ADDRESS_RE.test(token)) {
      setActionNotice(t("wallet.contractMustBeHex"), "error", 2600);
      return;
    }
    const amount = swapAmount.trim();
    const amountNum = Number.parseFloat(amount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      setActionNotice(t("wallet.invalidAmount"), "error", 2400);
      return;
    }

    setSwapBusy(true);
    try {
      const preflight = await getBscTradePreflight(token);
      if (!preflight.ok) {
        setSwapQuote(null);
        setSwapLastTxHash(null);
        setSwapUserSignTx(null);
        setSwapUserSignApprovalTx(null);
        setActionNotice(
          preflight.reasons[0] ?? t("wallet.preflightFailed"),
          "error",
          3200,
        );
        return;
      }

      const quote = await getBscTradeQuote({
        side: swapSide,
        tokenAddress: token,
        amount,
        slippageBps: swapSlippageBps,
      });
      setSwapQuote(quote);
      setSwapLastTxHash(null);
      setSwapUserSignTx(null);
      setSwapUserSignApprovalTx(null);
      setActionNotice(
        `${quote.quoteIn.amount} ${quote.quoteIn.symbol} -> ${quote.quoteOut.amount} ${quote.quoteOut.symbol}`,
        "success",
        3200,
      );
    } catch (err) {
      setSwapQuote(null);
      setSwapLastTxHash(null);
      setSwapUserSignTx(null);
      setSwapUserSignApprovalTx(null);
      setActionNotice(
        mapWalletTradeError(err, t, "wallet.failedFetchQuote"),
        "error",
        3600,
      );
    } finally {
      setSwapBusy(false);
    }
  }, [
    getBscTradePreflight,
    getBscTradeQuote,
    setActionNotice,
    swapAmount,
    swapSide,
    swapSlippageBps,
    swapTokenAddress,
    t,
  ]);

  const handleSwapExecute = useCallback(async () => {
    if (!swapQuote) {
      setActionNotice(t("wallet.createQuoteFirst"), "info", 2200);
      return;
    }

    setSwapExecuteBusy(true);
    try {
      const result = await executeBscTrade({
        side: swapQuote.side,
        tokenAddress: swapQuote.tokenAddress,
        amount: swapQuote.quoteIn.amount,
        slippageBps: swapQuote.slippageBps,
        confirm: true,
      });

      if (result.executed && result.execution?.hash) {
        const txHash = result.execution.hash;
        const initialStatus: BscTradeTxStatusResponse["status"] =
          result.execution.status === "success" ? "success" : "pending";
        setSwapLastTxHash(txHash);
        setSwapUserSignTx(null);
        setSwapUserSignApprovalTx(null);
        addRecentTrade({
          hash: txHash,
          side: swapQuote.side,
          tokenAddress: swapQuote.tokenAddress,
          amount: swapQuote.quoteIn.amount,
          inputSymbol: swapQuote.quoteIn.symbol,
          outputSymbol: swapQuote.quoteOut.symbol,
          createdAt: Date.now(),
          status: initialStatus,
          confirmations: 0,
          nonce: result.execution.nonce ?? null,
          reason: null,
          explorerUrl:
            result.execution.explorerUrl || `https://bscscan.com/tx/${txHash}`,
        });
        if (initialStatus === "pending") {
          recentTxRefreshAtRef.current[txHash] = Date.now();
          void refreshRecentTradeStatus(txHash, true);
        }
        setActionNotice(
          t("wallet.tradeSentWithHash", {
            hash: `${txHash.slice(0, 10)}...`,
          }),
          "success",
          3600,
        );
        void loadBalances();
        return;
      }

      if (result.requiresUserSignature) {
        setSwapLastTxHash(null);
        setSwapUserSignTx(
          result.unsignedTx ? JSON.stringify(result.unsignedTx, null, 2) : null,
        );
        setSwapUserSignApprovalTx(
          result.unsignedApprovalTx
            ? JSON.stringify(result.unsignedApprovalTx, null, 2)
            : null,
        );
        setActionNotice(t("wallet.userSignPayloadReady"), "info", 4200);
        return;
      }

      setSwapLastTxHash(null);
      setSwapUserSignTx(null);
      setSwapUserSignApprovalTx(null);
      setActionNotice(t("wallet.executionDidNotComplete"), "error", 3200);
    } catch (err) {
      setSwapLastTxHash(null);
      setSwapUserSignTx(null);
      setSwapUserSignApprovalTx(null);
      setActionNotice(
        mapWalletTradeError(err, t, "wallet.tradeExecutionFailed"),
        "error",
        4200,
      );
    } finally {
      setSwapExecuteBusy(false);
    }
  }, [
    addRecentTrade,
    executeBscTrade,
    loadBalances,
    refreshRecentTradeStatus,
    setActionNotice,
    swapQuote,
    t,
  ]);

  const handleCopyUserSignPayload = useCallback(
    async (payload: string) => {
      await copyToClipboard(payload);
      setActionNotice(t("wallet.payloadCopied"), "success", 2400);
    },
    [copyToClipboard, setActionNotice, t],
  );

  const handleSendExecute = useCallback(async () => {
    if (!sendReady || !evmAddress) {
      setActionNotice(t("wallet.enterValidDestinationAmount"), "error", 2600);
      return;
    }

    const normalizedAsset = sendAsset.trim().toUpperCase();
    if (normalizedAsset !== "BNB" && !sendAssetTokenAddress) {
      setActionNotice(
        t("wallet.noTokenContractForAsset", { asset: normalizedAsset }),
        "error",
        3200,
      );
      return;
    }

    setSendExecuteBusy(true);
    setSendLastTxHash(null);
    setSendUserSignTx(null);

    try {
      const result = await executeBscTransfer({
        toAddress: sendTo.trim(),
        amount: sendAmount.trim(),
        assetSymbol: normalizedAsset,
        ...(sendAssetTokenAddress
          ? { tokenAddress: sendAssetTokenAddress }
          : {}),
        confirm: true,
      });

      if (result.requiresUserSignature) {
        setSendUserSignTx(JSON.stringify(result.unsignedTx, null, 2));
        setActionNotice(t("wallet.userSignPayloadReady"), "info", 4200);
        return;
      }

      if (result.execution?.hash) {
        setSendLastTxHash(result.execution.hash);
        setActionNotice(t("wallet.transferSubmitted"), "success", 3200);
        await loadBalances();
        return;
      }

      setActionNotice(
        t("wallet.transferExecutionDidNotComplete"),
        "error",
        3200,
      );
    } catch (err) {
      setActionNotice(
        mapWalletTradeError(err, t, "wallet.transferExecutionFailed"),
        "error",
        4200,
      );
    } finally {
      setSendExecuteBusy(false);
    }
  }, [
    evmAddress,
    executeBscTransfer,
    loadBalances,
    sendAmount,
    sendAsset,
    sendAssetTokenAddress,
    sendReady,
    sendTo,
    setActionNotice,
    t,
  ]);

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
      setSwapTokenAddress(selectedWalletToken.assetAddress);
      setSwapSide("sell");
      return;
    }
    setSwapSide("buy");
    setActionNotice(t("wallet.pasteContractToBuy"), "info", 2600);
  }, [selectedWalletToken, setActionNotice, t]);

  const handleSelectedTokenSend = useCallback(() => {
    if (!selectedWalletToken) return;
    setWalletActionMode("send");
    if (
      selectedWalletToken.symbol === "BNB" ||
      selectedWalletToken.symbol === "USDT" ||
      selectedWalletToken.symbol === "USDC"
    ) {
      setSendAsset(selectedWalletToken.symbol);
    } else {
      setActionNotice(t("wallet.tokenUnsupportedSendAsset"), "info", 2600);
    }
  }, [selectedWalletToken, setActionNotice, t]);

  // ---- Effects ----

  useEffect(() => {
    setSwapQuote(null);
    setSwapLastTxHash(null);
    setSwapUserSignTx(null);
    setSwapUserSignApprovalTx(null);
  }, []);

  useEffect(() => {
    setSendLastTxHash(null);
    setSendUserSignTx(null);
  }, []);

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
      setSendUserSignTx(null);
      setSendLastTxHash(null);
    }
  }, [walletActionMode]);

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

  if (!evmShort && !solShort) return null;

  return (
    <div className="anime-header-wallet-shell" ref={walletPanelRef}>
      <button
        type="button"
        className={`anime-header-pill anime-header-wallet-trigger ${walletPanelOpen ? "is-open" : ""}`}
        onClick={() => setWalletPanelOpen((prev) => !prev)}
        aria-expanded={walletPanelOpen}
        aria-haspopup="dialog"
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
          <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
          <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
        </svg>
        <div className="anime-header-wallet-text">
          {evmShort && <span>{evmShort}</span>}
          {solShort && !evmShort && <span>{solShort}</span>}
        </div>
        <svg
          className={`anime-header-wallet-caret ${walletPanelOpen ? "is-open" : ""}`}
          width="11"
          height="11"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      <div
        className={`anime-wallet-popover ${walletPanelOpen ? "is-open" : ""}`}
        role="dialog"
        aria-label={t("wallet.panelAriaLabel")}
      >
        <div className="anime-wallet-popover-head">
          <div>
            <div className="anime-wallet-popover-title">
              {t("wallet.title")}
            </div>
            <div className="anime-wallet-popover-sub">
              {evmShort ?? solShort ?? t("wallet.notConnected")}
            </div>
          </div>
          <div className="anime-wallet-popover-head-actions">
            <button
              type="button"
              className="anime-wallet-popover-ghost"
              onClick={() => {
                void loadBalances();
                if (walletPortfolioTab === "collectibles") {
                  void loadNfts();
                }
              }}
              disabled={walletRefreshBusy}
            >
              {walletRefreshBusy
                ? t("wallet.refreshing")
                : t("wallet.profile.refresh")}
            </button>
          </div>
        </div>

        <div className="anime-wallet-popover-total">
          <div className="anime-wallet-popover-total-value">
            {walletTotalUsd > 0
              ? `$${walletTotalUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              : "$0.00"}
          </div>
          <div className="anime-wallet-popover-total-label">
            {t("wallet.estimatedPortfolioValue")}
          </div>
        </div>

        {walletError && (
          <div className="anime-wallet-popover-error">{walletError}</div>
        )}

        <div className="anime-wallet-mode-switch">
          {(["send", "swap", "receive"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              className={`anime-wallet-mode-btn ${walletActionMode === mode ? "is-active" : ""}`}
              onClick={() => setWalletActionMode(mode)}
            >
              {mode === "send"
                ? t("wallet.send")
                : mode === "swap"
                  ? t("wallet.swap")
                  : t("wallet.receive")}
            </button>
          ))}
        </div>

        <div className="anime-wallet-readiness-row">
          <span
            className={`anime-wallet-ready-chip ${walletReady ? "is-ready" : "is-off"}`}
          >
            {t("wallet.preflightCheck.wallet")}
          </span>
          <span
            className={`anime-wallet-ready-chip ${rpcReady ? "is-ready" : "is-off"}`}
          >
            {t("wallet.readyChipFeed")}
          </span>
          <span
            className={`anime-wallet-ready-chip ${gasReady ? "is-ready" : "is-off"}`}
          >
            {t("wallet.preflightCheck.gas")}
          </span>
        </div>

        {walletActionMode === "receive" && (
          <>
            <div className="anime-wallet-address-list">
              {evmAddress && (
                <div className="anime-wallet-address-row">
                  <span className="anime-wallet-address-chain">BSC</span>
                  <code
                    className="anime-wallet-address-code"
                    title={evmAddress}
                  >
                    {evmShort}
                  </code>
                  <button
                    type="button"
                    className="anime-wallet-address-copy"
                    onClick={() => {
                      void copyToClipboard(evmAddress);
                      setActionNotice(
                        t("wallet.addressCopied"),
                        "success",
                        2200,
                      );
                    }}
                  >
                    {t("wallet.copy")}
                  </button>
                </div>
              )}
              {solAddress && (
                <div className="anime-wallet-address-row">
                  <span className="anime-wallet-address-chain">SOL</span>
                  <code
                    className="anime-wallet-address-code"
                    title={solAddress}
                  >
                    {solShort}
                  </code>
                  <button
                    type="button"
                    className="anime-wallet-address-copy"
                    onClick={() => {
                      void copyToClipboard(solAddress);
                      setActionNotice(
                        t("wallet.addressCopied"),
                        "success",
                        2200,
                      );
                    }}
                  >
                    {t("wallet.copy")}
                  </button>
                </div>
              )}
            </div>

            <div className="anime-wallet-portfolio-toolbar">
              <div className="anime-wallet-portfolio-tabs">
                {(
                  [
                    { key: "tokens", label: t("wallet.tokens") },
                    {
                      key: "collectibles",
                      label: t("wallet.collectibles"),
                    },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    className={`anime-wallet-portfolio-tab ${walletPortfolioTab === tab.key ? "is-active" : ""}`}
                    onClick={() => setWalletPortfolioTab(tab.key)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              <div className="anime-wallet-portfolio-filters">
                {walletChainOptions.map((chainOption) => (
                  <button
                    key={chainOption.value}
                    type="button"
                    className={`anime-wallet-portfolio-filter ${walletPortfolioChain === chainOption.value ? "is-active" : ""}`}
                    onClick={() => setWalletPortfolioChain(chainOption.value)}
                  >
                    {chainOption.label}
                  </button>
                ))}
              </div>
            </div>

            {walletPortfolioTab === "tokens" ? (
              <>
                <div className="anime-wallet-token-list">
                  {visibleWalletTokenRows.length > 0 ? (
                    visibleWalletTokenRows.map((row) => (
                      <button
                        key={row.key}
                        type="button"
                        className={`anime-wallet-token-row ${walletSelectedTokenKey === row.key ? "is-active" : ""}`}
                        onClick={() => {
                          setWalletSelectedTokenKey(row.key);
                          setWalletTokenDetailsOpen(true);
                        }}
                        data-testid={`wallet-token-row-${row.key}`}
                      >
                        <div className="anime-wallet-token-main">
                          <span
                            className="anime-wallet-token-logo"
                            aria-hidden="true"
                          >
                            {row.logoUrl ? (
                              <img src={row.logoUrl} alt="" loading="lazy" />
                            ) : (
                              row.symbol.slice(0, 1)
                            )}
                          </span>
                          <div className="anime-wallet-token-meta">
                            <span className="anime-wallet-token-name">
                              {row.name}
                            </span>
                            <span className="anime-wallet-token-balance">
                              {row.balance} {row.symbol}
                            </span>
                          </div>
                        </div>
                        <div className="anime-wallet-token-value-wrap">
                          <span className="anime-wallet-token-value">
                            $
                            {row.valueUsd.toLocaleString("en-US", {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </span>
                          <span className="anime-wallet-token-chain">
                            {row.chain}
                          </span>
                        </div>
                      </button>
                    ))
                  ) : (
                    <div className="anime-wallet-asset-empty">
                      {walletLoading
                        ? t("wallet.loadingBalances")
                        : t("wallet.noTokensFound")}
                    </div>
                  )}
                </div>

                {selectedWalletToken && (
                  <div className="anime-wallet-token-detail-toggle">
                    <div className="anime-wallet-token-detail-toggle-meta">
                      <span>{selectedWalletToken.name}</span>
                      <span>{selectedWalletToken.chain}</span>
                    </div>
                    <button
                      type="button"
                      className="anime-wallet-address-copy"
                      data-testid="wallet-token-details-toggle"
                      onClick={() => setWalletTokenDetailsOpen((prev) => !prev)}
                    >
                      {walletTokenDetailsOpen
                        ? t("wallet.tokenDetailsHide")
                        : t("wallet.tokenDetailsShow")}
                    </button>
                  </div>
                )}

                {selectedWalletToken && walletTokenDetailsOpen && (
                  <div className="anime-wallet-token-detail">
                    <div className="anime-wallet-token-detail-head">
                      <span>{t("wallet.tokenDetails")}</span>
                      <span>
                        {t("wallet.tokenShare")}:{" "}
                        {selectedWalletTokenShare.toFixed(2)}%
                      </span>
                    </div>
                    <div className="anime-wallet-token-detail-grid">
                      <div className="anime-wallet-token-detail-item">
                        <span>{t("wallet.name")}</span>
                        <strong>{selectedWalletToken.name}</strong>
                      </div>
                      <div className="anime-wallet-token-detail-item">
                        <span>{t("wallet.chain")}</span>
                        <strong>{selectedWalletToken.chain}</strong>
                      </div>
                      <div className="anime-wallet-token-detail-item">
                        <span>{t("wallet.table.balance")}</span>
                        <strong>
                          {selectedWalletToken.balance}{" "}
                          {selectedWalletToken.symbol}
                        </strong>
                      </div>
                      <div className="anime-wallet-token-detail-item">
                        <span>{t("wallet.value")}</span>
                        <strong>
                          $
                          {selectedWalletToken.valueUsd.toLocaleString(
                            "en-US",
                            {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            },
                          )}
                        </strong>
                      </div>
                    </div>
                    {selectedWalletToken.assetAddress && (
                      <div className="anime-wallet-token-detail-address">
                        <span>{t("wallet.tokenAddress")}</span>
                        <code title={selectedWalletToken.assetAddress}>
                          {selectedWalletToken.assetAddress}
                        </code>
                      </div>
                    )}
                    <div className="anime-wallet-token-detail-actions">
                      {selectedWalletToken.assetAddress && (
                        <button
                          type="button"
                          className="anime-wallet-address-copy"
                          onClick={() => {
                            void handleCopySelectedTokenAddress();
                          }}
                        >
                          {t("wallet.tokenCopyAddress")}
                        </button>
                      )}
                      {selectedWalletTokenExplorerUrl && (
                        <a
                          href={selectedWalletTokenExplorerUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="anime-wallet-tx-link anime-wallet-recent-link"
                        >
                          {t("wallet.tokenViewExplorer")}
                        </a>
                      )}
                      <button
                        type="button"
                        className="anime-wallet-address-copy"
                        onClick={handleSelectedTokenSwap}
                      >
                        {t("wallet.tokenSwapThis")}
                      </button>
                      <button
                        type="button"
                        className="anime-wallet-address-copy"
                        onClick={handleSelectedTokenSend}
                      >
                        {t("wallet.tokenSendThis")}
                      </button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="anime-wallet-nft-grid">
                {walletNftsLoading ? (
                  <div className="anime-wallet-asset-empty">
                    {t("wallet.loadingNfts")}
                  </div>
                ) : filteredWalletCollectibleRows.length > 0 ? (
                  filteredWalletCollectibleRows.slice(0, 8).map((row) => (
                    <div key={row.key} className="anime-wallet-nft-card">
                      <div className="anime-wallet-nft-thumb">
                        {row.imageUrl ? (
                          <img
                            src={row.imageUrl}
                            alt={row.name}
                            loading="lazy"
                          />
                        ) : (
                          <span>{t("wallet.noImage")}</span>
                        )}
                      </div>
                      <div className="anime-wallet-nft-meta">
                        <span className="anime-wallet-nft-name">
                          {row.name}
                        </span>
                        <span className="anime-wallet-nft-collection">
                          {row.collectionName}
                        </span>
                        <span className="anime-wallet-nft-chain">
                          {row.chain}
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="anime-wallet-asset-empty">
                    {t("wallet.noNftsFound")}
                  </div>
                )}
              </div>
            )}

            <div className="anime-wallet-recent-section">
              <div className="anime-wallet-recent-header">
                <span>{t("wallet.recentActivity")}</span>
                <div className="anime-wallet-recent-header-actions">
                  {walletRecentExpanded &&
                    visibleWalletRecentTrades.length > 0 && (
                      <button
                        type="button"
                        className="anime-wallet-address-copy"
                        onClick={() => {
                          for (const entry of visibleWalletRecentTrades) {
                            void refreshRecentTradeStatus(entry.hash, true);
                          }
                        }}
                      >
                        {t("wallet.txStatusRefresh")}
                      </button>
                    )}
                  <button
                    type="button"
                    className="anime-wallet-address-copy"
                    data-testid="wallet-recent-toggle"
                    onClick={() => setWalletRecentExpanded((prev) => !prev)}
                  >
                    {walletRecentExpanded
                      ? t("wallet.recentHide")
                      : t("wallet.recentShow")}
                  </button>
                </div>
              </div>
              {walletRecentExpanded && (
                <>
                  <div className="anime-wallet-recent-filters">
                    {walletRecentFilterOptions.map((filterOption) => (
                      <button
                        key={filterOption.key}
                        type="button"
                        className={`anime-wallet-portfolio-filter ${walletRecentFilter === filterOption.key ? "is-active" : ""}`}
                        onClick={() => setWalletRecentFilter(filterOption.key)}
                        data-testid={`wallet-recent-filter-${filterOption.key}`}
                      >
                        {filterOption.label}
                      </button>
                    ))}
                  </div>
                  <div className="anime-wallet-recent-list">
                    {groupedWalletRecentTrades.length > 0 ? (
                      groupedWalletRecentTrades.map((group) => (
                        <div
                          key={group.key}
                          className="anime-wallet-recent-group"
                          data-testid={`wallet-recent-group-${group.key}`}
                        >
                          <div className="anime-wallet-recent-group-title">
                            {group.label}
                          </div>
                          {group.entries.map((entry, entryIndex) => (
                            <div
                              key={entry.hash}
                              className="anime-wallet-recent-row"
                            >
                              <div className="anime-wallet-recent-main">
                                <span
                                  className={`anime-wallet-recent-side is-${entry.side}`}
                                >
                                  {entry.side.toUpperCase()}
                                </span>
                                <div className="anime-wallet-recent-meta">
                                  <span>
                                    {entry.amount} {entry.inputSymbol} {"->"}{" "}
                                    {entry.outputSymbol}
                                  </span>
                                  <code>{shortHash(entry.hash)}</code>
                                </div>
                              </div>
                              <div className="anime-wallet-recent-actions">
                                <span
                                  className={`anime-wallet-tx-pill is-${entry.status}`}
                                >
                                  {getWalletTxStatusLabel(entry.status, t)}
                                </span>
                                <a
                                  href={
                                    entry.explorerUrl ||
                                    `https://bscscan.com/tx/${entry.hash}`
                                  }
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="anime-wallet-tx-link anime-wallet-recent-link"
                                >
                                  {t("wallet.view")}
                                </a>
                                <button
                                  type="button"
                                  className="anime-wallet-address-copy"
                                  data-testid={`wallet-recent-copy-hash-${group.key}-${entryIndex}`}
                                  onClick={() => {
                                    void handleCopyRecentTxHash(entry.hash);
                                  }}
                                >
                                  {t("wallet.copyTxHash")}
                                </button>
                                <button
                                  type="button"
                                  className="anime-wallet-address-copy"
                                  disabled={Boolean(
                                    walletRecentBusyHashes[entry.hash],
                                  )}
                                  onClick={() => {
                                    void refreshRecentTradeStatus(entry.hash);
                                  }}
                                >
                                  {walletRecentBusyHashes[entry.hash]
                                    ? t("wallet.refreshing")
                                    : t("wallet.txStatusRefresh")}
                                </button>
                              </div>
                              {(entry.confirmations > 0 ||
                                typeof entry.nonce === "number") && (
                                <div className="anime-wallet-recent-extra">
                                  {entry.confirmations > 0 && (
                                    <span>
                                      {t("wallet.txStatus.confirmations", {
                                        count: entry.confirmations,
                                      })}
                                    </span>
                                  )}
                                  {typeof entry.nonce === "number" && (
                                    <span>
                                      {t("wallet.txStatus.nonce", {
                                        nonce: entry.nonce,
                                      })}
                                    </span>
                                  )}
                                </div>
                              )}
                              {entry.status === "reverted" && entry.reason && (
                                <div className="anime-wallet-recent-reason">
                                  {entry.reason}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      ))
                    ) : (
                      <div className="anime-wallet-asset-empty">
                        {t("wallet.noRecentActivity")}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </>
        )}

        {walletActionMode === "swap" && (
          <div className="anime-wallet-action-body">
            <section
              className="anime-wallet-flow"
              aria-label={t("wallet.swapFlowAria")}
            >
              {[
                { label: t("wallet.flow.input"), step: 1 },
                { label: t("wallet.flow.quote"), step: 2 },
                {
                  label: swapNeedsUserSign
                    ? t("wallet.flow.sign")
                    : t("wallet.flow.execute"),
                  step: 3,
                },
                { label: t("wallet.flow.done"), step: 4 },
              ].map((item, index, steps) => {
                const isActive = swapFlowStep >= item.step;
                const railActive = swapFlowStep > item.step;
                return (
                  <div
                    key={item.step}
                    className={`anime-wallet-flow-step ${isActive ? "is-active" : ""}`}
                  >
                    <span
                      className="anime-wallet-flow-marker"
                      aria-hidden="true"
                    />
                    <span className="anime-wallet-flow-label">
                      {item.label}
                    </span>
                    {index < steps.length - 1 && (
                      <span
                        className={`anime-wallet-flow-rail ${railActive ? "is-active" : ""}`}
                        aria-hidden="true"
                      />
                    )}
                  </div>
                );
              })}
            </section>

            <div className="anime-wallet-status-hint">
              {swapFlowStep === 1 && t("wallet.flowHint.input")}
              {swapFlowStep === 2 &&
                (swapBusy
                  ? t("wallet.flowHint.quoteLoading")
                  : t("wallet.flowHint.quoteReady"))}
              {swapFlowStep === 3 &&
                (swapExecuteBusy
                  ? t("wallet.flowHint.sending")
                  : swapNeedsUserSign
                    ? t("wallet.flowHint.signingRequired")
                    : t("wallet.flowHint.tradeReady"))}
              {swapFlowStep === 4 && t("wallet.flowHint.submitted")}
            </div>

            <div className="anime-wallet-side-toggle">
              <button
                type="button"
                className={`anime-wallet-side-btn ${swapSide === "buy" ? "is-active" : ""}`}
                onClick={() => setSwapSide("buy")}
              >
                {t("wallet.buy")}
              </button>
              <button
                type="button"
                className={`anime-wallet-side-btn ${swapSide === "sell" ? "is-active" : ""}`}
                onClick={() => setSwapSide("sell")}
              >
                {t("wallet.sell")}
              </button>
            </div>

            <label className="anime-wallet-field">
              <span>{t("wallet.tokenBscContract")}</span>
              <input
                type="text"
                value={swapTokenAddress}
                onChange={(event) => setSwapTokenAddress(event.target.value)}
                placeholder="0x..."
              />
            </label>
            <div className="anime-wallet-field-grid">
              <label className="anime-wallet-field">
                <span>
                  {swapSide === "buy"
                    ? t("wallet.spendSymbol", {
                        symbol: swapInputSymbol,
                      })
                    : t("wallet.sellSymbol", {
                        symbol: swapInputSymbol,
                      })}
                </span>
                <input
                  type="text"
                  value={swapAmount}
                  onChange={(event) => setSwapAmount(event.target.value)}
                  placeholder="0.01"
                />
              </label>
              <label className="anime-wallet-field">
                <span>{t("wallet.slippagePercent")}</span>
                <input
                  type="text"
                  value={swapSlippage}
                  onChange={(event) => setSwapSlippage(event.target.value)}
                  placeholder="1.0"
                />
              </label>
            </div>

            <div className="anime-wallet-balance-meta">
              <span>
                {t("wallet.available")}:{" "}
                {swapCanUsePresets
                  ? `${formatSwapAmount(swapAvailableAmountNum)} ${swapInputSymbol}`
                  : "--"}
              </span>
              {swapSide === "buy" && (
                <span>
                  {t("wallet.gasReserve", {
                    amount: BSC_SWAP_GAS_RESERVE,
                  })}
                </span>
              )}
            </div>

            <div className="anime-wallet-amount-presets">
              {swapPresetButtons.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  className={`anime-wallet-preset-btn ${preset.active ? "is-active" : ""}`}
                  disabled={!swapCanUsePresets || swapBusy || swapExecuteBusy}
                  onClick={() => {
                    handleSwapPreset(preset.ratio);
                  }}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <div className="anime-wallet-popover-actions">
              <button
                type="button"
                className="anime-wallet-popover-action"
                disabled={
                  !swapTokenValid ||
                  !swapAmountValid ||
                  swapBusy ||
                  swapExecuteBusy
                }
                onClick={() => {
                  void handleSwapQuote();
                }}
              >
                {swapBusy ? t("wallet.quoting") : t("wallet.getQuote")}
              </button>
              <button
                type="button"
                className="anime-wallet-popover-action is-primary"
                disabled={swapBusy || swapExecuteBusy || !swapQuote}
                onClick={() => {
                  void handleSwapExecute();
                }}
              >
                {swapExecuteBusy
                  ? t("wallet.executing")
                  : swapNeedsUserSign
                    ? t("wallet.refreshPayload")
                    : t("wallet.execute")}
              </button>
            </div>

            {swapQuote && (
              <div className="anime-wallet-quote-card">
                <div className="anime-wallet-quote-line">
                  <span>{t("wallet.quote.input")}</span>
                  <strong>
                    {swapQuote.quoteIn.amount} {swapQuote.quoteIn.symbol}
                  </strong>
                </div>
                <div className="anime-wallet-quote-line">
                  <span>{t("wallet.quote.expected")}</span>
                  <strong>
                    {swapQuote.quoteOut.amount} {swapQuote.quoteOut.symbol}
                  </strong>
                </div>
                <div className="anime-wallet-quote-line">
                  <span>{t("wallet.quote.minReceive")}</span>
                  <strong>
                    {swapQuote.minReceive.amount} {swapQuote.minReceive.symbol}
                  </strong>
                </div>
                <div className="anime-wallet-quote-line">
                  <span>{t("wallet.route")}</span>
                  <strong>
                    {t("wallet.hopsCount", {
                      count: swapQuote.route.length,
                    })}
                  </strong>
                </div>
                {swapRouteLabel && (
                  <div
                    className="anime-wallet-quote-route"
                    title={swapQuote.route.join(" -> ")}
                  >
                    {swapRouteLabel}
                  </div>
                )}
              </div>
            )}

            {swapLastTxHash && (
              <div className="anime-wallet-tx-row">
                <span>{t("wallet.txSubmitted")}:</span>
                <code>
                  {swapLastTxHash.slice(0, 10)}...
                  {swapLastTxHash.slice(-6)}
                </code>
                <a
                  href={`https://bscscan.com/tx/${swapLastTxHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="anime-wallet-tx-link"
                >
                  {t("wallet.view")}
                </a>
              </div>
            )}

            {(swapUserSignTx || swapUserSignApprovalTx) && (
              <div className="anime-wallet-usersign">
                <div className="anime-wallet-usersign-title">
                  {t("wallet.userSignPlan")}
                </div>
                <div className="anime-wallet-usersign-steps">
                  {swapUserSignApprovalTx && (
                    <div className="anime-wallet-usersign-step">
                      {t("wallet.userSignSellOneStep")}
                    </div>
                  )}
                  <div className="anime-wallet-usersign-step">
                    {swapUserSignApprovalTx
                      ? t("wallet.userSignSellTwoStep")
                      : t("wallet.userSignSwapOneStep")}
                  </div>
                </div>
                <div className="anime-wallet-usersign-actions">
                  {swapUserSignApprovalTx && (
                    <button
                      type="button"
                      className="anime-wallet-address-copy"
                      onClick={() => {
                        void handleCopyUserSignPayload(swapUserSignApprovalTx);
                      }}
                    >
                      {t("wallet.usersign.copyApproveTx")}
                    </button>
                  )}
                  {swapUserSignTx && (
                    <button
                      type="button"
                      className="anime-wallet-address-copy"
                      onClick={() => {
                        void handleCopyUserSignPayload(swapUserSignTx);
                      }}
                    >
                      {t("wallet.usersign.copySwapTx")}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {walletActionMode === "send" && (
          <div className="anime-wallet-action-body">
            <label className="anime-wallet-field">
              <span>{t("wallet.toAddressBsc")}</span>
              <input
                type="text"
                value={sendTo}
                onChange={(event) => setSendTo(event.target.value)}
                placeholder="0x..."
              />
            </label>
            <div className="anime-wallet-field-grid">
              <label className="anime-wallet-field">
                <span>{t("wallet.amount")}</span>
                <input
                  type="text"
                  value={sendAmount}
                  onChange={(event) => setSendAmount(event.target.value)}
                  placeholder="0.01"
                />
              </label>
              <label className="anime-wallet-field">
                <span>{t("wallet.asset")}</span>
                <select
                  value={sendAsset}
                  onChange={(event) => setSendAsset(event.target.value)}
                >
                  <option value="BNB">BNB</option>
                  <option value="USDT">USDT</option>
                  <option value="USDC">USDC</option>
                </select>
              </label>
            </div>
            <div className="anime-wallet-send-hint">{t("wallet.sendHint")}</div>
            <div className="anime-wallet-popover-actions">
              <button
                type="button"
                className="anime-wallet-popover-action"
                disabled={!sendReady || sendExecuteBusy}
                onClick={() => {
                  void handleSendExecute();
                }}
              >
                {sendExecuteBusy
                  ? t("wallet.executing")
                  : t("wallet.executeSend")}
              </button>
            </div>

            {sendUserSignTx && (
              <div className="anime-wallet-usersign">
                <div className="anime-wallet-usersign-title">
                  {t("wallet.userSignSendPayload")}
                </div>
                <div className="anime-wallet-usersign-actions">
                  <button
                    type="button"
                    className="anime-wallet-address-copy"
                    onClick={() => {
                      void handleCopyUserSignPayload(sendUserSignTx);
                    }}
                  >
                    {t("wallet.copySendPayload")}
                  </button>
                </div>
              </div>
            )}

            {sendLastTxHash && (
              <div className="anime-wallet-tx-row">
                <span>{t("wallet.latestTx")}</span>
                <code>{shortHash(sendLastTxHash)}</code>
                <a
                  href={`https://bscscan.com/tx/${sendLastTxHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="anime-wallet-tx-link"
                >
                  {t("wallet.view")}
                </a>
              </div>
            )}
          </div>
        )}

        {bscChainError && (
          <div className="anime-wallet-popover-error">
            {t("wallet.bscFeedError", { error: bscChainError })}
          </div>
        )}
      </div>
    </div>
  );
}
