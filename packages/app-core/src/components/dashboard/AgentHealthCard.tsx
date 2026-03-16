type AgentState =
  | "not_started"
  | "starting"
  | "running"
  | "stopped"
  | "restarting"
  | "error";

interface AgentHealthCardProps {
  state: AgentState;
  agentName: string;
  model: string | undefined;
  startedAt: number | undefined;
  uptime: number | undefined;
  onStart?: () => void;
  onStop?: () => void;
}

const STATE_COLORS: Record<AgentState, string> = {
  running: "bg-green-500",
  starting: "bg-blue-500 animate-pulse",
  restarting: "bg-yellow-500 animate-pulse",
  stopped: "bg-red-500",
  error: "bg-red-500 animate-pulse",
  not_started: "bg-zinc-500",
};

const STATE_LABELS: Record<AgentState, string> = {
  running: "Running",
  starting: "Starting...",
  restarting: "Restarting...",
  stopped: "Stopped",
  error: "Error",
  not_started: "Not Started",
};

export function formatUptime(ms: number | undefined): string {
  if (!ms || ms <= 0) return "\u2014";
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

export function AgentHealthCard({
  state,
  agentName,
  model,
  startedAt,
  uptime,
  onStart,
  onStop,
}: AgentHealthCardProps) {
  const computedUptime =
    uptime ?? (startedAt ? Date.now() - startedAt : undefined);
  const isRunning =
    state === "running" || state === "starting" || state === "restarting";

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className={`h-3 w-3 rounded-full ${STATE_COLORS[state]}`} />
        <span className="text-sm font-medium text-[var(--text)]">
          {STATE_LABELS[state]}
        </span>
      </div>
      <div className="space-y-1">
        <div className="text-lg font-semibold text-[var(--text-strong)]">
          {agentName}
        </div>
        {model && <div className="text-xs text-[var(--muted)]">{model}</div>}
      </div>
      {isRunning && (
        <div className="text-xs text-[var(--muted)]">
          Uptime: {formatUptime(computedUptime)}
        </div>
      )}
      <div className="flex gap-2 pt-1">
        {state === "not_started" ||
        state === "stopped" ||
        state === "error" ? (
          <button
            onClick={onStart}
            className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700"
          >
            Start
          </button>
        ) : state === "running" ? (
          <button
            onClick={onStop}
            className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700"
          >
            Stop
          </button>
        ) : null}
      </div>
    </div>
  );
}
