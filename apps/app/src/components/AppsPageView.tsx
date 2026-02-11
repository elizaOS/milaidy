/**
 * Apps page — browse apps and view running games.
 *
 * Sub-tabs: Browse | Games
 */

import { useApp } from "../AppContext";
import { AppsView } from "./AppsView";
import { GameView } from "./GameView";

const APPS_TABS = [
  { id: "browse" as const, label: "Browse" },
  { id: "games" as const, label: "Games" },
];

export function AppsPageView() {
  const { appsSubTab, setState } = useApp();

  return (
    <div>
      <div className="flex gap-1 mb-4">
        {APPS_TABS.map((t) => (
          <button
            key={t.id}
            className={`px-3 py-1.5 text-[13px] bg-transparent border-0 border-b-2 cursor-pointer transition-colors ${
              appsSubTab === t.id
                ? "text-accent font-medium border-b-accent"
                : "text-muted border-b-transparent hover:text-txt"
            }`}
            onClick={() => setState("appsSubTab", t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {appsSubTab === "browse" ? <AppsView /> : <GameView />}
    </div>
  );
}
