import { useCallback, useState } from "react";
import { useApp } from "../AppContext";

export function RestartBanner() {
  const {
    pendingRestart,
    pendingRestartReasons,
    restartBannerDismissed,
    dismissRestartBanner,
    triggerRestart,
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
  const isElectrobun =
    typeof window !== "undefined" &&
    (window as unknown as Record<string, unknown>).__ELECTROBUN__ === true;

  return (
    <div
      className="fixed left-0 right-0 z-[9998] flex items-center justify-between gap-3 bg-amber-600 px-4 py-2 text-[13px] font-medium text-white shadow-lg"
      style={{ top: isElectrobun ? 40 : 0 }}
    >
      <span className="truncate">{text}</span>
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={dismissRestartBanner}
          className="rounded px-3 py-1 text-[12px] text-amber-100 hover:bg-amber-700 transition-colors"
        >
          Later
        </button>
        <button
          type="button"
          onClick={handleRestart}
          disabled={restarting}
          className="rounded bg-white px-3 py-1 text-[12px] font-semibold text-amber-700 hover:bg-amber-50 transition-colors disabled:opacity-60"
        >
          {restarting ? "Restarting..." : "Restart Now"}
        </button>
      </div>
    </div>
  );
}
