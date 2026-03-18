export function MetricsPanel() {
  return (
    <div className="flex flex-col items-center justify-center py-32 space-y-3">
      <div className="text-text-muted/30 text-4xl">{"\u25EB"}</div>
      <div className="text-text-muted font-mono text-sm">
        Metrics coming soon
      </div>
      <div className="text-text-muted/50 font-mono text-xs">
        Container metrics will be available when the metrics API ships.
      </div>
    </div>
  );
}
