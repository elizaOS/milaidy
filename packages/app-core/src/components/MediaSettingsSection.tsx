/**
 * MediaSettingsSection — provider selection + config for media generation.
 *
 * Follows the TTS pattern from CharacterView:
 *   - "cloud" vs "own-key" mode toggle
 *   - Provider button grid
 *   - Conditional API key inputs
 *   - Status badges (Configured / Needs Setup)
 */

import { Button, Input } from "@miladyai/ui";
import { useCallback, useEffect, useState } from "react";
import {
  type AudioGenProvider,
  client,
  type ImageProvider,
  type MediaConfig,
  type MediaMode,
  type VideoProvider,
  type VisionProvider,
} from "../api";
import { invokeDesktopBridgeRequest, isElectrobunRuntime } from "../bridge";
import { useTimeout } from "../hooks";
import { useApp } from "../state";
import type { DesktopClickAuditItem } from "../utils";
import {
  CloudConnectionStatus,
  CloudSourceModeToggle,
} from "./CloudSourceControls";
import { ConfigSaveFooter } from "./ConfigSaveFooter";

type MediaCategory = "image" | "video" | "audio" | "vision";

export const DESKTOP_MEDIA_CLICK_AUDIT: readonly DesktopClickAuditItem[] = [
  {
    id: "media-refresh-native",
    entryPoint: "settings:media",
    label: "Refresh Native Media",
    expectedAction:
      "Refresh camera devices, permissions, screen sources, and recording state.",
    runtimeRequirement: "desktop",
    coverage: "automated",
  },
  {
    id: "media-camera-preview",
    entryPoint: "settings:media",
    label: "Start/Stop Camera Preview",
    expectedAction: "Start or stop the native camera preview.",
    runtimeRequirement: "desktop",
    coverage: "automated",
  },
  {
    id: "media-camera-capture",
    entryPoint: "settings:media",
    label: "Capture Photo",
    expectedAction: "Capture a still photo from the native camera surface.",
    runtimeRequirement: "desktop",
    coverage: "automated",
  },
  {
    id: "media-camera-recording",
    entryPoint: "settings:media",
    label: "Start/Stop Camera Recording",
    expectedAction: "Start or stop native camera recording.",
    runtimeRequirement: "desktop",
    coverage: "automated",
  },
  {
    id: "media-screen-screenshot",
    entryPoint: "settings:media",
    label: "Take Screenshot",
    expectedAction:
      "Capture and save a screenshot using the native screen capture API.",
    runtimeRequirement: "desktop",
    coverage: "automated",
  },
  {
    id: "media-screen-recording",
    entryPoint: "settings:media",
    label: "Start/Stop Screen Recording",
    expectedAction: "Start or stop native screen recording.",
    runtimeRequirement: "desktop",
    coverage: "automated",
  },
] as const;

interface ProviderOption {
  id: string;
  label: string;
  hint: string;
}

const IMAGE_PROVIDERS: ProviderOption[] = [
  {
    id: "cloud",
    label: "Eliza Cloud",
    hint: "elizaclouddashboard.NoSetupNeeded",
  },
  {
    id: "fal",
    label: "FAL.ai",
    hint: "mediasettingssection.ProviderHintFalImage",
  },
  {
    id: "openai",
    label: "OpenAI",
    hint: "mediasettingssection.DALLE3",
  },
  {
    id: "google",
    label: "Google",
    hint: "mediasettingssection.ProviderHintGoogleImage",
  },
  {
    id: "xai",
    label: "xAI",
    hint: "mediasettingssection.ProviderHintXAIAurora",
  },
];

const VIDEO_PROVIDERS: ProviderOption[] = [
  {
    id: "cloud",
    label: "Eliza Cloud",
    hint: "elizaclouddashboard.NoSetupNeeded",
  },
  {
    id: "fal",
    label: "FAL.ai",
    hint: "mediasettingssection.ProviderHintFalVideo",
  },
  {
    id: "openai",
    label: "OpenAI",
    hint: "mediasettingssection.ProviderHintOpenAIVideo",
  },
  {
    id: "google",
    label: "Google",
    hint: "mediasettingssection.ProviderHintGoogleVideo",
  },
];

const AUDIO_PROVIDERS: ProviderOption[] = [
  {
    id: "cloud",
    label: "Eliza Cloud",
    hint: "elizaclouddashboard.NoSetupNeeded",
  },
  { id: "suno", label: "Suno", hint: "mediasettingssection.ProviderHintSuno" },
  {
    id: "elevenlabs",
    label: "ElevenLabs",
    hint: "mediasettingssection.ProviderHintElevenLabs",
  },
];

const VISION_PROVIDERS: ProviderOption[] = [
  {
    id: "cloud",
    label: "Eliza Cloud",
    hint: "elizaclouddashboard.NoSetupNeeded",
  },
  {
    id: "openai",
    label: "OpenAI",
    hint: "mediasettingssection.ProviderHintOpenAIVision",
  },
  {
    id: "google",
    label: "Google",
    hint: "mediasettingssection.ProviderHintGoogleVision",
  },
  {
    id: "anthropic",
    label: "Anthropic",
    hint: "mediasettingssection.ProviderHintAnthropicVision",
  },
  {
    id: "xai",
    label: "xAI",
    hint: "mediasettingssection.ProviderHintXAIVision",
  },
];

const CATEGORY_LABELS: Record<MediaCategory, string> = {
  image: "mediasettingssection.ImageGeneration",
  video: "mediasettingssection.VideoGeneration",
  audio: "mediasettingssection.AudioMusic",
  vision: "mediasettingssection.VisionAnalysis",
};

