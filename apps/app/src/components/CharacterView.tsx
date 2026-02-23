/**
 * Character view — agent identity, personality, and avatar.
 *
 * Layout: 4 section cards
 *   1. Identity + Personality — name, avatar, bio, adjectives/topics, system prompt
 *   2. Style — 3-column style rule textareas
 *   3. Examples — collapsible chat + post examples
 *   4. Voice — voice selection + preview
 *   + Save bar at bottom
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../AppContext";
import { type CharacterData, client, type VoiceConfig } from "../api-client";
import type { ConfigUiHint } from "../types";
import { AvatarSelector } from "./AvatarSelector";
import type { JsonSchemaObject } from "./config-catalog";
import { ConfigRenderer, defaultRegistry } from "./config-renderer";

const DEFAULT_ELEVEN_FAST_MODEL = "eleven_flash_v2_5";
const REDACTED_SECRET = "[REDACTED]";

function sanitizeApiKey(apiKey: string | undefined): string | undefined {
  if (typeof apiKey !== "string") return undefined;
  const trimmed = apiKey.trim();
  if (!trimmed) return undefined;
  if (trimmed.toUpperCase() === REDACTED_SECRET) return undefined;
  return trimmed;
}

/* ── Tag Editor ─────────────────────────────────────────────────────── */

