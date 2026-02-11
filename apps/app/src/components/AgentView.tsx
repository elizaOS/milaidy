/**
 * Agent view — wrapper with Character / Inventory sub-tabs.
 */

import { useApp } from "../AppContext";
import { CharacterView } from "./CharacterView";
import { InventoryView } from "./InventoryView";

const AGENT_TABS = [
  { id: "character" as const, label: "Character" },
  { id: "inventory" as const, label: "Inventory" },
];

export function AgentView() {
  const { agentSubTab, setState } = useApp();

  return (
    <div>
      {/* Sub-tab bar */}
      <div className="flex gap-1 border-b border-[var(--border)] mb-5">
        {AGENT_TABS.map((t) => (
          <button
            key={t.id}
            className={`px-4 py-2 text-[13px] bg-transparent border-0 border-b-2 cursor-pointer transition-colors ${
              agentSubTab === t.id
                ? "text-[var(--accent)] font-medium border-b-[var(--accent)]"
                : "text-[var(--muted)] border-b-transparent hover:text-[var(--txt)]"
            }`}
            onClick={() => setState("agentSubTab", t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Sub-tab content */}
      {agentSubTab === "character" && <CharacterView />}
      {agentSubTab === "inventory" && <InventoryView />}
    </div>
  );
}
