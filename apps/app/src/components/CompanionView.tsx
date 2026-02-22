import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getVrmPreviewUrl,
  getVrmTitle,
  getVrmUrl,
  useApp,
  VRM_COUNT,
} from "../AppContext.js";
import type { BscTradeQuoteResponse } from "../api-client.js";
import { VrmViewer } from "./avatar/VrmViewer";
import type { VrmEngine, VrmEngineState } from "./avatar/VrmEngine";
import {
  resolveCompanionAnimationIntent,
  MOOD_ANIMATION_POOLS,
  pickRandomAnimationDef,
} from "./avatar/companionAnimationIntent";
import { BubbleEmote } from "./BubbleEmote";
import { createTranslator } from "../i18n";

const BSC_GAS_READY_THRESHOLD = 0.005;
const BSC_SWAP_GAS_RESERVE = 0.002;
const HEX_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

function isBscChainName(chain: string): boolean {
  const normalized = chain.trim().toLowerCase();
  return normalized === "bsc" || normalized === "bnb chain" || normalized === "bnb smart chain";
}

function formatRouteAddress(address: string): string {
  const trimmed = address.trim();
  if (trimmed.length <= 14) return trimmed;
  return `${trimmed.slice(0, 6)}...${trimmed.slice(-4)}`;
}

