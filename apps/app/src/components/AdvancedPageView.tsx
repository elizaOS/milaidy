/**
 * AdvancedPageView — container for advanced configuration sub-tabs.
 *
 * Sub-tabs:
 *   - Plugins: Feature/connector plugin management
 *   - Skills: Custom agent skills
 *   - Triggers: Automation trigger management
 *   - Fine-Tuning: Dataset and model training workflows
 *   - Trajectories: LLM call viewer and analysis
 *   - Runtime: Runtime object inspection
 *   - Databases: Tables/media/vector browser
 *   - Logs: Runtime log viewer
 */

import { useState } from "react";
import { useApp } from "../AppContext";
import type { Tab } from "../navigation";
import { CustomActionsView } from "./CustomActionsView";
import { DatabasePageView } from "./DatabasePageView";
import { FineTuningView } from "./FineTuningView";
import { LogsPageView } from "./LogsPageView";
import { PluginsPageView } from "./PluginsPageView";
import { RuntimeView } from "./RuntimeView";
import { SecurityAuditPageView } from "./SecurityAuditPageView";
import { SkillsView } from "./SkillsView";
import { TrajectoriesView } from "./TrajectoriesView";
import { TrajectoryDetailView } from "./TrajectoryDetailView";
import { TriggersView } from "./TriggersView";

type SubTab =
  | "plugins"
  | "skills"
  | "actions"
  | "triggers"
  | "fine-tuning"
  | "trajectories"
  | "runtime"
  | "database"
  | "logs"
  | "security";

const SUB_TABS: Array<{ id: SubTab; label: string; description: string }> = [
  { id: "plugins", label: "Plugins", description: "Features and connectors" },
  { id: "skills", label: "Skills", description: "Custom agent skills" },
  { id: "actions", label: "Actions", description: "Custom agent actions" },
  {
    id: "triggers",
    label: "Triggers",
    description: "Scheduled and event-based automations",
  },
  {
    id: "fine-tuning",
    label: "Fine-Tuning",
    description: "Dataset and model training workflows",
  },
  {
    id: "trajectories",
    label: "Trajectories",
    description: "LLM call history and analysis",
  },
  {
    id: "runtime",
    label: "Runtime",
    description: "Deep runtime object introspection and load order",
  },
  {
    id: "database",
    label: "Databases",
    description: "Tables, media, and vector browser",
  },
  { id: "logs", label: "Logs", description: "Runtime and service logs" },
  {
    id: "security",
    label: "Security",
    description: "Sandbox and policy audit feed",
  },
];

function mapTabToSubTab(tab: Tab): SubTab {
  switch (tab) {
    case "plugins":
      return "plugins";
    case "skills":
      return "skills";
    case "actions":
      return "actions";
    case "triggers":
      return "triggers";
    case "fine-tuning":
      return "fine-tuning";
    case "trajectories":
      return "trajectories";
    case "runtime":
      return "runtime";
    case "database":
      return "database";
    case "logs":
      return "logs";
    case "security":
      return "security";
    default:
      return "plugins";
  }
}

export function AdvancedPageView() {
  const { tab, setTab } = useApp();
  const [selectedTrajectoryId, setSelectedTrajectoryId] = useState<
    string | null
  >(null);

  const currentSubTab = mapTabToSubTab(tab);

  const handleSubTabChange = (subTab: SubTab) => {
    setSelectedTrajectoryId(null);
    switch (subTab) {
      case "plugins":
        setTab("plugins");
        break;
      case "skills":
        setTab("skills");
        break;
      case "actions":
        setTab("actions");
        break;
      case "triggers":
        setTab("triggers");
        break;
      case "fine-tuning":
        setTab("fine-tuning");
        break;
      case "trajectories":
        setTab("trajectories");
        break;
      case "runtime":
        setTab("runtime");
        break;
      case "database":
        setTab("database");
        break;
      case "logs":
        setTab("logs");
        break;
      case "security":
        setTab("security");
        break;
      default:
        setTab("plugins");
    }
  };

  const renderContent = () => {
    switch (currentSubTab) {
      case "plugins":
        return <PluginsPageView />;
      case "skills":
        return <SkillsView />;
      case "actions":
        return <CustomActionsView />;
      case "triggers":
        return <TriggersView />;
      case "fine-tuning":
        return <FineTuningView />;
      case "trajectories":
        if (selectedTrajectoryId) {
          return (
            <TrajectoryDetailView
              trajectoryId={selectedTrajectoryId}
              onBack={() => setSelectedTrajectoryId(null)}
            />
          );
        }
        return (
          <TrajectoriesView onSelectTrajectory={setSelectedTrajectoryId} />
        );
      case "runtime":
        return <RuntimeView />;
      case "database":
        return <DatabasePageView />;
      case "logs":
        return <LogsPageView />;
      case "security":
        return <SecurityAuditPageView />;
      default:
        return <PluginsPageView />;
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Sub-tab navigation (fixed) */}
      <div className="mb-4 shrink-0">
        <div className="flex gap-1 border-b border-border">
          {SUB_TABS.map((subTab) => {
            const isActive = currentSubTab === subTab.id;
            return (
              <button
                type="button"
                key={subTab.id}
                className={`px-4 py-2 text-xs font-medium border-b-2 -mb-px transition-colors ${
                  isActive
                    ? "border-accent text-accent"
                    : "border-transparent text-muted hover:text-txt hover:border-border"
                }`}
                onClick={() => handleSubTabChange(subTab.id)}
                title={subTab.description}
              >
                {subTab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content area (scrolls, header stays fixed) */}
      <div className="flex-1 min-h-0 overflow-y-auto">{renderContent()}</div>
    </div>
  );
}
