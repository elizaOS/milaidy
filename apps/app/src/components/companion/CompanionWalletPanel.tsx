import {
  useWalletPanelState,
  type WalletPanelProps,
} from "./useWalletPanelState";
import { WalletNftGallery } from "./WalletNftGallery";
import { WalletPortfolioList } from "./WalletPortfolioList";
import { WalletSendPanel } from "./WalletSendPanel";
import { WalletSwapPanel } from "./WalletSwapPanel";
import { WalletTradeHistory } from "./WalletTradeHistory";

export function CompanionWalletPanel(props: WalletPanelProps) {
  const state = useWalletPanelState(props);

  const {
    evmShort,
    solShort,
    evmAddress,
    solAddress,
    walletPanelOpen,
    setWalletPanelOpen,
    walletPanelRef,
    walletActionMode,
    setWalletActionMode,
    walletPortfolioTab,
    setWalletPortfolioTab,
    walletPortfolioChain,
    setWalletPortfolioChain,
    walletTotalUsd,
    walletChainOptions,
    walletRefreshBusy,
    bscChainError,
    walletReady,
    rpcReady,
    gasReady,
    walletError,
    loadBalances,
    loadNfts,
    copyToClipboard,
    setActionNotice,
    t,
  } = state;

  if (!evmShort && !solShort) return null;

  return (
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
          <div className="anime-wallet-popover-error">{walletError}</div>
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
                  <span className="anime-wallet-address-chain">BSC</span>
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
                  <span className="anime-wallet-address-chain">SOL</span>
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
                    onClick={() => setWalletPortfolioChain(chainOption.value)}
                  >
                    {chainOption.label}
                  </button>
                ))}
              </div>
            </div>

            {walletPortfolioTab === "tokens" ? (
              <WalletPortfolioList
                visibleWalletTokenRows={state.visibleWalletTokenRows}
                walletSelectedTokenKey={state.walletSelectedTokenKey}
                setWalletSelectedTokenKey={state.setWalletSelectedTokenKey}
                setWalletTokenDetailsOpen={state.setWalletTokenDetailsOpen}
                walletTokenDetailsOpen={state.walletTokenDetailsOpen}
                selectedWalletToken={state.selectedWalletToken}
                selectedWalletTokenShare={state.selectedWalletTokenShare}
                selectedWalletTokenExplorerUrl={
                  state.selectedWalletTokenExplorerUrl
                }
                walletLoading={state.walletLoading}
                handleCopySelectedTokenAddress={
                  state.handleCopySelectedTokenAddress
                }
                handleSelectedTokenSwap={state.handleSelectedTokenSwap}
                handleSelectedTokenSend={state.handleSelectedTokenSend}
                t={t}
              />
            ) : (
              <WalletNftGallery
                filteredWalletCollectibleRows={
                  state.filteredWalletCollectibleRows
                }
                walletNftsLoading={state.walletNftsLoading}
                t={t}
              />
            )}

            <WalletTradeHistory
              walletRecentExpanded={state.walletRecentExpanded}
              setWalletRecentExpanded={state.setWalletRecentExpanded}
              walletRecentFilter={state.walletRecentFilter}
              setWalletRecentFilter={state.setWalletRecentFilter}
              walletRecentFilterOptions={state.walletRecentFilterOptions}
              visibleWalletRecentTrades={state.visibleWalletRecentTrades}
              groupedWalletRecentTrades={state.groupedWalletRecentTrades}
              walletRecentBusyHashes={state.walletRecentBusyHashes}
              refreshRecentTradeStatus={state.refreshRecentTradeStatus}
              handleCopyRecentTxHash={state.handleCopyRecentTxHash}
              t={t}
            />
          </>
        )}

        {walletActionMode === "swap" && (
          <WalletSwapPanel
            swapSide={state.swapSide}
            setSwapSide={state.setSwapSide}
            swapTokenAddress={state.swapTokenAddress}
            setSwapTokenAddress={state.setSwapTokenAddress}
            swapAmount={state.swapAmount}
            setSwapAmount={state.setSwapAmount}
            swapSlippage={state.swapSlippage}
            setSwapSlippage={state.setSwapSlippage}
            swapQuote={state.swapQuote}
            swapBusy={state.swapBusy}
            swapExecuteBusy={state.swapExecuteBusy}
            swapLastTxHash={state.swapLastTxHash}
            swapUserSignTx={state.swapUserSignTx}
            swapUserSignApprovalTx={state.swapUserSignApprovalTx}
            swapInputSymbol={state.swapInputSymbol}
            swapCanUsePresets={state.swapCanUsePresets}
            swapTokenValid={state.swapTokenValid}
            swapAmountValid={state.swapAmountValid}
            swapPresetButtons={state.swapPresetButtons}
            swapFlowStep={state.swapFlowStep}
            swapRouteLabel={state.swapRouteLabel}
            swapNeedsUserSign={state.swapNeedsUserSign}
            swapAvailableAmountNum={state.swapAvailableAmountNum}
            formatSwapAmount={state.formatSwapAmount}
            handleSwapQuote={state.handleSwapQuote}
            handleSwapExecute={state.handleSwapExecute}
            handleSwapPreset={state.handleSwapPreset}
            handleCopyUserSignPayload={state.handleCopyUserSignPayload}
            t={t}
          />
        )}

        {walletActionMode === "send" && (
          <WalletSendPanel
            sendTo={state.sendTo}
            setSendTo={state.setSendTo}
            sendAmount={state.sendAmount}
            setSendAmount={state.setSendAmount}
            sendAsset={state.sendAsset}
            setSendAsset={state.setSendAsset}
            sendReady={state.sendReady}
            sendExecuteBusy={state.sendExecuteBusy}
            sendLastTxHash={state.sendLastTxHash}
            sendUserSignTx={state.sendUserSignTx}
            handleSendExecute={state.handleSendExecute}
            handleCopyUserSignPayload={state.handleCopyUserSignPayload}
            t={t}
          />
        )}

        {bscChainError && (
          <div className="anime-wallet-popover-error">
            {t("wallet.bscFeedError", { error: bscChainError })}
          </div>
        )}
      </div>
    </div>
  );
}
