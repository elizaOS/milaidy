import type { AgentSource } from "../../lib/AgentProvider";
import type { AgentStatus } from "../../lib/cloud-api";

interface AgentCardProps {
  agent: AgentStatus;
  source: AgentSource;
  sourceUrl?: string;
  webUiUrl?: string;
  nodeId?: string;
  lastHeartbeat?: string;
  billing?: {
    plan?: string;
    costPerHour?: number;
    totalCost?: number;
    currency?: string;
  };
  createdAt?: string;
  region?: string;
  onPlay: () => void;
  onResume: () => void;
  onPause: () => void;
  onStop: () => void;
  onSelect: () => void;
  onOpenUI?: () => void;
  selected: boolean;
}

const STATE_CONFIG: Record<
  string,
  { color: string; bg: string; label: string }
> = {
  running: {
    color: "text-emerald-400",
    bg: "bg-emerald-400",
    label: "Running",
  },
  paused: { color: "text-amber-400", bg: "bg-amber-400", label: "Paused" },
  stopped: { color: "text-red-400", bg: "bg-red-400", label: "Stopped" },
  provisioning: { color: "text-brand", bg: "bg-brand", label: "Starting" },
  unknown: { color: "text-text-muted", bg: "bg-text-muted", label: "Unknown" },
};

const SOURCE_LABEL: Record<string, string> = {
  cloud: "Cloud",
  local: "Local",
  remote: "Remote",
};