function TagEditor({
  label,
  items,
  onChange,
  placeholder = "add item...",
}: {
  label: string;
  items: string[];
  onChange: (items: string[]) => void;
  placeholder?: string;
}) {
  const [inputValue, setInputValue] = useState("");

  const addItem = () => {
    const trimmed = inputValue.trim();
    if (trimmed && !items.includes(trimmed)) {
      onChange([...items, trimmed]);
    }
    setInputValue("");
  };

  const removeItem = (index: number) => {
    const updated = [...items];
    updated.splice(index, 1);
    onChange(updated);
  };

  return (
    <div className="flex flex-col gap-1.5 h-[220px]">
      <span className="font-semibold text-xs">{label}</span>
      <div className="flex items-center gap-1.5">
        <input
          type="text"
          value={inputValue}
          placeholder={placeholder}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addItem();
            }
          }}
          className="px-2 py-1 border border-[var(--border)] bg-[var(--card)] text-[11px] focus:border-[var(--accent)] focus:outline-none flex-1 min-w-0"
        />
        <button
          type="button"
          className="text-[10px] px-1.5 py-0.5 border border-[var(--border)] bg-[var(--card)] cursor-pointer hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
          onClick={addItem}
        >
          + add
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto border border-[var(--border)] bg-[var(--bg-muted)] p-1.5 flex flex-wrap gap-1.5 content-start">
        {items.map((item, i) => (
          <span
            key={item}
            className="inline-flex items-center gap-1 px-2 py-0.5 border border-[var(--border)] bg-[var(--card)] text-[11px] h-fit"
          >
            {item}
            <button
              type="button"
              className="text-[var(--muted)] hover:text-[var(--danger,#e74c3c)] cursor-pointer text-[10px] leading-none"
              onClick={() => removeItem(i)}
            >
              &times;
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}

/* ── Themed Select ──────────────────────────────────────────────────── */

type SelectGroup<T extends string> = {
  label: string;
  items: { id: T; text: string; hint?: string }[];
};

function ThemedSelect<T extends string>({
  value,
  groups,
  onChange,
  placeholder = "select...",
}: {
  value: T | null;
  groups: SelectGroup<T>[];
  onChange: (id: T) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  // Find current label
  let currentLabel = placeholder;
  for (const g of groups) {
    const found = g.items.find((i) => i.id === value);
    if (found) {
      currentLabel = found.hint ? `${found.text} — ${found.hint}` : found.text;
      break;
    }
  }

  return (
    <div ref={ref} className="relative flex-1 min-w-0">
      <button
        type="button"
        className="w-full flex items-center justify-between px-2.5 py-1.5 border border-[var(--border)] bg-[var(--card)] text-xs text-left cursor-pointer hover:border-[var(--accent)] transition-colors focus:border-[var(--accent)] focus:outline-none"
        onClick={() => setOpen(!open)}
      >
        <span className="truncate">{currentLabel}</span>
        <span
          className={`ml-2 text-[10px] text-[var(--muted)] transition-transform ${open ? "rotate-180" : ""}`}
        >
          &#9660;
        </span>
      </button>

      {open && (
        <div className="absolute z-50 left-0 right-0 mt-0.5 max-h-[280px] overflow-y-auto border border-[var(--border)] bg-[var(--card)] shadow-lg">
          {groups.map((g) => (
            <div key={g.label}>
              <div className="px-2.5 py-1 text-[10px] font-semibold text-[var(--muted)] bg-[var(--bg-muted)] sticky top-0">
                {g.label}
              </div>
              {g.items.map((item) => {
                const active = item.id === value;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`w-full text-left px-2.5 py-1.5 text-xs cursor-pointer transition-colors ${
                      active
                        ? "bg-[var(--accent)] text-[var(--accent-foreground)]"
                        : "text-[var(--text)] hover:bg-[var(--bg-muted)]"
                    }`}
                    onClick={() => {
                      onChange(item.id);
                      setOpen(false);
                    }}
                  >
                    <span className="font-semibold">{item.text}</span>
                    {item.hint && (
                      <span
                        className={`ml-1.5 ${active ? "opacity-70" : "text-[var(--muted)]"}`}
                      >
                        {item.hint}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

type CharacterConversation = NonNullable<
  CharacterData["messageExamples"]
>[number];
type CharacterMessage = CharacterConversation["examples"][number];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const out = value.filter((item): item is string => typeof item === "string");
  return out.length > 0 ? out : [];
}

function parseImportedMessage(value: unknown): CharacterMessage | null {
  if (!isRecord(value)) return null;
  const speaker =
    typeof value.user === "string"
      ? value.user
      : typeof value.name === "string"
        ? value.name
        : "{{user1}}";
  const content = value.content;
  const contentText =
    isRecord(content) && typeof content.text === "string"
      ? content.text
      : typeof value.text === "string"
        ? value.text
        : "";
  return {
    name: speaker,
    content: { text: contentText },
  };
}

function parseImportedMessageExamples(
  value: unknown,
): CharacterData["messageExamples"] {
  if (!Array.isArray(value)) return [];
  const conversations: CharacterConversation[] = [];
  for (const convo of value) {
    const source = Array.isArray(convo)
      ? convo
      : isRecord(convo) && Array.isArray(convo.examples)
        ? convo.examples
        : null;
    if (!source) continue;
    const examples: CharacterMessage[] = [];
    for (const message of source) {
      const parsed = parseImportedMessage(message);
      if (parsed) examples.push(parsed);
    }
    if (examples.length > 0) {
      conversations.push({ examples });
    }
  }
  return conversations;
}

/* ── CharacterView ──────────────────────────────────────────────────── */

export function CharacterView() {
  const {
    characterData,
    characterDraft,
    characterLoading,
    characterSaving,
    characterSaveSuccess,
    characterSaveError,
    handleCharacterFieldInput,
    handleCharacterArrayInput,
    handleCharacterStyleInput,
    handleSaveCharacter,
    loadCharacter,
    setState,
    selectedVrmIndex,
    // Registry / Drop
    registryStatus,
    registryLoading,
    registryRegistering,
    registryError,
    dropStatus,
    mintInProgress,
    mintResult,
    mintError,
    mintShiny,
    loadRegistryStatus,
    registerOnChain,
    syncRegistryProfile,
    loadDropStatus,
    mintFromDrop,
    walletConfig,
  } = useApp();

  useEffect(() => {
    void loadCharacter();
    void loadRegistryStatus();
    void loadDropStatus();
  }, [loadCharacter, loadRegistryStatus, loadDropStatus]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFieldEdit = useCallback(
    <K extends keyof CharacterData>(field: K, value: CharacterData[K]) => {
      handleCharacterFieldInput(field, value);
    },
    [handleCharacterFieldInput],
  );

  const handleStyleEdit = useCallback(
    (key: "all" | "chat" | "post", value: string) => {
      handleCharacterStyleInput(key, value);
    },
    [handleCharacterStyleInput],
  );

  /* ── Import / Export ────────────────────────────────────────────── */
  const handleExport = useCallback(() => {
    const d = characterDraft;
    const exportData = {
      name: d.name ?? "",
      bio:
        typeof d.bio === "string"
          ? d.bio.split("\n").filter(Boolean)
          : (d.bio ?? []),
      system: d.system ?? "",
      style: {
        all: d.style?.all ?? [],
        chat: d.style?.chat ?? [],
        post: d.style?.post ?? [],
      },
      adjectives: d.adjectives ?? [],
      topics: d.topics ?? [],
      messageExamples: (d.messageExamples ?? []).map((convo) =>
        (convo.examples ?? []).map((msg) => ({
          user: msg.name,
          content: { text: msg.content?.text ?? "" },
        })),
      ),
      postExamples: d.postExamples ?? [],
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(d.name ?? "character").toLowerCase().replace(/\s+/g, "-")}.character.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [characterDraft]);

  const handleImport = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const rawText = reader.result;
          if (typeof rawText !== "string") throw new Error("invalid file");
          const parsed: unknown = JSON.parse(rawText);
          if (!isRecord(parsed)) throw new Error("invalid file");

          if (typeof parsed.name === "string") {
            handleCharacterFieldInput("name", parsed.name);
          }
          if (typeof parsed.bio === "string") {
            handleCharacterFieldInput("bio", parsed.bio);
          } else {
            const bio = readStringArray(parsed.bio);
            if (bio) {
              handleCharacterFieldInput("bio", bio.join("\n"));
            }
          }
          if (typeof parsed.system === "string") {
            handleCharacterFieldInput("system", parsed.system);
          }

          const adjectives = readStringArray(parsed.adjectives);
          if (adjectives) handleCharacterFieldInput("adjectives", adjectives);
          const topics = readStringArray(parsed.topics);
          if (topics) handleCharacterFieldInput("topics", topics);

          if (isRecord(parsed.style)) {
            const all = readStringArray(parsed.style.all);
            if (all) handleCharacterStyleInput("all", all.join("\n"));
            else if (typeof parsed.style.all === "string")
              handleCharacterStyleInput("all", parsed.style.all);

            const chat = readStringArray(parsed.style.chat);
            if (chat) handleCharacterStyleInput("chat", chat.join("\n"));
            else if (typeof parsed.style.chat === "string")
              handleCharacterStyleInput("chat", parsed.style.chat);

            const post = readStringArray(parsed.style.post);
            if (post) handleCharacterStyleInput("post", post.join("\n"));
            else if (typeof parsed.style.post === "string")
              handleCharacterStyleInput("post", parsed.style.post);
          }

          const messageExamples =
            parseImportedMessageExamples(parsed.messageExamples) ?? [];
          if (messageExamples.length > 0) {
            handleCharacterFieldInput("messageExamples", messageExamples);
          }

          const postExamples = readStringArray(parsed.postExamples);
          if (postExamples)
            handleCharacterFieldInput("postExamples", postExamples);
        } catch {
          alert("invalid json file");
        }
      };
      reader.readAsText(file);
      e.target.value = "";
    },
    [handleCharacterFieldInput, handleCharacterStyleInput],
  );

  /* ── Character generation state ─────────────────────────────────── */
  const [generating, setGenerating] = useState<string | null>(null);

  /* ── Voice config state ─────────────────────────────────────────── */
  const [voiceConfig, setVoiceConfig] = useState<VoiceConfig>({});
  const [voiceLoading, setVoiceLoading] = useState(false);
  const [voiceSaving, setVoiceSaving] = useState(false);
  const [voiceSaveSuccess, setVoiceSaveSuccess] = useState(false);
  const [voiceSaveError, setVoiceSaveError] = useState<string | null>(null);
  const [voiceTesting, setVoiceTesting] = useState(false);
  const [voiceTestAudio, setVoiceTestAudio] = useState<HTMLAudioElement | null>(
    null,
  );
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);

  /* ── ElevenLabs voice presets ──────────────────────────────────── */
  type VoicePreset = {
    id: string;
    name: string;
    voiceId: string;
    gender: "female" | "male" | "character";
    hint: string;
    previewUrl: string;
  };
  const VOICE_PRESETS = useMemo<VoicePreset[]>(
    () => [
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
      {
        id: "alice",
        name: "Alice",
        voiceId: "Xb7hH8MSUJpSbSDYk0k2",
        gender: "female",
        hint: "British, confident",
        previewUrl:
          "https://storage.googleapis.com/eleven-public-prod/premade/voices/Xb7hH8MSUJpSbSDYk0k2/f5409e2f-d9c3-4ac9-9e7d-916a5dbd1ef1.mp3",
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
      {
        id: "liam",
        name: "Liam",
        voiceId: "TX3LPaxmHKxFdv7VOQHJ",
        gender: "male",
        hint: "Young, natural",
        previewUrl:
          "https://storage.googleapis.com/eleven-public-prod/premade/voices/TX3LPaxmHKxFdv7VOQHJ/63148076-6363-42db-aea8-31424308b92c.mp3",
      },
      // Character / Cutesy / Game
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
        id: "dorothy",
        name: "Dorothy",
        voiceId: "ThT5KcBeYPX3keUQqHPh",
        gender: "character",
        hint: "Sweet, storybook",
        previewUrl:
          "https://storage.googleapis.com/eleven-public-prod/premade/voices/ThT5KcBeYPX3keUQqHPh/981f0855-6598-48d2-9f8f-b6d92fbbe3fc.mp3",
      },
      {
        id: "glinda",
        name: "Glinda",
        voiceId: "z9fAnlkpzviPz146aGWa",
        gender: "character",
        hint: "Magical, whimsical",
        previewUrl:
          "https://storage.googleapis.com/eleven-public-prod/premade/voices/z9fAnlkpzviPz146aGWa/cbc60443-7b61-4ebb-b8e1-5c03237ea01d.mp3",
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
      {
        id: "callum",
        name: "Callum",
        voiceId: "N2lVS1w4EtoT3dr4eOWO",
        gender: "character",
        hint: "Gruff, game hero",
        previewUrl:
          "https://storage.googleapis.com/eleven-public-prod/premade/voices/N2lVS1w4EtoT3dr4eOWO/ac833bd8-ffda-4938-9ebc-b0f99ca25481.mp3",
      },
    ],
    [],
  );

  /* Load voice config on mount */
  useEffect(() => {
    void (async () => {
      setVoiceLoading(true);
      try {
        const cfg = await client.getConfig();
        const messages = cfg.messages as
          | Record<string, Record<string, unknown>>
          | undefined;
        const tts = messages?.tts as VoiceConfig | undefined;
        if (tts) {
          setVoiceConfig(tts);
          if (tts.elevenlabs?.voiceId) {
            const preset = VOICE_PRESETS.find(
              (p) => p.voiceId === tts.elevenlabs?.voiceId,
            );
            setSelectedPresetId(preset?.id ?? "custom");
          }
        }
      } catch {
        /* ignore */
      }
      setVoiceLoading(false);
    })();
  }, [VOICE_PRESETS]);

  const handleVoiceFieldChange = useCallback(
    (key: string, value: string | number) => {
      setVoiceConfig((prev) => ({
        ...prev,
        elevenlabs: { ...(prev.elevenlabs ?? {}), [key]: value },
      }));
    },
    [],
  );

  const handleSelectPreset = useCallback((preset: VoicePreset) => {
    setSelectedPresetId(preset.id);
    setVoiceConfig((prev) => ({
      ...prev,
      elevenlabs: { ...(prev.elevenlabs ?? {}), voiceId: preset.voiceId },
    }));
  }, []);

  const handleTestVoice = useCallback(
    (previewUrl: string) => {
      if (voiceTestAudio) {
        voiceTestAudio.pause();
        voiceTestAudio.currentTime = 0;
      }
      setVoiceTesting(true);
      const audio = new Audio(previewUrl);
      setVoiceTestAudio(audio);
      audio.onended = () => setVoiceTesting(false);
      audio.onerror = () => setVoiceTesting(false);
      audio.play().catch(() => setVoiceTesting(false));
    },
    [voiceTestAudio],
  );

  const handleStopTest = useCallback(() => {
    if (voiceTestAudio) {
      voiceTestAudio.pause();
      voiceTestAudio.currentTime = 0;
    }
    setVoiceTesting(false);
  }, [voiceTestAudio]);

  const handleVoiceSave = useCallback(async () => {
    setVoiceSaving(true);
    setVoiceSaveError(null);
    setVoiceSaveSuccess(false);
    try {
      const normalizedElevenlabs = {
        ...voiceConfig.elevenlabs,
        modelId: voiceConfig.elevenlabs?.modelId ?? DEFAULT_ELEVEN_FAST_MODEL,
      };
      const sanitizedKey = sanitizeApiKey(normalizedElevenlabs?.apiKey);
      if (sanitizedKey) normalizedElevenlabs.apiKey = sanitizedKey;
      else delete normalizedElevenlabs.apiKey;

      const normalizedVoiceConfig: VoiceConfig = {
        ...voiceConfig,
        provider: voiceConfig.provider ?? "elevenlabs",
        elevenlabs: normalizedElevenlabs,
      };

      await client.updateConfig({
        messages: {
          tts: normalizedVoiceConfig,
        },
      });
      window.dispatchEvent(
        new CustomEvent("milady:voice-config-updated", {
          detail: normalizedVoiceConfig,
        }),
      );
      setVoiceSaveSuccess(true);
      setTimeout(() => setVoiceSaveSuccess(false), 2500);
    } catch (err) {
      setVoiceSaveError(
        err instanceof Error
          ? err.message
          : "Failed to save — is the agent running?",
      );
    }
    setVoiceSaving(false);
  }, [voiceConfig]);

  const d = characterDraft;
  const bioText =
    typeof d.bio === "string"
      ? d.bio
      : Array.isArray(d.bio)
        ? d.bio.join("\n")
        : "";
  const styleAllText = (d.style?.all ?? []).join("\n");
  const styleChatText = (d.style?.chat ?? []).join("\n");
  const stylePostText = (d.style?.post ?? []).join("\n");

  const getCharContext = useCallback(
    () => ({
      name: d.name ?? "",
      system: d.system ?? "",
      bio: bioText,
      style: d.style ?? { all: [], chat: [], post: [] },
      postExamples: d.postExamples ?? [],
    }),
    [d, bioText],
  );

  const handleGenerate = useCallback(
    async (field: string, mode: "append" | "replace" = "replace") => {
      setGenerating(field);
      try {
        const { generated } = await client.generateCharacterField(
          field,
          getCharContext(),
          mode,
        );
        if (field === "bio") {
          handleFieldEdit("bio", generated.trim());
        } else if (field === "style") {
          try {
            const parsed = JSON.parse(generated);
            if (mode === "append") {
              handleStyleEdit(
                "all",
                [...(d.style?.all ?? []), ...(parsed.all ?? [])].join("\n"),
              );
              handleStyleEdit(
                "chat",
                [...(d.style?.chat ?? []), ...(parsed.chat ?? [])].join("\n"),
              );
              handleStyleEdit(
                "post",
                [...(d.style?.post ?? []), ...(parsed.post ?? [])].join("\n"),
              );
            } else {
              if (parsed.all) handleStyleEdit("all", parsed.all.join("\n"));
              if (parsed.chat) handleStyleEdit("chat", parsed.chat.join("\n"));
              if (parsed.post) handleStyleEdit("post", parsed.post.join("\n"));
            }
          } catch {
            /* raw text fallback */
          }
        } else if (field === "chatExamples") {
          try {
            const parsed = JSON.parse(generated);
            if (Array.isArray(parsed)) {
              const formatted = parsed.map(
                (
                  convo: Array<{ user: string; content: { text: string } }>,
                ) => ({
                  examples: convo.map((msg) => ({
                    name: msg.user,
                    content: { text: msg.content.text },
                  })),
                }),
              );
              handleFieldEdit("messageExamples", formatted);
            }
          } catch {
            /* raw text fallback */
          }
        } else if (field === "postExamples") {
          try {
            const parsed = JSON.parse(generated);
            if (Array.isArray(parsed)) {
              if (mode === "append") {
                handleCharacterArrayInput(
                  "postExamples",
                  [...(d.postExamples ?? []), ...parsed].join("\n"),
                );
              } else {
                handleCharacterArrayInput("postExamples", parsed.join("\n"));
              }
            }
          } catch {
            /* raw text fallback */
          }
        }
      } catch {
        /* generation failed */
      }
      setGenerating(null);
    },
    [
      getCharContext,
      d,
      handleFieldEdit,
      handleStyleEdit,
      handleCharacterArrayInput,
    ],
  );

  const handleRandomName = useCallback(async () => {
    try {
      const { name } = await client.getRandomName();
      handleFieldEdit("name", name);
    } catch {
      /* ignore */
    }
  }, [handleFieldEdit]);

  /* ── Helpers ────────────────────────────────────────────────────── */
  const sectionCls = "mt-4 p-4 border border-[var(--border)] bg-[var(--card)]";
  const inputCls =
    "px-2.5 py-1.5 border border-[var(--border)] bg-[var(--card)] text-xs focus:border-[var(--accent)] focus:outline-none";
  const textareaCls = `${inputCls} font-inherit resize-y leading-relaxed`;
  const labelCls = "font-semibold text-xs";
  const hintCls = "text-[11px] text-[var(--muted)]";
  const tinyBtnCls =
    "text-[10px] px-1.5 py-0.5 border border-[var(--border)] bg-[var(--card)] cursor-pointer hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors disabled:opacity-40";

  /* Hidden file input for import */
  const fileInput = (
    <input
      ref={fileInputRef}
      type="file"
      accept=".json"
      className="hidden"
      onChange={handleImport}
    />
  );

  if (characterLoading && !characterData) {
    return (
      <div className={sectionCls}>
        <div className="text-center py-6 text-[var(--muted)] text-[13px]">
          loading character data...
        </div>
      </div>
    );
  }

  const hasWallet = Boolean(walletConfig?.evmAddress);
  const isRegistered = registryStatus?.registered === true;
  const dropLive =
    dropStatus?.dropEnabled &&
    dropStatus?.publicMintOpen &&
    !dropStatus?.mintedOut;
  const userMinted = dropStatus?.userHasMinted === true;

  return (
    <div>
      {fileInput}

      {/* ═══ ON-CHAIN IDENTITY ═══ */}
      {hasWallet && (
        <div className={sectionCls}>
          {!isRegistered && !dropLive && (
            <div className="flex flex-col gap-3">
              <div className="text-[12px] text-[var(--muted)]">
                Register your agent on Ethereum mainnet to claim your ERC-8004
                identity NFT.
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="btn text-xs py-[5px] px-4 !mt-0"
                  disabled={registryRegistering || registryLoading}
                  onClick={() => void registerOnChain()}
                >
                  {registryRegistering ? "registering..." : "register now"}
                </button>
                {registryError && (
                  <span className="text-xs text-[var(--danger,#e74c3c)]">
                    {registryError}
                  </span>
                )}
              </div>
            </div>
          )}

          {hasWallet && !isRegistered && dropLive && !userMinted && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2 px-3 py-2 border border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_8%,transparent)]">
                <span className="text-xs font-bold text-[var(--accent)]">
                  MINT IS LIVE
                </span>
                <span className="text-[11px] text-[var(--muted)]">
                  MiladyMaker #{(dropStatus?.currentSupply ?? 0) + 1} of{" "}
                  {dropStatus?.maxSupply ?? 2138}
                </span>
              </div>
              <div className="text-[12px] text-[var(--muted)]">
                Claim your limited-edition Milady Agent NFT.{" "}
                {dropStatus?.maxSupply ?? 2138} total.{" "}
                {(dropStatus?.maxSupply ?? 2138) -
                  (dropStatus?.currentSupply ?? 0)}{" "}
                remaining.
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="btn text-xs py-[5px] px-4 !mt-0"
                  disabled={mintInProgress}
                  onClick={() => void mintFromDrop(false)}
                >
                  {mintInProgress && !mintShiny ? "minting..." : "free mint"}
                </button>
                <button
                  type="button"
                  className="btn text-xs py-[5px] px-4 !mt-0"
                  disabled={mintInProgress}
                  onClick={() => void mintFromDrop(true)}
                >
                  {mintInProgress && mintShiny
                    ? "minting..."
                    : "shiny mint (0.1 ETH)"}
                </button>
              </div>
              {mintError && (
                <span className="text-xs text-[var(--danger,#e74c3c)]">
                  {mintError}
                </span>
              )}
              {mintResult && (
                <div className="text-xs text-[var(--ok,#16a34a)]">
                  Minted! Token #{mintResult.agentId} | MiladyMaker #
                  {mintResult.mintNumber}
                  {mintResult.isShiny && " (shiny)"}{" "}
                  <a
                    href={`https://etherscan.io/tx/${mintResult.txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline text-[var(--accent)]"
                  >
                    view tx
                  </a>
                </div>
              )}
            </div>
          )}

          {isRegistered &&
            (() => {
              const currentName = characterDraft?.name || d.name || "";
              const onChainName = registryStatus.agentName || "";
              const nameOutOfSync =
                currentName && onChainName && currentName !== onChainName;
              return (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2 text-[12px]">
                    <span className="text-[var(--ok,#16a34a)] font-semibold">
                      Registered
                    </span>
                    <span className="text-[var(--muted)]">|</span>
                    <span>Token #{registryStatus.tokenId}</span>
                    <span className="text-[var(--muted)]">|</span>
                    <span>{onChainName}</span>
                  </div>
                  {nameOutOfSync && (
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-[var(--warn,#f59e0b)]">
                        On-chain name "{onChainName}" differs from "
                        {currentName}"
                      </span>
                      <button
                        type="button"
                        className="text-[10px] px-2 py-0.5 border border-[var(--accent)] text-[var(--accent)] bg-transparent cursor-pointer hover:bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] transition-colors"
                        disabled={registryRegistering}
                        onClick={() => void syncRegistryProfile()}
                      >
                        {registryRegistering ? "syncing..." : "sync to chain"}
                      </button>
                    </div>
                  )}
                  {registryError && (
                    <span className="text-xs text-[var(--danger,#e74c3c)]">
                      {registryError}
                    </span>
                  )}
                  <a
                    href={`https://etherscan.io/token/${registryStatus.walletAddress}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] underline text-[var(--accent)]"
                  >
                    view on etherscan
                  </a>
                </div>
              );
            })()}

          {hasWallet && userMinted && !isRegistered && (
            <div className="text-[12px] text-[var(--ok,#16a34a)]">
              Minted from collection! Waiting for confirmation...
            </div>
          )}
        </div>
      )}

      {/* ═══ SECTION 1: IDENTITY + PERSONALITY ═══ */}
      <div className={sectionCls}>
        {/* Header row: title + action buttons */}
        <div className="flex items-center justify-between mb-4">
          <div className="font-bold text-sm">Identity & Personality</div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              className={tinyBtnCls}
              onClick={() => void loadCharacter()}
              disabled={characterLoading}
            >
              {characterLoading ? "loading..." : "reload"}
            </button>
            <button
              type="button"
              className={tinyBtnCls}
              onClick={() => fileInputRef.current?.click()}
              title="import character.json"
            >
              import
            </button>
            <button
              className={tinyBtnCls}
              onClick={handleExport}
              title="export as character.json"
              type="button"
            >
              export
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          {/* Name */}
          <div className="flex flex-col gap-1">
            <span className={labelCls}>name</span>
            <div className="flex items-center gap-2 max-w-[280px]">
              <input
                type="text"
                value={d.name ?? ""}
                maxLength={50}
                placeholder="agent name"
                onChange={(e) => handleFieldEdit("name", e.target.value)}
                className={`${inputCls} flex-1 text-[13px]`}
              />
              <button
                type="button"
                className={tinyBtnCls}
                onClick={() => void handleRandomName()}
                title="random name"
              >
                random
              </button>
            </div>
          </div>

          {/* Avatar full-width row */}
          <div className="flex flex-col gap-1 w-full">
            <span className={labelCls}>avatar</span>
            <div className="w-full">
              <AvatarSelector
                selected={selectedVrmIndex}
                onSelect={(i) => setState("selectedVrmIndex", i)}
                onUpload={(file) => {
                  const previousIndex = selectedVrmIndex;
                  const url = URL.createObjectURL(file);
                  setState("customVrmUrl", url);
                  setState("selectedVrmIndex", 0);
                  client
                    .uploadCustomVrm(file)
                    .then(() => {
                      setState(
                        "customVrmUrl",
                        `/api/avatar/vrm?t=${Date.now()}`,
                      );
                      requestAnimationFrame(() => URL.revokeObjectURL(url));
                    })
                    .catch(() => {
                      setState("selectedVrmIndex", previousIndex);
                      URL.revokeObjectURL(url);
                    });
                }}
                showUpload
                fullWidth
              />
            </div>
          </div>

          {/* About me + adjectives + topics */}
          <div className="mt-1 grid grid-cols-1 md:grid-cols-[1.2fr_1fr_1fr] gap-4">
            <div className="flex flex-col gap-1 h-[220px]">
              <div className="flex items-center justify-between">
                <span className={labelCls}>about me</span>
                <button
                  type="button"
                  className={tinyBtnCls}
                  onClick={() => void handleGenerate("bio")}
                  disabled={generating === "bio"}
                >
                  {generating === "bio" ? "generating..." : "regenerate"}
                </button>
              </div>
              <textarea
                value={bioText}
                rows={4}
                placeholder="describe who your agent is. personality, background, how they see the world."
                onChange={(e) => handleFieldEdit("bio", e.target.value)}
                className={`${textareaCls} flex-1 min-h-0`}
              />
            </div>
            <TagEditor
              label="adjectives"
              items={d.adjectives ?? []}
              onChange={(items) =>
                handleCharacterArrayInput("adjectives", items.join("\n"))
              }
              placeholder="add adjective..."
            />
            <TagEditor
              label="topics"
              items={d.topics ?? []}
              onChange={(items) =>
                handleCharacterArrayInput("topics", items.join("\n"))
              }
              placeholder="add topic..."
            />
          </div>

          {/* System prompt below */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className={labelCls}>
                directions and things i should know
              </span>
              <button
                type="button"
                className={tinyBtnCls}
                onClick={() => void handleGenerate("system")}
                disabled={generating === "system"}
              >
                {generating === "system" ? "generating..." : "regenerate"}
              </button>
            </div>
            <textarea
              value={d.system ?? ""}
              rows={5}
              maxLength={10000}
              placeholder="write in first person. this is who they are, not instructions about them."
              onChange={(e) => handleFieldEdit("system", e.target.value)}
              className={`${textareaCls} font-[var(--mono)]`}
            />
          </div>
        </div>
      </div>

      {/* ═══ SECTION 2: STYLE ═══ */}
      <div className={sectionCls}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1.5">
            <div className="font-bold text-sm">Style Rules</div>
            <span className="font-normal text-[11px] text-[var(--muted)]">
              — communication guidelines
            </span>
          </div>
          <button
            type="button"
            className={tinyBtnCls}
            onClick={() => void handleGenerate("style", "replace")}
            disabled={generating === "style"}
          >
            {generating === "style" ? "generating..." : "regenerate"}
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {(["all", "chat", "post"] as const).map((key) => {
            const val =
              key === "all"
                ? styleAllText
                : key === "chat"
                  ? styleChatText
                  : stylePostText;
            return (
              <div key={key} className="flex flex-col gap-1">
                <span className="font-semibold text-[11px] text-[var(--muted)]">
                  {key}
                </span>
                <textarea
                  value={val}
                  rows={3}
                  placeholder={`${key} style rules, one per line`}
                  onChange={(e) => handleStyleEdit(key, e.target.value)}
                  className={textareaCls}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* ═══ SECTION 3: EXAMPLES ═══ */}
      <div className={sectionCls}>
        <div className="font-bold text-sm mb-3">Examples</div>

        <div className="flex flex-col gap-3">
          {/* Chat Examples */}
          <details className="group">
            <summary className="flex items-center gap-1.5 cursor-pointer select-none text-xs font-semibold list-none [&::-webkit-details-marker]:hidden">
              <span className="inline-block transition-transform group-open:rotate-90">
                &#9654;
              </span>
              chat examples
              <span className="font-normal text-[var(--muted)]">
                — how the agent responds
              </span>
              <button
                type="button"
                className={`${tinyBtnCls} ml-auto`}
                onClick={(e) => {
                  e.preventDefault();
                  void handleGenerate("chatExamples", "replace");
                }}
                disabled={generating === "chatExamples"}
              >
                {generating === "chatExamples" ? "generating..." : "generate"}
              </button>
            </summary>
            <div className="flex flex-col gap-2 mt-3">
              {(d.messageExamples ?? []).map((convo, ci) => (
                <div
                  key={convo.examples
                    .map((msg) => `${msg.name}:${msg.content?.text ?? ""}`)
                    .join("|")}
                  className="p-2.5 border border-[var(--border)] bg-[var(--bg-muted)]"
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] text-[var(--muted)] font-semibold">
                      conversation {ci + 1}
                    </span>
                    <button
                      type="button"
                      className="text-[10px] text-[var(--muted)] hover:text-[var(--danger,#e74c3c)] cursor-pointer"
                      onClick={() => {
                        const updated = [...(d.messageExamples ?? [])];
                        updated.splice(ci, 1);
                        handleFieldEdit("messageExamples", updated);
                      }}
                    >
                      remove
                    </button>
                  </div>
                  {convo.examples.map((msg, mi) => (
                    <div
                      key={`${msg.name}:${msg.content?.text ?? ""}`}
                      className="flex gap-2 mb-1 last:mb-0"
                    >
                      <span
                        className={`text-[10px] font-semibold shrink-0 w-16 pt-0.5 ${msg.name === "{{user1}}" ? "text-[var(--muted)]" : "text-[var(--accent)]"}`}
                      >
                        {msg.name === "{{user1}}" ? "user" : "agent"}
                      </span>
                      <input
                        type="text"
                        value={msg.content?.text ?? ""}
                        onChange={(e) => {
                          const updated = [...(d.messageExamples ?? [])];
                          const convoClone = {
                            examples: [...updated[ci].examples],
                          };
                          convoClone.examples[mi] = {
                            ...convoClone.examples[mi],
                            content: { text: e.target.value },
                          };
                          updated[ci] = convoClone;
                          handleFieldEdit("messageExamples", updated);
                        }}
                        className={`${inputCls} flex-1`}
                      />
                    </div>
                  ))}
                </div>
              ))}
              {(d.messageExamples ?? []).length === 0 && (
                <div className={`${hintCls} py-2`}>
                  no chat examples yet. click generate to create some.
                </div>
              )}
            </div>
          </details>

          {/* Post Examples */}
          <details className="group">
            <summary className="flex items-center gap-1.5 cursor-pointer select-none text-xs font-semibold list-none [&::-webkit-details-marker]:hidden">
              <span className="inline-block transition-transform group-open:rotate-90">
                &#9654;
              </span>
              post examples
              <span className="font-normal text-[var(--muted)]">
                — social media voice
              </span>
              <button
                type="button"
                className={`${tinyBtnCls} ml-auto`}
                onClick={(e) => {
                  e.preventDefault();
                  void handleGenerate("postExamples", "replace");
                }}
                disabled={generating === "postExamples"}
              >
                {generating === "postExamples" ? "generating..." : "generate"}
              </button>
            </summary>
            <div className="flex flex-col gap-1.5 mt-3">
              {(d.postExamples ?? []).map((post: string, pi: number) => (
                <div key={post} className="flex gap-2 items-start">
                  <input
                    type="text"
                    value={post}
                    onChange={(e) => {
                      const updated = [...(d.postExamples ?? [])];
                      updated[pi] = e.target.value;
                      handleFieldEdit("postExamples", updated);
                    }}
                    className={`${inputCls} flex-1`}
                  />
                  <button
                    type="button"
                    className="text-[10px] text-[var(--muted)] hover:text-[var(--danger,#e74c3c)] cursor-pointer shrink-0 py-1.5"
                    onClick={() => {
                      const updated = [...(d.postExamples ?? [])];
                      updated.splice(pi, 1);
                      handleFieldEdit("postExamples", updated);
                    }}
                  >
                    &times;
                  </button>
                </div>
              ))}
              {(d.postExamples ?? []).length === 0 && (
                <div className={`${hintCls} py-2`}>
                  no post examples yet. click generate to create some.
                </div>
              )}
              <button
                type="button"
                className="text-[11px] text-[var(--muted)] hover:text-[var(--accent)] cursor-pointer self-start mt-0.5"
                onClick={() => {
                  const updated = [...(d.postExamples ?? []), ""];
                  handleFieldEdit("postExamples", updated);
                }}
              >
                + add post
              </button>
            </div>
          </details>
        </div>
      </div>

      {/* ═══ SECTION 4: VOICE ═══ */}
      <div className={sectionCls}>
        <div className="font-bold text-sm mb-3">Voice</div>

        {voiceLoading ? (
          <div className="text-center py-4 text-[var(--muted)] text-[13px]">
            Loading voice config...
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="text-xs text-[var(--muted)]">
              Choose the speaking voice here. Provider and TTS/STT backend setup
              is in Settings.
            </div>

            <div className="flex flex-col gap-1">
              <span className={labelCls}>voice</span>
              <div className="flex items-center gap-2">
                <ThemedSelect
                  value={
                    selectedPresetId === "custom"
                      ? "__custom__"
                      : (selectedPresetId ?? null)
                  }
                  groups={[
                    {
                      label: "Female",
                      items: VOICE_PRESETS.filter(
                        (p) => p.gender === "female",
                      ).map((p) => ({
                        id: p.id,
                        text: p.name,
                        hint: p.hint,
                      })),
                    },
                    {
                      label: "Male",
                      items: VOICE_PRESETS.filter(
                        (p) => p.gender === "male",
                      ).map((p) => ({
                        id: p.id,
                        text: p.name,
                        hint: p.hint,
                      })),
                    },
                    {
                      label: "Character",
                      items: VOICE_PRESETS.filter(
                        (p) => p.gender === "character",
                      ).map((p) => ({
                        id: p.id,
                        text: p.name,
                        hint: p.hint,
                      })),
                    },
                    {
                      label: "Other",
                      items: [{ id: "__custom__", text: "Custom voice ID..." }],
                    },
                  ]}
                  onChange={(id) => {
                    if (id === "__custom__") {
                      setSelectedPresetId("custom");
                    } else {
                      const preset = VOICE_PRESETS.find((p) => p.id === id);
                      if (preset) handleSelectPreset(preset);
                    }
                  }}
                  placeholder="select a voice..."
                />
                {(() => {
                  const activePreset = VOICE_PRESETS.find(
                    (p) => p.id === selectedPresetId,
                  );
                  if (!activePreset) return null;
                  return voiceTesting ? (
                    <button
                      className={tinyBtnCls}
                      onClick={handleStopTest}
                      type="button"
                    >
                      stop
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={tinyBtnCls}
                      onClick={() => handleTestVoice(activePreset.previewUrl)}
                    >
                      preview
                    </button>
                  );
                })()}
              </div>
            </div>

            {selectedPresetId === "custom" && (
              <div className="flex flex-col gap-1">
                <span className={labelCls}>voice ID</span>
                <input
                  type="text"
                  value={voiceConfig.elevenlabs?.voiceId ?? ""}
                  placeholder="paste ElevenLabs voice ID"
                  onChange={(e) =>
                    handleVoiceFieldChange("voiceId", e.target.value)
                  }
                  className={`${inputCls} w-full font-[var(--mono)] text-[13px]`}
                />
              </div>
            )}

            <details className="group">
              <summary className="flex items-center gap-1.5 cursor-pointer select-none text-xs font-semibold list-none [&::-webkit-details-marker]:hidden">
                <span className="inline-block transition-transform group-open:rotate-90">
                  &#9654;
                </span>
                advanced voice settings
              </summary>
              <div className="mt-3">
                <ConfigRenderer
                  schema={
                    {
                      type: "object",
                      properties: {
                        modelId: {
                          type: "string",
                          enum: [
                            "",
                            "eleven_flash_v2_5",
                            "eleven_turbo_v2_5",
                            "eleven_multilingual_v2",
                            "eleven_turbo_v2",
                            "eleven_monolingual_v1",
                          ],
                        },
                        stability: { type: "number", minimum: 0, maximum: 1 },
                        similarityBoost: {
                          type: "number",
                          minimum: 0,
                          maximum: 1,
                        },
                        speed: { type: "number", minimum: 0.5, maximum: 2 },
                      },
                    } satisfies JsonSchemaObject
                  }
                  hints={{
                    modelId: {
                      label: "Model",
                      type: "select",
                      width: "full",
                      options: [
                        { value: "", label: "Default (Flash v2.5)" },
                        {
                          value: "eleven_flash_v2_5",
                          label: "Flash v2.5 (Fastest)",
                        },
                        { value: "eleven_turbo_v2_5", label: "Turbo v2.5" },
                        {
                          value: "eleven_multilingual_v2",
                          label: "Multilingual v2",
                        },
                        { value: "eleven_turbo_v2", label: "Turbo v2" },
                        {
                          value: "eleven_monolingual_v1",
                          label: "Monolingual v1",
                        },
                      ],
                    } satisfies ConfigUiHint,
                    stability: {
                      label: "Stability",
                      type: "number",
                      width: "third",
                      placeholder: "0.5",
                      step: 0.05,
                    } satisfies ConfigUiHint,
                    similarityBoost: {
                      label: "Similarity",
                      type: "number",
                      width: "third",
                      placeholder: "0.75",
                      step: 0.05,
                    } satisfies ConfigUiHint,
                    speed: {
                      label: "Speed",
                      type: "number",
                      width: "third",
                      placeholder: "1.0",
                      step: 0.1,
                    } satisfies ConfigUiHint,
                  }}
                  values={{
                    modelId: voiceConfig.elevenlabs?.modelId ?? "",
                    stability: voiceConfig.elevenlabs?.stability ?? "",
                    similarityBoost:
                      voiceConfig.elevenlabs?.similarityBoost ?? "",
                    speed: voiceConfig.elevenlabs?.speed ?? "",
                  }}
                  registry={defaultRegistry}
                  onChange={(key, value) => {
                    handleVoiceFieldChange(
                      key,
                      key === "modelId"
                        ? String(value)
                        : typeof value === "number"
                          ? value
                          : parseFloat(String(value)) || 0,
                    );
                  }}
                />
              </div>
            </details>

            <div className="flex items-center gap-3 mt-2 pt-3 border-t border-[var(--border)]">
              <button
                type="button"
                className={`btn text-xs py-[5px] px-4 !mt-0 ${voiceSaveSuccess ? "!bg-[var(--ok,#16a34a)] !border-[var(--ok,#16a34a)]" : ""}`}
                onClick={() => void handleVoiceSave()}
                disabled={voiceSaving}
              >
                {voiceSaving
                  ? "saving..."
                  : voiceSaveSuccess
                    ? "saved"
                    : "save voice"}
              </button>
              {voiceSaveError && (
                <span className="text-xs text-[var(--danger,#e74c3c)]">
                  {voiceSaveError}
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ═══ SAVE BAR ═══ */}
      <div className={sectionCls}>
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="btn text-[13px] py-2 px-6 !mt-0"
            disabled={characterSaving}
            onClick={() => void handleSaveCharacter()}
          >
            {characterSaving ? "saving..." : "save character"}
          </button>
          {characterSaveSuccess && (
            <span className="text-xs text-[var(--ok,#16a34a)]">
              {characterSaveSuccess}
            </span>
          )}
          {characterSaveError && (
            <span className="text-xs text-[var(--danger,#e74c3c)]">
              {characterSaveError}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
