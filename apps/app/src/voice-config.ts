import { client, type VoiceConfig } from "./api-client";
import type { UiSpec } from "./components/ui-spec";

export const DEFAULT_ELEVEN_FAST_MODEL = "eleven_flash_v2_5";
const REDACTED_SECRET = "[REDACTED]";

export function sanitizeApiKey(apiKey: string | undefined): string | undefined {
  if (typeof apiKey !== "string") return undefined;
  const trimmed = apiKey.trim();
  if (!trimmed || trimmed.toUpperCase() === REDACTED_SECRET) return undefined;
  return trimmed;
}

export function normalizeVoiceConfig(config: VoiceConfig): VoiceConfig {
  const provider = config.provider ?? "elevenlabs";
  const normalizedElevenLabs =
    provider === "elevenlabs"
      ? {
          ...config.elevenlabs,
          modelId: config.elevenlabs?.modelId ?? DEFAULT_ELEVEN_FAST_MODEL,
        }
      : config.elevenlabs;
  const sanitizedKey = sanitizeApiKey(normalizedElevenLabs?.apiKey);
  if (normalizedElevenLabs) {
    if (sanitizedKey) normalizedElevenLabs.apiKey = sanitizedKey;
    else delete normalizedElevenLabs.apiKey;
  }

  return {
    ...config,
    provider,
    mode: provider === "elevenlabs" ? (config.mode ?? "own-key") : undefined,
    elevenlabs: normalizedElevenLabs,
  };
}

export async function loadVoiceConfig(): Promise<VoiceConfig | null> {
  try {
    const cfg = await client.getConfig();
    const messages = cfg.messages as
      | Record<string, Record<string, unknown>>
      | undefined;
    const tts = messages?.tts as VoiceConfig | undefined;
    return tts ?? null;
  } catch {
    return null;
  }
}

export async function saveVoiceConfig(config: VoiceConfig): Promise<VoiceConfig> {
  const cfg = await client.getConfig();
  const messages = (cfg.messages ?? {}) as Record<string, unknown>;
  const normalized = normalizeVoiceConfig(config);
  await client.updateConfig({
    messages: {
      ...messages,
      tts: normalized,
    },
  });
  window.dispatchEvent(
    new CustomEvent("milady:voice-config-updated", {
      detail: normalized,
    }),
  );
  return normalized;
}

export function createVoiceSettingsUiSpec(
  currentConfig: VoiceConfig | null | undefined,
): UiSpec {
  const initial = normalizeVoiceConfig(currentConfig ?? {});

  return {
    root: "voice-card",
    state: {
      provider: initial.provider ?? "elevenlabs",
      mode: initial.mode ?? "own-key",
      elevenlabs: {
        apiKey: initial.elevenlabs?.apiKey ?? "",
        modelId: initial.elevenlabs?.modelId ?? DEFAULT_ELEVEN_FAST_MODEL,
        voiceId: initial.elevenlabs?.voiceId ?? "",
      },
      edge: {
        voice: initial.edge?.voice ?? "",
      },
    },
    elements: {
      "voice-card": {
        type: "Card",
        props: {
          title: "Voice controls",
          description:
            "Adjust TTS settings inline. Save applies immediately to chat playback.",
          maxWidth: "full",
        },
        children: ["voice-stack"],
      },
      "voice-stack": {
        type: "Stack",
        props: { gap: "md" },
        children: [
          "voice-provider",
          "voice-mode",
          "voice-voice-id",
          "voice-api-key",
          "voice-model-id",
          "voice-edge-voice",
          "voice-help",
          "voice-actions",
        ],
      },
      "voice-provider": {
        type: "Select",
        props: {
          label: "Provider",
          options: [
            { label: "ElevenLabs", value: "elevenlabs" },
            { label: "Simple Voice", value: "simple-voice" },
            { label: "Edge TTS", value: "edge" },
          ],
          statePath: "provider",
        },
        children: [],
      },
      "voice-mode": {
        type: "Select",
        props: {
          label: "ElevenLabs source",
          options: [
            { label: "Own API key", value: "own-key" },
            { label: "Eliza Cloud", value: "cloud" },
          ],
          statePath: "mode",
        },
        visible: { path: "provider", operator: "eq", value: "elevenlabs" },
        children: [],
      },
      "voice-voice-id": {
        type: "Input",
        props: {
          label: "ElevenLabs voice ID",
          placeholder: "21m00Tcm4TlvDq8ikWAM",
          statePath: "elevenlabs.voiceId",
        },
        visible: { path: "provider", operator: "eq", value: "elevenlabs" },
        children: [],
      },
      "voice-api-key": {
        type: "Input",
        props: {
          label: "ElevenLabs API key",
          placeholder: "Enter key or leave blank",
          statePath: "elevenlabs.apiKey",
          type: "password",
        },
        visible: {
          and: [
            { path: "provider", operator: "eq", value: "elevenlabs" },
            { path: "mode", operator: "eq", value: "own-key" },
          ],
        },
        children: [],
      },
      "voice-model-id": {
        type: "Input",
        props: {
          label: "ElevenLabs model",
          placeholder: DEFAULT_ELEVEN_FAST_MODEL,
          statePath: "elevenlabs.modelId",
        },
        visible: { path: "provider", operator: "eq", value: "elevenlabs" },
        children: [],
      },
      "voice-edge-voice": {
        type: "Input",
        props: {
          label: "Edge voice",
          placeholder: "en-US-AriaNeural",
          statePath: "edge.voice",
        },
        visible: { path: "provider", operator: "eq", value: "edge" },
        children: [],
      },
      "voice-help": {
        type: "Text",
        props: {
          text: "Slash commands: /clear resets the active conversation, /retry retries the last assistant turn, /voice opens this inline editor.",
          variant: "muted",
        },
        children: [],
      },
      "voice-actions": {
        type: "Stack",
        props: { direction: "horizontal", gap: "sm" },
        children: ["voice-refresh", "voice-save", "voice-mute-pause"],
      },
      "voice-refresh": {
        type: "Button",
        props: { label: "Refresh", variant: "secondary" },
        on: {
          press: {
            action: "client.voice.refresh",
          },
        },
        children: [],
      },
      "voice-save": {
        type: "Button",
        props: { label: "Save voice config", variant: "primary" },
        on: {
          press: {
            action: "client.voice.save",
            params: {
              edge: { $path: "edge" },
              elevenlabs: { $path: "elevenlabs" },
              mode: { $path: "mode" },
              provider: { $path: "provider" },
            },
          },
        },
        children: [],
      },
      "voice-mute-pause": {
        type: "Button",
        props: { label: "Mute voice + pause agent", variant: "ghost" },
        on: {
          press: {
            action: "client.quickAction.run",
            params: { id: "mute-voice-pause-agent" },
          },
        },
        children: [],
      },
    },
  };
}

export function buildVoiceSettingsMessage(
  currentConfig: VoiceConfig | null | undefined,
): string {
  const spec = createVoiceSettingsUiSpec(currentConfig);
  return [
    "Voice settings are editable directly in chat.",
    "",
    "```json",
    JSON.stringify(spec, null, 2),
    "```",
  ].join("\n");
}
