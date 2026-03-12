import { isElectrobunRuntime } from "@milady/app-core/bridge";
import { useCallback, useState } from "react";
import { useApp } from "../AppContext";

export function RestartBanner() {
  const {
    pendingRestart,
    pendingRestartReasons,
    restartBannerDismissed,
    dismissRestartBanner,
    triggerRestart,
    t,
  } = useApp();

  const [restarting, setRestarting] = useState(false);

  const handleRestart = useCallback(async () => {
    setRestarting(true);
    try {
      await triggerRestart();
    } finally {
      setRestarting(false);
    }
  }, [triggerRestart]);

  if (!pendingRestart || restartBannerDismissed) return null;

  const reasons = pendingRestartReasons;
  const text =
    reasons.length === 1
      ? `${reasons[0]} — restart to apply.`
      : reasons.length > 1
        ? `${reasons.length} changes pending — restart to apply.`
        : "Restart required to apply changes.";

  // In Electrobun the native drag region occupies the top ~40 px, so we
  // shift the banner below it to keep buttons clickable.
  return (
    <div
      className="fixed left-0 right-0 z-[9998] flex items-center justify-between gap-3 px-4 py-2 text-[13px] font-medium shadow-lg"
      style={{
        top: isElectrobunRuntime() ? 40 : 0,
        background: "rgba(240, 178, 50, 0.15)",
        borderBottom: "1px solid rgba(240, 178, 50, 0.3)",
        backdropFilter: "blur(12px)",
        color: "rgba(240, 238, 250, 0.92)",
      }}
    >
      <span className="truncate">{text}</span>
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={dismissRestartBanner}
          className="rounded px-3 py-1 text-[12px] transition-colors"
          style={{ color: "rgba(255,255,255,0.6)" }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(255,255,255,0.08)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
          }}
        >
          {t("restartbanner.Later")}
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
      </div>
    </div>
  );
}
