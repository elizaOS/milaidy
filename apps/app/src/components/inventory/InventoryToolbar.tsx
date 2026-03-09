/**
 * Toolbar: tokens/NFTs tabs, chain-focus chips, sort controls, refresh.
 */

import type { createTranslator } from "../../i18n";

export interface InventoryToolbarProps {
  t: ReturnType<typeof createTranslator>;
  inventoryView: "tokens" | "nfts";
  inventorySort: string;
  inventoryChainFocus: string;
  walletBalances: unknown;
  walletNfts: unknown;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setState: (key: any, value: any) => void;
  loadBalances: () => Promise<void> | void;
  loadNfts: () => Promise<void> | void;
}

export function InventoryToolbar({
  t,
  inventoryView,
  inventorySort,
  inventoryChainFocus,
  walletBalances,
  walletNfts,
  setState,
  loadBalances,
  loadNfts,
}: InventoryToolbarProps) {
  return (
    <div className="wt__toolbar">
      <button
        type="button"
        className={`wt__tab ${inventoryView === "tokens" ? "is-active" : ""}`}
        onClick={() => {
          setState("inventoryView", "tokens");
          if (!walletBalances) void loadBalances();
        }}
      >
        {t("wallet.tokens")}
      </button>
      <button
        type="button"
        className={`wt__tab ${inventoryView === "nfts" ? "is-active" : ""}`}
        onClick={() => {
          setState("inventoryView", "nfts");
          if (!walletNfts) void loadNfts();
        }}
      >
        {t("wallet.nfts")}
      </button>

      {inventoryView === "tokens" && (
        <>
          <span className="wt__sep" />
          <button
            type="button"
            data-testid="wallet-focus-bsc"
            className={`wt__chip ${inventoryChainFocus === "bsc" ? "is-active" : ""}`}
            onClick={() => setState("inventoryChainFocus", "bsc")}
          >
            BSC
          </button>
          <button
            type="button"
            data-testid="wallet-focus-all"
            className={`wt__chip ${inventoryChainFocus === "all" ? "is-active" : ""}`}
            onClick={() => setState("inventoryChainFocus", "all")}
          >
            {t("wallet.all")}
          </button>

          <span className="flex-1" />

          <span className="text-[10px] text-muted font-mono">
            {t("wallet.sort")}:
          </span>
          <button
            type="button"
            className={`wt__chip ${inventorySort === "value" ? "is-active" : ""}`}
            onClick={() => setState("inventorySort", "value")}
          >
            {t("wallet.value")}
          </button>
          <button
            type="button"
            className={`wt__chip ${inventorySort === "chain" ? "is-active" : ""}`}
            onClick={() => setState("inventorySort", "chain")}
          >
            {t("wallet.chain")}
          </button>
          <button
            type="button"
            className={`wt__chip ${inventorySort === "symbol" ? "is-active" : ""}`}
            onClick={() => setState("inventorySort", "symbol")}
          >
            {t("wallet.name")}
          </button>
        </>
      )}

      <button
        type="button"
        className="wt__refresh"
        onClick={() =>
          inventoryView === "tokens" ? loadBalances() : loadNfts()
        }
      >
        Refresh
      </button>
    </div>
  );
}
