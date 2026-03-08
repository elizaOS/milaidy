import { getTabMeta, type Tab } from "./navigation";

export interface ShellPanelState {
  mobileAutonomousOpen: boolean;
  mobileConversationsOpen: boolean;
  mobileNavOpen: boolean;
}

export const DEFAULT_SHELL_PANEL_STATE: ShellPanelState = {
  mobileAutonomousOpen: false,
  mobileConversationsOpen: false,
  mobileNavOpen: false,
};

function normalizeShellPanelState(
  value: Partial<ShellPanelState> | null | undefined,
): ShellPanelState {
  return {
    mobileAutonomousOpen: value?.mobileAutonomousOpen === true,
    mobileConversationsOpen: value?.mobileConversationsOpen === true,
    mobileNavOpen: value?.mobileNavOpen === true,
  };
}

export function readShellPanelState(tab: Tab): ShellPanelState {
  if (typeof window === "undefined") return DEFAULT_SHELL_PANEL_STATE;
  try {
    const raw = window.localStorage.getItem(getTabMeta(tab).restoreKey);
    if (!raw) return DEFAULT_SHELL_PANEL_STATE;
    const parsed = JSON.parse(raw) as Partial<ShellPanelState>;
    return normalizeShellPanelState(parsed);
  } catch {
    return DEFAULT_SHELL_PANEL_STATE;
  }
}

export function writeShellPanelState(
  tab: Tab,
  nextState: Partial<ShellPanelState>,
): ShellPanelState {
  const normalized = normalizeShellPanelState(nextState);
  if (typeof window === "undefined") return normalized;
  try {
    window.localStorage.setItem(
      getTabMeta(tab).restoreKey,
      JSON.stringify(normalized),
    );
  } catch {
    // Ignore persistence failures.
  }
  return normalized;
}
