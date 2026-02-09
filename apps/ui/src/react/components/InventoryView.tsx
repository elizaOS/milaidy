/**
 * Inventory view — wallet balances and NFTs.
 * Mirrors the Lit version in app.ts 1:1.
 */

import { useMemo, useState } from "react";
import { useApp } from "../AppContext.js";
import type { EvmChainBalance } from "../../ui/api-client.js";

/* ── Chain icon helper (matches Lit chainIcon) ──────────────────────── */

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

/* ── Balance formatter (matches Lit formatBalance) ───────────────────── */

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

/* ── Component ───────────────────────────────────────────────────────── */

export function InventoryView() {
  const {
    walletConfig,
    walletBalances,
    walletNfts,
    walletLoading,
    walletNftsLoading,
    inventoryView,
    inventorySort,
    walletError,
    walletApiKeySaving,
    loadBalances,
    loadNfts,
    handleWalletApiKeySave,
    setTab,
    setState,
  } = useApp();

  const [apiKeyInputs, setApiKeyInputs] = useState<Record<string, string>>({
    alchemy: "",
    helius: "",
    birdeye: "",
  });

  // ── Setup detection ──────────────────────────────────────────────────

  const cfg = walletConfig;
  const needsSetup = !cfg || (!cfg.alchemyKeySet && !cfg.heliusKeySet);

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

  // ── Save all API keys at once (matches Lit single-button behavior) ──

  const handleSaveAllKeys = async () => {
    const config: Record<string, string> = {};
    if (apiKeyInputs.alchemy.trim()) config.ALCHEMY_API_KEY = apiKeyInputs.alchemy.trim();
    if (apiKeyInputs.helius.trim()) config.HELIUS_API_KEY = apiKeyInputs.helius.trim();
    if (apiKeyInputs.birdeye.trim()) config.BIRDEYE_API_KEY = apiKeyInputs.birdeye.trim();
    if (Object.keys(config).length === 0) return;
    await handleWalletApiKeySave(config);
    setApiKeyInputs({ alchemy: "", helius: "", birdeye: "" });
  };

  // ════════════════════════════════════════════════════════════════════════
  // Render
  // ════════════════════════════════════════════════════════════════════════

  return (
    <div>
      {/* Top-level error (always shown, matches Lit) */}
      {walletError && (
        <div className="mt-3 px-3.5 py-2.5 border border-danger bg-[rgba(231,76,60,0.06)] text-xs text-danger">
          {walletError}
        </div>
      )}

      {needsSetup ? renderSetup() : renderContent()}
    </div>
  );

  /* ── Setup view (matches Lit renderInventorySetup) ─────────────────── */

  function renderSetup() {
    return (
      <div className="mt-4">
        <p className="text-[13px] leading-relaxed">
          To view your balances, you need API keys from blockchain data providers.
          These are free to create and take about a minute to set up.
        </p>

        {/* ── EVM Section ─────────────────────────────────────────────── */}
        <div className="mt-6">
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-block w-5 h-5 rounded-full text-center leading-5 text-[10px] font-bold font-mono text-white bg-chain-eth">
              E
            </span>
            <h3 className="text-[15px] font-bold text-txt-strong">EVM</h3>
          </div>
          <p className="text-xs text-muted mb-3">Ethereum, Base, Arbitrum, Optimism, Polygon</p>

          {/* Alchemy */}
          <div className="border border-border bg-card p-5">
            <h4 className="text-sm mb-2">
              Alchemy
              {cfg?.alchemyKeySet && (
                <span className="text-ok text-xs font-normal ml-2">configured</span>
              )}
            </h4>
            <p className="text-xs text-muted mb-3 leading-relaxed">
              Alchemy provides EVM chain data (Ethereum, Base, Arbitrum, Optimism, Polygon).
            </p>
            <ol className="mb-3.5 pl-5 text-xs text-muted list-decimal" style={{ lineHeight: 1.7 }}>
              <li>
                Go to{" "}
                <a href="https://dashboard.alchemy.com/signup" target="_blank" rel="noopener" className="text-accent">
                  dashboard.alchemy.com
                </a>{" "}
                and create a free account
              </li>
              <li>
                Create an app, then go to its <strong>Networks</strong> tab and enable: Ethereum, Base,
                Arbitrum, Optimism, Polygon
              </li>
              <li>
                Copy the <strong>API Key</strong> from your app settings
              </li>
              <li>Paste it below</li>
            </ol>
            <div className="flex gap-2 items-center">
              <input
                type="password"
                className="flex-1 px-2.5 py-1.5 border border-border bg-bg text-xs font-mono"
                placeholder={cfg?.alchemyKeySet ? "Already set \u2014 leave blank to keep" : "Paste your Alchemy API key"}
                value={apiKeyInputs.alchemy}
                onChange={(e) => setApiKeyInputs((prev) => ({ ...prev, alchemy: e.target.value }))}
              />
            </div>
          </div>
        </div>

        {/* ── Solana Section ──────────────────────────────────────────── */}
        <div className="mt-6">
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-block w-5 h-5 rounded-full text-center leading-5 text-[10px] font-bold font-mono text-white bg-chain-sol">
              S
            </span>
            <h3 className="text-[15px] font-bold text-txt-strong">Solana</h3>
          </div>
          <p className="text-xs text-muted mb-3">Tokens, NFTs, and enhanced RPC</p>

          {/* Helius */}
          <div className="border border-border bg-card p-5">
            <h4 className="text-sm mb-2">
              Helius
              {cfg?.heliusKeySet && (
                <span className="text-ok text-xs font-normal ml-2">configured</span>
              )}
            </h4>
            <p className="text-xs text-muted mb-3 leading-relaxed">
              Helius provides Solana chain data (tokens, NFTs, enhanced RPC).
            </p>
            <ol className="mb-3.5 pl-5 text-xs text-muted list-decimal" style={{ lineHeight: 1.7 }}>
              <li>
                Go to{" "}
                <a href="https://dev.helius.xyz/dashboard/app" target="_blank" rel="noopener" className="text-accent">
                  dev.helius.xyz
                </a>{" "}
                and create a free account
              </li>
              <li>You&apos;ll get an API key on your dashboard immediately</li>
              <li>
                Copy the <strong>API Key</strong>
              </li>
              <li>Paste it below</li>
            </ol>
            <div className="flex gap-2 items-center">
              <input
                type="password"
                className="flex-1 px-2.5 py-1.5 border border-border bg-bg text-xs font-mono"
                placeholder={cfg?.heliusKeySet ? "Already set \u2014 leave blank to keep" : "Paste your Helius API key"}
                value={apiKeyInputs.helius}
                onChange={(e) => setApiKeyInputs((prev) => ({ ...prev, helius: e.target.value }))}
              />
            </div>
          </div>

          {/* Birdeye (optional) */}
          <div className="border border-border border-t-0 bg-card p-5">
            <h4 className="text-sm mb-2">
              Birdeye{" "}
              <span className="text-muted text-[11px] font-normal ml-2">optional</span>
              {cfg?.birdeyeKeySet && (
                <span className="text-ok text-xs font-normal ml-2">configured</span>
              )}
            </h4>
            <p className="text-xs text-muted mb-3 leading-relaxed">
              Birdeye provides USD price data for Solana tokens. Optional but recommended.
            </p>
            <ol className="mb-3.5 pl-5 text-xs text-muted list-decimal" style={{ lineHeight: 1.7 }}>
              <li>
                Go to{" "}
                <a href="https://birdeye.so/user/api-management" target="_blank" rel="noopener" className="text-accent">
                  birdeye.so
                </a>{" "}
                and create a free account
              </li>
              <li>
                Navigate to the <strong>API</strong> section in your profile
              </li>
              <li>Copy your API key</li>
            </ol>
            <div className="flex gap-2 items-center">
              <input
                type="password"
                className="flex-1 px-2.5 py-1.5 border border-border bg-bg text-xs font-mono"
                placeholder={
                  cfg?.birdeyeKeySet
                    ? "Already set \u2014 leave blank to keep"
                    : "Paste your Birdeye API key (optional)"
                }
                value={apiKeyInputs.birdeye}
                onChange={(e) => setApiKeyInputs((prev) => ({ ...prev, birdeye: e.target.value }))}
              />
            </div>
          </div>
        </div>

        {/* Single save button */}
        <div className="mt-4">
          <button
            className="px-6 py-2 border border-accent bg-accent text-accent-fg cursor-pointer text-sm hover:bg-accent-hover hover:border-accent-hover disabled:opacity-40 disabled:cursor-not-allowed"
            onClick={handleSaveAllKeys}
            disabled={walletApiKeySaving}
          >
            {walletApiKeySaving ? "Saving..." : "Save API Keys"}
          </button>
        </div>
      </div>
    );
  }

  /* ── Content view (matches Lit renderInventoryContent) ─────────────── */

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

  /* ── Tokens table (matches Lit renderTokensView) ───────────────────── */

  function renderTokensView() {
    if (walletLoading) {
      return <div className="text-center py-10 text-muted italic mt-6">Loading balances...</div>;
    }
    if (!walletBalances) {
      return (
        <div className="text-center py-10 text-muted italic mt-6">No balance data yet. Click Refresh.</div>
      );
    }
    if (sortedRows.length === 0) {
      return (
        <div className="text-center py-10 text-muted italic mt-6">
          No wallet data available. Make sure API keys are configured in{" "}
          <a
            href="/config"
            onClick={(e) => {
              e.preventDefault();
              setTab("config");
            }}
            className="text-accent"
          >
            Config
          </a>
          .
        </div>
      );
    }

    return (
      <>
        <div className="mt-3 border border-border max-h-[60vh] overflow-y-auto bg-card">
          <table className="w-full border-collapse text-xs">
            <thead className="sticky top-0 z-10 bg-bg">
              <tr>
                {/* Icon column — empty header, fixed width */}
                <th
                  className="text-left px-3 py-2 text-[11px] font-semibold text-muted border-b border-border"
                  style={{ width: 32 }}
                />
                <th
                  className={`text-left px-3 py-2 text-[11px] font-semibold border-b border-border uppercase cursor-pointer select-none whitespace-nowrap hover:text-txt ${
                    inventorySort === "symbol" ? "text-accent" : "text-muted"
                  }`}
                  style={{ letterSpacing: "0.04em" }}
                  onClick={() => setState("inventorySort", "symbol")}
                >
                  Token
                </th>
                <th
                  className={`text-left px-3 py-2 text-[11px] font-semibold border-b border-border uppercase cursor-pointer select-none whitespace-nowrap hover:text-txt ${
                    inventorySort === "chain" ? "text-accent" : "text-muted"
                  }`}
                  style={{ letterSpacing: "0.04em" }}
                  onClick={() => setState("inventorySort", "chain")}
                >
                  Chain
                </th>
                <th
                  className={`text-right px-3 py-2 text-[11px] font-semibold border-b border-border uppercase cursor-pointer select-none whitespace-nowrap hover:text-txt ${
                    inventorySort === "value" ? "text-accent" : "text-muted"
                  }`}
                  style={{ letterSpacing: "0.04em" }}
                  onClick={() => setState("inventorySort", "value")}
                >
                  Balance
                </th>
                <th
                  className={`text-right px-3 py-2 text-[11px] font-semibold border-b border-border uppercase cursor-pointer select-none whitespace-nowrap hover:text-txt ${
                    inventorySort === "value" ? "text-accent" : "text-muted"
                  }`}
                  style={{ letterSpacing: "0.04em" }}
                  onClick={() => setState("inventorySort", "value")}
                >
                  Value
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row, idx) => {
                const icon = chainIcon(row.chain);
                return (
                  <tr
                    key={`${row.chain}-${row.symbol}-${idx}`}
                    className="border-b border-border last:border-b-0"
                  >
                    <td className="px-3 py-[7px] align-middle">
                      <span
                        className={`inline-block w-4 h-4 rounded-full text-center leading-4 text-[9px] font-bold font-mono text-white shrink-0 align-middle ${icon.cls}`}
                      >
                        {icon.code}
                      </span>
                    </td>
                    <td className="px-3 py-[7px] align-middle">
                      <span className="font-bold font-mono">{row.symbol}</span>
                      <span className="text-muted overflow-hidden text-ellipsis whitespace-nowrap max-w-[160px] inline-block align-bottom ml-2">
                        {row.name}
                      </span>
                    </td>
                    <td className="px-3 py-[7px] align-middle text-[11px] text-muted">{row.chain}</td>
                    <td className="px-3 py-[7px] align-middle font-mono text-right whitespace-nowrap">
                      {formatBalance(row.balance)}
                    </td>
                    <td className="px-3 py-[7px] align-middle font-mono text-right text-muted whitespace-nowrap">
                      {row.valueUsd > 0
                        ? `$${row.valueUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                        : ""}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Per-chain errors (matches Lit) */}
        {chainErrors.length > 0 && (
          <div className="mt-2 text-[11px] text-muted">
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
      </>
    );
  }

  /* ── NFTs grid (matches Lit renderNftsView) ────────────────────────── */

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
