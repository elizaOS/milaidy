/**
 * Truncated wallet address with a copy button.
 */

import { useState } from "react";

export function CopyableAddress({
  address,
  onCopy,
}: {
  address: string;
  onCopy: (text: string) => Promise<void>;
}) {
  const [copied, setCopied] = useState(false);
  const short = `${address.slice(0, 6)}...${address.slice(-4)}`;

  const handleCopy = async () => {
    await onCopy(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <code className="font-mono text-xs text-muted select-all" title={address}>
        {short}
      </code>
      <button
        type="button"
        onClick={handleCopy}
        className="px-1.5 py-0.5 border border-border bg-bg text-[10px] font-mono cursor-pointer hover:border-accent hover:text-accent transition-colors"
      >
        {copied ? "copied" : "copy"}
      </button>
    </div>
  );
}
