import { subscribeDesktopBridgeEvent } from "@miladyai/app-core/bridge";
import type { Tab } from "@miladyai/app-core/navigation";
import { useApp } from "@miladyai/app-core/state";
import { useEffect } from "react";

const MAIN_SURFACE_TABS = new Set<Tab>(["plugins", "connectors", "triggers"]);

export function DesktopSurfaceNavigationRuntime() {
  const { setTab, switchShellView } = useApp();

  useEffect(() => {
    return subscribeDesktopBridgeEvent({
      rpcMessage: "desktopTrayMenuClick",
      ipcChannel: "desktop:trayMenuClick",
      listener: (payload) => {
        const itemId =
          (payload as { itemId?: string } | null | undefined)?.itemId ?? "";
        if (!itemId.startsWith("show-main:")) {
          return;
        }

        const target = itemId.slice("show-main:".length) as Tab;
        if (!MAIN_SURFACE_TABS.has(target)) {
          return;
        }

        switchShellView("desktop");
        setTab(target);
      },
    });
  }, [setTab, switchShellView]);

  return null;
}
