import type {
  WalletTradingProfileResponse,
  WalletTradingProfileSourceFilter,
  WalletTradingProfileWindow,
} from "../api-client";

export type WalletTradingProfileModalProps = {
  open: boolean;
  loading: boolean;
  error: string | null;
  profile: WalletTradingProfileResponse | null;
  bnbUsdEstimate: number | null;
  windowFilter: WalletTradingProfileWindow;
  sourceFilter: WalletTradingProfileSourceFilter;
  onClose: () => void;
  onRefresh: () => void;
  onWindowFilterChange: (windowFilter: WalletTradingProfileWindow) => void;
  onSourceFilterChange: (
    sourceFilter: WalletTradingProfileSourceFilter,
  ) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
};

/** Placeholder — full implementation tracked in a follow-up PR. */
export function WalletTradingProfileModal({
  open,
  windowFilter,
  sourceFilter,
  onClose,
  onWindowFilterChange,
  onSourceFilterChange,
  t,
}: WalletTradingProfileModalProps) {
  if (!open) return null;

  const windows: WalletTradingProfileWindow[] = ["7d", "30d", "90d"];
  const sources: WalletTradingProfileSourceFilter[] = [
    "all",
    "agent",
    "manual",
  ];
  const windowLabels: Record<WalletTradingProfileWindow, string> = {
    "7d": "7D",
    "30d": "30D",
    "90d": "90D",
  };

  return (
    <div className="anime-wallet-trading-profile-modal">
      <div className="anime-wallet-trading-profile-header">
        <span>{t("wallet.profile.title")}</span>
        <button
          type="button"
          className="anime-wallet-trading-profile-close"
          onClick={onClose}
        >
          {t("wallet.close")}
        </button>
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
    </div>
  );
}
