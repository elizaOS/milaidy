/**
 * TagEditor — add/remove string tags with chip display.
 *
 * Fully generic; no app-context dependency. Callers pass translated labels
 * via props (with English defaults so the component works out-of-the-box).
 */

import { useState } from "react";
import { Button } from "./button";
import { Input } from "./input";

export interface TagEditorProps {
  label: string;
  items: string[];
  onChange: (items: string[]) => void;
  placeholder?: string;
  /** Label for the Add button. Defaults to "Add". */
  addLabel?: string;
  /** Label for the remove button. Defaults to "×". */
  removeLabel?: string;
}

export function TagEditor({
  label,
  items,
  onChange,
  placeholder = "add item...",
  addLabel = "Add",
  removeLabel = "×",
}: TagEditorProps) {
  const [inputValue, setInputValue] = useState("");

  const addItem = () => {
    const trimmed = inputValue.trim();
    if (trimmed && !items.includes(trimmed)) {
      onChange([...items, trimmed]);
    }
    setInputValue("");
  };

  const removeItem = (index: number) => {
    const updated = [...items];
    updated.splice(index, 1);
    onChange(updated);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-semibold text-xs">{label}</span>
      <div className="flex items-center gap-1.5">
        <Input
          type="text"
          value={inputValue}
          placeholder={placeholder}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addItem();
            }
          }}
          className="h-7 px-2 border-border bg-card text-[11px] focus-visible:ring-1 focus-visible:ring-accent flex-1 min-w-0 shadow-sm"
        />
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-[10px] px-1.5 py-0.5 text-accent border-none hover:bg-transparent hover:text-accent/80"
          onClick={addItem}
        >
          {addLabel}
        </Button>
      </div>
      <div className="min-h-0 overflow-y-auto border border-border/40 bg-bg/50 backdrop-blur-sm rounded-xl p-2 flex flex-wrap gap-x-1.5 gap-y-1 content-start items-start">
        {items.map((item, i) => (
          <span
            key={item}
            className="inline-flex items-center gap-1 px-2 py-0.5 border border-accent/60 bg-transparent rounded text-[11px] h-fit text-accent font-medium"
          >
            {item}
            <Button
              variant="ghost"
              size="icon"
              className="h-4 w-4 p-0 text-danger/80 hover:text-danger hover:bg-transparent"
              onClick={() => removeItem(i)}
            >
              {removeLabel}
            </Button>
          </span>
        ))}
      </div>
    </div>
  );
}
