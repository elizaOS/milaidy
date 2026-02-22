/**
 * AdvancedPageView — container for advanced configuration sub-tabs.
 *
 * Sub-tabs:
 *   - Plugins: Feature/connector plugin management
 *   - Skills: Custom agent skills
 *   - Actions: Custom action management
 *   - Triggers: Automation trigger management
 *   - Fine-Tuning: Dataset and model training workflows
 *   - Trajectories: LLM call viewer and analysis
 *   - Runtime: Runtime object inspection
 *   - Databases: Tables/media/vector browser
 *   - Logs: Runtime log viewer
 */

import { useState, type ReactNode } from "react";
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

const MODAL_SUB_TABS = SUB_TABS.filter(t => t.id !== "plugins" && t.id !== "skills");

const SUBTAB_ICONS: Record<string, ReactNode> = {
  actions: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  ),
  triggers: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
    </svg>
  ),
  "fine-tuning": (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="4" y1="21" x2="4" y2="14" /><line x1="4" y1="10" x2="4" y2="3" />
      <line x1="12" y1="21" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="3" />
      <line x1="20" y1="21" x2="20" y2="16" /><line x1="20" y1="12" x2="20" y2="3" />
      <line x1="1" y1="14" x2="7" y2="14" /><line x1="9" y1="8" x2="15" y2="8" />
      <line x1="17" y1="16" x2="23" y2="16" />
    </svg>
  ),
  trajectories: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="6" cy="19" r="3" /><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15" />
      <circle cx="18" cy="5" r="3" />
    </svg>
  ),
  runtime: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4 17 10 11 4 5" /><line x1="12" y1="19" x2="20" y2="19" />
    </svg>
  ),
  database: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
    </svg>
  ),
  logs: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" />
    </svg>
  ),
};

function mapTabToSubTab(tab: Tab, inModal?: boolean): SubTab {
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
    default: return inModal ? "actions" : "plugins";
  }
}

export function AdvancedPageView({ inModal }: { inModal?: boolean } = {}) {
  const { tab, setTab, uiLanguage } = useApp();
  const t = createTranslator(uiLanguage);
  const [selectedTrajectoryId, setSelectedTrajectoryId] = useState<string | null>(null);

  const currentSubTab = mapTabToSubTab(tab, inModal);
  const tabs = inModal ? MODAL_SUB_TABS : SUB_TABS;

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
        return inModal ? <CustomActionsView /> : <PluginsPageView />;
    }
  };

  return (
    <div className={inModal ? "settings-modal-layout" : "flex flex-col h-full min-h-0"}>
      {inModal ? (
        <nav className="settings-icon-sidebar">
          {tabs.map((subTab) => (
            <button
              key={subTab.id}
              className={`settings-icon-btn ${currentSubTab === subTab.id ? "is-active" : ""}`}
              onClick={() => handleSubTabChange(subTab.id)}
              title={t(subTab.descriptionKey)}
            >
              {SUBTAB_ICONS[subTab.id]}
              <span className="settings-icon-label">{t(subTab.labelKey)}</span>
            </button>
          ))}
        </nav>
      ) : (
        <div className="mb-4 shrink-0">
          <div className="flex gap-1 border-b border-border">
            {tabs.map((subTab) => {
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
      )}

      <div
        className={inModal ? "settings-content-area" : "flex-1 min-h-0 overflow-y-auto"}
        style={inModal ? {
          "--accent": "#7b8fb5",
          "--surface": "rgba(255, 255, 255, 0.06)",
          "--s-accent": "#7b8fb5",
          "--s-text-accent": "#7b8fb5",
          "--s-accent-glow": "rgba(123, 143, 181, 0.35)",
          "--s-accent-subtle": "rgba(123, 143, 181, 0.12)",
          "--s-grid-line": "rgba(123, 143, 181, 0.02)",
          "--s-glow-edge": "rgba(123, 143, 181, 0.08)",
        } as React.CSSProperties : undefined}
      >
        {inModal ? (
          <div className="settings-section-pane pt-4">
            {renderContent()}
          </div>
        ) : renderContent()}
      </div>
    </div>
  );
}
