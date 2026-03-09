/**
 * Branded confirmation modal to replace native window.confirm dialogs.
 *
 * Provides consistent styling, keyboard handling (Enter to confirm,
 * Escape to cancel), and focus management.
 */

import { useCallback, useEffect, useRef, useState } from "react";

export interface ConfirmModalProps {
  open: boolean;
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "warn" | "default";
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  open,
  title = "Confirm",
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "default",
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) {
      const t = setTimeout(() => confirmRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [open]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    },
    [onCancel],
  );

  if (!open) return null;

  const confirmBtnClass =
    tone === "danger"
      ? "bg-danger text-white hover:opacity-90"
      : tone === "warn"
        ? "bg-warn text-white hover:opacity-90"
        : "bg-accent text-accent-fg hover:opacity-90";

  return (
    <div
      className="fixed inset-0 bg-black/40 z-[10001] flex items-center justify-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      tabIndex={-1}
    >
      <div className="bg-bg border border-border rounded-lg shadow-2xl max-w-md w-full mx-4 p-6">
        <h2 className="text-base font-bold text-txt-strong mb-3">{title}</h2>
        <p className="text-sm text-muted whitespace-pre-line mb-6">{message}</p>
        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm border border-border rounded-md hover:bg-bg-hover transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            className={`px-4 py-2 text-sm rounded-md transition-opacity font-medium ${confirmBtnClass}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Hook providing an async confirm() that manages <ConfirmModal> state.
 *
 * Usage:
 *   const { confirm, modalProps } = useConfirm();
 *   const ok = await confirm({ message: "Delete?" });
 *   // render <ConfirmModal {...modalProps} /> somewhere in JSX
 */
export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "warn" | "default";
}

export function useConfirm() {
  const [state, setState] = useState<{
    opts: ConfirmOptions;
    resolve: (v: boolean) => void;
  } | null>(null);

  const confirm = useCallback(
    (opts: ConfirmOptions): Promise<boolean> =>
      new Promise((resolve) => {
        setState({ opts, resolve });
      }),
    [],
  );

  const modalProps: ConfirmModalProps = state
    ? {
        open: true,
        ...state.opts,
        onConfirm: () => {
          state.resolve(true);
          setState(null);
        },
        onCancel: () => {
          state.resolve(false);
          setState(null);
        },
      }
    : {
        open: false,
        message: "",
        onConfirm: () => {},
        onCancel: () => {},
      };

  return { confirm, modalProps };
}
