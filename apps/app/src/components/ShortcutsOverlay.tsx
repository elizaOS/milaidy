/**
 * In-app keyboard shortcuts help overlay.
 *
 * Toggled with Shift+? (using metadata from useKeyboardShortcuts).
 */

import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { COMMON_SHORTCUTS } from "../hooks/useKeyboardShortcuts";

function formatKey(s: (typeof COMMON_SHORTCUTS)[number]): string {
  const isMac =
    typeof navigator !== "undefined" && navigator.platform?.includes("Mac");
  const parts: string[] = [];
  if (s.ctrl) parts.push(isMac ? "\u2318" : "Ctrl");
  if (s.shift) parts.push(isMac ? "\u21E7" : "Shift");
  if (s.alt) parts.push(isMac ? "\u2325" : "Alt");
  if (s.meta) parts.push(isMac ? "\u2318" : "Win");
  parts.push(s.key.length === 1 ? s.key.toUpperCase() : s.key);
  return parts.join(isMac ? "" : "+");
}

export function ShortcutsOverlay() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.shiftKey && e.key === "?") {
        // Don't trigger if typing in an input/textarea
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape" && open) {
        e.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  if (!open) return null;

  const grouped: Record<string, typeof COMMON_SHORTCUTS> = {};
  for (const s of COMMON_SHORTCUTS) {
    const scope = s.scope ?? "global";
    (grouped[scope] ??= []).push(s);
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 z-[10000] flex items-center justify-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
      tabIndex={-1}
    >
      <div className="bg-bg border border-border rounded-lg shadow-2xl max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-base font-bold text-txt-strong">
            Keyboard Shortcuts
          </h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="p-1 text-muted hover:text-txt rounded transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-5">
          {Object.entries(grouped).map(([scope, shortcuts]) => (
            <div key={scope}>
              <h3 className="text-[11px] uppercase tracking-wide text-muted font-medium mb-2">
                {scope}
              </h3>
              <div className="space-y-1">
                {shortcuts.map((s) => (
                  <div
                    key={`${s.key}-${s.description}`}
                    className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-bg-hover"
                  >
                    <span className="text-sm text-txt">
                      {s.description}
                    </span>
                    <kbd className="inline-flex items-center gap-0.5 px-2 py-0.5 text-[11px] font-mono bg-bg-elevated border border-border rounded text-muted">
                      {formatKey(s)}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
