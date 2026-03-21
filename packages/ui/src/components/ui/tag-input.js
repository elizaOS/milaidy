import { X } from "lucide-react";
import * as React from "react";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { cn } from "../../lib/utils";
export const TagInput = React.forwardRef(
  (
    {
      label,
      items,
      onChange,
      placeholder = "Add item…",
      maxItems,
      addLabel = "Add",
      removeLabel = "Remove",
      className,
      ...props
    },
    ref,
  ) => {
    const [inputValue, setInputValue] = React.useState("");
    const addItem = React.useCallback(() => {
      const trimmed = inputValue.trim();
      if (!trimmed || items.includes(trimmed)) return;
      if (maxItems != null && items.length >= maxItems) return;
      onChange([...items, trimmed]);
      setInputValue("");
    }, [inputValue, items, onChange, maxItems]);
    const removeItem = React.useCallback(
      (index) => {
        const updated = [...items];
        updated.splice(index, 1);
        onChange(updated);
      },
      [items, onChange],
    );
    return _jsxs("div", {
      ref: ref,
      className: cn("flex flex-col gap-1.5", className),
      ...props,
      children: [
        label &&
          _jsx("span", { className: "text-xs font-semibold", children: label }),
        _jsxs("div", {
          className: "flex items-center gap-1.5",
          children: [
            _jsx("input", {
              type: "text",
              value: inputValue,
              placeholder: placeholder,
              onChange: (e) => setInputValue(e.target.value),
              onKeyDown: (e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addItem();
                }
              },
              className:
                "flex-1 min-w-0 rounded-md border border-input bg-bg px-2 py-1 text-[11px] placeholder:text-muted focus-visible:outline-none focus-visible:border-ring",
            }),
            _jsx("button", {
              type: "button",
              className:
                "rounded-md border border-input bg-bg px-1.5 py-0.5 text-[10px] text-muted transition-colors hover:border-accent hover:text-accent",
              onClick: addItem,
              children: addLabel,
            }),
          ],
        }),
        _jsx("div", {
          className:
            "flex flex-wrap gap-1.5 rounded-md border border-border bg-bg-accent p-1.5 min-h-[60px] content-start",
          children: items.map((item, i) =>
            _jsxs(
              "span",
              {
                className:
                  "inline-flex items-center gap-1 rounded-sm border border-border bg-bg px-2 py-0.5 text-[11px]",
                children: [
                  item,
                  _jsx("button", {
                    type: "button",
                    className:
                      "text-muted hover:text-destructive transition-colors",
                    onClick: () => removeItem(i),
                    "aria-label": `${removeLabel} ${item}`,
                    children: _jsx(X, { className: "h-3 w-3" }),
                  }),
                ],
              },
              item,
            ),
          ),
        }),
      ],
    });
  },
);
TagInput.displayName = "TagInput";
