/**
 * Inventory view — BSC-first wallet balances and NFTs.
 * Terminal-style layout inspired by GMGN / degen trading tools.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../AppContext";
import type { BscTradeQuoteResponse, EvmChainBalance } from "../api-client";

const BSC_GAS_READY_THRESHOLD = 0.005;
const HEX_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const RECENTS_KEY = "wt_recent_contracts";
const MAX_RECENTS = 5;
const TRACKED_BSC_TOKENS_KEY = "wt_tracked_bsc_tokens";
const MAX_TRACKED_BSC_TOKENS = 30;

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

/* ── Recent contracts helpers ─────────────────────────────────────── */

function loadRecents(): string[] {
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x: unknown) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function saveRecent(addr: string, prev: string[]): string[] {
  const next = [addr, ...prev.filter((a) => a.toLowerCase() !== addr.toLowerCase())].slice(
    0,
    MAX_RECENTS,
  );
  try {
    localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
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

interface DexScreenerTokenRef {
  address?: string;
  symbol?: string;
  name?: string;
}

interface DexScreenerPair {
  chainId?: string;
  baseToken?: DexScreenerTokenRef;
  quoteToken?: DexScreenerTokenRef;
  info?: {
    imageUrl?: string;
  };
}

interface DexScreenerTokenResponse {
  pairs?: DexScreenerPair[];
}

interface DexScreenerTokenMetadata {
  symbol?: string;
  name?: string;
  logoUrl?: string;
}

async function fetchDexScreenerBscTokenMetadata(
  contractAddress: string,
): Promise<DexScreenerTokenMetadata | null> {
  if (typeof window === "undefined" || typeof fetch !== "function") return null;

  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), 3500);
  const normalized = toNormalizedAddress(contractAddress);

  try {
    const response = await fetch(
      `https://api.dexscreener.com/latest/dex/tokens/${contractAddress}`,
      {
        signal: controller.signal,
      },
    );
    if (!response.ok) return null;

    const data = (await response.json()) as DexScreenerTokenResponse;
    const pairs = Array.isArray(data.pairs) ? data.pairs : [];
    const bscPairs = pairs.filter((pair) => pair.chainId?.toLowerCase() === "bsc");
    const byBase = bscPairs.find(
      (pair) => toNormalizedAddress(pair.baseToken?.address ?? "") === normalized,
    );
    const byQuote = bscPairs.find(
      (pair) => toNormalizedAddress(pair.quoteToken?.address ?? "") === normalized,
    );
    const picked = byBase ?? byQuote ?? bscPairs[0] ?? pairs[0];
    if (!picked) return null;

    const baseMatches =
      toNormalizedAddress(picked.baseToken?.address ?? "") === normalized;
    const quoteMatches =
      toNormalizedAddress(picked.quoteToken?.address ?? "") === normalized;
    const token = baseMatches
      ? picked.baseToken
      : quoteMatches
        ? picked.quoteToken
        : picked.baseToken;
    const symbol = token?.symbol?.trim();
    const name = token?.name?.trim();
    const logoUrl = picked.info?.imageUrl?.trim();

    return {
      symbol: symbol || undefined,
      name: name || undefined,
      logoUrl: logoUrl || undefined,
    };
  } catch {
    return null;
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

function saveTrackedBscTokens(next: TrackedBscToken[]): void {
  try {
    localStorage.setItem(TRACKED_BSC_TOKENS_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

function upsertTrackedBscToken(
  token: TrackedBscToken,
  prev: TrackedBscToken[],
): TrackedBscToken[] {
  const normalized = toNormalizedAddress(token.contractAddress);
  const rest = prev.filter(
    (item) => toNormalizedAddress(item.contractAddress) !== normalized,
  );
  const next = [{ ...token, contractAddress: token.contractAddress.trim() }, ...rest].slice(
    0,
    MAX_TRACKED_BSC_TOKENS,
  );
  saveTrackedBscTokens(next);
  return next;
}

function removeTrackedBscToken(contractAddress: string, prev: TrackedBscToken[]): TrackedBscToken[] {
  const normalized = toNormalizedAddress(contractAddress);
  const next = prev.filter(
    (item) => toNormalizedAddress(item.contractAddress) !== normalized,
  );
  saveTrackedBscTokens(next);
  return next;
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

interface UserSignPlanState {
  side: "buy" | "sell";
  requiresApproval: boolean;
  unsignedTx: {
    chainId: number;
    to: string;
    data: string;
    valueWei: string;
    deadline: number;
    explorerUrl: string;
  };
  unsignedApprovalTx?: {
    chainId: number;
    to: string;
    data: string;
    valueWei: string;
    explorerUrl: string;
    spender: string;
    amountWei: string;
  };
}

/* ── Token logo with CDN + fallback ──────────────────────────────── */

function tokenLogoUrl(chain: string, contractAddress: string | null): string | null {
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
  const [slippageBps, setSlippageBps] = useState(500);
  const [customSlippageInput, setCustomSlippageInput] = useState("");
  const [tradeBusy, setTradeBusy] = useState(false);
  const [latestQuote, setLatestQuote] = useState<BscTradeQuoteResponse | null>(null);
  const [executeBusy, setExecuteBusy] = useState(false);
  const [latestTxHash, setLatestTxHash] = useState<string | null>(null);
  const [userSignPlan, setUserSignPlan] = useState<UserSignPlanState | null>(null);
  const [recentContracts, setRecentContracts] = useState<string[]>(loadRecents);
  const [trackedBscTokens, setTrackedBscTokens] = useState<TrackedBscToken[]>(
    loadTrackedBscTokens,
  );
  const [showRecents, setShowRecents] = useState(false);
  const recentsRef = useRef<HTMLDivElement>(null);

  // Close recents dropdown on outside click
  useEffect(() => {
    if (
      typeof document === "undefined" ||
      typeof document.addEventListener !== "function"
    ) {
      return;
    }
    const handler = (e: MouseEvent) => {
      if (recentsRef.current && !recentsRef.current.contains(e.target as Node)) {
        setShowRecents(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const cfg = walletConfig;
  const hasManagedBscRpc = Boolean(cfg?.managedBscRpcReady);
  const hasLegacyEvmProviders = Boolean(cfg?.alchemyKeySet || cfg?.ankrKeySet || cfg?.infuraKeySet);
  const needsSetup = !cloudConnected && !hasManagedBscRpc && !hasLegacyEvmProviders;

  const isValidAddress = HEX_ADDRESS_RE.test(quickTokenInput.trim());
  const hasInput = quickTokenInput.trim().length > 0;

  // Effective slippage: custom input takes priority if valid
  const effectiveSlippageBps = useMemo(() => {
    if (customSlippageInput) {
      const parsed = Number.parseFloat(customSlippageInput);
      if (!Number.isNaN(parsed) && parsed > 0 && parsed <= 50) {
        return Math.round(parsed * 100);
      }
    }
    return slippageBps;
  }, [slippageBps, customSlippageInput]);

  const tokenRows = useMemo((): TokenRow[] => {
    const rows: TokenRow[] = [];

    // Derive EVM address directly from state so BNB row can be added
    // even before walletBalances is loaded or when evm is null.
    const knownEvmAddr = walletAddresses?.evmAddress ?? walletConfig?.evmAddress;

    if (walletBalances?.evm) {
      let hasBsc = false;
      for (const chain of walletBalances.evm.chains) {
        if (isBscChainName(chain.chain)) hasBsc = true;
        // Always include native token row — even when chain has an error,
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
        for (const t of chain.tokens) {
          rows.push({
            chain: chain.chain,
            symbol: t.symbol,
            name: t.name,
            contractAddress: t.contractAddress ?? null,
            logoUrl: t.logoUrl ?? null,
            balance: t.balance,
            valueUsd: Number.parseFloat(t.valueUsd) || 0,
            balanceRaw: Number.parseFloat(t.balance) || 0,
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
      // evm is null (RPC not connected yet) — always show BNB row as placeholder
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

    if (walletBalances?.solana) {
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
      for (const t of walletBalances.solana.tokens) {
        rows.push({
          chain: "Solana",
          symbol: t.symbol,
          name: t.name,
          contractAddress: t.mint ?? null,
          logoUrl: t.logoUrl ?? null,
          balance: t.balance,
          valueUsd: Number.parseFloat(t.valueUsd) || 0,
          balanceRaw: Number.parseFloat(t.balance) || 0,
          isNative: false,
        });
      }
    }

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

    return rows;
  }, [walletBalances, walletAddresses, walletConfig, trackedBscTokens]);

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
        slippageBps: effectiveSlippageBps,
      });
      setLatestQuote(quote);
      setUserSignPlan(null);
      setActionNotice(
        `Quote ready: ${quote.quoteIn.amount} ${quote.quoteIn.symbol} → ~${quote.quoteOut.amount} ${quote.quoteOut.symbol}.`,
        "success",
        3200,
      );
      // Save to recents on successful quote
      setRecentContracts((prev) => saveRecent(tokenAddress, prev));
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

  const handleTrackToken = () => {
    const tokenAddress = quickTokenInput.trim();
    if (!tokenAddress) {
      setActionNotice("Paste a token contract first.", "error", 2400);
      return;
    }
    if (!HEX_ADDRESS_RE.test(tokenAddress)) {
      setActionNotice("Token contract must be a valid 0x address.", "error", 2600);
      return;
    }

    const normalized = toNormalizedAddress(tokenAddress);
    const matchedRow = tokenRows.find(
      (row) =>
        Boolean(row.contractAddress) &&
        toNormalizedAddress(row.contractAddress!) === normalized,
    );
    const matchedQuote =
      latestQuote && toNormalizedAddress(latestQuote.tokenAddress) === normalized
        ? latestQuote
        : null;
    const symbolFallback =
      matchedRow?.symbol ??
      (matchedQuote
        ? matchedQuote.side === "buy"
          ? matchedQuote.quoteOut.symbol
          : matchedQuote.quoteIn.symbol
        : `TKN-${tokenAddress.slice(2, 6).toUpperCase()}`);
    const nameFallback = matchedRow?.name ?? `${symbolFallback} token`;
    const logoFallback = matchedRow?.logoUrl ?? null;
    const alreadyTracked = trackedBscTokens.some(
      (item) => toNormalizedAddress(item.contractAddress) === normalized,
    );

    setTrackedBscTokens((prev) =>
      upsertTrackedBscToken(
        {
          contractAddress: tokenAddress,
          symbol: symbolFallback,
          name: nameFallback,
          logoUrl: logoFallback ?? undefined,
        },
        prev,
      ),
    );
    setActionNotice(
      alreadyTracked
        ? "Token contract updated in manual list."
        : "Token contract added to manual list.",
      "success",
      2600,
    );

    // Enrich asynchronously from DexScreener so add action stays instant.
    void (async () => {
      const dexMetadata = await fetchDexScreenerBscTokenMetadata(tokenAddress);
      if (!dexMetadata) return;
      setTrackedBscTokens((prev) =>
        upsertTrackedBscToken(
          {
            contractAddress: tokenAddress,
            symbol: dexMetadata.symbol ?? symbolFallback,
            name: dexMetadata.name ?? nameFallback,
            logoUrl: dexMetadata.logoUrl ?? logoFallback ?? undefined,
          },
          prev,
        ),
      );
    })();
  };

  const handleUntrackToken = (contractAddress: string) => {
    setTrackedBscTokens((prev) => removeTrackedBscToken(contractAddress, prev));
    setActionNotice("Removed from manual token list.", "info", 2200);
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
        setUserSignPlan(null);
        setActionNotice(`Trade sent: ${result.execution.hash.slice(0, 10)}...`, "success", 3600);
        return;
      }
      setLatestTxHash(null);
      if (result.requiresUserSignature) {
        setUserSignPlan({
          side: result.side,
          requiresApproval: Boolean(result.requiresApproval),
          unsignedTx: result.unsignedTx,
          unsignedApprovalTx: result.unsignedApprovalTx,
        });
        if (latestQuote.side === "sell" && result.requiresApproval) {
          setActionNotice(
            "User-sign mode: Step 1 approve token allowance, Step 2 sign sell swap.",
            "info",
            4600,
          );
        } else {
          setActionNotice(
            latestQuote.side === "sell"
              ? "User-sign mode: sign sell swap in your wallet."
              : "Execution switched to user-sign mode. Local key execution is disabled or unavailable.",
            "info",
            4200,
          );
        }
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

  const handleCopyTxPayload = async (
    tx:
      | UserSignPlanState["unsignedTx"]
      | NonNullable<UserSignPlanState["unsignedApprovalTx"]>,
    label: string,
  ) => {
    await copyToClipboard(JSON.stringify(tx, null, 2));
    setActionNotice(`${label} payload copied.`, "success", 2200);
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
              <div className="flex items-center gap-2 mb-1">
                <div className="wt__portfolio-label">Portfolio</div>
                <span className="wt__network-badge">BSC Mainnet</span>
              </div>
              <div className="wt__portfolio-value" data-testid="bsc-balance-value">
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
                  className="wt__receive-btn"
                  onClick={() => {
                    void copyToClipboard(evmAddr);
                    setActionNotice("Address copied — share to receive funds.", "success", 2400);
                  }}
                  title={evmAddr}
                >
                  ↓ Receive
                </button>
              )}
              {evmAddr && <CopyableAddress address={evmAddr} onCopy={copyToClipboard} />}
            </div>
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
          {/* Inline BSC error with retry */}
          {bscChainError && (
            <div className="wt__error-inline mt-2">
              <span className="wt__error-inline-text">BSC: {bscChainError}</span>
              <button
                className="wt__error-retry"
                onClick={() => void loadBalances()}
                title="Retry fetching BSC balance"
              >
                retry ↻
              </button>
            </div>
          )}
        </div>

        {/* ── Block 2: Quick Trade (hero) ───────────────────────── */}
        <div className="wt__quick">
          <div className="wt__quick-row">
            <div className="wt__input-wrap" ref={recentsRef}>
              <input
                data-testid="wallet-quick-token-input"
                value={quickTokenInput}
                onChange={(e) => {
                  setQuickTokenInput(e.target.value);
                  setShowRecents(false);
                }}
                onFocus={() => {
                  if (!quickTokenInput && recentContracts.length > 0) setShowRecents(true);
                }}
                placeholder="Paste token contract (0x...)"
                className={`wt__quick-input${hasInput ? (isValidAddress ? " is-valid" : " is-invalid") : ""}`}
              />
              {recentContracts.length > 0 && (
                <button
                  className="wt__recents-toggle"
                  title="Recent contracts"
                  onClick={() => setShowRecents((v) => !v)}
                  tabIndex={-1}
                >
                  ▾
                </button>
              )}
              {showRecents && recentContracts.length > 0 && (
                <div className="wt__recents">
                  {recentContracts.map((addr) => (
                    <button
                      key={addr}
                      className="wt__recents-item"
                      onClick={() => {
                        setQuickTokenInput(addr);
                        setShowRecents(false);
                      }}
                    >
                      <span className="wt__recents-addr">{addr.slice(0, 10)}...{addr.slice(-6)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

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
              <span className="text-[10px] text-muted self-center font-mono">BNB</span>
            </div>
            <div className="wt__quick-actions">
              <button
                data-testid="wallet-quick-add-token"
                className="wt__btn is-track"
                onClick={handleTrackToken}
                disabled={tradeBusy}
              >
                ADD
              </button>
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

          {/* Slippage selector */}
          <div className="wt__slip">
            <span className="wt__slip-label">Slippage:</span>
            {([100, 300, 500] as const).map((bps) => (
              <button
                key={bps}
                className={`wt__slip-btn${slippageBps === bps && !customSlippageInput ? " is-active" : ""}`}
                onClick={() => {
                  setSlippageBps(bps);
                  setCustomSlippageInput("");
                }}
              >
                {bps / 100}%
              </button>
            ))}
            <input
              className={`wt__slip-input${customSlippageInput ? " is-active" : ""}`}
              placeholder="custom %"
              value={customSlippageInput}
              onChange={(e) => {
                setCustomSlippageInput(e.target.value);
              }}
            />
            {customSlippageInput && (
              <span className="text-[10px] text-muted font-mono self-center">
                = {effectiveSlippageBps} bps
              </span>
            )}
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
            {userSignPlan && (
              <div className="wt__quote-usersign" data-testid="wallet-usersign-plan">
                <div className="wt__quote-k">User-Sign Plan</div>
                {userSignPlan.side === "sell" && userSignPlan.requiresApproval ? (
                  <div className="wt__usersign-steps">
                    <div className="wt__usersign-step">
                      1. Approve token allowance ({latestQuote.quoteIn.symbol})
                    </div>
                    <button
                      className="wt__row-btn is-preflight"
                      data-testid="wallet-copy-approve-tx"
                      onClick={() => {
                        if (userSignPlan.unsignedApprovalTx) {
                          void handleCopyTxPayload(userSignPlan.unsignedApprovalTx, "Approval tx");
                        }
                      }}
                    >
                      COPY APPROVE TX
                    </button>
                    <div className="wt__usersign-step">
                      2. Sign swap tx to execute sell
                    </div>
                    <button
                      className="wt__row-btn is-quote"
                      data-testid="wallet-copy-swap-tx"
                      onClick={() => void handleCopyTxPayload(userSignPlan.unsignedTx, "Swap tx")}
                    >
                      COPY SWAP TX
                    </button>
                  </div>
                ) : (
                  <div className="wt__usersign-steps">
                    <div className="wt__usersign-step">
                      1. Sign swap tx in wallet ({latestQuote.side.toUpperCase()})
                    </div>
                    <button
                      className="wt__row-btn is-quote"
                      data-testid="wallet-copy-swap-tx"
                      onClick={() => void handleCopyTxPayload(userSignPlan.unsignedTx, "Swap tx")}
                    >
                      COPY SWAP TX
                    </button>
                  </div>
                )}
              </div>
            )}
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
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-border">
              <th className="pl-3 pr-2 py-2 text-left w-12" />
              <th className="px-3 py-2 text-left text-[10px] text-muted font-bold uppercase tracking-wide">
                Token
              </th>
              <th className="px-3 py-2 text-right text-[10px] text-muted font-bold uppercase tracking-wide">
                Balance
              </th>
              <th className="px-3 py-2 text-right text-[10px] text-muted font-bold uppercase tracking-wide">
                Value
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
                      <div className="text-sm font-bold font-mono leading-tight">{row.symbol}</div>
                      <div className="text-[10px] text-muted leading-tight mt-0.5">
                        {row.isNative ? (
                          <span className="wt__native-badge">native gas</span>
                        ) : (
                          <span className="inline-flex items-center gap-1">
                            <span className="truncate max-w-[160px] inline-block">{row.name}</span>
                            {row.isTracked && <span className="wt__native-badge">manual</span>}
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
                    : "—"}
                </td>
                {/* Actions */}
                <td className="pl-2 pr-3 py-3 align-middle whitespace-nowrap text-right">
                  {row.isNative ? null : !isBscChainName(row.chain) ? (
                    <span className="text-[10px] text-muted font-mono">view</span>
                  ) : (
                    <div className="inline-flex items-center gap-1">
                      <button
                        data-testid="wallet-token-preflight"
                        className="wt__row-btn is-preflight"
                        title="Preflight check — verify wallet, RPC, and gas are ready"
                        onClick={() => void handleRowAction("preflight", row)}
                        disabled={tradeBusy}
                      >
                        check
                      </button>
                      <button
                        data-testid="wallet-token-quote"
                        className="wt__row-btn is-quote"
                        title="Get a swap quote for this token"
                        onClick={() => void handleRowAction("quote", row)}
                        disabled={tradeBusy}
                      >
                        quote
                      </button>
                      {row.isTracked && row.contractAddress && (
                        <button
                          data-testid="wallet-token-untrack"
                          className="wt__row-btn is-remove"
                          title="Remove from manual token list"
                          onClick={() => handleUntrackToken(row.contractAddress!)}
                          disabled={tradeBusy}
                        >
                          remove
                        </button>
                      )}
                    </div>
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
