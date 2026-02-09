/**
 * Game View — embeds a running app's game client in an iframe.
 */

import { useState, useCallback } from "react";
import { client } from "../../ui/api-client.js";
import { useApp } from "../AppContext.js";

export function GameView() {
  const { activeGameApp, activeGameDisplayName, activeGameViewerUrl, activeGameSandbox, setState, setActionNotice } = useApp();
  const [stopping, setStopping] = useState(false);

  const handleStop = useCallback(async () => {
    if (!activeGameApp) return;
    setStopping(true);
    try {
      await client.stopApp(activeGameApp);
      setState("activeGameApp", "");
      setState("activeGameDisplayName", "");
      setState("activeGameViewerUrl", "");
      setState("tab", "apps" as never);
      setActionNotice("App stopped.", "success");
    } catch (err) {
      setActionNotice(`Failed to stop: ${err instanceof Error ? err.message : "error"}`, "error");
    } finally {
      setStopping(false);
    }
  }, [activeGameApp, setState, setActionNotice]);

  if (!activeGameViewerUrl) {
    return (
      <div className="flex items-center justify-center py-10 text-muted italic">
        No game is currently running.{" "}
        <button
          onClick={() => setState("tab", "apps" as never)}
          className="text-xs px-3 py-1 bg-accent text-accent-fg border border-accent cursor-pointer hover:bg-accent-hover disabled:opacity-40 ml-2"
        >
          Browse Apps
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-card">
        <span className="font-bold text-sm">{activeGameDisplayName || activeGameApp}</span>
        <span className="flex-1" />
        <button
          className="text-xs px-3 py-1 bg-accent text-accent-fg border border-accent cursor-pointer hover:bg-accent-hover disabled:opacity-40"
          disabled={stopping}
          onClick={handleStop}
        >
          {stopping ? "Stopping..." : "Stop"}
        </button>
        <button
          className="text-xs px-3 py-1 bg-accent text-accent-fg border border-accent cursor-pointer hover:bg-accent-hover disabled:opacity-40"
          onClick={() => setState("tab", "apps" as never)}
        >
          Back to Apps
        </button>
      </div>
      <div className="flex-1 min-h-0 relative">
        <iframe
          src={activeGameViewerUrl}
          sandbox={activeGameSandbox}
          className="w-full h-full border-none"
          title={activeGameDisplayName || "Game"}
        />
      </div>
    </div>
  );
}
