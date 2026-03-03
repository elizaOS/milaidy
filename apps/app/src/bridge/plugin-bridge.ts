/**
 * Plugin Bridge
 *
 * This module provides a unified interface to all Milady Capacitor plugins
 * with platform-specific fallbacks and capability detection.
 *
 * When a native plugin is unavailable, it provides graceful degradation
 * to web APIs or stub implementations where possible.
 */

import { Capacitor } from "@capacitor/core";
import type { CameraPlugin as ICameraPlugin } from "@milady/capacitor-camera";
import { Camera as CameraPlugin } from "@milady/capacitor-camera";
import type { CanvasPlugin as ICanvasPlugin } from "@milady/capacitor-canvas";
import { Canvas as CanvasPlugin } from "@milady/capacitor-canvas";
import type { DesktopPlugin as IDesktopPlugin } from "@milady/capacitor-desktop";
import { Desktop as DesktopPlugin } from "@milady/capacitor-desktop";
// Import types
import type { GatewayPlugin as IGatewayPlugin } from "@milady/capacitor-gateway";
// Import all Milady plugins
import { Gateway as GatewayPlugin } from "@milady/capacitor-gateway";
import type { LocationPlugin as ILocationPlugin } from "@milady/capacitor-location";
import { Location as LocationPlugin } from "@milady/capacitor-location";
import type { ScreenCapturePlugin as IScreenCapturePlugin } from "@milady/capacitor-screencapture";
import { ScreenCapture as ScreenCapturePlugin } from "@milady/capacitor-screencapture";
import type { SwabblePlugin as ISwabblePlugin } from "@milady/capacitor-swabble";
import { Swabble as SwabblePlugin } from "@milady/capacitor-swabble";
import type { TalkModePlugin as ITalkModePlugin } from "@milady/capacitor-talkmode";
import { TalkMode as TalkModePlugin } from "@milady/capacitor-talkmode";

// Platform detection
const platform = Capacitor.getPlatform();
const isNative = Capacitor.isNativePlatform();
const isIOS = platform === "ios";
const isAndroid = platform === "android";
const isElectron = platform === "electron";
const isWeb = platform === "web";
const isMacOS = isElectron; // Electron is used for macOS/desktop

/**
 * Plugin capability flags
 */
export interface PluginCapabilities {
  /** Gateway connection and discovery */
  gateway: {
    available: boolean;
    discovery: boolean;
    websocket: boolean;
  };
  /** Voice wake word detection */
  voiceWake: {
    available: boolean;
    continuous: boolean;
  };
  /** Talk mode (STT + chat + TTS) */
  talkMode: {
    available: boolean;
    elevenlabs: boolean;
    systemTts: boolean;
  };
  /** Camera capture */
  camera: {
    available: boolean;
    photo: boolean;
    video: boolean;
  };
  /** Location services */
  location: {
    available: boolean;
    gps: boolean;
    background: boolean;
  };
  /** Screen capture */
  screenCapture: {
    available: boolean;
    screenshot: boolean;
    recording: boolean;
  };
  /** Canvas rendering */
  canvas: {
    available: boolean;
  };
  /** Desktop features (macOS/Electron) */
  desktop: {
    available: boolean;
    tray: boolean;
    shortcuts: boolean;
    menu: boolean;
  };
}

/**
 * Get plugin capabilities for the current platform
 */
export function getPluginCapabilities(): PluginCapabilities {
  return {
    gateway: {
      available: true, // Web fallback available
      discovery: isNative, // Discovery requires native APIs
      websocket: true, // WebSocket available on all platforms
    },
    voiceWake: {
      available: isNative || hasWebSpeechAPI(),
      continuous: isNative, // Only native supports continuous listening
    },
    talkMode: {
      available: isNative || hasWebSpeechAPI(),
      elevenlabs: true, // Web app can call ElevenLabs directly with user API key
      systemTts: isNative || hasWebSpeechSynthesis(),
    },
    camera: {
      available: isNative || hasMediaDevices(),
      photo: isNative || hasMediaDevices(),
      video: isNative || hasMediaDevices(),
    },
    location: {
      available: hasGeolocation(),
      gps: isNative,
      background: isNative && !isElectron,
    },
    screenCapture: {
      available: isNative || hasDisplayMedia(),
      screenshot: isNative,
      recording: isNative || hasDisplayMedia(),
    },
    canvas: {
      available: true, // HTML Canvas available on all platforms
    },
    desktop: {
      available: isElectron,
      tray: isElectron,
      shortcuts: isElectron,
      menu: isElectron,
    },
  };
}

// Web API detection helpers
function hasWebSpeechAPI(): boolean {
  return (
    typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window)
  );
}

