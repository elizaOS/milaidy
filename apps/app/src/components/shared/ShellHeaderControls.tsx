import { LanguageDropdown, ThemeToggle } from "@milady/app-core/components";
import type { UiLanguage } from "@milady/app-core/i18n";
import type { UiShellMode, UiTheme } from "@milady/app-core/state";
import { type LucideIcon, Monitor, Smartphone, UserRound } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";

export const HEADER_ICON_BUTTON_CLASSNAME =
  "inline-flex items-center justify-center w-11 h-11 min-w-[44px] min-h-[44px] border border-border/50 bg-bg/50 backdrop-blur-md cursor-pointer text-sm leading-none hover:border-accent hover:text-txt font-medium hover:-translate-y-0.5 transition-all duration-300 hover:shadow-[0_0_15px_rgba(var(--accent),0.5)] active:scale-95 rounded-xl text-txt shadow-sm";

type ShellHeaderTranslator = (key: string) => string;

const SHELL_MODE_MOBILE_BREAKPOINT = 768;

function useIsMobileShellViewport(): boolean {
  const [isMobileViewport, setIsMobileViewport] = useState(() =>
    typeof window !== "undefined"
      ? window.innerWidth <= SHELL_MODE_MOBILE_BREAKPOINT
      : false,
  );

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    ) {
      return;
    }

    const mediaQuery = window.matchMedia(
      `(max-width: ${SHELL_MODE_MOBILE_BREAKPOINT}px)`,
    );
    const syncViewport = () => {
      setIsMobileViewport(mediaQuery.matches);
    };
    syncViewport();

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", syncViewport);
      return () => mediaQuery.removeEventListener("change", syncViewport);
    }

    mediaQuery.addListener(syncViewport);
    return () => mediaQuery.removeListener(syncViewport);
  }, []);

  return isMobileViewport;
}

interface ShellHeaderControlsProps {
  shellMode: UiShellMode | null | undefined;
  onShellModeChange: (mode: UiShellMode) => void;
  uiLanguage: UiLanguage;
  setUiLanguage: (language: UiLanguage) => void;
  uiTheme: UiTheme;
  setUiTheme: (theme: UiTheme) => void;
  t: ShellHeaderTranslator;
  children?: ReactNode;
  rightExtras?: ReactNode;
  className?: string;
  controlsVariant?: "native" | "companion";
}

export function ShellHeaderControls({
  shellMode,
  onShellModeChange,
  uiLanguage,
  setUiLanguage,
  uiTheme,
  setUiTheme,
  t,
  children,
  rightExtras,
  className,
  controlsVariant = "native",
}: ShellHeaderControlsProps) {
  const isMobileViewport = useIsMobileShellViewport();
  const activeShellMode = shellMode ?? "companion";
  const shellOptions: Array<{
    mode: UiShellMode;
    label: string;
    Icon: LucideIcon;
  }> = [
    {
      mode: "companion",
      label: t("header.companionMode"),
      Icon: UserRound,
    },
    {
      mode: "native",
      label: t("header.nativeMode"),
      Icon: isMobileViewport ? Smartphone : Monitor,
    },
  ];

  return (
    <div
      className={`flex min-w-0 items-center gap-3 w-full ${className ?? ""}`}
    >
      <div className="flex shrink-0 items-center">
        <fieldset
          className="inline-flex items-center gap-1 rounded-[18px] border border-white/25 bg-white/70 p-1 shadow-[0_10px_24px_rgba(15,23,42,0.16)] backdrop-blur-md dark:border-[hsl(220_12%_22%/0.5)] dark:bg-[hsl(220_16%_12%/0.6)]"
          data-testid="ui-shell-toggle"
          aria-label={t("header.switchToNative")}
        >
          <legend className="sr-only">{t("header.switchToNative")}</legend>
          {shellOptions.map(({ mode, label, Icon }, index) => {
            const selected = activeShellMode === mode;
            const segmentShapeClass =
              index === 0
                ? "rounded-l-[14px] rounded-r-[10px]"
                : "rounded-l-[10px] rounded-r-[14px]";
            return (
              <button
                key={mode}
                type="button"
                onClick={() => onShellModeChange(mode)}
                className={`inline-flex h-9 min-w-[44px] items-center justify-center px-3 transition-all duration-200 ${segmentShapeClass} ${
                  selected
                    ? "border border-[#f0b232]/45 bg-white/95 text-[#f0b232] shadow-[0_0_18px_rgba(240,178,50,0.22),inset_0_1px_0_rgba(255,255,255,0.95)] dark:bg-[hsl(220_14%_20%)] dark:text-[#f0b232] dark:border-[#f0b232]/35 dark:shadow-[0_0_18px_rgba(240,178,50,0.15)]"
                    : "border border-transparent bg-transparent text-[#d4a11e]/80 hover:bg-white/65 hover:text-[#f0b232] dark:text-[#f0b232]/70 dark:hover:bg-[hsl(220_12%_22%)] dark:hover:text-[#f0b232]"
                }`}
                aria-label={label}
                aria-pressed={selected}
                title={label}
                data-testid={`ui-shell-toggle-${mode}`}
              >
                <Icon className="h-4 w-4" />
              </button>
            );
          })}
        </fieldset>
      </div>

      <div className="min-w-0 flex-1">{children}</div>

      <div className="flex shrink-0 items-center justify-end gap-2">
        {rightExtras}
        <LanguageDropdown
          uiLanguage={uiLanguage}
          setUiLanguage={setUiLanguage}
          t={t}
          variant={controlsVariant}
          triggerClassName="!h-10 !min-h-10 !rounded-xl !px-3.5 sm:!px-3.5 leading-none"
        />
        <ThemeToggle
          uiTheme={uiTheme}
          setUiTheme={setUiTheme}
          t={t}
          variant={controlsVariant}
          className="!h-10 !w-10 !min-h-10 !min-w-10"
        />
      </div>
    </div>
  );
}
