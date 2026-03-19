import { subscribeDesktopBridgeEvent } from "@elizaos/app-core/bridge";
import type { Tab } from "@elizaos/app-core/navigation";
import { useApp } from "@elizaos/app-core/state";
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
