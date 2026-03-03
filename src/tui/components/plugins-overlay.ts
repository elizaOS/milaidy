import type { Component, Focusable } from "@mariozechner/pi-tui";
import { getEditorKeybindings } from "@mariozechner/pi-tui";
import {
  addRegistryEndpoint,
  getConfiguredEndpoints,
  isDefaultEndpoint,
  removeRegistryEndpoint,
  toggleRegistryEndpoint,
} from "../../services/registry-client.js";
import { tuiTheme } from "../theme.js";
import { ModalFrame } from "./modal-frame.js";
import { PluginEndpointsTab } from "./plugins-endpoints-tab.js";
import { InstalledPluginsTab } from "./plugins-installed-tab.js";
import {
  PluginsOverlayDataBridge,
  type PluginsOverlayOptions,
} from "./plugins-overlay-data.js";
import { PluginStoreTab } from "./plugins-store-tab.js";

const TAB_NAMES = ["Installed", "Store", "Endpoints"] as const;
type TabIndex = 0 | 1 | 2;

/**
 * Main Plugins overlay with three tabs: Installed, Store, Endpoints.
 * Accessible via `/plugins` or Ctrl+L.
 */
export class PluginsOverlayComponent implements Component, Focusable {
  focused = false;

  private activeTab: TabIndex = 0;
  private tabs: [InstalledPluginsTab, PluginStoreTab, PluginEndpointsTab];
  private frame = new ModalFrame({
    title: "Plugins",
    hint: "↑↓ navigate • Tab switch tabs • Enter select • Esc close",
  });
  private readonly data: PluginsOverlayDataBridge;

  constructor(private readonly options: PluginsOverlayOptions) {
    this.data = new PluginsOverlayDataBridge(options);
    const render = () => options.requestRender();

    const installedTab = new InstalledPluginsTab({
      getPlugins: () => this.data.getInstalledPlugins(),
      onTogglePlugin: async (id, enabled) => {
        await this.data.togglePluginEnabled(id, enabled);
      },
      onConfigSave: async (id, config) => {
        await this.data.savePluginConfig(id, config);
      },
      onClose: () => options.onClose(),
      requestRender: render,
    });

    const storeTab = new PluginStoreTab({
      searchPlugins: async (query, limit) =>
        this.data.searchStore(query, limit),
      getRegistryPlugins: async () => this.data.getStorePlugins(),
      installPlugin: async (name) => this.data.installPlugin(name),
      isInstalled: (name) => this.data.isPluginInstalled(name),
      onClose: () => options.onClose(),
      requestRender: render,
    });

    const endpointsTab = new PluginEndpointsTab({
      getEndpoints: () => getConfiguredEndpoints(),
      addEndpoint: (label, url) => addRegistryEndpoint(label, url),
      removeEndpoint: (url) => removeRegistryEndpoint(url),
      toggleEndpoint: (url, enabled) => toggleRegistryEndpoint(url, enabled),
      isDefaultEndpoint: (url) => isDefaultEndpoint(url),
      onClose: () => options.onClose(),
      requestRender: render,
    });

    this.tabs = [installedTab, storeTab, endpointsTab];
  }

  private switchTab(index: TabIndex): void {
    this.activeTab = index;
    this.options.requestRender();
  }

  handleInput(data: string): void {
    const kb = getEditorKeybindings();
    const tab = this.tabs[this.activeTab];
    tab.focused = this.focused;

    if (tab.isCapturingInput()) {
      tab.handleInput(data);
      return;
    }

    if (kb.matches(data, "selectCancel")) {
      this.options.onClose();
      return;
    }

    if (data === "\t") {
      this.switchTab(((this.activeTab + 1) % 3) as TabIndex);
      return;
    }

    if (data === "1") {
      this.switchTab(0);
      return;
    }
    if (data === "2") {
      this.switchTab(1);
      return;
    }
    if (data === "3") {
      this.switchTab(2);
      return;
    }

    tab.handleInput(data);
  }

  render(width: number): string[] {
    const body: string[] = [];

    const tabBar = TAB_NAMES.map((name, i) => {
      const isActive = i === this.activeTab;
      const num = `${i + 1}`;
      if (isActive) {
        return tuiTheme.accent(`[${num}:${name}]`);
      }
      return tuiTheme.dim(` ${num}:${name} `);
    }).join("  ");
    body.push(` ${tabBar}`);
    body.push("");

    const tab = this.tabs[this.activeTab];
    tab.focused = this.focused;
    body.push(...tab.render(width));

    return this.frame.render(width, body);
  }

  invalidate(): void {
    for (const tab of this.tabs) {
      tab.invalidate();
    }
  }
}

export type { PluginsOverlayOptions } from "./plugins-overlay-data.js";