function getProvidersForCategory(category: MediaCategory): ProviderOption[] {
  switch (category) {
    case "image":
      return IMAGE_PROVIDERS;
    case "video":
      return VIDEO_PROVIDERS;
    case "audio":
      return AUDIO_PROVIDERS;
    case "vision":
      return VISION_PROVIDERS;
  }
}

function getApiKeyField(
  category: MediaCategory,
  provider: string,
): { path: string; labelKey: string } | null {
  if (provider === "cloud") return null;

  switch (category) {
    case "image":
    case "video":
      if (provider === "fal")
        return {
          path: `${category}.fal.apiKey`,
          labelKey: "mediasettingssection.FalApiKey",
        };
      if (provider === "openai")
        return {
          path: `${category}.openai.apiKey`,
          labelKey: "mediasettingssection.OpenAIApiKey",
        };
      if (provider === "google")
        return {
          path: `${category}.google.apiKey`,
          labelKey: "mediasettingssection.GoogleApiKey",
        };
      if (provider === "xai")
        return {
          path: `${category}.xai.apiKey`,
          labelKey: "mediasettingssection.XAIApiKey",
        };
      break;
    case "audio":
      if (provider === "suno")
        return {
          path: "audio.suno.apiKey",
          labelKey: "mediasettingssection.SunoApiKey",
        };
      if (provider === "elevenlabs")
        return {
          path: "audio.elevenlabs.apiKey",
          labelKey: "voiceconfigview.ElevenLabsAPIKey",
        };
      break;
    case "vision":
      if (provider === "openai")
        return {
          path: "vision.openai.apiKey",
          labelKey: "mediasettingssection.OpenAIApiKey",
        };
      if (provider === "google")
        return {
          path: "vision.google.apiKey",
          labelKey: "mediasettingssection.GoogleApiKey",
        };
      if (provider === "anthropic")
        return {
          path: "vision.anthropic.apiKey",
          labelKey: "mediasettingssection.AnthropicApiKey",
        };
      if (provider === "xai")
        return {
          path: "vision.xai.apiKey",
          labelKey: "mediasettingssection.XAIApiKey",
        };
      break;
  }
  return null;
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function setNestedValue(
  obj: Record<string, unknown>,
  path: string,
  value: unknown,
): Record<string, unknown> {
  const parts = path.split(".");
  const result = structuredClone(obj);
  let current = result;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (current[part] == null || typeof current[part] !== "object") {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }
  current[parts[parts.length - 1]] = value;
  return result;
}

export function DesktopMediaControlPanel() {
  const desktopRuntime = isElectrobunRuntime();
  const [loading, setLoading] = useState(desktopRuntime);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [cameraDevices, setCameraDevices] = useState<
    Array<{ deviceId: string; label: string }>
  >([]);
  const [cameraPermission, setCameraPermission] = useState("unknown");
  const [cameraPreviewRunning, setCameraPreviewRunning] = useState(false);
  const [cameraRecording, setCameraRecording] = useState(false);
  const [cameraRecordingDuration, setCameraRecordingDuration] = useState(0);
  const [selectedCameraId, setSelectedCameraId] = useState("");
  const [screenSources, setScreenSources] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [selectedSourceId, setSelectedSourceId] = useState("");
  const [screenPermission, setScreenPermission] = useState("unknown");
  const [screenRecording, setScreenRecording] = useState(false);
  const [screenPaused, setScreenPaused] = useState(false);
  const [screenRecordingDuration, setScreenRecordingDuration] = useState(0);
  const [lastSavedPath, setLastSavedPath] = useState<string | null>(null);
  const [lastPhotoStatus, setLastPhotoStatus] = useState(
    "No photo captured yet.",
  );

  const refresh = useCallback(async () => {
    if (!desktopRuntime) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    const [
      devicesResult,
      cameraPermissionResult,
      cameraRecordingState,
      sourcesResult,
      screenPermissionResult,
      screenRecordingState,
    ] = await Promise.all([
      invokeDesktopBridgeRequest<{
        devices: Array<{ deviceId: string; label: string }>;
        available: boolean;
      }>({
        rpcMethod: "cameraGetDevices",
        ipcChannel: "camera:getDevices",
      }),
      invokeDesktopBridgeRequest<{ status: string }>({
        rpcMethod: "cameraCheckPermissions",
        ipcChannel: "camera:checkPermissions",
      }),
      invokeDesktopBridgeRequest<{ recording: boolean; duration: number }>({
        rpcMethod: "cameraGetRecordingState",
        ipcChannel: "camera:getRecordingState",
      }),
      invokeDesktopBridgeRequest<{
        sources: Array<{ id: string; name: string }>;
        available: boolean;
      }>({
        rpcMethod: "screencaptureGetSources",
        ipcChannel: "screencapture:getSources",
      }),
      invokeDesktopBridgeRequest<{ status: string }>({
        rpcMethod: "permissionsCheck",
        ipcChannel: "permissions:check",
        params: { id: "screen-recording" },
      }),
      invokeDesktopBridgeRequest<{
        recording: boolean;
        duration: number;
        paused: boolean;
      }>({
        rpcMethod: "screencaptureGetRecordingState",
        ipcChannel: "screencapture:getRecordingState",
      }),
    ]);

    const nextDevices = devicesResult?.devices ?? [];
    const nextSources = sourcesResult?.sources ?? [];

    setCameraDevices(nextDevices);
    setSelectedCameraId((current) => current || nextDevices[0]?.deviceId || "");
    setCameraPermission(cameraPermissionResult?.status ?? "unknown");
    setCameraRecording(cameraRecordingState?.recording ?? false);
    setCameraRecordingDuration(cameraRecordingState?.duration ?? 0);
    setScreenSources(nextSources);
    setSelectedSourceId((current) => current || nextSources[0]?.id || "");
    setScreenPermission(screenPermissionResult?.status ?? "unknown");
    setScreenRecording(screenRecordingState?.recording ?? false);
    setScreenPaused(screenRecordingState?.paused ?? false);
    setScreenRecordingDuration(screenRecordingState?.duration ?? 0);
    setLoading(false);
  }, [desktopRuntime]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const runAction = useCallback(
    async (
      id: string,
      action: () => Promise<void>,
      successMessage?: string,
      refreshAfter = true,
    ) => {
      setBusyAction(id);
      setError(null);
      setMessage(null);
      try {
        await action();
        if (refreshAfter) {
          await refresh();
        }
        if (successMessage) {
          setMessage(successMessage);
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Native media action failed.",
        );
      } finally {
        setBusyAction(null);
      }
    },
    [refresh],
  );

  if (!desktopRuntime) {
    return (
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-muted)] px-3 py-3 text-xs text-[var(--muted)]">
        Native camera and screen capture controls are only available inside the
        Electrobun runtime.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-muted)] px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold text-[var(--text)]">
            Native Capture Controls
          </div>
          <div className="text-[10px] text-[var(--muted)]">
            Camera preview, capture, recording, and screencapture tools owned by
            the desktop runtime.
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            void runAction(
              "media-refresh-native",
              async () => {},
              "Native media state refreshed.",
            )
          }
          disabled={loading || busyAction === "media-refresh-native"}
        >
          Refresh
        </Button>
      </div>

      {(error || message) && (
        <div
          className={`rounded-lg border px-2.5 py-2 text-[11px] ${
            error
              ? "border-danger/40 bg-danger/10 text-danger"
              : "border-ok/40 bg-ok/10 text-ok"
          }`}
        >
          {error ?? message}
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-3">
          <div className="text-xs font-semibold text-[var(--text)]">Camera</div>
          <div className="text-[10px] text-[var(--muted)]">
            Permission: {cameraPermission} · Recording:{" "}
            {cameraRecording ? "on" : "off"} · Duration:{" "}
            {cameraRecordingDuration}s
          </div>
          <select
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2.5 py-1.5 text-xs"
            value={selectedCameraId}
            onChange={(event) => setSelectedCameraId(event.target.value)}
          >
            {cameraDevices.length === 0 ? (
              <option value="">No camera devices</option>
            ) : (
              cameraDevices.map((device) => (
                <option key={device.deviceId} value={device.deviceId}>
                  {device.label || device.deviceId}
                </option>
              ))
            )}
          </select>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                void runAction(
                  "media-camera-permission",
                  async () => {
                    await invokeDesktopBridgeRequest<{ status: string }>({
                      rpcMethod: "cameraRequestPermissions",
                      ipcChannel: "camera:requestPermissions",
                    });
                  },
                  "Camera permission request sent.",
                )
              }
              disabled={busyAction === "media-camera-permission"}
            >
              Request Camera Permission
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                void runAction(
                  "media-camera-preview",
                  async () => {
                    if (cameraPreviewRunning) {
                      await invokeDesktopBridgeRequest<void>({
                        rpcMethod: "cameraStopPreview",
                        ipcChannel: "camera:stopPreview",
                      });
                      setCameraPreviewRunning(false);
                      return;
                    }

                    const result = await invokeDesktopBridgeRequest<{
                      available: boolean;
                      reason?: string;
                    }>({
                      rpcMethod: "cameraStartPreview",
                      ipcChannel: "camera:startPreview",
                      params: selectedCameraId
                        ? { deviceId: selectedCameraId }
                        : {},
                    });
                    if (result?.available === false) {
                      throw new Error(
                        result.reason || "Camera preview unavailable.",
                      );
                    }
                    setCameraPreviewRunning(true);
                  },
                  cameraPreviewRunning
                    ? "Camera preview stopped."
                    : "Camera preview started.",
                  false,
                )
              }
              disabled={busyAction === "media-camera-preview"}
            >
              {cameraPreviewRunning ? "Stop Preview" : "Start Preview"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                void runAction(
                  "media-camera-switch",
                  async () => {
                    if (!selectedCameraId) {
                      throw new Error("Select a camera device first.");
                    }
                    await invokeDesktopBridgeRequest<{ available: boolean }>({
                      rpcMethod: "cameraSwitchCamera",
                      ipcChannel: "camera:switchCamera",
                      params: { deviceId: selectedCameraId },
                    });
                  },
                  "Camera switched.",
                )
              }
              disabled={
                !selectedCameraId || busyAction === "media-camera-switch"
              }
            >
              Switch Camera
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                void runAction(
                  "media-camera-capture",
                  async () => {
                    const result = await invokeDesktopBridgeRequest<{
                      available: boolean;
                      data?: string;
                    }>({
                      rpcMethod: "cameraCapturePhoto",
                      ipcChannel: "camera:capturePhoto",
                    });
                    if (result?.available === false) {
                      throw new Error("Photo capture unavailable.");
                    }
                    setLastPhotoStatus(
                      result?.data
                        ? "Photo captured in memory."
                        : "Photo capture completed.",
                    );
                  },
                  "Photo capture requested.",
                  false,
                )
              }
              disabled={busyAction === "media-camera-capture"}
            >
              Capture Photo
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                void runAction(
                  "media-camera-recording",
                  async () => {
                    if (cameraRecording) {
                      const result = await invokeDesktopBridgeRequest<{
                        available: boolean;
                        path?: string;
                      }>({
                        rpcMethod: "cameraStopRecording",
                        ipcChannel: "camera:stopRecording",
                      });
                      setLastSavedPath(result?.path ?? null);
                      return;
                    }

                    const result = await invokeDesktopBridgeRequest<{
                      available: boolean;
                    }>({
                      rpcMethod: "cameraStartRecording",
                      ipcChannel: "camera:startRecording",
                    });
                    if (result?.available === false) {
                      throw new Error("Camera recording unavailable.");
                    }
                  },
                  cameraRecording
                    ? "Camera recording stopped."
                    : "Camera recording started.",
                )
              }
              disabled={busyAction === "media-camera-recording"}
            >
              {cameraRecording
                ? "Stop Camera Recording"
                : "Start Camera Recording"}
            </Button>
          </div>
          <div className="text-[11px] text-[var(--muted)]">
            {lastPhotoStatus}
          </div>
        </div>

        <div className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-3">
          <div className="text-xs font-semibold text-[var(--text)]">
            Screen Capture
          </div>
          <div className="text-[10px] text-[var(--muted)]">
            Permission: {screenPermission} · Recording:{" "}
            {screenRecording ? "on" : "off"} · Duration:{" "}
            {screenRecordingDuration}s{screenPaused ? " · paused" : ""}
          </div>
          <select
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2.5 py-1.5 text-xs"
            value={selectedSourceId}
            onChange={(event) => setSelectedSourceId(event.target.value)}
          >
            {screenSources.length === 0 ? (
              <option value="">No screen sources</option>
            ) : (
              screenSources.map((source) => (
                <option key={source.id} value={source.id}>
                  {source.name}
                </option>
              ))
            )}
          </select>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                void runAction(
                  "media-screen-open-settings",
                  async () => {
                    await invokeDesktopBridgeRequest<void>({
                      rpcMethod: "permissionsOpenSettings",
                      ipcChannel: "permissions:openSettings",
                      params: { id: "screen-recording" },
                    });
                  },
                  "Opened screen recording settings.",
                  false,
                )
              }
              disabled={busyAction === "media-screen-open-settings"}
            >
              Open Screen Permission Settings
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                void runAction(
                  "media-screen-switch-source",
                  async () => {
                    if (!selectedSourceId) {
                      throw new Error("Select a screen source first.");
                    }
                    await invokeDesktopBridgeRequest<{ available: boolean }>({
                      rpcMethod: "screencaptureSwitchSource",
                      ipcChannel: "screencapture:switchSource",
                      params: { sourceId: selectedSourceId },
                    });
                  },
                  "Screen source switched.",
                )
              }
              disabled={
                !selectedSourceId || busyAction === "media-screen-switch-source"
              }
            >
              Switch Source
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                void runAction(
                  "media-screen-screenshot",
                  async () => {
                    const screenshot = await invokeDesktopBridgeRequest<{
                      available: boolean;
                      data?: string;
                    }>({
                      rpcMethod: "screencaptureTakeScreenshot",
                      ipcChannel: "screencapture:takeScreenshot",
                    });
                    if (screenshot?.available === false || !screenshot?.data) {
                      throw new Error("Screenshot unavailable.");
                    }
                    const saved = await invokeDesktopBridgeRequest<{
                      available: boolean;
                      path?: string;
                    }>({
                      rpcMethod: "screencaptureSaveScreenshot",
                      ipcChannel: "screencapture:saveScreenshot",
                      params: {
                        data: screenshot.data,
                        filename: "milady-desktop-screenshot.png",
                      },
                    });
                    setLastSavedPath(saved?.path ?? null);
                  },
                  "Screenshot captured and saved.",
                  false,
                )
              }
              disabled={busyAction === "media-screen-screenshot"}
            >
              Take Screenshot
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                void runAction(
                  "media-screen-recording",
                  async () => {
                    if (screenRecording) {
                      const stopped = await invokeDesktopBridgeRequest<{
                        available: boolean;
                        path?: string;
                      }>({
                        rpcMethod: "screencaptureStopRecording",
                        ipcChannel: "screencapture:stopRecording",
                      });
                      setLastSavedPath(stopped?.path ?? null);
                      return;
                    }

                    const started = await invokeDesktopBridgeRequest<{
                      available: boolean;
                      reason?: string;
                    }>({
                      rpcMethod: "screencaptureStartRecording",
                      ipcChannel: "screencapture:startRecording",
                    });
                    if (started?.available === false) {
                      throw new Error(
                        started.reason || "Screen recording unavailable.",
                      );
                    }
                  },
                  screenRecording
                    ? "Screen recording stopped."
                    : "Screen recording started.",
                )
              }
              disabled={busyAction === "media-screen-recording"}
            >
              {screenRecording
                ? "Stop Screen Recording"
                : "Start Screen Recording"}
            </Button>
            {screenRecording && (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  void runAction(
                    "media-screen-pause-toggle",
                    async () => {
                      await invokeDesktopBridgeRequest<{ available: boolean }>({
                        rpcMethod: screenPaused
                          ? "screencaptureResumeRecording"
                          : "screencapturePauseRecording",
                        ipcChannel: screenPaused
                          ? "screencapture:resumeRecording"
                          : "screencapture:pauseRecording",
                      });
                    },
                    screenPaused
                      ? "Screen recording resumed."
                      : "Screen recording paused.",
                  )
                }
                disabled={busyAction === "media-screen-pause-toggle"}
              >
                {screenPaused ? "Resume Recording" : "Pause Recording"}
              </Button>
            )}
            {lastSavedPath && (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  void runAction(
                    "media-open-saved-path",
                    async () => {
                      await invokeDesktopBridgeRequest<void>({
                        rpcMethod: "desktopOpenPath",
                        ipcChannel: "desktop:openPath",
                        params: { path: lastSavedPath },
                      });
                    },
                    "Opened saved capture.",
                    false,
                  )
                }
                disabled={busyAction === "media-open-saved-path"}
              >
                Open Saved Capture
              </Button>
            )}
          </div>
          <div className="text-[11px] text-[var(--muted)] break-all">
            {lastSavedPath
              ? `Last saved path: ${lastSavedPath}`
              : "No saved capture path yet."}
          </div>
        </div>
      </div>
    </div>
  );
}

