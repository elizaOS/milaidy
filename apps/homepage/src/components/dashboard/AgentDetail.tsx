import { useCallback, useState } from "react";
import type { ManagedAgent } from "../../lib/AgentProvider";
import type { AgentStatus } from "../../lib/cloud-api";
import { openWebUI } from "../../lib/open-web-ui";
import { ExportPanel } from "./ExportPanel";
import { LogsPanel } from "./LogsPanel";
import { MetricsPanel } from "./MetricsPanel";

const TABS = ["Overview", "Metrics", "Logs", "Snapshots"] as const;
type Tab = (typeof TABS)[number];

interface AgentDetailProps {
  agent: AgentStatus;
  managedAgent: ManagedAgent;
  connectionId: string;
  webUIUrl?: string;
}

function formatUptime(seconds?: number): string {
  if (!seconds) return "—";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return "—";
  try {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

const STATE_COLORS: Record<string, { text: string; bg: string }> = {
  running: { text: "text-emerald-400", bg: "bg-emerald-500" },
  paused: { text: "text-amber-400", bg: "bg-amber-500" },
  stopped: { text: "text-red-400", bg: "bg-red-500" },
  provisioning: { text: "text-brand", bg: "bg-brand" },
  unknown: { text: "text-text-muted", bg: "bg-text-muted" },
};

export function AgentDetail({
  agent,
  managedAgent,
  connectionId,
  webUIUrl,
}: AgentDetailProps) {
  const [tab, setTab] = useState<Tab>("Overview");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const handleCloudAction = useCallback(
    async (action: string) => {
      if (!managedAgent.cloudClient || !managedAgent.cloudAgentId) return;
      setActionLoading(action);
      setActionError(null);
      try {
        switch (action) {
          case "suspend":
            await managedAgent.cloudClient.suspendAgent(managedAgent.cloudAgentId);
            break;
          case "resume":
            await managedAgent.cloudClient.resumeAgent(managedAgent.cloudAgentId);
            break;
          case "snapshot":
            await managedAgent.cloudClient.takeSnapshot(managedAgent.cloudAgentId);
            break;
          case "delete":
            if (window.confirm(`Delete agent "${agent.agentName}"? This cannot be undone.`)) {
              await managedAgent.cloudClient.deleteAgent(managedAgent.cloudAgentId);
            }
            break;
        }
      } catch (err) {
        setActionError(err instanceof Error ? err.message : String(err));
      } finally {
        setActionLoading(null);
      }
    },
    [managedAgent, agent.agentName],
  );

  const stateColors = STATE_COLORS[agent.state] ?? STATE_COLORS.unknown;

  return (
    <div className="border border-border bg-surface overflow-hidden">
      {/* Terminal-style header bar */}
      <div className="flex items-center justify-between gap-4 px-4 py-2.5 bg-dark-secondary border-b border-border">
        <div className="flex items-center gap-3">
          {/* Window controls aesthetic */}
          <div className="flex items-center gap-1.5">
            <span className={`w-2.5 h-2.5 rounded-full ${stateColors.bg} ${agent.state === "running" ? "status-pulse" : ""}`} />
          </div>
          
          {/* Agent name */}
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-medium text-text-light">
              {agent.agentName}
            </span>
            <span className={`font-mono text-[10px] tracking-wider ${stateColors.text}`}>
              [{agent.state.toUpperCase()}]
            </span>
          </div>
        </div>

        {/* Quick actions */}
        <div className="flex items-center gap-2">
          {webUIUrl && (
            <button
              type="button"
              onClick={() => openWebUI(webUIUrl, managedAgent.source)}
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
      </div>

      {/* Tab navigation - terminal style */}
      <div className="flex items-center border-b border-border bg-dark/50">
        {TABS.map((t) => (
          <button
            type="button"
            key={t}
            onClick={() => setTab(t)}
            className={`relative px-5 py-3 font-mono text-xs tracking-wide transition-all duration-150
              ${tab === t
                ? "text-brand bg-surface"
                : "text-text-muted hover:text-text-light hover:bg-surface/50"
              }`}
          >
            {t.toUpperCase()}
            {tab === t && (
              <span className="absolute bottom-0 left-0 right-0 h-px bg-brand" />
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="p-5">
        {tab === "Overview" && (
          <OverviewTab
            agent={agent}
            managedAgent={managedAgent}
            onAction={handleCloudAction}
            actionLoading={actionLoading}
            actionError={actionError}
          />
        )}
        {tab === "Metrics" && <MetricsPanel />}
        {tab === "Logs" && <LogsPanel />}
        {tab === "Snapshots" && <ExportPanel connectionId={connectionId} />}
      </div>
    </div>
  );
}

function OverviewTab({
  agent,
  managedAgent,
  onAction,
  actionLoading,
  actionError,
}: {
  agent: AgentStatus;
  managedAgent: ManagedAgent;
  onAction: (action: string) => void;
  actionLoading: string | null;
  actionError: string | null;
}) {
  const isCloud = managedAgent.source === "cloud";
  const stateColors = STATE_COLORS[agent.state] ?? STATE_COLORS.unknown;

  return (
    <div className="space-y-6">
      {/* Primary stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-border">
        <DataBlock label="STATUS">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${stateColors.bg}`} />
            <span className={`font-mono ${stateColors.text}`}>
              {agent.state.toUpperCase()}
            </span>
          </div>
        </DataBlock>
        <DataBlock label="MODEL">
          <span className="font-mono text-text-light">{agent.model || "—"}</span>
        </DataBlock>
        <DataBlock label="UPTIME">
          <span className="font-mono text-text-light tabular-nums">
            {formatUptime(agent.uptime)}
          </span>
        </DataBlock>
        <DataBlock label="MEMORIES">
          <span className="font-mono text-text-light tabular-nums">
            {agent.memories !== undefined ? agent.memories.toLocaleString() : "—"}
          </span>
        </DataBlock>
      </div>

      {/* Extended info for cloud agents */}
      {isCloud && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-border">
          <DataBlock label="SOURCE">
            <span className="font-mono text-brand">ELIZA CLOUD</span>
          </DataBlock>
          <DataBlock label="REGION">
            <span className="font-mono text-text-light">
              {managedAgent.region?.toUpperCase() ?? "AUTO"}
            </span>
          </DataBlock>
          <DataBlock label="CREATED">
            <span className="font-mono text-text-light text-xs">
              {formatDate(managedAgent.createdAt)}
            </span>
          </DataBlock>
          {managedAgent.billing && (
            <DataBlock label="HOURLY RATE">
              <span className="font-mono text-brand tabular-nums">
                {managedAgent.billing.costPerHour != null
                  ? `$${managedAgent.billing.costPerHour.toFixed(2)}/HR`
                  : managedAgent.billing.plan?.toUpperCase() ?? "—"}
              </span>
            </DataBlock>
          )}
        </div>
      )}

      {/* Billing summary */}
      {managedAgent.billing?.totalCost != null && (
        <div className="border border-brand/20 bg-brand/5 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-mono text-[10px] tracking-wider text-text-subtle mb-1">
                TOTAL SPENT
              </p>
              <p className="font-mono text-2xl font-semibold text-brand tabular-nums">
                ${managedAgent.billing.totalCost.toFixed(2)}
                {managedAgent.billing.currency && (
                  <span className="text-sm text-text-muted ml-1">
                    {managedAgent.billing.currency}
                  </span>
                )}
              </p>
            </div>
            {managedAgent.billing.plan && (
              <div className="text-right">
                <p className="font-mono text-[10px] tracking-wider text-text-subtle mb-1">
                  PLAN
                </p>
                <p className="font-mono text-sm text-text-light">
                  {managedAgent.billing.plan.toUpperCase()}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Cloud actions */}
      {isCloud && managedAgent.cloudClient && managedAgent.cloudAgentId && (
        <div className="pt-4 border-t border-border">
          <p className="font-mono text-[10px] tracking-wider text-text-subtle mb-4">
            ACTIONS
          </p>
          <div className="flex flex-wrap gap-2">
            {(agent.state === "running" || agent.state === "paused") && (
              <CloudActionButton
                label="SUSPEND"
                action="suspend"
                variant="warn"
                loading={actionLoading}
                onClick={onAction}
              />
            )}
            {(agent.state === "stopped" || agent.state === "paused") && (
              <CloudActionButton
                label="RESUME"
                action="resume"
                variant="success"
                loading={actionLoading}
                onClick={onAction}
              />
            )}
            <CloudActionButton
              label="SNAPSHOT"
              action="snapshot"
              variant="default"
              loading={actionLoading}
              onClick={onAction}
            />
            <CloudActionButton
              label="DELETE"
              action="delete"
              variant="danger"
              loading={actionLoading}
              onClick={onAction}
            />
          </div>
          {actionError && (
            <p className="mt-3 font-mono text-xs text-red-400">{actionError}</p>
          )}
        </div>
      )}
    </div>
  );
}

function DataBlock({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-surface p-4">
      <dt className="font-mono text-[10px] tracking-wider text-text-subtle mb-2">
        {label}
      </dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

function CloudActionButton({
  label,
  action,
  variant,
  loading,
  onClick,
}: {
  label: string;
  action: string;
  variant: "success" | "warn" | "danger" | "default";
  loading: string | null;
  onClick: (action: string) => void;
}) {
  const isLoading = loading === action;
  const colors = {
    success: "text-emerald-400 hover:bg-emerald-500/10 border-emerald-500/20",
    warn: "text-amber-400 hover:bg-amber-500/10 border-amber-500/20",
    danger: "text-red-400 hover:bg-red-500/10 border-red-500/20",
    default: "text-text-muted hover:text-text-light hover:bg-surface-elevated border-border",
  };

  return (
    <button
      type="button"
      onClick={() => onClick(action)}
      disabled={loading !== null}
      className={`flex items-center gap-2 px-4 py-2.5 font-mono text-[11px] tracking-wide 
        border transition-all duration-150 disabled:opacity-40
        ${colors[variant]}`}
    >
      {isLoading ? (
        <div className="w-3 h-3 rounded-full border border-current/30 border-t-current animate-spin" />
      ) : null}
      {label}
    </button>
  );
}
