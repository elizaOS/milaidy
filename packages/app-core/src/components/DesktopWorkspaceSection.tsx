import { Button } from "@miladyai/ui";
import { Monitor, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { invokeDesktopBridgeRequest, isElectrobunRuntime } from "../bridge";
import { useApp } from "../state";
import { copyTextToClipboard } from "../utils/clipboard";
import {
  DESKTOP_WORKSPACE_SURFACES,
  type DesktopClickAuditItem,
  type DesktopWorkspaceSnapshot,
  formatDesktopWorkspaceSummary,
  loadDesktopWorkspaceSnapshot,
  openDesktopSettingsWindow,
  openDesktopSurfaceWindow,
} from "../utils/desktop-workspace";

export const DESKTOP_WORKSPACE_CLICK_AUDIT: readonly DesktopClickAuditItem[] = [
  {
    id: "desktop-refresh-snapshot",
    entryPoint: "settings:desktop",
    label: "Refresh Diagnostics",
    expectedAction:
      "Reload desktop version, window, display, clipboard, and path diagnostics.",
    runtimeRequirement: "desktop",
    coverage: "automated",
  },
  {
    id: "desktop-open-settings-window",
    entryPoint: "settings:desktop",
    label: "Open Desktop Settings Window",
    expectedAction:
      "Open a detached settings window focused on the desktop section.",
    runtimeRequirement: "desktop",
    coverage: "automated",
  },
  {
    id: "desktop-show-window",
    entryPoint: "settings:desktop",
    label: "Show Window",
    expectedAction: "Show the main desktop window.",
    runtimeRequirement: "desktop",
    coverage: "automated",
  },
  {
    id: "desktop-hide-window",
    entryPoint: "settings:desktop",
    label: "Hide Window",
    expectedAction: "Hide the main desktop window.",
    runtimeRequirement: "desktop",
    coverage: "automated",
  },
  {
    id: "desktop-focus-window",
    entryPoint: "settings:desktop",
    label: "Focus Window",
    expectedAction: "Focus the main desktop window.",
    runtimeRequirement: "desktop",
    coverage: "automated",
  },
  {
    id: "desktop-minimize-window",
    entryPoint: "settings:desktop",
    label: "Minimize Window",
    expectedAction: "Minimize the main desktop window.",
    runtimeRequirement: "desktop",
    coverage: "automated",
  },
  {
    id: "desktop-maximize-toggle",
    entryPoint: "settings:desktop",
    label: "Toggle Maximize",
    expectedAction: "Maximize or unmaximize the main desktop window.",
    runtimeRequirement: "desktop",
    coverage: "automated",
  },
  {
    id: "desktop-notify",
    entryPoint: "settings:desktop",
    label: "Send Test Notification",
    expectedAction: "Send a desktop notification.",
    runtimeRequirement: "desktop",
    coverage: "automated",
  },
  {
    id: "desktop-restart-agent",
    entryPoint: "settings:desktop",
    label: "Restart Agent",
    expectedAction: "Restart the desktop agent backend.",
    runtimeRequirement: "desktop",
    coverage: "automated",
  },
  {
    id: "desktop-relaunch-app",
    entryPoint: "settings:desktop",
    label: "Relaunch Milady",
    expectedAction: "Relaunch the desktop shell.",
    runtimeRequirement: "desktop",
    coverage: "automated",
  },
  {
    id: "desktop-toggle-auto-launch",
    entryPoint: "settings:desktop",
    label: "Toggle Auto-launch",
    expectedAction: "Enable or disable auto-launch.",
    runtimeRequirement: "desktop",
    coverage: "automated",
  },
  {
    id: "desktop-toggle-hidden-launch",
    entryPoint: "settings:desktop",
    label: "Toggle Hidden Start",
    expectedAction:
      "Toggle launching the app hidden when auto-launch is enabled.",
    runtimeRequirement: "desktop",
    coverage: "automated",
  },
  {
    id: "desktop-open-file-dialog",
    entryPoint: "settings:desktop",
    label: "Open Files Dialog",
    expectedAction: "Open a native file chooser.",
    runtimeRequirement: "desktop",
    coverage: "automated",
  },
  {
    id: "desktop-open-folder-dialog",
    entryPoint: "settings:desktop",
    label: "Open Folder Dialog",
    expectedAction: "Open a native directory chooser.",
    runtimeRequirement: "desktop",
    coverage: "automated",
  },
  {
    id: "desktop-save-dialog",
    entryPoint: "settings:desktop",
    label: "Save File Dialog",
    expectedAction: "Open a native save dialog.",
    runtimeRequirement: "desktop",
    coverage: "automated",
  },
  {
    id: "desktop-clipboard-read",
    entryPoint: "settings:desktop",
    label: "Read Clipboard",
    expectedAction:
      "Read text, html, rtf, and format metadata from the system clipboard.",
    runtimeRequirement: "desktop",
    coverage: "automated",
  },
  {
    id: "desktop-clipboard-copy",
    entryPoint: "settings:desktop",
    label: "Copy Clipboard Draft",
    expectedAction: "Write text to the system clipboard.",
    runtimeRequirement: "desktop",
    coverage: "automated",
  },
  {
    id: "desktop-clipboard-clear",
    entryPoint: "settings:desktop",
    label: "Clear Clipboard",
    expectedAction: "Clear the system clipboard.",
    runtimeRequirement: "desktop",
    coverage: "automated",
  },
  {
    id: "desktop-open-path",
    entryPoint: "settings:desktop",
    label: "Open Desktop Path",
    expectedAction: "Open a selected filesystem path using the native shell.",
    runtimeRequirement: "desktop",
    coverage: "automated",
  },
  {
    id: "desktop-reveal-path",
    entryPoint: "settings:desktop",
    label: "Reveal Desktop Path",
    expectedAction:
      "Reveal a selected filesystem path in the native file manager.",
    runtimeRequirement: "desktop",
    coverage: "automated",
  },
  ...DESKTOP_WORKSPACE_SURFACES.map(
    (surface): DesktopClickAuditItem => ({
      id: `desktop-surface-${surface.id}`,
      entryPoint: "settings:desktop",
      label: surface.label,
      expectedAction: `Open the detached ${surface.id} surface window.`,
      runtimeRequirement: "desktop",
      coverage: "automated",
    }),
  ),
] as const;

function renderPathList(paths: string[]) {
  if (paths.length === 0) {
    return <span className="text-muted">No path selected yet.</span>;
  }

  return (
    <ul className="space-y-1 text-xs text-txt">
      {paths.map((path) => (
        <li key={path} className="break-all">
          {path}
        </li>
      ))}
    </ul>
  );
}

export function DesktopWorkspaceSection() {
  const desktopRuntime = isElectrobunRuntime();
  const { relaunchDesktop, restartBackend } = useApp();
  const [snapshot, setSnapshot] = useState<DesktopWorkspaceSnapshot | null>(
    null,
  );
  const [loading, setLoading] = useState(desktopRuntime);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [clipboardDraft, setClipboardDraft] = useState("");
  const [openPaths, setOpenPaths] = useState<string[]>([]);
  const [savePaths, setSavePaths] = useState<string[]>([]);

  const refreshSnapshot = useCallback(async () => {
    if (!desktopRuntime) {
      setSnapshot(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setActionError(null);
    const nextSnapshot = await loadDesktopWorkspaceSnapshot();
    setSnapshot(nextSnapshot);
    setClipboardDraft(
      (current) => current || nextSnapshot.clipboard?.text || "",
    );
    setLoading(false);
  }, [desktopRuntime]);

  useEffect(() => {
    void refreshSnapshot();
  }, [refreshSnapshot]);

  const runAction = useCallback(
    async (
      id: string,
      action: () => Promise<void>,
      message?: string,
      refresh = true,
    ) => {
      setBusyAction(id);
      setActionError(null);
      setActionMessage(null);
      try {
        await action();
        if (refresh) {
          await refreshSnapshot();
        }
        if (message) {
          setActionMessage(message);
        }
      } catch (error) {
        setActionError(
          error instanceof Error ? error.message : "Desktop action failed.",
        );
      } finally {
        setBusyAction(null);
      }
    },
    [refreshSnapshot],
  );

  const diagnosticsText = useMemo(() => {
    if (!snapshot) {
      return "Desktop diagnostics unavailable.";
    }

    const displayLines =
      snapshot.displays.length > 0
        ? snapshot.displays.map(
            (display) =>
              `display:${display.id} ${display.bounds.width}x${display.bounds.height} @ ${display.bounds.x},${display.bounds.y}${display.isPrimary ? " primary" : ""}`,
          )
        : ["display:none"];

    return [
      formatDesktopWorkspaceSummary(snapshot),
      snapshot.power
        ? `power:${snapshot.power.onBattery ? "battery" : "ac"} idle=${snapshot.power.idleState} idleTime=${snapshot.power.idleTime}s`
        : "power:unavailable",
      snapshot.primaryDisplay
        ? `primary:${snapshot.primaryDisplay.bounds.width}x${snapshot.primaryDisplay.bounds.height}`
        : "primary:unavailable",
      snapshot.clipboard
        ? `clipboard:${snapshot.clipboard.formats.join(", ") || "plain-text"}`
        : "clipboard:unavailable",
      ...displayLines,
      ...Object.entries(snapshot.paths).map(
        ([name, path]) => `${name}:${path}`,
      ),
    ].join("\n");
  }, [snapshot]);

  if (!desktopRuntime) {
    return (
      <div className="rounded-2xl border border-border bg-card px-4 py-4 text-sm text-muted">
        Desktop workspace tools are only available inside the Electrobun desktop
        runtime.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => void refreshSnapshot()}
          disabled={loading}
        >
          <RefreshCw
            className={`mr-1 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
          />
          Refresh Diagnostics
        </Button>
        <Button
          variant="default"
          size="sm"
          onClick={() =>
            void runAction(
              "desktop-open-settings-window",
              async () => openDesktopSettingsWindow("desktop"),
              "Opened detached desktop settings window.",
              false,
            )
          }
          disabled={busyAction === "desktop-open-settings-window"}
        >
          <Monitor className="mr-1 h-3.5 w-3.5" />
          Open Desktop Settings Window
        </Button>
      </div>

      {(actionError || actionMessage) && (
        <div
          className={`rounded-xl border px-3 py-2 text-sm ${
            actionError
              ? "border-danger/40 bg-danger/10 text-danger"
              : "border-ok/40 bg-ok/10 text-ok"
          }`}
        >
          {actionError ?? actionMessage}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3 rounded-2xl border border-border bg-card px-4 py-4">
          <div>
            <h3 className="text-sm font-semibold text-txt">Diagnostics</h3>
            <p className="text-xs text-muted">
              Version, window, display, clipboard, and path state from the
              desktop shell.
            </p>
          </div>
          <pre className="overflow-x-auto rounded-xl border border-border bg-bg px-3 py-3 text-[11px] leading-5 text-txt">
            {diagnosticsText}
          </pre>
        </div>

        <div className="space-y-3 rounded-2xl border border-border bg-card px-4 py-4">
          <div>
            <h3 className="text-sm font-semibold text-txt">
              Detached Surfaces
            </h3>
            <p className="text-xs text-muted">
              Launch the native Electrobun surfaces without navigating away from
              the main shell.
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {DESKTOP_WORKSPACE_SURFACES.map((surface) => (
              <Button
                key={surface.id}
                variant="outline"
                size="sm"
                className="justify-start whitespace-normal text-left"
                onClick={() =>
                  void runAction(
                    `desktop-surface-${surface.id}`,
                    async () => openDesktopSurfaceWindow(surface.id),
                    `Opened ${surface.label.toLowerCase()}.`,
                    false,
                  )
                }
                disabled={busyAction === `desktop-surface-${surface.id}`}
              >
                {surface.label}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3 rounded-2xl border border-border bg-card px-4 py-4">
          <div>
            <h3 className="text-sm font-semibold text-txt">Window Controls</h3>
            <p className="text-xs text-muted">
              Control the main desktop window directly from settings.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                void runAction("desktop-show-window", async () => {
                  await invokeDesktopBridgeRequest<void>({
                    rpcMethod: "desktopShowWindow",
                    ipcChannel: "desktop:showWindow",
                  });
                })
              }
              disabled={busyAction === "desktop-show-window"}
            >
              Show Window
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                void runAction("desktop-hide-window", async () => {
                  await invokeDesktopBridgeRequest<void>({
                    rpcMethod: "desktopHideWindow",
                    ipcChannel: "desktop:hideWindow",
                  });
                })
              }
              disabled={busyAction === "desktop-hide-window"}
            >
              Hide Window
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                void runAction("desktop-focus-window", async () => {
                  await invokeDesktopBridgeRequest<void>({
                    rpcMethod: "desktopFocusWindow",
                    ipcChannel: "desktop:focusWindow",
                  });
                })
              }
              disabled={busyAction === "desktop-focus-window"}
            >
              Focus Window
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                void runAction("desktop-minimize-window", async () => {
                  const method = snapshot?.window.minimized
                    ? "desktopUnminimizeWindow"
                    : "desktopMinimizeWindow";
                  const channel = snapshot?.window.minimized
                    ? "desktop:unminimizeWindow"
                    : "desktop:minimizeWindow";
                  await invokeDesktopBridgeRequest<void>({
                    rpcMethod: method,
                    ipcChannel: channel,
                  });
                })
              }
              disabled={busyAction === "desktop-minimize-window"}
            >
              {snapshot?.window.minimized
                ? "Restore Window"
                : "Minimize Window"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                void runAction("desktop-maximize-toggle", async () => {
                  const method = snapshot?.window.maximized
                    ? "desktopUnmaximizeWindow"
                    : "desktopMaximizeWindow";
                  const channel = snapshot?.window.maximized
                    ? "desktop:unmaximizeWindow"
                    : "desktop:maximizeWindow";
                  await invokeDesktopBridgeRequest<void>({
                    rpcMethod: method,
                    ipcChannel: channel,
                  });
                })
              }
              disabled={busyAction === "desktop-maximize-toggle"}
            >
              {snapshot?.window.maximized
                ? "Unmaximize Window"
                : "Maximize Window"}
            </Button>
          </div>
        </div>

        <div className="space-y-3 rounded-2xl border border-border bg-card px-4 py-4">
          <div>
            <h3 className="text-sm font-semibold text-txt">Lifecycle</h3>
            <p className="text-xs text-muted">
              Restart the backend, relaunch the app, or toggle auto-launch
              behavior.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                void runAction(
                  "desktop-notify",
                  async () => {
                    await invokeDesktopBridgeRequest<{ id: string }>({
                      rpcMethod: "desktopShowNotification",
                      ipcChannel: "desktop:showNotification",
                      params: {
                        title: "Milady Desktop",
                        body: "Desktop workspace notification test.",
                        urgency: "normal",
                      },
                    });
                  },
                  "Notification sent.",
                  false,
                )
              }
              disabled={busyAction === "desktop-notify"}
            >
              Send Test Notification
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                void runAction(
                  "desktop-restart-agent",
                  async () => restartBackend(),
                  "Agent restart requested.",
                )
              }
              disabled={busyAction === "desktop-restart-agent"}
            >
              Restart Agent
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                void runAction(
                  "desktop-relaunch-app",
                  async () => relaunchDesktop(),
                  "Desktop relaunch requested.",
                  false,
                )
              }
              disabled={busyAction === "desktop-relaunch-app"}
            >
              Relaunch Milady
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                void runAction("desktop-toggle-auto-launch", async () => {
                  await invokeDesktopBridgeRequest<void>({
                    rpcMethod: "desktopSetAutoLaunch",
                    ipcChannel: "desktop:setAutoLaunch",
                    params: {
                      enabled: !(snapshot?.autoLaunch?.enabled ?? false),
                      openAsHidden: snapshot?.autoLaunch?.openAsHidden ?? false,
                    },
                  });
                })
              }
              disabled={busyAction === "desktop-toggle-auto-launch"}
            >
              {snapshot?.autoLaunch?.enabled
                ? "Disable Auto-launch"
                : "Enable Auto-launch"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                void runAction("desktop-toggle-hidden-launch", async () => {
                  await invokeDesktopBridgeRequest<void>({
                    rpcMethod: "desktopSetAutoLaunch",
                    ipcChannel: "desktop:setAutoLaunch",
                    params: {
                      enabled: snapshot?.autoLaunch?.enabled ?? false,
                      openAsHidden: !(
                        snapshot?.autoLaunch?.openAsHidden ?? false
                      ),
                    },
                  });
                })
              }
              disabled={busyAction === "desktop-toggle-hidden-launch"}
            >
              {snapshot?.autoLaunch?.openAsHidden
                ? "Launch Visible on Login"
                : "Launch Hidden on Login"}
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3 rounded-2xl border border-border bg-card px-4 py-4">
          <div>
            <h3 className="text-sm font-semibold text-txt">
              Native File Dialogs
            </h3>
            <p className="text-xs text-muted">
              Test file, folder, and save dialogs and inspect the returned
              paths.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                void runAction(
                  "desktop-open-file-dialog",
                  async () => {
                    const result = await invokeDesktopBridgeRequest<{
                      canceled: boolean;
                      filePaths: string[];
                    }>({
                      rpcMethod: "desktopShowOpenDialog",
                      ipcChannel: "desktop:showOpenDialog",
                      params: {
                        title: "Select files",
                        defaultPath: snapshot?.paths.downloads,
                        canChooseFiles: true,
                        allowsMultipleSelection: true,
                      },
                    });
                    setOpenPaths(result?.filePaths ?? []);
                  },
                  "File dialog completed.",
                  false,
                )
              }
              disabled={busyAction === "desktop-open-file-dialog"}
            >
              Open Files Dialog
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                void runAction(
                  "desktop-open-folder-dialog",
                  async () => {
                    const result = await invokeDesktopBridgeRequest<{
                      canceled: boolean;
                      filePaths: string[];
                    }>({
                      rpcMethod: "desktopShowOpenDialog",
                      ipcChannel: "desktop:showOpenDialog",
                      params: {
                        title: "Select folder",
                        defaultPath: snapshot?.paths.home,
                        canChooseDirectory: true,
                      },
                    });
                    setOpenPaths(result?.filePaths ?? []);
                  },
                  "Folder dialog completed.",
                  false,
                )
              }
              disabled={busyAction === "desktop-open-folder-dialog"}
            >
              Open Folder Dialog
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                void runAction(
                  "desktop-save-dialog",
                  async () => {
                    const result = await invokeDesktopBridgeRequest<{
                      canceled: boolean;
                      filePaths: string[];
                    }>({
                      rpcMethod: "desktopShowSaveDialog",
                      ipcChannel: "desktop:showSaveDialog",
                      params: {
                        title: "Save file",
                        defaultPath: snapshot?.paths.documents,
                        allowedFileTypes: "txt,md,json",
                      },
                    });
                    setSavePaths(result?.filePaths ?? []);
                  },
                  "Save dialog completed.",
                  false,
                )
              }
              disabled={busyAction === "desktop-save-dialog"}
            >
              Save File Dialog
            </Button>
          </div>
          <div className="space-y-2 rounded-xl border border-border bg-bg px-3 py-3 text-xs text-muted">
            <div>
              <div className="mb-1 font-semibold text-txt">
                Open dialog result
              </div>
              {renderPathList(openPaths)}
            </div>
            <div>
              <div className="mb-1 font-semibold text-txt">
                Save dialog result
              </div>
              {renderPathList(savePaths)}
            </div>
          </div>
        </div>

        <div className="space-y-3 rounded-2xl border border-border bg-card px-4 py-4">
          <div>
            <h3 className="text-sm font-semibold text-txt">
              Clipboard + Paths
            </h3>
            <p className="text-xs text-muted">
              Read, clear, and write clipboard text, then open or reveal saved
              paths.
            </p>
          </div>
          <textarea
            value={clipboardDraft}
            onChange={(event) => setClipboardDraft(event.target.value)}
            className="min-h-24 w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm text-txt outline-none"
            placeholder="Clipboard draft"
          />
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                void runAction("desktop-clipboard-read", async () => {
                  const result = await invokeDesktopBridgeRequest<{
                    text?: string;
                  }>({
                    rpcMethod: "desktopReadFromClipboard",
                    ipcChannel: "desktop:readFromClipboard",
                  });
                  setClipboardDraft(result?.text ?? "");
                })
              }
              disabled={busyAction === "desktop-clipboard-read"}
            >
              Read Clipboard
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                void runAction("desktop-clipboard-copy", async () => {
                  await copyTextToClipboard(clipboardDraft);
                })
              }
              disabled={busyAction === "desktop-clipboard-copy"}
            >
              Copy Draft
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                void runAction("desktop-clipboard-clear", async () => {
                  await invokeDesktopBridgeRequest<void>({
                    rpcMethod: "desktopClearClipboard",
                    ipcChannel: "desktop:clearClipboard",
                  });
                  setClipboardDraft("");
                })
              }
              disabled={busyAction === "desktop-clipboard-clear"}
            >
              Clear Clipboard
            </Button>
            {savePaths[0] && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    void runAction(
                      "desktop-open-path",
                      async () => {
                        await invokeDesktopBridgeRequest<void>({
                          rpcMethod: "desktopOpenPath",
                          ipcChannel: "desktop:openPath",
                          params: { path: savePaths[0] },
                        });
                      },
                      "Opened saved path.",
                      false,
                    )
                  }
                  disabled={busyAction === "desktop-open-path"}
                >
                  Open Saved Path
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    void runAction(
                      "desktop-reveal-path",
                      async () => {
                        await invokeDesktopBridgeRequest<void>({
                          rpcMethod: "desktopShowItemInFolder",
                          ipcChannel: "desktop:showItemInFolder",
                          params: { path: savePaths[0] },
                        });
                      },
                      "Revealed saved path.",
                      false,
                    )
                  }
                  disabled={busyAction === "desktop-reveal-path"}
                >
                  Reveal Saved Path
                </Button>
              </>
            )}
          </div>
          <div className="rounded-xl border border-border bg-bg px-3 py-3 text-xs text-muted">
            {snapshot?.clipboard ? (
              <>
                <div className="font-semibold text-txt">
                  Formats:{" "}
                  {snapshot.clipboard.formats.join(", ") || "plain-text"}
                </div>
                <div className="mt-1 break-all">
                  {snapshot.clipboard.text || "Clipboard text unavailable."}
                </div>
              </>
            ) : (
              "Clipboard details unavailable."
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