function hasWebSpeechSynthesis(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

function hasMediaDevices(): boolean {
  return (
    typeof navigator !== "undefined" &&
    "mediaDevices" in navigator &&
    "getUserMedia" in navigator.mediaDevices
  );
}

function hasGeolocation(): boolean {
  return typeof navigator !== "undefined" && "geolocation" in navigator;
}

function hasDisplayMedia(): boolean {
  return (
    typeof navigator !== "undefined" &&
    "mediaDevices" in navigator &&
    "getDisplayMedia" in navigator.mediaDevices
  );
}

/**
 * Wrapped plugin with fallback behavior
 */
interface WrappedPlugin<T> {
  /** The plugin instance */
  plugin: T;
  /** Whether the native plugin is available */
  isNative: boolean;
  /** Whether the plugin has a web fallback */
  hasFallback: boolean;
}

/**
 * Create a wrapped plugin with error handling
 */
function wrapPlugin<T extends Record<string, unknown>>(
  plugin: T,
  _name: string,
): T {
  return new Proxy(plugin, {
    get(target, prop) {
      const value = target[prop as keyof T];
      if (typeof value === "function") {
        return async (...args: unknown[]) => {
          try {
            return await (
              value as (...args: unknown[]) => Promise<unknown>
            ).apply(target, args);
          } catch (error) {
            console.error(`[Plugin Bridge] ${String(prop)} failed:`, error);
            throw error;
          }
        };
      }
      return value;
    },
  });
}

/**
 * The plugin bridge providing access to all Milady plugins
 */
export interface MiladyPlugins {
  /** Gateway connection plugin */
  gateway: WrappedPlugin<IGatewayPlugin>;
  /** Voice wake word plugin */
  swabble: WrappedPlugin<ISwabblePlugin>;
  /** Talk mode plugin */
  talkMode: WrappedPlugin<ITalkModePlugin>;
  /** Camera plugin */
  camera: WrappedPlugin<ICameraPlugin>;
  /** Location plugin */
  location: WrappedPlugin<ILocationPlugin>;
  /** Screen capture plugin */
  screenCapture: WrappedPlugin<IScreenCapturePlugin>;
  /** Canvas plugin */
  canvas: WrappedPlugin<ICanvasPlugin>;
  /** Desktop plugin (macOS/Electron) */
  desktop: WrappedPlugin<IDesktopPlugin>;
  /** Plugin capabilities */
  capabilities: PluginCapabilities;
}

// Singleton instance
let pluginsInstance: MiladyPlugins | null = null;

/**
 * Initialize and get the plugins interface
 */
export function getPlugins(): MiladyPlugins {
  if (pluginsInstance) {
    return pluginsInstance;
  }

  const capabilities = getPluginCapabilities();

  pluginsInstance = {
    gateway: {
      plugin: wrapPlugin(GatewayPlugin as IGatewayPlugin, "Gateway"),
      isNative: isNative,
      hasFallback: true,
    },
    swabble: {
      plugin: wrapPlugin(SwabblePlugin as ISwabblePlugin, "Swabble"),
      isNative: isNative,
      hasFallback: capabilities.voiceWake.available,
    },
    talkMode: {
      plugin: wrapPlugin(TalkModePlugin as ITalkModePlugin, "TalkMode"),
      isNative: isNative,
      hasFallback: capabilities.talkMode.available,
    },
    camera: {
      plugin: wrapPlugin(CameraPlugin as ICameraPlugin, "Camera"),
      isNative: isNative,
      hasFallback: capabilities.camera.available,
    },
    location: {
      plugin: wrapPlugin(LocationPlugin as ILocationPlugin, "Location"),
      isNative: isNative,
      hasFallback: capabilities.location.available,
    },
    screenCapture: {
      plugin: wrapPlugin(
        ScreenCapturePlugin as IScreenCapturePlugin,
        "ScreenCapture",
      ),
      isNative: isNative,
      hasFallback: capabilities.screenCapture.available,
    },
    canvas: {
      plugin: wrapPlugin(CanvasPlugin as ICanvasPlugin, "Canvas"),
      isNative: isNative,
      hasFallback: true,
    },
    desktop: {
      plugin: wrapPlugin(DesktopPlugin as IDesktopPlugin, "Desktop"),
      isNative: isElectron,
      hasFallback: false,
    },
    capabilities,
  };

  return pluginsInstance;
}

/**
 * Check if a specific plugin feature is available
 */
export function isFeatureAvailable(
  feature:
    | "gatewayDiscovery"
    | "voiceWake"
    | "talkMode"
    | "elevenlabs"
    | "camera"
    | "location"
    | "backgroundLocation"
    | "screenCapture"
    | "desktopTray",
): boolean {
  const caps = getPluginCapabilities();

  switch (feature) {
    case "gatewayDiscovery":
      return caps.gateway.discovery;
    case "voiceWake":
      return caps.voiceWake.available;
    case "talkMode":
      return caps.talkMode.available;
    case "elevenlabs":
      return caps.talkMode.elevenlabs;
    case "camera":
      return caps.camera.available;
    case "location":
      return caps.location.available;
    case "backgroundLocation":
      return caps.location.background;
    case "screenCapture":
      return caps.screenCapture.available;
    case "desktopTray":
      return caps.desktop.tray;
    default:
      return false;
  }
}

// Export platform info
export { platform, isNative, isIOS, isAndroid, isElectron, isWeb, isMacOS };
