/**
 * Databases page — wrapper with Tables / Media / Vectors sub-tabs.
 */

import { useApp } from "../AppContext";
import { DatabaseView } from "./DatabaseView.js";
import { MediaGalleryView } from "./MediaGalleryView.js";
import { VectorBrowserView } from "./VectorBrowserView.js";

const DB_TABS = [
  { id: "tables" as const, label: "Tables" },
  { id: "media" as const, label: "Media" },
  { id: "vectors" as const, label: "Vectors" },
];

export function DatabasePageView() {
  const { databaseSubTab, setState } = useApp();

  return (
    <div className="flex flex-col h-full">
      <h2 className="text-lg font-bold mb-1">Databases</h2>
      <p className="text-[13px] text-[var(--muted)] mb-4">Browse and query agent data.</p>

      {/* Sub-tab bar */}
      <div className="flex gap-1 border-b border-[var(--border)] mb-5">
        {DB_TABS.map((t) => (
          <button
            key={t.id}
            className={`px-4 py-2 text-[13px] bg-transparent border-0 border-b-2 cursor-pointer transition-colors ${
              databaseSubTab === t.id
                ? "text-[var(--accent)] font-medium border-b-[var(--accent)]"
                : "text-[var(--muted)] border-b-transparent hover:text-[var(--txt)]"
            }`}
            onClick={() => setState("databaseSubTab", t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Sub-tab content */}
      <div className="flex-1 min-h-0">
        {databaseSubTab === "tables" && <DatabaseView />}
        {databaseSubTab === "media" && <MediaGalleryView />}
        {databaseSubTab === "vectors" && <VectorBrowserView />}
      </div>
    </div>
  );
}
