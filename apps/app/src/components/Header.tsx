import {
  AlertTriangle,
  Bug,
  Check,
  CircleDollarSign,
  Loader2,
  Monitor,
  Pause,
  Play,
  RotateCcw,
  Smartphone,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useApp } from "../AppContext";
import { useBugReport } from "../hooks/useBugReport";
import { AgentModeDropdown } from "./shared/AgentModeDropdown";
import { LanguageDropdown } from "./shared/LanguageDropdown";
import { IconTooltip as IconButtonTooltip } from "./shared/tooltips";

export function Header() {
  const {
    agentStatus,
    cloudEnabled,
    cloudConnected,
    cloudCredits,
    cloudCreditsCritical,
    cloudCreditsLow,
    cloudTopUpUrl,
    lifecycleBusy,
    lifecycleAction,
    handlePauseResume,
    handleRestart,
    handleStart,
    setTab,
    loadDropStatus,
    uiShellMode,
    setUiShellMode,
    uiLanguage,
    setUiLanguage,
    t,
  } = useApp();

  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    void loadDropStatus();
  }, [loadDropStatus]);

  // Clear copied state after 2 seconds
  useEffect(() => {
    if (copied) {
      const timer = setTimeout(() => setCopied(null), 2000);
      return () => clearTimeout(timer);
    }
  }, [copied]);

  const name = agentStatus?.agentName ?? "Milady";
  const state = agentStatus?.state ?? "not_started";

  const restartBusy = lifecycleBusy && lifecycleAction === "restart";
  const pauseResumeBusy = lifecycleBusy;
  const pauseResumeDisabled =
    lifecycleBusy || state === "restarting" || state === "starting";

  const creditColor = cloudCreditsCritical
    ? "border-danger text-danger bg-danger/10"
    : cloudCreditsLow
      ? "border-warn text-warn bg-warn/10"
      : "border-ok text-ok bg-ok/10";

  const { open: openBugReport } = useBugReport();

  // Minimum 44px touch targets for mobile
  const iconBtnBase =
    "inline-flex items-center justify-center w-11 h-11 min-w-[44px] min-h-[44px] border border-border/50 bg-bg/50 backdrop-blur-md cursor-pointer text-sm leading-none hover:border-accent hover:text-accent font-medium hover:-translate-y-0.5 transition-all duration-300 hover:shadow-[0_0_15px_rgba(var(--accent),0.5)] active:scale-95 rounded-xl";

  // Shell mode toggle (companion vs native)
  const shellMode = uiShellMode ?? "companion";
  const isNativeShell = shellMode === "native";
  const shellToggleActionLabel = isNativeShell
    ? t("header.switchToCompanion")
    : t("header.switchToNative");

  const handleShellToggle = () => {
    const nextMode = shellMode === "companion" ? "native" : "companion";
    setUiShellMode(nextMode);
    setTab(nextMode === "companion" ? "companion" : "chat");
  };

  return (
    <header className="border-b border-border/50 bg-bg/80 backdrop-blur-xl py-2 px-3 sm:py-3 sm:px-4 z-20">
      <div className="flex items-center gap-3 min-w-0">
        {/* Agent Name with Avatar */}
        <div className="flex items-center gap-2 shrink-0 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center shrink-0">
            <span className="text-accent-fg font-bold text-sm">M</span>
          </div>
          <div className="min-w-0">
            <span
              className="text-base font-bold text-txt-strong truncate block"
              data-testid="agent-name"
            >
              {name}
            </span>
            <span className="text-[10px] text-muted hidden sm:block">
              {t("header.aiAgent")}
            </span>
          </div>
        </div>

        {/* Right side controls */}
        <div className="flex-1 min-w-0 flex items-center justify-end gap-2">
          {/* Scrollable controls */}
          <div className="overflow-x-auto scrollbar-hide min-w-0">
            <div className="flex items-center gap-2 w-max ml-auto pr-0.5">

              {/* Cloud Credits */}
              {(cloudEnabled || cloudConnected) &&
                (cloudConnected ? (
                  <a
                    href={cloudTopUpUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`inline-flex shrink-0 items-center gap-1.5 px-2.5 py-1.5 h-9 border rounded-md font-mono text-[11px] sm:text-xs no-underline transition-all duration-200 hover:border-accent hover:text-accent hover:shadow-sm ${cloudCredits === null ? "border-muted text-muted" : creditColor}`}
                    title={t("header.CloudCreditsBalanc")}
                  >
                    <CircleDollarSign className="w-3.5 h-3.5" />
                    {cloudCredits === null
                      ? t("header.cloudConnected")
                      : `$${cloudCredits.toFixed(2)}`}
                  </a>
                ) : (
                  <span className="inline-flex shrink-0 items-center gap-1 px-2.5 py-1.5 h-9 border border-danger text-danger bg-danger/10 rounded-md font-mono text-[11px] sm:text-xs">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">
                      {t("header.cloudDisconnected")}
                    </span>
                    <span className="sm:hidden">{t("header.Cloud")}</span>
                  </span>
                ))}

              {/* Shell Mode Toggle */}
              <IconButtonTooltip label={shellToggleActionLabel}>
                <button
                  type="button"
                  onClick={handleShellToggle}
                  className={iconBtnBase}
                  aria-label={shellToggleActionLabel}
                  data-testid="ui-shell-toggle"
                >
                  {isNativeShell ? (
                    <Smartphone className="w-5 h-5" />
                  ) : (
                    <Monitor className="w-5 h-5" />
                  )}
                </button>
              </IconButtonTooltip>

              {/* Status & Controls Group */}
              <div className="flex items-center gap-2 shrink-0 bg-bg-accent/50 rounded-lg p-1">
                {/* Pause/Resume Button */}
                {state === "restarting" || state === "starting" ? (
                  <span className="inline-flex items-center justify-center w-11 h-11 text-sm leading-none opacity-60">
                    <Loader2 className="w-5 h-5 animate-spin" />
                  </span>
                ) : state === "not_started" || state === "stopped" ? (
                  <IconButtonTooltip label={t("header.startAgent")}>
                    <button
                      type="button"
                      onClick={() => void handleStart()}
                      aria-label={t("header.startAgent")}
                      className={`${iconBtnBase} disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100`}
                      disabled={lifecycleBusy}
                    >
                      <Play className="w-5 h-5" />
                    </button>
                  </IconButtonTooltip>
                ) : (
                  <IconButtonTooltip
                    label={
                      state === "paused"
                        ? t("header.resumeAutonomy")
                        : t("header.pauseAutonomy")
                    }
                    shortcut="Space"
                  >
                    <button
                      type="button"
                      onClick={handlePauseResume}
                      aria-label={
                        state === "paused"
                          ? t("header.resumeAutonomy")
                          : t("header.pauseAutonomy")
                      }
                      className={`${iconBtnBase} disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100`}
                      disabled={pauseResumeDisabled}
                    >
                      {pauseResumeBusy ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : state === "paused" ? (
                        <Play className="w-5 h-5" />
                      ) : (
                        <Pause className="w-5 h-5" />
                      )}
                    </button>
                  </IconButtonTooltip>
                )}

                {/* Restart Button */}
                <IconButtonTooltip
                  label={t("header.restartAgent")}
                  shortcut="Ctrl+R"
                >
                  <button
                    type="button"
                    onClick={handleRestart}
                    aria-label={t("header.restartAgent")}
                    disabled={lifecycleBusy || state === "restarting"}
                    className={`${iconBtnBase} disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100`}
                  >
                    {restartBusy || state === "restarting" ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <RotateCcw className="w-5 h-5" />
                    )}
                  </button>
                </IconButtonTooltip>
              </div>

              {/* Bug Report */}
              <IconButtonTooltip label={t("header.reportBug")} shortcut="Shift+?">
                <button
                  type="button"
                  onClick={openBugReport}
                  aria-label={t("header.reportBug")}
                  className={iconBtnBase}
                >
                  <Bug className="w-5 h-5" />
                </button>
              </IconButtonTooltip>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Agent Mode */}
            <AgentModeDropdown />

            {/* Language Selector */}
            {!isNativeShell && (
              <LanguageDropdown
                uiLanguage={uiLanguage}
                setUiLanguage={setUiLanguage}
                t={t}
              />
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
