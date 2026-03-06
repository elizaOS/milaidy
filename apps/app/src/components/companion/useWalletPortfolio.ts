import { useEffect, useMemo, useState } from "react";
import type {
  WalletBalancesResponse,
  WalletNftsResponse,
} from "../../api-client";
import {
  BSC_NATIVE_LOGO_URL,
  fetchBscTokenMetadata,
  getTokenExplorerUrl,
  isBscChainName,
  MILADY_BSC_TOKEN_ADDRESS,
  resolvePortfolioChainKey,
  SOL_NATIVE_LOGO_URL,
  type TokenMetadata,
  type TranslatorFn,
  type WalletCollectibleRow,
  type WalletPortfolioChainFilter,
  type WalletTokenRow,
} from "./walletUtils";

export type UseWalletPortfolioArgs = {
  walletBalances: WalletBalancesResponse | null;
  walletNfts: WalletNftsResponse | null;
  walletPortfolioChain: WalletPortfolioChainFilter;
  walletSelectedTokenKey: string | null;
  walletPanelOpen: boolean;
  walletReady: boolean;
  t: TranslatorFn;
};

export function useWalletPortfolio(args: UseWalletPortfolioArgs) {
  const {
    walletBalances,
    walletNfts,
    walletPortfolioChain,
    walletSelectedTokenKey,
    walletPanelOpen,
    walletReady,
    t,
  } = args;

  // ---- Milady token metadata ----

  const [miladyTokenMeta, setMiladyTokenMeta] = useState<TokenMetadata>({
    symbol: "MILADY",
    name: "Milady",
    logoUrl: null,
  });
  const [miladyTokenMetaLoaded, setMiladyTokenMetaLoaded] = useState(false);

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

  // ---- Token rows ----

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

  // ---- Derived totals ----

  const walletTotalUsd = useMemo(() => {
    return walletTokenRows.reduce((sum, row) => sum + row.valueUsd, 0);
  }, [walletTokenRows]);

  // ---- Collectible rows ----

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

  // ---- Filtered rows ----

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

  // ---- Selected token ----

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

  // ---- Chain filter options ----

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

  return {
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
  };
}
