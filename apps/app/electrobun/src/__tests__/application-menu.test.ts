import { describe, expect, it } from "vitest";
import {
  buildApplicationMenu,
  EMPTY_HEARTBEAT_MENU_SNAPSHOT,
} from "../application-menu";

function getMenu(
  label: string,
  detachedWindows: Array<{
    id: string;
    surface:
      | "chat"
      | "triggers"
      | "plugins"
      | "connectors"
      | "cloud"
      | "settings";
    title: string;
    singleton: boolean;
  }> = [],
) {
  const menu = buildApplicationMenu({
    isMac: true,
    heartbeatSnapshot: EMPTY_HEARTBEAT_MENU_SNAPSHOT,
    detachedWindows,
  });
  return menu.find((item) => item.label === label);
}

describe("buildApplicationMenu", () => {
  it("renders surface-first top-level menus without the redundant agent menu", () => {
    const menu = buildApplicationMenu({
      isMac: true,
      heartbeatSnapshot: EMPTY_HEARTBEAT_MENU_SNAPSHOT,
      detachedWindows: [],
    });

    expect(menu.map((item) => item.label)).toEqual([
      "Milady",
      "File",
      "Edit",
      "View",
      "Cloud",
      "Plugins",
      "Connectors",
      "Heartbeats",
      "Window",
    ]);
  });

  it("keeps the view menu to explicit display controls only", () => {
    const viewLabels = (
      getMenu("View")?.submenu ?? []
    ).map((item) => item.label ?? item.type ?? "");

    expect(viewLabels).toContain("Reload");
    expect(viewLabels).toContain("Force Reload");
    expect(viewLabels).toContain("Toggle Developer Tools");
    expect(viewLabels).toContain("Actual Size");
    expect(viewLabels).toContain("Toggle Full Screen");
    expect(viewLabels).not.toContain("Show Chat");
    expect(viewLabels).not.toContain("Show Companion");
    expect(viewLabels).not.toContain("Show Heartbeats");
  });

  it("renders heartbeat monitoring summary in the native menu", () => {
    const heartbeatsMenu = buildApplicationMenu({
      isMac: false,
      heartbeatSnapshot: {
        ...EMPTY_HEARTBEAT_MENU_SNAPSHOT,
        loading: false,
        totalHeartbeats: 3,
        activeHeartbeats: 2,
        totalExecutions: 14,
        totalFailures: 1,
        lastRunAtMs: Date.UTC(2026, 2, 18, 14, 30, 0),
        nextRunAtMs: Date.UTC(2026, 2, 18, 15, 0, 0),
      },
      detachedWindows: [],
    }).find((item) => item.label === "Heartbeats");

    const labels = (heartbeatsMenu?.submenu ?? []).map(
      (item) => item.label ?? item.type ?? "",
    );

    expect(labels).toContain("Show in Main Window");
    expect(labels).toContain("Open New Heartbeats Window");
    expect(labels).toContain("Refresh Heartbeats");
    expect(labels).toContain("Status: Monitoring");
    expect(labels).toContain("Heartbeats: 3 total, 2 active");
    expect(labels).toContain("Executions: 14 total, 1 failed");
    expect(labels.some((label) => label.startsWith("Last run: "))).toBe(true);
    expect(labels.some((label) => label.startsWith("Next run: "))).toBe(true);
  });

  it("fills plugins, connectors, heartbeats, and window menus with live detached windows", () => {
    const detachedWindows = [
      {
        id: "plugins_1",
        surface: "plugins" as const,
        title: "Milady Plugins",
        singleton: false,
      },
      {
        id: "connectors_1",
        surface: "connectors" as const,
        title: "Milady Connectors",
        singleton: false,
      },
      {
        id: "triggers_1",
        surface: "triggers" as const,
        title: "Milady Heartbeats",
        singleton: false,
      },
      {
        id: "chat_1",
        surface: "chat" as const,
        title: "Milady Chat",
        singleton: false,
      },
      {
        id: "cloud_1",
        surface: "cloud" as const,
        title: "Milady Cloud",
        singleton: false,
      },
      {
        id: "settings_1",
        surface: "settings" as const,
        title: "Milady Settings",
        singleton: true,
      },
    ];

    const pluginsLabels = (getMenu("Plugins", detachedWindows)?.submenu ?? []).map(
      (item) => item.label ?? item.type ?? "",
    );
    const connectorsLabels = (
      getMenu("Connectors", detachedWindows)?.submenu ?? []
    ).map((item) => item.label ?? item.type ?? "");
    const cloudLabels = (getMenu("Cloud", detachedWindows)?.submenu ?? []).map(
      (item) => item.label ?? item.type ?? "",
    );
    const heartbeatsLabels = (
      getMenu("Heartbeats", detachedWindows)?.submenu ?? []
    ).map((item) => item.label ?? item.type ?? "");
    const windowLabels = (getMenu("Window", detachedWindows)?.submenu ?? []).map(
      (item) => item.label ?? item.type ?? "",
    );

    expect(pluginsLabels).toContain("Open New Plugins Window");
    expect(pluginsLabels).toContain("Milady Plugins");
    expect(cloudLabels).toContain("Open Cloud Window");
    expect(cloudLabels).toContain("Milady Cloud");
    expect(connectorsLabels).toContain("Open New Connectors Window");
    expect(connectorsLabels).toContain("Milady Connectors");
    expect(heartbeatsLabels).toContain("Milady Heartbeats");
    expect(windowLabels).toContain("New Chat Window");
    expect(windowLabels).toContain("New Plugins Window");
    expect(windowLabels).toContain("New Cloud Window");
    expect(windowLabels).toContain("Milady Chat");
    expect(windowLabels).toContain("Milady Cloud");
    expect(windowLabels).toContain("Milady Settings");
  });

  it("surfaces heartbeat load failures without removing the menu", () => {
    const labels = (
      buildApplicationMenu({
        isMac: true,
        heartbeatSnapshot: {
          ...EMPTY_HEARTBEAT_MENU_SNAPSHOT,
          loading: false,
          error: "Heartbeat status unavailable",
        },
        detachedWindows: [],
      }).find((item) => item.label === "Heartbeats")?.submenu ?? []
    ).map((item) => item.label ?? item.type ?? "");

    expect(labels).toContain("Status: Heartbeat status unavailable");
    expect(labels).toContain("Heartbeats: 0 total, 0 active");
  });
});
