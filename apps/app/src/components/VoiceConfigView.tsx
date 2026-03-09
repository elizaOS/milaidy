/**
 * VoiceConfigView — TTS/STT provider selection and configuration.
 *
 * Similar to MediaSettingsSection pattern:
 *   - Provider selection (ElevenLabs, Edge TTS, etc.)
 *   - API key inputs where needed
 *   - Voice preset selection
 *   - Test functionality
 */

import type { SwabbleConfig } from "@milady/capacitor-swabble";
import { Swabble } from "@milady/capacitor-swabble";
import { useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "../AppContext";
import {
  client,
  type VoiceConfig,
  type VoiceMode,
  type VoiceProvider,
} from "../api-client";
import { dispatchWindowEvent, VOICE_CONFIG_UPDATED_EVENT } from "../events";
import {
  CloudConnectionStatus,
  CloudSourceModeToggle,
} from "./CloudSourceControls";
import { ConfigSaveFooter } from "./ConfigSaveFooter";

interface VoicePreset {
  id: string;
  name: string;
  voiceId: string;
  gender: "female" | "male" | "character";
  hint: string;
  previewUrl: string;
}

const VOICE_PRESETS: VoicePreset[] = [
  // Female
  {
    id: "rachel",
    name: "Rachel",
    voiceId: "21m00Tcm4TlvDq8ikWAM",
    gender: "female",
    hint: "Calm, clear",
    previewUrl:
      "https://storage.googleapis.com/eleven-public-prod/premade/voices/21m00Tcm4TlvDq8ikWAM/df6788f9-5c96-470d-8312-aab3b3d8f50a.mp3",
  },
  {
    id: "sarah",
    name: "Sarah",
    voiceId: "EXAVITQu4vr4xnSDxMaL",
    gender: "female",
    hint: "Soft, warm",
    previewUrl:
      "https://storage.googleapis.com/eleven-public-prod/premade/voices/EXAVITQu4vr4xnSDxMaL/6851ec91-9950-471f-8586-357c52539069.mp3",
  },
  {
    id: "matilda",
    name: "Matilda",
    voiceId: "XrExE9yKIg1WjnnlVkGX",
    gender: "female",
    hint: "Warm, friendly",
    previewUrl:
      "https://storage.googleapis.com/eleven-public-prod/premade/voices/XrExE9yKIg1WjnnlVkGX/b930e18d-6b4d-466e-bab2-0ae97c6d8535.mp3",
  },
  {
    id: "lily",
    name: "Lily",
    voiceId: "pFZP5JQG7iQjIQuC4Bku",
    gender: "female",
    hint: "British, raspy",
    previewUrl:
      "https://storage.googleapis.com/eleven-public-prod/premade/voices/pFZP5JQG7iQjIQuC4Bku/0ab8bd74-fcd2-489d-b70a-3e1bcde8c999.mp3",
  },
  // Male
  {
    id: "brian",
    name: "Brian",
    voiceId: "nPczCjzI2devNBz1zQrb",
    gender: "male",
    hint: "Deep, smooth",
    previewUrl:
      "https://storage.googleapis.com/eleven-public-prod/premade/voices/nPczCjzI2devNBz1zQrb/f4dbda0c-aff0-45c0-93fa-f5d5ec95a2eb.mp3",
  },
  {
    id: "adam",
    name: "Adam",
    voiceId: "pNInz6obpgDQGcFmaJgB",
    gender: "male",
    hint: "Deep, authoritative",
    previewUrl:
      "https://storage.googleapis.com/eleven-public-prod/premade/voices/pNInz6obpgDQGcFmaJgB/38a69695-2ca9-4b9e-b9ec-f07ced494a58.mp3",
  },
  {
    id: "josh",
    name: "Josh",
    voiceId: "TxGEqnHWrfWFTfGW9XjX",
    gender: "male",
    hint: "Young, deep",
    previewUrl:
      "https://storage.googleapis.com/eleven-public-prod/premade/voices/TxGEqnHWrfWFTfGW9XjX/3ae2fc71-d5f9-4769-bb71-2a43633cd186.mp3",
  },
  {
    id: "daniel",
    name: "Daniel",
    voiceId: "onwK4e9ZLuTAKqWW03F9",
    gender: "male",
    hint: "British, presenter",
    previewUrl:
      "https://storage.googleapis.com/eleven-public-prod/premade/voices/onwK4e9ZLuTAKqWW03F9/7eee0236-1a72-4b86-b303-5dcadc007ba9.mp3",
  },
  // Character
  {
    id: "gigi",
    name: "Gigi",
    voiceId: "jBpfuIE2acCO8z3wKNLl",
    gender: "character",
    hint: "Childish, cute",
    previewUrl:
      "https://storage.googleapis.com/eleven-public-prod/premade/voices/jBpfuIE2acCO8z3wKNLl/3a7e4339-78fa-404e-8d10-c3ef5587935b.mp3",
  },
  {
    id: "mimi",
    name: "Mimi",
    voiceId: "zrHiDhphv9ZnVXBqCLjz",
    gender: "character",
    hint: "Cute, animated",
    previewUrl:
      "https://storage.googleapis.com/eleven-public-prod/premade/voices/zrHiDhphv9ZnVXBqCLjz/decbf20b-0f57-4fac-985b-a4f0290ebfc4.mp3",
  },
  {
    id: "charlotte",
    name: "Charlotte",
    voiceId: "XB0fDUnXU5powFXDhCwa",
    gender: "character",
    hint: "Alluring, game NPC",
    previewUrl:
      "https://storage.googleapis.com/eleven-public-prod/premade/voices/XB0fDUnXU5powFXDhCwa/942356dc-f10d-4d89-bda5-4f8505ee038b.mp3",
  },
];

const PROVIDERS: Array<{
  id: VoiceProvider;
  label: string;
  hint: string;
  needsKey: boolean;
}> = [
  {
    id: "elevenlabs",
    label: "ElevenLabs",
    hint: "High quality, realistic voices",
    needsKey: true,
  },
  {
    id: "edge",
    label: "Edge TTS",
    hint: "Free, Microsoft voices",
    needsKey: false,
  },
  {
    id: "simple-voice",
    label: "Simple Voice",
    hint: "Basic browser TTS",
    needsKey: false,
  },
];

const DEFAULT_ELEVEN_FAST_MODEL = "eleven_flash_v2_5";
const REDACTED_SECRET = "[REDACTED]";

function sanitizeApiKey(apiKey: string | undefined): string | undefined {
  if (typeof apiKey !== "string") return undefined;
  const trimmed = apiKey.trim();
  if (!trimmed) return undefined;
  if (trimmed.toUpperCase() === REDACTED_SECRET) return undefined;
  return trimmed;
}

const MODEL_SIZES: Array<{
  id: NonNullable<SwabbleConfig["modelSize"]>;
  hint: string;
}> = [
  { id: "tiny", hint: "(faster)" },
  { id: "base", hint: "(recommended)" },
  { id: "small", hint: "" },
  { id: "medium", hint: "(accurate)" },
  { id: "large", hint: "(accurate)" },
];

function WakeWordSection({
  serverConfig,
}: {
  serverConfig?: Partial<SwabbleConfig> | null;
}) {
  const [triggers, setTriggers] = useState<string[]>(["milady"]);
  const [triggerInput, setTriggerInput] = useState("");
  const [sensitivity, setSensitivity] = useState(0.45);
  const [modelSize, setModelSize] =
    useState<NonNullable<SwabbleConfig["modelSize"]>>("base");
  const [audioLevel, setAudioLevel] = useState(0);
  const [enabled, setEnabled] = useState(false);

  // Load initial state from Swabble on mount
  useEffect(() => {
    void (async () => {
      try {
        const [{ config }, { listening }] = await Promise.all([
          Swabble.getConfig(),
          Swabble.isListening(),
        ]);
        // Use plugin config if available, fall back to server-persisted config
        const resolved = config ?? serverConfig ?? null;
        if (resolved) {
          if (resolved.triggers?.length) setTriggers(resolved.triggers);
          if (resolved.minPostTriggerGap != null)
            setSensitivity(resolved.minPostTriggerGap);
          if (resolved.modelSize) setModelSize(resolved.modelSize);
        }
        setEnabled(listening);
      } catch {
        // Plugin not available on this platform — silently ignore
      }
    })();
  }, [serverConfig]);

  // Subscribe to audio level events
  useEffect(() => {
    let handle: { remove: () => Promise<void> } | null = null;
    void (async () => {
      try {
        handle = await Swabble.addListener(
          "audioLevel",
          (evt: { level: number }) => {
            setAudioLevel(evt.level);
          },
        );
      } catch {
        // Not available
      }
    })();
    return () => {
      if (handle) void handle.remove();
    };
  }, []);

  const buildConfig = useCallback(
    (): SwabbleConfig => ({
      triggers,
      minPostTriggerGap: sensitivity,
      modelSize,
    }),
    [triggers, sensitivity, modelSize],
  );

  const handleTriggersChange = useCallback(async (next: string[]) => {
    setTriggers(next);
    try {
      await Swabble.updateConfig({ config: { triggers: next } });
    } catch {
      // Ignore
    }
  }, []);

  const addTrigger = useCallback(
    (raw: string) => {
      const val = raw.trim().toLowerCase().replace(/,/g, "");
      if (!val || triggers.includes(val)) return;
      void handleTriggersChange([...triggers, val]);
    },
    [triggers, handleTriggersChange],
  );

  const removeTrigger = useCallback(
    (t: string) => {
      if (triggers.length <= 1) return;
      void handleTriggersChange(triggers.filter((x) => x !== t));
    },
    [triggers, handleTriggersChange],
  );

  const handleSensitivityChange = useCallback(async (val: number) => {
    setSensitivity(val);
    try {
      await Swabble.updateConfig({ config: { minPostTriggerGap: val } });
    } catch {
      // Ignore
    }
  }, []);

  const handleModelSizeChange = useCallback(
    async (size: NonNullable<SwabbleConfig["modelSize"]>) => {
      setModelSize(size);
      try {
        await Swabble.updateConfig({ config: { modelSize: size } });
      } catch {
        // Ignore
      }
    },
    [],
  );

  const handleToggle = useCallback(async () => {
    try {
      if (enabled) {
        await Swabble.stop();
        setEnabled(false);
      } else {
        const result = await Swabble.start({ config: buildConfig() });
        if (result.started) setEnabled(true);
      }
    } catch {
      // Ignore
    }
  }, [enabled, buildConfig]);

  return (
    <div className="flex flex-col gap-3 pt-4 border-t border-[var(--border)]">
      {/* Subsection header + enable toggle */}
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold text-[var(--muted)]">
          Wake Word
        </div>
        <button
          type="button"
          onClick={() => void handleToggle()}
          className={`relative inline-flex h-5 w-9 cursor-pointer items-center rounded-full transition-colors ${
            enabled ? "bg-[var(--accent)]" : "bg-[var(--border)]"
          }`}
          aria-label={enabled ? "Disable wake word" : "Enable wake word"}
        >
          <span
            className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
              enabled ? "translate-x-4" : "translate-x-0.5"
            }`}
          />
        </button>
      </div>

      {/* Trigger tag input */}
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold">Triggers</span>
        <div className="flex flex-wrap gap-1 p-1.5 border border-[var(--border)] bg-[var(--card)] min-h-[2rem]">
          {triggers.map((t) => (
            <span
              key={t}
              className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] border border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]"
            >
              {t}
              {triggers.length > 1 && (
                <button
                  type="button"
                  className="leading-none hover:opacity-70 cursor-pointer"
                  onClick={() => removeTrigger(t)}
                  aria-label={`Remove trigger "${t}"`}
                >
                  ×
                </button>
              )}
            </span>
          ))}
          <input
            type="text"
            className="flex-1 min-w-[80px] px-1 text-xs bg-transparent outline-none"
            placeholder="Add trigger…"
            value={triggerInput}
            onChange={(e) => setTriggerInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                addTrigger(triggerInput);
                setTriggerInput("");
              }
            }}
          />
        </div>
        <div className="text-[10px] text-[var(--muted)]">
          Press Enter or comma to add. At least one trigger required.
        </div>
      </div>

      {/* Sensitivity slider */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold">Wake sensitivity</span>
          <span className="text-[10px] text-[var(--muted)]">
            {sensitivity.toFixed(2)}s
          </span>
        </div>
        <input
          type="range"
          min={0.1}
          max={2.0}
          step={0.05}
          value={sensitivity}
          className="w-full accent-[var(--accent)]"
          onChange={(e) =>
            void handleSensitivityChange(parseFloat(e.target.value))
          }
        />
        <div className="text-[10px] text-[var(--muted)]">
          Lower = more sensitive (shorter gap required after wake word)
        </div>
      </div>

      {/* Model size buttons */}
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold">Model size</span>
        <div className="flex gap-1.5">
          {MODEL_SIZES.map((m) => {
            const active = modelSize === m.id;
            return (
              <button
                key={m.id}
                type="button"
                className={`flex-1 px-2 py-1.5 text-xs cursor-pointer transition-colors border ${
                  active
                    ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]"
                    : "border-[var(--border)] bg-[var(--card)] text-[var(--text)] hover:border-[var(--accent)]"
                }`}
                onClick={() => void handleModelSizeChange(m.id)}
              >
                <div className="font-semibold">{m.id}</div>
                {m.hint && (
                  <div className="text-[10px] text-[var(--muted)] mt-0.5">
                    {m.hint}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Audio level meter */}
      <div className="flex flex-col gap-1">
        <span className="text-xs font-semibold">Microphone</span>
        <div className="h-1.5 w-full bg-[var(--border)] overflow-hidden">
          <div
            className="h-full bg-green-500 transition-all duration-75"
            style={{ width: `${Math.min(audioLevel * 100, 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
}

export function VoiceConfigView() {
  const { cloudConnected } = useApp();
  const [voiceConfig, setVoiceConfig] = useState<VoiceConfig>({});
  const [swabbleServerConfig, setSwabbleServerConfig] =
    useState<Partial<SwabbleConfig> | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [testing, setTesting] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Load config on mount
  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const cfg = await client.getConfig();
        const messages = cfg.messages as
          | Record<string, Record<string, unknown>>
          | undefined;
        const tts = messages?.tts as VoiceConfig | undefined;
        if (tts) {
          setVoiceConfig(tts);
        }
        const swabble = messages?.swabble as Partial<SwabbleConfig> | undefined;
        if (swabble) {
          setSwabbleServerConfig(swabble);
        }
      } catch {
        // Ignore errors
      }
      setLoading(false);
    })();
  }, []);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const currentProvider = voiceConfig.provider ?? "elevenlabs";
  const currentMode: VoiceMode = voiceConfig.mode ?? "own-key";
  const providerInfo = PROVIDERS.find((p) => p.id === currentProvider);
  const isConfigured =
    currentMode === "cloud"
      ? cloudConnected
      : currentProvider !== "elevenlabs"
        ? true
        : Boolean(voiceConfig.elevenlabs?.apiKey);

  const handleProviderChange = useCallback((provider: VoiceProvider) => {
    setVoiceConfig((prev) => ({ ...prev, provider }));
    setDirty(true);
  }, []);

  const handleModeChange = useCallback((mode: VoiceMode) => {
    setVoiceConfig((prev) => ({ ...prev, mode }));
    setDirty(true);
  }, []);

  const handleApiKeyChange = useCallback((apiKey: string) => {
    setVoiceConfig((prev) => ({
      ...prev,
      elevenlabs: { ...prev.elevenlabs, apiKey: apiKey || undefined },
    }));
    setDirty(true);
  }, []);

  const handleVoiceSelect = useCallback((voiceId: string) => {
    setVoiceConfig((prev) => ({
      ...prev,
      elevenlabs: { ...prev.elevenlabs, voiceId },
    }));
    setDirty(true);
  }, []);

  const handleTestVoice = useCallback((previewUrl: string) => {
    if (audioRef.current) {
      audioRef.current.pause();
    }
    setTesting(true);
    const audio = new Audio(previewUrl);
    audioRef.current = audio;
    audio.onended = () => setTesting(false);
    audio.onerror = () => setTesting(false);
    audio.play().catch(() => setTesting(false));
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      const cfg = await client.getConfig();
      const messages = (cfg.messages ?? {}) as Record<string, unknown>;
      const provider = voiceConfig.provider ?? "elevenlabs";
      const normalizedElevenLabs =
        provider === "elevenlabs"
          ? {
              ...voiceConfig.elevenlabs,
              modelId:
                voiceConfig.elevenlabs?.modelId ?? DEFAULT_ELEVEN_FAST_MODEL,
            }
          : voiceConfig.elevenlabs;
      const sanitizedKey = sanitizeApiKey(normalizedElevenLabs?.apiKey);
      if (normalizedElevenLabs) {
        if (sanitizedKey) normalizedElevenLabs.apiKey = sanitizedKey;
        else delete normalizedElevenLabs.apiKey;
      }
      const normalizedVoiceConfig: VoiceConfig = {
        ...voiceConfig,
        provider,
        mode:
          provider === "elevenlabs"
            ? (voiceConfig.mode ?? "own-key")
            : undefined,
        elevenlabs: normalizedElevenLabs,
      };
      // Also persist swabble (wake word) config — fall back to server config
      // if the plugin isn't available on this platform (e.g. Electrobun).
      let swabbleCfg: Partial<SwabbleConfig> | undefined;
      try {
        const { config: sc } = await Swabble.getConfig();
        if (sc) swabbleCfg = sc;
      } catch {
        // Not available on this platform
      }
      if (!swabbleCfg && swabbleServerConfig) {
        swabbleCfg = swabbleServerConfig;
      }

      await client.updateConfig({
        messages: {
          ...messages,
          tts: normalizedVoiceConfig,
          ...(swabbleCfg ? { swabble: swabbleCfg } : {}),
        },
      });
      dispatchWindowEvent(VOICE_CONFIG_UPDATED_EVENT, normalizedVoiceConfig);
      setSaveSuccess(true);
      setDirty(false);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save");
    }
    setSaving(false);
  }, [swabbleServerConfig, voiceConfig]);

  if (loading) {
    return (
      <div className="py-4 text-center text-[var(--muted)] text-xs">
        Loading voice configuration...
      </div>
    );
  }

  const selectedVoiceId = voiceConfig.elevenlabs?.voiceId;
  const selectedPreset = VOICE_PRESETS.find(
    (p) => p.voiceId === selectedVoiceId,
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Provider selection */}
      <div className="flex flex-col gap-2">
        <div className="text-xs font-semibold text-[var(--muted)]">
          TTS Provider
        </div>
        <div className="flex gap-2">
          {PROVIDERS.map((p) => {
            const active = currentProvider === p.id;
            return (
              <button
                key={p.id}
                type="button"
                className={`flex-1 px-3 py-2 text-xs cursor-pointer transition-colors border ${
                  active
                    ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]"
                    : "border-[var(--border)] bg-[var(--card)] text-[var(--text)] hover:border-[var(--accent)]"
                }`}
                onClick={() => handleProviderChange(p.id)}
              >
                <div className="font-semibold">{p.label}</div>
                <div className="text-[10px] text-[var(--muted)] mt-0.5">
                  {p.hint}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Status */}
      <div className="flex items-center justify-between py-2 px-3 border border-[var(--border)] bg-[var(--bg-muted)]">
        <span className="text-xs">
          {currentProvider === "elevenlabs"
            ? `ElevenLabs — ${currentMode === "cloud" ? "Served via Eliza Cloud" : "Requires API key"}`
            : `${providerInfo?.label} — No API key needed`}
        </span>
        <span
          className={`text-[10px] px-1.5 py-0.5 border ${
            isConfigured
              ? "border-green-600 text-green-600"
              : "border-yellow-600 text-yellow-600"
          }`}
        >
          {isConfigured ? "Configured" : "Needs Setup"}
        </span>
      </div>

      {/* ElevenLabs settings */}
      {currentProvider === "elevenlabs" && (
        <div className="flex flex-col gap-3">
          {/* API source mode */}
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-[var(--muted)]">
              API Source
            </span>
            <CloudSourceModeToggle
              mode={currentMode}
              onChange={handleModeChange}
            />
          </div>

          {/* Cloud mode status */}
          {currentMode === "cloud" && (
            <CloudConnectionStatus
              connected={cloudConnected}
              disconnectedText="Eliza Cloud not connected. Connect in Settings."
            />
          )}

          {/* API Key */}
          {currentMode === "own-key" && (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold">ElevenLabs API Key</span>
              <input
                type="password"
                className="px-2.5 py-1.5 border border-[var(--border)] bg-[var(--card)] text-xs focus:border-[var(--accent)] focus:outline-none"
                placeholder={
                  voiceConfig.elevenlabs?.apiKey
                    ? "API key set"
                    : "Enter API key..."
                }
                onChange={(e) => handleApiKeyChange(e.target.value)}
              />
              <div className="text-[10px] text-[var(--muted)]">
                Get your key at{" "}
                <a
                  href="https://elevenlabs.io"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--accent)] hover:underline"
                >
                  elevenlabs.io
                </a>
              </div>
              <div className="text-[10px] text-[var(--muted)]">
                Fast path default: ElevenLabs Flash v2.5 streaming (`
                {DEFAULT_ELEVEN_FAST_MODEL}`).
              </div>
            </div>
          )}

          {/* Voice presets */}
          <div className="flex flex-col gap-2">
            <div className="text-xs font-semibold">Voice</div>
            <div className="grid grid-cols-3 gap-1.5">
              {VOICE_PRESETS.map((preset) => {
                const active = selectedVoiceId === preset.voiceId;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    className={`px-2 py-1.5 text-xs cursor-pointer transition-colors border text-left ${
                      active
                        ? "border-[var(--accent)] bg-[var(--accent)]/10"
                        : "border-[var(--border)] bg-[var(--card)] hover:border-[var(--accent)]"
                    }`}
                    onClick={() => handleVoiceSelect(preset.voiceId)}
                  >
                    <div className="font-semibold">{preset.name}</div>
                    <div className="text-[10px] text-[var(--muted)]">
                      {preset.hint}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Test voice */}
          {selectedPreset && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="px-3 py-1.5 text-xs font-semibold border border-[var(--border)] bg-[var(--card)] cursor-pointer hover:border-[var(--accent)] disabled:opacity-50"
                disabled={testing}
                onClick={() => handleTestVoice(selectedPreset.previewUrl)}
              >
                {testing ? "Playing..." : `Test ${selectedPreset.name}`}
              </button>
              {testing && (
                <button
                  type="button"
                  className="px-2 py-1.5 text-xs border border-[var(--border)] bg-[var(--card)] cursor-pointer hover:border-[var(--accent)]"
                  onClick={() => {
                    if (audioRef.current) {
                      audioRef.current.pause();
                      setTesting(false);
                    }
                  }}
                >
                  Stop
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Edge TTS settings */}
      {currentProvider === "edge" && (
        <div className="py-2 px-3 border border-[var(--border)] bg-[var(--bg-muted)] text-xs text-[var(--muted)]">
          Edge TTS uses Microsoft's free text-to-speech service. No
          configuration needed.
        </div>
      )}

      {/* Simple voice settings */}
      {currentProvider === "simple-voice" && (
        <div className="py-2 px-3 border border-[var(--border)] bg-[var(--bg-muted)] text-xs text-[var(--muted)]">
          Simple Voice uses your browser's built-in speech synthesis. No
          configuration needed.
        </div>
      )}

      {/* Wake Word subsection */}
      <WakeWordSection serverConfig={swabbleServerConfig} />

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
