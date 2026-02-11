/**
 * VoiceConfigView — TTS/STT provider selection and configuration.
 *
 * Similar to MediaSettingsSection pattern:
 *   - Provider selection (ElevenLabs, Edge TTS, etc.)
 *   - API key inputs where needed
 *   - Voice preset selection
 *   - Test functionality
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { useApp } from "../AppContext";
import {
  client,
  type VoiceConfig,
  type VoiceMode,
  type VoiceProvider,
} from "../api-client";

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
  { id: "rachel", name: "Rachel", voiceId: "21m00Tcm4TlvDq8ikWAM", gender: "female", hint: "Calm, clear", previewUrl: "https://storage.googleapis.com/eleven-public-prod/premade/voices/21m00Tcm4TlvDq8ikWAM/df6788f9-5c96-470d-8312-aab3b3d8f50a.mp3" },
  { id: "sarah", name: "Sarah", voiceId: "EXAVITQu4vr4xnSDxMaL", gender: "female", hint: "Soft, warm", previewUrl: "https://storage.googleapis.com/eleven-public-prod/premade/voices/EXAVITQu4vr4xnSDxMaL/6851ec91-9950-471f-8586-357c52539069.mp3" },
  { id: "matilda", name: "Matilda", voiceId: "XrExE9yKIg1WjnnlVkGX", gender: "female", hint: "Warm, friendly", previewUrl: "https://storage.googleapis.com/eleven-public-prod/premade/voices/XrExE9yKIg1WjnnlVkGX/b930e18d-6b4d-466e-bab2-0ae97c6d8535.mp3" },
  { id: "lily", name: "Lily", voiceId: "pFZP5JQG7iQjIQuC4Bku", gender: "female", hint: "British, raspy", previewUrl: "https://storage.googleapis.com/eleven-public-prod/premade/voices/pFZP5JQG7iQjIQuC4Bku/0ab8bd74-fcd2-489d-b70a-3e1bcde8c999.mp3" },
  // Male
  { id: "brian", name: "Brian", voiceId: "nPczCjzI2devNBz1zQrb", gender: "male", hint: "Deep, smooth", previewUrl: "https://storage.googleapis.com/eleven-public-prod/premade/voices/nPczCjzI2devNBz1zQrb/f4dbda0c-aff0-45c0-93fa-f5d5ec95a2eb.mp3" },
  { id: "adam", name: "Adam", voiceId: "pNInz6obpgDQGcFmaJgB", gender: "male", hint: "Deep, authoritative", previewUrl: "https://storage.googleapis.com/eleven-public-prod/premade/voices/pNInz6obpgDQGcFmaJgB/38a69695-2ca9-4b9e-b9ec-f07ced494a58.mp3" },
  { id: "josh", name: "Josh", voiceId: "TxGEqnHWrfWFTfGW9XjX", gender: "male", hint: "Young, deep", previewUrl: "https://storage.googleapis.com/eleven-public-prod/premade/voices/TxGEqnHWrfWFTfGW9XjX/3ae2fc71-d5f9-4769-bb71-2a43633cd186.mp3" },
  { id: "daniel", name: "Daniel", voiceId: "onwK4e9ZLuTAKqWW03F9", gender: "male", hint: "British, presenter", previewUrl: "https://storage.googleapis.com/eleven-public-prod/premade/voices/onwK4e9ZLuTAKqWW03F9/7eee0236-1a72-4b86-b303-5dcadc007ba9.mp3" },
  // Character
  { id: "gigi", name: "Gigi", voiceId: "jBpfuIE2acCO8z3wKNLl", gender: "character", hint: "Childish, cute", previewUrl: "https://storage.googleapis.com/eleven-public-prod/premade/voices/jBpfuIE2acCO8z3wKNLl/3a7e4339-78fa-404e-8d10-c3ef5587935b.mp3" },
  { id: "mimi", name: "Mimi", voiceId: "zrHiDhphv9ZnVXBqCLjz", gender: "character", hint: "Cute, animated", previewUrl: "https://storage.googleapis.com/eleven-public-prod/premade/voices/zrHiDhphv9ZnVXBqCLjz/decbf20b-0f57-4fac-985b-a4f0290ebfc4.mp3" },
  { id: "charlotte", name: "Charlotte", voiceId: "XB0fDUnXU5powFXDhCwa", gender: "character", hint: "Alluring, game NPC", previewUrl: "https://storage.googleapis.com/eleven-public-prod/premade/voices/XB0fDUnXU5powFXDhCwa/942356dc-f10d-4d89-bda5-4f8505ee038b.mp3" },
];

const PROVIDERS: Array<{ id: VoiceProvider; label: string; hint: string; needsKey: boolean }> = [
  { id: "elevenlabs", label: "ElevenLabs", hint: "High quality, realistic voices", needsKey: true },
  { id: "edge", label: "Edge TTS", hint: "Free, Microsoft voices", needsKey: false },
  { id: "simple-voice", label: "Simple Voice", hint: "Basic browser TTS", needsKey: false },
];

export function VoiceConfigView() {
  const { cloudConnected } = useApp();
  const [voiceConfig, setVoiceConfig] = useState<VoiceConfig>({});
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
        const messages = cfg.messages as Record<string, Record<string, unknown>> | undefined;
        const tts = messages?.tts as VoiceConfig | undefined;
        if (tts) {
          setVoiceConfig(tts);
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
    currentProvider !== "elevenlabs"
      ? true
      : currentMode === "cloud"
        ? cloudConnected
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
      await client.updateConfig({
        messages: {
          ...messages,
          tts: {
            ...voiceConfig,
            provider: voiceConfig.provider ?? "elevenlabs",
            mode:
              (voiceConfig.provider ?? "elevenlabs") === "elevenlabs"
                ? (voiceConfig.mode ?? "own-key")
                : undefined,
          },
        },
      });
      setSaveSuccess(true);
      setDirty(false);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save");
    }
    setSaving(false);
  }, [voiceConfig]);

  if (loading) {
    return (
      <div className="py-4 text-center text-[var(--muted)] text-xs">
        Loading voice configuration...
      </div>
    );
  }

  const selectedVoiceId = voiceConfig.elevenlabs?.voiceId;
  const selectedPreset = VOICE_PRESETS.find((p) => p.voiceId === selectedVoiceId);

  return (
    <div className="flex flex-col gap-4">
      {/* Provider selection */}
      <div className="flex flex-col gap-2">
        <div className="text-xs font-semibold text-[var(--muted)]">TTS Provider</div>
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
                <div className="text-[10px] text-[var(--muted)] mt-0.5">{p.hint}</div>
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
            <div className="flex border border-[var(--border)]">
              <button
                type="button"
                className={`px-3 py-1.5 text-xs font-semibold cursor-pointer transition-colors ${
                  currentMode === "cloud"
                    ? "bg-[var(--accent)] text-[var(--accent-foreground)]"
                    : "bg-[var(--card)] text-[var(--muted)] hover:text-[var(--text)]"
                }`}
                onClick={() => handleModeChange("cloud")}
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
                onClick={() => handleModeChange("own-key")}
              >
                Own API Key
              </button>
            </div>
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
                    Eliza Cloud not connected. Connect in Settings.
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 border border-yellow-600 text-yellow-600">
                    Offline
                  </span>
                </>
              )}
            </div>
          )}

          {/* API Key */}
          {currentMode === "own-key" && (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold">ElevenLabs API Key</label>
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
                    <div className="text-[10px] text-[var(--muted)]">{preset.hint}</div>
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
          Edge TTS uses Microsoft's free text-to-speech service. No configuration needed.
        </div>
      )}

      {/* Simple voice settings */}
      {currentProvider === "simple-voice" && (
        <div className="py-2 px-3 border border-[var(--border)] bg-[var(--bg-muted)] text-xs text-[var(--muted)]">
          Simple Voice uses your browser's built-in speech synthesis. No configuration needed.
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
