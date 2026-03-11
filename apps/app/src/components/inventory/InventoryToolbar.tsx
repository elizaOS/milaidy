/**
 * Toolbar: tokens/NFTs tabs, chain-focus chips, sort controls, refresh.
 */

import type { createTranslator } from "@milady/app-core/i18n";
import { Button } from "@milady/ui";
import type { AppState } from "../../AppContext";
import { CHAIN_CONFIGS, PRIMARY_CHAIN_KEYS } from "../chainConfig";

type InventoryToolbarStateKey =
  | "inventoryView"
  | "inventorySort"
  | "inventoryChainFocus";

export interface InventoryToolbarProps {
  t: ReturnType<typeof createTranslator>;
  inventoryView: "tokens" | "nfts";
  inventorySort: string;
  inventoryChainFocus: string;
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
  inventoryChainFocus,
  walletBalances,
  walletNfts,
  setState,
  loadBalances,
  loadNfts,
}: InventoryToolbarProps) {
  return (
    <div className="wt__toolbar">
      <Button
        variant={inventoryView === "tokens" ? "default" : "ghost"}
        size="sm"
        className={`wt__tab h-9 px-4 rounded-none ${inventoryView === "tokens" ? "is-active" : ""}`}
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
        className={`wt__tab h-9 px-4 rounded-none ${inventoryView === "nfts" ? "is-active" : ""}`}
        onClick={() => {
          setState("inventoryView", "nfts");
          if (!walletNfts) void loadNfts();
        }}
      >
        {t("wallet.nfts")}
      </Button>

      {inventoryView === "tokens" && (
        <>
          <span className="wt__sep" />
          {PRIMARY_CHAIN_KEYS.map((key) => {
            const config = CHAIN_CONFIGS[key];
            return (
              <Button
                key={key}
                variant={inventoryChainFocus === key ? "default" : "outline"}
                size="sm"
                data-testid={`wallet-focus-${key}`}
                className={`wt__chip h-7 px-2.5 py-0.5 text-xs shadow-sm ${inventoryChainFocus === key ? "is-active" : ""}`}
                onClick={() => setState("inventoryChainFocus", key)}
              >
                {config.name}
              </Button>
            );
          })}
          <Button
            variant={inventoryChainFocus === "all" ? "default" : "outline"}
            size="sm"
            data-testid="wallet-focus-all"
            className={`wt__chip h-7 px-2.5 py-0.5 text-xs shadow-sm ${inventoryChainFocus === "all" ? "is-active" : ""}`}
            onClick={() => setState("inventoryChainFocus", "all")}
          >
            {t("wallet.all")}
          </Button>

          <span className="flex-1" />

          <span className="text-[10px] text-muted font-mono">
            {t("wallet.sort")}:
          </span>
          <Button
            variant={inventorySort === "value" ? "default" : "outline"}
            size="sm"
            className={`wt__chip h-7 px-2.5 py-0.5 text-xs shadow-sm ${inventorySort === "value" ? "is-active" : ""}`}
            onClick={() => setState("inventorySort", "value")}
          >
            {t("wallet.value")}
          </Button>
          <Button
            variant={inventorySort === "chain" ? "default" : "outline"}
            size="sm"
            className={`wt__chip h-7 px-2.5 py-0.5 text-xs shadow-sm ${inventorySort === "chain" ? "is-active" : ""}`}
            onClick={() => setState("inventorySort", "chain")}
          >
            {t("wallet.chain")}
          </Button>
          <Button
            variant={inventorySort === "symbol" ? "default" : "outline"}
            size="sm"
            className={`wt__chip h-7 px-2.5 py-0.5 text-xs shadow-sm ${inventorySort === "symbol" ? "is-active" : ""}`}
            onClick={() => setState("inventorySort", "symbol")}
          >
            {t("wallet.name")}
          </Button>
        </>
      )}

      <Button
        variant="outline"
        size="sm"
        className="wt__refresh h-8 px-3 shadow-sm hover:border-accent hover:text-accent"
        onClick={() =>
          inventoryView === "tokens" ? loadBalances() : loadNfts()
        }
      >
        {t("inventorytoolbar.Refresh")}
      </Button>
    </div>
  );
}
