import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getVrmBackgroundUrl,
  getVrmNeedsFlip,
  getVrmPreviewUrl,
  getVrmTitle,
  getVrmUrl,
  useApp,
  VRM_COUNT,
} from "../AppContext";
import type {
  BscTradeQuoteResponse,
  BscTradeTxStatusResponse,
  WalletTradingProfileResponse,
  WalletTradingProfileSourceFilter,
  WalletTradingProfileWindow,
} from "../api-client";
import { client } from "../api-client";
import { resolveApiUrl, resolveAppAssetUrl } from "../asset-url";
import { createTranslator } from "../i18n";
import { IdentityCard } from "./IdentityCard";
import {
  MOOD_ANIMATION_POOLS,
  pickRandomAnimationDef,
  resolveCompanionAnimationIntent,
} from "./avatar/companionAnimationIntent";
import type { VrmEngine, VrmEngineState } from "./avatar/VrmEngine";
import { VrmViewer } from "./avatar/VrmViewer";
import { BubbleEmote } from "./BubbleEmote";
import { ChatModalView } from "./ChatModalView";
import { WalletTradingProfileModal } from "./WalletTradingProfileModal";
import {
  getWalletTxStatusLabel,
  mapWalletTradeError,
} from "./wallet-trade-helpers";

const BSC_GAS_READY_THRESHOLD = 0.005;
const BSC_SWAP_GAS_RESERVE = 0.002;
const HEX_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const MILADY_BSC_TOKEN_ADDRESS = "0xc20e45e49e0e79f0fc81e71f05fd2772d6587777";
const BSC_USDT_TOKEN_ADDRESS = "0x55d398326f99059fF775485246999027B3197955";
const BSC_USDC_TOKEN_ADDRESS = "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d";
const BSC_NATIVE_LOGO_URL =
  "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/smartchain/info/logo.png";
const SOL_NATIVE_LOGO_URL =
  "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/solana/info/logo.png";
const WALLET_RECENT_TRADES_KEY = "anime_wallet_recent_trades";
const MAX_WALLET_RECENT_TRADES = 10;

type WalletPortfolioChainFilter = "all" | "bsc" | "evm" | "solana";

type WalletTokenRow = {
  key: string;
  symbol: string;
  name: string;
  chain: string;
  chainKey: Exclude<WalletPortfolioChainFilter, "all">;
  assetAddress: string | null;
  isNative: boolean;
  valueUsd: number;
  balance: string;
  logoUrl: string | null;
};

type WalletCollectibleRow = {
  key: string;
  chain: string;
  chainKey: Exclude<WalletPortfolioChainFilter, "all">;
  name: string;
  collectionName: string;
  imageUrl: string | null;
};

type WalletRecentTrade = {
  hash: string;
  side: "buy" | "sell";
  tokenAddress: string;
  amount: string;
  inputSymbol: string;
  outputSymbol: string;
  createdAt: number;
  status: BscTradeTxStatusResponse["status"];
  confirmations: number;
  nonce: number | null;
  reason: string | null;
  explorerUrl: string;
};

type WalletRecentFilter = "all" | BscTradeTxStatusResponse["status"];

type TokenMetadata = {
  symbol: string;
  name: string;
  logoUrl: string | null;
};

function isBscChainName(chain: string): boolean {
  const normalized = chain.trim().toLowerCase();
  return (
    normalized === "bsc" ||
    normalized === "bnb chain" ||
    normalized === "bnb smart chain"
  );
}

function resolvePortfolioChainKey(
  chain: string,
): Exclude<WalletPortfolioChainFilter, "all"> {
  const normalized = chain.trim().toLowerCase();
  if (isBscChainName(chain)) return "bsc";
  if (normalized.includes("solana") || normalized === "sol") return "solana";
  return "evm";
}

function formatRouteAddress(address: string): string {
  const trimmed = address.trim();
  if (trimmed.length <= 14) return trimmed;
  return `${trimmed.slice(0, 6)}...${trimmed.slice(-4)}`;
}

function getTokenExplorerUrl(row: WalletTokenRow): string | null {
  if (!row.assetAddress) return null;
  if (row.chainKey === "solana")
    return `https://solscan.io/token/${row.assetAddress}`;
  const chain = row.chain.trim().toLowerCase();
  if (isBscChainName(row.chain))
    return `https://bscscan.com/token/${row.assetAddress}`;
  if (chain === "ethereum" || chain === "mainnet")
    return `https://etherscan.io/token/${row.assetAddress}`;
  if (chain === "base") return `https://basescan.org/token/${row.assetAddress}`;
  if (chain === "arbitrum")
    return `https://arbiscan.io/token/${row.assetAddress}`;
  if (chain === "optimism")
    return `https://optimistic.etherscan.io/token/${row.assetAddress}`;
  if (chain === "polygon")
    return `https://polygonscan.com/token/${row.assetAddress}`;
  return null;
}

function loadRecentTrades(): WalletRecentTrade[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(WALLET_RECENT_TRADES_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (entry): entry is WalletRecentTrade =>
          Boolean(entry) &&
          typeof entry === "object" &&
          typeof entry.hash === "string" &&
          typeof entry.side === "string" &&
          (entry.side === "buy" || entry.side === "sell") &&
          typeof entry.createdAt === "number" &&
          typeof entry.status === "string",
      )
      .slice(0, MAX_WALLET_RECENT_TRADES);
  } catch {
    return [];
  }
}

function persistRecentTrades(rows: WalletRecentTrade[]): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(
      WALLET_RECENT_TRADES_KEY,
      JSON.stringify(rows.slice(0, MAX_WALLET_RECENT_TRADES)),
    );
  } catch {
    // Ignore persistence errors so wallet actions remain usable.
  }
}

function shortHash(hash: string): string {
  const normalized = hash.trim();
  if (normalized.length <= 14) return normalized;
  return `${normalized.slice(0, 8)}...${normalized.slice(-6)}`;
}

function getRecentTradeGroupKey(
  createdAt: number,
  nowMs: number = Date.now(),
): "today" | "yesterday" | "earlier" {
  const DAY_MS = 24 * 60 * 60 * 1000;
  const now = new Date(nowMs);
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  const startOfCreatedAt = new Date(createdAt);
  const createdDayStart = new Date(
    startOfCreatedAt.getFullYear(),
    startOfCreatedAt.getMonth(),
    startOfCreatedAt.getDate(),
  ).getTime();
  if (createdDayStart >= startOfToday) return "today";
  if (createdDayStart >= startOfToday - DAY_MS) return "yesterday";
  return "earlier";
}

type DexScreenerTokenRef = {
  address?: string;
  symbol?: string;
  name?: string;
};

type DexScreenerPair = {
  chainId?: string;
  baseToken?: DexScreenerTokenRef;
  quoteToken?: DexScreenerTokenRef;
  info?: {
    imageUrl?: string;
  };
};

