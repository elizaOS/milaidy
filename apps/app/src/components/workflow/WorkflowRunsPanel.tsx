import {
  CheckCircle2,
  ChevronLeft,
  Clock,
  Loader2,
  Pause,
  type Play,
  XCircle,
} from "lucide-react";
import type {
  WorkflowDef,
  WorkflowRunSummary,
  WorkflowStepEvent,
} from "../../api-client";

type WorkflowRunsPanelProps = {
  runs: WorkflowRunSummary[];
  workflow: WorkflowDef;
  onBack: () => void;
  onRefresh: () => void;
};

export function WorkflowRunsPanel({
  runs,
  workflow,
  onBack,
  onRefresh,
}: WorkflowRunsPanelProps) {
  return (
    <div className="p-4">
      <div className="flex items-center gap-3 mb-4">
        <button
          type="button"
          onClick={onBack}
          className="p-1 hover:bg-surface rounded"
        >
          <ChevronLeft size={18} />
        </button>
        <h2 className="text-sm font-medium">Runs: {workflow.name}</h2>
        <button
          type="button"
          onClick={onRefresh}
          className="text-xs px-2 py-1 rounded bg-surface hover:bg-surface/80 text-muted ml-auto"
        >
          Refresh
        </button>
      </div>

      {runs.length === 0 ? (
        <p className="text-xs text-muted">No runs yet.</p>
      ) : (
        <div className="space-y-2">
          {runs.map((run) => (
            <RunCard key={run.runId} run={run} />
          ))}
        </div>
      )}
    </div>
  );
}

function RunCard({ run }: { run: WorkflowRunSummary }) {
  const statusColors: Record<string, string> = {
    pending: "text-yellow-400",
    running: "text-blue-400",
    paused: "text-orange-400",
    sleeping: "text-indigo-400",
    completed: "text-green-400",
    failed: "text-red-400",
    cancelled: "text-gray-400",
  };

  const statusIcons: Record<string, typeof Play> = {
    pending: Clock,
    running: Loader2,
    paused: Pause,
    sleeping: Clock,
    completed: CheckCircle2,
    failed: XCircle,
    cancelled: XCircle,
  };

  const StatusIcon = statusIcons[run.status] ?? Clock;
  const colorClass = statusColors[run.status] ?? "text-muted";

  return (
    <div className="border border-border rounded-lg p-3 bg-surface/30">
      <div className="flex items-center gap-2 mb-2">
        <StatusIcon
          size={14}
          className={`${colorClass} ${run.status === "running" ? "animate-spin" : ""}`}
        />
        <span className={`text-xs font-medium ${colorClass}`}>
          {run.status}
        </span>
        <span className="text-xs text-muted ml-auto">
          {new Date(run.startedAt).toLocaleString()}
        </span>
      </div>

      <div className="text-xs text-muted mb-1">
        Run ID: {run.runId.slice(0, 8)}...
      </div>

      {run.error && (
        <div className="text-xs text-red-400 mt-1 p-1.5 rounded bg-red-500/5">
          {run.error}
        </div>
      )}

      {run.events.length > 0 && (
        <div className="mt-2 space-y-1">
          <div className="text-xs text-muted font-medium">Steps:</div>
          {run.events.map((event) => (
            <StepEventRow key={event.stepId} event={event} />
          ))}
        </div>
      )}
    </div>
  );
}

function StepEventRow({ event }: { event: WorkflowStepEvent }) {
  const statusLabel =
    event.status === "completed"
      ? "done"
      : event.status === "failed"
        ? "fail"
        : event.status === "started"
          ? "..."
          : event.status;

  return (
    <div className="flex items-center gap-2 text-xs pl-2">
      <span
        className={
          event.status === "completed"
            ? "text-green-400"
            : event.status === "failed"
              ? "text-red-400"
              : "text-muted"
        }
      >
        [{statusLabel}]
      </span>
      <span className="text-muted">{event.nodeLabel}</span>
      {event.error && (
        <span className="text-red-400 truncate">{event.error}</span>
      )}
    </div>
  );
}
