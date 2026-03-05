import type {
  WalletTradingProfileResponse,
  WalletTradingProfileSourceFilter,
  WalletTradingProfileWindow,
} from "../../api-client";
import type { TranslatorFn } from "./walletUtils";

export function WalletTradingProfileModal({
  open,
  loading,
  error,
  profile,
  bnbUsdEstimate,
  windowFilter,
  sourceFilter,
  onClose,
  onRefresh,
  onWindowFilterChange,
  onSourceFilterChange,
  t,
}: {
  open: boolean;
  loading: boolean;
  error: string | null;
  profile: WalletTradingProfileResponse | null;
  bnbUsdEstimate: number | null;
  windowFilter: WalletTradingProfileWindow;
  sourceFilter: WalletTradingProfileSourceFilter;
  onClose: () => void;
  onRefresh: () => void;
  onWindowFilterChange: (w: WalletTradingProfileWindow) => void;
  onSourceFilterChange: (s: WalletTradingProfileSourceFilter) => void;
  t: TranslatorFn;
}) {
  if (!open) return null;
  const windows: WalletTradingProfileWindow[] = ["7d", "30d", "all"];
  const sources: WalletTradingProfileSourceFilter[] = [
    "all",
    "agent",
    "manual",
  ];
  const windowLabels: Record<WalletTradingProfileWindow, string> = {
    "7d": "7D",
    "30d": "30D",
    all: "ALL",
  };

  const summary = profile?.summary ?? null;
  const pnlBnb = Number.parseFloat(summary?.realizedPnlBnb ?? "0");
  const volumeBnb = Number.parseFloat(summary?.volumeBnb ?? "0");
  const pnlUsd =
    bnbUsdEstimate != null && Number.isFinite(pnlBnb)
      ? pnlBnb * bnbUsdEstimate
      : null;

  return (
    <div className="anime-wallet-trading-profile-modal">
      <div className="anime-wallet-trading-profile-header">
        <span>{t("wallet.profile.title")}</span>
        <div className="anime-wallet-trading-profile-header-actions">
          <button
            type="button"
            className="anime-wallet-address-copy"
            onClick={onRefresh}
            disabled={loading}
          >
            {loading ? t("wallet.refreshing") : t("wallet.profile.refresh")}
          </button>
          <button
            type="button"
            className="anime-wallet-trading-profile-close"
            onClick={onClose}
          >
            {t("wallet.close")}
          </button>
        </div>
      </div>
      <div className="anime-wallet-trading-profile-filters">
        {windows.map((w) => (
          <button
            key={w}
            type="button"
            className={`anime-wallet-portfolio-filter ${windowFilter === w ? "is-active" : ""}`}
            onClick={() => onWindowFilterChange(w)}
          >
            {windowLabels[w]}
          </button>
        ))}
        {sources.map((s) => (
          <button
            key={s}
            type="button"
            className={`anime-wallet-portfolio-source-filter ${sourceFilter === s ? "is-active" : ""}`}
            onClick={() => onSourceFilterChange(s)}
          >
            {s}
          </button>
        ))}
      </div>

      {error && (
        <div className="anime-wallet-popover-error">{error}</div>
      )}

      {summary && (
        <div className="anime-wallet-trading-profile-summary">
          <div className="anime-wallet-trading-profile-stat">
            <span className="anime-wallet-trading-profile-stat-label">
              {t("wallet.profile.realizedPnl")}
            </span>
            <span
              className={`anime-wallet-trading-profile-stat-value ${pnlBnb >= 0 ? "is-positive" : "is-negative"}`}
            >
              {pnlBnb >= 0 ? "+" : ""}
              {pnlBnb.toFixed(4)} BNB
              {pnlUsd != null && (
                <span className="anime-wallet-trading-profile-stat-usd">
                  {" "}
                  (${pnlUsd.toFixed(2)})
                </span>
              )}
            </span>
          </div>
          <div className="anime-wallet-trading-profile-stat">
            <span className="anime-wallet-trading-profile-stat-label">
              {t("wallet.profile.volume")}
            </span>
            <span className="anime-wallet-trading-profile-stat-value">
              {volumeBnb.toFixed(4)} BNB
            </span>
          </div>
          <div className="anime-wallet-trading-profile-stat">
            <span className="anime-wallet-trading-profile-stat-label">
              {t("wallet.profile.totalSwaps")}
            </span>
            <span className="anime-wallet-trading-profile-stat-value">
              {summary.totalSwaps}
            </span>
          </div>
          <div className="anime-wallet-trading-profile-stat">
            <span className="anime-wallet-trading-profile-stat-label">
              {t("wallet.profile.winRate")}
            </span>
            <span className="anime-wallet-trading-profile-stat-value">
              {summary.tradeWinRate != null
                ? `${(summary.tradeWinRate * 100).toFixed(1)}%`
                : "—"}
            </span>
          </div>
          <div className="anime-wallet-trading-profile-stat">
            <span className="anime-wallet-trading-profile-stat-label">
              {t("wallet.profile.successRate")}
            </span>
            <span className="anime-wallet-trading-profile-stat-value">
              {summary.txSuccessRate != null
                ? `${(summary.txSuccessRate * 100).toFixed(1)}%`
                : "—"}
            </span>
          </div>
          <div className="anime-wallet-trading-profile-stat">
            <span className="anime-wallet-trading-profile-stat-label">
              {t("wallet.profile.buySell")}
            </span>
            <span className="anime-wallet-trading-profile-stat-value">
              {summary.buyCount} / {summary.sellCount}
            </span>
          </div>
        </div>
      )}

      {!summary && !loading && !error && (
        <div className="anime-wallet-asset-empty">
          {t("wallet.profile.noData")}
        </div>
      )}
    </div>
  );
}
