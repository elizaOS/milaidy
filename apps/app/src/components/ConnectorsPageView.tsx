/**
 * Connectors page — plugins view for social platform connectors.
 *
 * Streaming plugins are managed directly in the Stream UI's Channel panel.
 */

import { PluginsView } from "./PluginsView";

export function ConnectorsPageView({ inModal }: { inModal?: boolean } = {}) {
  return (
    <div className="flex flex-col h-full">
      {!inModal && (
        <>
          <h2 className="text-lg font-bold mb-1">Social</h2>
          <p className="text-[13px] text-[var(--muted)] mb-3">
            Configure chat connectors for social platforms.
          </p>
        </>
      )}
      <PluginsView mode="connectors" inModal={inModal} />
    </div>
  );
}
