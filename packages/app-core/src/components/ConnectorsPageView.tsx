/**
 * Social page — curated chat connector view.
 */

import { useApp } from "../state";
import { PluginsView } from "./PluginsView";

export function ConnectorsPageView({ inModal }: { inModal?: boolean } = {}) {
  const { t } = useApp();

  return (
    <div className="flex flex-col h-full">
      <h2 className="text-lg font-bold mb-3">
        {t("connectorspageview.Social")}
      </h2>
      <PluginsView mode="social" inModal={inModal ?? true} />
    </div>
  );
}
