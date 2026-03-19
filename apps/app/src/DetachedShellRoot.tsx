import {
  ChatView,
  CloudDashboard,
  CodingAgentSettingsSection,
  ConfigPageView,
  ConnectorsPageView,
  HeartbeatsView,
  MediaSettingsSection,
  PairingView,
  PermissionsSection,
  PluginsPageView,
  ProviderSwitcher,
  SettingsView,
  StartupFailureView,
  VoiceConfigView,
} from "@elizaos/app-core/components";
import { useApp } from "@elizaos/app-core/state";
import type { JSX } from "react";
import { BrowserSurfaceWindow } from "./BrowserSurfaceWindow";
import {
  resolveDetachedShellTarget,
  type WindowShellRoute,
} from "./window-shell";

interface DetachedShellRootProps {
  route: Exclude<WindowShellRoute, { mode: "main" }>;
}

function DetachedSettingsSectionView({
  section,
}: {
  section?: string;
}): JSX.Element {
  switch (section) {
    case "ai-model":
      return <ProviderSwitcher />;
    case "cloud":
      return <CloudDashboard />;
    case "coding-agents":
      return <CodingAgentSettingsSection />;
    case "wallet-rpc":
      return <ConfigPageView embedded />;
    case "media":
      return <MediaSettingsSection />;
    case "voice":
      return <VoiceConfigView />;
    case "permissions":
      return <PermissionsSection />;
    default:
      return <SettingsView initialSection={section} />;
  }
}

function DetachedShellContent({ route }: DetachedShellRootProps): JSX.Element {
  const target = resolveDetachedShellTarget(route);

  switch (target.tab) {
    case "chat":
      return <ChatView />;
    case "browser":
      return <BrowserSurfaceWindow />;
    case "connectors":
      return <ConnectorsPageView />;
    case "plugins":
      return <PluginsPageView />;
    case "triggers":
      return (
        <section className="w-full px-4 py-4 lg:px-6">
          <HeartbeatsView />
        </section>
      );
    case "settings":
      return (
        <section className="w-full px-4 py-4 lg:px-6">
          <DetachedSettingsSectionView section={target.settingsSection} />
        </section>
      );
  }
}

export function DetachedShellRoot({
  route,
}: DetachedShellRootProps): JSX.Element {
  const { authRequired, retryStartup, startupError } = useApp();
  const isBrowserSurface = route.mode === "surface" && route.tab === "browser";

  if (!isBrowserSurface && startupError) {
    return <StartupFailureView error={startupError} onRetry={retryStartup} />;
  }

  if (!isBrowserSurface && authRequired) {
    return <PairingView />;
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 w-full font-body text-txt bg-bg">
      <main className="flex-1 min-h-0 min-w-0 overflow-auto">
        <DetachedShellContent route={route} />
      </main>
    </div>
  );
}
