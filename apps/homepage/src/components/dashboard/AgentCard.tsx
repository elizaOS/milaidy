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
  { color: string; bg: string; bgLight: string; label: string; border: string }
> = {
  running: {
    color: "text-emerald-400",
    bg: "bg-emerald-500",
    bgLight: "bg-emerald-500/10",
    border: "border-emerald-500/20",
    label: "LIVE",
  },
  paused: {
    color: "text-amber-400",
    bg: "bg-amber-500",
    bgLight: "bg-amber-500/10",
    border: "border-amber-500/20",
    label: "PAUSED",
  },
  stopped: {
    color: "text-red-400",
    bg: "bg-red-500",
    bgLight: "bg-red-500/10",
    border: "border-red-500/20",
    label: "STOPPED",
  },
  provisioning: {
    color: "text-brand",
    bg: "bg-brand",
    bgLight: "bg-brand/10",
    border: "border-brand/20",
    label: "STARTING",
  },
  unknown: {
    color: "text-text-muted",
    bg: "bg-text-muted",
    bgLight: "bg-text-muted/10",
    border: "border-text-muted/20",
    label: "OFFLINE",
  },
};

/** Generate initials from agent name */
function getInitials(name: string): string {
  const words = name.trim().split(/[\s_-]+/);
  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }
  return (words[0][0] + words[1][0]).toUpperCase();
}

const SOURCE_ICON: Record<string, string> = {
  cloud: "☁",
  local: "◉",
  remote: "⬡",
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
  if (!isoString) return "";
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function stopProp(handler: () => void) {
  return (e: React.MouseEvent) => {
    e.stopPropagation();
    handler();
  };
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
  const initials = getInitials(agent.agentName);
  const isLive = agent.state === "running";
  const isProvisioning = agent.state === "provisioning";

  return (
    <article
      onClick={onSelect}
      className={`group relative cursor-pointer transition-all duration-200 
        ${selected 
          ? "ring-1 ring-brand/50" 
          : "hover:ring-1 hover:ring-border"
        }`}
    >
      {/* Status accent bar - left edge */}
      <div
        className={`absolute left-0 top-0 bottom-0 w-1 transition-all duration-300
          ${stateConfig.bg} ${isLive || isProvisioning ? "status-pulse" : ""}`}
      />

      {/* Card body */}
      <div className={`bg-surface border border-border ${selected ? "border-brand/30" : ""}`}>
        {/* Header row */}
        <div className="flex items-start gap-4 p-4 pb-0">
          {/* Agent avatar - prominent */}
          <div
            className={`w-12 h-12 flex items-center justify-center flex-shrink-0
              ${stateConfig.bgLight} ${stateConfig.border} border`}
          >
            <span className={`font-mono text-sm font-semibold ${stateConfig.color}`}>
              {initials}
            </span>
          </div>

          {/* Agent identity */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-[15px] font-medium text-text-light truncate leading-tight">
                {agent.agentName}
              </h3>
              <span className="text-text-subtle text-xs" title={source}>
                {SOURCE_ICON[source]}
              </span>
            </div>
            {agent.model && (
              <p className="text-xs text-text-muted mt-0.5 font-mono truncate">
                {agent.model}
              </p>
            )}
          </div>

          {/* Status badge - prominent */}
          <div
            className={`flex items-center gap-2 px-3 py-1.5 flex-shrink-0
              ${stateConfig.bgLight} ${stateConfig.border} border`}
          >
            <span
              className={`w-2 h-2 rounded-full ${stateConfig.bg}
                ${isLive || isProvisioning ? "status-pulse" : ""}`}
            />
            <span className={`font-mono text-[11px] font-medium tracking-wide ${stateConfig.color}`}>
              {stateConfig.label}
            </span>
          </div>
        </div>

        {/* Stats grid - data-dense Bloomberg style */}
        <div className="grid grid-cols-4 gap-px mt-4 bg-border-subtle">
          <StatCell label="UPTIME" value={formatUptime(agent.uptime)} />
          <StatCell 
            label="MEMORY" 
            value={agent.memories !== undefined ? String(agent.memories) : "—"} 
          />
          <StatCell 
            label="HEARTBEAT" 
            value={formatRelativeTime(lastHeartbeat) || "—"}
          />
          <StatCell 
            label="COST" 
            value={billing?.costPerHour !== undefined ? `$${billing.costPerHour.toFixed(2)}` : "—"}
            accent
          />
        </div>

        {/* Actions row */}
        <div className="flex items-center justify-between gap-2 p-3 bg-dark-secondary/50">
          {/* Control actions */}
          <div className="flex items-center gap-1">
            {agent.state === "stopped" && (
              <ActionBtn onClick={stopProp(onPlay)} variant="success" icon="▶" label="Start" />
            )}
            {agent.state === "paused" && (
              <ActionBtn onClick={stopProp(onResume)} variant="success" icon="▶" label="Resume" />
            )}
            {agent.state === "running" && (
              <ActionBtn onClick={stopProp(onPause)} variant="warn" icon="⏸" label="Pause" />
            )}
            {agent.state !== "stopped" && agent.state !== "provisioning" && agent.state !== "unknown" && (
              <ActionBtn onClick={stopProp(onStop)} variant="danger" icon="■" label="Stop" />
            )}
            {agent.state === "provisioning" && (
              <span className="text-[11px] font-mono text-brand animate-pulse px-2">
                Starting…
              </span>
            )}
          </div>

          {/* Open UI - primary when available */}
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
              className="flex items-center gap-1.5 px-3 py-1.5 
                bg-brand text-dark font-mono text-[11px] font-semibold tracking-wide
                hover:bg-brand-hover transition-colors"
            >
              OPEN UI
              <svg
                aria-hidden="true"
                className="w-3 h-3"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25" />
              </svg>
            </button>
          )}
        </div>

        {/* Extended info when selected */}
        {selected && (nodeId || region || createdAt) && (
          <div className="px-4 py-3 border-t border-border-subtle bg-dark-secondary/30">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] font-mono text-text-subtle">
              {nodeId && <span>NODE: {nodeId}</span>}
              {region && <span>REGION: {region.toUpperCase()}</span>}
              {createdAt && <span>CREATED: {formatRelativeTime(createdAt)}</span>}
            </div>
          </div>
        )}
      </div>
    </article>
  );
}

function StatCell({ 
  label, 
  value, 
  accent 
}: { 
  label: string; 
  value: string; 
  accent?: boolean;
}) {
  return (
    <div className="bg-surface px-3 py-2.5">
      <p className="text-[9px] font-mono font-medium text-text-subtle tracking-wider mb-0.5">
        {label}
      </p>
      <p className={`text-sm font-mono font-medium tabular-nums
        ${accent ? "text-brand" : "text-text-light"}`}>
        {value}
      </p>
    </div>
  );
}

function ActionBtn({
  onClick,
  variant,
  icon,
  label,
}: {
  onClick: (e: React.MouseEvent) => void;
  variant: "success" | "warn" | "danger";
  icon: string;
  label: string;
}) {
  const colors = {
    success: "text-emerald-400 hover:bg-emerald-500/10 border-emerald-500/20",
    warn: "text-amber-400 hover:bg-amber-500/10 border-amber-500/20",
    danger: "text-red-400 hover:bg-red-500/10 border-red-500/20",
  };

  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 
        font-mono text-[11px] font-medium border transition-all duration-150 
        ${colors[variant]}`}
    >
      <span className="text-xs">{icon}</span>
      {label}
    </button>
  );
}
