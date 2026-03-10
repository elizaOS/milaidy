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
    <div className="text-sm">
      {walletNftsLoading ? (
        <div className="text-sm">
          {t("wallet.loadingNfts")}
        </div>
      ) : filteredWalletCollectibleRows.length > 0 ? (
        filteredWalletCollectibleRows.slice(0, 8).map((row) => (
          <div key={row.key} className="text-sm">
            <div className="text-sm">
              {row.imageUrl ? (
                <img src={row.imageUrl} alt={row.name} loading="lazy" />
              ) : (
                <span>{t("wallet.noImage")}</span>
              )}
            </div>
            <div className="text-sm">
              <span className="text-sm">{row.name}</span>
              <span className="text-sm">
                {row.collectionName}
              </span>
              <span className="text-sm">{row.chain}</span>
            </div>
          </div>
        ))
      ) : (
        <div className="text-sm">
          {t("wallet.noNftsFound")}
        </div>
      )}
    </div>
  );
}
