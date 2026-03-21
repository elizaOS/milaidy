import * as React from "react";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { cn } from "../../lib/utils";
export const SectionCard = React.forwardRef(
  (
    {
      title,
      description,
      actions,
      collapsible = false,
      defaultCollapsed = false,
      className,
      children,
      ...props
    },
    ref,
  ) => {
    const [collapsed, setCollapsed] = React.useState(defaultCollapsed);
    return _jsxs("div", {
      ref: ref,
      className: cn("border border-border bg-card text-card-fg", className),
      ...props,
      children: [
        (title || actions) &&
          _jsxs("div", {
            className:
              "flex items-center justify-between border-b border-border px-4 py-4",
            children: [
              _jsxs("div", {
                className: "flex flex-col gap-1.5",
                children: [
                  title &&
                    _jsxs("button", {
                      type: "button",
                      className: cn(
                        "text-sm font-semibold text-left",
                        collapsible &&
                          "cursor-pointer hover:text-accent transition-colors",
                        !collapsible && "cursor-default",
                      ),
                      onClick: collapsible
                        ? () => setCollapsed((c) => !c)
                        : undefined,
                      tabIndex: collapsible ? 0 : -1,
                      children: [
                        collapsible &&
                          _jsx("span", {
                            className: cn(
                              "mr-1.5 inline-block text-[10px] text-muted transition-transform",
                              !collapsed && "rotate-90",
                            ),
                            children: "\u25B6",
                          }),
                        title,
                      ],
                    }),
                  description &&
                    _jsx("span", {
                      className: "text-[11px] text-muted",
                      children: description,
                    }),
                ],
              }),
              actions &&
                _jsx("div", {
                  className: "flex items-center gap-2",
                  children: actions,
                }),
            ],
          }),
        (!collapsible || !collapsed) &&
          _jsx("div", { className: "p-4", children: children }),
      ],
    });
  },
);
SectionCard.displayName = "SectionCard";
