import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import * as React from "react";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { cn } from "../../lib/utils";

const Select = SelectPrimitive.Root;
const SelectGroup = SelectPrimitive.Group;
const SelectValue = SelectPrimitive.Value;
const SelectTrigger = React.forwardRef(
  ({ className, children, ...props }, ref) =>
    _jsxs(SelectPrimitive.Trigger, {
      ref: ref,
      className: cn(
        "flex h-10 w-full items-center justify-between rounded-md border border-input bg-bg px-3 py-2 text-sm ring-offset-bg placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1",
        className,
      ),
      ...props,
      children: [
        children,
        _jsx(SelectPrimitive.Icon, {
          asChild: true,
          children: _jsx(ChevronDown, { className: "h-4 w-4 opacity-50" }),
        }),
      ],
    }),
);
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName;
const SelectScrollUpButton = React.forwardRef(({ className, ...props }, ref) =>
  _jsx(SelectPrimitive.ScrollUpButton, {
    ref: ref,
    className: cn(
      "flex cursor-default items-center justify-center py-1",
      className,
    ),
    ...props,
    children: _jsx(ChevronUp, { className: "h-4 w-4" }),
  }),
);
SelectScrollUpButton.displayName = SelectPrimitive.ScrollUpButton.displayName;
const SelectScrollDownButton = React.forwardRef(
  ({ className, ...props }, ref) =>
    _jsx(SelectPrimitive.ScrollDownButton, {
      ref: ref,
      className: cn(
        "flex cursor-default items-center justify-center py-1",
        className,
      ),
      ...props,
      children: _jsx(ChevronDown, { className: "h-4 w-4" }),
    }),
);
SelectScrollDownButton.displayName =
  SelectPrimitive.ScrollDownButton.displayName;
const SelectContent = React.forwardRef(
  ({ className, children, position = "popper", ...props }, ref) =>
    _jsx(SelectPrimitive.Portal, {
      children: _jsxs(SelectPrimitive.Content, {
        ref: ref,
        className: cn(
          "relative z-50 max-h-96 min-w-[8rem] overflow-hidden rounded-md border border-border bg-card text-txt shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
          position === "popper" &&
            "data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1",
          className,
        ),
        position: position,
        ...props,
        children: [
          _jsx(SelectScrollUpButton, {}),
          _jsx(SelectPrimitive.Viewport, {
            className: cn(
              "p-1",
              position === "popper" &&
                "h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)]",
            ),
            children: children,
          }),
          _jsx(SelectScrollDownButton, {}),
        ],
      }),
    }),
);
SelectContent.displayName = SelectPrimitive.Content.displayName;
const SelectLabel = React.forwardRef(({ className, ...props }, ref) =>
  _jsx(SelectPrimitive.Label, {
    ref: ref,
    className: cn("py-1.5 pl-8 pr-2 text-sm font-semibold", className),
    ...props,
  }),
);
SelectLabel.displayName = SelectPrimitive.Label.displayName;
const SelectItem = React.forwardRef(({ className, children, ...props }, ref) =>
  _jsxs(SelectPrimitive.Item, {
    ref: ref,
    className: cn(
      "relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-accent focus:text-accent-fg data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
      className,
    ),
    ...props,
    children: [
      _jsx("span", {
        className:
          "absolute left-2 flex h-3.5 w-3.5 items-center justify-center",
        children: _jsx(SelectPrimitive.ItemIndicator, {
          children: _jsx(Check, { className: "h-4 w-4" }),
        }),
      }),
      _jsx(SelectPrimitive.ItemText, { children: children }),
    ],
  }),
);
SelectItem.displayName = SelectPrimitive.Item.displayName;
const SelectSeparator = React.forwardRef(({ className, ...props }, ref) =>
  _jsx(SelectPrimitive.Separator, {
    ref: ref,
    className: cn("-mx-1 my-1 h-px bg-muted", className),
    ...props,
  }),
);
SelectSeparator.displayName = SelectPrimitive.Separator.displayName;

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
};
