/**
 * BSC quick-trade panel — token address input, amount presets, buy/sell,
 * quote display, execution confirmation, and tx status tracking.
 *
 * Extracted from InventoryView to keep that component focused on
 * portfolio display and chain navigation.
 */

import { useCallback, useState } from "react";
import type {
  BscTradeExecuteRequest,
  BscTradeExecuteResponse,
  BscTradePreflightResponse,
  BscTradeQuoteRequest,
  BscTradeQuoteResponse,
  BscTradeTxStatusResponse,
} from "../api-client";

/* ── Constants ─────────────────────────────────────────────────────── */

const BSC_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const AMOUNT_PRESETS = [0.05, 0.1, 0.2, 0.5];
const DEFAULT_QUICK_AMOUNT = "0.1";

/* ── Types ─────────────────────────────────────────────────────────── */

export interface TrackedToken {
  address: string;
  symbol: string;
  addedAt: number;
}

export interface BscTradePanelProps {
  tradeReady: boolean;
  bnbBalance: number;
  trackedTokens: TrackedToken[];
  onAddToken: (token: TrackedToken) => void;
  copyToClipboard: (text: string) => Promise<void>;
  setActionNotice: (text: string, tone?: "info" | "success" | "error", ttlMs?: number) => void;
  getBscTradePreflight?: (
    tokenAddress?: string,
  ) => Promise<BscTradePreflightResponse>;
  getBscTradeQuote?: (
    request: BscTradeQuoteRequest,
  ) => Promise<BscTradeQuoteResponse>;
  executeBscTrade?: (
    request: BscTradeExecuteRequest,
  ) => Promise<BscTradeExecuteResponse>;
  getBscTradeTxStatus?: (hash: string) => Promise<BscTradeTxStatusResponse>;
}

/* ── Balance formatter (shared) ────────────────────────────────────── */

