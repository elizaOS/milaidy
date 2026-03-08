/**
 * Logs view component — logs viewer with filtering.
 */

import { useEffect, useMemo, useState } from "react";
import { useApp } from "../AppContext";
import { useTabNavigation } from "../hooks/useTabNavigation";
import type { LogEntry } from "../api-client";
import { FieldRow } from "./shared/FieldRow";
import { PanelSection } from "./shared/PanelSection";
import { formatTime } from "./shared/format";

/** Per-tag badge colour map. */
const TAG_COLORS: Record<string, { bg: string; fg: string }> = {
  agent: { bg: "rgba(99, 102, 241, 0.15)", fg: "rgb(99, 102, 241)" },
  autonomy: { bg: "rgba(245, 158, 11, 0.15)", fg: "rgb(245, 158, 11)" },
  cloud: { bg: "rgba(59, 130, 246, 0.15)", fg: "rgb(59, 130, 246)" },
  plugins: { bg: "rgba(168, 85, 247, 0.15)", fg: "rgb(168, 85, 247)" },
  server: { bg: "rgba(34, 197, 94, 0.15)", fg: "rgb(34, 197, 94)" },
  system: { bg: "rgba(156, 163, 175, 0.15)", fg: "rgb(156, 163, 175)" },
  websocket: { bg: "rgba(20, 184, 166, 0.15)", fg: "rgb(20, 184, 166)" },
};

export function LogsView() {
  const [searchQuery, setSearchQuery] = useState("");
  const { runQuickAction } = useTabNavigation();
  const {
    logs,
    logLevelFilter,
    logSourceFilter,
    logSources,
    logTagFilter,
    logTags,
    loadLogs,
    setState,
  } = useApp();

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  const normalizedSearch = searchQuery.trim().toLowerCase();
  const hasActiveFilters =
    logTagFilter !== "" ||
    logLevelFilter !== "" ||
    logSourceFilter !== "" ||
    normalizedSearch !== "";

  const filteredLogs = useMemo(() => {
    if (!normalizedSearch) return logs;
    return logs.filter((entry) => {
      const haystack = [
        entry.level ?? "",
        entry.message ?? "",
        entry.source ?? "",
        ...(entry.tags ?? []),
      ];
      return haystack.some((part) =>
        part.toLowerCase().includes(normalizedSearch),
      );
    });
  }, [logs, normalizedSearch]);

  const handleClearFilters = () => {
    setState("logLevelFilter", "");
    setState("logSourceFilter", "");
    setState("logTagFilter", "");
    setSearchQuery("");
    void loadLogs();
  };

  return (
    <div className="flex flex-col h-full gap-3">
      <PanelSection
        title="Log filters"
        description="Narrow runtime logs by level, source, tag, or free-text search."
        action={
          <div className="flex items-center gap-2">
            {hasActiveFilters ? (
              <button
                type="button"
                className="btn-ghost focus-ring rounded-md px-3 py-1.5 text-xs"
                onClick={handleClearFilters}
              >
                Clear filters
              </button>
            ) : null}
            <button
              type="button"
              className="btn-ghost focus-ring rounded-md px-3 py-1.5 text-xs"
              onClick={() => void loadLogs()}
            >
              Refresh
            </button>
          </div>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <FieldRow label="Search" hint="Filter by message text, level, source, or tag.">
            <input
              type="text"
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-xs text-txt focus-ring"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search logs..."
              aria-label="Search logs"
            />
          </FieldRow>

          <FieldRow label="Level" hint="Show only a specific log level.">
            <select
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-xs text-txt focus-ring"
              value={logLevelFilter}
              onChange={(event) => {
                setState("logLevelFilter", event.target.value);
                void loadLogs();
              }}
            >
              <option value="">All levels</option>
              <option value="debug">Debug</option>
              <option value="info">Info</option>
              <option value="warn">Warn</option>
              <option value="error">Error</option>
            </select>
          </FieldRow>

          <FieldRow label="Source" hint="Filter by log emitter.">
            <select
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-xs text-txt focus-ring"
              value={logSourceFilter}
              onChange={(event) => {
                setState("logSourceFilter", event.target.value);
                void loadLogs();
              }}
            >
              <option value="">All sources</option>
              {logSources.map((source) => (
                <option key={source} value={source}>
                  {source}
                </option>
              ))}
            </select>
          </FieldRow>

          <FieldRow label="Tag" hint="Filter by log tag.">
            <select
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-xs text-txt focus-ring"
              value={logTagFilter}
              onChange={(event) => {
                setState("logTagFilter", event.target.value);
                void loadLogs();
              }}
            >
              <option value="">All tags</option>
              {logTags.map((tag) => (
                <option key={tag} value={tag}>
                  {tag}
                </option>
              ))}
            </select>
          </FieldRow>
        </div>
      </PanelSection>

      <div className="font-mono text-xs flex-1 min-h-0 overflow-y-auto border border-border p-2 bg-card">
        {filteredLogs.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-4 py-8 text-center">
            <p className="text-muted">
              No log entries {hasActiveFilters ? "matching the current filters" : "yet"}.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                className="btn-ghost focus-ring rounded-md px-3 py-2 text-xs"
                onClick={() => void loadLogs()}
              >
                Refresh logs
              </button>
              <button
                type="button"
                className="btn-ghost focus-ring rounded-md px-3 py-2 text-xs"
                onClick={() => void runQuickAction("restart-open-logs")}
                data-testid="quick-action-restart-open-logs"
              >
                Restart + open logs
              </button>
            </div>
          </div>
        ) : (
          filteredLogs.map((entry: LogEntry) => (
            <div
              key={`${entry.timestamp}-${entry.source}-${entry.level}-${entry.message}`}
              className="font-mono text-xs px-2 py-1 border-b border-border flex gap-2 items-baseline"
              data-testid="log-entry"
            >
              <span className="text-muted whitespace-nowrap">
                {formatTime(entry.timestamp, { fallback: "—" })}
              </span>

              <span
                className={`font-semibold w-[44px] uppercase text-[11px] ${
                  entry.level === "error"
                    ? "text-danger"
                    : entry.level === "warn"
                      ? "text-warn"
                      : "text-muted"
                }`}
              >
                {entry.level}
              </span>

              <span className="text-muted w-16 overflow-hidden text-ellipsis whitespace-nowrap text-[11px]">
                [{entry.source}]
              </span>

              <span className="inline-flex gap-0.5 shrink-0">
                {(entry.tags ?? []).map((tag: string) => {
                  const colors = TAG_COLORS[tag];
                  return (
                    <span
                      key={tag}
                      className="inline-block text-[10px] px-1.5 py-px rounded-lg mr-0.5"
                      style={{
                        background: colors ? colors.bg : "var(--bg-muted)",
                        color: colors ? colors.fg : "var(--muted)",
                        fontFamily: "var(--font-body, sans-serif)",
                      }}
                    >
                      {tag}
                    </span>
                  );
                })}
              </span>

              <span className="flex-1 break-all">{entry.message}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
