import { useRenderGuard } from "@milady/app-core/hooks";
import { useApp } from "@milady/app-core/state";
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
    setTab,
    setState,
    setUiShellMode,
    t,
  } = useApp();
  const hasSharedCompanionScene = useSharedCompanionScene();

  const handleShellModeChange = useCallback(
    (mode: "companion" | "native") => {
      setUiShellMode(mode);
      setTab(mode === "native" ? "chat" : "companion");
    },
    [setTab, setUiShellMode],
  );

  useEffect(() => {
    setState("chatMode", "simple");
  }, [setState]);

  return (
    <>
      {!hasSharedCompanionScene && <CompanionSceneHost active />}
      <div className="absolute inset-0 z-10 flex flex-col pointer-events-none">
        <CompanionHeader
          shellMode="companion"
          onShellModeChange={handleShellModeChange}
          uiLanguage={uiLanguage}
          setUiLanguage={setUiLanguage}
          uiTheme={uiTheme}
          setUiTheme={setUiTheme}
          t={t}
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
    </>
  );
});
