/**
 * ThemedSelect — custom dropdown with grouped options.
 *
 * A generic, fully-controlled select component that supports grouped option
 * lists and optional hint text per item. Has no dependency on any app-level
 * context; all state is passed in as props.
 */

import { useEffect, useRef, useState } from "react";
import { Button } from "./button";

export interface ThemedSelectGroup<T extends string = string> {
  label: string;
  items: { id: T; text: string; hint?: string }[];
}

export interface ThemedSelectProps<T extends string = string> {
  value: T | null;
  groups: ThemedSelectGroup<T>[];
  onChange: (id: T) => void;
  placeholder?: string;
}

export function ThemedSelect<T extends string>({
  value,
  groups,
  onChange,
  placeholder = "select...",
}: ThemedSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  // Find current label
  let currentLabel = placeholder;
  for (const g of groups) {
    const found = g.items.find((i) => i.id === value);
    if (found) {
      currentLabel = found.hint ? `${found.text} — ${found.hint}` : found.text;
      break;
    }
  }

  return (
    <div ref={ref} className="relative flex-1 min-w-0">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full flex items-center justify-between px-2.5 py-1.5 h-8 border-border bg-card text-xs text-left cursor-pointer hover:border-accent shadow-sm focus-visible:ring-1 focus-visible:ring-accent"
        onClick={() => setOpen(!open)}
      >
        <span className="truncate">{currentLabel}</span>
        <span
          className={`ml-2 text-[10px] text-muted transition-transform ${open ? "rotate-180" : ""}`}
        >
          &#9660;
        </span>
      </Button>

      {open && (
        <div className="absolute z-50 left-0 right-0 mt-0.5 max-h-[280px] overflow-y-auto border border-border bg-card shadow-lg rounded-md">
          {groups.map((g) => (
            <div key={g.label}>
              <div className="px-2.5 py-1 text-[10px] font-semibold text-muted bg-bg-muted sticky top-0">
                {g.label}
              </div>
              {g.items.map((item) => {
                const active = item.id === value;
                return (
                  <Button
                    key={item.id}
                    variant="ghost"
                    size="sm"
                    className={`w-full justify-start text-left px-2.5 py-1.5 h-auto text-xs rounded-none ${
                      active
                        ? "bg-accent text-accent-foreground"
                        : "text-txt hover:bg-bg-muted"
                    }`}
                    onClick={() => {
                      onChange(item.id);
                      setOpen(false);
                    }}
                  >
                    <span className="font-semibold">{item.text}</span>
                    {item.hint && (
                      <span
                        className={`ml-1.5 ${active ? "opacity-70" : "text-muted"}`}
                      >
                        {item.hint}
                      </span>
                    )}
                  </Button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
