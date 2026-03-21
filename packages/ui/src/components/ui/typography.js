import { cva } from "class-variance-authority";
import * as React from "react";
import { jsx as _jsx } from "react/jsx-runtime";
import { cn } from "../../lib/utils";

const textVariants = cva("text-txt", {
  variants: {
    variant: {
      default: "text-base",
      medium: "text-sm",
      small: "text-xs",
      muted: "text-sm text-muted",
      lead: "text-xl text-muted",
      large: "text-lg font-semibold",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});
export const Text = React.forwardRef(
  ({ className, variant, asChild = false, ...props }, ref) => {
    const Comp = asChild ? "span" : "p";
    return _jsx(Comp, {
      ref: ref,
      className: cn(textVariants({ variant }), className),
      ...props,
    });
  },
);
Text.displayName = "Text";
const headingVariants = cva("text-txt font-semibold tracking-tight", {
  variants: {
    level: {
      h1: "text-4xl font-extrabold lg:text-5xl",
      h2: "text-3xl",
      h3: "text-2xl",
      h4: "text-xl",
      h5: "text-lg",
      h6: "text-base",
    },
  },
  defaultVariants: {
    level: "h1",
  },
});
export const Heading = React.forwardRef(
  ({ className, level = "h1", ...props }, ref) => {
    const Comp = level || "h1";
    return _jsx(Comp, {
      ref: ref,
      className: cn(headingVariants({ level }), className),
      ...props,
    });
  },
);
Heading.displayName = "Heading";
