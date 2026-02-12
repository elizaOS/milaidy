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
import type {
  AppLaunchResult,
  AppStopResult,
  AppViewerAuthMessage,
  InstalledAppInfo,
} from "../contracts/apps.js";
import {
  installPlugin,
  listInstalledPlugins,
  type ProgressCallback,
  uninstallPlugin,
} from "./plugin-installer.js";
import {
  type RegistryAppInfo,
  getAppInfo as registryGetAppInfo,
  listApps as registryListApps,
  searchApps as registrySearchApps,
} from "./registry-client.js";

export type {
  AppLaunchResult,
  AppStopResult,
  AppViewerAuthMessage,
  InstalledAppInfo,
} from "../contracts/apps.js";

const DEFAULT_VIEWER_SANDBOX = "allow-scripts allow-same-origin allow-popups";
const HYPERSCAPE_APP_NAME = "@elizaos/app-hyperscape";
const HYPERSCAPE_AUTH_MESSAGE_TYPE = "HYPERSCAPE_AUTH";
const RS_2004SCAPE_APP_NAME = "@elizaos/app-2004scape";
const RS_2004SCAPE_AUTH_MESSAGE_TYPE = "RS_2004SCAPE_AUTH";

type AppViewerConfig = NonNullable<AppLaunchResult["viewer"]>;

interface ActiveAppSession {
  appName: string;
  pluginName: string;
  launchType: string;
  launchUrl: string | null;
  viewerUrl: string | null;
  startedAt: string;
}

function getTemplateFallbackValue(key: string): string | undefined {
  if (key === "RS_SDK_BOT_NAME") {
    const runtimeBotName = process.env.BOT_NAME?.trim();
    if (runtimeBotName && runtimeBotName.length > 0) {
      return runtimeBotName;
    }
    return "testbot";
  }
  return undefined;
}

function substituteTemplateVars(raw: string): string {
  return raw.replace(/\{([A-Z0-9_]+)\}/g, (_full, key: string) => {
    const value = process.env[key];
    if (value && value.trim().length > 0) {
      return value.trim();
    }
    return getTemplateFallbackValue(key) ?? "";
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

  // Hyperscape auth
  if (appName === HYPERSCAPE_APP_NAME) {
    const authToken = process.env.HYPERSCAPE_AUTH_TOKEN?.trim();
    if (!authToken) return undefined;

    const sessionToken = process.env.HYPERSCAPE_SESSION_TOKEN?.trim();
    const agentId = process.env.HYPERSCAPE_EMBED_AGENT_ID?.trim();
    return {
      type: HYPERSCAPE_AUTH_MESSAGE_TYPE,
      authToken,
      sessionToken:
        sessionToken && sessionToken.length > 0 ? sessionToken : undefined,
      agentId: agentId && agentId.length > 0 ? agentId : undefined,
    };
  }

  // 2004scape auth - uses bot name and password from environment
  if (appName === RS_2004SCAPE_APP_NAME) {
    // Get username from RS_SDK_BOT_NAME or BOT_NAME, fallback to testbot
    const username =
      process.env.RS_SDK_BOT_NAME?.trim() ||
      process.env.BOT_NAME?.trim() ||
      "testbot";
    // Get password from RS_SDK_BOT_PASSWORD or BOT_PASSWORD
    const password =
      process.env.RS_SDK_BOT_PASSWORD?.trim() ||
      process.env.BOT_PASSWORD?.trim() ||
      "";

    return {
      type: RS_2004SCAPE_AUTH_MESSAGE_TYPE,
      authToken: username, // Using authToken field for username
      sessionToken: password, // Using sessionToken field for password
    };
  }

  return undefined;
}

function buildViewerConfig(
  appInfo: RegistryAppInfo,
  launchUrl: string | null,
): AppViewerConfig | null {
  if (appInfo.viewer) {
    const requestedPostMessageAuth = Boolean(appInfo.viewer.postMessageAuth);
    const authMessage = buildViewerAuthMessage(
      appInfo.name,
      requestedPostMessageAuth,
    );
    const postMessageAuth = requestedPostMessageAuth && Boolean(authMessage);
    if (requestedPostMessageAuth && !authMessage) {
      if (appInfo.name === HYPERSCAPE_APP_NAME) {
        logger.info(
          `[app-manager] ${appInfo.name} auth token not configured; launching embedded viewer without postMessage auth.`,
        );
      } else {
        logger.warn(
          `[app-manager] ${appInfo.name} requires postMessage auth but no auth payload was generated.`,
        );
      }
    }
    return {
      url: buildViewerUrl(appInfo.viewer.url, appInfo.viewer.embedParams),
      embedParams: appInfo.viewer.embedParams,
      postMessageAuth,
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
  private readonly activeSessions = new Map<string, ActiveAppSession>();

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
    this.activeSessions.set(name, {
      appName: name,
      pluginName,
      launchType: appInfo.launchType,
      launchUrl,
      viewerUrl: viewer?.url ?? null,
      startedAt: new Date().toISOString(),
    });

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

    const hadSession = this.activeSessions.delete(name);
    const pluginName = appInfo.name;
    const installed = listInstalledPlugins();
    const isPluginInstalled = installed.some(
      (plugin) => plugin.name === pluginName,
    );
    if (!hadSession && !isPluginInstalled) {
      return {
        success: false,
        appName: name,
        stoppedAt: new Date().toISOString(),
        pluginUninstalled: false,
        needsRestart: false,
        stopScope: "no-op",
        message: `No active session or installed plugin found for "${name}".`,
      };
    }

    if (isPluginInstalled) {
      const uninstallResult = await uninstallPlugin(pluginName);
      if (!uninstallResult.success) {
        throw new Error(
          `Failed to stop "${name}": ${uninstallResult.error ?? "plugin uninstall failed"}`,
        );
      }
      return {
        success: true,
        appName: name,
        stoppedAt: new Date().toISOString(),
        pluginUninstalled: true,
        needsRestart: uninstallResult.requiresRestart,
        stopScope: "plugin-uninstalled",
        message: uninstallResult.requiresRestart
          ? `${name} disconnected and plugin uninstalled. Agent restart required.`
          : `${name} disconnected and plugin uninstalled.`,
      };
    }

    return {
      success: true,
      appName: name,
      stoppedAt: new Date().toISOString(),
      pluginUninstalled: false,
      needsRestart: false,
      stopScope: "viewer-session",
      message: `${name} viewer session stopped.`,
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
