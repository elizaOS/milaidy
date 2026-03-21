import * as React from "react";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { cn } from "../../lib/utils";

const STATUS_TONE_STYLES = {
  success: {
    badge: "text-ok border-ok/30 bg-ok/10",
    dot: "bg-ok",
  },
  warning: {
    badge: "text-warn border-warn/30 bg-warn/10",
    dot: "bg-warn",
  },
  danger: {
    badge: "text-destructive border-destructive/30 bg-destructive/10",
    dot: "bg-destructive",
  },
  muted: {
    badge: "text-muted border-border bg-bg",
    dot: "bg-muted",
  },
};
export function statusToneForBoolean(
  condition,
  onTone = "success",
  offTone = "muted",
) {
  return condition ? onTone : offTone;
}
export const StatusBadge = React.forwardRef(
  ({ label, tone, withDot = false, className, ...props }, ref) => {
    const styles = STATUS_TONE_STYLES[tone];
    return _jsxs("span", {
      ref: ref,
      className: cn(
        "inline-flex items-center gap-1 rounded-sm border px-2 py-0.5 text-[10px] font-bold uppercase",
        styles.badge,
        className,
      ),
      ...props,
      children: [
        withDot &&
          _jsx("span", {
            className: cn("h-1.5 w-1.5 rounded-full", styles.dot),
          }),
        label,
      ],
    });
  },
);
StatusBadge.displayName = "StatusBadge";
export const StatusDot = React.forwardRef(
  ({ status, className, ...props }, ref) => {
    const tone =
      status === "success" || status === "completed" || status === "connected"
        ? "success"
        : status === "error" || status === "failed" || status === "denied"
          ? "danger"
          : "muted";
    const styles = STATUS_TONE_STYLES[tone];
    return _jsx("span", {
      ref: ref,
      className: cn("inline-block h-2 w-2 rounded-full", styles.dot, className),
      ...props,
    });
  },
);
StatusDot.displayName = "StatusDot";
export const StatCard = React.forwardRef(
  ({ label, value, accent = false, className, ...props }, ref) =>
    _jsxs("div", {
      ref: ref,
      className: cn(
        "flex flex-col items-center justify-center border border-border bg-bg p-3 min-w-[80px]",
        className,
      ),
      ...props,
      children: [
        _jsx("div", {
          className: cn(
            "text-lg font-bold tabular-nums",
            accent && "text-accent",
          ),
          children: value,
        }),
        _jsx("div", {
          className: "mt-0.5 text-[10px] uppercase tracking-wide text-muted",
          children: label,
        }),
      ],
    }),
);
StatCard.displayName = "StatCard";
