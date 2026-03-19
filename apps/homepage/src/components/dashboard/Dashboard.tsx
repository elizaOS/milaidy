import { useState } from "react";
import { AgentProvider, useAgents } from "../../lib/AgentProvider";
import { isAuthenticated } from "../../lib/auth";
import { AgentGrid } from "./AgentGrid";
import { CloudLoginBanner } from "./AuthGate";
import { CreditsPanel } from "./CreditsPanel";
import { LogsPanel } from "./LogsPanel";
import { MetricsPanel } from "./MetricsPanel";
import { BillingPanel } from "./BillingPanel";
import { type DashboardSection, Sidebar } from "./Sidebar";
import { SourceBar } from "./SourceBar";

export function Dashboard() {
  const [section, setSection] = useState<DashboardSection>("agents");

  return (
    <AgentProvider>
      <div
        data-testid="dashboard"
        className="min-h-screen bg-dark text-text-light"
      >
        <div className="pt-[72px] flex min-h-screen">
          <Sidebar active={section} onChange={setSection} />
          <div className="flex-1 flex flex-col min-w-0">
            <SourceBar />
            <CloudLoginPrompt />
            <main className="flex-1 px-6 md:px-8 py-6">
              <DashboardContent section={section} />
            </main>
          </div>
        </div>
      </div>
    </AgentProvider>
  );
}

/** Show cloud login banner only when user isn't authenticated */
function CloudLoginPrompt() {
  const { refresh } = useAgents();
  if (isAuthenticated()) return null;
  return <CloudLoginBanner onAuthenticated={() => refresh()} />;
}

function DashboardContent({ section }: { section: DashboardSection }) {
  switch (section) {
    case "agents":
      return <AgentGrid />;
    case "metrics":
      return <MetricsPanel />;
    case "logs":
      return <LogsPanel />;
    case "credits":
      return <CreditsPanel />;
    case "billing":
      return <BillingPanel />;
  }
}
