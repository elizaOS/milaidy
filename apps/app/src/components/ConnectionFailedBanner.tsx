import { useApp } from "../AppContext";

/**
 * Banner shown during WebSocket reconnection attempts (amber) and
 * after all attempts are exhausted (red). Offers Retry when failed.
 */
const isElectrobun =
  typeof window !== "undefined" &&
  (window as unknown as Record<string, unknown>).__ELECTROBUN__ === true;
const bannerTop = isElectrobun ? 40 : 0;

export function ConnectionFailedBanner() {
  const {
    backendConnection,
    backendDisconnectedBannerDismissed,
    dismissBackendDisconnectedBanner,
    retryBackendConnection,
  } = useApp();

  if (!backendConnection) return null;

  // ── Reconnecting: amber banner with attempt counter ──────────────────
  if (backendConnection.state === "reconnecting") {
    return (
      <div
        className="fixed left-0 right-0 z-[9999] flex items-center gap-3 bg-amber-500 px-4 py-2 text-[13px] font-medium text-white shadow-lg"
        style={{ top: bannerTop }}
      >
        <svg
          className="h-4 w-4 shrink-0 animate-spin"
          viewBox="0 0 24 24"
          fill="none"
          aria-label="Reconnecting"
          role="img"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
        <span className="truncate">
          Reconnecting... (attempt {backendConnection.reconnectAttempt}/
          {backendConnection.maxReconnectAttempts})
        </span>
      </div>
    );
  }

  // ── Failed: red banner with dismiss + retry ──────────────────────────
  if (
    backendConnection.state === "failed" &&
    !backendDisconnectedBannerDismissed
  ) {
    return (
      <div
        className="fixed left-0 right-0 z-[9999] flex items-center justify-between gap-3 bg-danger px-4 py-2 text-[13px] font-medium text-white shadow-lg"
        style={{ top: bannerTop }}
      >
        <span className="truncate">
          Connection lost after {backendConnection.maxReconnectAttempts}{" "}
          attempts. Real-time updates are paused.
        </span>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={dismissBackendDisconnectedBanner}
            className="rounded px-3 py-1 text-[12px] text-red-100 hover:bg-red-700 transition-colors cursor-pointer"
          >
            Dismiss
          </button>
          <button
            type="button"
            onClick={retryBackendConnection}
            className="rounded bg-white px-3 py-1 text-[12px] font-semibold text-red-700 hover:bg-red-50 transition-colors cursor-pointer"
          >
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  return null;
}
