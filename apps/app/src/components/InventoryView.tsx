/**
 * Inventory view — BSC-first wallet balances and NFTs.
 * Terminal-style layout inspired by GMGN / degen trading tools.
 */

import { useMemo, useState } from "react";
import { useApp } from "../AppContext";
import type { BscTradeQuoteResponse, EvmChainBalance } from "../api-client";

const BSC_GAS_READY_THRESHOLD = 0.005;
const HEX_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

/* ── Chain icon helper ─────────────────────────────────────────────── */

function chainIcon(chain: string): { code: string; cls: string } {
  const c = chain.toLowerCase();
  if (c === "ethereum" || c === "mainnet") return { code: "E", cls: "bg-chain-eth" };
  if (c === "base") return { code: "B", cls: "bg-chain-base" };
  if (c === "arbitrum") return { code: "A", cls: "bg-chain-arb" };
  if (c === "optimism") return { code: "O", cls: "bg-chain-op" };
  if (c === "polygon") return { code: "P", cls: "bg-chain-pol" };
  if (c === "bsc" || c === "bnb chain" || c === "bnb smart chain") return { code: "B", cls: "bg-chain-bsc" };
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

/* ── Row types ─────────────────────────────────────────────────────── */

interface TokenRow {
  chain: string;
  symbol: string;
  name: string;
  contractAddress: string | null;
  balance: string;
  valueUsd: number;
  balanceRaw: number;
  isNative: boolean;
}

interface NftItem {
  chain: string;
  name: string;
  imageUrl: string;
  collectionName: string;
}

/* ── Copyable address ─────────────────────────────────────────────── */

function CopyableAddress({ address, onCopy }: { address: string; onCopy: (text: string) => Promise<void> }) {
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
        onClick={handleCopy}
        className="px-1.5 py-0.5 border border-border bg-bg text-[10px] font-mono cursor-pointer hover:border-accent hover:text-accent transition-colors"
      >
        {copied ? "✓" : "copy"}
      </button>
    </div>
  );
}

/* ── Status dot ───────────────────────────────────────────────────── */

function StatusDot({ ready, label, title }: { ready: boolean; label: string; title?: string }) {
  return (
    <span className={`wt__status-dot ${ready ? "is-ready" : "is-off"}`} title={title}>
      <span className="wt__status-indicator" />
      {label}
    </span>
  );
}

/* ── Component ─────────────────────────────────────────────────────── */

