import {
  getWalletTxStatusLabel,
  safeExplorerHref,
  shortHash,
  type TranslatorFn,
  type WalletRecentFilter,
  type WalletRecentTrade,
} from "./walletUtils";

type RecentTradeGroup = {
  key: string;
  label: string;
  entries: WalletRecentTrade[];
};

type WalletTradeHistoryProps = {
  walletRecentExpanded: boolean;
  setWalletRecentExpanded: (
    value: boolean | ((prev: boolean) => boolean),
  ) => void;
  walletRecentFilter: WalletRecentFilter;
  setWalletRecentFilter: (filter: WalletRecentFilter) => void;
  walletRecentFilterOptions: Array<{
    key: WalletRecentFilter;
    label: string;
  }>;
  visibleWalletRecentTrades: WalletRecentTrade[];
  groupedWalletRecentTrades: RecentTradeGroup[];
  walletRecentBusyHashes: Record<string, boolean>;
  refreshRecentTradeStatus: (hash: string, silent?: boolean) => void;
  handleCopyRecentTxHash: (hash: string) => void;
  t: TranslatorFn;
};

export function WalletTradeHistory({
  walletRecentExpanded,
  setWalletRecentExpanded,
  walletRecentFilter,
  setWalletRecentFilter,
  walletRecentFilterOptions,
  visibleWalletRecentTrades,
  groupedWalletRecentTrades,
  walletRecentBusyHashes,
  refreshRecentTradeStatus,
  handleCopyRecentTxHash,
  t,
}: WalletTradeHistoryProps) {
  return (
    <div className="anime-wallet-recent-section">
      <div className="anime-wallet-recent-header">
        <span>{t("wallet.recentActivity")}</span>
        <div className="anime-wallet-recent-header-actions">
          {walletRecentExpanded && visibleWalletRecentTrades.length > 0 && (
            <button
              type="button"
              className="anime-wallet-address-copy"
              onClick={() => {
                for (const entry of visibleWalletRecentTrades) {
                  void refreshRecentTradeStatus(entry.hash, true);
                }
              }}
            >
              {t("wallet.txStatusRefresh")}
            </button>
          )}
          <button
            type="button"
            className="anime-wallet-address-copy"
            data-testid="wallet-recent-toggle"
            onClick={() => setWalletRecentExpanded((prev) => !prev)}
          >
            {walletRecentExpanded
              ? t("wallet.recentHide")
              : t("wallet.recentShow")}
          </button>
        </div>
      </div>
      {walletRecentExpanded && (
        <>
          <div className="anime-wallet-recent-filters">
            {walletRecentFilterOptions.map((filterOption) => (
              <button
                key={filterOption.key}
                type="button"
                className={`anime-wallet-portfolio-filter ${walletRecentFilter === filterOption.key ? "is-active" : ""}`}
                onClick={() => setWalletRecentFilter(filterOption.key)}
                data-testid={`wallet-recent-filter-${filterOption.key}`}
              >
                {filterOption.label}
              </button>
            ))}
          </div>
          <div className="anime-wallet-recent-list">
            {groupedWalletRecentTrades.length > 0 ? (
              groupedWalletRecentTrades.map((group) => (
                <div
                  key={group.key}
                  className="anime-wallet-recent-group"
                  data-testid={`wallet-recent-group-${group.key}`}
                >
                  <div className="anime-wallet-recent-group-title">
                    {group.label}
                  </div>
                  {group.entries.map((entry, entryIndex) => (
                    <div key={entry.hash} className="anime-wallet-recent-row">
                      <div className="anime-wallet-recent-main">
                        <span
                          className={`anime-wallet-recent-side is-${entry.side}`}
                        >
                          {entry.side.toUpperCase()}
                        </span>
                        <div className="anime-wallet-recent-meta">
                          <span>
                            {entry.amount} {entry.inputSymbol} {"->"}{" "}
                            {entry.outputSymbol}
                          </span>
                          <code>{shortHash(entry.hash)}</code>
                        </div>
                      </div>
                      <div className="anime-wallet-recent-actions">
                        <span
                          className={`anime-wallet-tx-pill is-${entry.status}`}
                        >
                          {getWalletTxStatusLabel(entry.status, t)}
                        </span>
                        <a
                          href={safeExplorerHref(entry.explorerUrl, entry.hash)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="anime-wallet-tx-link anime-wallet-recent-link"
                        >
                          {t("wallet.view")}
                        </a>
                        <button
                          type="button"
                          className="anime-wallet-address-copy"
                          data-testid={`wallet-recent-copy-hash-${group.key}-${entryIndex}`}
                          onClick={() => {
                            void handleCopyRecentTxHash(entry.hash);
                          }}
                        >
                          {t("wallet.copyTxHash")}
                        </button>
                        <button
                          type="button"
                          className="anime-wallet-address-copy"
                          disabled={Boolean(walletRecentBusyHashes[entry.hash])}
                          onClick={() => {
                            void refreshRecentTradeStatus(entry.hash);
                          }}
                        >
                          {walletRecentBusyHashes[entry.hash]
                            ? t("wallet.refreshing")
                            : t("wallet.txStatusRefresh")}
                        </button>
                      </div>
                      {(entry.confirmations > 0 ||
                        typeof entry.nonce === "number") && (
                        <div className="anime-wallet-recent-extra">
                          {entry.confirmations > 0 && (
                            <span>
                              {t("wallet.txStatus.confirmations", {
                                count: entry.confirmations,
                              })}
                            </span>
                          )}
                          {typeof entry.nonce === "number" && (
                            <span>
                              {t("wallet.txStatus.nonce", {
                                nonce: entry.nonce,
                              })}
                            </span>
                          )}
                        </div>
                      )}
                      {entry.status === "reverted" && entry.reason && (
                        <div className="anime-wallet-recent-reason">
                          {entry.reason}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ))
            ) : (
              <div className="anime-wallet-asset-empty">
                {t("wallet.noRecentActivity")}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
