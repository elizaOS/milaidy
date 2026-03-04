/**
 * Inventory view — BSC-first wallet balances, NFTs, and BSC trading.
 * Terminal-style layout inspired by GMGN / degen trading tools.
 */

import { useCallback, useMemo, useState } from "react";
import { useApp } from "../AppContext";
import type { EvmChainBalance } from "../api-client";
import { createTranslator } from "../i18n";
import { BscTradePanel, type TrackedToken } from "./BscTradePanel";

const BSC_GAS_READY_THRESHOLD = 0.005;
const BSC_GAS_THRESHOLD = 0.005;
const TRACKED_BSC_TOKENS_KEY = "wt_tracked_bsc_tokens";
const MAX_TRACKED_BSC_TOKENS = 30;
const HEX_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

/* ── Chain icon helper ─────────────────────────────────────────────── */

function chainIcon(chain: string): { code: string; cls: string } {
  const c = chain.toLowerCase();
  if (c === "ethereum" || c === "mainnet")
    return { code: "E", cls: "bg-chain-eth" };
  if (c === "base") return { code: "B", cls: "bg-chain-base" };
  if (c === "bsc") return { code: "B", cls: "bg-chain-bsc" };
  if (c === "arbitrum") return { code: "A", cls: "bg-chain-arb" };
  if (c === "optimism") return { code: "O", cls: "bg-chain-op" };
  if (c === "polygon") return { code: "P", cls: "bg-chain-pol" };
  if (c === "bsc" || c === "bnb chain" || c === "bnb smart chain")
    return { code: "B", cls: "bg-chain-bsc" };
  if (c === "solana") return { code: "S", cls: "bg-chain-sol" };
  return { code: chain.charAt(0).toUpperCase(), cls: "bg-bg-muted" };
}

function normalizeChainName(chain: string): string {
  return chain.trim().toLowerCase();
}

function isBscChainName(chain: string): boolean {
  const c = normalizeChainName(chain);
  return c === "bsc" || c === "bnb chain" || c === "bnb smart chain";
}

/* ── Balance formatter ────────────────────────────────────────────── */

function formatBalance(balance: string): string {
  const num = Number.parseFloat(balance);
  if (Number.isNaN(num)) return balance;
  if (num === 0) return "0";
  if (num < 0.0001) return "<0.0001";
  if (num < 1) return num.toFixed(6);
  if (num < 1000) return num.toFixed(4);
  return num.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

interface TrackedBscToken {
  contractAddress: string;
  symbol: string;
  name: string;
  logoUrl?: string;
}

function toNormalizedAddress(addr: string): string {
  return addr.trim().toLowerCase();
}

function loadTrackedBscTokens(): TrackedBscToken[] {
  try {
    const raw = localStorage.getItem(TRACKED_BSC_TOKENS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item): item is TrackedBscToken =>
          Boolean(item) &&
          typeof item === "object" &&
          typeof item.contractAddress === "string" &&
          typeof item.symbol === "string" &&
          typeof item.name === "string" &&
          (item.logoUrl === undefined || typeof item.logoUrl === "string") &&
          HEX_ADDRESS_RE.test(item.contractAddress),
      )
      .slice(0, MAX_TRACKED_BSC_TOKENS);
  } catch {
    return [];
  }
}

