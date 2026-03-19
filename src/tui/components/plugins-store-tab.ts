import {
  type Component,
  type Focusable,
  getEditorKeybindings,
  Input,
  type SelectItem,
  SelectList,
} from "@mariozechner/pi-tui";
import { tuiTheme } from "../theme.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StorePluginItem {
  name: string;
  description: string;
  latestVersion: string | null;
  stars: number;
  supports: { v0: boolean; v1: boolean; v2: boolean };
  installed: boolean;
}

export interface InstallResult {
  success: boolean;
  message: string;
}

export interface StoreTabOptions {
  searchPlugins: (query: string, limit?: number) => Promise<StorePluginItem[]>;
  getRegistryPlugins: () => Promise<StorePluginItem[]>;
  installPlugin: (name: string) => Promise<InstallResult>;
  isInstalled: (name: string) => boolean;
  onClose: () => void;
  requestRender: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Plugin Store tab — browse and search the remote plugin registry,
 * install plugins directly from the TUI.
 */
export class PluginStoreTab implements Component, Focusable {
  focused = false;

  private searchInput = new Input();
  private selectList: SelectList;
  private allItems: SelectItem[] = [];
  private loading = true;
  private installing: string | null = null;
  private installStatus = "";
  private searchTimeout: ReturnType<typeof setTimeout> | null = null;

  private options: StoreTabOptions;

  constructor(options: StoreTabOptions) {
    this.options = options;

    this.selectList = new SelectList([], 14, tuiTheme.selectList);
    this.selectList.onCancel = () => options.onClose();
    this.selectList.onSelect = (item) => {
      void this.handleSelect(item.value);
    };

    this.searchInput.setValue("");

    // Initial load — top plugins sorted by stars
    void this.loadTopPlugins();
  }

  /** Whether the tab is in an input-consuming state. Always false for store tab. */
  isCapturingInput(): boolean {
    return false;
  }

  private async loadTopPlugins(): Promise<void> {
    this.loading = true;
    this.options.requestRender();
    try {
      const plugins = await this.options.getRegistryPlugins();
      this.updateList(plugins);
    } catch {
      // Fall through with empty list
    } finally {
      this.loading = false;
      this.options.requestRender();
    }
  }

  private updateList(plugins: StorePluginItem[]): void {
    this.allItems = plugins.map((p) => {
      const installedBadge = p.installed
        ? tuiTheme.success(" ✓ installed")
        : "";
      const version = p.latestVersion ? `v${p.latestVersion}` : "";
      const stars = p.stars > 0 ? `★${p.stars}` : "";

      return {
        value: p.name,
        label: `${p.name}${installedBadge}`,
        description: [p.description, version, stars].filter(Boolean).join("  "),
      };
    });

    this.selectList = new SelectList(this.allItems, 14, tuiTheme.selectList);
    this.selectList.onCancel = () => this.options.onClose();
    this.selectList.onSelect = (item) => {
      void this.handleSelect(item.value);
    };
  }

  private async handleSelect(name: string): Promise<void> {
    if (this.installing) return;
    if (this.options.isInstalled(name)) return;

    this.installing = name;
    this.installStatus = "installing…";
    this.options.requestRender();

    try {
      const result = await this.options.installPlugin(name);
      this.installStatus = result.success
        ? tuiTheme.success("✓ installed")
        : tuiTheme.error(`✗ ${result.message}`);
    } catch (err) {
      this.installStatus = tuiTheme.error(
        `✗ ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      this.installing = null;
      this.options.requestRender();
      // Refresh list to update installed badges
      setTimeout(() => {
        void this.loadTopPlugins();
      }, 1500);
    }
  }

  private scheduleSearch(query: string): void {
    if (this.searchTimeout) clearTimeout(this.searchTimeout);
    this.searchTimeout = setTimeout(async () => {
      this.loading = true;
      this.options.requestRender();
      try {
        if (!query.trim()) {
          await this.loadTopPlugins();
          return;
        }
        const results = await this.options.searchPlugins(query);
        this.updateList(results);
      } catch {
        // Fall through
      } finally {
        this.loading = false;
        this.options.requestRender();
      }
    }, 300);
  }

  handleInput(data: string): void {
    const kb = getEditorKeybindings();

    // Navigation goes to list
    if (
      kb.matches(data, "selectUp") ||
      kb.matches(data, "selectDown") ||
      kb.matches(data, "selectConfirm") ||
      kb.matches(data, "selectCancel")
    ) {
      this.selectList.handleInput(data);
      return;
    }

    // Otherwise treat as search input
    const before = this.searchInput.getValue();
    this.searchInput.handleInput(data);
    const after = this.searchInput.getValue();

    if (after !== before) {
      this.scheduleSearch(after);
    }
  }

  render(width: number): string[] {
    this.searchInput.focused = this.focused;

    const searchLine = this.searchInput.render(width).map((l) => `  ${l}`);
    const lines: string[] = [...searchLine, ""];

    if (this.loading) {
      lines.push(tuiTheme.dim("  Loading plugins from registry…"));
      return lines;
    }

    if (this.installing) {
      lines.push(
        `  ${tuiTheme.accent("Installing")} ${this.installing}… ${this.installStatus}`,
      );
      lines.push("");
    } else if (this.installStatus) {
      lines.push(`  ${this.installStatus}`);
      lines.push("");
    }

    if (this.allItems.length === 0) {
      const query = this.searchInput.getValue().trim();
      if (query) {
        lines.push(tuiTheme.dim(`  No plugins match "${query}".`));
      } else {
        lines.push(tuiTheme.dim("  No plugins available."));
      }
    } else {
      lines.push(...this.selectList.render(width));
    }

    lines.push("");
    lines.push(tuiTheme.dim("  ↑↓ navigate • Enter details • type to search"));

    return lines;
  }

  /** Cancel any pending debounced search. */
  dispose(): void {
    if (this.searchTimeout) {
      clearTimeout(this.searchTimeout);
      this.searchTimeout = null;
    }
  }

  invalidate(): void {
    this.searchInput.invalidate();
    this.selectList.invalidate();
  }
}
