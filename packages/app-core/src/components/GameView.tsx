/**
 * Game View — embeds a running app's game client in an iframe.
 *
 * Features:
 * - Full-screen iframe for game client
 * - PostMessage auth for HYPERSCAPE_AUTH / RS_2004SCAPE_AUTH
 * - Split-screen mode with agent logs panel
 * - Connection status indicator
 */

import { Button, Input } from "@miladyai/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { client, type LogEntry } from "../api";
import { invokeDesktopBridgeRequest, isElectrobunRuntime } from "../bridge";
import { useRetakeCapture, useTimeout } from "../hooks";
import { useApp } from "../state";
import { openExternalUrl } from "../utils";
import type { DesktopClickAuditItem } from "../utils/desktop-workspace";
import { formatTime } from "./format";

const DEFAULT_VIEWER_SANDBOX = "allow-scripts allow-same-origin allow-popups";
const READY_EVENT_BY_AUTH_TYPE: Record<string, string> = {
  HYPERSCAPE_AUTH: "HYPERSCAPE_READY",
  RS_2004SCAPE_AUTH: "RS_2004SCAPE_READY",
};

function resolvePostMessageTargetOrigin(viewerUrl: string): string {
  if (viewerUrl.startsWith("/")) return window.location.origin;
  const match = viewerUrl.match(/^https?:\/\/[^/?#]+/i);
  return match?.[0] ?? "*";
}

/** Tag badge colors for logs panel. */
const TAG_COLORS: Record<string, { bg: string; fg: string }> = {
  agent: { bg: "rgba(99, 102, 241, 0.15)", fg: "rgb(99, 102, 241)" },
  game: { bg: "rgba(34, 197, 94, 0.15)", fg: "rgb(34, 197, 94)" },
  autonomy: { bg: "rgba(245, 158, 11, 0.15)", fg: "rgb(245, 158, 11)" },
  websocket: { bg: "rgba(20, 184, 166, 0.15)", fg: "rgb(20, 184, 166)" },
};

export const DESKTOP_GAME_CLICK_AUDIT: readonly DesktopClickAuditItem[] = [
  {
    id: "game-native-refresh",
    entryPoint: "game",
    label: "Refresh Native Window State",
    expectedAction: "Refresh canvas bounds and GPU window state.",
    runtimeRequirement: "desktop",
    coverage: "automated",
  },
  {
    id: "game-native-focus",
    entryPoint: "game",
    label: "Focus Game Window",
    expectedAction: "Focus the native game canvas window.",
    runtimeRequirement: "desktop",
    coverage: "automated",
  },
  {
    id: "game-native-visibility",
    entryPoint: "game",
    label: "Show/Hide Game Window",
    expectedAction: "Show or hide the native game canvas window.",
    runtimeRequirement: "desktop",
    coverage: "automated",
  },
  {
    id: "game-native-snapshot",
    entryPoint: "game",
    label: "Snapshot Game Window",
    expectedAction: "Capture a native snapshot of the game canvas window.",
    runtimeRequirement: "desktop",
    coverage: "automated",
  },
  {
    id: "game-gpu-window",
    entryPoint: "game",
    label: "Launch GPU Diagnostics",
    expectedAction: "Create or focus a safe GPU diagnostics window.",
    runtimeRequirement: "desktop",
    coverage: "automated",
  },
] as const;

export function DesktopGameWindowControls({
  gameWindowId,
}: {
  gameWindowId: string | null;
}) {
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [boundsLabel, setBoundsLabel] = useState("Bounds unavailable.");
  const [gpuWindowId, setGpuWindowId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!gameWindowId) {
      setBoundsLabel("Waiting for native game window.");
    } else {
      const bounds = await invokeDesktopBridgeRequest<{
        x: number;
        y: number;
        width: number;
        height: number;
      }>({
        rpcMethod: "canvasGetBounds",
        ipcChannel: "canvas:getBounds",
        params: { id: gameWindowId },
      });
      if (bounds) {
        setBoundsLabel(
          `${bounds.width}x${bounds.height} @ ${bounds.x},${bounds.y}`,
        );
      }
    }

    const gpuWindows = await invokeDesktopBridgeRequest<{
      windows: Array<{ id: string }>;
    }>({
      rpcMethod: "gpuWindowList",
      ipcChannel: "gpuWindow:list",
    });
    setGpuWindowId(gpuWindows?.windows[0]?.id ?? null);
  }, [gameWindowId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const runAction = useCallback(
    async (
      id: string,
      action: () => Promise<void>,
      successMessage?: string,
      refreshAfter = true,
    ) => {
      setBusyAction(id);
      setError(null);
      setMessage(null);
      try {
        await action();
        if (refreshAfter) {
          await refresh();
        }
        if (successMessage) {
          setMessage(successMessage);
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Native game action failed.",
        );
      } finally {
        setBusyAction(null);
      }
    },
    [refresh],
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="rounded border border-border px-2 py-1 text-[10px] text-muted">
        {boundsLabel}
      </span>
      <Button
        variant="outline"
        size="sm"
        className="h-7 text-xs shadow-sm hover:border-accent"
        onClick={() =>
          void runAction(
            "game-native-refresh",
            async () => {},
            "Native game state refreshed.",
          )
        }
        disabled={busyAction === "game-native-refresh"}
      >
        Refresh Native State
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="h-7 text-xs shadow-sm hover:border-accent"
        onClick={() =>
          void runAction(
            "game-native-focus",
            async () => {
              if (!gameWindowId) {
                throw new Error("Game window not ready yet.");
              }
              await invokeDesktopBridgeRequest<void>({
                rpcMethod: "canvasFocus",
                ipcChannel: "canvas:focus",
                params: { id: gameWindowId },
              });
            },
            "Focused native game window.",
            false,
          )
        }
        disabled={!gameWindowId || busyAction === "game-native-focus"}
      >
        Focus Window
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="h-7 text-xs shadow-sm hover:border-accent"
        onClick={() =>
          void runAction(
            "game-native-show",
            async () => {
              if (!gameWindowId) {
                throw new Error("Game window not ready yet.");
              }
              await invokeDesktopBridgeRequest<void>({
                rpcMethod: "canvasShow",
                ipcChannel: "canvas:show",
                params: { id: gameWindowId },
              });
            },
            "Shown native game window.",
            false,
          )
        }
        disabled={!gameWindowId || busyAction === "game-native-show"}
      >
        Show Window
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="h-7 text-xs shadow-sm hover:border-accent"
        onClick={() =>
          void runAction(
            "game-native-hide",
            async () => {
              if (!gameWindowId) {
                throw new Error("Game window not ready yet.");
              }
              await invokeDesktopBridgeRequest<void>({
                rpcMethod: "canvasHide",
                ipcChannel: "canvas:hide",
                params: { id: gameWindowId },
              });
            },
            "Hid native game window.",
            false,
          )
        }
        disabled={!gameWindowId || busyAction === "game-native-hide"}
      >
        Hide Window
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="h-7 text-xs shadow-sm hover:border-accent"
        onClick={() =>
          void runAction(
            "game-native-snapshot",
            async () => {
              if (!gameWindowId) {
                throw new Error("Game window not ready yet.");
              }
              const snapshot = await invokeDesktopBridgeRequest<{
                data: string;
              } | null>({
                rpcMethod: "canvasSnapshot",
                ipcChannel: "canvas:snapshot",
                params: { id: gameWindowId, format: "png" },
              });
              if (!snapshot?.data) {
                throw new Error("Snapshot unavailable.");
              }
            },
            "Captured native game snapshot.",
            false,
          )
        }
        disabled={!gameWindowId || busyAction === "game-native-snapshot"}
      >
        Snapshot Window
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="h-7 text-xs shadow-sm hover:border-accent"
        onClick={() =>
          void runAction(
            "game-gpu-window",
            async () => {
              const created = await invokeDesktopBridgeRequest<{ id: string }>({
                rpcMethod: "gpuWindowCreate",
                ipcChannel: "gpuWindow:create",
                params: {
                  id: "milady-gpu-diagnostics",
                  title: "Milady GPU Diagnostics",
                  width: 640,
                  height: 360,
                },
              });
              const nextGpuWindowId = created?.id ?? gpuWindowId;
              if (nextGpuWindowId) {
                await invokeDesktopBridgeRequest<void>({
                  rpcMethod: "gpuWindowShow",
                  ipcChannel: "gpuWindow:show",
                  params: { id: nextGpuWindowId },
                });
                await invokeDesktopBridgeRequest<void>({
                  rpcMethod: "gpuWindowGetInfo",
                  ipcChannel: "gpuWindow:getInfo",
                  params: { id: nextGpuWindowId },
                });
                setGpuWindowId(nextGpuWindowId);
              }
            },
            "GPU diagnostics window ready.",
          )
        }
        disabled={busyAction === "game-gpu-window"}
      >
        Launch GPU Diagnostics
      </Button>
      {gpuWindowId && (
        <>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs shadow-sm hover:border-accent"
            onClick={() =>
              void runAction(
                "game-gpu-show",
                async () => {
                  await invokeDesktopBridgeRequest<void>({
                    rpcMethod: "gpuWindowShow",
                    ipcChannel: "gpuWindow:show",
                    params: { id: gpuWindowId },
                  });
                },
                "GPU diagnostics window shown.",
                false,
              )
            }
            disabled={busyAction === "game-gpu-show"}
          >
            Show GPU Window
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs shadow-sm hover:border-accent"
            onClick={() =>
              void runAction(
                "game-gpu-hide",
                async () => {
                  await invokeDesktopBridgeRequest<void>({
                    rpcMethod: "gpuWindowHide",
                    ipcChannel: "gpuWindow:hide",
                    params: { id: gpuWindowId },
                  });
                },
                "GPU diagnostics window hidden.",
                false,
              )
            }
            disabled={busyAction === "game-gpu-hide"}
          >
            Hide GPU Window
          </Button>
        </>
      )}
      {(message || error) && (
        <span className={`text-[10px] ${error ? "text-danger" : "text-ok"}`}>
          {error ?? message}
        </span>
      )}
    </div>
  );
}

export function GameView() {
  const { setTimeout } = useTimeout();
  const {
    activeGameApp,
    activeGameDisplayName,
    activeGameViewerUrl,
    activeGameSandbox,
    activeGamePostMessageAuth,
    activeGamePostMessagePayload,
    gameOverlayEnabled,
    plugins,
    logs,
    loadLogs,
    setState,
    setActionNotice,
    t,
  } = useApp();
  const isElectrobun = isElectrobunRuntime();
  const [stopping, setStopping] = useState(false);
  const [showLogsPanel, setShowLogsPanel] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<
    "connecting" | "connected" | "disconnected"
  >("connecting");
  const [chatInput, setChatInput] = useState("");
  const [sendingChat, setSendingChat] = useState(false);
  const [retakeCapture, setRetakeCapture] = useState(false);
  const [gameWindowId, setGameWindowId] = useState<string | null>(null);
  const gameWindowIdRef = useRef<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const authSentRef = useRef(false);
  const viewerSessionRef = useRef<string>("");
  const logsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Stream iframe frames to retake.tv when capture is active
  useRetakeCapture(iframeRef, retakeCapture);

  // Send command to the agent - routes through elizaOS which processes
  // the message and decides what game actions to take
  const handleSendChat = useCallback(async () => {
    const content = chatInput.trim();
    if (!content) return;
    setSendingChat(true);
    try {
      // Send message to elizaOS agent - it will process and execute game actions
      // Examples: "go chop some wood", "attack the goblin", "go to the bank"
      const response = await client.sendChatRest(content, "DM");
      setChatInput("");
      // Show agent's response
      if (response.text) {
        setActionNotice(
          `Agent: ${response.text.slice(0, 100)}${response.text.length > 100 ? "..." : ""}`,
          "success",
          4000,
        );
      } else {
        setActionNotice("Command sent to agent.", "success", 2000);
      }
      // Refresh logs to show activity
      setTimeout(() => void loadLogs(), 1500);
    } catch (err) {
      setActionNotice(
        `Failed to send: ${err instanceof Error ? err.message : "error"}`,
        "error",
        3000,
      );
    } finally {
      setSendingChat(false);
    }
  }, [
    chatInput,
    setActionNotice,
    loadLogs, // Refresh logs to show activity
    setTimeout,
  ]);
  const postMessageTargetOrigin = useMemo(
    () => resolvePostMessageTargetOrigin(activeGameViewerUrl),
    [activeGameViewerUrl],
  );
  const viewerSessionKey = useMemo(
    () =>
      `${activeGameViewerUrl}::${JSON.stringify(activeGamePostMessagePayload ?? null)}`,
    [activeGamePostMessagePayload, activeGameViewerUrl],
  );

  // Only show retake capture button when the retake connector is enabled
  const retakeEnabled = useMemo(
    () => plugins.some((p) => p.id === "retake" && p.enabled),
    [plugins],
  );

  // Filter logs relevant to the current game
  const gameLogs = useMemo(() => {
    if (!activeGameApp) return [];
    const appKeyword = activeGameApp.toLowerCase().replace("@elizaos/app-", "");
    return logs.filter((entry) => {
      const message = (entry.message ?? "").toLowerCase();
      const source = (entry.source ?? "").toLowerCase();
      const tags = (entry.tags ?? []).map((t) => t.toLowerCase());
      return (
        message.includes(appKeyword) ||
        source.includes(appKeyword) ||
        tags.some((t) => t.includes(appKeyword)) ||
        tags.includes("game") ||
        tags.includes("autonomy") ||
        source.includes("agent")
      );
    });
  }, [activeGameApp, logs]);

  // Auto-refresh logs when panel is open
  useEffect(() => {
    if (!showLogsPanel) {
      if (logsIntervalRef.current) {
        clearInterval(logsIntervalRef.current);
        logsIntervalRef.current = null;
      }
      return;
    }
    void loadLogs();
    logsIntervalRef.current = setInterval(() => void loadLogs(), 3000);
    return () => {
      if (logsIntervalRef.current) {
        clearInterval(logsIntervalRef.current);
        logsIntervalRef.current = null;
      }
    };
  }, [showLogsPanel, loadLogs]);

  // Open the game URL in an isolated Electrobun BrowserWindow.
  // Runs whenever the viewer URL or game title changes and we're inside the desktop app.
  useEffect(() => {
    if (!isElectrobun || !activeGameViewerUrl) return;

    let cancelled = false;

    void invokeDesktopBridgeRequest<{ id: string }>({
      rpcMethod: "gameOpenWindow",
      ipcChannel: "game:openWindow",
      params: {
        url: activeGameViewerUrl,
        title: activeGameDisplayName || activeGameApp || "Game",
      },
    })
      .then((result) => {
        if (cancelled) return;
        if (result?.id) {
          gameWindowIdRef.current = result.id;
          setGameWindowId(result.id);
          setConnectionStatus("connected");
        }
      })
      .catch((err) => {
        console.warn("[GameView] game:openWindow failed:", err);
        // Fall through — iframe fallback is still rendered
      });

    return () => {
      cancelled = true;
      // Close the game window when GameView unmounts or the URL changes
      if (gameWindowIdRef.current) {
        void invokeDesktopBridgeRequest({
          rpcMethod: "canvasDestroyWindow",
          ipcChannel: "canvas:destroyWindow",
          params: { id: gameWindowIdRef.current },
        }).catch(() => {});
        gameWindowIdRef.current = null;
        setGameWindowId(null);
      }
    };
  }, [activeGameViewerUrl, activeGameApp, activeGameDisplayName, isElectrobun]);

  // Reset auth handshake state when the active viewer session changes.
  useEffect(() => {
    if (viewerSessionRef.current !== viewerSessionKey) {
      viewerSessionRef.current = viewerSessionKey;
      authSentRef.current = false;
    }
    if (activeGamePostMessageAuth) {
      setConnectionStatus("connecting");
      return;
    }
    // No auth required, assume connected once iframe loads.
    setConnectionStatus("connected");
  }, [activeGamePostMessageAuth, viewerSessionKey]);

  const resetActiveGameState = useCallback(() => {
    setState("activeGameApp", "");
    setState("activeGameDisplayName", "");
    setState("activeGameViewerUrl", "");
    setState("activeGameSandbox", DEFAULT_VIEWER_SANDBOX);
    setState("activeGamePostMessageAuth", false);
    setState("activeGamePostMessagePayload", null);
  }, [setState]);

  useEffect(() => {
    if (!activeGamePostMessageAuth || !activeGamePostMessagePayload) return;
    if (authSentRef.current) return;
    const expectedReadyType =
      READY_EVENT_BY_AUTH_TYPE[activeGamePostMessagePayload.type];
    if (!expectedReadyType) return;

    const onMessage = (event: MessageEvent<{ type?: string }>) => {
      if (authSentRef.current) return;
      const iframeWindow = iframeRef.current?.contentWindow;
      if (!iframeWindow || event.source !== iframeWindow) return;
      if (event.data?.type !== expectedReadyType) return;
      if (
        postMessageTargetOrigin !== "*" &&
        event.origin !== postMessageTargetOrigin
      ) {
        return;
      }
      iframeWindow.postMessage(
        activeGamePostMessagePayload,
        postMessageTargetOrigin,
      );
      authSentRef.current = true;
      setConnectionStatus("connected");
      setActionNotice("Viewer auth sent.", "info", 1800);
    };

    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
    };
  }, [
    activeGamePostMessageAuth,
    activeGamePostMessagePayload,
    postMessageTargetOrigin,
    setActionNotice,
  ]);

  const handleOpenInNewTab = useCallback(async () => {
    try {
      await openExternalUrl(activeGameViewerUrl);
    } catch {
      setActionNotice(
        "Popup blocked. Allow popups and try again.",
        "error",
        3600,
      );
    }
  }, [activeGameViewerUrl, setActionNotice]);

  const handleStop = useCallback(async () => {
    if (!activeGameApp) return;
    setStopping(true);
    try {
      const stopResult = await client.stopApp(activeGameApp);
      resetActiveGameState();
      setState("tab", "apps");
      setActionNotice(
        stopResult.message,
        stopResult.success ? "success" : "info",
        stopResult.needsRestart ? 5000 : 3200,
      );
    } catch (err) {
      setActionNotice(
        `Failed to stop: ${err instanceof Error ? err.message : "error"}`,
        "error",
      );
    } finally {
      setStopping(false);
    }
  }, [activeGameApp, resetActiveGameState, setState, setActionNotice]);

  if (!activeGameViewerUrl) {
    return (
      <div className="flex items-center justify-center py-10 text-muted italic">
        {t("game.noActiveSession")}{" "}
        <Button
          variant="default"
          size="sm"
          onClick={() => {
            setState("tab", "apps");
            setState("appsSubTab", "browse");
          }}
          className="ml-2 font-bold tracking-wide shadow-sm"
        >
          {t("game.backToApps")}
        </Button>
      </div>
    );
  }

  const renderLogsPanel = () => (
    <div className="w-80 border-l border-border bg-card flex flex-col min-h-0">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
        <span className="font-bold text-xs">{t("game.agentActivity")}</span>
        <span className="flex-1" />
        <Button
          variant="outline"
          size="sm"
          className="h-6 text-[10px] px-2 py-0 border-border bg-card hover:border-accent"
          onClick={() => void loadLogs()}
        >
          {t("common.refresh")}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-6 text-[10px] px-2 py-0 border-border bg-card hover:border-accent"
          onClick={() => setShowLogsPanel(false)}
        >
          {t("common.hide")}
        </Button>
      </div>
      {/* Chat input for sending commands to agent */}
      <div className="flex items-center gap-2 px-2 py-2 border-b border-border">
        <Input
          type="text"
          value={chatInput}
          onChange={(e) => setChatInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !sendingChat) {
              e.preventDefault();
              handleSendChat();
            }
          }}
          placeholder={t("game.chatPlaceholder")}
          className="flex-1 h-8 text-xs bg-bg focus-visible:ring-accent"
          disabled={sendingChat}
        />
        <Button
          variant="default"
          size="sm"
          onClick={handleSendChat}
          disabled={sendingChat || !chatInput.trim()}
          className="h-8 shadow-sm font-bold tracking-wide"
        >
          {sendingChat ? "..." : t("common.send")}
        </Button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-2 text-[11px] font-mono">
        {gameLogs.length === 0 ? (
          <div className="text-center py-4 text-muted italic">
            {t("game.noAgentActivity")}
          </div>
        ) : (
          gameLogs.slice(0, 50).map((entry: LogEntry, idx) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: composite key with index as tiebreaker
              key={`${entry.timestamp}-${idx}`}
              className="py-1 border-b border-border/50 flex flex-col gap-0.5"
            >
              <div className="flex items-center gap-1">
                <span className="text-muted text-[10px]">
                  {formatTime(entry.timestamp, { fallback: "—" })}
                </span>
                <span
                  className={`font-semibold text-[10px] uppercase ${
                    entry.level === "error"
                      ? "text-danger"
                      : entry.level === "warn"
                        ? "text-warn"
                        : "text-muted"
                  }`}
                >
                  {entry.level}
                </span>
                {(entry.tags ?? []).slice(0, 2).map((t: string) => {
                  const c = TAG_COLORS[t];
                  return (
                    <span
                      key={t}
                      className="text-[9px] px-1 py-px rounded"
                      style={{
                        background: c ? c.bg : "var(--bg-muted)",
                        color: c ? c.fg : "var(--muted)",
                      }}
                    >
                      {t}
                    </span>
                  );
                })}
              </div>
              <div className="text-txt break-all">{entry.message}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );

  const connectionStatusColor =
    connectionStatus === "connected"
      ? "text-ok border-ok"
      : connectionStatus === "connecting"
        ? "text-warn border-warn"
        : "text-danger border-danger";

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-card">
        <span className="font-bold text-sm">
          {activeGameDisplayName || activeGameApp}
        </span>
        {/* Connection status indicator */}
        <span
          className={`text-[10px] px-1.5 py-0.5 border ${connectionStatusColor}`}
        >
          {connectionStatus === "connected"
            ? t("game.connected")
            : connectionStatus === "connecting"
              ? t("game.connecting")
              : t("game.disconnected")}
        </span>
        {activeGamePostMessageAuth ? (
          <span className="text-[10px] px-1.5 py-0.5 border border-border text-muted">
            {t("gameview.postMessageAuth")}
          </span>
        ) : null}
        <span className="flex-1" />
        {/* Toggle logs panel */}
        <Button
          variant={showLogsPanel ? "default" : "outline"}
          size="sm"
          className="h-7 text-xs shadow-sm hover:border-accent"
          onClick={() => setShowLogsPanel(!showLogsPanel)}
        >
          {showLogsPanel ? t("game.hideLogs") : t("game.showLogs")}
        </Button>
        {isElectrobun && (
          <DesktopGameWindowControls gameWindowId={gameWindowId} />
        )}
        {retakeEnabled && (
          <Button
            variant={retakeCapture ? "default" : "outline"}
            size="sm"
            className="h-7 text-xs shadow-sm hover:border-accent"
            onClick={() => setRetakeCapture(!retakeCapture)}
            title={t("game.retakeTitle")}
          >
            {retakeCapture ? t("game.stopCapture") : t("game.retakeCapture")}
          </Button>
        )}
        <Button
          variant={gameOverlayEnabled ? "default" : "outline"}
          size="sm"
          className="h-7 text-xs shadow-sm hover:border-accent"
          onClick={() => setState("gameOverlayEnabled", !gameOverlayEnabled)}
          title={
            gameOverlayEnabled
              ? t("game.disableOverlay")
              : t("game.keepVisible")
          }
        >
          {gameOverlayEnabled ? t("game.unpinOverlay") : t("game.keepOnTop")}
        </Button>
        <Button
          variant="default"
          size="sm"
          className="h-7 text-xs shadow-sm"
          onClick={handleOpenInNewTab}
        >
          {t("game.openInNewTab")}
        </Button>
        <Button
          variant="default"
          size="sm"
          className="h-7 text-xs shadow-sm"
          disabled={stopping}
          onClick={handleStop}
        >
          {stopping ? t("game.stopping") : t("game.stop")}
        </Button>
        <Button
          variant="default"
          size="sm"
          className="h-7 text-xs shadow-sm"
          onClick={() => {
            setState("tab", "apps");
            setState("appsSubTab", "browse");
          }}
        >
          {t("game.backToApps")}
        </Button>
      </div>
      <div className="flex-1 min-h-0 flex">
        <div className="flex-1 min-h-0 relative">
          {isElectrobun ? (
            /* Electrobun mode: game runs in an isolated BrowserWindow opened
               via game:openWindow RPC. The div below is a placeholder that
               fills the same space in the layout while the native window is
               positioned by the OS window manager. */
            <div className="w-full h-full flex flex-col items-center justify-center bg-bg text-muted gap-3">
              {gameWindowId ? (
                <>
                  <span className="text-sm font-semibold text-txt">
                    {activeGameDisplayName || activeGameApp}
                  </span>
                  <span className="text-xs text-muted">
                    {t("game.openInNativeWindow")}
                  </span>
                </>
              ) : (
                <span className="text-xs italic">{t("game.launching")}</span>
              )}
            </div>
          ) : (
            /* Web / dev-server fallback: standard iframe */
            <iframe
              ref={iframeRef}
              src={activeGameViewerUrl}
              sandbox={activeGameSandbox}
              className="w-full h-full border-none"
              title={activeGameDisplayName || "Game"}
            />
          )}
        </div>
        {showLogsPanel && renderLogsPanel()}
      </div>
    </div>
  );
}
