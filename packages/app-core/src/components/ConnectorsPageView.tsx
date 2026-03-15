/**
 * Connectors page — curated connector view.
 */

import { useApp } from "../state";
import { PluginsView } from "./PluginsView";

export function ConnectorsPageView({ inModal }: { inModal?: boolean } = {}) {
  const { t } = useApp();

  return (
    <div className="flex flex-col h-full">
      <PluginsView mode="social" inModal={inModal ?? true} />
    </div>
  );
}
