import { Check, ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { UiLanguage } from "../../i18n/messages";
import type { TranslatorFn } from "../companion/walletUtils";

/** Language metadata with flag emoji and native label. */
export const LANGUAGES: { id: UiLanguage; flag: string; label: string }[] = [
  { id: "en", flag: "🇺🇸", label: "English" },
  { id: "zh-CN", flag: "🇨🇳", label: "中文" },
  { id: "ko", flag: "🇰🇷", label: "한국어" },
  { id: "es", flag: "🇪🇸", label: "Español" },
  { id: "pt", flag: "🇧🇷", label: "Português" },
];

export interface LanguageDropdownProps {
  uiLanguage: UiLanguage;
  setUiLanguage: (language: UiLanguage) => void;
  /** Optional translator for ARIA labels */
  t?: TranslatorFn;
  /** Optional extra className on the root */
  className?: string;
  variant?: "native" | "companion";
}

export function LanguageDropdown({
  uiLanguage,
  setUiLanguage,
  t,
  className,
  variant = "native",
}: LanguageDropdownProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
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

  const current = LANGUAGES.find((l) => l.id === uiLanguage) ?? LANGUAGES[0];

  const triggerClass = variant === "companion"
    ? `flex items-center gap-1.5 h-8 px-2.5 rounded-full bg-white/5 text-white/80 hover:text-white hover:bg-white/20 border border-transparent hover:border-white/30 transition-all text-xs font-medium cursor-pointer ${open ? "bg-white/20 text-white border-white/30 shadow-sm" : ""}`
    : `inline-flex items-center gap-1.5 h-9 px-2 sm:px-3 border border-border bg-bg text-[11px] sm:text-xs font-medium cursor-pointer transition-colors duration-200 hover:border-accent hover:text-accent rounded-md ${open ? "border-accent text-accent bg-accent/5 backdrop-blur-sm" : ""}`;

  return (
    <div
      ref={rootRef}
      className={`relative inline-flex shrink-0 ${className ?? ""}`}
      data-testid="language-dropdown"
    >
      <button
        type="button"
        className={triggerClass}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t?.("settings.language") ?? "Language"}
        data-testid="language-dropdown-trigger"
      >
        <span className="text-sm leading-none">{current.flag}</span>
        <span className="hidden sm:inline uppercase tracking-widest opacity-80">{current.id}</span>
        <ChevronDown className={`w-3.5 h-3.5 opacity-60 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <ul
          className="absolute top-full right-0 mt-1 w-36 bg-bg-elevated border border-border rounded-lg shadow-xl overflow-hidden z-50 py-1"
          aria-label={t?.("settings.language") ?? "Language"}
        >
          {LANGUAGES.map((lang) => (
            <li key={lang.id} role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={lang.id === uiLanguage}
                className={`w-full flex items-center justify-between px-3 py-2 text-sm transition-colors hover:bg-bg-hover ${lang.id === uiLanguage ? "text-accent bg-accent/5 font-medium" : "text-txt"}`}
                onClick={() => {
                  setUiLanguage(lang.id);
                  setOpen(false);
                }}
                data-testid={`language-option-${lang.id}`}
              >
                <div className="flex items-center gap-2">
                  <span>{lang.flag}</span>
                  <span>{lang.label}</span>
                </div>
                {lang.id === uiLanguage && (
                  <Check className="w-4 h-4" />
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
