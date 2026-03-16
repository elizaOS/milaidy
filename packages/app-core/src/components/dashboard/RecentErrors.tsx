interface LogEntry {
  timestamp: number;
  level: string;
  message: string;
  source: string;
}

interface RecentErrorsProps {
  entries: LogEntry[];
  onViewAll?: () => void;
}

export function RecentErrors({ entries, onViewAll }: RecentErrorsProps) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
          Recent Errors
          {entries.length > 0 && (
            <span className="ml-2 inline-flex items-center rounded-full bg-[var(--destructive)] px-1.5 py-0.5 text-[10px] text-white">
              {entries.length}
            </span>
          )}
        </div>
        {onViewAll && (
          <button
            onClick={onViewAll}
            className="text-xs text-[var(--accent)] hover:underline"
          >
            View all logs
          </button>
        )}
      </div>
      {entries.length === 0 ? (
        <div className="text-xs text-[var(--ok)] py-2 text-center">
          No recent errors
        </div>
      ) : (
        <div className="space-y-1 max-h-48 overflow-y-auto">
          {entries.map((entry, i) => (
            <div
              key={`${entry.timestamp}-${i}`}
              className={`text-xs py-1.5 px-2 rounded ${
                entry.level === "critical"
                  ? "bg-red-500/10 border border-red-500/20"
                  : ""
              }`}
            >
              <div className="flex gap-2">
                <span className="text-[var(--muted)] shrink-0 font-mono">
                  {new Date(entry.timestamp).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                <span className="text-[var(--destructive)] shrink-0">
                  [{entry.source}]
                </span>
              </div>
              <div className="text-[var(--text)] mt-0.5 truncate">
                {entry.message}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
