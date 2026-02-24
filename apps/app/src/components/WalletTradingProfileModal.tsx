import type {
  WalletTradingProfileResponse,
  WalletTradingProfileSourceFilter,
  WalletTradingProfileWindow,
} from "../api-client.js";
import type { TranslationVars } from "../i18n";

interface WalletTradingProfileModalProps {
  open: boolean;
  loading: boolean;
  error: string | null;
  profile: WalletTradingProfileResponse | null;
  bnbUsdEstimate: number | null;
  windowFilter: WalletTradingProfileWindow;
  sourceFilter: WalletTradingProfileSourceFilter;
  onClose: () => void;
  onRefresh: () => void;
  onWindowFilterChange: (window: WalletTradingProfileWindow) => void;
  onSourceFilterChange: (source: WalletTradingProfileSourceFilter) => void;
  t: (key: string, vars?: TranslationVars) => string;
}

function formatUsd(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "--";
  return `$${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatBnb(value: string): string {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return "0 BNB";
  return `${parsed.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6,
  })} BNB`;
}

function formatPercent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "--";
  return `${value.toFixed(1)}%`;
}

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
}: WalletTradingProfileModalProps) {
  if (!open) return null;

  const pnlPoints = (profile?.pnlSeries ?? []).map((point) => Number.parseFloat(point.realizedPnlBnb));
  const safePoints = pnlPoints.filter((point) => Number.isFinite(point));
  const minPnl = safePoints.length > 0 ? Math.min(...safePoints) : 0;
  const maxPnl = safePoints.length > 0 ? Math.max(...safePoints) : 0;
  const range = Math.max(1e-9, maxPnl - minPnl);
  const svgPoints = safePoints.map((point, index) => {
    const x = safePoints.length <= 1 ? 0 : (index / (safePoints.length - 1)) * 100;
    const y = 100 - (((point - minPnl) / range) * 100);
    return `${x},${y}`;
  }).join(" ");

  const realizedPnlBnb = profile ? Number.parseFloat(profile.summary.realizedPnlBnb) : 0;
  const pnlUsdEstimate = Number.isFinite(realizedPnlBnb) && bnbUsdEstimate && bnbUsdEstimate > 0
    ? realizedPnlBnb * bnbUsdEstimate
    : null;

  return (
    <div className="anime-wallet-profile-backdrop" onClick={onClose}>
      <section
        className="anime-wallet-profile-modal"
        role="dialog"
        aria-modal="true"
        aria-label={t("wallet.profile.title")}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="anime-wallet-profile-header">
          <div>
            <h3>{t("wallet.profile.title")}</h3>
            <p>{t("wallet.profile.subtitle")}</p>
          </div>
          <div className="anime-wallet-profile-header-actions">
            <button type="button" className="anime-wallet-popover-ghost" onClick={onRefresh}>
              {t("wallet.profile.refresh")}
            </button>
            <button type="button" className="anime-wallet-popover-ghost" onClick={onClose}>
              {t("wallet.profile.close")}
            </button>
          </div>
        </header>

        <div className="anime-wallet-profile-filters">
          <div className="anime-wallet-profile-filter-group">
            {(["7d", "30d", "all"] as const).map((windowOption) => (
              <button
                key={windowOption}
                type="button"
                className={`anime-wallet-portfolio-filter ${windowFilter === windowOption ? "is-active" : ""}`}
                onClick={() => onWindowFilterChange(windowOption)}
              >
                {windowOption === "7d"
                  ? t("wallet.profile.window7d")
                  : windowOption === "30d"
                    ? t("wallet.profile.window30d")
                    : t("wallet.profile.windowAll")}
              </button>
            ))}
          </div>
          <div className="anime-wallet-profile-filter-group">
            {(["all", "agent", "manual"] as const).map((sourceOption) => (
              <button
                key={sourceOption}
                type="button"
                className={`anime-wallet-portfolio-filter ${sourceFilter === sourceOption ? "is-active" : ""}`}
                onClick={() => onSourceFilterChange(sourceOption)}
              >
                {sourceOption === "all"
                  ? t("wallet.profile.sourceAll")
                  : sourceOption === "agent"
                    ? t("wallet.profile.sourceAgent")
                    : t("wallet.profile.sourceManual")}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="anime-wallet-profile-empty">{t("wallet.profile.loading")}</div>
        ) : error ? (
          <div className="anime-wallet-popover-error">{error}</div>
        ) : profile ? (
          <div className="anime-wallet-profile-content">
            <div className="anime-wallet-profile-kpis">
              <article className="anime-wallet-profile-kpi">
                <span>{t("wallet.profile.realizedPnl")}</span>
                <strong>{formatBnb(profile.summary.realizedPnlBnb)}</strong>
                <small>{formatUsd(pnlUsdEstimate)}</small>
              </article>
              <article className="anime-wallet-profile-kpi">
                <span>{t("wallet.profile.tradeWinRate")}</span>
                <strong>{formatPercent(profile.summary.tradeWinRate)}</strong>
                <small>
                  {profile.summary.winningTrades}/{profile.summary.evaluatedTrades}
                </small>
              </article>
              <article className="anime-wallet-profile-kpi">
                <span>{t("wallet.profile.txSuccessRate")}</span>
                <strong>{formatPercent(profile.summary.txSuccessRate)}</strong>
                <small>
                  {profile.summary.successCount}/{profile.summary.settledCount}
                </small>
              </article>
              <article className="anime-wallet-profile-kpi">
                <span>{t("wallet.profile.totalSwaps")}</span>
                <strong>{profile.summary.totalSwaps}</strong>
                <small>{formatBnb(profile.summary.volumeBnb)}</small>
              </article>
            </div>

            <section className="anime-wallet-profile-section">
              <header>
                <h4>{t("wallet.profile.pnlTrend")}</h4>
              </header>
              {safePoints.length > 0 ? (
                <div className="anime-wallet-profile-chart-wrap">
                  <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="anime-wallet-profile-chart">
                    <polyline points={svgPoints} />
                  </svg>
                </div>
              ) : (
                <div className="anime-wallet-profile-empty">{t("wallet.profile.empty")}</div>
              )}
            </section>

            <section className="anime-wallet-profile-section">
              <header>
                <h4>{t("wallet.profile.tokenBreakdown")}</h4>
              </header>
              {profile.tokenBreakdown.length > 0 ? (
                <div className="anime-wallet-profile-token-table">
                  {profile.tokenBreakdown.slice(0, 8).map((token) => (
                    <div className="anime-wallet-profile-token-row" key={token.tokenAddress}>
                      <div>
                        <strong>{token.symbol}</strong>
                        <span>{token.tokenAddress}</span>
                      </div>
                      <div>
                        <strong>{formatBnb(token.realizedPnlBnb)}</strong>
                        <span>{formatPercent(token.tradeWinRate)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="anime-wallet-profile-empty">{t("wallet.profile.empty")}</div>
              )}
            </section>

            <section className="anime-wallet-profile-section">
              <header>
                <h4>{t("wallet.profile.recentSwaps")}</h4>
              </header>
              {profile.recentSwaps.length > 0 ? (
                <div className="anime-wallet-profile-recent">
                  {profile.recentSwaps.slice(0, 8).map((swap) => (
                    <div className="anime-wallet-profile-recent-row" key={swap.hash}>
                      <div className="anime-wallet-profile-recent-main">
                        <span className={`anime-wallet-recent-side is-${swap.side}`}>
                          {swap.side.toUpperCase()}
                        </span>
                        <div className="anime-wallet-recent-meta">
                          <span>{swap.inputAmount} {swap.inputSymbol} {"->"} {swap.outputAmount} {swap.outputSymbol}</span>
                          <code>{swap.hash.slice(0, 10)}...{swap.hash.slice(-8)}</code>
                        </div>
                      </div>
                      <div className="anime-wallet-profile-recent-actions">
                        <span className={`anime-wallet-tx-pill is-${swap.status}`}>{swap.status}</span>
                        <span className={`anime-wallet-profile-source is-${swap.source}`}>{swap.source.toUpperCase()}</span>
                        <a
                          href={swap.explorerUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="anime-wallet-tx-link anime-wallet-recent-link"
                        >
                          {t("wallet.viewTx")}
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="anime-wallet-profile-empty">
                  <div>{t("wallet.profile.empty")}</div>
                  <small>{t("wallet.profile.emptyHint")}</small>
                </div>
              )}
            </section>
          </div>
        ) : (
          <div className="anime-wallet-profile-empty">{t("wallet.profile.empty")}</div>
        )}
      </section>
    </div>
  );
}
