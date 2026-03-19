import type { ManagedWindowSnapshot } from "./surface-windows";

type ApplicationMenuRole =
  | "about"
  | "services"
  | "hide"
  | "hideOthers"
  | "unhide"
  | "quit"
  | "undo"
  | "redo"
  | "cut"
  | "copy"
  | "paste"
  | "selectAll"
  | "reload"
  | "forceReload"
  | "toggleDevTools"
  | "resetZoom"
  | "zoomIn"
  | "zoomOut"
  | "togglefullscreen"
  | "minimize"
  | "close"
  | "zoom"
  | "front";

export type ApplicationMenuItem = {
  label?: string;
  submenu?: ApplicationMenuItem[];
  role?: ApplicationMenuRole;
  action?: string;
  accelerator?: string;
  type?: "separator";
  enabled?: boolean;
};

export interface HeartbeatMenuSnapshot {
  loading: boolean;
  error: string | null;
  totalHeartbeats: number;
  activeHeartbeats: number;
  totalExecutions: number;
  totalFailures: number;
  lastRunAtMs: number | null;
  nextRunAtMs: number | null;
}

export const EMPTY_HEARTBEAT_MENU_SNAPSHOT: HeartbeatMenuSnapshot = {
  loading: true,
  error: null,
  totalHeartbeats: 0,
  activeHeartbeats: 0,
  totalExecutions: 0,
  totalFailures: 0,
  lastRunAtMs: null,
  nextRunAtMs: null,
};

function formatHeartbeatTimestamp(
  value: number | null,
  fallback: string,
): string {
  if (typeof value !== "number" || Number.isNaN(value) || value <= 0) {
    return fallback;
  }
  return new Date(value).toLocaleString();
}

function buildHeartbeatStatusLabel(snapshot: HeartbeatMenuSnapshot): string {
  if (snapshot.loading) return "Status: Loading...";
  if (snapshot.error) return `Status: ${snapshot.error}`;
  return "Status: Monitoring";
}

function buildOpenWindowItems(
  windows: ManagedWindowSnapshot[],
  emptyLabel: string,
): ApplicationMenuItem[] {
  if (windows.length === 0) {
    return [{ label: emptyLabel, enabled: false }];
  }

  return windows.map((window) => ({
    label: window.title,
    action: `focus-window:${window.id}`,
  }));
}

function buildSurfaceMenu(
  label: string,
  surface: Extract<
    ManagedWindowSnapshot["surface"],
    "plugins" | "connectors" | "triggers"
  >,
  windows: ManagedWindowSnapshot[],
  heartbeatSnapshot?: HeartbeatMenuSnapshot,
): ApplicationMenuItem {
  const baseItems: ApplicationMenuItem[] = [
    { label: "Show in Main Window", action: `show-main:${surface}` },
    { label: `Open New ${label} Window`, action: `new-window:${surface}` },
  ];

  if (surface === "triggers" && heartbeatSnapshot) {
    baseItems.push(
      { label: "Refresh Heartbeats", action: "refresh-heartbeats" },
      { type: "separator" },
      { label: buildHeartbeatStatusLabel(heartbeatSnapshot), enabled: false },
      {
        label: `Last run: ${formatHeartbeatTimestamp(heartbeatSnapshot.lastRunAtMs, "Never")}`,
        enabled: false,
      },
      {
        label: `Next run: ${formatHeartbeatTimestamp(heartbeatSnapshot.nextRunAtMs, "Not scheduled")}`,
        enabled: false,
      },
      {
        label: `Heartbeats: ${heartbeatSnapshot.totalHeartbeats} total, ${heartbeatSnapshot.activeHeartbeats} active`,
        enabled: false,
      },
      {
        label: `Executions: ${heartbeatSnapshot.totalExecutions} total, ${heartbeatSnapshot.totalFailures} failed`,
        enabled: false,
      },
    );
  }

  return {
    label,
    submenu: [
      ...baseItems,
      { type: "separator" },
      ...buildOpenWindowItems(
        windows,
        `No open ${label.toLowerCase()} windows`,
      ),
    ],
  };
}

function buildCloudMenu(
  windows: ManagedWindowSnapshot[],
): ApplicationMenuItem {
  return {
    label: "Cloud",
    submenu: [
      { label: "Open Cloud Window", action: "new-window:cloud" },
      { type: "separator" },
      ...buildOpenWindowItems(windows, "No open cloud windows"),
    ],
  };
}

export function buildApplicationMenu({
  isMac,
  heartbeatSnapshot,
  detachedWindows,
}: {
  isMac: boolean;
  heartbeatSnapshot: HeartbeatMenuSnapshot;
  detachedWindows: ManagedWindowSnapshot[];
}): ApplicationMenuItem[] {
  const pluginsWindows = detachedWindows.filter(
    (window) => window.surface === "plugins",
  );
  const connectorsWindows = detachedWindows.filter(
    (window) => window.surface === "connectors",
  );
  const heartbeatWindows = detachedWindows.filter(
    (window) => window.surface === "triggers",
  );
  const cloudWindows = detachedWindows.filter(
    (window) => window.surface === "cloud",
  );

  return [
    {
      label: "Milady",
      submenu: [
        { role: "about" },
        { label: "Check for Updates", action: "check-for-updates" },
        { type: "separator" },
        { label: "Settings...", action: "open-settings" },
        { label: "Restart Agent", action: "restart-agent" },
        { label: "Relaunch Milady", action: "relaunch" },
        { type: "separator" },
        ...(isMac
          ? [
              { role: "services" },
              { type: "separator" as const },
              { role: "hide" },
              { role: "hideOthers" },
              { role: "unhide" },
              { type: "separator" as const },
            ]
          : []),
        { role: "quit" },
      ] as ApplicationMenuItem[],
    },
    {
      label: "File",
      submenu: [
        { label: "Import Config...", action: "import-config" },
        { label: "Export Config...", action: "export-config" },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { label: "Reload", role: "reload" },
        { label: "Force Reload", role: "forceReload" },
        {
          label: "Toggle Developer Tools",
          action: "toggle-devtools",
          accelerator: isMac ? "Alt+Command+I" : "Ctrl+Shift+I",
        },
        { type: "separator" },
        { label: "Actual Size", role: "resetZoom" },
        { label: "Zoom In", role: "zoomIn" },
        { label: "Zoom Out", role: "zoomOut" },
        { type: "separator" },
        { label: "Toggle Full Screen", role: "togglefullscreen" },
      ],
    },
    buildCloudMenu(cloudWindows),
    buildSurfaceMenu("Plugins", "plugins", pluginsWindows),
    buildSurfaceMenu("Connectors", "connectors", connectorsWindows),
    buildSurfaceMenu(
      "Heartbeats",
      "triggers",
      heartbeatWindows,
      heartbeatSnapshot,
    ),
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "close" },
        ...(isMac
          ? [
              { role: "zoom" },
              { type: "separator" as const },
              { role: "front" },
            ]
          : []),
        { type: "separator" },
        { label: "Show Milady", action: "show" },
        { label: "New Chat Window", action: "new-window:chat" },
        { label: "New Heartbeats Window", action: "new-window:triggers" },
        { label: "New Plugins Window", action: "new-window:plugins" },
        { label: "New Connectors Window", action: "new-window:connectors" },
        { label: "New Cloud Window", action: "new-window:cloud" },
        { label: "Settings Window", action: "open-settings" },
        { type: "separator" },
        ...buildOpenWindowItems(detachedWindows, "No open detached windows"),
      ] as ApplicationMenuItem[],
    },
  ];
}
