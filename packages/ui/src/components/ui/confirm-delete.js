import * as React from "react";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { cn } from "../../lib/utils";
export function ConfirmDelete({
  onConfirm,
  disabled = false,
  triggerLabel = "Delete",
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  busyLabel,
  promptText = "Delete?",
  className,
}) {
  const [confirming, setConfirming] = React.useState(false);
  if (!confirming) {
    return _jsx("button", {
      type: "button",
      className: cn(
        "rounded-md border border-border px-2 py-1 text-xs text-muted transition-colors hover:border-destructive hover:text-destructive",
        className,
      ),
      onClick: () => setConfirming(true),
      disabled: disabled,
      children: triggerLabel,
    });
  }
  return _jsxs("span", {
    className: cn("inline-flex items-center gap-1.5", className),
    children: [
      _jsx("span", {
        className: "text-[11px] text-destructive",
        children: promptText,
      }),
      _jsx("button", {
        type: "button",
        className:
          "rounded-md border border-destructive bg-destructive px-2 py-0.5 text-[10px] font-medium text-destructive-fg transition-opacity hover:opacity-90 disabled:opacity-50",
        onClick: () => {
          onConfirm();
          setConfirming(false);
        },
        disabled: disabled,
        children: disabled && busyLabel ? busyLabel : confirmLabel,
      }),
      _jsx("button", {
        type: "button",
        className:
          "rounded-md border border-border px-2 py-0.5 text-[10px] text-muted transition-colors hover:border-accent hover:text-accent disabled:opacity-50",
        onClick: () => setConfirming(false),
        disabled: disabled,
        children: cancelLabel,
      }),
    ],
  });
}
