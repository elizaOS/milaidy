/**
 * Connectors page — plugins view constrained to connector plugins.
 */

import { PluginsView } from "./PluginsView";

export function ConnectorsPageView({ inModal }: { inModal?: boolean }) {
  if (inModal) {
    return <PluginsView mode="connectors" inModal={true} />;
  }

  return (
    <div className="flex flex-col h-full">
      <h2 className="text-lg font-bold mb-1">Social</h2>
      <p className="text-[13px] mb-4 text-[var(--muted)]">
        Configure chat and social connectors.
      </p>
      <PluginsView mode="connectors" />
    </div>
  );
}
