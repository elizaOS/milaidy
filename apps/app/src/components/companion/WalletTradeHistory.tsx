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
    <div className="text-sm">
      <div className="text-sm">
        <span>{t("wallet.recentActivity")}</span>
        <div className="text-sm">
          {walletRecentExpanded && visibleWalletRecentTrades.length > 0 && (
            <button
              type="button"
              className="text-sm"
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
            className="text-sm"
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
          <div className="text-sm">
            {walletRecentFilterOptions.map((filterOption) => (
              <button
                key={filterOption.key}
                type="button"
                className={`text-sm`}
                onClick={() => setWalletRecentFilter(filterOption.key)}
                data-testid={`wallet-recent-filter-${filterOption.key}`}
              >
                {filterOption.label}
              </button>
            ))}
          </div>
          <div className="text-sm">
            {groupedWalletRecentTrades.length > 0 ? (
              groupedWalletRecentTrades.map((group) => (
                <div
                  key={group.key}
                  className="text-sm"
                  data-testid={`wallet-recent-group-${group.key}`}
                >
                  <div className="text-sm">
                    {group.label}
                  </div>
                  {group.entries.map((entry, entryIndex) => (
                    <div key={entry.hash} className="text-sm">
                      <div className="text-sm">
                        <span
                          className={`text-sm`}
                        >
                          {entry.side.toUpperCase()}
                        </span>
                        <div className="text-sm">
                          <span>
                            {entry.amount} {entry.inputSymbol} {"->"}{" "}
                            {entry.outputSymbol}
                          </span>
                          <code>{shortHash(entry.hash)}</code>
                        </div>
                      </div>
                      <div className="text-sm">
                        <span
                          className={`text-sm`}
                        >
                          {getWalletTxStatusLabel(entry.status, t)}
                        </span>
                        <a
                          href={safeExplorerHref(entry.explorerUrl, entry.hash)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm"
                        >
                          {t("wallet.view")}
                        </a>
                        <button
                          type="button"
                          className="text-sm"
                          data-testid={`wallet-recent-copy-hash-${group.key}-${entryIndex}`}
                          onClick={() => {
                            void handleCopyRecentTxHash(entry.hash);
                          }}
                        >
                          {t("wallet.copyTxHash")}
                        </button>
                        <button
                          type="button"
                          className="text-sm"
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
                          <div className="text-sm">
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
                        <div className="text-sm">
                          {entry.reason}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ))
            ) : (
              <div className="text-sm">
                {t("wallet.noRecentActivity")}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
