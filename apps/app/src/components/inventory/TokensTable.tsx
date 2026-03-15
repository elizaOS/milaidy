/**
 * Token balance table with per-chain error notices.
 */

import type { EvmChainBalance } from "@milady/app-core/api";
import type { createTranslator } from "@milady/app-core/i18n";
import { chainIcon, formatBalance, type TokenRow } from "./constants";
import { TokenLogo } from "./TokenLogo";

export interface TokensTableProps {
  t: ReturnType<typeof createTranslator>;
  walletLoading: boolean;
  walletBalances: unknown;
  visibleRows: TokenRow[];
  visibleChainErrors: EvmChainBalance[];
  inventoryChainFocus: string;
  handleUntrackToken: (address: string) => void;
}

export function TokensTable({
  t,
  walletLoading,
  walletBalances,
  visibleRows,
  visibleChainErrors,
  inventoryChainFocus,
  handleUntrackToken,
}: TokensTableProps) {
  const renderChainErrors = () =>
    visibleChainErrors.length > 0 ? (
      <div className="mt-1 text-[11px] text-muted px-3 pb-2">
        {visibleChainErrors.map((chain: EvmChainBalance) => {
          const icon = chainIcon(chain.chain);
          return (
            <div key={chain.chain} className="py-0.5">
              <span
                className={`inline-block w-3 h-3 rounded-full text-center leading-3 text-[7px] font-bold font-mono text-white align-middle ${icon.cls}`}
              >
                {icon.code}
              </span>{" "}
              {chain.chain}:{" "}
              {chain.error?.includes("not enabled") ? (
                <>
                  data source not enabled &mdash;{" "}
                  <a
                    href="https://dashboard.alchemy.com/"
                    target="_blank"
                    rel="noopener"
                    className="text-txt"
                  >
                    {t("wallet.enableIt")}
                  </a>
                </>
              ) : (
                chain.error
              )}
            </div>
          );
        })}
      </div>
    ) : null;

  if (walletLoading) {
    return (
      <div className="text-center py-10 text-muted italic text-xs">
        {t("wallet.loadingBalances")}
      </div>
    );
  }

  if (visibleRows.length === 0) {
    return (
      <>
        <div className="text-center py-8 text-muted italic text-xs">
          {walletBalances
            ? t("wallet.noTokensFound")
            : t("wallet.noDataRefresh")}
        </div>
        {renderChainErrors()}
      </>
    );
  }

  return (
    <>
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-border">
            <th className="pl-3 pr-2 py-2 text-left w-12" />
            <th className="px-3 py-2 text-left text-[10px] text-muted font-bold uppercase tracking-wide">
              {t("wallet.table.token")}
            </th>
            <th className="px-3 py-2 text-right text-[10px] text-muted font-bold uppercase tracking-wide">
              {t("wallet.table.balance")}
            </th>
            <th className="px-3 py-2 text-right text-[10px] text-muted font-bold uppercase tracking-wide">
              {t("wallet.value")}
            </th>
            <th className="pl-3 pr-3 py-2 text-right w-24" />
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((row, idx) => {
            const contractAddress = row.contractAddress;
            return (
              <tr
                key={`${row.chain}-${row.symbol}-${idx}`}
                className="border-b border-border last:border-b-0 hover:bg-bg-hover transition-colors"
              >
                {/* Logo */}
                <td className="pl-3 pr-2 py-3 align-middle">
                  <TokenLogo
                    symbol={row.symbol}
                    chain={row.chain}
                    contractAddress={contractAddress}
                    preferredLogoUrl={row.logoUrl}
                    size={32}
                  />
                </td>
                {/* Symbol + name */}
                <td className="px-3 py-3 align-middle">
                  <div className="flex items-center gap-2">
                    <div>
                      <div className="text-sm font-bold font-mono leading-tight">
                        {row.symbol}
                      </div>
                      <div className="text-[10px] text-muted leading-tight mt-0.5">
                        {row.isNative ? (
                          <span className="text-[9px] bg-accent/15 text-accent px-1 py-0.5 rounded">
                            {t("tokenstable.nativeGas")}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1">
                            <span className="truncate max-w-[160px] inline-block">
                              {row.name}
                            </span>
                            {row.isTracked && (
                              <span className="text-[9px] bg-accent/15 text-accent px-1 py-0.5 rounded">
                                {t("wallet.manual")}
                              </span>
                            )}
                          </span>
                        )}
                      </div>
                    </div>
                    {inventoryChainFocus === "all" && (
                      <span className="text-[9px] text-muted font-mono border border-border px-1 py-0.5 rounded shrink-0">
                        {row.chain}
                      </span>
                    )}
                  </div>
                </td>
                {/* Balance */}
                <td className="px-3 py-3 align-middle font-mono text-sm text-right whitespace-nowrap">
                  {formatBalance(row.balance)}
                </td>
                {/* Value */}
                <td className="px-3 py-3 align-middle font-mono text-sm text-right text-muted whitespace-nowrap">
                  {row.valueUsd > 0
                    ? `$${row.valueUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                    : "\u2014"}
                </td>
                {/* Actions */}
                <td className="pl-2 pr-3 py-3 align-middle whitespace-nowrap text-right">
                  {row.isTracked && contractAddress && (
                    <button
                      type="button"
                      data-testid="wallet-token-untrack"
                      className="text-[10px] text-danger hover:underline cursor-pointer bg-transparent border-none p-0"
                      title={t("wallet.removeManualTitle")}
                      onClick={() => handleUntrackToken(contractAddress)}
                    >
                      {t("wallet.remove")}
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {renderChainErrors()}
    </>
  );
}
