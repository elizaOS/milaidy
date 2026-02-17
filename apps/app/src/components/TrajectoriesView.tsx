/**
 * TrajectoriesView — view and analyze LLM call trajectories.
 *
 * Shows all captured LLM interactions with token counts, latency, and context.
 * Supports filtering, search, export, and clearing trajectories.
 */

import { useCallback, useEffect, useState } from "react";
import {
  client,
  type TrajectoryConfig,
  type TrajectoryListResult,
  type TrajectoryRecord,
  type TrajectoryStats,
} from "../api-client";
import {
  formatTrajectoryDuration,
  formatTrajectoryTimestamp,
  formatTrajectoryTokenCount,
} from "./trajectory-format";

type StatusFilter = "" | "active" | "completed" | "error";

const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  active: { bg: "rgba(59, 130, 246, 0.15)", fg: "rgb(59, 130, 246)" },
  completed: { bg: "rgba(34, 197, 94, 0.15)", fg: "rgb(34, 197, 94)" },
  error: { bg: "rgba(239, 68, 68, 0.15)", fg: "rgb(239, 68, 68)" },
};

const SOURCE_COLORS: Record<string, { bg: string; fg: string }> = {
  chat: { bg: "rgba(99, 102, 241, 0.15)", fg: "rgb(99, 102, 241)" },
  autonomy: { bg: "rgba(245, 158, 11, 0.15)", fg: "rgb(245, 158, 11)" },
  telegram: { bg: "rgba(34, 197, 94, 0.15)", fg: "rgb(34, 197, 94)" },
  discord: { bg: "rgba(88, 101, 242, 0.15)", fg: "rgb(88, 101, 242)" },
  api: { bg: "rgba(156, 163, 175, 0.15)", fg: "rgb(156, 163, 175)" },
};

interface TrajectoriesViewProps {
  onSelectTrajectory?: (id: string) => void;
}

