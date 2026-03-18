export function LogsPanel() {
  return (
    <div className="flex flex-col items-center justify-center py-32 space-y-3">
      <div className="text-text-muted/30 text-4xl">{"\u25FB"}</div>
      <div className="text-text-muted font-mono text-sm">Logs coming soon</div>
      <div className="text-text-muted/50 font-mono text-xs">
        Container logs will be available when the logs API ships.
      </div>
    </div>
  );
}
