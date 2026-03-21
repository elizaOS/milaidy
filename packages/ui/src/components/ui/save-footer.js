import * as React from "react";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { cn } from "../../lib/utils";
export const SaveFooter = React.forwardRef(
  (
    {
      dirty,
      saving,
      saveError,
      saveSuccess,
      onSave,
      saveLabel = "Save Changes",
      savingLabel = "Saving…",
      savedLabel = "Saved",
      className,
      ...props
    },
    ref,
  ) => {
    if (!dirty) return null;
    return _jsxs("div", {
      ref: ref,
      className: cn(
        "flex items-center justify-end gap-3 border-t border-border pt-2",
        className,
      ),
      ...props,
      children: [
        saveError &&
          _jsx("span", {
            className: "text-xs text-destructive",
            children: saveError,
          }),
        saveSuccess &&
          _jsx("span", { className: "text-xs text-ok", children: savedLabel }),
        _jsx("button", {
          type: "button",
          className:
            "rounded-md bg-primary px-4 py-1.5 text-xs font-semibold text-primary-fg transition-opacity hover:opacity-90 disabled:opacity-50",
          disabled: saving,
          onClick: onSave,
          children: saving ? savingLabel : saveLabel,
        }),
      ],
    });
  },
);
SaveFooter.displayName = "SaveFooter";
