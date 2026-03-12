/**
 * Modal for naming and saving a custom /command from selected text.
 */

import { Input } from "@milady/ui";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useApp } from "../AppContext";

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
  const { t } = useApp();
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogTitleId = useId();
  const inputId = useId();
  const inputLabelId = useId();
  const inputErrorId = useId();

  useEffect(() => {
    if (open) {
      setName("");
      setError("");
      const focusTimeout = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(focusTimeout);
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
      if (e.nativeEvent.isComposing) return;
      if (e.key === "Enter") handleSubmit();
      if (e.key === "Escape") onClose();
    },
    [handleSubmit, onClose],
  );

  if (!open) return null;

  const preview = text.length > 120 ? `${text.slice(0, 120)}...` : text;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }}
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
      aria-labelledby={dialogTitleId}
    >
      <div
        className="w-full max-w-md shadow-lg flex flex-col overflow-hidden rounded-xl"
        style={{
          background: "rgba(18, 22, 32, 0.96)",
          border: "1px solid rgba(240, 178, 50, 0.18)",
          backdropFilter: "blur(24px)",
          boxShadow:
            "0 8px 60px rgba(0,0,0,0.6), 0 0 40px rgba(240,178,50,0.06)",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center px-5 py-3 shrink-0"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}
        >
          <span
            id={dialogTitleId}
            className="font-bold text-sm flex-1"
            style={{ color: "rgba(240,238,250,0.92)" }}
          >
            {t("savecommandmodal.SaveAsCommand")}
          </span>
          <button
            type="button"
            className="bg-transparent border-0 cursor-pointer text-lg h-6 w-6"
            style={{ color: "rgba(255,255,255,0.45)" }}
            onClick={onClose}
            aria-label="Close dialog"
          >
            {t("savecommandmodal.Times")}
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 flex flex-col gap-3">
          <label
            id={inputLabelId}
            htmlFor={inputId}
            className="text-xs"
            style={{ color: "rgba(255,255,255,0.45)" }}
          >
            {t("savecommandmodal.CommandName")}
          </label>
          <div className="flex items-center gap-1">
            <span
              className="text-sm"
              style={{ color: "rgba(255,255,255,0.45)" }}
            >
              /
            </span>
            <Input
              id={inputId}
              ref={inputRef}
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError("");
              }}
              onKeyDown={handleKeyDown}
              placeholder={t("savecommandmodal.myCommand")}
              aria-labelledby={inputLabelId}
              aria-describedby={error ? inputErrorId : undefined}
              aria-invalid={error ? "true" : undefined}
              className="flex-1 h-8 text-sm shadow-sm"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.1)",
                color: "rgba(240,238,250,0.92)",
              }}
            />
          </div>
          {error && (
            <p
              id={inputErrorId}
              className="text-xs"
              style={{ color: "#ef4444" }}
            >
              {error}
            </p>
          )}

          <span
            className="text-xs mt-1"
            style={{ color: "rgba(255,255,255,0.45)" }}
          >
            {t("savecommandmodal.Preview")}
          </span>
          <pre
            className="text-xs px-3 py-2 whitespace-pre-wrap break-words max-h-24 overflow-y-auto"
            style={{
              color: "rgba(255,255,255,0.45)",
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            {preview}
          </pre>
        </div>

        {/* Footer */}
        <div
          className="flex justify-end gap-2 px-5 py-3"
          style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}
        >
          <button
            type="button"
            className="px-3 py-1.5 h-8 text-xs font-medium rounded cursor-pointer transition-colors"
            style={{
              background: "transparent",
              border: "1px solid rgba(255,255,255,0.1)",
              color: "rgba(255,255,255,0.6)",
            }}
            onClick={onClose}
          >
            {t("savecommandmodal.Cancel")}
          </button>
          <button
            type="button"
            className="px-3 py-1.5 h-8 text-xs font-medium rounded cursor-pointer transition-colors"
            style={{ background: "#f0b232", border: "none", color: "#000" }}
            onClick={handleSubmit}
          >
            {t("savecommandmodal.Save")}
          </button>
        </div>
      </div>
    </div>
  );
}