export function CompanionView() {
  const {
    setState,
    selectedVrmIndex,
    customVrmUrl,
    copyToClipboard,
    uiLanguage,
    setTab,
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
    walletLoading,
    walletError,
    loadBalances,
    getBscTradePreflight,
    getBscTradeQuote,
    executeBscTrade,
    lifecycleBusy,
    lifecycleAction,
    handlePauseResume,
    handleRestart,
    setActionNotice,
  } = useApp();
  const t = createTranslator(uiLanguage);

  // Compute Header properties
  const name = agentStatus?.agentName ?? "Milady";
  const agentState = agentStatus?.state ?? "not_started";

  const stateColor = agentState === "running" ? "text-ok border-ok" :
    agentState === "paused" || agentState === "restarting" || agentState === "starting" ? "text-warn border-warn" :
      agentState === "error" ? "text-danger border-danger" : "text-muted border-muted";

  const restartBusy = lifecycleBusy && lifecycleAction === "restart";
  const pauseResumeBusy = lifecycleBusy;
  const pauseResumeDisabled = lifecycleBusy || agentState === "restarting" || agentState === "starting";

  const creditColor = cloudCreditsCritical ? "border-danger text-danger" :
    cloudCreditsLow ? "border-warn text-warn" : "border-ok text-ok";

  const evmShort = walletAddresses?.evmAddress
    ? `${walletAddresses.evmAddress.slice(0, 4)}...${walletAddresses.evmAddress.slice(-4)}` : null;
  const solShort = walletAddresses?.solanaAddress
    ? `${walletAddresses.solanaAddress.slice(0, 4)}...${walletAddresses.solanaAddress.slice(-4)}` : null;
  const evmAddress = walletAddresses?.evmAddress ?? null;
  const solAddress = walletAddresses?.solanaAddress ?? null;

  const [walletPanelOpen, setWalletPanelOpen] = useState(false);
  const [walletActionMode, setWalletActionMode] = useState<"send" | "swap" | "receive">("receive");
  const [sendTo, setSendTo] = useState("");
  const [sendAmount, setSendAmount] = useState("");
  const [sendAsset, setSendAsset] = useState("BNB");
  const [swapSide, setSwapSide] = useState<"buy" | "sell">("buy");
  const [swapTokenAddress, setSwapTokenAddress] = useState("");
  const [swapAmount, setSwapAmount] = useState("0.01");
  const [swapSlippage, setSwapSlippage] = useState("1.0");
  const [swapQuote, setSwapQuote] = useState<BscTradeQuoteResponse | null>(null);
  const [swapBusy, setSwapBusy] = useState(false);
  const [swapExecuteBusy, setSwapExecuteBusy] = useState(false);
  const [swapLastTxHash, setSwapLastTxHash] = useState<string | null>(null);
  const [swapUserSignTx, setSwapUserSignTx] = useState<string | null>(null);
  const [swapUserSignApprovalTx, setSwapUserSignApprovalTx] = useState<string | null>(null);
  const [characterRosterOpen, setCharacterRosterOpen] = useState(false);
  const [vrmLoaded, setVrmLoaded] = useState(false);
  const [showVrmFallback, setShowVrmFallback] = useState(false);
  const vrmEngineRef = useRef<VrmEngine | null>(null);
  const currentAmbientIntentIdRef = useRef<string | null>(null);
  const idleCycleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const actionAnimatingRef = useRef(false);
  const scheduleNextAccentRef = useRef<() => void>(() => { });

  const walletPanelRef = useRef<HTMLDivElement | null>(null);

  const walletPreviewRows = useMemo(() => {
    const rows: Array<{ symbol: string; chain: string; valueUsd: number; balance: string }> = [];
    for (const chain of walletBalances?.evm?.chains ?? []) {
      const nativeValue = Number.parseFloat(chain.nativeValueUsd) || 0;
      rows.push({
        symbol: chain.nativeSymbol || "NATIVE",
        chain: chain.chain,
        valueUsd: nativeValue,
        balance: chain.nativeBalance,
      });
      for (const token of chain.tokens ?? []) {
        rows.push({
          symbol: token.symbol || "TOKEN",
          chain: chain.chain,
          valueUsd: Number.parseFloat(token.valueUsd) || 0,
          balance: token.balance,
        });
      }
    }

    if (walletBalances?.solana) {
      rows.push({
        symbol: "SOL",
        chain: "Solana",
        valueUsd: Number.parseFloat(walletBalances.solana.solValueUsd) || 0,
        balance: walletBalances.solana.solBalance,
      });
      for (const token of walletBalances.solana.tokens ?? []) {
        rows.push({
          symbol: token.symbol || "TOKEN",
          chain: "Solana",
          valueUsd: Number.parseFloat(token.valueUsd) || 0,
          balance: token.balance,
        });
      }
    }

    return rows
      .filter((row) => Number.isFinite(row.valueUsd) && row.valueUsd > 0)
      .sort((a, b) => b.valueUsd - a.valueUsd)
      .slice(0, 4);
  }, [walletBalances]);

  const walletTotalUsd = useMemo(() => {
    return walletPreviewRows.reduce((sum, row) => sum + row.valueUsd, 0);
  }, [walletPreviewRows]);

  const bscChain = useMemo(() => {
    return (walletBalances?.evm?.chains ?? []).find((chain) => isBscChainName(chain.chain)) ?? null;
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
  const normalizedSwapTokenAddress = swapTokenAddress.trim().toLowerCase();

  const selectedBscToken = useMemo(() => {
    if (!HEX_ADDRESS_RE.test(swapTokenAddress.trim())) return null;
    return (
      (bscChain?.tokens ?? []).find(
        (token) => token.contractAddress.trim().toLowerCase() === normalizedSwapTokenAddress,
      ) ?? null
    );
  }, [bscChain, normalizedSwapTokenAddress, swapTokenAddress]);

  const selectedBscTokenBalanceNum = Number.parseFloat(selectedBscToken?.balance ?? "");
  const swapInputSymbol = swapSide === "buy" ? (bscChain?.nativeSymbol ?? "BNB") : (selectedBscToken?.symbol || "TOKEN");
  const swapAvailableAmountNum = swapSide === "buy"
    ? (Number.isFinite(bscNativeBalanceNum)
      ? Math.max(0, bscNativeBalanceNum - BSC_SWAP_GAS_RESERVE)
      : Number.NaN)
    : selectedBscTokenBalanceNum;
  const swapCanUsePresets = Number.isFinite(swapAvailableAmountNum) && swapAvailableAmountNum > 0;
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
      const raw = preset.ratio >= 1 ? swapAvailableAmountNum : swapAvailableAmountNum * preset.ratio;
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
      const next = ratio >= 1 ? swapAvailableAmountNum : swapAvailableAmountNum * ratio;
      setSwapAmount(formatSwapAmount(next));
    },
    [formatSwapAmount, swapAvailableAmountNum, swapCanUsePresets],
  );

  const swapFlowStep = useMemo(() => {
    if (swapLastTxHash) return 4;
    if (swapExecuteBusy || swapUserSignTx || swapUserSignApprovalTx) return 3;
    if (swapQuote || swapBusy) return 2;
    return 1;
  }, [swapBusy, swapExecuteBusy, swapLastTxHash, swapQuote, swapUserSignApprovalTx, swapUserSignTx]);

  const swapRouteLabel = useMemo(() => {
    if (!swapQuote || swapQuote.route.length === 0) return null;
    return swapQuote.route.map(formatRouteAddress).join(" -> ");
  }, [swapQuote]);

  const swapNeedsUserSign = Boolean(swapUserSignTx || swapUserSignApprovalTx);

  const handleOpenWalletView = useCallback(() => {
    setWalletPanelOpen(false);
    setTab("wallets");
  }, [setTab]);

  const handleSwapQuote = useCallback(async () => {
    const token = swapTokenAddress.trim();
    if (!HEX_ADDRESS_RE.test(token)) {
      setActionNotice("Enter a valid token contract address (0x...).", "error", 2600);
      return;
    }
    const amount = swapAmount.trim();
    const amountNum = Number.parseFloat(amount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      setActionNotice("Enter a valid amount.", "error", 2400);
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
        setActionNotice(preflight.reasons[0] ?? "Trade preflight failed.", "error", 3200);
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
      setActionNotice(err instanceof Error ? err.message : "Failed to fetch quote.", "error", 3600);
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
  ]);

  const handleSwapExecute = useCallback(async () => {
    if (!swapQuote) {
      setActionNotice("Create a quote first.", "info", 2200);
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
        setSwapLastTxHash(result.execution.hash);
        setSwapUserSignTx(null);
        setSwapUserSignApprovalTx(null);
        setActionNotice(`Trade sent: ${result.execution.hash.slice(0, 10)}...`, "success", 3600);
        void loadBalances();
        return;
      }

      if (result.requiresUserSignature) {
        setSwapLastTxHash(null);
        setSwapUserSignTx(result.unsignedTx ? JSON.stringify(result.unsignedTx, null, 2) : null);
        setSwapUserSignApprovalTx(
          result.unsignedApprovalTx ? JSON.stringify(result.unsignedApprovalTx, null, 2) : null,
        );
        setActionNotice("User-sign payload ready. Copy and sign in your wallet.", "info", 4200);
        return;
      }

      setSwapLastTxHash(null);
      setSwapUserSignTx(null);
      setSwapUserSignApprovalTx(null);
      setActionNotice("Trade execution did not complete.", "error", 3200);
    } catch (err) {
      setSwapLastTxHash(null);
      setSwapUserSignTx(null);
      setSwapUserSignApprovalTx(null);
      setActionNotice(err instanceof Error ? err.message : "Trade execution failed.", "error", 4200);
    } finally {
      setSwapExecuteBusy(false);
    }
  }, [executeBscTrade, loadBalances, setActionNotice, swapQuote]);

  const handleCopyUserSignPayload = useCallback(
    async (payload: string, label: string) => {
      await copyToClipboard(payload);
      setActionNotice(`${label} payload copied.`, "success", 2400);
    },
    [copyToClipboard, setActionNotice],
  );

  const handleSendIntent = useCallback(async () => {
    if (!sendReady || !evmAddress) {
      setActionNotice("Enter a valid destination and amount first.", "error", 2600);
      return;
    }

    const intent = {
      chain: "BSC",
      asset: sendAsset,
      from: evmAddress,
      to: sendTo.trim(),
      amount: sendAmount.trim(),
      createdAt: new Date().toISOString(),
    };

    await copyToClipboard(JSON.stringify(intent, null, 2));
    setActionNotice("Send intent copied. You can execute it from Wallet view.", "success", 3200);
  }, [copyToClipboard, evmAddress, sendAmount, sendAsset, sendReady, sendTo, setActionNotice]);

  useEffect(() => {
    setSwapQuote(null);
    setSwapLastTxHash(null);
    setSwapUserSignTx(null);
    setSwapUserSignApprovalTx(null);
  }, [swapAmount, swapSide, swapSlippageBps, swapTokenAddress]);

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

  const safeSelectedVrmIndex = selectedVrmIndex > 0 ? selectedVrmIndex : 1;
  const avatarMoodTier = "neutral";
  const vrmPath = selectedVrmIndex === 0 && customVrmUrl
    ? customVrmUrl
    : getVrmUrl(safeSelectedVrmIndex);
  const fallbackPreviewUrl = selectedVrmIndex > 0
    ? getVrmPreviewUrl(safeSelectedVrmIndex)
    : getVrmPreviewUrl(1);
  const ambientIntent = useMemo(
    () => resolveCompanionAnimationIntent({ moodTier: avatarMoodTier }),
    [avatarMoodTier],
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

    const engine = vrmEngineRef.current;
    if (!engine) return;

    const moodTier = avatarMoodTier;
    const pool = MOOD_ANIMATION_POOLS[moodTier];
    if (!pool || pool.accents.length === 0) return;

    const delayMs = (10 + Math.random() * 8) * 1000;

    idleCycleTimerRef.current = setTimeout(() => {
      if (actionAnimatingRef.current) return;
      const anim = pickRandomAnimationDef(pool.accents);
      if (anim) {
        void engine.playEmote(anim.url, anim.durationSec, false);
        idleCycleTimerRef.current = setTimeout(() => {
          scheduleNextAccentRef.current();
        }, (anim.durationSec + 0.5) * 1000);
      } else {
        scheduleNextAccentRef.current();
      }
    }, delayMs);
  }, [avatarMoodTier]);

  scheduleNextAccentRef.current = scheduleNextAccent;

  const handleVrmEngineReady = useCallback((engine: VrmEngine) => {
    vrmEngineRef.current = engine;
    currentAmbientIntentIdRef.current = null;
    applyAmbientIntent();
  }, [applyAmbientIntent]);

  const handleVrmEngineState = useCallback((state: VrmEngineState) => {
    if (!state.vrmLoaded) return;
    setVrmLoaded(true);
    setShowVrmFallback(false);
    applyAmbientIntent();
  }, [applyAmbientIntent]);

  useEffect(() => {
    setVrmLoaded(false);
    setShowVrmFallback(false);
    currentAmbientIntentIdRef.current = null;
    if (idleCycleTimerRef.current) {
      clearTimeout(idleCycleTimerRef.current);
      idleCycleTimerRef.current = null;
    }
    applyAmbientIntent();
    const timer = window.setTimeout(() => {
      setShowVrmFallback(true);
    }, 4000);
    return () => window.clearTimeout(timer);
  }, [vrmPath, applyAmbientIntent]);

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

  return (
    <div className="anime-comp-screen font-display">
      <div className="anime-comp-bg-graphic"></div>

      {/* Model Layer */}
      <div className="anime-comp-model-layer">
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
              className="anime-btn-ghost"
              onClick={() => setTab("chat")}
              title={t("nav.chat")}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
            </button>

            <div className="anime-status-pill">
              <div className="anime-logo-circle">M</div>
              <span className="text-sm font-black mr-2 text-[var(--ac-text-primary)]">{name}</span>
            </div>

            {/* Hub Header Elements */}
            <div className="anime-header-extensions">

              {/* Agent Status */}
              <div className="anime-header-pill">
                <span className={`anime-header-pill-text ${stateColor}`} data-testid="status-pill">
                  {agentState}
                </span>
                {(agentState as string) === "restarting" || (agentState as string) === "starting" || (agentState as string) === "not_started" || (agentState as string) === "stopped" ? (
                  <span className="anime-header-pill-icon opacity-60">
                    <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
                  </span>
                ) : (
                  <>
                    <button
                      onClick={() => { void handlePauseResume(); }}
                      title={agentState === "paused" ? t("header.resumeAutonomy") : t("header.pauseAutonomy")}
                      className={`anime-header-action-btn ${pauseResumeDisabled ? "is-disabled" : ""}`}
                      disabled={pauseResumeDisabled}
                    >
                      {pauseResumeBusy ? (
                        <svg className="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
                      ) : agentState === "paused" ? (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                      ) : (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
                      )}
                    </button>
                    <button
                      onClick={() => { void handleRestart(); }}
                      title={t("header.restartAgent")}
                      className={`anime-header-action-btn ${lifecycleBusy || (agentState as string) === "restarting" ? "is-disabled" : ""}`}
                      disabled={lifecycleBusy || (agentState as string) === "restarting"}
                    >
                      {restartBusy || (agentState as string) === "restarting" ? (
                        <svg className="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
                      ) : (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /></svg>
                      )}
                    </button>
                  </>
                )}
              </div>

              {/* Cloud Balance */}
              {(cloudEnabled || cloudConnected) && (
                cloudConnected ? (
                  <a href={cloudTopUpUrl} target="_blank" rel="noopener noreferrer"
                    className={`anime-header-pill is-clickable no-underline hover:no-underline ${cloudCredits === null ? "text-white/60" : creditColor}`}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8" /><path d="M12 18V6" /></svg>
                    <span className="anime-header-pill-text">
                      {cloudCredits === null ? t("header.cloudConnected") : `$${cloudCredits.toFixed(2)}`}
                    </span>
                  </a>
                ) : (
                  <span className="anime-header-pill is-danger">
                    <span className="anime-header-pill-text">{t("header.cloudDisconnected")}</span>
                  </span>
                )
              )}

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
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" /><path d="M3 5v14a2 2 0 0 0 2 2h16v-5" /><path d="M18 12a2 2 0 0 0 0 4h4v-4Z" /></svg>
                    <div className="anime-header-wallet-text">
                      {evmShort && <span>{evmShort}</span>}
                      {solShort && !evmShort && <span>{solShort}</span>}
                    </div>
                    <svg className={`anime-header-wallet-caret ${walletPanelOpen ? "is-open" : ""}`} width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9" /></svg>
                  </button>

                  <div className={`anime-wallet-popover ${walletPanelOpen ? "is-open" : ""}`} role="dialog" aria-label="Wallet panel">
                    <div className="anime-wallet-popover-head">
                      <div>
                        <div className="anime-wallet-popover-title">Wallet</div>
                        <div className="anime-wallet-popover-sub">{evmShort ?? solShort ?? "Not connected"}</div>
                      </div>
                        <div className="anime-wallet-popover-head-actions">
                          <button
                            type="button"
                            className="anime-wallet-popover-ghost"
                            onClick={() => {
                              void loadBalances();
                            }}
                            disabled={walletLoading}
                          >
                            {walletLoading ? "..." : "Refresh"}
                          </button>
                        </div>
                      </div>

                    <div className="anime-wallet-popover-total">
                      <div className="anime-wallet-popover-total-value">
                        {walletTotalUsd > 0
                          ? `$${walletTotalUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                          : "$0.00"}
                      </div>
                      <div className="anime-wallet-popover-total-label">Estimated portfolio value</div>
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
                          {mode}
                        </button>
                      ))}
                    </div>

                    <div className="anime-wallet-readiness-row">
                      <span className={`anime-wallet-ready-chip ${walletReady ? "is-ready" : "is-off"}`}>Wallet</span>
                      <span className={`anime-wallet-ready-chip ${rpcReady ? "is-ready" : "is-off"}`}>Feed</span>
                      <span className={`anime-wallet-ready-chip ${gasReady ? "is-ready" : "is-off"}`}>Gas</span>
                    </div>

                    {walletActionMode === "receive" && (
                      <>
                        <div className="anime-wallet-address-list">
                          {evmAddress && (
                            <div className="anime-wallet-address-row">
                              <span className="anime-wallet-address-chain">BSC</span>
                              <code className="anime-wallet-address-code" title={evmAddress}>
                                {evmShort}
                              </code>
                              <button
                                type="button"
                                className="anime-wallet-address-copy"
                                onClick={() => {
                                  void copyToClipboard(evmAddress);
                                  setActionNotice("Address copied.", "success", 2200);
                                }}
                              >
                                Copy
                              </button>
                            </div>
                          )}
                          {solAddress && (
                            <div className="anime-wallet-address-row">
                              <span className="anime-wallet-address-chain">SOL</span>
                              <code className="anime-wallet-address-code" title={solAddress}>
                                {solShort}
                              </code>
                              <button
                                type="button"
                                className="anime-wallet-address-copy"
                                onClick={() => {
                                  void copyToClipboard(solAddress);
                                  setActionNotice("Address copied.", "success", 2200);
                                }}
                              >
                                Copy
                              </button>
                            </div>
                          )}
                        </div>

                        <div className="anime-wallet-asset-list">
                          {walletPreviewRows.length > 0 ? (
                            walletPreviewRows.map((row) => (
                              <div key={`${row.chain}-${row.symbol}-${row.balance}`} className="anime-wallet-asset-row">
                                <span className="anime-wallet-asset-symbol">{row.symbol}</span>
                                <span className="anime-wallet-asset-chain">{row.chain}</span>
                                <span className="anime-wallet-asset-value">
                                  ${row.valueUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                              </div>
                            ))
                          ) : (
                            <div className="anime-wallet-asset-empty">
                              {walletLoading ? "Loading assets..." : "No asset data yet"}
                            </div>
                          )}
                        </div>
                      </>
                    )}

                    {walletActionMode === "swap" && (
                      <div className="anime-wallet-action-body">
                        <div className="anime-wallet-flow" aria-label="Swap flow">
                          {[
                            { label: "Input", step: 1 },
                            { label: "Quote", step: 2 },
                            { label: swapNeedsUserSign ? "Sign" : "Execute", step: 3 },
                            { label: "Done", step: 4 },
                          ].map((item) => (
                            <span
                              key={item.label}
                              className={`anime-wallet-flow-step ${swapFlowStep >= item.step ? "is-active" : ""}`}
                            >
                              {item.label}
                            </span>
                          ))}
                        </div>

                        <div className="anime-wallet-status-hint">
                          {swapFlowStep === 1 && "Paste token contract, choose side and amount."}
                          {swapFlowStep === 2 && (swapBusy
                            ? "Fetching route and output quote..."
                            : "Quote ready. Review route and minimum receive before execution.")}
                          {swapFlowStep === 3 && (swapExecuteBusy
                            ? "Sending trade to BSC..."
                            : swapNeedsUserSign
                              ? "Manual signing required. Copy payloads and sign in wallet."
                              : "Trade ready. Press execute to broadcast transaction.")}
                          {swapFlowStep === 4 && "Transaction submitted. Track status with the tx hash."}
                        </div>

                        <div className="anime-wallet-side-toggle">
                          <button
                            type="button"
                            className={`anime-wallet-side-btn ${swapSide === "buy" ? "is-active" : ""}`}
                            onClick={() => setSwapSide("buy")}
                          >
                            Buy
                          </button>
                          <button
                            type="button"
                            className={`anime-wallet-side-btn ${swapSide === "sell" ? "is-active" : ""}`}
                            onClick={() => setSwapSide("sell")}
                          >
                            Sell
                          </button>
                        </div>

                        <label className="anime-wallet-field">
                          <span>Token (BSC Contract)</span>
                          <input
                            type="text"
                            value={swapTokenAddress}
                            onChange={(event) => setSwapTokenAddress(event.target.value)}
                            placeholder="0x..."
                          />
                        </label>
                        <div className="anime-wallet-field-grid">
                          <label className="anime-wallet-field">
                            <span>{swapSide === "buy" ? `Spend (${swapInputSymbol})` : `Sell (${swapInputSymbol})`}</span>
                            <input
                              type="text"
                              value={swapAmount}
                              onChange={(event) => setSwapAmount(event.target.value)}
                              placeholder="0.01"
                            />
                          </label>
                          <label className="anime-wallet-field">
                            <span>Slippage %</span>
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
                            Available: {swapCanUsePresets ? `${formatSwapAmount(swapAvailableAmountNum)} ${swapInputSymbol}` : "--"}
                          </span>
                          {swapSide === "buy" && (
                            <span>Gas reserve: {BSC_SWAP_GAS_RESERVE} BNB</span>
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

                        <div className="anime-wallet-popover-actions is-swap">
                          <button
                            type="button"
                            className="anime-wallet-popover-action"
                            disabled={!swapTokenValid || !swapAmountValid || swapBusy || swapExecuteBusy}
                            onClick={() => {
                              void handleSwapQuote();
                            }}
                          >
                            {swapBusy ? "Quoting..." : "Get Quote"}
                          </button>
                          <button
                            type="button"
                            className="anime-wallet-popover-action is-primary"
                            disabled={swapBusy || swapExecuteBusy || !swapQuote}
                            onClick={() => {
                              void handleSwapExecute();
                            }}
                          >
                            {swapExecuteBusy ? "Executing..." : swapNeedsUserSign ? "Refresh Payload" : "Execute"}
                          </button>
                          <button
                            type="button"
                            className="anime-wallet-popover-action"
                            onClick={handleOpenWalletView}
                          >
                            Wallet View
                          </button>
                        </div>

                        {swapQuote && (
                          <div className="anime-wallet-quote-card">
                            <div className="anime-wallet-quote-line">
                              <span>Input</span>
                              <strong>{swapQuote.quoteIn.amount} {swapQuote.quoteIn.symbol}</strong>
                            </div>
                            <div className="anime-wallet-quote-line">
                              <span>Expected</span>
                              <strong>{swapQuote.quoteOut.amount} {swapQuote.quoteOut.symbol}</strong>
                            </div>
                            <div className="anime-wallet-quote-line">
                              <span>Min Receive</span>
                              <strong>{swapQuote.minReceive.amount} {swapQuote.minReceive.symbol}</strong>
                            </div>
                            <div className="anime-wallet-quote-line">
                              <span>Route</span>
                              <strong>{swapQuote.route.length} hops</strong>
                            </div>
                            {swapRouteLabel && (
                              <div className="anime-wallet-quote-route" title={swapQuote.route.join(" -> ")}>
                                {swapRouteLabel}
                              </div>
                            )}
                          </div>
                        )}

                        {swapLastTxHash && (
                          <div className="anime-wallet-tx-row">
                            <span>Tx Submitted:</span>
                            <code>{swapLastTxHash.slice(0, 10)}...{swapLastTxHash.slice(-6)}</code>
                            <a
                              href={`https://bscscan.com/tx/${swapLastTxHash}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="anime-wallet-tx-link"
                            >
                              View
                            </a>
                          </div>
                        )}

                        {(swapUserSignTx || swapUserSignApprovalTx) && (
                          <div className="anime-wallet-usersign">
                            <div className="anime-wallet-usersign-title">User-sign payloads</div>
                            <div className="anime-wallet-usersign-steps">
                              {swapUserSignApprovalTx && (
                                <div className="anime-wallet-usersign-step">
                                  1. Sign approval transaction for token allowance.
                                </div>
                              )}
                              <div className="anime-wallet-usersign-step">
                                {swapUserSignApprovalTx
                                  ? "2. Sign swap transaction after approval confirms."
                                  : "1. Sign the swap transaction in wallet extension."}
                              </div>
                            </div>
                            <div className="anime-wallet-usersign-actions">
                              {swapUserSignApprovalTx && (
                                <button
                                  type="button"
                                  className="anime-wallet-address-copy"
                                  onClick={() => {
                                    void handleCopyUserSignPayload(swapUserSignApprovalTx, "Approval");
                                  }}
                                >
                                  Copy Approval
                                </button>
                              )}
                              {swapUserSignTx && (
                                <button
                                  type="button"
                                  className="anime-wallet-address-copy"
                                  onClick={() => {
                                    void handleCopyUserSignPayload(swapUserSignTx, "Swap");
                                  }}
                                >
                                  Copy Swap
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
                          <span>To Address (BSC)</span>
                          <input
                            type="text"
                            value={sendTo}
                            onChange={(event) => setSendTo(event.target.value)}
                            placeholder="0x..."
                          />
                        </label>
                        <div className="anime-wallet-field-grid">
                          <label className="anime-wallet-field">
                            <span>Amount</span>
                            <input
                              type="text"
                              value={sendAmount}
                              onChange={(event) => setSendAmount(event.target.value)}
                              placeholder="0.01"
                            />
                          </label>
                          <label className="anime-wallet-field">
                            <span>Asset</span>
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
                        <div className="anime-wallet-send-hint">
                          BSC transfer intent. Copy payload, open Wallet view, then execute/sign.
                        </div>
                        <div className="anime-wallet-popover-actions">
                          <button
                            type="button"
                            className="anime-wallet-popover-action"
                            disabled={!sendReady}
                            onClick={() => {
                              void handleSendIntent();
                            }}
                          >
                            Copy Intent
                          </button>
                          <button
                            type="button"
                            className="anime-wallet-popover-action is-primary"
                            onClick={handleOpenWalletView}
                          >
                            Wallet View
                          </button>
                        </div>
                      </div>
                    )}

                    {bscChainError && (
                      <div className="anime-wallet-popover-error">
                        BSC feed: {bscChainError}
                      </div>
                    )}
                  </div>
                </div>
              )}

            </div>
          </div>

          <div className="anime-comp-header-right">
            <div className={`anime-character-header-control ${characterRosterOpen ? "is-open" : ""}`}>
              <button
                type="button"
                className="anime-character-header-toggle"
                onClick={() => setCharacterRosterOpen((prev) => !prev)}
                aria-expanded={characterRosterOpen}
                aria-controls="anime-character-roster"
                data-testid="character-roster-toggle"
              >
                <span className="anime-character-header-label">{t("nav.character")}</span>
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
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>

              <button
                type="button"
                onClick={() => setTab("character")}
                className="anime-roster-config-btn"
                title="Character settings"
                data-testid="character-roster-settings"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              </button>
            </div>
          </div>

        </header>

        {/* Main Content Area */}
        <div className="anime-comp-main-grid">
          {/* Center (Empty to show character) */}
          <div className="anime-comp-center"></div>

          {/* Right Panel: Actions + Character Drawer */}
          <aside className="anime-comp-right-panel">
            <div
              id="anime-character-roster"
              className={`anime-character-panel-shell ${characterRosterOpen ? "is-open" : ""}`}
            >
              <div className="anime-roster anime-comp-character-panel glass-panel">
                {selectedVrmIndex === 0 && <div className="text-xs text-accent mt-1 mb-2">{t("companion.customVrmActive")}</div>}
                <div className="anime-roster-list">
                  {rosterItems.map((item) => {
                    const active = selectedVrmIndex !== 0 && item.index === safeSelectedVrmIndex;
                    return (
                      <button
                        key={item.index}
                        className={`anime-roster-item ${active ? "is-active" : ""}`}
                        onClick={() => setState("selectedVrmIndex", item.index)}
                      >
                        <img src={item.previewUrl} alt={item.title} className="anime-roster-img" />
                        <div className="anime-roster-meta">
                          <span className="anime-roster-name">{item.title}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Game HUD Icon Menu */}
            <nav className="anime-hub-menu">
              {/* Talents */}
              <button className="anime-hub-btn" onClick={() => setTab("skills")}
                style={{ '--ac-accent': '#00e1ff', '--ac-accent-rgb': '0, 225, 255' } as React.CSSProperties}>
                <div className="anime-hub-btn-icon">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                  </svg>
                </div>
                <span className="anime-hub-btn-label">Talents</span>
              </button>

              {/* Knowledge */}
              <button className="anime-hub-btn" onClick={() => setTab("knowledge")}
                style={{ '--ac-accent': '#a78bfa', '--ac-accent-rgb': '167, 139, 250' } as React.CSSProperties}>
                <div className="anime-hub-btn-icon">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
                  </svg>
                </div>
                <span className="anime-hub-btn-label">Knowledge</span>
              </button>

              {/* Channels */}
              <button className="anime-hub-btn" onClick={() => setTab("connectors")}
                style={{ '--ac-accent': '#f43f5e', '--ac-accent-rgb': '244, 63, 94' } as React.CSSProperties}>
                <div className="anime-hub-btn-icon">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                  </svg>
                </div>
                <span className="anime-hub-btn-label">Channels</span>
              </button>

              {/* Plugins */}
              <button className="anime-hub-btn" onClick={() => setTab("plugins")}
                style={{ '--ac-accent': '#f0b232', '--ac-accent-rgb': '240, 178, 50' } as React.CSSProperties}>
                <div className="anime-hub-btn-icon">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    <circle cx="12" cy="11" r="3" />
                    <path d="M12 8v1M12 13v1M9.5 9.5l.7.7M13.8 13.8l.7.7M9 11H8M16 11h-1M9.5 12.5l.7-.7M13.8 8.2l.7-.7" />
                  </svg>
                </div>
                <span className="anime-hub-btn-label">Plugins</span>
              </button>

              {/* Apps */}
              <button className="anime-hub-btn" onClick={() => setTab("apps")}
                style={{ '--ac-accent': '#10b981', '--ac-accent-rgb': '16, 185, 129' } as React.CSSProperties}>
                <div className="anime-hub-btn-icon">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="7" height="7" rx="1" />
                    <rect x="14" y="3" width="7" height="7" rx="1" />
                    <rect x="3" y="14" width="7" height="7" rx="1" />
                    <rect x="14" y="14" width="7" height="7" rx="1" />
                  </svg>
                </div>
                <span className="anime-hub-btn-label">Apps</span>
              </button>

              {/* Settings */}
              <button className="anime-hub-btn" onClick={() => setTab("settings")}
                style={{ '--ac-accent': '#e2e8f0', '--ac-accent-rgb': '226, 232, 240' } as React.CSSProperties}>
                <div className="anime-hub-btn-icon">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                </div>
                <span className="anime-hub-btn-label">{t("nav.settings")}</span>
              </button>

              {/* Advanced */}
              <button className="anime-hub-btn" onClick={() => setTab("advanced")}
                style={{ '--ac-accent': '#38bdf8', '--ac-accent-rgb': '56, 189, 248' } as React.CSSProperties}>
                <div className="anime-hub-btn-icon">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="16 18 22 12 16 6" />
                    <polyline points="8 6 2 12 8 18" />
                  </svg>
                </div>
                <span className="anime-hub-btn-label">{t("nav.advanced")}</span>
              </button>
            </nav>
          </aside>
        </div>
      </div>
    </div>
  );
}
