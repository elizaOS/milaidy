/**
 * Apps page — single-surface app browser with optional full-screen game mode.
 */

import { useEffect } from "react";
import { useApp } from "../AppContext";
import { AppsView } from "./AppsView";
import { GameView } from "./GameView";

export function AppsPageView() {
  const { appsSubTab, activeGameViewerUrl, setState } = useApp();
  const hasActiveGame =
    typeof activeGameViewerUrl === "string" &&
    activeGameViewerUrl.trim().length > 0;

  useEffect(() => {
    if (appsSubTab === "games" && !hasActiveGame) {
      setState("appsSubTab", "browse");
    }
  }, [appsSubTab, hasActiveGame, setState]);

  if (appsSubTab === "games" && hasActiveGame) {
    return <GameView />;
  }

  return <AppsView />;
}
