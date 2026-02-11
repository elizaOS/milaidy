/**
 * Plugins view — wrapper with Features / Connectors / Plugins / Skills sub-tabs.
 */

import { useApp } from "../AppContext";
import { FeaturesView, ConnectorsView, BasePluginsView } from "./PluginsView";
import { SkillsView } from "./SkillsView";

const PLUGIN_TABS = [
  { id: "features" as const, label: "Features" },
  { id: "connectors" as const, label: "Connectors" },
  { id: "plugins" as const, label: "System" },
  { id: "skills" as const, label: "Skills" },
];

export function PluginsPageView() {
  const { pluginsSubTab, setState } = useApp();

  return (
    <div>
      {/* Sub-tab bar */}
      <div className="flex gap-1 border-b border-[var(--border)] mb-5">
        {PLUGIN_TABS.map((t) => (
          <button
            key={t.id}
            className={`px-4 py-2 text-[13px] bg-transparent border-0 border-b-2 cursor-pointer transition-colors ${
              pluginsSubTab === t.id
                ? "text-[var(--accent)] font-medium border-b-[var(--accent)]"
                : "text-[var(--muted)] border-b-transparent hover:text-[var(--txt)]"
            }`}
            onClick={() => setState("pluginsSubTab", t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Sub-tab content */}
      {pluginsSubTab === "features" && <FeaturesView />}
      {pluginsSubTab === "connectors" && <ConnectorsView />}
      {pluginsSubTab === "plugins" && <BasePluginsView />}
      {pluginsSubTab === "skills" && <SkillsView />}
    </div>
  );
}
