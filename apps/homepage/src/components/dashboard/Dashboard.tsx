import { useState } from "react";
import { AgentProvider } from "../../lib/AgentProvider";
import { AgentGrid } from "./AgentGrid";
import { AuthGate } from "./AuthGate";
import { BillingPanel } from "./BillingPanel";
import { CreditsPanel } from "./CreditsPanel";
import { ExportPanel } from "./ExportPanel";
import { LogsPanel } from "./LogsPanel";
import { MetricsPanel } from "./MetricsPanel";
import { type DashboardSection, Sidebar } from "./Sidebar";
import { SourceBar } from "./SourceBar";

export function Dashboard() {
  const [section, setSection] = useState<DashboardSection>("agents");
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);

  return (
    <AuthGate>
      <AgentProvider>
        <div
          data-testid="dashboard"
          className="min-h-screen bg-dark text-text-light"
        >
          <div className="pt-[100px] flex min-h-screen">
            <Sidebar active={section} onChange={setSection} />
            <div className="flex-1 flex flex-col min-w-0">
              <SourceBar />
              <main className="flex-1 px-8 py-6">
                <DashboardContent
                  section={section}
                  selectedAgentId={selectedAgentId}
                  onSelectAgent={setSelectedAgentId}
                />
              </main>
            </div>
          </div>
        </div>
      </AgentProvider>
    </AuthGate>
  );
}

function DashboardContent({
  section,
  selectedAgentId,
  onSelectAgent,
}: {
  section: DashboardSection;
  selectedAgentId: string | null;
  onSelectAgent: (id: string | null) => void;
}) {
  switch (section) {
    case "agents":
      return (
        <AgentGrid
          selectedAgentId={selectedAgentId}
          onSelectAgent={onSelectAgent}
        />
      );
    case "metrics":
      return <MetricsPanel />;
    case "logs":
      return <LogsPanel />;
    case "snapshots":
      return <ExportPanel connectionId={selectedAgentId ?? ""} />;
    case "credits":
      return <CreditsPanel />;
    case "billing":
      return <BillingPanel />;
  }
}
