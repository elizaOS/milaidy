import { Loader2 } from "lucide-react";
import * as React from "react";
import { jsx as _jsx } from "react/jsx-runtime";
import { cn } from "../../lib/utils";
export const Spinner = React.forwardRef(
  ({ className, size = 24, ...props }, ref) => {
    return _jsx(Loader2, {
      ref: ref,
      size: size,
      className: cn("animate-spin text-muted", className),
      ...props,
    });
  },
);
Spinner.displayName = "Spinner";
