import * as React from "react";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { cn } from "../../lib/utils";

const TONE_STYLES = {
  danger: "bg-destructive text-destructive-fg hover:opacity-90",
  warn: "bg-warn text-white hover:opacity-90",
  default: "bg-primary text-primary-fg hover:opacity-90",
};
export function ConfirmDialog({
  open,
  title = "Confirm",
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "default",
  onConfirm,
  onCancel,
}) {
  const confirmRef = React.useRef(null);
  React.useEffect(() => {
    if (open) {
      const t = setTimeout(() => confirmRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [open]);
  const handleKeyDown = React.useCallback(
    (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    },
    [onCancel],
  );
  if (!open) return null;
  return _jsx("div", {
    className: "fixed inset-0 flex items-center justify-center bg-black/40",
    style: { zIndex: 10001 },
    onClick: (e) => {
      if (e.target === e.currentTarget) onCancel();
    },
    onKeyDown: handleKeyDown,
    role: "dialog",
    "aria-modal": "true",
    "aria-label": title,
    tabIndex: -1,
    children: _jsxs("div", {
      className:
        "mx-4 w-full max-w-md rounded-lg border border-border bg-bg p-6 shadow-2xl",
      children: [
        _jsx("h2", { className: "mb-3 text-base font-bold", children: title }),
        _jsx("p", {
          className: "mb-6 whitespace-pre-line text-sm text-muted",
          children: message,
        }),
        _jsxs("div", {
          className: "flex items-center justify-end gap-3",
          children: [
            _jsx("button", {
              type: "button",
              onClick: onCancel,
              className:
                "rounded-md border border-border px-4 py-2 text-sm transition-colors hover:bg-bg-hover",
              children: cancelLabel,
            }),
            _jsx("button", {
              ref: confirmRef,
              type: "button",
              onClick: onConfirm,
              className: cn(
                "rounded-md px-4 py-2 text-sm font-medium transition-opacity",
                TONE_STYLES[tone],
              ),
              children: confirmLabel,
            }),
          ],
        }),
      ],
    }),
  });
}
export function useConfirm() {
  const [state, setState] = React.useState(null);
  const confirm = React.useCallback(
    (opts) =>
      new Promise((resolve) => {
        setState({ opts, resolve });
      }),
    [],
  );
  const modalProps = state
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
