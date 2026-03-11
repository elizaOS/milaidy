/**
 * NFT gallery grid with lazy-loaded images.
 */

import type { createTranslator } from "@milady/app-core/i18n";
import { chainIcon, type NftItem } from "./constants";

export interface NftGridProps {
  t: ReturnType<typeof createTranslator>;
  walletNftsLoading: boolean;
  walletNfts: unknown;
  allNfts: NftItem[];
}

export function NftGrid({
  t,
  walletNftsLoading,
  walletNfts,
  allNfts,
}: NftGridProps) {
  if (walletNftsLoading) {
    return (
      <div className="text-center py-10 text-muted italic text-xs">
        {t("wallet.loadingNfts")}
      </div>
    );
  }
  if (!walletNfts) {
    return (
      <div className="text-center py-10 text-muted italic text-xs">
        {t("wallet.noNftData")}
      </div>
    );
  }
  if (allNfts.length === 0) {
    return (
      <div className="text-center py-10 text-muted italic text-xs">
        {t("wallet.noNftsFound")}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2.5 mt-3 max-h-[60vh] overflow-y-auto">
      {allNfts.map((nft, idx) => {
        const icon = chainIcon(nft.chain);
        return (
          <div
            key={`${nft.chain}-${nft.name}-${idx}`}
            className="border border-border bg-card overflow-hidden"
          >
            {nft.imageUrl ? (
              <img
                src={nft.imageUrl}
                alt={nft.name}
                loading="lazy"
                className="w-full h-[150px] object-cover block bg-bg-muted"
              />
            ) : (
              <div className="w-full h-[150px] bg-bg-muted flex items-center justify-center text-[11px] text-muted">
                {t("wallet.noImage")}
              </div>
            )}
            <div className="px-2 py-1.5">
              <div className="text-[11px] font-bold overflow-hidden text-ellipsis whitespace-nowrap">
                {nft.name}
              </div>
              <div className="text-[10px] text-muted overflow-hidden text-ellipsis whitespace-nowrap">
                {nft.collectionName}
              </div>
              <div className="inline-flex items-center gap-1 text-[10px] text-muted mt-0.5">
                <span
                  className={`inline-block w-3 h-3 rounded-full text-center leading-3 text-[7px] font-bold font-mono text-white ${icon.cls}`}
                >
                  {icon.code}
                </span>
                {nft.chain}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
