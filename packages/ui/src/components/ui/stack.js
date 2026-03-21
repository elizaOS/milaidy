import { cva } from "class-variance-authority";
import * as React from "react";
import { jsx as _jsx } from "react/jsx-runtime";
import { cn } from "../../lib/utils";

const stackVariants = cva("flex", {
  variants: {
    direction: {
      row: "flex-row",
      col: "flex-col",
    },
    align: {
      start: "items-start",
      center: "items-center",
      end: "items-end",
      stretch: "items-stretch",
      baseline: "items-baseline",
    },
    justify: {
      start: "justify-start",
      center: "justify-center",
      end: "justify-end",
      between: "justify-between",
    },
    spacing: {
      none: "gap-0",
      sm: "gap-2",
      md: "gap-4",
      lg: "gap-6",
    },
  },
  defaultVariants: {
    direction: "col",
    spacing: "md",
  },
});
export const Stack = React.forwardRef(
  ({ className, direction, align, justify, spacing, ...props }, ref) => {
    return _jsx("div", {
      ref: ref,
      className: cn(
        stackVariants({ direction, align, justify, spacing }),
        className,
      ),
      ...props,
    });
  },
);
Stack.displayName = "Stack";
