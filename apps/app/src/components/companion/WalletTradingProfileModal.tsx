import type {
  WalletTradingProfileResponse,
  WalletTradingProfileSourceFilter,
  WalletTradingProfileWindow,
} from "../../api-client";
import type { TranslatorFn } from "./walletUtils";

/** TODO: Integrated by CompanionView in PR #812's companion shell. */
export function WalletTradingProfileModal({
  open,
  loading,
  error,
  profile,
  bnbUsdEstimate,
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
    <div className="text-sm">
      <div className="text-sm">
        <span>{t("wallet.profile.title")}</span>
        <div className="text-sm">
          <button
            type="button"
            className="text-sm"
            onClick={onRefresh}
            disabled={loading}
          >
            {loading ? t("wallet.refreshing") : t("wallet.profile.refresh")}
          </button>
          <button
            type="button"
            className="text-sm"
            onClick={onClose}
          >
            {t("wallet.close")}
          </button>
        </div>
      </div>
      <div className="text-sm">
        {windows.map((w) => (
          <button
            key={w}
            type="button"
            className={`text-sm`}
            onClick={() => onWindowFilterChange(w)}
          >
            {windowLabels[w]}
          </button>
        ))}
        {sources.map((s) => (
          <button
            key={s}
            type="button"
            className={`text-sm`}
            onClick={() => onSourceFilterChange(s)}
          >
            {s}
          </button>
        ))}
      </div>

      {error && <div className="text-sm">{error}</div>}

      {summary && (
        <div className="text-sm">
          <div className="text-sm">
            <span className="text-sm">
              {t("wallet.profile.realizedPnl")}
            </span>
            <span
              className={`text-sm`}
            >
              {pnlBnb >= 0 ? "+" : ""}
              {pnlBnb.toFixed(4)} {t("wallettradingprofilemodal.BNB")}
              {pnlUsd != null && (
                <span className="text-sm">
                  {" "}
                  (${pnlUsd.toFixed(2)})
                </span>
              )}
            </span>
          </div>
          <div className="text-sm">
            <span className="text-sm">
              {t("wallet.profile.volume")}
            </span>
            <span className="text-sm">
              {volumeBnb.toFixed(4)} {t("wallettradingprofilemodal.BNB")}
            </span>
          </div>
          <div className="text-sm">
            <span className="text-sm">
              {t("wallet.profile.totalSwaps")}
            </span>
            <span className="text-sm">
              {summary.totalSwaps}
            </span>
          </div>
          <div className="text-sm">
            <span className="text-sm">
              {t("wallet.profile.winRate")}
            </span>
            <span className="text-sm">
              {summary.tradeWinRate != null
                ? `${(summary.tradeWinRate * 100).toFixed(1)}%`
                : "—"}
            </span>
          </div>
          <div className="text-sm">
            <span className="text-sm">
              {t("wallet.profile.successRate")}
            </span>
            <span className="text-sm">
              {summary.txSuccessRate != null
                ? `${(summary.txSuccessRate * 100).toFixed(1)}%`
                : "—"}
            </span>
          </div>
          <div className="text-sm">
            <span className="text-sm">
              {t("wallet.profile.buySell")}
            </span>
            <span className="text-sm">
              {summary.buyCount} / {summary.sellCount}
            </span>
          </div>
        </div>
      )}

      {!summary && !loading && !error && (
        <div className="text-sm">
          {t("wallet.profile.noData")}
        </div>
      )}
    </div>
  );
}
