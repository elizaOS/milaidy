import {
  invokeDesktopBridgeRequest,
  isElectrobunRuntime,
} from "@miladyai/app-core/bridge";
import { TRAY_ACTION_EVENT } from "@miladyai/app-core/events";
import { useApp } from "@miladyai/app-core/state";
import {
  type DesktopClickAuditItem,
  openDesktopSettingsWindow,
} from "@miladyai/app-core/utils";
import { useEffect } from "react";

interface DesktopTrayMenuItem {
  id: string;
  label?: string;
  type?: "normal" | "separator";
}

export const DESKTOP_TRAY_MENU_ITEMS: readonly DesktopTrayMenuItem[] = [
  { id: "tray-open-chat", label: "Open Chat" },
  { id: "tray-open-plugins", label: "Open Plugins" },
  { id: "tray-open-desktop-workspace", label: "Open Desktop Workspace" },
  { id: "tray-open-voice-controls", label: "Open Voice Controls" },
  { id: "tray-open-media-controls", label: "Open Media Controls" },
  { id: "tray-sep-0", type: "separator" },
  { id: "tray-toggle-lifecycle", label: "Start/Stop Agent" },
  { id: "tray-restart", label: "Restart Agent" },
  { id: "tray-notify", label: "Send Test Notification" },
  { id: "tray-sep-1", type: "separator" },
  { id: "tray-show-window", label: "Show Window" },
  { id: "tray-hide-window", label: "Hide Window" },
  { id: "tray-sep-2", type: "separator" },
  { id: "quit", label: "Quit" },
] as const;

export const DESKTOP_TRAY_CLICK_AUDIT: readonly DesktopClickAuditItem[] = [
  {
    id: "tray-open-chat",
    entryPoint: "tray",
    label: "Open Chat",
    expectedAction: "Show and focus the main window, then switch to chat.",
    runtimeRequirement: "desktop",
    coverage: "automated",
  },
  {
    id: "tray-open-plugins",
    entryPoint: "tray",
    label: "Open Plugins",
    expectedAction: "Show and focus the main window, then switch to plugins.",
    runtimeRequirement: "desktop",
    coverage: "automated",
  },
  {
    id: "tray-open-desktop-workspace",
    entryPoint: "tray",
    label: "Open Desktop Workspace",
    expectedAction:
      "Open a detached settings window focused on the desktop workspace section.",
    runtimeRequirement: "desktop",
    coverage: "automated",
  },
  {
    id: "tray-open-voice-controls",
    entryPoint: "tray",
    label: "Open Voice Controls",
    expectedAction:
      "Open a detached settings window focused on the voice controls section.",
    runtimeRequirement: "desktop",
    coverage: "automated",
  },
  {
    id: "tray-open-media-controls",
    entryPoint: "tray",
    label: "Open Media Controls",
    expectedAction:
      "Open a detached settings window focused on the media controls section.",
    runtimeRequirement: "desktop",
    coverage: "automated",
  },
  {
    id: "tray-toggle-lifecycle",
    entryPoint: "tray",
    label: "Start/Stop Agent",
    expectedAction: "Start a stopped agent or stop a running agent.",
    runtimeRequirement: "desktop",
    coverage: "automated",
  },
  {
    id: "tray-restart",
    entryPoint: "tray",
    label: "Restart Agent",
    expectedAction: "Restart the desktop agent runtime.",
    runtimeRequirement: "desktop",
    coverage: "automated",
  },
  {
    id: "tray-notify",
    entryPoint: "tray",
    label: "Send Test Notification",
    expectedAction: "Emit a desktop notification from the renderer.",
    runtimeRequirement: "desktop",
    coverage: "automated",
  },
  {
    id: "tray-show-window",
    entryPoint: "tray",
    label: "Show Window",
    expectedAction: "Show and focus the main desktop window.",
    runtimeRequirement: "desktop",
    coverage: "automated",
  },
  {
    id: "tray-hide-window",
    entryPoint: "tray",
    label: "Hide Window",
    expectedAction: "Hide the main desktop window.",
    runtimeRequirement: "desktop",
    coverage: "automated",
  },
  {
    id: "quit",
    entryPoint: "tray",
    label: "Quit",
    expectedAction: "Quit the desktop application.",
    runtimeRequirement: "desktop",
    coverage: "manual",
  },
] as const;

interface TrayActionDetail {
  itemId?: string;
}

function isAgentActive(state: string | null | undefined): boolean {
  return !(
    state === null ||
    state === undefined ||
    state === "stopped" ||
    state === "not_started"
  );
}

export function DesktopTrayRuntime() {
  const {
    agentStatus,
    handleRestart,
    handleStart,
    handleStop,
    setTab,
    switchShellView,
  } = useApp();

  useEffect(() => {
    if (!isElectrobunRuntime()) {
      return;
    }

    const handleTrayAction = (event: Event) => {
      const detail = (event as CustomEvent<TrayActionDetail>).detail;
      const itemId = detail?.itemId ?? "";

      const showAndFocusWindow = async () => {
        await invokeDesktopBridgeRequest<void>({
          rpcMethod: "desktopShowWindow",
          ipcChannel: "desktop:showWindow",
        });
        await invokeDesktopBridgeRequest<void>({
          rpcMethod: "desktopFocusWindow",
          ipcChannel: "desktop:focusWindow",
        });
      };

      const run = async () => {
        switch (itemId) {
          case "tray-open-chat":
            switchShellView("desktop");
            setTab("chat");
            await showAndFocusWindow();
            return;
          case "tray-open-plugins":
            switchShellView("desktop");
            setTab("plugins");
            await showAndFocusWindow();
            return;
          case "tray-open-desktop-workspace":
            await openDesktopSettingsWindow("desktop");
            return;
          case "tray-open-voice-controls":
            await openDesktopSettingsWindow("voice");
            return;
          case "tray-open-media-controls":
            await openDesktopSettingsWindow("media");
            return;
          case "tray-toggle-lifecycle":
            if (isAgentActive(agentStatus?.state)) {
              await handleStop();
            } else {
              await handleStart();
            }
            return;
          case "tray-restart":
            await handleRestart();
            return;
          case "tray-notify":
            await invokeDesktopBridgeRequest<{ id: string }>({
              rpcMethod: "desktopShowNotification",
              ipcChannel: "desktop:showNotification",
              params: {
                title: "Milady Desktop",
                body: "Renderer tray actions are wired and responding.",
                urgency: "normal",
              },
            });
            return;
          case "tray-show-window":
            await showAndFocusWindow();
            return;
          case "tray-hide-window":
            await invokeDesktopBridgeRequest<void>({
              rpcMethod: "desktopHideWindow",
              ipcChannel: "desktop:hideWindow",
            });
            return;
          default:
            return;
        }
      };

      void run().catch((error) => {
        console.warn("[Milady] Desktop tray action failed:", error);
      });
    };

    document.addEventListener(TRAY_ACTION_EVENT, handleTrayAction);
    return () => {
      document.removeEventListener(TRAY_ACTION_EVENT, handleTrayAction);
    };
  }, [
    agentStatus?.state,
    handleRestart,
    handleStart,
    handleStop,
    setTab,
    switchShellView,
  ]);

  return null;
}
