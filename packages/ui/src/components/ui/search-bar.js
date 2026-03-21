/**
 * SearchBar — a self-contained search input with submit button.
 *
 * Fully generic; no app-context dependency. Callers pass the placeholder
 * and loading state directly.
 */
import { useCallback, useState } from "react";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Button } from "./button";
import { Input } from "./input";
export function SearchBar({
  onSearch,
  searching,
  placeholder = "Search...",
  searchLabel = "Search",
  searchingLabel = "Searching...",
}) {
  const [query, setQuery] = useState("");
  const handleSubmit = useCallback(() => {
    if (query.trim()) {
      onSearch(query.trim());
    }
  }, [query, onSearch]);
  return _jsx("div", {
    className: "mb-6",
    children: _jsxs("div", {
      className: "flex gap-2",
      children: [
        _jsx(Input, {
          type: "text",
          placeholder: placeholder,
          value: query,
          onChange: (e) => setQuery(e.target.value),
          onKeyDown: (e) => e.key === "Enter" && handleSubmit(),
          className:
            "h-9 bg-bg border-border text-sm shadow-sm focus-visible:ring-1 focus-visible:ring-accent",
          disabled: searching,
        }),
        _jsx(Button, {
          variant: "default",
          size: "sm",
          className: "h-9 px-4 shadow-sm",
          onClick: handleSubmit,
          disabled: !query.trim() || searching,
          children: searching ? searchingLabel : searchLabel,
        }),
      ],
    }),
  });
}
