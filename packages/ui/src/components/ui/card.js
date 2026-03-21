import * as React from "react";
import { jsx as _jsx } from "react/jsx-runtime";
import { cn } from "../../lib/utils";

const Card = React.forwardRef(({ className, ...props }, ref) =>
  _jsx("div", {
    ref: ref,
    className: cn(
      "rounded-xl border border-border bg-card text-card-fg shadow-sm",
      className,
    ),
    ...props,
  }),
);
Card.displayName = "Card";
const CardHeader = React.forwardRef(({ className, ...props }, ref) =>
  _jsx("div", {
    ref: ref,
    className: cn("flex flex-col space-y-1.5 p-6", className),
    ...props,
  }),
);
CardHeader.displayName = "CardHeader";
const CardTitle = React.forwardRef(({ className, ...props }, ref) =>
  _jsx("h3", {
    ref: ref,
    className: cn("font-semibold leading-none tracking-tight", className),
    ...props,
  }),
);
CardTitle.displayName = "CardTitle";
const CardDescription = React.forwardRef(({ className, ...props }, ref) =>
  _jsx("p", {
    ref: ref,
    className: cn("text-sm text-muted", className),
    ...props,
  }),
);
CardDescription.displayName = "CardDescription";
const CardContent = React.forwardRef(({ className, ...props }, ref) =>
  _jsx("div", { ref: ref, className: cn("p-6 pt-0", className), ...props }),
);
CardContent.displayName = "CardContent";
const CardFooter = React.forwardRef(({ className, ...props }, ref) =>
  _jsx("div", {
    ref: ref,
    className: cn("flex items-center p-6 pt-0", className),
    ...props,
  }),
);
CardFooter.displayName = "CardFooter";

export {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
};
