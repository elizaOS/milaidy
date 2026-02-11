/**
 * Connectors page — plugins view constrained to connector plugins.
 */

import { PluginsView } from "./PluginsView";

export function ConnectorsPageView() {
  return (
    <div className="flex flex-col h-full">
      <h2 className="text-lg font-bold mb-1">Connectors</h2>
      <p className="text-[13px] text-[var(--muted)] mb-4">
        Configure chat and social connectors.
      </p>
      <PluginsView mode="connectors" />
    </div>
  );
}
