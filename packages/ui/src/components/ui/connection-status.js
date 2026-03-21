import * as React from "react";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { cn } from "../../lib/utils";

const STATE_STYLES = {
  connected: {
    dot: "bg-ok",
    text: "text-txt",
    label: "Connected",
  },
  disconnected: {
    dot: "bg-muted",
    text: "text-muted",
    label: "Disconnected",
  },
  error: {
    dot: "bg-destructive",
    text: "text-destructive",
    label: "Error",
  },
};
export const ConnectionStatus = React.forwardRef(
  ({ state, label, className, ...props }, ref) => {
    const styles = STATE_STYLES[state];
    return _jsxs("div", {
      ref: ref,
      className: cn(
        "inline-flex items-center gap-2 rounded-md border border-border bg-bg-accent px-3 py-1.5 text-xs",
        styles.text,
        className,
      ),
      ...props,
      children: [
        _jsx("span", { className: cn("h-2 w-2 rounded-full", styles.dot) }),
        label ?? styles.label,
      ],
    });
  },
);
ConnectionStatus.displayName = "ConnectionStatus";
