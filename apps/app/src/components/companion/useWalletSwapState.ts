import { useCallback, useMemo, useState } from "react";
import type {
  BscTradeExecuteRequest,
  BscTradeExecuteResponse,
  BscTradePreflightResponse,
  BscTradeQuoteRequest,
  BscTradeQuoteResponse,
  BscTradeTxStatusResponse,
  EvmChainBalance,
} from "../../api-client";
import {
  BSC_SWAP_GAS_RESERVE,
  formatRouteAddress,
  HEX_ADDRESS_RE,
  mapWalletTradeError,
  type TranslatorFn,
  type WalletRecentTrade,
} from "./walletUtils";

export type UseWalletSwapStateArgs = {
  bscChain: EvmChainBalance | null;
  bscNativeBalanceNum: number;
  addRecentTrade: (trade: WalletRecentTrade) => void;
  refreshRecentTradeStatus: (hash: string, silent?: boolean) => void;
  recentTxRefreshAtRef: React.MutableRefObject<Record<string, number>>;
  loadBalances: () => Promise<void>;
  getBscTradePreflight: (
    tokenAddress?: string,
  ) => Promise<BscTradePreflightResponse>;
  getBscTradeQuote: (
    request: BscTradeQuoteRequest,
  ) => Promise<BscTradeQuoteResponse>;
  executeBscTrade: (
    request: BscTradeExecuteRequest,
  ) => Promise<BscTradeExecuteResponse>;
  setActionNotice: (
    text: string,
    tone?: "info" | "success" | "error",
    ttlMs?: number,
  ) => void;
  t: TranslatorFn;
};

export function useWalletSwapState(args: UseWalletSwapStateArgs) {
  const {
    bscChain,
    bscNativeBalanceNum,
    addRecentTrade,
    refreshRecentTradeStatus,
    recentTxRefreshAtRef,
    loadBalances,
    getBscTradePreflight,
    getBscTradeQuote,
    executeBscTrade,
    setActionNotice,
    t,
  } = args;

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

  const swapSlippageBps = useMemo(() => {
    const parsed = Number.parseFloat(swapSlippage);
    if (!Number.isFinite(parsed) || parsed <= 0) return 100;
    return Math.min(5000, Math.round(parsed * 100));
  }, [swapSlippage]);

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

  // ---- Swap action callbacks ----

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
          t("wallet.tradeSentWithHash", {
            hash: `${txHash.slice(0, 10)}...`,
          }),
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
    recentTxRefreshAtRef,
    setActionNotice,
    swapQuote,
    t,
  ]);

  /** Reset swap flow state -- called on mount and mode changes. */
  const resetSwapFlow = useCallback(() => {
    setSwapQuote(null);
    setSwapLastTxHash(null);
    setSwapUserSignTx(null);
    setSwapUserSignApprovalTx(null);
  }, []);

  return {
    swapSide,
    setSwapSide,
    swapTokenAddress,
    setSwapTokenAddress,
    swapAmount,
    setSwapAmount,
    swapSlippage,
    setSwapSlippage,
    swapQuote,
    swapBusy,
    swapExecuteBusy,
    swapLastTxHash,
    swapUserSignTx,
    swapUserSignApprovalTx,
    swapInputSymbol,
    swapCanUsePresets,
    swapTokenValid,
    swapAmountValid,
    swapPresetButtons,
    swapFlowStep,
    swapRouteLabel,
    swapNeedsUserSign,
    swapAvailableAmountNum,
    formatSwapAmount,
    handleSwapQuote,
    handleSwapExecute,
    handleSwapPreset,
    resetSwapFlow,
  };
}
