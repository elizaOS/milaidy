import * as React from "react";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { cn } from "../../lib/utils";
export const EmptyState = React.forwardRef(
  ({ icon, title, description, action, className, children, ...props }, ref) =>
    _jsxs("div", {
      ref: ref,
      className: cn(
        "flex flex-1 flex-col items-center justify-center p-6 text-center",
        className,
      ),
      ...props,
      children: [
        icon &&
          _jsx("div", {
            className:
              "mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/10 text-accent",
            children: icon,
          }),
        _jsx("h3", {
          className: "mb-2 text-lg font-semibold",
          children: title,
        }),
        description &&
          _jsx("p", {
            className: "mb-6 max-w-sm text-sm text-muted",
            children: description,
          }),
        action,
        children,
      ],
    }),
);
EmptyState.displayName = "EmptyState";
