import type { BscTradeQuoteResponse } from "../../api-client";
import { BSC_SWAP_GAS_RESERVE, type TranslatorFn } from "./walletUtils";

type SwapPresetButton = {
  label: string;
  ratio: number;
  value: string;
  active: boolean;
};

type WalletSwapPanelProps = {
  swapSide: "buy" | "sell";
  setSwapSide: (side: "buy" | "sell") => void;
  swapTokenAddress: string;
  setSwapTokenAddress: (value: string) => void;
  swapAmount: string;
  setSwapAmount: (value: string) => void;
  swapSlippage: string;
  setSwapSlippage: (value: string) => void;
  swapQuote: BscTradeQuoteResponse | null;
  swapBusy: boolean;
  swapExecuteBusy: boolean;
  swapLastTxHash: string | null;
  swapUserSignTx: string | null;
  swapUserSignApprovalTx: string | null;
  swapInputSymbol: string;
  swapCanUsePresets: boolean;
  swapTokenValid: boolean;
  swapAmountValid: boolean;
  swapPresetButtons: SwapPresetButton[];
  swapFlowStep: number;
  swapRouteLabel: string | null;
  swapNeedsUserSign: boolean;
  swapAvailableAmountNum: number;
  formatSwapAmount: (value: number) => string;
  handleSwapQuote: () => Promise<void>;
  handleSwapExecute: () => Promise<void>;
  handleSwapPreset: (ratio: number) => void;
  handleCopyUserSignPayload: (payload: string) => Promise<void>;
  t: TranslatorFn;
};

export function WalletSwapPanel({
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
  handleCopyUserSignPayload,
  t,
}: WalletSwapPanelProps) {
  return (
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
              <span className="anime-wallet-flow-marker" aria-hidden="true" />
              <span className="anime-wallet-flow-label">{item.label}</span>
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
          onChange={(event) => setSwapTokenAddress(event.target.value)}
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
            onChange={(event) => setSwapAmount(event.target.value)}
            placeholder="0.01"
          />
        </label>
        <label className="anime-wallet-field">
          <span>{t("wallet.slippagePercent")}</span>
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
            disabled={!swapCanUsePresets || swapBusy || swapExecuteBusy}
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
            !swapTokenValid || !swapAmountValid || swapBusy || swapExecuteBusy
          }
          onClick={() => {
            void handleSwapQuote();
          }}
        >
          {swapBusy ? t("wallet.quoting") : t("wallet.getQuote")}
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
              {swapQuote.quoteIn.amount} {swapQuote.quoteIn.symbol}
            </strong>
          </div>
          <div className="anime-wallet-quote-line">
            <span>{t("wallet.quote.expected")}</span>
            <strong>
              {swapQuote.quoteOut.amount} {swapQuote.quoteOut.symbol}
            </strong>
          </div>
          <div className="anime-wallet-quote-line">
            <span>{t("wallet.quote.minReceive")}</span>
            <strong>
              {swapQuote.minReceive.amount} {swapQuote.minReceive.symbol}
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
                  void handleCopyUserSignPayload(swapUserSignApprovalTx);
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
                  void handleCopyUserSignPayload(swapUserSignTx);
                }}
              >
                {t("wallet.usersign.copySwapTx")}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