export function TrajectoriesView({
  onSelectTrajectory,
}: TrajectoriesViewProps) {
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<TrajectoryListResult | null>(null);
  const [stats, setStats] = useState<TrajectoryStats | null>(null);
  const [config, setConfig] = useState<TrajectoryConfig | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(0);
  const pageSize = 50;

  // Actions
  const [exporting, setExporting] = useState(false);
  const [clearing, setClearing] = useState(false);

  const loadTrajectories = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [trajResult, statsResult, configResult] = await Promise.all([
        client.getTrajectories({
          limit: pageSize,
          offset: page * pageSize,
          status: statusFilter || undefined,
          source: sourceFilter || undefined,
          search: searchQuery || undefined,
        }),
        client.getTrajectoryStats(),
        client.getTrajectoryConfig(),
      ]);
      setResult(trajResult);
      setStats(statsResult);
      setConfig(configResult);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load trajectories",
      );
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, sourceFilter, searchQuery]);

  useEffect(() => {
    void loadTrajectories();
  }, [loadTrajectories]);

  const handleEnableLogging = async () => {
    try {
      const updated = await client.updateTrajectoryConfig({ enabled: true });
      setConfig(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update config");
    }
  };

  const handleExport = async (
    format: "json" | "csv" | "zip",
    includePrompts: boolean,
  ) => {
    setExporting(true);
    try {
      const blob = await client.exportTrajectories({ format, includePrompts });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `trajectories-${new Date().toISOString().split("T")[0]}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to export");
    } finally {
      setExporting(false);
    }
  };

  const handleClearAll = async () => {
    if (
      !confirm(
        "Are you sure you want to delete ALL trajectories? This cannot be undone.",
      )
    ) {
      return;
    }
    setClearing(true);
    try {
      await client.clearAllTrajectories();
      void loadTrajectories();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to clear trajectories",
      );
    } finally {
      setClearing(false);
    }
  };

  const handleClearFilters = () => {
    setStatusFilter("");
    setSourceFilter("");
    setSearchQuery("");
    setPage(0);
  };

  const hasActiveFilters =
    statusFilter !== "" || sourceFilter !== "" || searchQuery !== "";
  const trajectories = result?.trajectories ?? [];
  const total = result?.total ?? 0;
  const totalPages = Math.ceil(total / pageSize);

  const sources = stats?.bySource ? Object.keys(stats.bySource) : [];

  return (
    <div className="flex flex-col h-full gap-3">
      {/* Stats summary */}
      {stats && (
        <div className="flex flex-wrap gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="text-muted">Total:</span>
            <span className="font-semibold">
              {stats.totalTrajectories.toLocaleString()}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-muted">LLM Calls:</span>
            <span className="font-semibold">
              {stats.totalLlmCalls.toLocaleString()}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-muted">Tokens:</span>
            <span className="font-semibold text-accent">
              {formatTrajectoryTokenCount(
                stats.totalPromptTokens + stats.totalCompletionTokens,
                { emptyLabel: "0" },
              )}
            </span>
            <span className="text-muted text-[10px]">
              (
              {formatTrajectoryTokenCount(stats.totalPromptTokens, {
                emptyLabel: "0",
              })}
              ↑{" "}
              {formatTrajectoryTokenCount(stats.totalCompletionTokens, {
                emptyLabel: "0",
              })}
              ↓)
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-muted">Avg Duration:</span>
            <span className="font-semibold">
              {formatTrajectoryDuration(stats.averageDurationMs)}
            </span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <label className="flex items-center gap-1.5">
              <span className="text-muted">Logging:</span>
              <button
                type="button"
                className={`px-2 py-0.5 text-[11px] border rounded ${
                  config?.enabled
                    ? "bg-success/20 border-success text-success"
                    : "bg-warn/20 border-warn text-warn"
                }`}
                onClick={handleEnableLogging}
                disabled={config?.enabled}
              >
                {config?.enabled ? "ON" : "ENABLE"}
              </button>
            </label>
          </div>
        </div>
      )}

      {/* Filters row */}
      <div className="flex flex-wrap gap-1.5 items-center">
        <input
          type="text"
          placeholder="Search..."
          className="text-xs px-3 py-1.5 border border-border bg-card text-txt w-48"
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setPage(0);
          }}
        />

        <select
          className="text-xs px-3 py-1.5 border border-border bg-card text-txt cursor-pointer"
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value as StatusFilter);
            setPage(0);
          }}
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="completed">Completed</option>
          <option value="error">Error</option>
        </select>

        {sources.length > 0 && (
          <select
            className="text-xs px-3 py-1.5 border border-border bg-card text-txt cursor-pointer"
            value={sourceFilter}
            onChange={(e) => {
              setSourceFilter(e.target.value);
              setPage(0);
            }}
          >
            <option value="">All sources</option>
            {sources.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        )}

        {hasActiveFilters && (
          <button
            type="button"
            className="text-xs px-3 py-1.5 border border-border bg-card text-txt cursor-pointer hover:border-accent hover:text-accent"
            onClick={handleClearFilters}
          >
            Clear filters
          </button>
        )}

        <div className="ml-auto flex gap-1.5">
          <button
            type="button"
            className="text-xs px-3 py-1.5 border border-border bg-card text-txt cursor-pointer hover:border-accent hover:text-accent"
            onClick={() => void loadTrajectories()}
            disabled={loading}
          >
            {loading ? "Loading..." : "Refresh"}
          </button>

          <div className="relative group">
            <button
              type="button"
              className="text-xs px-3 py-1.5 border border-border bg-card text-txt cursor-pointer hover:border-accent hover:text-accent"
              disabled={exporting || trajectories.length === 0}
            >
              {exporting ? "Exporting..." : "Export"}
            </button>
            <div className="absolute right-0 mt-1 hidden group-hover:block bg-card border border-border shadow-lg z-10">
              <button
                type="button"
                className="block w-full text-left text-xs px-3 py-1.5 hover:bg-muted/20"
                onClick={() => handleExport("json", true)}
              >
                JSON (with prompts)
              </button>
              <button
                type="button"
                className="block w-full text-left text-xs px-3 py-1.5 hover:bg-muted/20"
                onClick={() => handleExport("json", false)}
              >
                JSON (redacted)
              </button>
              <button
                type="button"
                className="block w-full text-left text-xs px-3 py-1.5 hover:bg-muted/20"
                onClick={() => handleExport("csv", false)}
              >
                CSV (summary only)
              </button>
              <button
                type="button"
                className="block w-full text-left text-xs px-3 py-1.5 hover:bg-muted/20"
                onClick={() => handleExport("zip", true)}
              >
                ZIP (folders)
              </button>
            </div>
          </div>

          <button
            type="button"
            className="text-xs px-3 py-1.5 border border-danger/50 bg-card text-danger cursor-pointer hover:border-danger hover:bg-danger/10"
            onClick={handleClearAll}
            disabled={clearing || stats?.totalTrajectories === 0}
          >
            {clearing ? "Clearing..." : "Clear All"}
          </button>
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div className="text-xs text-danger border border-danger/30 bg-danger/10 px-3 py-2">
          {error}
        </div>
      )}

      {/* Trajectories list */}
      <div className="flex-1 min-h-0 overflow-y-auto border border-border bg-card">
        {loading && trajectories.length === 0 ? (
          <div className="text-center py-8 text-muted">
            Loading trajectories...
          </div>
        ) : trajectories.length === 0 ? (
          <div className="text-center py-8 text-muted">
            No trajectories {hasActiveFilters ? "matching filters" : "yet"}.
            {!config?.enabled && (
              <div className="mt-2 text-warn text-[11px]">
                Trajectory logging should auto-enable; click ENABLE if startup
                is still settling.
              </div>
            )}
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead className="bg-muted/10 sticky top-0">
              <tr>
                <th className="text-left px-2 py-1.5 font-medium">Time</th>
                <th className="text-left px-2 py-1.5 font-medium">Source</th>
                <th className="text-left px-2 py-1.5 font-medium">Status</th>
                <th className="text-right px-2 py-1.5 font-medium">Calls</th>
                <th className="text-right px-2 py-1.5 font-medium">Tokens</th>
                <th className="text-right px-2 py-1.5 font-medium">Duration</th>
              </tr>
            </thead>
            <tbody>
              {trajectories.map((traj: TrajectoryRecord) => {
                const statusColor =
                  STATUS_COLORS[traj.status] ?? STATUS_COLORS.completed;
                const sourceColor =
                  SOURCE_COLORS[traj.source] ?? SOURCE_COLORS.api;
                return (
                  <tr
                    key={traj.id}
                    className="border-t border-border hover:bg-muted/5 cursor-pointer"
                    onClick={() => onSelectTrajectory?.(traj.id)}
                  >
                    <td className="px-2 py-1.5 text-muted whitespace-nowrap">
                      {formatTrajectoryTimestamp(traj.createdAt, "smart")}
                    </td>
                    <td className="px-2 py-1.5">
                      <span
                        className="inline-block text-[10px] px-1.5 py-px rounded"
                        style={{
                          background: sourceColor.bg,
                          color: sourceColor.fg,
                        }}
                      >
                        {traj.source}
                      </span>
                    </td>
                    <td className="px-2 py-1.5">
                      <span
                        className="inline-block text-[10px] px-1.5 py-px rounded"
                        style={{
                          background: statusColor.bg,
                          color: statusColor.fg,
                        }}
                      >
                        {traj.status}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono">
                      {traj.llmCallCount}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono">
                      <span className="text-accent">
                        {formatTrajectoryTokenCount(
                          traj.totalPromptTokens + traj.totalCompletionTokens,
                          { emptyLabel: "0" },
                        )}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 text-right text-muted font-mono">
                      {formatTrajectoryDuration(traj.durationMs)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted">
            Showing {page * pageSize + 1}–
            {Math.min((page + 1) * pageSize, total)} of {total}
          </span>
          <div className="flex gap-1">
            <button
              type="button"
              className="px-2 py-1 border border-border bg-card disabled:opacity-50"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
            >
              Prev
            </button>
            <button
              type="button"
              className="px-2 py-1 border border-border bg-card disabled:opacity-50"
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= totalPages - 1}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
