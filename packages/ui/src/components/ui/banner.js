import { cva } from "class-variance-authority";
import { AlertTriangle, Info, X, XCircle } from "lucide-react";
import * as React from "react";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { cn } from "../../lib/utils";

const bannerVariants = cva(
  "flex items-center gap-3 border px-4 py-2.5 text-xs",
  {
    variants: {
      variant: {
        error: "border-destructive/30 bg-destructive/10 text-destructive",
        warning: "border-warn/30 bg-warn/10 text-warn",
        info: "border-accent/30 bg-accent/10 text-accent",
      },
    },
    defaultVariants: {
      variant: "info",
    },
  },
);
const ICONS = {
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
};
export const Banner = React.forwardRef(
  (
    {
      variant = "info",
      action,
      dismissible,
      onDismiss,
      dismissLabel = "Dismiss",
      className,
      children,
      ...props
    },
    ref,
  ) => {
    const Icon = ICONS[variant ?? "info"];
    return _jsxs("div", {
      ref: ref,
      className: cn(bannerVariants({ variant }), className),
      role: "alert",
      ...props,
      children: [
        _jsx(Icon, { className: "h-4 w-4 shrink-0" }),
        _jsx("span", { className: "flex-1", children: children }),
        action,
        dismissible &&
          _jsx("button", {
            type: "button",
            onClick: onDismiss,
            className:
              "rounded-sm p-0.5 opacity-70 hover:opacity-100 transition-opacity",
            "aria-label": dismissLabel,
            children: _jsx(X, { className: "h-3.5 w-3.5" }),
          }),
      ],
    });
  },
);
Banner.displayName = "Banner";
