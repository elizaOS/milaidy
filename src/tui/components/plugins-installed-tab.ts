import {
  type Component,
  type Focusable,
  getEditorKeybindings,
  Input,
  matchesKey,
  type SelectItem,
  SelectList,
} from "@mariozechner/pi-tui";
import { tuiTheme } from "../theme.js";
import type {
  InstalledTabOptions,
  InstalledTabState,
  PluginListItem,
  PluginParam,
} from "./plugins-installed-tab-types.js";
import {
  renderAddKeyView,
  renderEditSelectView,
  renderEditValueView,
} from "./plugins-installed-tab-view.js";

export type {
  InstalledTabOptions,
  PluginListItem,
  PluginParam,
} from "./plugins-installed-tab-types.js";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Installed Plugins tab — filterable list of installed/loaded plugins with
 * enable/disable toggle and per-plugin configuration.
 */
export class InstalledPluginsTab implements Component, Focusable {
  focused = false;

  private filterInput = new Input();
  private selectList: SelectList;
  private pluginsById = new Map<string, PluginListItem>();
  private allItems: SelectItem[] = [];
  private loading = true;

  private state: InstalledTabState = "list";
  private editingPluginId: string | null = null;
  private editingPluginName = "";
  private editingKeys: string[] = [];
  private editingParamsByKey: Record<string, PluginParam> = {};
  private editingDraft: Record<string, string> = {};
  private editingIndex = 0;
  private valueInput = new Input();
  private newKeyInput = new Input();
  private showUnmaskedValues = false;
  private statusMessage = "";

  private options: InstalledTabOptions;

  constructor(options: InstalledTabOptions) {
    this.options = options;

    this.selectList = new SelectList([], 14, tuiTheme.selectList);
    this.selectList.onCancel = () => options.onClose();

    this.filterInput.setValue("");

    // Initial load
    void this.loadPlugins();
  }

  /** Whether the tab is in an input-consuming state. */
  isCapturingInput(): boolean {
    return this.state !== "list";
  }