export function InventoryView() {
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
  } = useApp();
  const [quickTokenInput, setQuickTokenInput] = useState("");
  const [quickBnbAmount, setQuickBnbAmount] = useState("0.1");
  const [tradeBusy, setTradeBusy] = useState(false);
  const [latestQuote, setLatestQuote] = useState<BscTradeQuoteResponse | null>(null);
  const [executeBusy, setExecuteBusy] = useState(false);
  const [latestTxHash, setLatestTxHash] = useState<string | null>(null);

  const cfg = walletConfig;
  const hasManagedBscRpc = Boolean(cfg?.managedBscRpcReady);
  const hasLegacyEvmProviders = Boolean(cfg?.alchemyKeySet || cfg?.ankrKeySet || cfg?.infuraKeySet);
  const needsSetup = !cloudConnected && !hasManagedBscRpc && !hasLegacyEvmProviders;

  const tokenRows = useMemo((): TokenRow[] => {
    if (!walletBalances) return [];
    const rows: TokenRow[] = [];

    if (walletBalances.evm) {
      for (const chain of walletBalances.evm.chains) {
        if (chain.error) continue;
        rows.push({
          chain: chain.chain,
          symbol: chain.nativeSymbol,
          name: `${chain.chain} native`,
          contractAddress: null,
          balance: chain.nativeBalance,
          valueUsd: Number.parseFloat(chain.nativeValueUsd) || 0,
          balanceRaw: Number.parseFloat(chain.nativeBalance) || 0,
          isNative: true,
        });
        for (const t of chain.tokens) {
          rows.push({
            chain: chain.chain,
            symbol: t.symbol,
            name: t.name,
            contractAddress: t.contractAddress ?? null,
            balance: t.balance,
            valueUsd: Number.parseFloat(t.valueUsd) || 0,
            balanceRaw: Number.parseFloat(t.balance) || 0,
            isNative: false,
          });
        }
      }
    }

    if (walletBalances.solana) {
      rows.push({
        chain: "Solana",
        symbol: "SOL",
        name: "Solana native",
        contractAddress: null,
        balance: walletBalances.solana.solBalance,
        valueUsd: Number.parseFloat(walletBalances.solana.solValueUsd) || 0,
        balanceRaw: Number.parseFloat(walletBalances.solana.solBalance) || 0,
        isNative: true,
      });
      for (const t of walletBalances.solana.tokens) {
        rows.push({
          chain: "Solana",
          symbol: t.symbol,
          name: t.name,
          contractAddress: t.mint ?? null,
          balance: t.balance,
          valueUsd: Number.parseFloat(t.valueUsd) || 0,
          balanceRaw: Number.parseFloat(t.balance) || 0,
          isNative: false,
        });
      }
    }

    return rows;
  }, [walletBalances]);

  const sortedRows = useMemo(() => {
    const sorted = [...tokenRows];
    if (inventorySort === "value") {
      sorted.sort((a, b) => b.valueUsd - a.valueUsd || b.balanceRaw - a.balanceRaw);
    } else if (inventorySort === "chain") {
      sorted.sort((a, b) => a.chain.localeCompare(b.chain) || a.symbol.localeCompare(b.symbol));
    } else if (inventorySort === "symbol") {
      sorted.sort((a, b) => a.symbol.localeCompare(b.symbol) || a.chain.localeCompare(b.chain));
    }
    return sorted;
  }, [tokenRows, inventorySort]);

  const chainErrors = useMemo(
    () => (walletBalances?.evm?.chains ?? []).filter((c: EvmChainBalance) => c.error),
    [walletBalances],
  );

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

  const bscChain = useMemo(
    () => (walletBalances?.evm?.chains ?? []).find((chain) => isBscChainName(chain.chain)) ?? null,
    [walletBalances],
  );
  const bscChainError = bscChain?.error ?? chainErrors.find((chain) => isBscChainName(chain.chain))?.error ?? null;
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
    () => (inventoryChainFocus === "bsc" ? bscRows : tokenRows).reduce((sum, r) => sum + r.valueUsd, 0),
    [tokenRows, bscRows, inventoryChainFocus],
  );

  const visibleChainErrors =
    inventoryChainFocus === "bsc"
      ? chainErrors.filter((chain) => isBscChainName(chain.chain))
      : chainErrors;

  const runTradePreflight = async (tokenAddress: string) => {
    const result = await getBscTradePreflight(tokenAddress);
    if (result.ok) {
      setActionNotice("Preflight passed: wallet, RPC, chain, and gas are ready.", "success", 2400);
      return result;
    }
    setLatestQuote(null);
    const reason = result.reasons[0] ?? "Trade preflight failed.";
    setActionNotice(reason, "error", 3200);
    return result;
  };

  const runTradeQuote = async (
    side: "buy" | "sell",
    tokenAddress: string,
    amount: string,
  ) => {
    setTradeBusy(true);
    try {
      const preflight = await runTradePreflight(tokenAddress);
      if (!preflight.ok) return;

      const quote = await getBscTradeQuote({
        side,
        tokenAddress,
        amount,
        slippageBps: 500,
      });
      setLatestQuote(quote);
      setActionNotice(
        `Quote ready: ${quote.quoteIn.amount} ${quote.quoteIn.symbol} -> ~${quote.quoteOut.amount} ${quote.quoteOut.symbol}.`,
        "success",
        3200,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch quote.";
      setActionNotice(message, "error", 3400);
    } finally {
      setTradeBusy(false);
    }
  };

  const handleRowAction = async (mode: "preflight" | "quote", row: TokenRow) => {
    if (row.isNative || !row.contractAddress) {
      setActionNotice("Native token rows do not need a swap quote.", "info", 2200);
      return;
    }
    if (!isBscChainName(row.chain)) {
      setActionNotice("This action is available for BSC tokens only.", "info", 2400);
      return;
    }
    if (!HEX_ADDRESS_RE.test(row.contractAddress)) {
      setActionNotice("This token has no valid contract address.", "error", 2600);
      return;
    }
    if (mode === "preflight") {
      try {
        setTradeBusy(true);
        await runTradePreflight(row.contractAddress);
      } finally {
        setTradeBusy(false);
      }
      return;
    }
    await runTradeQuote("buy", row.contractAddress, quickBnbAmount);
  };

  const handleQuickTrade = async (mode: "buy" | "sell") => {
    const token = quickTokenInput.trim();
    if (!token) {
      setActionNotice("Paste a BSC token contract first.", "error", 2600);
      return;
    }
    if (!HEX_ADDRESS_RE.test(token)) {
      setActionNotice("Token contract must be a valid 0x address.", "error", 2600);
      return;
    }
    await runTradeQuote(mode, token, quickBnbAmount);
  };

  const handleExecuteLatestQuote = async () => {
    if (!latestQuote) {
      setActionNotice("Create a quote first.", "info", 2200);
      return;
    }
    const sideLabel = latestQuote.side.toUpperCase();
    const sideAction = latestQuote.side === "buy" ? "Spend" : "Sell";
    const confirmFn =
      typeof window !== "undefined" && typeof window.confirm === "function"
        ? window.confirm.bind(window)
        : () => true;
    const confirmed = confirmFn(
      `Execute ${sideLabel} now?\n\n${sideAction}: ${latestQuote.quoteIn.amount} ${latestQuote.quoteIn.symbol}\nExpected: ${latestQuote.quoteOut.amount} ${latestQuote.quoteOut.symbol}\nMin receive: ${latestQuote.minReceive.amount} ${latestQuote.minReceive.symbol}`,
    );
    if (!confirmed) return;

    setExecuteBusy(true);
    try {
      const result = await executeBscTrade({
        side: latestQuote.side,
        tokenAddress: latestQuote.tokenAddress,
        amount: latestQuote.quoteIn.amount,
        slippageBps: latestQuote.slippageBps,
        confirm: true,
      });
      if (result.executed && result.execution) {
        setLatestTxHash(result.execution.hash);
        setActionNotice(`Trade sent: ${result.execution.hash.slice(0, 10)}...`, "success", 3600);
        return;
      }
      setLatestTxHash(null);
      if (result.requiresUserSignature) {
        setActionNotice(
          "Execution switched to user-sign mode. Local key execution is disabled or unavailable.",
          "info",
          4200,
        );
      } else {
        setActionNotice("Execution did not complete.", "error", 3200);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Trade execution failed.";
      setActionNotice(message, "error", 4200);
    } finally {
      setExecuteBusy(false);
    }
  };

  return (
    <div className="wallets-bsc">
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
      <div className="wallets-bsc__setup mt-6 border border-border bg-card p-6 text-center">
        <div className="text-sm font-bold mb-2">BSC wallet RPC not configured</div>
        <p className="text-xs text-muted mb-4 leading-relaxed max-w-md mx-auto">
          Wallets runs in managed mode. Ask your operator to set <code>NODEREAL_BSC_RPC_URL</code> (primary) and{" "}
          <code>QUICKNODE_BSC_RPC_URL</code> (fallback) in the server environment.
        </p>
        <button
          className="px-4 py-1.5 border border-accent bg-accent text-accent-fg cursor-pointer text-xs font-mono hover:bg-accent-hover hover:border-accent-hover"
          onClick={() => setTab("settings")}
        >
          Open Settings
        </button>
      </div>
    );
  }

  function renderContent() {
    if (walletLoading && !walletBalances) {
      return <div className="text-center py-10 text-muted italic mt-6">Loading balances...</div>;
    }

    if (!evmAddr && !solAddr) {
      return (
        <div className="mt-4 border border-border bg-card px-4 py-6 text-center">
          <div className="text-sm font-bold mb-1">No onchain wallet found</div>
          <p className="text-xs text-muted mb-3">
            Generate a managed wallet first. The same EVM address is used on BSC / ETH / Base.
          </p>
          <button
            className="px-4 py-1.5 border border-accent bg-accent text-accent-fg cursor-pointer text-xs font-mono hover:bg-accent-hover hover:border-accent-hover"
            onClick={() => setTab("settings")}
          >
            Open Settings
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
              <div className="wt__portfolio-label">Portfolio</div>
              <div className="wt__portfolio-value" data-testid="bsc-balance-value">
                {totalUsd > 0
                  ? `$${totalUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  : "$0.00"}
              </div>
            </div>
            {evmAddr && <CopyableAddress address={evmAddr} onCopy={copyToClipboard} />}
          </div>
          <div className="wt__status-row mt-2">
            <StatusDot
              ready={walletReady}
              label={walletReady ? "Connected" : "No Wallet"}
              title={walletReady ? "Address detected." : "Create or import wallet first."}
            />
            <StatusDot
                ready={rpcReady}
                label={rpcReady ? "Feed Live" : "Feed Offline"}
                title={
                  rpcReady
                    ? "BSC market data is available."
                    : bscChainError
                      ? `BSC data error: ${bscChainError}`
                    : "Managed BSC feed is offline (NodeReal/QuickNode)."
                }
              />
            <StatusDot
              ready={gasReady}
              label={gasReady ? "Trade Ready" : "Trade Not Ready"}
              title={
                gasReady
                  ? "Ready to trade."
                  : rpcReady
                    ? `Need at least ${BSC_GAS_READY_THRESHOLD} BNB for gas.`
                    : "Market feed required."
              }
            />
          </div>
        </div>

        {/* ── Block 2: Quick Trade (hero) ───────────────────────── */}
        <div className="wt__quick">
          <div className="wt__quick-row">
            <input
              data-testid="wallet-quick-token-input"
              value={quickTokenInput}
              onChange={(e) => setQuickTokenInput(e.target.value)}
              placeholder="Paste token contract (0x...)"
              className="wt__quick-input"
            />
            <div className="wt__presets">
              {["0.05", "0.1", "0.2", "0.5", "1"].map((amount) => (
                <button
                  key={amount}
                  data-testid={`wallet-quick-amount-${amount}`}
                  className={`wt__preset ${quickBnbAmount === amount ? "is-active" : ""}`}
                  onClick={() => setQuickBnbAmount(amount)}
                >
                  {amount}
                </button>
              ))}
              <span className="text-[10px] text-muted self-center font-mono">size</span>
            </div>
            <div className="wt__quick-actions">
              <button
                data-testid="wallet-quick-buy"
                className="wt__btn is-buy"
                onClick={() => void handleQuickTrade("buy")}
                disabled={tradeBusy}
              >
                {tradeBusy ? "..." : "BUY"}
              </button>
              <button
                data-testid="wallet-quick-sell"
                className="wt__btn is-sell"
                onClick={() => void handleQuickTrade("sell")}
                disabled={tradeBusy}
              >
                SELL
              </button>
            </div>
          </div>
        </div>

        {latestQuote && (
          <div className="wt__quote" data-testid="wallet-quote-card">
            <div className="wt__quote-head">
              <span className="wt__quote-title">Latest Quote</span>
              <span className="wt__quote-route">
                Route: {latestQuote.route[0].slice(0, 6)}...{latestQuote.route[0].slice(-4)} →{" "}
                {latestQuote.route[1].slice(0, 6)}...{latestQuote.route[1].slice(-4)}
              </span>
            </div>
            <div className="wt__quote-grid">
              <div>
                <div className="wt__quote-k">Input</div>
                <div className="wt__quote-v">
                  {latestQuote.quoteIn.amount} {latestQuote.quoteIn.symbol}
                </div>
              </div>
              <div>
                <div className="wt__quote-k">Expected</div>
                <div className="wt__quote-v">
                  {latestQuote.quoteOut.amount} {latestQuote.quoteOut.symbol}
                </div>
              </div>
              <div>
                <div className="wt__quote-k">Min Receive ({latestQuote.slippageBps / 100}%)</div>
                <div className="wt__quote-v">
                  {latestQuote.minReceive.amount} {latestQuote.minReceive.symbol}
                </div>
              </div>
              <div>
                <div className="wt__quote-k">Price</div>
                <div className="wt__quote-v">{latestQuote.price}</div>
              </div>
            </div>
            <div className="wt__quote-actions">
              <button
                data-testid="wallet-quote-execute"
                className="wt__btn is-buy"
                onClick={() => void handleExecuteLatestQuote()}
                disabled={executeBusy}
              >
                {executeBusy
                  ? "EXECUTING..."
                  : `EXECUTE ${latestQuote.side.toUpperCase()}`}
              </button>
              {latestTxHash && (
                <a
                  href={`https://bscscan.com/tx/${latestTxHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="wt__quote-link"
                >
                  View tx {latestTxHash.slice(0, 10)}...
                </a>
              )}
            </div>
          </div>
        )}

        {/* ── Block 3: Toolbar + content ────────────────────────── */}
        <div>
          <div className="wt__toolbar">
            <button
              className={`wt__tab ${inventoryView === "tokens" ? "is-active" : ""}`}
              onClick={() => {
                setState("inventoryView", "tokens");
                if (!walletBalances) void loadBalances();
              }}
            >
              Tokens
            </button>
            <button
              className={`wt__tab ${inventoryView === "nfts" ? "is-active" : ""}`}
              onClick={() => {
                setState("inventoryView", "nfts");
                if (!walletNfts) void loadNfts();
              }}
            >
              NFTs
            </button>

            {inventoryView === "tokens" && (
              <>
                <span className="wt__sep" />
                <button
                  data-testid="wallet-focus-bsc"
                  className={`wt__chip ${inventoryChainFocus === "bsc" ? "is-active" : ""}`}
                  onClick={() => setState("inventoryChainFocus", "bsc")}
                >
                  BSC
                </button>
                <button
                  data-testid="wallet-focus-all"
                  className={`wt__chip ${inventoryChainFocus === "all" ? "is-active" : ""}`}
                  onClick={() => setState("inventoryChainFocus", "all")}
                >
                  All
                </button>

                <span className="flex-1" />

                <span className="text-[10px] text-muted font-mono">Sort:</span>
                <button
                  className={`wt__chip ${inventorySort === "value" ? "is-active" : ""}`}
                  onClick={() => setState("inventorySort", "value")}
                >
                  Value
                </button>
                <button
                  className={`wt__chip ${inventorySort === "chain" ? "is-active" : ""}`}
                  onClick={() => setState("inventorySort", "chain")}
                >
                  Chain
                </button>
                <button
                  className={`wt__chip ${inventorySort === "symbol" ? "is-active" : ""}`}
                  onClick={() => setState("inventorySort", "symbol")}
                >
                  Name
                </button>
              </>
            )}

            <button
              className="wt__refresh"
              onClick={() => (inventoryView === "tokens" ? loadBalances() : loadNfts())}
            >
              ↻
            </button>
          </div>

          {inventoryView === "tokens" ? renderTokensView() : renderNftsView()}
        </div>
      </div>
    );
  }

  function renderTokensView() {
    if (walletLoading) {
      return <div className="text-center py-10 text-muted italic text-xs">Loading balances...</div>;
    }

    if (visibleRows.length === 0) {
      return (
        <div className="text-center py-8 text-muted italic text-xs">
          {walletBalances ? "No tokens found." : "No data yet — click ↻ to refresh."}
        </div>
      );
    }

    return (
      <>
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-b border-border">
              <th className="pl-3 pr-1 py-1.5 text-left w-8" />
              <th className="px-3 py-1.5 text-left text-[10px] text-muted font-bold uppercase tracking-wide">
                Token
              </th>
              <th className="px-3 py-1.5 text-right text-[10px] text-muted font-bold uppercase tracking-wide">
                Balance
              </th>
              <th className="px-3 py-1.5 text-right text-[10px] text-muted font-bold uppercase tracking-wide">
                Value
              </th>
              <th className="pl-3 pr-3 py-1.5 text-right w-16" />
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row, idx) => {
              const icon = chainIcon(row.chain);
              return (
                <tr
                  key={`${row.chain}-${row.symbol}-${idx}`}
                  className="border-b border-border last:border-b-0 hover:bg-bg-hover transition-colors"
                >
                  <td className="pl-3 pr-1 py-2 align-middle">
                    <span
                      className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[9px] font-bold text-white shrink-0 ${icon.cls}`}
                      title={row.chain}
                    >
                      {icon.code}
                    </span>
                  </td>
                  <td className="px-3 py-2 align-middle">
                    <span className="font-bold font-mono">{row.symbol}</span>
                    {inventoryChainFocus === "all" && (
                      <span className="ml-1.5 text-[10px] text-muted">{row.chain}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 align-middle font-mono text-right whitespace-nowrap">
                    {formatBalance(row.balance)}
                  </td>
                  <td className="px-3 py-2 align-middle font-mono text-right text-muted whitespace-nowrap">
                    {row.valueUsd > 0
                      ? `$${row.valueUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                      : "—"}
                  </td>
                  <td className="pl-2 pr-3 py-2 align-middle whitespace-nowrap text-right">
                    {row.isNative ? (
                      <span className="text-[10px] text-muted font-mono">native</span>
                    ) : !isBscChainName(row.chain) ? (
                      <span className="text-[10px] text-muted font-mono">view</span>
                    ) : (
                      <div className="inline-flex items-center gap-1">
                        <button
                          data-testid="wallet-token-preflight"
                          className="wt__row-btn is-preflight"
                          onClick={() => void handleRowAction("preflight", row)}
                          disabled={tradeBusy}
                        >
                          PF
                        </button>
                        <button
                          data-testid="wallet-token-quote"
                          className="wt__row-btn is-quote"
                          onClick={() => void handleRowAction("quote", row)}
                          disabled={tradeBusy}
                        >
                          Q
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
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
                      <a href="https://dashboard.alchemy.com/" target="_blank" rel="noopener" className="text-accent">
                        enable it
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
      return <div className="text-center py-10 text-muted italic text-xs">Loading NFTs...</div>;
    }
    if (!walletNfts) {
      return <div className="text-center py-10 text-muted italic text-xs">No NFT data yet. Click ↻ to refresh.</div>;
    }
    if (allNfts.length === 0) {
      return <div className="text-center py-10 text-muted italic text-xs">No NFTs found across your wallets.</div>;
    }

    return (
      <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2.5 mt-3 max-h-[60vh] overflow-y-auto">
        {allNfts.map((nft, idx) => {
          const icon = chainIcon(nft.chain);
          return (
            <div key={`${nft.chain}-${nft.name}-${idx}`} className="border border-border bg-card overflow-hidden">
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
