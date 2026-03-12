/**
 * Branded confirmation modal to replace native window.confirm dialogs.
 *
 * Provides consistent styling, Escape-to-cancel keyboard handling,
 * and focus management.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

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

  const confirmBtnStyle: React.CSSProperties =
    tone === "danger"
      ? { background: "#ef4444", color: "#fff" }
      : tone === "warn"
        ? { background: "#f59e0b", color: "#fff" }
        : { background: "#f0b232", color: "#000" };

  const content = (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{
        zIndex: 10001,
        background: "rgba(5,7,12,0.95)",
        backdropFilter: "blur(24px)",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      tabIndex={-1}
    >
      <div
        className="rounded-xl max-w-md w-full mx-4 p-6"
        style={{
          background: "rgba(18, 22, 32, 0.96)",
          border: "1px solid rgba(240, 178, 50, 0.18)",
          backdropFilter: "blur(24px)",
          boxShadow:
            "0 8px 60px rgba(0,0,0,0.6), 0 0 40px rgba(240,178,50,0.06)",
        }}
      >
        <h2
          className="text-base font-bold mb-3"
          style={{ color: "rgba(240,238,250,0.92)" }}
        >
          {title}
        </h2>
        <p
          className="text-sm whitespace-pre-line mb-6"
          style={{ color: "rgba(255,255,255,0.45)" }}
        >
          {message}
        </p>
        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm rounded-md transition-colors cursor-pointer"
            style={{
              border: "1px solid rgba(255,255,255,0.1)",
              color: "rgba(255,255,255,0.6)",
              background: "transparent",
            }}
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            className="px-4 py-2 text-sm rounded-md transition-opacity font-medium cursor-pointer border-0"
            style={confirmBtnStyle}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );

  // Portal to body to escape any 3D transform stacking contexts (e.g. CompanionShell).
  // Skip portal in test environments where react-test-renderer can't handle real DOM portals.
  const canPortal =
    typeof document !== "undefined" &&
    document.body &&
    typeof document.body.appendChild === "function" &&
    !(globalThis as Record<string, unknown>).__TEST_RENDERER__;
  if (canPortal) {
    return createPortal(content, document.body);
  }
  return content;
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
