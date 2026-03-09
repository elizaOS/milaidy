/**
 * NfaConfirmDialog — confirmation modal for NFA operations.
 * Uses the same visual language as wallet trade confirmation.
 */

import { createPortal } from "react-dom";

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
  /** Optional text input label for operations that require an address. */
  inputLabel?: string;
  /** Controlled input value from parent state. */
  inputValue?: string;
  /** Placeholder text for the optional input field. */
  inputPlaceholder?: string;
  /** Optional inline validation message tied to the input field. */
  inputError?: string | null;
  /** Called when the optional input field changes. */
  onInputChange?: (value: string) => void;
  /** Controlled loading state from parent operation handler. */
  busy?: boolean;
  /** Optional inline error message shown in dialog body. */
  errorMessage?: string | null;
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
  inputLabel,
  inputValue,
  inputPlaceholder,
  inputError,
  onInputChange,
  busy = false,
  errorMessage,
  onResult,
}: NfaConfirmDialogProps) {
  const label = OP_LABELS[operation];
  const detailLines = Array.isArray(details) ? details : [];
  const hasDetails = detailLines.length > 0;
  const showInput = typeof onInputChange === "function";
  const dialog = (
    <div className="wt__confirm-backdrop">
      <div className="wt__confirm-modal nfa__confirm-modal">
        <div className="wt__confirm-title">{label.title}</div>
        {label.warning && (
          <div className="nfa__confirm-warning">{label.warning}</div>
        )}
        {errorMessage ? (
          <div className="nfa__confirm-error" role="alert">
            {errorMessage}
          </div>
        ) : null}
        {hasDetails && (
          <div className="wt__confirm-message">
            {detailLines.map((d) => (
              <div key={d} className="nfa__confirm-detail">
                {d}
              </div>
            ))}
          </div>
        )}
        {showInput ? (
          <label className="nfa__confirm-input-shell">
            <span className="nfa__confirm-input-label">
              {inputLabel ?? "Address"}
            </span>
            <input
              type="text"
              className="nfa__confirm-input"
              value={inputValue ?? ""}
              placeholder={inputPlaceholder}
              aria-label={inputLabel ?? "Address"}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              onChange={(event) => onInputChange(event.target.value)}
            />
          </label>
        ) : null}
        {inputError ? (
          <div className="nfa__confirm-error" role="alert">
            {inputError}
          </div>
        ) : null}
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
            onClick={() => onResult(true)}
          >
            {busy ? "Sending..." : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") {
    return dialog;
  }

  return createPortal(dialog, document.body);
}
