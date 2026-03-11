/**
 * Portfolio header block: total USD value, native gas-token sub-balance,
 * receive button, address, status dots, and inline chain error.
 */

import { Button } from "@milady/ui";
import { useApp } from "../../AppContext";
import type { ChainConfig } from "../chainConfig";
import { CopyableAddress } from "./CopyableAddress";
import { BSC_GAS_READY_THRESHOLD, formatBalance } from "./constants";
import { StatusDot } from "./StatusDot";

export interface PortfolioHeaderProps {
  totalUsd: number;
  bscNativeBalance: string | null;
  evmAddr: string | null;
  walletReady: boolean;
  rpcReady: boolean;
  gasReady: boolean;
  bscChainError: string | null;
  hasManagedBscRpc: boolean;
  loadBalances: () => Promise<void> | void;
  goToRpcSettings: () => void;
  /** Optional chain config — when provided, displays that chain's name/symbol instead of BSC defaults. */
  chainConfig?: ChainConfig;
}

export function PortfolioHeader({
  totalUsd,
  bscNativeBalance,
  evmAddr,
  walletReady,
  rpcReady,
  gasReady,
  bscChainError,
  hasManagedBscRpc,
  loadBalances,
  goToRpcSettings,
  chainConfig,
}: PortfolioHeaderProps) {
  const { t, copyToClipboard, setActionNotice } = useApp();
  const networkLabel = chainConfig
    ? `${chainConfig.name} Mainnet`
    : t("wallet.bscMainnet");
  const nativeSymbol = chainConfig?.nativeSymbol ?? "BNB";
  const gasThreshold =
    chainConfig?.gasReadyThreshold ?? BSC_GAS_READY_THRESHOLD;
  return (
    <div className="wt__portfolio">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="wt__portfolio-label">{t("wallet.portfolio")}</div>
            <span className="wt__network-badge">{networkLabel}</span>
          </div>
          <div className="wt__portfolio-value" data-testid="bsc-balance-value">
            {totalUsd > 0
              ? `$${totalUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              : "$0.00"}
          </div>
          {bscNativeBalance !== null && (
            <div className="wt__bnb-sub">
              {formatBalance(bscNativeBalance)} {nativeSymbol}
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-2">
          {evmAddr && (
            <Button
              variant="outline"
              size="sm"
              className="wt__receive-btn h-8 px-3 shadow-sm"
              onClick={() => {
                void copyToClipboard(evmAddr);
                setActionNotice(t("wallet.addressCopied"), "success", 2400);
              }}
              title={evmAddr}
            >
              {t("wallet.receive")}
            </Button>
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
                    threshold: gasThreshold,
                  })
                : t("wallet.status.tradeFeedRequired")
          }
        />
      </div>
      {/* Inline BSC error with retry */}
      {bscChainError && (
        <div className="wt__error-inline mt-2">
          <span className="wt__error-inline-text">
            {t("portfolioheader.BSC")} {bscChainError}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="wt__error-retry h-7 px-2 shadow-sm"
            onClick={() => void loadBalances()}
            title={t("wallet.retryFetchingBsc")}
          >
            {t("common.retry")}
          </Button>
        </div>
      )}

      {/* BSC trade requires a dedicated RPC endpoint */}
      {evmAddr && !hasManagedBscRpc && (
        <div className="mt-2 px-3 py-2 border border-[rgba(184,134,11,0.55)] bg-[rgba(184,134,11,0.08)] text-[11px]">
          <div className="font-bold mb-1">
            {t("wallet.setup.rpcNotConfigured")}
          </div>
          <div className="text-[var(--muted)] leading-relaxed">
            {t("portfolioheader.ConnectViaElizaCl")}
          </div>
          <div className="mt-2">
            <Button
              variant="default"
              size="sm"
              className="h-8 px-3 text-[11px] font-mono shadow-sm"
              onClick={goToRpcSettings}
            >
              {t("portfolioheader.ConfigureRPC")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
