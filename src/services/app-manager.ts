/**
 * App Manager — manages app lifecycle: discover, install plugin, show viewer.
 *
 * Apps are hosted services. The manager's job is:
 * 1. List/search apps from the registry
 * 2. Install the game's plugin onto the agent (triggers restart)
 * 3. Return the viewer URL so the UI can embed the game client in an iframe
 *
 * @module services/app-manager
 */

import { logger } from "@elizaos/core";
import {
  installPlugin,
  listInstalledPlugins,
  type ProgressCallback,
} from "./plugin-installer.js";
import {
  type RegistryAppInfo,
  getAppInfo as registryGetAppInfo,
  listApps as registryListApps,
  searchApps as registrySearchApps,
} from "./registry-client.js";

export interface AppLaunchResult {
  /** The plugin was installed (or was already installed) */
  pluginInstalled: boolean;
  /** Whether the agent needs a restart to load the new plugin */
  needsRestart: boolean;
  /** Display name of the app */
  displayName: string;
  /** Viewer config for the game client iframe */
  viewer: {
    url: string;
    embedParams?: Record<string, string>;
    postMessageAuth?: boolean;
    sandbox?: string;
  } | null;
}

export interface InstalledAppInfo {
  name: string;
  displayName: string;
  pluginName: string;
  version: string;
  installedAt: string;
}

export class AppManager {
  async listAvailable(): Promise<RegistryAppInfo[]> {
    return registryListApps();
  }

  async search(query: string, limit = 15): Promise<RegistryAppInfo[]> {
    return registrySearchApps(query, limit);
  }

  async getInfo(name: string): Promise<RegistryAppInfo | null> {
    return registryGetAppInfo(name);
  }

  /**
   * Launch an app: install its plugin (if needed) and return the viewer URL.
   *
   * The plugin connects the agent to the game server. The viewer URL is what
   * the UI shows in an iframe so the user can watch the agent play.
   *
   * After installing a new plugin, the agent needs to restart. The UI should
   * handle this by showing "connecting..." while the runtime restarts.
   */
  async launch(
    name: string,
    onProgress?: ProgressCallback,
  ): Promise<AppLaunchResult> {
    const appInfo = await registryGetAppInfo(name);
    if (!appInfo) {
      throw new Error(`App "${name}" not found in the registry.`);
    }

    // The app's plugin is what the agent needs to play the game.
    // It's the same npm package name as the app, or a separate plugin ref.
    const pluginName = appInfo.name;

    // Check if the plugin is already installed
    const installed = listInstalledPlugins();
    const alreadyInstalled = installed.some((p) => p.name === pluginName);

    let needsRestart = false;

    if (!alreadyInstalled) {
      logger.info(`[app-manager] Installing plugin for app: ${pluginName}`);
      const result = await installPlugin(pluginName, onProgress);
      if (!result.success) {
        throw new Error(
          `Failed to install plugin "${pluginName}": ${result.error}`,
        );
      }
      needsRestart = result.requiresRestart;
      logger.info(
        `[app-manager] Plugin installed: ${pluginName} v${result.version}`,
      );
    } else {
      logger.info(`[app-manager] Plugin already installed: ${pluginName}`);
    }

    // Build viewer config from registry app metadata
    const viewer = appInfo.viewer
      ? {
          url: appInfo.viewer.url,
          embedParams: appInfo.viewer.embedParams,
          postMessageAuth: appInfo.viewer.postMessageAuth,
          sandbox: appInfo.viewer.sandbox,
        }
      : null;

    return {
      pluginInstalled: true,
      needsRestart,
      displayName: appInfo.displayName,
      viewer,
    };
  }

  /** List apps whose plugins are currently installed on the agent. */
  listInstalled(): InstalledAppInfo[] {
    const installed = listInstalledPlugins();
    // For now, any installed plugin that has app metadata in the registry is an "installed app"
    // This is a sync check against the local config, not a registry fetch
    return installed.map((p) => ({
      name: p.name,
      displayName: p.name
        .replace(/^@elizaos\/(app-|plugin-)/, "")
        .replace(/-/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase()),
      pluginName: p.name,
      version: p.version,
      installedAt: p.installedAt,
    }));
  }
}
