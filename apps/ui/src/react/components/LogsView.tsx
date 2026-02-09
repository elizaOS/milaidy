/**
 * Logs view component — logs viewer with filtering.
 */

import { useEffect } from "react";
import { useApp } from "../AppContext.js";
import type { LogEntry } from "../../ui/api-client.js";

/** Per-tag badge colour map (mirrors Lit CSS `data-tag` selectors). */
const TAG_COLORS: Record<string, { bg: string; fg: string }> = {
  agent: { bg: "rgba(99, 102, 241, 0.15)", fg: "rgb(99, 102, 241)" },
  server: { bg: "rgba(34, 197, 94, 0.15)", fg: "rgb(34, 197, 94)" },
  system: { bg: "rgba(156, 163, 175, 0.15)", fg: "rgb(156, 163, 175)" },
  cloud: { bg: "rgba(59, 130, 246, 0.15)", fg: "rgb(59, 130, 246)" },
  plugins: { bg: "rgba(168, 85, 247, 0.15)", fg: "rgb(168, 85, 247)" },
  autonomy: { bg: "rgba(245, 158, 11, 0.15)", fg: "rgb(245, 158, 11)" },
  websocket: { bg: "rgba(20, 184, 166, 0.15)", fg: "rgb(20, 184, 166)" },
};

export function LogsView() {
  const {
    logs,
    logSources,
    logTags,
    logTagFilter,
    logLevelFilter,
    logSourceFilter,
    loadLogs,
    setState,
  } = useApp();

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  const handleLevelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setState("logLevelFilter", e.target.value);
    void loadLogs();
  };

  const handleSourceChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setState("logSourceFilter", e.target.value);
    void loadLogs();
  };

  const handleClearFilters = () => {
    setState("logTagFilter", "");
    setState("logLevelFilter", "");
    setState("logSourceFilter", "");
    void loadLogs();
  };

  const hasActiveFilters =
    logTagFilter !== "" || logLevelFilter !== "" || logSourceFilter !== "";

  return (
    <div>
      {/* Header — matches Lit: <h2>Logs</h2> <p class="subtitle">...</p> */}
      <h2 className="text-lg font-normal text-txt-strong mb-1">Logs</h2>
      <p className="text-sm text-muted mb-2.5">
        Agent log output.
        {logs.length > 0 ? ` ${logs.length} entries.` : ""}
      </p>

      {/* Filters row — Lit: .log-filters (flex wrap gap-1.5 mb-2.5 center) */}
      <div className="flex flex-wrap gap-1.5 mb-2.5 items-center">
        <button
          className="text-xs px-3 py-1 border border-border bg-card text-txt cursor-pointer hover:bg-bg-hover"
          onClick={() => void loadLogs()}
        >
          Refresh
        </button>

        <select
          className="text-xs px-2 py-1 border border-border rounded-md bg-card text-txt"
          value={logLevelFilter}
          onChange={handleLevelChange}
        >
          <option value="">All levels</option>
          <option value="debug">Debug</option>
          <option value="info">Info</option>
          <option value="warn">Warn</option>
          <option value="error">Error</option>
        </select>

        <select
          className="text-xs px-2 py-1 border border-border rounded-md bg-card text-txt"
          value={logSourceFilter}
          onChange={handleSourceChange}
        >
          <option value="">All sources</option>
          {logSources.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        {hasActiveFilters && (
          <button
            className="text-[11px] px-2.5 py-[3px] border border-border bg-card text-txt cursor-pointer hover:bg-bg-hover"
            onClick={handleClearFilters}
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Tag pills — Lit: .log-tag-pills with "Tags:" label + "all" pill */}
      {logTags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2.5 items-center">
          <span className="text-xs text-muted mr-1">Tags:</span>
          <span
            className={`text-[11px] px-2.5 py-0.5 rounded-xl border cursor-pointer transition-all duration-150 whitespace-nowrap ${
              logTagFilter === ""
                ? "bg-accent text-white border-accent"
                : "bg-bg-muted text-muted border-border hover:border-accent hover:text-txt"
            }`}
            onClick={() => {
              setState("logTagFilter", "");
              void loadLogs();
            }}
          >
            all
          </span>
          {logTags.map((tag) => (
            <span
              key={tag}
              className={`text-[11px] px-2.5 py-0.5 rounded-xl border cursor-pointer transition-all duration-150 whitespace-nowrap ${
                logTagFilter === tag
                  ? "bg-accent text-white border-accent"
                  : "bg-bg-muted text-muted border-border hover:border-accent hover:text-txt"
              }`}
              onClick={() => {
                setState("logTagFilter", tag);
                void loadLogs();
              }}
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Log entries — Lit: .logs-container (mono, 12px, max-h-600, scroll, border, card bg) */}
      <div className="font-mono text-xs max-h-[600px] overflow-y-auto border border-border p-2 bg-card">
        {logs.length === 0 ? (
          <div className="text-center py-8 text-muted">
            No log entries
            {hasActiveFilters ? " matching filters" : " yet"}.
          </div>
        ) : (
          logs.map((entry: LogEntry, idx: number) => (
            <div
              key={idx}
              className="font-mono text-xs px-2 py-1 border-b border-border flex gap-2 items-baseline"
            >
              {/* Timestamp */}
              <span className="text-muted whitespace-nowrap">
                {new Date(entry.timestamp).toLocaleTimeString()}
              </span>

              {/* Level */}
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

              {/* Source */}
              <span className="text-muted w-16 overflow-hidden text-ellipsis whitespace-nowrap text-[11px]">
                [{entry.source}]
              </span>

              {/* Tag badges */}
              <span className="inline-flex gap-0.5 shrink-0">
                {(entry.tags ?? []).map((t: string, ti: number) => {
                  const c = TAG_COLORS[t];
                  return (
                    <span
                      key={ti}
                      className="inline-block text-[10px] px-1.5 py-px rounded-lg mr-0.5"
                      style={{
                        background: c ? c.bg : "var(--bg-muted)",
                        color: c ? c.fg : "var(--muted)",
                        fontFamily: "var(--font-body, sans-serif)",
                      }}
                    >
                      {t}
                    </span>
                  );
                })}
              </span>

              {/* Message */}
              <span className="flex-1 break-all">{entry.message}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
