/**
 * NfaConfirmDialog — confirmation modal for NFA operations.
 * Uses the same visual language as wallet trade confirmation.
 */

import { useState } from "react";

export type NfaOperation =
  | "mint"
  | "anchor"
  | "transfer"
  | "upgrade-logic"
  | "pause"
  | "unpause";

interface NfaConfirmDialogProps {
  operation: NfaOperation;
  /** Extra detail lines shown in the dialog body. */
  details?: string[];
  /** Called with true on confirm, false on cancel. */
  onResult: (confirmed: boolean) => void;
}

const OP_LABELS: Record<NfaOperation, { title: string; warning?: string }> = {
  mint: { title: "Mint NFA" },
  anchor: { title: "Anchor Learnings" },
  transfer: {
    title: "Transfer NFA",
    warning: "IRREVERSIBLE. The new owner will control your on-chain identity.",
  },
  "upgrade-logic": {
    title: "Upgrade Logic Contract",
    warning: "This changes the on-chain behavior of your NFA.",
  },
  pause: { title: "Pause NFA" },
  unpause: { title: "Unpause NFA" },
};

export function NfaConfirmDialog({
  operation,
  details,
  onResult,
}: NfaConfirmDialogProps) {
  const [busy, setBusy] = useState(false);
  const label = OP_LABELS[operation];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="border border-border bg-bg p-5 max-w-sm w-full space-y-3">
        <div className="text-sm font-bold">{label.title}</div>
        {label.warning && (
          <div className="px-3 py-2 border border-danger bg-danger/5 text-[11px] text-danger">
            {label.warning}
          </div>
        )}
        {details?.map((d) => (
          <div key={d} className="text-xs text-muted font-mono truncate">
            {d}
          </div>
        ))}
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            className="wt__btn flex-1"
            disabled={busy}
            onClick={() => onResult(false)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="wt__btn is-buy flex-1"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              onResult(true);
            }}
          >
            {busy ? "Sending..." : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}
