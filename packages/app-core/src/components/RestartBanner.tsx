import { useCallback, useState } from "react";
import { isElectrobunRuntime } from "../bridge";
import { useApp } from "../state";

export function RestartBanner() {
  const {
    pendingRestart,
    pendingRestartReasons,
    restartBannerDismissed,
    dismissRestartBanner,
    showRestartBanner,
    triggerRestart,
    relaunchDesktop,
    t,
  } = useApp();

  const [restarting, setRestarting] = useState(false);
  const [relaunching, setRelaunching] = useState(false);

  const handleRestart = useCallback(async () => {
    setRestarting(true);
    try {
      await triggerRestart();
    } finally {
      setRestarting(false);
    }
  }, [triggerRestart]);

  const handleRelaunch = useCallback(async () => {
    setRelaunching(true);
    try {
      await relaunchDesktop();
    } finally {
      setRelaunching(false);
    }
  }, [relaunchDesktop]);

  if (!pendingRestart) return null;

  const reasons = pendingRestartReasons;
  const summary =
    reasons.length === 1
      ? `${reasons[0]} - restart to apply.`
      : reasons.length > 1
        ? `${reasons.length} changes pending - restart to apply.`
        : "Restart required to apply changes.";
  const helperText = restartBannerDismissed
    ? "Electrobun still has restart-required changes queued. Use Restart Now, Milady > Restart Agent, or relaunch the desktop app if the shell itself needs to reload."
    : "Electrobun applies plugin and configuration changes when the embedded agent restarts. Restart Now reloads the embedded agent. Use Milady > Relaunch Milady only when the desktop shell itself needs a full relaunch.";

  return (
    <div
      className="fixed left-0 right-0 z-[9998] flex items-center justify-between gap-3 px-4 py-2 text-[13px] font-medium shadow-lg"
      style={{
        top: isElectrobunRuntime() ? 40 : 0,
        background: "color-mix(in srgb, var(--accent) 15%, var(--bg) 85%)",
        borderBottom:
          "1px solid color-mix(in srgb, var(--accent) 30%, transparent)",
        display: "flex",
        color: "var(--text)",
      }}
    >
      <div className="min-w-0">
        <div className="truncate">{summary}</div>
        <div
          className="truncate text-[12px]"
          style={{ color: "var(--muted)" }}
        >
          {helperText}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={
            restartBannerDismissed ? showRestartBanner : dismissRestartBanner
          }
          className="rounded px-3 py-1 text-[12px] transition-colors"
          style={{ color: "var(--muted)" }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "var(--bg-hover)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
          }}
        >
          {restartBannerDismissed ? "Review" : t("restartbanner.Later")}
        </button>
        <button
          type="button"
          onClick={handleRestart}
          disabled={restarting}
          className="rounded px-3 py-1 text-[12px] font-semibold transition-colors disabled:opacity-60"
          style={{ background: "#f0b232", color: "#000" }}
        >
          {restarting ? "Restarting..." : "Restart Now"}
        </button>
        {isElectrobunRuntime() && (
          <button
            type="button"
            onClick={handleRelaunch}
            disabled={relaunching}
            className="rounded px-3 py-1 text-[12px] font-semibold transition-colors disabled:opacity-60"
            style={{
              background: "color-mix(in srgb, var(--panel) 88%, #ffffff 12%)",
              color: "var(--text)",
              border:
                "1px solid color-mix(in srgb, var(--border) 85%, transparent)",
            }}
          >
            {relaunching ? "Relaunching..." : "Relaunch App"}
          </button>
        )}
      </div>
    </div>
  );
}
