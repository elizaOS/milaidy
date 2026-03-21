import { client } from "@miladyai/app-core/api";
import { ConfigSaveFooter } from "@miladyai/app-core/components/ConfigSaveFooter";
import {
  dispatchWindowEvent,
  VOICE_CONFIG_UPDATED_EVENT,
} from "@miladyai/app-core/events";
import { useApp } from "@miladyai/app-core/state";
import { PREMADE_VOICES, sanitizeApiKey } from "@miladyai/app-core/voice";
import { Button, Input } from "@miladyai/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type ProviderId = "cloud" | "elevenlabs" | "edge";

type VoiceConfig = {
  provider?: ProviderId;
  cloud?: {
    voiceId?: string;
    modelId?: string;
  };
  elevenlabs?: {
    apiKey?: string;
    voiceId?: string;
    modelId?: string;
  };
  edge?: {
    voice?: string;
  };
  // Legacy field kept for migration only.
  mode?: "cloud" | "own-key";
};

type CloudVoicePreset = {
  id: string;
  name: string;
  voiceId: string;
  hint: string;
  language: string;
};

type ProviderCard = {
  id: ProviderId;
  label: string;
  hint: string;
};

const PROVIDER_CARDS: ProviderCard[] = [
  {
    id: "cloud",
    label: "Eliza Cloud",
    hint: "Managed cloud voices",
  },
  {
    id: "elevenlabs",
    label: "ElevenLabs",
    hint: "Use your ElevenLabs API key",
  },
  {
    id: "edge",
    label: "Microsoft Edge",
    hint: "Free, local browser voices",
  },
];

const DEFAULT_ELEVEN_MODEL = "eleven_flash_v2_5";
const DEFAULT_CLOUD_MODEL = "gpt-5-mini-tts";

const CLOUD_VOICE_PRESETS: CloudVoicePreset[] = [
  {
    id: "alloy",
    name: "Alloy",
    voiceId: "alloy",
    hint: "Balanced, neutral",
    language: "English",
  },
  {
    id: "ash",
    name: "Ash",
    voiceId: "ash",
    hint: "Warm, expressive",
    language: "English",
  },
  {
    id: "ballad",
    name: "Ballad",
    voiceId: "ballad",
    hint: "Narrative, dramatic",
    language: "English",
  },
  {
    id: "coral",
    name: "Coral",
    voiceId: "coral",
    hint: "Crisp, clear",
    language: "English",
  },
  {
    id: "echo",
    name: "Echo",
    voiceId: "echo",
    hint: "Deep, grounded",
    language: "English",
  },
  {
    id: "nova",
    name: "Nova",
    voiceId: "nova",
    hint: "Bright, friendly",
    language: "English",
  },
  {
    id: "sage",
    name: "Sage",
    voiceId: "sage",
    hint: "Calm, instructional",
    language: "English",
  },
  {
    id: "shimmer",
    name: "Shimmer",
    voiceId: "shimmer",
    hint: "Soft, airy",
    language: "English",
  },
  {
    id: "verse",
    name: "Verse",
    voiceId: "verse",
    hint: "Conversational, lively",
    language: "English",
  },
];

function languageFromElevenHint(hint: string | undefined): string {
  const prefix = (hint ?? "").split(",")[0]?.trim();
  return prefix && prefix.length > 0 ? prefix : "Other";
}

function normalizeLoadedVoiceConfig(input?: VoiceConfig): VoiceConfig {
  if (!input) {
    return { provider: "cloud" };
  }

  const provider = input.provider;
  const legacyMode = input.mode;

  // Legacy migration: old model was provider=elevenlabs + mode=cloud.
  if ((provider === "elevenlabs" || !provider) && legacyMode === "cloud") {
    return {
      provider: "cloud",
      cloud: {
        voiceId: input.cloud?.voiceId ?? input.elevenlabs?.voiceId,
        modelId: input.cloud?.modelId ?? input.elevenlabs?.modelId,
      },
      elevenlabs: input.elevenlabs,
      edge: input.edge,
    };
  }

  if (
    provider === "cloud" ||
    provider === "elevenlabs" ||
    provider === "edge"
  ) {
    return {
      ...input,
      provider,
      mode: undefined,
    };
  }

  return {
    ...input,
    provider: "cloud",
    mode: undefined,
  };
}

