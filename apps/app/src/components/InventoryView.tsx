/**
 * Inventory view — wallet balances, NFTs, and BSC trading.
 */

import { useCallback, useMemo, useState } from "react";
import { useApp } from "../AppContext";
import type { EvmChainBalance } from "../api-client";

/* ── Constants ─────────────────────────────────────────────────────── */

const BSC_GAS_THRESHOLD = 0.005;
const BSC_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const AMOUNT_PRESETS = [0.05, 0.1, 0.2, 0.5];
const LS_TRACKED_TOKENS_KEY = "wt_tracked_bsc_tokens";

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
  if (c === "solana") return { code: "S", cls: "bg-chain-sol" };
  return { code: chain.charAt(0).toUpperCase(), cls: "bg-bg-muted" };
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

/* ── Row types ───────────────────────────────────────────────────────── */

interface TokenRow {
  chain: string;
  symbol: string;
  name: string;
  balance: string;
  valueUsd: number;
  balanceRaw: number;
  contractAddress?: string;
  isTracked?: boolean;
}

interface NftItem {
  chain: string;
  name: string;
  imageUrl: string;
  collectionName: string;
}

interface TrackedToken {
  address: string;
  symbol: string;
  addedAt: number;
}

/* ── localStorage helpers for tracked tokens ──────────────────────── */

function loadTrackedTokens(): TrackedToken[] {
  try {
    const raw = localStorage.getItem(LS_TRACKED_TOKENS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as TrackedToken[];
  } catch {
    return [];
  }
}

function saveTrackedTokens(tokens: TrackedToken[]): void {
  try {
    localStorage.setItem(LS_TRACKED_TOKENS_KEY, JSON.stringify(tokens));
  } catch {
    // ignore in non-browser test runtime
  }
}

/* ── Copyable address (inline, for section headers) ──────────────────── */

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
    <div className="ml-auto flex items-center gap-2">
      <code
        className="font-mono text-xs text-muted truncate select-all"
        title={address}
      >
        {short}
      </code>
      <button
        type="button"
        onClick={handleCopy}
        className="px-2 py-0.5 border border-border bg-bg text-[10px] font-mono cursor-pointer hover:border-accent hover:text-accent transition-colors shrink-0"
      >
        {copied ? "copied" : "copy"}
      </button>
    </div>
  );
}

/* ── Component ───────────────────────────────────────────────────────── */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AppContext = Record<string, any>;

