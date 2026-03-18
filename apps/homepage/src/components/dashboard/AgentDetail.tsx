import { useState } from "react";
import type { AgentStatus } from "../../lib/cloud-api";
import { ExportPanel } from "./ExportPanel";
import { LogsPanel } from "./LogsPanel";
import { MetricsPanel } from "./MetricsPanel";

const TABS = ["Metrics", "Logs", "Snapshots"] as const;
type Tab = (typeof TABS)[number];

interface AgentDetailProps {
  agent: AgentStatus;
  connectionId: string;
}

export function AgentDetail({ agent, connectionId }: AgentDetailProps) {
  const [tab, setTab] = useState<Tab>("Metrics");

  return (
    <div className="border border-white/10 rounded">
      <div className="flex border-b border-white/10">
        {TABS.map((t) => (
          <button
            type="button"
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 font-mono text-xs uppercase tracking-widest transition-colors ${
              tab === t
                ? "text-brand border-b-2 border-brand"
                : "text-text-muted hover:text-text-light"
            }`}
          >
            {t}
          </button>
        ))}
        <span className="ml-auto px-4 py-2 text-[10px] font-mono text-text-muted">
          {agent.agentName}
        </span>
      </div>
      <div className="p-4">
        {tab === "Metrics" && <MetricsPanel />}
        {tab === "Logs" && <LogsPanel />}
        {tab === "Snapshots" && <ExportPanel connectionId={connectionId} />}
      </div>
    </div>
  );
}
