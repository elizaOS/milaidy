/**
 * StreamVoiceConfig — full voice/TTS config panel for StreamView.
 *
 * Provider selection, voice presets, auto-speak toggle, test TTS,
 * and API key configuration — all in one compact panel.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  client,
  type VoiceConfig,
  type VoiceProvider,
} from "../../api-client";
import { dispatchWindowEvent, VOICE_CONFIG_UPDATED_EVENT } from "../../events";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface VoiceStatus {
  enabled: boolean;
  autoSpeak: boolean;
  provider: string | null;
  configuredProvider: string | null;
  hasApiKey: boolean;
  isSpeaking: boolean;
  isAttached: boolean;
}

interface VoicePreset {
  id: string;
  name: string;
  voiceId: string;
  gender: "female" | "male" | "character";
  hint: string;
  previewUrl: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROVIDERS: Array<{
  id: VoiceProvider;
  label: string;
  hint: string;
  needsKey: boolean;
}> = [
  {
    id: "elevenlabs",
    label: "ElevenLabs",
    hint: "High quality, realistic",
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
    hint: "Browser built-in TTS",
    needsKey: false,
  },
];

const VOICE_PRESETS: VoicePreset[] = [
  { id: "rachel", name: "Rachel", voiceId: "21m00Tcm4TlvDq8ikWAM", gender: "female", hint: "Calm, clear", previewUrl: "https://storage.googleapis.com/eleven-public-prod/premade/voices/21m00Tcm4TlvDq8ikWAM/df6788f9-5c96-470d-8312-aab3b3d8f50a.mp3" },
  { id: "sarah", name: "Sarah", voiceId: "EXAVITQu4vr4xnSDxMaL", gender: "female", hint: "Soft, warm", previewUrl: "https://storage.googleapis.com/eleven-public-prod/premade/voices/EXAVITQu4vr4xnSDxMaL/6851ec91-9950-471f-8586-357c52539069.mp3" },
  { id: "matilda", name: "Matilda", voiceId: "XrExE9yKIg1WjnnlVkGX", gender: "female", hint: "Warm, friendly", previewUrl: "https://storage.googleapis.com/eleven-public-prod/premade/voices/XrExE9yKIg1WjnnlVkGX/b930e18d-6b4d-466e-bab2-0ae97c6d8535.mp3" },
  { id: "lily", name: "Lily", voiceId: "pFZP5JQG7iQjIQuC4Bku", gender: "female", hint: "British, raspy", previewUrl: "https://storage.googleapis.com/eleven-public-prod/premade/voices/pFZP5JQG7iQjIQuC4Bku/0ab8bd74-fcd2-489d-b70a-3e1bcde8c999.mp3" },
  { id: "brian", name: "Brian", voiceId: "nPczCjzI2devNBz1zQrb", gender: "male", hint: "Deep, smooth", previewUrl: "https://storage.googleapis.com/eleven-public-prod/premade/voices/nPczCjzI2devNBz1zQrb/f4dbda0c-aff0-45c0-93fa-f5d5ec95a2eb.mp3" },
  { id: "adam", name: "Adam", voiceId: "pNInz6obpgDQGcFmaJgB", gender: "male", hint: "Deep, authoritative", previewUrl: "https://storage.googleapis.com/eleven-public-prod/premade/voices/pNInz6obpgDQGcFmaJgB/38a69695-2ca9-4b9e-b9ec-f07ced494a58.mp3" },
  { id: "josh", name: "Josh", voiceId: "TxGEqnHWrfWFTfGW9XjX", gender: "male", hint: "Young, deep", previewUrl: "https://storage.googleapis.com/eleven-public-prod/premade/voices/TxGEqnHWrfWFTfGW9XjX/3ae2fc71-d5f9-4769-bb71-2a43633cd186.mp3" },
  { id: "daniel", name: "Daniel", voiceId: "onwK4e9ZLuTAKqWW03F9", gender: "male", hint: "British, presenter", previewUrl: "https://storage.googleapis.com/eleven-public-prod/premade/voices/onwK4e9ZLuTAKqWW03F9/7eee0236-1a72-4b86-b303-5dcadc007ba9.mp3" },
  { id: "gigi", name: "Gigi", voiceId: "jBpfuIE2acCO8z3wKNLl", gender: "character", hint: "Childish, cute", previewUrl: "https://storage.googleapis.com/eleven-public-prod/premade/voices/jBpfuIE2acCO8z3wKNLl/3a7e4339-78fa-404e-8d10-c3ef5587935b.mp3" },
  { id: "mimi", name: "Mimi", voiceId: "zrHiDhphv9ZnVXBqCLjz", gender: "character", hint: "Cute, animated", previewUrl: "https://storage.googleapis.com/eleven-public-prod/premade/voices/zrHiDhphv9ZnVXBqCLjz/decbf20b-0f57-4fac-985b-a4f0290ebfc4.mp3" },
  { id: "charlotte", name: "Charlotte", voiceId: "XB0fDUnXU5powFXDhCwa", gender: "character", hint: "Alluring, game NPC", previewUrl: "https://storage.googleapis.com/eleven-public-prod/premade/voices/XB0fDUnXU5powFXDhCwa/942356dc-f10d-4d89-bda5-4f8505ee038b.mp3" },
];

const DEFAULT_ELEVEN_MODEL = "eleven_flash_v2_5";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function StreamVoiceConfig({ streamLive }: { streamLive: boolean }) {
  // Stream voice status (polled)
  const [status, setStatus] = useState<VoiceStatus | null>(null);
  const [speaking, setSpeaking] = useState(false);

  // Full voice config (loaded from server config)
  const [voiceConfig, setVoiceConfig] = useState<VoiceConfig>({});
  const [configLoaded, setConfigLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Audio preview
  const [previewPlaying, setPreviewPlaying] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Poll voice status
  useEffect(() => {
    let mounted = true;
    const poll = async () => {
      try {
        const res = await client.getStreamVoice();
        if (mounted && res.ok) {
          setStatus(res);
          setSpeaking(res.isSpeaking);
        }
      } catch {}
    };
    poll();
    const id = setInterval(poll, 5_000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, []);

  // Load full voice config from server
  useEffect(() => {
    void (async () => {
      try {
        const cfg = await client.getConfig();
        const messages = cfg.messages as
          | Record<string, Record<string, unknown>>
          | undefined;
        const tts = messages?.tts as VoiceConfig | undefined;
        if (tts) setVoiceConfig(tts);
      } catch {}
      setConfigLoaded(true);
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

  const currentProvider: VoiceProvider = voiceConfig.provider ?? "elevenlabs";
  const currentVoiceId = voiceConfig.elevenlabs?.voiceId;
  const selectedPreset = VOICE_PRESETS.find((p) => p.voiceId === currentVoiceId);

  // ── Handlers ─────────────────────────────────────────────────────────

  const toggleEnabled = useCallback(async () => {
    if (!status) return;
    const next = !status.enabled;
    try {
      const res = await client.saveStreamVoice({ enabled: next });
      if (res.ok) {
        setStatus((prev) =>
          prev ? { ...prev, enabled: res.voice.enabled } : prev,
        );
      }
    } catch {}
  }, [status]);

  const toggleAutoSpeak = useCallback(async () => {
    if (!status) return;
    const next = !status.autoSpeak;
    try {
      const res = await client.saveStreamVoice({ autoSpeak: next });
      if (res.ok) {
        setStatus((prev) =>
          prev ? { ...prev, autoSpeak: res.voice.autoSpeak } : prev,
        );
      }
    } catch {}
  }, [status]);

  const handleProviderChange = useCallback(
    async (provider: VoiceProvider) => {
      setVoiceConfig((prev) => ({ ...prev, provider }));
      // Also update the stream voice provider setting
      await client.saveStreamVoice({ provider }).catch(() => {});
    },
    [],
  );

  const handleVoiceSelect = useCallback((voiceId: string) => {
    setVoiceConfig((prev) => ({
      ...prev,
      elevenlabs: { ...prev.elevenlabs, voiceId },
    }));
  }, []);

  const handleApiKeyChange = useCallback((apiKey: string) => {
    setVoiceConfig((prev) => ({
      ...prev,
      elevenlabs: { ...prev.elevenlabs, apiKey: apiKey || undefined },
    }));
  }, []);

  const handlePreviewVoice = useCallback(
    (previewUrl: string, voiceId: string) => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (previewPlaying === voiceId) {
        setPreviewPlaying(null);
        return;
      }
      setPreviewPlaying(voiceId);
      const audio = new Audio(previewUrl);
      audioRef.current = audio;
      audio.onended = () => setPreviewPlaying(null);
      audio.onerror = () => setPreviewPlaying(null);
      audio.play().catch(() => setPreviewPlaying(null));
    },
    [previewPlaying],
  );

  const testSpeak = useCallback(async () => {
    if (speaking) return;
    setSpeaking(true);
    try {
      await client.streamVoiceSpeak("Hello, I am now speaking on the stream.");
    } catch {}
    setTimeout(() => setSpeaking(false), 3000);
  }, [speaking]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaveSuccess(false);
    try {
      const cfg = await client.getConfig();
      const messages = (cfg.messages ?? {}) as Record<string, unknown>;
      const provider = voiceConfig.provider ?? "elevenlabs";
      const normalizedElevenLabs =
        provider === "elevenlabs"
          ? {
              ...voiceConfig.elevenlabs,
              modelId: voiceConfig.elevenlabs?.modelId ?? DEFAULT_ELEVEN_MODEL,
            }
          : voiceConfig.elevenlabs;

      // Don't send [REDACTED] keys back
      if (normalizedElevenLabs?.apiKey === "[REDACTED]") {
        delete normalizedElevenLabs.apiKey;
      }

      const normalizedConfig: VoiceConfig = {
        ...voiceConfig,
        provider,
        mode: provider === "elevenlabs" ? (voiceConfig.mode ?? "own-key") : undefined,
        elevenlabs: normalizedElevenLabs,
      };

      await client.updateConfig({
        messages: { ...messages, tts: normalizedConfig },
      });
      dispatchWindowEvent(VOICE_CONFIG_UPDATED_EVENT, normalizedConfig);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch {}
    setSaving(false);
  }, [voiceConfig]);

  // ── Render ───────────────────────────────────────────────────────────

  if (!configLoaded) {
    return (
      <div className="py-4 text-center text-muted text-[11px]">
        Loading voice config...
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* ── Enable TTS toggle ── */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[12px] text-txt font-medium">Stream TTS</div>
          <div className="text-[10px] text-muted">
            Enable text-to-speech on the RTMP stream
          </div>
        </div>
        <button
          type="button"
          onClick={toggleEnabled}
          className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 cursor-pointer ${
            status?.enabled ? "bg-accent" : "bg-border-strong"
          }`}
        >
          <span
            className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
              status?.enabled ? "translate-x-4.5" : "translate-x-0.5"
            }`}
          />
        </button>
      </div>

      {/* ── Auto-speak toggle ── */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[12px] text-txt font-medium">Auto-speak</div>
          <div className="text-[10px] text-muted">
            Automatically speak agent responses
          </div>
        </div>
        <button
          type="button"
          onClick={toggleAutoSpeak}
          className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 cursor-pointer ${
            status?.autoSpeak ? "bg-accent" : "bg-border-strong"
          }`}
        >
          <span
            className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
              status?.autoSpeak ? "translate-x-4.5" : "translate-x-0.5"
            }`}
          />
        </button>
      </div>

      {/* ── Provider selection ── */}
      <div className="border-t border-border-strong pt-3">
        <div className="text-[11px] text-muted font-medium mb-1.5">
          TTS Provider
        </div>
        <div className="flex flex-col gap-1.5">
          {PROVIDERS.map((p) => {
            const isActive = currentProvider === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => handleProviderChange(p.id)}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border transition-colors cursor-pointer text-left ${
                  isActive
                    ? "border-accent/50 bg-accent-subtle"
                    : "border-border-strong bg-bg-elevated/50 hover:border-accent/30"
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${
                    isActive ? "bg-accent" : "bg-border-strong"
                  }`}
                />
                <div className="flex-1 min-w-0">
                  <div
                    className={`text-[12px] font-medium ${
                      isActive ? "text-accent" : "text-txt"
                    }`}
                  >
                    {p.label}
                  </div>
                  <div className="text-[10px] text-muted">{p.hint}</div>
                </div>
                {p.needsKey && (
                  <span
                    className={`text-[9px] px-1.5 py-0.5 rounded-full ${
                      status?.hasApiKey
                        ? "bg-emerald-500/10 text-emerald-400"
                        : "bg-amber-500/10 text-amber-400"
                    }`}
                  >
                    {status?.hasApiKey ? "Key set" : "Need key"}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── ElevenLabs API key ── */}
      {currentProvider === "elevenlabs" && (
        <div className="border-t border-border-strong pt-3">
          <div className="text-[11px] text-muted font-medium mb-1.5">
            ElevenLabs API Key
          </div>
          <input
            type="password"
            defaultValue={voiceConfig.elevenlabs?.apiKey ?? ""}
            placeholder="sk_..."
            className="w-full bg-bg-elevated border border-border-strong text-txt text-[11px] rounded-md px-2.5 py-1.5 outline-none focus:border-accent"
            onBlur={(e) => handleApiKeyChange(e.target.value.trim())}
          />
          <p className="text-[9px] text-muted mt-1">
            Get your key at{" "}
            <span className="text-accent">elevenlabs.io/app/settings/api-keys</span>
          </p>
        </div>
      )}

      {/* ── Voice presets (ElevenLabs) ── */}
      {currentProvider === "elevenlabs" && (
        <div className="border-t border-border-strong pt-3">
          <div className="text-[11px] text-muted font-medium mb-1.5">
            Voice{selectedPreset ? ` — ${selectedPreset.name}` : ""}
          </div>
          <div className="grid grid-cols-2 gap-1 max-h-[180px] overflow-y-auto pr-1">
            {VOICE_PRESETS.map((preset) => {
              const isActive = currentVoiceId === preset.voiceId;
              const isPreviewing = previewPlaying === preset.voiceId;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handleVoiceSelect(preset.voiceId)}
                  className={`relative flex items-center gap-1.5 px-2 py-1.5 rounded-md border transition-all cursor-pointer text-left ${
                    isActive
                      ? "border-accent/50 bg-accent-subtle"
                      : "border-border-strong bg-bg-elevated/50 hover:border-accent/30"
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div
                      className={`text-[11px] font-medium ${
                        isActive ? "text-accent" : "text-txt"
                      }`}
                    >
                      {preset.name}
                    </div>
                    <div className="text-[9px] text-muted truncate">
                      {preset.hint}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePreviewVoice(preset.previewUrl, preset.voiceId);
                    }}
                    className={`shrink-0 w-5 h-5 rounded-full flex items-center justify-center transition-colors ${
                      isPreviewing
                        ? "bg-accent text-white"
                        : "bg-bg-elevated text-muted hover:text-txt"
                    }`}
                    title="Preview voice"
                  >
                    <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor">
                      {isPreviewing ? (
                        <rect x="1" y="1" width="6" height="6" rx="1" />
                      ) : (
                        <polygon points="1,0 8,4 1,8" />
                      )}
                    </svg>
                  </button>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Save config button ── */}
      <div className="border-t border-border-strong pt-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className={`w-full py-2 rounded-lg text-[12px] font-semibold transition-colors cursor-pointer disabled:opacity-50 ${
            saveSuccess
              ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
              : "bg-accent-subtle text-accent border border-accent/30 hover:bg-accent/20"
          }`}
        >
          {saving ? "Saving..." : saveSuccess ? "Saved!" : "Save Voice Config"}
        </button>
        <p className="text-[9px] text-muted mt-1 text-center">
          Saves provider, voice, and API key to agent config
        </p>
      </div>

      {/* ── Status + Test ── */}
      {status?.enabled && (
        <div className="border-t border-border-strong pt-3">
          <div className="text-[11px] text-muted font-medium mb-1.5">
            Status
          </div>
          <div className="space-y-1 text-[11px]">
            <div className="flex justify-between">
              <span className="text-muted">Provider</span>
              <span className="text-txt">
                {status.provider
                  ? status.provider.charAt(0).toUpperCase() +
                    status.provider.slice(1)
                  : "None"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">Bridge</span>
              <span
                className={
                  status.isAttached ? "text-emerald-400" : "text-muted"
                }
              >
                {status.isAttached ? "Attached" : "Detached"}
              </span>
            </div>
            {speaking && (
              <div className="flex justify-between">
                <span className="text-muted">Speaking</span>
                <span className="text-accent animate-pulse">Yes</span>
              </div>
            )}
          </div>

          {/* Test speak button */}
          {streamLive && status.isAttached && (
            <button
              type="button"
              onClick={testSpeak}
              disabled={speaking}
              className="mt-2 w-full py-1.5 rounded-lg bg-bg-elevated border border-border-strong text-txt text-[11px] hover:bg-bg-hover transition-colors cursor-pointer disabled:opacity-50"
            >
              {speaking ? "Speaking..." : "Test Voice on Stream"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
