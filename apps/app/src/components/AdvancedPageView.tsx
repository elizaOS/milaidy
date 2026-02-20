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
import { createTranslator } from "../i18n";

type SubTab =
  | "plugins"
  | "skills"
  | "actions"
  | "triggers"
  | "fine-tuning"
  | "trajectories"
  | "runtime"
  | "database"
  | "logs";

const SUB_TABS: Array<{ id: SubTab; labelKey: string; descriptionKey: string }> = [
  { id: "plugins", labelKey: "advanced.plugins", descriptionKey: "advanced.pluginsDesc" },
  { id: "skills", labelKey: "advanced.skills", descriptionKey: "advanced.skillsDesc" },
  { id: "actions", labelKey: "advanced.actions", descriptionKey: "advanced.actionsDesc" },
  { id: "triggers", labelKey: "advanced.triggers", descriptionKey: "advanced.triggersDesc" },
  { id: "fine-tuning", labelKey: "advanced.fineTuning", descriptionKey: "advanced.fineTuningDesc" },
  { id: "trajectories", labelKey: "advanced.trajectories", descriptionKey: "advanced.trajectoriesDesc" },
  { id: "runtime", labelKey: "advanced.runtime", descriptionKey: "advanced.runtimeDesc" },
  { id: "database", labelKey: "advanced.database", descriptionKey: "advanced.databaseDesc" },
  { id: "logs", labelKey: "advanced.logs", descriptionKey: "advanced.logsDesc" },
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
    default: return "plugins";
  }
}

export function AdvancedPageView() {
  const { tab, setTab, uiLanguage } = useApp();
  const t = createTranslator(uiLanguage);
  const [selectedTrajectoryId, setSelectedTrajectoryId] = useState<string | null>(null);

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
                key={subTab.id}
                className={`px-4 py-2 text-xs font-medium border-b-2 -mb-px transition-colors ${
                  isActive
                    ? "border-accent text-accent"
                    : "border-transparent text-muted hover:text-txt hover:border-border"
                }`}
                onClick={() => handleSubTabChange(subTab.id)}
                title={t(subTab.descriptionKey)}
              >
                {t(subTab.labelKey)}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content area (scrolls, header stays fixed) */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {renderContent()}
      </div>
    </div>
  );
}