export function InventoryView() {
  const ctx = useApp() as AppContext;
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
    copyToClipboard,
    setActionNotice,
    getBscTradePreflight,
    getBscTradeQuote,
    executeBscTrade,
    getBscTradeTxStatus,
  } = ctx;

  // ── BSC quick trade state ─────────────────────────────────────────
  const [quickTokenAddress, setQuickTokenAddress] = useState("");
  const [quickAmount, setQuickAmount] = useState("");
  const [latestQuote, setLatestQuote] = useState<Record<string, unknown> | null>(null);
  const [latestExecution, setLatestExecution] = useState<Record<string, unknown> | null>(null);
  const [txStatus, setTxStatus] = useState<Record<string, unknown> | null>(null);
  const [trackedTokens, setTrackedTokens] = useState<TrackedToken[]>(() => loadTrackedTokens());

  // ── Setup detection ──────────────────────────────────────────────────
  const cfg = walletConfig;
  const hasBscRpc = cfg?.nodeRealBscRpcSet || cfg?.quickNodeBscRpcSet || cfg?.managedBscRpcReady;
  const hasGeneralRpc = cfg?.alchemyKeySet || cfg?.ankrKeySet || cfg?.infuraKeySet;
  const needsSetup =
    !cloudConnected && (!cfg || (!hasGeneralRpc && !hasBscRpc && !cfg.alchemyKeySet && !cfg.heliusKeySet));

  // ── BSC chain data ────────────────────────────────────────────────
  const bscChain = useMemo(() => {
    if (!walletBalances?.evm?.chains) return null;
    return walletBalances.evm.chains.find(
      (c: EvmChainBalance) => c.chain === "BSC" || c.chain === "bsc",
    ) ?? null;
  }, [walletBalances]);

  const bnbBalance = useMemo(() => {
    if (!bscChain) return 0;
    return Number.parseFloat(bscChain.nativeBalance) || 0;
  }, [bscChain]);

  const tradeReady = bnbBalance >= BSC_GAS_THRESHOLD;

  // ── Flatten & sort token rows (skip errored chains) ────────────────
  const chainFocus = inventoryChainFocus ?? "all";

  const tokenRows = useMemo((): TokenRow[] => {
    if (!walletBalances) return [];
    const rows: TokenRow[] = [];

    if (walletBalances.evm) {
      for (const chain of walletBalances.evm.chains) {
        if (chain.error) continue;
        if (chainFocus === "bsc" && chain.chain !== "BSC") continue;
        rows.push({
          chain: chain.chain,
          symbol: chain.nativeSymbol,
          name: `${chain.chain} native`,
          balance: chain.nativeBalance,
          valueUsd: Number.parseFloat(chain.nativeValueUsd) || 0,
          balanceRaw: Number.parseFloat(chain.nativeBalance) || 0,
        });
        for (const t of chain.tokens) {
          rows.push({
            chain: chain.chain,
            symbol: t.symbol,
            name: t.name,
            balance: t.balance,
            valueUsd: Number.parseFloat(t.valueUsd) || 0,
            balanceRaw: Number.parseFloat(t.balance) || 0,
            contractAddress: t.contractAddress,
          });
        }
      }
    }

    if (chainFocus !== "bsc" && walletBalances.solana) {
      rows.push({
        chain: "Solana",
        symbol: "SOL",
        name: "Solana native",
        balance: walletBalances.solana.solBalance,
        valueUsd: Number.parseFloat(walletBalances.solana.solValueUsd) || 0,
        balanceRaw: Number.parseFloat(walletBalances.solana.solBalance) || 0,
      });
      for (const t of walletBalances.solana.tokens) {
        rows.push({
          chain: "Solana",
          symbol: t.symbol,
          name: t.name,
          balance: t.balance,
          valueUsd: Number.parseFloat(t.valueUsd) || 0,
          balanceRaw: Number.parseFloat(t.balance) || 0,
        });
      }
    }

    // Add tracked tokens not already in the list
    if (chainFocus === "bsc" || chainFocus === "all") {
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
            balance: "0",
            valueUsd: 0,
            balanceRaw: 0,
            contractAddress: tracked.address,
            isTracked: true,
          });
        }
      }
    }

    return rows;
  }, [walletBalances, chainFocus, trackedTokens]);

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

  // ── Chain errors ─────────────────────────────────────────────────────

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

  // ── BSC trade handlers ───────────────────────────────────────────
  const handleQuickBuy = useCallback(async () => {
    if (!getBscTradeQuote) return;
    const result = await getBscTradeQuote({
      side: "buy",
      tokenAddress: quickTokenAddress,
      amount: quickAmount,
    });
    setLatestQuote(result);
  }, [getBscTradeQuote, quickTokenAddress, quickAmount]);

  const handleQuickSell = useCallback(async () => {
    if (!getBscTradeQuote) return;
    const result = await getBscTradeQuote({
      side: "sell",
      tokenAddress: quickTokenAddress,
      amount: quickAmount,
    });
    setLatestQuote(result);
  }, [getBscTradeQuote, quickTokenAddress, quickAmount]);

  const handleExecute = useCallback(async () => {
    if (!executeBscTrade || !latestQuote) return;
    const confirmed = window.confirm(
      `Execute ${(latestQuote as Record<string, unknown>).side} trade?`,
    );
    if (!confirmed) return;
    const result = await executeBscTrade({
      side: (latestQuote as Record<string, unknown>).side,
      tokenAddress: quickTokenAddress,
      amount: quickAmount,
    });
    setLatestExecution(result);
    if (result?.executed && result?.execution) {
      // Already executed on-chain
    } else if (result?.requiresUserSignature) {
      if (setActionNotice) {
        setActionNotice(
          "Sign swap transaction in your wallet to complete the trade.",
          "info",
          4600,
        );
      }
    }
  }, [executeBscTrade, latestQuote, quickTokenAddress, quickAmount, setActionNotice]);

  const handleRefreshTxStatus = useCallback(async () => {
    if (!getBscTradeTxStatus || !latestExecution) return;
    const exec = latestExecution as Record<string, unknown>;
    const execution = exec.execution as Record<string, unknown> | undefined;
    const hash = execution?.hash as string | undefined;
    if (!hash) return;
    const status = await getBscTradeTxStatus(hash);
    setTxStatus(status);
  }, [getBscTradeTxStatus, latestExecution]);

  const handleAddToken = useCallback(() => {
    if (!BSC_ADDRESS_RE.test(quickTokenAddress)) return;
    const newToken: TrackedToken = {
      address: quickTokenAddress,
      symbol: `TKN-${quickTokenAddress.slice(2, 6)}`,
      addedAt: Date.now(),
    };
    const updated = [...trackedTokens, newToken];
    setTrackedTokens(updated);
    saveTrackedTokens(updated);
    if (setActionNotice) {
      setActionNotice("Token added to watchlist.", "success", 2600);
    }
  }, [quickTokenAddress, trackedTokens, setActionNotice]);

  const handleUntrackToken = useCallback(
    (address: string) => {
      const updated = trackedTokens.filter(
        (t) => t.address.toLowerCase() !== address.toLowerCase(),
      );
      setTrackedTokens(updated);
      saveTrackedTokens(updated);
    },
    [trackedTokens],
  );

  // ════════════════════════════════════════════════════════════════════════
  // Render
  // ════════════════════════════════════════════════════════════════════════

  return (
    <div>
      {/* Top-level error (always shown) */}
      {walletError && (
        <div className="mt-3 px-3.5 py-2.5 border border-danger bg-[rgba(231,76,60,0.06)] text-xs text-danger">
          {walletError}
        </div>
      )}

      {needsSetup ? renderSetup() : renderContent()}
    </div>
  );

  /* ── Setup view ──────────────────────────────────────────────────── */

  function renderSetup() {
    return (
      <div className="mt-6 border border-border bg-card p-6 text-center">
        <div className="text-sm font-bold mb-2">Wallet keys not configured</div>
        <p className="text-xs text-muted mb-4 leading-relaxed max-w-md mx-auto">
          To view balances and trade on BSC you need RPC provider keys.
          Connect to <strong>Eliza Cloud</strong> for managed RPC access, or
          configure <strong>NodeReal / QuickNode</strong> endpoints manually in{" "}
          <strong>Settings</strong>.
        </p>
        <button
          type="button"
          className="px-4 py-1.5 border border-accent bg-accent text-accent-fg cursor-pointer text-xs font-mono hover:bg-accent-hover hover:border-accent-hover"
          onClick={() => setTab("settings")}
        >
          Open Settings
        </button>
      </div>
    );
  }

  /* ── Content view ────────────────────────────────────────────────── */

  function renderContent() {
    return (
      <>
        {/* Header */}
        <div className="flex items-center gap-2 mt-3">
          <span className="text-sm font-bold">Portfolio</span>
          <div className="ml-auto flex items-center gap-1.5">
            <button
              type="button"
              data-testid="wallet-focus-bsc"
              className={`px-2.5 py-0.5 border cursor-pointer text-[11px] font-mono ${
                chainFocus === "bsc"
                  ? "border-accent text-accent"
                  : "border-border bg-bg hover:border-accent hover:text-accent"
              }`}
              onClick={() => setState("inventoryChainFocus", "bsc")}
            >
              BSC
            </button>
            <button
              type="button"
              data-testid="wallet-focus-all"
              className={`px-2.5 py-0.5 border cursor-pointer text-[11px] font-mono ${
                chainFocus === "all"
                  ? "border-accent text-accent"
                  : "border-border bg-bg hover:border-accent hover:text-accent"
              }`}
              onClick={() => setState("inventoryChainFocus", "all")}
            >
              All
            </button>
          </div>
        </div>

        {/* Toolbar: tabs + sort buttons + refresh */}
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <button
            type="button"
            className={`inline-block px-4 py-1 cursor-pointer border border-border bg-bg text-[13px] font-mono hover:border-accent hover:text-accent ${
              inventoryView === "tokens"
                ? "border-accent text-accent font-bold"
                : ""
            }`}
            onClick={() => {
              setState("inventoryView", "tokens");
              if (!walletBalances) void loadBalances();
            }}
          >
            Tokens
          </button>
          <button
            type="button"
            className={`inline-block px-4 py-1 cursor-pointer border border-border bg-bg text-[13px] font-mono hover:border-accent hover:text-accent ${
              inventoryView === "nfts"
                ? "border-accent text-accent font-bold"
                : ""
            }`}
            onClick={() => {
              setState("inventoryView", "nfts");
              if (!walletNfts) void loadNfts();
            }}
          >
            NFTs
          </button>

          <div className="ml-auto flex items-center gap-1.5">
            {inventoryView === "tokens" && (
              <>
                <span
                  className="text-[10px] text-muted uppercase"
                  style={{ letterSpacing: "0.05em" }}
                >
                  Sort:
                </span>
                <button
                  type="button"
                  className={`px-2.5 py-0.5 border border-border bg-bg cursor-pointer text-[11px] font-mono hover:border-accent hover:text-accent ${
                    inventorySort === "value" ? "border-accent text-accent" : ""
                  }`}
                  onClick={() => setState("inventorySort", "value")}
                >
                  Value
                </button>
                <button
                  type="button"
                  className={`px-2.5 py-0.5 border border-border bg-bg cursor-pointer text-[11px] font-mono hover:border-accent hover:text-accent ${
                    inventorySort === "chain" ? "border-accent text-accent" : ""
                  }`}
                  onClick={() => setState("inventorySort", "chain")}
                >
                  Chain
                </button>
                <button
                  type="button"
                  className={`px-2.5 py-0.5 border border-border bg-bg cursor-pointer text-[11px] font-mono hover:border-accent hover:text-accent ${
                    inventorySort === "symbol"
                      ? "border-accent text-accent"
                      : ""
                  }`}
                  onClick={() => setState("inventorySort", "symbol")}
                >
                  Name
                </button>
              </>
            )}
            <button
              type="button"
              className="px-2.5 py-0.5 border border-accent bg-accent text-accent-fg cursor-pointer text-[11px] font-mono hover:bg-accent-hover hover:border-accent-hover"
              onClick={() =>
                inventoryView === "tokens" ? loadBalances() : loadNfts()
              }
            >
              Refresh
            </button>
          </div>
        </div>

        {inventoryView === "tokens" ? renderTokensView() : renderNftsView()}
      </>
    );
  }

  /* ── Tokens view (section per chain) ─────────────────────────────── */

  function renderTokensView() {
    if (walletLoading) {
      return (
        <div className="text-center py-10 text-muted italic mt-6">
          Loading balances...
        </div>
      );
    }

    const evmAddr = walletAddresses?.evmAddress ?? walletConfig?.evmAddress;
    const solAddr =
      walletAddresses?.solanaAddress ?? walletConfig?.solanaAddress;

    if (!evmAddr && !solAddr) {
      return (
        <div className="text-center py-10 text-muted italic mt-6">
          No wallets connected. Configure wallets in{" "}
          <a
            href="/settings"
            onClick={(e) => {
              e.preventDefault();
              setTab("settings");
            }}
            className="text-accent"
          >
            Settings
          </a>
          .
        </div>
      );
    }

    const evmRows = sortedRows.filter(
      (r) => r.chain.toLowerCase() !== "solana",
    );
    const solanaRows = sortedRows.filter(
      (r) => r.chain.toLowerCase() === "solana",
    );

    return (
      <div className="mt-3 space-y-3">
        {/* BSC trade status bar */}
        {chainFocus === "bsc" && renderBscStatusBar()}

        {/* BSC chain error */}
        {bscHasError && (
          <div className="px-3 py-2 border border-danger bg-[rgba(231,76,60,0.06)] text-xs text-danger">
            Feed Offline
          </div>
        )}

        {/* Quick trade panel (BSC focus) */}
        {chainFocus === "bsc" && !bscHasError && renderQuickTradePanel()}

        {evmAddr &&
          renderChainSection(
            chainFocus === "bsc" ? "BSC" : "Ethereum",
            chainFocus === "bsc" ? "B" : "E",
            chainFocus === "bsc" ? "bg-chain-bsc" : "bg-chain-eth",
            evmAddr,
            evmRows,
            chainFocus !== "bsc",
          )}
        {chainFocus !== "bsc" && solAddr &&
          renderChainSection(
            "Solana",
            "S",
            "bg-chain-sol",
            solAddr,
            solanaRows,
            false,
          )}

        {/* Per-chain RPC errors (non-BSC) */}
        {chainErrors.filter((c: EvmChainBalance) => c.chain !== "BSC").length > 0 && (
          <div className="text-[11px] text-muted">
            {chainErrors
              .filter((c: EvmChainBalance) => c.chain !== "BSC")
              .map((c: EvmChainBalance) => {
                const icon = chainIcon(c.chain);
                return (
                  <div key={c.chain} className="py-0.5">
                    <span
                      className={`inline-block w-3 h-3 rounded-full text-center leading-3 text-[7px] font-bold font-mono text-white align-middle ${icon.cls}`}
                    >
                      {icon.code}
                    </span>{" "}
                    {c.chain}:{" "}
                    {c.error?.includes("not enabled") ? (
                      <>
                        Not enabled in Alchemy &mdash;{" "}
                        <a
                          href="https://dashboard.alchemy.com/"
                          target="_blank"
                          rel="noopener"
                          className="text-accent"
                        >
                          enable it
                        </a>
                      </>
                    ) : (
                      c.error
                    )}
                  </div>
                );
              })}
          </div>
        )}
      </div>
    );
  }

  /* ── BSC status bar ────────────────────────────────────────────────── */

  function renderBscStatusBar() {
    return (
      <div className="flex items-center gap-2 text-xs">
        <span className={tradeReady ? "text-green-500" : "text-yellow-500"}>
          {tradeReady ? "Trade Ready" : "Trade Not Ready"}
        </span>
        <span className="text-muted">
          BNB: {formatBalance(String(bnbBalance))}
        </span>
        {getBscTradePreflight && (
          <button
            type="button"
            data-testid="wallet-token-preflight"
            className="px-2 py-0.5 border border-border bg-bg text-[10px] font-mono cursor-pointer hover:border-accent"
            onClick={() => getBscTradePreflight()}
          >
            Preflight
          </button>
        )}
        {getBscTradeQuote && (
          <button
            type="button"
            data-testid="wallet-token-quote"
            className="px-2 py-0.5 border border-border bg-bg text-[10px] font-mono cursor-pointer hover:border-accent"
            onClick={() => getBscTradeQuote()}
          >
            Quote
          </button>
        )}
      </div>
    );
  }

  /* ── Quick trade panel ─────────────────────────────────────────────── */

  function renderQuickTradePanel() {
    return (
      <div className="border border-border bg-card p-3 space-y-2">
        <div className="flex items-center gap-2">
          <input
            type="text"
            data-testid="wallet-quick-token-input"
            placeholder="Token contract address (0x...)"
            value={quickTokenAddress}
            onChange={(e) => setQuickTokenAddress(e.target.value)}
            className="flex-1 px-2 py-1 border border-border bg-bg text-xs font-mono"
          />
          <button
            type="button"
            data-testid="wallet-quick-add-token"
            className="px-2 py-1 border border-border bg-bg text-[10px] font-mono cursor-pointer hover:border-accent"
            onClick={handleAddToken}
          >
            Add
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          {AMOUNT_PRESETS.map((amt) => (
            <button
              key={amt}
              type="button"
              data-testid={`wallet-quick-amount-${amt}`}
              className={`px-2 py-0.5 border text-[10px] font-mono cursor-pointer ${
                quickAmount === String(amt)
                  ? "border-accent text-accent"
                  : "border-border bg-bg hover:border-accent"
              }`}
              onClick={() => setQuickAmount(String(amt))}
            >
              {amt} BNB
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            data-testid="wallet-quick-buy"
            className="px-3 py-1 border border-green-500 text-green-500 text-xs font-mono cursor-pointer hover:bg-green-500 hover:text-white"
            onClick={handleQuickBuy}
          >
            Buy
          </button>
          <button
            type="button"
            data-testid="wallet-quick-sell"
            className="px-3 py-1 border border-red-500 text-red-500 text-xs font-mono cursor-pointer hover:bg-red-500 hover:text-white"
            onClick={handleQuickSell}
          >
            Sell
          </button>
        </div>

        {/* Latest quote display */}
        {latestQuote && (
          <div className="border border-border p-2 text-xs">
            <div className="font-bold mb-1">Latest quote</div>
            <div className="text-muted">
              {(latestQuote as Record<string, unknown>).side === "buy" ? "Buy" : "Sell"}
              {" "}{String((latestQuote as Record<string, Record<string, string>>).quoteOut?.amount ?? "")}
              {" "}{String((latestQuote as Record<string, Record<string, string>>).quoteOut?.symbol ?? "")}
            </div>
            <button
              type="button"
              data-testid="wallet-quote-execute"
              className="mt-1 px-3 py-1 border border-accent bg-accent text-accent-fg text-[10px] font-mono cursor-pointer"
              onClick={handleExecute}
            >
              Execute Trade
            </button>
          </div>
        )}

        {/* Execution result */}
        {latestExecution && renderExecutionResult()}
      </div>
    );
  }

  /* ── Execution result ─────────────────────────────────────────────── */

  function renderExecutionResult() {
    if (!latestExecution) return null;
    const exec = latestExecution as Record<string, unknown>;
    const executed = exec.executed as boolean;
    const execution = exec.execution as Record<string, unknown> | undefined;
    const requiresUserSignature = exec.requiresUserSignature as boolean;
    const unsignedTx = exec.unsignedTx as Record<string, unknown> | undefined;
    const unsignedApprovalTx = exec.unsignedApprovalTx as Record<string, unknown> | undefined;

    if (executed && execution) {
      const hash = execution.hash as string;
      const status = execution.status as string;
      const shortHash = hash ? `${hash.slice(0, 10)}` : "";

      return (
        <div className="border border-border p-2 text-xs space-y-1">
          <div>
            <a
              href={execution.explorerUrl as string}
              target="_blank"
              rel="noopener"
              className="text-accent"
            >
              View tx {shortHash}
            </a>
          </div>
          {status === "pending" && (
            <div className="flex items-center gap-2">
              <span className="text-yellow-500">Pending...</span>
              <button
                type="button"
                data-testid="wallet-tx-refresh"
                className="px-2 py-0.5 border border-border bg-bg text-[10px] font-mono cursor-pointer hover:border-accent"
                onClick={handleRefreshTxStatus}
              >
                Refresh Status
              </button>
            </div>
          )}
          {txStatus && (
            <div className="text-muted">
              Confirmations: {String((txStatus as Record<string, unknown>).confirmations ?? 0)}
            </div>
          )}
        </div>
      );
    }

    if (requiresUserSignature) {
      return (
        <div className="border border-border p-2 text-xs space-y-1">
          <div className="text-yellow-500">
            Requires wallet signature to complete.
          </div>
          {unsignedApprovalTx && (
            <button
              type="button"
              data-testid="wallet-copy-approve-tx"
              className="px-2 py-0.5 border border-border bg-bg text-[10px] font-mono cursor-pointer hover:border-accent"
              onClick={() => copyToClipboard(JSON.stringify(unsignedApprovalTx))}
            >
              Copy Approval TX
            </button>
          )}
          {unsignedTx && (
            <button
              type="button"
              data-testid="wallet-copy-swap-tx"
              className="px-2 py-0.5 border border-border bg-bg text-[10px] font-mono cursor-pointer hover:border-accent"
              onClick={() => copyToClipboard(JSON.stringify(unsignedTx))}
            >
              Copy Swap TX
            </button>
          )}
        </div>
      );
    }

    return null;
  }

  /* ── Single chain section ───────────────────────────────────────── */

  function renderChainSection(
    chainName: string,
    iconCode: string,
    iconCls: string,
    address: string,
    rows: TokenRow[],
    showSubChain: boolean,
  ) {
    return (
      <div className="border border-border bg-card">
        {/* Section header: icon + chain name | address + copy */}
        <div className="flex items-center gap-2.5 px-4 py-2.5 border-b border-border bg-bg">
          <span
            className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-bold font-mono text-white shrink-0 ${iconCls}`}
          >
            {iconCode}
          </span>
          <span className="text-sm font-bold">{chainName}</span>
          <CopyableAddress address={address} onCopy={copyToClipboard} />
        </div>

        {/* Token rows or empty state */}
        {!walletBalances ? (
          <div className="px-4 py-6 text-center text-xs text-muted italic">
            No data yet. Click Refresh.
          </div>
        ) : rows.length === 0 ? (
          <div className="px-4 py-6 text-center text-xs text-muted italic">
            No wallet assets
          </div>
        ) : (
          <table className="w-full border-collapse text-xs">
            <tbody>
              {rows.map((row, idx) => {
                const subIcon = showSubChain ? chainIcon(row.chain) : null;
                const isTrackedRow = row.isTracked || trackedTokens.some(
                  (t) => t.address.toLowerCase() === row.contractAddress?.toLowerCase(),
                );
                return (
                  <tr
                    key={`${row.chain}-${row.symbol}-${idx}`}
                    className="border-b border-border last:border-b-0"
                  >
                    {showSubChain && (
                      <td
                        className="pl-4 pr-1 py-[7px] align-middle"
                        style={{ width: 28 }}
                      >
                        <span
                          className={`inline-block w-4 h-4 rounded-full text-center leading-4 text-[9px] font-bold font-mono text-white ${subIcon?.cls ?? "bg-bg-muted"}`}
                          title={row.chain}
                        >
                          {subIcon?.code ?? "?"}
                        </span>
                      </td>
                    )}
                    <td
                      className={`${showSubChain ? "pl-1" : "pl-4"} pr-3 py-[7px] align-middle`}
                    >
                      <span className="font-bold font-mono">{row.symbol}</span>
                      <span className="text-muted overflow-hidden text-ellipsis whitespace-nowrap max-w-[160px] inline-block align-bottom ml-2">
                        {row.name}
                      </span>
                      {showSubChain &&
                        row.chain.toLowerCase() !== "ethereum" &&
                        row.chain.toLowerCase() !== "mainnet" && (
                          <span className="ml-1.5 px-1.5 py-0 border border-border text-[9px] text-muted font-mono align-middle">
                            {row.chain}
                          </span>
                        )}
                      {isTrackedRow && row.contractAddress && (
                        <button
                          type="button"
                          data-testid="wallet-token-untrack"
                          className="ml-2 px-1.5 py-0 border border-border text-[9px] text-muted font-mono cursor-pointer hover:border-danger hover:text-danger"
                          onClick={() => handleUntrackToken(row.contractAddress!)}
                        >
                          untrack
                        </button>
                      )}
                    </td>
                    <td className="px-3 py-[7px] align-middle font-mono text-right whitespace-nowrap">
                      {formatBalance(row.balance)}
                    </td>
                    <td className="px-4 py-[7px] align-middle font-mono text-right text-muted whitespace-nowrap">
                      {row.valueUsd > 0
                        ? `$${row.valueUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                        : ""}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    );
  }

  /* ── NFTs grid ───────────────────────────────────────────────────── */

  function renderNftsView() {
    if (walletNftsLoading) {
      return (
        <div className="text-center py-10 text-muted italic mt-6">
          Loading NFTs...
        </div>
      );
    }
    if (!walletNfts) {
      return (
        <div className="text-center py-10 text-muted italic mt-6">
          No NFT data yet. Click Refresh.
        </div>
      );
    }
    if (allNfts.length === 0) {
      return (
        <div className="text-center py-10 text-muted italic mt-6">
          No NFTs found across your wallets.
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
                  No image
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
