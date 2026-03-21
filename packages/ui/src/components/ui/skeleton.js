import * as React from "react";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { cn } from "../../lib/utils";

const Skeleton = React.forwardRef(({ className, ...props }, ref) =>
  _jsx("div", {
    ref: ref,
    className: cn("animate-pulse rounded-md bg-bg-accent", className),
    ...props,
  }),
);
Skeleton.displayName = "Skeleton";
/* ── Skeleton Variants ───────────────────────────────────────────────── */
function SkeletonLine({ width = "100%", className = "" }) {
  return _jsx("div", {
    className: cn("h-4 animate-pulse rounded bg-bg-accent", className),
    style: { width },
  });
}
function SkeletonText({ lines = 3 }) {
  return _jsx("div", {
    className: "space-y-2",
    children: Array.from({ length: lines }, (_, i) => i).map((lineIndex) =>
      _jsx(
        SkeletonLine,
        { width: lineIndex === lines - 1 ? "60%" : "100%" },
        lineIndex,
      ),
    ),
  });
}
function SkeletonMessage({ isUser = false }) {
  return _jsxs("div", {
    className: cn(
      "flex items-start gap-3 mt-4",
      isUser ? "justify-end" : "justify-start",
    ),
    children: [
      !isUser &&
        _jsx("div", {
          className: "h-8 w-8 shrink-0 animate-pulse rounded-full bg-bg-accent",
        }),
      _jsxs("div", {
        className: cn("max-w-[80%] space-y-2", isUser && "items-end"),
        children: [
          _jsx("div", {
            className: "h-3 w-20 animate-pulse rounded bg-bg-accent",
          }),
          _jsx("div", {
            className:
              "min-w-[200px] animate-pulse rounded-2xl bg-bg-accent px-4 py-3",
            children: _jsx(SkeletonText, { lines: 2 }),
          }),
        ],
      }),
    ],
  });
}
function SkeletonCard() {
  return _jsxs("div", {
    className: "space-y-4 rounded-lg border border-border bg-card p-4",
    children: [
      _jsxs("div", {
        className: "flex items-center gap-3",
        children: [
          _jsx("div", {
            className: "h-10 w-10 animate-pulse rounded-lg bg-bg-accent",
          }),
          _jsxs("div", {
            className: "flex-1 space-y-2",
            children: [
              _jsx(SkeletonLine, { width: "40%" }),
              _jsx(SkeletonLine, { width: "60%" }),
            ],
          }),
        ],
      }),
      _jsx(SkeletonText, { lines: 3 }),
    ],
  });
}
function SkeletonSidebar() {
  return _jsxs("div", {
    className: "w-64 space-y-2 p-4",
    children: [
      _jsx("div", {
        className: "mb-6 h-8 w-32 animate-pulse rounded bg-bg-accent",
      }),
      Array.from({ length: 6 }, (_, idx) => idx).map((i) =>
        _jsxs(
          "div",
          {
            className: "flex items-center gap-3 p-2",
            children: [
              _jsx("div", {
                className: "h-5 w-5 animate-pulse rounded bg-bg-accent",
              }),
              _jsx("div", {
                className: "h-4 flex-1 animate-pulse rounded bg-bg-accent",
              }),
            ],
          },
          i,
        ),
      ),
    ],
  });
}
function SkeletonChat() {
  return _jsxs("div", {
    className: "space-y-2 p-4",
    children: [
      _jsx(SkeletonMessage, {}),
      _jsx(SkeletonMessage, { isUser: true }),
      _jsx(SkeletonMessage, {}),
    ],
  });
}

export {
  Skeleton,
  SkeletonCard,
  SkeletonChat,
  SkeletonLine,
  SkeletonMessage,
  SkeletonSidebar,
  SkeletonText,
};
