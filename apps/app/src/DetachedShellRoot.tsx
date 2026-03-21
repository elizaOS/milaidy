import {
  ChatView,
  CloudDashboard,
  CodingAgentSettingsSection,
  ConfigPageView,
  ConnectorsPageView,
  ConversationsSidebar,
  HeartbeatsView,
  MediaSettingsSection,
  PairingView,
  PermissionsSection,
  PluginsPageView,
  ProviderSwitcher,
  SettingsView,
  StartupFailureView,
  VoiceConfigView,
} from "@miladyai/app-core/components";
import { useApp } from "@miladyai/app-core/state";
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

function DetachedChatView(): JSX.Element {
  return (
    <div className="flex flex-1 min-h-0 relative">
      <ConversationsSidebar />
      <main className="flex flex-col flex-1 min-h-0 min-w-0 overflow-hidden pt-3 px-3 xl:px-5">
        <ChatView />
      </main>
    </div>
  );
}

function OnboardingBlockedView(): JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center flex-1 min-h-0 gap-4 text-center px-6">
      <div className="text-4xl">🎀</div>
      <h2 className="text-lg font-semibold text-txt">Setup in progress</h2>
      <p className="text-sm text-muted max-w-sm">
        Complete onboarding in the main window first. This window will become
        available once your agent is ready.
      </p>
    </div>
  );
}

function DetachedShellContent({ route }: DetachedShellRootProps): JSX.Element {
  const target = resolveDetachedShellTarget(route);

  switch (target.tab) {
    case "chat":
      return <DetachedChatView />;
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
  const {
    authRequired,
    onboardingComplete,
    onboardingLoading,
    retryStartup,
    startupError,
  } = useApp();
  const isBrowserSurface = route.mode === "surface" && route.tab === "browser";

  if (!isBrowserSurface && startupError) {
    return <StartupFailureView error={startupError} onRetry={retryStartup} />;
  }

  if (!isBrowserSurface && authRequired) {
    return <PairingView />;
  }

  if (!isBrowserSurface && !onboardingLoading && !onboardingComplete) {
    return (
      <div className="flex flex-col flex-1 min-h-0 w-full font-body text-txt bg-bg">
        <OnboardingBlockedView />
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 w-full font-body text-txt bg-bg">
      <main className="flex-1 min-h-0 min-w-0 overflow-hidden">
        <DetachedShellContent route={route} />
      </main>
    </div>
  );
}