function formatUptime(seconds?: number): string {
  if (!seconds) return "—";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function formatRelativeTime(isoString?: string): string {
  if (!isoString) return "—";
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function stopProp(handler: () => void) {
  return (e: React.MouseEvent) => {
    e.stopPropagation();
    handler();
  };
}

function handleCardKeyDown(
  e: React.KeyboardEvent<HTMLDivElement>,
  onSelect: () => void,
) {
  if (e.target !== e.currentTarget) return;

  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    onSelect();
  }
}

export function AgentCard({
  agent,
  source,
  sourceUrl,
  webUiUrl,
  nodeId,
  lastHeartbeat,
  billing,
  createdAt,
  region,
  onPlay,
  onResume,
  onPause,
  onStop,
  onSelect,
  onOpenUI,
  selected,
}: AgentCardProps) {
  const stateConfig = STATE_CONFIG[agent.state] ?? STATE_CONFIG.unknown;
  const canOpenUI = agent.state === "running" || source === "cloud";
  const uiUrl = webUiUrl || sourceUrl;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => handleCardKeyDown(e, onSelect)}
      className={`group relative rounded-2xl cursor-pointer transition-all duration-200 text-left w-full
        ${
          selected
            ? "bg-surface ring-2 ring-brand/40 shadow-[0_0_24px_rgba(240,185,11,0.10)]"
            : "bg-surface/60 hover:bg-surface border border-border/60 hover:border-border"
        }`}
    >
      {/* Primary action: Open Web UI - full card top section */}
      {canOpenUI && uiUrl && (
        <button
          type="button"
          onClick={stopProp(() => {
            if (onOpenUI) {
              onOpenUI();
            } else if (uiUrl) {
              window.open(uiUrl, "_blank", "noopener,noreferrer");
            }
          })}
          className="w-full flex items-center justify-center gap-2 px-5 py-3
            bg-brand/8 hover:bg-brand/15 border-b border-brand/10
            text-brand font-medium text-sm rounded-t-2xl
            transition-all duration-150 group/ui"
        >
          <svg
            aria-hidden="true"
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
            />
          </svg>
          Open Web UI
          <svg
            aria-hidden="true"
            className="w-3 h-3 opacity-0 group-hover/ui:opacity-100 transition-opacity"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M13 7l5 5m0 0l-5 5m5-5H6"
            />
          </svg>
        </button>
      )}

      <div className="p-5">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-[15px] font-medium text-text-light truncate">
                {agent.agentName}
              </h3>
            </div>
            {agent.model && (
              <p className="text-xs text-text-muted mt-0.5 truncate">
                {agent.model}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 ml-3 flex-shrink-0">
            <span
              className={`w-2 h-2 rounded-full ${stateConfig.bg} ${agent.state === "provisioning" ? "status-dot-pulse" : ""}`}
            />
            <span className={`text-xs ${stateConfig.color}`}>
              {stateConfig.label}
            </span>
          </div>
        </div>

        {/* Stats row */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-text-muted mb-4">
          <span className="flex items-center gap-1.5">
            <svg
              aria-hidden="true"
              className="w-3.5 h-3.5 opacity-40"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            {formatUptime(agent.uptime)}
          </span>
          {agent.memories !== undefined && (
            <span className="flex items-center gap-1.5">
              <svg
                aria-hidden="true"
                className="w-3.5 h-3.5 opacity-40"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z"
                />
              </svg>
              {agent.memories}
            </span>
          )}
          {nodeId && (
            <span className="flex items-center gap-1.5" title="Node">
              <svg
                aria-hidden="true"
                className="w-3.5 h-3.5 opacity-40"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2"
                />
              </svg>
              {nodeId}
            </span>
          )}
          {lastHeartbeat && (
            <span
              className="flex items-center gap-1.5"
              title={`Last heartbeat: ${new Date(lastHeartbeat).toLocaleString()}`}
            >
              <svg
                aria-hidden="true"
                className="w-3.5 h-3.5 opacity-40"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
                />
              </svg>
              {formatRelativeTime(lastHeartbeat)}
            </span>
          )}
          {region && (
            <span className="flex items-center gap-1.5" title="Region">
              <svg
                aria-hidden="true"
                className="w-3.5 h-3.5 opacity-40"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              {region}
            </span>
          )}
          {createdAt && (
            <span
              className="flex items-center gap-1.5"
              title={`Created: ${new Date(createdAt).toLocaleString()}`}
            >
              <svg
                aria-hidden="true"
                className="w-3.5 h-3.5 opacity-40"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
              {formatRelativeTime(createdAt)}
            </span>
          )}
          {billing?.costPerHour !== undefined && (
            <span className="flex items-center gap-1.5" title="Cost per hour">
              <svg
                aria-hidden="true"
                className="w-3.5 h-3.5 opacity-40"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              ${billing.costPerHour.toFixed(2)}/hr
            </span>
          )}
          <span
            className={`ml-auto text-[11px] px-2 py-0.5 rounded-full
            ${
              source === "cloud"
                ? "bg-brand/10 text-brand"
                : source === "local"
                  ? "bg-emerald-500/10 text-emerald-400"
                  : "bg-accent/10 text-accent"
            }`}
          >
            {SOURCE_LABEL[source] ?? source}
          </span>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {agent.state === "stopped" && (
            <ActionButton onClick={stopProp(onPlay)} variant="success">
              Start
            </ActionButton>
          )}
          {agent.state === "paused" && (
            <ActionButton onClick={stopProp(onResume)} variant="success">
              Resume
            </ActionButton>
          )}
          {agent.state === "running" && (
            <ActionButton onClick={stopProp(onPause)} variant="warn">
              Pause
            </ActionButton>
          )}
          {agent.state !== "stopped" &&
            agent.state !== "provisioning" &&
            agent.state !== "unknown" && (
              <ActionButton onClick={stopProp(onStop)} variant="danger">
                Stop
              </ActionButton>
            )}
          {agent.state === "provisioning" && (
            <span className="text-xs text-brand animate-pulse">Starting…</span>
          )}
        </div>
      </div>
    </div>
  );
}

function ActionButton({
  onClick,
  variant,
  children,
}: {
  onClick: (e: React.MouseEvent) => void;
  variant: "success" | "warn" | "danger";
  children: React.ReactNode;
}) {
  const colors = {
    success: "text-emerald-400 hover:bg-emerald-500/10",
    warn: "text-amber-400 hover:bg-amber-500/10",
    danger: "text-red-400 hover:bg-red-500/10",
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 text-xs rounded-lg transition-all duration-150 ${colors[variant]}`}
    >
      {children}
    </button>
  );
}
