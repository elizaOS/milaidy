/**
 * AdvancedPageView — container for advanced configuration sub-tabs.
 *
 * Uses a side navigation with breadcrumb header.
 */

import { useState } from "react";
import { useApp } from "../AppContext";
import { PluginsPageView } from "./PluginsPageView";
import { SkillsView } from "./SkillsView";
import { CustomActionsView } from "./CustomActionsView";
import { FineTuningView } from "./FineTuningView";
import { TrajectoriesView } from "./TrajectoriesView";
import { TrajectoryDetailView } from "./TrajectoryDetailView";
import { RuntimeView } from "./RuntimeView";
import { DatabasePageView } from "./DatabasePageView";
import { LogsPageView } from "./LogsPageView";
import { TriggersView } from "./TriggersView";
import type { Tab } from "../navigation";

type SubTab =
  | "skills"
  | "plugins"
  | "fine-tuning"
  | "actions"
  | "triggers"
  | "trajectories"
  | "runtime"
  | "database"
  | "logs";

const SUB_TABS: Array<{ id: SubTab; label: string; description: string }> = [
  { id: "skills", label: "Skills", description: "Custom agent skills" },
  { id: "plugins", label: "Plugins", description: "Features and connectors" },
  { id: "fine-tuning", label: "Fine-Tuning", description: "Dataset and model training workflows" },
  { id: "actions", label: "Actions", description: "Custom agent actions" },
  { id: "triggers", label: "Triggers", description: "Scheduled and event-based automations" },
  { id: "trajectories", label: "Trajectories", description: "LLM call history and analysis" },
  { id: "runtime", label: "Runtime", description: "Deep runtime object introspection and load order" },
  { id: "database", label: "Databases", description: "Tables, media, and vector browser" },
  { id: "logs", label: "Logs", description: "Runtime and service logs" },
];

function mapTabToSubTab(tab: Tab): SubTab {
  switch (tab) {
    case "plugins": return "plugins";
    case "skills": return "skills";
    case "actions": return "actions";
    case "triggers": return "triggers";
    case "fine-tuning": return "fine-tuning";
    case "trajectories": return "trajectories";
    case "runtime": return "runtime";
    case "database": return "database";
    case "logs": return "logs";
    default: return "skills";
  }
}

export function AdvancedPageView() {
  const { tab, setTab } = useApp();
  const [selectedTrajectoryId, setSelectedTrajectoryId] = useState<string | null>(null);

  const currentSubTab = mapTabToSubTab(tab);
  const currentLabel = SUB_TABS.find((s) => s.id === currentSubTab)?.label ?? "Advanced";

  const handleSubTabChange = (subTab: SubTab) => {
    setSelectedTrajectoryId(null);
    setTab(subTab as Tab);
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
      default:
        return <SkillsView />;
    }
  };

  return (
    <div className="flex h-full min-h-0">
      {/* Side navigation */}
      <nav className="w-44 min-w-44 border-r border-border py-3 px-2 flex flex-col gap-0.5 overflow-y-auto shrink-0">
        {SUB_TABS.map((subTab) => {
          const isActive = currentSubTab === subTab.id;
          return (
            <button
              key={subTab.id}
              className={`text-left px-3 py-1.5 text-[13px] rounded border-0 cursor-pointer transition-colors ${
                isActive
                  ? "bg-accent text-accent-fg font-medium"
                  : "bg-transparent text-muted hover:bg-bg-hover hover:text-txt"
              }`}
              onClick={() => handleSubTabChange(subTab.id)}
              title={subTab.description}
            >
              {subTab.label}
            </button>
          );
        })}
      </nav>

      {/* Main content area */}
      <div className="flex-1 min-w-0 flex flex-col min-h-0">
        {/* Breadcrumb */}
        <div className="px-5 py-2 border-b border-border shrink-0">
          <div className="flex items-center gap-1.5 text-[13px]">
            <span className="text-muted">Advanced</span>
            <span className="text-muted">/</span>
            <span className="text-txt font-medium">{currentLabel}</span>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
          {renderContent()}
        </div>
      </div>
    </div>
  );
}
