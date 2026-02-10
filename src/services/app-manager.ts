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

const DEFAULT_VIEWER_SANDBOX = "allow-scripts allow-same-origin allow-popups";
const HYPERSCAPE_APP_NAME = "@elizaos/app-hyperscape";
const HYPERSCAPE_AUTH_MESSAGE_TYPE = "HYPERSCAPE_AUTH";

export interface AppViewerAuthMessage {
  type: string;
  authToken?: string;
  sessionToken?: string;
  agentId?: string;
}

export interface AppLaunchResult {
  /** The plugin was installed (or was already installed) */
  pluginInstalled: boolean;
  /** Whether the agent needs a restart to load the new plugin */
  needsRestart: boolean;
  /** Display name of the app */
  displayName: string;
  /** App launch type from registry metadata */
  launchType: string;
  /** External launch URL (used by URL-style apps and pop-out fallback) */
  launchUrl: string | null;
  /** Viewer config for the game client iframe */
  viewer: {
    url: string;
    embedParams?: Record<string, string>;
    postMessageAuth?: boolean;
    sandbox?: string;
    authMessage?: AppViewerAuthMessage;
  } | null;
}

export interface InstalledAppInfo {
  name: string;
  displayName: string;
  pluginName: string;
  version: string;
  installedAt: string;
}

export interface AppStopResult {
  success: boolean;
  appName: string;
  stoppedAt: string;
}

type AppViewerConfig = NonNullable<AppLaunchResult["viewer"]>;

function substituteTemplateVars(raw: string): string {
  return raw.replace(/\{([A-Z0-9_]+)\}/g, (_full, key: string) => {
    const value = process.env[key];
    return value && value.trim().length > 0 ? value.trim() : "";
  });
}

function buildViewerUrl(
  baseUrl: string,
  embedParams?: Record<string, string>,
): string {
  if (!embedParams || Object.keys(embedParams).length === 0) {
    return substituteTemplateVars(baseUrl);
  }
  const resolvedBaseUrl = substituteTemplateVars(baseUrl);
  const [beforeHash, hashPartRaw] = resolvedBaseUrl.split("#", 2);
  const [pathPart, queryPartRaw] = beforeHash.split("?", 2);
  const queryParams = new URLSearchParams(queryPartRaw ?? "");
  for (const [key, rawValue] of Object.entries(embedParams)) {
    queryParams.set(key, substituteTemplateVars(rawValue));
  }
  const query = queryParams.toString();
  const hash = hashPartRaw ? `#${hashPartRaw}` : "";
  return `${pathPart}${query.length > 0 ? `?${query}` : ""}${hash}`;
}

function buildViewerAuthMessage(
  appName: string,
  postMessageAuth: boolean | undefined,
): AppViewerAuthMessage | undefined {
  if (!postMessageAuth) return undefined;
  if (appName !== HYPERSCAPE_APP_NAME) return undefined;

  const authToken = process.env.HYPERSCAPE_AUTH_TOKEN?.trim();
  if (!authToken) return undefined;

  const sessionToken = process.env.HYPERSCAPE_SESSION_TOKEN?.trim();
  const agentId = process.env.HYPERSCAPE_EMBED_AGENT_ID?.trim();
  return {
    type: HYPERSCAPE_AUTH_MESSAGE_TYPE,
    authToken,
    sessionToken: sessionToken && sessionToken.length > 0
      ? sessionToken
      : undefined,
    agentId: agentId && agentId.length > 0 ? agentId : undefined,
  };
}

function buildViewerConfig(
  appInfo: RegistryAppInfo,
  launchUrl: string | null,
): AppViewerConfig | null {
  if (appInfo.viewer) {
    const authMessage = buildViewerAuthMessage(
      appInfo.name,
      appInfo.viewer.postMessageAuth,
    );
    if (appInfo.viewer.postMessageAuth && !authMessage) {
      logger.warn(
        `[app-manager] ${appInfo.name} requires postMessage auth but no auth payload was generated.`,
      );
    }
    return {
      url: buildViewerUrl(appInfo.viewer.url, appInfo.viewer.embedParams),
      embedParams: appInfo.viewer.embedParams,
      postMessageAuth: appInfo.viewer.postMessageAuth,
      sandbox: appInfo.viewer.sandbox ?? DEFAULT_VIEWER_SANDBOX,
      authMessage,
    };
  }
  if (
    (appInfo.launchType === "connect" || appInfo.launchType === "local") &&
    launchUrl
  ) {
    return {
      url: launchUrl,
      sandbox: DEFAULT_VIEWER_SANDBOX,
    };
  }
  return null;
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
    const launchUrl = appInfo.launchUrl
      ? substituteTemplateVars(appInfo.launchUrl)
      : null;
    const viewer = buildViewerConfig(appInfo, launchUrl);

    return {
      pluginInstalled: true,
      needsRestart,
      displayName: appInfo.displayName,
      launchType: appInfo.launchType,
      launchUrl,
      viewer,
    };
  }

  async stop(name: string): Promise<AppStopResult> {
    const appInfo = await registryGetAppInfo(name);
    if (!appInfo) {
      throw new Error(`App "${name}" not found in the registry.`);
    }
    return {
      success: true,
      appName: name,
      stoppedAt: new Date().toISOString(),
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
