import type { TranslatorFn, WalletTokenRow } from "./walletUtils";

type WalletPortfolioListProps = {
  visibleWalletTokenRows: WalletTokenRow[];
  walletSelectedTokenKey: string | null;
  setWalletSelectedTokenKey: (key: string) => void;
  setWalletTokenDetailsOpen: (open: boolean) => void;
  walletTokenDetailsOpen: boolean;
  selectedWalletToken: WalletTokenRow | null;
  selectedWalletTokenShare: number;
  selectedWalletTokenExplorerUrl: string | null;
  walletLoading: boolean;
  handleCopySelectedTokenAddress: () => void;
  handleSelectedTokenSwap: () => void;
  handleSelectedTokenSend: () => void;
  t: TranslatorFn;
};

export function WalletPortfolioList({
  visibleWalletTokenRows,
  walletSelectedTokenKey,
  setWalletSelectedTokenKey,
  setWalletTokenDetailsOpen,
  walletTokenDetailsOpen,
  selectedWalletToken,
  selectedWalletTokenShare,
  selectedWalletTokenExplorerUrl,
  walletLoading,
  handleCopySelectedTokenAddress,
  handleSelectedTokenSwap,
  handleSelectedTokenSend,
  t,
}: WalletPortfolioListProps) {
  return (
    <>
      <div className="anime-wallet-token-list">
        {visibleWalletTokenRows.length > 0 ? (
          visibleWalletTokenRows.map((row) => (
            <button
              key={row.key}
              type="button"
              className={`anime-wallet-token-row ${walletSelectedTokenKey === row.key ? "is-active" : ""}`}
              onClick={() => {
                setWalletSelectedTokenKey(row.key);
                setWalletTokenDetailsOpen(true);
              }}
              data-testid={`wallet-token-row-${row.key}`}
            >
              <div className="anime-wallet-token-main">
                <span className="anime-wallet-token-logo" aria-hidden="true">
                  {row.logoUrl ? (
                    <img src={row.logoUrl} alt="" loading="lazy" />
                  ) : (
                    row.symbol.slice(0, 1)
                  )}
                </span>
                <div className="anime-wallet-token-meta">
                  <span className="anime-wallet-token-name">{row.name}</span>
                  <span className="anime-wallet-token-balance">
                    {row.balance} {row.symbol}
                  </span>
                </div>
              </div>
              <div className="anime-wallet-token-value-wrap">
                <span className="anime-wallet-token-value">
                  $
                  {row.valueUsd.toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
                <span className="anime-wallet-token-chain">{row.chain}</span>
              </div>
            </button>
          ))
        ) : (
          <div className="anime-wallet-asset-empty">
            {walletLoading
              ? t("wallet.loadingBalances")
              : t("wallet.noTokensFound")}
          </div>
        )}
      </div>

      {selectedWalletToken && (
        <div className="anime-wallet-token-detail-toggle">
          <div className="anime-wallet-token-detail-toggle-meta">
            <span>{selectedWalletToken.name}</span>
            <span>{selectedWalletToken.chain}</span>
          </div>
          <button
            type="button"
            className="anime-wallet-address-copy"
            data-testid="wallet-token-details-toggle"
            onClick={() => setWalletTokenDetailsOpen(!walletTokenDetailsOpen)}
          >
            {walletTokenDetailsOpen
              ? t("wallet.tokenDetailsHide")
              : t("wallet.tokenDetailsShow")}
          </button>
        </div>
      )}

      {selectedWalletToken && walletTokenDetailsOpen && (
        <div className="anime-wallet-token-detail">
          <div className="anime-wallet-token-detail-head">
            <span>{t("wallet.tokenDetails")}</span>
            <span>
              {t("wallet.tokenShare")}: {selectedWalletTokenShare.toFixed(2)}%
            </span>
          </div>
          <div className="anime-wallet-token-detail-grid">
            <div className="anime-wallet-token-detail-item">
              <span>{t("wallet.name")}</span>
              <strong>{selectedWalletToken.name}</strong>
            </div>
            <div className="anime-wallet-token-detail-item">
              <span>{t("wallet.chain")}</span>
              <strong>{selectedWalletToken.chain}</strong>
            </div>
            <div className="anime-wallet-token-detail-item">
              <span>{t("wallet.table.balance")}</span>
              <strong>
                {selectedWalletToken.balance} {selectedWalletToken.symbol}
              </strong>
            </div>
            <div className="anime-wallet-token-detail-item">
              <span>{t("wallet.value")}</span>
              <strong>
                $
                {selectedWalletToken.valueUsd.toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </strong>
            </div>
          </div>
          {selectedWalletToken.assetAddress && (
            <div className="anime-wallet-token-detail-address">
              <span>{t("wallet.tokenAddress")}</span>
              <code title={selectedWalletToken.assetAddress}>
                {selectedWalletToken.assetAddress}
              </code>
            </div>
          )}
          <div className="anime-wallet-token-detail-actions">
            {selectedWalletToken.assetAddress && (
              <button
                type="button"
                className="anime-wallet-address-copy"
                onClick={() => {
                  void handleCopySelectedTokenAddress();
                }}
              >
                {t("wallet.tokenCopyAddress")}
              </button>
            )}
            {selectedWalletTokenExplorerUrl && (
              <a
                href={selectedWalletTokenExplorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="anime-wallet-tx-link anime-wallet-recent-link"
              >
                {t("wallet.tokenViewExplorer")}
              </a>
            )}
            <button
              type="button"
              className="anime-wallet-address-copy"
              onClick={handleSelectedTokenSwap}
            >
              {t("wallet.tokenSwapThis")}
            </button>
            <button
              type="button"
              className="anime-wallet-address-copy"
              onClick={handleSelectedTokenSend}
            >
              {t("wallet.tokenSendThis")}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
