import { Check, Copy } from "lucide-react";
import * as React from "react";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { cn } from "../../lib/utils";
export const CopyButton = React.forwardRef(
  (
    {
      value,
      feedbackDuration = 2000,
      copyLabel = "Copy",
      copiedLabel = "Copied",
      className,
      children,
      ...props
    },
    ref,
  ) => {
    const [copied, setCopied] = React.useState(false);
    const handleCopy = React.useCallback(() => {
      void navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), feedbackDuration);
    }, [value, feedbackDuration]);
    return _jsxs("button", {
      ref: ref,
      type: "button",
      onClick: handleCopy,
      className: cn(
        "inline-flex items-center gap-1 rounded-md p-1.5 text-muted transition-colors hover:bg-bg-hover hover:text-txt",
        className,
      ),
      "aria-label": copied ? copiedLabel : copyLabel,
      ...props,
      children: [
        copied
          ? _jsx(Check, { className: "h-3.5 w-3.5 text-ok" })
          : _jsx(Copy, { className: "h-3.5 w-3.5" }),
        children,
      ],
    });
  },
);
CopyButton.displayName = "CopyButton";
