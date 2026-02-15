import { LogsView } from "./LogsView.js";

export function LogsPageView() {
  return (
    <div className="flex flex-col h-full">
      <h2 className="text-lg font-bold mb-1">Logs</h2>
      <p className="text-[13px] text-[var(--muted)] mb-4">Agent runtime logs with filtering.</p>
      <div className="flex-1 min-h-0">
        <LogsView />
      </div>
    </div>
  );
}
