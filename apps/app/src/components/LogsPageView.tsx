import { useApp } from "../AppContext";
import { LogsView } from "./LogsView";

export function LogsPageView() {
  const { t } = useApp();
  return (
    <div className="flex flex-col h-full">
      <h2 className="text-lg font-bold mb-1">{t("logspageview.Logs")}</h2>
      <p className="text-[13px] text-[var(--muted)] mb-4">
        {t("logspageview.AgentRuntimeLogsW")}
      </p>
      <div className="flex-1 min-h-0">
        <LogsView />
      </div>
    </div>
  );
}