type DexScreenerTokenResponse = {
  pairs?: DexScreenerPair[];
};

async function fetchBscTokenMetadata(
  contractAddress: string,
): Promise<TokenMetadata | null> {
  if (typeof fetch !== "function") return null;
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), 3500);
  const normalized = contractAddress.trim().toLowerCase();

  try {
    const response = await fetch(
      `https://api.dexscreener.com/latest/dex/tokens/${contractAddress}`,
      {
        signal: controller.signal,
      },
    );
    if (!response.ok) return null;
    const payload = (await response.json()) as DexScreenerTokenResponse;
    const pairs = Array.isArray(payload.pairs) ? payload.pairs : [];
    const pair = pairs.find(
      (item) => (item.chainId ?? "").toLowerCase() === "bsc",
    );
    if (!pair) return null;
    const baseAddr = pair.baseToken?.address?.trim().toLowerCase();
    const quoteAddr = pair.quoteToken?.address?.trim().toLowerCase();
    const tokenRef =
      baseAddr === normalized
        ? pair.baseToken
        : quoteAddr === normalized
          ? pair.quoteToken
          : pair.baseToken;
    return {
      symbol: tokenRef?.symbol?.trim() || "MILADY",
      name: tokenRef?.name?.trim() || "Milady",
      logoUrl: pair.info?.imageUrl?.trim() || null,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export function CompanionView() {
  const {
    setState,
    selectedVrmIndex,
    customVrmUrl,
    customBackgroundUrl,
    copyToClipboard,
    uiLanguage,
    setUiLanguage,
    setTab,
    setUiShellMode,
    // Header properties
    agentStatus,
    cloudEnabled,
    cloudConnected,
    cloudCredits,
    cloudCreditsCritical,
    cloudCreditsLow,
    cloudTopUpUrl,
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
    lifecycleBusy,
    lifecycleAction,
    handlePauseResume,
    handleRestart,
    setActionNotice,
    // Identity
    nfaStatus,
    nfaStatusLoading,
    nfaStatusError,
    loadNfaStatus,
  } = useApp();
  const t = useMemo(() => createTranslator(uiLanguage), [uiLanguage]);

  // Compute Header properties
  const name = agentStatus?.agentName ?? "Milady";
  const agentState = agentStatus?.state ?? "not_started";

  const stateColor =
    agentState === "running"
      ? "text-ok border-ok"
      : agentState === "paused" ||
          agentState === "restarting" ||
          agentState === "starting"
        ? "text-warn border-warn"
        : agentState === "error"
          ? "text-danger border-danger"
          : "text-muted border-muted";

  const restartBusy = lifecycleBusy && lifecycleAction === "restart";
  const pauseResumeBusy = lifecycleBusy;
  const pauseResumeDisabled =
    lifecycleBusy || agentState === "restarting" || agentState === "starting";

  const creditColor = cloudCreditsCritical
    ? "border-danger text-danger"
    : cloudCreditsLow
      ? "border-warn text-warn"
      : "border-ok text-ok";

  const evmShort = walletAddresses?.evmAddress
    ? `${walletAddresses.evmAddress.slice(0, 4)}...${walletAddresses.evmAddress.slice(-4)}`
    : null;
  const solShort = walletAddresses?.solanaAddress
    ? `${walletAddresses.solanaAddress.slice(0, 4)}...${walletAddresses.solanaAddress.slice(-4)}`
    : null;
  const evmAddress = walletAddresses?.evmAddress ?? null;
  const solAddress = walletAddresses?.solanaAddress ?? null;

  const [walletPanelOpen, setWalletPanelOpen] = useState(false);
  const [identityPanelOpen, setIdentityPanelOpen] = useState(false);
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
  const [walletProfileOpen, setWalletProfileOpen] = useState(false);
  const [walletProfileLoading, setWalletProfileLoading] = useState(false);
  const [walletProfileError, setWalletProfileError] = useState<string | null>(
    null,
  );
  const [walletProfileWindow, setWalletProfileWindow] =
    useState<WalletTradingProfileWindow>("30d");
  const [walletProfileSource, setWalletProfileSource] =
    useState<WalletTradingProfileSourceFilter>("all");
  const [walletProfileData, setWalletProfileData] =
    useState<WalletTradingProfileResponse | null>(null);
  const [characterRosterOpen, setCharacterRosterOpen] = useState(false);
  const [chatDockOpen, setChatDockOpen] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth > 1024 : true,
  );
  const [vrmLoaded, setVrmLoaded] = useState(false);
  const [showVrmFallback, setShowVrmFallback] = useState(false);
  const vrmEngineRef = useRef<VrmEngine | null>(null);
  const currentAmbientIntentIdRef = useRef<string | null>(null);
  const idleCycleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const actionAnimatingRef = useRef(false);
  const ambientBlockedUntilMsRef = useRef(0);
  const emoteLoopOverrideRef = useRef(false);
  const scheduleNextAccentRef = useRef<() => void>(() => {});
  const recentTxRefreshAtRef = useRef<Record<string, number>>({});

  const walletPanelRef = useRef<HTMLDivElement | null>(null);
  const identityPanelRef = useRef<HTMLDivElement | null>(null);
  const vrmFileInputRef = useRef<HTMLInputElement | null>(null);
  const bgFileInputRef = useRef<HTMLInputElement | null>(null);

  const handleRosterVrmUpload = useCallback(
    (file: File) => {
      if (!file.name.toLowerCase().endsWith(".vrm")) return;
      void (async () => {
        const buf = await file.arrayBuffer();
        const bytes = new Uint8Array(buf.slice(0, 32));
        const text = new TextDecoder().decode(bytes);
        if (text.startsWith("version https://git-lfs.github.com/spec/v1")) {
          alert("This .vrm is a Git LFS pointer, not the real model file.");
          return;
        }
        if (
          bytes.length < 4 ||
          bytes[0] !== 0x67 ||
          bytes[1] !== 0x6c ||
          bytes[2] !== 0x54 ||
          bytes[3] !== 0x46
        ) {
          alert("Invalid VRM file. Please select a valid .vrm binary.");
          return;
        }
        const previousIndex = selectedVrmIndex;
        const url = URL.createObjectURL(file);
        setState("customVrmUrl", url);
        setState("selectedVrmIndex", 0);
        client
          .uploadCustomVrm(file)
          .then(() => {
            setState(
              "customVrmUrl",
              resolveApiUrl(`/api/avatar/vrm?t=${Date.now()}`),
            );
            requestAnimationFrame(() => URL.revokeObjectURL(url));
          })
          .catch(() => {
            setState("selectedVrmIndex", previousIndex);
            URL.revokeObjectURL(url);
          });
      })();
    },
    [selectedVrmIndex, setState],
  );

  const handleBgUpload = useCallback(
    (file: File) => {
      if (!file.type.startsWith("image/")) return;
      const url = URL.createObjectURL(file);
      setState("customBackgroundUrl", url);
      if (selectedVrmIndex !== 0) setState("selectedVrmIndex", 0);
      client
        .uploadCustomBackground(file)
        .then(() => {
          setState(
            "customBackgroundUrl",
            resolveApiUrl(`/api/avatar/background?t=${Date.now()}`),
          );
          requestAnimationFrame(() => URL.revokeObjectURL(url));
        })
        .catch(() => {
          setState("customBackgroundUrl", "");
          URL.revokeObjectURL(url);
        });
    },
    [selectedVrmIndex, setState],
  );

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

  const walletBnbUsdEstimate = useMemo(() => {
    const bscNative = walletBalances?.evm?.chains.find((chain) =>
      isBscChainName(chain.chain),
    );
    if (!bscNative) return null;
    const nativeBalance = Number.parseFloat(bscNative.nativeBalance);
    const nativeValueUsd = Number.parseFloat(bscNative.nativeValueUsd);
    if (!Number.isFinite(nativeBalance) || nativeBalance <= 0) return null;
    if (!Number.isFinite(nativeValueUsd) || nativeValueUsd <= 0) return null;
    const estimate = nativeValueUsd / nativeBalance;
    return Number.isFinite(estimate) && estimate > 0 ? estimate : null;
  }, [walletBalances]);

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
    const options: Array<{ value: WalletPortfolioChainFilter; label: string }> =
      [{ value: "all", label: t("wallet.all") }];
    if (hasBsc) options.push({ value: "bsc", label: "BSC" });
    if (hasEvm) options.push({ value: "evm", label: "EVM" });
    if (hasSolana) options.push({ value: "solana", label: "SOL" });
    return options;
  }, [t, walletCollectibleRows, walletTokenRows]);

  const walletRefreshBusy =
    walletLoading ||
    (walletPortfolioTab === "collectibles" && walletNftsLoading);

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
      { key: "pending" as const, label: getWalletTxStatusLabel("pending", t) },
      { key: "success" as const, label: getWalletTxStatusLabel("success", t) },
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

  const refreshWalletTradingProfile = useCallback(async () => {
    setWalletProfileLoading(true);
    setWalletProfileError(null);
    try {
      const profile = await loadWalletTradingProfile(
        walletProfileWindow,
        walletProfileSource,
      );
      setWalletProfileData(profile);
    } catch (err) {
      setWalletProfileError(
        err instanceof Error ? err.message : t("wallet.profile.loadFailed"),
      );
    } finally {
      setWalletProfileLoading(false);
    }
  }, [loadWalletTradingProfile, t, walletProfileSource, walletProfileWindow]);

  useEffect(() => {
    if (!walletProfileOpen) return;
    void refreshWalletTradingProfile();
  }, [walletProfileOpen, refreshWalletTradingProfile]);

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

  const handleSwitchToNativeShell = useCallback(() => {
    setUiShellMode("native");
    setTab("chat");
  }, [setTab, setUiShellMode]);

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
          t("wallet.tradeSentWithHash", { hash: `${txHash.slice(0, 10)}...` }),
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
    if (!identityPanelOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!identityPanelRef.current?.contains(event.target as Node)) {
        setIdentityPanelOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIdentityPanelOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [identityPanelOpen]);

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
        // Best effort — don't block wallet UX.
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

  const safeSelectedVrmIndex = selectedVrmIndex > 0 ? selectedVrmIndex : 1;
  const avatarMoodTier = "neutral";
  const vrmPath =
    selectedVrmIndex === 0 && customVrmUrl
      ? customVrmUrl
      : getVrmUrl(safeSelectedVrmIndex);
  const fallbackPreviewUrl =
    selectedVrmIndex > 0
      ? getVrmPreviewUrl(safeSelectedVrmIndex)
      : getVrmPreviewUrl(1);
  const vrmBackgroundUrl =
    selectedVrmIndex === 0 && customVrmUrl
      ? customBackgroundUrl || getVrmBackgroundUrl(1)
      : getVrmBackgroundUrl(safeSelectedVrmIndex);
  const needsFlip =
    selectedVrmIndex > 0 && getVrmNeedsFlip(safeSelectedVrmIndex);
  const ambientIntent = useMemo(
    () => resolveCompanionAnimationIntent({ moodTier: avatarMoodTier }),
    [],
  );

  const rosterItems = useMemo(
    () =>
      Array.from({ length: VRM_COUNT }, (_, i) => {
        const index = i + 1;
        return {
          index,
          previewUrl: getVrmPreviewUrl(index),
          title: getVrmTitle(index),
        };
      }),
    [],
  );

  const applyAmbientIntent = useCallback(() => {
    const engine = vrmEngineRef.current;
    if (!engine || !ambientIntent) return;
    // Don't override a user/agent-triggered emote.
    if (emoteLoopOverrideRef.current) return;
    if (Date.now() < ambientBlockedUntilMsRef.current) return;
    if (currentAmbientIntentIdRef.current === ambientIntent.id) return;

    currentAmbientIntentIdRef.current = ambientIntent.id;
    void engine.playEmote(
      ambientIntent.url,
      ambientIntent.durationSec,
      ambientIntent.loop,
    );
  }, [ambientIntent]);

  // --- Feature A: Idle accent cycling ---
  const scheduleNextAccent = useCallback(() => {
    if (idleCycleTimerRef.current) {
      clearTimeout(idleCycleTimerRef.current);
      idleCycleTimerRef.current = null;
    }
    if (actionAnimatingRef.current) return;
    if (emoteLoopOverrideRef.current) return;
    if (Date.now() < ambientBlockedUntilMsRef.current) return;

    const engine = vrmEngineRef.current;
    if (!engine) return;

    const moodTier = avatarMoodTier;
    const pool = MOOD_ANIMATION_POOLS[moodTier];
    if (!pool || pool.accents.length === 0) return;

    const delayMs = (10 + Math.random() * 8) * 1000;

    idleCycleTimerRef.current = setTimeout(() => {
      if (actionAnimatingRef.current) return;
      if (emoteLoopOverrideRef.current) return;
      if (Date.now() < ambientBlockedUntilMsRef.current) return;
      const anim = pickRandomAnimationDef(pool.accents);
      if (anim) {
        void engine.playEmote(anim.url, anim.durationSec, false);
        idleCycleTimerRef.current = setTimeout(
          () => {
            scheduleNextAccentRef.current();
          },
          (anim.durationSec + 0.5) * 1000,
        );
      } else {
        scheduleNextAccentRef.current();
      }
    }, delayMs);
  }, []);

  scheduleNextAccentRef.current = scheduleNextAccent;

  const handleVrmEngineReady = useCallback(
    (engine: VrmEngine) => {
      vrmEngineRef.current = engine;
      currentAmbientIntentIdRef.current = null;
      applyAmbientIntent();
    },
    [applyAmbientIntent],
  );

  const handleVrmEngineState = useCallback(
    (state: VrmEngineState) => {
      if (!state.vrmLoaded) return;
      setVrmLoaded(true);
      setShowVrmFallback(false);
      applyAmbientIntent();
    },
    [applyAmbientIntent],
  );

  useEffect(() => {
    setVrmLoaded(false);
    setShowVrmFallback(false);
    currentAmbientIntentIdRef.current = null;
    ambientBlockedUntilMsRef.current = 0;
    emoteLoopOverrideRef.current = false;
    actionAnimatingRef.current = false;
    if (idleCycleTimerRef.current) {
      clearTimeout(idleCycleTimerRef.current);
      idleCycleTimerRef.current = null;
    }
    applyAmbientIntent();
    const timer = window.setTimeout(() => {
      setShowVrmFallback(true);
    }, 4000);
    return () => window.clearTimeout(timer);
  }, [applyAmbientIntent]);

  useEffect(() => {
    applyAmbientIntent();
  }, [applyAmbientIntent]);

  // --- Feature A lifecycle: start idle accent cycling when VRM is loaded ---
  useEffect(() => {
    if (!vrmLoaded) return;
    scheduleNextAccent();
    return () => {
      if (idleCycleTimerRef.current) {
        clearTimeout(idleCycleTimerRef.current);
        idleCycleTimerRef.current = null;
      }
    };
  }, [vrmLoaded, scheduleNextAccent]);

  // Subscribe to WebSocket emote events so the companion avatar plays emotes
  // triggered from the EmotePicker or agent actions.
  useEffect(() => {
    if (!vrmLoaded) return;
    return client.onWsEvent("emote", (data) => {
      const engine = vrmEngineRef.current;
      if (!engine) return;
      const rawPath = data.glbPath as string;
      const resolvedPath = resolveAppAssetUrl(rawPath);
      const duration =
        typeof data.duration === "number" && Number.isFinite(data.duration)
          ? data.duration
          : 3;
      const isLoop = data.loop === true;

      // Block both ambient systems from overriding this emote.
      currentAmbientIntentIdRef.current = null;
      actionAnimatingRef.current = true;
      if (isLoop) {
        emoteLoopOverrideRef.current = true;
      } else {
        ambientBlockedUntilMsRef.current =
          Date.now() + Math.max(1800, Math.round(duration * 1000) + 700);
      }
      if (idleCycleTimerRef.current) {
        clearTimeout(idleCycleTimerRef.current);
        idleCycleTimerRef.current = null;
      }

      void engine.playEmote(resolvedPath, duration, isLoop);

      if (!isLoop) {
        setTimeout(
          () => {
            actionAnimatingRef.current = false;
            scheduleNextAccent();
          },
          Math.max(1800, Math.round(duration * 1000) + 700),
        );
      }
    });
  }, [vrmLoaded, scheduleNextAccent]);

  // Listen for stop-emote events from the EmotePicker "Stop" button.
  useEffect(() => {
    if (!vrmLoaded) return;
    const handler = () => {
      const engine = vrmEngineRef.current;
      if (!engine) return;
      actionAnimatingRef.current = false;
      emoteLoopOverrideRef.current = false;
      ambientBlockedUntilMsRef.current = 0;
      currentAmbientIntentIdRef.current = null;
      engine.stopEmote();
      setTimeout(() => {
        applyAmbientIntent();
        scheduleNextAccent();
      }, 80);
    };
    document.addEventListener("milady:stop-emote", handler);
    return () => document.removeEventListener("milady:stop-emote", handler);
  }, [vrmLoaded, applyAmbientIntent, scheduleNextAccent]);

  return (
    <div
      className="anime-comp-screen font-display"
      style={{
        backgroundImage: `url("${vrmBackgroundUrl}")`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      <div className="anime-comp-bg-graphic" />

      {/* Model Layer */}
      <div
        className={`anime-comp-model-layer ${chatDockOpen ? "chat-shifted" : ""}`}
      >
        <div
          className="absolute inset-0"
          style={{
            opacity: vrmLoaded ? 1 : 0,
            transition: "opacity 400ms ease",
          }}
        >
          <VrmViewer
            vrmPath={vrmPath}
            mouthOpen={0}
            isSpeaking={false}
            interactive
            cameraProfile="companion"
            interactiveMode="orbitZoom"
            forceFaceCameraFlip={needsFlip}
            onEngineReady={handleVrmEngineReady}
            onEngineState={handleVrmEngineState}
          />
        </div>
        {showVrmFallback && !vrmLoaded && (
          <img
            src={fallbackPreviewUrl}
            alt={t("companion.avatarPreviewAlt")}
            className="anime-vrm-fallback"
          />
        )}
        <div className="anime-comp-bubble-wrap">
          <BubbleEmote
            moodTier={avatarMoodTier}
            activeAction={null}
            visible={vrmLoaded}
          />
        </div>
      </div>

      {/* UI Overlay */}
      <div className="anime-comp-ui-layer">
        {/* Top Header */}
        <header className="anime-comp-header">
          <div className="anime-comp-header-left">
            <button
              type="button"
              className={`anime-btn-ghost anime-chat-toggle-btn ${chatDockOpen ? "is-open" : ""}`}
              onClick={() => setChatDockOpen((open) => !open)}
              title={chatDockOpen ? t("chat.modal.back") : t("nav.chat")}
              data-testid="companion-chat-toggle"
            >
              {chatDockOpen ? (
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="m15 18-6-6 6-6" />
                </svg>
              ) : (
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              )}
            </button>

            <div className="anime-status-pill">
              <div className="anime-logo-circle">M</div>
              <span className="text-sm font-black mr-2 text-[var(--ac-text-primary)]">
                {name}
              </span>
            </div>

            {/* Hub Header Elements */}
            <div className="anime-header-extensions">
              {/* Agent Status */}
              <div className="anime-header-pill">
                <span
                  className={`anime-header-pill-text ${stateColor}`}
                  data-testid="status-pill"
                >
                  {agentState}
                </span>
                {(agentState as string) === "restarting" ||
                (agentState as string) === "starting" ||
                (agentState as string) === "not_started" ||
                (agentState as string) === "stopped" ? (
                  <span className="anime-header-pill-icon opacity-60">
                    <svg
                      className="animate-spin"
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                    </svg>
                  </span>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        void handlePauseResume();
                      }}
                      title={
                        agentState === "paused"
                          ? t("header.resumeAutonomy")
                          : t("header.pauseAutonomy")
                      }
                      className={`anime-header-action-btn ${pauseResumeDisabled ? "is-disabled" : ""}`}
                      disabled={pauseResumeDisabled}
                    >
                      {pauseResumeBusy ? (
                        <svg
                          className="animate-spin"
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
                          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                        </svg>
                      ) : agentState === "paused" ? (
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill="currentColor"
                          aria-hidden="true"
                        >
                          <polygon points="5 3 19 12 5 21 5 3" />
                        </svg>
                      ) : (
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill="currentColor"
                          aria-hidden="true"
                        >
                          <rect x="6" y="4" width="4" height="16" />
                          <rect x="14" y="4" width="4" height="16" />
                        </svg>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        void handleRestart();
                      }}
                      title={t("header.restartAgent")}
                      className={`anime-header-action-btn ${lifecycleBusy || (agentState as string) === "restarting" ? "is-disabled" : ""}`}
                      disabled={
                        lifecycleBusy || (agentState as string) === "restarting"
                      }
                    >
                      {restartBusy ||
                      (agentState as string) === "restarting" ? (
                        <svg
                          className="animate-spin"
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
                          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                        </svg>
                      ) : (
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
                          <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                          <path d="M3 3v5h5" />
                        </svg>
                      )}
                    </button>
                  </>
                )}
              </div>

              {/* Cloud Balance */}
              {(cloudEnabled || cloudConnected) &&
                (cloudConnected ? (
                  <a
                    href={cloudTopUpUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`anime-header-pill is-clickable no-underline hover:no-underline ${cloudCredits === null ? "text-white/60" : creditColor}`}
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
                      <circle cx="12" cy="12" r="10" />
                      <path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8" />
                      <path d="M12 18V6" />
                    </svg>
                    <span className="anime-header-pill-text">
                      {cloudCredits === null
                        ? t("header.cloudConnected")
                        : `$${cloudCredits.toFixed(2)}`}
                    </span>
                  </a>
                ) : (
                  <span className="anime-header-pill is-danger">
                    <span className="anime-header-pill-text">
                      {t("header.cloudDisconnected")}
                    </span>
                  </span>
                ))}

              {/* Wallets */}
              {(evmShort || solShort) && (
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

                    <IdentityCard />

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
                      <div className="anime-wallet-popover-error">
                        {walletError}
                      </div>
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
                              <span className="anime-wallet-address-chain">
                                BSC
                              </span>
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
                              <span className="anime-wallet-address-chain">
                                SOL
                              </span>
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
                                onClick={() =>
                                  setWalletPortfolioChain(chainOption.value)
                                }
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
                                          <img
                                            src={row.logoUrl}
                                            alt=""
                                            loading="lazy"
                                          />
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
                                  onClick={() =>
                                    setWalletTokenDetailsOpen((prev) => !prev)
                                  }
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
                                    <code
                                      title={selectedWalletToken.assetAddress}
                                    >
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
                              filteredWalletCollectibleRows
                                .slice(0, 8)
                                .map((row) => (
                                  <div
                                    key={row.key}
                                    className="anime-wallet-nft-card"
                                  >
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
                                        void refreshRecentTradeStatus(
                                          entry.hash,
                                          true,
                                        );
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
                                onClick={() =>
                                  setWalletRecentExpanded((prev) => !prev)
                                }
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
                                {walletRecentFilterOptions.map(
                                  (filterOption) => (
                                    <button
                                      key={filterOption.key}
                                      type="button"
                                      className={`anime-wallet-portfolio-filter ${walletRecentFilter === filterOption.key ? "is-active" : ""}`}
                                      onClick={() =>
                                        setWalletRecentFilter(filterOption.key)
                                      }
                                      data-testid={`wallet-recent-filter-${filterOption.key}`}
                                    >
                                      {filterOption.label}
                                    </button>
                                  ),
                                )}
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
                                      {group.entries.map(
                                        (entry, entryIndex) => (
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
                                                  {entry.amount}{" "}
                                                  {entry.inputSymbol} {"->"}{" "}
                                                  {entry.outputSymbol}
                                                </span>
                                                <code>
                                                  {shortHash(entry.hash)}
                                                </code>
                                              </div>
                                            </div>
                                            <div className="anime-wallet-recent-actions">
                                              <span
                                                className={`anime-wallet-tx-pill is-${entry.status}`}
                                              >
                                                {getWalletTxStatusLabel(
                                                  entry.status,
                                                  t,
                                                )}
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
                                                  void handleCopyRecentTxHash(
                                                    entry.hash,
                                                  );
                                                }}
                                              >
                                                {t("wallet.copyTxHash")}
                                              </button>
                                              <button
                                                type="button"
                                                className="anime-wallet-address-copy"
                                                disabled={Boolean(
                                                  walletRecentBusyHashes[
                                                    entry.hash
                                                  ],
                                                )}
                                                onClick={() => {
                                                  void refreshRecentTradeStatus(
                                                    entry.hash,
                                                  );
                                                }}
                                              >
                                                {walletRecentBusyHashes[
                                                  entry.hash
                                                ]
                                                  ? t("wallet.refreshing")
                                                  : t("wallet.txStatusRefresh")}
                                              </button>
                                            </div>
                                            {(entry.confirmations > 0 ||
                                              typeof entry.nonce ===
                                                "number") && (
                                              <div className="anime-wallet-recent-extra">
                                                {entry.confirmations > 0 && (
                                                  <span>
                                                    {t(
                                                      "wallet.txStatus.confirmations",
                                                      {
                                                        count:
                                                          entry.confirmations,
                                                      },
                                                    )}
                                                  </span>
                                                )}
                                                {typeof entry.nonce ===
                                                  "number" && (
                                                  <span>
                                                    {t(
                                                      "wallet.txStatus.nonce",
                                                      { nonce: entry.nonce },
                                                    )}
                                                  </span>
                                                )}
                                              </div>
                                            )}
                                            {entry.status === "reverted" &&
                                              entry.reason && (
                                                <div className="anime-wallet-recent-reason">
                                                  {entry.reason}
                                                </div>
                                              )}
                                          </div>
                                        ),
                                      )}
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
                            onChange={(event) =>
                              setSwapTokenAddress(event.target.value)
                            }
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
                              onChange={(event) =>
                                setSwapAmount(event.target.value)
                              }
                              placeholder="0.01"
                            />
                          </label>
                          <label className="anime-wallet-field">
                            <span>{t("wallet.slippagePercent")}</span>
                            <input
                              type="text"
                              value={swapSlippage}
                              onChange={(event) =>
                                setSwapSlippage(event.target.value)
                              }
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
                              disabled={
                                !swapCanUsePresets ||
                                swapBusy ||
                                swapExecuteBusy
                              }
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
                            {swapBusy
                              ? t("wallet.quoting")
                              : t("wallet.getQuote")}
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
                                {swapQuote.quoteIn.amount}{" "}
                                {swapQuote.quoteIn.symbol}
                              </strong>
                            </div>
                            <div className="anime-wallet-quote-line">
                              <span>{t("wallet.quote.expected")}</span>
                              <strong>
                                {swapQuote.quoteOut.amount}{" "}
                                {swapQuote.quoteOut.symbol}
                              </strong>
                            </div>
                            <div className="anime-wallet-quote-line">
                              <span>{t("wallet.quote.minReceive")}</span>
                              <strong>
                                {swapQuote.minReceive.amount}{" "}
                                {swapQuote.minReceive.symbol}
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
                                    void handleCopyUserSignPayload(
                                      swapUserSignApprovalTx,
                                    );
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
                                    void handleCopyUserSignPayload(
                                      swapUserSignTx,
                                    );
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
                              onChange={(event) =>
                                setSendAmount(event.target.value)
                              }
                              placeholder="0.01"
                            />
                          </label>
                          <label className="anime-wallet-field">
                            <span>{t("wallet.asset")}</span>
                            <select
                              value={sendAsset}
                              onChange={(event) =>
                                setSendAsset(event.target.value)
                              }
                            >
                              <option value="BNB">BNB</option>
                              <option value="USDT">USDT</option>
                              <option value="USDC">USDC</option>
                            </select>
                          </label>
                        </div>
                        <div className="anime-wallet-send-hint">
                          {t("wallet.sendHint")}
                        </div>
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
                                  void handleCopyUserSignPayload(
                                    sendUserSignTx,
                                  );
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
              )}
            </div>

              {/* Identity (BAP-578 / ERC-8004) */}
              <div className="anime-header-identity-shell" ref={identityPanelRef}>
                <button
                  type="button"
                  className={`anime-header-pill anime-header-wallet-trigger ${identityPanelOpen ? "is-open" : ""}`}
                  onClick={() => {
                    if (!identityPanelOpen) void loadNfaStatus();
                    setIdentityPanelOpen((prev) => !prev);
                  }}
                  aria-expanded={identityPanelOpen}
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
                    <path d="M12 10a2 2 0 1 0 4 0 2 2 0 1 0-4 0" />
                    <path d="M2 12C2 6.5 6.5 2 12 2s10 4.5 10 10-4.5 10-10 10S2 17.5 2 12" />
                    <path d="M7 20.7a7 7 0 0 1 10 0" />
                  </svg>
                  <span className="anime-header-pill-text">ID</span>
                  <svg
                    className={`anime-header-wallet-caret ${identityPanelOpen ? "is-open" : ""}`}
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
                  className={`anime-identity-popover ${identityPanelOpen ? "is-open" : ""}`}
                  role="dialog"
                  aria-label="On-chain Identity"
                >
                  <div className="anime-identity-popover-head">
                    <div className="anime-identity-popover-title">On-Chain Identity</div>
                    <div className="anime-identity-popover-sub">
                      {nfaStatus?.nfa
                        ? `NFA #${nfaStatus.nfa.tokenId}`
                        : nfaStatus?.identity
                          ? `Agent ${nfaStatus.identity.agentId}`
                          : "Not registered"}
                    </div>
                  </div>

                  {nfaStatusLoading && (
                    <div className="anime-identity-loading">Loading...</div>
                  )}

                  {nfaStatusError && (
                    <div className="anime-identity-error">{nfaStatusError}</div>
                  )}

                  {!nfaStatusLoading && !nfaStatus?.identity && !nfaStatus?.nfa && (
                    <div className="anime-identity-empty">
                      No on-chain identity registered.
                      <br />
                      Use chat to <strong>register milady on bnb chain</strong> or <strong>mint nfa</strong>.
                    </div>
                  )}

                  {/* ERC-8004 */}
                  {nfaStatus?.identity && (
                    <div className="anime-identity-section">
                      <div className="anime-identity-section-title">ERC-8004 Agent Registry</div>
                      <div className="anime-identity-row">
                        <span>Agent ID</span>
                        <code>{nfaStatus.identity.agentId}</code>
                      </div>
                      <div className="anime-identity-row">
                        <span>Network</span>
                        <span>{nfaStatus.identity.network}</span>
                      </div>
                      <div className="anime-identity-row">
                        <span>Owner</span>
                        <a
                          href={`https://bscscan.com/address/${nfaStatus.identity.ownerAddress}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="anime-identity-link"
                        >
                          {`${nfaStatus.identity.ownerAddress.slice(0, 6)}...${nfaStatus.identity.ownerAddress.slice(-4)}`}
                        </a>
                      </div>
                      <div className="anime-identity-row">
                        <span>Registered</span>
                        <span>{new Date(nfaStatus.identity.registeredAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  )}

                  {/* BAP-578 NFA */}
                  {nfaStatus?.nfa && (
                    <div className="anime-identity-section">
                      <div className="anime-identity-section-title">
                        BAP-578 NFA
                        <span className={`anime-identity-badge ${nfaStatus.onChain?.active !== false ? "is-active" : "is-paused"}`}>
                          {nfaStatus.onChain?.active !== false ? "Active" : "Paused"}
                        </span>
                        {nfaStatus.nfa.freeMint && (
                          <span className="anime-identity-badge is-free">Free Mint</span>
                        )}
                      </div>
                      <div className="anime-identity-row">
                        <span>Token ID</span>
                        <a
                          href={`https://bscscan.com/token/0x8cc16Dd6d816A33A6822344C3F8958e6dfEfcA34?a=${nfaStatus.nfa.tokenId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="anime-identity-link"
                        >
                          #{nfaStatus.nfa.tokenId}
                        </a>
                      </div>
                      <div className="anime-identity-row">
                        <span>Owner</span>
                        <a
                          href={`https://bscscan.com/address/${nfaStatus.nfa.owner}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="anime-identity-link"
                        >
                          {`${nfaStatus.nfa.owner.slice(0, 6)}...${nfaStatus.nfa.owner.slice(-4)}`}
                        </a>
                      </div>
                      <div className="anime-identity-row">
                        <span>Network</span>
                        <span>{nfaStatus.nfa.network}</span>
                      </div>
                      {nfaStatus.nfa.logicContract && (
                        <div className="anime-identity-row">
                          <span>Logic</span>
                          <a
                            href={`https://bscscan.com/address/${nfaStatus.nfa.logicContract}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="anime-identity-link"
                          >
                            {`${nfaStatus.nfa.logicContract.slice(0, 6)}...${nfaStatus.nfa.logicContract.slice(-4)}`}
                          </a>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Learning */}
                  {nfaStatus?.nfa && (
                    <div className="anime-identity-section">
                      <div className="anime-identity-section-title">Learning History</div>
                      <div className="anime-identity-row">
                        <span>Entries</span>
                        <span>{nfaStatus.nfa.learningCount}</span>
                      </div>
                      <div className="anime-identity-row">
                        <span>Merkle Root</span>
                        <code title={nfaStatus.nfa.learningRoot}>
                          {nfaStatus.nfa.learningRoot
                            ? `${nfaStatus.nfa.learningRoot.slice(0, 10)}...${nfaStatus.nfa.learningRoot.slice(-6)}`
                            : "—"}
                        </code>
                      </div>
                      <div className="anime-identity-row">
                        <span>Last Anchored</span>
                        <span>
                          {nfaStatus.nfa.lastAnchoredAt
                            ? new Date(nfaStatus.nfa.lastAnchoredAt).toLocaleDateString()
                            : "Never"}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* On-Chain Metadata */}
                  {nfaStatus?.onChain?.metadata && (
                    <div className="anime-identity-section">
                      <div className="anime-identity-section-title">On-Chain Metadata</div>
                      {nfaStatus.onChain.metadata.persona && (
                        <div className="anime-identity-row">
                          <span>Persona</span>
                          <span>{nfaStatus.onChain.metadata.persona}</span>
                        </div>
                      )}
                      {nfaStatus.onChain.metadata.experience && (
                        <div className="anime-identity-row">
                          <span>Experience</span>
                          <span>{nfaStatus.onChain.metadata.experience}</span>
                        </div>
                      )}
                      {nfaStatus.onChain.metadata.vaultHash && (
                        <div className="anime-identity-row">
                          <span>Vault Hash</span>
                          <code title={nfaStatus.onChain.metadata.vaultHash}>
                            {`${nfaStatus.onChain.metadata.vaultHash.slice(0, 10)}...`}
                          </code>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
          </div>

          <div className="anime-comp-header-right">
            <div
              className={`anime-character-header-control ${characterRosterOpen ? "is-open" : ""}`}
            >
              <button
                type="button"
                className="anime-character-header-toggle"
                onClick={() => setCharacterRosterOpen((prev) => !prev)}
                aria-expanded={characterRosterOpen}
                aria-controls="anime-character-roster"
                data-testid="character-roster-toggle"
              >
                <span className="anime-character-header-label">
                  {t("nav.character")}
                </span>
                <svg
                  className={`anime-character-header-caret ${characterRosterOpen ? "is-open" : ""}`}
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>

              <button
                type="button"
                onClick={() => setTab("character")}
                className="anime-roster-config-btn"
                title={t("companion.characterSettings")}
                data-testid="character-roster-settings"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              </button>

              <button
                type="button"
                onClick={handleSwitchToNativeShell}
                className="anime-roster-config-btn"
                title={t("companion.switchToNativeUi")}
                data-testid="ui-shell-toggle"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <rect x="3" y="4" width="18" height="14" rx="2" />
                  <line x1="8" y1="20" x2="16" y2="20" />
                  <line x1="12" y1="18" x2="12" y2="20" />
                </svg>
              </button>

              <fieldset
                className="anime-lang-toggle"
                aria-label={t("settings.language")}
                data-testid="companion-language-toggle"
              >
                <button
                  type="button"
                  className={`anime-lang-toggle-btn ${uiLanguage === "en" ? "is-active" : ""}`}
                  onClick={() => setUiLanguage("en")}
                  aria-pressed={uiLanguage === "en"}
                  data-testid="companion-language-en"
                >
                  EN
                </button>
                <button
                  type="button"
                  className={`anime-lang-toggle-btn ${uiLanguage === "zh-CN" ? "is-active" : ""}`}
                  onClick={() => setUiLanguage("zh-CN")}
                  aria-pressed={uiLanguage === "zh-CN"}
                  data-testid="companion-language-zh"
                >
                  {t("settings.languageChineseSimplified")}
                </button>
              </fieldset>
            </div>

            <button
              type="button"
              className={`anime-character-profile-trigger ${walletProfileOpen ? "is-open" : ""}`}
              onClick={() => setWalletProfileOpen(true)}
              title={t("wallet.profile.title")}
              aria-label={t("wallet.profile.title")}
              data-testid="wallet-profile-trigger"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M8 21h8" />
                <path d="M12 17v4" />
                <path d="M7 4h10v2a5 5 0 0 1-10 0z" />
                <path d="M5 6H3a2 2 0 0 0 2 4h2" />
                <path d="M19 6h2a2 2 0 0 1-2 4h-2" />
              </svg>
            </button>
          </div>
        </header>

        <div
          className={`anime-comp-chat-dock-anchor ${chatDockOpen ? "is-open" : ""}`}
          data-testid="companion-chat-dock"
        >
          <ChatModalView
            variant="companion-dock"
            onRequestClose={() => setChatDockOpen(false)}
          />
        </div>

        {/* Main Content Area */}
        <div className="anime-comp-main-grid">
          {/* Center (Empty to show character) */}
          <div className="anime-comp-center" />

          {/* Right Panel: Actions + Character Drawer */}
          <aside className="anime-comp-right-panel">
            <div
              id="anime-character-roster"
              className={`anime-character-panel-shell ${characterRosterOpen ? "is-open" : ""}`}
            >
              <div className="anime-roster anime-comp-character-panel glass-panel">
                {selectedVrmIndex === 0 && (
                  <div className="text-xs text-accent mt-1 mb-2">
                    {t("companion.customVrmActive")}
                  </div>
                )}
                <div className="anime-roster-list">
                  {rosterItems.map((item) => {
                    const active =
                      selectedVrmIndex !== 0 &&
                      item.index === safeSelectedVrmIndex;
                    return (
                      <button
                        key={item.index}
                        type="button"
                        className={`anime-roster-item ${active ? "is-active" : ""}`}
                        onClick={() => setState("selectedVrmIndex", item.index)}
                      >
                        <img
                          src={item.previewUrl}
                          alt={item.title}
                          className="anime-roster-img"
                        />
                        <div className="anime-roster-meta">
                          <span className="anime-roster-name">
                            {item.title}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                  {/* Upload custom VRM */}
                  <input
                    ref={vrmFileInputRef}
                    type="file"
                    accept=".vrm"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleRosterVrmUpload(f);
                      e.target.value = "";
                    }}
                  />
                  <button
                    type="button"
                    className={`anime-roster-item ${selectedVrmIndex === 0 ? "is-active" : ""}`}
                    onClick={() => vrmFileInputRef.current?.click()}
                    title="Upload custom .vrm"
                  >
                    <div
                      className="anime-roster-img"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <svg
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <title>Upload VRM</title>
                        <path d="M12 5v14m-7-7h14" />
                      </svg>
                    </div>
                    <div className="anime-roster-meta">
                      <span className="anime-roster-name">Custom</span>
                    </div>
                  </button>
                </div>
                {/* Upload custom background */}
                <input
                  ref={bgFileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleBgUpload(f);
                    e.target.value = "";
                  }}
                />
                <button
                  type="button"
                  className="text-xs text-muted hover:text-accent mt-2 flex items-center gap-1"
                  onClick={() => bgFileInputRef.current?.click()}
                  title="Upload custom background image"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <title>Upload Background</title>
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <path d="M21 15l-5-5L5 21" />
                  </svg>
                  Change Background
                </button>
              </div>
            </div>

            {/* Game HUD Icon Menu */}
            <nav className="anime-hub-menu">
              {/* Talents */}
              <button
                type="button"
                className="anime-hub-btn"
                onClick={() => setTab("skills")}
                style={
                  {
                    "--ac-accent": "#00e1ff",
                    "--ac-accent-rgb": "0, 225, 255",
                  } as React.CSSProperties
                }
              >
                <div className="anime-hub-btn-icon">
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                  </svg>
                </div>
                <span className="anime-hub-btn-label">{t("nav.talents")}</span>
              </button>

              {/* Knowledge */}
              <button
                type="button"
                className="anime-hub-btn"
                onClick={() => setTab("knowledge")}
                style={
                  {
                    "--ac-accent": "#a78bfa",
                    "--ac-accent-rgb": "167, 139, 250",
                  } as React.CSSProperties
                }
              >
                <div className="anime-hub-btn-icon">
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
                  </svg>
                </div>
                <span className="anime-hub-btn-label">
                  {t("nav.knowledge")}
                </span>
              </button>

              {/* Channels */}
              <button
                type="button"
                className="anime-hub-btn"
                onClick={() => setTab("connectors")}
                style={
                  {
                    "--ac-accent": "#f43f5e",
                    "--ac-accent-rgb": "244, 63, 94",
                  } as React.CSSProperties
                }
              >
                <div className="anime-hub-btn-icon">
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                  </svg>
                </div>
                <span className="anime-hub-btn-label">{t("nav.channels")}</span>
              </button>

              {/* Plugins */}
              <button
                type="button"
                className="anime-hub-btn"
                onClick={() => setTab("plugins")}
                style={
                  {
                    "--ac-accent": "#f0b232",
                    "--ac-accent-rgb": "240, 178, 50",
                  } as React.CSSProperties
                }
              >
                <div className="anime-hub-btn-icon">
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    <circle cx="12" cy="11" r="3" />
                    <path d="M12 8v1M12 13v1M9.5 9.5l.7.7M13.8 13.8l.7.7M9 11H8M16 11h-1M9.5 12.5l.7-.7M13.8 8.2l.7-.7" />
                  </svg>
                </div>
                <span className="anime-hub-btn-label">{t("nav.plugins")}</span>
              </button>

              {/* Apps */}
              <button
                type="button"
                className="anime-hub-btn"
                onClick={() => setTab("apps")}
                style={
                  {
                    "--ac-accent": "#10b981",
                    "--ac-accent-rgb": "16, 185, 129",
                  } as React.CSSProperties
                }
              >
                <div className="anime-hub-btn-icon">
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <rect x="3" y="3" width="7" height="7" rx="1" />
                    <rect x="14" y="3" width="7" height="7" rx="1" />
                    <rect x="3" y="14" width="7" height="7" rx="1" />
                    <rect x="14" y="14" width="7" height="7" rx="1" />
                  </svg>
                </div>
                <span className="anime-hub-btn-label">{t("nav.apps")}</span>
              </button>

              {/* Wallets */}
              <button
                type="button"
                className="anime-hub-btn"
                onClick={() => setTab("wallets")}
                style={
                  {
                    "--ac-accent": "#f0b90b",
                    "--ac-accent-rgb": "240, 185, 11",
                  } as React.CSSProperties
                }
              >
                <div className="anime-hub-btn-icon">
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
                    <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
                    <path d="M18 12a2 2 0 0 0 0 4h4v-4h-4z" />
                  </svg>
                </div>
                <span className="anime-hub-btn-label">
                  {t("nav.wallets") || "Wallets"}
                </span>
              </button>

              {/* Stream */}
              <button
                type="button"
                className="anime-hub-btn"
                onClick={() => setTab("stream")}
                style={
                  {
                    "--ac-accent": "#ef4444",
                    "--ac-accent-rgb": "239, 68, 68",
                  } as React.CSSProperties
                }
              >
                <div className="anime-hub-btn-icon">
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                </div>
                <span className="anime-hub-btn-label">
                  {t("nav.stream") || "Stream"}
                </span>
              </button>

              {/* LIFO Sandbox */}
              <button
                type="button"
                className="anime-hub-btn"
                onClick={() => setTab("lifo")}
                style={
                  {
                    "--ac-accent": "#8b5cf6",
                    "--ac-accent-rgb": "139, 92, 246",
                  } as React.CSSProperties
                }
              >
                <div className="anime-hub-btn-icon">
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <polyline points="4 17 10 11 4 5" />
                    <line x1="12" y1="19" x2="20" y2="19" />
                  </svg>
                </div>
                <span className="anime-hub-btn-label">
                  {t("nav.lifo") || "LIFO"}
                </span>
              </button>

              {/* Settings */}
              <button
                type="button"
                className="anime-hub-btn"
                onClick={() => setTab("settings")}
                style={
                  {
                    "--ac-accent": "#e2e8f0",
                    "--ac-accent-rgb": "226, 232, 240",
                  } as React.CSSProperties
                }
              >
                <div className="anime-hub-btn-icon">
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                </div>
                <span className="anime-hub-btn-label">{t("nav.settings")}</span>
              </button>

              {/* Advanced */}
              <button
                type="button"
                className="anime-hub-btn"
                onClick={() => setTab("advanced")}
                style={
                  {
                    "--ac-accent": "#38bdf8",
                    "--ac-accent-rgb": "56, 189, 248",
                  } as React.CSSProperties
                }
              >
                <div className="anime-hub-btn-icon">
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <polyline points="16 18 22 12 16 6" />
                    <polyline points="8 6 2 12 8 18" />
                  </svg>
                </div>
                <span className="anime-hub-btn-label">{t("nav.advanced")}</span>
              </button>
            </nav>
          </aside>
        </div>

        <WalletTradingProfileModal
          open={walletProfileOpen}
          loading={walletProfileLoading}
          error={walletProfileError}
          profile={walletProfileData}
          bnbUsdEstimate={walletBnbUsdEstimate}
          windowFilter={walletProfileWindow}
          sourceFilter={walletProfileSource}
          onClose={() => setWalletProfileOpen(false)}
          onRefresh={() => {
            void refreshWalletTradingProfile();
          }}
          onWindowFilterChange={(windowFilter) =>
            setWalletProfileWindow(windowFilter)
          }
          onSourceFilterChange={(sourceFilter) =>
            setWalletProfileSource(sourceFilter)
          }
          t={t}
        />
      </div>
    </div>
  );
}
