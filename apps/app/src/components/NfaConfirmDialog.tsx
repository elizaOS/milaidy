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
  const hasDetails = Array.isArray(details) && details.length > 0;

  return (
    <div className="wt__confirm-backdrop">
      <div className="wt__confirm-modal nfa__confirm-modal">
        <div className="wt__confirm-title">{label.title}</div>
        {label.warning && (
          <div className="nfa__confirm-warning">
            {label.warning}
          </div>
        )}
        {hasDetails && (
          <div className="wt__confirm-message">
            {details!.map((d) => (
              <div key={d} className="nfa__confirm-detail">
                {d}
              </div>
            ))}
          </div>
        )}
        <div className="wt__confirm-actions">
          <button
            type="button"
            className="wt__btn wt__confirm-btn"
            disabled={busy}
            onClick={() => onResult(false)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="wt__btn wt__confirm-btn is-buy"
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
