/**
 * MediaSettingsSection — provider selection + config for media generation.
 *
 * Follows the TTS pattern from CharacterView:
 *   - "cloud" vs "own-key" mode toggle
 *   - Provider button grid
 *   - Conditional API key inputs
 *   - Status badges (Configured / Needs Setup)
 */

import { useCallback, useEffect, useState } from "react";
import { useApp } from "../AppContext";
import {
  type AudioGenProvider,
  client,
  type ImageProvider,
  type MediaConfig,
  type MediaMode,
  type VideoProvider,
  type VisionProvider,
} from "../api-client";
import {
  CloudConnectionStatus,
  CloudSourceModeToggle,
} from "./CloudSourceControls";
import { ConfigSaveFooter } from "./ConfigSaveFooter";

type MediaCategory = "image" | "video" | "audio" | "vision";

interface ProviderOption {
  id: string;
  label: string;
  hint: string;
}

const IMAGE_PROVIDERS: ProviderOption[] = [
  { id: "cloud", label: "Eliza Cloud", hint: "No setup needed" },
  { id: "fal", label: "FAL.ai", hint: "Flux 2, Kling, Recraft, Grok" },
  { id: "openai", label: "OpenAI", hint: "DALL-E 3" },
  { id: "google", label: "Google", hint: "Imagen 3" },
  { id: "xai", label: "xAI", hint: "Aurora" },
];

const VIDEO_PROVIDERS: ProviderOption[] = [
  { id: "cloud", label: "Eliza Cloud", hint: "No setup needed" },
  { id: "fal", label: "FAL.ai", hint: "Veo 3, Sora 2, Kling 3, Minimax" },
  { id: "openai", label: "OpenAI", hint: "Sora" },
  { id: "google", label: "Google", hint: "Veo" },
];

const AUDIO_PROVIDERS: ProviderOption[] = [
  { id: "cloud", label: "Eliza Cloud", hint: "No setup needed" },
  { id: "suno", label: "Suno", hint: "Music generation" },
  { id: "elevenlabs", label: "ElevenLabs", hint: "Sound effects" },
];

const VISION_PROVIDERS: ProviderOption[] = [
  { id: "cloud", label: "Eliza Cloud", hint: "No setup needed" },
  { id: "openai", label: "OpenAI", hint: "GPT-4o Vision" },
  { id: "google", label: "Google", hint: "Gemini Vision" },
  { id: "anthropic", label: "Anthropic", hint: "Claude Vision" },
  { id: "xai", label: "xAI", hint: "Grok Vision" },
];

