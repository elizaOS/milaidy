import { useCallback, useState } from "react";
import type { ManagedAgent } from "../../lib/AgentProvider";
import type { AgentStatus } from "../../lib/cloud-api";
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
  if (d > 0) return `${d}d ${h}h ${m}m`;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return "—";
  try {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

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
            await managedAgent.cloudClient.suspendAgent(
              managedAgent.cloudAgentId,
            );
            break;
          case "resume":
            await managedAgent.cloudClient.resumeAgent(
              managedAgent.cloudAgentId,
            );
            break;
          case "snapshot":
            await managedAgent.cloudClient.takeSnapshot(
              managedAgent.cloudAgentId,
            );
            break;
          case "delete":
            if (
              window.confirm(
                `Delete agent "${agent.agentName}"? This cannot be undone.`,
              )
            ) {
              await managedAgent.cloudClient.deleteAgent(
                managedAgent.cloudAgentId,
              );
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

  return (
    <div className="rounded-2xl bg-surface border border-border overflow-hidden">
      {/* Tab bar */}
      <div className="flex flex-wrap items-center gap-y-2 border-b border-border px-1">
        {TABS.map((t) => (
          <button
            type="button"
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-3 text-sm transition-all duration-150 relative
              ${
                tab === t
                  ? "text-text-light"
                  : "text-text-muted hover:text-text-light"
              }`}
          >
            {t}
            {tab === t && (
              <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-brand rounded-full" />
            )}
          </button>
        ))}
        <div className="ml-auto flex w-full sm:w-auto items-center justify-between sm:justify-end gap-3 pr-4 pb-2 sm:pb-0">
          <span className="text-xs text-text-muted">{agent.agentName}</span>

          {webUIUrl && (
            <a
              href={webUIUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-dark bg-brand
                rounded-lg hover:bg-brand-hover transition-all duration-150 font-medium"
            >
              <svg
                aria-hidden="true"
                className="w-3.5 h-3.5"
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
            </a>
          )}
        </div>
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
  const stateColors: Record<string, string> = {
    running: "text-emerald-400",
    paused: "text-amber-400",
    stopped: "text-red-400",
    provisioning: "text-brand",
    unknown: "text-text-muted",
  };

  const isCloud = managedAgent.source === "cloud";

  return (
    <div className="space-y-6">
      {/* Stats grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-6">
        <InfoItem label="Status">
          <span className={stateColors[agent.state] ?? stateColors.unknown}>
            {agent.state.charAt(0).toUpperCase() + agent.state.slice(1)}
          </span>
        </InfoItem>
        <InfoItem label="Model">
          <span className="text-text-light">{agent.model}</span>
        </InfoItem>
        <InfoItem label="Uptime">
          <span className="text-text-light">{formatUptime(agent.uptime)}</span>
        </InfoItem>
        <InfoItem label="Memories">
          <span className="text-text-light">
            {agent.memories !== undefined ? agent.memories : "—"}
          </span>
        </InfoItem>
      </div>

      {/* Extended info for cloud agents */}
      {isCloud && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-6 pt-4 border-t border-border">
          <InfoItem label="Source">
            <span className="text-brand">Eliza Cloud</span>
          </InfoItem>
          <InfoItem label="Region">
            <span className="text-text-light">
              {managedAgent.region ?? "Auto"}
            </span>
          </InfoItem>
          <InfoItem label="Created">
            <span className="text-text-light">
              {formatDate(managedAgent.createdAt)}
            </span>
          </InfoItem>
          {managedAgent.billing && (
            <InfoItem label="Cost">
              <span className="text-text-light">
                {managedAgent.billing.costPerHour != null
                  ? `$${managedAgent.billing.costPerHour}/hr`
                  : (managedAgent.billing.plan ?? "—")}
              </span>
            </InfoItem>
          )}
        </div>
      )}

      {/* Billing summary if available */}
      {managedAgent.billing?.totalCost != null && (
        <div className="bg-brand/5 border border-brand/15 rounded-xl px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-xs text-text-muted">Total Spent</p>
            <p className="text-lg font-semibold text-brand">
              ${managedAgent.billing.totalCost.toFixed(2)}
              {managedAgent.billing.currency && (
                <span className="text-xs text-text-muted ml-1">
                  {managedAgent.billing.currency}
                </span>
              )}
            </p>
          </div>
          {managedAgent.billing.plan && (
            <div className="text-right">
              <p className="text-xs text-text-muted">Plan</p>
              <p className="text-sm text-text-light font-medium">
                {managedAgent.billing.plan}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Action buttons */}
      {isCloud && managedAgent.cloudClient && managedAgent.cloudAgentId && (
        <div className="pt-4 border-t border-border">
          <p className="text-xs text-text-muted mb-3">Actions</p>
          <div className="flex flex-wrap gap-2">
            {(agent.state === "running" || agent.state === "paused") && (
              <CloudActionButton
                label="Suspend"
                action="suspend"
                variant="warn"
                loading={actionLoading}
                onClick={onAction}
                icon={
                  <svg
                    aria-hidden="true"
                    className="w-3.5 h-3.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                }
              />
            )}
            {(agent.state === "stopped" || agent.state === "paused") && (
              <CloudActionButton
                label="Resume"
                action="resume"
                variant="success"
                loading={actionLoading}
                onClick={onAction}
                icon={
                  <svg
                    aria-hidden="true"
                    className="w-3.5 h-3.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                }
              />
            )}
            <CloudActionButton
              label="Snapshot"
              action="snapshot"
              variant="default"
              loading={actionLoading}
              onClick={onAction}
              icon={
                <svg
                  aria-hidden="true"
                  className="w-3.5 h-3.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
              }
            />
            <CloudActionButton
              label="Delete"
              action="delete"
              variant="danger"
              loading={actionLoading}
              onClick={onAction}
              icon={
                <svg
                  aria-hidden="true"
                  className="w-3.5 h-3.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
              }
            />
          </div>
          {actionError && (
            <p className="mt-2 text-xs text-red-400">{actionError}</p>
          )}
        </div>
      )}
    </div>
  );
}

function CloudActionButton({
  label,
  action,
  variant,
  loading,
  onClick,
  icon,
}: {
  label: string;
  action: string;
  variant: "success" | "warn" | "danger" | "default";
  loading: string | null;
  onClick: (action: string) => void;
  icon: React.ReactNode;
}) {
  const isLoading = loading === action;
  const colors = {
    success: "text-emerald-400 hover:bg-emerald-500/10 border-emerald-500/20",
    warn: "text-amber-400 hover:bg-amber-500/10 border-amber-500/20",
    danger: "text-red-400 hover:bg-red-500/10 border-red-500/20",
    default:
      "text-text-muted hover:text-text-light hover:bg-surface border-border",
  };

  return (
    <button
      type="button"
      onClick={() => onClick(action)}
      disabled={loading !== null}
      className={`flex items-center gap-1.5 px-3 py-2 text-xs rounded-lg border
        transition-all duration-150 disabled:opacity-40
        ${colors[variant]}`}
    >
      {isLoading ? (
        <div className="w-3.5 h-3.5 rounded-full border border-current/30 border-t-current animate-spin" />
      ) : (
        icon
      )}
      {label}
    </button>
  );
}

function InfoItem({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs text-text-muted mb-1">{label}</dt>
      <dd className="text-sm font-medium">{children}</dd>
    </div>
  );
}
