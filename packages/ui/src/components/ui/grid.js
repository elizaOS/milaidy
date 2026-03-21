import { cva } from "class-variance-authority";
import * as React from "react";
import { jsx as _jsx } from "react/jsx-runtime";
import { cn } from "../../lib/utils";

const gridVariants = cva("grid", {
  variants: {
    columns: {
      1: "grid-cols-1",
      2: "grid-cols-2",
      3: "grid-cols-3",
      4: "grid-cols-4",
      6: "grid-cols-6",
      12: "grid-cols-12",
    },
    spacing: {
      none: "gap-0",
      sm: "gap-2",
      md: "gap-4",
      lg: "gap-6",
    },
  },
  defaultVariants: {
    columns: 1,
    spacing: "md",
  },
});
export const Grid = React.forwardRef(
  ({ className, columns, spacing, ...props }, ref) => {
    return _jsx("div", {
      ref: ref,
      className: cn(gridVariants({ columns, spacing }), className),
      ...props,
    });
  },
);
Grid.displayName = "Grid";
