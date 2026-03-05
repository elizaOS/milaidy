/**
 * Portfolio header block: total USD value, BNB sub-balance,
 * receive button, address, status dots, and inline BSC error.
 */

import type { createTranslator } from "../../i18n";
import { CopyableAddress } from "./CopyableAddress";
import { BSC_GAS_READY_THRESHOLD, formatBalance } from "./constants";
import { StatusDot } from "./StatusDot";

export interface PortfolioHeaderProps {
  t: ReturnType<typeof createTranslator>;
  totalUsd: number;
  bscNativeBalance: string | null;
  evmAddr: string | null;
  walletReady: boolean;
  rpcReady: boolean;
  gasReady: boolean;
  bscChainError: string | null;
  hasManagedBscRpc: boolean;
  copyToClipboard: (text: string) => Promise<void>;
  setActionNotice: (msg: string, type: string, duration: number) => void;
  loadBalances: () => Promise<void> | void;
  goToRpcSettings: () => void;
}

export function PortfolioHeader({
  t,
  totalUsd,
  bscNativeBalance,
  evmAddr,
  walletReady,
  rpcReady,
  gasReady,
  bscChainError,
  hasManagedBscRpc,
  copyToClipboard,
  setActionNotice,
  loadBalances,
  goToRpcSettings,
}: PortfolioHeaderProps) {
  return (
    <div className="wt__portfolio">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="wt__portfolio-label">{t("wallet.portfolio")}</div>
            <span className="wt__network-badge">{t("wallet.bscMainnet")}</span>
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
              type="button"
              className="wt__receive-btn"
              onClick={() => {
                void copyToClipboard(evmAddr);
                setActionNotice(t("wallet.addressCopied"), "success", 2400);
              }}
              title={evmAddr}
            >
              {t("wallet.receive")}
            </button>
          )}
          {evmAddr && (
            <CopyableAddress address={evmAddr} onCopy={copyToClipboard} />
          )}
        </div>
      </div>
      <div className="wt__status-row mt-2">
        <StatusDot
          ready={walletReady}
          label={
            walletReady
              ? t("wallet.status.connected")
              : t("wallet.status.noWallet")
          }
          title={
            walletReady
              ? t("wallet.status.connectedTitle")
              : t("wallet.status.noWalletTitle")
          }
        />
        <StatusDot
          ready={rpcReady}
          label={
            rpcReady
              ? t("wallet.status.feedLive")
              : t("wallet.status.feedOffline")
          }
          title={
            rpcReady
              ? t("wallet.status.feedLiveTitle")
              : bscChainError
                ? t("wallet.status.feedErrorTitle", {
                    error: bscChainError,
                  })
                : t("wallet.status.feedOfflineTitle")
          }
        />
        <StatusDot
          ready={gasReady}
          label={
            gasReady
              ? t("wallet.status.tradeReady")
              : t("wallet.status.tradeNotReady")
          }
          title={
            gasReady
              ? t("wallet.status.tradeReadyTitle")
              : rpcReady
                ? t("wallet.status.tradeNeedGasTitle", {
                    threshold: BSC_GAS_READY_THRESHOLD,
                  })
                : t("wallet.status.tradeFeedRequired")
          }
        />
      </div>
      {/* Inline BSC error with retry */}
      {bscChainError && (
        <div className="wt__error-inline mt-2">
          <span className="wt__error-inline-text">BSC: {bscChainError}</span>
          <button
            type="button"
            className="wt__error-retry"
            onClick={() => void loadBalances()}
            title={t("wallet.retryFetchingBsc")}
          >
            {t("common.retry")}
          </button>
        </div>
      )}

      {/* BSC trade requires a dedicated RPC endpoint */}
      {evmAddr && !hasManagedBscRpc && (
        <div className="mt-2 px-3 py-2 border border-[rgba(184,134,11,0.55)] bg-[rgba(184,134,11,0.08)] text-[11px]">
          <div className="font-bold mb-1">
            {t("wallet.setup.rpcNotConfigured")}
          </div>
          <div className="text-[var(--muted)] leading-relaxed">
            Connect via Eliza Cloud or configure a custom BSC RPC provider
            (NodeReal / QuickNode) to enable trading.
          </div>
          <div className="mt-2">
            <button
              type="button"
              className="px-3 py-1 border border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-foreground)] cursor-pointer text-[11px] font-mono hover:bg-[var(--accent-hover)] hover:border-[var(--accent-hover)]"
              onClick={goToRpcSettings}
            >
              Configure RPC
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
