import { useApp } from "../AppContext";

/**
 * Minimal Companion scaffold for upstream.
 *
 * This view is intentionally lightweight and feature-flagged. It allows
 * iterative Companion work without changing default navigation behavior.
 */
export function CompanionView() {
  const { agentStatus, setTab } = useApp();

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      <section className="border border-border bg-card rounded-lg p-4 sm:p-5">
        <div className="text-xs uppercase tracking-wide text-muted mb-2">
          Experimental
        </div>
        <h2 className="text-xl font-semibold text-txt-strong mb-2">
          Companion Mode (Scaffold)
        </h2>
        <p className="text-sm text-muted">
          Companion mode is enabled via feature flag and currently uses a minimal
          scaffold in upstream. Core workflows remain available from existing
          tabs while we iterate in small PRs.
        </p>
      </section>

      <section className="border border-border bg-card rounded-lg p-4 sm:p-5">
        <div className="text-sm text-muted mb-1">Agent Status</div>
        <div className="text-base font-medium text-txt-strong capitalize">
          {agentStatus?.state ?? "unknown"}
        </div>
        <div className="text-xs text-muted mt-1">
          {agentStatus?.agentName ?? "Milady"}
        </div>
      </section>

      <section className="border border-border bg-card rounded-lg p-4 sm:p-5">
        <div className="text-sm font-medium text-txt-strong mb-3">
          Quick Navigation
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn text-xs py-2 px-3"
            onClick={() => setTab("chat")}
          >
            Open Chat
          </button>
          <button
            type="button"
            className="btn text-xs py-2 px-3"
            onClick={() => setTab("character")}
          >
            Open Character
          </button>
          <button
            type="button"
            className="btn text-xs py-2 px-3"
            onClick={() => setTab("settings")}
          >
            Open Settings
          </button>
        </div>
      </section>
    </div>
  );
}
