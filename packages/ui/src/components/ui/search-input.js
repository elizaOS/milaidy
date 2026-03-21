import { Search, X } from "lucide-react";
import * as React from "react";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { cn } from "../../lib/utils";
export const SearchInput = React.forwardRef(
  (
    {
      className,
      value,
      onClear,
      loading,
      clearLabel = "Clear search",
      ...props
    },
    ref,
  ) => {
    const hasValue = typeof value === "string" ? value.length > 0 : !!value;
    return _jsxs("div", {
      className: cn("relative flex items-center", className),
      children: [
        _jsx(Search, {
          className:
            "pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-muted",
        }),
        _jsx("input", {
          ref: ref,
          type: "text",
          value: value,
          className:
            "h-8 w-full rounded-md border border-input bg-bg pl-8 pr-8 text-xs placeholder:text-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          ...props,
        }),
        hasValue &&
          onClear &&
          _jsx("button", {
            type: "button",
            onClick: onClear,
            className:
              "absolute right-2 rounded-sm p-0.5 text-muted hover:text-txt transition-colors",
            "aria-label": clearLabel,
            children: _jsx(X, { className: "h-3 w-3" }),
          }),
        loading &&
          _jsx("div", {
            className:
              "absolute right-2 h-3 w-3 animate-spin rounded-full border-2 border-muted border-t-accent",
          }),
      ],
    });
  },
);
SearchInput.displayName = "SearchInput";
