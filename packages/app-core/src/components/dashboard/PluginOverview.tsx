interface PluginItem {
  name: string;
  isActive: boolean;
  loadError?: string | null;
  enabled: boolean;
}

interface PluginOverviewProps {
  plugins: PluginItem[];
  onManage?: () => void;
}

export function PluginOverview({ plugins, onManage }: PluginOverviewProps) {
  const active = plugins.filter((p) => p.isActive);
  const errors = plugins.filter((p) => p.loadError);

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
          Plugins
          <span className="ml-2 text-[var(--text)]">
            {active.length} loaded
            {errors.length > 0 && `, ${errors.length} errors`}
          </span>
        </div>
        {onManage && (
          <button
            onClick={onManage}
            className="text-xs text-[var(--accent)] hover:underline"
          >
            Manage
          </button>
        )}
      </div>
      <div className="space-y-1 max-h-48 overflow-y-auto">
        {plugins.length === 0 ? (
          <div className="text-xs text-[var(--muted)] py-2 text-center">
            No plugins loaded
          </div>
        ) : (
          plugins.map((plugin) => (
            <div
              key={plugin.name}
              className="flex items-center gap-2 text-xs py-1"
            >
              <span
                className={`h-2 w-2 rounded-full shrink-0 ${
                  plugin.loadError
                    ? "bg-red-500"
                    : plugin.isActive
                      ? "bg-green-500"
                      : "bg-zinc-500"
                }`}
              />
              <span className="text-[var(--text)] truncate">{plugin.name}</span>
              {plugin.loadError && (
                <span className="text-[var(--destructive)] truncate ml-auto">
                  {plugin.loadError}
                </span>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