export function MediaSettingsSection() {
  const { setTimeout } = useTimeout();

  const { t } = useApp();
  const { elizaCloudConnected } = useApp();
  const [mediaConfig, setMediaConfig] = useState<MediaConfig>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<MediaCategory>("image");
  const [dirty, setDirty] = useState(false);

  // Load config on mount
  useEffect(() => {
    void (async () => {
      setLoading(true);
      const cfg = await client.getConfig();
      setMediaConfig((cfg.media as MediaConfig) ?? {});
      setLoading(false);
    })();
  }, []);

  // Get current category config
  const getCategoryConfig = useCallback(
    (category: MediaCategory) => {
      return (mediaConfig[category] ?? {}) as Record<string, unknown>;
    },
    [mediaConfig],
  );

  // Get mode for category
  const getMode = useCallback(
    (category: MediaCategory): MediaMode => {
      const cfg = getCategoryConfig(category);
      return (cfg.mode as MediaMode) ?? "cloud";
    },
    [getCategoryConfig],
  );

  // Get provider for category
  const getProvider = useCallback(
    (category: MediaCategory): string => {
      const cfg = getCategoryConfig(category);
      return (cfg.provider as string) ?? "cloud";
    },
    [getCategoryConfig],
  );

  // Update category config
  const updateCategoryConfig = useCallback(
    (category: MediaCategory, updates: Record<string, unknown>) => {
      setMediaConfig((prev) => ({
        ...prev,
        [category]: {
          ...(prev[category] ?? {}),
          ...updates,
        },
      }));
      setDirty(true);
    },
    [],
  );

  // Update nested value in config
  const updateNestedValue = useCallback((path: string, value: unknown) => {
    setMediaConfig(
      (prev) =>
        setNestedValue(
          prev as Record<string, unknown>,
          path,
          value,
        ) as MediaConfig,
    );
    setDirty(true);
  }, []);

  // Save handler
  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    await client.updateConfig({ media: mediaConfig });
    setSaveSuccess(true);
    setDirty(false);
    setTimeout(() => setSaveSuccess(false), 2500);
    setSaving(false);
  }, [mediaConfig, setTimeout]);

  // Check if provider is configured
  const isProviderConfigured = useCallback(
    (category: MediaCategory): boolean => {
      const mode = getMode(category);
      if (mode === "cloud") return elizaCloudConnected;

      const provider = getProvider(category);
      const apiKeyField = getApiKeyField(category, provider);
      if (!apiKeyField) return true;

      const value = getNestedValue(
        mediaConfig as Record<string, unknown>,
        apiKeyField.path,
      );
      return typeof value === "string" && value.length > 0;
    },
    [getMode, getProvider, mediaConfig, elizaCloudConnected],
  );

  if (loading) {
    return (
      <div className="py-8 text-center text-[var(--muted)] text-xs">
        {t("mediasettingssection.LoadingMediaConfig")}
      </div>
    );
  }

  const currentMode = getMode(activeTab);
  const currentProvider = getProvider(activeTab);
  const providers = getProvidersForCategory(activeTab);
  const apiKeyField = getApiKeyField(activeTab, currentProvider);
  const configured = isProviderConfigured(activeTab);

  return (
    <div className="flex flex-col gap-4">
      {/* Category tabs */}
      <div className="flex gap-1 rounded-xl border border-border bg-card/50 p-1 shrink-0">
        {(["image", "video", "audio", "vision"] as MediaCategory[]).map(
          (cat) => {
            const active = activeTab === cat;
            const catConfigured = isProviderConfigured(cat);
            return (
              <Button
                key={cat}
                variant={active ? "default" : "ghost"}
                size="sm"
                className={`flex-1 h-9 rounded-lg border border-transparent px-3 py-2 text-xs font-semibold ${
                  active
                    ? "bg-accent text-accent-foreground shadow-sm"
                    : "text-muted hover:bg-bg-hover hover:text-txt"
                }`}
                onClick={() => setActiveTab(cat)}
              >
                <span>{t(CATEGORY_LABELS[cat])}</span>
                <span
                  className={`ml-1.5 inline-block w-1.5 h-1.5 rounded-full ${
                    catConfigured ? "bg-[var(--ok)]" : "bg-border-strong"
                  }`}
                />
              </Button>
            );
          },
        )}
      </div>

      {/* Mode toggle (cloud vs own-key) */}
      <div className="flex items-center gap-3">
        <span className="text-xs font-semibold text-[var(--muted)]">
          {t("mediasettingssection.APISource")}
        </span>
        <CloudSourceModeToggle
          mode={currentMode}
          onChange={(mode) => {
            if (mode === "cloud") {
              updateCategoryConfig(activeTab, {
                mode: "cloud",
                provider: "cloud",
              });
              return;
            }
            updateCategoryConfig(activeTab, { mode: "own-key" });
          }}
        />

        {/* Status badge */}
        <span
          className={`ml-auto rounded-full border px-2 py-0.5 text-[10px] ${
            configured
              ? "border-[var(--ok)] bg-[var(--ok)]/10 text-[var(--text)]"
              : "border-[var(--warn)] bg-[var(--warn-subtle)] text-[var(--text)]"
          }`}
        >
          {configured
            ? t("config-field.Configured")
            : t("mediasettingssection.NeedsSetup")}
        </span>
      </div>

      {/* Cloud mode status */}
      {currentMode === "cloud" && (
        <CloudConnectionStatus
          connected={elizaCloudConnected}
          disconnectedText={t(
            "elizaclouddashboard.ElizaCloudNotConnectedSettings",
          )}
        />
      )}

      {/* Own-key mode: provider selection */}
      {currentMode === "own-key" && (
        <div className="flex flex-col gap-3">
          <div className="text-xs font-semibold text-[var(--muted)]">
            {t("mediasettingssection.Provider")}
          </div>
          <div
            className="grid gap-1.5"
            style={{ gridTemplateColumns: `repeat(${providers.length}, 1fr)` }}
          >
            {providers
              .filter((p) => p.id !== "cloud")
              .map((p) => {
                const active = currentProvider === p.id;
                return (
                  <Button
                    key={p.id}
                    variant="outline"
                    size="sm"
                    className={`h-auto px-3 py-2 text-xs font-normal rounded-lg border border-border ${
                      active
                        ? "bg-accent/10 border-accent text-txt"
                        : "bg-card text-txt hover:bg-bg-hover"
                    }`}
                    onClick={() =>
                      updateCategoryConfig(activeTab, {
                        provider: p.id as
                          | ImageProvider
                          | VideoProvider
                          | AudioGenProvider
                          | VisionProvider,
                      })
                    }
                  >
                    <div className="font-semibold">
                      {p.id === "cloud"
                        ? t("providerswitcher.elizaCloud")
                        : p.label}
                    </div>
                    <div className="text-[10px] text-muted mt-0.5">
                      {p.id === "cloud"
                        ? t("elizaclouddashboard.NoSetupNeeded")
                        : t(p.hint)}
                    </div>
                  </Button>
                );
              })}
          </div>

          {/* API Key input */}
          {apiKeyField && (
            <div className="flex flex-col gap-2">
              <span className="text-xs font-semibold">
                {t(apiKeyField.labelKey)}
              </span>
              <Input
                type="password"
                className="h-9 px-3 py-2 bg-card border-border text-xs rounded-lg shadow-sm focus-visible:ring-1 focus-visible:ring-accent"
                placeholder={
                  getNestedValue(
                    mediaConfig as Record<string, unknown>,
                    apiKeyField.path,
                  )
                    ? t("mediasettingssection.ApiKeySetLeaveBlank")
                    : t("mediasettingssection.EnterApiKey")
                }
                onChange={(e) =>
                  updateNestedValue(
                    apiKeyField.path,
                    e.target.value || undefined,
                  )
                }
              />
            </div>
          )}

          {/* Provider-specific model selection for image generation */}
          {activeTab === "image" && currentProvider === "fal" && (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold">
                {t("mediasettingssection.Model")}
              </span>
              <select
                className="px-2.5 py-1.5 border border-[var(--border)] bg-[var(--card)] text-xs focus:border-[var(--accent)] focus:outline-none rounded-lg"
                value={
                  (getNestedValue(
                    mediaConfig as Record<string, unknown>,
                    "image.fal.model",
                  ) as string) ?? "fal-ai/flux-pro"
                }
                onChange={(e) =>
                  updateNestedValue("image.fal.model", e.target.value)
                }
              >
                <optgroup label={t("mediasettingssection.Flux")}>
                  <option value="fal-ai/flux-pro">
                    {t("mediasettingssection.FluxPro")}
                  </option>
                  <option value="fal-ai/flux-pro/v1.1">
                    {t("mediasettingssection.FluxProV11")}
                  </option>
                  <option value="fal-ai/flux-pro/kontext">
                    {t("mediasettingssection.FluxKontextPro")}
                  </option>
                  <option value="fal-ai/flux-2-flex">
                    {t("mediasettingssection.Flux2Flex")}
                  </option>
                  <option value="fal-ai/flux/dev">
                    {t("mediasettingssection.FluxDev")}
                  </option>
                  <option value="fal-ai/flux/schnell">
                    {t("mediasettingssection.FluxSchnell")}
                  </option>
                  <option value="fal-ai/fast-flux">
                    {t("mediasettingssection.FastFlux")}
                  </option>
                </optgroup>
                <optgroup label={t("mediasettingssection.OtherModels")}>
                  <option value="fal-ai/nano-banana-pro">
                    {t("mediasettingssection.NanoBananaProGoo")}
                  </option>
                  <option value="fal-ai/recraft/v3/text-to-image">
                    {t("mediasettingssection.RecraftV3")}
                  </option>
                  <option value="fal-ai/kling-image/v3/text-to-image">
                    {t("mediasettingssection.KlingImageV3")}
                  </option>
                  <option value="fal-ai/kling-image/o3/text-to-image">
                    {t("mediasettingssection.KlingImageO3")}
                  </option>
                  <option value="xai/grok-imagine-image">
                    {t("mediasettingssection.GrokImagineXAI")}
                  </option>
                  <option value="fal-ai/stable-diffusion-3">
                    {t("mediasettingssection.StableDiffusion3")}
                  </option>
                </optgroup>
              </select>
            </div>
          )}

          {activeTab === "image" && currentProvider === "openai" && (
            <div className="flex gap-3">
              <div className="flex-1 flex flex-col gap-1.5">
                <span className="text-xs font-semibold">
                  {t("mediasettingssection.Model")}
                </span>
                <select
                  className="px-2.5 py-1.5 border border-[var(--border)] bg-[var(--card)] text-xs focus:border-[var(--accent)] focus:outline-none rounded-lg"
                  value={
                    (getNestedValue(
                      mediaConfig as Record<string, unknown>,
                      "image.openai.model",
                    ) as string) ?? "dall-e-3"
                  }
                  onChange={(e) =>
                    updateNestedValue("image.openai.model", e.target.value)
                  }
                >
                  <option value="dall-e-3">
                    {t("mediasettingssection.DALLE3")}
                  </option>
                  <option value="dall-e-2">
                    {t("mediasettingssection.DALLE2")}
                  </option>
                </select>
              </div>
              <div className="flex-1 flex flex-col gap-1.5">
                <span className="text-xs font-semibold">
                  {t("mediasettingssection.Quality")}
                </span>
                <select
                  className="px-2.5 py-1.5 border border-[var(--border)] bg-[var(--card)] text-xs focus:border-[var(--accent)] focus:outline-none rounded-lg"
                  value={
                    (getNestedValue(
                      mediaConfig as Record<string, unknown>,
                      "image.openai.quality",
                    ) as string) ?? "standard"
                  }
                  onChange={(e) =>
                    updateNestedValue("image.openai.quality", e.target.value)
                  }
                >
                  <option value="standard">
                    {t("mediasettingssection.Standard")}
                  </option>
                  <option value="hd">HD</option>
                </select>
              </div>
            </div>
          )}

          {/* Video FAL model selection */}
          {activeTab === "video" && currentProvider === "fal" && (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold">
                {t("mediasettingssection.Model")}
              </span>
              <select
                className="px-2.5 py-1.5 border border-[var(--border)] bg-[var(--card)] text-xs focus:border-[var(--accent)] focus:outline-none rounded-lg"
                value={
                  (getNestedValue(
                    mediaConfig as Record<string, unknown>,
                    "video.fal.model",
                  ) as string) ?? "fal-ai/kling-video/v3/pro/text-to-video"
                }
                onChange={(e) =>
                  updateNestedValue("video.fal.model", e.target.value)
                }
              >
                <optgroup label={t("mediasettingssection.TextToVideo")}>
                  <option value="fal-ai/veo3.1">
                    {t("mediasettingssection.Veo31Google")}
                  </option>
                  <option value="fal-ai/veo3.1/fast">
                    {t("mediasettingssection.Veo31Fast")}
                  </option>
                  <option value="fal-ai/sora-2/text-to-video">
                    {t("mediasettingssection.Sora2")}
                  </option>
                  <option value="fal-ai/sora-2/text-to-video/pro">
                    {t("mediasettingssection.Sora2Pro")}
                  </option>
                  <option value="fal-ai/kling-video/v3/pro/text-to-video">
                    {t("mediasettingssection.Kling30Pro")}
                  </option>
                  <option value="fal-ai/kling-video/v3/standard/text-to-video">
                    {t("mediasettingssection.Kling30")}
                  </option>
                  <option value="fal-ai/kling-video/o3/pro/text-to-video">
                    {t("mediasettingssection.KlingO3Pro")}
                  </option>
                  <option value="fal-ai/kling-video/o3/standard/text-to-video">
                    {t("mediasettingssection.KlingO3")}
                  </option>
                  <option value="xai/grok-imagine-video/text-to-video">
                    {t("mediasettingssection.GrokVideoXAI")}
                  </option>
                  <option value="fal-ai/minimax/video-01-live">
                    {t("mediasettingssection.MinimaxHailuo")}
                  </option>
                  <option value="fal-ai/hunyuan-video">
                    {t("mediasettingssection.HunyuanVideo")}
                  </option>
                  <option value="fal-ai/mochi-v1">
                    {t("mediasettingssection.Mochi1")}
                  </option>
                  <option value="fal-ai/wan/v2.2-a14b/text-to-video">
                    {t("mediasettingssection.Wan22")}
                  </option>
                </optgroup>
                <optgroup label={t("mediasettingssection.ImageToVideo")}>
                  <option value="fal-ai/kling-video/v3/pro/image-to-video">
                    {t("mediasettingssection.Kling30Pro")}
                  </option>
                  <option value="fal-ai/kling-video/o3/standard/image-to-video">
                    {t("mediasettingssection.KlingO3")}
                  </option>
                  <option value="fal-ai/veo3.1/image-to-video">
                    {t("mediasettingssection.Veo31")}
                  </option>
                  <option value="fal-ai/veo3.1/fast/image-to-video">
                    {t("mediasettingssection.Veo31Fast")}
                  </option>
                  <option value="fal-ai/sora-2/image-to-video">
                    {t("mediasettingssection.Sora2")}
                  </option>
                  <option value="fal-ai/sora-2/image-to-video/pro">
                    {t("mediasettingssection.Sora2Pro")}
                  </option>
                  <option value="xai/grok-imagine-video/image-to-video">
                    {t("mediasettingssection.GrokXAI")}
                  </option>
                  <option value="fal-ai/minimax/video-01-live/image-to-video">
                    {t("mediasettingssection.MinimaxHailuo")}
                  </option>
                  <option value="fal-ai/luma-dream-machine/image-to-video">
                    {t("mediasettingssection.LumaDreamMachine")}
                  </option>
                  <option value="fal-ai/pixverse/v4.5/image-to-video">
                    {t("mediasettingssection.PixverseV45")}
                  </option>
                  <option value="fal-ai/ltx-2-19b/image-to-video">
                    {t("mediasettingssection.LTX219B")}
                  </option>
                </optgroup>
              </select>
            </div>
          )}

          {/* Audio Suno model selection */}
          {activeTab === "audio" && currentProvider === "suno" && (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold">
                {t("mediasettingssection.Model")}
              </span>
              <select
                className="px-2.5 py-1.5 border border-[var(--border)] bg-[var(--card)] text-xs focus:border-[var(--accent)] focus:outline-none rounded-lg"
                value={
                  (getNestedValue(
                    mediaConfig as Record<string, unknown>,
                    "audio.suno.model",
                  ) as string) ?? "chirp-v3.5"
                }
                onChange={(e) =>
                  updateNestedValue("audio.suno.model", e.target.value)
                }
              >
                <option value="chirp-v3.5">
                  {t("mediasettingssection.ChirpV35")}
                </option>
                <option value="chirp-v3">
                  {t("mediasettingssection.ChirpV3")}
                </option>
              </select>
            </div>
          )}

          {/* Audio ElevenLabs duration */}
          {activeTab === "audio" && currentProvider === "elevenlabs" && (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold">
                {t("mediasettingssection.MaxDurationSecond")}
              </span>
              <Input
                type="number"
                min={0.5}
                max={22}
                step={0.5}
                className="h-9 px-3 py-2 bg-card border-border text-xs rounded-lg shadow-sm focus-visible:ring-1 focus-visible:ring-accent w-24"
                value={
                  (getNestedValue(
                    mediaConfig as Record<string, unknown>,
                    "audio.elevenlabs.duration",
                  ) as number) ?? 5
                }
                onChange={(e) =>
                  updateNestedValue(
                    "audio.elevenlabs.duration",
                    parseFloat(e.target.value),
                  )
                }
              />
            </div>
          )}

          {/* Vision model selection */}
          {activeTab === "vision" && currentProvider === "openai" && (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold">
                {t("mediasettingssection.Model")}
              </span>
              <select
                className="px-2.5 py-1.5 border border-[var(--border)] bg-[var(--card)] text-xs focus:border-[var(--accent)] focus:outline-none rounded-lg"
                value={
                  (getNestedValue(
                    mediaConfig as Record<string, unknown>,
                    "vision.openai.model",
                  ) as string) ?? "gpt-4o"
                }
                onChange={(e) =>
                  updateNestedValue("vision.openai.model", e.target.value)
                }
              >
                <option value="gpt-4o">
                  {t("mediasettingssection.GPT4o")}
                </option>
                <option value="gpt-4o-mini">
                  {t("mediasettingssection.GPT4oMini")}
                </option>
                <option value="gpt-4-turbo">
                  {t("mediasettingssection.GPT4Turbo")}
                </option>
              </select>
            </div>
          )}

          {activeTab === "vision" && currentProvider === "google" && (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold">
                {t("mediasettingssection.Model")}
              </span>
              <select
                className="px-2.5 py-1.5 border border-[var(--border)] bg-[var(--card)] text-xs focus:border-[var(--accent)] focus:outline-none rounded-lg"
                value={
                  (getNestedValue(
                    mediaConfig as Record<string, unknown>,
                    "vision.google.model",
                  ) as string) ?? "gemini-2.0-flash"
                }
                onChange={(e) =>
                  updateNestedValue("vision.google.model", e.target.value)
                }
              >
                <option value="gemini-2.0-flash">
                  {t("mediasettingssection.Gemini20Flash")}
                </option>
                <option value="gemini-1.5-pro">
                  {t("mediasettingssection.Gemini15Pro")}
                </option>
                <option value="gemini-1.5-flash">
                  {t("mediasettingssection.Gemini15Flash")}
                </option>
              </select>
            </div>
          )}

          {activeTab === "vision" && currentProvider === "anthropic" && (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold">
                {t("mediasettingssection.Model")}
              </span>
              <select
                className="px-2.5 py-1.5 border border-[var(--border)] bg-[var(--card)] text-xs focus:border-[var(--accent)] focus:outline-none rounded-lg"
                value={
                  (getNestedValue(
                    mediaConfig as Record<string, unknown>,
                    "vision.anthropic.model",
                  ) as string) ?? "claude-sonnet-4-20250514"
                }
                onChange={(e) =>
                  updateNestedValue("vision.anthropic.model", e.target.value)
                }
              >
                <option value="claude-sonnet-4-20250514">
                  {t("mediasettingssection.ClaudeSonnet4")}
                </option>
                <option value="claude-3-5-sonnet-20241022">
                  {t("mediasettingssection.Claude35Sonnet")}
                </option>
                <option value="claude-3-haiku-20240307">
                  {t("mediasettingssection.Claude3Haiku")}
                </option>
              </select>
            </div>
          )}
        </div>
      )}

      <DesktopMediaControlPanel />

      <ConfigSaveFooter
        dirty={dirty}
        saving={saving}
        saveError={saveError}
        saveSuccess={saveSuccess}
        onSave={() => void handleSave()}
      />
    </div>
  );
}
