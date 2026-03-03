import {
  type Component,
  type Focusable,
  getEditorKeybindings,
  Input,
  type SettingItem,
  SettingsList,
  type SettingsListTheme,
} from "@mariozechner/pi-tui";
import chalk from "chalk";
import type { RegistryEndpoint } from "../../config/types.milady.js";
import { tuiTheme } from "../theme.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EndpointsTabOptions {
  getEndpoints: () => RegistryEndpoint[];
  addEndpoint: (label: string, url: string) => void;
  removeEndpoint: (url: string) => void;
  toggleEndpoint: (url: string, enabled: boolean) => void;
  isDefaultEndpoint: (url: string) => boolean;
  onClose: () => void;
  requestRender: () => void;
}

type TabState = "list" | "add-label" | "add-url" | "confirm-delete";

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------

const endpointsListTheme: SettingsListTheme = {
  label: (text, selected) => (selected ? tuiTheme.accent(text) : text),
  value: (text, selected) =>
    selected ? tuiTheme.accent(text) : tuiTheme.muted(text),
  description: (text) => tuiTheme.dim(text),
  cursor: tuiTheme.accent("→ "),
  hint: (text) => tuiTheme.dim(text),
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Endpoints tab — manage plugin registry endpoint URLs.
 * Default endpoint is shown with [default] badge and cannot be removed.
 */
export class PluginEndpointsTab implements Component, Focusable {
  focused = false;

  private state: TabState = "list";
  private settingsList!: SettingsList;
  private options: EndpointsTabOptions;

  // Add endpoint flow
  private labelInput = new Input();
  private urlInput = new Input();
  private pendingLabel = "";

  // Delete state
  private deleteUrl = "";
  // Track which endpoint the user last interacted with or navigated to.
  // Updated both on toggle (via onChange) and on navigation (via intercepting up/down).
  private lastInteractedId = "";
  private endpointIds: string[] = [];
  private selectedIdx = 0;

  constructor(options: EndpointsTabOptions) {
    this.options = options;
    this.rebuildList();
  }

  /** Whether the tab is in an input-consuming state (add/delete flows). */
  isCapturingInput(): boolean {
    return this.state !== "list";
  }

  private rebuildList(): void {
    const endpoints = this.options.getEndpoints();
    const items: SettingItem[] = [];
    this.endpointIds = [];

    // Default endpoint is always first
    items.push({
      id: "__default__",
      label: "ElizaOS Registry [default]",
      currentValue: "always on",
      values: ["always on"],
    });
    this.endpointIds.push("__default__");

    for (const ep of endpoints) {
      const enabled = ep.enabled !== false;
      items.push({
        id: ep.url,
        label: `${ep.label}`,
        description: ep.url,
        currentValue: enabled ? "on" : "off",
        values: ["on", "off"],
      });
      this.endpointIds.push(ep.url);
    }

    this.settingsList = new SettingsList(
      items,
      12,
      endpointsListTheme,
      (id, newValue) => {
        this.lastInteractedId = id;
        if (id === "__default__") return; // Can't toggle default
        this.options.toggleEndpoint(id, newValue === "on");
        this.rebuildList();
        this.options.requestRender();
      },
      () => this.options.onClose(),
    );
  }

  handleInput(data: string): void {
    const kb = getEditorKeybindings();

    switch (this.state) {
      case "list": {
        // Track navigation to update lastInteractedId
        const kb2 = getEditorKeybindings();
        if (kb2.matches(data, "selectUp")) {
          this.selectedIdx = Math.max(0, this.selectedIdx - 1);
          this.lastInteractedId = this.endpointIds[this.selectedIdx] ?? "";
        } else if (kb2.matches(data, "selectDown")) {
          this.selectedIdx = Math.min(
            this.endpointIds.length - 1,
            this.selectedIdx + 1,
          );
          this.lastInteractedId = this.endpointIds[this.selectedIdx] ?? "";
        }

        // 'a' key to add new endpoint
        if (data === "a") {
          this.state = "add-label";
          this.labelInput.setValue("");
          this.options.requestRender();
          return;
        }
        // 'd' key to delete the last interacted endpoint
        if (data === "d") {
          if (
            this.lastInteractedId &&
            this.lastInteractedId !== "__default__" &&
            !this.options.isDefaultEndpoint(this.lastInteractedId)
          ) {
            this.deleteUrl = this.lastInteractedId;
            this.state = "confirm-delete";
            this.options.requestRender();
            return;
          }
          return;
        }
        this.settingsList.handleInput(data);
        break;
      }

      case "add-label":
        if (kb.matches(data, "selectCancel")) {
          this.state = "list";
          this.options.requestRender();
          return;
        }
        if (data === "\r" || data === "\n") {
          const label = this.labelInput.getValue().trim();
          if (label) {
            this.pendingLabel = label;
            this.state = "add-url";
            this.urlInput.setValue("");
            this.options.requestRender();
          }
          return;
        }
        this.labelInput.handleInput(data);
        break;

      case "add-url":
        if (kb.matches(data, "selectCancel")) {
          this.state = "list";
          this.options.requestRender();
          return;
        }
        if (data === "\r" || data === "\n") {
          const url = this.urlInput.getValue().trim();
          if (url) {
            try {
              this.options.addEndpoint(this.pendingLabel, url);
              this.rebuildList();
            } catch (_err) {
              // Error handled silently — the add function validates
            }
            this.state = "list";
            this.options.requestRender();
          }
          return;
        }
        this.urlInput.handleInput(data);
        break;

      case "confirm-delete":
        if (data === "y" || data === "Y") {
          try {
            this.options.removeEndpoint(this.deleteUrl);
            this.rebuildList();
          } catch {
            // Silently handled
          }
          this.state = "list";
          this.options.requestRender();
          return;
        }
        if (data === "n" || data === "N" || kb.matches(data, "selectCancel")) {
          this.state = "list";
          this.options.requestRender();
          return;
        }
        break;
    }
  }

  render(width: number): string[] {
    switch (this.state) {
      case "add-label": {
        this.labelInput.focused = this.focused;
        const lines = [
          chalk.bold("  Add Registry Endpoint"),
          "",
          "  Label:",
          ...this.labelInput.render(width).map((l) => `    ${l}`),
          "",
          tuiTheme.dim("  Enter to continue • Esc to cancel"),
        ];
        return lines;
      }

      case "add-url": {
        this.urlInput.focused = this.focused;
        const lines = [
          chalk.bold("  Add Registry Endpoint"),
          "",
          `  Label: ${tuiTheme.accent(this.pendingLabel)}`,
          "  URL:",
          ...this.urlInput.render(width).map((l) => `    ${l}`),
          "",
          tuiTheme.dim("  Enter to save • Esc to cancel"),
        ];
        return lines;
      }

      case "confirm-delete": {
        const lines = [
          "",
          `  ${tuiTheme.warning("Delete endpoint?")}`,
          `  ${tuiTheme.dim(this.deleteUrl)}`,
          "",
          `  ${tuiTheme.accent("y")} to confirm • ${tuiTheme.accent("n")} to cancel`,
        ];
        return lines;
      }

      default: {
        const lines = [
          ...this.settingsList.render(width),
          "",
          tuiTheme.dim(
            "  ↑↓ navigate • Enter/Space toggle • a add • d delete • Esc close",
          ),
        ];
        return lines;
      }
    }
  }

  invalidate(): void {
    this.settingsList.invalidate();
    this.labelInput.invalidate();
    this.urlInput.invalidate();
  }
}
