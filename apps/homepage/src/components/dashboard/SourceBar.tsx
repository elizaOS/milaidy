import { useState } from "react";
import { useAgents } from "../../lib/AgentProvider";
import { isAuthenticated } from "../../lib/auth";
import { ConnectionModal } from "./ConnectionModal";

export type SourceFilter = "all" | "local" | "cloud" | "remote";

export function SourceBar() {
  const {
    agents,
    loading,
    refresh,
    addRemoteUrl,
    sourceFilter,
    setSourceFilter,
  } = useAgents();
  const [showAddRemote, setShowAddRemote] = useState(false);

  const cloudCount = agents.filter((a) => a.source === "cloud").length;
  const localCount = agents.filter((a) => a.source === "local").length;
  const remoteCount = agents.filter((a) => a.source === "remote").length;
  const authed = isAuthenticated();

  return (
    <div className="px-6 md:px-8 py-3 border-b border-border flex items-center gap-5 text-xs">
      {/* Source filter tabs */}
      <div className="flex items-center gap-1">
        <SourceTab
          label="All"
          count={agents.length}
          active={sourceFilter === "all"}
          onClick={() => setSourceFilter("all")}
        />
        <SourceTab
          label="Local"
          count={localCount}
          active={sourceFilter === "local"}
          onClick={() => setSourceFilter("local")}
          dotColor={localCount > 0 ? "bg-emerald-400" : "bg-text-muted/30"}
        />
        {authed && (
          <SourceTab
            label="Cloud"
            count={cloudCount}
            active={sourceFilter === "cloud"}
            onClick={() => setSourceFilter("cloud")}
            dotColor={cloudCount > 0 ? "bg-emerald-400" : "bg-amber-400"}
          />
        )}
        {remoteCount > 0 && (
          <SourceTab
            label="Remote"
            count={remoteCount}
            active={sourceFilter === "remote"}
            onClick={() => setSourceFilter("remote")}
            dotColor="bg-emerald-400"
          />
        )}
      </div>

      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          onClick={() => setShowAddRemote(true)}
          className="text-text-muted hover:text-text-light px-3 py-1.5 rounded-lg
            hover:bg-surface transition-all duration-150 text-xs"
        >
          + Connect
        </button>
        <button
          type="button"
          onClick={() => refresh()}
          className={`text-text-muted hover:text-text-light px-3 py-1.5 rounded-lg
            hover:bg-surface transition-all duration-150 text-xs
            ${loading ? "animate-pulse" : ""}`}
        >
          Refresh
        </button>
      </div>

      {showAddRemote && (
        <ConnectionModal
          onSubmit={(data) => {
            addRemoteUrl(data.name, data.url, data.token);
            setShowAddRemote(false);
          }}
          onClose={() => setShowAddRemote(false)}
        />
      )}
    </div>
  );
}

function SourceTab({
  label,
  count,
  active,
  onClick,
  dotColor,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  dotColor?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all duration-150 ${
        active
          ? "bg-surface text-text-light"
          : "text-text-muted hover:text-text-light hover:bg-surface/50"
      }`}
    >
      {dotColor && <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />}
      <span>{label}</span>
      {count > 0 && <span className="text-text-muted/60">({count})</span>}
    </button>
  );
}
