import { useApp } from "../AppContext";

/**
 * Banner shown when WebSocket reconnection attempts are exhausted.
 * Offers a manual Retry button to restart the connection cycle.
 */
export function ConnectionFailedBanner() {
  const {
    backendConnection,
    backendDisconnectedBannerDismissed,
    dismissBackendDisconnectedBanner,
    retryBackendConnection,
  } = useApp();

  if (
    !backendConnection ||
    backendConnection.state !== "failed" ||
    backendDisconnectedBannerDismissed
  ) {
    return null;
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] flex items-center justify-between gap-3 bg-danger px-4 py-2 text-[13px] font-medium text-white shadow-lg">
      <span className="truncate">
        Connection lost after {backendConnection.maxReconnectAttempts} attempts.
        Real-time updates are paused.
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
