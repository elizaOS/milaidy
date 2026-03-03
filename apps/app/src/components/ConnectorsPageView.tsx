/**
 * Connectors page — plugins view with sub-tabs for social connectors and streaming destinations.
 */

import { useState } from "react";
import { PluginsView } from "./PluginsView";

type SubTab = "platforms" | "streaming";

export function ConnectorsPageView() {
  const [activeTab, setActiveTab] = useState<SubTab>("platforms");

  return (
    <div className="flex flex-col h-full">
      <h2 className="text-lg font-bold mb-1">Social</h2>
      <p className="text-[13px] text-[var(--muted)] mb-3">
        Configure chat connectors and streaming destinations.
      </p>

      {/* Sub-tab toggle */}
      <div className="flex gap-1 mb-4">
        <button
          type="button"
          onClick={() => setActiveTab("platforms")}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
            activeTab === "platforms"
              ? "bg-[var(--accent)] text-white"
              : "bg-[var(--bg-secondary)] text-[var(--muted)] hover:text-[var(--fg)]"
          }`}
        >
          Platforms
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("streaming")}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
            activeTab === "streaming"
              ? "bg-[var(--accent)] text-white"
              : "bg-[var(--bg-secondary)] text-[var(--muted)] hover:text-[var(--fg)]"
          }`}
        >
          Streaming
        </button>
      </div>

      {activeTab === "platforms" ? (
        <PluginsView mode="connectors" />
      ) : (
        <PluginsView mode="streaming" />
      )}
    </div>
  );
}
