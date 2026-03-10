/**
 * Connectors page — plugins view with sub-tabs for social connectors and streaming destinations.
 */

import { useState } from "react";
import { PluginsView } from "./PluginsView";
import { useApp } from "../AppContext";

type SubTab = "platforms" | "streaming";

export function ConnectorsPageView({ inModal }: { inModal?: boolean } = {}) {
    const { t } = useApp();
  const [activeTab, setActiveTab] = useState<SubTab>("platforms");

  const tabBtnBase =
    "px-3 py-1.5 text-xs font-medium rounded-md transition-colors";
  const tabBtnActive = inModal
    ? "bg-white/15 text-white border border-white/20"
    : "bg-[var(--accent)] text-white";
  const tabBtnInactive = inModal
    ? "bg-white/5 text-white/50 hover:text-white/80 border border-transparent"
    : "bg-[var(--bg-secondary)] text-[var(--muted)] hover:text-[var(--fg)]";

  return (
    <div className="flex flex-col h-full">
      {!inModal && (
        <>
          <h2 className="text-lg font-bold mb-1">{t("connectorspageview.Social")}</h2>
          <p className="text-[13px] text-[var(--muted)] mb-3">
            
                                  {t("connectorspageview.ConfigureChatConne")}
                                </p>
        </>
      )}

      {/* Sub-tab toggle */}
      <div className="flex gap-1 mb-4">
        <button
          type="button"
          onClick={() => setActiveTab("platforms")}
          className={`${tabBtnBase} ${
            activeTab === "platforms" ? tabBtnActive : tabBtnInactive
          }`}
        >
          
                            {t("connectorspageview.Platforms")}
                          </button>
        <button
          type="button"
          onClick={() => setActiveTab("streaming")}
          className={`${tabBtnBase} ${
            activeTab === "streaming" ? tabBtnActive : tabBtnInactive
          }`}
        >
          
                            {t("connectorspageview.Streaming")}
                          </button>
      </div>

      {activeTab === "platforms" ? (
        <PluginsView mode="connectors" inModal={inModal} />
      ) : (
        <PluginsView mode="streaming" inModal={inModal} />
      )}
    </div>
  );
}
