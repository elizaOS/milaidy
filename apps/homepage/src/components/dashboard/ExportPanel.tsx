import { useCallback, useEffect, useState } from "react";
import { useAgents } from "../../lib/AgentProvider";
import type { CloudBackup } from "../../lib/cloud-api";

interface ExportPanelProps {
  connectionId: string;
}

export function ExportPanel({ connectionId }: ExportPanelProps) {
  const { agents } = useAgents();
  const agent = agents.find((a) => a.id === connectionId);

  const [status, setStatus] = useState<string | null>(null);
  const [backups, setBackups] = useState<CloudBackup[]>([]);
  const [backupsLoading, setBackupsLoading] = useState(false);

  const hasCloud = agent?.cloudClient && agent.cloudAgentId;

  useEffect(() => {
    if (!hasCloud) return;
    setBackupsLoading(true);
    agent.cloudClient
      ?.listBackups(agent.cloudAgentId ?? "")
      .then(setBackups)
      .catch(() => setBackups([]))
      .finally(() => setBackupsLoading(false));
  }, [hasCloud, agent?.cloudAgentId, agent?.cloudClient]);

  const handleSnapshot = useCallback(async () => {
    if (!agent?.cloudClient || !agent.cloudAgentId) return;
    setStatus("Creating snapshot...");
    try {
      await agent.cloudClient.takeSnapshot(agent.cloudAgentId);
      setStatus("Snapshot created");
      const updated = await agent.cloudClient.listBackups(agent.cloudAgentId);
      setBackups(updated);
      setTimeout(() => setStatus(null), 3000);
    } catch (err) {
      setStatus(`Error: ${err}`);
    }
  }, [agent]);

  const handleRestore = useCallback(
    async (backupId: string) => {
      if (!agent?.cloudClient || !agent.cloudAgentId) return;
      setStatus("Restoring...");
      try {
        await agent.cloudClient.restoreBackup(agent.cloudAgentId, backupId);
        setStatus("Restore complete");
        setTimeout(() => setStatus(null), 3000);
      } catch (err) {
        setStatus(`Restore failed: ${err}`);
      }
    },
    [agent],
  );

  if (!connectionId) {
    return (
      <div className="text-center py-12">
        <p className="font-mono text-xs text-text-subtle mb-2">
          NO AGENT SELECTED
        </p>
        <p className="font-mono text-xs text-text-muted">
          Select an agent from the Agents panel to manage snapshots.
        </p>
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="text-center py-12">
        <p className="font-mono text-xs text-text-muted">Agent not found</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] tracking-[0.15em] text-text-subtle mb-1">
            SNAPSHOTS
          </p>
          <p className="font-mono text-sm text-text-light">{agent.name}</p>
        </div>
        <button
          type="button"
          onClick={handleSnapshot}
          disabled={!hasCloud}
          className="px-4 py-2 bg-brand text-dark font-mono text-xs font-semibold tracking-wide
            hover:bg-brand-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          + TAKE SNAPSHOT
        </button>
      </div>

      {/* Status message */}
      {status && (
        <div
          className={`px-4 py-2 border font-mono text-xs ${
            status.startsWith("Error") || status.startsWith("Restore failed")
              ? "border-red-500/30 bg-red-500/5 text-red-400"
              : "border-brand/30 bg-brand/5 text-brand"
          }`}
        >
          {status}
        </div>
      )}

      {/* Backups list */}
      {backupsLoading ? (
        <div className="flex items-center gap-2 py-8 justify-center">
          <div className="w-4 h-4 rounded-full border-2 border-brand/30 border-t-brand animate-spin" />
          <span className="font-mono text-xs text-text-muted">
            Loading backups...
          </span>
        </div>
      ) : backups.length === 0 ? (
        <div className="border border-border bg-surface">
          <div className="px-4 py-2 bg-dark-secondary border-b border-border">
            <span className="font-mono text-[10px] tracking-wider text-text-subtle">
              BACKUP HISTORY
            </span>
          </div>
          <div className="p-8 text-center">
            <p className="font-mono text-xs text-text-muted mb-2">
              No snapshots yet
            </p>
            <p className="font-mono text-[10px] text-text-subtle">
              Snapshots capture agent state, memories, and configuration.
              <br />
              Use them to restore or migrate your agent.
            </p>
          </div>
        </div>
      ) : (
        <div className="border border-border bg-surface">
          <div className="px-4 py-2 bg-dark-secondary border-b border-border flex items-center justify-between">
            <span className="font-mono text-[10px] tracking-wider text-text-subtle">
              BACKUP HISTORY
            </span>
            <span className="font-mono text-[10px] text-text-subtle">
              {backups.length} snapshot{backups.length !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="divide-y divide-border-subtle">
            {backups.map((b) => (
              <div
                key={b.id}
                className="flex items-center justify-between px-4 py-3 hover:bg-surface-hover transition-colors"
              >
                <div>
                  <p className="font-mono text-xs text-text-light tabular-nums">
                    {b.id.slice(0, 12)}
                  </p>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="font-mono text-[10px] text-text-subtle">
                      {new Date(b.createdAt).toLocaleString()}
                    </span>
                    {b.size && (
                      <span className="font-mono text-[10px] text-text-subtle">
                        {(b.size / 1024 / 1024).toFixed(1)} MB
                      </span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleRestore(b.id)}
                  className="px-3 py-1.5 font-mono text-[10px] tracking-wide
                    border border-brand/20 text-brand
                    hover:bg-brand/10 transition-colors"
                >
                  RESTORE
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Info */}
      {!hasCloud && (
        <p className="font-mono text-[10px] text-text-subtle">
          Cloud snapshots are only available for Eliza Cloud agents.
        </p>
      )}
    </div>
  );
}
