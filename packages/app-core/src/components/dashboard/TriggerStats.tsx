interface TriggerStatsProps {
  triggersEnabled: boolean;
  activeTriggers: number;
  totalExecutions: number;
  totalFailures: number;
  totalSkipped: number;
  lastExecutionAt?: number;
  onViewAll?: () => void;
}

export function TriggerStats({
  triggersEnabled,
  activeTriggers,
  totalExecutions,
  totalFailures,
  totalSkipped,
  lastExecutionAt,
  onViewAll,
}: TriggerStatsProps) {
  const failureRate =
    totalExecutions > 0 ? (totalFailures / totalExecutions) * 100 : 0;

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
          Triggers
        </div>
        {onViewAll && (
          <button
            onClick={onViewAll}
            className="text-xs text-[var(--accent)] hover:underline"
          >
            View all
          </button>
        )}
      </div>
      {!triggersEnabled ? (
        <div className="text-xs text-[var(--muted)] py-2">
          Triggers disabled
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-3 text-center">
          <div>
            <div className="text-lg font-semibold text-[var(--text)]">
              {activeTriggers}
            </div>
            <div className="text-xs text-[var(--muted)]">Active</div>
          </div>
          <div>
            <div className="text-lg font-semibold text-[var(--text)]">
              {totalExecutions}
            </div>
            <div className="text-xs text-[var(--muted)]">Runs</div>
          </div>
          <div>
            <div
              className={`text-lg font-semibold ${failureRate > 10 ? "text-[var(--destructive)]" : "text-[var(--text)]"}`}
            >
              {totalFailures}
            </div>
            <div className="text-xs text-[var(--muted)]">Failed</div>
          </div>
          <div>
            <div className="text-lg font-semibold text-[var(--text)]">
              {totalSkipped}
            </div>
            <div className="text-xs text-[var(--muted)]">Skipped</div>
          </div>
        </div>
      )}
      {lastExecutionAt && (
        <div className="text-xs text-[var(--muted)] mt-2">
          Last run: {new Date(lastExecutionAt).toLocaleString()}
        </div>
      )}
    </div>
  );
}
