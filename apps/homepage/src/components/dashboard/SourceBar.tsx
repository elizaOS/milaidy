import { useCallback, useEffect, useState } from "react";
import { useAgents } from "../../lib/AgentProvider";
import { useAuth } from "../../lib/useAuth";
import { ConnectionModal } from "./ConnectionModal";

export type SourceFilter = "all" | "local" | "cloud" | "remote";

export function SourceBar() {
  const {
    agents,
    isRefreshing,
    refresh,
    addRemoteUrl,
    sourceFilter,
    setSourceFilter,
  } = useAgents();
  const { isAuthenticated: authed } = useAuth();
  const [showAddRemote, setShowAddRemote] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [pendingRefresh, setPendingRefresh] = useState(false);

  const handleRefresh = useCallback(async () => {
    setPendingRefresh(true);
    await refresh();
  }, [refresh]);

  useEffect(() => {
    if (pendingRefresh && !isRefreshing) {
      setPendingRefresh(false);
      setShowSuccess(true);
      const timer = setTimeout(() => setShowSuccess(false), 1500);
      return () => clearTimeout(timer);
    }
  }, [isRefreshing, pendingRefresh]);

  const cloudCount = agents.filter((a) => a.source === "cloud").length;
  const localCount = agents.filter((a) => a.source === "local").length;
  const remoteCount = agents.filter((a) => a.source === "remote").length;

  useEffect(() => {
    if (!authed && sourceFilter === "cloud") {
      setSourceFilter("all");
    }
  }, [authed, sourceFilter, setSourceFilter]);

  return (
    <div className="flex flex-wrap items-center gap-2 px-4 sm:px-5 md:px-8 py-2 bg-dark-secondary border-b border-border">
      {/* Source filters */}
      <div className="flex items-center gap-px bg-border order-2 md:order-1 overflow-x-auto">
        <FilterTab
          label="ALL"
          count={agents.length}
          active={sourceFilter === "all"}
          onClick={() => setSourceFilter("all")}
        />
        <FilterTab
          label="LOCAL"
          count={localCount}
          active={sourceFilter === "local"}
          onClick={() => setSourceFilter("local")}
          status={localCount > 0 ? "active" : "idle"}
        />
        {authed && (
          <FilterTab
            label="CLOUD"
            count={cloudCount}
            active={sourceFilter === "cloud"}
            onClick={() => setSourceFilter("cloud")}
            status={cloudCount > 0 ? "active" : "warn"}
          />
        )}
        {remoteCount > 0 && (
          <FilterTab
            label="REMOTE"
            count={remoteCount}
            active={sourceFilter === "remote"}
            onClick={() => setSourceFilter("remote")}
            status="active"
          />
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 order-1 md:order-2 ml-auto">
        <button
          type="button"
          onClick={() => setShowAddRemote(true)}
          className="px-3 py-1.5 font-mono text-[10px] tracking-wider
            text-text-subtle hover:text-text-light hover:bg-surface
            transition-all duration-150"
        >
          + CONNECT
        </button>

        <button
          type="button"
          onClick={handleRefresh}
          disabled={isRefreshing}
          className={`flex items-center gap-1.5 px-3 py-1.5 
            font-mono text-[10px] tracking-wider transition-all duration-150
            ${
              isRefreshing
                ? "text-text-subtle cursor-not-allowed"
                : showSuccess
                  ? "text-emerald-400"
                  : "text-text-subtle hover:text-text-light hover:bg-surface"
            }`}
        >
          {isRefreshing ? (
            <svg
              aria-hidden="true"
              className="w-3 h-3 animate-spin"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
          ) : showSuccess ? (
            <svg
              aria-hidden="true"
              className="w-3 h-3"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M5 13l4 4L19 7"
              />
            </svg>
          ) : (
            <svg
              aria-hidden="true"
              className="w-3 h-3"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          )}
          {showSuccess ? "SYNCED" : isRefreshing ? "SYNCING" : "SYNC"}
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

function FilterTab({
  label,
  count,
  active,
  onClick,
  status,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  status?: "active" | "warn" | "idle";
}) {
  const statusColor = {
    active: "bg-emerald-400",
    warn: "bg-amber-400",
    idle: "bg-text-muted/30",
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 px-3 py-2 font-mono text-[10px] tracking-wider
        transition-all duration-150
        ${
          active
            ? "bg-surface text-text-light"
            : "bg-surface/30 text-text-muted hover:text-text-light hover:bg-surface/50"
        }`}
    >
      {status && (
        <span className={`w-1.5 h-1.5 rounded-full ${statusColor[status]}`} />
      )}
      <span>{label}</span>
      {count > 0 && (
        <span
          className={`tabular-nums ${active ? "text-brand" : "text-text-subtle"}`}
        >
          {count}
        </span>
      )}
    </button>
  );
}
