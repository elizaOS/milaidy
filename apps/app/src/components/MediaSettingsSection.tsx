/**
 * MediaSettingsSection — provider selection + config for media generation.
 *
 * Follows the TTS pattern from CharacterView:
 *   - "cloud" vs "own-key" mode toggle
 *   - Provider button grid
 *   - Conditional API key inputs
 *   - Status badges (Configured / Needs Setup)
 */

import { useState, useCallback, useEffect } from "react";
import { useApp } from "../AppContext";
import {
  client,
  type MediaConfig,
  type MediaMode,
  type ImageProvider,
  type VideoProvider,
  type AudioGenProvider,
  type VisionProvider,
} from "../api-client";

type MediaCategory = "image" | "video" | "audio" | "vision";

interface ProviderOption {
  id: string;
  label: string;
  hint: string;
}

const IMAGE_PROVIDERS: ProviderOption[] = [
  { id: "cloud", label: "Eliza Cloud", hint: "No setup needed" },
  { id: "fal", label: "FAL.ai", hint: "Flux, SD3" },
  { id: "openai", label: "OpenAI", hint: "DALL-E 3" },
  { id: "google", label: "Google", hint: "Imagen 3" },
  { id: "xai", label: "xAI", hint: "Aurora" },
];

const VIDEO_PROVIDERS: ProviderOption[] = [
  { id: "cloud", label: "Eliza Cloud", hint: "No setup needed" },
  { id: "fal", label: "FAL.ai", hint: "Minimax, Runway" },
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
      if (provider === "fal") return { path: `${category}.fal.apiKey`, label: "FAL API Key" };
      if (provider === "openai") return { path: `${category}.openai.apiKey`, label: "OpenAI API Key" };
      if (provider === "google") return { path: `${category}.google.apiKey`, label: "Google API Key" };
      if (provider === "xai") return { path: `${category}.xai.apiKey`, label: "xAI API Key" };
      break;
    case "audio":
      if (provider === "suno") return { path: "audio.suno.apiKey", label: "Suno API Key" };
      if (provider === "elevenlabs") return { path: "audio.elevenlabs.apiKey", label: "ElevenLabs API Key" };
      break;
    case "vision":
      if (provider === "openai") return { path: "vision.openai.apiKey", label: "OpenAI API Key" };
      if (provider === "google") return { path: "vision.google.apiKey", label: "Google API Key" };
      if (provider === "anthropic") return { path: "vision.anthropic.apiKey", label: "Anthropic API Key" };
      if (provider === "xai") return { path: "vision.xai.apiKey", label: "xAI API Key" };
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
  const updateNestedValue = useCallback(
    (path: string, value: unknown) => {
      setMediaConfig((prev) => setNestedValue(prev as Record<string, unknown>, path, value) as MediaConfig);
      setDirty(true);
    },
    [],
  );

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
      if (mode === "cloud") return true;

      const provider = getProvider(category);
      const apiKeyField = getApiKeyField(category, provider);
      if (!apiKeyField) return true;

      const value = getNestedValue(mediaConfig as Record<string, unknown>, apiKeyField.path);
      return typeof value === "string" && value.length > 0;
    },
    [getMode, getProvider, mediaConfig],
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
        {(["image", "video", "audio", "vision"] as MediaCategory[]).map((cat) => {
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
        })}
      </div>

      {/* Mode toggle (cloud vs own-key) */}
      <div className="flex items-center gap-3">
        <span className="text-xs font-semibold text-[var(--muted)]">API Source:</span>
        <div className="flex border border-[var(--border)]">
          <button
            type="button"
            className={`px-3 py-1.5 text-xs font-semibold cursor-pointer transition-colors ${
              currentMode === "cloud"
                ? "bg-[var(--accent)] text-[var(--accent-foreground)]"
                : "bg-[var(--card)] text-[var(--muted)] hover:text-[var(--text)]"
            }`}
            onClick={() => updateCategoryConfig(activeTab, { mode: "cloud", provider: "cloud" })}
          >
            Eliza Cloud
          </button>
          <button
            type="button"
            className={`px-3 py-1.5 text-xs font-semibold cursor-pointer transition-colors border-l border-[var(--border)] ${
              currentMode === "own-key"
                ? "bg-[var(--accent)] text-[var(--accent-foreground)]"
                : "bg-[var(--card)] text-[var(--muted)] hover:text-[var(--text)]"
            }`}
            onClick={() => updateCategoryConfig(activeTab, { mode: "own-key" })}
          >
            Own API Key
          </button>
        </div>

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
        <div className="flex items-center justify-between py-2.5 px-3 border border-[var(--border)] bg-[var(--bg-muted)]">
          {cloudConnected ? (
            <>
              <span className="text-xs text-[var(--text)]">
                Connected to Eliza Cloud
              </span>
              <span className="text-[10px] px-1.5 py-0.5 border border-green-600 text-green-600">
                Active
              </span>
            </>
          ) : (
            <>
              <span className="text-xs text-[var(--muted)]">
                Eliza Cloud not connected — configure in Settings &rarr; AI Model
              </span>
              <span className="text-[10px] px-1.5 py-0.5 border border-yellow-600 text-yellow-600">
                Offline
              </span>
            </>
          )}
        </div>
      )}

      {/* Own-key mode: provider selection */}
      {currentMode === "own-key" && (
        <div className="flex flex-col gap-3">
          <div className="text-xs font-semibold text-[var(--muted)]">Provider:</div>
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
                      updateCategoryConfig(activeTab, { provider: p.id as ImageProvider | VideoProvider | AudioGenProvider | VisionProvider })
                    }
                  >
                    <div className="font-semibold">{p.label}</div>
                    <div className="text-[10px] text-[var(--muted)] mt-0.5">{p.hint}</div>
                  </button>
                );
              })}
          </div>

          {/* API Key input */}
          {apiKeyField && (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold">{apiKeyField.label}</label>
              <input
                type="password"
                className="px-2.5 py-1.5 border border-[var(--border)] bg-[var(--card)] text-xs focus:border-[var(--accent)] focus:outline-none"
                placeholder={
                  getNestedValue(mediaConfig as Record<string, unknown>, apiKeyField.path)
                    ? "API key set — leave blank to keep"
                    : "Enter API key..."
                }
                onChange={(e) => updateNestedValue(apiKeyField.path, e.target.value || undefined)}
              />
            </div>
          )}

          {/* Provider-specific model selection for image generation */}
          {activeTab === "image" && currentProvider === "fal" && (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold">Model</label>
              <select
                className="px-2.5 py-1.5 border border-[var(--border)] bg-[var(--card)] text-xs focus:border-[var(--accent)] focus:outline-none"
                value={(getNestedValue(mediaConfig as Record<string, unknown>, "image.fal.model") as string) ?? "fal-ai/flux-pro"}
                onChange={(e) => updateNestedValue("image.fal.model", e.target.value)}
              >
                <option value="fal-ai/flux-pro">Flux Pro</option>
                <option value="fal-ai/flux-dev">Flux Dev</option>
                <option value="fal-ai/flux-schnell">Flux Schnell</option>
                <option value="fal-ai/stable-diffusion-3">Stable Diffusion 3</option>
              </select>
            </div>
          )}

          {activeTab === "image" && currentProvider === "openai" && (
            <div className="flex gap-3">
              <div className="flex-1 flex flex-col gap-1.5">
                <label className="text-xs font-semibold">Model</label>
                <select
                  className="px-2.5 py-1.5 border border-[var(--border)] bg-[var(--card)] text-xs focus:border-[var(--accent)] focus:outline-none"
                  value={(getNestedValue(mediaConfig as Record<string, unknown>, "image.openai.model") as string) ?? "dall-e-3"}
                  onChange={(e) => updateNestedValue("image.openai.model", e.target.value)}
                >
                  <option value="dall-e-3">DALL-E 3</option>
                  <option value="dall-e-2">DALL-E 2</option>
                </select>
              </div>
              <div className="flex-1 flex flex-col gap-1.5">
                <label className="text-xs font-semibold">Quality</label>
                <select
                  className="px-2.5 py-1.5 border border-[var(--border)] bg-[var(--card)] text-xs focus:border-[var(--accent)] focus:outline-none"
                  value={(getNestedValue(mediaConfig as Record<string, unknown>, "image.openai.quality") as string) ?? "standard"}
                  onChange={(e) => updateNestedValue("image.openai.quality", e.target.value)}
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
              <label className="text-xs font-semibold">Model</label>
              <select
                className="px-2.5 py-1.5 border border-[var(--border)] bg-[var(--card)] text-xs focus:border-[var(--accent)] focus:outline-none"
                value={(getNestedValue(mediaConfig as Record<string, unknown>, "video.fal.model") as string) ?? "fal-ai/minimax-video"}
                onChange={(e) => updateNestedValue("video.fal.model", e.target.value)}
              >
                <option value="fal-ai/minimax-video">Minimax Video</option>
                <option value="fal-ai/runway-gen3">Runway Gen-3</option>
                <option value="fal-ai/kling-video">Kling Video</option>
              </select>
            </div>
          )}

          {/* Audio Suno model selection */}
          {activeTab === "audio" && currentProvider === "suno" && (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold">Model</label>
              <select
                className="px-2.5 py-1.5 border border-[var(--border)] bg-[var(--card)] text-xs focus:border-[var(--accent)] focus:outline-none"
                value={(getNestedValue(mediaConfig as Record<string, unknown>, "audio.suno.model") as string) ?? "chirp-v3.5"}
                onChange={(e) => updateNestedValue("audio.suno.model", e.target.value)}
              >
                <option value="chirp-v3.5">Chirp v3.5</option>
                <option value="chirp-v3">Chirp v3</option>
              </select>
            </div>
          )}

          {/* Audio ElevenLabs duration */}
          {activeTab === "audio" && currentProvider === "elevenlabs" && (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold">Max Duration (seconds)</label>
              <input
                type="number"
                min={0.5}
                max={22}
                step={0.5}
                className="px-2.5 py-1.5 border border-[var(--border)] bg-[var(--card)] text-xs focus:border-[var(--accent)] focus:outline-none w-24"
                value={(getNestedValue(mediaConfig as Record<string, unknown>, "audio.elevenlabs.duration") as number) ?? 5}
                onChange={(e) => updateNestedValue("audio.elevenlabs.duration", parseFloat(e.target.value))}
              />
            </div>
          )}

          {/* Vision model selection */}
          {activeTab === "vision" && currentProvider === "openai" && (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold">Model</label>
              <select
                className="px-2.5 py-1.5 border border-[var(--border)] bg-[var(--card)] text-xs focus:border-[var(--accent)] focus:outline-none"
                value={(getNestedValue(mediaConfig as Record<string, unknown>, "vision.openai.model") as string) ?? "gpt-4o"}
                onChange={(e) => updateNestedValue("vision.openai.model", e.target.value)}
              >
                <option value="gpt-4o">GPT-4o</option>
                <option value="gpt-4o-mini">GPT-4o Mini</option>
                <option value="gpt-4-turbo">GPT-4 Turbo</option>
              </select>
            </div>
          )}

          {activeTab === "vision" && currentProvider === "google" && (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold">Model</label>
              <select
                className="px-2.5 py-1.5 border border-[var(--border)] bg-[var(--card)] text-xs focus:border-[var(--accent)] focus:outline-none"
                value={(getNestedValue(mediaConfig as Record<string, unknown>, "vision.google.model") as string) ?? "gemini-2.0-flash"}
                onChange={(e) => updateNestedValue("vision.google.model", e.target.value)}
              >
                <option value="gemini-2.0-flash">Gemini 2.0 Flash</option>
                <option value="gemini-1.5-pro">Gemini 1.5 Pro</option>
                <option value="gemini-1.5-flash">Gemini 1.5 Flash</option>
              </select>
            </div>
          )}

          {activeTab === "vision" && currentProvider === "anthropic" && (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold">Model</label>
              <select
                className="px-2.5 py-1.5 border border-[var(--border)] bg-[var(--card)] text-xs focus:border-[var(--accent)] focus:outline-none"
                value={(getNestedValue(mediaConfig as Record<string, unknown>, "vision.anthropic.model") as string) ?? "claude-sonnet-4-20250514"}
                onChange={(e) => updateNestedValue("vision.anthropic.model", e.target.value)}
              >
                <option value="claude-sonnet-4-20250514">Claude Sonnet 4</option>
                <option value="claude-3-5-sonnet-20241022">Claude 3.5 Sonnet</option>
                <option value="claude-3-haiku-20240307">Claude 3 Haiku</option>
              </select>
            </div>
          )}
        </div>
      )}

      {/* Save button */}
      {dirty && (
        <div className="flex items-center justify-end gap-3 pt-2 border-t border-[var(--border)]">
          {saveError && (
            <span className="text-xs text-red-500">{saveError}</span>
          )}
          {saveSuccess && (
            <span className="text-xs text-green-600">Saved!</span>
          )}
          <button
            type="button"
            className="px-4 py-1.5 text-xs font-semibold bg-[var(--accent)] text-[var(--accent-foreground)] cursor-pointer hover:opacity-90 disabled:opacity-50"
            disabled={saving}
            onClick={handleSave}
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      )}
    </div>
  );
}
