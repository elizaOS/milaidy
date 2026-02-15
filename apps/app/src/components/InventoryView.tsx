/**
 * Inventory view — wallet balances and NFTs.
 */

import { useMemo, useState } from "react";
import { useApp } from "../AppContext";
import type { EvmChainBalance } from "../api-client";

/* ── Chain icon helper ─────────────────────────────────────────────── */

function chainIcon(chain: string): { code: string; cls: string } {
  const c = chain.toLowerCase();
  if (c === "ethereum" || c === "mainnet") return { code: "E", cls: "bg-chain-eth" };
  if (c === "base") return { code: "B", cls: "bg-chain-base" };
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
}

interface NftItem {
  chain: string;
  name: string;
  imageUrl: string;
  collectionName: string;
}

/* ── Copyable address (inline, for section headers) ──────────────────── */

function CopyableAddress({ address, onCopy }: { address: string; onCopy: (text: string) => Promise<void> }) {
  const [copied, setCopied] = useState(false);
  const short = `${address.slice(0, 6)}...${address.slice(-4)}`;

  const handleCopy = async () => {
    await onCopy(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="ml-auto flex items-center gap-2">
      <code className="font-mono text-xs text-muted truncate select-all" title={address}>
        {short}
      </code>
      <button
        onClick={handleCopy}
        className="px-2 py-0.5 border border-border bg-bg text-[10px] font-mono cursor-pointer hover:border-accent hover:text-accent transition-colors shrink-0"
      >
        {copied ? "copied" : "copy"}
      </button>
    </div>
  );
}

/* ── Component ───────────────────────────────────────────────────────── */

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
    walletError,
    loadBalances,
    loadNfts,
    cloudConnected,
    setTab,
    setState,
    copyToClipboard,
  } = useApp();

  // ── Setup detection ──────────────────────────────────────────────────
  // If connected to Eliza Cloud, RPCs are managed — no local keys needed.

  const cfg = walletConfig;
  const needsSetup = !cloudConnected && (!cfg || (!cfg.alchemyKeySet && !cfg.heliusKeySet));

  // ── Flatten & sort token rows (skip errored chains) ────────────────

  const tokenRows = useMemo((): TokenRow[] => {
    if (!walletBalances) return [];
    const rows: TokenRow[] = [];

    if (walletBalances.evm) {
      for (const chain of walletBalances.evm.chains) {
        if (chain.error) continue; // errored chains shown separately below
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
          });
        }
      }
    }

    if (walletBalances.solana) {
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

  // ── Chain errors ─────────────────────────────────────────────────────

  const chainErrors = useMemo(
    () => (walletBalances?.evm?.chains ?? []).filter((c: EvmChainBalance) => c.error),
    [walletBalances],
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
          To view balances and NFTs you need RPC provider keys (Alchemy, Helius, etc.)
          or an Eliza Cloud connection. Head to <strong>Settings</strong> to set them up.
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

  /* ── Content view ────────────────────────────────────────────────── */

  function renderContent() {
    return (
      <>
        {/* Toolbar: tabs + sort buttons + refresh — all in one row */}
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          <button
            className={`inline-block px-4 py-1 cursor-pointer border border-border bg-bg text-[13px] font-mono hover:border-accent hover:text-accent ${
              inventoryView === "tokens" ? "border-accent text-accent font-bold" : ""
            }`}
            onClick={() => {
              setState("inventoryView", "tokens");
              if (!walletBalances) void loadBalances();
            }}
          >
            Tokens
          </button>
          <button
            className={`inline-block px-4 py-1 cursor-pointer border border-border bg-bg text-[13px] font-mono hover:border-accent hover:text-accent ${
              inventoryView === "nfts" ? "border-accent text-accent font-bold" : ""
            }`}
            onClick={() => {
              setState("inventoryView", "nfts");
              if (!walletNfts) void loadNfts();
            }}
          >
            NFTs
          </button>

          {/* Right side: sort buttons (tokens only) + refresh */}
          <div className="ml-auto flex items-center gap-1.5">
            {inventoryView === "tokens" && (
              <>
                <span className="text-[10px] text-muted uppercase" style={{ letterSpacing: "0.05em" }}>
                  Sort:
                </span>
                <button
                  className={`px-2.5 py-0.5 border border-border bg-bg cursor-pointer text-[11px] font-mono hover:border-accent hover:text-accent ${
                    inventorySort === "value" ? "border-accent text-accent" : ""
                  }`}
                  onClick={() => setState("inventorySort", "value")}
                >
                  Value
                </button>
                <button
                  className={`px-2.5 py-0.5 border border-border bg-bg cursor-pointer text-[11px] font-mono hover:border-accent hover:text-accent ${
                    inventorySort === "chain" ? "border-accent text-accent" : ""
                  }`}
                  onClick={() => setState("inventorySort", "chain")}
                >
                  Chain
                </button>
                <button
                  className={`px-2.5 py-0.5 border border-border bg-bg cursor-pointer text-[11px] font-mono hover:border-accent hover:text-accent ${
                    inventorySort === "symbol" ? "border-accent text-accent" : ""
                  }`}
                  onClick={() => setState("inventorySort", "symbol")}
                >
                  Name
                </button>
              </>
            )}
            <button
              className="px-2.5 py-0.5 border border-accent bg-accent text-accent-fg cursor-pointer text-[11px] font-mono hover:bg-accent-hover hover:border-accent-hover"
              onClick={() => (inventoryView === "tokens" ? loadBalances() : loadNfts())}
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
      return <div className="text-center py-10 text-muted italic mt-6">Loading balances...</div>;
    }

    const evmAddr = walletAddresses?.evmAddress ?? walletConfig?.evmAddress;
    const solAddr = walletAddresses?.solanaAddress ?? walletConfig?.solanaAddress;

    if (!evmAddr && !solAddr) {
      return (
        <div className="text-center py-10 text-muted italic mt-6">
          No wallets connected. Configure wallets in{" "}
          <a
            href="/settings"
            onClick={(e) => { e.preventDefault(); setTab("settings"); }}
            className="text-accent"
          >
            Settings
          </a>
          .
        </div>
      );
    }

    const evmRows = sortedRows.filter((r) => r.chain.toLowerCase() !== "solana");
    const solanaRows = sortedRows.filter((r) => r.chain.toLowerCase() === "solana");

    return (
      <div className="mt-3 space-y-3">
        {evmAddr && renderChainSection("Ethereum", "E", "bg-chain-eth", evmAddr, evmRows, true)}
        {solAddr && renderChainSection("Solana", "S", "bg-chain-sol", solAddr, solanaRows, false)}

        {/* Per-chain RPC errors */}
        {chainErrors.length > 0 && (
          <div className="text-[11px] text-muted">
            {chainErrors.map((c: EvmChainBalance) => {
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
                      <a href="https://dashboard.alchemy.com/" target="_blank" rel="noopener" className="text-accent">
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
          <div className="px-4 py-6 text-center text-xs text-muted italic">No wallet assets</div>
        ) : (
          <table className="w-full border-collapse text-xs">
            <tbody>
              {rows.map((row, idx) => {
                const subIcon = showSubChain ? chainIcon(row.chain) : null;
                return (
                  <tr
                    key={`${row.chain}-${row.symbol}-${idx}`}
                    className="border-b border-border last:border-b-0"
                  >
                    {showSubChain && (
                      <td className="pl-4 pr-1 py-[7px] align-middle" style={{ width: 28 }}>
                        <span
                          className={`inline-block w-4 h-4 rounded-full text-center leading-4 text-[9px] font-bold font-mono text-white ${subIcon?.cls ?? "bg-bg-muted"}`}
                          title={row.chain}
                        >
                          {subIcon?.code ?? "?"}
                        </span>
                      </td>
                    )}
                    <td className={`${showSubChain ? "pl-1" : "pl-4"} pr-3 py-[7px] align-middle`}>
                      <span className="font-bold font-mono">{row.symbol}</span>
                      <span className="text-muted overflow-hidden text-ellipsis whitespace-nowrap max-w-[160px] inline-block align-bottom ml-2">
                        {row.name}
                      </span>
                      {showSubChain && row.chain.toLowerCase() !== "ethereum" && row.chain.toLowerCase() !== "mainnet" && (
                        <span className="ml-1.5 px-1.5 py-0 border border-border text-[9px] text-muted font-mono align-middle">
                          {row.chain}
                        </span>
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
      return <div className="text-center py-10 text-muted italic mt-6">Loading NFTs...</div>;
    }
    if (!walletNfts) {
      return (
        <div className="text-center py-10 text-muted italic mt-6">No NFT data yet. Click Refresh.</div>
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
