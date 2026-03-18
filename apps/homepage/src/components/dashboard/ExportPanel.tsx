import { useCallback, useEffect, useRef, useState } from "react";
import { useAgents } from "../../lib/AgentProvider";
import type { CloudBackup } from "../../lib/cloud-api";

interface ExportPanelProps {
  connectionId: string;
}

export function ExportPanel({ connectionId }: ExportPanelProps) {
  const { agents } = useAgents();
  const agent = agents.find((a) => a.id === connectionId);

  // Local/remote export state
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Cloud backup state
  const [backups, setBackups] = useState<CloudBackup[]>([]);
  const [backupsLoading, setBackupsLoading] = useState(false);

  const isCloud = agent?.source === "cloud" && agent.cloudClient && agent.cloudAgentId;

  // Fetch cloud backups on mount / agent change
  useEffect(() => {
    if (!isCloud) return;
    setBackupsLoading(true);
    agent.cloudClient!.listBackups(agent.cloudAgentId!)
      .then(setBackups)
      .catch(() => setBackups([]))
      .finally(() => setBackupsLoading(false));
  }, [isCloud, agent?.cloudAgentId]);

  // Cloud: take snapshot
  const handleSnapshot = useCallback(async () => {
    if (!agent?.cloudClient || !agent.cloudAgentId) return;
    setStatus("Taking snapshot...");
    try {
      await agent.cloudClient.takeSnapshot(agent.cloudAgentId);
      setStatus("Snapshot created");
      // Refresh backup list
      const updated = await agent.cloudClient.listBackups(agent.cloudAgentId);
      setBackups(updated);
    } catch (err) {
      setStatus(`Snapshot failed: ${err}`);
    }
  }, [agent]);

  // Cloud: restore backup
  const handleRestore = useCallback(async (backupId: string) => {
    if (!agent?.cloudClient || !agent.cloudAgentId) return;
    setStatus("Restoring...");
    try {
      await agent.cloudClient.restoreBackup(agent.cloudAgentId, backupId);
      setStatus("Restore complete");
    } catch (err) {
      setStatus(`Restore failed: ${err}`);
    }
  }, [agent]);

  // Local/remote: export
  const handleExport = useCallback(async () => {
    if (!agent?.client || password.length < 4) return;
    setStatus("Exporting...");
    try {
      const blob = await agent.client.exportAgent(password);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `milady-agent-export-${Date.now()}.bin`;
      a.click();
      URL.revokeObjectURL(url);
      setStatus("Export complete");
    } catch (err) {
      setStatus(`Export failed: ${err}`);
    }
  }, [agent, password]);

  // Local/remote: import
  const handleImport = useCallback(async () => {
    if (!agent?.client || password.length < 4) return;
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setStatus("No file selected");
      return;
    }
    setStatus("Importing...");
    try {
      await agent.client.importAgent(file, password);
      setStatus("Import complete");
    } catch (err) {
      setStatus(`Import failed: ${err}`);
    }
  }, [agent, password]);

  if (!connectionId) {
    return (
      <div className="flex flex-col items-center justify-center py-32 space-y-3">
        <div className="text-text-muted/30 text-4xl">{"\u2913"}</div>
        <div className="text-text-muted font-mono text-sm">
          No agent selected
        </div>
        <div className="text-text-muted/50 font-mono text-xs">
          Select an agent from the Agents panel to export or import snapshots.
        </div>
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="text-text-muted font-mono text-sm">
        Agent not found
      </div>
    );
  }

  // Cloud agent: snapshot & backup UI
  if (isCloud) {
    return (
      <div className="space-y-6 max-w-lg">
        <h3 className="font-mono text-xs uppercase tracking-widest text-brand">
          Cloud Snapshots — {agent.name}
        </h3>

        <button
          onClick={handleSnapshot}
          className="px-4 py-2 bg-brand text-dark font-mono text-xs uppercase tracking-widest rounded hover:bg-brand-hover transition-colors"
        >
          Take Snapshot
        </button>

        {backupsLoading && (
          <div className="text-brand font-mono text-sm animate-pulse">Loading backups...</div>
        )}

        {!backupsLoading && backups.length === 0 && (
          <div className="text-text-muted font-mono text-xs">No backups yet.</div>
        )}

        {!backupsLoading && backups.length > 0 && (
          <div className="space-y-2">
            <div className="text-text-muted font-mono text-[10px] uppercase tracking-wider">Backups</div>
            {backups.map((b) => (
              <div key={b.id} className="flex items-center justify-between bg-dark border border-white/10 rounded p-3">
                <div>
                  <div className="text-text-light font-mono text-xs">{b.id.slice(0, 12)}</div>
                  <div className="text-text-muted font-mono text-[10px]">
                    {new Date(b.createdAt).toLocaleString()}
                    {b.size ? ` — ${(b.size / 1024 / 1024).toFixed(1)} MB` : ""}
                  </div>
                </div>
                <button
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

  // Local/remote agent: password-based export/import
  return (
    <div className="space-y-4 max-w-md">
      <label className="block">
        <span className="text-text-muted text-xs font-mono">
          Password (min 4 chars)
        </span>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1 w-full bg-dark border border-white/10 px-3 py-2 text-sm text-text-light font-mono rounded focus:border-brand focus:outline-none"
        />
      </label>

      <input ref={fileRef} type="file" className="hidden" />

      <div className="flex gap-3">
        <button
          onClick={handleExport}
          disabled={password.length < 4}
          className="px-4 py-2 bg-brand text-dark font-mono text-xs uppercase tracking-widest rounded hover:bg-brand-hover transition-colors disabled:opacity-30"
        >
          Export Agent
        </button>
        <button
          onClick={() => fileRef.current?.click()}
          className="px-4 py-2 border border-white/10 text-text-muted font-mono text-xs uppercase tracking-widest rounded hover:border-white/30 transition-colors"
        >
          Select File...
        </button>
        <button
          onClick={handleImport}
          disabled={password.length < 4}
          className="px-4 py-2 border border-white/10 text-text-muted font-mono text-xs uppercase tracking-widest rounded hover:border-white/30 transition-colors disabled:opacity-30"
        >
          Import Agent
        </button>
      </div>

      {status && <p className="text-xs font-mono text-text-muted">{status}</p>}
    </div>
  );
}
