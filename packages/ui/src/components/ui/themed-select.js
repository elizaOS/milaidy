/**
 * ThemedSelect — custom dropdown with grouped options.
 *
 * A generic, fully-controlled select component that supports grouped option
 * lists and optional hint text per item. Has no dependency on any app-level
 * context; all state is passed in as props.
 */
import { useEffect, useRef, useState } from "react";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Button } from "./button";
export function ThemedSelect({
  value,
  groups,
  onChange,
  placeholder = "select...",
  menuPlacement = "bottom",
  className = "",
  triggerClassName = "",
  menuClassName = "",
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);
  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);
  // Find current label
  let currentLabel = placeholder;
  for (const g of groups) {
    const found = g.items.find((i) => i.id === value);
    if (found) {
      currentLabel = found.hint ? `${found.text} — ${found.hint}` : found.text;
      break;
    }
  }
  const menuStyle =
    menuPlacement === "top"
      ? { bottom: "calc(100% + 0.125rem)" }
      : { top: "calc(100% + 0.125rem)" };
  return _jsxs("div", {
    ref: ref,
    className: `relative min-w-0 w-full ${open ? "z-[100]" : ""} ${className}`,
    children: [
      _jsxs(Button, {
        type: "button",
        variant: "outline",
        size: "sm",
        className: `flex h-12 w-full items-center justify-between border-border bg-card px-2.5 py-1.5 text-left text-xs shadow-sm hover:border-accent focus-visible:ring-1 focus-visible:ring-accent ${triggerClassName}`,
        onClick: () => setOpen(!open),
        children: [
          _jsx("span", { className: "truncate", children: currentLabel }),
          _jsx("span", {
            className: `ml-2 text-[10px] text-muted transition-transform ${open ? "rotate-180" : ""}`,
            children: "\u25BC",
          }),
        ],
      }),
      open &&
        _jsx("div", {
          className: `absolute left-0 right-0 z-50 max-h-[280px] overflow-y-auto rounded-md border border-border bg-card shadow-lg ${menuClassName}`,
          style: menuStyle,
          children: groups.map((g) =>
            _jsxs(
              "div",
              {
                children: [
                  _jsx("div", {
                    className:
                      "px-2.5 py-1 text-[10px] font-semibold text-muted bg-bg-accent sticky top-0",
                    children: g.label,
                  }),
                  g.items.map((item) => {
                    const active = item.id === value;
                    return _jsxs(
                      Button,
                      {
                        variant: "ghost",
                        size: "sm",
                        className: `w-full justify-start text-left px-2.5 py-1.5 h-auto text-xs rounded-none ${
                          active
                            ? "bg-accent/20 text-accent"
                            : "text-txt hover:bg-accent/10 hover:text-txt"
                        }`,
                        onClick: () => {
                          onChange(item.id);
                          setOpen(false);
                        },
                        children: [
                          _jsx("span", {
                            className: "font-semibold",
                            children: item.text,
                          }),
                          item.hint &&
                            _jsx("span", {
                              className: `ml-1.5 ${active ? "opacity-70" : "text-muted"}`,
                              children: item.hint,
                            }),
                        ],
                      },
                      item.id,
                    );
                  }),
                ],
              },
              g.label,
            ),
          ),
        }),
    ],
  });
}
