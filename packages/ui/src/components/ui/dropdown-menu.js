import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { Check, ChevronRight, Circle } from "lucide-react";
import * as React from "react";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { cn } from "../../lib/utils";

const DropdownMenu = DropdownMenuPrimitive.Root;
const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
const DropdownMenuGroup = DropdownMenuPrimitive.Group;
const DropdownMenuPortal = DropdownMenuPrimitive.Portal;
const DropdownMenuSub = DropdownMenuPrimitive.Sub;
const DropdownMenuRadioGroup = DropdownMenuPrimitive.RadioGroup;
const DropdownMenuSubTrigger = React.forwardRef(
  ({ className, inset, children, ...props }, ref) =>
    _jsxs(DropdownMenuPrimitive.SubTrigger, {
      ref: ref,
      className: cn(
        "flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none focus:bg-accent focus:text-accent-fg data-[state=open]:bg-accent data-[state=open]:text-accent-fg",
        inset && "pl-8",
        className,
      ),
      ...props,
      children: [
        children,
        _jsx(ChevronRight, { className: "ml-auto h-4 w-4" }),
      ],
    }),
);
DropdownMenuSubTrigger.displayName =
  DropdownMenuPrimitive.SubTrigger.displayName;
const DropdownMenuSubContent = React.forwardRef(
  ({ className, ...props }, ref) =>
    _jsx(DropdownMenuPrimitive.SubContent, {
      ref: ref,
      className: cn(
        "z-50 min-w-[8rem] overflow-hidden rounded-md border border-border bg-card p-1 text-txt shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
        className,
      ),
      ...props,
    }),
);
DropdownMenuSubContent.displayName =
  DropdownMenuPrimitive.SubContent.displayName;
const DropdownMenuContent = React.forwardRef(
  ({ className, sideOffset = 4, ...props }, ref) =>
    _jsx(DropdownMenuPrimitive.Portal, {
      children: _jsx(DropdownMenuPrimitive.Content, {
        ref: ref,
        sideOffset: sideOffset,
        className: cn(
          "z-50 min-w-[8rem] overflow-hidden rounded-md border border-border bg-card p-1 text-txt shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
          className,
        ),
        ...props,
      }),
    }),
);
DropdownMenuContent.displayName = DropdownMenuPrimitive.Content.displayName;
const DropdownMenuItem = React.forwardRef(
  ({ className, inset, ...props }, ref) =>
    _jsx(DropdownMenuPrimitive.Item, {
      ref: ref,
      className: cn(
        "relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-fg data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        inset && "pl-8",
        className,
      ),
      ...props,
    }),
);
DropdownMenuItem.displayName = DropdownMenuPrimitive.Item.displayName;
const DropdownMenuCheckboxItem = React.forwardRef(
  ({ className, children, checked, ...props }, ref) =>
    _jsxs(DropdownMenuPrimitive.CheckboxItem, {
      ref: ref,
      className: cn(
        "relative flex cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-fg data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        className,
      ),
      checked: checked,
      ...props,
      children: [
        _jsx("span", {
          className:
            "absolute left-2 flex h-3.5 w-3.5 items-center justify-center",
          children: _jsx(DropdownMenuPrimitive.ItemIndicator, {
            children: _jsx(Check, { className: "h-4 w-4" }),
          }),
        }),
        children,
      ],
    }),
);
DropdownMenuCheckboxItem.displayName =
  DropdownMenuPrimitive.CheckboxItem.displayName;
const DropdownMenuRadioItem = React.forwardRef(
  ({ className, children, ...props }, ref) =>
    _jsxs(DropdownMenuPrimitive.RadioItem, {
      ref: ref,
      className: cn(
        "relative flex cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-fg data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        className,
      ),
      ...props,
      children: [
        _jsx("span", {
          className:
            "absolute left-2 flex h-3.5 w-3.5 items-center justify-center",
          children: _jsx(DropdownMenuPrimitive.ItemIndicator, {
            children: _jsx(Circle, { className: "h-2 w-2 fill-current" }),
          }),
        }),
        children,
      ],
    }),
);
DropdownMenuRadioItem.displayName = DropdownMenuPrimitive.RadioItem.displayName;
const DropdownMenuLabel = React.forwardRef(
  ({ className, inset, ...props }, ref) =>
    _jsx(DropdownMenuPrimitive.Label, {
      ref: ref,
      className: cn(
        "px-2 py-1.5 text-sm font-semibold",
        inset && "pl-8",
        className,
      ),
      ...props,
    }),
);
DropdownMenuLabel.displayName = DropdownMenuPrimitive.Label.displayName;
const DropdownMenuSeparator = React.forwardRef(({ className, ...props }, ref) =>
  _jsx(DropdownMenuPrimitive.Separator, {
    ref: ref,
    className: cn("-mx-1 my-1 h-px bg-muted", className),
    ...props,
  }),
);
DropdownMenuSeparator.displayName = DropdownMenuPrimitive.Separator.displayName;
const DropdownMenuShortcut = ({ className, ...props }) => {
  return _jsx("span", {
    className: cn("ml-auto text-xs tracking-widest opacity-60", className),
    ...props,
  });
};
DropdownMenuShortcut.displayName = "DropdownMenuShortcut";

export {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
};