function saveTrackedBscTokens(next: TrackedBscToken[]): void {
  try {
    localStorage.setItem(TRACKED_BSC_TOKENS_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

function removeTrackedBscToken(
  contractAddress: string,
  prev: TrackedBscToken[],
): TrackedBscToken[] {
  const normalized = toNormalizedAddress(contractAddress);
  const next = prev.filter(
    (item) => toNormalizedAddress(item.contractAddress) !== normalized,
  );
  saveTrackedBscTokens(next);
  return next;
}

/* ── localStorage helpers for tracked tokens (develop) ──────────── */

function loadTrackedTokens(): TrackedToken[] {
  try {
    const raw = localStorage.getItem(TRACKED_BSC_TOKENS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as TrackedToken[];
  } catch {
    return [];
  }
}

function saveTrackedTokens(tokens: TrackedToken[]): void {
  try {
    localStorage.setItem(TRACKED_BSC_TOKENS_KEY, JSON.stringify(tokens));
  } catch {
    // ignore in non-browser test runtime
  }
}

/* ── Row types ─────────────────────────────────────────────────────── */

interface TokenRow {
  chain: string;
  symbol: string;
  name: string;
  contractAddress: string | null;
  logoUrl: string | null;
  balance: string;
  valueUsd: number;
  balanceRaw: number;
  isNative: boolean;
  isTracked?: boolean;
}

interface NftItem {
  chain: string;
  name: string;
  imageUrl: string;
  collectionName: string;
}

/* ── Token logo with CDN + fallback ──────────────────────────────── */

function tokenLogoUrl(
  chain: string,
  contractAddress: string | null,
): string | null {
  if (!contractAddress) {
    if (isBscChainName(chain))
      return "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/smartchain/info/logo.png";
    const c = chain.toLowerCase();
    if (c === "ethereum" || c === "mainnet")
      return "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png";
    if (c === "base")
      return "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/base/info/logo.png";
    if (c === "solana")
      return "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/solana/info/logo.png";
    return null;
  }
  if (isBscChainName(chain))
    return `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/smartchain/assets/${contractAddress}/logo.png`;
  const c = chain.toLowerCase();
  if (c === "ethereum" || c === "mainnet")
    return `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/${contractAddress}/logo.png`;
  return null;
}

function TokenLogo({
  symbol,
  chain,
  contractAddress,
  preferredLogoUrl = null,
  size = 32,
}: {
  symbol: string;
  chain: string;
  contractAddress: string | null;
  preferredLogoUrl?: string | null;
  size?: number;
}) {
  const [errored, setErrored] = useState(false);
  const usePreferredLogo = Boolean(preferredLogoUrl?.startsWith("http"));
  const url = errored
    ? null
    : usePreferredLogo
      ? preferredLogoUrl
      : tokenLogoUrl(chain, contractAddress);
  const icon = chainIcon(chain);

  if (url) {
    return (
      <img
        src={url}
        alt={symbol}
        width={size}
        height={size}
        className="wt__token-logo"
        onError={() => setErrored(true)}
      />
    );
  }
  return (
    <span
      className={`wt__token-logo is-letter ${icon.cls}`}
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {symbol.charAt(0).toUpperCase()}
    </span>
  );
}

/* ── Copyable address ─────────────────────────────────────────────── */

function CopyableAddress({
  address,
  onCopy,
}: {
  address: string;
  onCopy: (text: string) => Promise<void>;
}) {
  const [copied, setCopied] = useState(false);
  const short = `${address.slice(0, 6)}...${address.slice(-4)}`;

  const handleCopy = async () => {
    await onCopy(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <code className="font-mono text-xs text-muted select-all" title={address}>
        {short}
      </code>
      <button
        type="button"
        onClick={handleCopy}
        className="px-1.5 py-0.5 border border-border bg-bg text-[10px] font-mono cursor-pointer hover:border-accent hover:text-accent transition-colors"
      >
        {copied ? "copied" : "copy"}
      </button>
    </div>
  );
}

/* ── Status dot ───────────────────────────────────────────────────── */

function StatusDot({
  ready,
  label,
  title,
}: {
  ready: boolean;
  label: string;
  title?: string;
}) {
  return (
    <span
      className={`wt__status-dot ${ready ? "is-ready" : "is-off"}`}
      title={title}
    >
      <span className="wt__status-indicator" />
      {label}
    </span>
  );
}

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

  // ── Tracked tokens state (develop's BscTradePanel approach) ──────
  const [trackedTokens, setTrackedTokens] = useState<TrackedToken[]>(() =>
    loadTrackedTokens(),
  );

  // ── Tracked BSC tokens state (companion's enrichment approach) ───
  const [trackedBscTokens, setTrackedBscTokens] =
    useState<TrackedBscToken[]>(loadTrackedBscTokens);

  // ── Setup detection ──────────────────────────────────────────────────
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
    // Allow SettingsView to render, then scroll to wallet-rpc section
    setTimeout(() => {
      document
        .getElementById("wallet-rpc")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 150);
  }, [setTab]);

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

  const tradeReady = bnbBalance >= BSC_GAS_THRESHOLD;

  // ── Flatten & sort token rows ────────────────────────────────────
  const chainFocus = inventoryChainFocus ?? "all";

  const tokenRows = useMemo((): TokenRow[] => {
    const rows: TokenRow[] = [];

    // Derive EVM address directly from state so BNB row can be added
    // even before walletBalances is loaded or when evm is null.
    const knownEvmAddr =
      walletAddresses?.evmAddress ?? walletConfig?.evmAddress;

    if (walletBalances?.evm) {
      let hasBsc = false;
      for (const chain of walletBalances.evm.chains) {
        if (isBscChainName(chain.chain)) hasBsc = true;
        if (chainFocus === "bsc" && !isBscChainName(chain.chain)) continue;
        // Always include native token row -- even when chain has an error,
        // so BNB always appears when the wallet is connected.
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
        // Skip ERC-20 tokens when chain data errored
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
      // If BSC wasn't in the chains list but wallet address is known, add a placeholder
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
      // evm is null (RPC not connected yet) -- always show BNB row as placeholder
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
          .filter((row) => isBscChainName(row.chain) && row.contractAddress)
          .map((row) => toNormalizedAddress(row.contractAddress!)),
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

  // ── Flatten all NFTs into a single list ──────────────────────────────

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

  const evmAddr = walletAddresses?.evmAddress ?? walletConfig?.evmAddress;
  const solAddr = walletAddresses?.solanaAddress ?? walletConfig?.solanaAddress;

  const bscChainError =
    bscChain?.error ??
    chainErrors.find((chain) => isBscChainName(chain.chain))?.error ??
    null;
  const bscNativeBalance = bscChain?.nativeBalance ?? null;
  const bscNativeBalanceNum = Number.parseFloat(bscNativeBalance ?? "");

  const walletReady = Boolean(evmAddr);
  const rpcReady = Boolean(walletReady && bscChain && !bscChain.error);
  const gasReady =
    Boolean(rpcReady) &&
    Number.isFinite(bscNativeBalanceNum) &&
    bscNativeBalanceNum >= BSC_GAS_READY_THRESHOLD;

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

  // ── Tracked token handlers (develop's BscTradePanel approach) ─────

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
      // Remove from both tracked token stores
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

  // ════════════════════════════════════════════════════════════════════════
  // Render
  // ════════════════════════════════════════════════════════════════════════

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
        {/* ── Block 1: Portfolio header ─────────────────────────── */}
        <div className="wt__portfolio">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <div className="wt__portfolio-label">
                  {t("wallet.portfolio")}
                </div>
                <span className="wt__network-badge">
                  {t("wallet.bscMainnet")}
                </span>
              </div>
              <div
                className="wt__portfolio-value"
                data-testid="bsc-balance-value"
              >
                {totalUsd > 0
                  ? `$${totalUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  : "$0.00"}
              </div>
              {bscNativeBalance !== null && (
                <div className="wt__bnb-sub">
                  {formatBalance(bscNativeBalance)} BNB
                </div>
              )}
            </div>
            <div className="flex flex-col items-end gap-2">
              {evmAddr && (
                <button
                  type="button"
                  className="wt__receive-btn"
                  onClick={() => {
                    void copyToClipboard(evmAddr);
                    setActionNotice(t("wallet.addressCopied"), "success", 2400);
                  }}
                  title={evmAddr}
                >
                  {t("wallet.receive")}
                </button>
              )}
              {evmAddr && (
                <CopyableAddress address={evmAddr} onCopy={copyToClipboard} />
              )}
            </div>
          </div>
          <div className="wt__status-row mt-2">
            <StatusDot
              ready={walletReady}
              label={
                walletReady
                  ? t("wallet.status.connected")
                  : t("wallet.status.noWallet")
              }
              title={
                walletReady
                  ? t("wallet.status.connectedTitle")
                  : t("wallet.status.noWalletTitle")
              }
            />
            <StatusDot
              ready={rpcReady}
              label={
                rpcReady
                  ? t("wallet.status.feedLive")
                  : t("wallet.status.feedOffline")
              }
              title={
                rpcReady
                  ? t("wallet.status.feedLiveTitle")
                  : bscChainError
                    ? t("wallet.status.feedErrorTitle", {
                        error: bscChainError,
                      })
                    : t("wallet.status.feedOfflineTitle")
              }
            />
            <StatusDot
              ready={gasReady}
              label={
                gasReady
                  ? t("wallet.status.tradeReady")
                  : t("wallet.status.tradeNotReady")
              }
              title={
                gasReady
                  ? t("wallet.status.tradeReadyTitle")
                  : rpcReady
                    ? t("wallet.status.tradeNeedGasTitle", {
                        threshold: BSC_GAS_READY_THRESHOLD,
                      })
                    : t("wallet.status.tradeFeedRequired")
              }
            />
          </div>
          {/* Inline BSC error with retry */}
          {bscChainError && (
            <div className="wt__error-inline mt-2">
              <span className="wt__error-inline-text">
                BSC: {bscChainError}
              </span>
              <button
                type="button"
                className="wt__error-retry"
                onClick={() => void loadBalances()}
                title={t("wallet.retryFetchingBsc")}
              >
                {t("common.retry")}
              </button>
            </div>
          )}

          {/* BSC trade requires a dedicated RPC endpoint */}
          {evmAddr && !hasManagedBscRpc && (
            <div className="mt-2 px-3 py-2 border border-[rgba(184,134,11,0.55)] bg-[rgba(184,134,11,0.08)] text-[11px]">
              <div className="font-bold mb-1">
                {t("wallet.setup.rpcNotConfigured")}
              </div>
              <div className="text-[var(--muted)] leading-relaxed">
                Connect via Eliza Cloud or configure a custom BSC RPC provider
                (NodeReal / QuickNode) to enable trading.
              </div>
              <div className="mt-2">
                <button
                  type="button"
                  className="px-3 py-1 border border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-foreground)] cursor-pointer text-[11px] font-mono hover:bg-[var(--accent-hover)] hover:border-[var(--accent-hover)]"
                  onClick={goToRpcSettings}
                >
                  Configure RPC
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── BSC trade panel (from develop's BscTradePanel) ──── */}
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

        {/* ── Block 2: Toolbar + content ────────────────────────── */}
        <div>
          <div className="wt__toolbar">
            <button
              type="button"
              className={`wt__tab ${inventoryView === "tokens" ? "is-active" : ""}`}
              onClick={() => {
                setState("inventoryView", "tokens");
                if (!walletBalances) void loadBalances();
              }}
            >
              {t("wallet.tokens")}
            </button>
            <button
              type="button"
              className={`wt__tab ${inventoryView === "nfts" ? "is-active" : ""}`}
              onClick={() => {
                setState("inventoryView", "nfts");
                if (!walletNfts) void loadNfts();
              }}
            >
              {t("wallet.nfts")}
            </button>

            {inventoryView === "tokens" && (
              <>
                <span className="wt__sep" />
                <button
                  type="button"
                  data-testid="wallet-focus-bsc"
                  className={`wt__chip ${inventoryChainFocus === "bsc" ? "is-active" : ""}`}
                  onClick={() => setState("inventoryChainFocus", "bsc")}
                >
                  BSC
                </button>
                <button
                  type="button"
                  data-testid="wallet-focus-all"
                  className={`wt__chip ${inventoryChainFocus === "all" ? "is-active" : ""}`}
                  onClick={() => setState("inventoryChainFocus", "all")}
                >
                  {t("wallet.all")}
                </button>

                <span className="flex-1" />

                <span className="text-[10px] text-muted font-mono">
                  {t("wallet.sort")}:
                </span>
                <button
                  type="button"
                  className={`wt__chip ${inventorySort === "value" ? "is-active" : ""}`}
                  onClick={() => setState("inventorySort", "value")}
                >
                  {t("wallet.value")}
                </button>
                <button
                  type="button"
                  className={`wt__chip ${inventorySort === "chain" ? "is-active" : ""}`}
                  onClick={() => setState("inventorySort", "chain")}
                >
                  {t("wallet.chain")}
                </button>
                <button
                  type="button"
                  className={`wt__chip ${inventorySort === "symbol" ? "is-active" : ""}`}
                  onClick={() => setState("inventorySort", "symbol")}
                >
                  {t("wallet.name")}
                </button>
              </>
            )}

            <button
              type="button"
              className="wt__refresh"
              onClick={() =>
                inventoryView === "tokens" ? loadBalances() : loadNfts()
              }
            >
              Refresh
            </button>
          </div>

          {inventoryView === "tokens" ? renderTokensView() : renderNftsView()}
        </div>
      </div>
    );
  }

  function renderTokensView() {
    if (walletLoading) {
      return (
        <div className="text-center py-10 text-muted italic text-xs">
          {t("wallet.loadingBalances")}
        </div>
      );
    }

    if (visibleRows.length === 0) {
      return (
        <div className="text-center py-8 text-muted italic text-xs">
          {walletBalances
            ? t("wallet.noTokensFound")
            : t("wallet.noDataRefresh")}
        </div>
      );
    }

    return (
      <>
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-border">
              <th className="pl-3 pr-2 py-2 text-left w-12" />
              <th className="px-3 py-2 text-left text-[10px] text-muted font-bold uppercase tracking-wide">
                {t("wallet.table.token")}
              </th>
              <th className="px-3 py-2 text-right text-[10px] text-muted font-bold uppercase tracking-wide">
                {t("wallet.table.balance")}
              </th>
              <th className="px-3 py-2 text-right text-[10px] text-muted font-bold uppercase tracking-wide">
                {t("wallet.table.value")}
              </th>
              <th className="pl-3 pr-3 py-2 text-right w-24" />
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row, idx) => (
              <tr
                key={`${row.chain}-${row.symbol}-${idx}`}
                className={`border-b border-border last:border-b-0 hover:bg-bg-hover transition-colors${row.isNative ? " wt__row--native" : ""}`}
              >
                {/* Logo */}
                <td className="pl-3 pr-2 py-3 align-middle">
                  <TokenLogo
                    symbol={row.symbol}
                    chain={row.chain}
                    contractAddress={row.contractAddress}
                    preferredLogoUrl={row.logoUrl}
                    size={32}
                  />
                </td>
                {/* Symbol + name */}
                <td className="px-3 py-3 align-middle">
                  <div className="flex items-center gap-2">
                    <div>
                      <div className="text-sm font-bold font-mono leading-tight">
                        {row.symbol}
                      </div>
                      <div className="text-[10px] text-muted leading-tight mt-0.5">
                        {row.isNative ? (
                          <span className="wt__native-badge">native gas</span>
                        ) : (
                          <span className="inline-flex items-center gap-1">
                            <span className="truncate max-w-[160px] inline-block">
                              {row.name}
                            </span>
                            {row.isTracked && (
                              <span className="wt__native-badge">
                                {t("wallet.manual")}
                              </span>
                            )}
                          </span>
                        )}
                      </div>
                    </div>
                    {inventoryChainFocus === "all" && (
                      <span className="text-[9px] text-muted font-mono border border-border px-1 py-0.5 rounded shrink-0">
                        {row.chain}
                      </span>
                    )}
                  </div>
                </td>
                {/* Balance */}
                <td className="px-3 py-3 align-middle font-mono text-sm text-right whitespace-nowrap">
                  {formatBalance(row.balance)}
                </td>
                {/* Value */}
                <td className="px-3 py-3 align-middle font-mono text-sm text-right text-muted whitespace-nowrap">
                  {row.valueUsd > 0
                    ? `$${row.valueUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                    : "\u2014"}
                </td>
                {/* Actions */}
                <td className="pl-2 pr-3 py-3 align-middle whitespace-nowrap text-right">
                  {row.isTracked && row.contractAddress && (
                    <button
                      type="button"
                      data-testid="wallet-token-untrack"
                      className="wt__row-btn is-remove"
                      title={t("wallet.removeManualTitle")}
                      onClick={() => handleUntrackToken(row.contractAddress!)}
                    >
                      {t("wallet.remove")}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {visibleChainErrors.length > 0 && (
          <div className="mt-1 text-[11px] text-muted px-3 pb-2">
            {visibleChainErrors.map((chain) => {
              const icon = chainIcon(chain.chain);
              return (
                <div key={chain.chain} className="py-0.5">
                  <span
                    className={`inline-block w-3 h-3 rounded-full text-center leading-3 text-[7px] font-bold font-mono text-white align-middle ${icon.cls}`}
                  >
                    {icon.code}
                  </span>{" "}
                  {chain.chain}:{" "}
                  {chain.error?.includes("not enabled") ? (
                    <>
                      data source not enabled &mdash;{" "}
                      <a
                        href="https://dashboard.alchemy.com/"
                        target="_blank"
                        rel="noopener"
                        className="text-accent"
                      >
                        {t("wallet.enableIt")}
                      </a>
                    </>
                  ) : (
                    chain.error
                  )}
                </div>
              );
            })}
          </div>
        )}
      </>
    );
  }

  function renderNftsView() {
    if (walletNftsLoading) {
      return (
        <div className="text-center py-10 text-muted italic text-xs">
          {t("wallet.loadingNfts")}
        </div>
      );
    }
    if (!walletNfts) {
      return (
        <div className="text-center py-10 text-muted italic text-xs">
          {t("wallet.noNftData")}
        </div>
      );
    }
    if (allNfts.length === 0) {
      return (
        <div className="text-center py-10 text-muted italic text-xs">
          {t("wallet.noNftsFound")}
        </div>
      );
    }

    return (
      <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2.5 mt-3 max-h-[60vh] overflow-y-auto">
        {allNfts.map((nft, idx) => {
          const icon = chainIcon(nft.chain);
          return (
            <div
              key={`${nft.chain}-${nft.name}-${idx}`}
              className="border border-border bg-card overflow-hidden"
            >
              {nft.imageUrl ? (
                <img
                  src={nft.imageUrl}
                  alt={nft.name}
                  loading="lazy"
                  className="w-full h-[150px] object-cover block bg-bg-muted"
                />
              ) : (
                <div className="w-full h-[150px] bg-bg-muted flex items-center justify-center text-[11px] text-muted">
                  {t("wallet.noImage")}
                </div>
              )}
              <div className="px-2 py-1.5">
                <div className="text-[11px] font-bold overflow-hidden text-ellipsis whitespace-nowrap">
                  {nft.name}
                </div>
                <div className="text-[10px] text-muted overflow-hidden text-ellipsis whitespace-nowrap">
                  {nft.collectionName}
                </div>
                <div className="inline-flex items-center gap-1 text-[10px] text-muted mt-0.5">
                  <span
                    className={`inline-block w-3 h-3 rounded-full text-center leading-3 text-[7px] font-bold font-mono text-white ${icon.cls}`}
                  >
                    {icon.code}
                  </span>
                  {nft.chain}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  }
}
