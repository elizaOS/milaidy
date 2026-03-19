import type { UiTheme } from "@elizaos/app-core/state";
import { useCallback, useMemo } from "react";

export type ThemeTranslatorFn = (key: string) => string;

export interface ThemeToggleProps {
  uiTheme: UiTheme;
  setUiTheme: (theme: UiTheme) => void;
  t?: ThemeTranslatorFn;
  className?: string;
  variant?: "native" | "companion";
}

const BLOCKED_SIZE_TOKENS = new Set([
  "!h-10",
  "!w-10",
  "!min-h-10",
  "!min-w-10",
  "h-10",
  "w-10",
  "min-h-10",
  "min-w-10",
]);

function sanitizeClassName(className?: string): string {
  if (!className) return "";

  return className
    .split(/\s+/)
    .filter((token) => token && !BLOCKED_SIZE_TOKENS.has(token))
    .join(" ");
}

function SunIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      data-testid="theme-toggle-sun-icon"
    >
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  );
}

function MoonIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      data-testid="theme-toggle-moon-icon"
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

export function ThemeToggle({
  uiTheme,
  setUiTheme,
  t: _t,
  className,
  variant: _variant = "native",
}: ThemeToggleProps) {
  const isDark = uiTheme === "dark";
  const safeClassName = useMemo(
    () => sanitizeClassName(className),
    [className],
  );

  const handleToggle = useCallback(() => {
    setUiTheme(isDark ? "light" : "dark");
  }, [isDark, setUiTheme]);

  const ariaLabel = isDark
    ? "Current theme: dark. Switch to light theme."
    : "Current theme: light. Switch to dark theme.";

  return (
    <button
      type="button"
      aria-label={ariaLabel}
      title={ariaLabel}
      onClick={handleToggle}
      onPointerDown={(event) => event.stopPropagation()}
      className={`inline-flex h-11 min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-border/50 bg-bg/50 px-0 text-sm leading-none text-txt shadow-sm backdrop-blur-md transition-all duration-300 hover:-translate-y-0.5 hover:border-accent hover:text-txt hover:shadow-[0_0_15px_rgba(var(--accent),0.5)] active:scale-95 ${safeClassName}`}
      data-testid="theme-toggle"
      data-no-camera-drag="true"
      data-current-theme={uiTheme}
    >
      {isDark ? (
        <MoonIcon className="h-5 w-5" />
      ) : (
        <SunIcon className="h-5 w-5" />
      )}
    </button>
  );
}