const CATEGORY_LABELS: Record<MediaCategory, string> = {
  image: "Image Generation",
  video: "Video Generation",
  audio: "Audio / Music",
  vision: "Vision (Analysis)",
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
): { path: string; label: string } | null {
  if (provider === "cloud") return null;

  switch (category) {
    case "image":
    case "video":
      if (provider === "fal")
        return { path: `${category}.fal.apiKey`, label: "FAL API Key" };
      if (provider === "openai")
        return { path: `${category}.openai.apiKey`, label: "OpenAI API Key" };
      if (provider === "google")
        return { path: `${category}.google.apiKey`, label: "Google API Key" };
      if (provider === "xai")
        return { path: `${category}.xai.apiKey`, label: "xAI API Key" };
      break;
    case "audio":
      if (provider === "suno")
        return { path: "audio.suno.apiKey", label: "Suno API Key" };
      if (provider === "elevenlabs")
        return { path: "audio.elevenlabs.apiKey", label: "ElevenLabs API Key" };
      break;
    case "vision":
      if (provider === "openai")
        return { path: "vision.openai.apiKey", label: "OpenAI API Key" };
      if (provider === "google")
        return { path: "vision.google.apiKey", label: "Google API Key" };
      if (provider === "anthropic")
        return { path: "vision.anthropic.apiKey", label: "Anthropic API Key" };
      if (provider === "xai")
        return { path: "vision.xai.apiKey", label: "xAI API Key" };
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

export function MediaSettingsSection() {
  const { cloudConnected } = useApp();
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
  }, [mediaConfig]);

  // Check if provider is configured
  const isProviderConfigured = useCallback(
    (category: MediaCategory): boolean => {
      const mode = getMode(category);
      if (mode === "cloud") return cloudConnected;

      const provider = getProvider(category);
      const apiKeyField = getApiKeyField(category, provider);
      if (!apiKeyField) return true;

      const value = getNestedValue(
        mediaConfig as Record<string, unknown>,
        apiKeyField.path,
      );
      return typeof value === "string" && value.length > 0;
    },
    [getMode, getProvider, mediaConfig, cloudConnected],
  );

  if (loading) {
    return (
      <div className="py-8 text-center text-[var(--muted)] text-xs">
        Loading media configuration...
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
      <div className="flex border border-[var(--border)]">
        {(["image", "video", "audio", "vision"] as MediaCategory[]).map(
          (cat) => {
            const active = activeTab === cat;
            const catConfigured = isProviderConfigured(cat);
            return (
              <button
                key={cat}
                type="button"
                className={`flex-1 px-3 py-2 text-xs font-semibold cursor-pointer transition-colors border-r last:border-r-0 border-[var(--border)] ${
                  active
                    ? "bg-[var(--accent)] text-[var(--accent-foreground)]"
                    : "bg-[var(--card)] text-[var(--muted)] hover:text-[var(--text)]"
                }`}
                onClick={() => setActiveTab(cat)}
              >
                <span>{CATEGORY_LABELS[cat]}</span>
                <span
                  className={`ml-1.5 inline-block w-1.5 h-1.5 rounded-full ${
                    catConfigured ? "bg-green-500" : "bg-yellow-500"
                  }`}
                />
              </button>
            );
          },
        )}
      </div>

      {/* Mode toggle (cloud vs own-key) */}
      <div className="flex items-center gap-3">
        <span className="text-xs font-semibold text-[var(--muted)]">
          API Source:
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
          className={`ml-auto text-[10px] px-2 py-0.5 border ${
            configured
              ? "border-green-600 text-green-600"
              : "border-yellow-600 text-yellow-600"
          }`}
        >
          {configured ? "Configured" : "Needs Setup"}
        </span>
      </div>

      {/* Cloud mode status */}
      {currentMode === "cloud" && (
        <CloudConnectionStatus
          connected={cloudConnected}
          disconnectedText="Eliza Cloud not connected - configure in Settings -> AI Model"
        />
      )}

      {/* Own-key mode: provider selection */}
      {currentMode === "own-key" && (
        <div className="flex flex-col gap-3">
          <div className="text-xs font-semibold text-[var(--muted)]">
            Provider:
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
                  <button
                    key={p.id}
                    type="button"
                    className={`px-3 py-2 text-xs cursor-pointer transition-colors border ${
                      active
                        ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]"
                        : "border-[var(--border)] bg-[var(--card)] text-[var(--text)] hover:border-[var(--accent)]"
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
                    <div className="font-semibold">{p.label}</div>
                    <div className="text-[10px] text-[var(--muted)] mt-0.5">
                      {p.hint}
                    </div>
                  </button>
                );
              })}
          </div>

          {/* API Key input */}
          {apiKeyField && (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold">{apiKeyField.label}</span>
              <input
                type="password"
                className="px-2.5 py-1.5 border border-[var(--border)] bg-[var(--card)] text-xs focus:border-[var(--accent)] focus:outline-none"
                placeholder={
                  getNestedValue(
                    mediaConfig as Record<string, unknown>,
                    apiKeyField.path,
                  )
                    ? "API key set — leave blank to keep"
                    : "Enter API key..."
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
              <span className="text-xs font-semibold">Model</span>
              <select
                className="px-2.5 py-1.5 border border-[var(--border)] bg-[var(--card)] text-xs focus:border-[var(--accent)] focus:outline-none"
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
                <optgroup label="Flux">
                  <option value="fal-ai/flux-pro">Flux Pro</option>
                  <option value="fal-ai/flux-pro/v1.1">Flux Pro v1.1</option>
                  <option value="fal-ai/flux-pro/kontext">
                    Flux Kontext Pro
                  </option>
                  <option value="fal-ai/flux-2-flex">Flux 2 Flex</option>
                  <option value="fal-ai/flux/dev">Flux Dev</option>
                  <option value="fal-ai/flux/schnell">Flux Schnell</option>
                  <option value="fal-ai/fast-flux">Fast Flux</option>
                </optgroup>
                <optgroup label="Other Models">
                  <option value="fal-ai/nano-banana-pro">
                    Nano Banana Pro (Google)
                  </option>
                  <option value="fal-ai/recraft/v3/text-to-image">
                    Recraft V3
                  </option>
                  <option value="fal-ai/kling-image/v3/text-to-image">
                    Kling Image v3
                  </option>
                  <option value="fal-ai/kling-image/o3/text-to-image">
                    Kling Image O3
                  </option>
                  <option value="xai/grok-imagine-image">
                    Grok Imagine (xAI)
                  </option>
                  <option value="fal-ai/stable-diffusion-3">
                    Stable Diffusion 3
                  </option>
                </optgroup>
              </select>
            </div>
          )}

          {activeTab === "image" && currentProvider === "openai" && (
            <div className="flex gap-3">
              <div className="flex-1 flex flex-col gap-1.5">
                <span className="text-xs font-semibold">Model</span>
                <select
                  className="px-2.5 py-1.5 border border-[var(--border)] bg-[var(--card)] text-xs focus:border-[var(--accent)] focus:outline-none"
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
                  <option value="dall-e-3">DALL-E 3</option>
                  <option value="dall-e-2">DALL-E 2</option>
                </select>
              </div>
              <div className="flex-1 flex flex-col gap-1.5">
                <span className="text-xs font-semibold">Quality</span>
                <select
                  className="px-2.5 py-1.5 border border-[var(--border)] bg-[var(--card)] text-xs focus:border-[var(--accent)] focus:outline-none"
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
                  <option value="standard">Standard</option>
                  <option value="hd">HD</option>
                </select>
              </div>
            </div>
          )}

          {/* Video FAL model selection */}
          {activeTab === "video" && currentProvider === "fal" && (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold">Model</span>
              <select
                className="px-2.5 py-1.5 border border-[var(--border)] bg-[var(--card)] text-xs focus:border-[var(--accent)] focus:outline-none"
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
                <optgroup label="Text to Video">
                  <option value="fal-ai/veo3.1">Veo 3.1 (Google)</option>
                  <option value="fal-ai/veo3.1/fast">Veo 3.1 Fast</option>
                  <option value="fal-ai/sora-2/text-to-video">Sora 2</option>
                  <option value="fal-ai/sora-2/text-to-video/pro">
                    Sora 2 Pro
                  </option>
                  <option value="fal-ai/kling-video/v3/pro/text-to-video">
                    Kling 3.0 Pro
                  </option>
                  <option value="fal-ai/kling-video/v3/standard/text-to-video">
                    Kling 3.0
                  </option>
                  <option value="fal-ai/kling-video/o3/pro/text-to-video">
                    Kling O3 Pro
                  </option>
                  <option value="fal-ai/kling-video/o3/standard/text-to-video">
                    Kling O3
                  </option>
                  <option value="xai/grok-imagine-video/text-to-video">
                    Grok Video (xAI)
                  </option>
                  <option value="fal-ai/minimax/video-01-live">
                    Minimax Hailuo
                  </option>
                  <option value="fal-ai/hunyuan-video">Hunyuan Video</option>
                  <option value="fal-ai/mochi-v1">Mochi 1</option>
                  <option value="fal-ai/wan/v2.2-a14b/text-to-video">
                    Wan 2.2
                  </option>
                </optgroup>
                <optgroup label="Image to Video">
                  <option value="fal-ai/kling-video/v3/pro/image-to-video">
                    Kling 3.0 Pro
                  </option>
                  <option value="fal-ai/kling-video/o3/standard/image-to-video">
                    Kling O3
                  </option>
                  <option value="fal-ai/veo3.1/image-to-video">Veo 3.1</option>
                  <option value="fal-ai/veo3.1/fast/image-to-video">
                    Veo 3.1 Fast
                  </option>
                  <option value="fal-ai/sora-2/image-to-video">Sora 2</option>
                  <option value="fal-ai/sora-2/image-to-video/pro">
                    Sora 2 Pro
                  </option>
                  <option value="xai/grok-imagine-video/image-to-video">
                    Grok (xAI)
                  </option>
                  <option value="fal-ai/minimax/video-01-live/image-to-video">
                    Minimax Hailuo
                  </option>
                  <option value="fal-ai/luma-dream-machine/image-to-video">
                    Luma Dream Machine
                  </option>
                  <option value="fal-ai/pixverse/v4.5/image-to-video">
                    Pixverse v4.5
                  </option>
                  <option value="fal-ai/ltx-2-19b/image-to-video">
                    LTX-2 19B
                  </option>
                </optgroup>
              </select>
            </div>
          )}

          {/* Audio Suno model selection */}
          {activeTab === "audio" && currentProvider === "suno" && (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold">Model</span>
              <select
                className="px-2.5 py-1.5 border border-[var(--border)] bg-[var(--card)] text-xs focus:border-[var(--accent)] focus:outline-none"
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
                <option value="chirp-v3.5">Chirp v3.5</option>
                <option value="chirp-v3">Chirp v3</option>
              </select>
            </div>
          )}

          {/* Audio ElevenLabs duration */}
          {activeTab === "audio" && currentProvider === "elevenlabs" && (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold">
                Max Duration (seconds)
              </span>
              <input
                type="number"
                min={0.5}
                max={22}
                step={0.5}
                className="px-2.5 py-1.5 border border-[var(--border)] bg-[var(--card)] text-xs focus:border-[var(--accent)] focus:outline-none w-24"
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
              <span className="text-xs font-semibold">Model</span>
              <select
                className="px-2.5 py-1.5 border border-[var(--border)] bg-[var(--card)] text-xs focus:border-[var(--accent)] focus:outline-none"
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
                <option value="gpt-4o">GPT-4o</option>
                <option value="gpt-4o-mini">GPT-4o Mini</option>
                <option value="gpt-4-turbo">GPT-4 Turbo</option>
              </select>
            </div>
          )}

          {activeTab === "vision" && currentProvider === "google" && (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold">Model</span>
              <select
                className="px-2.5 py-1.5 border border-[var(--border)] bg-[var(--card)] text-xs focus:border-[var(--accent)] focus:outline-none"
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
                <option value="gemini-2.0-flash">Gemini 2.0 Flash</option>
                <option value="gemini-1.5-pro">Gemini 1.5 Pro</option>
                <option value="gemini-1.5-flash">Gemini 1.5 Flash</option>
              </select>
            </div>
          )}

          {activeTab === "vision" && currentProvider === "anthropic" && (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold">Model</span>
              <select
                className="px-2.5 py-1.5 border border-[var(--border)] bg-[var(--card)] text-xs focus:border-[var(--accent)] focus:outline-none"
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
                  Claude Sonnet 4
                </option>
                <option value="claude-3-5-sonnet-20241022">
                  Claude 3.5 Sonnet
                </option>
                <option value="claude-3-haiku-20240307">Claude 3 Haiku</option>
              </select>
            </div>
          )}
        </div>
      )}

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
