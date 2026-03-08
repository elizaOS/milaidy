/**
 * Custom hook: derives token rows, sorted rows, NFT items,
 * chain errors, and BSC-specific computed values from app state.
 */

import { useMemo } from "react";
import type {
  EvmChainBalance,
  WalletAddresses,
  WalletBalancesResponse,
  WalletConfigStatus,
  WalletNftsResponse,
} from "../../api-client";
import type { TrackedToken } from "../BscTradePanel";
import {
  isBscChainName,
  type NftItem,
  type TokenRow,
  type TrackedBscToken,
  toNormalizedAddress,
} from "./constants";

export interface InventoryDataInput {
  walletBalances: WalletBalancesResponse | null;
  walletAddresses: WalletAddresses | null;
  walletConfig: WalletConfigStatus | null;
  walletNfts: WalletNftsResponse | null;
  inventorySort: string;
  inventoryChainFocus: string | null;
  trackedBscTokens: TrackedBscToken[];
  trackedTokens: TrackedToken[];
}

export interface InventoryDataOutput {
  chainFocus: string;
  tokenRows: TokenRow[];
  sortedRows: TokenRow[];
  chainErrors: EvmChainBalance[];
  bscHasError: boolean;
  allNfts: NftItem[];
  bscChain: EvmChainBalance | null;
  bnbBalance: number;
  bscRows: TokenRow[];
  visibleRows: TokenRow[];
  totalUsd: number;
  visibleChainErrors: EvmChainBalance[];
  bscChainError: string | null;
  bscNativeBalance: string | null;
}

function hasContractAddress(
  row: TokenRow,
): row is TokenRow & { contractAddress: string } {
  return typeof row.contractAddress === "string";
}

