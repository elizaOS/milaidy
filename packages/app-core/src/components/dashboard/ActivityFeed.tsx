interface LogEntry {
  timestamp: number;
  level: string;
  message: string;
  source: string;
  tags: string[];
}

interface ActivityFeedProps {
  entries: LogEntry[];
  onViewAll?: () => void;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

const LEVEL_COLORS: Record<string, string> = {
  info: "text-blue-400",
  warn: "text-yellow-400",
  error: "text-red-400",
  critical: "text-red-500 font-bold",
  debug: "text-zinc-500",
};

export function ActivityFeed({ entries, onViewAll }: ActivityFeedProps) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
          Activity
        </div>
        {onViewAll && (
          <button
            onClick={onViewAll}
            className="text-xs text-[var(--accent)] hover:underline"
          >
            View logs
          </button>
        )}
      </div>
      {entries.length === 0 ? (
        <div className="text-xs text-[var(--muted)] py-4 text-center">
          No recent activity
        </div>
      ) : (
        <div className="space-y-1 max-h-64 overflow-y-auto">
          {entries.map((entry, i) => (
            <div
              key={`${entry.timestamp}-${i}`}
              className="flex gap-2 text-xs py-1"
            >
              <span className="text-[var(--muted)] shrink-0 font-mono">
                {formatTime(entry.timestamp)}
              </span>
              <span
                className={`shrink-0 ${LEVEL_COLORS[entry.level] ?? "text-[var(--text)]"}`}
              >
                [{entry.source}]
              </span>
              <span className="text-[var(--text)] truncate">
                {entry.message}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
