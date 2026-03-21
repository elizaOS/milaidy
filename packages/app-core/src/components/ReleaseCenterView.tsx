import { useCallback, useEffect, useRef, useState } from "react";
import {
  invokeDesktopBridgeRequest,
  isElectrobunRuntime,
  subscribeDesktopBridgeEvent,
} from "../bridge";
import {
  BuildRuntimeSection,
  ReleaseNotesSection,
  ReleaseStatusSection,
  SessionControlsSection,
  WgpuSurfaceSection,
} from "./release-center/sections";
import {
  normalizeReleaseNotesUrl,
  summarizeError,
} from "./release-center/shared";
import { useApp } from "../state";
import { openDesktopSurfaceWindow } from "../utils/desktop-workspace";
import {
  DEFAULT_RELEASE_NOTES_URL,
  RELEASE_NOTES_PARTITION,
  SESSION_PARTITIONS,
  type AppReleaseStatus,
  type DesktopBuildInfo,
  type DesktopReleaseNotesWindowInfo,
  type DesktopSessionSnapshot,
  type DesktopUpdaterSnapshot,
  type WebGpuBrowserStatus,
  type WgpuTagElement,
} from "./release-center/types";

export function ReleaseCenterView() {
  const desktopRuntime = isElectrobunRuntime();
  const { loadUpdateStatus, updateLoading, updateStatus } = useApp();

  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [nativeUpdater, setNativeUpdater] =
    useState<DesktopUpdaterSnapshot | null>(null);
  const [buildInfo, setBuildInfo] = useState<DesktopBuildInfo | null>(null);
  const [dockVisible, setDockVisible] = useState<boolean>(true);
  const [sessionSnapshots, setSessionSnapshots] = useState<
    Record<string, DesktopSessionSnapshot | undefined>
  >({});
  const [webGpuStatus, setWebGpuStatus] = useState<WebGpuBrowserStatus | null>(
    null,
  );
  const [releaseNotesWindow, setReleaseNotesWindow] =
    useState<DesktopReleaseNotesWindowInfo | null>(null);
  const [releaseNotesUrl, setReleaseNotesUrl] = useState(
    DEFAULT_RELEASE_NOTES_URL,
  );
  const [releaseNotesUrlDirty, setReleaseNotesUrlDirty] = useState(false);
  const [wgpuTagAvailable, setWgpuTagAvailable] = useState(false);
  const [wgpuReady, setWgpuReady] = useState(false);
  const [wgpuTransparent, setWgpuTransparent] = useState(false);
  const [wgpuPassthrough, setWgpuPassthrough] = useState(false);
  const [wgpuHidden, setWgpuHidden] = useState(false);
  const wgpuRef = useRef<WgpuTagElement | null>(null);

  const refreshNativeState = useCallback(async () => {
    if (!desktopRuntime) {
      return;
    }

    const [updater, build, dock, gpuStatus, ...sessionResults] =
      await Promise.all([
        invokeDesktopBridgeRequest<DesktopUpdaterSnapshot>({
          rpcMethod: "desktopGetUpdaterState",
          ipcChannel: "desktop:getUpdaterState",
        }),
        invokeDesktopBridgeRequest<DesktopBuildInfo>({
          rpcMethod: "desktopGetBuildInfo",
          ipcChannel: "desktop:getBuildInfo",
        }),
        invokeDesktopBridgeRequest<{ visible: boolean }>({
          rpcMethod: "desktopGetDockIconVisibility",
          ipcChannel: "desktop:getDockIconVisibility",
        }),
        invokeDesktopBridgeRequest<WebGpuBrowserStatus>({
          rpcMethod: "desktopGetWebGpuBrowserStatus",
          ipcChannel: "desktop:getWebGpuBrowserStatus",
        }),
        ...SESSION_PARTITIONS.map(({ partition }) =>
          invokeDesktopBridgeRequest<DesktopSessionSnapshot>({
            rpcMethod: "desktopGetSessionSnapshot",
            ipcChannel: "desktop:getSessionSnapshot",
            params: { partition },
          }),
        ),
      ]);

    setNativeUpdater(updater);
    setBuildInfo(build);
    setDockVisible(dock?.visible ?? true);
    setWebGpuStatus(gpuStatus);
    setSessionSnapshots(
      Object.fromEntries(
        SESSION_PARTITIONS.map((entry, index) => [
          entry.partition,
          sessionResults[index] ?? undefined,
        ]),
      ),
    );
    setReleaseNotesUrl((current) =>
      releaseNotesUrlDirty
        ? current
        : normalizeReleaseNotesUrl(updater?.baseUrl ?? current),
    );
  }, [desktopRuntime, releaseNotesUrlDirty]);

  useEffect(() => {
    if (!desktopRuntime) {
      return;
    }

    void loadUpdateStatus();
    void refreshNativeState();
  }, [desktopRuntime, loadUpdateStatus, refreshNativeState]);

  useEffect(() => {
    setWgpuTagAvailable(
      typeof window !== "undefined" &&
        Boolean(window.customElements.get("electrobun-wgpu")),
    );
  }, []);

  useEffect(() => {
    const element = wgpuRef.current;
    if (!desktopRuntime || !wgpuTagAvailable || !element) {
      return;
    }

    const onReady = () => {
      setWgpuReady(true);
    };

    element.on?.("ready", onReady);
    return () => {
      element.off?.("ready", onReady);
    };
  }, [desktopRuntime, wgpuTagAvailable]);

  useEffect(() => {
    if (!desktopRuntime) {
      return;
    }

    const unsubscribers = [
      subscribeDesktopBridgeEvent({
        rpcMessage: "desktopUpdateAvailable",
        ipcChannel: "desktop:updateAvailable",
        listener: () => {
          void refreshNativeState();
        },
      }),
      subscribeDesktopBridgeEvent({
        rpcMessage: "desktopUpdateReady",
        ipcChannel: "desktop:updateReady",
        listener: () => {
          void refreshNativeState();
        },
      }),
      subscribeDesktopBridgeEvent({
        rpcMessage: "webGpuBrowserStatus",
        ipcChannel: "webgpu:browserStatus",
        listener: (payload) => {
          setWebGpuStatus(payload as WebGpuBrowserStatus);
        },
      }),
    ];

    return () => {
      for (const unsubscribe of unsubscribers) {
        unsubscribe();
      }
    };
  }, [desktopRuntime, refreshNativeState]);

  const runAction = useCallback(
    async <T,>(
      id: string,
      action: () => Promise<T>,
      successMessage?: string,
    ): Promise<T | null> => {
      setBusyAction(id);
      setActionError(null);
      setActionMessage(null);
      try {
        const result = await action();
        if (successMessage) {
          setActionMessage(successMessage);
        }
        return result;
      } catch (error) {
        setActionError(summarizeError(error));
        return null;
      } finally {
        setBusyAction(null);
      }
    },
    [],
  );

  if (!desktopRuntime) {
    return (
      <div className="rounded-2xl border border-border bg-bg-accent px-4 py-4 text-sm text-muted">
        Release Center is available in the Electrobun desktop runtime.
      </div>
    );
  }

  const detachReleaseCenter = async () => {
    await openDesktopSurfaceWindow("release");
  };

  const refreshReleaseState = async () => {
    await Promise.all([loadUpdateStatus(true), refreshNativeState()]);
  };

  const checkForDesktopUpdate = async () => {
    const snapshot = await invokeDesktopBridgeRequest<DesktopUpdaterSnapshot>({
      rpcMethod: "desktopCheckForUpdates",
      ipcChannel: "desktop:checkForUpdates",
    });
    setNativeUpdater(snapshot);
    if (!releaseNotesUrlDirty && snapshot?.baseUrl) {
      setReleaseNotesUrl(normalizeReleaseNotesUrl(snapshot.baseUrl));
    }
  };

  const applyDesktopUpdate = async () => {
    await invokeDesktopBridgeRequest<void>({
      rpcMethod: "desktopApplyUpdate",
      ipcChannel: "desktop:applyUpdate",
    });
  };

  const toggleDockIcon = async () => {
    const next = await invokeDesktopBridgeRequest<{ visible: boolean }>({
      rpcMethod: "desktopSetDockIconVisibility",
      ipcChannel: "desktop:setDockIconVisibility",
      params: { visible: !dockVisible },
    });
    setDockVisible(next?.visible ?? dockVisible);
  };

  const openReleaseNotesWindow = async () => {
    const info =
      await invokeDesktopBridgeRequest<DesktopReleaseNotesWindowInfo>({
        rpcMethod: "desktopOpenReleaseNotesWindow",
        ipcChannel: "desktop:openReleaseNotesWindow",
        params: {
          url: releaseNotesUrl,
          title: "Milady Release Notes",
        },
      });
    setReleaseNotesWindow(info);
    const refreshedSession =
      await invokeDesktopBridgeRequest<DesktopSessionSnapshot>({
        rpcMethod: "desktopGetSessionSnapshot",
        ipcChannel: "desktop:getSessionSnapshot",
        params: { partition: RELEASE_NOTES_PARTITION },
      });
    if (refreshedSession) {
      setSessionSnapshots((current) => ({
        ...current,
        [RELEASE_NOTES_PARTITION]: refreshedSession,
      }));
    }
  };

  const clearSession = async (partition: string) => {
    const snapshot = await invokeDesktopBridgeRequest<DesktopSessionSnapshot>({
      rpcMethod: "desktopClearSessionData",
      ipcChannel: "desktop:clearSessionData",
      params: {
        partition,
        storageTypes: "all",
        clearCookies: true,
      },
    });
    if (snapshot) {
      setSessionSnapshots((current) => ({
        ...current,
        [partition]: snapshot,
      }));
    }
  };

  const clearCookiesOnly = async (partition: string) => {
    const snapshot = await invokeDesktopBridgeRequest<DesktopSessionSnapshot>({
      rpcMethod: "desktopClearSessionData",
      ipcChannel: "desktop:clearSessionData",
      params: {
        partition,
        storageTypes: ["cookies"],
        clearCookies: true,
      },
    });
    if (snapshot) {
      setSessionSnapshots((current) => ({
        ...current,
        [partition]: snapshot,
      }));
    }
  };

  const runWgpuAction = (action: () => void, stateMessage: string) => {
    setActionError(null);
    setActionMessage(stateMessage);
    action();
  };

  return (
    <div className="space-y-4">
      {actionError ? (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {actionError}
        </div>
      ) : null}
      {actionMessage ? (
        <div className="rounded-xl border border-ok/30 bg-ok/10 px-4 py-3 text-sm text-ok">
          {actionMessage}
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        <ReleaseStatusSection
          busyAction={busyAction}
          nativeUpdater={nativeUpdater}
          updateLoading={updateLoading}
          updateStatus={updateStatus as AppReleaseStatus | null | undefined}
          onApplyUpdate={() =>
            void runAction(
              "apply-update",
              applyDesktopUpdate,
              "Applying downloaded update.",
            )
          }
          onCheckForUpdates={() =>
            void runAction(
              "check-updates",
              checkForDesktopUpdate,
              "Desktop update check started.",
            )
          }
          onDetach={() =>
            void runAction(
              "detach-release",
              detachReleaseCenter,
              "Detached release center opened.",
            )
          }
          onRefresh={() =>
            void runAction(
              "refresh",
              refreshReleaseState,
              "Release status refreshed.",
            )
          }
        />

        <ReleaseNotesSection
          busyAction={busyAction}
          nativeUpdater={nativeUpdater}
          releaseNotesUrl={releaseNotesUrl}
          releaseNotesWindow={releaseNotesWindow}
          onOpenWindow={() =>
            void runAction(
              "open-release-notes",
              openReleaseNotesWindow,
              "Release notes window opened.",
            )
          }
          onReleaseNotesUrlChange={(value) => {
            setReleaseNotesUrlDirty(true);
            setReleaseNotesUrl(value);
          }}
          onResetUrl={() =>
            void runAction(
              "reset-release-url",
              async () => {
                setReleaseNotesUrlDirty(false);
                setReleaseNotesUrl(
                  normalizeReleaseNotesUrl(nativeUpdater?.baseUrl),
                );
              },
              "Release notes URL reset from updater metadata.",
            )
          }
        />

        <BuildRuntimeSection
          buildInfo={buildInfo}
          busyAction={busyAction}
          dockVisible={dockVisible}
          nativeUpdater={nativeUpdater}
          onToggleDock={() =>
            void runAction(
              "toggle-dock",
              toggleDockIcon,
              dockVisible ? "Dock icon hidden." : "Dock icon shown.",
            )
          }
        />

        <SessionControlsSection
          busyAction={busyAction}
          sessionSnapshots={sessionSnapshots}
          onClearCookies={(partition) =>
            void runAction(
              `clear-cookies:${partition}`,
              () => clearCookiesOnly(partition),
              `Cleared cookies for ${partition}.`,
            )
          }
          onClearSession={(partition) =>
            void runAction(
              `clear-session:${partition}`,
              () => clearSession(partition),
              `Cleared storage for ${partition}.`,
            )
          }
        />
      </div>

      <WgpuSurfaceSection
        webGpuStatus={webGpuStatus}
        wgpuHidden={wgpuHidden}
        wgpuPassthrough={wgpuPassthrough}
        wgpuReady={wgpuReady}
        wgpuRef={wgpuRef}
        wgpuTagAvailable={wgpuTagAvailable}
        wgpuTransparent={wgpuTransparent}
        onRunTest={() =>
          runWgpuAction(
            () => wgpuRef.current?.runTest?.(),
            "WGPU test requested.",
          )
        }
        onToggleHidden={() => {
          const next = !wgpuHidden;
          setWgpuHidden(next);
          runWgpuAction(
            () => wgpuRef.current?.toggleHidden?.(next),
            next ? "WGPU preview hidden." : "WGPU preview shown.",
          );
        }}
        onTogglePassthrough={() => {
          const next = !wgpuPassthrough;
          setWgpuPassthrough(next);
          runWgpuAction(
            () => wgpuRef.current?.togglePassthrough?.(next),
            next ? "WGPU passthrough enabled." : "WGPU passthrough disabled.",
          );
        }}
        onToggleTransparent={() => {
          const next = !wgpuTransparent;
          setWgpuTransparent(next);
          runWgpuAction(
            () => wgpuRef.current?.toggleTransparent?.(next),
            next ? "WGPU transparency enabled." : "WGPU transparency disabled.",
          );
        }}
      />
    </div>
  );
}
