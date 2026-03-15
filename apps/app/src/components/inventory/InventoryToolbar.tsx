/**
 * Toolbar: tokens/NFTs tabs, sort controls, refresh.
 */

import type { createTranslator } from "@milady/app-core/i18n";
import type { AppState } from "@milady/app-core/state";
import { Button } from "@milady/ui";

type InventoryToolbarStateKey = "inventoryView" | "inventorySort";

export interface InventoryToolbarProps {
  t: ReturnType<typeof createTranslator>;
  inventoryView: "tokens" | "nfts";
  inventorySort: string;
  walletBalances: unknown;
  walletNfts: unknown;
  setState: <K extends InventoryToolbarStateKey>(
    key: K,
    value: AppState[K],
  ) => void;
  loadBalances: () => Promise<void> | void;
  loadNfts: () => Promise<void> | void;
}

export function InventoryToolbar({
  t,
  inventoryView,
  inventorySort,
  walletBalances,
  walletNfts,
  setState,
  loadBalances,
  loadNfts,
}: InventoryToolbarProps) {
  return (
    <div className="flex items-center gap-1 border-b border-border">
      <Button
        variant={inventoryView === "tokens" ? "default" : "ghost"}
        size="sm"
        className={`h-9 px-4 rounded-none ${inventoryView === "tokens" ? "is-active" : ""}`}
        onClick={() => {
          setState("inventoryView", "tokens");
          if (!walletBalances) void loadBalances();
        }}
      >
        {t("wallet.tokens")}
      </Button>
      <Button
        variant={inventoryView === "nfts" ? "default" : "ghost"}
        size="sm"
        className={`h-9 px-4 rounded-none ${inventoryView === "nfts" ? "is-active" : ""}`}
        onClick={() => {
          setState("inventoryView", "nfts");
          if (!walletNfts) void loadNfts();
        }}
      >
        {t("wallet.nfts")}
      </Button>

      {inventoryView === "tokens" && (
        <>
          <span className="flex-1" />
          <Button
            variant={inventorySort === "value" ? "default" : "outline"}
            size="sm"
            className={`h-7 px-2.5 py-0.5 text-xs shadow-sm ${inventorySort === "value" ? "is-active" : ""}`}
            onClick={() => setState("inventorySort", "value")}
          >
            {t("wallet.value")}
          </Button>
          <Button
            variant={inventorySort === "chain" ? "default" : "outline"}
            size="sm"
            className={`h-7 px-2.5 py-0.5 text-xs shadow-sm ${inventorySort === "chain" ? "is-active" : ""}`}
            onClick={() => setState("inventorySort", "chain")}
          >
            {t("wallet.chain")}
          </Button>
          <Button
            variant={inventorySort === "symbol" ? "default" : "outline"}
            size="sm"
            className={`h-7 px-2.5 py-0.5 text-xs shadow-sm ${inventorySort === "symbol" ? "is-active" : ""}`}
            onClick={() => setState("inventorySort", "symbol")}
          >
            {t("wallet.name")}
          </Button>
        </>
      )}

      <Button
        variant="outline"
        size="sm"
        className="h-8 px-3 shadow-sm hover:border-accent hover:text-txt"
        onClick={() =>
          inventoryView === "tokens" ? loadBalances() : loadNfts()
        }
      >
        {t("appsview.Refresh")}
      </Button>
    </div>
  );
}