export function useInventoryData({
  walletBalances,
  walletAddresses,
  walletConfig,
  walletNfts,
  inventorySort,
  inventoryChainFocus,
  trackedBscTokens,
  trackedTokens,
}: InventoryDataInput): InventoryDataOutput {
  const chainFocus = inventoryChainFocus ?? "all";

  // ── BSC chain data ────────────────────────────────────────────────
  const bscChain = useMemo(() => {
    if (!walletBalances?.evm?.chains) return null;
    return (
      walletBalances.evm.chains.find(
        (c: EvmChainBalance) => c.chain === "BSC" || c.chain === "bsc",
      ) ?? null
    );
  }, [walletBalances]);

  const bnbBalance = useMemo(() => {
    if (!bscChain) return 0;
    return Number.parseFloat(bscChain.nativeBalance) || 0;
  }, [bscChain]);

  // ── Flatten token rows ────────────────────────────────────────────
  const tokenRows = useMemo((): TokenRow[] => {
    const rows: TokenRow[] = [];
    const knownEvmAddr =
      walletAddresses?.evmAddress ?? walletConfig?.evmAddress;

    if (walletBalances?.evm) {
      let hasBsc = false;
      for (const chain of walletBalances.evm.chains) {
        if (isBscChainName(chain.chain)) hasBsc = true;
        if (chainFocus === "bsc" && !isBscChainName(chain.chain)) continue;
        rows.push({
          chain: chain.chain,
          symbol: chain.nativeSymbol,
          name: `${chain.chain} native`,
          contractAddress: null,
          logoUrl: null,
          balance: chain.nativeBalance,
          valueUsd: Number.parseFloat(chain.nativeValueUsd) || 0,
          balanceRaw: Number.parseFloat(chain.nativeBalance) || 0,
          isNative: true,
        });
        if (chain.error) continue;
        for (const tk of chain.tokens) {
          rows.push({
            chain: chain.chain,
            symbol: tk.symbol,
            name: tk.name,
            contractAddress: tk.contractAddress ?? null,
            logoUrl: tk.logoUrl ?? null,
            balance: tk.balance,
            valueUsd: Number.parseFloat(tk.valueUsd) || 0,
            balanceRaw: Number.parseFloat(tk.balance) || 0,
            isNative: false,
            isTracked: false,
          });
        }
      }
      if (!hasBsc && knownEvmAddr) {
        rows.unshift({
          chain: "BSC",
          symbol: "BNB",
          name: "BSC native",
          contractAddress: null,
          logoUrl: null,
          balance: "0",
          valueUsd: 0,
          balanceRaw: 0,
          isNative: true,
        });
      }
    } else if (knownEvmAddr) {
      rows.push({
        chain: "BSC",
        symbol: "BNB",
        name: "BSC native",
        contractAddress: null,
        logoUrl: null,
        balance: "0",
        valueUsd: 0,
        balanceRaw: 0,
        isNative: true,
      });
    }

    if (chainFocus !== "bsc" && walletBalances?.solana) {
      rows.push({
        chain: "Solana",
        symbol: "SOL",
        name: "Solana native",
        contractAddress: null,
        logoUrl: null,
        balance: walletBalances.solana.solBalance,
        valueUsd: Number.parseFloat(walletBalances.solana.solValueUsd) || 0,
        balanceRaw: Number.parseFloat(walletBalances.solana.solBalance) || 0,
        isNative: true,
      });
      for (const tk of walletBalances.solana.tokens) {
        rows.push({
          chain: "Solana",
          symbol: tk.symbol,
          name: tk.name,
          contractAddress: tk.mint ?? null,
          logoUrl: tk.logoUrl ?? null,
          balance: tk.balance,
          valueUsd: Number.parseFloat(tk.valueUsd) || 0,
          balanceRaw: Number.parseFloat(tk.balance) || 0,
          isNative: false,
        });
      }
    }

    // Add tracked tokens not already in the list
    if (chainFocus === "bsc" || chainFocus === "all") {
      const knownBscContracts = new Set(
        rows
          .filter(
            (row): row is TokenRow & { contractAddress: string } =>
              isBscChainName(row.chain) && hasContractAddress(row),
          )
          .map((row) => toNormalizedAddress(row.contractAddress)),
      );
      for (const tracked of trackedBscTokens) {
        const normalized = toNormalizedAddress(tracked.contractAddress);
        if (knownBscContracts.has(normalized)) continue;
        rows.push({
          chain: "BSC",
          symbol: tracked.symbol,
          name: tracked.name,
          contractAddress: tracked.contractAddress,
          logoUrl: tracked.logoUrl ?? null,
          balance: "0",
          valueUsd: 0,
          balanceRaw: 0,
          isNative: false,
          isTracked: true,
        });
      }
      for (const tracked of trackedTokens) {
        const exists = rows.some(
          (r) =>
            r.contractAddress?.toLowerCase() === tracked.address.toLowerCase(),
        );
        if (!exists) {
          rows.push({
            chain: "BSC",
            symbol: `TKN-${tracked.address.slice(2, 6)}`,
            name: tracked.symbol || `Token ${tracked.address.slice(0, 10)}...`,
            contractAddress: tracked.address,
            logoUrl: null,
            balance: "0",
            valueUsd: 0,
            balanceRaw: 0,
            isNative: false,
            isTracked: true,
          });
        }
      }
    }

    return rows;
  }, [
    walletBalances,
    walletAddresses,
    walletConfig,
    trackedBscTokens,
    chainFocus,
    trackedTokens,
  ]);

  // ── Sort ──────────────────────────────────────────────────────────
  const sortedRows = useMemo(() => {
    const sorted = [...tokenRows];
    if (inventorySort === "value") {
      sorted.sort(
        (a, b) => b.valueUsd - a.valueUsd || b.balanceRaw - a.balanceRaw,
      );
    } else if (inventorySort === "chain") {
      sorted.sort(
        (a, b) =>
          a.chain.localeCompare(b.chain) || a.symbol.localeCompare(b.symbol),
      );
    } else if (inventorySort === "symbol") {
      sorted.sort(
        (a, b) =>
          a.symbol.localeCompare(b.symbol) || a.chain.localeCompare(b.chain),
      );
    }
    return sorted;
  }, [tokenRows, inventorySort]);

  // ── Chain errors ──────────────────────────────────────────────────
  const chainErrors = useMemo(
    () =>
      (walletBalances?.evm?.chains ?? []).filter(
        (c: EvmChainBalance) => c.error,
      ),
    [walletBalances],
  );

  const bscHasError = useMemo(
    () => chainErrors.some((c: EvmChainBalance) => c.chain === "BSC"),
    [chainErrors],
  );

  // ── Flatten NFTs ──────────────────────────────────────────────────
  const allNfts = useMemo((): NftItem[] => {
    if (!walletNfts) return [];
    const items: NftItem[] = [];
    for (const chainData of walletNfts.evm) {
      for (const nft of chainData.nfts) {
        items.push({
          chain: chainData.chain,
          name: nft.name,
          imageUrl: nft.imageUrl,
          collectionName: nft.collectionName || nft.tokenType,
        });
      }
    }
    if (walletNfts.solana) {
      for (const nft of walletNfts.solana.nfts) {
        items.push({
          chain: "Solana",
          name: nft.name,
          imageUrl: nft.imageUrl,
          collectionName: nft.collectionName,
        });
      }
    }
    return items;
  }, [walletNfts]);

  // ── Derived values ────────────────────────────────────────────────
  const bscChainError =
    bscChain?.error ??
    chainErrors.find((chain) => isBscChainName(chain.chain))?.error ??
    null;
  const bscNativeBalance: string | null = bscChain?.nativeBalance ?? null;

  const bscRows = sortedRows.filter((row) => isBscChainName(row.chain));
  const visibleRows = inventoryChainFocus === "bsc" ? bscRows : sortedRows;

  const totalUsd = useMemo(
    () =>
      (inventoryChainFocus === "bsc" ? bscRows : tokenRows).reduce(
        (sum, r) => sum + r.valueUsd,
        0,
      ),
    [tokenRows, bscRows, inventoryChainFocus],
  );

  const visibleChainErrors =
    inventoryChainFocus === "bsc"
      ? chainErrors.filter((chain) => isBscChainName(chain.chain))
      : chainErrors;

  return {
    chainFocus,
    tokenRows,
    sortedRows,
    chainErrors,
    bscHasError,
    allNfts,
    bscChain,
    bnbBalance,
    bscRows,
    visibleRows,
    totalUsd,
    visibleChainErrors,
    bscChainError,
    bscNativeBalance,
  };
}
