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

export function StartupFailureView({
  error,
  onRetry,
}: StartupFailureViewProps) {
  return (
    <div className="max-w-[680px] mx-auto mt-15 p-6 border border-border bg-card rounded-[10px]">
      <h1 className="text-lg font-semibold mb-2 text-danger">
        Startup failed: {REASON_LABELS[error.reason]}
      </h1>
      <p className="text-txt-strong mb-3 leading-relaxed">{error.message}</p>
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
      </div>
    </div>
  );
}