  private async loadPlugins(): Promise<void> {
    this.loading = true;
    this.options.requestRender();
    try {
      const plugins = await this.options.getPlugins();
      // Sort: enabled first, then alphabetical
      plugins.sort((a, b) => {
        if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

      this.pluginsById.clear();
      this.allItems = [];

      for (const p of plugins) {
        this.pluginsById.set(p.id, p);
        const statusBadge = p.enabled
          ? tuiTheme.success("[ON]")
          : tuiTheme.dim("[OFF]");
        const configHint =
          p.configStatus.total === 0
            ? tuiTheme.dim("(no config)")
            : `(${p.configStatus.set}/${p.configStatus.total} configured)`;

        this.allItems.push({
          value: p.id,
          label: `${p.name}  ${statusBadge}`,
          description: `${p.category}  v${p.version}  ${configHint}`,
        });
      }

      this.selectList = new SelectList(this.allItems, 14, tuiTheme.selectList);
      this.selectList.onCancel = () => this.options.onClose();
      this.selectList.onSelect = (item) => {
        void this.handlePluginSelect(item.value);
      };

      // Re-apply any active filter text after reloading the list.
      const filter = this.filterInput.getValue();
      if (filter) {
        this.selectList.setFilter(filter);
      }
    } catch {
      // Silently fall through — list will be empty
    } finally {
      this.loading = false;
      this.options.requestRender();
    }
  }

  private async handlePluginSelect(pluginId: string): Promise<void> {
    const plugin = this.pluginsById.get(pluginId);
    if (!plugin) return;

    // Toggle enabled state on select
    const newEnabled = !plugin.enabled;
    await this.options.onTogglePlugin(pluginId, newEnabled);
    this.statusMessage = `${plugin.name} ${newEnabled ? "enabled" : "disabled"}.`;
    void this.loadPlugins();
  }

  private beginEditSelectedPlugin(): void {
    const selected = this.selectList.getSelectedItem();
    if (!selected) return;

    const plugin = this.pluginsById.get(selected.value);
    if (!plugin) return;

    this.editingPluginId = plugin.id;
    this.editingPluginName = plugin.name;
    this.editingParamsByKey = Object.fromEntries(
      plugin.parameters.map((p) => [p.key, p]),
    );
    this.editingKeys = [...plugin.parameters]
      .sort((a, b) => {
        const reqA = a.required ? 0 : 1;
        const reqB = b.required ? 0 : 1;
        if (reqA !== reqB) return reqA - reqB;
        return a.key.localeCompare(b.key);
      })
      .map((p) => p.key);
    this.editingDraft = Object.fromEntries(
      plugin.parameters.map((p) => [p.key, p.value]),
    );
    this.editingIndex = 0;
    this.showUnmaskedValues = false;
    this.state = "edit-select";
    this.statusMessage = "";
    this.options.requestRender();
  }

  private async saveEditingConfig(): Promise<void> {
    const pluginId = this.editingPluginId;
    if (!pluginId) return;

    const missingRequired = this.editingKeys.filter((key) => {
      const param = this.editingParamsByKey[key];
      if (!param?.required) return false;
      return (this.editingDraft[key] ?? "").trim() === "";
    });

    if (missingRequired.length > 0) {
      this.statusMessage = tuiTheme.error(
        `Missing required settings: ${missingRequired.join(", ")}`,
      );
      this.options.requestRender();
      return;
    }

    try {
      await this.options.onConfigSave(pluginId, this.editingDraft);
      this.statusMessage = `Saved settings for ${this.editingPluginName}.`;
      this.state = "list";
      this.editingPluginId = null;
      this.editingPluginName = "";
      this.editingKeys = [];
      this.editingParamsByKey = {};
      this.editingDraft = {};
      this.editingIndex = 0;
      await this.loadPlugins();
    } catch (err) {
      this.statusMessage = tuiTheme.error(
        `Failed to save: ${err instanceof Error ? err.message : String(err)}`,
      );
      this.options.requestRender();
    }
  }

  private cancelEditing(): void {
    this.state = "list";
    this.editingPluginId = null;
    this.editingPluginName = "";
    this.editingKeys = [];
    this.editingParamsByKey = {};
    this.editingDraft = {};
    this.editingIndex = 0;
    this.statusMessage = "Edit cancelled.";
    this.options.requestRender();
  }

  private toggleValueMask(): void {
    this.showUnmaskedValues = !this.showUnmaskedValues;
    this.options.requestRender();
  }

  private handleEditSelectInput(data: string): void {
    const kb = getEditorKeybindings();

    if (kb.matches(data, "selectCancel")) {
      this.cancelEditing();
      return;
    }

    if (matchesKey(data, "ctrl+u")) {
      this.toggleValueMask();
      return;
    }

    if (data === "a" || data === "A") {
      this.newKeyInput.setValue("");
      this.state = "add-key";
      this.options.requestRender();
      return;
    }

    if (kb.matches(data, "selectUp")) {
      this.editingIndex = Math.max(0, this.editingIndex - 1);
      this.options.requestRender();
      return;
    }

    if (kb.matches(data, "selectDown")) {
      this.editingIndex = Math.min(
        this.editingKeys.length - 1,
        this.editingIndex + 1,
      );
      this.options.requestRender();
      return;
    }

    if (data === "s" || data === "S") {
      void this.saveEditingConfig();
      return;
    }

    if (kb.matches(data, "selectConfirm") && this.editingKeys.length > 0) {
      const key = this.editingKeys[this.editingIndex];
      const currentValue = this.editingDraft[key] ?? "";
      this.valueInput.setValue(currentValue);
      this.state = "edit-value";
      this.options.requestRender();
    }
  }

  private handleAddKeyInput(data: string): void {
    const kb = getEditorKeybindings();

    if (kb.matches(data, "selectCancel")) {
      this.state = "edit-select";
      this.options.requestRender();
      return;
    }

    if (kb.matches(data, "selectConfirm")) {
      const key = this.newKeyInput.getValue().trim();
      if (!key) {
        this.statusMessage = tuiTheme.error("Setting key cannot be empty.");
        this.options.requestRender();
        return;
      }
      if (key in this.editingDraft) {
        this.statusMessage = tuiTheme.error(`Setting "${key}" already exists.`);
        this.options.requestRender();
        return;
      }

      this.editingKeys.push(key);
      this.editingParamsByKey[key] = {
        key,
        label: key,
        value: "",
        required: false,
      };
      this.editingDraft[key] = "";
      this.editingIndex = this.editingKeys.length - 1;
      this.valueInput.setValue("");
      this.state = "edit-value";
      this.statusMessage = "";
      this.options.requestRender();
      return;
    }

    this.newKeyInput.handleInput(data);
    this.options.requestRender();
  }

  private handleEditValueInput(data: string): void {
    const kb = getEditorKeybindings();

    if (kb.matches(data, "selectCancel")) {
      this.state = "edit-select";
      this.options.requestRender();
      return;
    }

    if (matchesKey(data, "ctrl+u")) {
      this.toggleValueMask();
      return;
    }

    if (kb.matches(data, "selectConfirm")) {
      const key = this.editingKeys[this.editingIndex];
      this.editingDraft[key] = this.valueInput.getValue();
      this.state = "edit-select";
      this.options.requestRender();
      return;
    }

    this.valueInput.handleInput(data);
    this.options.requestRender();
  }

  handleInput(data: string): void {
    const kb = getEditorKeybindings();

    if (this.state === "edit-select") {
      this.handleEditSelectInput(data);
      return;
    }

    if (this.state === "add-key") {
      this.handleAddKeyInput(data);
      return;
    }

    if (this.state === "edit-value") {
      this.handleEditValueInput(data);
      return;
    }

    // Navigation keys go to the list
    if (
      kb.matches(data, "selectUp") ||
      kb.matches(data, "selectDown") ||
      kb.matches(data, "selectConfirm") ||
      kb.matches(data, "selectCancel")
    ) {
      this.selectList.handleInput(data);
      return;
    }

    // Space bar toggles the selected plugin
    if (data === " ") {
      const selected = this.selectList.getSelectedItem();
      if (selected) {
        void this.handlePluginSelect(selected.value);
      }
      return;
    }

    // Edit selected plugin settings
    if (data === "e" || data === "E") {
      this.beginEditSelectedPlugin();
      return;
    }

    // Otherwise, it's filter input
    const before = this.filterInput.getValue();
    this.filterInput.handleInput(data);
    const after = this.filterInput.getValue();

    if (after !== before) {
      this.selectList.setFilter(after);
    }
  }

  render(width: number): string[] {
    this.filterInput.focused = this.focused && this.state === "list";

    if (this.loading && this.state === "list") {
      return [tuiTheme.dim("  Loading installed plugins…")];
    }

    if (this.state === "edit-select") {
      return renderEditSelectView({
        editingPluginName: this.editingPluginName,
        editingKeys: this.editingKeys,
        editingIndex: this.editingIndex,
        editingDraft: this.editingDraft,
        editingParamsByKey: this.editingParamsByKey,
        showUnmaskedValues: this.showUnmaskedValues,
      });
    }

    if (this.state === "add-key") {
      return renderAddKeyView({
        width,
        focused: this.focused,
        editingPluginName: this.editingPluginName,
        newKeyInput: this.newKeyInput,
      });
    }

    if (this.state === "edit-value") {
      return renderEditValueView({
        width,
        focused: this.focused,
        editingPluginName: this.editingPluginName,
        editingKeys: this.editingKeys,
        editingIndex: this.editingIndex,
        showUnmaskedValues: this.showUnmaskedValues,
        valueInput: this.valueInput,
      });
    }

    const filterLine = this.filterInput.render(width).map((l) => `  ${l}`);
    const lines: string[] = [...filterLine, ""];

    if (this.statusMessage) {
      lines.push(`  ${this.statusMessage}`);
      lines.push("");
    }

    if (this.allItems.length === 0) {
      lines.push(tuiTheme.dim("  No plugins installed."));
      lines.push(
        tuiTheme.dim("  Use the Store tab to browse and install plugins."),
      );
    } else {
      lines.push(...this.selectList.render(width));
    }

    lines.push("");
    lines.push(
      tuiTheme.dim(
        "  ↑↓ navigate • Enter toggle • Space toggle • e edit settings • type to filter",
      ),
    );

    return lines;
  }

  invalidate(): void {
    this.filterInput.invalidate();
    this.selectList.invalidate();
    this.valueInput.invalidate();
    this.newKeyInput.invalidate();
  }
}
