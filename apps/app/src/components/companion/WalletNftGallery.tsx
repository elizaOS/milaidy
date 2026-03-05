import type { TranslatorFn, WalletCollectibleRow } from "./walletUtils";

type WalletNftGalleryProps = {
  filteredWalletCollectibleRows: WalletCollectibleRow[];
  walletNftsLoading: boolean;
  t: TranslatorFn;
};

export function WalletNftGallery({
  filteredWalletCollectibleRows,
  walletNftsLoading,
  t,
}: WalletNftGalleryProps) {
  return (
    <div className="anime-wallet-nft-grid">
      {walletNftsLoading ? (
        <div className="anime-wallet-asset-empty">
          {t("wallet.loadingNfts")}
        </div>
      ) : filteredWalletCollectibleRows.length > 0 ? (
        filteredWalletCollectibleRows.slice(0, 8).map((row) => (
          <div key={row.key} className="anime-wallet-nft-card">
            <div className="anime-wallet-nft-thumb">
              {row.imageUrl ? (
                <img src={row.imageUrl} alt={row.name} loading="lazy" />
              ) : (
                <span>{t("wallet.noImage")}</span>
              )}
            </div>
            <div className="anime-wallet-nft-meta">
              <span className="anime-wallet-nft-name">{row.name}</span>
              <span className="anime-wallet-nft-collection">
                {row.collectionName}
              </span>
              <span className="anime-wallet-nft-chain">{row.chain}</span>
            </div>
          </div>
        ))
      ) : (
        <div className="anime-wallet-asset-empty">
          {t("wallet.noNftsFound")}
        </div>
      )}
    </div>
  );
}
