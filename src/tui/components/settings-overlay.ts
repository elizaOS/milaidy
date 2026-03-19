import {
  type Component,
  type Focusable,
  type SettingItem,
  SettingsList,
  type SettingsListTheme,
} from "@mariozechner/pi-tui";
import { tuiTheme } from "../theme.js";
import { ModalFrame } from "./modal-frame.js";

const settingsListTheme: SettingsListTheme = {
  label: (text, selected) => (selected ? tuiTheme.accent(text) : text),
  value: (text, selected) =>
    selected ? tuiTheme.accent(text) : tuiTheme.muted(text),
  description: (text) => tuiTheme.dim(text),
  cursor: tuiTheme.accent("→ "),
  hint: (text) => tuiTheme.dim(text),
};

export interface SettingsOverlayOptions {
  showThinking: boolean;
  toolExpand: boolean;
  onToggleThinking: (enabled: boolean) => void;
  onToggleToolExpand: (enabled: boolean) => void;
  onClose: () => void;
}

/**
 * Settings overlay using pi-tui SettingsList.
 * Toggleable options for the TUI session.
 */
export class SettingsOverlayComponent implements Component, Focusable {
  focused = false;
  private list: SettingsList;
  private frame = new ModalFrame({
    title: "Settings",
    hint: "↑↓ navigate • Enter/Space toggle • Esc close",
  });

  constructor(options: SettingsOverlayOptions) {
    const items: SettingItem[] = [
      {
        id: "thinking",
        label: "Show thinking",
        description: "Display model thinking/reasoning traces",
        currentValue: options.showThinking ? "on" : "off",
        values: ["on", "off"],
      },
      {
        id: "toolExpand",
        label: "Expand tool output",
        description: "Show full tool/action output",
        currentValue: options.toolExpand ? "on" : "off",
        values: ["on", "off"],
      },
    ];

    this.list = new SettingsList(
      items,
      10,
      settingsListTheme,
      (id, newValue) => {
        switch (id) {
          case "thinking":
            options.onToggleThinking(newValue === "on");
            break;
          case "toolExpand":
            options.onToggleToolExpand(newValue === "on");
            break;
        }
      },
      () => {
        options.onClose();
      },
    );
  }

  handleInput(data: string): void {
    this.list.handleInput(data);
  }

  render(width: number): string[] {
    return this.frame.render(width, this.list.render(width));
  }

  invalidate(): void {
    this.list.invalidate();
  }
}
