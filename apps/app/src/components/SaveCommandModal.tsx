/**
 * Modal for naming and saving a custom /command from selected text.
 */

import { useCallback, useEffect, useRef, useState } from "react";

interface SaveCommandModalProps {
  open: boolean;
  text: string;
  onSave: (name: string) => void;
  onClose: () => void;
}

const NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9-]*$/;

export function SaveCommandModal({
  open,
  text,
  onSave,
  onClose,
}: SaveCommandModalProps) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setName("");
      setError("");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const validate = useCallback((value: string) => {
    if (!value) return "Name is required";
    if (!NAME_PATTERN.test(value))
      return "Must start with a letter, no spaces (a-z, 0-9, -)";
    return "";
  }, []);

  const handleSubmit = useCallback(() => {
    const err = validate(name);
    if (err) {
      setError(err);
      return;
    }
    onSave(name);
  }, [name, validate, onSave]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") handleSubmit();
      if (e.key === "Escape") onClose();
    },
    [handleSubmit, onClose],
  );

  if (!open) return null;

  const preview = text.length > 120 ? `${text.slice(0, 120)}...` : text;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          onClose();
        }
      }}
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-md border border-border bg-card shadow-lg flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center px-5 py-3 border-b border-border shrink-0">
          <span className="font-bold text-sm flex-1">Save as /Command</span>
          <button
            type="button"
            className="text-muted hover:text-txt text-lg leading-none px-1 cursor-pointer"
            onClick={onClose}
          >
            &times;
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 flex flex-col gap-3">
          <span className="text-xs text-muted">Command name</span>
          <div className="flex items-center gap-1">
            <span className="text-sm text-muted">/</span>
            <input
              ref={inputRef}
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError("");
              }}
              onKeyDown={handleKeyDown}
              placeholder="my-command"
              className="flex-1 bg-surface border border-border px-2 py-1.5 text-sm text-txt placeholder:text-muted/50 outline-none focus:border-accent"
            />
          </div>
          {error && <p className="text-xs text-danger">{error}</p>}

          <span className="text-xs text-muted mt-1">Preview</span>
          <pre className="text-xs text-muted bg-surface border border-border px-3 py-2 whitespace-pre-wrap break-words max-h-24 overflow-y-auto">
            {preview}
          </pre>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-border">
          <button
            type="button"
            className="px-3 py-1.5 text-xs border border-border text-muted hover:text-txt cursor-pointer"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="px-3 py-1.5 text-xs border border-accent bg-accent text-white hover:opacity-90 cursor-pointer"
            onClick={handleSubmit}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
