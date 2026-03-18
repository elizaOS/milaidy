import { useState } from "react";
import { useAgents } from "../../lib/AgentProvider";
import { isAuthenticated } from "../../lib/auth";
import { ConnectionModal } from "./ConnectionModal";

export function SourceBar() {
  const { agents, loading, refresh, addRemoteUrl } = useAgents();
  const [showAddRemote, setShowAddRemote] = useState(false);

  const cloudCount = agents.filter((a) => a.source === "cloud").length;
  const localCount = agents.filter((a) => a.source === "local").length;
  const remoteCount = agents.filter((a) => a.source === "remote").length;
  const authed = isAuthenticated();

  return (
    <div className="px-8 py-3 border-b border-white/10 flex items-center gap-6 text-xs font-mono">
      {/* Cloud source */}
      <div className="flex items-center gap-2">
        <span
          className={`w-1.5 h-1.5 rounded-full ${authed && cloudCount > 0 ? "bg-green-500" : authed ? "bg-yellow-500" : "bg-white/20"}`}
        />
        <span className="text-text-muted">
          {!authed
            ? "cloud (not connected)"
            : cloudCount > 0
              ? `cloud (${cloudCount})`
              : "cloud (0 agents)"}
        </span>
      </div>

      {/* Local source */}
      <div className="flex items-center gap-2">
        <span
          className={`w-1.5 h-1.5 rounded-full ${localCount > 0 ? "bg-green-500" : "bg-white/20"}`}
        />
        <span className="text-text-muted">
          {localCount > 0 ? `local (${localCount})` : "local (offline)"}
        </span>
      </div>

      {/* Remote source */}
      {remoteCount > 0 && (
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
          <span className="text-text-muted">remote ({remoteCount})</span>
        </div>
      )}

      <div className="ml-auto flex items-center gap-3">
        <button
          type="button"
          onClick={() => setShowAddRemote(true)}
          className="text-text-muted hover:text-brand transition-colors uppercase tracking-widest"
        >
          + Remote
        </button>
        <button
          type="button"
          onClick={() => refresh()}
          className={`text-text-muted hover:text-brand transition-colors uppercase tracking-widest ${loading ? "animate-pulse" : ""}`}
        >
          Refresh
        </button>
      </div>

      {showAddRemote && (
        <ConnectionModal
          onSubmit={(data) => {
            addRemoteUrl(data.name, data.url);
            setShowAddRemote(false);
          }}
          onClose={() => setShowAddRemote(false)}
        />
      )}
    </div>
  );
}
