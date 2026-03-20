import { describe, expect, it } from "vitest";
import {
  buildApplicationMenu,
  EMPTY_HEARTBEAT_MENU_SNAPSHOT,
} from "../application-menu";

function getMenu(
  label: string,
  browserEnabled = false,
  detachedWindows: Array<{
    id: string;
    surface:
      | "browser"
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
    browserEnabled,
    heartbeatSnapshot: EMPTY_HEARTBEAT_MENU_SNAPSHOT,
    detachedWindows,
  });
  return menu.find((item) => item.label === label);
}

describe("buildApplicationMenu", () => {
  it("renders surface-first top-level menus without the redundant agent menu", () => {
    const menu = buildApplicationMenu({
      isMac: true,
      browserEnabled: false,
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
    const viewLabels = (getMenu("View")?.submenu ?? []).map(
      (item) => item.label ?? item.type ?? "",
    );

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
      browserEnabled: false,
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
        id: "browser_1",
        surface: "browser" as const,
        title: "Milady Browser",
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
        title: "Eliza Cloud",
        singleton: false,
      },
      {
        id: "settings_1",
        surface: "settings" as const,
        title: "Milady Settings",
        singleton: true,
      },
    ];

    const pluginsLabels = (
      getMenu("Plugins", false, detachedWindows)?.submenu ?? []
    ).map((item) => item.label ?? item.type ?? "");
    const connectorsLabels = (
      getMenu("Connectors", false, detachedWindows)?.submenu ?? []
    ).map((item) => item.label ?? item.type ?? "");
    const cloudLabels = (
      getMenu("Cloud", false, detachedWindows)?.submenu ?? []
    ).map((item) => item.label ?? item.type ?? "");
    const heartbeatsLabels = (
      getMenu("Heartbeats", false, detachedWindows)?.submenu ?? []
    ).map((item) => item.label ?? item.type ?? "");
    const windowLabels = (
      getMenu("Window", false, detachedWindows)?.submenu ?? []
    ).map((item) => item.label ?? item.type ?? "");

    expect(pluginsLabels).toContain("Open New Plugins Window");
    expect(pluginsLabels).toContain("Milady Plugins");
    expect(cloudLabels).toContain("Open Cloud Window");
    expect(cloudLabels).toContain("Eliza Cloud");
    expect(connectorsLabels).toContain("Open New Connectors Window");
    expect(connectorsLabels).toContain("Milady Connectors");
    expect(heartbeatsLabels).toContain("Milady Heartbeats");
    expect(windowLabels).toContain("New Chat Window");
    expect(windowLabels).toContain("New Plugins Window");
    expect(windowLabels).toContain("New Cloud Window");
    expect(windowLabels).toContain("Milady Chat");
    expect(windowLabels).toContain("Eliza Cloud");
    expect(windowLabels).toContain("Milady Settings");
    expect(windowLabels).not.toContain("New Browser Window");
    expect(windowLabels).not.toContain("Milady Browser");
  });

  it("can re-enable browser menus when explicitly requested", () => {
    const detachedWindows = [
      {
        id: "browser_1",
        surface: "browser" as const,
        title: "Milady Browser",
        singleton: false,
      },
    ];

    const browserLabels = (
      getMenu("Browser", true, detachedWindows)?.submenu ?? []
    ).map((item) => item.label ?? item.type ?? "");
    const windowLabels = (
      getMenu("Window", true, detachedWindows)?.submenu ?? []
    ).map((item) => item.label ?? item.type ?? "");

    expect(browserLabels).toContain("Open Browser Window");
    expect(browserLabels).toContain("Milady Browser");
    expect(windowLabels).toContain("New Browser Window");
    expect(windowLabels).toContain("Milady Browser");
  });

  it("hides surface menus and new-window items when agentReady is false", () => {
    const menu = buildApplicationMenu({
      isMac: true,
      browserEnabled: false,
      heartbeatSnapshot: EMPTY_HEARTBEAT_MENU_SNAPSHOT,
      detachedWindows: [],
      agentReady: false,
    });

    const topLabels = menu.map((item) => item.label);
    expect(topLabels).toEqual(["Milady", "File", "Edit", "View", "Window"]);
    expect(topLabels).not.toContain("Cloud");
    expect(topLabels).not.toContain("Plugins");
    expect(topLabels).not.toContain("Connectors");
    expect(topLabels).not.toContain("Heartbeats");
  });

  it("hides new-window items from Window menu when agentReady is false", () => {
    const menu = buildApplicationMenu({
      isMac: true,
      browserEnabled: false,
      heartbeatSnapshot: EMPTY_HEARTBEAT_MENU_SNAPSHOT,
      detachedWindows: [],
      agentReady: false,
    });

    const windowMenu = menu.find((item) => item.label === "Window");
    const windowLabels = (windowMenu?.submenu ?? []).map(
      (item) => item.label ?? item.role ?? item.type ?? "",
    );

    expect(windowLabels).toContain("Show Milady");
    expect(windowLabels).not.toContain("New Chat Window");
    expect(windowLabels).not.toContain("New Heartbeats Window");
    expect(windowLabels).not.toContain("New Plugins Window");
    expect(windowLabels).not.toContain("New Connectors Window");
    expect(windowLabels).not.toContain("New Cloud Window");
    expect(windowLabels).not.toContain("Settings Window");
  });

  it("defaults agentReady to true when omitted (backward compat)", () => {
    const withDefault = buildApplicationMenu({
      isMac: true,
      browserEnabled: false,
      heartbeatSnapshot: EMPTY_HEARTBEAT_MENU_SNAPSHOT,
      detachedWindows: [],
    });
    const withExplicit = buildApplicationMenu({
      isMac: true,
      browserEnabled: false,
      heartbeatSnapshot: EMPTY_HEARTBEAT_MENU_SNAPSHOT,
      detachedWindows: [],
      agentReady: true,
    });

    expect(withDefault.map((i) => i.label)).toEqual(
      withExplicit.map((i) => i.label),
    );
  });

  it("restores full menus when agentReady switches to true", () => {
    const notReady = buildApplicationMenu({
      isMac: true,
      browserEnabled: false,
      heartbeatSnapshot: EMPTY_HEARTBEAT_MENU_SNAPSHOT,
      detachedWindows: [],
      agentReady: false,
    });
    const ready = buildApplicationMenu({
      isMac: true,
      browserEnabled: false,
      heartbeatSnapshot: EMPTY_HEARTBEAT_MENU_SNAPSHOT,
      detachedWindows: [],
      agentReady: true,
    });

    expect(notReady.map((i) => i.label)).not.toContain("Cloud");
    expect(ready.map((i) => i.label)).toContain("Cloud");
    expect(ready.map((i) => i.label)).toContain("Plugins");
    expect(ready.map((i) => i.label)).toContain("Connectors");
    expect(ready.map((i) => i.label)).toContain("Heartbeats");
  });

  it("surfaces heartbeat load failures without removing the menu", () => {
    const labels = (
      buildApplicationMenu({
        isMac: true,
        browserEnabled: false,
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
