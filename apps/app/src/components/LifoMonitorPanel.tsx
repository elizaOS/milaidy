import type { SandboxBrowserEndpoints, SandboxWindowInfo } from "../api-client";

interface LifoMonitorPanelProps {
  monitorOnline: boolean;
  monitorError: string | null;
  monitorUpdatedAt: number | null;
  noVncActive: boolean;
  safeNoVncEndpoint: string | null;
  noVncFailed: boolean;
  setNoVncFailed: React.Dispatch<React.SetStateAction<boolean>>;
  screenPreviewUrl: string | null;
  browserEndpoints: SandboxBrowserEndpoints | null;
  sandboxWindows: SandboxWindowInfo[];
  noVncEndpoint: string | null;
  refreshMonitorMeta: () => Promise<void>;
  refreshScreenPreview: () => Promise<void>;
  setMonitorOnline: React.Dispatch<React.SetStateAction<boolean>>;
  setMonitorError: React.Dispatch<React.SetStateAction<string | null>>;
}

export function LifoMonitorPanel({
  monitorOnline,
  monitorError,
  monitorUpdatedAt,
  noVncActive,
  safeNoVncEndpoint,
  noVncFailed,
  setNoVncFailed,
  screenPreviewUrl,
  browserEndpoints,
  sandboxWindows,
  noVncEndpoint,
  refreshMonitorMeta,
  refreshScreenPreview,
  setMonitorOnline,
  setMonitorError,
}: LifoMonitorPanelProps) {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-[2fr_1fr] gap-3">
      <div className="rounded-xl border border-border overflow-hidden bg-panel min-h-[320px]">
        <div className="px-3 py-2 border-b border-border flex items-center justify-between gap-2">
          <div>
            <div className="text-xs font-semibold text-txt">
              Lifo Computer-Use Surface
            </div>
            <div className="text-[11px] text-muted">
              Watch-only desktop mirror of what the autonomous agent is doing.
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`rounded-full px-2 py-1 text-[11px] font-medium ${
                monitorOnline ? "bg-ok/20 text-ok" : "bg-warn/20 text-warn"
              }`}
            >
              {monitorOnline ? "live" : "offline"}
            </span>
            <button
              type="button"
              onClick={() => {
                setNoVncFailed(false);
                void refreshMonitorMeta();
                void refreshScreenPreview();
              }}
              className="px-2.5 py-1 rounded-md border border-border bg-card text-[11px] text-txt hover:border-accent hover:text-accent transition-colors"
            >
              Refresh
            </button>
          </div>
        </div>

        <div className="h-[320px] bg-black/90 flex items-center justify-center overflow-hidden">
          {noVncActive && safeNoVncEndpoint ? (
            <iframe
              src={safeNoVncEndpoint}
              title="Sandbox live noVNC surface"
              className="h-full w-full border-0"
              sandbox="allow-scripts allow-forms allow-pointer-lock"
              onLoad={() => {
                setMonitorOnline(true);
                setMonitorError(null);
              }}
              onError={() => {
                setNoVncFailed(true);
                setMonitorOnline(false);
                setMonitorError(
                  "Live noVNC surface unavailable. Falling back to screenshots.",
                );
              }}
            />
          ) : screenPreviewUrl ? (
            <img
              src={screenPreviewUrl}
              alt="Sandbox computer-use surface"
              className="h-full w-full object-contain"
            />
          ) : (
            <p className="px-4 text-center text-xs text-muted">
              Waiting for sandbox screen frames...
            </p>
          )}
        </div>

        <div className="px-3 py-2 border-t border-border text-[11px] text-muted">
          {monitorUpdatedAt
            ? `Last frame: ${new Date(monitorUpdatedAt).toLocaleTimeString()}`
            : "No frames captured yet"}
        </div>
      </div>

      <div className="rounded-xl border border-border overflow-hidden bg-panel min-h-[320px]">
        <div className="px-3 py-2 border-b border-border">
          <div className="text-xs font-semibold text-txt">
            Browser + Sandbox Context
          </div>
          <div className="text-[11px] text-muted">
            Agent controls browser/computer tools; this panel mirrors state.
          </div>
        </div>

        <div className="p-3 space-y-3 text-[11px]">
          <div>
            <div className="text-muted uppercase tracking-wide text-[10px]">
              Live Surface
            </div>
            <div className="mt-1 rounded border border-border bg-card px-2 py-1 text-txt break-all">
              {noVncEndpoint && !noVncFailed
                ? "noVNC"
                : noVncEndpoint
                  ? "noVNC failed → screenshot fallback"
                  : "Screenshot fallback"}
            </div>
          </div>

          <div>
            <div className="text-muted uppercase tracking-wide text-[10px]">
              CDP Endpoint
            </div>
            <div className="mt-1 rounded border border-border bg-card px-2 py-1 text-txt break-all">
              {browserEndpoints?.cdpEndpoint ?? "Unavailable"}
            </div>
          </div>

          <div>
            <div className="text-muted uppercase tracking-wide text-[10px]">
              WS Endpoint
            </div>
            <div className="mt-1 rounded border border-border bg-card px-2 py-1 text-txt break-all">
              {browserEndpoints?.wsEndpoint ?? "Unavailable"}
            </div>
          </div>

          <div>
            <div className="text-muted uppercase tracking-wide text-[10px]">
              noVNC Endpoint
            </div>
            <div className="mt-1 rounded border border-border bg-card px-2 py-1 text-txt break-all">
              {browserEndpoints?.noVncEndpoint ?? "Unavailable"}
            </div>
          </div>

          <div>
            <div className="text-muted uppercase tracking-wide text-[10px]">
              Visible Windows ({sandboxWindows.length})
            </div>
            <div className="mt-1 max-h-[154px] overflow-auto rounded border border-border bg-card p-2 space-y-1">
              {sandboxWindows.length > 0 ? (
                sandboxWindows.slice(0, 20).map((windowInfo) => (
                  <div key={windowInfo.id} className="text-txt">
                    <span className="text-muted">{windowInfo.app}:</span>{" "}
                    {windowInfo.title || "(untitled)"}
                  </div>
                ))
              ) : (
                <div className="text-muted">No active windows reported.</div>
              )}
            </div>
          </div>

          {monitorError && (
            <div className="rounded border border-danger/40 bg-danger/10 px-2 py-1 text-danger">
              {monitorError}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