export function VoiceConfigView() {
  const { t, elizaCloudConnected } = useApp();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);
  const [voiceLanguageFilter, setVoiceLanguageFilter] = useState("all");
  const [customVoiceIdInput, setCustomVoiceIdInput] = useState("");
  const [voiceConfig, setVoiceConfig] = useState<VoiceConfig>({
    provider: "cloud",
  });
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const cfg = await client.getConfig();
        const messages = cfg.messages as { tts?: VoiceConfig } | undefined;
        setVoiceConfig(normalizeLoadedVoiceConfig(messages?.tts));
      } catch {
        setVoiceConfig({ provider: "cloud" });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      audioRef.current = null;
    };
  }, []);

  const currentProvider = (voiceConfig.provider ?? "cloud") as ProviderId;

  const isConfigured = useMemo(() => {
    if (currentProvider === "cloud") {
      return elizaCloudConnected;
    }
    if (currentProvider === "elevenlabs") {
      return Boolean(voiceConfig.elevenlabs?.apiKey);
    }
    return true;
  }, [currentProvider, elizaCloudConnected, voiceConfig.elevenlabs?.apiKey]);

  const allLanguages = useMemo(() => {
    if (currentProvider === "cloud") {
      return ["all", ...new Set(CLOUD_VOICE_PRESETS.map((v) => v.language))];
    }
    if (currentProvider === "elevenlabs") {
      return [
        "all",
        ...new Set(PREMADE_VOICES.map((v) => languageFromElevenHint(v.hint))),
      ];
    }
    return ["all"];
  }, [currentProvider]);

  const visibleCloudVoices = useMemo(() => {
    if (currentProvider !== "cloud") {
      return [];
    }
    return CLOUD_VOICE_PRESETS.filter((v) =>
      voiceLanguageFilter === "all" ? true : v.language === voiceLanguageFilter,
    ).sort((a, b) => a.name.localeCompare(b.name));
  }, [currentProvider, voiceLanguageFilter]);

  const visibleElevenVoices = useMemo(() => {
    if (currentProvider !== "elevenlabs") {
      return [];
    }
    return PREMADE_VOICES.filter((v) => {
      const lang = languageFromElevenHint(v.hint);
      return voiceLanguageFilter === "all"
        ? true
        : lang === voiceLanguageFilter;
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [currentProvider, voiceLanguageFilter]);

  const selectedVoiceId = useMemo(() => {
    if (currentProvider === "cloud") {
      return voiceConfig.cloud?.voiceId;
    }
    if (currentProvider === "elevenlabs") {
      return voiceConfig.elevenlabs?.voiceId;
    }
    return undefined;
  }, [
    currentProvider,
    voiceConfig.cloud?.voiceId,
    voiceConfig.elevenlabs?.voiceId,
  ]);

  const handleProviderChange = useCallback((provider: ProviderId) => {
    setVoiceConfig((prev) => ({ ...prev, provider }));
    setVoiceLanguageFilter("all");
    setTestError(null);
    setDirty(true);
  }, []);

  const handleCloudVoiceSelect = useCallback((voiceId: string) => {
    setVoiceConfig((prev) => ({
      ...prev,
      cloud: {
        ...prev.cloud,
        voiceId,
      },
    }));
    setDirty(true);
  }, []);

  const handleElevenApiKeyChange = useCallback((apiKey: string) => {
    setVoiceConfig((prev) => ({
      ...prev,
      elevenlabs: {
        ...prev.elevenlabs,
        apiKey: apiKey || undefined,
      },
    }));
    setDirty(true);
  }, []);

  const handleElevenVoiceSelect = useCallback((voiceId: string) => {
    setVoiceConfig((prev) => ({
      ...prev,
      elevenlabs: {
        ...prev.elevenlabs,
        voiceId,
      },
    }));
    setDirty(true);
  }, []);

  const handleTestVoice = useCallback(async () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    setTesting(true);
    setTestError(null);

    try {
      if (currentProvider === "edge") {
        throw new Error(
          "Voice test is not supported for Microsoft Edge provider.",
        );
      }

      const text = "Hello from your selected voice.";
      let response: Response;

      if (currentProvider === "cloud") {
        const voiceId = voiceConfig.cloud?.voiceId;
        if (!voiceId) {
          throw new Error("Select an Eliza Cloud voice before testing.");
        }

        response = await fetch("/api/tts/cloud", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text,
            voiceId,
            modelId: voiceConfig.cloud?.modelId ?? DEFAULT_CLOUD_MODEL,
          }),
        });
      } else {
        const voiceId = voiceConfig.elevenlabs?.voiceId;
        if (!voiceId) {
          throw new Error("Select an ElevenLabs voice before testing.");
        }

        const rawApiKey = voiceConfig.elevenlabs?.apiKey;
        const providedApiKey =
          typeof rawApiKey === "string" &&
            rawApiKey.trim().length > 0 &&
            rawApiKey !== "[REDACTED]"
            ? rawApiKey.trim()
            : undefined;

        response = await fetch("/api/tts/elevenlabs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text,
            voiceId,
            modelId: voiceConfig.elevenlabs?.modelId ?? DEFAULT_ELEVEN_MODEL,
            ...(providedApiKey ? { apiKey: providedApiKey } : {}),
          }),
        });
      }

      if (!response.ok) {
        const upstreamBody = await response.text().catch(() => "");
        throw new Error(
          upstreamBody || `Voice test failed (${response.status})`,
        );
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => {
        URL.revokeObjectURL(url);
        setTesting(false);
      };
      audio.onerror = () => {
        URL.revokeObjectURL(url);
        setTesting(false);
        setTestError("Playback failed.");
      };
      await audio.play();
    } catch (err) {
      setTesting(false);
      setTestError(err instanceof Error ? err.message : "Voice test failed.");
    }
  }, [currentProvider, voiceConfig]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      const cfg = await client.getConfig();
      const messages = (cfg.messages ?? {}) as Record<string, unknown>;
      const provider = (voiceConfig.provider ?? "cloud") as ProviderId;
      const normalized: VoiceConfig = {
        ...voiceConfig,
        provider,
        mode: undefined,
        cloud: {
          ...voiceConfig.cloud,
          modelId: voiceConfig.cloud?.modelId ?? DEFAULT_CLOUD_MODEL,
        },
        elevenlabs: {
          ...voiceConfig.elevenlabs,
          modelId: voiceConfig.elevenlabs?.modelId ?? DEFAULT_ELEVEN_MODEL,
          apiKey: sanitizeApiKey(voiceConfig.elevenlabs?.apiKey),
        },
      };

      await client.updateConfig({
        messages: {
          ...messages,
          tts: normalized,
        },
      });

      dispatchWindowEvent(VOICE_CONFIG_UPDATED_EVENT, normalized);
      setVoiceConfig(normalized);
      setSaveSuccess(true);
      setDirty(false);
      window.setTimeout(() => setSaveSuccess(false), 2500);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }, [voiceConfig]);

  if (loading) {
    return (
      <div className="py-4 text-center text-[var(--muted)] text-xs">
        {t("voiceconfigview.LoadingVoiceConfig")}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="text-xs font-semibold text-[var(--muted)]">
          TTS Provider
        </div>
        <div className="flex gap-2">
          {PROVIDER_CARDS.map((p) => (
            <Button
              key={p.id}
              variant="outline"
              size="sm"
              className={`flex-1 h-auto flex-col py-2 ${currentProvider === p.id
                ? "border-[var(--accent)] bg-[var(--accent)]/20"
                : ""
                }`}
              onClick={() => handleProviderChange(p.id)}
            >
              <div className="font-semibold">{p.label}</div>
              <div className="text-[10px] opacity-70 mt-0.5">{p.hint}</div>
            </Button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between py-2 px-3 border border-[var(--border)] bg-[var(--bg-muted)]">
        <span className="text-xs">
          {currentProvider === "cloud"
            ? "Eliza Cloud voice catalog"
            : currentProvider === "elevenlabs"
              ? "ElevenLabs voice catalog"
              : "Microsoft Edge local voices"}
        </span>
        <span
          className={`rounded-full border px-1.5 py-0.5 text-[10px] ${isConfigured
            ? "border-green-600 bg-green-600/10 text-[var(--text)]"
            : "border-[var(--warn)] bg-[var(--warn-subtle)] text-[var(--text)]"
            }`}
        >
          {isConfigured
            ? t("mediasettingssection.Configured")
            : t("mediasettingssection.NeedsSetup")}
        </span>
      </div>

      {currentProvider === "cloud" && (
        <div className="flex flex-col gap-3">
          {!elizaCloudConnected && (
            <div className="py-2 px-3 border border-[var(--warn)] bg-[var(--warn-subtle)] text-xs text-[var(--text)]">
              {t("elizaclouddashboard.ElizaCloudNotConnected")}
            </div>
          )}

          <div className="flex flex-col gap-2">
            <div className="text-xs font-semibold">Voice</div>
            <div className="flex flex-wrap gap-1.5">
              {allLanguages.map((lang) => (
                <Button
                  key={`cloud-voice-lang-${lang}`}
                  variant="outline"
                  size="sm"
                  className={`text-[10px] px-2 py-1 ${voiceLanguageFilter === lang
                    ? "border-[var(--accent)] bg-[var(--accent)]/20 text-white"
                    : ""
                    }`}
                  onClick={() => setVoiceLanguageFilter(lang)}
                >
                  {lang === "all" ? "All Languages" : lang}
                </Button>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-1.5">
              {visibleCloudVoices.map((preset) => {
                const active = selectedVoiceId === preset.voiceId;
                return (
                  <Button
                    key={preset.id}
                    variant="outline"
                    size="sm"
                    className={`h-auto flex-col items-start py-1.5 px-2 text-left ${active
                      ? "border-[var(--accent)] bg-[var(--accent)]/20 text-white shadow-[0_0_0_1px_var(--accent)]"
                      : ""
                      }`}
                    onClick={() => handleCloudVoiceSelect(preset.voiceId)}
                  >
                    <div className="font-semibold truncate w-full">
                      {preset.name}
                    </div>
                    <div className="text-[10px] opacity-70 truncate w-full">
                      {preset.hint}
                    </div>
                  </Button>
                );
              })}
            </div>

            {selectedVoiceId && (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="font-semibold"
                  disabled={testing}
                  onClick={() => void handleTestVoice()}
                >
                  {testing
                    ? t("voiceconfigview.Playing")
                    : "Test Selected Voice"}
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {currentProvider === "elevenlabs" && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold">ElevenLabs API Key</span>
            <Input
              type="password"
              className="bg-card text-xs"
              placeholder={
                voiceConfig.elevenlabs?.apiKey
                  ? t("mediasettingssection.ApiKeySetLeaveBlank")
                  : t("mediasettingssection.EnterApiKey")
              }
              onChange={(e) => handleElevenApiKeyChange(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-2">
            <div className="text-xs font-semibold">Voice</div>
            <div className="flex flex-wrap gap-1.5">
              {allLanguages.map((lang) => (
                <Button
                  key={`eleven-voice-lang-${lang}`}
                  variant="outline"
                  size="sm"
                  className={`text-[10px] px-2 py-1 ${voiceLanguageFilter === lang
                    ? "border-[var(--accent)] bg-[var(--accent)]/20 text-white"
                    : ""
                    }`}
                  onClick={() => setVoiceLanguageFilter(lang)}
                >
                  {lang === "all" ? "All Languages" : lang}
                </Button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <Input
                type="text"
                className="bg-card text-xs"
                placeholder="Paste custom ElevenLabs voice ID"
                value={customVoiceIdInput}
                onChange={(e) => setCustomVoiceIdInput(e.target.value)}
              />
              <Button
                variant="outline"
                size="sm"
                className="shrink-0 font-semibold"
                onClick={() => {
                  const trimmed = customVoiceIdInput.trim();
                  if (!trimmed) return;
                  handleElevenVoiceSelect(trimmed);
                }}
              >
                Use Voice ID
              </Button>
            </div>

            <div className="grid grid-cols-3 gap-1.5">
              {visibleElevenVoices.map((preset) => {
                const active = selectedVoiceId === preset.voiceId;
                return (
                  <Button
                    key={preset.id}
                    variant="outline"
                    size="sm"
                    className={`h-auto flex-col items-start py-1.5 px-2 text-left ${active
                      ? "border-[var(--accent)] bg-[var(--accent)]/20 text-white shadow-[0_0_0_1px_var(--accent)]"
                      : ""
                      }`}
                    onClick={() => handleElevenVoiceSelect(preset.voiceId)}
                  >
                    <div className="font-semibold truncate w-full">
                      {preset.name}
                    </div>
                    <div className="text-[10px] opacity-70 truncate w-full">
                      {preset.hint}
                    </div>
                  </Button>
                );
              })}
            </div>

            {selectedVoiceId && (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="font-semibold"
                  disabled={testing}
                  onClick={() => void handleTestVoice()}
                >
                  {testing
                    ? t("voiceconfigview.Playing")
                    : "Test Selected Voice"}
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {currentProvider === "edge" && (
        <div className="py-2 px-3 border border-[var(--border)] bg-[var(--bg-muted)] text-xs text-[var(--muted)]">
          {t("voiceconfigview.EdgeTTSUsesMicros")}
        </div>
      )}

      {testError && (
        <div className="text-[10px] text-[var(--warn)]">{testError}</div>
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
