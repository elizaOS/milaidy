import { useCallback, useState } from "react";

interface WalletSummaryProps {
  evmAddress: string | null;
  solanaAddress: string | null;
  evmBalance: string | null;
  solanaBalance: string | null;
}

function truncateAddress(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function AddressRow({
  label,
  address,
  balance,
}: {
  label: string;
  address: string;
  balance: string | null;
}) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(() => {
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [address]);

  return (
    <div className="flex items-center justify-between py-2">
      <div className="space-y-0.5">
        <div className="text-xs text-[var(--muted)]">{label}</div>
        <button
          onClick={copy}
          className="text-xs font-mono text-[var(--text)] hover:text-[var(--accent)] cursor-pointer"
          title="Copy address"
        >
          {truncateAddress(address)} {copied ? "\u2713" : ""}
        </button>
      </div>
      {balance && (
        <span className="text-sm font-medium text-[var(--text)]">
          {balance}
        </span>
      )}
    </div>
  );
}

export function WalletSummary({
  evmAddress,
  solanaAddress,
  evmBalance,
  solanaBalance,
}: WalletSummaryProps) {
  if (!evmAddress && !solanaAddress) return null;

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-[var(--muted)] mb-2">
        Wallets
      </div>
      <div className="divide-y divide-[var(--border)]">
        {evmAddress && (
          <AddressRow label="EVM" address={evmAddress} balance={evmBalance} />
        )}
        {solanaAddress && (
          <AddressRow
            label="Solana"
            address={solanaAddress}
            balance={solanaBalance}
          />
        )}
      </div>
    </div>
  );
}
