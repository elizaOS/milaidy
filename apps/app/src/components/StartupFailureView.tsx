import type { StartupErrorState } from "../AppContext";

const REASON_LABELS: Record<StartupErrorState["reason"], string> = {
  "backend-timeout": "Backend Timeout",
  "backend-unreachable": "Backend Unreachable",
  "agent-timeout": "Agent Timeout",
  "agent-error": "Agent Error",
};

interface StartupFailureViewProps {
  error: StartupErrorState;
  onRetry: () => void;
}

const APP_ORIGIN_URL = "https://app.milady.ai";

export function StartupFailureView({
  error,
  onRetry,
}: StartupFailureViewProps) {
  const isBackendUnreachable = error.reason === "backend-unreachable";

  return (
    <div className="max-w-[680px] mx-auto mt-15 p-6 border border-border bg-card rounded-[10px]">
      <h1 className="text-lg font-semibold mb-2 text-danger">
        Startup failed: {REASON_LABELS[error.reason]}
      </h1>
      <p className="text-txt-strong mb-3 leading-relaxed">{error.message}</p>
      {isBackendUnreachable && (
        <p className="text-muted mb-3 leading-relaxed">
          This origin does not host the agent backend.
        </p>
      )}
      {error.detail && (
        <pre className="mb-4 p-3 border border-border rounded bg-bg-muted text-xs text-muted whitespace-pre-wrap break-words">
          {error.detail}
        </pre>
      )}
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="px-4 py-2 border border-accent bg-accent text-accent-fg text-sm cursor-pointer hover:bg-accent-hover"
          onClick={onRetry}
        >
          Retry Startup
        </button>
        {isBackendUnreachable && (
          <a
            href={APP_ORIGIN_URL}
            target="_blank"
            rel="noreferrer"
            className="px-4 py-2 border border-border bg-card text-txt text-sm hover:border-accent hover:text-accent"
          >
            Open App
          </a>
        )}
      </div>
    </div>
  );
}
