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
      <div className="text-sm">
        {visibleWalletTokenRows.length > 0 ? (
          visibleWalletTokenRows.map((row) => (
            <button
              key={row.key}
              type="button"
              className={`text-sm`}
              onClick={() => {
                setWalletSelectedTokenKey(row.key);
                setWalletTokenDetailsOpen(true);
              }}
              data-testid={`wallet-token-row-${row.key}`}
            >
              <div className="text-sm">
                <span className="text-sm" aria-hidden="true">
                  {row.logoUrl ? (
                    <img src={row.logoUrl} alt="" loading="lazy" />
                  ) : (
                    row.symbol.slice(0, 1)
                  )}
                </span>
                <div className="text-sm">
                  <span className="text-sm">{row.name}</span>
                  <span className="text-sm">
                    {row.balance} {row.symbol}
                  </span>
                </div>
              </div>
              <div className="text-sm">
                <span className="text-sm">
                  $
                  {row.valueUsd.toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
                <span className="text-sm">{row.chain}</span>
              </div>
            </button>
          ))
        ) : (
          <div className="text-sm">
            {walletLoading
              ? t("wallet.loadingBalances")
              : t("wallet.noTokensFound")}
          </div>
        )}
      </div>

      {selectedWalletToken && (
        <div className="text-sm">
          <div className="text-sm">
            <span>{selectedWalletToken.name}</span>
            <span>{selectedWalletToken.chain}</span>
          </div>
          <button
            type="button"
            className="text-sm"
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
        <div className="text-sm">
          <div className="text-sm">
            <span>{t("wallet.tokenDetails")}</span>
            <span>
              {t("wallet.tokenShare")}: {selectedWalletTokenShare.toFixed(2)}%
            </span>
          </div>
          <div className="text-sm">
            <div className="text-sm">
              <span>{t("wallet.name")}</span>
              <strong>{selectedWalletToken.name}</strong>
            </div>
            <div className="text-sm">
              <span>{t("wallet.chain")}</span>
              <strong>{selectedWalletToken.chain}</strong>
            </div>
            <div className="text-sm">
              <span>{t("wallet.table.balance")}</span>
              <strong>
                {selectedWalletToken.balance} {selectedWalletToken.symbol}
              </strong>
            </div>
            <div className="text-sm">
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
            <div className="text-sm">
              <span>{t("wallet.tokenAddress")}</span>
              <code title={selectedWalletToken.assetAddress}>
                {selectedWalletToken.assetAddress}
              </code>
            </div>
          )}
          <div className="text-sm">
            {selectedWalletToken.assetAddress && (
              <button
                type="button"
                className="text-sm"
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
                className="text-sm"
              >
                {t("wallet.tokenViewExplorer")}
              </a>
            )}
            <button
              type="button"
              className="text-sm"
              onClick={handleSelectedTokenSwap}
            >
              {t("wallet.tokenSwapThis")}
            </button>
            <button
              type="button"
              className="text-sm"
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