function formatBalance(balance: string): string {
  const num = Number.parseFloat(balance);
  if (Number.isNaN(num)) return balance;
  if (num === 0) return "0";
  if (num < 0.0001) return "<0.0001";
  if (num < 1) return num.toFixed(6);
  if (num < 1000) return num.toFixed(4);
  return num.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

/* ── Component ─────────────────────────────────────────────────────── */

export function BscTradePanel({
  tradeReady,
  bnbBalance,
  trackedTokens: _trackedTokens,
  onAddToken,
  copyToClipboard,
  setActionNotice,
  getBscTradePreflight,
  getBscTradeQuote,
  executeBscTrade,
  getBscTradeTxStatus,
}: BscTradePanelProps) {
  const [quickTokenAddress, setQuickTokenAddress] = useState("");
  const [quickAmount, setQuickAmount] = useState(DEFAULT_QUICK_AMOUNT);
  const [latestQuote, setLatestQuote] = useState<BscTradeQuoteResponse | null>(
    null,
  );
  const [latestExecution, setLatestExecution] =
    useState<BscTradeExecuteResponse | null>(null);
  const [txStatus, setTxStatus] = useState<BscTradeTxStatusResponse | null>(
    null,
  );
  const [tradeFeedback, setTradeFeedback] = useState<{
    tone: "error" | "info" | "success";
    text: string;
  } | null>(null);
  const [quoteSide, setQuoteSide] = useState<"buy" | "sell">("buy");
  const [pendingTrade, setPendingTrade] = useState<{
    side: string;
    amount: string;
    token: string;
  } | null>(null);

  // ── Trade handlers ──────────────────────────────────────────────────

  const requestQuote = useCallback(
    async (side: "buy" | "sell") => {
      if (!getBscTradeQuote) return;
      const tokenAddress = quickTokenAddress.trim();
      if (!BSC_ADDRESS_RE.test(tokenAddress)) {
        setActionNotice(
          "Enter a valid token contract address first.",
          "error",
          3200,
        );
        setTradeFeedback({
          tone: "error",
          text: "Enter a valid token contract address first.",
        });
        return;
      }
      const amount = quickAmount.trim() || DEFAULT_QUICK_AMOUNT;
      const amountNum = Number.parseFloat(amount);
      if (!Number.isFinite(amountNum) || amountNum <= 0) {
        setActionNotice("Enter a valid BNB amount first.", "error", 3200);
        setTradeFeedback({
          tone: "error",
          text: "Enter a valid BNB amount first.",
        });
        return;
      }

      setQuoteSide(side);
      try {
        if (getBscTradePreflight) {
          const preflight = await getBscTradePreflight(tokenAddress);
          if (!preflight.ok) {
            setLatestQuote(null);
            setLatestExecution(null);
            setTxStatus(null);
            setPendingTrade(null);
            setActionNotice(
              preflight.reasons[0] ?? "Preflight checks failed.",
              "error",
              3600,
            );
            setTradeFeedback({
              tone: "error",
              text: preflight.reasons[0] ?? "Preflight checks failed.",
            });
            return;
          }
        }

        const result = await getBscTradeQuote({
          side,
          tokenAddress,
          amount,
        });
        setLatestQuote(result);
        setLatestExecution(null);
        setTxStatus(null);
        setPendingTrade(null);
        setActionNotice(
          `${side === "buy" ? "Quote ready" : "Sell quote ready"}: ${result.quoteOut?.amount ?? ""} ${result.quoteOut?.symbol ?? ""}`.trim(),
          "success",
          3200,
        );
        setTradeFeedback({
          tone: "success",
          text: `${side === "buy" ? "Quote ready" : "Sell quote ready"}: ${result.quoteOut?.amount ?? ""} ${result.quoteOut?.symbol ?? ""}`.trim(),
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setActionNotice(message, "error", 4600);
        setTradeFeedback({
          tone: "error",
          text: message,
        });
      }
    },
    [
      getBscTradePreflight,
      getBscTradeQuote,
      quickAmount,
      quickTokenAddress,
      setActionNotice,
    ],
  );

  const handlePreflight = useCallback(async () => {
    if (!getBscTradePreflight) return;
    const tokenAddress = quickTokenAddress.trim();
    if (tokenAddress && !BSC_ADDRESS_RE.test(tokenAddress)) {
      setActionNotice(
        "Enter a valid token contract address first.",
        "error",
        3200,
      );
      setTradeFeedback({
        tone: "error",
        text: "Enter a valid token contract address first.",
      });
      return;
    }
    try {
      const result = await getBscTradePreflight(tokenAddress || undefined);
      if (!result.ok) {
        setActionNotice(
          result.reasons[0] ?? "Preflight checks failed.",
          "error",
          3600,
        );
        setTradeFeedback({
          tone: "error",
          text: result.reasons[0] ?? "Preflight checks failed.",
        });
        return;
      }
      const message = tokenAddress
        ? "Preflight checks passed."
        : "Wallet is ready for BSC trading checks.";
      setActionNotice(message, "success", 2600);
      setTradeFeedback({
        tone: "success",
        text: message,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setActionNotice(message, "error", 4600);
      setTradeFeedback({
        tone: "error",
        text: message,
      });
    }
  }, [getBscTradePreflight, quickTokenAddress, setActionNotice]);

  const handleQuickBuy = useCallback(
    async () => requestQuote("buy"),
    [requestQuote],
  );

  const handleQuickSell = useCallback(
    async () => requestQuote("sell"),
    [requestQuote],
  );

  const handleToolbarQuote = useCallback(async () => {
    await requestQuote(quoteSide);
  }, [quoteSide, requestQuote]);

  const handleRequestExecute = useCallback(() => {
    if (!latestQuote) return;
    setPendingTrade({
      side: latestQuote.side,
      amount: quickAmount,
      token: quickTokenAddress,
    });
  }, [latestQuote, quickAmount, quickTokenAddress]);

  const handleConfirmExecute = useCallback(async () => {
    if (!executeBscTrade || !pendingTrade || !latestQuote) return;
    setPendingTrade(null);
    try {
      const result = await executeBscTrade({
        side: latestQuote.side,
        tokenAddress: pendingTrade.token,
        amount: pendingTrade.amount,
      });
      setLatestExecution(result);
      if (result?.executed && result?.execution) {
        // Already executed on-chain
      } else if (result?.requiresUserSignature) {
        setActionNotice(
          "Sign swap transaction in your wallet to complete the trade.",
          "info",
          4600,
        );
      }
    } catch (err) {
      setActionNotice(
        err instanceof Error ? err.message : String(err),
        "error",
        4600,
      );
    }
  }, [executeBscTrade, pendingTrade, latestQuote, setActionNotice]);

  const handleCancelExecute = useCallback(() => {
    setPendingTrade(null);
  }, []);

  const handleRefreshTxStatus = useCallback(async () => {
    if (!getBscTradeTxStatus || !latestExecution) return;
    const hash = latestExecution.execution?.hash;
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
    onAddToken(newToken);
    setActionNotice("Token added to watchlist.", "success", 2600);
  }, [quickTokenAddress, onAddToken, setActionNotice]);

  // ── Render helpers ──────────────────────────────────────────────────

  function renderExecutionResult() {
    if (!latestExecution) return null;

    if (latestExecution.executed && latestExecution.execution) {
      const { hash, status, explorerUrl } = latestExecution.execution;
      const shortHash = hash ? `${hash.slice(0, 10)}` : "";

      return (
        <div className="border border-border p-2 text-xs space-y-1">
          <div>
            <a
              href={explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
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
              Confirmations: {txStatus.confirmations ?? 0}
            </div>
          )}
        </div>
      );
    }

    if (latestExecution.requiresUserSignature) {
      return (
        <div className="border border-border p-2 text-xs space-y-1">
          <div className="text-yellow-500">
            Requires wallet signature to complete.
          </div>
          {latestExecution.unsignedApprovalTx && (
            <button
              type="button"
              data-testid="wallet-copy-approve-tx"
              className="px-2 py-0.5 border border-border bg-bg text-[10px] font-mono cursor-pointer hover:border-accent"
              onClick={() =>
                copyToClipboard(
                  JSON.stringify(latestExecution.unsignedApprovalTx),
                )
              }
            >
              Copy Approval TX
            </button>
          )}
          {latestExecution.unsignedTx && (
            <button
              type="button"
              data-testid="wallet-copy-swap-tx"
              className="px-2 py-0.5 border border-border bg-bg text-[10px] font-mono cursor-pointer hover:border-accent"
              onClick={() =>
                copyToClipboard(JSON.stringify(latestExecution.unsignedTx))
              }
            >
              Copy Swap TX
            </button>
          )}
        </div>
      );
    }

    return null;
  }

  // ── Main render ─────────────────────────────────────────────────────

  return (
    <>
      {/* Status bar */}
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
            onClick={() => {
              void handlePreflight();
            }}
          >
            Preflight
          </button>
        )}
        {getBscTradeQuote && (
          <button
            type="button"
            data-testid="wallet-token-quote"
            className="px-2 py-0.5 border border-border bg-bg text-[10px] font-mono cursor-pointer hover:border-accent"
            onClick={() => {
              void handleToolbarQuote();
            }}
          >
            Quote
          </button>
        )}
      </div>

      {tradeFeedback && (
        <div
          data-testid="wallet-trade-feedback"
          className={`border px-2 py-1.5 text-xs ${
            tradeFeedback.tone === "success"
              ? "border-green-500/40 text-green-400"
              : tradeFeedback.tone === "info"
                ? "border-accent/40 text-accent"
                : "border-red-500/40 text-red-400"
          }`}
        >
          {tradeFeedback.text}
        </div>
      )}

      {/* Quick trade panel */}
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
            onClick={() => {
              void handleQuickBuy();
            }}
          >
            Buy
          </button>
          <button
            type="button"
            data-testid="wallet-quick-sell"
            className="px-3 py-1 border border-red-500 text-red-500 text-xs font-mono cursor-pointer hover:bg-red-500 hover:text-white"
            onClick={() => {
              void handleQuickSell();
            }}
          >
            Sell
          </button>
        </div>

        {/* Latest quote display */}
        {latestQuote && (
          <div className="border border-border p-2 text-xs">
            <div className="font-bold mb-1">Latest quote</div>
            <div className="text-muted">
              {latestQuote.side === "buy" ? "Buy" : "Sell"}{" "}
              {latestQuote.quoteOut?.amount ?? ""}{" "}
              {latestQuote.quoteOut?.symbol ?? ""}
            </div>
            {pendingTrade ? (
              <div className="mt-1 flex items-center gap-2">
                <span className="text-yellow-500 font-bold">
                  Confirm {pendingTrade.side} trade?
                </span>
                <button
                  type="button"
                  data-testid="wallet-quote-confirm"
                  className="px-3 py-1 border border-green-500 text-green-500 text-[10px] font-mono cursor-pointer hover:bg-green-500 hover:text-white"
                  onClick={handleConfirmExecute}
                >
                  Confirm
                </button>
                <button
                  type="button"
                  data-testid="wallet-quote-cancel"
                  className="px-3 py-1 border border-border text-muted text-[10px] font-mono cursor-pointer hover:border-danger hover:text-danger"
                  onClick={handleCancelExecute}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                data-testid="wallet-quote-execute"
                className="mt-1 px-3 py-1 border border-accent bg-accent text-accent-fg text-[10px] font-mono cursor-pointer"
                onClick={handleRequestExecute}
              >
                Execute Trade
              </button>
            )}
          </div>
        )}

        {/* Execution result */}
        {latestExecution && renderExecutionResult()}
      </div>
    </>
  );
}
