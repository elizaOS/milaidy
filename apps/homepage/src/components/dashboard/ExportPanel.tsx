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
    setStatus("Taking snapshot...");
    try {
      await agent.cloudClient.takeSnapshot(agent.cloudAgentId);
      setStatus("Snapshot created");
      const updated = await agent.cloudClient.listBackups(agent.cloudAgentId);
      setBackups(updated);
    } catch (err) {
      setStatus(`Snapshot failed: ${err}`);
    }
  }, [agent]);

  const handleRestore = useCallback(
    async (backupId: string) => {
      if (!agent?.cloudClient || !agent.cloudAgentId) return;
      setStatus("Restoring...");
      try {
        await agent.cloudClient.restoreBackup(agent.cloudAgentId, backupId);
        setStatus("Restore complete");
      } catch (err) {
        setStatus(`Restore failed: ${err}`);
      }
    },
    [agent],
  );

  if (!connectionId) {
    return (
      <div className="flex flex-col items-center justify-center py-32 space-y-3">
        <div className="text-text-muted/30 text-4xl">{"\u2913"}</div>
        <div className="text-text-muted font-mono text-sm">
          No agent selected
        </div>
        <div className="text-text-muted/50 font-mono text-xs">
          Select an agent from the Agents panel to manage snapshots.
        </div>
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="text-text-muted font-mono text-sm">Agent not found</div>
    );
  }

  return (
    <div className="space-y-6 max-w-lg">
      <h3 className="font-mono text-xs uppercase tracking-widest text-brand">
        Cloud Snapshots — {agent.name}
      </h3>

      <button
        type="button"
        onClick={handleSnapshot}
        className="px-4 py-2 bg-brand text-dark font-mono text-xs uppercase tracking-widest rounded hover:bg-brand-hover transition-colors"
      >
        Take Snapshot
      </button>

      {backupsLoading && (
        <div className="text-brand font-mono text-sm animate-pulse">
          Loading backups...
        </div>
      )}

      {!backupsLoading && backups.length === 0 && (
        <div className="text-text-muted font-mono text-xs">No backups yet.</div>
      )}

      {!backupsLoading && backups.length > 0 && (
        <div className="space-y-2">
          <div className="text-text-muted font-mono text-[10px] uppercase tracking-wider">
            Backups
          </div>
          {backups.map((b) => (
            <div
              key={b.id}
              className="flex items-center justify-between bg-dark border border-white/10 rounded p-3"
            >
              <div>
                <div className="text-text-light font-mono text-xs">
                  {b.id.slice(0, 12)}
                </div>
                <div className="text-text-muted font-mono text-[10px]">
                  {new Date(b.createdAt).toLocaleString()}
                  {b.size ? ` — ${(b.size / 1024 / 1024).toFixed(1)} MB` : ""}
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleRestore(b.id)}
                className="px-3 py-1 text-[10px] font-mono uppercase tracking-wider border border-brand/30 text-brand rounded hover:bg-brand/10 transition-colors"
              >
                Restore
              </button>
            </div>
          ))}
        </div>
      )}

      {status && <p className="text-xs font-mono text-text-muted">{status}</p>}
    </div>
  );
}
