import { useRenderGuard } from "@miladyai/app-core/hooks";
import { useApp } from "@miladyai/app-core/state";
import { memo, useCallback, useEffect } from "react";
import { ChatModalView } from "./ChatModalView";
import { CompanionHeader } from "./companion/CompanionHeader";
import {
  CompanionSceneHost,
  useSharedCompanionScene,
} from "./companion/CompanionSceneHost";

export const CompanionView = memo(function CompanionView() {
  useRenderGuard("CompanionView");
  const {
    uiLanguage,
    setUiLanguage,
    uiTheme,
    setUiTheme,
    chatAgentVoiceMuted,
    handleStartDraftConversation,
    setState,
    switchShellView,
    t,
  } = useApp();
  const hasSharedCompanionScene = useSharedCompanionScene();

  const handleShellViewChange = useCallback(
    (view: "companion" | "character" | "desktop") => {
      switchShellView(view);
    },
    [switchShellView],
  );

  useEffect(() => {
    setState("chatMode", "simple");
  }, [setState]);

  const overlay = (
    <div className="absolute inset-0 z-10 flex flex-col pointer-events-none">
      <CompanionHeader
        activeShellView="companion"
        onShellViewChange={handleShellViewChange}
        uiLanguage={uiLanguage}
        setUiLanguage={setUiLanguage}
        uiTheme={uiTheme}
        setUiTheme={setUiTheme}
        t={t}
        showCompanionControls
        chatAgentVoiceMuted={chatAgentVoiceMuted}
        onToggleVoiceMute={() =>
          setState("chatAgentVoiceMuted", !chatAgentVoiceMuted)
        }
        onNewChat={() => void handleStartDraftConversation()}
      />

      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-full max-w-3xl h-[45%] z-20 pointer-events-auto">
        <ChatModalView variant="companion-dock" />
      </div>

      {/* Main Content Area */}
      <div className="flex-1 grid grid-cols-[1fr_auto] gap-6 min-h-0 relative">
        {/* Center (Empty to show character) */}
        <div className="w-full h-full" />
      </div>
    </div>
  );

  return hasSharedCompanionScene ? (
    overlay
  ) : (
    <CompanionSceneHost active>{overlay}</CompanionSceneHost>
  );
});
