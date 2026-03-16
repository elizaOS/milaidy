interface QuickStatsProps {
  pluginCount: number;
  connectorCount: number;
  triggerCount: number;
  errorCount: number;
}

function StatItem({
  label,
  value,
  alert,
}: {
  label: string;
  value: number;
  alert?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-xs text-[var(--muted)]">{label}</span>
      <span
        className={`text-sm font-semibold ${alert ? "text-[var(--destructive)]" : "text-[var(--text)]"}`}
      >
        {value}
        {alert && value > 0 && (
          <span className="ml-1.5 inline-block h-2 w-2 rounded-full bg-[var(--destructive)]" />
        )}
      </span>
    </div>
  );
}

export function QuickStats({
  pluginCount,
  connectorCount,
  triggerCount,
  errorCount,
}: QuickStatsProps) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-[var(--muted)] mb-2">
        Quick Stats
      </div>
      <div className="divide-y divide-[var(--border)]">
        <StatItem label="Plugins" value={pluginCount} />
        <StatItem label="Connectors" value={connectorCount} />
        <StatItem label="Triggers" value={triggerCount} />
        <StatItem label="Errors" value={errorCount} alert />
      </div>
    </div>
  );
}
